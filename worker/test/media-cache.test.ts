/*
 * THE BUG THAT TOOK THE PRODUCT OFF THE AIR.
 *
 * Supabase restricted the whole project with `exceed_cached_egress_quota` —
 * every REST, Auth and Storage request answering HTTP 402, the dashboard dead,
 * the login dead, nothing publishing. The cause was one line in media.ts: the
 * post's pictures were downloaded into a folder named after the QUEUE ITEM and
 * deleted in the caller's `finally`. A queue item is one publication to one
 * group, so a round sending one post to three hundred groups fetched the same
 * bytes three hundred times — and with the daily repeat on, thirty times a
 * month on top of that. One megabyte of photographs becomes three hundred a
 * day; the Free plan allows five gigabytes a month.
 *
 * So the first assertion in this file is the whole point: three hundred
 * publications of one post download its media ONCE. The rest hold the four
 * things a shared cache gets wrong quietly — a half-written file handed to
 * Facebook, two jobs corrupting one entry, a failed download poisoning the
 * cache for ever, and a folder that grows until the disk is full.
 *
 * And the last section is a tripwire. The fix is one deleted line, and so is
 * the regression: a `cleanupMedia(local)` back in a `finally` restores the
 * original bug exactly, while every other test in this suite still passes.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync as read } from 'node:fs';
import { downloadMedia, pruneMediaCache, MAX_AGE_MS, MAX_BYTES } from '../media';
import type { MediaItem } from '../../src/lib/social/types';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.deepEqual(a, b, msg); };

const fresh = () => mkdtempSync(path.join(tmpdir(), 'media-cache-test-'));

function item(over: Partial<MediaItem> = {}): MediaItem {
  return { kind: 'image', url: 'https://p.supabase.co/storage/v1/object/public/social-media/a/1.jpg', path: 'a/1.jpg', name: '1.jpg', ...over };
}

/** A fetcher that counts, and can be told to fail. */
function counting(bytes: Record<string, string>, fail = new Set<string>()) {
  const hits: string[] = [];
  const fetcher = async (url: string) => {
    hits.push(url);
    if (fail.has(url)) return { ok: false, status: 500, body: null };
    const payload = bytes[url] ?? 'default-bytes';
    return {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(payload)); c.close(); },
      }),
    };
  };
  return { fetcher, hits };
}

