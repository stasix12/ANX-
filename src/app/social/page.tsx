'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityFeed } from '@/components/social/ActivityFeed';
import { BrowserStatusCard } from '@/components/social/BrowserStatusCard';
import { LiveCampaignHero, LiveQueueHero, type SystemState } from '@/components/social/LiveCampaignHero';
import { QueueTunerSheet } from '@/components/social/QueueTunerSheet';
import { QuickActions } from '@/components/social/QuickActions';
import { SetupChecklist } from '@/components/social/SetupChecklist';
import { SocialShell } from '@/components/social/SocialShell';
import { Timeline } from '@/components/social/Timeline';
import { AlertBar, Button, Card, Notice, Skeleton, SkeletonTiles, StatCard, useConfirm, useToast } from '@/components/social/ui';
import {
  callSocialApi,
  campaignStates,
  cancelAllScheduled,
  countPublishedSince,
  getControl,
  getLimits,
  listActivity,
  listCampaigns,
  listQueue,
  listTargets,
  listWorkers,
  pauseCampaign,
  queueSummary,
  runCoverMedia,
  setPaused,
  stopCampaign,
  type QueueRow,
} from '@/lib/social/client';
import { cancellableRows, percentFinished, type CampaignState } from '@/lib/social/campaign';
import { OVERDUE_AFTER_SECONDS } from '@/lib/social/countdown';
import { AUTOMATIC_WAITING_STATUSES, EMPTY_QUEUE_SUMMARY, type QueueSummary } from '@/lib/social/status';
import { startOfZonedDay } from '@/lib/social/time';
import { stampText } from '@/components/social/DateTime';
import type { ActivityEntry, Campaign, ControlSettings, LimitsSettings, MediaItem, QueueStatus } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * How many upcoming rows the timeline reads. The card's subtitle prints the
 * EXACT queue count beside it rather than this array's length, so a ceiling is
 * never shown as a total.
 */
const UPCOMING_LIMIT = 40;

interface DashboardData {
  counts: Record<QueueStatus, number>;
  /** The same counts rolled up through the one classification (status.ts). */
  summary: QueueSummary;
  today: number;
  upcoming: QueueRow[];
  limits: LimitsSettings;
  control: ControlSettings;
  activeTargets: number;
  manual: QueueRow[];
  log: ActivityEntry[];
  campaigns: Campaign[];
  states: Record<string, CampaignState>;
  /**
   * Whether any worker has sent a heartbeat inside its offline window.
   *
   * The dashboard reads this for one reason: no screen in this product may say
   * a publication is "happening now" unless a machine is actually there to
   * make it happen. It is the same read BrowserStatusCard already does, from
   * the same table — not a second source of truth.
   */
  workerOnline: boolean;
  /**
   * A worker is alive but Facebook has asked for a person in its Chrome
   * profile. Already on the wire from the same listWorkers() read — the
   * dashboard used to throw `status` and `browser_state` away and keep only
   * the heartbeat, so the one state a person can actually fix was invisible
   * here while BrowserStatusCard showed it 1500px further down.
   */
  workerNeedsAuth: boolean;
}

/**
 * The control centre. The order is the point: what is running right now,
 * then what is about to happen, and only then the numbers. A row of tiles
 * is a report; a campaign with a progress bar and a next-publication time is
 * something you can act on.
 */
