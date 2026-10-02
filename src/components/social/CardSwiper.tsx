'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
export function CardSwiper({
  label,
  itemLabel,
  children,
}: {
  /** Names the strip for a screen reader: "הסבבים הפעילים". */
  label: string;
  /** Names one slide, given its 1-based position: `(i, n) => …`. */
  itemLabel: (position: number, total: number) => string;
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
    setIndex((prev) => (prev === at ? prev : Math.min(Math.max(at, 0), Math.max(count - 1, 0))));
  }, [count]);

  /* A run can finish, or a new one can start, between two polls. An index left
     pointing past the end would highlight a dot that is not there. */
  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(count - 1, 0));
  }, [count, index]);

  const goTo = (to: number) => {
    const el = strip.current;
    const card = el?.children[to] as HTMLElement | undefined;
    /* `block: 'nearest'` because the default is 'start', which would scroll
       the PAGE to put this strip at the top of the viewport — a tap on a dot
       is a sideways move and must not move the page under the reader. */
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

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
            key={i}
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

      {/* ─── the dots: how many there are, and where this one sits ───────── */}
      {count > 1 && (
        <div className="mt-2 flex items-center justify-center gap-0.5">
          {children.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={itemLabel(i + 1, count)}
              aria-current={i === index ? 'true' : undefined}
              /* A 10px dot is not a tap target, so the BUTTON is 40×24 and the
                 dot is what it paints — the same split the day chips use. */
              className="group flex h-10 w-6 items-center justify-center focus-visible:outline-none"
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
        </div>
      )}
    </div>
  );
}
