'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronIcon } from '@/components/icons';

/**
 * ONE CARD AT A TIME, THE REST A SWIPE AWAY.
 *
 * "אם אני מריץ עוד קמפיין אני רוצה שיהיה ניתן לראות אותה גם בעמוד הזה בסגנון
 *  SWIPE גלילה שמאלה ימינה."
 *
 * The dashboard featured exactly one run and a second live campaign was not on
 * the screen at all. Stacking them is not an option — the run card is ~450px
 * and three of them would push "פעילות אחרונה" and the bottom navigation off a
 * phone — so they go side by side in a strip the thumb moves.
 *
 * NATIVE SCROLL, NOT A SLIDER LIBRARY. `overflow-x-auto` with CSS scroll snap
 * is the browser's own gesture: it has the right friction, the right rubber
 * band at the ends, it works with a trackpad, a touchpad, a screen reader's
 * caret and a keyboard, and it costs no JavaScript to run while the finger is
 * down. Everything this file adds is the DOTS — a way to see how many there
 * are and to jump — and the index they highlight is read back off the scroll
 * position rather than being a second source of truth that can disagree.
 *
 * RTL IS WHY `Math.abs` IS HERE. In a right-to-left scroller Chrome reports
 * `scrollLeft` as 0 at the RIGHT edge and counts DOWN into negatives as the
 * content moves left; WebKit historically counted up from zero the other way.
 * Taking the magnitude is correct under both and needs no browser sniff.
 *
 * ONE CHILD AND IT IS A PLAIN CARD. With a single run there is nothing to
 * swipe between, so the strip renders the card and no dots — the dashboard
 * looks exactly as it did before this existed.
 */
/**
 * One arrow: a 44px target painting a chevron, disabled at the ends.
 *
 * DISABLED RATHER THAN HIDDEN at the ends. A control that disappears moves
 * everything beside it — the dots and the "2 / 3" would shift sideways every
 * time the strip reached a limit, which reads as the layout breaking.
 */
function ArrowButton({ label, onClick, disabled, back = false }: { label: string; onClick: () => void; disabled: boolean; back?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-mist-300 transition-colors hover:bg-ink-800 hover:text-brand-300 disabled:pointer-events-none disabled:text-ink-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-300"
    >
      <ChevronIcon aria-hidden className={`h-4 w-4 ${back ? 'rotate-180' : ''}`} />
    </button>
  );
}

