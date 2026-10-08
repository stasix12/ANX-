import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_CAMPAIGN_REPEAT,
  isAllowedAt,
  nextPublishAt,
  readRepeat,
  readSchedule,
  scheduleSummary,
  type CampaignRepeat,
  type ScheduleFields,
  gapLabel,
} from './campaign-schedule';
import { startOfZonedDay } from './time';
import type { BrowserSettings, Campaign, LimitsSettings, Post, QueueItem, SocialTarget, Variant } from './types';

/**
 * Anti-spam decisions shared by the server worker (Pages, Graph API) and the
 * local browser worker (Groups, Playwright). Both hand in a claimed queue
 * row plus its target/post/variant and get back exactly one action:
 *
 *   publish  — go ahead
 *   skip     — drop with a reason the owner sees in the history
 *   defer    — put back in the queue for `until` (too soon after the last post)
 *   wait     — park until `until` (campaign paused / worker not ready)
 *
 * No network calls to Meta here; purely queue bookkeeping in Supabase.
 */

export type RuleDecision =
  /**
   * `notBefore` is the spacing gap's own instant, present when this row was
   * claimed while the gap was still closing. Everything up to the final click
   * may proceed; the click waits for it. See PREP_LEAD_MS.
   */
  | { action: 'publish'; notBefore?: string }
  | { action: 'skip'; reason: string }
  | { action: 'defer'; until: string; reason: string }
  | { action: 'wait'; until: string; reason: string };

export interface RuleContext {
  item: QueueItem;
  target: SocialTarget | null;
  post: Post | null;
  variant: Variant | null;
  limits: LimitsSettings;
  browser?: BrowserSettings;
  now?: Date;
}

const MAX_DEFERRALS = 40;

/**
 * How far past the gap a deferred row is pushed.
 *
 * It was thirty seconds, and thirty seconds is not a rounding error when the
 * owner has set the gap to one minute: every publication came out 90 seconds
 * after the last one, so a setting that says "a minute" delivered forty
 * publications an hour instead of sixty and the owner had no way to see why.
 * The cushion exists only so the row is not due at the exact instant the gap
 * closes — a hair of clock skew there and it defers once more for nothing —
 * so it is one poll of the worker, which is the real granularity anyway.
 */
const DEFER_CUSHION_MS = 5_000;

/**
 * HOW EARLY A ROW MAY BE LET THROUGH BEFORE ITS GAP CLOSES.
 *
 * The gap used to be satisfied before the browser was opened, and the whole
 * preparation — the group page load, the typing, the upload — was then spent
 * on top of it. So the real interval between two publications was the gap
 * PLUS a publication, never the gap: an owner who asked for one a minute got
 * one every two, and a "נדחה" line for every row in between.
 *
 * Let through this early, the preparation happens INSIDE the remaining wait
 * and the composer holds the final click until the instant itself, so the
 * interval becomes the gap or the length of a publication, whichever is
 * larger. Seventy-five seconds is comfortably longer than a measured
 * publication and short enough that a prepared post is never left sitting.
 *
 * Exported because the worker uses the same number to decide when to claim,
 * and the two must not drift.
 */
export const PREP_LEAD_MS = 75_000;

/**
 * How far ahead a parked row is pushed.
 *
 * 'wait' used to leave scheduled_at untouched, so a paused campaign's soonest
 * row was due again the instant it was written back — and the claim that
 * picked it up a poll later (5 s by default) had already incremented
 * `attempts`. The head row therefore burned ~12 attempts a minute for as long
 * as the pause lasted, and `attempts > MAX_DEFERRALS` turns a row into a
 * permanent skip with a reason about spacing that describes nothing that
 * happened. Pushing the instant forward makes waiting cost nothing.
 */
export const WAIT_MINUTES = 1;

/**
 * Midnight at the start of the next local day, as an instant.
 *
 * Where a row goes when a daily ceiling is full. Computed by asking what day
 * it is 24 hours from now rather than by adding a day to a date, so the clock
 * change in March and October cannot land it on the wrong side of midnight; if
 * that still resolves to an instant already past — the one hour a year it
 * could — it steps a further day rather than returning a moment in the past,
 * which would be a row due immediately and a cap that does nothing.
 */