export default function SocialDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /* The queue tuner, opened from the "next publication" box of either hero. */
  const [tunerOpen, setTunerOpen] = useState(false);
  /* The featured run's cover. Read on its own, and only when a run is
     featured: the queue rows carry their post, but only while something is
     still scheduled - a finished run would lose its picture exactly when the
     owner looks to see what went out. */
  const [featuredMedia, setFeaturedMedia] = useState<MediaItem[] | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const campaigns = await listCampaigns();
      // Only a live campaign can be the one running right now, so the rollup
      // read stays proportional to what the hero can actually show.
      const liveIds = campaigns.filter((c) => c.status !== 'archived').map((c) => c.id);
      const [queue, today, limits, control, targets, manual, log, states, upcoming, workers] = await Promise.all([
        queueSummary(),
        countPublishedSince(startOfZonedDay(now).toISOString()),
        /* countPublishedBetween(weekStart) used to run here on every 30s poll
           and `data.week` was rendered nowhere. One whole count query a
           minute, on a metered Israeli mobile plan, for a number no screen
           showed. */
        getLimits(),
        getControl(),
        listTargets(),
        listQueue({ status: ['manual_pending'], limit: 20 }),
        listActivity(30),
        campaignStates(liveIds),
        // Ascending, because the limit is applied after the sort: read
        // newest-first, these 40 would be the FURTHEST-OUT rows in the queue
        // and "הפרסומים הקרובים" would be showing the last publications while
        // calling the first of them the next one.
        listQueue({ status: AUTOMATIC_WAITING_STATUSES, limit: UPCOMING_LIMIT, order: 'asc' }),
        listWorkers(),
      ]);
      setData({
        counts: queue.counts,
        summary: queue.summary,
        today,
        upcoming,
        limits,
        control,
        activeTargets: targets.filter((t) => t.enabled).length,
        manual,
        log,
        campaigns,
        states,
        workerOnline: workers.some((w) => w.online),
        workerNeedsAuth: workers.some((w) => w.online && (w.status === 'needs_attention' || w.browser_state === 'needs_auth')),
      });
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }, []);

  /*
   * The 30-second refresh, with the two guards every poller in this module
   * needs and none of them had.
   *
   * 1. An in-flight guard. `setInterval` fires whether or not the previous
   *    read came back, and this screen's read is the heaviest in the product
   *    (measured in a production build against a 5 000-row queue: 7.8 MB and
   *    144 requests a minute). On a slow cell the reads stacked, which made
   *    them slower, which stacked more.
   * 2. A visibility guard. A dashboard left open in a background tab kept
   *    pulling megabytes on a metered Israeli mobile plan to redraw a screen
   *    nobody was looking at. Coming back to the tab reads immediately, so
   *    what the owner sees on return is fresh, not stale-then-refreshed.
   */
  useEffect(() => {
    let alive = true;
    let running = false;
    const tick = async () => {
      if (!alive || running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        await load();
      } finally {
        running = false;
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  /*
   * `busy` is React state, so it is not set until the render after the click —
   * three taps dispatched inside one task all get through. Measured: three
   * same-tick clicks on "השהה סבב" produced three PATCHes to social_campaigns
   * and three identical rows in the activity log. A ref flips synchronously,
   * inside the handler, which is the only thing that can stop the second tap.
   */
  const writing = useRef(false);

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    if (writing.current) return;
    writing.current = true;
    setBusy(key);
    try {
      await fn();
      toast(done);
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      writing.current = false;
      setBusy(null);
    }
  }

  /**
   * Exactly what "delete everything waiting" will cancel, across every
   * campaign — the same list cancelAllScheduled() matches on (status.ts), so
   * the number in the question is the number the write delivers. It used to be
   * a third list that was neither a subset nor a superset of either.
   */
  const summary = data?.summary ?? EMPTY_QUEUE_SUMMARY;
  const pending = summary.cancellable;

  /**
   * Clears the queue. One implementation behind two entry points: beside
   * "resume" once publishing is paused, and as the panic button at the foot of
   * the screen, which pauses on the way so nothing restarts behind it.
   *
   * The count in the question is the real one, because "delete everything
   * waiting" means nothing without knowing how much that is.
   */
  async function discardQueue(alsoPause: boolean) {
    const ok = await confirm.ask({
      title: pending ? `למחוק ${pending} פרסומים מהתור?` : 'למחוק את התור?',
      body: `הפרסומים שממתינים — בכל סבבי הפרסום — יבוטלו ולא יצאו.${
        alsoPause ? ' המערכת גם תושהה.' : ''
      } מה שכבר פורסם נשאר בהיסטוריה. אי אפשר לבטל את הפעולה.`,
      confirmLabel: 'מחק',
      danger: true,
    });
    if (!ok) return;
    if (writing.current) return;
    writing.current = true;
    setBusy(alsoPause ? 'stop' : 'discard');
    try {
      if (alsoPause) await setPaused(true);
      const n = await cancelAllScheduled();
      toast(n ? `${n} פרסומים בוטלו.` : 'לא היו פרסומים בתור.', 'info');
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'המחיקה נכשלה.'), 'error');
    } finally {
      writing.current = false;
      setBusy(null);
    }
  }

  /**
   * Ends the featured run and clears its counter.
   *
   * The card's "84 / 84" is every publication this run ever had, and a run is
   * reused by every launch of its post - so stopping one and launching again
   * kept adding to a number the owner could not explain. Closing the run is
   * the honest reset: what already published stays in the history, and the
   * next launch of that post opens a new run whose count starts at zero
   * (library.ts quickPublish).
   */
  async function resetRun(id: string, name: string, state: CampaignState) {
    // Exactly what stopCampaign() will cancel — a publication already in
    // flight is left to finish, so it is not part of the promise.
    const waiting = cancellableRows(state.progress);
    const ok = await confirm.ask({
      title: 'לסיים את הסבב?',
      body:
        waiting > 0
          ? `${waiting === 1 ? 'פרסום אחד שטרם יצא יבוטל' : `${waiting} פרסומים שטרם יצאו יבוטלו`}. מה שכבר פורסם נשאר בהיסטוריה, והמונה יתחיל מאפס בפעם הבאה שתפרסמו את הפוסט הזה.`
          : 'שום דבר לא ממתין לצאת. מה שכבר פורסם נשאר בהיסטוריה, והמונה יתחיל מאפס בפעם הבאה שתפרסמו את הפוסט הזה.',
      confirmLabel: 'סיים ואפס',
      danger: true,
    });
    if (ok) await act('reset-run', () => stopCampaign(id), `הסבב "${name}" הסתיים. המונה יתחיל מאפס.`);
  }

  /**
   * One tap that posts to Facebook, so it asks first — and the question says
   * what the tap really does.
   *
   * Every other consequential action in this module is confirmed with a real
   * number; this one, arguably the most consequential, went straight to
   * /api/social/run. It was also mislabelled: it does not publish everything
   * now, it runs one worker tick over rows whose time has ALREADY come, and
   * only Pages can go out that way (server/worker.ts restricts the server
   * runtime to facebook_page and facebook_group_manual). Groups still wait for
   * the worker on the owner's PC. Nothing is brought forward.
   */
  async function runNow() {
    const ok = await confirm.ask({
      title: 'להריץ את הפרסום עכשיו?',
      body: (
        <>
          המערכת תעבור על הפרסומים שכבר הגיע זמנם ותוציא את אלה שמיועדים לדפי פייסבוק, דרך ה-API הרשמי.
          {' '}פרסומים לקבוצות ימשיכו לחכות ל-worker שרץ במחשב שלכם.
          {' '}פרסומים שעדיין לא הגיע זמנם לא יוקדמו.
        </>
      ),
      confirmLabel: 'הרץ',
    });
    if (!ok) return;
    if (writing.current) return;
    writing.current = true;
    setBusy('run');
    try {
      const r = await callSocialApi<{ ran: boolean; planned: number; reason?: string; published: number; manual: number; skipped: number; failed: number; deferred: number }>('/api/social/run');
      // Planning happens even when publishing is held, so a run that published
      // nothing may still have filled the queue — say so rather than "לא רץ".
      const queued = r.planned ? `${r.planned} פרסומים נכנסו לתור. ` : '';
      toast(
        r.ran ? `${queued}הריצה הסתיימה: ${r.published} פורסמו, ${r.skipped} דולגו, ${r.failed} נכשלו.` : `${queued}הפרסום מושהה: ${r.reason}`,
        r.ran ? 'success' : 'info',
      );
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'הריצה נכשלה.'), 'error');
    } finally {
      writing.current = false;
      setBusy(null);
    }
  }

  /** The campaign worth putting at the top: running first, then most recently active. */
  const featured = data
    ? (data.campaigns
        .map((c) => ({ campaign: c, state: data.states[c.id] }))
        .filter((x): x is { campaign: Campaign; state: CampaignState } => Boolean(x.state?.progress.total))
        .sort((a, b) => {
          const rank = (s: CampaignState) => (s.state === 'running' ? 0 : s.state === 'needs_attention' ? 1 : s.state === 'paused' ? 2 : s.state === 'not_started' ? 3 : 4);
          const d = rank(a.state) - rank(b.state);
          if (d) return d;
          return percentFinished(a.state.progress) - percentFinished(b.state.progress);
        })[0] ?? null)
    : null;

  const featuredId = featured?.campaign.id ?? null;
  useEffect(() => {
    if (!featuredId) {
      setFeaturedMedia(null);
      return;
    }
    let alive = true;
    runCoverMedia(featuredId)
      .then((m) => {
        if (alive) setFeaturedMedia(m);
      })
      // A missing cover is not worth an error on screen: the card falls back
      // to the queue row's post, and failing that shows no tile at all.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [featuredId]);

  /*
   * How many DISTINCT groups the featured run publishes to.
   *
   * Not `progress.total`, which is rows: a recurring schedule posts one run to
   * one group more than once, so "מפרסם ל-84 קבוצות" over 40 groups would be a
   * number that is not in the database. `upcoming` (non-terminal) and `done`
   * (terminal) partition every row campaignState() read, so their union is
   * complete; `now` is already inside `upcoming` because in-flight is
   * non-terminal, and adding it would double-count.
   *
   * Derived HERE, once, rather than inside the card: a component that works a
   * run fact out of rows for itself is the shape that produced "100% complete"
   * beside 28 waiting publications. It belongs on CampaignState as a
   * `targetCount` field — see the report; campaign.ts is not this task's to
   * edit.
   */
  const featuredTargetCount = featured
    ? new Set([...featured.state.upcoming, ...featured.state.done].map((r) => r.target_id)).size
    : null;

  /**
   * The publication that should already have gone out, when nothing is there
   * to send it.
   *
   * `data.upcoming` is the real queue, ascending, so its first row is the next
   * instant due. If that instant has passed and no worker has sent a heartbeat,
   * nothing is going to move it — and this is the product's most common
   * real-world state, because the machine that publishes to groups is a laptop
   * that goes to sleep.
   *
   * Deliberately NO count. The upcoming read is capped at UPCOMING_LIMIT, so
   * any total taken from it would be a ceiling presented as a fact — the thing
   * this screen exists not to do. The instant is a fact, and it is enough.
   *
   * The threshold is OVERDUE_AFTER_SECONDS (countdown.ts) — the same one the
   * hero card 200px below this bar uses to decide the word "באיחור". It was a
   * local 90_000 here, and two thresholds for one idea is how the screens
   * started contradicting each other in the first place: between 90 and 120
   * seconds past due this bar said "הפרסום עומד — המחשב לא מחובר" while the
   * card under it still read "אמור לצאת עכשיו".
   */
  const stalledSince =
    data &&
    !data.workerOnline &&
    !data.control.paused &&
    data.upcoming[0] &&
    new Date(data.upcoming[0].scheduled_at).getTime() < Date.now() - OVERDUE_AFTER_SECONDS * 1000
      ? data.upcoming[0].scheduled_at
      : null;

  /**
   * THE SYSTEM STATE — one derivation, one place, read by the dot, the
   * headline and the aria-label alike.
   *
   * Top-down, first match wins:
   *   1. paused              the owner did this deliberately, and it explains
   *                          every other symptom on the screen.
   *   2. needs intervention  nothing will move until a person acts:
   *                          (a) the PC is asleep and a publication is really
   *                              past due; (b) rows that only a person can
   *                              move; (c) a live worker whose Chrome is
   *                              asking for a Facebook login; (d) rows in a
   *                              status NO worker can ever claim
   *                              (CLAIMABLE_STATUSES is ['scheduled'] alone),
   *                              which invariants.ts already logs.
   *   3. empty               nothing queued and nothing upcoming.
   *   4. active              nothing is blocking. NOT "publishing right now" —
   *                          that word is earned from a machine fact, inside
   *                          the card.
   *
   * `summary.failed` is deliberately NOT in this ladder. It is an ALL-TIME
   * count with no date filter, so one failure last March would pin the system
   * to "needs intervention" for ever. A failed row is terminal: it does not
   * stop anything. It is reported by its own red tile and its "טפל עכשיו" chip.
   */
  const systemState: SystemState = !data
    ? 'empty'
    : data.control.paused
      ? 'paused'
      : stalledSince || summary.needsHuman > 0 || data.workerNeedsAuth || data.counts.paused > 0
        ? 'needs_intervention'
        : summary.queued === 0 && data.upcoming.length === 0
          ? 'empty'
          : 'active';

  /*
   * What the intervention is, and the one place to go and fix it. Stalled
   * wins: a dead worker blocks the rows waiting on a person too, so telling
   * the owner to go and confirm something would send them to a screen where
   * nothing can happen.
   *
   * Every string here is one the screen already said, in an alert bar that
   * used to stack above the fold — the bar is gone and its sentence moved
   * into the state it describes.
   */
  const intervention =
    systemState !== 'needs_intervention' || !data
      ? null
      : stalledSince
        ? {
            title: 'הפרסום עומד — המחשב לא מחובר',
            body: `הפרסום הבא היה אמור לצאת ב-${stampText(stalledSince)} ואף אחד לא לקח אותו. פרסום לקבוצות יוצא רק כשהתוכנה פועלת על המחשב שלכם.`,
            actionLabel: 'מה לעשות',
            href: '#browser-status',
          }
        : data.workerNeedsAuth
          ? {
              title: 'פייסבוק מבקשת אימות במחשב',
              body: 'התוכנה במחשב פועלת, אבל חלון הדפדפן שלה מחכה שתתחברו לפייסבוק. עד אז פרסום לקבוצות לא יצא.',
              actionLabel: 'מה לעשות',
              href: '#browser-status',
            }
          : summary.needsHuman > 0
            ? {
                title: `${summary.needsHuman} פרסומים ממתינים לכם`,
                body: 'בדרך כלל פייסבוק ביקשה אימות בחלון הדפדפן שבמחשב, או שהפרסום מחכה לאישור שלכם.',
                actionLabel: 'הצג',
                href: '/social/history?status=needs_attention',
              }
            : {
                title: `${data.counts.paused} פרסומים תקועים`,
                body: 'הם נמצאים בסטטוס שאף worker לא אוסף, כך שהם לא יצאו לבד. פתחו אותם ותזמנו מחדש.',
                actionLabel: 'הצג',
                href: '/social/history?status=paused',
              };

  /*
   * Greeting by time of day, in the app's own timezone. Cosmetic, but it is
   * what makes the header read as a product rather than an admin panel.
   */
  const greeting = (() => {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jerusalem' }).format(new Date()));
    if (hour < 5) return 'לילה טוב';
    if (hour < 12) return 'בוקר טוב';
    if (hour < 17) return 'צהריים טובים';
    return 'ערב טוב';
  })();
  return (
    <SocialShell
      title="לוח בקרה"
      subtitle={greeting}
      /*
       * No lede, no headerAction, no title block on THIS screen.
       *
       * Measured at 375x812: the header plus "לוח בקרה / סקירת הפעילות שלך
       * היום" plus a "+ פוסט חדש" put the first content pixel at y=154 of a
       * 751px usable viewport, and the answers to "is it running / when is the
       * next one / to which group" began at y=644 — below the fold. The
       * heading survives as sr-only and the button moved into the system card,
       * where it is the one filled blue control on the screen.
       */
      hideTitle
      /* One reading of the pause flag, shared by the header button and the
         system card's dot, instead of two polls 10 seconds out of step. */
      paused={data?.control.paused ?? null}
      onControlChanged={load}
    >
      {/* A failed read leaves the screen with nothing on it, so it has to
          carry its own way out. friendlyMessage() has already turned the
          exception into one Hebrew sentence (house rule 3); this adds the
          thing the owner can actually do about it. */}
      {error && (
        <div className="space-y-3">
          <Notice tone="error">{error}</Notice>
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => { setError(null); load(); }}>
              נסו שוב
            </Button>
          </div>
        </div>
      )}
      {!data && !error && (
        /* The silhouette of what is about to land, not a spinner over a
           different shape: the first block is a full-width card now, and a
           skeleton of four tiles alone made the page jump when the data came. */
        <div className="space-y-5">
          <Skeleton className="h-[248px] rounded-card" />
          <SkeletonTiles count={4} />
          <Skeleton className="h-[168px] rounded-card" />
        </div>
      )}
      {data && (
        /* One wrapper, deliberately. globals.css gives each DIRECT child of
           <main> a 340ms crm-child-in with staggered delays; promoting these
           blocks to direct children would opt every one of them into an
           entrance outside this product's 150-250ms band. */
        <div className="space-y-5">
          {/*
            The only alert bar left.
            `paused`, `stalled` and `needsHuman` all moved into the system
            card, because they ARE the system state — said twice, 300px apart,
            in two vocabularies. One needsHuman bar measured 104px and could
            stack with the other three. This one stays a bar because it is not
            the owner's system state: it is a Meta-side, time-boxed fact that
            clears itself.
          */}
          {data.control.rateLimitedUntil && new Date(data.control.rateLimitedUntil) > new Date() && (
            <AlertBar tone="warn" title="Meta ביקשה להאט" body={`הפרסום יתחדש אוטומטית ב-${stampText(data.control.rateLimitedUntil)}.`} />
          )}

          {/* 0 — only on a brand-new install, and only until the first
              publication exists: the three prerequisites, in order. It reads
              its own done/not-done from the same data the tiles below use. */}
          <SetupChecklist
            hasTargets={data.activeTargets > 0}
            workerOnline={data.workerOnline}
            hasPublications={summary.total > 0}
          />

          {/* 1 — IS IT WORKING, how much of today's own ceiling has gone out,
              when is the next one and to which group. Unconditional: it used
              to be the else-branch of a ternary, so on a morning with an empty
              queue the screen carried no system state at all. */}
          <LiveQueueHero
            systemState={systemState}
            publishedToday={data.today}
            dailyTarget={data.limits.maxPerDay}
            pendingCancellable={pending}
            nextAt={data.upcoming[0]?.scheduled_at ?? null}
            nextTargetName={data.upcoming[0]?.target?.name ?? null}
            nextTarget={data.upcoming[0]?.target ?? null}
            inFlight={summary.inFlight}
            workerOnline={data.workerOnline}
            intervention={intervention}
            onRunNow={runNow}
            onResume={() => act('resume', () => setPaused(false), 'הפרסום חודש.')}
            busy={busy === 'run'}
            resumeBusy={busy === 'resume'}
            onTune={() => setTunerOpen(true)}
          />

          {/* 2 — how many. The card above answers yes/no; this row answers how
              much, and that split is the whole hierarchy. Colour marks the
              status, not the tile. A tile whose value is 0 goes neutral — a
              red zero is noise, not a warning. */}
          <section>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 [&>*]:min-w-0">
              <StatCard
                tone={data.today ? 'good' : 'neutral'}
                label="פורסמו היום"
                value={data.today}
                sub={`מתוך ${data.limits.maxPerDay} שהגדרתם`}
                href="/social/history?status=published"
              />
              {/* Tiles 2 and 3 together are every row that has not finished,
                  each counted once (status.ts): what moves on its own, and
                  what will not move until the owner acts. They used to leave
                  publishing, awaiting_confirmation and paused out of both.

                  Tile 3 is named "דורשים טיפול" but MUST stay summary.needsHuman.
                  Narrowing it to counts.needs_attention — which the label
                  invites — would hide awaiting_confirmation and manual_pending
                  from the control centre and break the invariant that
                  queued + needsHuman === open (invariants.ts). */}
              <StatCard
                tone={summary.queued ? 'brand' : 'neutral'}
                label="ממתינים בתור"
                value={summary.queued}
                sub="יוצאים לפי התזמון"
                href="/social/history?status=scheduled"
              />
              <StatCard
                tone={summary.needsHuman ? 'warn' : 'neutral'}
                label="דורשים טיפול"
                value={summary.needsHuman}
                /* Every other tile's sub-line describes its OWN figure. This
                   one used to print the number of active targets, which has
                   nothing to do with the count above it — "6" over "43 יעדים
                   פעילים" reads as "6 of 43". */
                sub={summary.needsHuman ? 'לא יזוזו עד שתטפלו' : 'אין מה לעשות כרגע'}
                href="/social/history?status=needs_attention"
              />
              <StatCard
                tone={summary.failed ? 'bad' : 'neutral'}
                label="נכשלו"
                value={summary.failed}
                /* The chip REPLACES the sub-line rather than stacking under
                   it, so only this tile's row grows and its neighbour grows
                   with it — CSS grid keeps the pair level. It is a <span>
                   inside the tile's own link, never a nested anchor. */
                chipLabel={summary.failed ? 'טפל עכשיו' : undefined}
                sub={summary.skipped ? `ועוד ${summary.skipped} דולגו` : 'סך הכול'}
                href="/social/history?status=failed"
              />
            </div>
          </section>

          {/* 3 — what the current round is doing. No countdown on this card:
              its next instant comes from a different row than the system
              card's, and two clocks 200px apart showing two times is the
              contradiction this module exists to prevent. */}
          {featured && (
            <LiveCampaignHero
              campaign={featured.campaign}
              state={featured.state}
              busy={busy?.startsWith('camp')}
              onPause={() => act('camp-pause', () => pauseCampaign(featured.campaign.id, true), 'הסבב הושהה.')}
              onResume={() => act('camp-resume', () => pauseCampaign(featured.campaign.id, false), 'הסבב ממשיך.')}
              onReset={() => resetRun(featured.campaign.id, featured.campaign.name, featured.state)}
              onTune={() => setTunerOpen(true)}
              /* "Now" on that card is a claim about a machine, so it is made
                 from a machine fact rather than from the clock. */
              workerOnline={data.workerOnline}
              /* ...and it must also know when EVERYTHING is held. Without this
                 the card read "רץ" with a live dot directly under a header
                 saying "המשך הכול". */
              globalPaused={data.control.paused}
              targetCount={featuredTargetCount}
              startedAt={featured.state.startedAt}
              /* The post this run publishes. listQueue already selects the post
                 with its media, so the cover costs no extra read. */
              media={featuredMedia ?? data.upcoming.find((r) => r.campaign_id === featured.campaign.id)?.post?.media ?? null}
            />
          )}

          {/* 4 — four taps, compact. The mockup's "statistics" tile points at
              /social/history, because /social/stats does not exist and
              history IS the reports screen in this product. */}
          <QuickActions />

          {/* 5 — reference material, below the answers. */}
          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Card
              title="הפרסומים הקרובים"
              /* The exact queue count, not this array's length: the array is
                 capped at UPCOMING_LIMIT and printing its length as a total
                 was a ceiling presented as a fact. */
              subtitle={summary.queued ? `${summary.queued} ממתינים בתור` : undefined}
              action={
                <Link href="/social/history" className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-bold text-brand-400">
                  הכל
                </Link>
              }
            >
              {/* `total` is the same exact count as the subtitle. The footer
                  used to print `rows.length - shown`, and rows is the capped
                  read: with 61 queued it said "ועוד 34" where the real
                  remainder was 55 — 6 + 34 being exactly UPCOMING_LIMIT. */}
              <Timeline rows={data.upcoming} limit={6} total={summary.queued} />
            </Card>

            <BrowserStatusCard id="browser-status" onChanged={load} />
          </div>

          {data.manual.length > 0 && (
            <Card
              /* counts.manual_pending, not data.manual.length: that array is
                 read with limit 20, so 34 waiting rows titled the card "(20)".
                 The exact count was already in hand. */
              title={`ממתינים לפרסום ידני (${data.counts.manual_pending})`}
              subtitle="יעדים שאין להם פרסום אוטומטי — הכול מוכן, נשאר להדביק"
              action={
                <Link href={`/social/manual/${data.manual[0].id}`} className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-bold text-warning-400">
                  התחל ←
                </Link>
              }
            >
              <ul className="divide-y divide-ink-700">
                {data.manual.slice(0, 4).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p dir="auto" className="truncate font-bold text-mist-100">{item.target?.name}</p>
                      <p dir="auto" className="truncate text-xs text-mist-500">{item.post?.title || 'פוסט'}</p>
                    </div>
                    <Link href={`/social/manual/${item.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-warning-400 px-3.5 text-sm font-bold text-ink-950">
                      פתח
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/*
            LiveBoard is gone from this screen.

            Measured at 390px it was 1648px — 34% of a 4830px page — and 40 of
            the screen's 71 controls: a row-by-row console with per-row
            overflow menus, its own 4-second poller, and the same next-up rows
            the timeline directly above already listed. It is /social/history
            rendered inside the dashboard. The dashboard's job is to say THAT
            six publications are queued and WHEN the next one is; deciding
            row by row is the reports screen's. The component still exists and
            is still used by the post editor.
          */}

          <Card
            title="יומן פעילות"
            action={
              <Link href="/social/history" className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-bold text-brand-400">
                להיסטוריה
              </Link>
            }
          >
            <ActivityFeed entries={data.log} limit={6} />
          </Card>

          {/* The panic button — it pauses everything and cancels the whole
              queue. It is now rendered only when there is something to cancel:
              on a fresh install it sat at the foot of a 2620px scroll offering
              to delete publications that did not exist. */}
          {pending > 0 && (
            <div className="flex justify-center pb-2">
              <Button variant="ghost" busy={busy === 'stop'} onClick={() => discardQueue(true)} className="text-error-400">
                עצור ומחק את כל הפרסומים
              </Button>
            </div>
          )}
        </div>
      )}
      <QueueTunerSheet
        open={tunerOpen}
        onClose={() => setTunerOpen(false)}
        /* The campaign of the row the countdown was actually derived from —
           not the featured run's. The system card counts down to
           data.upcoming[0], which may belong to another campaign or to none,
           and scoping the sheet to `featured` tuned a queue the owner was not
           looking at. */
        campaignId={data?.upcoming[0]?.campaign_id ?? undefined}
        onChanged={load}
      />
      {confirm.dialog}
    </SocialShell>
  );
}
