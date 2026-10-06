'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityFeed } from '@/components/social/ActivityFeed';
import { CardSwiper } from '@/components/social/CardSwiper';
import { LiveCampaignHero, LiveQueueHero, type SystemState } from '@/components/social/LiveCampaignHero';
import { ActivityDetailSheet } from '@/components/social/ActivityDetailSheet';
import { QueueTunerSheet } from '@/components/social/QueueTunerSheet';
import { SetupChecklist } from '@/components/social/SetupChecklist';
import { QuickCommentsCard } from '@/components/social/QuickCommentsCard';
import { CommentTimeline } from '@/components/social/CommentTimeline';
import { CampaignCommentSheet } from '@/components/social/CampaignCommentSheet';
import { SocialShell } from '@/components/social/SocialShell';
import { Timeline } from '@/components/social/Timeline';
import { AlertBar, Button, ButtonLink, Card, ErrorState, Skeleton, SkeletonTiles, StatCard, useConfirm, useToast } from '@/components/social/ui';
import {
  callSocialApi,
  campaignStates,
  cancelAllScheduled,
  countFailuresSince,
  countCommentsDoneSince,
  countPublishedSince,
  getControl,
  getLimits,
  listActivity,
  listCampaigns,
  commentTotals,
  commentTotalsSince,
  listCommentsDone,
  listCommentQueue,
  listCommentsWaiting,
  listTimelineDone,
  listQueue,
  listTargets,
  countWaitingWithin,
  listWaitingForYouIds,
  listWorkers,
  pauseCampaign,
  queueCampaignComment,
  queueSummary,
  runCovers,
  getBrowserSettings,
  lastPublishedAt,
  saveCampaign,
  setCampaignRepeat,
  sendWorkerCommand,
  setPaused,
  stopCampaign,
  waitForWorkerCommand,
  type CommentTotals,
  type QueueRow,
  type TimelineRow,
} from '@/lib/social/client';
import { cancellableRows, percentFinished, type CampaignState } from '@/lib/social/campaign';
import { readRepeat, readSchedule, scheduleColumns, type CampaignRepeat, type CampaignSchedule, type ScheduleFields } from '@/lib/social/campaign-schedule';
import { OVERDUE_AFTER_SECONDS } from '@/lib/social/countdown';
import { AUTOMATIC_WAITING_STATUSES, EMPTY_QUEUE_SUMMARY, TERMINAL_STATUSES, type QueueSummary } from '@/lib/social/status';
import { keep as keepSeen, markAll, readSeen, same as sameSeen, unseen, writeSeen } from '@/lib/social/seen';
import { SNAPSHOT, readSnapshot, writeSnapshot } from '@/lib/social/snapshot';
import { addDaysISO, agree, counted, startOfZonedDay, startOfZonedWeek, zonedDateISO, zonedToUtc } from '@/lib/social/time';
import { stampText } from '@/components/social/DateTime';
import type { ActivityEntry, BrowserSettings, Campaign, ControlSettings, LimitsSettings, MediaItem, QueueStatus } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { AlertTriangleIcon, MessageIcon, PauseIcon, PlayIcon, PlusIcon, RepeatIcon, SendIcon, TrashIcon, UsersIcon } from '@/components/icons';

/**
 * How many upcoming rows the timeline reads. The card's subtitle prints the
 * EXACT queue count beside it rather than this array's length, so a ceiling is
 * never shown as a total.
 */
const UPCOMING_LIMIT = 40;

/*
 * HOW FAR AHEAD "הפרסומים הקרובים" LOOKS.
 *
 * "כאן הפרסומים הקרובים להראות רק את מה שעומד להתפרסם בתווך זמן של 24 שעות."
 *
 * The card read the queue's soonest forty rows whatever their date, so a run
 * spread over a fortnight filled it with publications from next Tuesday under
 * a heading that says "the upcoming ones". A day is the horizon the owner
 * actually acts on: everything in it is his morning, and everything past it is
 * the campaign screen's business.
 */
const UPCOMING_WINDOW_HOURS = 24;

/**
 * The ceiling on TODAY's finished publications, and it is a safety bound
 * rather than a window.
 *
 * It was six, then twelve behind a "show earlier" button, and the owner was
 * right that a button is not "לפי סדר רץ": a card headed מה קרה היום should
 * simply be the day.
 *
 * WHAT MADE THAT EXPENSIVE WAS NOT THE ROW COUNT. Every row came back through
 * QUEUE_SELECT — `*` on social_queue plus three joins — and `*` carries
 * rendered_text, the entire published post, per row. Two hundred publications
 * meant two hundred copies of the post body, plus every error, skip_reason,
 * screenshot path, comment note and metrics column, plus the joined post's
 * whole media array, re-fetched every thirty seconds on a metered phone, to
 * draw a name, a time and a coloured dot.
 *
 * listTimelineDone() asks for the five things the rail actually renders, so
 * the whole day costs a fraction of what six rows used to. The number here is
 * only what stops a pathological day (a stopped run can make hundreds of
 * skipped rows in a minute) from becoming an unbounded read — and it is
 * deliberately far above any real one, with the card's "הכל" going to the
 * history screen for anything past it.
 */
const DONE_LIMIT = 500;

interface DashboardData {
  counts: Record<QueueStatus, number>;
  /** The same counts rolled up through the one classification (status.ts). */
  summary: QueueSummary;
  today: number;
  /**
   * Failures and skips SINCE MIDNIGHT, not since the install.
   *
   * The tile used to print summary.failed, which has no date filter at all, so
   * it read 38 on a day nothing had been published — every failure the system
   * had ever recorded, sitting in a row of tiles whose first member says
   * "פורסמו היום". A number that never goes down is not a number anybody acts
   * on; it is a scar.
   */
  failedToday: number;
  skippedToday: number;
  /**
   * The same two figures for the WEEK, which is the line under each of them.
   *
   * The day alone was not enough once the row started resetting at midnight:
   * before the first publication of the morning every tile in it reads zero,
   * and a dashboard that says "nothing" on a week that published two hundred
   * posts is describing the clock rather than the work. Sunday, because that
   * is where the week starts on the owner's own calendar.
   */
  weekPublished: number;
  weekComments: number;
  upcoming: QueueRow[];
  /** Waiting publications due inside UPCOMING_WINDOW_HOURS — an exact count
      from the database, because `upcoming` is a capped read and its length
      would print the ceiling as a total. */
  upcomingSoon: number;
  /** Today's finished publications, newest first. Its own read, counted by
      nothing — the queue's numbers describe the queue, not this window. */
  doneToday: TimelineRow[];
  /** Publications with a comment asked for on them, across every round. */
  comments: QueueRow[];
  /* The ones still to be written, read on their own — see listCommentsWaiting. */
  commentsWaiting: QueueRow[];
  commentTotals: CommentTotals;
  /** Comments that FINISHED today — what the card's headline is about. */
  commentsToday: { done: number; failed: number; unverified: number };
  /** The successes, newest first, behind the card's green tile. */
  commentsDone: QueueRow[];
  limits: LimitsSettings;
  /** For the account-wide spacing rule the cards must respect — see scheduleReadout. */
  browser: BrowserSettings;
  lastPublished: string | null;
  /** Publications today has: gone out + still waiting before the next midnight. */
  plannedToday: number;
  control: ControlSettings;
  /**
   * Enabled targets, or null when the read was skipped.
   *
   * SetupChecklist is the only reader and it removes itself for good once
   * anything has been published, so on an established install this number is
   * not fetched at all — null says "not read", which is not the same fact as
   * zero and must not be printed as one.
   */
  activeTargets: number | null;
  /**
   * The IDs of every row waiting on a PERSON — the ones the orange bar counts.
   *
   * Read as IDs and not as a number because the bar can now be answered: see
   * lib/social/seen.ts. The count alone could only support a flag that hides
   * the next one too.
   */
  waitingForYou: string[];
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
  /**
   * The Facebook account the PC's browser profile is signed in as.
   *
   * A different fact from `workerOnline`, which only says the machine is
   * there. Every group publication goes out under this name, so on a shared
   * computer it is the one worth showing beside the connection state. Null
   * when no worker has reported one yet — never a placeholder.
   */
  fbAccount: { name: string; avatar: string } | null;
  profiles: { id?: string; name: string; kind?: 'profile' | 'page'; image?: string }[];
  workerId: string | null;
}

