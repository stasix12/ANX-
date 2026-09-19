'use client';

import { PlayIcon } from '@/components/icons';
import type { LibraryPost } from '@/lib/social/library';
import { formatDayMonthHe } from '@/lib/social/time';
import type { MediaItem } from '@/lib/social/types';
import { Badge, Button, OverflowMenu, type MenuAction } from './ui';

/**
 * One post in the content library, with the media as the subject.
 *
 * The grid is what the owner opens on a phone to find "the sofa post", so the
 * picture has to carry the card — a list of titles is what the old /social/posts
 * screen was, and a video-only post had no visual there at all.
 *
 * Numbers on this card are read, never invented: publishCount / pendingCount /
 * lastPublishedAt are aggregated from social_queue by listLibrary(). A post that
 * has never gone out says so in words rather than showing a zero.
 */
export function ContentCard({
  item,
  selected,
  onSelect,
  onPublish,
  onOpen,
  actions = [],
  categoryName = null,
}: {
  item: LibraryPost;
  selected: boolean;
  onSelect: (id: string, on: boolean) => void;
  onPublish: (item: LibraryPost) => void;
  onOpen: (item: LibraryPost) => void;
  /** The card's "⋯". Built by the screen so the card itself stays presentational. */
  actions?: MenuAction[];
  /** Resolved name for item.categoryId. The card never guesses one. */
  categoryName?: string | null;
}): React.ReactElement {
  const post = item.post;
  const media = post.media as MediaItem[];
  /*
   * The cover: first image, and failing that whatever media exists. Picking
   * `find(kind === 'image')` alone is the bug this grid exists to fix — a
   * video-only post then has no subject at all.
   */
  const cover = media.find((m) => m.kind === 'image') ?? media[0] ?? null;
  const title = post.title || post.base_text.slice(0, 60) || 'ללא כותרת';
  /*
   * Two different numbers, so they get two different words: publishCount counts
   * PUBLICATIONS (queue rows) and publishedTargetIds counts distinct GROUPS. Put
   * side by side unlabelled they read as a contradiction.
   */
  const groups = item.publishedTargetIds.length;
  const times = item.publishCount === 1 ? 'פורסם פעם אחת' : `פורסם ${item.publishCount} פעמים`;
  /*
   * A post can have a full run behind it and still have published nothing —
   * the library used not to fetch skipped or failed rows at all, so it read
   * "טרם פורסם" about the same 84 rows the run card was counting. Now it says
   * which it was.
   */
  const nothingYet = item.skippedCount > 0 ? `טרם פורסם · ${item.skippedCount} דולגו` : 'טרם פורסם';
  const published = item.publishCount === 0 ? nothingYet : groups > 1 ? `${times} ב-${groups} קבוצות` : times;

  return (
    <li className="relative">
      <div
        className={`surface flex h-full flex-col rounded-2xl border p-2 transition-[border-color] ${
          selected ? 'border-brand-500 bg-brand-500/5' : 'border-ink-600'
        }`}
      >
        <button type="button" onClick={() => onOpen(item)} className="min-w-0 text-start">
          <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-ink-800">
            {cover?.kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
            {cover?.kind === 'video' && (
              <>
                {/*
                  The poster frame, not the film. preload="metadata" fetches the
                  header only, and the #t=0.1 fragment is what makes iOS Safari
                  actually paint a frame instead of a black box. Nothing is
                  generated or stored: if the frame does not paint, what stays is
                  the neutral tile and the play mark below — never a stock image
                  standing in for the owner's video.
                */}
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={`${cover.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                <span aria-hidden className="absolute inset-0 grid place-items-center">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-950/55 text-white">
                    <PlayIcon className="h-5 w-5" />
                  </span>
                </span>
              </>
            )}
            {!cover && (
              <span
                dir="auto"
                className="line-clamp-5 block h-full px-3 py-3 text-start text-[13px] font-extrabold leading-snug text-mist-300"
              >
                {post.base_text || title}
              </span>
            )}
          </span>

          <span dir="auto" className="mt-2 block truncate px-0.5 text-sm font-bold text-mist-100">
            {title}
          </span>
          <span dir="auto" className="mt-0.5 line-clamp-2 block px-0.5 text-[11px] leading-snug text-mist-500">
            {post.base_text || 'בלי טקסט — מדיה בלבד'}
          </span>
        </button>

        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 px-0.5">
          {categoryName && (
            <Badge tone="brand">
              <span dir="auto">{categoryName}</span>
            </Badge>
          )}
          {post.status === 'draft' && <Badge tone="neutral">טיוטה</Badge>}
          {item.pendingCount > 0 && (
            <Badge tone="info">{item.pendingCount === 1 ? 'פרסום אחד ממתין בתור' : `${item.pendingCount} פרסומים ממתינים בתור`}</Badge>
          )}
          {media.length > 1 && <Badge tone="neutral">{media.length} קבצי מדיה</Badge>}
        </div>

        <p className="mt-1 px-0.5 text-[11px] leading-tight text-mist-500">
          {published}
          {item.lastPublishedAt ? ` · אחרון ${formatDayMonthHe(item.lastPublishedAt)}` : ''}
        </p>

        <div className="mt-auto flex items-center gap-1 pt-2">
          <Button size="sm" className="grow" onClick={() => onPublish(item)}>
            פרסם
          </Button>
          {actions.length > 0 && <OverflowMenu label={title} actions={actions} />}
        </div>
      </div>

      {/* Selection floats over the media so the tile below stays one big target. */}
      <label className="absolute end-2 top-2 grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-ink-850/90 ring-1 ring-ink-600">
        <input
          type="checkbox"
          aria-label={`בחר את ${title}`}
          checked={selected}
          onChange={(e) => onSelect(post.id, e.target.checked)}
          className="h-4 w-4 accent-brand-500"
        />
      </label>
    </li>
  );
}
