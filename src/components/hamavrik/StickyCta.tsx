'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PhoneLink, WaLink } from '@/components/hamavrik/CtaLinks';
import { PhoneIcon, WhatsAppIcon } from '@/components/icons';
import { waAskForPath, waLink } from '@/lib/hamavrik/links';

/**
 * Mobile: a slim fixed bar – WhatsApp takes the wider cell, the call button
 * the narrower one – sitting inside the iPhone safe area. The page wrapper
 * reserves matching bottom padding so nothing (FAQ, footer) hides under it.
 * Desktop: one floating WhatsApp button that grows a label on hover.
 *
 * On a phone the bar waits until the hero's own buttons have scrolled away.
 * At 375×553 – the usable height of Safari on an iPhone SE – it was covering
 * the hero's WhatsApp button, which is to say the bar meant to catch the
 * conversion was sitting on top of it. It slides, never unmounts, so the
 * reserved padding never moves and CLS stays where it is (0.0019).
 */
export function StickyCta() {
  const message = waAskForPath(usePathname());
  const [show, setShow] = useState(false);

  useEffect(() => {
    const heroCta = document.getElementById('hero-cta');
    if (!heroCta) {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { threshold: 0 });
    io.observe(heroCta);
    /* Belt and braces: a bar that never comes back is far worse than a bar
       that clips 12px, so a plain scroll check backs the observer up. */
    const onScroll = () => {
      if (window.scrollY > window.innerHeight) setShow(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <>
      <div
        aria-hidden={!show}
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-ink-800 bg-white/95 px-3 pt-2 backdrop-blur-lg transition-transform duration-200 sm:hidden ${
          show ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
      >
        <div className="grid grid-cols-[1.45fr_1fr] gap-2">
          <WaLink
            href={waLink(message)}
            location="sticky-mobile"
            className="shine-pulse flex h-11 items-center justify-center gap-2 rounded-full bg-wa-600 text-[15px] font-extrabold text-white"
          >
            <WhatsAppIcon className="h-5 w-5" />
            שלחו תמונה, קבלו מחיר
          </WaLink>
          <PhoneLink
            location="sticky-mobile"
            className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-brand-500 text-[15px] font-extrabold text-white"
          >
            <PhoneIcon className="h-4.5 w-4.5" />
            התקשרו
          </PhoneLink>
        </div>
      </div>

      <WaLink
        href={waLink(message)}
        location="floating-desktop"
        aria-label="שליחת תמונה ב‑WhatsApp לקבלת מחיר"
        className="shine-pulse group fixed bottom-6 left-6 z-50 hidden h-14 items-center gap-3 rounded-full bg-wa-600 pe-4 ps-3.5 text-white shadow-xl shadow-wa-600/40 transition-colors hover:bg-wa-500 sm:flex"
      >
        <WhatsAppIcon className="h-7 w-7" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-base font-extrabold opacity-0 transition-all duration-300 group-hover:max-w-xs group-hover:opacity-100">
          שלחו תמונה, קבלו מחיר
        </span>
      </WaLink>
    </>
  );
}
