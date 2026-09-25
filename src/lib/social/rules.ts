import type { SupabaseClient } from '@supabase/supabase-js';
import { startOfZonedDay } from './time';
import type { BrowserSettings, LimitsSettings, Post, QueueItem, SocialTarget, Variant } from './types';

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

  // Campaign pause/stop: leave the row alone until the owner resumes.
  const campaignId = item.campaign_id ?? post.campaign_id;
  if (campaignId) {
    const { data: campaign } = await db.from('social_campaigns').select('status').eq('id', campaignId).maybeSingle();
    if (campaign?.status === 'paused') {
      return { action: 'wait', until: new Date(now.getTime() + WAIT_MINUTES * 60_000).toISOString(), reason: 'הסבב מושהה.' };
    }
    if (campaign?.status === 'archived') return { action: 'skip', reason: 'הסבב נעצר.' };
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
   * Same post already went to this target (any variant) → never twice.
   *
   * There is no time window here on purpose: this is "ever", not "recently".
   * It is now the owner's switch rather than a law, because an owner who
   * republishes the same seasonal offer every month had no way to say so and
   * simply watched every row skip. Turning it off leaves dedupeDays below as
   * the guard, which IS time-boxed. The default stays on: group publishing
   * runs through the owner's own browser session, so repeating identical
   * content to one group risks THEIR account, not a service's.
   *
   * `!== false` rather than a truthy test, so a settings row written before
   * this key existed keeps the old behaviour instead of silently losing it.
   */
  if (limits.blockRepeatToSameTarget !== false) {
    const { count: samePost } = await db
      .from('social_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('post_id', post.id)
      .eq('target_id', target.id)
      .neq('id', item.id);
    if ((samePost ?? 0) > 0) return { action: 'skip', reason: `הפוסט הזה כבר פורסם ל-"${target.name}".` };
  }

  // Same content hash to this target inside the dedupe window (catches copies).
  if (item.dedupe_hash) {
    const since = new Date(now.getTime() - limits.dedupeDays * 86_400_000).toISOString();
    const dupes = await countPublished(db, (q) => q.eq('dedupe_hash', item.dedupe_hash).neq('id', item.id).gte('published_at', since));
    if (dupes > 0) return { action: 'skip', reason: `אותו תוכן כבר פורסם ליעד הזה ב-${limits.dedupeDays} הימים האחרונים.` };
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
    const gapMs = (limits.minGapMinutes + extra) * 60_000;
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
      if (wait <= PREP_LEAD_MS) return { action: 'publish', notBefore: new Date(new Date(last.published_at).getTime() + gapMs).toISOString() };
      const until = new Date(new Date(last.published_at).getTime() + gapMs + DEFER_CUSHION_MS).toISOString();
      return { action: 'defer', until, reason: `נדחה כדי לשמור מרווח של ${limits.minGapMinutes + extra} דק׳ בין פרסומים` };
    }
  }

  return { action: 'publish' };
}
