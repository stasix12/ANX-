import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dedupeKey, renderPostText } from './compose';
import { dripSlots, slotsFor, staggerAt } from './slots';
import { CANCELLABLE_STATUSES, OPEN_STATUSES } from './status';
import { DEFAULT_BROWSER, DEFAULT_LIMITS, type MediaItem, type Post, type Schedule, type Variant } from './types';
import { pickVariant } from './variants';

/**
 * Materialises schedules into concrete queue rows a little ahead of time
 * (HORIZON_HOURS). Idempotent: the unique (schedule, target, scheduled_at)
 * index means re-running the planner never double-books a slot.
 *
 * Planning is pure queue bookkeeping — no network call to Meta, no
 * publishing — so it runs against whatever authenticated client it is handed,
 * exactly like rules.ts:
 *
 *   • the server worker passes the service-role client (cron, "publish now");
 *   • the local browser worker passes its admin login.
 *
 * That second caller is what makes a schedule reach the queue at all on this
 * deployment: GitHub only registers a `schedule:` workflow that sits on the
 * repository's default branch, so .github/workflows/social-cron.yml never
 * ticks. Before this, a weekly/one-off campaign was written to
 * social_schedules and then waited forever for a planner run that only ever
 * happened when someone pressed a button — the dashboard showed
 * "מתוזמנים 0" and no active campaign. The PC worker has to be running for
 * groups to publish anyway, so it is the one process that is reliably there.
 *
 * Variant assignment is delegated to ./variants.ts (rotate / distribute /
 * fixed per-target map) so the UI can show the same choice in advance.
 */
const HORIZON_HOURS = 48;

export type PlanLogger = (
  level: 'info' | 'warn' | 'error',
  event: string,
  message: string,
  meta?: Record<string, unknown>,
) => Promise<void>;

