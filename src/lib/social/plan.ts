import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dedupeKey, renderPostText } from './compose';
import { zonedHM } from './time';
import { dripSlots, slotsFor } from './slots';
import { windowedStagger } from './projection';
import { readSchedule, type CampaignSchedule } from './campaign-schedule';
import { CANCELLABLE_STATUSES, MAYBE_LIVE_STEP, OPEN_STATUSES } from './status';
import { DEFAULT_BROWSER, DEFAULT_LIMITS, type BrowserSettings, type LimitsSettings, type MediaItem, type Post, type Schedule, type SocialTarget, type Variant } from './types';
import { accountGapSeconds } from './rules';
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
  const spacingSeconds = await enforcedSpacing(db);

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
    /*
     * ─── THE PLANNER NO LONGER PRE-REFUSES A GROUP — v33 ────────────────────
     *
     * "אני רוצה שיהיה אפשר לפרסם גם ככה ובכל תנאי גם יש עוד סבב אם אותם קבוצות
     *  בקמפיין אחר", and, asked which of his two contradictory instructions
     * stands: "לפתוח הכל, גם אותו פוסט". 02.11.2026.
     *
     * This used to be targetsAlreadyWaiting(db) — every open row in the
     * account, whatever post it belonged to — so a group another campaign was
     * holding was simply unavailable. His Russian-language round carries fifty
     * groups, another campaign held an open row for every one, and the planner
     * dropped all fifty every pass: "אף קבוצה לא נכנסה לתור", night after
     * night, with nothing he could do about it.
     *
     * IT STARTS EMPTY AND IS STILL FILLED, by the duplicate-key handler below.
     * That is what keeps a database which has NOT yet run v33 graceful: the
     * index is still there, the insert is refused, the group goes into this set
     * and the rest of the pass leaves it alone — reported through noteDropped
     * exactly as before. So the planner now asks the database instead of
     * guessing, which is also the only correct order when two planners race.
     *
     * NOTHING ABOUT PUBLISHING IS DECIDED HERE. What actually goes out is
     * rules.ts: each group's daily quota, the account ceiling, the gap between
     * publications, and the repeat window — which still defers a second row for
     * the same post and group rather than publishing it beside the first.
     */
    const waiting = await targetsAlreadyWaiting(db, post.id);
    /*
     * ───────── THE CAMPAIGN'S OWN WINDOW, BEFORE A SINGLE STAMP IS WRITTEN ──
     *
     * "אני רוצה שהפרסום בפועל יקרה בזמן הנכון."
     *
     * This loop wrote `staggerAt(slot, i, gap)` — the occasion's instant plus
     * the spacing — and nothing in it had ever heard of the days and hours the
     * owner set on the campaign. On a 218-group round at 65 minutes that walks
     * nine days straight through every night: rows stamped 02:40, 03:45, 04:50
     * on a campaign that publishes 08:00–22:00.
     *
     * Nothing was LOST — rules.ts defers such a row to the next legal moment
     * and never drops it — but the column then says something the machine will
     * not do, and every screen, countdown and "הבא בתור" in the product reads
     * that column. A row may only be stamped at an instant the engine can
     * actually use.
     *
     * windowedStagger() is the same interval, rolled across the window's edge
     * and onto the next chosen day, cascading so a block of rolled rows lands
     * at 08:00, 08:01, 08:02 … rather than all on the opening minute (which the
     * unique index would reject, silently shrinking the round to one row).
     * It takes no clock, so re-planning reproduces exactly the same instants
     * and the unique (schedule, target, scheduled_at) key still does its job.
     *
     * COSTS NOTHING WHEN THE PANEL WAS NEVER OPENED: readSchedule() reports
     * `enabled: false` for a campaign that predates these columns and for a
     * database that has not run social-latest.sql, and the roll is then the
     * identity — the flat sequence this planner has always written.
     */
    const campaignSchedule = await campaignWindow(db, post.campaign_id ?? null);
    /* One row per (occasion, target), worked out up front because each instant
       is the floor of the next — see windowedCascade(). */
    /*
     * THE LATER OF THE TWO GATES, because that is the one the engine enforces.
     *
     * `spacingSeconds` is the ACCOUNT floor and nothing else, while
     * campaignSchedule was passed only as the WINDOW to roll into. So the
     * moment the floor comes down to thirty seconds, a second campaign still
     * asking for ten minutes has its rows STAMPED thirty seconds apart and
     * then every one of them deferred by rules.ts — the column promising an
     * instant the queue will never use, which is the contradiction between
     * screens this product keeps being bitten by. holdFor() and projectOne()
     * both already take this max; the planner was the one place that did not.
     */
    const stampGapSeconds = Math.max(
      spacingSeconds,
      campaignSchedule?.enabled ? campaignSchedule.gapSeconds : 0,
    );
    const plannedSlots = slots.map((slot) => windowedStagger(slot, schedule.target_ids.length, stampGapSeconds, campaignSchedule));

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
     * ─── THE SKIP THAT SAID NOTHING ────────────────────────────────────────
     *
     * "עדיין יש חוסר התאמה יש 252 קבוצות של הקמפיין שאמור לפרסם אבל בפועל הוא
     *  ספג רק 210 בממתינים תבדוק למה." — the owner, 02.11.2026.
     *
     * Four things can drop a group between "selected" and "queued". Three of
     * them push onto `dropped` and end up in the activity log BY NAME. The
     * fourth — `taken.has(slotKey(...))`, an instant this post already
     * occupies — was a bare `continue`: no counter, no log, no trace. A group
     * that fell through it was simply absent, and the only way to notice was
     * to subtract two numbers on two screens, which is exactly what he had to
     * do.
     *
     * It is usually RIGHT to skip: the instant is taken because a row for it
     * already exists. But "correct" and "silent" are different things, and a
     * launch that quietly plans 210 of 252 is the shape this product keeps
     * being bitten by.
     */
    const occupied: string[] = [];
    /* Slots freed from a cancelled row, and slots a FAILED row still holds —
       see recycleTombstonedSlot() and noteTombstoned(). */
    let recycledSlots = 0;
    const tombstoned: string[] = [];
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
    /* Learned once per pass — see the note at the upsert. */
    let roundColumnMissing = false;
    /* Rows this schedule wrote in THIS pass — the global `created` counts every
       schedule, and the question noteDropped asks is about this one. */
    let made = 0;
    for (const [targetIndex, targetId] of schedule.target_ids.entries()) {
      // The database refused this group earlier in THIS pass — see `waiting`.
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

      for (const [slotIndex] of slots.entries()) {
        // Each target gets its own instant inside the occasion, so a weekly
        // campaign publishes instead of deferring itself into skips — and that
        // instant is inside the campaign's own window. See plannedSlots above.
        const slot = plannedSlots[slotIndex][targetIndex];
        // Already planned for this post by some other schedule.
        if (taken.has(slotKey(targetId, slot))) {
          occupied.push(targetId);
          continue;
        }
        const variant = pickVariant(approved, schedule, targetId, targetIndex, rotation);
        const text = renderPostText(post as Post, variant);
        const hash = sha256(dedupeKey(targetId, text, media.map((m) => m.url)));
        /*
         * ─── A QUEUE ROW MUST NOT DIE ON A COLUMN THE DATABASE HAS NOT GOT ─
         *
         * round_at arrives with supabase/social-latest.sql. PostgREST refuses
         * the WHOLE write when a named column is absent, so a planner that
         * always sent it would queue NOTHING on a database that has not run
         * the file — the round would simply stop publishing, silently, and
         * the dashboard would look alive the whole time.
         *
         * That is not a hypothetical: the same mistake blanked the owner's
         * dashboard an hour before this was written, and createSchedule has
         * carried OPTIONAL_SCHEDULE_COLUMNS since the drip_gap_seconds
         * incident for exactly this reason — eleven days of launches that
         * queued nothing.
         *
         * So the column is dropped for the rest of the pass the first time
         * the database says it does not know it. Once per pass, not once per
         * row: a planner that re-learned this two hundred times would double
         * every insert of every round.
         */
        const row: Record<string, unknown> = {
          schedule_id: schedule.id,
              post_id: post.id,
              campaign_id: post.campaign_id ?? null,
              variant_id: variant?.id ?? null,
              target_id: targetId,
              scheduled_at: slot.toISOString(),
              /*
               * WHICH ROUND OF THE DAY THIS ROW IS, recorded now and never
               * recomputed — "כל סבב חייב לקבל מזהה עצמאי".
               *
               * `slot` is this target's own instant INSIDE the occasion
               * (windowedStagger spaces the groups out from it), so the round
               * is taken from the OCCASION, slots[slotIndex], and not from
               * the row's own time. Taking it from `slot` would put the tail
               * of a long round into the next one as soon as the stagger ran
               * past it.
               *
               * And it is stored rather than derived because rules.ts moves
               * instants: the account gap, a daily ceiling and a read that
               * failed all defer a row, and a round guessed from the clock
               * afterwards counts that publication in a round it was never
               * part of.
               */
              round_at: zonedHM(slots[slotIndex], schedule.timezone || undefined),
              status: 'scheduled',
              step: 'pending',
              require_confirmation: Boolean(schedule.require_confirmation),
              dedupe_hash: hash,
              rendered_text: text,
        };
        if (roundColumnMissing) delete row.round_at;
        const write = () =>
          db
            .from('social_queue')
            .upsert(row, { onConflict: 'schedule_id,target_id,scheduled_at', ignoreDuplicates: true })
            .select('id');
        let { error: insErr, data } = await write();
        if (insErr && !roundColumnMissing && isMissingRoundColumn(insErr)) {
          roundColumnMissing = true;
          delete row.round_at;
          ({ error: insErr, data } = await write());
          await note(
            'warn',
            'rounds_column_missing',
            'התור נכתב בלי שיוך לסבב — צריך להריץ פעם אחת את supabase/social-latest.sql ב-Supabase. הפרסום עצמו ממשיך כרגיל.',
            { schedule: schedule.id },
          );
        }
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
        } else {
          /*
           * NO ERROR AND NO ROW: ON CONFLICT DID NOTHING. The slot is held by
           * a row occupiedSlots() did not count — see recycleTombstonedSlot(),
           * where the whole of "עדיין לא מפרסם כלום" is written down. This
           * branch did not exist, and its absence is why a campaign that could
           * no longer place a single publication said nothing at all, once a
           * minute, for ever.
           */
          const { schedule_id: _si, target_id: _ti, scheduled_at: _sa, ...plan } = row;
          const retry = await recycleTombstonedSlot(db, { scheduleId: schedule.id, targetId, at: slot.toISOString() }, plan);
          if (retry.error) {
            failed += 1;
            await note('error', 'plan_failed', retry.error, { schedule: schedule.id });
            continue;
          }
          if (retry.recycled) {
            taken.add(slotKey(targetId, slot));
            waiting.add(targetId);
            created += 1;
            made += 1;
            rotation += 1;
            recycledSlots += 1;
          } else {
            tombstoned.push(targetId);
          }
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
    await noteOccupied(db, note, schedule.id, occupied, plannedAhead ? 0 : made);
    /* Ungated on `made`, deliberately — see noteTombstoned(). */
    await noteTombstoned(db, note, schedule.id, recycledSlots, tombstoned);
    /*
     * ─── AND THE ONE CASE noteDropped IS DELIBERATELY SILENT ABOUT ─────────
     *
     * EVERY group dropped and not one row written. The `made <= 0` guard
     * inside noteDropped exists to stop a repeating round repeating a message
     * about the groups still busy with its own last pass — which is right.
     * But it also silences the launch where NOTHING got through, and that is
     * the one a person most needs to hear about.
     *
     * UNTIL v33 the planner refused a group that had an open row from ANY
     * round, so an owner with a few hundred rows already waiting could launch
     * a second round over the same groups and get: zero rows, zero log lines,
     * and — for a 'now' or 'once' schedule — the schedule retiring itself at
     * the end of this very pass. The launch reported success and left nothing
     * behind. That is the state this message was written for, and it is the
     * state the owner spent an evening in.
     *
     * v33 removed the rule, so on a migrated database `dropped` fills only
     * from a refusal the database actually made — which happens only where the
     * v20 index is still standing. The message therefore still matters, and it
     * now means something sharper: this database has not been migrated.
     *
     * So the fully-blocked pass speaks. Not on a top-up (`plannedAhead`),
     * which is the steady state of every repeating round and has not changed
     * since the minute before; and not when there was nothing to plan at all
     * (`dropped` empty), which is not an event.
     */
    if (!plannedAhead && made === 0 && dropped.length) {
      await noteAllBlocked(db, note, schedule.id, dropped, schedule.mode === 'now' || schedule.mode === 'once');
    }
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

/**
 * The account-wide floor rules.ts will enforce, IN SECONDS.
 *
 * It used to add the two minute columns up itself, and that duplicated the
 * rule — then the two copies disagreed the moment seconds existed. Now it asks
 * accountGapSeconds(), which is the single place that decides what the pair
 * means, so a thirty-second floor arrives here as 30 rather than being rounded
 * up to a minute by a reader that only knew about minutes. That rounding was
 * the fourth gate: see staggerAt() in ./slots.
 */
/**
 * THE CAMPAIGN'S PUBLISHING WINDOW, for the planner's own stamps.
 *
 * The five schedule columns arrive only once social-latest.sql has been run,
 * and a campaign that predates them — or a read that fails — must plan exactly
 * as it always did rather than not at all. So a missing column, a missing
 * campaign and a missing id all resolve to the same thing: null, which
 * windowedStagger() treats as "no window", which is the identity.
 *
 * NOT A SECOND SCHEDULING MECHANISM. readSchedule() is the same function
 * rules.ts asks before it releases a row and the same one the cards print; this
 * only puts the stamp where that function already says the row will go out.
 */
async function campaignWindow(db: SupabaseClient, campaignId: string | null): Promise<CampaignSchedule | null> {
  if (!campaignId) return null;
  const { data, error } = await db
    .from('social_campaigns')
    .select('schedule_enabled, schedule_days, schedule_start, schedule_end, schedule_gap_minutes, schedule_gap_seconds')
    .eq('id', campaignId)
    .maybeSingle();
  if (error || !data) return null;
  return readSchedule(data);
}

async function enforcedSpacing(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('social_settings').select('key, value').in('key', ['limits', 'browser']);
  const byKey = new Map((data ?? []).map((r) => [r.key as string, (r.value ?? {}) as Record<string, unknown>]));
  const limits = { ...DEFAULT_LIMITS, ...(byKey.get('limits') ?? {}) } as LimitsSettings;
  const browser = { ...DEFAULT_BROWSER, ...(byKey.get('browser') ?? {}) } as BrowserSettings;
  return accountGapSeconds(limits, browser, true);
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
/**
 * "That column is not here" — and ONLY that.
 *
 * Postgres reports an unknown column as 42703 and PostgREST as PGRST204. A
 * refused write, a dropped connection and an expired token are different
 * answers and must keep failing loudly: the whole point of the retry beside
 * this is that it fires for one cause and never hides another.
 */
function isMissingRoundColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /round_at/.test(error.message ?? '') && /column|schema cache/i.test(error.message ?? '');
}

function takenByAnotherPlanner(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return /social_queue_one_open_per_target(_post)?_idx/i.test(error.message ?? '');
}

/**
 * ─── WHICH GROUPS THIS POST IS ALREADY WAITING FOR ─────────────────────────
 *
 * PER POST, AND THAT IS THE WHOLE POINT OF IT.
 *
 * v33 removed this check entirely, on the owner's instruction, and the
 * consequence was measured on his own dashboard within the hour: 255 waiting
 * at 18:51, 317 at 19:00, with the published count frozen at 190. Sixty-two
 * new rows in nine minutes and not one publication. "אין שום קמפיין דולק
 * ברקע... וזה רק עולה."
 *
 * The planner runs every sixty seconds and re-plans every active schedule.
 * `plannedAhead` only decides what gets WRITTEN TO THE LOG — it never stopped
 * the loop — and occupiedSlots only refuses the same instant. So the thing
 * that actually stopped a schedule re-queueing the same group on every tick
 * was this read, backed by the unique index. Removing both left nothing at
 * all, and the queue grew without bound.
 *
 * SO IT COMES BACK SCOPED TO THE POST, WHICH IS NOT WHAT HE OBJECTED TO. His
 * complaint was that a group another CAMPAIGN was holding made his
 * Russian-language round unable to queue a single one of its fifty groups.
 * That stays fixed: a different post is never blocked here, and the account
 * -wide index stays dropped. What comes back is only "this post is already
 * waiting for this group, so do not queue it again" — which is also what the
 * rounds feature has always relied on.
 *
 * WHAT THIS IS NOT: it is not the repeat window. v34 stands, zero still means
 * no minimum between two publications of the same post to one group. This
 * decides whether a SECOND ROW IS CREATED while the first is still waiting,
 * not how long the engine makes them wait.
 */
async function targetsAlreadyWaiting(db: SupabaseClient, postId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('social_queue')
    .select('target_id')
    .eq('post_id', postId)
    .in('status', OPEN_STATUSES);
  /*
   * FAIL CLOSED, for the same reason stoppedCampaigns() does.
   *
   * The error was discarded and `data ?? []` turned a dropped read into an
   * empty set — "nothing is waiting for this post" — which is the one answer
   * that re-queues every group on every pass. And the index that used to
   * catch the duplicate underneath is gone: social-latest.sql drops both
   * social_queue_one_open_per_target_idx and ..._post_idx, so
   * takenByAnotherPlanner() can never fire on a migrated database. This read
   * is the only per-post brake left.
   *
   * Throwing is safe here: planQueue's caller catches, writes plan_failed and
   * retries on the next pass, which is a minute of nothing rather than a
   * round written twice.
   */
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.target_id as string));
}

