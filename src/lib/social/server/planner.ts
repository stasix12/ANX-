import 'server-only';
import { slotsFor } from '../slots';
import type { MediaItem, Post, Schedule, Variant } from '../types';
import { dedupeKey, renderPostText } from '../compose';
import { serviceDb } from './db';
import { logActivity } from './log';
import { sha256 } from './crypto';

/**
 * Materialises schedules into concrete queue rows a little ahead of time
 * (HORIZON_HOURS). Idempotent: the unique (schedule, target, scheduled_at)
 * index means re-running the planner never double-books a slot.
 *
 * Variant rotation: approved variants are cycled per target in creation
 * order, so a page never receives the same wording twice in a row.
 */
const HORIZON_HOURS = 48;

export async function planQueue(now = new Date()): Promise<number> {
  const db = serviceDb();
  const until = new Date(now.getTime() + HORIZON_HOURS * 3_600_000);
  // Slots up to 15 minutes in the past still count — a cron that ran late
  // should not silently drop the morning post.
  const from = new Date(now.getTime() - 15 * 60_000);

  const { data: schedules, error } = await db.from('social_schedules').select('*').eq('active', true);
  if (error) throw new Error(error.message);
  let created = 0;

  for (const schedule of (schedules ?? []) as Schedule[]) {
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

    for (const targetId of schedule.target_ids) {
      const { count } = await db
        .from('social_queue')
        .select('id', { count: 'exact', head: true })
        .eq('schedule_id', schedule.id)
        .eq('target_id', targetId);
      let rotation = count ?? 0;

      for (const slot of slots) {
        const variant = approved.length ? approved[rotation % approved.length] : null;
        const text = renderPostText(post as Post, variant);
        const hash = sha256(dedupeKey(targetId, text, media.map((m) => m.url)));
        const { error: insErr, data } = await db
          .from('social_queue')
          .upsert(
            {
              schedule_id: schedule.id,
              post_id: post.id,
              variant_id: variant?.id ?? null,
              target_id: targetId,
              scheduled_at: slot.toISOString(),
              status: 'scheduled',
              dedupe_hash: hash,
              rendered_text: text,
            },
            { onConflict: 'schedule_id,target_id,scheduled_at', ignoreDuplicates: true },
          )
          .select('id');
        if (insErr) {
          await logActivity('error', 'plan_failed', insErr.message, { schedule: schedule.id });
          continue;
        }
        if (data && data.length) {
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

  if (created) await logActivity('info', 'planned', `נוצרו ${created} פרסומים בתור`, { created });
  return created;
}
