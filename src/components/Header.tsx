'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { CloseIcon, InstagramIcon, MenuIcon, TikTokIcon, WhatsAppIcon } from '@/components/icons';
import { generalWhatsappLink, site } from '@/lib/site';

const navLinks = [
  { href: '/#products', label: 'מוצרים' },
  { href: '/#why', label: 'למה ANX3D' },
  { href: '/#faq', label: 'שאלות נפוצות' },
  { href: '/#contact', label: 'צור קשר' },
];

const socials = [
  { href: site.instagram, label: 'ANX3D באינסטגרם', Icon: InstagramIcon },
  { href: site.tiktok, label: 'ANX3D בטיקטוק', Icon: TikTokIcon },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  // Any navigation closes the drawer, including in-page hash links.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock the page behind the open drawer and allow Escape to dismiss it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        scrolled || open
          ? 'border-ink-700 bg-ink-950/90 backdrop-blur-lg'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6">
        <Logo />

        <nav aria-label="ניווט ראשי" className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-4 py-2 text-[15px] font-medium text-mist-300 transition-colors duration-200 hover:bg-ink-800/70 hover:text-mist-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {socials.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="grid h-10 w-10 place-items-center rounded-xl border border-ink-700 text-mist-300 transition-colors duration-200 hover:border-brand-500 hover:text-brand-700"
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}

          <a
            href={generalWhatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-mist-100 transition-colors duration-200 hover:bg-[#1fbe5a] sm:inline-flex"
          >
            <WhatsAppIcon className="h-4 w-4" />
            <span>WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'סגירת התפריט' : 'פתיחת התפריט'}
            className="grid h-10 w-10 place-items-center rounded-xl border border-ink-700 text-mist-100 transition-colors duration-200 hover:border-brand-500 lg:hidden"
          >
            {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        hidden={!open}
        className="border-t border-ink-700 bg-ink-950/98 backdrop-blur-lg lg:hidden"
      >
        <nav aria-label="ניווט מובייל" className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <ul className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-xl px-4 py-3.5 text-base font-medium text-mist-100 transition-colors duration-200 hover:bg-ink-800"
                >
                  <span>{link.label}</span>
                  <span aria-hidden className="text-brand-600">
                    ←
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <a
            href={generalWhatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="mt-4 flex items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-5 py-3.5 text-base font-bold text-mist-100"
          >
            <WhatsAppIcon className="h-5 w-5 shrink-0" />
            <span>
              הזמנה בוואטסאפ ·{' '}
              <span dir="ltr" className="whitespace-nowrap">
                {site.phoneDisplay}
              </span>
            </span>
          </a>
        </nav>
      </div>
    </header>
  );
}
