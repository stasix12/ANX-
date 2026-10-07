import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dedupeKey, renderPostText } from './compose';
import { dripSlots, slotsFor, staggerAt } from './slots';
import { CANCELLABLE_STATUSES, OPEN_STATUSES } from './status';
import { DEFAULT_BROWSER, DEFAULT_LIMITS, type LimitsSettings, type MediaItem, type Post, type Schedule, type SocialTarget, type Variant } from './types';
import { pickVariant } from './variants';

/**
 * ROUNDS THAT WERE SWITCHED OFF BY A FAILURE, SWITCHED BACK ON.
 *
 * "למה הסבב לא יצא? תזמנתי לפרסום." His round was planned at 04:51 while the
 * PC could not reach the database; every insert returned `TypeError: fetch
 * failed`, nothing was queued, and the planner stamped the schedule as planned
 * and switched it off regardless. planQueue reads `active = true` only, so that
 * round was unreachable from then on: it would never publish and never be
 * tried again, and the only trace was one red line in the activity log.
 *
 * The counters above make sure it cannot happen again. This is for the rounds
 * it already happened to, and it is deliberately narrow — all four must hold:
 *
 *   · the schedule is off and carries a `planned_until`, so it was retired
 *     rather than merely paused by the owner;
 *   · a `plan_failed` was written for it in the last week, so a FAILURE is why
 *     — not "every group was already spoken for", which is a real plan with
 *     nothing in it and must stay retired;
 *   · it has no queue rows at all, so nothing it meant to do was done;
 *   · and its post is still there to publish.
 *
 * It cannot loop: the moment a retry writes one queue row the third condition
 * stops matching, and the one-week window ends it even if the row never comes.
 */
