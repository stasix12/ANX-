'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  CalendarIcon,
  ClipboardListIcon,
  GearIcon,
  HomeIcon,
  MegaphoneIcon,
  SpinnerIcon,
  TargetIcon,
  UsersIcon,
} from '@/components/icons';
import { useAdminSession } from '@/lib/adminAuth';

const nav = [
  { href: '/social', label: 'ראשי', icon: HomeIcon, exact: true, mobile: true },
  { href: '/social/posts', label: 'פוסטים', icon: ClipboardListIcon, exact: false, mobile: true },
  { href: '/social/campaigns', label: 'קמפיינים', icon: MegaphoneIcon, exact: false, mobile: false },
  { href: '/social/groups', label: 'קבוצות', icon: UsersIcon, exact: false, mobile: true },
  { href: '/social/targets', label: 'דפים', icon: TargetIcon, exact: false, mobile: false },
  { href: '/social/history', label: 'היסטוריה', icon: CalendarIcon, exact: false, mobile: true },
  { href: '/social/settings', label: 'הגדרות', icon: GearIcon, exact: false, mobile: true },
];

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
          {headerAction}
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
            .filter((n) => n.mobile)
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
        </ul>
      </nav>
    </div>
  );
}
