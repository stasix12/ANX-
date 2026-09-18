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

const nav = [
  { href: '/social', label: 'ראשי', icon: HomeIcon, exact: true, mobile: true },
  { href: '/social/posts', label: 'פוסטים', icon: ClipboardListIcon, exact: false, mobile: true },
  { href: '/social/campaigns', label: 'קמפיינים', icon: MegaphoneIcon, exact: false, mobile: false },
  { href: '/social/groups', label: 'קבוצות', icon: UsersIcon, exact: false, mobile: true },
  { href: '/social/targets', label: 'דפים', icon: TargetIcon, exact: false, mobile: false },
  { href: '/social/history', label: 'היסטוריה', icon: CalendarIcon, exact: false, mobile: true },
  { href: '/social/settings', label: 'הגדרות', icon: GearIcon, exact: false, mobile: false },
];

/** What the phone's bottom bar shows; everything else lives behind "עוד". */
const MOBILE_TABS = ['/social', '/social/posts', '/social/groups', '/social/history'];

/**
 * Frame for every /social screen: the same Supabase session as the CRM
 * (RLS is the real gate — this redirect is only UX), a header and a
 * horizontal tab bar that fits a phone yet reads as a toolbar on desktop.
 */
export function SocialShell({
  title,
  headerAction,
  children,
}: {
  title: string;
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
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">הפתרון המבריק · פרסום</p>
            <h1 className="truncate text-xl font-extrabold tracking-tight text-white drop-shadow-sm">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerAction}
            <NotificationBell />
          </div>
        </div>
        {/* Desktop / tablet: pill toolbar under the title. Phones use the bottom bar below. */}
        <nav aria-label="ניווט פרסום" className="mx-auto hidden max-w-6xl overflow-x-auto px-2 [scrollbar-width:none] md:block">
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
      <main className="crm-page mx-auto max-w-6xl px-4 py-5">{children}</main>

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
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="תפריט">
          <button type="button" aria-label="סגור" className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-ink-850 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl">
            <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink-600" />
            <ul className="px-3 pb-2">
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
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
