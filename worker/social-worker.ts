import { hostname } from 'node:os';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Page } from 'playwright-core';
import { detectCity } from '@/lib/social/cities';
import { renderPostText } from '@/lib/social/compose';
import { planQueue } from '@/lib/social/plan';
import { PREP_LEAD_MS, evaluateQueueItem } from '@/lib/social/rules';
import { stampText } from '@/lib/social/time';
import {
  DEFAULT_BROWSER,
  DEFAULT_LIMITS,
  PENDING_SHARE_PREFIX,
  parseGroupUrl,
  type BrowserSettings,
  type ControlSettings,
  type LimitsSettings,
  type MediaItem,
  type Post,
  type QueueItem,
  type SocialTarget,
  type Variant,
  type WorkerCommand,
} from '@/lib/social/types';
import { WORKER_VERSION } from '@/lib/social/worker-version';
import { FacebookGroupBrowserAdapter } from './adapters/facebookGroupBrowser';
import { updateAvailable } from './self-update';
import { logActivity, safeError, unwrap, workerDb } from './db';
import { env } from './env';
import { PublishError } from './facebook/composer';
import { commentOnPost, type CommentOutcome } from './facebook/composer';
import { matchPosts, ourPostsInGroup } from './facebook/postIndex';
import { readPostMetrics } from './facebook/metrics';
import { cleanupMedia, downloadMedia, type LocalMedia } from './media';
import { readGroupProfile } from './facebook/profile';
import type { AccountProfile } from './facebook/account';
import { BrowserSession, SessionError } from './facebook/session';
import { NO_ACCOUNT, queueScope } from '@/lib/social/account-scope';
import { captureScreenshot } from './screenshots';

/**
 * Local browser worker — `npm run social-worker`.
 *
 *   Supabase queue  ──▶  this process  ──▶  Playwright (your Chrome profile)  ──▶  Facebook groups
 *
 * Loop (every SOCIAL_WORKER_POLL_MS):
 *   1. heartbeat into social_workers (status, browser state, current job);
 *   2. run dashboard commands: login / check / logout / resume;
 *   3. turn due schedules into queue rows (every PLAN_EVERY_MS);
 *   4. if not paused and the browser is logged in, claim due group jobs
 *      (atomic status flip, worker_id stamped), apply the shared anti-spam
 *      rules, run the FacebookGroupBrowserAdapter, record the outcome.
 *
 * Any Facebook security screen stops the worker: the job becomes
 * needs_attention, the worker announces it on the dashboard, and nothing
 * else runs until the owner handles it and presses "בדוק שוב".
 */

const VERSION = WORKER_VERSION;
const CONFIRM_TIMEOUT_MS = 15 * 60_000;
const PLAN_EVERY_MS = 60_000;
/*
 * How recently another worker of this name must have been seen for it to count
 * as still running. A live worker heartbeats once a tick (5s), so anything
 * inside this window is a sibling, not a corpse — and start-worker.cmd waits
 * longer than this before restarting a crashed one, so a real restart is never
 * mistaken for a double launch.
 */
const LIVE_WORKER_MS = 20_000;
/** Exit code that tells start-worker.cmd not to restart: nothing is wrong. */
const EXIT_ALREADY_RUNNING = 3;
/**
 * "A newer version is waiting — restart me."
 *
 * start-worker.cmd catches this one and goes back to its update step, which
 * pulls, installs and starts again. The worker itself never runs git for
 * anything but the comparison: the launcher already knew how to update, it
 * just never got the chance while the worker was alive.
 */
const EXIT_UPDATE = 4;
/** How often to ask. Ten minutes is far below how often anything is pushed. */
const UPDATE_CHECK_MS = 10 * 60_000;
const MAX_PRE_SUBMIT_ATTEMPTS = 3;

interface WorkerState {
  id: string;
  browserState: 'connected' | 'needs_auth' | 'disconnected' | 'unknown';
  attention: string;
  currentJob: string | null;
  /**
   * A publication ran on this tick.
   *
   * The loop sleeps `pollMs` after every tick, idle or not, so a row that
   * finished publishing waited up to another five seconds before the next one
   * was even looked at. On a queue the owner has set to one a minute that is
   * most of a tenth of the interval, spent doing nothing. When a job ran,
   * the loop goes straight round; when nothing did, it sleeps as before.
   */
  worked?: boolean;
  /** When the "waiting for the gap" line was last written. See spacingGate(). */
  spacingNoticeAt: number;
  lastCheckAt: number;
  lastPlanAt: number;
  idleNoticeShown: boolean;
  /** When the repository was last compared against this checkout. */
  lastUpdateCheckAt?: number;
  /** Said once: the metrics columns are missing. It must not become a line per tick. */
  metricsNoticeShown?: boolean;
  /** Same, for the round-comment columns. */
  commentNoticeShown?: boolean;
  /** The last reason the update check could not run — said once, not per tick. */
  updateProblem?: string;
  /**
   * Groups whose addresses have already been looked up this run.
   *
   * Without it the same group is opened every few seconds forever: the rows
   * keep no record of the attempt, so a group whose page yields nothing is
   * asked again and again and no other group is ever reached.
   */
  addressTried?: Set<string>;
  /**
   * The c_user id of the account the browser is signed in as.
   *
   * Kept here because finding one of our own posts in a group comes down to
   * it: `/groups/<id>/user/<this>/` is the group filtered to what WE posted,
   * which is three or four things instead of an afternoon of everybody else's.
   */
  accountId?: string;
  /**
   * The row in social_accounts this worker publishes as, and how many accounts
   * the whole system has. Together they decide whether the queue needs
   * filtering at all — see queueScope().
   */
  accountRow?: string;
  accountsTotal?: number;
}

const session = new BrowserSession();
const adapter = new FacebookGroupBrowserAdapter(session);
let stopping = false;

