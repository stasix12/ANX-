'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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
  UsersIcon,
} from '@/components/icons';
import { signOut, useAdminSession } from '@/lib/adminAuth';
import { getControl, listWorkers } from '@/lib/social/client';
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
  { href: '/social/settings', label: 'הגדרות', icon: GearIcon, exact: false },
];

/**
 * Four tabs plus "עוד". Five is where a thumb still lands accurately on a
 * phone; the rest of the product is one tap deeper rather than crammed in.
 */
const MOBILE_TABS = ['/social', '/social/campaigns', '/social/groups', '/social/library'];

/** The Facebook account the computer publishes as: name and picture. */
type FbAccount = { name: string; avatar: string };

/**
 * Greeting by time of day, in the app's own timezone.
 *
 * It lived on the dashboard while the bar carried the product name and took
 * it as `subtitle`. The bar now greets the owner by name on every screen, so
 * the greeting lives with the bar — one copy, not one per screen that wants
 * one.
 */
function greetingNow(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jerusalem' }).format(new Date()));
  if (hour < 5) return 'לילה טוב';
  if (hour < 12) return 'בוקר טוב';
  if (hour < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

/**
 * First name only.
 *
 * Measured at 375px: the identity block has ~145px for this line beside three
 * 44px controls, and "צהריים טובים, Stas Terehin" truncates in the middle of
 * the surname — the one word on the line that is actually the owner's. The
 * first name always fits, and it is how a product greets someone anyway.
 */
function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full.trim();
}

/**
 * Frame for every /social screen: the same Supabase session as the CRM
 * (RLS is the real gate — this redirect is only UX), a header and a
 * horizontal tab bar that fits a phone yet reads as a toolbar on desktop.
 */
export function SocialShell({
  title,
  lede,
  headerAction,
  hideTitle = false,
  paused,
  account,
  onControlChanged,
  children,
}: {
  title: string;
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
  /**
   * The signed-in Facebook account, when the screen already reads it.
   *
   * Same bargain as `paused` above: the dashboard already builds this out of
   * listWorkers() for its system card, so it hands it over instead of making
   * the bar fetch the same row a second time. Screens that pass nothing get
   * the bar's own one-shot read.
   */
  account?: FbAccount | null;
  onControlChanged?: () => void;
  children: React.ReactNode;
}) {
  const { session, loading } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const confirm = useConfirm();

  /*
   * THE PAUSE FLAG, read once for the whole bar.
   *
   * The bar now says out loud whether the system is running, so it needs the
   * flag on every screen — not only on the one screen that happens to read
   * it. The rule from `paused` above is unchanged and simply moved up a
   * level: a screen that owns the value still wins, and the button below is
   * handed the result rather than polling for it, so the words and the button
   * can never disagree. This is the same 20s clock the button used to run on
   * its own; it is not a second reader, it is the same one, one layer up.
   */
  const owned = paused !== undefined;
  const [control, setControl] = useState<boolean | null>(paused ?? null);
  const readControl = useCallback(() => {
    getControl()
      .then((c) => setControl(c.paused))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (owned) setControl(paused ?? null);
  }, [owned, paused]);
  useEffect(() => {
    // Not before there is a session to read with: without this the bar fires
    // two RLS-refused requests on the way to the login redirect.
    if (owned || !session) return;
    readControl();
    // Someone may pause from another device, or the worker may report a stop.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') readControl();
    }, 20_000);
    return () => clearInterval(id);
  }, [owned, readControl, session]);

  /*
   * WHO IS PUBLISHING. The same social_workers row the dashboard's system
   * card reads — reused, not re-invented. Once on mount rather than on a
   * clock: a profile name does not change while you are looking at it, and
   * this component is mounted on all eleven screens.
   */
  const [ownAccount, setOwnAccount] = useState<FbAccount | null>(null);
  useEffect(() => {
    if (account !== undefined || !session) return;
    let stopped = false;
    listWorkers()
      .then((ws) => {
        if (stopped) return;
        const w = ws.find((x) => x.online && x.fb_user_name) ?? ws.find((x) => x.fb_user_name);
        setOwnAccount(w?.fb_user_name ? { name: w.fb_user_name, avatar: w.fb_avatar_url ?? '' } : null);
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [account, session]);
  const who = account ?? ownAccount;

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
   * The state line under the greeting.
   *
   * Three states, and the third is the honest one: until the flag has been
   * read the bar says it is checking rather than picking a side. A status
   * line that guesses "פעיל" while loading is worse than no line at all —
   * "nothing is going out" is precisely the thing the owner must never
   * discover by accident.
   *
   * The dot takes the -300 indicator step and the words the -400 text step,
   * per the token convention: the bright green reads as a light on a white
   * bar and measures 2.9:1 as type, so it is never the type.
   */
  const status =
    control === null
      ? { label: 'בודק מצב…', dot: 'bg-ink-600', text: 'text-mist-500' }
      : control
        ? { label: 'המערכת מושהית', dot: 'bg-warning-300 ring-warning-300/25', text: 'text-warning-400' }
        : { label: 'המערכת פעילה', dot: 'bg-success-300 ring-success-300/25', text: 'text-success-400' };

  /*
   * The bottom reserve below is the tab bar's real height plus the inset, not
   * a round number. Measured from the classes on the <nav> at the foot of this
   * file: pt-2 (8) + the 28px icon puck + gap-0.5 (2) + an 11px label at
   * line-height 1.5 (16.5) + pb-1.5 (6) + the 1px top border = 61.5px, and the
   * bottom strip (--safe-b, globals.css) is already padded inside the bar
   * itself — so it is added here too, and only here. 5.5rem (88px) reserved 26px
   * that nothing occupies, which is why the last card on every screen floated
   * well clear of the bar. 4.5rem is 61.5px of bar plus ~10px of air — and it
   * is the same constant the floating selection bars are anchored to, so the
   * bottom of the product is one number.
   */
  return (
    <div className="min-h-dvh bg-ink-950 pb-[calc(4.5rem+var(--safe-b))] md:pb-10">
      {/*
        A quiet identity bar, and identity here means the OWNER's, not the
        product's. It carries a greeting by name, the state of the system in
        one line, and the three controls that must be reachable from anywhere:
        stop everything, what needs attention, settings. The screen's own
        title and its primary action belong to the page, where they can be
        sized against the content. On this palette the bar is the card surface
        at 96% behind a 16px blur, so content scrolling under it stays sensed
        but never legible.
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
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-850/96 pt-[max(env(safe-area-inset-top),2px)] backdrop-blur-lg">
        {/* No vertical padding at all: every child of this row is pinned at
            the 44px touch floor (the identity link is min-h-11; the three
            controls are h-11 each), so every pixel of py was dead space
            around targets that were already tall enough. Measured below the
            safe area: the row is 44px and the header 45, against 52/53
            before — 15% shorter with no target touched. */}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4">
          {/*
            WHO, and WHETHER IT IS RUNNING.

            This was the product's own name and tagline — "הפתרון המבריק /
            פרסום חכם לקבוצות פייסבוק" — which is a thing the owner knows and
            paid for, printed at the top of every screen of their own tool.
            The two facts worth that space are the ones that change: who the
            computer is signed in as, and whether anything is going out right
            now. The link still goes home, so nothing that was reachable from
            this corner stopped being reachable.
          */}
          <Link href="/social" className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl">
            {who?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={who.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-ink-700" />
            ) : (
              /* No picture, or nobody connected yet: the brand mark holds the
                 slot rather than a grey circle, so the bar never looks broken
                 before the first connection. */
              <span aria-hidden className="grad-primary grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-on-brand shadow-[0_4px_12px_rgba(124,58,237,0.25)]">
                <SparklesIcon className="h-5 w-5" />
              </span>
            )}
            <span className="min-w-0">
              <span dir="auto" className="block truncate text-[14px] font-extrabold leading-[18px] text-mist-100">
                {greetingNow()}
                {who ? `, ${firstName(who.name)}` : ''} 👋
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ring-2 ${status.dot}`} />
                <span dir="auto" className={`truncate text-[11.5px] font-bold leading-[14px] ${status.text}`}>
                  {status.label}
                </span>
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Stopping everything must be reachable from wherever you are when
                you realise you need to, not only from the dashboard. Label off
                (see `compact`), because the line to its right now says which
                way the system is. */}
            {control !== null && (
              <PublishingToggle
                compact
                paused={control}
                onChanged={() => {
                  onControlChanged?.();
                  if (!owned) readControl();
                }}
              />
            )}
            <NotificationBell />
            {/* Settings had a tab on desktop and lived two taps deep behind
                "עוד" on a phone, which is where the owner goes after a run
                goes wrong. It is one tap from every screen now; the route is
                the existing one. */}
            <Link
              href="/social/settings"
              aria-label="הגדרות"
              aria-current={isActive('/social/settings', false) ? 'page' : undefined}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${
                isActive('/social/settings', false) ? 'bg-brand-300/12 text-brand-400' : 'text-mist-500 hover:bg-ink-800 hover:text-mist-100'
              }`}
            >
              <GearIcon className="h-5 w-5" />
            </Link>
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
        // The bar lifts off the content in the ground's own hue, darkened —
        // a violet shade rather than black, which on a white-purple page
        // reads as grey dirt rather than as depth.
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-850/96 pb-[var(--safe-b)] shadow-[0_-6px_24px_rgba(46,16,101,0.08)] backdrop-blur-xl md:hidden"
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
                    <span className={`grid h-7 w-13 place-items-center rounded-full transition-[background-color,transform] duration-200 ${active ? 'scale-105 bg-brand-300/12 shadow-[0_4px_12px_rgba(124,58,237,0.18)]' : ''}`}>
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
              <span className={`grid h-7 w-13 place-items-center rounded-full transition-[background-color,transform] duration-200 ${moreActive ? 'scale-105 bg-brand-300/12 shadow-[0_4px_12px_rgba(124,58,237,0.18)]' : ''}`}>
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
