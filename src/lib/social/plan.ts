import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dedupeKey, renderPostText } from './compose';
import { dripSlots, slotsFor } from './slots';
import type { MediaItem, Post, Schedule, Variant } from './types';
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

  const { data: schedules, error } = await db.from('social_schedules').select('*').eq('active', true);
  if (error) throw new Error(error.message);
  let created = 0;

  for (const schedule of (schedules ?? []) as Schedule[]) {
    if (schedule.mode === 'drip') {
      created += await planDrip(db, schedule, now, note);
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

    for (const [targetIndex, targetId] of schedule.target_ids.entries()) {
      const { count } = await db
        .from('social_queue')
        .select('id', { count: 'exact', head: true })
        .eq('schedule_id', schedule.id)
        .eq('target_id', targetId);
      let rotation = count ?? 0;

      for (const slot of slots) {
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
          created += 1;
          rotation += 1;
        }
      }
    }

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
    .in('status', ['scheduled', 'publishing', 'published', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused']);
  return new Set((data ?? []).map((r) => slotKey(r.target_id as string, r.scheduled_at as string)));
}

const slotKey = (targetId: string, at: string | Date) => `${targetId}|${new Date(at).toISOString()}`;

/**
 * Drip: every target gets its own slot — N per day inside the daily window,
 * in the order the targets were selected — so 40 groups become a calm
 * multi-day campaign instead of a burst. Planned once, then the schedule
 * retires (the queue rows carry the plan).
 */
async function planDrip(db: SupabaseClient, schedule: Schedule, now: Date, note: PlanLogger): Promise<number> {
  if (schedule.planned_until) {
    await db.from('social_schedules').update({ active: false }).eq('id', schedule.id);
    return 0;
  }
  const { data: post } = await db.from('social_posts').select('*').eq('id', schedule.post_id).maybeSingle();
  if (!post || post.status === 'archived') return 0;
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
  let created = 0;
  let last = now;

  for (const [targetIndex, targetId] of schedule.target_ids.entries()) {
    const at = slots[targetIndex];
    if (!at) continue;
    if (at > last) last = at;
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
      created += 1;
    }
  }
  await db.from('social_schedules').update({ planned_until: last.toISOString(), active: false }).eq('id', schedule.id);
  if (created) await note('info', 'drip_planned', `הפצה הדרגתית: ${created} פרסומים תוכננו עד ${last.toISOString()}`, { created });
  return created;
}
