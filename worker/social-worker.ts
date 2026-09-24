import { hostname } from 'node:os';
import type { Page } from 'playwright-core';
import { detectCity } from '@/lib/social/cities';
import { renderPostText } from '@/lib/social/compose';
import { planQueue } from '@/lib/social/plan';
import { evaluateQueueItem } from '@/lib/social/rules';
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
  /** When the last comment went out, and the gap drawn for the next one. */
  lastCommentAt?: number;
  commentGapMs?: number;
  /**
   * The c_user id of the account the browser is signed in as.
   *
   * Kept here because finding one of our own posts in a group comes down to
   * it: `/groups/<id>/user/<this>/` is the group filtered to what WE posted,
   * which is three or four things instead of an afternoon of everybody else's.
   */
  accountId?: string;
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
    idleNoticeShown: false,
    accountId: ((worker as { fb_user_id?: string }).fb_user_id ?? '') || undefined,
  };

  // Jobs this worker was running when it died: never auto-retry (the post may exist).
  await db
    .from('social_queue')
    .update({ status: 'needs_attention', step: 'needs_attention', error: 'ה-worker הופסק באמצע העבודה. בדקו בקבוצה אם הפוסט עלה, ואז "נסה שוב" או "דלג".' })
    .eq('worker_id', state.id)
    .in('status', ['publishing', 'awaiting_confirmation']);

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
    await sleep(env.pollMs);
  }
  await heartbeat(state, 'offline');
  await session.close();
  await logActivity('info', 'worker_stopped', `ה-worker "${env.workerName}" נעצר`);
  process.exit(0);
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
  const { data: due, error } = await db
    .from('social_queue')
    .select('*, target:social_targets!inner(channel)')
    .eq('status', 'scheduled')
    .eq('target.channel', 'facebook_group')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(Math.max(1, Math.min(3, browser.concurrentJobs || 1)));
  if (error) throw new Error(error.message);
  if (!due?.length) {
    await resolveAddresses(state, headless);
    await runCampaignComments(state, headless);
    await resolveShareLinks(state, headless);
    await syncGroupProfiles(state, headless);
    await syncPostMetrics(state, headless);
    await restartIfUpdated(state);
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
    await finish({ status: 'scheduled', step: 'pending', scheduled_at: decision.until });
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
      published_at: new Date().toISOString(),
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

  for (const [groupUrl, groupRows] of [...byGroup].slice(0, GROUPS_PER_TICK)) {
    if (stopping) break;
    const page = await session.newPage(headless);
    try {
      const posts = await ourPostsInGroup(page, groupUrl, state.accountId);
      if (!posts.length) {
        /*
         * NOT "the posts are gone". The page may have been a login wall, or
         * the group may have stopped loading. Saying which is the difference
         * between a retry that helps and one that repeats — so the note says
         * what we opened, and the picture shows what came back.
         */
        const shot = await captureScreenshot(page, groupRows[0].id, 'address');
        for (const row of groupRows) {
          await db
            .from('social_queue')
            .update({
              comment_status: 'failed',
              comment_at: new Date().toISOString(),
              comment_note: 'לא הצלחנו לפתוח את רשימת הפרסומים שלכם בקבוצה הזאת. ייתכן שפייסבוק ביקשה אימות, או שאין לנו גישה לקבוצה.',
              comment_shot: shot ?? '',
            })
            .eq('id', row.id)
            .then((r) => (r.error ? console.error('[worker] ✗', r.error.message) : undefined));
        }
        console.error(`[worker] ✗ לא נמצאו פרסומים שלנו ב-${groupUrl}`);
        continue;
      }

      const found = matchPosts(
        groupRows.map((r) => ({ id: r.id, text: r.rendered_text })),
        posts,
      );
      let kept = 0;
      for (const row of groupRows) {
        const url = found[row.id];
        if (!url) continue;
        const saved = await db.from('social_queue').update({ permalink: url }).eq('id', row.id);
        if (saved.error) console.error('[worker] ✗ לא הצלחנו לשמור את כתובת הפוסט:', saved.error.message);
        else kept += 1;
      }
      console.log(`[worker] 🔗 ${groupUrl}: ${posts.length} פרסומים שלנו, ${kept} כתובות נשמרו.`);

      /* A row we could not identify among our OWN posts is a real dead end:
         the text no longer resembles anything there. Say so with the picture,
         rather than leaving it pending to be tried again identically. */
      for (const row of groupRows) {
        if (found[row.id]) continue;
        const shot = await captureScreenshot(page, row.id, 'address');
        await db
          .from('social_queue')
          .update({
            comment_status: 'failed',
            comment_at: new Date().toISOString(),
            comment_note: `מצאנו ${posts.length} פרסומים שלכם בקבוצה, אבל אף אחד מהם לא תאם לפרסום הזה. ייתכן שהוא נמחק.`,
            comment_shot: shot ?? '',
          })
          .eq('id', row.id);
      }
    } catch (err) {
      console.error('[worker] ✗ איתור כתובות נכשל:', err instanceof Error ? err.message.split('\n')[0] : err);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}

/** Posts commented per idle tick. Deliberately small — see below. */
const COMMENTS_PER_TICK = 1;
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
async function runCampaignComments(state: WorkerState, headless: boolean): Promise<void> {
  if (state.browserState !== 'connected' || !session.hasProfile()) return;
  const db = await workerDb();
  /*
   * SPACED, not merely one per tick. The poll interval is a few seconds, so
   * without this the whole round's comments would land inside two minutes.
   */
  if (Date.now() - (state.lastCommentAt ?? 0) < (state.commentGapMs ?? COMMENT_GAP_DEFAULT_SEC * 1000)) return;

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
  const { data, error } = await db
    .from('social_queue')
    .select('id, permalink, rendered_text, campaign_id, target:social_targets(url)')
    .eq('comment_status', 'pending')
    .order('published_at')
    .limit(COMMENTS_PER_TICK);
  if (error) {
    if (/comment_status/.test(error.message) && !state.commentNoticeShown) {
      state.commentNoticeShown = true;
      console.error('[worker] ✗ אין עמודות תגובה — הריצו את social-latest.sql ב-Supabase.');
      await logActivity('warn', 'comment_columns_missing', 'כדי להוסיף תגובה לפרסומים של סבב צריך להריץ את social-latest.sql ב-Supabase.', {
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
    campaign_id: string | null;
    /* supabase-js types an embedded relation as an array even when the foreign
       key makes it at most one row. Read defensively rather than asserting a
       shape the client does not promise. */
    target: { url: string } | { url: string }[] | null;
  }[]) {
    if (stopping) break;
    if (!row.campaign_id) {
      await db.from('social_queue').update({ comment_status: 'failed', comment_at: new Date().toISOString() }).eq('id', row.id);
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

    let local: LocalMedia | null = null;
    const page = await session.newPage(headless);
    try {
      local = media.length ? await downloadMedia(`${row.id}-comment`, media).catch(() => null) : null;
      /* The permalink when there is one, the group otherwise — and for a post
         published before this version there never is one. */
      const where = row.permalink ?? groupUrlOf(row.target) ?? '';
      const outcome = where
        ? await commentOnPost(page, where, row.rendered_text, text, local?.images[0] ?? null, state.accountId ?? '')
        : { ok: false, reason: 'אין לנו כתובת לקבוצה הזאת.', permalink: '', tried: [] };
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
      state.lastCommentAt = Date.now();
      /* Clamped again here: the column is an integer anybody with database
         access could set to zero, and this is the code that would then hammer
         Facebook with it. */
      const chosen = Math.max(5, Math.min(600, Number(campaign?.comment_gap_seconds) || COMMENT_GAP_DEFAULT_SEC));
      state.commentGapMs = Math.round(chosen * 1000 * (1 + Math.random() * COMMENT_JITTER));
    } catch (err) {
      const detail = err instanceof Error ? err.message.split('\n')[0] : String(err);
      const shot = await captureScreenshot(page, row.id, 'comment');
      await saveCommentOutcome(db, row.id, { ok: false, reason: `התוכנה נתקלה בתקלה: ${detail}`, permalink: '', tried: [] }, row.permalink, shot);
      console.error('[worker] ✗ הוספת תגובה נכשלה:', detail);
    } finally {
      cleanupMedia(local);
      await page.close().catch(() => undefined);
    }
  }
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
  const base: Record<string, unknown> = {
    comment_status: outcome.ok ? 'done' : 'failed',
    comment_at: new Date().toISOString(),
  };
  if (outcome.permalink && outcome.permalink !== known) base.permalink = outcome.permalink;

  const withNote = await db
    .from('social_queue')
    .update({ ...base, comment_note: outcome.ok ? '' : outcome.reason, comment_shot: shot ?? '' })
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