async function main() {

/* ============================================ 1. the three-hundred-group round */

{
  const root = fresh();
  const { fetcher, hits } = counting({ [item().url]: 'PHOTO-BYTES' });
  const got: string[] = [];
  for (let group = 0; group < 300; group += 1) {
    const local = await downloadMedia([item()], { root, fetcher });
    got.push(local.images[0]);
  }
  eq(hits.length, 1, 'ONE post to THREE HUNDRED groups downloads its picture ONCE — this single number is the whole fix');
  eq(new Set(got).size, 1, 'and every group is handed the same file rather than three hundred copies');
  eq(readFileSync(got[0], 'utf8'), 'PHOTO-BYTES', 'which holds the bytes Facebook is about to be given');
}

/* Two different pictures are two downloads; the cache is not a cache if it
   confuses them. */
{
  const root = fresh();
  const a = item({ path: 'a/1.jpg', url: 'https://p/1.jpg' });
  const b = item({ path: 'b/2.jpg', url: 'https://p/2.jpg' });
  const { fetcher, hits } = counting({ 'https://p/1.jpg': 'AAA', 'https://p/2.jpg': 'BBB' });
  const first = await downloadMedia([a, b], { root, fetcher });
  const second = await downloadMedia([a, b], { root, fetcher });
  eq(hits.length, 2, 'two different pictures cost two downloads, and the second job costs none');
  eq(readFileSync(first.images[0], 'utf8'), 'AAA', 'the first picture is itself');
  eq(readFileSync(first.images[1], 'utf8'), 'BBB', 'and the second is not the first');
  eq(second.images, first.images, 'and the repeat is served the same two files, in the same order');
}

/*
 * KEYED BY THE STORAGE PATH, NOT THE URL. A public URL can carry a token or a
 * `?v=` that changes while the bytes do not — the group avatars in this product
 * do exactly that — and two spellings of one file would be two downloads of one
 * file, which is the bug wearing a different hat.
 */
{
  const root = fresh();
  const { fetcher, hits } = counting({});
  await downloadMedia([item({ url: 'https://p/1.jpg?v=111' })], { root, fetcher });
  await downloadMedia([item({ url: 'https://p/1.jpg?v=222' })], { root, fetcher });
  eq(hits.length, 1, 'the same storage path behind two different URLs is still one picture');
}

/* Video and images are routed apart, and the extension survives. */
{
  const root = fresh();
  const { fetcher } = counting({});
  const local = await downloadMedia(
    [item({ kind: 'video', path: 'v/1.mp4', url: 'https://p/clip.mp4', name: 'clip.mp4' }), item()],
    { root, fetcher },
  );
  is(local.video?.endsWith('.mp4'), 'a video lands as a video');
  eq(local.images.length, 1, 'and is not counted among the images');
  is(local.images[0].endsWith('.jpg'), 'which keep their own extension — Facebook reads the composer input by it');
}
/* A URL that carries no usable extension still produces a plausible file. */
{
  const root = fresh();
  const { fetcher } = counting({});
  const l1 = await downloadMedia([item({ path: 'x/1', url: 'https://p/download?id=7', name: 'x' })], { root, fetcher });
  is(l1.images[0].endsWith('.jpg'), 'an extensionless image is filed as .jpg rather than as nothing');
  const l2 = await downloadMedia([item({ kind: 'video', path: 'x/2', url: 'https://p/download?id=8', name: 'y' })], { root, fetcher });
  is(l2.video?.endsWith('.mp4'), 'and an extensionless video as .mp4');
}

/* ================================== 2. nothing half-written reaches Facebook */

/*
 * A FAILED DOWNLOAD MUST LEAVE NOTHING. A truncated picture in the cache would
 * make one bad minute permanent: every later publication would read it and hand
 * Facebook a file it quietly refuses, and the product would report success.
 */
{
  const root = fresh();
  const bad = 'https://p/broken.jpg';
  const { fetcher, hits } = counting({}, new Set([bad]));
  await assert.rejects(
    () => downloadMedia([item({ path: 'broken', url: bad, name: 'broken.jpg' })], { root, fetcher }),
    'a download the server refuses is an error, not a silent empty file',
  );
  checks += 1;
  eq(readdirSync(root).length, 0, 'and it leaves NOTHING behind — not the file, and not the .part it was writing');
  eq(hits.length, 1, 'it really did try');

  /* And it is recoverable: the next attempt is a clean one. */
  const ok = counting({ [bad]: 'RECOVERED' });
  const local = await downloadMedia([item({ path: 'broken', url: bad, name: 'broken.jpg' })], { root, fetcher: ok.fetcher });
  eq(readFileSync(local.images[0], 'utf8'), 'RECOVERED', 'a failure is not remembered — the next attempt simply works');
}

/*
 * AND THE FAILURE THAT ACTUALLY PRODUCES A TRUNCATED FILE: a stream that dies
 * HALFWAY. A refused request never opens a file at all, so the case above
 * proves less than it looks — it passed against a build that wrote straight to
 * the final name. This one is the hazard: Facebook is handed half a photograph,
 * it drops it, and the product reports a successful publication for ever after,
 * because every later job finds that file already cached.
 */
{
  const root = fresh();
  const url = 'https://p/torn.jpg';
  let tries = 0;
  const torn = async () => {
    tries += 1;
    return {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('HALF-A-PHOTO'));
          c.error(new Error('connection reset'));
        },
      }),
    };
  };
  await assert.rejects(
    () => downloadMedia([item({ path: 'torn', url, name: 'torn.jpg' })], { root, fetcher: torn }),
    'a connection that drops mid-picture is an error',
  );
  checks += 1;
  eq(tries, 1, 'it really did start downloading');
  eq(
    readdirSync(root),
    [],
    'and the half photograph is NOWHERE — not under its real name, where every later job would read it, and not as a leftover .part',
  );

  /* The next attempt is clean, and what it caches is whole. */
  const ok = counting({ [url]: 'WHOLE-PHOTO' });
  const local = await downloadMedia([item({ path: 'torn', url, name: 'torn.jpg' })], { root, fetcher: ok.fetcher });
  eq(readFileSync(local.images[0], 'utf8'), 'WHOLE-PHOTO', 'a torn download is not remembered — the retry caches the whole file');
  eq(readdirSync(root).length, 1, 'and leaves exactly one file behind');
}

