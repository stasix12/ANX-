'use client';

import { PlayIcon } from '@/components/icons';
import type { MediaItem } from '@/lib/social/types';

/**
 * The post's cover, exactly as CampaignCard and the library card draw it: the
 * first image, and failing that whatever media exists — picking media[0]
 * blindly makes the same post look different on each screen.
 *
 * A video shows its poster frame, never the film: preload="metadata" fetches
 * the header only and the #t=0.1 fragment is what makes iOS Safari paint a
 * frame instead of a black box. If it does not paint, the neutral tile and the
 * play mark remain — never a stock image standing in for the owner's video.
 */
export function PostCover({ media, className = 'h-28 w-28' }: { media?: MediaItem[] | null; className?: string }) {
  const cover = (media ?? []).find((m) => m.kind === 'image') ?? (media ?? [])[0] ?? null;
  if (!cover) return null;
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-xl bg-ink-800 ${className}`}>
      {cover.kind === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover.url} alt="" loading="lazy" className="h-full w-full object-cover" />
      )}
      {cover.kind === 'video' && (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={`${cover.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          <span aria-hidden className="absolute inset-0 grid place-items-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-ink-950/60 text-mist-100">
              <PlayIcon className="h-5 w-5" />
            </span>
          </span>
        </>
      )}
    </span>
  );
}
