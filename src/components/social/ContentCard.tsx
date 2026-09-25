'use client';

import { useState } from 'react';
import { CheckIcon, ImageIcon, PlayIcon, SendIcon } from '@/components/icons';
import type { LibraryPost } from '@/lib/social/library';
import { agree, formatDayMonthHe } from '@/lib/social/time';
import type { MediaItem } from '@/lib/social/types';
import { Badge, Button, OverflowMenu, type MenuAction } from './ui';

/** m:ss, from the file the browser already has the header of. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * One post in the content library, with the media as the subject.
 *
 * The grid is what the owner opens on a phone to find "the sofa post", so the
 * picture has to carry the card — a list of titles is what the old /social/posts
 * screen was, and a video-only post had no visual there at all.
 *
 * The card shows the picture, the name and two numbers, and nothing else: the
 * post's own text used to run underneath as a third block of prose, which on a
 * 173px tile is four lines of grey no one reads while scanning. The text is a
 * tap away in the editor, which is where it can be read AND changed.
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
  /*
   * The video's real length, read off the metadata the poster frame already
   * fetches (preload="metadata"), not stored and not guessed. It stays null
   * when the browser cannot read it, and then no duration is claimed.
   */
  const [seconds, setSeconds] = useState<number | null>(null);

  const post = item.post;
  const media = post.media as MediaItem[];
  /*
   * The cover: first image, and failing that whatever media exists. Picking
   * `find(kind === 'image')` alone is the bug this grid exists to fix — a
   * video-only post then has no subject at all.
   */
  const cover = media.find((m) => m.kind === 'image') ?? media[0] ?? null;
  /*
   * What KIND of post this is, said in one word instead of left for the
   * thumbnail to imply. Read straight off the media that is already loaded —
   * nothing here inspects a file or guesses at one that is missing.
   */
  const kind = !cover ? 'טקסט' : cover.kind === 'video' ? 'וידאו' : 'תמונה';
  const title = post.title || post.base_text.slice(0, 60) || 'ללא כותרת';
  /*
   * One number, not two.
   *
   * publishCount counts PUBLICATIONS and publishedTargetIds counts distinct
   * GROUPS, and side by side unlabelled they read as a contradiction — which
   * is why the card used to spell both out in a sentence. A browsing tile has
   * room for neither sentence: it shows the publications beside a send mark,
   * and the full "פורסם 12 פעמים ב-9 קבוצות" stays where it is acted on, in
   * the publish sheet.
   *
   * A post can also have a full run behind it and still have published
   * nothing, so zero is never printed as a number: it says so in words, and
   * says whether anything was skipped.
   */
  const nothingYet = item.skippedCount > 0 ? `טרם פורסם · ${item.skippedCount} ${agree(item.skippedCount, 'דולג', 'דולגו')}` : 'טרם פורסם';

  return (
    <li className="relative">
      <div
        className={`surface flex h-full flex-col rounded-card border p-2.5 transition-[border-color,box-shadow] ${
          selected ? 'border-brand-300 bg-brand-300/8' : 'border-ink-700'
        }`}
      >
        <button type="button" onClick={() => onOpen(item)} className="min-w-0 text-start">
          {/* 1.2:1 — a little taller than the 4:3 it was, because on a phone
              tile the picture IS the row and 30px of it is worth more than
              30px of anything under it. */}
          <span className="relative block aspect-[6/5] w-full overflow-hidden rounded-xl bg-ink-800">
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
                <video
                  src={`${cover.url}#t=0.1`}
                  preload="metadata"
                  muted
                  playsInline
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0) setSeconds(d);
                  }}
                  className="h-full w-full object-cover"
                />
                <span aria-hidden className="absolute inset-0 grid place-items-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-ink-950/45 text-mist-100 shadow-[0_4px_14px_rgba(46,16,101,0.25)] backdrop-blur-sm">
                    <PlayIcon className="h-5 w-5" />
                  </span>
                </span>
              </>
            )}
            {!cover && (
              <span
                dir="auto"
                className="line-clamp-5 h-full px-3 py-3 text-start text-[13px] font-extrabold leading-snug text-mist-300"
              >
                {post.base_text || title}
              </span>
            )}

            {/* What is behind the cover, over the cover: how many files, or
                how long the film runs. Both are read off media that is
                already here — neither is a placeholder. */}
            {(media.length > 1 || seconds !== null) && (
              <span className="pointer-events-none absolute bottom-1.5 start-1.5 inline-flex items-center gap-1 rounded-lg bg-ink-950/65 px-1.5 py-0.5 text-[11px] font-extrabold text-mist-100 backdrop-blur-sm">
                {media.length > 1 ? (
                  <>
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{media.length}</span>
                  </>
                ) : (
                  <span dir="ltr" className="tabular-nums">
                    {clock(seconds as number)}
                  </span>
                )}
              </span>
            )}
          </span>

          {/* No `block` beside the clamp: the display utility is declared later in
              the sheet and overrode line-clamp's own -webkit-box, so the clamp
              never took and a long title ran to three lines and pushed the two
              cards in its row apart. */}
          <span dir="auto" className="mt-2 line-clamp-2 px-0.5 text-sm font-bold leading-snug text-mist-100">
            {title}
          </span>
        </button>

        {/*
          ONE metadata line: what it is, how far it has got, and when.

          It was two — a row of badges over a sentence — and on a 153px tile
          that is 40px of chrome under every picture. What a post IS (the
          badge), how many times it has gone out and the date it last did fit
          on one line together; the category and the rarer states wrap onto a
          second only when they exist. The category is the owner's own words
          and can be long, so it is capped rather than allowed to widen the
          tile.
        */}
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 px-0.5 text-[11px] leading-tight text-mist-500">
          <Badge tone="brand">{kind}</Badge>
          {post.status === 'draft' && <Badge tone="neutral">טיוטה</Badge>}
          {item.pendingCount > 0 && <Badge tone="brand">{item.pendingCount === 1 ? 'אחד בתור' : `${item.pendingCount} בתור`}</Badge>}
          {item.publishCount === 0 ? (
            <span className="truncate">{nothingYet}</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <SendIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="tabular-nums">{item.publishCount}</span>
              <span className="sr-only">{item.publishCount === 1 ? 'פורסם פעם אחת' : `פורסם ${item.publishCount} פעמים`}</span>
            </span>
          )}
          {item.lastPublishedAt && (
            <span dir="ltr" className="ms-auto shrink-0 tabular-nums">
              {formatDayMonthHe(item.lastPublishedAt)}
            </span>
          )}
          {categoryName && (
            <Badge tone="neutral">
              <span dir="auto" className="block max-w-[6.5rem] truncate">
                {categoryName}
              </span>
            </Badge>
          )}
        </div>

        <div className="mt-auto flex items-center gap-1 pt-2">
          <Button size="sm" className="grow" onClick={() => onPublish(item)}>
            פרסם
          </Button>
          {actions.length > 0 && <OverflowMenu label={title} actions={actions} />}
        </div>
      </div>

      {/*
        Selection floats over the media so the tile below stays one big target.
        The circle reads at 36px and is tapped at 44: the checkbox itself is
        the real control and stays in the accessibility tree, the circle is
        what it looks like.
      */}
      <label className="absolute end-1.5 top-1.5 grid h-11 w-11 cursor-pointer place-items-center">
        <input
          type="checkbox"
          aria-label={`בחר את ${title}`}
          checked={selected}
          onChange={(e) => onSelect(post.id, e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`grid h-9 w-9 place-items-center rounded-full border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink-850 ${
            selected ? 'grad-primary border-transparent bg-brand-500 text-on-brand' : 'border-ink-600 bg-ink-900/90 text-transparent backdrop-blur-sm'
          }`}
        >
          <CheckIcon className="h-5 w-5" strokeWidth={3} />
        </span>
      </label>
    </li>
  );
}