/**
 * Says out loud which groups a launch quietly left out.
 *
 * Before v33 the planner skipped a group that already had any open row, and
 * it was right to: a second row for the SAME POST could never publish
 * (rules.ts refuses a post that has gone to a target once) and would only make
 * the queue longer than the truth. What it could not tell apart was a second
 * row for a DIFFERENT post, which can. The skip was also completely silent,
 * and for a 'now' or 'once' schedule the schedule then retires itself at the
 * end of the pass. Relaunching a post to 28 groups
 * while group #7 still sits in needs_attention from the previous round produced
 * 27 rows, no row for #7 ever, and nothing anywhere naming #7.
 *
 * It goes in the activity log, which is where every other thing the two workers
 * decide on the owner's behalf is written, and it names the groups rather than
 * counting them — "27 of 28" is not something anybody can act on.
 */
const DROPPED_NAMES_SHOWN = 8;

/**
 * ─── AND THE GROUPS WHOSE INSTANT WAS ALREADY TAKEN ───────────────────────
 *
 * Separate from noteDropped because it is a different fact and deserves
 * different words. noteDropped means "this post is already waiting for that
 * group". This means "the exact second this pass wanted is already spoken
 * for by a row of this post" — which is how a re-plan avoids writing the same
 * row twice, and is usually the system working.
 *
 * It is reported anyway, because the owner had to subtract 210 from 252 on
 * two different screens to discover that forty-two groups were missing, and
 * nothing anywhere would ever have told him. Silent and correct is still
 * silent.
 *
 * It takes the same `made <= 0` guard as noteDropped: a pass that wrote
 * nothing at all is either a top-up or a fully blocked launch, and the second
 * one already has its own louder message.
 */