export function CardSwiper({
  label,
  itemLabel,
  keys,
  children,
}: {
  /** Names the strip for a screen reader: "הסבבים הפעילים". */
  label: string;
  /** Names one slide, given its 1-based position: `(i, n) => …`. */
  itemLabel: (position: number, total: number) => string;
  /**
   * A STABLE IDENTITY PER SLIDE — the campaign id, not its position.
   *
   * The slides were keyed by index while the dashboard re-sorts the runs on
   * every thirty-second poll, and the sort's tiebreak is percentFinished
   * ascending — which moves whenever a row finishes, so routinely, while the
   * owner is looking at the card. The strip's own position is a scroll
   * offset, so slide 2 stayed slide 2 and simply became a different campaign:
   * the card under the thumb changed round without the dots or the "2 / 2"
   * moving, and a tap meant for one round landed on another.
   *
   * With real keys React keeps each card's DOM and its state with the card,
   * and the effect below keeps the SCROLL on the campaign that was in view
   * rather than on the index it happened to occupy.
   *
   * Optional, so a caller with genuinely positional children is unchanged.
   */
  keys?: string[];
  children: React.ReactNode[];
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = children.length;

  /*
   * WHICH CARD IS IN VIEW, read off the scroll position.
   *
   * THE STEP IS THE DISTANCE BETWEEN TWO CARDS, NOT A CARD'S WIDTH, and the
   * difference is the `gap-3` between them. Dividing by the width alone drifts
   * by 12px per card: at three cards it still rounds to the right dot, at
   * eight it is 26% of a card out, and at some number nobody would have tested
   * it lights the wrong one. `offsetLeft` between the first two slides is the
   * real pitch, whatever the gap and the padding are, and it keeps this
   * correct if either ever changes.
   *
   * Measured from the CHILDREN rather than the container for the same reason:
   * the child is the thing being counted.
   */
  const sync = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    const second = el.children[1] as HTMLElement | undefined;
    const step = second && first ? Math.abs(second.offsetLeft - first.offsetLeft) : (first?.getBoundingClientRect().width ?? el.clientWidth);
    if (step <= 0) return;
    const at = Math.round(Math.abs(el.scrollLeft) / step);
    const clamped = Math.min(Math.max(at, 0), Math.max(count - 1, 0));
    /* THE HELD CARD IS RECORDED WHERE THE POSITION CHANGES ON PURPOSE — see
       the note on `held`. A scroll is the owner moving the strip himself, so
       whatever is in view afterwards is what he means to be looking at. */
    held.current = keysRef.current?.[clamped] ?? null;
    setIndex((prev) => (prev === clamped ? prev : clamped));
  }, [count]);

  /* A run can finish, or a new one can start, between two polls. An index left
     pointing past the end would highlight a dot that is not there. */
  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(count - 1, 0));
  }, [count, index]);

  /*
   * STAY ON THE CARD, NOT ON THE SLOT.
   *
   * The thumb is resting on a round; a poll re-sorts the list; without this
   * the strip keeps its scroll offset and the owner is now looking at a
   * different campaign. `held` remembers which KEY was in view and the strip
   * is moved back to it when that key changes position.
   *
   * Only when keys are supplied, and never while a gesture is in flight —
   * scrolling the strip under a moving finger is worse than the problem.
   */
  const held = useRef<string | null>(null);
  /*
   * ─── AND IT NEVER WORKED, BECAUSE AN EFFECT KEPT OVERWRITING IT ────────
   *
   * `held` used to be written by `useEffect(..., [keys, index])`. `keys` is
   * rebuilt on every render, so that effect ran on EVERY render — including
   * the one straight after a poll re-sorted the list. At that moment `index`
   * is still the OLD slot number while `keys` is already the NEW order, so
   * the line stored `keys[oldIndex]`: the campaign that had just moved INTO
   * the slot under the thumb. The restore below then found it already in
   * place and did nothing.
   *
   * The whole mechanism was inert, and the failure is not cosmetic: the
   * dashboard's run card carries "סיים ואפס", which archives a round and
   * cancels every publication still waiting in it. A card that silently
   * becomes a different campaign between the look and the tap is a stop
   * applied to the wrong round.
   *
   * So nothing writes `held` from a render any more. It is written exactly
   * where the position changes DELIBERATELY — a scroll (sync) and a tap on a
   * dot (goTo) — plus once on mount, below, so a re-sort before the owner
   * has touched anything still has something to hold onto.
   */
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const keyList = keys?.join(',') ?? '';
  useEffect(() => {
    if (!keys) return;
    /* First run: adopt whatever is in view, without moving anything. */
    if (held.current === null) {
      held.current = keys[index] ?? null;
      return;
    }
    const to = keys.indexOf(held.current);
    if (to < 0 || to === index) return;
    const el = strip.current;
    const card = el?.children[to] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    setIndex(to);
    // `keyList` is the dependency, not `keys`: the array is rebuilt on every
    // render and comparing it by identity would re-run this on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyList]);

  const goTo = (to: number) => {
    const el = strip.current;
    const at = Math.min(Math.max(to, 0), Math.max(count - 1, 0));
    /* A tap on a dot is the other deliberate move — see the note on `held`. */
    held.current = keysRef.current?.[at] ?? null;
    const card = el?.children[at] as HTMLElement | undefined;
    /* `block: 'nearest'` because the default is 'start', which would scroll
       the PAGE to put this strip at the top of the viewport — a tap on a dot
       is a sideways move and must not move the page under the reader. */
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  /*
   * ───────── AND A WAY THROUGH THAT IS NOT A SWIPE ─────────
   *
   * "שקיימים חצים או מנגנון מעבר חלופי."
   *
   * The dots were the only non-gesture control, and they are 10px marks whose
   * meaning has to be inferred. A thumb that will not swipe — a desktop
   * trackpad, a screen reader's caret, a hand holding a phone one-handed, or
   * simply a person who does not know the strip moves — had nothing to press.
   *
   * RTL IS WHY THE ARROWS ARE NOT LABELLED BY DIRECTION. On this page "the
   * next card" is to the LEFT, so an arrow called "ימינה" would move the strip
   * the other way. They are "הסבב הקודם" and "הסבב הבא", and the glyph is
   * flipped by the same `rtl:` variant the rest of the product uses.
   */
  const step = (delta: number) => goTo(index + delta);

  return (
    <div>
      <div
        ref={strip}
        onScroll={sync}
        role={count > 1 ? 'group' : undefined}
        aria-label={count > 1 ? label : undefined}
        /*
         * `-mx-1 px-1` gives the first and last card's focus ring and shadow
         * room without the strip inheriting that as dead space at either end —
         * the same trick QuickCommentsCard uses, and `-my-1 py-1` does it for
         * the card's own shadow, which an overflow container clips on BOTH
         * axes even though only one of them scrolls.
         *
         * `overscroll-x-contain` stops a swipe past the last card from being
         * handed to the browser as a back gesture.
         *
         * The scrollbar is hidden because this is a phone gesture and a grey
         * bar under a card reads as a layout fault; the dots below are what
         * says there is more, and they say it better.
         */
        className="-mx-1 -my-1 flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, i) => (
          <div
            key={keys?.[i] ?? i}
            /* `w-full shrink-0` is what makes it one card per view: the flex
               item takes the strip's whole width and refuses to be squeezed,
               so the next one begins exactly one screen along. */
            className="w-full shrink-0 snap-center"
            aria-label={count > 1 ? itemLabel(i + 1, count) : undefined}
            role={count > 1 ? 'group' : undefined}
          >
            {child}
          </div>
        ))}
      </div>

      {/* ─── the dots, the arrows and the count ──────────────────────────── */}
      {count > 1 && (
        <div className="mt-2 flex items-center justify-center gap-0.5">
          <ArrowButton
            label="הסבב הקודם"
            onClick={() => step(-1)}
            disabled={index === 0}
            /* Points at the START of the line, which on an RTL page is the
               right — `rotate-180` on the chevron, not a second icon. */
            back
          />
          {children.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={itemLabel(i + 1, count)}
              aria-current={i === index ? 'true' : undefined}
              /* A 10px dot is not a tap target, so the BUTTON is 40×24 and the
                 dot is what it paints — the same split the day chips use. */
              /*
                THE RING IS BACK. `focus-visible:outline-none` cancelled the
                global `:focus-visible` rule in globals.css and nothing
                replaced it, so the only non-gesture control in this component
                was invisible to a keyboard: tabbing through the dashboard
                moved focus into the strip with nothing on screen saying so.
                The outline is drawn on the BUTTON — the 40×24 target — rather
                than on the 10px mark it paints, so it is a ring somebody can
                actually see.
              */
              className="group flex h-10 w-6 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-300"
            >
              <span
                className={`block rounded-full transition-all ${
                  i === index
                    ? /* brand-400 and not brand-300: this is the one mark that
                         says where you are, so it takes the step that reads as
                         a filled dot rather than a tint. */
                      'h-2 w-5 bg-brand-400'
                    : 'h-2 w-2 bg-ink-600 group-hover:bg-brand-300'
                }`}
              />
            </button>
          ))}
          {/*
            "1 / 3" — THE POSITION AS A NUMBER, beside the dots.
            "תוסיף אינדיקטור מיקום (1/2)."

            The dots already carried the position, but only to a screen reader:
            `itemLabel` is an aria-label and `aria-current` is invisible, so on
            the screen the position was three identical pills and one longer
            one — readable at three, guesswork at eight, and no answer at all
            to "how many are there". The figure says both at a glance.

            `aria-hidden`, deliberately: every dot beside it is a button whose
            accessible name is already "סבב 2 מתוך 3", and a screen reader
            reading the fraction as well would announce the same fact twice.

            `dir="ltr"` because "1 / 3" is digits around a neutral slash, which
            an RTL line reorders into "3 / 1"; `tabular-nums` so the strip does
            not shift by a pixel when the figure goes from 1 to 2.
          */}
          <p
            data-swiper-position
            aria-hidden
            dir="ltr"
            className="mx-1.5 shrink-0 text-[12px] font-extrabold leading-4 tabular-nums text-mist-300"
          >
            {index + 1} / {count}
          </p>
          <ArrowButton label="הסבב הבא" onClick={() => step(1)} disabled={index === count - 1} />
        </div>
      )}
    </div>
  );
}
