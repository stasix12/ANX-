import 'server-only';
import { adapterFor } from '../channels/registry';
import { renderPostText } from '../compose';
import { startOfZonedDay } from '../time';
import {
  DEFAULT_LIMITS,
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

/**
 * The publishing worker. Called by /api/social/cron (scheduled) and
 * /api/social/run (the admin pressing "publish now"). One run:
 *
 *   1. bails out if the owner paused everything or Meta asked us to cool down;
 *   2. materialises upcoming schedules into queue rows;
 *   3. claims due rows one at a time (atomic status flip) and, for each,
 *      applies the anti-spam rules, then hands it to the channel adapter;
 *   4. records the outcome and writes the activity log.
 *
 * MAX_PER_RUN keeps a single invocation short (serverless time limits) and
 * naturally spreads bursts across cron ticks.
 */
const MAX_PER_RUN = 5;
const MAX_ATTEMPTS = 4;
const STUCK_MINUTES = 15;
const MAX_DEFERRALS = 12;

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

export async function runWorker(trigger: 'cron' | 'manual'): Promise<WorkerReport> {
  const db = serviceDb();
  const report: WorkerReport = { ran: false, planned: 0, processed: 0, published: 0, manual: 0, skipped: 0, failed: 0, deferred: 0 };

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

  // Rows stuck in "publishing" (a crashed run) are failed so they can be retried by hand.
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  await db
    .from('social_queue')
    .update({ status: 'failed', error: 'הריצה נקטעה באמצע הפרסום — אפשר לנסות שוב.' })
    .eq('status', 'publishing')
    .lt('claimed_at', stuckBefore);

  const limits = await getSetting<LimitsSettings>('limits', DEFAULT_LIMITS);
  const { data: due, error } = await db
    .from('social_queue')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(MAX_PER_RUN);
  if (error) throw new Error(error.message);

  for (const item of (due ?? []) as QueueItem[]) {
    // Atomic claim — two overlapping runs can never publish the same row.
    const { data: claimed } = await db
      .from('social_queue')
      .update({ status: 'publishing', claimed_at: new Date().toISOString(), attempts: item.attempts + 1 })
      .eq('id', item.id)
      .eq('status', 'scheduled')
      .select('id');
    if (!claimed || !claimed.length) continue;
    report.processed += 1;

    try {
      const outcome = await processItem(item, limits);
      report[outcome] += 1;
    } catch (err) {
      report.failed += 1;
      const message = err instanceof Error ? err.message : 'שגיאה לא ידועה';
      await db.from('social_queue').update({ status: 'failed', error: message }).eq('id', item.id);
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

async function processItem(item: QueueItem, limits: LimitsSettings): Promise<Outcome> {
  const db = serviceDb();
  const now = new Date();

  const [{ data: target }, { data: post }, { data: variant }] = await Promise.all([
    db.from('social_targets').select('*').eq('id', item.target_id).maybeSingle(),
    db.from('social_posts').select('*').eq('id', item.post_id).maybeSingle(),
    item.variant_id
      ? db.from('social_variants').select('*').eq('id', item.variant_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const skip = async (reason: string) => {
    await db.from('social_queue').update({ status: 'skipped', skip_reason: reason }).eq('id', item.id);
    await logActivity('warn', 'skipped', reason, { queueId: item.id, target: (target as SocialTarget | null)?.name });
    return 'skipped' as const;
  };

  if (!target) return skip('היעד נמחק.');
  if (!post || post.status === 'archived') return skip('הפוסט נמחק או הועבר לארכיון.');
  const t = target as SocialTarget;
  const p = post as Post;
  const v = (variant as Variant | null) ?? null;

  if (!t.enabled) return skip(`היעד "${t.name}" כבוי.`);
  if (v && v.approval !== 'approved') return skip(`הגרסה ${v.label} לא אושרה.`);
  if (!v && !p.base_text.trim() && !(p.media as MediaItem[]).length) return skip('הפוסט ריק.');

  // --- Anti-spam ---------------------------------------------------------
  const dayStart = startOfZonedDay(now).toISOString();
  const { count: todayAll } = await db
    .from('social_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('published_at', dayStart);
  if ((todayAll ?? 0) >= limits.maxPerDay) return skip(`הגעת למכסה היומית (${limits.maxPerDay} פרסומים).`);

  const { count: todayTarget } = await db
    .from('social_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('target_id', t.id)
    .gte('published_at', dayStart);
  if ((todayTarget ?? 0) >= limits.maxPerTargetPerDay)
    return skip(`הגעת למכסה היומית ליעד "${t.name}" (${limits.maxPerTargetPerDay}).`);

  const { data: last } = await db
    .from('social_queue')
    .select('published_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.published_at) {
    const gapMs = limits.minGapMinutes * 60_000;
    const sinceLast = now.getTime() - new Date(last.published_at).getTime();
    if (sinceLast < gapMs) {
      if (item.attempts > MAX_DEFERRALS) return skip('נדחה יותר מדי פעמים בגלל מרווח הזמן בין פרסומים.');
      const nextAt = new Date(new Date(last.published_at).getTime() + gapMs + 30_000).toISOString();
      await db.from('social_queue').update({ status: 'scheduled', scheduled_at: nextAt }).eq('id', item.id);
      await logActivity('info', 'deferred', `נדחה ל-${nextAt} כדי לשמור מרווח של ${limits.minGapMinutes} דק׳`, { queueId: item.id });
      return 'deferred';
    }
  }

  const text = item.rendered_text || renderPostText(p, v);
  const dedupeSince = new Date(now.getTime() - limits.dedupeDays * 86_400_000).toISOString();
  if (item.dedupe_hash) {
    const { count: dupes } = await db
      .from('social_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('dedupe_hash', item.dedupe_hash)
      .gte('published_at', dedupeSince);
    if ((dupes ?? 0) > 0) return skip(`אותו תוכן כבר פורסם ליעד הזה ב-${limits.dedupeDays} הימים האחרונים.`);
  }

  // --- Publish through the channel adapter --------------------------------
  const adapter = adapterFor(t.channel);
  if (adapter.apiPublishing && !t.can_api_publish) {
    return skip(`ליעד "${t.name}" אין הרשאת פרסום דרך API (${t.permission_status}). סנכרנו יעדים או התחברו מחדש.`);
  }

  try {
    const result = await adapter.publish({
      target: t,
      text,
      link: p.link_url,
      cta: p.cta_type,
      media: p.media as MediaItem[],
      whatsappUrl: p.whatsapp_url,
      phone: p.phone,
    });

    if (result.mode === 'manual') {
      await db.from('social_queue').update({ status: 'manual_pending', rendered_text: text, error: null }).eq('id', item.id);
      await logActivity('info', 'manual_pending', `"${t.name}": ${result.instructions}`, { queueId: item.id });
      return 'manual';
    }

    await db
      .from('social_queue')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        external_post_id: result.externalPostId,
        permalink: result.permalink,
        rendered_text: text,
        error: result.notes ?? null,
      })
      .eq('id', item.id);
    await logActivity('info', 'published', `פורסם ל-"${t.name}"${v ? ` (גרסה ${v.label})` : ''}`, {
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
        await db.from('social_queue').update({ status: 'scheduled', scheduled_at: retryAt, error: err.message }).eq('id', item.id);
        return 'deferred';
      }
      if (err.kind === 'auth' || err.kind === 'permission') {
        await db
          .from('social_targets')
          .update({ permission_status: err.kind === 'auth' ? 'revoked' : 'missing_permissions', can_api_publish: false })
          .eq('id', t.id);
      }
      if (err.kind === 'unknown' && item.attempts < MAX_ATTEMPTS) {
        const retryAt = new Date(now.getTime() + 10 * 60_000 * item.attempts).toISOString();
        await db.from('social_queue').update({ status: 'scheduled', scheduled_at: retryAt, error: err.message }).eq('id', item.id);
        await logActivity('warn', 'retry', `ניסיון ${item.attempts} נכשל, ינסה שוב ב-${retryAt}: ${err.message}`, { queueId: item.id });
        return 'deferred';
      }
    }
    throw err;
  }
}