/**
 * The control centre. The order is the point: what is running right now,
 * then what is about to happen, and only then the numbers. A row of tiles
 * is a report; a campaign with a progress bar and a next-publication time is
 * something you can act on.
 */
export default function SocialDashboard() {
  /*
   * SEEDED FROM THE LAST TIME THIS SCREEN WAS OPEN — see
   * src/lib/social/snapshot.ts. This is the heaviest read in the product
   * (twenty-one requests), and tapping away to "קבוצות" and back used to pay
   * for all of it again behind a skeleton. It still pays for all of it; it
   * just does not make the owner watch.
   */
  const dashboardSeed = useState(() => readSnapshot<DashboardData>(SNAPSHOT.dashboard))[0];
  const [data, setData] = useState<DashboardData | null>(dashboardSeed);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /*
   * The queue tuner, and WHICH queue it is about.
   *
   * A bare boolean was enough while there was one doorway. With two — the
   * system panel, which is about data.upcoming[0], and the run card, which is
   * about the featured run — a single `campaignId` computed at the render of
   * the SHEET tuned whichever of those the expression happened to name,
   * regardless of which card was tapped. Those are different queues whenever
   * the soonest waiting row belongs to another run, so the scope travels with
   * the tap that opened it.
   */
  const [tuner, setTuner] = useState<{ campaignId?: string } | null>(null);
  /* Which publication the activity card was asked about. The sheet reads that
     one row on demand; nothing about it is fetched until it is opened. */
  const [detail, setDetail] = useState<string | null>(null);
  /* Which run the quick-comment sheet is writing for. The round itself and
     not its id, because the sheet is seeded from the round's own stored
     wording and spacing — an id would mean looking it up again. */
  const [commentFor, setCommentFor] = useState<Campaign | null>(null);
  /* Every featured run's cover, by campaign id. Read on their own, because the
     queue rows carry their post only while something is still scheduled — a
     finished run would lose its picture exactly when the owner looks to see
     what went out. One request for all of them; see runCovers(). */
  const [covers, setCovers] = useState<Record<string, MediaItem[]>>({});
  /*
   * THE SCHEDULE THE OWNER HAS JUST CHANGED, until the server agrees.
   *
   * This screen re-reads itself on a timer, and a poll in flight when the
   * switch is tapped returns the row as it was a second ago — so without this
   * the toggle would flip, snap back, and flip again when the write landed.
   * The patch is applied over the campaign on every render and dropped by the
   * effect below the moment a read comes back carrying the same values, which
   * is the only evidence that it is no longer needed.
   *
   * ONE CAMPAIGN AT A TIME, because one card draws it: the dashboard features
   * exactly one run. The campaigns screen, which draws many, keys its own by
   * id for the same reason.
   */
  const [schedulePatch, setSchedulePatch] = useState<{ id: string; columns: Required<ScheduleFields> } | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const scheduleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* The instant the last read SUCCEEDED — not the instant a tick fired. It is
     the only honest input to the "עודכן לפני…" line, and it stays where it was
     when a read fails, so a failed refresh cannot make the screen look fresh. */
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  /* The manual refresh's own in-flight flag — the interval has one of its own
     (`running` below) and a tap must not be able to stack reads on top of it. */
  const [refreshing, setRefreshing] = useState(false);
  /*
   * The publications waiting on a person that this device has already shown
   * him. Empty until the effect below reads it: localStorage does not exist on
   * the server, and seeding state from it during render is the one way to make
   * the first paint differ from the markup Next.js sent.
   */
  const [seen, setSeen] = useState<string[]>([]);
  const toast = useToast();
  const confirm = useConfirm();

  /* Latched, never unlatched: a queue that has ever held a row cannot go back
     to holding none, so once this is true the setup checklist is gone for the
     rest of the session and the read behind it is not worth making again. */
  const setupDone = useRef(false);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      /*
       * STARTED, NOT AWAITED — and this is one whole round trip off the time
       * between the tap and the screen.
       *
       * campaignStates() needs the live campaign ids, so it has to follow
       * listCampaigns(). The other nineteen reads below do not, and they used
       * to wait behind it anyway: `await listCampaigns()` blocked the batch,
       * so the cost was RTT(campaigns) + RTT(everything else) instead of the
       * longer of the two. On a phone that is a few hundred milliseconds,
       * every time this screen opens AND every thirty seconds after.
       *
       * The chain is unchanged — states still sees exactly the ids this
       * resolves to, and nothing reads `campaigns` before Promise.all hands it
       * back. Only the waiting is gone.
       */
      const campaignsPromise = listCampaigns();
      // Only a live campaign can be the one running right now, so the rollup
      // read stays proportional to what the hero can actually show.
      const statesPromise = campaignsPromise.then((cs) => campaignStates(cs.filter((c) => c.status !== 'archived').map((c) => c.id)));
      /*
       * The targets table is read for ONE boolean: whether the setup checklist
       * still has its first step open. That card removes itself for good once
       * anything has been published, and after that this was a full
       * `select('*')` over every group and page — plus listTargets()'s own
       * city-backfill UPDATEs — every 30 seconds, for a number no screen
       * renders. Skipped from then on; on a fresh install, where the checklist
       * IS on screen, it still reads every tick.
       */
      const needTargets = !setupDone.current;
      const [campaigns, states, queue, today, failures, weekPublished, weekComments, limits, control, targets, manual, waitingForYou, log, upcoming, upcomingSoon, doneToday, workers, comments, commentsWaiting, totals, commentsToday, commentsDone, browser, lastPublished, waitingToday] = await Promise.all([
        campaignsPromise,
        statesPromise,
        queueSummary(),
        countPublishedSince(startOfZonedDay(now).toISOString()),
        /* The same midnight the tile beside it uses — one instant, so the two
           numbers are about the same day. Asia/Jerusalem, from the browser's
           own zone, which is what startOfZonedDay reads. */
        countFailuresSince(startOfZonedDay(now).toISOString()),
        countPublishedSince(startOfZonedWeek(now).toISOString()),
        countCommentsDoneSince(startOfZonedWeek(now).toISOString()),
        /* countPublishedBetween(weekStart) used to run here on every 30s poll
           and `data.week` was rendered nowhere. One whole count query a
           minute, on a metered Israeli mobile plan, for a number no screen
           showed. */
        getLimits(),
        getControl(),
        needTargets ? listTargets() : Promise.resolve(null),
        listQueue({ status: ['manual_pending'], limit: 20 }),
        /* One column, no joins — see listWaitingForYouIds. It is the cheapest
           read in this batch and the only one that knows WHICH rows the
           orange bar is about. */
        listWaitingForYouIds(),
        listActivity(30),
        // Ascending, because the limit is applied after the sort: read
        // newest-first, these 40 would be the FURTHEST-OUT rows in the queue
        // and "הפרסומים הקרובים" would be showing the last publications while
        // calling the first of them the next one.
        listQueue({ status: AUTOMATIC_WAITING_STATUSES, limit: UPCOMING_LIMIT, order: 'asc' }),
        /* How many of those fall inside the day the card shows. A head count:
           no rows cross the wire, and it is the only honest source for the
           footer's "ועוד N אחריהם" once the list is a window. */
        countWaitingWithin(new Date(Date.now() + UPCOMING_WINDOW_HOURS * 3_600_000).toISOString()),
        /*
         * Today's finished rows, newest first — the strip turns them round.
         *
         * `until: now` is load-bearing and its absence was a bug on screen:
         * the read is ordered by scheduled_at DESCENDING (that is what "the
         * most recent" means for rows that are already over), and a row can
         * be terminal while its slot is still in the FUTURE — a duplicate
         * skipped before its turn came, a run stopped mid-flight. Without the
         * bound those future slots sorted to the top and took every place, so
         * the strip showed four 18:15 "דולג" rows above publications waiting
         * at 17:40, and nothing that had actually gone out appeared at all.
         * The same trap listQueue's own comment describes, from the other end.
         */
        listTimelineDone({ since: startOfZonedDay(now).toISOString(), until: now.toISOString(), limit: DONE_LIMIT }),
        listWorkers(),
        listCommentQueue(),
        listCommentsWaiting(),
        commentTotals(),
        /* The same midnight every other "today" on this screen uses. */
        commentTotalsSince(startOfZonedDay(now).toISOString()),
        listCommentsDone(),
        /* THE OTHER HALF OF "הבא בתור". rules.ts holds a row for the later of
           the campaign's own gap and an account-wide one, and the cards knew
           only the first — so they printed a minute the engine would not
           publish at. Two cheap reads, in the same round trip as everything
           else, and scheduleReadout can answer the question the engine
           actually asks. */
        getBrowserSettings(),
        lastPublishedAt(),
        /*
         * WHAT TODAY STILL HOLDS — "ואז יתאפס".
         *
         * Rows waiting whose instant falls before the NEXT local midnight,
         * which with countPublishedSince above makes "how many publications
         * today has": the ones that went out plus the ones still to go.
         *
         * The boundary is built from the calendar date in the zone and not
         * from `now + 24h`: the two Israeli clock changes make one day 23
         * hours and another 25, and "today" is a date either way. It is also
         * why this resets with no job to reset it — tomorrow the boundary is
         * tomorrow's, and this morning's publications are no longer counted
         * by countPublishedSince.
         */
        countWaitingWithin(zonedToUtc(addDaysISO(zonedDateISO(now), 1), '00:00').toISOString())
      ]);
      if (queue.summary.total > 0) setupDone.current = true;
      const next: DashboardData = {
        counts: queue.counts,
        summary: queue.summary,
        today,
        failedToday: failures.failed,
        skippedToday: failures.skipped,
        weekPublished,
        weekComments,
        upcoming,
        upcomingSoon,
        doneToday,
        comments,
        commentsWaiting,
        commentTotals: totals,
        commentsToday,
        commentsDone,
        limits,
        browser,
        lastPublished,
        /* Done plus still to come. Never smaller than what has gone out,
           because what has gone out is one of its two halves. */
        plannedToday: today + waitingToday,
        control,
        activeTargets: targets ? targets.filter((t) => t.enabled).length : null,
        waitingForYou,
        manual,
        log,
        campaigns,
        states,
        workerOnline: workers.some((w) => w.online),
        workerNeedsAuth: workers.some((w) => w.online && (w.status === 'needs_attention' || w.browser_state === 'needs_auth')),
        /* The live worker's account first; failing that, the most recent one
           that ever reported a name — which is still true about the machine,
           just not confirmed this minute. */
        fbAccount: (() => {
          const w = workers.find((x) => x.online && x.fb_user_name) ?? workers.find((x) => x.fb_user_name);
          return w?.fb_user_name ? { name: w.fb_user_name, avatar: w.fb_avatar_url ?? '' } : null;
        })(),
        /* The identities that machine last read out of Facebook's menu, from
           the row this screen has already fetched. The picker in the chip
           renders these; nothing here goes and asks Facebook. */
        profiles: (workers.find((x) => x.online) ?? workers[0])?.fb_profiles ?? [],
        workerId: (workers.find((x) => x.online) ?? workers[0])?.id ?? null,
      };
      setData(next);
      /* Only on a read that came back whole — a half-failed load must never be
         what the next visit opens on. */
      writeSnapshot<DashboardData>(SNAPSHOT.dashboard, next);
      setUpdatedAt(new Date());
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

  /*
   * THE DAY AHEAD — the rows "הפרסומים הקרובים" actually draws.
   *
   * Filtered here rather than in the read, and that is deliberate: `upcoming`
   * is already ordered soonest-first and capped, so everything inside the
   * window is at the front of it and nothing inside the window can be lost by
   * cutting the tail. The exact count for the window comes from the database
   * (data.upcomingSoon), because this array's length is a ceiling.
   *
   * A row with no instant at all cannot be placed in a window and is not
   * dropped quietly — it keeps its place, because "soon" is a claim about
   * when, and a row with no when has not made that claim either way.
   */
  const soonCutoff = Date.now() + UPCOMING_WINDOW_HOURS * 3_600_000;
  const soon = (data?.upcoming ?? []).filter((r) => !r.scheduled_at || Date.parse(r.scheduled_at) <= soonCutoff);

  /*
   * "N פרסומים ממתינים לכם" — AND WHETHER HE HAS ALREADY BEEN SHOWN THEM.
   *
   * These rows move only when a person moves them, so the bar about them used
   * to be permanent: looked at, understood, left alone deliberately, and still
   * repeated on every load. The count below is of the ones he has NOT been
   * shown, so pressing "הצג" once answers it — and a row that arrives
   * afterwards raises it again, with its own number. lib/social/seen.ts holds
   * the why.
   *
   * COVERAGE FIRST. listWaitingForYouIds() is capped, and a capped list would
   * let one tap mark "everything" as seen while holding only the first slice
   * of it — hiding rows that were never on screen. When the list and the
   * counted total disagree the whole mechanism stands down: the bar counts the
   * total, as it always did, and cannot be dismissed at all.
   */
  const waitingIds = data?.waitingForYou ?? [];
  const waitingCovered = !!data && waitingIds.length === summary.needsHuman;
  const waitingForYou = waitingCovered ? unseen(waitingIds, seen).length : summary.needsHuman;

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  /*
   * Narrowed to what is still waiting, on every load, and written back.
   *
   * This is what lets the same row raise the bar a second time: handled, it
   * leaves the set; stuck again later, it is unseen again and says so. It is
   * also the only thing stopping the key from growing for as long as this
   * browser is used. `sameSeen` keeps it from writing — and re-rendering — on
   * every one of the 30-second polls that change nothing.
   */
  useEffect(() => {
    if (!data || !waitingCovered) return;
    const next = keepSeen(seen, data.waitingForYou);
    if (sameSeen(next, seen)) return;
    setSeen(next);
    writeSeen(next);
  }, [data, waitingCovered, seen]);

  /* Pressing "הצג" means "I am looking at these now" — and the screen it
     opens lists exactly these rows, which is what makes that true. */
  const markWaitingSeen = useCallback(() => {
    if (!data || !waitingCovered) return;
    const next = markAll(data.waitingForYou);
    setSeen(next);
    writeSeen(next);
  }, [data, waitingCovered]);

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
      title: pending ? `למחוק ${counted(pending, 'פרסום אחד', 'פרסומים')} מהתור?` : 'למחוק את התור?',
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
      toast(n ? counted(n, 'פרסום אחד בוטל.', 'פרסומים בוטלו.') : 'לא היו פרסומים בתור.', 'info');
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
  /**
   * MOVE THE PUBLISHING ONTO ANOTHER IDENTITY, from the chip at the top.
   *
   * Confirmed, and the confirmation names the two things that actually change
   * — who every future post is signed by, and which groups are reachable at
   * all, since an identity is a member of its own groups and not of another's.
   * For a Page there is a third: most groups do not accept Pages, and those
   * are skipped rather than published under a name nobody chose.
   *
   * The NAME travels, because Facebook's menu rows carry no id. It is checked
   * against the machine's own reading of that menu before anything is pressed
   * — see the switch command in social-worker.ts. A name from a screen is a
   * request, never a permission.
   */
  async function switchProfile(name: string) {
    const kind = data?.profiles.find((p) => p.name === name)?.kind;
    const ok = await confirm.ask({
      title: `לעבור ל"${name}"?`,
      body: (
        <>
מהרגע הזה כל פרסום וכל תגובה ייצאו מהזהות הזאת.
          {' '}אפשר לפרסם רק לקבוצות שהיא חברה בהן, ולכן ייתכן שרשימת הקבוצות שנפרסם אליהן תשתנה.
          {kind === 'page' && (
            <>
              {' '}בנוסף: פייסבוק מאפשרת לדף לפרסם רק בקבוצות שמנהל הקבוצה אישר בהן פרסום מדפים.
              {' '}קבוצה שלא מאפשרת תדולג ותופיע ברשימה עם הסיבה — היא תישאר פעילה ותמשיך לעבוד מהפרופיל האישי.
            </>
          )}
        </>
      ),
      confirmLabel: 'עבור',
    });
    if (!ok) return;
    try {
      const { id } = await sendWorkerCommand(data?.workerId ?? null, 'switch', { name });
      toast('הבקשה נשלחה למחשב. המעבר לוקח כמה שניות.');
      await load();
      /*
       * AND THEN SAY HOW IT WENT.
       *
       * This used to end at the toast above: the command went off and the screen
       * never mentioned it again, so a switch Facebook refused looked exactly
       * like one that worked — the name simply stayed as it was, and the reason
       * sat in the activity log. The card's own picker is the same tap as the
       * bar's, so it gets the same answer, from the same wait.
       */
      const cmd = await waitForWorkerCommand(id);
      await load();
      if (cmd?.status === 'failed') setError(cmd.result || `המעבר ל"${name}" לא הושלם.`);
      else if (cmd?.status === 'done') toast(cmd.result || `עברנו ל"${name}".`);
      else toast('הבקשה ממתינה במחשב. ברגע שהמעבר יקרה, השם יתעדכן כאן.');
    } catch (err) {
      setError(friendlyMessage(err, 'הפקודה נכשלה.'));
    }
  }

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
      const queued = r.planned ? `${counted(r.planned, 'פרסום אחד נכנס', 'פרסומים נכנסו', 'שני פרסומים נכנסו')} לתור. ` : '';
      toast(
        r.ran
          ? `${queued}הריצה הסתיימה: ${r.published} ${agree(r.published, 'פורסם', 'פורסמו')}, ${r.skipped} ${agree(r.skipped, 'דולג', 'דולגו')}, ${r.failed} ${agree(r.failed, 'נכשל', 'נכשלו')}.`
          : `${queued}הפרסום מושהה: ${r.reason}`,
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

  /*
   * ───────── THE RUNS ON THIS SCREEN, in the order they deserve ───────────
   *
   * "עכשיו אם אני מריץ עוד קמפיין אני רוצה שיהיה ניתן לראות אותה גם בעמוד
   *  הזה בסגנון SWIPE גלילה שמאלה ימינה."
   *
   * This used to pick ONE — `[0]` of exactly this sort — and a second live
   * campaign simply was not on the dashboard at all. The sort is unchanged, so
   * the card that was here yesterday is still the first one a thumb lands on;
   * what changed is that the rest are now a swipe away instead of nowhere.
   *
   * THE SORT, UNTOUCHED: running first, then the one needing a person, then
   * paused, then not started, then everything finished — and inside a rank,
   * the least finished first, because a round at 10% is the one still worth
   * watching.
   *
   * AND IT IS CAPPED. Each card draws a cover, a schedule block and a strip;
   * twenty of them is a 9,000px scroll container built on every poll, on a
   * screen whose speed is the thing the owner has complained about by name.
   * Eight is well past what a swipe strip is for — "קמפיינים" lists them all,
   * one tap away, and the tiles above already count them.
   */
  const FEATURED_LIMIT = 8;
  const runs = data
    ? data.campaigns
        .map((c) => ({ campaign: c, state: data.states[c.id] }))
        .filter((x): x is { campaign: Campaign; state: CampaignState } => Boolean(x.state?.progress.total))
        .sort((a, b) => {
          const rank = (s: CampaignState) => (s.state === 'running' ? 0 : s.state === 'needs_attention' ? 1 : s.state === 'paused' ? 2 : s.state === 'not_started' ? 3 : 4);
          const d = rank(a.state) - rank(b.state);
          if (d) return d;
          return percentFinished(a.state.progress) - percentFinished(b.state.progress);
        })
        .slice(0, FEATURED_LIMIT)
    : [];

  /*
   * EVERY CARD'S COVER, IN ONE READ.
   *
   * The id list is joined into a string so the effect compares by VALUE: the
   * array is rebuilt on every render and a dependency on the array itself
   * would re-read the covers several times a second.
   */
  const runIds = runs.map((r) => r.campaign.id).join(',');
  useEffect(() => {
    const ids = runIds ? runIds.split(',') : [];
    if (!ids.length) {
      setCovers({});
      return;
    }
    let alive = true;
    runCovers(ids)
      .then((m) => {
        if (alive) setCovers(m);
      })
      // A missing cover is not worth an error on screen: the card falls back
      // to the queue row's post, and failing that shows no tile at all.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [runIds]);

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
  const targetCountOf = (state: CampaignState): number =>
    new Set([...state.upcoming, ...state.done].map((r) => r.target_id)).size;

  /*
   * ───────── writing the featured run's schedule ──────────────────────────
   *
   * DEBOUNCED, OPTIMISTIC, AND PUT BACK IF IT FAILS — the same three rules the
   * campaigns screen writes this record by, because it is the same record and
   * a second policy for it is a second truth.
   *
   * DEBOUNCED: the editor under the card is seven day chips and three selects,
   * and a schedule is set by a burst of taps. One PATCH per tap would be ten
   * writes to one row in four seconds, each one racing the last.
   *
   * OPTIMISTIC: the control answers the thumb, not the network.
   *
   * AND PUT BACK: a row that refused the write (most likely cause, and what
   * errors.ts will say: supabase/social-latest.sql has not been run) must not
   * leave the card showing a window the engine has never heard of. That is the
   * screen promising something the machine will not do, which is the one class
   * of bug this module keeps being rewritten to prevent.
   */
  useEffect(
    () => () => {
      if (scheduleTimer.current) clearTimeout(scheduleTimer.current);
    },
    [],
  );

  /* The patch has done its job once a read comes back carrying the same
     values. Comparing what the row RESOLVES to rather than the raw columns:
     a database that has not run the migration returns no columns at all, and
     readSchedule() turning that into the defaults is the honest answer to
     "what is this campaign set to". */
  useEffect(() => {
    if (!schedulePatch || !data) return;
    const row = data.campaigns.find((c) => c.id === schedulePatch.id);
    if (!row) return;
    const live = scheduleColumns(readSchedule(row));
    const want = schedulePatch.columns;
    if (
      live.schedule_enabled === want.schedule_enabled &&
      live.schedule_start === want.schedule_start &&
      live.schedule_end === want.schedule_end &&
      live.schedule_gap_minutes === want.schedule_gap_minutes &&
      live.schedule_days.join(',') === want.schedule_days.join(',')
    ) {
      setSchedulePatch(null);
    }
  }, [data, schedulePatch]);

  const changeSchedule = useCallback(
    (campaign: Pick<Campaign, 'id' | 'name'>, next: CampaignSchedule) => {
      const columns = scheduleColumns(next);
      setSchedulePatch({ id: campaign.id, columns });
      if (scheduleTimer.current) clearTimeout(scheduleTimer.current);
      scheduleTimer.current = setTimeout(async () => {
        setScheduleBusy(true);
        try {
          await saveCampaign({ id: campaign.id, name: campaign.name, ...columns });
        } catch (err) {
          setSchedulePatch(null);
          toast(friendlyMessage(err, 'שמירת התזמון נכשלה.'), 'error');
        } finally {
          setScheduleBusy(false);
        }
      }, 600);
    },
    [toast],
  );

  /* What a card draws: the stored row, with the owner's un-acknowledged change
     laid over it. readSchedule() validates every field either way, so a row
     written by an older version still resolves to a usable schedule. */
  const scheduleOf = (campaign: Campaign): CampaignSchedule =>
    readSchedule(schedulePatch?.id === campaign.id ? { ...campaign, ...schedulePatch.columns } : campaign);

  /*
   * CHZARA — written straight through, with NO debounce, and that difference
   * is deliberate.
   *
   * The schedule above is five controls the owner drags around, so it is
   * coalesced into one write 600ms after he stops. This is one switch with one
   * consequence outside the campaign — a weekly schedule row that will publish
   * to two hundred groups tomorrow morning — and a change like that is
   * confirmed the moment it is made, not six hundred milliseconds later when
   * he may already be on another screen. The reload afterwards is what makes
   * the card show the next round it just armed.
   */
  const changeRepeat = useCallback(
    async (campaign: Pick<Campaign, 'id' | 'name'>, next: CampaignRepeat) => {
      setScheduleBusy(true);
      try {
        await setCampaignRepeat(campaign, next, scheduleOf(campaign as Campaign));
        await load();
        toast(
          next.enabled
            ? `"${campaign.name}" יחזור על עצמו בכל יום פרסום`
            : `החזרה היומית של "${campaign.name}" כובתה — הסבב הנוכחי ימשיך כרגיל`,
          next.enabled ? 'info' : 'success',
        );
      } catch (err) {
        toast(friendlyMessage(err, 'שמירת החזרה נכשלה.'), 'error');
      } finally {
        setScheduleBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  );

  /* Which card is busy, rather than all of them. `act()` keys are now
     "camp-pause:<id>", so a pause on one run cannot grey out the two beside
     it in the strip. */
  const campBusy = (id: string): boolean => Boolean(busy?.startsWith('camp') && busy.endsWith(`:${id}`));

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
      : /*
         * THE PC BEING OFF IS NOW AN INTERVENTION IN ITSELF, not only once a
         * publication is already late.
         *
         * `stalledSince` waits for a row to go past due, and that was right
         * while Facebook Pages existed: the server published those through the
         * Graph API with no PC involved, so a sleeping machine slowed the
         * queue rather than stopping it. Pages are gone. EVERY publication this
         * product makes now goes out through the browser on that machine, so
         * with it off nothing will move — and the screen was still reading
         * "המערכת פעילה" over a queue that could not advance, right up until
         * the first row was two minutes late.
         */
        (!data.workerOnline && summary.queued > 0) ||
        stalledSince ||
        /* The ones he has not been shown yet — not every one that exists.
           Dismissing the bar has to take the state with it, or the header
           keeps its amber dot and the panel keeps a headline reading "נדרשת
           פעולה שלכם" with nothing under it saying which. */
        waitingForYou > 0 ||
        data.workerNeedsAuth ||
        data.counts.paused > 0
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
            href: '/social/settings#browser-status',
          }
        : !data.workerOnline && summary.queued > 0
          ? {
              title: 'התוכנה במחשב לא פועלת',
              body: `${counted(summary.queued, 'פרסום אחד ממתין בתור', 'פרסומים ממתינים בתור', 'שני פרסומים ממתינים בתור')} ואף אחד מהם לא יֵצא: הפרסום לקבוצות נעשה מהדפדפן שעל המחשב שלכם. פתחו את התיקייה ולחצו פעמיים על start-worker.cmd, והשאירו את החלון פתוח.`,
              actionLabel: 'מה לעשות',
              href: '/social/settings#browser-status',
            }
          : data.workerNeedsAuth
          ? {
              title: 'פייסבוק מבקשת אימות במחשב',
              body: 'התוכנה במחשב פועלת, אבל חלון הדפדפן שלה מחכה שתתחברו לפייסבוק. עד אז פרסום לקבוצות לא יצא.',
              actionLabel: 'מה לעשות',
              href: '/social/settings#browser-status',
            }
          : waitingForYou > 0
            ? {
                title: counted(waitingForYou, 'פרסום אחד ממתין לכם', 'פרסומים ממתינים לכם'),
                body: 'בדרך כלל פייסבוק ביקשה אימות בחלון הדפדפן שבמחשב, או שהפרסום מחכה לאישור שלכם.',
                actionLabel: 'הצג',
                /* ?status=needs_attention lands on the history screen's
                   'ידניים' group, which is NEEDS_HUMAN_STATUSES entire — the
                   same three statuses counted here. The list it opens is
                   therefore exactly the rows being marked as shown. */
                href: '/social/history?status=needs_attention',
                /* Only offered while the ID list covers the count; see
                   waitingCovered. Without it the bar behaves as it always
                   did. */
                onAction: waitingCovered ? markWaitingSeen : undefined,
              }
            : {
                title: counted(data.counts.paused, 'פרסום אחד תקוע', 'פרסומים תקועים'),
                body: 'הם נמצאים בסטטוס שאף worker לא אוסף, כך שהם לא יצאו לבד. פתחו אותם ותזמנו מחדש.',
                actionLabel: 'הצג',
                href: '/social/history?status=paused',
              };

  return (
    <SocialShell
      title="לוח בקרה"
      /* PULL DOWN TO RELOAD. The same loader the timer and every action on
         this screen already call, so a pulled refresh and an automatic one
         cannot disagree about what "current" means. */
      onRefresh={load}
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
      /* The bar greets the owner by name; this screen has already read the
         worker row for its system card, so it hands the same object over
         rather than making the bar fetch it again. */
      account={data?.fbAccount ?? null}
      /* The state is decided here, once, and rendered by whoever shows it —
         the bar at the top of every screen, now, instead of a card 300px
         below the bar saying the same words. */
      systemState={data ? systemState : undefined}
      onControlChanged={load}
    >
      {/* A failed read leaves the screen with nothing on it, so it has to
          carry its own way out. friendlyMessage() has already turned the
          exception into one Hebrew sentence (house rule 3); this adds the
          thing the owner can actually do about it. */}
      {error && <ErrorState message={error} onRetry={() => { setError(null); load(); }} />}
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
            hasTargets={(data.activeTargets ?? 0) > 0}
            workerOnline={data.workerOnline}
            hasPublications={summary.total > 0}
          />

          {/*
            THE TWO THINGS THE OWNER OPENS THIS SCREEN TO DO.

            Writing a post was a small button inside the system panel, and
            pausing everything was a 13px control in the header — the two
            highest-intent actions on the product, both of them incidental.
            They are one row of two now, at the top, where a thumb lands.

            The pause here and the one in the header are the SAME switch and
            render the same value: this screen hands its `control.paused` to
            SocialShell (see `paused=` below), so the two cannot disagree the
            way two independent polls would.
          */}
          <div className="grid grid-cols-2 gap-2.5 [&>*]:min-w-0">
            <ButtonLink href="/social/posts/new" size="lg" variant={data.control.paused ? 'secondary' : 'primary'} className="flex-col !items-start gap-0 py-3">
              <span className="flex items-center gap-1.5 text-[15px] font-extrabold leading-5">
                <PlusIcon aria-hidden className="h-4 w-4" />
                פוסט חדש
              </span>
              <span className="text-[11px] font-semibold leading-[15px] opacity-80">צור ותזמן פוסט לקבוצות</span>
            </ButtonLink>
            <Button
              size="lg"
              variant={data.control.paused ? 'primary' : 'secondary'}
              busy={busy === 'pause-all' || busy === 'resume'}
              className="flex-col !items-start gap-0 py-3"
              onClick={() =>
                data.control.paused
                  ? act('resume', () => setPaused(false), 'הפרסום חודש.')
                  : act('pause-all', () => setPaused(true), 'הפרסום הושהה. התור נשמר.')
              }
            >
              <span className="flex items-center gap-1.5 text-[15px] font-extrabold leading-5">
                {data.control.paused ? <PlayIcon aria-hidden className="h-4 w-4" /> : <PauseIcon aria-hidden className="h-4 w-4" />}
                {data.control.paused ? 'הפעל פרסום' : 'השהה פרסום'}
              </span>
              <span className="text-[11px] font-semibold leading-[15px] opacity-80">
                {data.control.paused ? 'המשך את התור מהמקום שנעצר' : 'עצור זמנית את המערכת'}
              </span>
            </Button>
          </div>

          {/*
            1 — HOW MANY, AND IT COMES FIRST NOW.

            It used to sit under the system card, on the reasoning that
            "is it working" outranks "how much". That was right while the card
            was the only place a number lived. It stopped being right once the
            row started resetting at midnight: the owner opens this screen to
            see the day, and the day was one scroll down, under a card that on
            a quiet morning says nothing but "אין פרסום מתוזמן". Asked for
            directly — "את הריבועים של הפרסום תעלה אותם למעלה".

            Colour marks the status, not the tile. A tile whose value is 0 goes
            neutral — a red zero is noise, not a warning. */}
          <section>
            {/* Four across on a phone, not two. The row is scanned as one
                line of numbers, and halving its height is what let the two
                primary actions above it sit above the fold. */}
            <div className="grid grid-cols-4 gap-2 md:gap-2.5 [&>*]:min-w-0">
              <StatCard
                dense
                icon={<SendIcon aria-hidden className="h-4 w-4" />}
                tone={data.today ? 'good' : 'neutral'}
                label="פורסמו היום"
                value={data.today}
                sub={`מתוך ${data.limits.maxPerDay} שהגדרתם`}
                /* The week under the day, asked for by name. On a morning
                   before the first publication the figure above is 0 and the
                   tile reads as no progress at all; this is the line that says
                   otherwise, and it is green because it only ever counts
                   things that worked. */
                note={data.weekPublished ? `${data.weekPublished} מתחילת השבוע` : undefined}
                /* &range=1, because this tile alone is a TODAY count
                   (countPublishedSince(startOfZonedDay)). The other three are
                   all-time head counts and history opens "all" for them; this
                   one used to do the same, so tapping "7" opened every
                   publication ever made. */
                href="/social/history?status=published&range=1"
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
              {/* THE RESET LIVES ON THE NUMBER IT RESETS.
                  It was only at the foot of the screen, beside "pause", where
                  it is found by somebody who already knows it exists. The
                  question "why are there 214 things in my queue" is asked
                  while looking at this tile, and the answer belongs here.
                  Same confirmation and same write as the one below — one
                  implementation, so the count in the question stays the count
                  the write delivers. */}
              <StatCard
                dense
                icon={<UsersIcon aria-hidden className="h-4 w-4" />}
                tone={summary.queued ? 'brand' : 'neutral'}
                label="ממתינים בתור"
                value={summary.queued}
                /* "יוצאים לפי התזמון" is true of this figure and false of the
                   rows that need a person, so those are named rather than
                   folded in. It is also the only place in the row they still
                   appear now that their own tile is gone. */
                sub={summary.needsHuman ? `ועוד ${summary.needsHuman} דורשים אתכם` : 'יוצאים לפי התזמון'}
                href="/social/history?status=scheduled"
                action={
                  pending
                    ? {
                        label: 'אפס',
                        title: `אפס את התור (${pending})`,
                        busy: busy === 'discard',
                        onClick: () => void discardQueue(false),
                      }
                    : undefined
                }
              />
              {/*
                TODAY, like the tile at the other end of this row.
                summary.failed is an ALL-TIME count, and printing it here put
                "38 נכשלו" beside "0 פורסמו היום" — one tile about this
                morning, the tile three across about every day since the
                product existed, same row, same size. The owner read the 38 as
                today's and asked why. They were reading the row correctly.

                The old failures are not deleted and not hidden: the tile links
                into the history, which still holds every one of them. What
                changes is that this row is now four numbers about one day, and
                tomorrow morning it starts from zero. */}
              <StatCard
                dense
                icon={<AlertTriangleIcon aria-hidden className="h-4 w-4" />}
                tone={data.failedToday ? 'bad' : 'neutral'}
                label="נכשלו היום"
                value={data.failedToday}
                /* The chip REPLACES the sub-line rather than stacking under
                   it, so only this tile's row grows and its neighbour grows
                   with it — CSS grid keeps the pair level. It is a <span>
                   inside the tile's own link, never a nested anchor. */
                chipLabel={data.failedToday ? 'טפל עכשיו' : undefined}
                sub={data.skippedToday ? `ועוד ${data.skippedToday} ${agree(data.skippedToday, 'דולג', 'דולגו')}` : 'מאז חצות'}
                /* &range=1 for the same reason the published tile carries it:
                   a tile that counts today must open today. */
                href="/social/history?status=failed&range=1"
              />
              {/*
                COMMENTS, WHERE "דורשים טיפול" USED TO BE.

                That tile read 0 on every screenshot the owner has sent, and a
                tile that is always zero teaches people to stop reading the
                row. Removing it does not hide the work: a publication waiting
                for a person raises the intervention banner at the top of this
                screen, which is louder than a tile, and the queue tile below
                names the count in its own sub-line so the number never leaves
                the row entirely.

                What takes its place is the other half of what this product
                does. Comments were counted only in a card further down, so the
                row of numbers about today was silent about half the work. */}
              <StatCard
                dense
                icon={<MessageIcon aria-hidden className="h-4 w-4" />}
                tone={data.commentsToday.done ? 'good' : 'neutral'}
                label="תגובות היום"
                value={data.commentsToday.done}
                sub={data.commentTotals.pending ? `${data.commentTotals.pending} ממתינות` : 'על הפוסטים שפורסמו'}
                note={data.weekComments ? `${data.weekComments} מתחילת השבוע` : undefined}
                href="/social/history?status=published&range=1"
              />
            </div>
          </section>

          {/* 2 — IS IT WORKING, when is the next one and to which group.
              Unconditional: it used to be the else-branch of a ternary, so on
              a morning with an empty queue the screen carried no system state
              at all. */}
          <LiveQueueHero
            systemState={systemState}
            publishedToday={data.today}
            dailyTarget={data.limits.maxPerDay}
            plannedToday={data.plannedToday}
            pendingCancellable={pending}
            nextAt={data.upcoming[0]?.scheduled_at ?? null}
            nextTargetName={data.upcoming[0]?.target?.name ?? null}
            nextTarget={data.upcoming[0]?.target ?? null}
            inFlight={summary.inFlight}
            workerOnline={data.workerOnline}
            fbAccount={data.fbAccount}
            profiles={data.profiles}
            onSwitchProfile={switchProfile}
            intervention={intervention}
            onRunNow={runNow}
            onTune={() => setTuner({ campaignId: data.upcoming[0]?.campaign_id ?? undefined })}
            updatedAt={updatedAt}
            refreshing={refreshing}
            onRefresh={async () => {
              if (refreshing) return;
              setRefreshing(true);
              setError(null);
              try {
                await load();
              } finally {
                setRefreshing(false);
              }
            }}
            onResume={() => act('resume', () => setPaused(false), 'הפרסום חודש.')}
            busy={busy === 'run'}
            resumeBusy={busy === 'resume'}
          />


          {/* 3 — what the current rounds are doing, one per swipe. No countdown
              on these cards: their next instant comes from a different row than
              the system card's, and two clocks 200px apart showing two times is
              the contradiction this module exists to prevent. */}
          {runs.length > 0 && (
            <CardSwiper
              label="הסבבים שלכם"
              itemLabel={(position, total) => `סבב ${position} מתוך ${total}`}
            >
              {runs.map((run) => (
                <LiveCampaignHero
                  key={run.campaign.id}
                  campaign={run.campaign}
                  state={run.state}
                  /* Keyed by id, so pausing one run does not grey out the two
                     beside it in the strip. */
                  busy={campBusy(run.campaign.id)}
                  onPause={() => act(`camp-pause:${run.campaign.id}`, () => pauseCampaign(run.campaign.id, true), 'הסבב הושהה.')}
                  onResume={() => act(`camp-resume:${run.campaign.id}`, () => pauseCampaign(run.campaign.id, false), 'הסבב ממשיך.')}
                  onReset={() => resetRun(run.campaign.id, run.campaign.name, run.state)}
                  onTune={() => setTuner({ campaignId: run.campaign.id })}
                  /* "Now" on that card is a claim about a machine, so it is made
                     from a machine fact rather than from the clock. */
                  workerOnline={data.workerOnline}
                  /* ...and it must also know when EVERYTHING is held. Without this
                     the card read "רץ" with a live dot directly under a header
                     saying "המשך הכול". */
                  globalPaused={data.control.paused}
                  targetCount={targetCountOf(run.state)}
                  startedAt={run.state.startedAt}
                  /* The post this run publishes. One read filled every card's
                     cover; the queue row's post is the fallback, and it costs
                     nothing because listQueue already selected it. */
                  media={covers[run.campaign.id] ?? data.upcoming.find((r) => r.campaign_id === run.campaign.id)?.post?.media ?? null}
                  /* "תזמון פרסום" and "הפרסום הבא יתחיל ב:", inside this card —
                     the owner's reference image for THIS screen. The values are
                     the campaign's own row; the write is the block above. */
                  schedule={scheduleOf(run.campaign)}
                  onScheduleChange={(next) => changeSchedule(run.campaign, next)}
                  spacing={{
                    minGapMinutes: data.limits.minGapMinutes,
                    groupMinGapMinutes: data.browser.groupMinGapMinutes,
                    lastPublishedAt: data.lastPublished,
                  }}
                  repeat={readRepeat(run.campaign)}
                  onRepeatChange={(next) => void changeRepeat(run.campaign, next)}
                  scheduleBusy={scheduleBusy && schedulePatch?.id === run.campaign.id}
                />
              ))}
            </CardSwiper>
          )}

          {/*
            3b — what the system has just been doing, directly under the round
            it has been doing it for.

            This card is not new and this is not a second feed: it is the
            "יומן פעילות" card that used to sit at the foot of a 2600px scroll,
            below the comment queue, where the one screen that answers "what is
            happening right now" kept its answer out of sight. Same rows, same
            read (data.log, fetched once by load()), five of them instead of
            six — moved to where the question is asked.

            It carries no counter and no clock of its own. The numbers are on
            the tiles above it and the countdowns are beside their own rows in
            "הפרסומים הקרובים" below; a second copy of either here is exactly
            the contradiction this module keeps being rebuilt to prevent.
          */}
          <Card
            title="פעילות אחרונה"
            action={
              <Link href="/social/activity" className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-bold text-brand-400">
                הצג הכל
              </Link>
            }
          >
            <ActivityFeed entries={data.log} limit={5} onChanged={load} onOpen={(id) => setDetail(id)} />
          </Card>

          {/*
            THE THREE SHORTCUT TILES USED TO SIT HERE, AND THEY WERE THE SAME
            THREE DESTINATIONS AS THE BAR AT THE BOTTOM OF THE SCREEN.

            קבוצות and ספרייה are two of the four tabs a thumb already rests on;
            הגדרות is one tap further, under "עוד". So the row cost a scroll and
            a block of vertical space to offer nothing that was not already
            within reach — "יש את זה כבר למטה, למה צריך את זה פעמיים", which is
            the whole argument.

            Deleted rather than moved: a second door to the same room is not a
            feature of a small screen. */}

          {/* 4 — reference material, below the answers. */}
          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Card
              /*
               * THE TITLE HAS TO DESCRIBE WHAT IS ACTUALLY IN THE CARD.
               *
               * This said "הפרסומים הקרובים" always, and the list underneath
               * is two reads: the rows still waiting, and today's finished
               * ones above them. With an empty queue only the second read has
               * anything — so the card sat there at 17:37 headed "the upcoming
               * publications" over six rows from 16:26 that had all been
               * skipped an hour earlier.
               *
               * The owner restarted the worker, came back, saw the same six
               * lines under the same heading, and reported that nothing had
               * changed. They were right about the screen. The screen was
               * wrong about itself.
               */
              title={soon.length ? 'הפרסומים הקרובים' : 'מה קרה היום'}
              /* The exact queue count, not this array's length: the array is
                 capped at UPCOMING_LIMIT and printing its length as a total
                 was a ceiling presented as a fact. */
              /*
               * THE SUBTITLE SAYS WHAT THE LIST COVERS, because the list is now
               * a window rather than the queue.
               *
               * It used to print `summary.queued` on its own — true about the
               * queue and wrong about the card the moment the card stopped
               * showing all of it. Both numbers are here: what is due in the
               * next day, and how many are waiting in total, so the card and
               * the "בתור" tile above it can never look like they disagree.
               *
               * AND THE CASE WITH NOTHING IN THE WINDOW GETS ITS OWN SENTENCE.
               * A queue of fifty whose soonest row is next Tuesday would
               * otherwise show an empty card over "50 ממתינים בתור" and read
               * as a fault.
               */
              subtitle={
                soon.length
                  ? `${data.upcomingSoon} ב-24 השעות הקרובות · ${summary.queued} ממתינים בתור`
                  : summary.automaticWaiting
                    ? `אין פרסום ב-24 השעות הקרובות · ${summary.automaticWaiting} ממתינים אחר כך`
                    : data.doneToday.length
                      ? 'התור ריק — אלה הפרסומים שהסתיימו היום'
                      : undefined
              }
              /*
               * NO CONTROLS IN THIS HEADER ANY MORE — "למעלה תמחק אפס והכל".
               *
               * It carried a red "אפס" (cancel every scheduled publication)
               * and a "הכל" link, and both are still exactly where they were
               * before this card borrowed them: the reset is the chip on the
               * "ממתינים בתור" tile at the top of this same screen and the
               * "עצור ומחק את כל הפרסומים" button at its foot, and "הכל" is
               * the tile's own href into /social/history. Nothing became
               * unreachable; a destructive control stopped sitting one
               * mis-tap from a list the owner reads several times a day.
               */
            >
              {/* `total` counts the SAME SET as the rows: this list is read
                  with AUTOMATIC_WAITING_STATUSES, so its total is
                  summary.automaticWaiting. summary.queued adds the in-flight
                  row on top, and the footer then promised a publication the
                  list could never show. (The subtitle above stays on
                  summary.queued — it describes the whole queue, the same
                  number as the "בתור" tile, not this window onto it.)
                  The footer must also never print `rows.length - shown`: rows
                  is the capped read, and with 61 queued that said "ועוד 34"
                  where the real remainder was 55 — 6 + 34 being exactly
                  UPCOMING_LIMIT. */}
              {/* Every row that was read, in a box that scrolls: the card used
                  to draw six of twenty-six and send the owner to another
                  screen for the seventh. UPCOMING_LIMIT is the read ceiling,
                  so the footer below the box still counts anything past it. */}
              {/* `done` is a SECOND read, above the waiting rows on the same
                  rail: a row used to leave this list the moment it published,
                  so the one place that shows the run in order never showed a
                  single thing it had done. It stays, with its outcome. It is
                  not merged into `rows` — that array is the queue, and the
                  subtitle and footer both count it. */}
              {/* One line, and it stays one line: worker/test/unit.test.ts
                  matches these three props together to hold "every row that
                  was read is rendered, in a box that scrolls". */}
              {/* No "show earlier" control: the whole day is read. It was a
                  button while every row cost a full QUEUE_SELECT; with the
                  lean read the day is cheaper than six rows used to be, and a
                  card headed מה קרה היום that needs a tap to become the day
                  is not what it says it is. */}
              <Timeline
                rows={soon}
                limit={UPCOMING_LIMIT}
                scrollable
                /* The window's own total, from the database. summary.automaticWaiting
                   is the WHOLE queue and would make the footer promise rows this
                   list is no longer about; `soon.length` is the capped read and
                   would print the ceiling as a fact. */
                total={data.upcomingSoon}
                done={data.doneToday}
                onOpen={(row) => setDetail(row.id)}
              />
            </Card>

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

          {/*
            "תגובות לפרסומים" was here and the owner asked for it gone: its
            three rollups and two drawers said the same things the comment rail
            below now says in order, with the bar across the top carrying the
            counts. Two cards about one subject, one under the other.

            WHAT WENT WITH IT, said plainly rather than discovered later: the
            per-row "נסה שוב" and the worker's screenshot of a failed comment.
            Retrying a whole round's failures is still on the campaign screen
            (retryFailedComments), which is where a decision about a round
            belongs; a single row's retry has no home now.
          */}

          {/*
            THE LAST FEW RUNS, with the comment control attached to each.
            Adding a comment is the owner's commonest follow-up and it lived
            two screens away; the card draws from `campaigns` and `states`,
            which this screen had already loaded, and opens the app's existing
            comment sheet rather than a second way of doing the same thing.
          */}
          <QuickCommentsCard campaigns={data.campaigns} states={data.states} onComment={setCommentFor} />

          {/*
            THE SAME COMMENTS, TOLD AS A SEQUENCE. The card above counts them
            and folds the exceptions away, which is right for triage and wrong
            for "when did this happen and what is coming next". Both are drawn
            from reads this screen already makes — no new query — and `totals`
            is passed so the footer counts the database rather than the window.
          */}
          <CommentTimeline
            rows={data.comments}
            waiting={data.commentsWaiting}
            done={data.commentsDone}
            totals={data.commentTotals}
            upcoming={data.upcoming}
            campaigns={data.campaigns}
          />

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
      {/* Scope comes from the doorway, never re-derived here: the panel that
          was tapped is the queue the owner meant. */}
      <ActivityDetailSheet queueId={detail} onClose={() => setDetail(null)} onChanged={load} />

      {/*
        THE SAME SHEET THE CAMPAIGNS SCREEN OPENS — not a copy of it. Keyed by
        round so the fields are re-seeded when a different card is tapped;
        without the key React keeps the first round's wording in the inputs and
        the owner comments on run B with run A's text.
      */}
      <CampaignCommentSheet
        key={commentFor?.id ?? 'none'}
        open={commentFor !== null}
        onClose={() => setCommentFor(null)}
        publishedCount={commentFor ? (data?.states[commentFor.id]?.progress.published ?? 0) : 0}
        initialText={commentFor?.comment_text ?? ''}
        initialMedia={commentFor?.comment_media ?? []}
        initialGapSeconds={commentFor?.comment_gap_seconds ?? 30}
        busy={busy === 'comment'}
        onSubmit={(text, media, gapSeconds) => {
          const round = commentFor;
          if (!round) return;
          void act(
            'comment',
            async () => {
              await queueCampaignComment(round.id, text, media, gapSeconds);
              setCommentFor(null);
            },
            'נשלח. התגובות יתווספו אחת-אחת, במרווח שבחרתם.',
          );
        }}
      />

      <QueueTunerSheet
        open={tuner !== null}
        onClose={() => setTuner(null)}
        campaignId={tuner?.campaignId}
        onChanged={load}
      />
      {confirm.dialog}
    </SocialShell>
  );
}
