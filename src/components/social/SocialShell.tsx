'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarIcon,
  ClipboardListIcon,
  GearIcon,
  HomeIcon,
  MenuIcon,
  MegaphoneIcon,
  SpinnerIcon,
  TargetIcon,
  UsersIcon,
} from '@/components/icons';
import { useAdminSession } from '@/lib/adminAuth';
import { NotificationBell } from './NotificationBell';
import { Sheet } from './ui';

const nav = [
  { href: '/social', label: 'ראשי', icon: HomeIcon, exact: true },
  { href: '/social/campaigns', label: 'קמפיינים', icon: MegaphoneIcon, exact: false },
  { href: '/social/groups', label: 'קבוצות', icon: UsersIcon, exact: false },
  { href: '/social/history', label: 'היסטוריה', icon: CalendarIcon, exact: false },
  { href: '/social/posts', label: 'פוסטים', icon: ClipboardListIcon, exact: false },
  { href: '/social/targets', label: 'דפי פייסבוק', icon: TargetIcon, exact: false },
  { href: '/social/settings', label: 'הגדרות', icon: GearIcon, exact: false },
];

/**
 * Four tabs plus "עוד". Five is where a thumb still lands accurately on a
 * phone; the rest of the product is one tap deeper rather than crammed in.
 */
const MOBILE_TABS = ['/social', '/social/campaigns', '/social/groups', '/social/history'];

/**
 * Frame for every /social screen: the same Supabase session as the CRM
 * (RLS is the real gate — this redirect is only UX), a header and a
 * horizontal tab bar that fits a phone yet reads as a toolbar on desktop.
 */
export function SocialShell({
  title,
  subtitle,
  headerAction,
  children,
}: {
  title: string;
  /** Replaces the fixed product line above the title, for a screen that wants to greet. */
  subtitle?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { session, loading } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // A tap through the sheet navigates; make sure it never stays open behind
  // the new screen.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !session) router.replace(`/crm/login?next=${encodeURIComponent(pathname || '/social')}`);
  }, [loading, session, router, pathname]);

  if (loading || !session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950">
        <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const isActive = (href: string, exact: boolean) => (exact ? pathname === href : Boolean(pathname?.startsWith(href)));

  return (
    <div className="min-h-dvh bg-ink-950 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10">
      <header className="sticky top-0 z-40 bg-gradient-to-l from-indigo-700 via-blue-600 to-sky-500 pt-[env(safe-area-inset-top)] shadow-md shadow-blue-900/25">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-2 pt-3 md:pb-2">
          <div className="min-w-0">
            <p dir="auto" className="truncate text-[11px] font-bold uppercase tracking-wider text-white/70">
              {subtitle ?? 'הפתרון המבריק · פרסום'}
            </p>
            <h1 dir="auto" className="truncate text-xl font-extrabold tracking-tight text-white drop-shadow-sm">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerAction}
            <NotificationBell />
          </div>
        </div>
        {/* Desktop / tablet: pill toolbar under the title. Phones use the bottom bar below. */}
        <nav aria-label="ניווט פרסום" className="mx-auto hidden min-w-0 max-w-6xl overflow-x-auto px-2 [scrollbar-width:none] md:block">
          <ul className="flex min-w-max items-stretch gap-1 pb-1.5">
            {nav.map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                      active ? 'bg-white text-blue-700 shadow-sm' : 'text-white/85 hover:bg-white/15'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      {/*
        The structural net. Four separate bugs in this module were one long
        child widening a track and taking the whole page sideways with it, so
        the shell refuses to scroll horizontally at all: overflow-x-clip keeps
        the vertical axis visible (unlike `hidden`, which would turn this into
        a scroll container and break the sticky header), and min-w-0 lets the
        column shrink in the first place. Sheets are portalled to <body>, so
        nothing that must escape the page is clipped by this.
      */}
      <main className="crm-page mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">{children}</main>

      {/* Phone: iOS-style bottom tab bar, thumb-reachable. */}
      <nav
        aria-label="ניווט ראשי"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/70 bg-ink-850/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(13,38,76,0.1)] backdrop-blur-xl md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {nav
            .filter((n) => MOBILE_TABS.includes(n.href))
            .map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <li key={href} className="flex flex-1">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-bold transition-colors ${active ? 'text-brand-400' : 'text-mist-500'}`}
                  >
                    <span className={`grid h-7 w-13 place-items-center rounded-full transition-[background-color,transform] duration-200 ${active ? 'scale-105 bg-brand-500/10' : ''}`}>
                      <Icon className="h-5.5 w-5.5" />
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-bold transition-colors ${
                moreOpen || !MOBILE_TABS.some((h) => isActive(h, h === '/social')) ? 'text-brand-400' : 'text-mist-500'
              }`}
            >
              <span className="grid h-7 w-13 place-items-center rounded-full">
                <MenuIcon className="h-5.5 w-5.5" />
              </span>
              עוד
            </button>
          </li>
        </ul>
      </nav>

      {/* Overflow sheet: the screens that do not earn a permanent tab. */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="עוד">
        <ul className="pb-2">
          {nav
            .filter((n) => !MOBILE_TABS.includes(n.href))
            .map(({ href, label, icon: Icon, exact }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3.5 text-base font-bold ${
                    isActive(href, exact) ? 'bg-brand-500/10 text-brand-400' : 'text-mist-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              </li>
            ))}
          <li>
            <Link
              href="/social/posts/new"
              onClick={() => setMoreOpen(false)}
              className="mt-1 flex items-center gap-3 rounded-xl bg-brand-500/10 px-3 py-3.5 text-base font-bold text-brand-400"
            >
              <ClipboardListIcon className="h-5 w-5" />
              פוסט חדש
            </Link>
          </li>
        </ul>
        {/* Which build the phone is actually running. Two taps from any screen:
            if this does not change after a deploy, the browser is serving a
            cached copy and a refresh is what is needed — not another fix. */}
        <p className="pb-2 text-center text-[11px] text-mist-500">
          גרסת המערכת: <span dir="ltr" className="font-mono">{process.env.NEXT_PUBLIC_BUILD_STAMP || '—'}</span>
        </p>
      </Sheet>
    </div>
  );
}
