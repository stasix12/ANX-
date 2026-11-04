'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/social/ui';

/**
 * WHAT THE PHONE ACTUALLY GIVES THE APP — the four numbers nobody can guess.
 *
 * THE CASE THIS EXISTS FOR. The owner sent a screenshot from the outer screen
 * of a folding phone: the app drawn down one side and a strip about a fifth of
 * the screen wide standing empty beside it, with the clock and the battery in
 * it. Two readings fit that picture and they have OPPOSITE fixes:
 *
 *   A. The page is given the whole screen (`viewport-fit: cover` is honoured),
 *      the strip is inside the layout viewport, and the app simply never puts
 *      an element there. Then the fix is CSS — the shell's own padding —
 *      and `env(safe-area-inset-right)` will read as a real number here.
 *   B. The page is given only the safe area, the strip is outside the layout
 *      viewport altogether, and the browser is painting it with the page's
 *      canvas colour. Then NO stylesheet in this repo can reclaim one pixel
 *      of it, and the inset below reads 0 while innerWidth is far smaller than
 *      screen.width.
 *
 * Guessing between them costs a release and reaches the wrong answer half the
 * time. Reading them costs one screenshot. So the numbers are put on screen,
 * in the one place the person who owns the device can see them.
 *
 * ADMIN ONLY, and that is the caller's job — this card carries no gate of its
 * own. It is mounted inside the settings screen's admin tab, which is already
 * behind the server's allowlist (loadAdminPresence), so a customer never sees
 * it. "ותוסיף רק אצלי, לא אצל הלקוחות."
 *
 * It reads and reports. It stores nothing, sends nothing, and changes nothing
 * about how any screen is laid out.
 */

interface Reading {
  /** The layout viewport — what every CSS length in the app is measured against. */
  inner: string;
  /** The physical screen as the OS reports it, in CSS pixels. */
  screen: string;
  /** The visual viewport, which differs from `inner` while a keyboard or a
      pinch-zoom is in effect. Printed so a reading taken mid-keyboard is
      recognisable as one rather than mistaken for the real width. */
  visual: string;
  dpr: string;
  /** The four safe-area insets, read off a real element rather than assumed. */
  top: string;
  right: string;
  bottom: string;
  left: string;
  /** standalone = installed on the home screen; browser = a tab. */
  mode: string;
}

const EMPTY: Reading = { inner: '—', screen: '—', visual: '—', dpr: '—', top: '—', right: '—', bottom: '—', left: '—', mode: '—' };

export function ScreenProbe() {
  const probe = useRef<HTMLDivElement | null>(null);
  /*
   * Starts empty and fills in an effect, never during render: every value
   * below comes from `window`, and reading one while the server renders this
   * component would be a hydration mismatch on the first paint.
   */
  const [now, setNow] = useState<Reading>(EMPTY);

  const measure = useCallback(() => {
    const el = probe.current;
    /*
     * THE INSETS ARE READ OFF AN ELEMENT, not computed. `env()` is only
     * resolvable by the engine, so the hidden div below declares all four as
     * padding and the resolved pixel values are read back out of it. An engine
     * that does not know `env()` at all leaves the padding at 0, which is the
     * honest answer for it.
     */
    const pad = el ? getComputedStyle(el) : null;
    const standalone =
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      /* iOS before the display-mode media query was supported puts the same
         fact on navigator, under a name TypeScript does not know. */
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setNow({
      inner: `${window.innerWidth} × ${window.innerHeight}`,
      screen: `${window.screen?.width ?? 0} × ${window.screen?.height ?? 0}`,
      visual: window.visualViewport ? `${Math.round(window.visualViewport.width)} × ${Math.round(window.visualViewport.height)}` : '—',
      dpr: String(window.devicePixelRatio ?? 1),
      top: pad?.paddingTop ?? '—',
      right: pad?.paddingRight ?? '—',
      bottom: pad?.paddingBottom ?? '—',
      left: pad?.paddingLeft ?? '—',
      mode: standalone ? 'standalone' : 'browser',
    });
  }, []);

  useEffect(() => {
    measure();
    /*
     * Folding the phone, turning it, and opening the keyboard all change these
     * numbers, and a reading that does not follow them is a photograph of a
     * state the person is no longer in. orientationchange fires before the new
     * size settles on some engines, so it is measured again a beat later.
     */
    const again = () => {
      measure();
      window.setTimeout(measure, 400);
    };
    window.addEventListener('resize', again);
    window.addEventListener('orientationchange', again);
    window.visualViewport?.addEventListener('resize', again);
    return () => {
      window.removeEventListener('resize', again);
      window.removeEventListener('orientationchange', again);
      window.visualViewport?.removeEventListener('resize', again);
    };
  }, [measure]);

  const rows: [string, string][] = [
    ['חלון התצוגה', now.inner],
    ['המסך כולו', now.screen],
    ['תצוגה נראית', now.visual],
    ['צפיפות פיקסלים', now.dpr],
    ['שוליים בטוחים — עליון', now.top],
    ['שוליים בטוחים — ימין', now.right],
    ['שוליים בטוחים — תחתון', now.bottom],
    ['שוליים בטוחים — שמאל', now.left],
    ['מצב', now.mode],
  ];

  return (
    <Card title="מה המסך הזה נותן לאפליקציה" subtitle="מתעדכן לבד כשמסובבים, מקפלים או פותחים מקלדת · צלמו ושלחו">
      {/*
        The probe itself. It has to be a laid-out element for the padding to
        resolve, so it is 1px and invisible rather than display:none.
      */}
      <div
        ref={probe}
        aria-hidden
        className="pointer-events-none absolute h-px w-px opacity-0"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      />
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5 [&>*]:min-w-0">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-baseline justify-between gap-2 rounded-xl border border-ink-700 px-2.5 py-1.5">
            <dt dir="auto" className="truncate text-[11px] font-bold leading-4 text-mist-500">{label}</dt>
            {/* ltr and tabular: these are numbers, and a number in an RTL box
                reads from the wrong end. */}
            <dd dir="ltr" className="shrink-0 font-mono text-[12px] font-bold leading-4 tabular-nums text-mist-100">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-[11px] leading-4 text-mist-500">
        אם ״חלון התצוגה״ כפול ״צפיפות פיקסלים״ קטן מ״המסך כולו״, הדפדפן לא נותן לאפליקציה את כל המסך — ואז אי אפשר לנצל את הפס הריק
        דרך העיצוב. אם הם שווים ו״שוליים בטוחים״ מראה מספר גדול מאפס, הפס הוא שלנו והעיצוב יכול לקחת אותו.
      </p>
    </Card>
  );
}
