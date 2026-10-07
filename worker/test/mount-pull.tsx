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
        {/* Tall enough that the document really scrolls — without this the
            "only at the very top" rule has nothing to be true about. */}
        <div style={{ height: 2400 }} />
        {/*
          THE BOTTOM BAR, carried exactly as SocialShell carries it: `fixed`,
          inside the children of this component. It is here because it stopped
          being fixed — a transform on an ancestor makes it the containing
          block for fixed descendants, and the wrapper used to carry one at all
          times. Without a fixed element in this harness the regression was
          invisible to every assertion in the suite.
        */}
        <nav
          data-bar
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 56, background: '#fff', borderTop: '1px solid #ddd' }}
        >
          ניווט
        </nav>
      </div>
    </PullToRefresh>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
