'use client';

import { supabase } from '@/lib/supabase';
import {
  MAX_GAP_MINUTES,
  MIN_GAP_MINUTES,
  applyGapSettings,
  callSocialApi,
  createSchedule,
  effectiveGroupGap,
  getBrowserSettings,
  getCampaign,
  getLimits,
  getPost,
  hasPendingQueue,
  listPosts,
  listTargets,
  listVariants,
  logClientActivity,
  postQueue,
  saveCampaign,
  savePost,
  countPublishedSince,
  type GapSplit,
  type QueueRow,
  type ScheduleInput,
} from './client';
import { friendlyError } from './errors';
import { ALL_QUEUE_STATUSES, OPEN_STATUSES, isOpen } from './status';
import { dripSlots, slotsFor } from './slots';
import { startOfZonedDay, zonedDateISO, zonedToUtc } from './time';
import {
  TIMEZONE,
  type BrowserSettings,
  type LimitsSettings,
  type Post,
  type QueueItem,
  type SocialTarget,
} from './types';

/**
 * The content library: a LAYER over social_posts, not a second post model.
 *
 * Everything the owner sees on /social/library is one of three things:
 *   • the post itself — social_posts, the same row /social/posts/[id] edits;
 *   • its category — a new column on that row (supabase/social-schema-v8.sql);
 *   • how often it has gone out — AGGREGATED from social_queue on every read.
 *
 * The third one is the rule that matters. A "times published" counter on
 * social_posts would be wrong the first time a row is cancelled, retried
 * (client.ts retryQueueItem) or swept by a stopped campaign (plan.ts
 * stoppedCampaigns) — and wrong quietly, which is the worst kind. The rest of
 * this module already derives: campaignProgress(), hasPendingQueue(),
 * liveQueuePlan(). So does this.
 *
 * Publishing is likewise not reimplemented here. quickPublish() walks the exact
 * path PostEditor.onSchedule() walks — ready → already-in-flight guard → gap
 * settings → createSchedule() → /api/social/run — because a second publish path
 * is a second set of bugs, and this one is the one that is known to work.
 */

function db() {
  if (!supabase) {
    throw new Error('Supabase לא מוגדר — חסרים NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function unwrap<T>(res: { data: any; error: any }): T {
  if (res.error) throw friendlyError(res.error);
  return res.data as T;
}

/**
 * "The owner has not run supabase/social-schema-v8.sql yet."
 *
 * errors.ts:38-39 already turns this into a sentence that tells them to run the
 * update, and for an ACTION that is exactly right. For a page LOAD it is not:
 * the library still works without categories, so a missing table degrades to an
 * empty category list rather than taking the whole screen down. Recognised by
 * code first — 42P01 undefined_table, 42703 undefined_column, and PostgREST's
 * own schema-cache codes — because the message is English and never shown.
 */
const MISSING_SCHEMA_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);

function isMissingSchema(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code && MISSING_SCHEMA_CODES.has(e.code)) return true;
  return /(relation|table|column).*does not exist|schema cache/i.test(e?.message ?? '');
}

/* ------------------------------------------------------------- the shapes */

export interface ContentCategory {
  id: string;
  name: string;
  sort: number;
  /** Real posts in this category, counted from the database. Never estimated. */
  postCount: number;
}

export interface LibraryPost {
  post: Post;
  categoryId: string | null;
  /** social_queue rows with status 'published' for this post — PUBLICATIONS, not groups. */
  publishCount: number;
  lastPublishedAt: string | null;
  /** Still on its way out, so a card can say the post is already going. */
  pendingCount: number;
  /**
   * Additive to the agreed contract, and the screen needs it: rules.ts:77-84
   * refuses to send one post to the same group twice, so a "publish again" sheet
   * that cannot say which groups already have it walks the owner into a queue
   * that will be skipped. Distinct groups, published rows only —
   * publishedTargetIds.length and publishCount are DIFFERENT numbers and must be
   * labelled differently ("פורסם 12 פעמים ב-9 קבוצות").
   */
  publishedTargetIds: string[];
  /**
   * Finished without publishing. A post can be "0 published, 0 pending" and
   * still have 84 rows behind it; without these the card shows nothing at all
   * where the run card shows a full run.
   */
  skippedCount: number;
  failedCount: number;
}

export interface LibraryFilter {
  q?: string;
  /** undefined = every category; null = uncategorised only; an id = that one. */
  categoryId?: string | null;
  media?: 'image' | 'video' | 'text';
  published?: 'yes' | 'no';
  sort?: 'newest' | 'oldest' | 'most' | 'recent';
}

export interface SchedulePreviewRow {
  targetId: string;
  name: string;
  at: string;
}

export interface QuickPublishPlan {
  rows: SchedulePreviewRow[];
  /** The FIRST REAL SLOT, not the time that was asked for — see the floor below. */
  startAt: string;
  /** The last slot, or null when there is only one publication. */
  endAt: string | null;
  gapMinutes: number;
  /** How many of these exceed limits.maxPerDay TODAY, counting what already went out. 0 if none. */
  overDailyCap: number;

