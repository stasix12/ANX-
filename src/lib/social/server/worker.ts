import 'server-only';
import { adapterFor } from '../channels/registry';
import { renderPostText } from '../compose';
import { evaluateQueueItem } from '../rules';
import { stampText } from '../time';
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
  WORKER_OFFLINE_AFTER_SECONDS,
} from '../types';
import { getSetting, serviceDb, setSetting } from './db';
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
/*
 * The server publishes exactly one channel now.
 *
 * It used to own Facebook Pages through the Graph API as well. Pages are gone
 * from this product — never used, zero connected — so what the server has left
 * is the manual hand-off: a group the browser worker could not finish, parked
 * for a person to post by hand.
 */
const SERVER_CHANNELS = ['facebook_group_manual'];

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

  /*
   * Planning first, and whatever the controls say. Materialising a schedule
   * into queue rows publishes nothing — it only writes down what is going to
   * go out — so a paused or rate-limited queue should still fill up. Doing it
   * the other way round meant that launching a campaign while publishing was
   * paused left the dashboard on "מתוזמנים 0 / אין סבב פעיל": the schedule
   * existed, but nothing had turned it into anything the owner could see, and
   * pressing "המשך" had nothing to resume.
   */
  report.planned = await planQueue();

  /*
   * Recovering a wedged row is bookkeeping, not publishing, so it runs here —
   * before the pause and rate-limit checks, for the same reason planning does.
   * It used to sit below them, which meant that while publishing was paused
   * (the state an owner puts the system into precisely BECAUSE something looks
   * wrong) nothing was ever recovered.
   */
  await sweepStuck(db);

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

/**
 * Rows nobody is coming back for.
 *
 * Two separate cases, and they are recovered differently:
 *
 *   • worker_id null — this (server) worker crashed mid-publish. Failed, so it
 *     can be retried by hand. Unchanged behaviour.
 *
 *   • worker_id set, and that worker has not heartbeat in a long time — a PC
 *     worker that was renamed, moved to another machine, or simply never came
 *     back. Nothing used to touch these AT ALL: the local worker's own recovery
 *     sweep filters on `worker_id = its own id` (worker/social-worker.ts) and
 *     the id comes from an upsert on the machine's hostname, so renaming the PC
 *     or setting SOCIAL_WORKER_NAME orphaned every row the old id was holding.
 *     They stayed 'publishing' or 'awaiting_confirmation' for ever: counted in
 *     the dashboard's in-flight tile, enough to keep resolveState() returning
 *     'running', so a run card pulsed "רץ" on a campaign where nothing had
 *     happened for days.
 *
 * The orphans become needs_attention rather than failed or scheduled, which is
 * the only safe direction: the browser may well have clicked Post before the
 * machine went away, so a person looks in the group and decides. Nothing
 * re-claims them in the meantime — both claims filter on status = 'scheduled'.
 *
 * ORPHAN_MINUTES is deliberately far longer than STUCK_MINUTES: a group
 * publication can legitimately hold a page for a 15-minute video upload, and
 * the confirmation gate waits 15 minutes for a person.
 */
const ORPHAN_MINUTES = 45;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function sweepStuck(db: any): Promise<void> {
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  await db
    .from('social_queue')
    .update({ status: 'failed', error: 'הריצה נקטעה באמצע הפרסום — אפשר לנסות שוב.' })
    .eq('status', 'publishing')
    .is('worker_id', null)
    .lt('claimed_at', stuckBefore);

  try {
    const { data: workers } = await db.from('social_workers').select('id, last_seen_at');
    const cutoff = Date.now() - WORKER_OFFLINE_AFTER_SECONDS * 1000;
    const gone = ((workers ?? []) as { id: string; last_seen_at: string | null }[])
      .filter((w) => !w.last_seen_at || new Date(w.last_seen_at).getTime() < cutoff)
      .map((w) => w.id);
    if (!gone.length) return;
    const orphanBefore = new Date(Date.now() - ORPHAN_MINUTES * 60_000).toISOString();
    const { data: freed } = await db
      .from('social_queue')
      .update({
        status: 'needs_attention',
        step: 'needs_attention',
        error: 'המחשב שמפרסם לקבוצות הפסיק לדווח באמצע העבודה. בדקו בקבוצה אם הפוסט עלה, ואז "נסה שוב" או "דלג".',
      })
      .in('worker_id', gone)
      .in('status', ['publishing', 'awaiting_confirmation'])
      .lt('claimed_at', orphanBefore)
      .select('id');
    if (freed?.length) {
      await logActivity('warn', 'stuck_rows_released', `${freed.length} פרסומים נתקעו אצל worker שאינו מדווח והועברו ל"דורשים אתכם"`, {
        released: freed.length,
      });
    }
  } catch {
    // social_workers is a v2 table; an install that has not run
    // supabase/social-schema-v2.sql simply has no browser workers to sweep.
  }
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
    /* decision.reason is already a whole Hebrew sentence ("הסבב מושהה.",
       "המרווח המינימלי בין פרסומים."). The ISO instant that used to be
       bracketed onto the end of it is not a sentence, and this line is read in
       the notification bell; it belongs in meta. */
    await logActivity('info', 'deferred', decision.reason, { queueId: item.id, until: decision.until });
    return 'deferred';
  }
  if (decision.action === 'wait') {
    // Parked, not attempted: the instant moves forward so the row is not
    // immediately due again, and the attempt the claim just counted is given
    // back. Nothing was tried, so nothing should be spent.
    await db
      .from('social_queue')
      .update({ status: 'scheduled', step: 'pending', scheduled_at: decision.until, attempts: Math.max(0, item.attempts - 1) })
      .eq('id', item.id);
    return 'deferred';
  }
  // From here on target/post are non-null (the rules skip otherwise).
  const tt = t as SocialTarget;
  const pp = p as Post;
  const text = item.rendered_text || renderPostText(pp, v);

  /* The API-permission gate lived here. Every adapter left is
     `apiPublishing: false`, so it could never fire again — and its message
     told the owner to reconnect a Facebook account this product no longer
     has. A check that cannot run, advising a screen that does not exist. */
  const adapter = adapterFor(tt.channel);

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
    /*
     * The GraphError taxonomy lived here — duplicate, rate_limit, blocked,
     * auth, permission, and a retry on `unknown`. Every one of those was a
     * code Meta returns from the Graph API, which only Pages ever called. The
     * manual channel never threw a GraphError, so it never took any of those
     * branches: removing them changes nothing about what this function does
     * with the one channel it still has.
     */
    await db.from('social_targets').update({ last_status: 'failed', last_error: friendlyMessage(err, 'failed') }).eq('id', tt.id);
    throw err;
  }
}