async function revivePlanFailures(db: SupabaseClient, note: PlanLogger): Promise<void> {
  const { data: dead } = await db
    .from('social_schedules')
    .select('id, post_id')
    .eq('active', false)
    .not('planned_until', 'is', null);
  if (!dead?.length) return;

  const week = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data: failures } = await db
    .from('social_activity_log')
    .select('meta')
    .eq('event', 'plan_failed')
    /* `at`, not `created_at`. social_activity_log is the one table in this
       schema whose timestamp is not called created_at (social-schema.sql:231,
       and its index is built on it), so this filter named a column that does
       not exist: PostgREST answered 42703, the destructure took only `data`,
       `failures` came back undefined, and the whole revive below returned
       before touching a schedule. The self-healing this function exists for
       has therefore never run once, silently — no log line, nothing on
       screen. */
    .gte('at', week);
  const blamed = new Set(
    (failures ?? [])
      .map((r) => (r as { meta?: { schedule?: unknown } }).meta?.schedule)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  if (!blamed.size) return;

  for (const row of dead as { id: string; post_id: string }[]) {
    if (!blamed.has(row.id)) continue;
    const { count } = await db
      .from('social_queue')
      .select('id', { count: 'exact', head: true })
      .eq('schedule_id', row.id);
    if (count) continue;
    const { data: post } = await db.from('social_posts').select('status').eq('id', row.post_id).maybeSingle();
    if (!post || (post as { status?: string }).status === 'archived') continue;

    await db.from('social_schedules').update({ active: true, planned_until: null }).eq('id', row.id);
    await note('warn', 'plan_revived', 'סבב שנכשל בגלל תקלת רשת הוחזר לתכנון — הפרסומים שלו ייכנסו לתור עכשיו.', {
      schedule: row.id,
    });
  }
}

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

  /* The rounds an earlier failure buried — brought back before this pass reads
     the list, so they are planned in the same run that finds them. */
  await revivePlanFailures(db, note);

  const { data: schedules, error } = await db.from('social_schedules').select('*').eq('active', true);
  if (error) throw new Error(error.message);
  let created = 0;
  /*
   * ROWS THAT BUILT A ROUND, as opposed to rows that TOPPED ONE UP.
   *
   * "מה זה הסבב פרסום שיצא עכשיו? לא הרצתי כלום." He had not. What he was
   * reading was this line — "נבנה סבב פרסום · נוצרו 1 פרסומים בתור" — written
   * once a minute, every minute, by a round that had been running since noon.
   *
   * A repeating schedule does not retire. Every pass it walks its groups, finds
   * all but one still holding an open publication (v20 allows one per group),
   * and writes a single row for the one that just finished. That is the daily
   * repeat working exactly as asked. It is not a round being built, and calling
   * it one tells the owner his account started publishing by itself.
   *
   * So the headline is kept for what it describes: a schedule planned to a
   * horizon it had not reached before. The steady trickle after it is the queue
   * refilling itself, it is visible on every queue screen in the product, and
   * it is not news. Errors still log — plan_failed and plan_retry are
   * untouched — so silence here never hides a planner that stopped working.
   */
  let built = 0;

  for (const schedule of (schedules ?? []) as Schedule[]) {
    if (schedule.mode === 'drip') {
      /* Drip retires itself, so every row it writes belongs to a round being
         built. Counted as before. */
      const dripped = await planDrip(db, schedule, now, note, stopped);
      created += dripped;
      built += dripped;
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
    const waiting = await targetsAlreadyWaiting(db);

    /*
     * HAS THIS SCHEDULE ALREADY BEEN PLANNED past the end of this window?
     *
     * `planned_until` is stamped at the end of every successful pass, so it is
     * null (or behind us) exactly once per occasion — on the pass that plans
     * it. Read BEFORE the pass writes its own stamp, which is the whole point.
     */
    const plannedAhead = Boolean(schedule.planned_until) && new Date(schedule.planned_until as string) > now;

    const dropped: string[] = [];
    /*
     * HOW MANY SLOTS COULD NOT BE WRITTEN AT ALL — and it is counted because
     * retiring the schedule depends on it.
     *
     * "למה הסבב לא יצא? תזמנתי לפרסום." His round was planned while the PC
     * briefly could not reach the database, every insert came back
     * `TypeError: fetch failed`, nothing was queued — and the schedule was
     * then stamped `planned_until` and switched off anyway. planQueue only looks
     * at `active = true`, so that round was dead for good: no publications, no
     * retry, and nothing on screen saying the round would never happen.
     *
     * A transport failure is not a plan. It is the one outcome that must leave
     * the schedule exactly as it found it.
     */
    let failed = 0;
    /* Rows this schedule wrote in THIS pass — the global `created` counts every
       schedule, and the question noteDropped asks is about this one. */
    let made = 0;
    for (const [targetIndex, targetId] of schedule.target_ids.entries()) {
      // Something is already waiting for this group — see targetsAlreadyWaiting().
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
          /* Another planner got this group first — see takenByAnotherPlanner(). */
          if (takenByAnotherPlanner(insErr)) {
            waiting.add(targetId);
            dropped.push(targetId);
            break;
          }
          failed += 1;
          await note('error', 'plan_failed', insErr.message, { schedule: schedule.id });
          continue;
        }
        if (data && data.length) {
          taken.add(slotKey(targetId, slot));
          waiting.add(targetId);
          created += 1;
          made += 1;
          rotation += 1;
        }
      }
    }

    /*
     * `plannedAhead ? 0 : made` — on a top-up the groups left out are the ones
     * still busy with the round already running, which is the steady state of
     * every repeating campaign and has not changed since the last minute. The
     * `made <= 0` guard inside noteDropped already silences a pass that planned
     * nothing; this silences the one that planned a single refill.
     */
    await noteDropped(db, note, schedule.id, dropped, plannedAhead ? 0 : made);
    if (!plannedAhead) built += made;
    /*
     * MARKED PLANNED ONLY IF IT WAS. The stamp and the retirement below are
     * what make a round final; writing them after a failure is what killed his.
     * The upsert carries `onConflict ... ignoreDuplicates`, so running the
     * same plan again costs nothing and creates no second copy — which is
     * exactly why leaving the schedule alone is safe.
     */
    if (failed) {
      await note(
        'warn',
        'plan_retry',
        `${failed} פרסומים לא נכתבו לתור כי לא הייתה גישה למסד הנתונים. הסבב לא נסגר — ננסה שוב בבדיקה הבאה.`,
        { schedule: schedule.id, failed },
      );
      continue;
    }
    await db.from('social_schedules').update({ planned_until: until.toISOString() }).eq('id', schedule.id);
    if (schedule.mode === 'now' || schedule.mode === 'once') {
      await db.from('social_schedules').update({ active: false }).eq('id', schedule.id);
    }
  }

  if (built) await note('info', 'planned', `נוצרו ${built} פרסומים בתור`, { created: built });
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
 * The database refusing a second waiting publication for a group.
 *
 * Not a failure, and it must not be logged as one. The planner checks which
 * groups are taken and then inserts, and between those two moments another
 * planner can take the group — the PC worker ticks every few seconds and the
 * server's /api/social/run is what "פרסם עכשיו" calls, so two of them running
 * at once is ordinary, not exotic. No check before a write can close that gap;
 * only the write can, which is what social-schema-v20.sql is for.
 *
 * When it fires, the right answer is the one the check would have given: this
 * group is spoken for, note it as left out, move on. Writing 'plan_failed' for
 * it would put an error in the owner's log for the system working correctly.
 *
 * Matched on the index name rather than on 23505 alone, because the other
 * unique index on this table — (schedule_id, target_id, scheduled_at) — means
 * something different and is already handled by ignoreDuplicates.
 */
function takenByAnotherPlanner(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return /social_queue_one_open_per_target_idx/i.test(error.message ?? '');
}