  /* --- additive, so the sheet can tell the whole truth in words --- */
  /** The same arithmetic across every day the plan spans, not only today. */
  overCapTotal: number;
  maxPerDay: number;
  /** Publications that already happened today — read, not assumed. */
  publishedToday: number;
  /** Local days the plan spans. */
  days: number;
  /** 'now' = one target, immediately. 'drip' = one target every gapMinutes. */
  mode: 'now' | 'drip';
  /**
   * True when the first slot had to be pushed to now + gap by the running floor
   * at slots.ts:45. Tapping "publish now" and waiting 12 minutes looks broken
   * unless the sheet says this out loud.
   */
  firstSlotDeferred: boolean;
  /** What rules.ts demands between two GROUP publications right now. */
  effectiveGapMinutes: number;
  /**
   * How many of today's publications exceed the owner's PER-CAMPAIGN daily
   * ceiling (browser.maxPerCampaignPerDay), when this post belongs to a
   * campaign. rules.ts checks this ceiling separately from maxPerDay and skips
   * over it the same way, so it needs its own sentence — the global cap can be
   * comfortable while this one is not. 0 when the post has no campaign or the
   * ceiling is off.
   */
  overCampaignCapToday: number;
  /** The per-campaign ceiling itself, so the sentence can name the owner's number. */
  maxPerCampaignPerDay: number;
}

/* ------------------------------------------------------------ usage stats */

export interface PostUsage {
  /** Times this post actually went out (rows, i.e. publications). */
  published: number;
  lastPublishedAt: string | null;
  /** Still waiting to go out. */
  pending: number;
  /** Which groups already have it (deduped, published rows only). */
  targetIds: string[];
  /**
   * Finished without publishing. The library used not to fetch these rows at
   * all, so a post whose every attempt was skipped read "טרם פורסם · 0 בתור"
   * — invisible — while the run card called the same rows "הושלמו". Counted
   * here so the two screens describe the same rows the same way.
   */
  skipped: number;
  failed: number;
}

/** Mirrors CAMPAIGN_ROLLUP_LIMIT (client.ts) — one screen never pulls an unbounded table. */
export const LIBRARY_USAGE_LIMIT = 5000;

/**
 * Anything that has not happened yet but is meant to — from the single
 * classification, so "ממתין" on a content card means exactly what "ממתינים"
 * means on the run card and on the dashboard.
 */
const USAGE_PENDING: QueueItem['status'][] = OPEN_STATUSES;

export interface LibraryUsage {
  byPost: Record<string, PostUsage>;
  /**
   * The read hit LIBRARY_USAGE_LIMIT, so the counts are of the most recent
   * LIBRARY_USAGE_LIMIT rows and not of everything. respaceQueue reports its own
   * truncation in words (client.ts) and so must the library: a count presented as
   * a total when it is a ceiling is a made-up number.
   */
  truncated: boolean;
}

/**
 * Every post's usage in ONE round trip.
 *
 * Four narrow columns, no joins, grouped in JS — the same technique
 * campaignStates() uses, so the library reads the queue the way the rest of the
 * module does. One query per post would be hundreds of requests on a phone.
 *
 * Group NAMES for "which groups" come from the listTargets() the library already
 * loads; joining social_targets here would multiply the payload for nothing.
 */
export async function postUsage(): Promise<LibraryUsage> {
  const rows = unwrap<{ post_id: string; status: QueueItem['status']; published_at: string | null; target_id: string }[]>(
    await db()
      .from('social_queue')
      .select('post_id, status, published_at, target_id')
      .in('status', ALL_QUEUE_STATUSES)
      // published_at is null on every row that has not published yet (the worker
      // writes it on success), so nulls go last rather than crowding the top.
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(LIBRARY_USAGE_LIMIT),
  );

  const byPost: Record<string, PostUsage> = {};
  for (const r of rows) {
    const u = (byPost[r.post_id] ??= { published: 0, lastPublishedAt: null, pending: 0, targetIds: [], skipped: 0, failed: 0 });
    if (r.status === 'published') {
      u.published += 1;
      if (r.published_at && (!u.lastPublishedAt || r.published_at > u.lastPublishedAt)) u.lastPublishedAt = r.published_at;
      if (!u.targetIds.includes(r.target_id)) u.targetIds.push(r.target_id);
    } else if (r.status === 'skipped') {
      u.skipped += 1;
    } else if (r.status === 'failed') {
      u.failed += 1;
    } else if (isOpen(r.status)) {
      u.pending += 1;
    }
  }
  return { byPost, truncated: rows.length >= LIBRARY_USAGE_LIMIT };
}

/* ---------------------------------------------------------------- library */

/** social_posts carries category_id from v8; types.ts's Post predates it and is not ours to edit. */
type PostRow = Post & { category_id?: string | null };