async function noteOccupied(db: SupabaseClient, note: PlanLogger, scheduleId: string, targetIds: string[], made: number): Promise<void> {
  const unique = [...new Set(targetIds)];
  if (!unique.length || made <= 0) return;
  const { data } = await db.from('social_targets').select('name').in('id', unique.slice(0, DROPPED_NAMES_SHOWN));
  const names = ((data ?? []) as { name: string | null }[]).map((t) => t.name).filter(Boolean);
  const rest = unique.length - names.length;
  const list = names.length ? `: ${names.join(', ')}${rest > 0 ? ` ועוד ${rest}` : ''}` : '';
  await note(
    'info',
    'plan_slots_occupied',
    `${unique.length} קבוצות לא קיבלו שורה חדשה כי השעה שחושבה להן כבר תפוסה בתור של הפוסט הזה${list}`,
    { scheduleId, occupied: unique.length, targetIds: unique },
  );
}

/**
 * ─── A CANCELLED ROW HAS TOMBSTONED ITS OWN SLOT. RECYCLE IT. ─────────────
 *
 *   "הוא מדלג ורושם הסבב נעצר למרות שלא עשיתי כלום"
 *   "עדיין לא מפרסם כלום"
 *
 * Both of those, from one press, and this function is why they could not be
 * explained from any screen.
 *
 * THE CONTRADICTION. `social_queue_slot_idx` is unique on (schedule_id,
 * target_id, scheduled_at) and is DELIBERATELY NOT PARTIAL — the schema says
 * so three times, because PostgREST cannot infer a partial index as an ON
 * CONFLICT target, and the planner's idempotence rests on that inference. So
 * the index counts a 'skipped' row like any other. But occupiedSlots() reads
 * `.in('status', ['published', ...OPEN_STATUSES])` under a docstring that
 * states the opposite in so many words: "Terminal rows are deliberately
 * excluded: something already skipped or failed should be allowed to be
 * planned again."
 *
 * The code's declared intent and the database therefore disagree, and the
 * disagreement is SILENT. The write is `upsert(..., { ignoreDuplicates: true
 * })`, which is ON CONFLICT DO NOTHING: a refused insert comes back with `data
 * = []` and `error = null`. Not an error, not a duplicate, not a row. Every
 * counter is gated on `data.length`, so `created`, `made` and `rotation` all
 * stay put — and every log line in the pass is gated on `made > 0`. A schedule
 * that can no longer place a single row reports absolutely nothing, once a
 * minute, for ever.
 *
 * WHY HIS QUEUE STOPPED. "סיים ואפס" cancels every not-yet-started row of the
 * round in one UPDATE, and the planner's horizon is 48 hours (HORIZON_HOURS),
 * so one press tombstones every occasion for two days. The instants are
 * clock-free — slotsFor derives them from the calendar and schedule.weekly,
 * windowedStagger and the gap are deterministic — and re-arming the daily
 * repeat reuses the SAME schedule row. So the relaunch recomputed the
 * identical minutes for the identical groups, and the database refused every
 * single insert without a word. Relaunching could never have worked.
 *
 * WHAT THIS DOES. On an empty result the slot is held by a row occupiedSlots()
 * did not count, which can only be a terminal one — and never a published one,
 * because 'published' IS in that set. So the holder is re-planned in place:
 * the slot is reused, which is exactly what the docstring promised.
 *
 * ONLY 'skipped', NEVER 'failed'. A cancelled row is a non-event: nothing was
 * attempted and nothing is lost by planning over it. A FAILED row is an
 * attempt that happened and has its own retry policy with a ceiling
 * (REVIVE_ATTEMPT_CEILING in worker/revive.ts); recycling it here would reset
 * that ceiling and hand a permanently failing group unlimited attempts. A
 * failed holder is reported instead, which is still infinitely better than the
 * silence it replaces.
 *
 * AND `published_at IS NULL` ON TOP, belt and braces: the one outcome this
 * must never be able to produce is a second publication to the same group, and
 * a row that carries an instant is a row that went out.
 */
