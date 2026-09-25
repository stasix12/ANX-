'use client';

import { useEffect, useState } from 'react';
import { CloseIcon, ShareIcon } from '@/components/icons';
import { Button } from './ui';

/**
 * "Put this on the home screen."
 *
 * The app is a full PWA already — manifest, icons, `display: standalone` —
 * so installed it opens with no address bar, no reload button and no browser
 * chrome at all: the tab bar ends at the bottom of the screen exactly as a
 * native app's does. Nothing was missing except anybody saying so. Safari
 * offers no install prompt of its own and buries the action two taps deep,
 * so the owner had a browser bar under their product and no way to know it
 * was optional.
 *
 * Three states, and two of them show nothing:
 * - Already installed (display-mode: standalone, or iOS's own flag) — the
 *   thing this asks for has happened.
 * - Dismissed on this device. Per-device, in localStorage, like the bell's
 *   seen-marker: a convenience, so a blocked store just means it asks again.
 * - Otherwise: Chrome hands us a real install event and we show a button;
 *   iOS hands us nothing and we show the two taps, naming the button that is
 *   actually on their screen.
 */
const DISMISSED = 'social:install:dismissed';

/** The Chromium install event. Not in lib.dom, so the shape is stated here. */
type InstallEvent = Event & { prompt: () => Promise<void> };

export function InstallPrompt() {
  const [mode, setMode] = useState<'none' | 'ios' | 'button'>('none');
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const installed =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed) return;

    try {
      if (localStorage.getItem(DISMISSED)) return;
    } catch {
      /* private mode — it asks again, which is the harmless direction */
    }

    const onPrompt = (e: Event) => {
      // Keep the event: calling prompt() later is the only way to open the
      // real install dialog, and Chrome fires this once.
      e.preventDefault();
      setEvent(e as InstallEvent);
      setMode('button');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    /*
     * iOS never fires that event and never will, so the iPhone case is
     * decided by the user agent — the one thing that identifies it. It only
     * chooses which SENTENCE to show; nothing about the app depends on it.
     */
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) setMode('ios');

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (mode === 'none') return null;

  const close = () => {
    setMode('none');
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      /* nothing to remember it with; it will offer again next time */
    }
  };

  return (
    <div className="surface relative mb-4 rounded-card border border-ink-700 p-3">
      <div className="flex items-start gap-3 pe-8">
        {/* The app's own mark, so "this" is unmistakably the thing being
            installed rather than a generic browser notice. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/social/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="text-sm font-extrabold leading-snug text-mist-100">התקינו את האפליקציה על המסך</p>
          {mode === 'ios' ? (
            <>
              {/*
                Numbered, and naming what is on the screen at each step.
                "Add to Home Screen" is NOT in Safari's ··· menu — that menu
                offers bookmarks and tabs — it is inside the SHARE sheet, below
                the row of apps, and the owner has to scroll a grey list to
                reach it. An instruction that stops at "···" leaves them
                looking at a menu that does not contain the thing.
              */}
              <ol className="mt-1 space-y-0.5 text-[13px] leading-relaxed text-mist-300">
                <li>
                  <span className="font-extrabold text-mist-100">1.</span> הקישו על{' '}
                  <strong className="font-extrabold text-mist-100">···</strong> בסרגל של ספארי למטה.
                </li>
                <li>
                  <span className="font-extrabold text-mist-100">2.</span> בחרו{' '}
                  <span className="inline-flex items-center gap-1 align-middle font-extrabold text-mist-100">
                    <ShareIcon aria-hidden className="h-4 w-4" />
                    שיתוף
                  </span>
                  .
                </li>
                <li>
                  <span className="font-extrabold text-mist-100">3.</span> גללו למטה ברשימה ובחרו{' '}
                  <strong className="font-extrabold text-mist-100">«הוסף למסך הבית»</strong>.
                </li>
              </ol>
              <p className="mt-1.5 text-[13px] leading-relaxed text-mist-500">
                אחר כך פתחו אותה מהמסך הראשי — בלי שורת הכתובת ובלי כפתורי הדפדפן, על כל המסך.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-[13px] leading-relaxed text-mist-300">
                תיפתח על כל המסך, בלי שורת הכתובת ובלי כפתורי הדפדפן.
              </p>
              <Button
                size="sm"
                className="mt-2"
                onClick={async () => {
                  if (!event) return;
                  await event.prompt();
                  close();
                }}
              >
                התקן עכשיו
              </Button>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label="סגור"
        onClick={close}
        className="absolute end-1 top-1 grid h-11 w-11 place-items-center rounded-full text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-100"
      >
        <CloseIcon className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}
