import 'server-only';
import { adapterFor } from '../channels/registry';
import { renderPostText } from '../compose';
import { evaluateQueueItem } from '../rules';
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
} from '../types';
import { getSetting, serviceDb, setSetting } from './db';
import { GraphError } from './graph';
import { logActivity } from './log';
import { planQueue } from './planner';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * The server-side publishing worker (Pages through the Graph API). Called by
 * /api/social/cron (scheduled) and /api/social/run ("publish now"). One run:
 *
 *   1. bails out if the owner paused everything or Meta asked us to cool down;
 *   2. materialises upcoming schedules into queue rows;
 *   3. claims due rows whose channel is API-publishable (atomic status flip),
 *      applies the shared anti-spam rules, then hands each to its adapter;
 *   4. records the outcome and writes the activity log.
 *
 * Facebook Group rows are deliberately NOT touched here — the local browser
 * worker (worker/social-worker.ts) claims those.
 *
 * MAX_PER_RUN keeps a single invocation short (serverless time limits) and
 * naturally spreads bursts across cron ticks.
 */
const MAX_PER_RUN = 5;
const MAX_ATTEMPTS = 4;
const STUCK_MINUTES = 15;
/** Channels this (server) worker publishes. Everything else belongs to another worker. */
const SERVER_CHANNELS = ['facebook_page', 'facebook_group_manual'];

export interface WorkerReport {
  ran: boolean;
  reason?: string;
  planned: number;
  processed: number;
  published: number;
  manual: number;
  skipped: number;
  failed: number;
  deferred: number;
}

/**
 * How long a run is assumed to still be in flight. Shorter than the route's
 * maxDuration so a crashed run cannot wedge the queue.
 */
const RUN_LOCK_SECONDS = 70;

