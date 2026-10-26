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
        className={`grid h-7 w-13 place-items-center rounded-full transition-[background-color,transform] duration-200 ${
          active ? 'scale-105 bg-brand-500/10' : ''
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

  return (
    <CrmChrome title={title} headerAction={headerAction} pathname={pathname}>
      {children}
    </CrmChrome>
  );
}

/**
 * THE CHROME ITSELF — header, page, tab bar — with no session and no router.
 *
 * Split out of CrmShell so it can be RENDERED BY A TEST. The shell above
 * returns a spinner until Supabase answers, and a harness has no Supabase;
 * every attempt to measure this bar therefore measured a spinner, which is
 * why the CRM reached the owner's phone with the one safe-area mistake
 * /social had already been fixed for.
 *
 * It is a pure move: the same elements, the same classes, the same order.
 * The two things it used to read off the closure — the current path and
 * nothing else — arrive as a prop.
 */
export function CrmChrome({
  title,
  headerAction,
  pathname,
  children,
}: {
  title: string;
  headerAction?: React.ReactNode;
  pathname: string | null;
  children: React.ReactNode;
}) {
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : Boolean(pathname?.startsWith(href));

  // Detail screens (a lead, the forms, campaign optimization) push in from
  // the side like an iOS navigation stack; tab screens crossfade in place.
  const isDeep = Boolean(
    pathname && (/^\/crm\/leads\/.+/.test(pathname) || pathname.startsWith('/crm/ads/optimize')),
  );

  return (
    /*
     * ─── THE BOTTOM INSET COMES FROM THE PRODUCT'S ONE NUMBER ─────────────
     *
     * `var(--safe-b)` (globals.css) and not `env(safe-area-inset-bottom)`
     * directly. The raw value is the home indicator's 34px strip, and
     * reserving it is right ONLY in an installed app. In a Safari TAB iOS
     * keeps reporting it while the browser's own toolbar is already sitting
     * in that exact strip — so a bar that pads itself by it floats about a
     * centimetre above the bottom of the screen, which is what the owner
     * photographed. /social hit this, the token is the fix it was given, and
     * the CRM simply never adopted it.
     *
     * NOTHING CHANGES ON A PHONE WITHOUT INSETS. The token is
     * `min(env(safe-area-inset-bottom), 0.625rem)` in a tab and the full
     * inset in a standalone app; on a device that reports no inset both are
     * zero, so an Android or an older iPhone renders byte-identically.
     */
    /*
     * ─── AND THE PUSH ANIMATION MAY NOT MAKE THE PAGE SCROLLABLE SIDEWAYS ──
     *
     * `.crm-page-push` (globals.css) is the iOS-style slide every detail
     * screen enters with: `translateX(-30px)` settling to none over 300ms.
     * A translated child still counts towards the document's scroll width,
     * so for those 300ms the page is 30px wider than the screen — and a
     * phone does not treat that as a detail. iOS lets the whole page be
     * dragged sideways, and once it has been it stays offset: in an RTL
     * layout that pulls the start of every line — "ליד חדש", "שם הלקוח",
     * "כתובת מלאה" — off the right edge.
     *
     * `/crm/leads/new` is a detail screen, so this is the screen the owner
     * photographed with its labels cut off.
     *
     * `clip` and not `hidden`: hidden would make this element a scroll
     * container, and the header inside it is `sticky top-0` against the
     * viewport. clip trims the overflow without creating one.
     */
    <div className="mx-auto min-h-dvh max-w-3xl overflow-x-clip bg-ink-950 pb-[calc(7.5rem+var(--safe-b))]">
      {/* Water-gradient header — the CRM's one loud brand surface. The
          safe-area padding stretches the gradient up under the iPhone's
          status bar (clock/battery) so the title starts below it. */}
      {/* `max(..., 2px)` like /social's header: a hairline of breathing room
          on a device that reports no top inset at all, so the title never
          sits flush against the very first pixel of the screen. On an iPhone
          with a notch or a Dynamic Island the inset is far larger and wins,
          which is what stretches the gradient up under the clock. */}
      <header className="sticky top-0 z-40 bg-gradient-to-l from-sky-700 via-sky-500 to-cyan-400 pt-[max(env(safe-area-inset-top),2px)] shadow-md shadow-sky-900/25">
        <div className="flex items-center justify-between px-4 pb-2.5 pt-3">
          <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow-sm">{title}</h1>
          {headerAction}
        </div>
      </header>

      <div className={`crm-page ${isDeep ? 'crm-page-push' : ''} px-4 py-5`}>{children}</div>

      <nav
        aria-label="ניווט ראשי"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/70 bg-ink-850/85 pb-[var(--safe-b)] shadow-[0_-6px_24px_rgba(13,38,76,0.1)] backdrop-blur-xl"
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
              className="-mt-7 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-600/40 ring-4 ring-ink-850 transition-[transform,box-shadow] duration-200 hover:scale-105 active:scale-90 active:shadow-md active:shadow-sky-600/30"
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
