/*
 * PULL-TO-REFRESH, MOUNTED SO IT CAN BE DRAGGED.
 *
 * "שאני גולל למעלה אני רוצה שזה יעשה ריסטרט לעמוד וגם יהיה סימון של עיגול
 *  טעינה למעלה."
 *
 * A gesture cannot be measured off a static render — it exists only while a
 * finger is moving — so this is the real component with React behind it and a
 * page tall enough to scroll, which is the one condition that decides whether
 * the pull is even allowed to arm.
 *
 * THE SIDEWAYS SWIPER IS HERE ON PURPOSE. The dashboard carries a horizontal
 * strip of campaign cards, and the failure that would make this feature worse
 * than nothing is a pull that eats those swipes. The strip below is real
 * enough to prove it: a gesture that drags it must leave the page alone.
 *
 * THE BOTTOM BAR IS IN HERE TWICE — once outside the component, where the
 * shell keeps it now, and once inside, where it used to be. The inside copy is
 * the control: it is what the bug looks like, measured on the same gesture.
 *
 * `window.__refreshes` counts the reloads the gesture asked for, and
 * `window.__resolve` holds the one in flight, so a test can inspect the
 * screen DURING a refresh rather than only after it.
 */
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PullToRefresh } from '@/components/social/PullToRefresh';

declare global {
  interface Window {
    __refreshes: number;
    __resolve: (() => void) | null;
    __swipes: number;
    __prevented: number;
  }
}
window.__refreshes = 0;
window.__resolve = null;
window.__swipes = 0;

function Harness() {
  const [n, setN] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  return (
    <>
      <PullToRefresh
        onRefresh={() =>
          new Promise<void>((resolve) => {
            window.__refreshes += 1;
            setN((v) => v + 1);
            /* Held open deliberately: the test releases it, so the spinning
               state can be looked at instead of raced against. */
            window.__resolve = () => resolve();
          })
        }
      >
        <div style={{ padding: 16 }}>
          <h1 data-loads={n}>לוח בקרה</h1>
          {/* The horizontal strip, with a real touch-scrollable overflow. */}
          <div
            ref={strip}
            data-strip
            onScroll={() => (window.__swipes += 1)}
            style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: 8 }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ minWidth: 300, height: 180, background: '#ede9fe', borderRadius: 16 }}>
                כרטיס {i}
              </div>
            ))}
          </div>
          {/*
            A VERTICAL LIST INSIDE THE PAGE — the queue card, in the shape that
            matters to this component.

            "תוסיף כאן אופציה של גלילה למעלה למטה בתוך החלון תורים לראות מה
             כבר פורסם ומה עומד להתפרסם."

            Scrolling that list BACK means dragging the finger DOWN, which is
            this component's own gesture; at the top of the page it would take
            it, preventDefault the move and reload the dashboard instead. So
            the list is here, scrolled off its own top, and the test drags
            inside it.
          */}
          <div
            data-list
            ref={(el) => {
              /* Off its own top, so it has something to give back — which is
                 the whole condition the component tests. */
              if (el && el.scrollTop === 0) el.scrollTop = 200;
            }}
            style={{ maxHeight: 300, overflowY: 'auto', overscrollBehavior: 'contain', marginTop: 12 }}
          >
            {Array.from({ length: 40 }, (_, i) => (
              <div key={i} style={{ height: 44, borderBottom: '1px solid #eee' }}>
                שורה {i}
              </div>
            ))}
          </div>
          {/* Tall enough that the document really scrolls — without this the
              "only at the very top" rule has nothing to be true about. */}
          <div style={{ height: 2400 }} />
          {/*
            THE CONTROL — THE SAME BAR, STILL INSIDE THE WRAPPER.
            This is where the shell used to carry the bottom bar, and a copy
            stays here on purpose: invisible, but with a real box a test can
            measure. It is the mutation. Every assertion about the bar OUTSIDE
            is worth nothing unless the inside one can be shown, in the same
            run and on the same gesture, to be off the bottom of the screen —
            a guard that cannot fail is not a guard.
          */}
          <nav
            data-bar-inside
            style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 56, visibility: 'hidden' }}
          >
            ניווט
          </nav>
        </div>
      </PullToRefresh>
      {/*
        THE BOTTOM BAR AS THE PRODUCT NOW CARRIES IT: a SIBLING of the wrapper,
        and no longer a descendant of it. `position: fixed` is measured against
        the viewport only while no ancestor is transformed, and this component
        transforms its wrapper for the length of every gesture — so a bar inside
        it is pinned to the PAGE, which is what he saw: "קופץ לאמצע ואז חוזר
        למטה". Out here there is no ancestor that can ever carry a transform.
      */}
      <nav
        data-bar
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 56, background: '#fff', borderTop: '1px solid #ddd' }}
      >
        ניווט
      </nav>
    </>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
