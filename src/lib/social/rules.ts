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
 *   wait     — leave untouched (campaign paused / worker not ready)
 *
 * No network calls to Meta here; purely queue bookkeeping in Supabase.
 */

export type RuleDecision =
  | { action: 'publish' }
  | { action: 'skip'; reason: string }
  | { action: 'defer'; until: string; reason: string }
  | { action: 'wait'; reason: string };

export interface RuleContext {
  item: QueueItem;
  target: SocialTarget | null;
  post: Post | null;
  variant: Variant | null;
  limits: LimitsSettings;
  browser?: BrowserSettings;
  now?: Date;
}

const MAX_DEFERRALS = 12;

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
    if (campaign?.status === 'paused') return { action: 'wait', reason: 'הקמפיין מושהה.' };
    if (campaign?.status === 'archived') return { action: 'skip', reason: 'הקמפיין נעצר.' };
  }

  const dayStart = startOfZonedDay(now).toISOString();
  const todayAll = await countPublished(db, (q) => q.gte('published_at', dayStart));
  if (todayAll >= limits.maxPerDay) return { action: 'skip', reason: `הגעת למכסה היומית (${limits.maxPerDay} פרסומים).` };

  const todayTarget = await countPublished(db, (q) => q.eq('target_id', target.id).gte('published_at', dayStart));
  if (todayTarget >= limits.maxPerTargetPerDay)
    return { action: 'skip', reason: `הגעת למכסה היומית ליעד "${target.name}" (${limits.maxPerTargetPerDay}).` };

  if (campaignId && ctx.browser?.maxPerCampaignPerDay) {
    const todayCampaign = await countPublished(db, (q) => q.eq('campaign_id', campaignId).gte('published_at', dayStart));
    if (todayCampaign >= ctx.browser.maxPerCampaignPerDay)
      return { action: 'skip', reason: `הגעת למכסה היומית של הקמפיין (${ctx.browser.maxPerCampaignPerDay}).` };
  }

  // Same post already went to this target (any variant) → never twice.
  const { count: samePost } = await db
    .from('social_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('post_id', post.id)
    .eq('target_id', target.id)
    .neq('id', item.id);
  if ((samePost ?? 0) > 0) return { action: 'skip', reason: `הפוסט הזה כבר פורסם ל-"${target.name}".` };

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
      if (item.attempts > MAX_DEFERRALS) return { action: 'skip', reason: 'נדחה יותר מדי פעמים בגלל מרווח הזמן בין פרסומים.' };
      const until = new Date(new Date(last.published_at).getTime() + gapMs + 30_000).toISOString();
      return { action: 'defer', until, reason: `נדחה כדי לשמור מרווח של ${limits.minGapMinutes + extra} דק׳ בין פרסומים` };
    }
  }

  return { action: 'publish' };
}