async function main(): Promise<void> {
  console.log(`[worker] הפתרון המבריק — social worker v${VERSION} (${env.workerName})`);
  const db = await workerDb();

  /*
   * One worker per name, and the reason is not tidiness.
   *
   * Two windows left open share everything: the same social_workers row (the
   * upsert is by name, so both get the SAME id), the same heartbeat, and the
   * same Chrome profile directory. The second one to start then does two
   * destructive things on the first one's behalf — releaseProfile() kills the
   * Chrome that is mid-publish, reading its live lock as a stale one, and the
   * crash-recovery sweep below moves whatever that Chrome was publishing to
   * needs_attention. The owner sees a post abandoned halfway with no idea why.
   *
   * So a second instance stands down instead, and says which window to close.
   */
  const { data: existing } = await db
    .from('social_workers')
    .select('status, last_seen_at, host')
    .eq('name', env.workerName)
    .maybeSingle();
  const seenAt = existing?.last_seen_at ? new Date(existing.last_seen_at).getTime() : 0;
  const seenAgo = Date.now() - seenAt;
  if (existing && existing.status !== 'offline' && seenAt > 0 && seenAgo < LIVE_WORKER_MS) {
    console.error(`\n[worker] כבר רץ worker בשם "${env.workerName}" (נראה לפני ${Math.max(1, Math.round(seenAgo / 1000))} שניות).`);
    console.error('[worker] שני חלונות יפריעו זה לזה ויעצרו פרסום באמצע — סגרו את החלון השני והשאירו רק אחד.');
    console.error('[worker] אם החלון השני כבר סגור, המתינו 20 שניות ונסו שוב.\n');
    process.exit(EXIT_ALREADY_RUNNING);
  }

  const { data: worker } = await db
    .from('social_workers')
    .upsert({ name: env.workerName, status: 'online', version: VERSION, host: hostname(), last_seen_at: new Date().toISOString() }, { onConflict: 'name' })
    .select('id, fb_user_id')
    .single();
  if (!worker) throw new Error('רישום ה-worker נכשל — האם הרצתם את supabase/social-schema-v2.sql?');
  /*
   * REMEMBERED FROM LAST TIME, because everything that finds a post now needs
   * it and a login check that throws would otherwise take it away.
   *
   * `/groups/<id>/user/<this>/` is how a post is located at all. It is learned
   * from the c_user cookie on a successful login check — and when that check
   * fails to run, the id would be empty and every lookup would silently fall
   * back to hunting the whole group, which is exactly the behaviour this was
   * written to replace. The database already has it from the last time it
   * worked, so the failure costs nothing.
   */
  const state: WorkerState = {
    id: worker.id,
    browserState: session.hasProfile() ? 'unknown' : 'disconnected',
    attention: '',
    currentJob: null,
    lastCheckAt: 0,
    lastPlanAt: 0,
    spacingNoticeAt: 0,
    idleNoticeShown: false,
    accountId: ((worker as { fb_user_id?: string }).fb_user_id ?? '') || undefined,
  };

  // Jobs this worker was running when it died: never auto-retry (the post may exist).
  await db
    .from('social_queue')
    .update({ status: 'needs_attention', step: 'needs_attention', error: 'ה-worker הופסק באמצע העבודה. בדקו בקבוצה אם הפוסט עלה, ואז "נסה שוב" או "דלג".' })
    .eq('worker_id', state.id)
    .in('status', ['publishing', 'awaiting_confirmation']);

  /*
   * Comments this worker was in the middle of leaving. Same rule as the jobs
   * above and for the same reason: the comment may be under the post already,
   * and the one thing that must never happen is a second one. 'unverified' is
   * not in the pending set, so nothing picks it up again, and the bulk
   * "נסה שוב" leaves it alone — the owner looks, then decides.
   */
  await sweepStuckComments(db);

  /*
   * WHICH ACCOUNT WE ARE, BEFORE THE LOOP CAN CLAIM ANYTHING.
   *
   * It is learned in recordAccount, which runs off the login check — at
   * startup, then once every ten minutes. Left only there, a restart (and the
   * self-update restarts this process) would run UNFILTERED until that check
   * came back: with a second account present that means publishing another
   * account's groups from this browser, under the wrong name, into groups
   * this account may not even be in. The id is already on the worker's own
   * row from the last time a check succeeded, so this costs one read.
   */
  if (state.accountId) await learnAccountScope(state, db, state.accountId).catch(() => undefined);

  await logActivity('info', 'worker_started', `ה-worker "${env.workerName}" עלה (${hostname()})`, { version: VERSION });
  console.log('[worker] מחובר ל-Supabase. ממתין לעבודות… (Ctrl+C לעצירה)');

  // Check the Facebook login right away so the dashboard shows 🟢/🟡 at once.
  if (session.hasProfile()) {
    try {
      const browser = await getSetting<BrowserSettings>('browser', DEFAULT_BROWSER);
      const check = await session.checkLogin(!browser.debugMode);
      state.browserState = check.state;
      state.lastCheckAt = Date.now();
      await recordAccount(state, check.account);
      if (check.state !== 'connected') state.attention = check.detail;
      await heartbeat(state, state.attention ? 'needs_attention' : 'online', browser.debugMode);
      console.log(`[worker] בדיקת חיבור לפייסבוק: ${check.detail}`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      console.error('[worker] בדיקת החיבור נכשלה:', raw);
      /*
       * Playwright and Chrome fail in English. Both places this text goes are
       * read by the owner — state.attention on the dashboard card, the log
       * line in the notification bell — so both get the Hebrew sentence, and
       * the original stays on meta.detail for whoever debugs it.
       */
      const message = safeError(err, 'בדיקת החיבור לפייסבוק נכשלה. פתחו את חלון הדפדפן של התוכנה והתחברו מחדש.').split('\n')[0];
      // Surface it on the dashboard too, so the card explains itself instead
      // of sitting on "not checked yet" while the terminal holds the reason.
      state.attention = message;
      state.browserState = 'needs_auth';
      await heartbeat(state, 'needs_attention', false);
      await logActivity('error', 'browser_start_failed', message, { detail: raw });
    }
  }

  process.on('SIGINT', () => {
    stopping = true;
    console.log('\n[worker] עוצר אחרי העבודה הנוכחית…');
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });

  while (!stopping) {
    state.worked = false;
    try {
      await tick(state);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      console.error('[worker] שגיאה בלולאה:', raw);
      // Anything at all can land here — a Supabase error, a DNS failure — and
      // the bell prints this message as written. Hebrew on screen, original
      // on meta.detail.
      await logActivity('error', 'worker_error', safeError(err, 'אירעה תקלה בתוכנת הפרסום. היא ממשיכה לנסות בעצמה.'), { detail: raw });
    }
    /* Straight round again when a row was just handled — see `worked`. The
       pace is the queue's to set, and it already sets it: the next row is
       claimed only if its own instant has come and the spacing rule lets it
       through. This sleep was only ever meant for an idle worker. */
    if (!state.worked) await sleep(env.pollMs);
  }
  await heartbeat(state, 'offline');
  await session.close();
  await logActivity('info', 'worker_stopped', `ה-worker "${env.workerName}" נעצר`);
  process.exit(0);
}

/**
 * Is there a group publication due right now?
 *
 * Deliberately the SAME SHAPE as the claim query below — same table, same
 * filters, same embedded inner join — with `limit(1)` instead of a count.
 * An exact count over an embedded `!inner` relation is a combination this
 * codebase uses nowhere else, and this answer decides whether a chore that
 * holds the only browser for half a minute gets to start: wrong in one
 * direction the chores never run again, wrong in the other they never give
 * way. A one-row read cannot be wrong about the thing the claim will see,
 * because it is the same read.
 */
async function anyDue(db: SupabaseClient, state: WorkerState): Promise<boolean> {
  const scope = queueScope(state);
  let q = db
    .from('social_queue')
    .select('id, target:social_targets!inner(channel, account_id)')
    .eq('status', 'scheduled')
    .eq('target.channel', 'facebook_group')
    .lte('scheduled_at', new Date().toISOString());
  /* THE SAME SCOPE AS THE CLAIM. A worker that checks wider than it claims
     reports itself busy over work it will never do, and the idle chores — the
     round's comments among them — stop running for good. */
  if (scope) q = q.or(`account_id.eq.${scope},account_id.is.null`, { referencedTable: 'target' });
  const { data } = await q.limit(1);
  return Boolean(data?.length);
}

/**
 * When the next publication is allowed out, asked once per tick.
 *
 * The same question rules.ts asks per row, and the same answer for all of
 * them: the rule reads ONE global instant — the most recent publication —
 * so asking it thirty times to hear it thirty times was thirty claims, thirty
 * rule bursts and thirty log lines for one fact.
 *
 * rules.ts keeps its own copy and remains the authority: this is a gate on
 * claiming, not a replacement for the rule. Every other reason a row can be
 * held back is per row and is still decided there.
 */
async function spacingGate(
  db: SupabaseClient,
  limits: LimitsSettings,
  browser: BrowserSettings,
): Promise<{ open: boolean; waitMs: number; gapMs: number; gapMinutes: number; nextAt: string | null }> {
  const gapMinutes = Math.max(0, (limits.minGapMinutes ?? 0) + (browser.groupMinGapMinutes ?? 0));
  const gapMs = gapMinutes * 60_000;
  if (!gapMs) return { open: true, waitMs: 0, gapMs: 0, gapMinutes, nextAt: null };
  /*
   * DELIBERATELY NOT SCOPED BY ACCOUNT, and that is a reversal.
   *
   * It was scoped, on the reasoning that with two accounts one owner's
   * publication should not delay the other's. True — and this is not the
   * place that decides it. rules.ts is the authority (see the note above),
   * and it reads the same global instant per row. Scoping only here opens the
   * gate for the second account, lets every row be claimed, and then has
   * rules.ts defer each one anyway — thirteen round trips and a "נדחה" line
   * per row, which is precisely the burst this gate exists to prevent.
   *
   * It also meant joining social_targets into a read that needs one column of
   * one table. An inner join can only ever REMOVE rows from the answer, and
   * this answer decides when the next post goes out. The checked-in schema
   * says target_id is `not null references ... on delete cascade`, so today
   * it removes nothing — but that is one hand-edit away from being false on a
   * live database nobody can inspect from here, and the failure would be
   * silent and early.
   *
   * It goes back with the change that scopes rules.ts:209, where it belongs.
   */
  const { data: last, error: lastError } = await db
    .from('social_queue')
    .select('published_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  /*
   * A SPACING READ THAT FAILED MEANS WAIT, NOT GO.
   *
   * The error was discarded, so any failure left `last` null and the next
   * line read that as "nothing has ever been published" — the gate opened
   * wide and every due row went out back to back with no gap at all. That is
   * how an account gets flagged, arrived at through a network blip.
   */
  if (lastError) return { open: false, waitMs: gapMs, gapMs, gapMinutes, nextAt: null };
  const at = (last as { published_at?: string } | null)?.published_at;
  if (!at) return { open: true, waitMs: 0, gapMs, gapMinutes, nextAt: null };
  const nextMs = new Date(at).getTime() + gapMs;
  const waitMs = nextMs - Date.now();
  return { open: waitMs <= 0, waitMs, gapMs, gapMinutes, nextAt: new Date(nextMs).toISOString() };
}

/* --------------------------------------------------------------- tick */

async function tick(state: WorkerState): Promise<void> {
  const db = await workerDb();
  const browser = await getSetting<BrowserSettings>('browser', DEFAULT_BROWSER);
  const control = await getSetting<ControlSettings>('control', { paused: false, rateLimitedUntil: null });
  const limits = await getSetting<LimitsSettings>('limits', DEFAULT_LIMITS);
  const headless = !browser.debugMode;

  await runCommands(state, headless, browser);
  await heartbeat(state, state.attention ? 'needs_attention' : 'online', browser.debugMode);
  await plan(state);

  if (control.paused) return idle(state, 'התורים מושהים בלוח הבקרה.');
  if (state.attention) return idle(state, `ממתין לטיפול ידני: ${state.attention}`);
  if (state.browserState === 'disconnected') return idle(state, 'אין חיבור לפייסבוק — לחצו "התחבר לפייסבוק" בלוח הבקרה.');

  // Anything due for a group?
  const scope = queueScope(state);
  let dueQuery = db
    .from('social_queue')
    .select('*, target:social_targets!inner(channel, account_id)')
    .eq('status', 'scheduled')
    .eq('target.channel', 'facebook_group')
    .lte('scheduled_at', new Date().toISOString());
  if (scope) dueQuery = dueQuery.or(`account_id.eq.${scope},account_id.is.null`, { referencedTable: 'target' });
  const { data: due, error } = await dueQuery.order('scheduled_at').limit(Math.max(1, Math.min(3, browser.concurrentJobs || 1)));
  if (error) throw new Error(error.message);

  /*
   * THE SPACING GATE, ASKED ONCE — BEFORE ANYTHING IS CLAIMED.
   *
   * It used to be asked per row, inside the job, after the claim. So every
   * due row behind one closed gap paid a full claim UPDATE, a heartbeat,
   * three entity reads, seven rule queries, a write-back and an activity
   * INSERT — about thirteen round trips — purely to be told "not yet", and
   * wrote a "נדחה" line for the owner to read. With a queue denser than the
   * gap that is a burst of hundreds of round trips at every gap boundary and
   * a log nobody can use. The answer is the same for all of them, because the
   * rule reads one global instant: the last publication's.
   *
   * So it is asked once, here, and when the gap is not open this tick claims
   * nothing at all. Every OTHER reason a row can be deferred — the daily
   * caps, a paused run, the duplicate rules — is per row and stays in
   * rules.ts, which still runs for real.
   */
  const gate = await spacingGate(db, limits, browser);
  if (due?.length && !gate.open && gate.waitMs > PREP_LEAD_MS) {
    /* Not yet, and not close enough to start preparing. Say so once per gap,
       not once per row per tick. */
    if (Date.now() - state.spacingNoticeAt > gate.gapMs / 2) {
      state.spacingNoticeAt = Date.now();
      await logActivity('info', 'deferred', `ממתין למרווח של ${gate.gapMinutes} דק׳ בין פרסומים`, { until: gate.nextAt });
    }
    return;
  }

  if (!due?.length || (!gate.open && gate.waitMs > PREP_LEAD_MS)) {
    /*
     * IDLE CHORES — and they must give way the moment a row comes due.
     *
     * These six hold the single browser for tens of seconds each (a metrics
     * read scrolls a feed twenty times; a comment can take minutes), and they
     * run in exactly the window between two publications — because right
     * after a publication the queue is always momentarily empty. A row whose
     * turn arrived mid-chain was not even looked at until the whole chain
     * finished, which is most of the minute the owner was missing.
     *
     * The queue is re-asked before each one. The worst case is now one chore,
     * not six.
     */
    /*
     * COMMENTS FIRST, and that ordering is the whole difference between a
     * feature that works and one that does not.
     *
     * The window between two publications is what is left of the minute after
     * the post has gone out — twenty seconds or so — and the chore standing in
     * front of the comments was resolveAddresses, which opens a group page and
     * scrolls it ten times: fifteen to thirty seconds on its own. It took the
     * window every time, the loop then found the next row due and returned,
     * and the comments were never reached at all. The owner pressed
     * "הוסף תגובה לכל הפרסומים" and watched nothing happen, for hours.
     *
     * Nothing else here is urgent in the same way. An address that is resolved
     * a minute later, a profile picture that fills in tomorrow, a view count
     * that is six hours old — none of those is a thing the owner asked for and
     * is waiting on. The comment is.
     */
    for (const chore of [runCampaignComments, resolveAddresses, resolveShareLinks, syncGroupProfiles, syncPostMetrics] as const) {
      if (stopping || (await anyDue(db, state))) return;
      /* A chore that says it did something is work, and work is what keeps
         the loop off its five-second brake. Discarding the answer meant a
         round of comments ran at one every five seconds of dead waiting. */
      if (await chore(state, headless)) state.worked = true;
    }
    if (!(await anyDue(db, state))) await restartIfUpdated(state);
    return;
  }

  // Verify the login before the first job of a batch (and at most every 10 min).
  if (state.browserState !== 'connected' || Date.now() - state.lastCheckAt > 10 * 60_000) {
    const check = await session.checkLogin(headless);
    state.lastCheckAt = Date.now();
    state.browserState = check.state;
    await recordAccount(state, check.account);
    if (check.state !== 'connected') {
      state.attention = check.detail;
      await logActivity('warn', 'browser_needs_auth', check.detail);
      return;
    }
  }
  state.idleNoticeShown = false;

  const jobs = (due as (QueueItem & { target: unknown })[]).map(({ target: _t, ...item }) => item);
  const concurrency = Math.max(1, Math.min(3, browser.concurrentJobs || 1));
  /*
   * ONE AT A TIME, always — `concurrentJobs` decides how many rows this tick
   * takes, never how many run together.
   *
   * These used to go out under Promise.all, and that quietly disabled every
   * limit in rules.ts. Each of the rules is a COUNT taken before any of the
   * batch has written its outcome: three jobs starting together all read the
   * same "published today" number, the same last published_at and the same
   * "has this post gone to this group already" — and then hold a Facebook page
   * open for 30-60 seconds each. So maxPerDay was exceeded by up to
   * concurrency - 1, minGapMinutes (65 by default) was honoured as seconds,
   * and two rows for the same post and group — which the planner can produce
   * when both planners run at once — became two identical posts in one group.
   *
   * Sequentially, each job's outcome is already written when the next one is
   * evaluated, which is what every one of those counts assumes. It costs
   * nothing: there is one browser profile and one Facebook session here, so
   * the jobs were never really parallel in the place it mattered.
   */
  for (const item of jobs.slice(0, concurrency)) {
    if (stopping) break;
    /*
     * `notBefore` is what makes a one-minute gap mean one publication a
     * minute. The gate above let this row through up to PREP_LEAD_MS early,
     * so the browser work — opening the group, typing, uploading — happens
     * INSIDE the remaining wait instead of after it, and the composer holds
     * the final click until the instant itself. Before this, the gap and the
     * preparation ran one after the other and the true interval was always
     * gap + preparation, never gap.
     */
    await runJob(state, item, { limits, browser, headless });
  }
}

/**
 * Turn schedules into queue rows. Bookkeeping only — nothing is published
 * here — so it runs before the pause check and before the Facebook login is
 * verified: a paused or logged-out owner should still see what is waiting.
 *
 * This process is the planner that actually runs. The deployed app only plans
 * when a request reaches it (a launch, "פרסם עכשיו", or the cron endpoint),
 * and the 5-minute tick in .github/workflows/social-cron.yml never fires —
 * GitHub registers a `schedule:` workflow only from the repository's default
 * branch. Without this, a weekly or one-off campaign sat in social_schedules
 * forever and the dashboard showed "מתוזמנים 0".
 */
async function plan(state: WorkerState): Promise<void> {
  if (Date.now() - state.lastPlanAt < PLAN_EVERY_MS) return;
  state.lastPlanAt = Date.now();
  try {
    const created = await planQueue({ db: await workerDb(), log: logActivity });
    if (created) console.log(`[worker] ✓ ${created} פרסומים נכנסו לתור`);
  } catch (err) {
    // Never let planning take the publishing loop down with it.
    console.error('[worker] תכנון התור נכשל:', err instanceof Error ? err.message : err);
  }
}

function idle(state: WorkerState, reason: string): void {
  if (!state.idleNoticeShown) {
    console.log(`[worker] ${reason}`);
    state.idleNoticeShown = true;
  }
}

/* ------------------------------------------------------ group profiles */

const PROFILES_PER_TICK = 2;

/**
 * While idle: groups that were pasted in but never visited get their real
 * name and picture from Facebook (read-only visit), a couple per tick so
 * 40 new groups trickle in over a few minutes.
 */
/**
 * Turn share links into real group addresses.
 *
 * Facebook's app gives https://www.facebook.com/share/g/<token> on "העתק
 * קישור", which is a redirect rather than an address. The dashboard cannot
 * follow it — a browser on the owner's phone cannot read facebook.com across
 * origins — but this worker has a real browser and a real session, so it
 * follows it here and writes back what Facebook resolved it to.
 *
 * Until that happens the row is not publishable, and nothing in this file has
 * to remember that: its url is not a /groups/ address, so parseGroupUrl
 * refuses it in the adapter exactly as it refuses any other stranger.
 */
async function resolveShareLinks(state: WorkerState, headless: boolean): Promise<void> {
  if (state.browserState === 'disconnected' || !session.hasProfile()) return;
  const db = await workerDb();
  const { data } = await db
    .from('social_targets')
    .select('id, url, name, external_id')
    .eq('channel', 'facebook_group')
    .like('external_id', `${PENDING_SHARE_PREFIX}%`)
    .order('created_at')
    .limit(PROFILES_PER_TICK);
  if (!data?.length) return;

  for (const target of data as { id: string; url: string; name: string; external_id: string }[]) {
    if (stopping) break;
    const page = await session.newPage(headless);
    try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      /* The address bar can still be showing the share link when the load
         settles — the same race /me had. Wait for it to stop saying /share/. */
      await page
        .waitForFunction(() => !/^\/share\//i.test(location.pathname), undefined, { timeout: 15_000 })
        .catch(() => undefined);
      const resolved = parseGroupUrl(page.url());
      if (!resolved) {
        console.log(`[worker] ℹ הקישור של "${target.name}" עוד לא נפתר לכתובת קבוצה.`);
        continue;
      }
      /* Somebody may have added the same group by its real address already.
         Two rows for one group would publish to it twice. */
      const { data: clash } = await db
        .from('social_targets')
        .select('id')
        .eq('channel', 'facebook_group')
        .eq('external_id', resolved.externalId)
        .neq('id', target.id)
        .maybeSingle();
      if (clash) {
        await db.from('social_targets').delete().eq('id', target.id);
        await logActivity('info', 'group_share_duplicate', `הקבוצה "${target.name}" כבר קיימת ברשימה — הקישור הכפול הוסר.`);
        continue;
      }
      await db.from('social_targets').update({ external_id: resolved.externalId, url: resolved.url }).eq('id', target.id);
      console.log(`[worker] ✓ קישור השיתוף נפתר: ${resolved.url}`);
      await logActivity('info', 'group_share_resolved', `הקבוצה "${target.name}" מוכנה לפרסום.`, { url: resolved.url });
    } catch (err) {
      console.error('[worker] ℹ פתיחת קישור השיתוף נכשלה:', err instanceof Error ? err.message.split('\n')[0] : err);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}

async function syncGroupProfiles(state: WorkerState, headless: boolean): Promise<void> {
  if (state.browserState === 'disconnected' || !session.hasProfile()) return;
  const db = await workerDb();
  const { data } = await db
    .from('social_targets')
    .select('id, url, name, external_id')
    .eq('channel', 'facebook_group')
    .is('last_synced_at', null)
    .order('created_at')
    .limit(PROFILES_PER_TICK);
  if (!data?.length) return;

  for (const target of data) {
    const page = await session.newPage(headless);
    try {
      const profile = await readGroupProfile(page, target.url);
      if (!profile) {
        // Login / checkpoint: leave it unsynced and let the job path report it.
        state.lastCheckAt = 0;
        return;
      }
      const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
      // The name is always Facebook's own, so the list reads exactly like Facebook.
      if (profile.name) {
        patch.name = profile.name;
        patch.city = detectCity(profile.name);
      }
      if (profile.image) {
        const ext = profile.image.contentType.includes('png') ? 'png' : 'jpg';
        const objectPath = `groups/${target.id}.${ext}`;
        const { error } = await db.storage.from('social-media').upload(objectPath, profile.image.bytes, { contentType: profile.image.contentType, upsert: true });
        /*
         * This used to be `if (!error)` and nothing else, so the same missing
         * UPDATE policy that blocked the avatar also quietly stopped a group
         * from ever showing a NEW picture after its first one — a refresh that
         * looked like it worked and changed nothing.
         */
        if (error) console.error(`[worker] ✗ העלאת תמונת הקבוצה "${target.name}" נכשלה:`, error.message);
        else patch.image_url = `${db.storage.from('social-media').getPublicUrl(objectPath).data.publicUrl}?v=${Date.now()}`;
      }
      await db.from('social_targets').update(patch).eq('id', target.id);
      console.log(`[worker] ℹ פרטי קבוצה: "${patch.name ?? target.name}"${profile.image ? ' + תמונה' : ''}`);
    } catch (err) {
      // last_error is printed verbatim on the groups screen, so it gets the
      // same scrubbed Hebrew treatment as every other stored failure.
      await db
        .from('social_targets')
        .update({ last_synced_at: new Date().toISOString(), last_error: `משיכת פרטים נכשלה: ${safeError(err, 'לא הצלחנו לקרוא את פרטי הקבוצה.')}` })
        .eq('id', target.id);
    } finally {
      await page.close().catch(() => undefined);
    }
    await sleep(4000);
  }
}

/* ----------------------------------------------------------- commands */

async function runCommands(state: WorkerState, headless: boolean, browser: BrowserSettings): Promise<void> {
  const db = await workerDb();
  const { data } = await db
    .from('social_worker_commands')
    .select('*')
    .eq('status', 'pending')
    .or(`worker_id.eq.${state.id},worker_id.is.null`)
    .order('created_at')
    .limit(5);
  for (const cmd of (data ?? []) as (WorkerCommand & { payload?: { user?: string; pass?: string } })[]) {
    /*
     * CLAIMING A COMMAND ALSO EMPTIES IT.
     *
     * A login command may carry the customer's Facebook username and password,
     * because the whole point of selling this is that they enter their own
     * details on their own phone rather than walking to the machine. That
     * makes the row a one-time envelope, not a record: it is wiped in the same
     * statement that claims the command, before a browser window even opens,
     * and the only copy left is the local const below, which goes out of scope
     * when this iteration ends.
     *
     * Wiping it here rather than after the login also means a command that
     * crashes, or a worker that dies mid-login, does not leave anything
     * sitting in the database waiting for the next poll.
     */
    const entered = cmd.payload?.user && cmd.payload?.pass ? { user: cmd.payload.user, pass: cmd.payload.pass } : null;
    const claimed = await claimCommand(cmd.id, state.id, { status: 'running' });
    if (!claimed) continue;
    // The command NAME only. Its payload is never printed, here or anywhere.
    console.log(`[worker] פקודה: ${cmd.command}`);
    let result = '';
    let raw = '';
    let ok = true;
    try {
      if (cmd.command === 'login') {
        await heartbeat(state, 'online', browser.debugMode, 'needs_auth');
        const r = await session.interactiveLogin(entered, { onChallenge: (shot) => askOnScreen(state, shot) });
        await clearChallenge(state);
        state.browserState = r.state;
        state.lastCheckAt = Date.now();
        if (r.state === 'connected') {
          state.attention = '';
          /* A fresh login is the one moment the account may have CHANGED, so
             it is re-read rather than left on whoever was signed in before. */
          const who = await session.checkLogin(headless).catch(() => null);
          await recordAccount(state, who?.account);
        }
        result = r.detail;
      } else if (cmd.command === 'check') {
        const r = await session.checkLogin(headless);
        state.browserState = r.state;
        state.lastCheckAt = Date.now();
        await recordAccount(state, r.account);
        if (r.state === 'connected') state.attention = '';
        else state.attention = r.detail;
        result = r.detail;
      } else if (cmd.command === 'logout') {
        await session.logout();
        state.browserState = 'disconnected';
        state.attention = '';
        /*
         * AND FORGET WHOSE SESSION IT WAS.
         *
         * Disconnecting wipes the Chrome profile, so the account is gone from
         * the machine — but the name and face live in the database, and left
         * there the dashboard goes on showing the previous person beside a
         * chip that says nothing is connected. Somebody switching accounts
         * would see the account they just left.
         */
        await forgetAccount(state);
        result = 'הפרופיל המקומי נמחק — הדפדפן מנותק מפייסבוק.';
      } else if (cmd.command === 'resume') {
        state.attention = '';
        state.browserState = session.hasProfile() ? 'unknown' : 'disconnected';
        result = 'ממשיך. עבודות שסומנו "דורש טיפול" יחזרו לתור אם הפעלתם אותן מחדש בלוח הבקרה.';
      }
    } catch (err) {
      ok = false;
      // `result` is echoed back on the dashboard and into the activity log, so
      // it carries the Hebrew sentence; `raw` stays for the console and meta.
      raw = err instanceof Error ? err.message : String(err);
      result = safeError(err, 'הפקודה נכשלה. נסו שוב בעוד רגע.');
    }
    await db.from('social_worker_commands').update({ status: ok ? 'done' : 'failed', result, finished_at: new Date().toISOString() }).eq('id', cmd.id);
    await logActivity(ok ? 'info' : 'error', `worker_${cmd.command}`, result, raw ? { detail: raw } : {});
    console.log(`[worker] ${cmd.command}: ${raw || result}`);
  }
}

/* ---------------------------------------------------------------- job */

interface JobEnv {
  limits: LimitsSettings;
  browser: BrowserSettings;
  headless: boolean;
}

async function runJob(state: WorkerState, item: QueueItem, jobEnv: JobEnv): Promise<void> {
  const db = await workerDb();
  const now = new Date().toISOString();
  const attempts = item.attempts + 1;
  const { data: claimed } = await db
    .from('social_queue')
    .update({ status: 'publishing', step: 'opening', step_at: now, claimed_at: now, worker_id: state.id, attempts })
    .eq('id', item.id)
    .eq('status', 'scheduled')
    .select('id');
  if (!claimed?.length) return;
  state.currentJob = item.id;
  await heartbeat(state, 'online', jobEnv.browser.debugMode);

  const [{ data: target }, { data: post }, { data: variant }] = await Promise.all([
    db.from('social_targets').select('*').eq('id', item.target_id).maybeSingle(),
    db.from('social_posts').select('*').eq('id', item.post_id).maybeSingle(),
    item.variant_id ? db.from('social_variants').select('*').eq('id', item.variant_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const t = (target as SocialTarget | null) ?? null;
  const p = (post as Post | null) ?? null;
  const v = (variant as Variant | null) ?? null;

  const finish = async (patch: Partial<QueueItem> & Record<string, unknown>) => {
    await db.from('social_queue').update({ ...patch, step_at: new Date().toISOString() }).eq('id', item.id);
    state.currentJob = null;
  };
  /**
   * finish(), but it THROWS when the write did not land.
   *
   * supabase-js resolves with `{ error }` instead of rejecting, so an awaited
   * update tells you nothing unless you look. That is fine for the failure
   * paths — a lost error message costs an error message — but the "published"
   * write is the one the whole no-double-post guarantee rests on, so it has to
   * be able to report that it failed.
   */
  const finishChecked = async (patch: Partial<QueueItem> & Record<string, unknown>) => {
    const { error } = await db.from('social_queue').update({ ...patch, step_at: new Date().toISOString() }).eq('id', item.id);
    if (error) throw new Error(error.message);
    state.currentJob = null;
  };

  const decision = await evaluateQueueItem(db, { item: { ...item, attempts }, target: t, post: p, variant: v, limits: jobEnv.limits, browser: jobEnv.browser });
  if (decision.action === 'skip') {
    await finish({ status: 'skipped', step: '', skip_reason: decision.reason });
    await logActivity('warn', 'skipped', decision.reason, { queueId: item.id, target: t?.name });
    console.log(`[worker] ⏭ "${t?.name ?? item.target_id}": ${decision.reason}`);
    return;
  }
  if (decision.action === 'defer') {
    /*
     * The attempt goes back, exactly as it does for a parked row two branches
     * down: nothing was tried, so nothing should be spent. Without this a row
     * waiting its turn for the spacing gap burned an attempt every time it
     * came round, and at forty it became a permanent skip — so a queue denser
     * than the owner's own gap quietly destroyed its own tail. `item.attempts`
     * is the value before the claim incremented it.
     */
    await finish({ status: 'scheduled', step: 'pending', scheduled_at: decision.until, attempts: item.attempts });
    /* Same as the server worker's copy of this line: decision.reason is
       already a whole Hebrew sentence, and the ISO instant that used to be
       bracketed onto it is not. The bell reads this; meta keeps the stamp. */
    await logActivity('info', 'deferred', decision.reason, { queueId: item.id, until: decision.until });
    console.log(`[worker] ⏲ "${t?.name ?? item.target_id}": ${decision.reason} (${decision.until})`);
    return;
  }
  if (decision.action === 'wait') {
    // Parked, not attempted — see the same branch in server/worker.ts. Without
    // the new instant this row is due again on the next 5-second poll, and the
    // claim has already spent one of its attempts.
    await finish({ status: 'scheduled', step: 'pending', scheduled_at: decision.until, attempts: item.attempts });
    console.log(`[worker] ⏸ "${t?.name ?? item.target_id}": ${decision.reason}`);
    return;
  }
  const tt = t as SocialTarget;
  const pp = p as Post;
  const text = item.rendered_text || renderPostText(pp, v);
  const requireConfirmation = Boolean(item.require_confirmation || jobEnv.browser.requireConfirmation || jobEnv.browser.testMode);

  let livePage: Page | null = null;
  let lastStep = 'opening';
  let failureShot: string | null = null;
  /*
   * A PUBLICATION is work; being told "not yet" is not.
   *
   * The loop skips its five-second sleep when a tick worked, so it can go
   * straight on to the next row instead of idling between publications. Set
   * before the rules ran, a row that merely deferred also counted — and at a
   * gap boundary that turned the whole due set into a back-to-back burst of
   * claims and log lines with no brake at all. It is set here, past every
   * branch that does not publish.
   */
  state.worked = true;
  console.log(`[worker] ▶ "${tt.name}" — ${pp.title || 'פוסט'}${v ? ` (גרסה ${v.label})` : ''}`);

  /*
   * The publish call is the ONLY thing inside this try.
   *
   * The outcome write used to sit inside it too, and that is a double-post: if
   * the Supabase write failed after Facebook had already accepted the post —
   * a dropped connection, a JWT that expired during a 40-second upload — the
   * failure landed in the catch below as a generic error, `attempts < 3` put
   * the row back on the queue, and on the next claim rules.ts found no
   * published row for this post and target (its own outcome had never been
   * recorded) and published the same text to the same group a second time.
   *
   * Now a write failure after a successful publish can only leave the row on
   * 'publishing' — visible, recoverable by hand, and never re-claimed, because
   * both claims filter on status = 'scheduled'.
   */
  let result: Awaited<ReturnType<typeof adapter.publish>>;
  try {
    result = await adapter.publish({
      queueId: item.id,
      target: tt,
      text,
      media: pp.media as MediaItem[],
      campaignId: item.campaign_id ?? pp.campaign_id,
      variantId: v?.id ?? null,
      headless: jobEnv.headless,
      /* The rule's own instant, not a second reading of the same column: the
         gate above decides WHETHER to claim, rules.ts decides when the click
         may land, and only one of them may own that number. */
      notBefore: decision.notBefore ?? null,
      /* The hold can be most of a minute; the dashboard calls a worker
         offline after ninety seconds of silence. Keep saying we are here. */
      onHold: async () => {
        await heartbeat(state, 'online');
      },
      onPage: (page) => {
        livePage = page;
      },
      onError: async (page) => {
        failureShot = await captureScreenshot(page, item.id, lastStep);
      },
      onStep: async (step) => {
        lastStep = step;
        console.log(`[worker]    ${step}`);
        await db.from('social_queue').update({ step, step_at: new Date().toISOString() }).eq('id', item.id);
      },
      confirm: requireConfirmation ? (page) => waitForConfirmation(item.id, page) : undefined,
    });
  } catch (err) {
    const screenshot = failureShot ?? (await captureScreenshot(livePage, item.id, lastStep));
    /*
     * One shape for everything that reaches a column the dashboard renders:
     * token-scrubbed, and Hebrew. `err.message` went in raw before, so
     * social_queue.error and social_targets.last_error — the two fields
     * ErrorDetail.tsx prints verbatim — were the only writes TOKEN_RE never
     * saw, and a Playwright timeout arrived in English inside an RTL sentence.
     * The untouched text stays on `meta.detail` for the activity log, which
     * scrubs it and does not put it on screen.
     */
    const raw = err instanceof Error ? err.message : String(err);
    const message = safeError(err);
    if (err instanceof SessionError) {
      state.attention = message;
      state.browserState = 'needs_auth';
      await finish({ status: 'needs_attention', step: 'needs_attention', error: message, screenshot_path: screenshot });
      await db.from('social_targets').update({ last_status: 'needs_attention', last_error: message }).eq('id', tt.id);
      await heartbeat(state, 'needs_attention', jobEnv.browser.debugMode, 'needs_auth');
      await logActivity('error', 'needs_attention', `Facebook דורש פעולה ידנית (${tt.name}): ${message}`, { queueId: item.id, kind: err.kind, detail: raw });
      console.log(`[worker] ⚠ ${raw}`);
      return;
    }
    if (err instanceof PublishError && err.kind === 'cannot_post') {
      await finish({ status: 'skipped', step: '', skip_reason: message, screenshot_path: screenshot });
      await db.from('social_targets').update({ last_status: 'cannot_post', last_error: message }).eq('id', tt.id);
      await logActivity('warn', 'skipped', `${tt.name}: ${message}`, { queueId: item.id, detail: raw });
      return;
    }
    const afterSubmit = err instanceof PublishError && err.afterSubmit;
    if (afterSubmit) {
      // Never retry automatically once "Post" was clicked — the owner checks the group first.
      await finish({ status: 'needs_attention', step: 'needs_attention', error: message, screenshot_path: screenshot });
      await db.from('social_targets').update({ last_status: 'needs_attention', last_error: message }).eq('id', tt.id);
      await logActivity('error', 'needs_attention', `${tt.name}: ${message}`, { queueId: item.id, step: lastStep, detail: raw });
      console.log(`[worker] ⚠ ${raw}`);
      return;
    }
    if (attempts < MAX_PRE_SUBMIT_ATTEMPTS) {
      const retryAt = new Date(Date.now() + 10 * 60_000 * attempts).toISOString();
      // confirmed_at is cleared with every other per-attempt field: a stamp
      // left from this round would let the next one skip asking (see
      // waitForConfirmation).
      await finish({ status: 'scheduled', step: 'pending', scheduled_at: retryAt, error: message, screenshot_path: screenshot, confirmed_at: null });
      /*
       * `lastStep` is an internal id ("composer", "submit") and `retryAt` is an
       * ISO instant; neither is a sentence, and this line is read in the bell
       * and in /social/history. Both move to meta — nothing is lost, it just
       * stops being the thing on screen.
       */
      await logActivity('warn', 'retry', `${tt.name}: ניסיון ${attempts} לפרסום נכשל. ${message} המערכת תנסה שוב ב-${stampText(retryAt)}.`, {
        queueId: item.id,
        step: lastStep,
        retryAt,
        detail: raw,
      });
      console.log(`[worker] ✖ ${raw} (ינסה שוב)`);
      return;
    }
    await finish({ status: 'failed', step: 'failed', error: message, screenshot_path: screenshot });
    await db.from('social_targets').update({ last_status: 'failed', last_error: message }).eq('id', tt.id);
    await logActivity('error', 'publish_failed', `${tt.name}: ${message}`, { queueId: item.id, step: lastStep, detail: raw });
    console.log(`[worker] ✖ ${raw}`);
    return;
  }

  if (result.outcome === 'cancelled') {
    await finish({ status: 'skipped', step: '', skip_reason: 'לא אושר לפני הפרסום הסופי.' });
    await logActivity('warn', 'cancelled', `"${tt.name}": הפרסום בוטל לפני הלחיצה הסופית`, { queueId: item.id });
    return;
  }

  const note = [
    result.pendingApproval ? 'הפוסט ממתין לאישור מנהל הקבוצה.' : '',
    result.verified ? '' : 'לא הצלחתי לאמת את הפוסט בפיד — בדקו בקבוצה.',
  ]
    .filter(Boolean)
    .join(' ');

  /*
   * The post exists on Facebook from here on, so this write is retried rather
   * than allowed to fail once. If it still will not land the row is LEFT on
   * 'publishing' on purpose — a human sees it stuck and decides, which is the
   * only outcome that cannot post the same thing twice.
   */
  const recorded = await persist(() =>
    finishChecked({
      status: 'published',
      step: 'published',
      /*
       * The instant the POST went live, not the instant we finished looking
       * at it. The spacing rule measures the next publication's gap from this
       * column, so stamping it after verification charged the verification to
       * the gap — which is why a queue set to one a minute produced a "נדחה"
       * for every row. The composer reports the moment the dialog detached
       * with no error banner; `new Date()` remains the fallback for the
       * cancelled path, which has no such moment.
       */
      published_at: result.publishedAt || new Date().toISOString(),
      error: note || null,
      rendered_text: text,
      /* Written only when the feed actually yielded one. Everything that reads
         it later has to work without it anyway — every post published before
         this existed has none. */
      ...(result.permalink ? { permalink: result.permalink } : {}),
    }),
  );
  if (!recorded) {
    state.currentJob = null;
    await logActivity('error', 'publish_unrecorded', `פורסם ל-"${tt.name}" אבל לא הצלחתי לרשום את התוצאה. הפרסום קיים בפייסבוק — סמנו את השורה ידנית.`, { queueId: item.id });
    console.error(`[worker] ⚠ פורסם ל-"${tt.name}" אבל רישום התוצאה נכשל — השורה נשארת "מפרסם" ודורשת בדיקה ידנית.`);
    return;
  }

  const targetPatch: Record<string, unknown> = { last_published_at: new Date().toISOString(), last_status: result.pendingApproval ? 'pending_approval' : 'published', last_error: '' };
  if (result.groupTitle && (tt.name === tt.external_id || !tt.name)) targetPatch.name = result.groupTitle;
  await db.from('social_targets').update(targetPatch).eq('id', tt.id).then(() => undefined, () => undefined);
  await logActivity('info', 'published', `פורסם לקבוצה "${result.groupTitle || tt.name}"${v ? ` (גרסה ${v.label})` : ''}${note ? ` — ${note}` : ''}`, { queueId: item.id, verified: result.verified });
  console.log(`[worker] ✔ פורסם ל-"${tt.name}"${note ? ` (${note})` : ''}`);
}

/** Three tries with a short backoff, for a write that must not be lost. */
async function persist(write: () => Promise<unknown>): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await write();
      return true;
    } catch (err) {
      console.error(`[worker] רישום התוצאה נכשל (ניסיון ${attempt}/3):`, err instanceof Error ? err.message : err);
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  return false;
}

/** Parks the job as awaiting_confirmation with a screenshot and polls for the owner's click. */
async function waitForConfirmation(queueId: string, page: Page): Promise<'confirmed' | 'cancelled' | 'timeout'> {
  const db = await workerDb();
  const screenshot = await captureScreenshot(page, queueId, 'ready_to_publish');
  /*
   * confirmed_at: null is the whole gate.
   *
   * Nothing used to clear this column once it was stamped, and every path that
   * puts a row back in the queue — the pre-submit retry below, "נסה שוב",
   * resumeNeedsAttention — left it set. The next time the same row reached
   * this point the first poll, under three seconds later, read the stamp from
   * the PREVIOUS round and returned 'confirmed': the Post button was clicked
   * without anybody being asked. The owner is told "המערכת תעצור ותחכה לאישור
   * שלכם", so this must be a question every single time.
   */
  await db
    .from('social_queue')
    .update({ status: 'awaiting_confirmation', confirmed_at: null, screenshot_path: screenshot, step: 'ready_to_publish', step_at: new Date().toISOString() })
    .eq('id', queueId);
  console.log('[worker]    ממתין לאישור סופי בלוח הבקרה…');
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (stopping) return 'cancelled';
    const { data } = await db.from('social_queue').select('status, confirmed_at').eq('id', queueId).maybeSingle();
    if (!data) return 'cancelled';
    if (data.confirmed_at) {
      await db.from('social_queue').update({ status: 'publishing' }).eq('id', queueId);
      return 'confirmed';
    }
    if (data.status !== 'awaiting_confirmation') return 'cancelled';
    await sleep(3000);
  }
  await db.from('social_queue').update({ status: 'publishing' }).eq('id', queueId);
  return 'timeout';
}

/* ----------------------------------------------------- signed-in account */

/**
 * Record WHO the browser is signed in as.
 *
 * Called after every login check that came back connected. The avatar is
 * uploaded rather than linked: Facebook's CDN URLs expire and are
 * hotlink-protected, so a stored link would be a broken image on the
 * dashboard within the hour — the same reason group pictures are copied.
 *
 * Every field is written only when it was actually read. A layout change that
 * hides the name leaves the previous name in place rather than blanking it,
 * because "we could not read it this minute" is not the same fact as "there
 * is nobody signed in" — and browser_state already carries the second one.
 */
/**
 * Which account this worker publishes as, and whether that matters yet.
 *
 * THE FILTER TURNS ITSELF ON. While there is one Facebook account in the
 * system — which is every day of this product's life so far — the queue is
 * read exactly as it always has been, with no filter at all. The moment a
 * second account exists, every worker starts taking only the groups that
 * belong to the account it is signed into.
 *
 * That shape is deliberate. A filter that is always on would have to be right
 * on the first tick after an update, on a live machine, against rows that may
 * not have been linked yet — and if it were wrong the symptom is not an error
 * message, it is a business that quietly stops publishing. A filter that is
 * inert until a second account exists cannot do that: today it is provably a
 * no-op, and by the time it is not, the owner has deliberately added an
 * account and is watching.
 *
 * The groups are adopted here too, and under the same guard: with exactly one
 * account, every group with no account yet belongs to it. With two, nothing
 * is adopted — by then a group's account is a decision, not an inference.
 */
async function learnAccountScope(state: WorkerState, db: SupabaseClient, fbUserId: string): Promise<void> {
  const mine = await db
    .from('social_accounts')
    .select('id')
    .eq('provider', 'facebook')
    .eq('provider_user_id', fbUserId)
    .maybeSingle();
  if (mine.error) {
    console.error('[worker] ℹ לא זוהתה שורת החשבון:', mine.error.message);
    return;
  }
  /* Only when there IS a row. A read that merely came back empty — a replica
     a moment behind, a policy hiccup — would otherwise blank an account this
     worker had already identified, and with a second account present that
     turns the scope into "match nothing" until the next login check. */
  if (mine.data) state.accountRow = (mine.data as { id?: string }).id;

  const all = await db.from('social_accounts').select('id', { count: 'exact', head: true });
  if (all.error) {
    console.error('[worker] ℹ לא נספרו החשבונות:', all.error.message);
    return;
  }
  state.accountsTotal = all.count ?? 0;

  /*
   * A QUEUE THAT STOPS MUST NEVER BE SILENT.
   *
   * Once a second account exists this worker takes only its own groups — and
   * "only its own" can be none of them: sign the browser into a second
   * Facebook account and every group still belongs to the first. The due
   * query then matches nothing, the gate opens, the chores run, the heartbeat
   * says online and the dashboard is green, while the queue fills with
   * past-due rows. The owner finds out when a customer mentions it.
   *
   * So the narrowing announces itself, on the card and in the log. This is
   * the one thing the step cannot ship without.
   */
  if ((state.accountsTotal ?? 0) > 1) {
    const stranded = await db
      .from('social_targets')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'facebook_group')
      .not('account_id', 'is', null)
      .neq('account_id', state.accountRow ?? NO_ACCOUNT);
    if (stranded.count) {
      const says = `יש ${state.accountsTotal} חשבונות פייסבוק במערכת, ו-${stranded.count} קבוצות שייכות לחשבון אחר — הן לא יפורסמו מהמחשב הזה.`;
      if (state.attention !== says) {
        state.attention = says;
        await logActivity('warn', 'account_scope_narrowed', says, { accounts: state.accountsTotal, stranded: stranded.count });
      }
    }
  }

  if (state.accountsTotal === 1 && state.accountRow) {
    const adopted = await db
      .from('social_targets')
      .update({ account_id: state.accountRow })
      .is('account_id', null)
      .eq('channel', 'facebook_group')
      .select('id');
    if (adopted.error) console.error('[worker] ℹ לא שויכו קבוצות לחשבון:', adopted.error.message);
    else if (adopted.data?.length) console.log(`[worker] ✓ ${adopted.data.length} קבוצות שויכו לחשבון המחובר.`);
  }
}

async function recordAccount(state: WorkerState, account: AccountProfile | null | undefined): Promise<void> {
  /*
   * NOTHING HERE FAILS QUIETLY, and the first version of it did.
   *
   * Three different things can stop the owner's name reaching the dashboard —
   * the page not yielding one, the storage upload failing, and the columns not
   * existing yet because v9 has not been run — and all three used to look
   * exactly alike from the outside: a chip that said "מחובר" and no name, with
   * nothing written anywhere to say which. supabase-js returns errors rather
   * than throwing, so ignoring the result of an update is a decision to not
   * know. Each case now names itself in the terminal, and the one the owner
   * can actually fix reaches the activity log too.
   */
  if (!account?.id) {
    console.log('[worker] ℹ לא זוהה חשבון פייסבוק מחובר (אין עוגיית c_user).');
    return;
  }
  state.accountId = account.id;
  const db = await workerDb();
  const patch: Record<string, string> = { fb_user_id: account.id };
  /*
   * THE NAME IS WRITTEN EVEN WHEN IT IS EMPTY, and that is a correction.
   *
   * It used to be written only when non-empty, so a wrong value could never be
   * undone — and one was: an early version of the profile-page fallback raced
   * the title and stored the owner's name as "Facebook". A stored answer that
   * is wrong and permanent is worse than no answer, because the screen shows
   * it with the same confidence as a real one.
   *
   * An empty name is now a real answer rather than a gap: readAccountProfile
   * makes two independent attempts — the rail link, then the profile page —
   * and returns a profile object only when it actually reached a signed-in
   * session. A blank after both means there is nothing to show, the chip falls
   * back to the machine state, and a bad value from before is cleared.
   */
  patch.fb_user_name = account.name;
  if (!account.name) console.log('[worker] ℹ זוהה חשבון פייסבוק אבל לא נקרא ממנו שם — הדשבורד יציג "מחובר" בלבד.');

  if (account.image) {
    const objectPath = `workers/${state.id}.png`;
    const { error } = await db.storage
      .from('social-media')
      .upload(objectPath, account.image.bytes, { contentType: account.image.contentType, upsert: true });
    // The cache-buster matters: the object path is stable, so without it the
    // dashboard keeps showing the previous owner's face after a re-login.
    if (error) {
      console.error('[worker] ✗ העלאת תמונת הפרופיל נכשלה:', error.message);
      /*
       * The overwhelmingly likely cause is the missing UPDATE policy, and the
       * owner can fix it in a minute — so it goes where they read rather than
       * only into a terminal they do not watch. The path is stable on purpose,
       * so the SECOND write is the normal case here, not the exception:
       * without that policy the avatar can be created once and never replaced,
       * which is precisely the failure this feature exists to avoid.
       */
      if (/row-level security/i.test(error.message)) {
        await logActivity(
          'warn',
          'avatar_upload_blocked',
          'לא הצלחנו לשמור את תמונת הפרופיל של פייסבוק. צריך להריץ את social-latest.sql ב-Supabase.',
          { detail: error.message },
        );
      }
    } else patch.fb_avatar_url = `${db.storage.from('social-media').getPublicUrl(objectPath).data.publicUrl}?v=${Date.now()}`;
  } else if (account.imageNote === 'screenshot-failed') {
    /*
     * We found the owner's picture and could not photograph it. The stored one
     * stays: this is a transient failure, and blanking a good picture over it
     * would make the chip flicker between a face and an initial.
     */
    console.log('[worker] ℹ נמצאה תמונת פרופיל אבל לא הצלחנו לצלם אותה — נשארת התמונה הקודמת.');
  } else {
    /*
     * NOTHING ON THE PAGE WAS PROVABLY THE OWNER'S — so the stored picture is
     * cleared, and that is deliberate.
     *
     * A previous version had a "biggest square-ish picture" fallback and it
     * photographed a stranger's post from the feed; the dashboard then showed
     * that as the owner's face. Writing only on success would leave that wrong
     * face on screen forever, because the fixed version correctly finds
     * nothing to replace it with. This is the same correction the name got,
     * for the same reason: a stored wrong answer is worse than no answer,
     * since the screen shows it with the same confidence as a real one.
     */
    patch.fb_avatar_url = '';
    console.log('[worker] ℹ לא נמצאה תמונת פרופיל שאפשר לאמת שהיא שלכם — הדשבורד יציג עיגול עם האות הראשונה.');
    /*
     * AND WHAT IT DID SEE. Two guesses at this markup have been wrong, and
     * each one cost a trip to the owner's machine to discover. An empty search
     * that describes what it rejected makes the next attempt reading rather
     * than guessing. Terminal only, and only on failure.
     */
    console.log(
      `[worker]   (בעמוד ${account.probe.nodes} תמונות, מתוכן ${account.probe.shaped} בגודל מתאים · ${account.probe.note} · ${account.probe.where})`,
    );
    for (const line of account.probe.sample) console.log(`[worker]   · ${line}`);
  }

  /*
   * THE ACCOUNT BECOMES A ROW OF ITS OWN, and that is the whole of this step.
   *
   * Until now the connected Facebook account existed only as three columns on
   * the WORKER — fb_user_id, fb_user_name, fb_avatar_url. That is exactly one
   * account, by construction: a second one would have to overwrite the first.
   *
   * social_accounts has been in the schema since the beginning and nothing
   * has ever written to it (social-schema.sql:38). social_targets.account_id
   * already points at it (social-schema.sql:47). The shape for more than one
   * account, and for saying which groups belong to which, was there all along
   * and unused. This fills it in.
   *
   * NOTHING READS IT YET. The dashboard still takes the connected account from
   * the worker's own columns, the queue is still claimed the same way, and one
   * machine still means one account. This only means that when the second
   * account arrives it has somewhere to be, and that the row it needs already
   * exists for the first one.
   *
   * Failure is reported and then ignored: a missing table or a policy must
   * never stop a publication over bookkeeping nobody is reading.
   */
  const upsert = await db
    .from('social_accounts')
    .upsert(
      {
        provider: 'facebook',
        provider_user_id: account.id,
        name: account.name,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,provider_user_id' },
    );
  if (upsert.error) console.error('[worker] ℹ לא נרשם חשבון פייסבוק בטבלת החשבונות:', upsert.error.message);
  else await learnAccountScope(state, db, account.id);

  const { error } = await db.from('social_workers').update(patch).eq('id', state.id);
  if (error) {
    /*
     * The overwhelmingly likely cause is v9 not having been run, and that is
     * something the owner can fix in a minute — so it goes where they read,
     * not only into a terminal they do not watch.
     */
    console.error('[worker] ✗ שמירת פרטי החשבון נכשלה:', error.message);
    await logActivity(
      'warn',
      'account_save_failed',
      'לא הצלחנו לשמור את פרטי חשבון הפייסבוק המחובר. סביר שצריך להריץ את social-latest.sql ב-Supabase.',
      { detail: error.message },
    );
    return;
  }
  console.log(`[worker] ✓ חשבון פייסבוק מחובר: ${patch.fb_user_name || account.id}`);
}

/**
 * Clear the signed-in account from the dashboard.
 *
 * The mirror of recordAccount, and it exists for the same reason that one
 * writes an empty name rather than skipping the write: a stored answer that
 * has stopped being true is worse than none, because the screen shows it with
 * the same confidence as a live one.
 */
async function forgetAccount(state: WorkerState): Promise<void> {
  const db = await workerDb();
  const { error } = await db
    .from('social_workers')
    .update({ fb_user_id: '', fb_user_name: '', fb_avatar_url: '' })
    .eq('id', state.id);
  if (error) console.error('[worker] ✗ ניקוי פרטי החשבון נכשל:', error.message);
  else console.log('[worker] ✓ פרטי חשבון הפייסבוק נוקו.');
}

/* ------------------------------------------- comments the owner asked for */

/** The group's address out of an embedded select, which may come back either way. */
function groupUrlOf(target: { url: string } | { url: string }[] | null | undefined): string | null {
  if (!target) return null;
  return (Array.isArray(target) ? target[0]?.url : target.url) ?? null;
}

/**
 * The group, filtered to the posts WE put there.
 *
 * Falls back to the group itself when the signed-in id is not known yet, which
 * is only true before the first login check of a run.
 */
function ourPostsIn(groupUrl: string | null, accountId: string | undefined): string | null {
  if (!groupUrl) return null;
  if (!accountId) return groupUrl;
  /* Through parseGroupUrl rather than by string surgery: a stored address can
     carry a trailing slash, a ?ref= or a /posts/ tail, and appending to any of
     those produces a page that is not the group filtered to anybody. */
  const group = parseGroupUrl(groupUrl);
  if (!group) return groupUrl;
  return `${group.url}/user/${accountId}/`;
}

/**
 * How many groups to look up per tick. One, and it is not a throttle for its
 * own sake: this opens a real Facebook page and reads it.
 */
const GROUPS_PER_TICK = 1;

/**
 * FIND EACH POST'S OWN ADDRESS ONCE, AND KEEP IT.
 *
 * This is the owner's instruction, and they were right to give it. Everything
 * that touches a published post used to find it by hunting the group for its
 * own words — and that hunt failed for a different reason every round: text
 * containing an emoji that Facebook renders as an image, a scroll that gave up
 * after two passes, a group search that misses recent posts. Each fix bought
 * one round. The approach was the problem: searching for a post by its words
 * is a guess, and a hundred and seventeen guesses fail a hundred and
 * seventeen ways.
 *
 * So: one page per group — the group filtered to OUR posts — read once, and
 * the addresses written down. After this, nothing searches. The comment opens
 * the post. A retry opens the post. The counters are read off the post.
 *
 * Runs before the comments and before the metrics, because both of them are
 * now allowed to assume the address is there.
 */
async function resolveAddresses(state: WorkerState, headless: boolean): Promise<void> {
  if (state.browserState !== 'connected' || !session.hasProfile()) return;
  if (!state.accountId) return;
  const db = await workerDb();

  /* Rows that WANT an address: a comment was asked for and none is stored. */
  const { data, error } = await db
    .from('social_queue')
    .select('id, rendered_text, target_id, target:social_targets(url)')
    .eq('comment_status', 'pending')
    .is('permalink', null)
    .order('published_at')
    .limit(200);
  if (error || !data?.length) return;

  const rows = data as unknown as {
    id: string;
    rendered_text: string;
    target_id: string;
    target: { url: string } | { url: string }[] | null;
  }[];

  /* One group at a time, all of its rows together — which is the entire point
     of doing this by group rather than by post. */
  const byGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    const url = groupUrlOf(row.target);
    if (!url) continue;
    const group = parseGroupUrl(url);
    if (!group) continue;
    byGroup.set(group.url, [...(byGroup.get(group.url) ?? []), row]);
  }

  const todo = [...byGroup].filter(([groupUrl]) => !state.addressTried?.has(groupUrl));
  for (const [groupUrl, groupRows] of todo.slice(0, GROUPS_PER_TICK)) {
    if (stopping) break;
    /*
     * ONCE PER GROUP PER RUN, whatever the answer.
     *
     * Without this the same group is opened every few seconds forever: the
     * rows keep no record of having been looked up, so a group whose page
     * yields nothing is asked again, and again, and no other group is ever
     * reached.
     */
    state.addressTried = (state.addressTried ?? new Set()).add(groupUrl);
    const page = await session.newPage(headless);
    try {
      const posts = await ourPostsInGroup(page, groupUrl, state.accountId);
      const found = posts.length
        ? matchPosts(
            groupRows.map((r) => ({ id: r.id, text: r.rendered_text })),
            posts,
          )
        : {};

      let kept = 0;
      for (const row of groupRows) {
        const url = found[row.id];
        if (!url) continue;
        const saved = await db.from('social_queue').update({ permalink: url }).eq('id', row.id);
        if (saved.error) console.error('[worker] ✗ לא הצלחנו לשמור את כתובת הפוסט:', saved.error.message);
        else kept += 1;
      }
      console.log(`[worker] 🔗 ${groupUrl}: ${posts.length} פרסומים שלנו, ${kept} כתובות נשמרו.`);

      /*
       * NOTHING IS MARKED FAILED HERE, AND THAT IS THE WHOLE RULE.
       *
       * This pass is an OPTIMISATION: it saves the address so nothing has to
       * search for the post twice. When it cannot — the page did not load, the
       * address is shaped differently on this account, Facebook asked for
       * something — the right answer is to leave the row alone and let the
       * comment do its own lookup, which still has the group's search and the
       * feed behind it.
       *
       * The first version of this failed the row instead, and it was worse
       * than the problem it was written to solve: one group per tick, an
       * entire round marked "לא הצליח" over a page that was never essential.
       * A helper that cannot help must stand aside, not take the work down
       * with it.
       */
      if (kept < groupRows.length) {
        console.log(`[worker] ℹ ${groupRows.length - kept} פרסומים בקבוצה הזאת יחופשו בדרך הרגילה.`);
      }
    } catch (err) {
      console.error('[worker] ℹ איתור כתובות לא הצליח (ממשיכים רגיל):', err instanceof Error ? err.message.split('\n')[0] : err);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}

/** Posts commented per idle tick. Deliberately small — see below. */
const COMMENTS_PER_TICK = 1;
/**
 * How many pending rows to LOOK at to find one that is due.
 *
 * Still one comment per tick. The window exists because the pick is global
 * and the gap is per round: with a single candidate, one round whose gap had
 * not elapsed stopped the chore outright and a second live round got nothing
 * at all until the first had drained. Looking a little further along the
 * queue lets the second round's turn come round.
 */
const COMMENT_CANDIDATES = 5;
/**
 * After this long, a row still marked 'commenting' is not in flight.
 *
 * The slowest honest path — no stored address, three lookup pages, each a
 * page load and a scrolling search — is minutes, not a quarter of an hour.
 * Anything older belongs to a worker that died, and the age is what makes
 * this safe to run while another worker is alive: it cannot reach a claim
 * that was taken since that worker started.
 */
const COMMENT_CLAIM_STALE_MS = 15 * 60_000;

/**
 * Rows left claimed by a worker that never came back.
 *
 * 'unverified' rather than 'pending', and that is the whole point: nobody
 * knows whether the comment went up before the machine stopped, and the one
 * outcome that must never happen is a second comment under a live post. The
 * row asks for a person instead, and the bulk retry leaves it alone.
 */
async function sweepStuckComments(db: SupabaseClient): Promise<void> {
  await db
    .from('social_queue')
    .update({ comment_status: 'unverified', comment_note: 'ה-worker נעצר באמצע הוספת התגובה. בדקו בפוסט אם היא נוספה לפני שתנסו שוב.' })
    .eq('comment_status', 'commenting')
    .lt('comment_at', new Date(Date.now() - COMMENT_CLAIM_STALE_MS).toISOString());
}
/**
 * The gap between one comment and the next, when the round has not said.
 *
 * It used to be a fixed 20-40s with no say in it. How fast to go is a
 * judgement about the owner's own account and belongs to them, per round — a
 * hundred posts at ten seconds is twenty minutes, at sixty it is an hour and a
 * half. This is only the fallback for a round saved before the field existed.
 */
const COMMENT_GAP_DEFAULT_SEC = 30;
/**
 * A quarter of the gap, added at random on top of it.
 *
 * Not caution — shape. A hundred and seventeen comments at an exact ten
 * seconds is a metronome, and a metronome is the thing that is recognisable.
 * The same comments at ten-to-twelve seconds are a hundred and seventeen
 * comments. It only ever ADDS, so a chosen ten never becomes eight.
 */
const COMMENT_JITTER = 0.25;

/**
 * This comment's share of the jitter — drawn from its own id, not from a die.
 *
 * The spacing is read back from the database now rather than kept in memory,
 * which is what makes it survive a restart and stay separate per round. That
 * only works if the answer is the SAME every time it is asked: a fresh
 * Math.random() each tick would let a comment whose draw came up low go early
 * simply by being asked again a few seconds later, which is the metronome the
 * jitter exists to break, inside out.
 */
function jitterFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000) * COMMENT_JITTER;
}

/**
 * Leave the round's comment on the posts the owner asked for.
 *
 * ONE PER TICK, and that is not caution for its own sake. Twenty-eight
 * comments appearing across twenty-eight groups inside a minute is a pattern
 * worth nothing to anybody reading them and worth a great deal to whatever at
 * Facebook watches for bursts. Spread over the poll interval they arrive the
 * way a person leaving comments arrives.
 *
 * Runs only when there is nothing to publish: a comment is never more urgent
 * than a post that is due.
 *
 * A row that cannot be commented is marked 'failed' rather than retried
 * forever. The post is live, the owner believes the comment is under it, and
 * an endless retry would keep that belief alive while re-opening the same page
 * every few seconds.
 */
async function runCampaignComments(state: WorkerState, headless: boolean): Promise<boolean> {
  if (state.browserState !== 'connected' || !session.hasProfile()) return false;
  const db = await workerDb();

  /*
   * NO PERMALINK REQUIRED, and that was a real bug: publishing to a group
   * never captures one — nothing in this file has ever written that column —
   * so requiring it meant the queue matched nothing, the button stayed dead,
   * and the owner was told their round had published nothing to comment on
   * while a hundred and twenty-two posts sat above it on the same screen.
   *
   * The post is found by its own text on the group's page instead, which is
   * the only handle a group post actually gives us.
   */
  /*
   * THE ONES WE ALREADY HAVE AN ADDRESS FOR, FIRST.
   *
   * A comment on a post whose address is known is a page load and a box: ten
   * to twenty seconds, which fits in the window between two publications. A
   * comment on a post whose address is NOT known has to hunt the group for
   * the post's own words — up to three pages, each with a scrolling search —
   * and that is minutes, holding the one browser the whole time.
   *
   * Both still happen. But doing the cheap ones first means a round whose
   * posts were published by this version (which writes the address down as it
   * publishes) drains at the owner's chosen pace, instead of being held up
   * behind one old row that has to be excavated. The slow ones are picked up
   * when there is nothing quick left, which is also when there is most likely
   * to be room for them.
   */
  /*
   * A CLAIM NOBODY IS HOLDING, cleared here rather than only at startup.
   *
   * The startup sweep covers a crash, because start-worker.cmd restarts. It
   * does not cover a worker that has been up for days and lost one row to a
   * write that failed: that row is claimed, invisible to the retry button
   * (which only sees 'failed'), and counted as "ממתין" on the screen for ever
   * — a post that reads as waiting for a comment it will never get.
   */
  await sweepStuckComments(db);

  const pending = (known: boolean) => {
    const q = db
      .from('social_queue')
      .select('id, permalink, rendered_text, campaign_id, target:social_targets(url)')
      .eq('comment_status', 'pending');
    return (known ? q.not('permalink', 'is', null) : q.is('permalink', null)).order('published_at').limit(COMMENT_CANDIDATES);
  };
  let { data, error } = await pending(true);
  if (!error && !data?.length) ({ data, error } = await pending(false));
  if (error) {
    if (/comment_status/.test(error.message) && !state.commentNoticeShown) {
      state.commentNoticeShown = true;
      console.error('[worker] ✗ אין עמודות תגובה — הריצו את social-latest.sql ב-Supabase.');
      await logActivity('warn', 'comment_columns_missing', 'כדי להוסיף תגובה לפרסומים של סבב צריך להריץ את social-latest.sql ב-Supabase.', {
        detail: error.message,
      });
    }
    return false;
  }
  if (!data?.length) return false;

  /* True only once the browser has actually been used: the tick's five-second
     brake is what keeps a worker with nothing to do from spinning, and a row
     that was merely re-labelled is not a reason to give it up. */
  let worked = false;
  for (const row of data as unknown as {
    id: string;
    permalink: string | null;
    rendered_text: string;
    campaign_id: string | null;
    /* supabase-js types an embedded relation as an array even when the foreign
       key makes it at most one row. Read defensively rather than asserting a
       shape the client does not promise. */
    target: { url: string } | { url: string }[] | null;
  }[]) {
    if (stopping) break;
    if (!row.campaign_id) {
      /* With a reason. A row that says "לא הצליח" and nothing else is the
         exact failure comment_note was added to end. */
      await db
        .from('social_queue')
        .update({
          comment_status: 'failed',
          comment_at: new Date().toISOString(),
          comment_note: 'הפרסום הזה כבר לא משויך לסבב, ולכן אין ממה לקחת את נוסח התגובה.',
        })
        .eq('id', row.id);
      continue;
    }
    const { data: campaign } = await db
      .from('social_campaigns')
      .select('comment_text, comment_media, comment_gap_seconds')
      .eq('id', row.campaign_id)
      .maybeSingle();
    const text = ((campaign?.comment_text as string) ?? '').trim();
    const media = ((campaign?.comment_media as MediaItem[]) ?? []).filter((m) => m.kind === 'image').slice(0, 1);
    if (!text && !media.length) {
      /* The round's comment was cleared after the rows were marked. Nothing to
         say is not a failure — it is a cancelled request. */
      await db.from('social_queue').update({ comment_status: '', comment_at: null }).eq('id', row.id);
      continue;
    }

    /*
     * THE GAP, READ BACK FROM THE DATABASE AND SCOPED TO THIS ROUND.
     *
     * It used to be two numbers on WorkerState, and both were wrong in a way
     * the owner could feel:
     *
     * - IN MEMORY. The worker updates itself and restarts; the numbers came
     *   back as zero, and the first comment after every update went out with
     *   no gap at all. On a machine that checks for a new version every ten
     *   minutes that is not an edge case.
     * - GLOBAL. One `lastCommentAt` for the whole worker, while the queue is
     *   ordered across every round at once. Two live rounds interleaved, each
     *   got half the rate it asked for, and the gap actually applied to one
     *   round's comment was whatever the OTHER round had been set to.
     * - AND IT WAS ONLY WRITTEN ON SUCCESS. A comment that failed left the
     *   clock untouched, so the next tick — seconds later — tried again with
     *   no gap whatsoever. The one moment slowing down matters most is right
     *   after Facebook has refused something.
     *
     * `comment_at` is written on every outcome, success and failure alike, so
     * the latest one for THIS campaign is all three fixes at once and needs no
     * state of its own.
     */
    const { data: previous } = await db
      .from('social_queue')
      .select('comment_at')
      .eq('campaign_id', row.campaign_id)
      .in('comment_status', ['done', 'failed', 'unverified'])
      .not('comment_at', 'is', null)
      .order('comment_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const gapSec = Math.max(5, Math.min(600, Number(campaign?.comment_gap_seconds) || COMMENT_GAP_DEFAULT_SEC));
    const waitMs = Math.round(gapSec * 1000 * (1 + jitterFor(row.id)));
    const since = (previous as { comment_at?: string } | null)?.comment_at;
    /*
     * PAST THIS ROUND, NOT OUT OF THE CHORE.
     *
     * The pick is global and ordered by publication time; the gap is per
     * round. Returning here stopped everything on the first row whose round
     * was not due, so a second live round waited for the first to drain
     * completely — which is the behaviour the per-round clock was supposed to
     * end. The next candidate may belong to a round whose turn it is.
     */
    if (since && Date.now() - new Date(since).getTime() < waitMs) continue;

    /*
     * CLAIMED BEFORE THE BROWSER IS TOUCHED, exactly as a publication is.
     *
     * Without it the only thing keeping a comment from going out twice was
     * the write that records the outcome — so a write that failed, or a
     * machine that died mid-comment, left the row 'pending' and the next tick
     * commented on the same live post again, and again. The claim takes the
     * row out of the pending set first; if recording the outcome then fails,
     * the row is visibly stuck rather than silently repeated.
     */
    const claimed = await db
      .from('social_queue')
      .update({ comment_status: 'commenting', comment_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('comment_status', 'pending')
      .select('id');
    if (claimed.error) {
      /*
       * SAID, not swallowed. A claim the database refuses — a policy on the
       * worker's role, a column a migration never created — fails the same
       * way for every row, every tick, for ever. Discarding it left the
       * terminal silent, the log silent, and every post reading "ממתין"
       * while nothing whatsoever was happening.
       */
      if (!state.commentNoticeShown) {
        state.commentNoticeShown = true;
        console.error('[worker] ✗ לא הצלחנו לסמן תגובה לכתיבה:', claimed.error.message);
        await logActivity('warn', 'comment_claim_failed', 'לא הצלחנו לסמן פרסום לכתיבת תגובה. ייתכן שצריך להריץ את social-latest.sql ב-Supabase.', {
          detail: claimed.error.message,
        });
      }
      return false;
    }
    /* Somebody else took it between the read and the write. Normal. */
    if (!claimed.data?.length) continue;

    let local: LocalMedia | null = null;
    /*
     * INSIDE THE TRY, because the row is already claimed by this point.
     *
     * Opening a page can fail — a profile that will not start, a browser that
     * died — and thrown from out here it escaped the chore entirely and left
     * the claim standing with no outcome written. The sweep above eventually
     * frees it, but only after fifteen minutes of the post reading "ממתין".
     * Inside, the catch records a real failure the owner can act on.
     */
    let page: Page | null = null;
    try {
      page = await session.newPage(headless);
      local = media.length ? await downloadMedia(`${row.id}-comment`, media).catch(() => null) : null;
      /*
       * THE PICTURE HAS TO GET AS FAR AS THIS MACHINE FIRST.
       *
       * A download that failed used to leave `local` null, and null means "no
       * picture asked for" everywhere below — so the comment went out with the
       * words alone and the screen said "הגיב". Same class of silence as every
       * other bug in this feature: a failure that renamed itself into a
       * different, smaller request.
       */
      if (media.length && !local?.images.length) {
        await saveCommentOutcome(
          db,
          row.id,
          { ok: false, reason: 'לא הצלחנו להוריד את התמונה של התגובה למחשב, ולכן לא פרסמנו אותה בלי התמונה.', permalink: '', tried: [], step: 'no-photo' },
          row.permalink,
          null,
        );
        console.error('[worker] ✗ הורדת התמונה לתגובה נכשלה.');
        continue;
      }
      /* The permalink when there is one, the group otherwise — and for a post
         published before this version there never is one. */
      const where = row.permalink ?? groupUrlOf(row.target) ?? '';
      const outcome = where
        ? await commentOnPost(page, where, row.rendered_text, text, local?.images[0] ?? null, state.accountId ?? '')
        : { ok: false, reason: 'אין לנו כתובת לקבוצה הזאת.', permalink: '', tried: [], step: 'no-post' as const };
      /*
       * The address is written back whether it worked or not. Finding a group
       * post by its own text is the slow, fragile part of this — a search, a
       * scroll, and a guess about which article is ours — and once it has been
       * done the answer is permanent. A retry, and every later read of how the
       * post did, goes straight to the post.
       */
      /*
       * A PICTURE WHEN IT FAILS, because words have not been enough.
       *
       * Three rounds were spent on "לא מצאנו את הפוסט" while the owner was
       * looking straight at the post on his phone. The one thing neither of us
       * could see was the page as the WORKER'S browser had it — whether it was
       * the group, a login wall, or a feed that never loaded. The screenshot
       * ends that argument: it is the same private bucket the login challenge
       * already uses, opened through a short-lived signed link.
       */
      const shot = outcome.ok ? null : await captureScreenshot(page, row.id, 'comment');
      await saveCommentOutcome(db, row.id, outcome, row.permalink, shot);
      if (outcome.ok) console.log('[worker] 💬 נוספה תגובה לפרסום.');
      else console.log(`[worker] ℹ לא הצלחנו להוסיף תגובה: ${outcome.reason} (${outcome.tried.join(' → ') || 'לא ניסינו כתובת'})`);
    } catch (err) {
      const detail = err instanceof Error ? err.message.split('\n')[0] : String(err);
      const shot = page ? await captureScreenshot(page, row.id, 'comment') : null;
      await saveCommentOutcome(db, row.id, { ok: false, reason: `התוכנה נתקלה בתקלה: ${detail}`, permalink: '', tried: [], step: 'not-sent' }, row.permalink, shot);
      console.error('[worker] ✗ הוספת תגובה נכשלה:', detail);
    } finally {
      cleanupMedia(local);
      await page?.close().catch(() => undefined);
      /*
       * SAID OUT LOUD, because a comment can take most of a minute and the
       * dashboard calls a worker disconnected after ninety seconds of silence.
       * Nothing else in this chore speaks to social_workers at all, so a
       * round of slow comments showed the owner "מנותק" while the machine was
       * in the middle of doing exactly what they asked for.
       *
       * `!headless` is passed along rather than left to default: the third
       * argument is debug_mode, and omitting it wrote `false` after every
       * comment — the dashboard's "חלון גלוי" flickering off and back on for
       * an owner running the browser headed.
       */
      await heartbeat(state, 'online', !headless).catch(() => undefined);
    }
    /* One comment per pass. The candidate window above is for FINDING a row
       whose round is due, never for doing several in a breath. */
    worked = true;
    break;
  }
  return worked;
}

/**
 * Write down how it went — including, on a failure, why.
 *
 * `comment_note` arrived after `comment_status` did, so a database that has
 * not been updated yet would reject the whole write over the one column it is
 * missing, and the row would stay 'pending' forever: the queue would pick it
 * up again next tick, comment again, and fail to record that too. The status
 * is what keeps this moving, so it is never allowed to depend on the note.
 */
async function saveCommentOutcome(
  db: Awaited<ReturnType<typeof workerDb>>,
  id: string,
  outcome: CommentOutcome,
  known: string | null,
  shot: string | null,
): Promise<void> {
  /*
   * 'failed' AND 'unverified' ARE NOT THE SAME THING, and the difference is
   * whether pressing "נסה שוב" is safe.
   *
   * 'sent-unsure' means Enter was pressed and Facebook never confirmed. The
   * comment may be under the post right now. Calling that "failed" put it in
   * the bulk retry, and the bulk retry would have put a second comment under
   * a post that already had one — under the owner's own name, permanently.
   * The row says so instead, and waits for a person to look.
   */
  const base: Record<string, unknown> = {
    comment_status: outcome.ok ? 'done' : outcome.step === 'sent-unsure' ? 'unverified' : 'failed',
    comment_at: new Date().toISOString(),
  };
  if (outcome.permalink && outcome.permalink !== known) base.permalink = outcome.permalink;

  const withNote = await db
    .from('social_queue')
    /*
     * The reason, whether it worked or not. A comment CAN now succeed with
     * something worth saying — the picture went in and Facebook never showed
     * it back — and blanking the note on success would have thrown that away.
     * It is '' on a clean success, so nothing else changes.
     */
    .update({ ...base, comment_note: outcome.reason, comment_shot: shot ?? '' })
    .eq('id', id);
  if (!withNote.error) return;
  if (!/comment_note|comment_shot/.test(withNote.error.message)) {
    console.error('[worker] ✗ לא הצלחנו לרשום את תוצאת התגובה:', withNote.error.message);
    return;
  }
  const plain = await db.from('social_queue').update(base).eq('id', id);
  if (plain.error) console.error('[worker] ✗ לא הצלחנו לרשום את תוצאת התגובה:', plain.error.message);
}

/* ------------------------------------------------------------ self-update */

/**
 * Stand down so the launcher can start a newer version.
 *
 * ONLY WHEN THERE IS NOTHING TO PUBLISH. This is called from the idle branch
 * of the tick, after the queue has come back empty, so a restart can never
 * interrupt a post mid-upload — and `currentJob` is checked again anyway,
 * because the cost of being wrong is a post that exists on Facebook with no
 * record of it here.
 *
 * The exit is the whole mechanism. start-worker.cmd already pulls, installs
 * and starts; it simply never got the chance while this process was alive.
 * Nothing here writes to the repository, so a bad checkout cannot be made
 * worse by an update that goes wrong.
 */
async function restartIfUpdated(state: WorkerState): Promise<void> {
  if (state.currentJob) return;
  if (Date.now() - (state.lastUpdateCheckAt ?? 0) < UPDATE_CHECK_MS) return;
  state.lastUpdateCheckAt = Date.now();
  const check = await updateAvailable();
  if (check.problem) {
    /*
     * SAID ONCE, AND SAID ON THE DASHBOARD — because the owner is not at this
     * machine and the terminal is not where they look. A check that cannot run
     * used to be indistinguishable from a machine that is already up to date,
     * so a worker whose GitHub access had expired went on running old code for
     * as long as nobody happened to compare two version numbers by hand.
     */
    if (state.updateProblem !== check.problem) {
      state.updateProblem = check.problem;
      console.error(`[worker] ✗ ${check.problem}${check.detail ? ` (${check.detail})` : ''}`);
      await logActivity('warn', 'worker_update_blocked', check.problem, { detail: check.detail });
    }
    return;
  }
  state.updateProblem = '';
  if (!check.ready) return;

  console.log('[worker] ↻ ירדה גרסה חדשה — מפעיל את עצמי מחדש כדי להתקין אותה.');
  await logActivity('info', 'worker_self_update', 'ירדה גרסה חדשה של התוכנה במחשב. היא מתקינה אותה ומפעילה את עצמה מחדש — אין צורך לגעת במחשב.');
  /* Offline before exiting, so the dashboard shows the gap as a restart in
     progress rather than a machine that stopped answering. */
  await heartbeat(state, 'offline');
  await session.close().catch(() => undefined);
  process.exit(EXIT_UPDATE);
}

/* ------------------------------------------------ how a published post did */

/** Posts re-read per idle tick, and how long before a post is worth re-reading. */
/*
 * One, not three. Reading a post's counters used to be a permalink load; it is
 * now a group page plus a scroll to find our post among other people's, which
 * can take half a minute. Three of those would hold the tick for a minute and
 * a half — and the comment task and the publishing queue are behind it.
 */
const METRICS_PER_TICK = 1;
const METRICS_STALE_HOURS = 6;
/**
 * After this, a post is left alone.
 *
 * A group post's counters stop moving long before this; past it, re-opening
 * the page costs a Facebook page load per post per day forever and tells
 * nobody anything new. The last reading stands, with the time it was taken.
 */
const METRICS_MAX_AGE_DAYS = 30;

/**
 * Re-read the counters on posts that already went out.
 *
 * Runs only when there is nothing to publish, on the same browser session, a
 * few at a time — this is the least urgent thing the worker does and must
 * never sit in front of an actual publication.
 *
 * WHAT IT DOES NOT COLLECT is the part worth stating. Facebook publishes no
 * reach or impressions figure for a group post, and Meta closed the Groups API
 * in April 2024, so the only way to produce an "exposure" number would be to
 * take the group's member count and present it as an audience. That is the one
 * number somebody would actually make decisions on, so it is not invented —
 * here or anywhere above this line.
 *
 * A read that fails leaves the row untouched rather than writing zeros: "we
 * could not read it" and "nobody engaged with it" are different facts, and the
 * screen must not state the second when the first is true.
 */
async function syncPostMetrics(state: WorkerState, headless: boolean): Promise<void> {
  if (state.browserState !== 'connected' || !session.hasProfile()) return;
  const db = await workerDb();
  const staleBefore = new Date(Date.now() - METRICS_STALE_HOURS * 3_600_000).toISOString();
  const publishedAfter = new Date(Date.now() - METRICS_MAX_AGE_DAYS * 86_400_000).toISOString();
  /* Same correction as the comments above: a group post has no permalink, so
     requiring one meant this collected nothing at all, quietly. */
  const { data, error } = await db
    .from('social_queue')
    .select('id, permalink, rendered_text, metrics_at, target:social_targets(url)')
    .eq('status', 'published')
    .gte('published_at', publishedAfter)
    .or(`metrics_at.is.null,metrics_at.lt.${staleBefore}`)
    // Never read, then longest unread. Nulls first is what this ordering gives
    // on Postgres ascending, which is the order we want anyway.
    .order('metrics_at', { ascending: true, nullsFirst: true })
    .limit(METRICS_PER_TICK);
  if (error) {
    /* v13 not run yet. Say it where the owner reads, once — this is a nice to
       have, and it must not turn into a line every five seconds. */
    if (/metrics_/.test(error.message) && !state.metricsNoticeShown) {
      state.metricsNoticeShown = true;
      console.error('[worker] ✗ אין עמודות מדדים — הריצו את social-latest.sql ב-Supabase.');
      await logActivity('warn', 'metrics_columns_missing', 'כדי לראות תגובות וצפיות על הפרסומים צריך להריץ את social-latest.sql ב-Supabase.', {
        detail: error.message,
      });
    }
    return;
  }
  if (!data?.length) return;

  for (const row of data as unknown as {
    id: string;
    permalink: string | null;
    rendered_text: string;
    target: { url: string } | { url: string }[] | null;
  }[]) {
    if (stopping) break;
    const page = await session.newPage(headless);
    try {
      /* Same lookup problem as the comments, same answer: a group filtered to
         our own posts loads what we published, not what the group published. */
      const where = row.permalink ?? ourPostsIn(groupUrlOf(row.target), state.accountId) ?? '';
      const m = where ? await readPostMetrics(page, where, row.rendered_text) : null;
      if (!m) {
        /* Login wall or checkpoint: the numbers on screen are not this post's.
           Leave the row unread and let the job path report the session. */
        state.lastCheckAt = 0;
        return;
      }
      await db
        .from('social_queue')
        .update({
          metrics_seen: m.seen,
          metrics_views: m.views,
          metrics_reactions: m.reactions,
          metrics_comments: m.comments,
          metrics_shares: m.shares,
          metrics_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    } catch (err) {
      // One unreadable post must not stop the rest, and must not be recorded
      // as a post that did nothing.
      console.error('[worker] ℹ לא הצלחנו לקרוא מדדים מפרסום:', err instanceof Error ? err.message.split('\n')[0] : err);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}

/* --------------------------------------------------------- claiming a command */

/**
 * Take a command, emptying its one-time payload in the same statement.
 *
 * THE FALLBACK IS THE POINT, and it exists because of a real failure on the
 * owner's machine: a command sat at "pending" forever with nothing written
 * anywhere to say why. The claim writes `payload: {}` — correct, and the whole
 * reason a password never becomes a stored secret — but on a database where
 * social-latest.sql has not been run that column does not exist, so the
 * update fails, the row is never claimed, and supabase-js returns the error
 * rather than throwing it. Discarding that result was a decision not to know,
 * and it turned one un-run migration into a worker that silently ignored every
 * instruction the dashboard sent it.
 *
 * So: try the safe form, and if the column is missing, say so where the owner
 * reads and claim the command anyway. A missing column must not stop the
 * product working; it must only stop it being tidy.
 */
async function claimCommand(id: string, workerId: string, patch: Record<string, unknown>): Promise<boolean> {
  const db = await workerDb();
  const attempt = async (withPayload: boolean) =>
    db
      .from('social_worker_commands')
      .update({ ...patch, worker_id: workerId, ...(withPayload ? { payload: {} } : {}) })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');

  const { data, error } = await attempt(true);
  if (!error) return Boolean(data?.length);

  if (!/payload/i.test(error.message)) {
    console.error('[worker] ✗ נטילת הפקודה נכשלה:', error.message);
    return false;
  }
  console.error('[worker] ✗ אין עמודת payload — הפקודות לא ינוקו. הריצו את social-latest.sql ב-Supabase.');
  await logActivity(
    'warn',
    'commands_payload_missing',
    'צריך להריץ את social-latest.sql ב-Supabase. בלעדיו פרטי ההתחברות שנשלחים מהמסך לא נמחקים אוטומטית.',
    { detail: error.message },
  );
  const retry = await attempt(false);
  if (retry.error) {
    console.error('[worker] ✗ נטילת הפקודה נכשלה:', retry.error.message);
    return false;
  }
  return Boolean(retry.data?.length);
}

/* ------------------------------------------- Facebook's questions, on screen */

/** How long a person gets to read the challenge and answer it. */
const CHALLENGE_WAIT_MS = 6 * 60_000;

/**
 * Show what Facebook is asking, and wait for the answer from the app.
 *
 * This is the piece that makes a login finishable by somebody who is nowhere
 * near the machine — which is the whole point of selling this: their browser
 * runs on a server they will never see, and "go to the computer and type the
 * code" is not an instruction anybody can follow.
 *
 * The picture goes to the PRIVATE social-debug bucket, because it is a
 * photograph of somebody's Facebook mid-login; the app reads it through a
 * short-lived signed URL. Nothing about the page is interpreted here — it is
 * photographed as-is, so a challenge in any language, of any kind, reaches the
 * person who can actually answer it.
 *
 * Returns the answer, or null if nobody replied in time. Null is a real
 * outcome: the login loop simply goes on waiting for a session until its own
 * deadline, exactly as it did before this existed.
 */
async function askOnScreen(state: WorkerState, shot: Buffer): Promise<string | null> {
  const db = await workerDb();
  const objectPath = `login/${state.id}-${Date.now()}.png`;
  const { error: upErr } = await db.storage.from('social-debug').upload(objectPath, shot, { contentType: 'image/png', upsert: true });
  if (upErr) console.error('[worker] ✗ העלאת צילום האימות נכשלה:', upErr.message);
  const { error } = await db
    .from('social_workers')
    .update({ login_stage: 'challenge', login_shot: upErr ? '' : objectPath, login_asked_at: new Date().toISOString() })
    .eq('id', state.id);
  if (error) {
    console.error('[worker] ✗ פרסום שאלת האימות נכשל:', error.message);
    await logActivity('warn', 'login_challenge_failed', 'פייסבוק ביקשה אימות אבל לא הצלחנו להציג אותו במסך. סביר שצריך להריץ את social-latest.sql ב-Supabase.', { detail: error.message });
    return null;
  }
  console.log('[worker] ℹ פייסבוק מבקשת אימות — השאלה הועברה למסך, ממתין לתשובה.');
  await logActivity('warn', 'login_challenge', 'פייסבוק מבקשת אימות כדי להשלים את ההתחברות. פתחו את מסך החשבון והזינו את מה שהיא מבקשת.');

  /*
   * Polled from inside the login rather than through the command loop, because
   * the login command is still holding that loop. Same one-time envelope as
   * the password: read, then emptied in the statement that claims it.
   */
  const deadline = Date.now() + CHALLENGE_WAIT_MS;
  while (Date.now() < deadline) {
    const { data } = await db
      .from('social_worker_commands')
      .select('id, payload')
      .eq('status', 'pending')
      .eq('command', 'verify')
      .or(`worker_id.eq.${state.id},worker_id.is.null`)
      .order('created_at')
      .limit(1);
    const row = (data ?? [])[0] as { id: string; payload?: { code?: string } } | undefined;
    if (row) {
      const code = row.payload?.code ?? '';
      const claimed = await claimCommand(row.id, state.id, {
        status: 'done',
        result: 'התשובה הועברה לפייסבוק.',
        finished_at: new Date().toISOString(),
      });
      if (claimed && code) {
        console.log('[worker] ✓ התקבלה תשובת אימות מהמסך.');
        return code;
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log('[worker] ℹ לא התקבלה תשובת אימות בזמן.');
  return null;
}

/**
 * Take the question off the screen.
 *
 * A challenge that has been resolved — answered, abandoned or timed out — must
 * not still be sitting on the account screen asking for a code, or the next
 * person to look at it answers a question nobody is listening to. Called on
 * every exit from a login, whatever its outcome.
 */
async function clearChallenge(state: WorkerState): Promise<void> {
  const db = await workerDb();
  await db.from('social_workers').update({ login_stage: '', login_shot: '', login_asked_at: null }).eq('id', state.id);
}

/* ------------------------------------------------------------ helpers */

async function heartbeat(state: WorkerState, status: 'online' | 'needs_attention' | 'offline', debugMode = false, browserOverride?: WorkerState['browserState']): Promise<void> {
  const db = await workerDb();
  await db
    .from('social_workers')
    .update({
      status,
      browser_state: browserOverride ?? state.browserState,
      attention_message: state.attention,
      current_job_id: state.currentJob,
      debug_mode: debugMode,
      last_seen_at: new Date().toISOString(),
      version: VERSION,
    })
    .eq('id', state.id);
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await workerDb();
  const row = unwrap<{ value: Record<string, unknown> } | null>(await db.from('social_settings').select('value').eq('key', key).maybeSingle());
  return row ? ({ ...fallback, ...row.value } as T) : fallback;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error('[worker] נכשל:', err instanceof Error ? err.message : err);
  process.exit(1);
});
