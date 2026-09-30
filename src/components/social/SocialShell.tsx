'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  CalendarIcon,
  ClipboardListIcon,
  ClockIcon,
  GearIcon,
  MonitorIcon,
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  RepeatIcon,
  SparklesIcon,
  SpinnerIcon,
  UsersIcon,
} from '@/components/icons';
import { signOut, useAdminSession } from '@/lib/adminAuth';
import { getControl, listWorkers, sendWorkerCommand, waitForWorkerCommand } from '@/lib/social/client';
import { SYSTEM_STATE_LABEL, SYSTEM_STATE_TONE, type SystemState } from './systemState';
import { InstallPrompt } from './InstallPrompt';
import { NotificationBell } from './NotificationBell';
import { BrowserStatusCard } from './BrowserStatusCard';
import { PublishingToggle } from './PublishingToggle';
import { UpdateBanner } from './UpdateBanner';
import { Sheet, TONE_TEXT, useConfirm, type Tone } from './ui';

/*
 * The dot beside the status line, in the INDICATOR step of each tone rather
 * than the text step: a 8px mark is held to 3:1, not 4.5, and the bright hue
 * is what reads as a light on a white bar. TONE_FILL in ui.tsx is the
 * equivalent map for the -300 steps the rest of the module's dots use.
 */
const DOT_FILL: Record<Tone, string> = {
  good: 'bg-success-300 ring-2 ring-success-300/25',
  warn: 'bg-warning-300 ring-2 ring-warning-300/25',
  bad: 'bg-error-300 ring-2 ring-error-300/25',
  brand: 'bg-brand-300 ring-2 ring-brand-300/25',
  neutral: 'bg-ink-600',
};