export interface PlanOptions {
  db: SupabaseClient;
  now?: Date;
  log?: PlanLogger;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function planQueue({ db, now = new Date(), log }: PlanOptions): Promise<number> {
  const note: PlanLogger = log ?? (async () => undefined);
  const until = new Date(now.getTime() + HORIZON_HOURS * 3_600_000);
  // Slots up to 15 minutes in the past still count — a cron that ran late
  // should not silently drop the morning post.
  const from = new Date(now.getTime() - 15 * 60_000);

  const stopped = await stoppedCampaigns(db, note);
  /*
   * The interval rules.ts will enforce, read once. Rows are written this far
   * apart so nothing is deferred — see staggerAt() in ./slots. Missing settings
   * fall back to the same defaults the workers use, never to zero, because zero
   * is what stacks a whole campaign on one instant.
   */
  const spacingMinutes = await enforcedSpacing(db);

  const { data: schedules, error } = await db.from('social_schedules').select('*').eq('active', true);
  if (error) throw new Error(error.message);
  let created = 0;

  for (const schedule of (schedules ?? []) as Schedule[]) {
    if (schedule.mode === 'drip') {
      created += await planDrip(db, schedule, now, note, stopped);
      continue;
    }
    const slots = slotsFor(schedule, from, until);
    if (!slots.length) {
      // One-off schedules retire themselves once their instant has passed.
      if ((schedule.mode === 'once' || schedule.mode === 'now') && schedule.run_at && new Date(schedule.run_at) < from) {
        await db.from('social_schedules').update({ active: false }).eq('id', schedule.id);
      }
      continue;
    }

    const { data: post } = await db.from('social_posts').select('*').eq('id', schedule.post_id).maybeSingle();
    if (!post || post.status === 'archived') continue;
    if (post.campaign_id && stopped.has(post.campaign_id)) {
      await db.from('social_schedules').update({ active: false }).eq('id', schedule.id);
      continue;
    }
    const { data: variants } = await db
      .from('social_variants')
      .select('*')
      .eq('post_id', schedule.post_id)
      .eq('approval', 'approved')
      .order('sort')
      .order('created_at');
    const approved = (variants ?? []) as Variant[];
    const media = (post.media ?? []) as MediaItem[];
    const taken = await occupiedSlots(db, post.id);
    const waiting = await plannedTargets(db, post.id);

    const dropped: string[] = [];
    for (const [targetIndex, targetId] of schedule.target_ids.entries()) {
      // This post is already waiting for this group — see plannedTargets().
      if (waiting.has(targetId)) {
        dropped.push(targetId);
        continue;
      }
      const { count } = await db
        .from('social_queue')
        .select('id', { count: 'exact', head: true })
        .eq('schedule_id', schedule.id)
        .eq('target_id', targetId);
      let rotation = count ?? 0;

      for (const rawSlot of slots) {
        // Each target gets its own instant inside the occasion, so a weekly
        // campaign publishes instead of deferring itself into skips.
        const slot = staggerAt(rawSlot, targetIndex, spacingMinutes);
        // Already planned for this post by some other schedule.
        if (taken.has(slotKey(targetId, slot))) continue;
        const variant = pickVariant(approved, schedule, targetId, targetIndex, rotation);
        const text = renderPostText(post as Post, variant);
        const hash = sha256(dedupeKey(targetId, text, media.map((m) => m.url)));
        const { error: insErr, data } = await db
          .from('social_queue')
          .upsert(
            {
              schedule_id: schedule.id,
              post_id: post.id,
              campaign_id: post.campaign_id ?? null,
              variant_id: variant?.id ?? null,
              target_id: targetId,
              scheduled_at: slot.toISOString(),
              status: 'scheduled',
              step: 'pending',
              require_confirmation: Boolean(schedule.require_confirmation),
              dedupe_hash: hash,
              rendered_text: text,
            },
            { onConflict: 'schedule_id,target_id,scheduled_at', ignoreDuplicates: true },
          )
          .select('id');
        if (insErr) {
          await note('error', 'plan_failed', insErr.message, { schedule: schedule.id });
          continue;
        }
        if (data && data.length) {
          taken.add(slotKey(targetId, slot));
          waiting.add(targetId);
          created += 1;
          rotation += 1;
        }
      }
    }

    await noteDropped(db, note, schedule.id, dropped);
    await db.from('social_schedules').update({ planned_until: until.toISOString() }).eq('id', schedule.id);
    if (schedule.mode === 'now' || schedule.mode === 'once') {
      await db.from('social_schedules').update({ active: false }).eq('id', schedule.id);
    }
  }

  if (created) await note('info', 'planned', `נוצרו ${created} פרסומים בתור`, { created });
  return created;
}

/**
 * Instants this post already occupies, whichever schedule put them there.
 *
 * The queue's unique key is (schedule_id, target_id, scheduled_at), so it can
 * only see inside one schedule. Two schedules for the same post — which is
 * what a repeated launch produces — plan the same targets at the same instants
 * and each insert is unique by that key, so every group lands in the queue
 * twice. Publishing is still safe (rules.ts refuses a post already sent to a
 * target), but the owner sees a queue of doubles and cannot tell that half of
 * it will be skipped.
 *
 * Terminal rows are deliberately excluded: something already skipped or failed
 * should be allowed to be planned again.
 */
async function occupiedSlots(db: SupabaseClient, postId: string): Promise<Set<string>> {
  const { data } = await db
    .from('social_queue')
    .select('target_id, scheduled_at')
    .eq('post_id', postId)
    .in('status', ['published', ...OPEN_STATUSES]);
  return new Set((data ?? []).map((r) => slotKey(r.target_id as string, r.scheduled_at as string)));
}

const slotKey = (targetId: string, at: string | Date) => `${targetId}|${new Date(at).toISOString()}`;

/** limits.minGapMinutes + browser.groupMinGapMinutes — what rules.ts demands. */
async function enforcedSpacing(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('social_settings').select('key, value').in('key', ['limits', 'browser']);
  const byKey = new Map((data ?? []).map((r) => [r.key as string, (r.value ?? {}) as Record<string, unknown>]));
  const limits = { ...DEFAULT_LIMITS, ...(byKey.get('limits') ?? {}) };
  const browser = { ...DEFAULT_BROWSER, ...(byKey.get('browser') ?? {}) };
  return Math.max(0, Number(limits.minGapMinutes) || 0) + Math.max(0, Number(browser.groupMinGapMinutes) || 0);
}

/**
 * Groups that already have a publication of this post WAITING, whatever instant
 * it sits on.
 *
 * occupiedSlots() above compares instants, which is right for a planner running
 * against untouched rows — but the queue is no longer untouched. The dashboard's
 * queue tuner re-spaces the waiting rows (client.ts respaceQueue) and appends
 * hand-added groups, and both move a row OFF the instant its schedule would plan
 * it on. The next tick, 60 seconds later, finds that instant free and plans the
 * whole campaign a second time: the owner sets the gap, watches the queue double,
 * and every duplicate is later skipped with a reason that explains nothing.
 *
 * Matching on the target instead closes that hole, and costs nothing that was
 * worth keeping: rules.ts already refuses a post that has gone to a target once
 * ("הפוסט הזה כבר פורסם ל-…"), so a second row for the same post and group was
 * never going to publish — it only ever made the queue longer than the truth.
 *
 * Same status list as occupiedSlots() and for the same reason: a row that was
 * cancelled or failed is finished, and may be planned again.
 */
async function plannedTargets(db: SupabaseClient, postId: string): Promise<Set<string>> {
  const { data } = await db
    .from('social_queue')
    .select('target_id')
    .eq('post_id', postId)
    .in('status', OPEN_STATUSES);
  return new Set((data ?? []).map((r) => r.target_id as string));
}

/**
 * Says out loud which groups a launch quietly left out.
 *
 * plannedTargets() is right to skip a group this post is already waiting for —
 * a second row could never publish (rules.ts refuses a post that has gone to a
 * target once) and would only make the queue longer than the truth. But the
 * skip was completely silent, and for a 'now' or 'once' schedule the schedule
 * then retires itself at the end of the pass. Relaunching a post to 28 groups
 * while group #7 still sits in needs_attention from the previous round produced
 * 27 rows, no row for #7 ever, and nothing anywhere naming #7.
 *
 * It goes in the activity log, which is where every other thing the two workers
 * decide on the owner's behalf is written, and it names the groups rather than
 * counting them — "27 of 28" is not something anybody can act on.
 */
const DROPPED_NAMES_SHOWN = 8;

async function noteDropped(db: SupabaseClient, note: PlanLogger, scheduleId: string, targetIds: string[]): Promise<void> {
  if (!targetIds.length) return;
  const { data } = await db.from('social_targets').select('name').in('id', targetIds.slice(0, DROPPED_NAMES_SHOWN));
  const names = ((data ?? []) as { name: string | null }[]).map((t) => t.name).filter(Boolean);
  const rest = targetIds.length - names.length;
  const list = names.length ? `: ${names.join(', ')}${rest > 0 ? ` ועוד ${rest}` : ''}` : '';
  await note(
    'warn',
    'plan_targets_skipped',
    `${targetIds.length} קבוצות לא נכנסו לתור בהפעלה הזו כי הפוסט כבר ממתין אליהן מסבב קודם${list}`,
    { scheduleId, skipped: targetIds.length, targetIds },
  );
}

/**
 * Campaigns the owner has stopped, and a sweep of anything they still hold.
 *
 * "Stop campaign" archives the campaign, deactivates its schedules and cancels
 * everything waiting — but a planner run that had already read the schedule
 * list writes its rows afterwards, and the stopped campaign comes back with a
 * queue and a countdown to a publication that rules.ts will only skip. So
 * planning both refuses to plan for a stopped campaign (retiring the schedule
 * instead) and clears whatever slipped through, which also heals a campaign
 * stopped before this existed.
 *
 * Only an archived campaign is swept: a paused one keeps its queue by design,
 * which is exactly what lets "המשך" resume it.
 */
async function stoppedCampaigns(db: SupabaseClient, note: PlanLogger): Promise<Set<string>> {
  const { data } = await db.from('social_campaigns').select('id').eq('status', 'archived');
  const ids = (data ?? []).map((c) => c.id as string);
  if (!ids.length) return new Set();

  const { data: stale } = await db
    .from('social_queue')
    .update({ status: 'skipped', step: '', skip_reason: 'הסבב נעצר' })
    .in('campaign_id', ids)
    // The same list stopCampaign() uses. It used to omit manual_pending and
    // needs_attention, so a stopped run went on handing the owner work while
    // its own card read "נעצר" — a stop that did not stop everything.
    .in('status', CANCELLABLE_STATUSES)
    .select('id');
  if (stale?.length) {
    await note('warn', 'stopped_campaign_swept', `${stale.length} פרסומים של סבב שנעצר בוטלו`, { cancelled: stale.length });
  }
  return new Set(ids);
}

/**
 * Drip: every target gets its own slot — N per day inside the daily window,
 * in the order the targets were selected — so 40 groups become a calm
 * multi-day campaign instead of a burst. Planned once, then the schedule
 * retires (the queue rows carry the plan).
 */
async function planDrip(db: SupabaseClient, schedule: Schedule, now: Date, note: PlanLogger, stopped: Set<string>): Promise<number> {
  if (schedule.planned_until) {
    await db.from('social_schedules').update({ active: false }).eq('id', schedule.id);
    return 0;
  }
  const { data: post } = await db.from('social_posts').select('*').eq('id', schedule.post_id).maybeSingle();
  if (!post || post.status === 'archived') return 0;
  if (post.campaign_id && stopped.has(post.campaign_id)) {
    await db.from('social_schedules').update({ active: false }).eq('id', schedule.id);
    return 0;
  }
  const { data: variants } = await db
    .from('social_variants')
    .select('*')
    .eq('post_id', schedule.post_id)
    .eq('approval', 'approved')
    .order('sort')
    .order('created_at');
  const approved = (variants ?? []) as Variant[];
  const media = (post.media ?? []) as MediaItem[];
  const slots = dripSlots(schedule, now);
  const taken = await occupiedSlots(db, post.id);
  const waiting = await plannedTargets(db, post.id);
  let created = 0;
  let last = now;

  const dropped: string[] = [];
  for (const [targetIndex, targetId] of schedule.target_ids.entries()) {
    const at = slots[targetIndex];
    if (!at) continue;
    if (at > last) last = at;
    // This post is already waiting for this group — see plannedTargets().
    if (waiting.has(targetId)) {
      dropped.push(targetId);
      continue;
    }
    // Already planned for this post by some other schedule.
    if (taken.has(slotKey(targetId, at))) continue;
    const variant = pickVariant(approved, schedule, targetId, targetIndex, 0);
    const text = renderPostText(post as Post, variant);
    const hash = sha256(dedupeKey(targetId, text, media.map((m) => m.url)));
    const { error, data } = await db
      .from('social_queue')
      .upsert(
        {
          schedule_id: schedule.id,
          post_id: post.id,
          campaign_id: post.campaign_id ?? null,
          variant_id: variant?.id ?? null,
          target_id: targetId,
          scheduled_at: at.toISOString(),
          status: 'scheduled',
          step: 'pending',
          require_confirmation: Boolean(schedule.require_confirmation),
          dedupe_hash: hash,
          rendered_text: text,
        },
        { onConflict: 'schedule_id,target_id,scheduled_at', ignoreDuplicates: true },
      )
      .select('id');
    if (error) {
      await note('error', 'plan_failed', error.message, { schedule: schedule.id });
      continue;
    }
    if (data?.length) {
      taken.add(slotKey(targetId, at));
      waiting.add(targetId);
      created += 1;
    }
  }
  await noteDropped(db, note, schedule.id, dropped);
  await db.from('social_schedules').update({ planned_until: last.toISOString(), active: false }).eq('id', schedule.id);
  if (created) await note('info', 'drip_planned', `הפצה הדרגתית: ${created} פרסומים תוכננו עד ${last.toISOString()}`, { created });
  return created;
}