export async function runWorker(trigger: 'cron' | 'manual'): Promise<WorkerReport> {
  const db = serviceDb();
  const report: WorkerReport = { ran: false, planned: 0, processed: 0, published: 0, manual: 0, skipped: 0, failed: 0, deferred: 0 };

  /*
   * A soft lock against overlapping runs — a double-tap on "publish now", a
   * retried request, a cron tick landing on top of a manual one. It is not a
   * distributed lock (two requests could still read it in the same instant),
   * and it is not what makes publishing safe: the atomic claim below
   * (UPDATE … WHERE status = 'scheduled') is the guarantee that one queue row
   * is published exactly once. This just stops the pointless work.
   */
  const lock = await getSetting<{ startedAt: string | null }>('run_lock', { startedAt: null });
  if (lock.startedAt && Date.now() - new Date(lock.startedAt).getTime() < RUN_LOCK_SECONDS * 1000) {
    report.reason = 'ריצה קודמת עדיין פועלת';
    return report;
  }
  await setSetting('run_lock', { startedAt: new Date().toISOString() });

  try {
    return await runWorkerLocked(db, trigger, report);
  } finally {
    await setSetting('run_lock', { startedAt: null });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function runWorkerLocked(db: any, trigger: 'cron' | 'manual', report: WorkerReport): Promise<WorkerReport> {
  const control = await getSetting<ControlSettings>('control', { paused: false, rateLimitedUntil: null });
  if (control.paused) {
    report.reason = 'התורים מושהים';
    return report;
  }
  if (control.rateLimitedUntil && new Date(control.rateLimitedUntil) > new Date()) {
    report.reason = `המתנה להסרת הגבלת קצב של Meta (עד ${control.rateLimitedUntil})`;
    return report;
  }
  if (control.rateLimitedUntil) await setSetting('control', { ...control, rateLimitedUntil: null });

  report.ran = true;
  report.planned = await planQueue();

  // Rows this worker left in "publishing" (a crashed run) are failed so they
  // can be retried by hand. Browser-worker rows carry a worker_id and are
  // recovered by that worker itself.
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  await db
    .from('social_queue')
    .update({ status: 'failed', error: 'הריצה נקטעה באמצע הפרסום — אפשר לנסות שוב.' })
    .eq('status', 'publishing')
    .is('worker_id', null)
    .lt('claimed_at', stuckBefore);

  const limits = await getSetting<LimitsSettings>('limits', DEFAULT_LIMITS);
  const browser = await getSetting<BrowserSettings>('browser', DEFAULT_BROWSER);
  const { data: due, error } = await db
    .from('social_queue')
    .select('*, target:social_targets!inner(channel)')
    .eq('status', 'scheduled')
    .in('target.channel', SERVER_CHANNELS)
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(MAX_PER_RUN);
  if (error) throw new Error(error.message);

  for (const raw of (due ?? []) as (QueueItem & { target: unknown })[]) {
    const { target: _joined, ...item } = raw;
    // Atomic claim — two overlapping runs can never publish the same row.
    const { data: claimed } = await db
      .from('social_queue')
      .update({ status: 'publishing', claimed_at: new Date().toISOString(), attempts: item.attempts + 1, step: 'publishing', step_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('status', 'scheduled')
      .select('id');
    if (!claimed || !claimed.length) continue;
    report.processed += 1;

    try {
      const outcome = await processItem({ ...item, attempts: item.attempts + 1 }, limits, browser);
      report[outcome] += 1;
    } catch (err) {
      report.failed += 1;
      const message = friendlyMessage(err, 'שגיאה לא ידועה');
      await db.from('social_queue').update({ status: 'failed', step: 'failed', error: message }).eq('id', item.id);
      await logActivity('error', 'publish_failed', message, { queueId: item.id });
    }

    // If Meta asked for a cooldown mid-run, stop here; the rest stays scheduled.
    const latest = await getSetting<ControlSettings>('control', { paused: false, rateLimitedUntil: null });
    if (latest.paused || (latest.rateLimitedUntil && new Date(latest.rateLimitedUntil) > new Date())) break;
  }

  if (report.processed) {
    await logActivity('info', 'worker_run', `ריצה (${trigger === 'cron' ? 'מתוזמנת' : 'ידנית'}): ${report.published} פורסמו, ${report.manual} ידניים, ${report.skipped} דולגו, ${report.failed} נכשלו`, { ...report });
  }
  return report;
}

type Outcome = 'published' | 'manual' | 'skipped' | 'failed' | 'deferred';

async function processItem(item: QueueItem, limits: LimitsSettings, browser: BrowserSettings): Promise<Outcome> {
  const db = serviceDb();
  const now = new Date();

  const [{ data: target }, { data: post }, { data: variant }] = await Promise.all([
    db.from('social_targets').select('*').eq('id', item.target_id).maybeSingle(),
    db.from('social_posts').select('*').eq('id', item.post_id).maybeSingle(),
    item.variant_id
      ? db.from('social_variants').select('*').eq('id', item.variant_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const t = (target as SocialTarget | null) ?? null;
  const p = (post as Post | null) ?? null;
  const v = (variant as Variant | null) ?? null;

  const skip = async (reason: string) => {
    await db.from('social_queue').update({ status: 'skipped', step: '', skip_reason: reason }).eq('id', item.id);
    await logActivity('warn', 'skipped', reason, { queueId: item.id, target: t?.name });
    return 'skipped' as const;
  };

  const decision = await evaluateQueueItem(db, { item, target: t, post: p, variant: v, limits, browser, now });
  if (decision.action === 'skip') return skip(decision.reason);
  if (decision.action === 'defer') {
    await db.from('social_queue').update({ status: 'scheduled', step: 'pending', scheduled_at: decision.until }).eq('id', item.id);
    await logActivity('info', 'deferred', `${decision.reason} (עד ${decision.until})`, { queueId: item.id });
    return 'deferred';
  }
  if (decision.action === 'wait') {
    await db.from('social_queue').update({ status: 'scheduled', step: 'pending' }).eq('id', item.id);
    return 'deferred';
  }
  // From here on target/post are non-null (the rules skip otherwise).
  const tt = t as SocialTarget;
  const pp = p as Post;
  const text = item.rendered_text || renderPostText(pp, v);

  const adapter = adapterFor(tt.channel);
  if (adapter.apiPublishing && !tt.can_api_publish) {
    return skip(`ליעד "${tt.name}" אין הרשאת פרסום דרך API (${tt.permission_status}). סנכרנו יעדים או התחברו מחדש.`);
  }

  try {
    const result = await adapter.publish({
      target: tt,
      text,
      link: pp.link_url,
      cta: pp.cta_type,
      media: pp.media as MediaItem[],
      whatsappUrl: pp.whatsapp_url,
      phone: pp.phone,
    });

    if (result.mode === 'manual') {
      await db.from('social_queue').update({ status: 'manual_pending', step: '', rendered_text: text, error: null }).eq('id', item.id);
      await logActivity('info', 'manual_pending', `"${tt.name}": ${result.instructions}`, { queueId: item.id });
      return 'manual';
    }

    await db
      .from('social_queue')
      .update({
        status: 'published',
        step: 'published',
        published_at: new Date().toISOString(),
        external_post_id: result.externalPostId,
        permalink: result.permalink,
        rendered_text: text,
        error: result.notes ?? null,
      })
      .eq('id', item.id);
    await db.from('social_targets').update({ last_published_at: new Date().toISOString(), last_status: 'published', last_error: '' }).eq('id', tt.id);
    await logActivity('info', 'published', `פורסם ל-"${tt.name}"${v ? ` (גרסה ${v.label})` : ''}`, {
      queueId: item.id,
      permalink: result.permalink,
    });
    return 'published';
  } catch (err) {
    if (err instanceof GraphError) {
      if (err.kind === 'duplicate') return skip(err.message);
      if (err.kind === 'rate_limit' || err.kind === 'blocked') {
        // Cooldown already recorded by the graph client; put the row back.
        const retryAt = new Date(now.getTime() + (err.retryAfterMinutes ?? 60) * 60_000).toISOString();
        await db.from('social_queue').update({ status: 'scheduled', step: 'pending', scheduled_at: retryAt, error: err.message }).eq('id', item.id);
        return 'deferred';
      }
      if (err.kind === 'auth' || err.kind === 'permission') {
        await db
          .from('social_targets')
          .update({ permission_status: err.kind === 'auth' ? 'revoked' : 'missing_permissions', can_api_publish: false })
          .eq('id', tt.id);
      }
      if (err.kind === 'unknown' && item.attempts < MAX_ATTEMPTS) {
        const retryAt = new Date(now.getTime() + 10 * 60_000 * item.attempts).toISOString();
        await db.from('social_queue').update({ status: 'scheduled', step: 'pending', scheduled_at: retryAt, error: err.message }).eq('id', item.id);
        await logActivity('warn', 'retry', `ניסיון ${item.attempts} נכשל, ינסה שוב ב-${retryAt}: ${err.message}`, { queueId: item.id });
        return 'deferred';
      }
    }
    await db.from('social_targets').update({ last_status: 'failed', last_error: friendlyMessage(err, 'failed') }).eq('id', tt.id);
    throw err;
  }
}