function toLibraryPost(post: Post, usage: PostUsage | undefined): LibraryPost {
  return {
    post,
    categoryId: (post as PostRow).category_id ?? null,
    publishCount: usage?.published ?? 0,
    lastPublishedAt: usage?.lastPublishedAt ?? null,
    pendingCount: usage?.pending ?? 0,
    skippedCount: usage?.skipped ?? 0,
    failedCount: usage?.failed ?? 0,
    publishedTargetIds: usage?.targetIds ?? [],
  };
}

/**
 * The whole library, with its real numbers, in TWO round trips — the posts and
 * one aggregate over the queue — however many posts there are.
 *
 * listPosts() is reused rather than re-queried, which also settles the archive
 * question: it already excludes archived posts (client.ts), so the library shows
 * exactly what the editor's list shows and there is no archive filter that could
 * only ever come back empty.
 *
 * `filter` is applied here for callers that want one call; the screen loads once
 * and re-filters locally with filterLibrary() below, which is how every sibling
 * screen in this module works.
 */
export async function listLibrary(filter?: LibraryFilter): Promise<LibraryPost[]> {
  return (await listLibraryWithStats(filter)).items;
}

/**
 * The same read, plus whether the counts are complete. Additive to the agreed
 * contract for the same reason LiveQueuePlan.truncated is: without it the screen
 * presents a ceiling as a total.
 */
export async function listLibraryWithStats(filter?: LibraryFilter): Promise<{ items: LibraryPost[]; truncated: boolean }> {
  const [posts, usage] = await Promise.all([listPosts(), postUsage()]);
  const items = posts.map((p) => toLibraryPost(p, usage.byPost[p.id]));
  return { items: filter ? filterLibrary(items, filter) : items, truncated: usage.truncated };
}

/**
 * Pure: search, filter and sort an already-loaded library. Exported so the grid
 * can run it inside a useMemo on every keystroke without touching the network,
 * exactly as /social/posts and /social/groups filter client-side today.
 */
export function filterLibrary(items: LibraryPost[], filter: LibraryFilter): LibraryPost[] {
  const q = filter.q?.trim().toLowerCase() ?? '';
  const out = items.filter((item) => {
    const { post } = item;
    if (q && !`${post.title} ${post.base_text}`.toLowerCase().includes(q)) return false;
    if (filter.categoryId !== undefined && item.categoryId !== filter.categoryId) return false;
    if (filter.media === 'image' && !post.media.some((m) => m.kind === 'image')) return false;
    if (filter.media === 'video' && !post.media.some((m) => m.kind === 'video')) return false;
    if (filter.media === 'text' && post.media.length > 0) return false;
    if (filter.published === 'yes' && item.publishCount === 0) return false;
    if (filter.published === 'no' && item.publishCount > 0) return false;
    return true;
  });

  const at = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
  switch (filter.sort) {
    case 'oldest':
      return out.sort((a, b) => at(a.post.updated_at) - at(b.post.updated_at));
    case 'most':
      return out.sort((a, b) => b.publishCount - a.publishCount || at(b.post.updated_at) - at(a.post.updated_at));
    case 'recent':
      // Never published sorts last rather than first — 0 would beat every date.
      return out.sort((a, b) => at(b.lastPublishedAt) - at(a.lastPublishedAt) || at(b.post.updated_at) - at(a.post.updated_at));
    default:
      // 'newest' is listPosts()'s own order (updated_at desc); stated, not assumed.
      return out.sort((a, b) => at(b.post.updated_at) - at(a.post.updated_at));
  }
}

/* ------------------------------------------------------------- categories */

/**
 * The owner's categories with their real post counts, in two narrow reads.
 *
 * Counted, not stored: a count column on the category would drift the first time
 * a post is archived or moved. The count excludes archived posts so it matches
 * what the grid actually shows.
 */
export async function listCategories(): Promise<ContentCategory[]> {
  return (await listCategoriesWithState()).items;
}

/**
 * The same read, plus WHY the list is empty.
 *
 * "No categories" and "the categories table does not exist yet" look identical
 * on screen and are completely different problems: one is a blank slate, the
 * other is a migration the owner has not run. Returning the distinction lets the
 * library say which one it is, naming the file — the generic classifier in
 * errors.ts can only say "run the database update", which does not tell a
 * non-technical owner WHICH file or where.
 */
export async function listCategoriesWithState(): Promise<{ items: ContentCategory[]; schemaMissing: boolean }> {
  const [cats, posts] = await Promise.all([
    db().from('social_content_categories').select('id, name, sort').order('sort').order('name'),
    db().from('social_posts').select('category_id').neq('status', 'archived'),
  ]);

  // v8 not run yet: no categories exist, which is the truth. Degrading this way
  // keeps the grid, the search and quick publish working.
  if (cats.error) {
    if (isMissingSchema(cats.error)) return { items: [], schemaMissing: true };
    throw friendlyError(cats.error);
  }
  if (posts.error && !isMissingSchema(posts.error)) throw friendlyError(posts.error);

  const counts = new Map<string, number>();
  for (const row of (posts.data ?? []) as { category_id: string | null }[]) {
    if (!row.category_id) continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }
  return {
    items: ((cats.data ?? []) as { id: string; name: string; sort: number }[]).map((c) => ({
      ...c,
      postCount: counts.get(c.id) ?? 0,
    })),
    // The table exists; if the COLUMN does not, the counts are all zero and the
    // owner still needs to run v8 before a category can be assigned.
    schemaMissing: Boolean(posts.error),
  };
}

