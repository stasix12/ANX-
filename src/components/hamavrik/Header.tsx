'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PhoneButton, PhoneLink, WaButton } from '@/components/hamavrik/CtaLinks';
import { Logo } from '@/components/hamavrik/Logo';
import { MenuIcon } from '@/components/hamavrik/icons';
import { CloseIcon, PhoneIcon } from '@/components/icons';
import { business, nav } from '@/lib/hamavrik/config';
import { href, waLinkFor } from '@/lib/hamavrik/links';

/**
 * Sticky header. Desktop: logo · anchor nav · phone · "הצעת מחיר" CTA.
 * Mobile: logo · phone icon · menu — the menu opens a panel with the same
 * links and both CTAs, and closes on any navigation. Anchors are relative,
 * so on a city landing page they scroll within that page.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 bg-white/85 backdrop-blur-lg transition-shadow ${
        scrolled ? 'shadow-[0_1px_0_0_rgba(11,26,51,0.06),0_10px_30px_-18px_rgba(11,26,51,0.25)]' : ''
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[76px]">
        <Link href={href('/')} aria-label={`${business.name} — לעמוד הבית`} className="shrink-0 rounded-lg">
          <Logo />
        </Link>

        <nav aria-label="ניווט ראשי" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-full px-3.5 py-2 text-[15px] font-bold text-mist-300 transition-colors hover:bg-ink-900 hover:text-mist-100"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <PhoneButton location="header" variant="ghost">
            <span dir="ltr">{business.phoneDisplay}</span>
          </PhoneButton>
          <WaButton location="header" href={waLinkFor('(מהתפריט העליון)')}>
            הצעת מחיר
          </WaButton>
        </div>

        <div className="flex items-center gap-1.5 lg:hidden">
          <PhoneLink
            location="header-mobile"
            className="grid h-11 w-11 place-items-center rounded-full bg-brand-500 text-white shadow-md shadow-brand-500/25"
          >
            <PhoneIcon className="h-5 w-5" />
          </PhoneLink>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'סגירת התפריט' : 'פתיחת התפריט'}
            onClick={() => setOpen((v) => !v)}
            className="grid h-11 w-11 place-items-center rounded-full text-mist-100 transition-colors hover:bg-ink-900"
          >
            {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open ? (
        <div id="mobile-menu" className="border-t border-ink-800 bg-white shadow-xl lg:hidden">
          <nav aria-label="ניווט במובייל" className="mx-auto max-w-6xl px-4 py-3">
            <ul className="divide-y divide-ink-800">
              {nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block py-3.5 text-lg font-bold text-mist-100"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-2 pb-2">
              <WaButton location="mobile-menu" href={waLinkFor('(מהתפריט)')} size="lg" className="w-full">
                קבלו הצעת מחיר ב-WhatsApp
              </WaButton>
              <PhoneButton location="mobile-menu" size="lg" className="w-full" />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
