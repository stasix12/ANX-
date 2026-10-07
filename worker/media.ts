import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { MediaItem } from '@/lib/social/types';

/**
 * THE SAME PICTURE, DOWNLOADED ONCE — not three hundred times.
 *
 * Facebook's composer needs real files on disk for its <input type=file>, so
 * the media of a post has to come down out of Supabase Storage before it can be
 * attached. That part was always right. What was wrong is WHEN.
 *
 * This file used to download into a folder named after the QUEUE ITEM and
 * delete it in the caller's `finally`. A queue item is one publication to one
 * group. So a round that sends one post to three hundred groups fetched the
 * very same bytes three hundred times, and threw them away three hundred times
 * — and with the daily repeat switched on, thirty times a month on top.
 *
 * THAT IS WHAT TOOK THE PRODUCT OFF THE AIR. Supabase restricted the whole
 * project with `exceed_cached_egress_quota`: every REST, Auth and Storage
 * request answering 402, the dashboard dead, the login dead, nothing
 * publishing. One post with two photographs is about a megabyte; three hundred
 * groups a day is three hundred megabytes a day; the Free plan allows five
 * gigabytes a month. It was never going to last three weeks.
 *
 * So media is now keyed by WHAT IT IS rather than by who asked for it. The
 * storage path of an upload is unique and its bytes never change — client.ts
 * uploads with `upsert: false`, so a path is written once and never rewritten —
 * which makes it a safe cache key for ever, not merely for a round.
 *
 * WHAT THIS FILE HAS TO GET RIGHT, because each one fails quietly:
 *
 *   * A half-written file must never be handed to Facebook. Downloads land on
 *     a temporary name and are renamed into place, and rename is atomic, so a
 *     reader either sees the whole file or no file.
 *   * Two jobs wanting the same picture at the same moment must not corrupt
 *     each other. They write different temporary names; whoever renames last
 *     wins, and both see identical bytes either way.
 *   * A download that FAILS must leave nothing behind. A poisoned cache entry
 *     would make one bad minute permanent.
 *   * The folder must not grow for ever. It is pruned by age and by size, and
 *     a file used during a round has its timestamp refreshed so a long round
 *     cannot evict its own pictures.
 *
 * AND NOTHING DELETES IT AFTER A JOB. The caller's cleanup was removed, not
 * moved — deleting after each publication is precisely the behaviour that cost
 * the quota, and a `finally` that empties this folder would restore it in one
 * line. There is a test that fails if one comes back.
 */
export interface LocalMedia {
  images: string[];
  video: string | null;
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; body: unknown }>;

export type MediaOptions = {
  fetcher?: Fetcher;
  /** The cache folder. Tests pass their own; nothing else should. */
  root?: string;
};

/** Files untouched for this long are gone. A round is minutes; a day is slack. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** And the folder never exceeds this, whatever the ages say. */
export const MAX_BYTES = 500 * 1024 * 1024;
/** Pruning walks the folder, so it happens on a timer rather than per job. */
export const PRUNE_EVERY_MS = 10 * 60 * 1000;

export function mediaCacheRoot(root?: string): string {
  return root ?? path.join(tmpdir(), 'hapitaron-social', 'media-cache');
}

/**
 * The name a piece of media is filed under.
 *
 * The STORAGE PATH, not the URL: a public URL can carry a token or a `?v=`
 * that changes while the bytes do not, and two spellings of one file would be
 * two downloads. `path` is what client.ts wrote the object at, it is unique per
 * upload, and `upsert: false` means it is never rewritten. The URL is the
 * fallback for anything that reaches here without one.
 */
function cacheName(item: MediaItem): string {
  const key = item.path || item.url;
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 24);
  let ext = '';
  try {
    ext = path.extname(new URL(item.url).pathname);
  } catch {
    ext = path.extname(item.url);
  }
  if (!/^\.[A-Za-z0-9]{1,5}$/.test(ext)) ext = item.kind === 'video' ? '.mp4' : '.jpg';
  return `${hash}${ext.toLowerCase()}`;
}

let lastPrune = 0;
let counter = 0;