/**
 * Groups that already have a publication WAITING — whatever post it is for.
 *
 * THIS USED TO BE SCOPED TO ONE POST, and that is the hole the owner found:
 * two rows for the same group in the same minute, both later skipped.
 *
 *   ערד-ערדניקים   16:09   דולג
 *   ערד-ערדניקים   16:09   דולג
 *
 * Neither of the two things that are supposed to prevent that could see it.
 * The queue's unique index is (schedule_id, target_id, scheduled_at), so it
 * only ever looks inside ONE schedule. And this check matched on post_id, so
 * it only ever looked at ONE post. A second campaign, with a different post,
 * planning the same groups from the same base time with the same one-minute
 * stagger, passes both — and every group is queued twice.
 *
 * Publishing was never in danger: rules.ts refuses a post that has already
 * gone to a target, which is why every one of those rows reads דולג. But
 * "safe" is not the same as "right". The owner is shown a queue twice the
 * length of the truth, told nothing about which half is real, and then watches
 * half of it fail for a reason that describes something they never did.
 *
 * So the rule is now the one they asked for: one waiting publication per
 * group. Not per post, not per schedule — per group. A group is free again the
 * moment its row leaves the queue, and noteDropped() below says out loud which
 * groups a launch left out and why, because a launch that silently plans 30 of
 * 130 groups is its own kind of lie.
 *
 * social/social-schema-v20.sql enforces the same rule in the database, because
 * a check in application code cannot survive two planners running at once —
 * both read this set, both find the group free, both insert.
 *
 * Terminal rows are deliberately excluded: something cancelled, skipped or
 * failed is finished, and may be planned again.
 */
async function targetsAlreadyWaiting(db: SupabaseClient): Promise<Set<string>> {
  const { data } = await db.from('social_queue').select('target_id').in('status', OPEN_STATUSES);
  return new Set((data ?? []).map((r) => r.target_id as string));
}

/**
 * Says out loud which groups a launch quietly left out.
 *
 * targetsAlreadyWaiting() is right to skip a group that already has a row —
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

/**
 * AND IT IS SAID WHEN SOMETHING ACTUALLY HAPPENED, NOT EVERY MINUTE.
 *
 * "קבוצות לא נכנסו לסבב · 219 · לפני פחות מדקה" — four times, in one minute,
 * for ever.
 *
 * planQueue runs every 60 seconds (PLAN_EVERY_MS) and re-plans its whole
 * 48-hour window each pass, so a RECURRING schedule re-derives the same slots,
 * finds the same groups still busy with the round that is already running, and
 * had been writing the same warning every minute of every day. For a one-off
 * launch that never showed, because the schedule retires itself at the end of
 * its first pass — the drip of repeats arrived with CHZARA, and it buries the
 * log and the notification bell under a fact that has not changed since the
 * last time it was written.
 *
 * `made` IS THE WHOLE FIX: rows this pass actually wrote for this schedule.
 *
 *   made > 0   a genuinely partial occasion — "27 of 28 went in, #7 did not",
 *              which is the message this function was written for. It is said
 *              ONCE, because the next pass writes nothing and falls silent.
 *   made === 0 nothing was planned, so there was no "הפעלה" for anything to be
 *              left out of. The sentence says "בהפעלה הזו" and there wasn't one.
 *
 * The information is not lost, only the repetition: the pass that first finds
 * a group busy is the pass that names it.
 */
async function noteDropped(db: SupabaseClient, note: PlanLogger, scheduleId: string, targetIds: string[], made: number): Promise<void> {
  if (!targetIds.length || made <= 0) return;
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
  const waiting = await targetsAlreadyWaiting(db);
  let created = 0;
  /* Rows this drip wrote in THIS pass — see noteDropped. */
  let made = 0;
  let last = now;

  const dropped: string[] = [];
  /* Same counter, same reason as the loop above: a drip retires for good the
     moment `planned_until` is set, so a network blip would bury the whole
     multi-day campaign on its first pass. */
  let failed = 0;
  for (const [targetIndex, targetId] of schedule.target_ids.entries()) {
    const at = slots[targetIndex];
    if (!at) continue;
    if (at > last) last = at;
    // Something is already waiting for this group — see targetsAlreadyWaiting().
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
      /* Another planner got this group first — see takenByAnotherPlanner(). */
      if (takenByAnotherPlanner(error)) {
        waiting.add(targetId);
        dropped.push(targetId);
        continue;
      }
      failed += 1;
      await note('error', 'plan_failed', error.message, { schedule: schedule.id });
      continue;
    }
    if (data?.length) {
      taken.add(slotKey(targetId, at));
      waiting.add(targetId);
      created += 1;
      made += 1;
    }
  }
  await noteDropped(db, note, schedule.id, dropped, made);
  if (failed) {
    await note(
      'warn',
      'plan_retry',
      `${failed} פרסומים לא נכתבו לתור כי לא הייתה גישה למסד הנתונים. ההפצה ההדרגתית לא נסגרה — ננסה שוב בבדיקה הבאה.`,
      { schedule: schedule.id, failed },
    );
    return created;
  }
  await db.from('social_schedules').update({ planned_until: last.toISOString(), active: false }).eq('id', schedule.id);
  if (created) await note('info', 'drip_planned', `הפצה הדרגתית: ${created} פרסומים תוכננו עד ${last.toISOString()}`, { created });
  return created;
}
