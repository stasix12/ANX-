'use client';

import { useEffect, useRef, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';

/**
 * PULL DOWN AT THE TOP TO RELOAD THE SCREEN.
 *
 * "שאני גולל למעלה אני רוצה שזה יעשה ריסטרט לעמוד וגם יהיה סימון של עיגול
 *  טעינה למעלה."
 *
 * The one gesture every phone owner already knows, and the only one this app
 * was missing: the dashboard refreshes itself on a timer and after an action,
 * so the owner who wanted to KNOW it was current had no way to ask. Pulling
 * the page down is how that question is asked on a phone.
 *
 * IT RELOADS THE DATA, NOT THE DOCUMENT. `location.reload()` would be a white
 * flash, a second download of the app, and a lost scroll position — and it
 * would answer a question nobody asked, because what is stale is the numbers,
 * not the code. The screen's own loader runs, which is the same path every
 * other refresh on this page already takes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE FOUR THINGS THAT MAKE A PULL-TO-REFRESH GOOD OR UNUSABLE
 *
 * 1. IT MUST NOT STEAL A SIDEWAYS SWIPE. This dashboard has a horizontal strip
 *    of campaign cards, and a gesture that starts across is never a pull — so
 *    the first move of each touch DECIDES, once, which axis it belongs to, and
 *    a horizontal verdict is final for the rest of that touch. Without that
 *    the slight downward drift in every thumb swipe drags the page.
 *
 * 2. IT MUST ONLY ARM AT THE VERY TOP. Not "near" the top: a pull that engaged
 *    at scrollY 30 would fight the scroll the owner is actually doing.
 *
 * 3. IT MUST RESIST. A 1:1 follow feels broken — the page appears to come
 *    loose. Real ones move about half the finger's distance and stop, so the
 *    gesture has an end the thumb can feel before the eye reads anything.
 *
 * 4. preventDefault() ON THE MOVE, which is the whole reason the listeners are
 *    attached by hand instead of with React's props: React attaches touchmove
 *    passively, and a passive listener cannot stop iOS from rubber-banding the
 *    document out from under the indicator. It is called only after the
 *    gesture has been judged a pull, so ordinary scrolling is untouched.
 */

/** How far the finger must travel before releasing it means "refresh". */
const THRESHOLD = 64;
/** Where the indicator rests while the reload runs. */
const RESTING = 56;
/** The furthest it will go, however hard the pull. */
const MAX = 96;
/** Half the finger's distance: the resistance in point 3 above. */
const FRICTION = 0.5;

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /*
   * THE GESTURE'S STATE LIVES IN A REF, NOT IN STATE. touchmove fires on every
   * frame of a drag; a setState per field there would re-render the whole
   * dashboard dozens of times a second. Only `pull` — the one value that is
   * drawn — is state.
   */
  const g = useRef({ y: 0, x: 0, active: false, decided: false, pulling: false });
  /* So the handlers can read the live values without being re-created, which
     would mean removing and re-adding three listeners on every frame. */
  const busy = useRef(false);
  const run = useRef(onRefresh);
  run.current = onRefresh;

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    /*
     * A SHEET IS OPEN, so the body is locked and the thing under the finger is
     * not this page. Pulling the page behind a dialog is how a confirmation
     * gets dismissed by accident.
     */
    const blocked = () => document.body.style.overflow === 'hidden' || document.body.hasAttribute('data-scroll-locked');

    const start = (e: TouchEvent) => {
      if (busy.current || blocked() || e.touches.length !== 1 || !atTop()) {
        g.current.active = false;
        return;
      }
      g.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, active: true, decided: false, pulling: false };
    };

    const move = (e: TouchEvent) => {
      if (!g.current.active || busy.current) return;
      const dy = e.touches[0].clientY - g.current.y;
      const dx = e.touches[0].clientX - g.current.x;

      /* ONE DECISION PER TOUCH — point 1. Taken at the first move with enough
         travel to mean anything, and never revisited: a pull that re-judged
         itself mid-drag would hand the swiper a gesture already in progress. */
      if (!g.current.decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        g.current.decided = true;
        g.current.pulling = dy > 0 && Math.abs(dy) > Math.abs(dx);
        if (!g.current.pulling) {
          g.current.active = false;
          return;
        }
      }

      /* Scrolled away from the top mid-gesture (a fling that landed here):
         give the page back rather than holding it. */
      if (dy <= 0 || !atTop()) {
        setPull(0);
        g.current.active = false;
        return;
      }

      /* Point 4: only now, and only because this is a pull. */
      if (e.cancelable) e.preventDefault();
      setPull(Math.min(MAX, dy * FRICTION));
    };

    const end = () => {
      if (!g.current.active || busy.current) {
        setPull(0);
        return;
      }
      g.current.active = false;
      setPull((p) => {
        if (p < THRESHOLD) return 0;
        /*
         * COMMITTED. The flag is a ref and not the `refreshing` state because
         * the touch handlers read it, and a handler that waited for a render
         * would let a second pull start inside the first one's reload.
         */
        busy.current = true;
        setRefreshing(true);
        void Promise.resolve(run.current())
          .catch(() => undefined)
          .finally(() => {
            busy.current = false;
            setRefreshing(false);
            setPull(0);
          });
        return RESTING;
      });
    };

    window.addEventListener('touchstart', start, { passive: true });
    /* NOT passive — see point 4. */
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, []);

  const ready = pull >= THRESHOLD;
  const showing = pull > 0 || refreshing;

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * 5. AND IT MUST NOT UNPIN THE THINGS THAT ARE PINNED.
   *
   * THIS SHIPPED BROKEN AND HE FOUND IT: "הסרגל כלים למטה לא מקובע .. כמו שהיה
   * לפני." The bottom navigation bar had stopped being fixed to the screen and
   * scrolled away with the page.
   *
   * A `transform` on an element makes it the containing block for every
   * `position: fixed` DESCENDANT — and `translateY(0px)` is a transform. This
   * component wraps the entire shell (SocialShell's last line), so the wrapper
   * below was permanently transformed and the bar, the sheets and every other
   * fixed overlay inside it were being positioned against IT instead of
   * against the viewport. The file two directories up already carries two
   * comments about this exact trap with backdrop-filter. I walked into it with
   * transform.
   *
   * So the page is lifted ONLY while there is something to lift:
   *
   *   * AT REST the property is not written at all — not `none`, absent — and
   *     the subtree behaves exactly as it did before this component existed.
   *     That is the state the app is in except for a few hundred milliseconds
   *     a day, and it is the state he was looking at.
   *   * DURING THE RELOAD the page sits back down and only the circle stays
   *     out. The reload can take seconds on 4G, and a navigation bar pushed
   *     fifty-six pixels off the bottom of the screen for seconds is the bug
   *     again, briefly.
   *   * DURING THE DRAG ITSELF the page does move, and the bar moves with it.
   *     That is a few hundred milliseconds with a thumb on the glass, it reads
   *     as the page being pulled, and the alternative — animating `top`, which
   *     does not create a containing block — relays out the whole list on
   *     every frame of the gesture.
   */
  const lift = refreshing ? 0 : pull;

  return (
    <>
      {/*
        THE CIRCLE, AND IT COMES OUT FROM BEHIND THE HEADER.
        z-30 against the header's z-40, so it slides out of the bar rather than
        over it — which is what makes it read as the page being pulled down and
        not as something floating on top of it.

        `pointer-events-none`: it is a readout, never a target. A spinner that
        swallowed a tap would eat the first press after every refresh.
      */}
      <div
        aria-hidden={!showing}
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center"
        style={{
          transform: `translateY(${showing ? pull : 0}px)`,
          opacity: showing ? Math.min(1, pull / 32) : 0,
          /* Snapping back is animated; following the finger is not — a
             transition on the drag itself is what makes one feel laggy. */
          transition: g.current.active ? 'none' : 'transform 0.22s cubic-bezier(0.22,1,0.36,1), opacity 0.18s linear',
        }}
      >
        <span className="mt-[max(env(safe-area-inset-top),2px)] flex h-9 w-9 items-center justify-center rounded-full border border-ink-700 bg-ink-850 shadow-[0_4px_16px_rgba(46,16,101,0.12)]">
          <SpinnerIcon
            className={`h-5 w-5 text-brand-400 ${refreshing ? 'animate-spin' : ''}`}
            /* Before release the circle TURNS WITH THE FINGER, so the gesture
               has a progress bar nobody had to draw: at the threshold it has
               come round half a turn, which is the moment it also goes solid.
               Dropped under reduced motion, where the state change carries it
               instead. */
            style={refreshing ? undefined : { transform: `rotate(${Math.min(180, (pull / THRESHOLD) * 180)}deg)`, opacity: ready ? 1 : 0.55 }}
          />
        </span>
      </div>

      {/*
        AND THE PAGE MOVES WITH IT. Without this the circle appears over
        content that has not budged, which reads as an overlay rather than as
        the screen being pulled — and the gesture stops feeling like it is
        doing anything.
      */}
      <div
        style={{
          /* `undefined`, not 'none' and not translateY(0): the property has to
             be ABSENT, or the wrapper is still a containing block for every
             fixed child. Snapping back still animates — a transform list
             transitions to no-transform as to the identity. */
          transform: lift > 0 ? `translateY(${lift}px)` : undefined,
          transition: g.current.active ? 'none' : 'transform 0.22s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {children}
      </div>

      {/* Announced once, when it starts — "טוען" every frame of a drag would
          make a screen reader unusable. */}
      <span role="status" aria-live="polite" className="sr-only">
        {refreshing ? 'מרענן את העמוד' : ''}
      </span>
    </>
  );
}