/** Postgres 23505 — here it can only be the lower(name) unique index. */
function isDuplicateName(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505';
}

export async function saveCategory(input: { id?: string; name: string }): Promise<ContentCategory> {
  const name = input.name.trim();
  if (!name) throw new Error('תנו שם לקטגוריה.');

  if (input.id) {
    const res = await db().from('social_content_categories').update({ name }).eq('id', input.id).select('id, name, sort').single();
    if (res.error) {
      if (isDuplicateName(res.error)) throw new Error('כבר קיימת קטגוריה בשם הזה.');
      throw friendlyError(res.error);
    }
    const row = res.data as { id: string; name: string; sort: number };
    const { count } = await db().from('social_posts').select('id', { count: 'exact', head: true }).eq('category_id', row.id).neq('status', 'archived');
    return { ...row, postCount: count ?? 0 };
  }

  // New categories go to the end of the chip row, so the order on screen is the
  // order they were created in until the owner changes it.
  const last = unwrap<{ sort: number }[]>(
    await db().from('social_content_categories').select('sort').order('sort', { ascending: false }).limit(1),
  );
  const res = await db()
    .from('social_content_categories')
    .insert({ name, sort: (last[0]?.sort ?? 0) + 1 })
    .select('id, name, sort')
    .single();
  if (res.error) {
    if (isDuplicateName(res.error)) throw new Error('כבר קיימת קטגוריה בשם הזה.');
    throw friendlyError(res.error);
  }
  return { ...(res.data as { id: string; name: string; sort: number }), postCount: 0 };
}

/**
 * Deletes the category only. social_posts.category_id is declared
 * `on delete set null` (v8), so every post in it falls back to uncategorised and
 * not one of them is touched otherwise. Nothing here deletes a post, ever.
 */
export async function deleteCategory(id: string): Promise<void> {
  unwrap(await db().from('social_content_categories').delete().eq('id', id));
}

/** Moves posts between categories; `null` means uncategorised. One write. */
export async function setPostCategory(postIds: string[], categoryId: string | null): Promise<void> {
  const ids = [...new Set(postIds.filter(Boolean))];
  if (!ids.length) return;
  unwrap(await db().from('social_posts').update({ category_id: categoryId }).in('id', ids));
}

/* ---------------------------------------------------------------- history */

/** Where this post has been, newest first — the card's "פורסם ב…" list. */
export async function postHistory(postId: string, limit = 100): Promise<QueueRow[]> {
  return postQueue(postId, limit);
}

/* --------------------------------------------------------- quick publish */

export interface QuickPublishInput {
  targetIds: string[];
  /** ISO. Omitted, unparseable, or mode 'now' — all mean "from this moment". */
  startAt?: string;
  /** Minutes between two publications. Omitted = whatever the settings demand today. */
  gapMinutes?: number;
  mode?: 'now' | 'schedule';
}

/**
 * Everything the sheet needs to draw a plan, read ONCE.
 *
 * The same shape QueueTunerSheet uses: one snapshot, then recompute locally on
 * every keystroke. Three reads per stepper tap would be three reads per tap.
 */
export interface QuickPublishContext {
  targets: SocialTarget[];
  limits: LimitsSettings;
  browser: BrowserSettings;
  /** Publications that already went out today, local time. Read, never assumed. */
  publishedToday: number;
  /** limits.minGapMinutes + browser.groupMinGapMinutes — what rules.ts demands now. */
  effectiveGapMinutes: number;
  /** The campaign this post belongs to, if any — the per-campaign ceiling applies only then. */
  campaignId: string | null;
  /** Publications of that campaign that already went out today. Read, never assumed. */
  campaignPublishedToday: number;
}

/**
 * One snapshot for the whole sheet. `campaignId` is the post's own campaign:
 * rules.ts applies browser.maxPerCampaignPerDay only to rows that carry one, so
 * without it the preview cannot say that the ceiling is about to eat half the
 * launch.
 */
export async function quickPublishContext(campaignId?: string | null): Promise<QuickPublishContext> {
  const dayStart = startOfZonedDay(new Date()).toISOString();
  const [targets, limits, browser] = await Promise.all([listTargets(), getLimits(), getBrowserSettings()]);
  const [publishedToday, campaignPublishedToday] = await Promise.all([
    countPublishedSince(dayStart),
    campaignId ? countCampaignPublishedSince(campaignId, dayStart) : Promise.resolve(0),
  ]);
  return {
    targets,
    limits,
    browser,
    publishedToday,
    effectiveGapMinutes: effectiveGroupGap(limits, browser),
    campaignId: campaignId ?? null,
    campaignPublishedToday,
  };
}

