'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarIcon,
  ClipboardListIcon,
  GearIcon,
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  RepeatIcon,
  SparklesIcon,
  SpinnerIcon,
  TargetIcon,
  UsersIcon,
} from '@/components/icons';
import { signOut, useAdminSession } from '@/lib/adminAuth';
import { NotificationBell } from './NotificationBell';
import { PublishingToggle } from './PublishingToggle';
import { UpdateBanner } from './UpdateBanner';
import { Sheet, useConfirm } from './ui';

const nav = [
  { href: '/social', label: 'ראשי', icon: HomeIcon, exact: true },
  // A round of publications is a cycle, not an announcement: the megaphone
  // said "advertising" where the screen is about a repeating run.
  { href: '/social/campaigns', label: 'סבבים', icon: RepeatIcon, exact: false },
  { href: '/social/groups', label: 'קבוצות', icon: UsersIcon, exact: false },
  { href: '/social/history', label: 'היסטוריה', icon: CalendarIcon, exact: false },
  { href: '/social/library', label: 'ספרייה', icon: ClipboardListIcon, exact: false },
  { href: '/social/targets', label: 'דפי פייסבוק', icon: TargetIcon, exact: false },
  { href: '/social/settings', label: 'הגדרות', icon: GearIcon, exact: false },
];

/**
 * Four tabs plus "עוד". Five is where a thumb still lands accurately on a
 * phone; the rest of the product is one tap deeper rather than crammed in.
 */
const MOBILE_TABS = ['/social', '/social/campaigns', '/social/groups', '/social/library'];

/**
 * Frame for every /social screen: the same Supabase session as the CRM
 * (RLS is the real gate — this redirect is only UX), a header and a
 * horizontal tab bar that fits a phone yet reads as a toolbar on desktop.
 */
