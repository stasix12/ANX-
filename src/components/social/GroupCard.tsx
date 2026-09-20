'use client';

import Link from 'next/link';
import { formatDayMonthHe } from '@/lib/social/time';
import type { SocialTarget } from '@/lib/social/types';
import { CheckIcon, StarIcon } from '@/components/icons';
import { TargetAvatar } from './TargetAvatar';
import { Badge, OverflowMenu, type MenuAction } from './ui';

/**
 * A group, reduced to what identifies it: picture, name, where it belongs,
 * whether it is on, and when it last published. Everything else — pause,
 * favourite, category, history, remove — lives behind the "⋯", because a
 * hundred cards each carrying six controls is a wall, not a list.
 *
 * Two modes, and they are why the card is the shape it is.
 *
 * Browsing: the tile is a link to the group's profile, and the only things
 * floating over it are the status dot, the favourite star and the "⋯". All
 * three now sit in the 44px corners, clear of the centred 72px avatar — at
 * 375px the avatar spans x 47-119 and the two hit boxes stop at 44 and start
 * at 122. That is what lets the top padding be 10px instead of 32: `pt-8`
 * existed only to push the picture below a control row, and did not clear it
 * anyway (the star's glyph sat on the avatar's edge). There is no checkbox on
 * the card at all in this mode — the 44px near-opaque `bg-ink-950/70` puck
 * pinned over the avatar's top-left, the "big dark circle on the picture", is
 * gone.
 *
 * Picking: the tile stops being a link and becomes one big toggle, with a
 * 28px mark in the free top-end corner. Tapping anywhere on the card selects
 * it, which is the only way a multi-select is usable with a thumb; the mark
 * is aria-hidden because the button itself carries the name and aria-pressed,
 * and a real checkbox element nested inside a button is neither valid markup
 * nor announced once.
 */