/** One head count — the campaign's own publications since `sinceISO`. */
async function countCampaignPublishedSince(campaignId: string, sinceISO: string): Promise<number> {
  const res = await db()
    .from('social_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('campaign_id', campaignId)
    .gte('published_at', sinceISO);
  if (res.error) throw friendlyError(res.error);
  return res.count ?? 0;
}

/**
 * ONE draft, two consumers.
 *
 * The preview and the write must not be two implementations of "every N
 * minutes". If they can disagree, the preview is a lie with a countdown on it —
 * so both are derived from this object: slotsForDraft() feeds the preview and
 * scheduleInputFor() feeds createSchedule(), and every field either reads is a
 * field of this draft. It is deliberately the same shape SchedulePicker's
 * ScheduleDraft resolves to in its drip branch, so the planner materialises
 * exactly what was shown (plan.ts planDrip calls the very same dripSlots).
 */
interface QuickPublishDraft {
  /** 'now' = a single target, immediately. 'drip' = one target every gapMinutes. */
  mode: 'now' | 'drip';
  /** ISO instant the first publication is anchored to. */
  startAt: string;
  gapMinutes: number;
  targetIds: string[];
  /** Local HH:MM. The daily window publications are allowed inside. */
  windowStart: string;
  windowEnd: string;
  /** 0 = unlimited inside the window (slots.ts:20). */
  perDay: number;
}

/** Local HH:MM of an instant, by the same arithmetic slots.ts:29-30 uses. */
function localHm(at: Date): string {
  const midnight = zonedToUtc(zonedDateISO(at, TIMEZONE), '00:00', TIMEZONE);
  const minutes = Math.min(1439, Math.max(0, Math.round((at.getTime() - midnight.getTime()) / 60_000)));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function draftFor(input: QuickPublishInput, ctx: QuickPublishContext, now: Date): QuickPublishDraft {
  // Targets that no longer exist are dropped rather than scheduled: the planner
  // would create rows for them and rules.ts would skip every one with
  // "היעד נמחק." — a queue full of publications that were never going to happen.
  const known = new Set(ctx.targets.map((t) => t.id));
  const targetIds = [...new Set(input.targetIds.filter((id) => known.has(id)))];

  const startMs = input.mode === 'now' || !input.startAt ? now.getTime() : new Date(input.startAt).getTime();
  const startAt = new Date(Number.isFinite(startMs) ? startMs : now.getTime());
  // Clamped to the same bounds applyGapSettings() enforces, so a preview can
  // never show a plan the write would then refuse.
  const gapMinutes = Math.min(
    MAX_GAP_MINUTES,
    Math.max(MIN_GAP_MINUTES, Math.round(input.gapMinutes ?? ctx.effectiveGapMinutes)),
  );

  // One target and "now" is the one case that must not be a drip: dripSlots'
  // running floor (slots.ts:45) puts the first slot at now + gap, so a single
  // group would sit for twelve minutes after the owner tapped "פרסם עכשיו" and
  // report itself stuck. mode 'now' publishes at run_at, which is what was asked.
  // Everything else is a drip, because only drip gives each target its own
  // instant — slotsFor() fires every target simultaneously and cannot stagger.
  const mode: QuickPublishDraft['mode'] = input.mode === 'now' && targetIds.length <= 1 ? 'now' : 'drip';

  return {
    mode,
    startAt: startAt.toISOString(),
    gapMinutes,
    targetIds,
    // The window is derived from the start time rather than fixed at 09:00–20:00:
    // quick publish has no window control, and a hidden 09:00–20:00 would silently
    // roll an evening publish to tomorrow morning with nothing on screen to
    // explain it. Starting at the chosen time and running to the end of the local
    // day means the plan does what it looks like it does; anything that does not
    // fit today resumes tomorrow at the same hour.
    windowStart: localHm(startAt),
    windowEnd: '23:59',
    perDay: 0,
  };
}

/** The instants, from the planner's own functions. Never hand-written. */
function slotsForDraft(draft: QuickPublishDraft, now: Date): Date[] {
  if (draft.mode === 'now') {
    return slotsFor(
      { mode: 'now', timezone: TIMEZONE, run_at: draft.startAt, weekly: {}, interval_days: null, interval_time: null },
      new Date(now.getTime() - 60_000),
      new Date(now.getTime() + 366 * 86_400_000),
    );
  }
  return dripSlots(
    {
      timezone: TIMEZONE,
      run_at: draft.startAt,
      drip_per_day: draft.perDay,
      drip_gap_minutes: draft.gapMinutes,
      drip_window_start: draft.windowStart,
      drip_window_end: draft.windowEnd,
      target_ids: draft.targetIds,
    },
    now,
  );
}

/** The row createSchedule() writes — the same fields, off the same draft. */
function scheduleInputFor(draft: QuickPublishDraft, postId: string): ScheduleInput {
  const base: ScheduleInput = {
    post_id: postId,
    mode: draft.mode,
    timezone: TIMEZONE,
    run_at: draft.startAt,
    weekly: {},
    interval_days: null,
    interval_time: null,
    target_ids: draft.targetIds,
  };
  if (draft.mode === 'now') return base;
  return {
    ...base,
    drip_per_day: draft.perDay,
    drip_gap_minutes: draft.gapMinutes,
    drip_window_start: draft.windowStart,
    drip_window_end: draft.windowEnd,
  };
}

/**
 * Pure: the plan, from a snapshot. Same instants the planner will produce, with
 * the one caveat that has to be said rather than hidden — the planner runs later
 * than this, so its `now` differs and the floor at slots.ts:45 can push
 * everything forward. This is the plan, not a promise about the minute.
 */
export function planQuickPublish(ctx: QuickPublishContext, input: QuickPublishInput, now = new Date()): QuickPublishPlan {
  const draft = draftFor(input, ctx, now);
  const slots = slotsForDraft(draft, now);
  const names = new Map(ctx.targets.map((t) => [t.id, t.name]));

  const rows: SchedulePreviewRow[] = draft.targetIds
    .map((targetId, i) => ({ targetId, name: names.get(targetId) ?? '', at: slots[i]?.toISOString() ?? '' }))
    .filter((r) => r.at);

  // rules.ts:64 SKIPS over the daily ceiling, it does not postpone to tomorrow.
  // So the honest number is "how many of these will simply not happen", counted
  // per local day and including what has already gone out today.
  const todayISO = zonedDateISO(now, TIMEZONE);
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(zonedDateISO(new Date(r.at), TIMEZONE), (perDay.get(zonedDateISO(new Date(r.at), TIMEZONE)) ?? 0) + 1);

  let overDailyCap = 0;
  let overCapTotal = 0;
  for (const [day, count] of perDay) {
    const used = day === todayISO ? ctx.publishedToday : 0;
    const over = Math.max(0, count - Math.max(0, ctx.limits.maxPerDay - used));
    overCapTotal += over;
    if (day === todayISO) overDailyCap = over;
  }

  /*
   * The per-campaign ceiling, which rules.ts checks separately (rules.ts:70-74)
   * and skips over exactly as it skips the global one. Only today is computed:
   * tomorrow's budget resets and this launch is the only thing consuming it, so
   * anything beyond today would be a guess about publications not yet made.
   */
  const landingToday = perDay.get(todayISO) ?? 0;
  const campaignCap = Math.max(0, Math.round(ctx.browser.maxPerCampaignPerDay ?? 0));
  const overCampaignCapToday =
    ctx.campaignId && campaignCap > 0
      ? Math.max(0, landingToday - Math.max(0, campaignCap - ctx.campaignPublishedToday))
      : 0;

  const first = rows[0]?.at ?? draft.startAt;
  return {
    rows,
    startAt: first,
    endAt: rows.length > 1 ? rows[rows.length - 1].at : null,
    gapMinutes: draft.gapMinutes,
    overDailyCap,
    overCapTotal,
    maxPerDay: ctx.limits.maxPerDay,
    publishedToday: ctx.publishedToday,
    days: perDay.size,
    mode: draft.mode,
    // A minute of slack: the floor is now + gap to the millisecond, and an exact
    // comparison would flag every plan.
    firstSlotDeferred: new Date(first).getTime() > new Date(draft.startAt).getTime() + 60_000,
    effectiveGapMinutes: ctx.effectiveGapMinutes,
    overCampaignCapToday,
    maxPerCampaignPerDay: campaignCap,
  };
}

/**
 * The plan, in one call. Reads the snapshot and computes — the screen should
 * hold the snapshot itself (quickPublishContext) and call planQuickPublish on
 * every edit instead of re-reading.
 */
export async function previewQuickPublish(input: QuickPublishInput & { postId?: string }): Promise<QuickPublishPlan> {
  const post = input.postId ? await getPost(input.postId) : null;
  return planQuickPublish(await quickPublishContext(post?.campaign_id ?? null), input);
}

export interface QuickPublishResult {
  /**
   * Rows THIS launch really put in social_queue, counted on the schedule it
   * created. Deliberately not /api/social/run's `planned`: that is every row the
   * planner made on that tick, including other posts' schedules, so reporting it
   * as "your publications" would be a number the owner cannot check.
   */
  queued: number;
  startAt: string;
  endAt: string | null;

  /* --- additive: the real outcome, so the sheet can say what happened --- */
  /** false is a normal outcome — the queue was still planned, publishing is held. */
  ran: boolean;
  reason?: string;
  published: number;
  manual: number;
  skipped: number;
  failed: number;
  deferred: number;
  /** What was written to the spacing settings, and whether the surcharge moved. */
  gap: GapSplit;
  /** True when the owner answered "no" to the already-in-flight prompt; nothing was written. */
  cancelled: boolean;
  scheduleMode: 'now' | 'drip';
  /**
   * How much of this post was ALREADY on its way out when this launch started
   * (hasPendingQueue). Greater than zero means this was a second round on top of
   * an existing one — and note plan.ts plannedTargets() will create nothing for a
   * group that is already waiting, so `queued` can legitimately come back lower
   * than the number of groups chosen.
   */
  pendingAtLaunch: number;
  /**
   * Targets this launch actually scheduled. Not the same as the number the
   * sheet had selected: draftFor() drops ids whose target no longer exists,
   * because rules.ts would only skip them with "היעד נמחק."
   */
  targetCount: number;
}

/**
 * Publishes an existing library post to a set of groups.
 *
 * The order of these steps is the whole feature, and it is PostEditor's order:
 *
 *   1. validate exactly as the editor validates — including TEST MODE, which
 *      ships on (types.ts DEFAULT_BROWSER.testMode) and must refuse more than one
 *      group rather than quietly publishing to forty;
 *   2. mark the post 'ready', or the library keeps calling it a draft while it
 *      goes out;
 *   3. ask about a launch already in flight (hasPendingQueue) BEFORE writing
 *      anything else — two taps on a slow phone otherwise queue every group
 *      twice, and plan.ts plannedTargets() would then silently create nothing;
 *   4. write the gap settings, then create the schedule. Settings FIRST: rows
 *      created afterwards are measured against the number the owner just chose.
 *      Writing the rows N minutes apart without the settings is the 112-skipped,
 *      0-published failure;
 *   5. /api/social/run — on this deployment the GitHub cron never ticks
 *      (plan.ts:20-27), so without this the schedule sits in social_schedules
 *      until the PC worker's next 60-second tick.
 *
 * `onPending` is how step 3 asks. The data layer cannot open a dialog, so the
 * caller supplies the question and returning false cancels before anything is
 * written. A caller that already asked (QuickPublishSheet does, with the
 * editor's exact copy) passes no callback and the launch goes ahead — but the
 * count it found comes back as `pendingAtLaunch`, so a second round is never
 * something the owner was not told about.
 */
export async function quickPublish(
  input: QuickPublishInput & {
    postId: string;
    onPending?: (pending: number) => boolean | Promise<boolean>;
  },
): Promise<QuickPublishResult> {
  const now = new Date();
  const [post, variants] = await Promise.all([getPost(input.postId), listVariants(input.postId)]);

  if (!post) throw new Error('הפוסט לא נמצא.');
  if (post.status === 'archived') throw new Error('הפוסט נמצא בארכיון. שחזרו אותו לפני פרסום.');
  // The snapshot needs the post's campaign, so it is read once the post is known.
  const ctx = await quickPublishContext(post.campaign_id ?? null);

  const draft = draftFor(input, ctx, now);

  /* ---- the editor's own validation, reproduced (PostEditor.validateForPublish) ---- */
  const approved = variants.filter((v) => v.approval === 'approved' && v.text.trim());
  if (!post.base_text.trim() && !approved.length && !post.media.length) {
    throw new Error('הפוסט ריק — כתבו טקסט או הוסיפו מדיה.');
  }
  // rules.ts:51 skips a row whose variant is not approved, so a post with
  // variants and no approval would queue and then die one row at a time.
  if (variants.length && !approved.length) {
    throw new Error('יש גרסאות אך אף אחת לא אושרה. אשרו לפחות גרסה אחת (או מחקו את כולן כדי לפרסם את הטקסט הבסיסי).');
  }
  if (!draft.targetIds.length) throw new Error('בחרו לפחות יעד אחד.');
  const groupCount = draft.targetIds.filter((id) => ctx.targets.find((t) => t.id === id)?.channel === 'facebook_group').length;
  if (ctx.browser.testMode && groupCount > 1) {
    throw new Error('TEST MODE פעיל — אפשר לבחור קבוצה אחת בלבד. כבו אותו בהגדרות אחרי שהבדיקה הראשונה עברה.');
  }
  /*
   * A stopped run ENDS. plan.ts stoppedCampaigns() sweeps its rows to 'skipped'
   * within 60 seconds, so queueing into one would look like it worked and then
   * undo itself with nothing on screen to explain it.
   *
   * The old behaviour was to refuse and tell the owner to reopen it, which is
   * backwards: pressing "עצור" and then publishing again is how a person says
   * "that round is over, start a new one". So a stopped run is simply not
   * reused - the launch below opens a fresh one, and its counter starts at
   * zero instead of carrying the finished round's totals forever.
   */
  const previousRun = post.campaign_id ? await getCampaign(post.campaign_id) : null;
  const runEnded = previousRun?.status === 'archived';

  const slots = slotsForDraft(draft, now);
  const startAt = slots[0]?.toISOString() ?? draft.startAt;
  const endAt = slots.length > 1 ? slots[slots.length - 1].toISOString() : null;

  /* ---- 2. ready, and attached to a run ---- */
  /*
   * A run (social_campaigns) is what "pause this" and "stop this" act on:
   * rules.ts:57 holds a paused run's publications, plan.ts:78 refuses to plan
   * for a stopped one, and the dashboard's progress card is scoped by it. So
   * every launch needs one — but the owner should never have to make one.
   * Asking them to invent a container before they can publish is the thing they
   * said was confusing, and a run named anything other than the post is noise.
   *
   * So it is created here, once per post, named after the post. Re-launching
   * the same post reuses it, which is what makes "פורסם 12 פעמים" and the
   * progress bar accumulate across rounds instead of resetting.
   */
  let runId = runEnded ? null : post.campaign_id;
  if (!runId) {
    // service/city/language/notes carry their column defaults: they describe a
    // campaign the owner planned, and nothing plans this one.
    const run = await saveCampaign({ name: post.title.trim() || 'סבב פרסום', status: 'active' });
    runId = run.id;
  }

  // Only when something actually changed: an untouched post keeps its
  // updated_at, so publishing does not silently re-sort the library's "newest".
  if (post.status !== 'ready' || post.campaign_id !== runId) {
    const { id, created_at: _c, updated_at: _u, ...rest } = post;
    await savePost({ ...rest, id, status: 'ready', campaign_id: runId });
  }

  /* ---- 3. already on its way out? ---- */
  const pending = await hasPendingQueue(post.id);
  const idle: GapSplit = {
    gapMinutes: draft.gapMinutes,
    minGapMinutes: ctx.limits.minGapMinutes,
    groupMinGapMinutes: ctx.browser.groupMinGapMinutes,
    surchargeChanged: false,
  };
  if (pending > 0 && input.onPending) {
    const again = await input.onPending(pending);
    if (!again) {
      return {
        queued: 0,
        startAt,
        endAt,
        pendingAtLaunch: pending,
        targetCount: draft.targetIds.length,
        ran: false,
        published: 0,
        manual: 0,
        skipped: 0,
        failed: 0,
        deferred: 0,
        gap: idle,
        cancelled: true,
        scheduleMode: draft.mode,
      };
    }
  }

  /* ---- 4. settings, then the schedule ---- */
  // Only when a gap was actually asked for. Without one the plan already uses
  // what the settings demand, and rewriting a global setting nobody touched
  // would be a change the owner never made.
  const gap = input.gapMinutes === undefined ? idle : await applyGapSettings(draft.gapMinutes);

  const schedule = await createSchedule({
    ...scheduleInputFor(draft, post.id),
    // Quick publish has no variant UI: 'rotate' + {} are the schema defaults
    // (social-schema-v2.sql), and variants.ts picks from the approved ones.
    variant_strategy: 'rotate',
    variant_map: {},
    // The same OR the editor carries. Dropping it would make TEST MODE stop
    // forcing a confirmation before the final click.
    require_confirmation: ctx.browser.requireConfirmation || ctx.browser.testMode,
  });

  /* ---- 5. release it ---- */
  const r = await callSocialApi<{
    ran: boolean;
    planned: number;
    reason?: string;
    published: number;
    manual: number;
    skipped: number;
    failed: number;
    deferred: number;
  }>('/api/social/run');

  /*
   * What actually reached the queue FOR THIS LAUNCH. r.planned counts every row
   * the planner created on that tick — other posts' schedules included — so it
   * is the wrong number to show beside "your N groups". Counting on schedule_id
   * is exact, and it is also the number that stays honest when plan.ts's
   * plannedTargets() creates nothing because the post is already waiting for
   * those groups. One head count, no rows transferred.
   */
  const queuedRes = await db()
    .from('social_queue')
    .select('id', { count: 'exact', head: true })
    .eq('schedule_id', schedule.id);
  const queued = queuedRes.error ? 0 : queuedRes.count ?? 0;

  await logClientActivity(
    'info',
    'quick_published',
    `פרסום מהיר: ${draft.targetIds.length} יעדים, אחד כל ${draft.gapMinutes} דק׳${gap.surchargeChanged ? ` (המרווח הנוסף לקבוצות עודכן ל-${gap.groupMinGapMinutes} דק׳ והמרווח הכללי ל-${gap.minGapMinutes} דק׳)` : ''}`,
    { postId: post.id, targets: draft.targetIds.length, gapMinutes: draft.gapMinutes, queued, mode: draft.mode },
  );

  return {
    queued,
    startAt,
    endAt,
    pendingAtLaunch: pending,
    targetCount: draft.targetIds.length,
    ran: Boolean(r.ran),
    reason: r.reason,
    published: r.published ?? 0,
    manual: r.manual ?? 0,
    skipped: r.skipped ?? 0,
    failed: r.failed ?? 0,
    deferred: r.deferred ?? 0,
    gap,
    cancelled: false,
    scheduleMode: draft.mode,
  };
}

/**
 * The selection a quick-publish sheet should open with, by the rule
 * worker/test/selection.test.ts locks down: the post's most recent schedule
 * (active preferred), filtered to targets that still exist.
 *
 * NOT "every enabled page": there are no Pages on this account, so that rule
 * defaults to nothing and the sheet opens empty with no explanation. An empty
 * selection is still a legitimate outcome here — it must render as the picker's
 * own "0 selected" state, never as a silent select-everything.
 */
export function seedTargetsFromSchedules(
  schedules: { active: boolean; target_ids: string[]; created_at: string }[],
  targets: SocialTarget[],
): string[] {
  const latest = schedules.find((s) => s.active) ?? schedules[0];
  if (!latest) return [];
  return (latest.target_ids ?? []).filter((id) => targets.some((t) => t.id === id));
}