async function recycleTombstonedSlot(
  db: SupabaseClient,
  slot: { scheduleId: string; targetId: string; at: string },
  plan: Record<string, unknown>,
): Promise<{ recycled: boolean; error: string | null }> {
  const { data, error } = await db
    .from('social_queue')
    .update({ ...plan, skip_reason: null, error: null })
    .eq('schedule_id', slot.scheduleId)
    .eq('target_id', slot.targetId)
    .eq('scheduled_at', slot.at)
    .eq('status', 'skipped')
    .is('published_at', null)
    .select('id');
  if (error) return { recycled: false, error: error.message };
  return { recycled: Boolean(data && data.length), error: null };
}

/**
 * THE SLOT WAS TAKEN BY A ROW NOBODY COULD SEE — said out loud, ALWAYS.
 *
 * Deliberately NOT gated on `made > 0`, unlike noteDropped and noteOccupied.
 * Their guard exists to stop a healthy repeating round writing the same line
 * every minute, and it is right for them. It is exactly wrong here: the case
 * this reports IS the pass that made nothing, and inheriting that guard is how
 * a campaign that could no longer queue a single publication stayed silent
 * through an entire evening of being asked why.
 *
 * `recycled` is the good news in the same line, because the owner should be
 * able to see the repair happening rather than only the damage.
 */