export function SocialShell({
  title,
  subtitle,
  lede,
  headerAction,
  hideTitle = false,
  paused,
  onControlChanged,
  children,
}: {
  title: string;
  /** Replaces the product line in the identity bar. */
  subtitle?: string;
  /** One line under the page title saying what this screen is for. */
  lede?: string;
  /** The screen's primary action, beside its title. */
  headerAction?: React.ReactNode;
  /**
   * Drops the page-title block and keeps the heading for screen readers only.
   *
   * The dashboard is the one screen where it earns nothing: "לוח בקרה" over
   * "סקירת הפעילות שלך היום" is 89px of the first 154px of a phone screen
   * telling the owner the name of the screen they just opened, above a
   * duplicate of a button the system card now carries. Every other screen
   * still shows its title, so this is a prop rather than a deletion.
   */
  hideTitle?: boolean;
  /**
   * The global pause state, when the screen already reads it.
   *
   * PublishingToggle polls getControl() every 20s of its own; the dashboard
   * reads the same row every 30s. Two reads of one fact on two clocks is the
   * defect class this module keeps fixing, one layer up — so a screen that
   * already holds the value hands it over, and gets told when the button
   * changes it.
   */
  paused?: boolean | null;
  onControlChanged?: () => void;
  children: React.ReactNode;
}) {
  const { session, loading } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const confirm = useConfirm();

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
        {/* brand-300, the indicator blue: brand-500 is the button surface and
            sits at 3.73 on this page. A spinner is a mark, not a label. */}
        <SpinnerIcon className="h-8 w-8 animate-spin text-brand-300" />
      </div>
    );
  }

  const isActive = (href: string, exact: boolean) => (exact ? pathname === href : Boolean(pathname?.startsWith(href)));
  /*
   * "עוד" is the active tab on six of the eleven routes (library, targets,
   * settings, posts/new, posts/[id], manual/[id]), and it used to show only
   * half the active state the four real tabs show — blue text, but no pill
   * behind the icon. So the bar looked like a different bar depending on
   * which screen you were on. One condition, read by both the text colour
   * and the pill.
   */
  const moreActive = moreOpen || !MOBILE_TABS.some((h) => isActive(h, h === '/social'));

  /*
   * The bottom reserve below is the tab bar's real height plus the inset, not
   * a round number. Measured from the classes on the <nav> at the foot of this
   * file: pt-2 (8) + the 28px icon puck + gap-0.5 (2) + an 11px label at
   * line-height 1.5 (16.5) + pb-1.5 (6) + the 1px top border = 61.5px, and the
   * inset is already padded inside the bar itself. 5.5rem (88px) reserved 26px
   * that nothing occupies, which is why the last card on every screen floated
   * well clear of the bar. 4.5rem is 61.5px of bar plus ~10px of air — and it
   * is the same constant the floating selection bars are anchored to, so the
   * bottom of the product is one number.
   */
  return (
    <div className="min-h-dvh bg-ink-950 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-10">
      {/*
        A quiet identity bar. The previous header was a full-width indigo-to-sky
        gradient carrying the screen title and a white pill button — a lot of
        colour and height spent on chrome, which is what made the product read
        as a template. The identity lives here; the screen's own title and its
        primary action belong to the page, where they can be sized against the
        content. On this palette the bar is the card surface at 90% behind a
        blur, so content scrolling under it stays sensed but never legible.
      */}
      {/* Above the header, so a stale page says so before anything else on it
          is read. Renders nothing when the build in front of the owner is the
          one that is deployed. */}
      <UpdateBanner />
      {/* max(inset, 2px), not a bare inset: the notification badge hangs 2px
          above its 44px button (NotificationBell's -top-0.5), so the row needs
          2px of something above it or the badge is clipped by the viewport on
          a phone with no notch, where the inset resolves to 0. Giving that
          2px to the header's own top padding — which the inset already owns —
          is what lets the row itself drop to zero padding. */}
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-850/90 pt-[max(env(safe-area-inset-top),2px)] backdrop-blur-xl">
        {/* No vertical padding at all: all three children of this row are
            pinned at the 44px touch floor (the home link, PublishingToggle
            and NotificationBell are each min-h-11), so every pixel of py was
            dead space around targets that were already tall enough. Measured
            below the safe area: the row is 44px and the header 45, against
            52/53 before — 15% shorter with no target touched. */}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4">
          {/* min-h-11: this measured 140x36 — the one sub-44px tap target in
              the header, and it is the link home. */}
          <Link href="/social" className="flex min-h-11 min-w-0 items-center gap-2.5">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-500 text-on-brand">
              <SparklesIcon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-extrabold leading-4 text-mist-100">הפתרון המבריק</span>
              <span dir="auto" className="block truncate text-[11px] leading-tight text-mist-500">
                {subtitle ?? 'פרסום חכם לקבוצות פייסבוק'}
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Stopping everything must be reachable from wherever you are when
                you realise you need to, not only from the dashboard. */}
            <PublishingToggle paused={paused} onChanged={onControlChanged} />
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
                    /*
                     * The active pill was brand-500 text on a brand-500 tint —
                     * 3.09 on this ground, and the one word on screen that
                     * says where you are. brand-400 on a brand-300 wash is
                     * 5.58, and the wash is the indicator blue because a pill
                     * behind a word is a fill, not a word.
                     */
                    className={`flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-850 ${
                      active ? 'bg-brand-300/12 text-brand-400' : 'text-mist-500 hover:bg-ink-800 hover:text-mist-100'
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
      <main className={`crm-page mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 ${hideTitle ? 'pb-5 pt-3' : 'py-5'}`}>
        {/* The screen's own title, sized against the content rather than
            squeezed into a coloured bar, with its primary action beside it.
            Hidden on the dashboard, where the first card carries the heading —
            but the document still needs an h1, so it becomes sr-only rather
            than disappearing from the heading tree. */}
        {hideTitle ? (
          <h1 className="sr-only">{title}</h1>
        ) : (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 dir="auto" className="truncate text-2xl font-extrabold leading-tight tracking-tight text-mist-100">
                {title}
              </h1>
              {lede && (
                <p dir="auto" className="mt-1 truncate text-sm leading-snug text-mist-500">
                  {lede}
                </p>
              )}
            </div>
            {headerAction && <div className="shrink-0">{headerAction}</div>}
          </div>
        )}
        {children}
      </main>

      {/* Phone: iOS-style bottom tab bar, thumb-reachable. */}
      <nav
        aria-label="ניווט ראשי"
        // The shadow was cast in rgba(13,38,76,…) — a navy shade built for a
        // white page, which on #071426 is nothing at all. On a dark ground the
        // bar has to lift off the content with a real black gradient.
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-850/92 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgba(0,0,0,0.5)] backdrop-blur-xl md:hidden"
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
                    className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 ${active ? 'text-brand-400' : 'text-mist-500'}`}
                  >
                    <span className={`grid h-7 w-13 place-items-center rounded-full transition-[background-color,transform] duration-200 ${active ? 'scale-105 bg-brand-300/12' : ''}`}>
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
              className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 ${
                moreActive ? 'text-brand-400' : 'text-mist-500'
              }`}
            >
              <span className={`grid h-7 w-13 place-items-center rounded-full transition-[background-color,transform] duration-200 ${moreActive ? 'scale-105 bg-brand-300/12' : ''}`}>
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
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-3.5 text-base font-bold ${
                    isActive(href, exact) ? 'bg-brand-300/12 text-brand-400' : 'text-mist-100 hover:bg-ink-900'
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
              className="mt-1 flex min-h-11 items-center gap-3 rounded-xl bg-brand-300/12 px-3 py-3.5 text-base font-bold text-brand-400"
            >
              <ClipboardListIcon className="h-5 w-5" />
              פוסט חדש
            </Link>
          </li>
        </ul>
        {/*
          The way out.
          
          There was none. signOut() exists in adminAuth and is called from
          /admin/settings and /crm, neither of which a customer who lives on
          /social ever opens — and the session is persisted to localStorage
          with an auto-refreshing refresh token, so in practice it does not end
          until somebody presses this. A lost phone, a shared phone, an
          ex-employee: no exit. It belongs here, under "עוד", where the rest of
          the account-level items already are.
        */}
        <div className="mt-2 border-t border-ink-700 pt-2">
          <button
            type="button"
            disabled={leaving}
            onClick={async () => {
              const ok = await confirm.ask({
                title: 'לצאת מהחשבון?',
                body: 'הפרסומים המתוזמנים ימשיכו לצאת כרגיל — יציאה מהחשבון לא עוצרת כלום. תצטרכו להתחבר שוב כדי לראות את לוח הבקרה.',
                confirmLabel: 'צא',
                danger: true,
              });
              if (!ok) return;
              setLeaving(true);
              setMoreOpen(false);
              await signOut();
              // A full load, not router.replace: the client cache still holds
              // the screens of the account being left.
              window.location.href = '/crm/login';
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3.5 text-start text-base font-bold text-error-400 hover:bg-error-300/12 disabled:text-ink-600"
          >
            <LogOutIcon className="h-5 w-5" />
            {leaving ? 'יוצא…' : 'יציאה מהחשבון'}
          </button>
        </div>
        {/* Which build the phone is actually running. Two taps from any screen:
            if this does not change after a deploy, the browser is serving a
            cached copy and a refresh is what is needed — not another fix. */}
        <p className="pb-2 pt-2 text-center text-[11px] text-mist-500">
          גרסת המערכת: <span dir="ltr" className="font-mono">{process.env.NEXT_PUBLIC_BUILD_STAMP || '—'}</span>
        </p>
      </Sheet>
      {confirm.dialog}
    </div>
  );
}
