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
import { logActivity, safeError, unwrap, workerDb } from './db';
import { env } from './env';
import { PublishError } from './facebook/composer';
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
const MAX_PRE_SUBMIT_ATTEMPTS = 3;

interface WorkerState {
  id: string;
  browserState: 'connected' | 'needs_auth' | 'disconnected' | 'unknown';
  attention: string;
  currentJob: string | null;
  lastCheckAt: number;
  lastPlanAt: number;
  idleNoticeShown: boolean;
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
    .select('id')
    .single();
  if (!worker) throw new Error('רישום ה-worker נכשל — האם הרצתם את supabase/social-schema-v2.sql?');
  const state: WorkerState = {
    id: worker.id,
    browserState: session.hasProfile() ? 'unknown' : 'disconnected',
    attention: '',
    currentJob: null,
    lastCheckAt: 0,
    lastPlanAt: 0,
    idleNoticeShown: false,
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
    await syncGroupProfiles(state, headless);
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
    const { data: claimed } = await db
      .from('social_worker_commands')
      .update({ status: 'running', worker_id: state.id, payload: {} })
      .eq('id', cmd.id)
      .eq('status', 'pending')
      .select('id');
    if (!claimed?.length) continue;
    // The command NAME only. Its payload is never printed, here or anywhere.
    console.log(`[worker] פקודה: ${cmd.command}`);
    let result = '';
    let raw = '';
    let ok = true;
    try {
      if (cmd.command === 'login') {
        await heartbeat(state, 'online', browser.debugMode, 'needs_auth');
        const r = await session.interactiveLogin(entered);
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
    finishChecked({ status: 'published', step: 'published', published_at: new Date().toISOString(), error: note || null, rendered_text: text }),
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
          'לא הצלחנו לשמור את תמונת הפרופיל של פייסבוק. צריך להריץ את social-schema-v10.sql ב-Supabase.',
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
      'לא הצלחנו לשמור את פרטי חשבון הפייסבוק המחובר. סביר שצריך להריץ את social-schema-v9.sql ב-Supabase.',
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