async function noteTombstoned(
  db: SupabaseClient,
  note: PlanLogger,
  scheduleId: string,
  recycled: number,
  refused: string[],
): Promise<void> {
  const unique = [...new Set(refused)];
  if (!recycled && !unique.length) return;
  let list = '';
  if (unique.length) {
    const { data } = await db.from('social_targets').select('name').in('id', unique.slice(0, DROPPED_NAMES_SHOWN));
    const names = ((data ?? []) as { name: string | null }[]).map((t) => t.name).filter(Boolean);
    const rest = unique.length - names.length;
    list = names.length ? `: ${names.join(', ')}${rest > 0 ? ` ועוד ${rest}` : ''}` : '';
  }
  if (!unique.length) {
    await note('info', 'plan_slots_recycled', `${recycled} שעות שהיו תפוסות בגלל פרסומים שבוטלו שוחררו וחזרו לתור`, {
      scheduleId,
      recycled,
    });
    return;
  }
  await note(
    recycled ? 'warn' : 'error',
    'plan_slots_tombstoned',
    `${unique.length} קבוצות לא קיבלו שורה בתור: השעה שחושבה להן תפוסה על ידי פרסום קודם שנכשל${list}.${
      recycled ? ` (${recycled} שעות אחרות כן שוחררו.)` : ' שנו את שעת ההתחלה של הסבב ב"ערוך מועד" כדי לחשב שעות אחרות.'
    }`,
    { scheduleId, refused: unique.length, targetIds: unique, recycled },
  );
}

