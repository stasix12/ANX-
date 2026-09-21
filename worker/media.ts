import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { MediaItem } from '@/lib/social/types';

/**
 * Media already lives in Supabase Storage (uploaded from the post editor).
 * Facebook's composer needs real files on disk for its <input type=file>,
 * so each job downloads its media into a per-job temp folder and deletes
 * it afterwards.
 */
export interface LocalMedia {
  dir: string;
  images: string[];
  video: string | null;
}

export async function downloadMedia(jobId: string, media: MediaItem[]): Promise<LocalMedia> {
  const dir = path.join(tmpdir(), 'hapitaron-social', jobId);
  mkdirSync(dir, { recursive: true });
  const images: string[] = [];
  let video: string | null = null;
  for (const [i, item] of media.entries()) {
    const ext = path.extname(new URL(item.url).pathname) || (item.kind === 'video' ? '.mp4' : '.jpg');
    const file = path.join(dir, `${String(i + 1).padStart(2, '0')}${ext}`);
    const res = await fetch(item.url);
    if (!res.ok || !res.body) throw new Error(`הורדת המדיה נכשלה (${res.status}): ${item.name}`);
    await pipeline(Readable.fromWeb(res.body as import('stream/web').ReadableStream), createWriteStream(file));
    if (item.kind === 'video') video = file;
    else images.push(file);
  }
  return { dir, images, video };
}

export function cleanupMedia(local: LocalMedia | null): void {
  if (!local) return;
  rmSync(local.dir, { recursive: true, force: true });
}