function startOfNextZonedDay(now: Date): string {
  let next = startOfZonedDay(new Date(now.getTime() + 24 * 60 * 60_000));
  if (next.getTime() <= now.getTime()) next = startOfZonedDay(new Date(now.getTime() + 48 * 60 * 60_000));
  // A minute past midnight, so the count this row is waiting on is unambiguously
  // the new day's rather than a boundary instant belonging to either.
  return new Date(next.getTime() + 60_000).toISOString();
}

async function countPublished(db: SupabaseClient, filter: (q: any) => any): Promise<number> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const base: any = db.from('social_queue').select('id', { count: 'exact', head: true }).eq('status', 'published');
  const res = await filter(base);
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}

export async function evaluateQueueItem(db: SupabaseClient, ctx: RuleContext): Promise<RuleDecision> {
  const now = ctx.now ?? new Date();
  const { item, target, post, variant, limits } = ctx;

  if (!target) return { action: 'skip', reason: 'היעד נמחק.' };
  if (!post || post.status === 'archived') return { action: 'skip', reason: 'הפוסט נמחק או הועבר לארכיון.' };
  if (!target.enabled) return { action: 'skip', reason: `היעד "${target.name}" כבוי.` };
  if (variant && variant.approval !== 'approved') return { action: 'skip', reason: `הגרסה ${variant.label} לא אושרה.` };
  if (!variant && !post.base_text.trim() && !post.media.length) return { action: 'skip', reason: 'הפוסט ריק.' };

  /*
   * NOT BEFORE THIS INSTANT — carried rather than returned.
   *
   * There are now two gates that can say "you may prepare, but do not click
   * yet": the campaign's own interval, and the account-wide spacing rule at
   * the foot of this function. Each used to be free to `return {action:
   * 'publish', notBefore}` on its own, which means whichever ran first
   * silently decided, and the other's instant was thrown away — a campaign
   * set to ten minutes would have had its gap erased by an account gap of one.
   *
   * So each gate RAISES this and falls through, and the single return at the
   * end hands over the latest of them. The worker holds the final click until
   * it; see PREP_LEAD_MS.
   */
  let holdUntil: Date | null = null;
  const holdFor = (at: Date) => {
    if (!holdUntil || at > holdUntil) holdUntil = at;
  };

  // Campaign pause/stop: leave the row alone until the owner resumes.
  /*
   * HOISTED, because the repeat guard that uses it is two hundred lines below
   * and outside this block, and because its DEFAULT is the safe one: a row
   * with no campaign, or a campaign whose read failed, gets "never twice" —
   * the behaviour this engine has always had. A permission is not something to
   * fall back into.
   */
  let repeat: CampaignRepeat = DEFAULT_CAMPAIGN_REPEAT;
  const campaignId = item.campaign_id ?? post.campaign_id;
  if (campaignId) {
    /*
     * The five schedule columns come back with the status in the one read this
     * function already did. They may not exist — a database that has not run
     * social-latest.sql — so the select names them and the failure is handled
     * by falling back to the status alone rather than by refusing to publish.
     * An engine that stops working because a column is missing is a worse
     * outcome than an engine that ignores a window nobody has set yet.
     */
    let campaign: (Pick<Campaign, 'status'> & ScheduleFields & Pick<Campaign, 'repeat_enabled' | 'repeat_min_hours'>) | null = null;
    const full = await db
      .from('social_campaigns')
      /*
       * BOTH GAP COLUMNS, and leaving the seconds out of this list is the
       * exact shape of bug this product has shipped before: readSchedule()
       * falls back to the minutes when the seconds are absent, and a column
       * that is in the table but not in the SELECT is indistinguishable from
       * one that does not exist. The owner would pick thirty seconds, the
       * panel would show thirty seconds, and the engine deciding whether to
       * publish would quietly enforce sixty — with nothing anywhere saying so.
       */
      .select(
        'status, schedule_enabled, schedule_days, schedule_start, schedule_end, schedule_gap_minutes, schedule_gap_seconds, repeat_enabled, repeat_min_hours',
      )
      .eq('id', campaignId)
      .maybeSingle();
    if (full.error) {
      const { data } = await db.from('social_campaigns').select('status').eq('id', campaignId).maybeSingle();
      campaign = (data as Pick<Campaign, 'status'> | null) ?? null;
    } else {
      campaign = (full.data as (Pick<Campaign, 'status'> & ScheduleFields & Pick<Campaign, 'repeat_enabled' | 'repeat_min_hours'>) | null) ?? null;
    }
    if (campaign) repeat = readRepeat(campaign);
    if (campaign?.status === 'paused') {
      return { action: 'wait', until: new Date(now.getTime() + WAIT_MINUTES * 60_000).toISOString(), reason: 'הסבב מושהה.' };
    }
    if (campaign?.status === 'archived') return { action: 'skip', reason: 'הסבב נעצר.' };

    /*
     * ─── "תזמון פרסום": THE DAYS, THE HOURS AND THE INTERVAL ───────────────
     *
     * "המערכת רשאית לפרסם רק בימים שנבחרו, רק בין 08:00 ל-22:00, ובהפרש של 10
     *  דקות בין פרסום לפרסום."
     *
     * DEFER, NEVER SKIP, and this is the rule the whole feature rests on:
     * "אין לאפס את התור. אין להתחיל את הקמפיין מחדש. יש להמשיך מאותו מקום."
     * A row outside the window keeps its identity, its post, its group and its
     * place; only its instant moves, to the first moment the owner's own
     * settings allow. That is the same shape as the daily-quota branch below,
     * and for the same reason: a window is a RATE, not a verdict on a
     * particular publication.
     *
     * AND IT COSTS NOTHING WHEN IT IS OFF. readSchedule() reports
     * `enabled: false` for every campaign that predates this feature and for
     * every row on a database without the columns, and the branch is not
     * entered at all — no extra query, no change in behaviour.
     */
    const schedule = readSchedule(campaign);
    if (schedule.enabled) {
      /*
       * The campaign's OWN last publication, not the account's. limits.
       * minGapMinutes at the foot of this function is about the Facebook
       * account and looks at every campaign at once; this is about this round,
       * and the two are enforced together — a row waits for whichever is
       * later, which is what holdFor() above is for.
       */
      const { data: lastOwn } = await db
        .from('social_queue')
        .select('published_at')
        .eq('campaign_id', campaignId)
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastAt = lastOwn?.published_at ? new Date(lastOwn.published_at) : null;
      const allowed = nextPublishAt(schedule, now, lastAt);
      if (!allowed) {
        /*
         * No day is selected. Nothing can ever satisfy that, so the row is
         * held a day at a time rather than parked on a far-future instant the
         * owner would have to discover: he changes the setting, and the next
         * poll after that publishes.
         */
        return {
          action: 'defer',
          until: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
          reason: 'לא נבחר אף יום פרסום בתזמון של הקמפיין — הפרסום ממתין',
        };
      }
      const wait = allowed.getTime() - now.getTime();
      if (wait > PREP_LEAD_MS) {
        /*
         * WHICH of the two moved it, in the owner's own words. "נדחה" with no
         * reason is the line this product keeps having to explain; the window
         * and the interval fail in completely different ways and the fix for
         * each is a different control on the panel.
         */
        const byWindow = !isAllowedAt(schedule, now);
        return {
          action: 'defer',
          until: new Date(allowed.getTime() + DEFER_CUSHION_MS).toISOString(),
          reason: byWindow
            ? `מחוץ לשעות הפרסום של הקמפיין (${scheduleSummary(schedule)}) — הפרסום ימתין`
            /* gapLabel rather than a number and a unit: the gap can now be
               thirty seconds, and "נדחה כדי לשמור מרווח של 0.5 דק׳" is a
               sentence nobody should have to read. */
            : `נדחה כדי לשמור מרווח של ${gapLabel(schedule).replace('כל ', '')} בין הפרסומים של הקמפיין`,
        };
      }
      /* Close enough to start: prepare now, click at the instant itself. */
      if (wait > 0) holdFor(allowed);
    }
  }

  /*
   * A FULL DAILY QUOTA IS "NOT TODAY". IT WAS "NEVER", AND THAT WAS WRONG.
   *
   * All three ceilings below used to return {action:'skip'}, which finishes
   * the row: the publication is destroyed, not postponed. Seen on the owner's
   * machine as six identical lines in the activity log inside sixteen minutes
   * — six publications of a 28-group round deleted, one per poll, while the
   * screen said the system was running.
   *
   * It also contradicted the product's own promise: the scheduling screen has
   * always said "מה שלא נכנס היום ממשיך מחר". It did not.
   *
   * A cap the owner sets is a rate, not a verdict on a particular post. So a
   * row that meets one now waits for the day that has room. Nothing else about
   * it changes, it keeps its place, and the ceiling still does its job — it
   * just stops eating the queue to do it.
   */
  const dayStart = startOfZonedDay(now).toISOString();
  const tomorrow = startOfNextZonedDay(now);

  const todayAll = await countPublished(db, (q) => q.gte('published_at', dayStart));
  if (todayAll >= limits.maxPerDay)
    return { action: 'defer', until: tomorrow, reason: `מכסת הפרסומים להיום (${limits.maxPerDay}) מלאה — הפרסום ימתין למחר` };

  const todayTarget = await countPublished(db, (q) => q.eq('target_id', target.id).gte('published_at', dayStart));
  if (todayTarget >= limits.maxPerTargetPerDay)
    return {
      action: 'defer',
      until: tomorrow,
      reason: `"${target.name}" קיבלה היום את המכסה שלה (${limits.maxPerTargetPerDay}) — הפרסום ימתין למחר`,
    };

  if (campaignId && ctx.browser?.maxPerCampaignPerDay) {
    const todayCampaign = await countPublished(db, (q) => q.eq('campaign_id', campaignId).gte('published_at', dayStart));
    if (todayCampaign >= ctx.browser.maxPerCampaignPerDay)
      return {
        action: 'defer',
        until: tomorrow,
        reason: `הסבב מילא את המכסה היומית שלו (${ctx.browser.maxPerCampaignPerDay}) — הפרסום ימתין למחר`,
      };
  }

  /*
   * Same post already went to this target (any variant) → never twice, unless
   * this round is one the owner has explicitly set to repeat.
   *
   * THE "EVER" RULE IS THE DEFAULT AND STAYS THE DEFAULT. Group publishing runs
   * through the owner's own browser session, so repeating identical content to
   * one group risks THEIR account, not a service's. `!== false` rather than a
   * truthy test, so a settings row written before that key existed keeps the
   * old behaviour instead of silently losing it.
   *
   * CHZARA GIVES THE RULE A CLOCK; IT DOES NOT REMOVE IT.
   *
   * "אמור לצאת כל יום מ-8 בבוקר עד 22 בלילה." A round set to repeat asks for
   * exactly what this line refuses, so the refusal becomes "not again within
   * repeat_min_hours" instead of "not again". That is weaker, and it is still a
   * rule with real work to do: a plan that ran twice, a retry after a failure,
   * two schedules pointed at one post — all of those double-post without it,
   * and all of them have happened.
   *
   * THE RECENCY IS MEASURED, NOT ASSUMED. The count becomes a read of the most
   * recent publication's instant, because "has it ever" and "how long ago" are
   * different questions and only the second one can answer this.
   */
  if (limits.blockRepeatToSameTarget !== false) {
    const { data: previous } = await db
      .from('social_queue')
      .select('published_at')
      .eq('status', 'published')
      .eq('post_id', post.id)
      .eq('target_id', target.id)
      .neq('id', item.id)
      .order('published_at', { ascending: false })
      .limit(1);
    const last = previous?.[0]?.published_at ?? null;
    if (previous && previous.length > 0) {
      if (!repeat.enabled) return { action: 'skip', reason: `הפוסט הזה כבר פורסם ל-"${target.name}".` };
      /*
       * A published row with no instant cannot be dated, and an undatable
       * publication must count as "just now" rather than as "long ago" — the
       * safe reading of a missing value is the one that holds the post back.
       */
      const since = last ? now.getTime() - new Date(last).getTime() : 0;
      const needed = repeat.minHours * 3_600_000;
      if (since < needed) {
        const hours = Math.max(1, Math.ceil((needed - since) / 3_600_000));
        return {
          action: 'defer',
          until: new Date(now.getTime() + needed - since + DEFER_CUSHION_MS).toISOString(),
          /*
           * DEFERRED, NOT SKIPPED. The round repeats, so this group's turn is
           * coming — dropping the row would quietly shrink every round after
           * the first, and the owner would see a campaign that reached 219
           * groups on Monday and 180 on Tuesday with no reason on any screen.
           */
          reason: `פורסם לקבוצה הזו לאחרונה — החזרה הבאה בעוד כ-${hours} שעות.`,
        };
      }
    }
  }

  /*
   * Same content hash to this target inside the dedupe window (catches copies).
   *
   * AND IT IS THE SAME WINDOW THE REPEAT USES, on a round that repeats.
   *
   * This guard is per-target too — the hash is built from the target, the text
   * and the media — so on a repeating round it asks the question above a second
   * time, with a window of days instead of hours. Left alone it would refuse
   * every repeat for a week and the switch would appear to do nothing at all:
   * the owner turns on "חזרה יומית", tomorrow's round runs, and every single
   * row skips with a sentence about content he deliberately chose to repeat.
   *
   * So on a repeating round the window IS the repeat interval. That is not a
   * loosening beyond what the switch already granted — the rule above has
   * already allowed exactly this publication at exactly this distance — and
   * everything the hash catches that the rule above does not, namely the SAME
   * TEXT sent under a different post, is still caught, just inside hours rather
   * than days.
   */
  if (item.dedupe_hash) {
    const windowMs = repeat.enabled ? repeat.minHours * 3_600_000 : limits.dedupeDays * 86_400_000;
    const since = new Date(now.getTime() - windowMs).toISOString();
    const dupes = await countPublished(db, (q) => q.eq('dedupe_hash', item.dedupe_hash).neq('id', item.id).gte('published_at', since));
    if (dupes > 0) {
      return repeat.enabled
        ? {
            /* Deferred for the same reason the repeat guard defers: this
               group's turn is coming, and a skip would shrink the round. */
            action: 'defer',
            until: new Date(now.getTime() + windowMs + DEFER_CUSHION_MS).toISOString(),
            reason: `אותו תוכן כבר פורסם ליעד הזה לאחרונה — החזרה הבאה בעוד כ-${repeat.minHours} שעות.`,
          }
        : { action: 'skip', reason: `אותו תוכן כבר פורסם ליעד הזה ב-${limits.dedupeDays} הימים האחרונים.` };
    }
  }

  // Minimum spacing between any two publications (groups get extra spacing).
  const { data: last } = await db
    .from('social_queue')
    .select('published_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.published_at) {
    const extra = target.channel === 'facebook_group' ? (ctx.browser?.groupMinGapMinutes ?? 0) : 0;
    const gapMs = Math.max(0, (limits.minGapMinutes ?? 0) + extra) * 60_000;
    const sinceLast = now.getTime() - new Date(last.published_at).getTime();
    if (sinceLast < gapMs) {
      /*
       * The belt, and it is only a belt now.
       *
       * Waiting for the gap no longer spends an attempt — both workers hand
       * it back, exactly as they already did for a parked row — so a row can
       * queue behind a hundred others without being thrown away for its
       * patience. That was the previous behaviour and it was silently
       * destroying publications: with the gap set to a minute and a queue
       * denser than a minute, a row burned forty deferrals in under an hour
       * and became a permanent "דולג" whose stated reason described nothing
       * that had gone wrong. What can still reach this line is a row that is
       * genuinely failing on every claim, which is worth stopping.
       */
      if (item.attempts > MAX_DEFERRALS) return { action: 'skip', reason: 'הפרסום נכשל שוב ושוב ולכן הופסק.' };
      /*
       * Close enough to start: let it through with the instant attached. The
       * caller prepares the post and holds the click — see PREP_LEAD_MS. This
       * is the branch that makes a one-minute gap mean a publication a
       * minute rather than a publication every minute-and-a-publication.
       */
      const wait = gapMs - sinceLast;
      if (wait <= PREP_LEAD_MS) {
        /* Raised rather than returned: the campaign's own interval may already
           have asked for a LATER instant, and the one return below hands over
           whichever of the two is further out. */
        holdFor(new Date(new Date(last.published_at).getTime() + gapMs));
      } else {
        const until = new Date(new Date(last.published_at).getTime() + gapMs + DEFER_CUSHION_MS).toISOString();
        return { action: 'defer', until, reason: `נדחה כדי לשמור מרווח של ${limits.minGapMinutes + extra} דק׳ בין פרסומים` };
      }
    }
  }

  return holdUntil ? { action: 'publish', notBefore: (holdUntil as Date).toISOString() } : { action: 'publish' };
}
