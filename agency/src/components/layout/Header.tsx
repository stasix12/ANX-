'use client';

import { useEffect, useRef, useState } from 'react';
import { site } from '@/config/site';
import { nav } from '@/content/copy';
import { cn } from '@/lib/cn';
import { navLinks } from '@/lib/navLinks';
import { hasWhatsApp } from '@/lib/whatsapp';
import { CtaLink } from '@/components/ui/CtaLink';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { MenuIcon, WhatsAppIcon } from '@/components/ui/icons';
import { Logo } from '@/components/layout/Logo';

/**
 * Sticky header: gains a surface and a hairline after 24px of scroll and is
 * transparent over the hero. Rendered opaque on the server so deep links to
 * light sections never show an invisible wordmark before hydration. Mobile
 * navigation is a native <dialog> (focus trap, Escape, inert background).
 */
export function Header() {
  const [scrolled, setScrolled] = useState(true);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      firstLinkRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
    document.documentElement.toggleAttribute('data-menu-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.removeAttribute('data-menu-open');
    };
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      setOpen(false);
      toggleRef.current?.focus();
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  const close = () => setOpen(false);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-[background-color,border-color] duration-200',
        scrolled
          ? 'border-b border-border bg-surface-1/90 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="container-site flex h-16 items-center justify-between gap-6 lg:h-[72px]">
        <Logo />

        <nav aria-label="ניווט ראשי" className="hidden items-center gap-7 lg:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={`/${link.href}`} className="nav-link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {hasWhatsApp ? (
            <WhatsAppLink location="header" className="btn btn-outline min-h-12 px-4">
              <WhatsAppIcon className="h-[18px] w-[18px] text-whatsapp" />
              {nav.whatsapp}
            </WhatsAppLink>
          ) : null}
          <CtaLink location="header" label={nav.cta} className="btn btn-primary min-h-12 px-5">
            {nav.cta}
          </CtaLink>
        </div>

        <button
          ref={toggleRef}
          type="button"
          className="-me-2 flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] text-fg lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? nav.menuClose : nav.menuOpen}
          onClick={() => setOpen((v) => !v)}
        >
          <MenuIcon open={open} className="h-6 w-6" />
        </button>
      </div>

      <dialog
        ref={dialogRef}
        id="mobile-menu"
        aria-label="תפריט"
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-base p-0 text-fg backdrop:bg-transparent lg:hidden"
        dir="rtl"
      >
        <div className="flex h-full flex-col">
          <div className="container-site flex h-16 items-center justify-between">
            <Logo onClick={close} />
            <button
              type="button"
              className="-me-2 flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)]"
              aria-label={nav.menuClose}
              onClick={close}
            >
              <MenuIcon open className="h-6 w-6" />
            </button>
          </div>
          <nav aria-label="ניווט במובייל" className="container-site flex-1 overflow-y-auto pt-2">
            <ul>
              {navLinks.map((link, i) => (
                <li key={link.href} className="border-b border-border">
                  <a
                    ref={i === 0 ? firstLinkRef : undefined}
                    href={`/${link.href}`}
                    onClick={close}
                    className="flex min-h-14 items-center text-2xl font-semibold text-fg"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-8 grid gap-3 pb-8">
              <CtaLink location="mobile_menu" label={nav.mobileCta} className="btn btn-primary btn-lg btn-block">
                {nav.mobileCta}
              </CtaLink>
              {hasWhatsApp ? (
                <WhatsAppLink location="mobile_menu" className="btn btn-outline btn-lg btn-block">
                  <WhatsAppIcon className="h-5 w-5 text-whatsapp" />
                  {nav.mobileWhatsApp}
                </WhatsAppLink>
              ) : null}
              <p className="mt-2 text-center text-sm text-subtle">{site.tagline}</p>
            </div>
          </nav>
        </div>
      </dialog>
    </header>
  );
}