/*
 * TWENTY JOBS WANTING ONE PICTURE AT ONCE. The worker publishes in parallel
 * when the gaps allow it, and a cache that two writers can tear is worse than
 * no cache: the torn read is a picture Facebook drops, on a publication the
 * product calls successful.
 */
{
  const root = fresh();
  const { fetcher, hits } = counting({ [item().url]: 'CONCURRENT-BYTES' });
  const all = await Promise.all(Array.from({ length: 20 }, () => downloadMedia([item()], { root, fetcher })));
  for (const [i, local] of all.entries()) {
    eq(readFileSync(local.images[0], 'utf8'), 'CONCURRENT-BYTES', `job ${i} reads whole, uncorrupted bytes`);
  }
  is(hits.length <= 20, 'twenty parallel jobs never cost more than twenty downloads');
  eq(readdirSync(root).filter((f) => f.includes('.part-')).length, 0, 'and no half-written file is left lying in the folder');
  eq(readdirSync(root).length, 1, 'one picture is one file, however many jobs raced for it');
}

/* ====================================== 3. the folder does not grow for ever */

{
  const root = fresh();
  const { fetcher } = counting({});
  const local = await downloadMedia([item()], { root, fetcher });

  /* A file still inside the age limit stays. */
  eq(pruneMediaCache({ root }).removed, 0, 'a picture downloaded a moment ago is not swept away');
  is(existsSync(local.images[0]), 'and is still there to be attached');

  /* Older than a day, and it goes. */
  const old = new Date(Date.now() - MAX_AGE_MS - 60_000);
  utimesSync(local.images[0], old, old);
  eq(pruneMediaCache({ root }).removed, 1, 'a picture nothing has touched for a day is removed');
  is(!existsSync(local.images[0]), 'really removed');
}

/*
 * A LONG ROUND MUST NOT EVICT ITS OWN PICTURES. Three hundred groups at a
 * forty-five minute gap is days, not minutes, and a cache that expires by
 * download time would drop the media halfway through the round it was fetched
 * for. Every hit refreshes the timestamp, so a picture in use never ages.
 */
{
  const root = fresh();
  const { fetcher, hits } = counting({});
  const first = await downloadMedia([item()], { root, fetcher });
  const old = new Date(Date.now() - MAX_AGE_MS + 1000);
  utimesSync(first.images[0], old, old);
  const before = statSync(first.images[0]).mtimeMs;
  await downloadMedia([item()], { root, fetcher });
  is(statSync(first.images[0]).mtimeMs > before, 'using a picture makes it young again');
  eq(hits.length, 1, 'and using it still costs no download');
  eq(pruneMediaCache({ root }).removed, 0, 'so the sweep that would have taken it now leaves it alone');
}