export function GroupCard({
  group,
  selectionMode,
  selected,
  onSelect,
  onToggleFavorite,
  actions,
  nextAt,
  cityLabel,
}: {
  group: SocialTarget;
  /** True only while the screen is in selection mode — see the note above. */
  selectionMode: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onToggleFavorite: () => void;
  actions: MenuAction[];
  nextAt?: string;
  /**
   * The city to print: `group.city` when the owner set one, otherwise what
   * detectCity() guessed from the name. The page computes it, because the page
   * is what groups the grid by it — two answers to "which city" is the defect
   * this product keeps removing.
   */
  cityLabel?: string;
}) {
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  /*
   * The selected skin leans on the ring rather than the wash. A 12% brand
   * tint over this card is a few percent of luminance — fine beside an
   * unselected neighbour, invisible on its own at arm's length, and until now
   * it was propped up by the dark puck that has just been removed. 12% is
   * TONE_TINT.brand, not a new opacity; the ring is what actually reads.
   */
  const skin = `surface flex h-full flex-col items-center rounded-tile border p-2.5 text-center transition-[border-color,transform] active:scale-[0.98] ${
    selected ? 'border-brand-300 bg-brand-300/12 ring-2 ring-brand-300' : 'border-ink-700'
  } ${group.enabled ? '' : 'opacity-55'}`;

  const body = (
    <>
      {/* 56, not 72. At 72 the picture was most of the tile and the owner
          reading a wall of them was reading pictures, not names — and it is
          the NAME that says which group this is. The name gets the room. */}
      <TargetAvatar name={group.name} imageUrl={group.image_url} channel={group.channel} size={56} />
      <p dir="auto" className="mt-1.5 line-clamp-2 w-full text-sm font-bold leading-tight text-mist-100" title={group.name}>
        {group.name}
      </p>
      {/*
        THE CITY IS BACK ON THE CARD, and it now says something the section
        heading above it does not.

        It was taken off because every card under "באר שבע" carried a
        "באר שבע" chip — true, and it stayed true right up until 57 groups
        landed in "אחר". There the heading says only that the city is unknown,
        and the one thing the owner needs to see per card is whether THIS one
        has been given a city or is still guessed from its name. So the chip
        distinguishes the two: a set city is brand-coloured and certain, a
        guess is neutral and marked as one. That is not a repeat of the
        heading; it is the difference between a fact and a guess.
      */}
      {(cityLabel || group.category) && (
        <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-1">
          {cityLabel && (
            <Badge tone={group.city ? 'brand' : 'neutral'}>
              <span dir="auto" className="block max-w-[6.5rem] truncate">{group.city ? cityLabel : `${cityLabel}?`}</span>
            </Badge>
          )}
          {group.category && (
            <Badge tone="neutral"><span dir="auto" className="block max-w-[6.5rem] truncate">{group.category}</span></Badge>
          )}
        </div>
      )}
      {/* One meta line, not two. "פורסם 18.09" and "הבא: 20.09" were separate
          paragraphs, so a group with a slot booked was 14px taller than one
          without and the grid rows stopped agreeing. No dir="ltr" island is
          needed here: "18.09" is a single number run under UAX#9 W4, and the
          two dates never touch — the word "הבא" sits between them. */}
      <p className="mt-1 text-[11px] leading-tight text-mist-500">
        {!group.last_synced_at
          ? 'מושך פרטים…'
          : group.last_published_at
            ? `פורסם ${formatDayMonthHe(group.last_published_at)}`
            : 'טרם פורסם'}
        {nextAt && <span className="font-bold text-brand-400"> · הבא {formatDayMonthHe(nextAt)}</span>}
      </p>
    </>
  );

  return (
    <li className="relative">
      {selectionMode ? (
        <button type="button" aria-pressed={selected} aria-label={`בחר את ${group.name}`} onClick={() => onSelect(!selected)} className={`w-full ${skin}`}>
          {body}
        </button>
      ) : (
        <Link href={`/social/groups/${group.id}`} className={skin}>
          {body}
        </Link>
      )}

      {/* The dot sits inside the star's 44px hit box, so it must not swallow
          the tap that belongs to the control underneath it. */}
      <span
        aria-hidden
        title={group.enabled ? 'פעילה' : 'מושהית'}
        className={`pointer-events-none absolute start-1 top-1 z-10 block h-2 w-2 rounded-full ${group.enabled ? 'bg-success-400' : 'bg-mist-500'}`}
      />

      {selectionMode ? (
        /* 28px, 8px in from the top-end corner. At the mark's own height the
           avatar circle has narrowed to x 56-110 on a 166px card and the mark
           starts at 130, so it never lands on the picture. */
        <span
          aria-hidden
          className={`absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full border-2 ${
            selected ? 'border-brand-500 bg-brand-500 text-on-brand' : 'border-mist-500 bg-ink-900'
          }`}
        >
          {selected && <CheckIcon className="h-4 w-4" />}
        </span>
      ) : (
        <>
          {/* Controls float above the link so the tile stays one big target.
              start-0 / end-0 rather than start-2 / end-1: a 44px box pushed
              fully into the corner is what clears the avatar, and clearing it
              is what paid for the shorter card. */}
          <button
            type="button"
            aria-label={group.favorite ? `הסר את ${group.name} מהמועדפות` : `הוסף את ${group.name} למועדפות`}
            aria-pressed={Boolean(group.favorite)}
            onClick={(e) => {
              stop(e);
              onToggleFavorite();
            }}
            /* ⭐/☆ were a full-colour Apple emoji and a hairline text glyph
               doing the on and off states of one control, beside an otherwise
               all-SVG card. One icon, filled or not. */
            className={`absolute start-0 top-0 grid h-11 w-11 place-items-center ${group.favorite ? 'text-warning-400' : 'text-mist-500'}`}
          >
            <StarIcon className="h-4.5 w-4.5" fill={group.favorite ? 'currentColor' : 'none'} />
          </button>

          <div className="absolute end-0 top-0" onClick={stop}>
            <OverflowMenu label={group.name} actions={actions} />
          </div>
        </>
      )}
    </li>
  );
}