/**
 * Remove what age or size says should go. Never throws: a cache that cannot be
 * tidied is still a cache, and a publication must not fail over housekeeping.
 */
export function pruneMediaCache(opts: MediaOptions & { now?: number } = {}): { removed: number; kept: number } {
  const dir = mediaCacheRoot(opts.root);
  const now = opts.now ?? Date.now();
  let removed = 0;
  let kept = 0;
  try {
    if (!existsSync(dir)) return { removed, kept };
    const files: { file: string; mtime: number; size: number }[] = [];
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      let s;
      try {
        s = statSync(file);
      } catch {
        continue;
      }
      if (!s.isFile()) continue;
      /*
       * A leftover `.part` is a download that died — the process was killed, the
       * network dropped. It is never readable media, so it goes on sight rather
       * than waiting out the age limit.
       */
      if (name.includes('.part-') || now - s.mtimeMs > MAX_AGE_MS) {
        try {
          rmSync(file, { force: true });
          removed += 1;
        } catch {
          /* A file Facebook still has open on Windows. Next sweep. */
        }
        continue;
      }
      files.push({ file, mtime: s.mtimeMs, size: s.size });
    }
    /* Oldest first, until the folder is under the ceiling. */
    let total = files.reduce((sum, f) => sum + f.size, 0);
    files.sort((a, b) => a.mtime - b.mtime);
    for (const f of files) {
      if (total <= MAX_BYTES) break;
      try {
        rmSync(f.file, { force: true });
        removed += 1;
        total -= f.size;
      } catch {
        /* Same. */
      }
    }
    kept = files.length;
  } catch {
    /* Housekeeping is never fatal. */
  }
  return { removed, kept };
}

/**
 * The media of one job, on disk — fetched only if it is not already here.
 *
 * Returns paths into the shared cache. The caller MUST NOT delete them: they
 * belong to every other publication in the round.
 */
export async function downloadMedia(media: MediaItem[], opts: MediaOptions = {}): Promise<LocalMedia> {
  const dir = mediaCacheRoot(opts.root);
  const fetcher = opts.fetcher ?? ((url: string) => fetch(url) as unknown as ReturnType<Fetcher>);
  mkdirSync(dir, { recursive: true });

  const now = Date.now();
  if (now - lastPrune > PRUNE_EVERY_MS) {
    lastPrune = now;
    pruneMediaCache(opts);
  }

  const images: string[] = [];
  let video: string | null = null;

  for (const item of media) {
    const file = path.join(dir, cacheName(item));
    if (existsSync(file)) {
      /*
       * TOUCHED ON EVERY HIT. A round can run for hours, and a picture that was
       * fetched at its start must not be swept out from under the groups still
       * waiting at its end. The timestamp is what the prune reads, so refreshing
       * it is what keeps a live round's media alive.
       */
      try {
        const t = new Date();
        utimesSync(file, t, t);
      } catch {
        /* Not worth failing a publication over. */
      }
    } else {
      counter += 1;
      const part = `${file}.part-${process.pid}-${counter}`;
      try {
        const res = await fetcher(item.url);
        if (!res.ok || !res.body) throw new Error(`הורדת המדיה נכשלה (${res.status}): ${item.name}`);
        await pipeline(Readable.fromWeb(res.body as import('stream/web').ReadableStream), createWriteStream(part));
        /*
         * Atomic, and tolerant of losing the race. If another job finished the
         * same file first, its copy is identical — the key is the storage path
         * and those bytes never change — so ours is simply dropped.
         */
        try {
          renameSync(part, file);
        } catch {
          if (!existsSync(file)) throw new Error(`הורדת המדיה נכשלה: ${item.name}`);
          rmSync(part, { force: true });
        }
      } catch (err) {
        /* NOTHING HALF-WRITTEN SURVIVES. A poisoned entry would make one bad
           minute permanent, because every later job would read it and attach a
           truncated picture Facebook quietly refuses. */
        rmSync(part, { force: true });
        throw err;
      }
    }
    if (item.kind === 'video') video = file;
    else images.push(file);
  }

  return { images, video };
}