/*
 * A READER LOOKS ONLY AT THE FINAL NAME. A download in flight exists under a
 * .part name, and a job arriving in that moment must find nothing and fetch its
 * own copy — never the half-written file sitting beside it.
 */
{
  const root = fresh();
  const { fetcher, hits } = counting({ [item().url]: 'WHOLE' });
  /* Exactly what an in-flight download looks like on disk. */
  writeFileSync(path.join(root, `${readdirSync(root).length}placeholder.jpg.part-1-1`), 'HALF');
  const local = await downloadMedia([item()], { root, fetcher });
  eq(hits.length, 1, 'a download in flight beside it is not mistaken for a cache hit');
  eq(readFileSync(local.images[0], 'utf8'), 'WHOLE', 'and what comes back is the whole picture');
}

/* A leftover .part — a worker killed mid-download — is never media, so it goes
   on sight rather than waiting out the day. */
{
  const root = fresh();
  writeFileSync(path.join(root, 'abc.jpg.part-123-1'), 'half');
  eq(pruneMediaCache({ root }).removed, 1, 'a half-written leftover from a killed worker is cleared immediately');
}

/* And the size ceiling, oldest first. */
{
  const root = fresh();
  const big = 'x'.repeat(1024);
  for (let i = 0; i < 5; i += 1) {
    const f = path.join(root, `f${i}.jpg`);
    writeFileSync(f, big);
    const t = new Date(Date.now() - (5 - i) * 60_000);
    utimesSync(f, t, t);
  }
  /* Nothing is over the real ceiling, so nothing goes on size alone. */
  eq(pruneMediaCache({ root }).removed, 0, 'five kilobytes is not half a gigabyte, and the sweep knows it');
  is(MAX_BYTES >= 100 * 1024 * 1024, 'the ceiling is generous enough that a normal round never meets it');
  eq(readdirSync(root).length, 5, 'so a working cache is left alone');
}

/* Housekeeping is never fatal: a folder that does not exist is not an error. */
eq(pruneMediaCache({ root: path.join(fresh(), 'never-made') }).removed, 0, 'pruning a folder that was never created is a no-op, not a crash');

/* ============================================= 4. the tripwire on the fix itself */

{
  const file = (p: string) => read(new URL(p, import.meta.url), 'utf8');
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const adapter = code(file('../adapters/facebookGroupBrowser.ts'));
  const worker = code(file('../social-worker.ts'));
  const media = file('../media.ts');

  /*
   * THE ONE LINE. `cleanupMedia(local)` in a finally is the original bug, and
   * every other test here passes with it back in place — the cache would simply
   * be emptied after each publication and refilled on the next.
   */
  is(!/cleanupMedia/.test(adapter + worker), 'no publication deletes the media after itself — that single line is what the three hundred downloads were');
  is(!/cleanupMedia/.test(code(media)), 'and the function is gone rather than left exported for somebody to call again');
  is(!/rmSync\(|rm\(/.test(adapter), 'and the adapter removes nothing from disk at all');

  /* The cache key must stay the storage path. An edit back to the URL would
     quietly restore most of the egress, because the avatars carry ?v=. */
  is(/item\.path \|\| item\.url/.test(code(media)), 'the key is the storage path first — a URL carrying ?v= would make one file look like many');
  is(/upsert: false/.test(file('../../src/lib/social/client.ts')), 'and that key is only safe because an upload never overwrites a path — if that changes, this cache must too');

  /* Atomicity, by name, so a refactor to a plain write is visible. */
  is(/renameSync\(part, file\)/.test(code(media)), 'downloads are renamed into place — a reader sees the whole file or no file');
  /*
   * AND `part` IS NOT `file`. This is the half of it a behaviour test cannot
   * reach: the damage is a reader arriving during the write, which is a race no
   * test can schedule. What CAN be held is the property that prevents it — the
   * writer's path is never the reader's path. Collapsing the two passes every
   * other assertion in this file and reintroduces the torn read.
   */
  is(
    code(media).includes('const part = `${file}.part-'),
    'the download writes to a name derived from the final one, never to the final one itself',
  );
  is(/\.part-/.test(code(media)), 'and are written under a name nothing will ever attach');
}

console.log(`media cache tests OK — ${checks} assertions`);

}

main().catch((e) => { console.error(e); process.exit(1); });
