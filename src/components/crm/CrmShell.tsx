'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  CalendarIcon,
  ChartIcon,
  HomeIcon,
  MegaphoneIcon,
  PlusIcon,
  SpinnerIcon,
  UsersIcon,
} from '@/components/icons';
import { useAdminSession } from '@/lib/adminAuth';

const navStart = [
  { href: '/crm', label: 'ראשי', icon: HomeIcon, exact: true },
  { href: '/crm/calendar', label: 'יומן', icon: CalendarIcon, exact: false },
];

const navEnd = [
  { href: '/crm/leads', label: 'לקוחות', icon: UsersIcon, exact: false },
  { href: '/crm/ads', label: 'פרסום', icon: MegaphoneIcon, exact: false },
  { href: '/crm/stats', label: 'נתונים', icon: ChartIcon, exact: false },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-bold transition-colors ${
        active ? 'text-brand-400' : 'text-mist-500'
      }`}
    >
      {/* The active tab's icon sits in a soft tinted pill — a clear state
          without shouting. */}
      <span
        className={`grid h-7 w-13 place-items-center rounded-full transition-colors ${
          active ? 'bg-brand-500/10' : ''
        }`}
      >
        <Icon className="h-5.5 w-5.5" />
      </span>
      {label}
    </Link>
  );
}

/**
 * Wraps every screen under /crm except the login page. Redirects to
 * /crm/login the moment there is no session — a UX convenience only, like
 * the store's AdminShell: Row Level Security on the leads table is what
 * actually keeps the data private (see supabase/crm-schema.sql).
 */
export function CrmShell({
  title,
  headerAction,
  children,
}: {
  title: string;
  /** Optional element rendered at the header's far edge (e.g. a logout button). */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { session, loading } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace('/crm/login');
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950">
        <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : Boolean(pathname?.startsWith(href));

  return (
    <div className="mx-auto min-h-dvh max-w-3xl bg-ink-950 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      {/* Water-gradient header — the CRM's one loud brand surface. The
          safe-area padding stretches the gradient up under the iPhone's
          status bar (clock/battery) so the title starts below it. */}
      <header className="sticky top-0 z-40 bg-gradient-to-l from-sky-700 via-sky-500 to-cyan-400 pt-[env(safe-area-inset-top)] shadow-md shadow-sky-900/25">
        <div className="flex items-center justify-between px-4 pb-3.5 pt-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-white drop-shadow-sm">{title}</h1>
          {headerAction}
        </div>
      </header>

      <div className="crm-page px-4 py-5">{children}</div>

      <nav
        aria-label="ניווט ראשי"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/70 bg-ink-850/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(13,38,76,0.1)] backdrop-blur-xl"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {navStart.map((item) => (
            <li key={item.href} className="flex flex-1">
              <NavLink {...item} active={isActive(item.href, item.exact)} />
            </li>
          ))}
          <li className="flex flex-1 items-center justify-center">
            <Link
              href="/crm/leads/new"
              aria-label="ליד חדש"
              className="-mt-7 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-600/40 ring-4 ring-ink-850 transition-transform hover:scale-105"
            >
              <PlusIcon className="h-7 w-7" strokeWidth={2.4} />
            </Link>
          </li>
          {navEnd.map((item) => (
            <li key={item.href} className="flex flex-1">
              <NavLink {...item} active={isActive(item.href, item.exact)} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