const nav = [
  { href: '/social', label: 'ראשי', icon: HomeIcon, exact: true },
  /*
   * "קמפיינים", renamed by the owner along with the screen itself. The word
   * on the tab has to be the word at the top of the screen it opens, so this
   * one line moves with it — nothing else about the navigation changes.
   *
   * The icon stays a cycle rather than a megaphone: a round of publications
   * repeats, and the megaphone said "advertising" where the screen is about a
   * run that comes round again.
   */
  { href: '/social/campaigns', label: 'קמפיינים', icon: RepeatIcon, exact: false },
  { href: '/social/groups', label: 'קבוצות', icon: UsersIcon, exact: false },
  { href: '/social/history', label: 'היסטוריה', icon: CalendarIcon, exact: false },
  /* The activity log's own screen. Two places link to it — the dashboard card
     and the bell — but a route with no entry in the navigation is a route the
     owner can reach and then never find again. */
  { href: '/social/activity', label: 'פעילות', icon: ClockIcon, exact: false },
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

/** One of the identities on that account, as the worker read it out of Facebook's menu. */
type Identity = { name: string; kind?: 'profile' | 'page'; image?: string };

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
  systemState,
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
  /**
   * What the system is doing, when the screen has worked it out.
   *
   * Only the dashboard can: the ladder reads the pause flag, the PC's
   * heartbeat, Meta's rate limit, how many rows need a person and whether
   * anything is queued at all — the whole of its load(). So it hands the
   * answer up rather than the bar guessing at a smaller version of it, which
   * is exactly what the bar used to do: it knew the pause flag alone, and
   * with the PC switched off it read "המערכת פעילה" over a card that read
   * "התוכנה במחשב לא פועלת".
   *
   * Without it the bar says only what it can stand behind — that everything
   * is stopped, when it is.
   */
  systemState?: SystemState;
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
  /*
   * IS THE PC RUNNING — null until the first answer, so the icon never claims
   * "off" during the second before anything has been read.
   *
   * Read on a clock rather than once, which the account above is not: a name
   * does not change while you look at it, but the machine going off is the
   * whole thing this icon exists to show. Sixty seconds, because the card
   * this replaced polled far harder for a fact that changes a few times a day.
   */
  const [pcOnline, setPcOnline] = useState<boolean | null>(null);
  /* The header's connection panel. Closed on every navigation below, with the
     "more" sheet, so it can never be left hanging over the next screen. */
  const [pcOpen, setPcOpen] = useState(false);
  useEffect(() => {
    if (!pcOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPcOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pcOpen]);

  /*
   * WHO PUBLISHES — opened from the picture at the top of every screen.
   *
   * "שאני לוחץ למעלה על הלוגו כמה פעמים לא יוצא חלון צף". It was built on the
   * chip inside the dashboard's card, which also carries the name and also
   * looked like the place; the owner meant the picture in the bar, and he is
   * right that it is the better one. It is on every screen, it is the thing
   * showing whose face is publishing, and tapping a picture of somebody to
   * change who that somebody is needs no explaining.
   *
   * The greeting beside it still goes home, so nothing was taken away.
   */
  const [whoOpen, setWhoOpen] = useState(false);
  const [profiles, setProfiles] = useState<Identity[]>([]);
  const [workerId, setWorkerId] = useState<string | null>(null);
  /*
   * THE IDENTITY THAT WAS JUST CHOSEN, while the computer is still moving onto
   * it — the whole of "שזה ישר יעבור לשם שבחרתי יחד אם הלוגו שלו".
   *
   * The name and the logo go up at the top of the screen the moment they are
   * tapped, which is the instant feedback that was missing: the switch itself
   * is half a minute of somebody else's website and nothing in this app could
   * make that shorter, but the app no longer sits there showing the previous
   * identity as if nothing had been pressed.
   *
   * AND IT DOES NOT CLAIM THE SWITCH HAPPENED. The bar says "מעביר פרופיל…"
   * beside it and the picture wears a ring until the computer confirms. This
   * product's one unbreakable rule about this chip is that it must never assert
   * an identity nobody verified — every post that goes out is signed by it, and
   * a chip that lies about who is publishing is worse than a chip that is slow.
   * If the switch fails, the previous identity comes straight back and the
   * reason is put on screen in the panel that was tapped.
   */
  const [pending, setPending] = useState<Identity | null>(null);
  /** Why the last switch did not happen, in the worker's own Hebrew. */
  const [switchNote, setSwitchNote] = useState<string | null>(null);
  const switching = pending?.name ?? null;
  useEffect(() => {
    if (!whoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWhoOpen(false);
        setSwitchNote(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [whoOpen]);

  /*
   * ONE READER FOR THE WORKER ROWS, called by the minute clock below and by the
   * switch watcher — which is why it is a callback rather than a closure inside
   * the effect. The watcher needs the same read the moment a switch lands, so
   * that the real name and the real face replace the chosen ones without
   * waiting out the rest of the minute.
   */
  const readWorkers = useCallback(async () => {
    const ws = await listWorkers().catch(() => null);
    if (!ws) return null;
    setPcOnline(ws.some((x) => x.online));
    /*
     * THE IDENTITIES, off the same read. This poll already fetches the
     * worker rows every minute for the monitor light and the greeting;
     * the profile list is two more columns on rows that are already in
     * hand, so the picker costs no request of its own.
     */
    {
      const w = ws.find((x) => x.online) ?? ws[0];
      setWorkerId(w?.id ?? null);
      setProfiles(w?.fb_profiles ?? []);
    }
    if (account === undefined) {
      const w = ws.find((x) => x.online && x.fb_user_name) ?? ws.find((x) => x.fb_user_name);
      setOwnAccount(w?.fb_user_name ? { name: w.fb_user_name, avatar: w.fb_avatar_url ?? '' } : null);
    }
    return ws;
  }, [account]);
  useEffect(() => {
    if (!session) return;
    void readWorkers();
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void readWorkers();
    }, 60_000);
    return () => clearInterval(id);
  }, [readWorkers, session]);
  /*
   * WHO THE BAR SHOWS: the identity that was just chosen while it is being
   * moved onto, and the confirmed one at every other moment. `pending` carries
   * the logo the worker photographed out of Facebook's own menu, so the face
   * changes with the name rather than a minute after it.
   */
  const confirmedWho = account ?? ownAccount;
  const who = pending ? { name: pending.name, avatar: pending.image ?? '' } : confirmedWho;

  async function goToProfile(name: string) {
    const row = profiles.find((p) => p.name === name);
    const kind = row?.kind;
    const ok = await confirm.ask({
      title: `לעבור ל"${name}"?`,
      body: (
        <>
מהרגע הזה כל פרסום וכל תגובה ייצאו מהזהות הזאת.
          {' '}אפשר לפרסם רק לקבוצות שהיא חברה בהן, ולכן ייתכן שרשימת הקבוצות שנפרסם אליהן תשתנה.
          {kind === 'page' && (
            <>
              {' '}בנוסף: פייסבוק מאפשרת לדף לפרסם רק בקבוצות שמנהל הקבוצה אישר בהן פרסום מדפים.
              {' '}קבוצה שלא מאפשרת תדולג ותישאר פעילה.
            </>
          )}
        </>
      ),
      confirmLabel: 'עבור',
    });
    if (!ok) return;
    setSwitchNote(null);
    /* The name and the logo go up NOW. Nothing about the computer's work has
       changed; what changed is that the screen answers the tap. */
    setPending({ name, kind, image: row?.image });
    let queued: string;
    try {
      queued = (await sendWorkerCommand(workerId, 'switch', { name })).id;
      onControlChanged?.();
    } catch {
      /* The command row is the record; a failed insert leaves the bar exactly
         as it was rather than claiming a switch that was never asked for. */
      setPending(null);
      setSwitchNote('לא הצלחנו לשלוח את הבקשה למחשב. בדקו את החיבור לאינטרנט ונסו שוב.');
      setWhoOpen(true);
      return;
    }

    /*
     * AND NOW WAIT FOR THE COMPUTER, ON A CLOCK THAT MATCHES THE WORK.
     *
     * The bar used to learn the outcome from its own sixty-second read, so the
     * fastest possible switch still took up to a minute to show and a FAILED one
     * looked exactly like one still in progress for just as long. The command
     * row answers within seconds of the machine finishing, so that is what is
     * watched.
     */
    const cmd = await waitForWorkerCommand(queued);
    if (cmd?.status === 'done') {
      /* The worker has already written the new name and the new face; this read
         is what puts them on screen, and the chosen pair comes down only
         afterwards — so the bar never blinks back to the old identity on the way
         to the new one. */
      await readWorkers();
      setPending(null);
      onControlChanged?.();
      return;
    }
    setPending(null);
    setSwitchNote(
      cmd?.status === 'failed'
        ? cmd.result || `המעבר ל"${name}" לא הושלם. נסו שוב בעוד רגע.`
        : /*
           * NOTHING CAME BACK, which is not the same as a refusal: the command
           * is still in the queue — the computer is off, or asleep, or has not
           * reached it — so the bar stops claiming to be mid-switch and says
           * what is actually true. It will change by itself when the machine
           * gets to it.
           */
          'הבקשה נשלחה אבל המחשב עוד לא ביצע אותה. בדקו שהתוכנה במחשב פועלת — ברגע שהמעבר יקרה, השם כאן יתחלף.',
    );
    setWhoOpen(true);
    void readWorkers();
  }

  // A tap through the sheet navigates; make sure it never stays open behind
  // the new screen.
  useEffect(() => {
    setMoreOpen(false);
    setPcOpen(false);
  }, [pathname]);

  /*
   * THE GATE MOVED OUT OF HERE, and it had to.
   *
   * This component used to do it: redirect to /crm/login and hold a spinner
   * until a session resolved. Two problems. It pointed at the CRM's door,
   * which for a customer is a login for a cleaning-jobs business they have
   * never heard of — it was written when /social had no door of its own. And
   * three screens in this module (posts, posts/new, posts/[id]) do not render
   * SocialShell at all, so they were never gated.
   *
   * SocialGate sits in the layout now, which is the one place every screen
   * passes through, and sends people to /social/login. One guard, one door.
   * By the time this component mounts there is a session; the reads below
   * assume it and always could.
   */

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
   * THE BAR SAYS SOMETHING ONLY WHEN THERE IS SOMETHING TO SAY.
   *
   * It used to print "המערכת פעילה" under the greeting on every screen, and
   * that was two defects wearing one sentence.
   *
   * It was a DUPLICATE. The dashboard's system card says the same words
   * 300px below, bigger, with the day's count and the next action under
   * them — so the owner read the same fact twice before reaching anything
   * they did not already know.
   *
   * And it was a LIE waiting to happen. The card's sentence comes from the
   * whole system-state ladder — paused, the PC not running, Meta slowing us
   * down, the queue empty, publishing now. This line only ever knew the pause
   * flag. With the PC switched off the card read "התוכנה במחשב לא פועלת"
   * while the bar above it still read "המערכת פעילה", which is exactly the
   * two-correct-computations-of-different-things contradiction this module
   * keeps being rebuilt to prevent — and on the other ten screens, where the
   * card is not there to correct it, nothing would have caught it.
   *
   * So the line now states the one fact it actually holds, and only in the
   * state worth interrupting for: everything stopped. Running is the normal
   * case and needs no announcement; the pause button beside it is the
   * affordance, and the dashboard card is where the full state lives.
   *
   * The dot takes the -300 indicator step and the words the -400 text step,
   * per the token convention: the bright amber reads as a light on a white
   * bar and is not legible as type.
   */
  const publishingStopped = control === true;
  /*
   * The bar's one status line. The screen's own reading wins; failing that,
   * the only thing the bar itself holds is the pause flag, and it speaks up
   * only when that flag is on — "everything is stopped" must never be
   * discovered by accident, and "everything is fine" needs no announcement.
   */
  const state = pending
    ? /* While a switch is in flight this outranks everything else the line can
         say, because it is the one fact the owner is waiting on and it is about
         the name printed beside it. Anything else here would look like a
         statement about the identity now showing. */
      { label: 'מעביר פרופיל…', tone: 'brand' as const }
    : systemState
    ? { label: SYSTEM_STATE_LABEL[systemState], tone: SYSTEM_STATE_TONE[systemState] }
    : publishingStopped
      ? { label: 'הפרסום מושהה', tone: 'warn' as const }
      : null;

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
          {/*
            THE PICTURE OPENS THE SWITCHER; THE WORDS STILL GO HOME.
            Two jobs that were one link. Tapping a face to change whose face
            it is needs no label, and the greeting keeps the way back to the
            dashboard that this corner has always had.
          */}
          <div className="relative flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setWhoOpen((v) => !v)}
            aria-expanded={whoOpen}
            aria-haspopup="menu"
            /* The words a screen reader gets must not claim it either: while the
               computer is still moving, this says so. */
            aria-label={
              pending
                ? `מעביר ל${pending.name} — החלפת פרופיל`
                : who
                  ? `מפרסם בתור ${who.name} — החלפת פרופיל`
                  : 'בחירת הפרופיל שמפרסם'
            }
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            {who?.avatar ? (
              /* THE RING IS THE HONESTY. The picture and the name are already
                 the chosen ones; the brand ring, pulsing, is what says the
                 computer has not confirmed it yet — so the bar can answer the
                 tap instantly without asserting that this identity is already
                 publishing. It returns to the quiet grey the moment the switch
                 lands. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={who.avatar}
                alt=""
                className={`h-10 w-10 shrink-0 rounded-full object-cover ${
                  pending ? 'ring-2 ring-brand-300 motion-safe:animate-pulse' : 'ring-1 ring-ink-700'
                }`}
              />
            ) : (
              /* No picture, or nobody connected yet: the brand mark holds the
                 slot rather than a grey circle, so the bar never looks broken
                 before the first connection. */
              <span
                aria-hidden
                className={`grad-primary grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-on-brand shadow-[0_4px_12px_rgba(124,58,237,0.25)] ${
                  /* An identity whose logo was never photographed still shows
                     that it is mid-switch — the ring belongs to the state, not
                     to the picture. */
                  pending ? 'ring-2 ring-brand-300 motion-safe:animate-pulse' : ''
                }`}
              >
                <SparklesIcon className="h-5 w-5" />
              </span>
            )}
          </button>
          {whoOpen && (
            <>
              {/* absolute, not fixed: this bar has a backdrop-filter, which
                  makes it the containing block for fixed children — a fixed
                  backdrop would size itself to the bar and a tap outside would
                  land on nothing. The monitor panel beside it learned the same
                  thing. */}
              <button
                type="button"
                aria-label="סגירה"
                onClick={() => {
                  setWhoOpen(false);
                  setSwitchNote(null);
                }}
                className="absolute inset-x-0 top-full z-40 h-screen w-screen cursor-default"
              />
              <div
                role="menu"
                className="absolute start-0 top-full z-50 mt-2 w-64 rounded-2xl border border-ink-700 bg-ink-900 p-1.5 shadow-xl motion-safe:animate-[rise_0.18s_ease-out]"
              >
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-bold text-mist-500">מי מפרסם</p>
                {/*
                  WHY THE LAST ONE DID NOT HAPPEN, where it was asked for.
                  A switch that Facebook refused, or a computer that is switched
                  off, used to leave this panel looking exactly like a switch
                  that worked — the name simply never changed. The computer's own
                  sentence says which, in the place the owner was already looking.
                */}
                {switchNote && (
                  <p className="mx-1 mb-1 rounded-xl bg-warning-300/12 px-2 py-2 text-[12px] font-bold leading-relaxed text-warning-400">
                    {switchNote}
                  </p>
                )}
                {profiles.length ? (
                  profiles.map((p) => {
                    /* Against the CONFIRMED identity, never against the one
                       being moved onto: "מפרסם" is a statement about what the
                       computer is doing, and for the few seconds those two
                       differ it is the old one that is still true. */
                    const active = Boolean(confirmedWho?.name) && p.name === confirmedWho?.name;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        role="menuitem"
                        disabled={active || switching !== null}
                        onClick={() => {
                          setWhoOpen(false);
                          void goToProfile(p.name);
                        }}
                        className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-start text-[13px] font-bold ${
                          active ? 'bg-success-400/12 text-success-400' : 'text-mist-100 hover:bg-ink-800'
                        } disabled:opacity-70`}
                      >
                        {/* The identity's own logo, photographed out of
                            Facebook's menu by the computer. The initial is the
                            fallback for a name we have no picture for — never a
                            stock face, and never another row's. */}
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-ink-700" />
                        ) : (
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-800 text-[11px] font-extrabold text-mist-300">
                            {p.name.trim().charAt(0) || '?'}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span dir="auto" className="truncate">{p.name}</span>
                          {p.kind === 'page' && <span className="text-[10px] font-bold text-mist-500">דף עסקי</span>}
                        </span>
                        {active && <span className="shrink-0 text-[10px] font-extrabold">מפרסם</span>}
                        {switching === p.name && <span className="shrink-0 text-[10px] font-bold text-mist-500">מעביר…</span>}
                      </button>
                    );
                  })
                ) : (
                  /* Never "there is only one": nobody has looked yet, and the
                     screen that can look says so in its own words. */
                  <p className="px-2 py-2 text-[12px] leading-relaxed text-mist-300">
                    עוד לא קראנו אילו פרופילים יש בחשבון. פתחו את מסך החשבון ולחצו "חפש פרופילים".
                  </p>
                )}
                <Link
                  href="/social/account"
                  onClick={() => setWhoOpen(false)}
                  className="mt-1 flex min-h-11 items-center justify-center rounded-xl text-[12px] font-bold text-brand-400 hover:bg-ink-800"
                >
                  מסך החשבון
                </Link>
              </div>
            </>
          )}
          <Link href="/social" className="flex min-h-11 min-w-0 items-center rounded-xl">
            <span className="min-w-0">
              <span dir="auto" className="block truncate text-[14px] font-extrabold leading-[18px] text-mist-100">
                {greetingNow()}
                {who ? `, ${firstName(who.name)}` : ''} 👋
              </span>
              {state && (
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT_FILL[state.tone]}`} />
                  <span dir="auto" className={`truncate text-[11.5px] font-bold leading-[14px] ${TONE_TEXT[state.tone]}`}>
                    {state.label}
                  </span>
                </span>
              )}
            </span>
          </Link>
          </div>
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
            {/*
              THE COMPUTER, AND WHETHER IT IS RUNNING.
              *
              * This replaces the "התוכנה במחשב פועלת ומחוברת" strip that sat
              * on the dashboard: one fact, on every screen, in the corner
              * where the other state lives — "למחוק את זה ובמקום להוסיף
              * אייקון של מחשב למעלה".
              *
              * GREEN WHEN IT IS RUNNING, AND NEVER RED — asked for in those
              * words. Off is the muted grey every other inactive control in
              * this bar wears, not an alarm: the PC being off in the evening
              * is the normal state of this product, and a red badge that is
              * red most nights is a red badge nobody reads. What actually
              * needs doing still arrives as an alert on the dashboard, in
              * words, with a button.
              *
              * It goes to the connection card, which is where "התחבר
              * לפייסבוק" now lives.
            */}
            <button
              type="button"
              onClick={() => setPcOpen((v) => !v)}
              aria-expanded={pcOpen}
              aria-controls="pc-panel"
              aria-label={pcOnline ? 'המחשב מחובר — פרטי החיבור' : 'המחשב לא מחובר — פרטי החיבור'}
              /* A column, not a grid, and still exactly 44px tall: the icon
                 (20) plus a 9px label on a 10px line plus the 1px gap is 31px
                 inside the 44 the touch floor already required, so the word
                 costs the header no height at all. Rounded-2xl rather than
                 -full because the box is no longer a circle. */
              className={`flex h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-px rounded-2xl px-1.5 transition-colors ${
                pcOpen
                  ? 'bg-brand-300/12 text-brand-400'
                  : pcOnline
                    ? 'text-success-400 hover:bg-success-400/10'
                    : 'text-mist-500 hover:bg-ink-800 hover:text-mist-100'
              }`}
            >
              <MonitorIcon className="h-5 w-5" />
              {/*
                THE WORD, NOT ONLY THE COLOUR — "שיהיה רשום גם מתחת … שזה דלוק
                או מכובה".
                *
                * Colour alone is the wrong carrier for this on its own: it is
                * the fact people check at a glance, and green-vs-grey is
                * exactly the distinction that disappears for a colour-blind
                * reader, in sunlight, or on a dimmed phone at night. The word
                * says it outright and the colour agrees with it.
                *
                * "בודק" while the first read is in flight rather than a blank
                * or a dash: the slot keeps its width so nothing jumps when the
                * answer lands, and the button never claims "כבוי" about a
                * machine nobody has asked about yet.
              */}
              <span aria-hidden className="text-[9px] font-extrabold leading-[10px]">
                {pcOnline === null ? 'בודק' : pcOnline ? 'פועל' : 'כבוי'}
              </span>
            </button>
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

        {/*
          THE CONNECTION, AS A PANEL THAT DROPS FROM THE BAR.
          *
          * Asked for: "שאני לוחץ עליו אני רוצה שיהיה חלון קטן צף שיורד מתחת
          * למסך עם הפרטי התחברות". It is the SAME BrowserStatusCard the
          * settings screen renders — not a copy of it — so "התחבר לפייסבוק",
          * "בדוק חיבור" and the reset behave identically wherever they are
          * pressed, and there is one place where those commands are built.
          *
          * Mounted only while open, which is what keeps its poller off every
          * screen in the product: the header's own sixty-second read is all
          * the icon's colour needs.
          *
          * The backdrop is a real element rather than a document listener
          * because the panel sits inside a sticky header: a listener would
          * have to exclude the button that opened it, and that exclusion is
          * the bug every such menu eventually has.
        */}
        {pcOpen && (
          <>
            <button
              type="button"
              aria-label="סגירת פרטי החיבור"
              onClick={() => setPcOpen(false)}
              /*
               * ABSOLUTE AND top-full, NOT `fixed inset-0`.
               *
               * The header carries backdrop-blur, and an element with a
               * backdrop-filter is a containing block for fixed descendants —
               * so `fixed inset-0` would have sized itself to the HEADER, not
               * the viewport, and a tap anywhere on the page below would not
               * have closed the panel. Anchored under the bar with a viewport
               * height instead, which needs no such assumption.
               */
              className="absolute inset-x-0 top-full z-40 h-screen cursor-default bg-ink-950/40"
            />
            <div
              id="pc-panel"
              /* `rise` is the app's own entrance — the token in globals.css, not a
                 new keyframe. My first pass wrote animate-[fadeIn_.12s], and
                 there is no fadeIn in this stylesheet: a class that names a
                 keyframe nobody defined renders nothing and fails silently. */
              className="absolute inset-x-0 top-full z-50 px-3 pt-2 motion-safe:animate-[rise_0.22s_cubic-bezier(0.22,1,0.36,1)_both]"
            >
              {/* Full width on a phone, a panel on a desktop — and pinned to
                  the side the button is on, which in RTL is the start. */}
              <div className="mx-auto w-full max-w-6xl">
                <div className="ms-auto w-full max-w-md">
                  <BrowserStatusCard alwaysOpen onChanged={onControlChanged} />
                </div>
              </div>
            </div>
          </>
        )}
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
        {/* On the home screen only, and once: the app is a full PWA and
            installing it is what takes the browser's own bar off the bottom
            of the product. Nagging about it from eleven screens would be a
            second browser bar of its own. */}
        {pathname === '/social' && <InstallPrompt />}
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
              //
              // /social/login, not /crm/login. This pointed at the CRM's door
              // because for a long time it was the only one — /social had no
              // login screen of its own, and the owner reached this app on the
              // CRM's session. For a customer that is somebody else's
              // business: they would sign out of the publishing app and land
              // on a login for a cleaning-jobs CRM they have never heard of.
              window.location.href = '/social/login';
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
