import { hostname } from 'node:os';
import type { Page } from 'playwright-core';
import { detectCity } from '@/lib/social/cities';
import { renderPostText } from '@/lib/social/compose';
import { planQueue } from '@/lib/social/plan';
import { evaluateQueueItem } from '@/lib/social/rules';
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
import { logActivity, unwrap, workerDb } from './db';
import { env } from './env';
import { PublishError } from './facebook/composer';
import { readGroupProfile } from './facebook/profile';
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
      if (check.state !== 'connected') state.attention = check.detail;
      await heartbeat(state, state.attention ? 'needs_attention' : 'online', browser.debugMode);
      console.log(`[worker] בדיקת חיבור לפייסבוק: ${check.detail}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[worker] בדיקת החיבור נכשלה:', message);
      // Surface it on the dashboard too, so the card explains itself instead
      // of sitting on "not checked yet" while the terminal holds the reason.
      state.attention = message.split('\n')[0];
      state.browserState = 'needs_auth';
      await heartbeat(state, 'needs_attention', false);
      await logActivity('error', 'browser_start_failed', message.split('\n')[0]);
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
      console.error('[worker] שגיאה בלולאה:', err instanceof Error ? err.message : err);
      await logActivity('error', 'worker_error', err instanceof Error ? err.message : String(err));
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
    if (check.state !== 'connected') {
      state.attention = check.detail;
      await logActivity('warn', 'browser_needs_auth', check.detail);
      return;
    }
  }
  state.idleNoticeShown = false;

  const jobs = (due as (QueueItem & { target: unknown })[]).map(({ target: _t, ...item }) => item);
  const concurrency = Math.max(1, Math.min(3, browser.concurrentJobs || 1));
  await Promise.all(jobs.slice(0, concurrency).map((item) => runJob(state, item, { limits, browser, headless })));
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
        if (!error) patch.image_url = `${db.storage.from('social-media').getPublicUrl(objectPath).data.publicUrl}?v=${Date.now()}`;
      }
      await db.from('social_targets').update(patch).eq('id', target.id);
      console.log(`[worker] ℹ פרטי קבוצה: "${patch.name ?? target.name}"${profile.image ? ' + תמונה' : ''}`);
    } catch (err) {
      await db.from('social_targets').update({ last_synced_at: new Date().toISOString(), last_error: `משיכת פרטים נכשלה: ${err instanceof Error ? err.message : err}` }).eq('id', target.id);
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
  for (const cmd of (data ?? []) as WorkerCommand[]) {
    const { data: claimed } = await db.from('social_worker_commands').update({ status: 'running', worker_id: state.id }).eq('id', cmd.id).eq('status', 'pending').select('id');
    if (!claimed?.length) continue;
    console.log(`[worker] פקודה: ${cmd.command}`);
    let result = '';
    let ok = true;
    try {
      if (cmd.command === 'login') {
        await heartbeat(state, 'online', browser.debugMode, 'needs_auth');
        const r = await session.interactiveLogin();
        state.browserState = r.state;
        state.lastCheckAt = Date.now();
        if (r.state === 'connected') state.attention = '';
        result = r.detail;
      } else if (cmd.command === 'check') {
        const r = await session.checkLogin(headless);
        state.browserState = r.state;
        state.lastCheckAt = Date.now();
        if (r.state === 'connected') state.attention = '';
        else state.attention = r.detail;
        result = r.detail;
      } else if (cmd.command === 'logout') {
        await session.logout();
        state.browserState = 'disconnected';
        state.attention = '';
        result = 'הפרופיל המקומי נמחק — הדפדפן מנותק מפייסבוק.';
      } else if (cmd.command === 'resume') {
        state.attention = '';
        state.browserState = session.hasProfile() ? 'unknown' : 'disconnected';
        result = 'ממשיך. עבודות שסומנו "דורש טיפול" יחזרו לתור אם הפעלתם אותן מחדש בלוח הבקרה.';
      }
    } catch (err) {
      ok = false;
      result = err instanceof Error ? err.message : String(err);
    }
    await db.from('social_worker_commands').update({ status: ok ? 'done' : 'failed', result, finished_at: new Date().toISOString() }).eq('id', cmd.id);
    await logActivity(ok ? 'info' : 'error', `worker_${cmd.command}`, result);
    console.log(`[worker] ${cmd.command}: ${result}`);
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

  const decision = await evaluateQueueItem(db, { item: { ...item, attempts }, target: t, post: p, variant: v, limits: jobEnv.limits, browser: jobEnv.browser });
  if (decision.action === 'skip') {
    await finish({ status: 'skipped', step: '', skip_reason: decision.reason });
    await logActivity('warn', 'skipped', decision.reason, { queueId: item.id, target: t?.name });
    console.log(`[worker] ⏭ "${t?.name ?? item.target_id}": ${decision.reason}`);
    return;
  }
  if (decision.action === 'defer') {
    await finish({ status: 'scheduled', step: 'pending', scheduled_at: decision.until });
    await logActivity('info', 'deferred', `${decision.reason} (עד ${decision.until})`, { queueId: item.id });
    console.log(`[worker] ⏲ "${t?.name ?? item.target_id}": ${decision.reason} (${decision.until})`);
    return;
  }
  if (decision.action === 'wait') {
    await finish({ status: 'scheduled', step: 'pending' });
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

  try {
    const result = await adapter.publish({
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
    await finish({ status: 'published', step: 'published', published_at: new Date().toISOString(), error: note || null, rendered_text: text });
    const targetPatch: Record<string, unknown> = { last_published_at: new Date().toISOString(), last_status: result.pendingApproval ? 'pending_approval' : 'published', last_error: '' };
    if (result.groupTitle && (tt.name === tt.external_id || !tt.name)) targetPatch.name = result.groupTitle;
    await db.from('social_targets').update(targetPatch).eq('id', tt.id);
    await logActivity('info', 'published', `פורסם לקבוצה "${result.groupTitle || tt.name}"${v ? ` (גרסה ${v.label})` : ''}${note ? ` — ${note}` : ''}`, { queueId: item.id, verified: result.verified });
    console.log(`[worker] ✔ פורסם ל-"${tt.name}"${note ? ` (${note})` : ''}`);
  } catch (err) {
    const screenshot = failureShot ?? (await captureScreenshot(livePage, item.id, lastStep));
    if (err instanceof SessionError) {
      state.attention = err.message;
      state.browserState = 'needs_auth';
      await finish({ status: 'needs_attention', step: 'needs_attention', error: err.message, screenshot_path: screenshot });
      await db.from('social_targets').update({ last_status: 'needs_attention', last_error: err.message }).eq('id', tt.id);
      await heartbeat(state, 'needs_attention', jobEnv.browser.debugMode, 'needs_auth');
      await logActivity('error', 'needs_attention', `Facebook דורש פעולה ידנית (${tt.name}): ${err.message}`, { queueId: item.id, kind: err.kind });
      console.log(`[worker] ⚠ ${err.message}`);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof PublishError && err.kind === 'cannot_post') {
      await finish({ status: 'skipped', step: '', skip_reason: message, screenshot_path: screenshot });
      await db.from('social_targets').update({ last_status: 'cannot_post', last_error: message }).eq('id', tt.id);
      await logActivity('warn', 'skipped', `${tt.name}: ${message}`, { queueId: item.id });
      return;
    }
    const afterSubmit = err instanceof PublishError && err.afterSubmit;
    if (afterSubmit) {
      // Never retry automatically once "Post" was clicked — the owner checks the group first.
      await finish({ status: 'needs_attention', step: 'needs_attention', error: message, screenshot_path: screenshot });
      await db.from('social_targets').update({ last_status: 'needs_attention', last_error: message }).eq('id', tt.id);
      await logActivity('error', 'needs_attention', `${tt.name}: ${message}`, { queueId: item.id, step: lastStep });
      console.log(`[worker] ⚠ ${message}`);
      return;
    }
    if (attempts < MAX_PRE_SUBMIT_ATTEMPTS) {
      const retryAt = new Date(Date.now() + 10 * 60_000 * attempts).toISOString();
      await finish({ status: 'scheduled', step: 'pending', scheduled_at: retryAt, error: message, screenshot_path: screenshot });
      await logActivity('warn', 'retry', `${tt.name}: ניסיון ${attempts} נכשל בשלב ${lastStep}, ינסה שוב ב-${retryAt}: ${message}`, { queueId: item.id });
      console.log(`[worker] ✖ ${message} (ינסה שוב)`);
      return;
    }
    await finish({ status: 'failed', step: 'failed', error: message, screenshot_path: screenshot });
    await db.from('social_targets').update({ last_status: 'failed', last_error: message }).eq('id', tt.id);
    await logActivity('error', 'publish_failed', `${tt.name}: ${message}`, { queueId: item.id, step: lastStep });
    console.log(`[worker] ✖ ${message}`);
  }
}

/** Parks the job as awaiting_confirmation with a screenshot and polls for the owner's click. */
async function waitForConfirmation(queueId: string, page: Page): Promise<'confirmed' | 'cancelled' | 'timeout'> {
  const db = await workerDb();
  const screenshot = await captureScreenshot(page, queueId, 'ready_to_publish');
  await db.from('social_queue').update({ status: 'awaiting_confirmation', screenshot_path: screenshot, step: 'ready_to_publish', step_at: new Date().toISOString() }).eq('id', queueId);
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