/**
 * NOT ONE GROUP GOT THROUGH — said plainly, because this is the launch that
 * looks like it worked and did nothing.
 *
 * Separate from noteDropped rather than a flag on it, because the two are
 * different facts and deserve different words: "27 of 28 went in" is a note,
 * "none of the 28 went in and this round is now closed" is a failure. It is a
 * 'warn' for that reason, and it names the action, because the owner cannot be
 * expected to know that a group is blocked by a row belonging to some other
 * round he is not looking at.
 */
async function noteAllBlocked(
  db: SupabaseClient,
  note: PlanLogger,
  scheduleId: string,
  targetIds: string[],
  /**
   * Whether this schedule is about to be retired in the same pass.
   *
   * It decides the last sentence, and the two are not interchangeable. A
   * RECURRING schedule stays active, so "it will not go out until the queue
   * advances" is a true description of what happens next. A 'now', 'once' or
   * 'drip' launch is retired three lines later — telling that owner to wait
   * for the queue to advance is telling him to wait for something that will
   * never be tried again. He has to press publish once more, so the line
   * says so.
   */
  retiring: boolean,
): Promise<void> {
  const { data } = await db.from('social_targets').select('name').in('id', targetIds.slice(0, DROPPED_NAMES_SHOWN));
  const names = ((data ?? []) as { name: string | null }[]).map((t) => t.name).filter(Boolean);
  const rest = targetIds.length - names.length;
  const list = names.length ? `: ${names.join(', ')}${rest > 0 ? ` ועוד ${rest}` : ''}` : '';
  const whatNext = retiring
    ? 'הפרסום הזה לא נכנס לתור בכלל — נסו שוב אחרי שהתור הקיים יתקדם, או בחרו קבוצות אחרות.'
    : 'הסבב הזה לא ייצא עד שהתור הקיים יתקדם או שתבחרו קבוצות אחרות.';
  await note(
    'warn',
    'plan_all_blocked',
    `אף קבוצה לא נכנסה לתור — לכל ${targetIds.length} הקבוצות כבר ממתין פרסום מסבב אחר${list}. ${whatNext}`,
    { scheduleId, blocked: targetIds.length, targetIds, retiring },
  );
}

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
  /*
   * FAIL CLOSED. This read used to discard its error — `const { data } =` —
   * and an empty set does not mean "nothing is stopped": it disarms BOTH
   * things that depend on it, for the whole pass. The sweep below cancels
   * nothing, and the stop-guard at the top of each post's loop (`stopped.has(
   * post.campaign_id)`) waves every stopped round through, so the planner
   * writes a fresh queue for a campaign the owner has ended — which then
   * publishes, or is cancelled again on the next pass with "הסבב נעצר".
   *
   * One dropped read on a home connection is enough. It is the same fault,
   * in the same shape, that four reads in rules.ts were already fixed for:
   * "A dropped connection here leaves `campaign` null ... and a campaign the
   * owner PAUSED publishes."
   *
   * A throw is the right shape because planQueue's caller already catches,
   * logs and retries in sixty seconds: one skipped pass with a visible reason
   * beats a pass that plans blind.
   */
  const { data, error } = await db.from('social_campaigns').select('id').eq('status', 'archived');
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((c) => c.id as string);
  if (!ids.length) return new Set();

  const { data: stale } = await db
    .from('social_queue')
    .update({ status: 'skipped', step: '', skip_reason: 'הסבב נעצר' })
    .neq('step', MAYBE_LIVE_STEP)
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
  /* Per post, exactly as the weekly planner above — see its note. */
  const waiting = await targetsAlreadyWaiting(db, post.id);
  /* And the silent skip is collected here too — see noteOccupied(). */
  const occupied: string[] = [];
  /* See recycleTombstonedSlot() and noteTombstoned(). */
  let recycledSlots = 0;
  const tombstoned: string[] = [];
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
    // The database refused this group earlier in THIS pass — see `waiting`.
    if (waiting.has(targetId)) {
      dropped.push(targetId);
      continue;
    }
    // Already planned for this post by some other schedule.
    if (taken.has(slotKey(targetId, at))) {
      /* Reported, exactly as in the weekly planner above — and this branch
         matters more here, because "פרסם עכשיו" with more than one target is
         a drip, so this is the loop every manual launch goes through. */
      occupied.push(targetId);
      continue;
    }
    const variant = pickVariant(approved, schedule, targetId, targetIndex, 0);
    const text = renderPostText(post as Post, variant);
    const hash = sha256(dedupeKey(targetId, text, media.map((m) => m.url)));
    /* Lifted out of the call so the recycle below can re-use the same plan —
       two copies of a row's shape is how they drift apart. */
    const dripRow: Record<string, unknown> = {
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
    };
    const { error, data } = await db
      .from('social_queue')
      .upsert(dripRow, { onConflict: 'schedule_id,target_id,scheduled_at', ignoreDuplicates: true })
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
    } else {
      /* The same silent refusal as the weekly branch — see
         recycleTombstonedSlot(). "פרסם עכשיו" with several targets comes
         through here, so it needs the repair and the report just as much. */
      const { schedule_id: _si, target_id: _ti, scheduled_at: _sa, ...plan } = dripRow;
      const retry = await recycleTombstonedSlot(db, { scheduleId: schedule.id, targetId, at: at.toISOString() }, plan);
      if (retry.error) {
        failed += 1;
        await note('error', 'plan_failed', retry.error, { schedule: schedule.id });
        continue;
      }
      if (retry.recycled) {
        taken.add(slotKey(targetId, at));
        waiting.add(targetId);
        created += 1;
        made += 1;
        recycledSlots += 1;
      } else {
        tombstoned.push(targetId);
      }
    }
  }
  await noteDropped(db, note, schedule.id, dropped, made);
  await noteOccupied(db, note, schedule.id, occupied, made);
  await noteTombstoned(db, note, schedule.id, recycledSlots, tombstoned);
  /*
   * ─── AND A DRIP THAT QUEUED NOTHING SAYS SO ────────────────────────────
   *
   * The loop above has had this since the day it was written; this one never
   * did, and it is the loop that every "פרסם עכשיו" goes through —
   * draftFor() makes any launch with more than one target a 'drip'.
   *
   * Until v33 a group was blocked by an open row from ANY round. So an owner
   * whose 218-group round was mid-flight pressed publish on a second post over
   * the same groups and got zero rows, and
   * then — because `made === 0` silences noteDropped and nothing else here
   * asks the question — zero log lines, while the line below retires the
   * schedule for good. The launch reports success. The post sits in the
   * library reading "טרם פורסם" for ever, and nothing on any screen says why.
   *
   * Same words, same event name and same condition as the main loop, so the
   * two cannot drift and the owner sees one sentence for one situation.
   */
  if (made === 0 && dropped.length) {
    /* A drip is always retired at the end of this pass (`active: false`
       below), so the owner is told to press publish again rather than to
       wait for something that will not be tried. */
    await noteAllBlocked(db, note, schedule.id, dropped, true);
  }
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
