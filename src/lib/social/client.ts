'use client';

import { supabase } from '@/lib/supabase';
import { campaignState, type CampaignQueueRow, type CampaignState } from './campaign';
import { detectCity } from './cities';
import { dedupeKey } from './compose';
import { friendlyError, friendlyMessage } from './errors';
import { checkCampaignInvariants, checkQueueInvariants, takeUnreported, type InvariantViolation } from './invariants';
import {
  ALL_QUEUE_STATUSES,
  AUTOMATIC_WAITING_STATUSES,
  CANCELLABLE_STATUSES,
  OPEN_STATUSES,
  summarizeQueue,
  type QueueSummary,
} from './status';
import {
  DEFAULT_BROWSER,
  DEFAULT_BUSINESS,
  DEFAULT_LIMITS,
  WORKER_OFFLINE_AFTER_SECONDS,
  parseGroupUrl,
  parseGroupShareUrl,
  type ActivityEntry,
  type BrowserSettings,
  type BusinessSettings,
  type Campaign,
  type CampaignProgress,
  type ControlSettings,
  type LimitsSettings,
  type MediaItem,
  type Post,
  type QueueItem,
  type Schedule,
  type SocialTarget,
  type SocialWorker,
  type QueueStatus,
  type Variant,
  type WorkerCommand,
  type WorkerCommandName,
} from './types';

/**
 * Browser-side data access for the social module. Runs through the anon key
 * plus the admin's session, so RLS (supabase/social-schema.sql) is the real
 * gate. Tokens are never readable from here — social_secrets has no policy.
 * Anything that must talk to Meta goes through callSocialApi() instead.
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

/* ------------------------------------------------------------------ API */

export async function callSocialApi<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('נדרשת התחברות.');
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (err) {
    // fetch itself rejects only on a transport failure — no server, no signal.
    throw friendlyError(err, 'אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.');
  }
  /*
   * Every route under /api/social answers with JSON, so a body that will not
   * parse did not come from this app: a hotel or airport captive portal, a CDN
   * interstitial or an SSO page, all of which answer 200 with HTML. This used
   * to parse the body with an empty-object fallback, so that HTML became an
   * empty object — `res.ok`
   * was true, nothing threw, and the caller dereferenced fields of an object
   * that had none. On /social/targets that put a raw English TypeError on a
   * Hebrew phone screen with no way forward.
   *
   * Unparseable now fails like any other failure: one Hebrew sentence, through
   * the same classifier.
   */
  const raw = await res.text().catch(() => '');
  let body: any = null;
  let parsed = false;
  try {
    body = raw ? JSON.parse(raw) : {};
    parsed = true;
  } catch {
    parsed = false;
  }
  // A route may hand back a raw backend message; it never reaches the screen
  // unclassified.
  if (!res.ok) throw friendlyError(parsed ? (body?.error ?? `HTTP ${res.status}`) : `HTTP ${res.status}`, `הבקשה נכשלה (${res.status}).`);
  if (!parsed) throw new Error('החיבור לאינטרנט מחזיר דף אחר במקום את המערכת. בדקו את הרשת (רשת אורחים / הזדהות ב-WiFi) ונסו שוב.');
  return body as T;
}

/* ------------------------------------------------------------- settings */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = unwrap<{ value: any } | null>(await db().from('social_settings').select('value').eq('key', key).maybeSingle());
  return row ? ({ ...fallback, ...row.value } as T) : fallback;
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  unwrap(await db().from('social_settings').upsert({ key, value }, { onConflict: 'key' }));
}

export const getLimits = () => getSetting<LimitsSettings>('limits', DEFAULT_LIMITS);
export const getControl = () => getSetting<ControlSettings>('control', { paused: false, rateLimitedUntil: null });
export const getBusiness = () => getSetting<BusinessSettings>('business', DEFAULT_BUSINESS);
export const getBrowserSettings = () => getSetting<BrowserSettings>('browser', DEFAULT_BROWSER);

export async function setPaused(paused: boolean): Promise<void> {
  const control = await getControl();
  await saveSetting('control', { ...control, paused });
}

/* -------------------------------------------------------------- targets */

export async function listTargets(): Promise<SocialTarget[]> {
  const rows = unwrap<SocialTarget[]>(await db().from('social_targets').select('*').order('channel').order('name'));
  // Backfill cities for rows created before the column existed (or never classified).
  const missing = rows.filter((t) => !t.city);
  for (const t of missing) {
    t.city = detectCity(t.name);
    db().from('social_targets').update({ city: t.city }).eq('id', t.id).then(() => undefined, () => undefined);
  }
  return rows;
}

export async function updateTarget(id: string, patch: Partial<Pick<SocialTarget, 'enabled' | 'name' | 'url' | 'notes' | 'city' | 'favorite' | 'category'>>): Promise<void> {
  unwrap(await db().from('social_targets').update(patch).eq('id', id));
}

/** Adds a Facebook Group by URL. Published by the local browser worker. */
export async function addGroup(input: { url: string; name?: string; notes?: string }): Promise<SocialTarget> {
  /*
   * A share link is accepted and resolved later, by the worker. It is what
   * Facebook's app gives on "העתק קישור", so refusing it means refusing the
   * link most people actually have — while parseGroupUrl stays exactly as
   * strict as it was about what may be PUBLISHED to.
   */
  const parsed = parseGroupUrl(input.url) ?? parseGroupShareUrl(input.url);
  if (!parsed) throw new Error('כתובת לא תקינה — צריך קישור לקבוצה מפייסבוק.');
  const { data: existing } = await db().from('social_targets').select('id').eq('channel', 'facebook_group').eq('external_id', parsed.externalId).maybeSingle();
  if (existing) throw new Error('הקבוצה הזו כבר קיימת ברשימה.');
  return unwrap<SocialTarget>(
    await db()
      .from('social_targets')
      .insert({
        channel: 'facebook_group',
        external_id: parsed.externalId,
        name: input.name?.trim() || parsed.externalId,
        url: parsed.url,
        city: detectCity(input.name?.trim() || parsed.externalId),
        notes: input.notes ?? '',
        permission_status: 'browser',
        can_api_publish: false,
        enabled: true,
      })
      .select('*')
      .single(),
  );
}

/** @deprecated phase-1 name; groups are now browser-published. */
export const addManualGroup = (input: { name: string; url: string; notes?: string }) => addGroup(input);

/** Ask the worker to (re)fetch name + picture from Facebook for these groups. */
export async function requestGroupRefresh(ids?: string[]): Promise<void> {
  let q = db().from('social_targets').update({ last_synced_at: null }).eq('channel', 'facebook_group');
  if (ids?.length) q = q.in('id', ids);
  unwrap(await q);
}

export async function bulkUpdateTargets(ids: string[], patch: Partial<Pick<SocialTarget, 'enabled' | 'favorite' | 'category' | 'city'>>): Promise<void> {
  if (!ids.length) return;
  unwrap(await db().from('social_targets').update(patch).in('id', ids));
}

export async function bulkDeleteTargets(ids: string[]): Promise<void> {
  if (!ids.length) return;
  unwrap(await db().from('social_targets').delete().in('id', ids));
}

export async function deleteTarget(id: string): Promise<void> {
  unwrap(await db().from('social_targets').delete().eq('id', id));
}

/* ------------------------------------------------------------ campaigns */

export async function listCampaigns(): Promise<Campaign[]> {
  return unwrap<Campaign[]>(await db().from('social_campaigns').select('*').order('created_at', { ascending: false }));
}

export async function saveCampaign(input: Partial<Campaign> & { name: string }): Promise<Campaign> {
  const { id, created_at: _c, ...rest } = input as any;
  if (id) return unwrap<Campaign>(await db().from('social_campaigns').update(rest).eq('id', id).select('*').single());
  return unwrap<Campaign>(await db().from('social_campaigns').insert(rest).select('*').single());
}

/**
 * The run a post's publications belong to, creating it on first launch.
 *
 * A run (social_campaigns) is what "pause this" and "stop this" act on, and
 * what the dashboard scopes its progress card by. Quick publish already opened
 * one per post; scheduling from the editor did not, so a weekly schedule set up
 * there produced queue rows with campaign_id null — they published, but the
 * owner went to "סבבי פרסום" to watch them and found nothing, because there was
 * nothing to find. Both paths now go through here.
 *
 * One run per post, reused on every later launch: that is what makes the
 * progress bar and "פורסם N פעמים" accumulate across rounds instead of
 * resetting. A run the owner STOPPED is finished and is not reused - the next
 * launch opens a fresh one, counting from zero.
 */
export async function ensureRunForPost(post: Pick<Post, 'id' | 'title' | 'campaign_id'>): Promise<string> {
  if (post.campaign_id) {
    const existing = await getCampaign(post.campaign_id);
    if (existing && existing.status !== 'archived') return existing.id;
  }
  const run = await saveCampaign({ name: post.title.trim() || 'סבב פרסום', status: 'active' });
  unwrap(await db().from('social_posts').update({ campaign_id: run.id }).eq('id', post.id));

  /*
   * Adopt what is already waiting. plan.ts stamps campaign_id from the post at
   * the moment a row is created, so publications queued before the post had a
   * run keep null for ever: they publish on time and stay invisible on the
   * screen built to watch them, with no way to pause or stop them as a group.
   *
   * Only orphans, and only rows that have not finished — a row belonging to an
   * earlier run is that run's history and is never moved.
   */
  const adopted = unwrap<{ id: string }[]>(
    await db()
      .from('social_queue')
      .update({ campaign_id: run.id })
      .eq('post_id', post.id)
      .is('campaign_id', null)
      .in('status', OPEN_STATUSES)
      .select('id'),
  );
  if (adopted.length) {
    await logClientActivity('info', 'run_adopted_queue', `${adopted.length} פרסומים שכבר המתינו בתור צורפו לסבב "${run.name}"`, {
      campaignId: run.id,
      adopted: adopted.length,
    });
  }
  return run.id;
}

/**
 * Delete a run — and stop it first.
 *
 * social_queue.campaign_id is `on delete set null` (supabase/social-schema-v2.sql)
 * and social_posts.campaign_id is too, so deleting the row alone used to leave
 * every publication of that run in the queue with a null campaign. rules.ts
 * only consults the campaign when a row HAS one (`if (campaignId)`), so those
 * orphans sailed past the pause/stop check and kept publishing to Facebook for
 * hours — with no run card left anywhere to pause them, because the card was
 * the thing that had just been deleted. The owner deleted a round to stop it
 * and watched it keep going.
 *
 * So delete now does what stop does first: schedules off, everything that has
 * not gone out cancelled (CANCELLABLE — a job already running is left to finish
 * safely), and only then the row itself. Returns how many publications were
 * cancelled, so the screen can say it.
 */
export async function deleteCampaign(id: string): Promise<number> {
  const { data: campaign } = await db().from('social_campaigns').select('name').eq('id', id).maybeSingle();
  const name = (campaign as { name?: string } | null)?.name ?? '';

  const posts = unwrap<{ id: string }[]>(await db().from('social_posts').select('id').eq('campaign_id', id));
  const postIds = posts.map((p) => p.id);
  if (postIds.length) unwrap(await db().from('social_schedules').update({ active: false }).in('post_id', postIds));

  const rows = unwrap<{ id: string }[]>(
    await db()
      .from('social_queue')
      .update({ status: 'skipped', step: '', skip_reason: 'הסבב נמחק' })
      .eq('campaign_id', id)
      .in('status', CANCELLABLE)
      .select('id'),
  );

  unwrap(await db().from('social_campaigns').delete().eq('id', id));
  await logClientActivity('warn', 'campaign_deleted', `הסבב "${name}" נמחק — ${rows.length} פרסומים שטרם יצאו בוטלו`, {
    campaignId: id,
    cancelled: rows.length,
  });
  return rows.length;
}

/* ---------------------------------------------------------------- posts */

export async function listPosts(): Promise<Post[]> {
  return unwrap<Post[]>(await db().from('social_posts').select('*').neq('status', 'archived').order('updated_at', { ascending: false }));
}

/**
 * The posts of ONE run.
 *
 * The campaign control centre polls every five seconds and used to call
 * listPosts() — every non-archived post in the account, base_text and media
 * included — only to run `.filter((x) => x.campaign_id === id)` on the result
 * and keep, almost always, exactly one of them. An owner with two hundred
 * drafts paid for all of them twelve times a minute for the life of the screen.
 * The filter now happens in Postgres.
 */
export async function listPostsForCampaign(campaignId: string): Promise<Post[]> {
  return unwrap<Post[]>(
    await db().from('social_posts').select('*').eq('campaign_id', campaignId).neq('status', 'archived').order('updated_at', { ascending: false }),
  );
}

export async function getPost(id: string): Promise<Post | null> {
  return unwrap<Post | null>(await db().from('social_posts').select('*').eq('id', id).maybeSingle());
}

export type PostInput = Omit<Post, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export async function savePost(input: PostInput): Promise<Post> {
  const { id, ...rest } = input;
  if (id) return unwrap<Post>(await db().from('social_posts').update(rest).eq('id', id).select('*').single());
  return unwrap<Post>(await db().from('social_posts').insert(rest).select('*').single());
}

/**
 * Copies a post with its variants — the fastest way to run last month's
 * campaign again, and what "templates" mostly means in practice here.
 * The copy starts as a draft so nothing goes out until it is scheduled.
 */
export async function duplicatePost(id: string): Promise<Post> {
  const source = await getPost(id);
  if (!source) throw new Error('הפוסט לא נמצא.');
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = source;
  const copy = unwrap<Post>(
    await db()
      .from('social_posts')
      .insert({ ...rest, title: `${source.title || 'פוסט'} — עותק`, status: 'draft' })
      .select('*')
      .single(),
  );
  const variants = await listVariants(id);
  if (variants.length) {
    unwrap(
      await db()
        .from('social_variants')
        .insert(variants.map(({ id: _vid, post_id: _pid, ...v }) => ({ ...v, post_id: copy.id }))),
    );
  }
  return copy;
}

/** Copies a campaign's settings (not its posts) as a fresh active campaign. */
export async function duplicateCampaign(id: string): Promise<Campaign> {
  const source = (await listCampaigns()).find((c) => c.id === id);
  if (!source) throw new Error('הסבב לא נמצא.');
  const { id: _id, created_at: _c, ...rest } = source;
  return unwrap<Campaign>(
    await db()
      .from('social_campaigns')
      .insert({ ...rest, name: `${source.name} — עותק`, status: 'active' })
      .select('*')
      .single(),
  );
}

/**
 * Archive: the post leaves the library, its schedules stop, and every
 * publication that has not gone out yet is cancelled.
 *
 * "Not gone out yet" is CANCELLABLE_STATUSES, not 'scheduled'. It used to be
 * `.eq('status', 'scheduled')`, so manual_pending, needs_attention,
 * awaiting_confirmation and paused rows all survived the archive — they stayed
 * in "דורשים אתכם" on the dashboard for a post that no longer exists in the
 * library, and tapping "אשר" on one published an archived post to Facebook.
 * The dialog has always said "פרסומים שטרם יצאו ידולגו"; this is the write
 * finally matching the promise.
 */
export async function archivePost(id: string): Promise<void> {
  unwrap(await db().from('social_posts').update({ status: 'archived' }).eq('id', id));
  unwrap(await db().from('social_schedules').update({ active: false }).eq('post_id', id));
  unwrap(
    await db()
      .from('social_queue')
      .update({ status: 'skipped', step: '', skip_reason: 'הפוסט הועבר לארכיון' })
      .eq('post_id', id)
      .in('status', CANCELLABLE),
  );
}

export async function listVariants(postId: string): Promise<Variant[]> {
  return unwrap<Variant[]>(await db().from('social_variants').select('*').eq('post_id', postId).order('sort').order('created_at'));
}

export async function saveVariants(postId: string, variants: Partial<Variant>[]): Promise<Variant[]> {
  const client = db();
  const existing = unwrap<{ id: string }[]>(await client.from('social_variants').select('id').eq('post_id', postId));
  const keep = new Set(variants.map((v) => v.id).filter(Boolean));
  const remove = existing.map((v) => v.id).filter((id) => !keep.has(id));
  if (remove.length) unwrap(await client.from('social_variants').delete().in('id', remove));

  // PostgREST needs every row of a bulk write to carry the same keys, so
  // updates (with id) and inserts (without) go in separate statements.
  const rows = variants.map((v, i) => ({
    post_id: postId,
    label: v.label ?? String.fromCharCode(65 + i),
    text: v.text ?? '',
    language: v.language ?? 'he',
    approval: v.approval ?? 'pending',
    sort: i,
    id: v.id,
  }));
  const updates = rows.filter((r) => r.id).map((r) => ({ ...r, id: r.id as string }));
  const inserts = rows.filter((r) => !r.id).map(({ id: _id, ...r }) => r);
  if (updates.length) unwrap(await client.from('social_variants').upsert(updates, { onConflict: 'id' }));
  if (inserts.length) unwrap(await client.from('social_variants').insert(inserts));
  return listVariants(postId);
}

/* ---------------------------------------------------------------- media */

/**
 * What the social-media bucket is allowed to serve, and under which name.
 *
 * The bucket is PUBLIC by design — Meta fetches photos and videos by URL
 * (supabase/social-schema.sql) — so whatever Content-Type is stored is what
 * *.supabase.co serves to anyone with the link. The upload used to pass
 * `file.type` and an extension taken from `file.name`, both of which the caller
 * chooses freely: a programmatic File could store arbitrary bytes as
 * `text/html` under the business's own storage domain, i.e. host a page there.
 *
 * So the type is resolved against this table instead of trusted, and the
 * extension is derived from the resolved type rather than from the file name,
 * which keeps the two agreeing.
 */
const MEDIA_TYPES: Record<string, { ext: string; kind: MediaItem['kind'] }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/avif': { ext: 'avif', kind: 'image' },
  'image/bmp': { ext: 'bmp', kind: 'image' },
  'image/tiff': { ext: 'tiff', kind: 'image' },
  'image/heic': { ext: 'heic', kind: 'image' },
  'image/heif': { ext: 'heif', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' },
  'video/webm': { ext: 'webm', kind: 'video' },
};

/** Same table, keyed by the extension an iPhone or a camera actually hands us. */
const MEDIA_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export async function uploadMedia(file: File): Promise<MediaItem> {
  const client = db();
  const declared = (file.type || '').toLowerCase().split(';')[0].trim();
  const nameExt = (file.name.split('.').pop() ?? '').toLowerCase();
  // The browser's own type first, then the file name, and only then a refusal —
  // iOS sometimes hands over an empty type for a photo picked from the library.
  const contentType = MEDIA_TYPES[declared] ? declared : MEDIA_BY_EXT[nameExt];
  const resolved = contentType ? MEDIA_TYPES[contentType] : undefined;
  if (!resolved) {
    // SVG is deliberately absent: it is a document that can carry script, and
    // this bucket is served publicly.
    throw new Error('אפשר להעלות תמונות (JPG, PNG, GIF, WEBP, HEIC) או סרטונים (MP4, MOV, WEBM) בלבד.');
  }
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${resolved.ext}`;
  const { error } = await client.storage.from('social-media').upload(path, file, { contentType, upsert: false });
  if (error) throw friendlyError(error);
  const { data } = client.storage.from('social-media').getPublicUrl(path);
  return { kind: resolved.kind, url: data.publicUrl, path, name: file.name };
}

export async function removeMedia(item: MediaItem): Promise<void> {
  if (!item.path) return;
  await db().storage.from('social-media').remove([item.path]);
}

/* ------------------------------------------------------------ schedules */

export type ScheduleInput = Omit<Schedule, 'id' | 'created_at' | 'planned_until' | 'active'>;

export async function createSchedule(input: ScheduleInput): Promise<Schedule> {
  return unwrap<Schedule>(await db().from('social_schedules').insert({ ...input, active: true }).select('*').single());
}

/**
 * How much of this post is already on its way out.
 *
 * Counts queue rows AND schedules that have not finished planning yet. A
 * schedule is created first and materialised into the queue moments later by
 * the planner, so counting only rows leaves a window where a second launch
 * looks like a first one — and two schedules for one post plan the same
 * targets at the same instants, which is how every group ended up in the queue
 * twice.
 */
export async function hasPendingQueue(postId: string): Promise<number> {
  const [rows, schedules] = await Promise.all([
    // Every row that has not finished, from the single classification — the
    // same set plannedTargets() (plan.ts) treats as blocking. A hand-written
    // ['scheduled','publishing','awaiting_confirmation'] left out
    // manual_pending, needs_attention and paused, so a post whose rows were all
    // parked after a worker hiccup counted as 0 pending: the owner got no
    // "already on its way out" prompt, relaunched, and the planner then skipped
    // every target — a launch that reported success and queued nothing.
    db().from('social_queue').select('id', { count: 'exact', head: true }).eq('post_id', postId).in('status', OPEN_STATUSES),
    // `planned_until is null` is the point: a schedule that has never been
    // materialised is a launch still in flight. A recurring weekly or daily
    // schedule stays active for good — counting those would make every launch
    // of the post look like a repeat and block it behind a prompt.
    db()
      .from('social_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .eq('active', true)
      .is('planned_until', null),
  ]);
  if (rows.error) throw friendlyError(rows.error);
  if (schedules.error) throw friendlyError(schedules.error);
  return (rows.count ?? 0) || (schedules.count ?? 0);
}

export async function listSchedules(postId?: string): Promise<Schedule[]> {
  let q = db().from('social_schedules').select('*').order('created_at', { ascending: false });
  if (postId) q = q.eq('post_id', postId);
  return unwrap<Schedule[]>(await q);
}

export async function setScheduleActive(id: string, active: boolean): Promise<void> {
  unwrap(await db().from('social_schedules').update({ active }).eq('id', id));
  if (!active) {
    // Same list as every other cancel in this file — see archivePost(). A row
    // parked on manual_pending / needs_attention / awaiting_confirmation has
    // not gone out either, and leaving it behind kept an owner being asked to
    // finish publications for a schedule they had just switched off.
    unwrap(
      await db()
        .from('social_queue')
        .update({ status: 'skipped', step: '', skip_reason: 'התזמון בוטל' })
        .eq('schedule_id', id)
        .in('status', CANCELLABLE),
    );
  }
}

/* ---------------------------------------------------------------- queue */

export interface QueueRow extends QueueItem {
  target: Pick<SocialTarget, 'id' | 'name' | 'channel' | 'url' | 'image_url'> | null;
  post: Pick<Post, 'id' | 'title' | 'media' | 'link_url'> | null;
  variant: Pick<Variant, 'id' | 'label'> | null;
}

const QUEUE_SELECT =
  '*, target:social_targets(id,name,channel,url,image_url), post:social_posts(id,title,media,link_url), variant:social_variants(id,label)';

/**
 * `order` matters more than it looks: the limit is applied AFTER the sort, so
 * a descending read with a limit returns the FURTHEST-OUT rows. The dashboard
 * asked for 40 rows to show "the next publications" and got the last 40 in the
 * queue — the soonest ones were not in the array at all. Callers that want
 * what happens next pass 'asc'; the history, which wants the newest first,
 * keeps the default.
 */
export async function listQueue(
  opts: { status?: QueueItem['status'][]; since?: string; until?: string; limit?: number; order?: 'asc' | 'desc' } = {},
): Promise<QueueRow[]> {
  let q = db()
    .from('social_queue')
    .select(QUEUE_SELECT)
    .order('scheduled_at', { ascending: opts.order === 'asc' })
    .limit(opts.limit ?? 200);
  if (opts.status?.length) q = q.in('status', opts.status);
  if (opts.since) q = q.gte('scheduled_at', opts.since);
  if (opts.until) q = q.lte('scheduled_at', opts.until);
  return unwrap<QueueRow[]>(await q);
}

export async function getQueueItem(id: string): Promise<QueueRow | null> {
  return unwrap<QueueRow | null>(await db().from('social_queue').select(QUEUE_SELECT).eq('id', id).maybeSingle());
}

export async function nextScheduled(): Promise<QueueRow | null> {
  return unwrap<QueueRow | null>(
    await db().from('social_queue').select(QUEUE_SELECT).eq('status', 'scheduled').order('scheduled_at').limit(1).maybeSingle(),
  );
}

export async function updateQueueItem(id: string, patch: Partial<QueueItem>): Promise<void> {
  unwrap(await db().from('social_queue').update(patch).eq('id', id));
}

/**
 * Retry and cancel both name the statuses they are allowed to act on, so a
 * stale screen (or a second tap while the first request is in flight) can
 * never move a row that has since started publishing or already published.
 * The write simply matches nothing and the caller reloads the real state.
 */
const RETRYABLE: QueueItem['status'][] = ['failed', 'skipped', 'needs_attention', 'scheduled', 'paused'];
/**
 * One list for one row and for the whole queue, straight from status.ts, so
 * the number in a confirmation dialog is the number the write delivers. It
 * used to differ in both directions at once: the dialog counted manual_pending
 * (which the write could not touch) and the write cancelled awaiting_confirmation
 * and paused (which the dialog never counted).
 */
const CANCELLABLE: QueueItem['status'][] = CANCELLABLE_STATUSES;

async function guardedUpdate(id: string, allowed: QueueItem['status'][], patch: Partial<QueueItem>): Promise<boolean> {
  const rows = unwrap<{ id: string }[]>(await db().from('social_queue').update(patch).eq('id', id).in('status', allowed).select('id'));
  return rows.length > 0;
}

/**
 * "נסה שוב": the row goes back to the front of the queue as if it had never
 * run.
 *
 * `attempts: 0` and `confirmed_at: null` are part of that, and both were
 * missing:
 *
 *   • attempts — rules.ts skips permanently once `attempts > 40` ("נדחה יותר
 *     מדי פעמים בגלל מרווח הזמן בין פרסומים"), and the local worker stops
 *     retrying a pre-submit failure at 3. A row retried by hand carried its old
 *     counter, so the very next claim skipped or failed it again with the same
 *     sentence, and there was no way to recover it from the screen at all.
 *   • confirmed_at — the worker's confirmation gate polls this column, so a
 *     stale stamp from a PREVIOUS round made the next "stop and ask me before
 *     the Post click" return 'confirmed' on its first poll, without asking.
 *
 * Both are per-attempt state; a retry is a new attempt.
 */
export async function retryQueueItem(id: string): Promise<boolean> {
  return guardedUpdate(id, RETRYABLE, {
    status: 'scheduled',
    step: 'pending',
    scheduled_at: new Date().toISOString(),
    error: null,
    skip_reason: null,
    attempts: 0,
    confirmed_at: null,
  });
}

export async function cancelQueueItem(id: string): Promise<boolean> {
  return guardedUpdate(id, CANCELLABLE, { status: 'skipped', step: '', skip_reason: 'בוטל ידנית' });
}

/**
 * Releases a publication the worker has parked at "ready to publish".
 *
 * Guarded like retry and cancel, and for the same reason: this button sits in a
 * list the dashboard refreshes every four seconds, so by the time it is tapped
 * the row may already be publishing, published or cancelled — and this was the
 * one queue write in the file that went through updateQueueItem() with no
 * status filter, so a second tap (or a tap on a stale row) stamped confirmed_at
 * onto whatever was there. Returns false when the row was no longer waiting for
 * an answer, so the screen can reload instead of reporting an approval that
 * approved nothing.
 */
export async function confirmQueueItem(id: string): Promise<boolean> {
  return guardedUpdate(id, ['awaiting_confirmation'], { confirmed_at: new Date().toISOString() });
}

/** Rows a browser worker parked because Facebook asked for a human. */
export async function resumeNeedsAttention(postId?: string): Promise<number> {
  // attempts and confirmed_at are cleared for the same reason retryQueueItem()
  // clears them — this is a fresh attempt, and a confirmation stamp left over
  // from the previous one would let the worker skip asking.
  let q = db()
    .from('social_queue')
    .update({ status: 'scheduled', step: 'pending', error: null, scheduled_at: new Date().toISOString(), attempts: 0, confirmed_at: null })
    .eq('status', 'needs_attention');
  if (postId) q = q.eq('post_id', postId);
  const rows = unwrap<{ id: string }[]>(await q.select('id'));
  return rows.length;
}

/** Live view: everything that is in flight or finished recently, for the progress board. */
export async function listLiveQueue(): Promise<QueueRow[]> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  return unwrap<QueueRow[]>(
    await db()
      .from('social_queue')
      .select(QUEUE_SELECT)
      // Every open row (status.ts), not a hand-written subset: manual_pending
      // was missing, so the board's "דורשים אתכם" section — whose whole point
      // is "nothing moves until you act" — could never show one.
      .or(`status.in.(${OPEN_STATUSES.join(',')}),and(status.in.(published,failed),updated_at.gte.${since})`)
      .order('scheduled_at', { ascending: true })
      .limit(200),
  );
}

/**
 * Pause leaves the queue exactly as it is — the rules engine returns
 * "wait" for a paused campaign, so every scheduled row keeps its slot and
 * resume picks up from the same place. Nothing is deleted either way.
 */
export async function pauseCampaign(id: string, paused: boolean): Promise<void> {
  const { data: campaign } = await db().from('social_campaigns').select('name').eq('id', id).maybeSingle();
  unwrap(await db().from('social_campaigns').update({ status: paused ? 'paused' : 'active', archived_at: null }).eq('id', id));
  await logClientActivity(
    'info',
    paused ? 'campaign_paused' : 'campaign_resumed',
    `הסבב "${campaign?.name ?? ''}" ${paused ? 'הושהה' : 'חזר לפעול'}`,
    { campaignId: id },
  );
}

/**
 * Stop: nothing new starts, every row that has not begun is cancelled, and a
 * job already running is left to finish safely. Publications that already
 * happened stay in the history — stop never rewrites the past.
 */
export async function stopCampaign(id: string): Promise<number> {
  const { data: campaign } = await db().from('social_campaigns').select('name').eq('id', id).maybeSingle();
  unwrap(await db().from('social_campaigns').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', id));
  const posts = unwrap<{ id: string }[]>(await db().from('social_posts').select('id').eq('campaign_id', id));
  const postIds = posts.map((p) => p.id);
  if (postIds.length) unwrap(await db().from('social_schedules').update({ active: false }).in('post_id', postIds));
  const rows = unwrap<{ id: string }[]>(
    await db()
      .from('social_queue')
      .update({ status: 'skipped', step: '', skip_reason: 'הסבב נעצר' })
      .eq('campaign_id', id)
      .in('status', CANCELLABLE)
      .select('id'),
  );
  await logClientActivity('warn', 'campaign_stopped', `הסבב "${campaign?.name ?? ''}" נעצר — ${rows.length} פרסומים שטרם התחילו בוטלו`, {
    campaignId: id,
    cancelled: rows.length,
  });
  return rows.length;
}

/** Re-opens a stopped campaign for editing; it does not resurrect cancelled rows. */
export async function reopenCampaign(id: string): Promise<void> {
  unwrap(await db().from('social_campaigns').update({ status: 'active', archived_at: null }).eq('id', id));
}

export async function screenshotUrl(path: string): Promise<string | null> {
  const { data, error } = await db().storage.from('social-debug').createSignedUrl(path, 600);
  if (error) return null;
  return data.signedUrl;
}

/* ------------------------------------------------------------ campaigns */

/** Ceiling for the cross-campaign rollup read. */
const CAMPAIGN_ROLLUP_LIMIT = 5000;

/**
 * One full control-centre state per campaign, from the queue rows that carry
 * campaign_id. A single read (narrow columns plus the target's name) keeps
 * the campaigns screen and the dashboard hero to one request each, no matter
 * how many campaigns exist.
 */
export async function campaignStates(campaignIds?: string[]): Promise<Record<string, CampaignState>> {
  if (campaignIds && campaignIds.length === 0) return {};
  let query = db()
    .from('social_queue')
    .select('id, status, scheduled_at, published_at, target_id, post_id, campaign_id, target:social_targets(id,name,channel,image_url)')
    .not('campaign_id', 'is', null)
    .order('scheduled_at')
    // A hard ceiling so one screen can never pull an unbounded table. Callers
    // that care about a single campaign use campaignQueue() instead, which is
    // scoped to it; this one is the overview.
    .limit(CAMPAIGN_ROLLUP_LIMIT);
  if (campaignIds) query = query.in('campaign_id', campaignIds);
  const [rows, campaigns] = await Promise.all([unwrap<(CampaignQueueRow & { campaign_id: string })[]>(await query), listCampaigns()]);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const grouped = new Map<string, CampaignQueueRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.campaign_id);
    if (list) list.push(row);
    else grouped.set(row.campaign_id, [row]);
  }
  // The ceiling is shared by every live campaign and the read is ordered by
  // scheduled_at ascending, so what gets dropped is the furthest-out rows —
  // precisely the ones that have not happened yet. A truncated read therefore
  // makes a run look MORE finished than it is, which is how a card could say
  // "הושלם · 100%" beside rows the dashboard still counted as waiting. We
  // cannot tell which campaign lost rows, so every state built from a capped
  // read is marked, and the card stops presenting its numbers as totals.
  const truncated = rows.length >= CAMPAIGN_ROLLUP_LIMIT;
  const out: Record<string, CampaignState> = {};
  for (const [id, list] of grouped) {
    const campaign = byId.get(id) ?? null;
    const state = campaignState(list, campaign, { truncated });
    out[id] = state;
    if (!truncated) {
      await reportViolations(checkCampaignInvariants(state, { campaignId: id, campaignName: campaign?.name ?? null }), `campaign:${id}`);
    }
  }
  return out;
}

/** Backwards-compatible slice of the above, for callers that only draw a bar. */
export async function campaignProgress(): Promise<Record<string, CampaignProgress>> {
  const states = await campaignStates();
  return Object.fromEntries(Object.entries(states).map(([id, s]) => [id, s.progress]));
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  return unwrap<Campaign | null>(await db().from('social_campaigns').select('*').eq('id', id).maybeSingle());
}

/** Ceiling for one campaign's own feed. Exported so the screen can disclose it. */
export const CAMPAIGN_QUEUE_LIMIT = 1000;

/**
 * Every queue row of one campaign, with its target — the control centre's feed,
 * plus whether the read hit its ceiling. Same reason postUsage() and
 * liveQueuePlan() report truncation: past the limit the rows dropped are the
 * furthest-out ones, so the numbers would read as a finished run.
 */
export async function campaignQueueWithStats(campaignId: string): Promise<{ rows: QueueRow[]; truncated: boolean }> {
  const rows = unwrap<QueueRow[]>(
    await db().from('social_queue').select(QUEUE_SELECT).eq('campaign_id', campaignId).order('scheduled_at').limit(CAMPAIGN_QUEUE_LIMIT),
  );
  return { rows, truncated: rows.length >= CAMPAIGN_QUEUE_LIMIT };
}

/**
 * The media of the post a run publishes — one row, for the run card's cover.
 *
 * The dashboard used to take this from the upcoming queue rows, which carry
 * their post already. That works only while something is still scheduled: a
 * run whose rows have all finished lost its picture at exactly the moment the
 * owner looks to see what went out. Joining media into campaignStates() would
 * have fixed it by attaching a jsonb column to as many as 5000 rows to read
 * one; this reads the one.
 */
export async function runCoverMedia(campaignId: string): Promise<MediaItem[] | null> {
  const { data } = await db()
    .from('social_posts')
    .select('media')
    .eq('campaign_id', campaignId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const media = (data as { media?: MediaItem[] } | null)?.media;
  return media && media.length ? media : null;
}

export async function campaignQueue(campaignId: string): Promise<QueueRow[]> {
  return (await campaignQueueWithStats(campaignId)).rows;
}

/**
 * One post's publication history, with the group on every row — what the
 * content library shows under "where has this been?". Same shape and same
 * ceiling as targetQueue() below; only the column it filters on differs.
 */
export async function postQueue(postId: string, limit = 100): Promise<QueueRow[]> {
  return unwrap<QueueRow[]>(
    await db().from('social_queue').select(QUEUE_SELECT).eq('post_id', postId).order('scheduled_at', { ascending: false }).limit(limit),
  );
}

/** One group's publication history, for its profile screen. */
export async function targetQueue(targetId: string, limit = 100): Promise<QueueRow[]> {
  return unwrap<QueueRow[]>(
    await db().from('social_queue').select(QUEUE_SELECT).eq('target_id', targetId).order('scheduled_at', { ascending: false }).limit(limit),
  );
}

export async function getTarget(id: string): Promise<SocialTarget | null> {
  return unwrap<SocialTarget | null>(await db().from('social_targets').select('*').eq('id', id).maybeSingle());
}

/**
 * Writes one line into the shared activity log so a campaign action taken on
 * the phone shows up in the notification bell and the feed, exactly like the
 * lines the two workers write. Never throws: a missing log line must not fail
 * the action the person actually asked for.
 */
export async function logClientActivity(
  level: ActivityEntry['level'],
  event: string,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db().from('social_activity_log').insert({ level, event, message, meta });
  } catch {
    /* logging is best-effort */
  }
}

/* --------------------------------------------------- manual publish queue */

/**
 * Every publication waiting for the owner to post it by hand, oldest first.
 * The manual assistant walks this list so it can say "group 7 of 32" and
 * jump straight to the next one.
 */
export async function manualQueue(): Promise<QueueRow[]> {
  return unwrap<QueueRow[]>(
    await db().from('social_queue').select(QUEUE_SELECT).eq('status', 'manual_pending').order('scheduled_at').limit(200),
  );
}

/* -------------------------------------------------------------- workers */

export async function listWorkers(): Promise<(SocialWorker & { online: boolean })[]> {
  const rows = unwrap<SocialWorker[]>(await db().from('social_workers').select('*').order('created_at'));
  const cutoff = Date.now() - WORKER_OFFLINE_AFTER_SECONDS * 1000;
  return rows.map((w) => ({ ...w, online: Boolean(w.last_seen_at && new Date(w.last_seen_at).getTime() > cutoff) }));
}

/**
 * Queue one instruction for the local worker.
 *
 * `payload` is a ONE-TIME envelope, not a field. A login can carry the
 * Facebook sign-in details the owner typed on this screen, because the
 * product is meant to be sold — a customer enters their own details on their
 * own phone instead of walking to the machine that publishes. The worker
 * empties the column in the same statement that claims the command, before it
 * opens a browser, so nothing here becomes a stored secret.
 *
 * It is never read back: the row is inserted and only its id is returned, and
 * listRecentCommands names its columns rather than asking for all of them.
 */
export async function sendWorkerCommand(
  workerId: string | null,
  command: WorkerCommandName,
  payload?: Record<string, string>,
): Promise<{ id: string }> {
  return unwrap<{ id: string }>(
    await db()
      .from('social_worker_commands')
      .insert({ worker_id: workerId, command, ...(payload ? { payload } : {}) })
      .select('id')
      .single(),
  );
}

const COMMAND_COLUMNS = 'id, worker_id, command, status, result, created_at, finished_at';

export async function listRecentCommands(limit = 5): Promise<WorkerCommand[]> {
  /* Named columns, not '*': `payload` may hold a password for the second or
     two before the worker claims it, and this list is rendered on screen. */
  return unwrap<WorkerCommand[]>(await db().from('social_worker_commands').select(COMMAND_COLUMNS).order('created_at', { ascending: false }).limit(limit));
}

export async function markManualPublished(id: string, permalink: string): Promise<void> {
  await updateQueueItem(id, {
    status: 'published',
    published_at: new Date().toISOString(),
    permalink: permalink || null,
    error: null,
    method: 'manual',
  });
}

export async function cancelAllScheduled(): Promise<number> {
  const rows = unwrap<{ id: string }[]>(
    await db()
      .from('social_queue')
      .update({ status: 'skipped', step: '', skip_reason: 'בוטל — עצירת כל התורים' })
      .in('status', CANCELLABLE)
      .select('id'),
  );
  return rows.length;
}

export async function countPublishedSince(sinceISO: string): Promise<number> {
  const res = await db().from('social_queue').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('published_at', sinceISO);
  if (res.error) throw friendlyError(res.error);
  return res.count ?? 0;
}

/**
 * The four dashboard tiles, exactly.
 *
 * This used to be `select('status')` with no limit and no order: it pulled
 * every row in the table onto a phone to count nine integers, and PostgREST's
 * own `db-max-rows` (1000 by default on Supabase) silently capped it — so past
 * a thousand rows the largest numbers on the screen were a ceiling printed as
 * a fact, with no way to tell. Nine `head: true, count: 'exact'` queries
 * return the real totals and transfer no rows at all.
 */
export async function countByStatus(): Promise<Record<QueueStatus, number>> {
  const results = await Promise.all(
    ALL_QUEUE_STATUSES.map(async (status) => {
      const res = await db().from('social_queue').select('id', { count: 'exact', head: true }).eq('status', status);
      if (res.error) throw friendlyError(res.error);
      return [status, res.count ?? 0] as const;
    }),
  );
  return Object.fromEntries(results) as Record<QueueStatus, number>;
}

/**
 * The same counts, rolled up through the single classification, plus the
 * invariant check on them. Every tile and every confirmation dialog on the
 * dashboard reads from this, so they cannot drift apart again.
 */
export async function queueSummary(): Promise<{ counts: Record<QueueStatus, number>; summary: QueueSummary }> {
  const counts = await countByStatus();
  const summary = summarizeQueue(counts);
  await reportViolations(checkQueueInvariants(counts, summary), 'queue');
  return { counts, summary };
}

/**
 * Invariant violations reach the owner the way everything else does — as a
 * Hebrew line in the activity log, never as an error on screen. Best-effort:
 * a log that cannot be written must not break the screen it was describing.
 */
async function reportViolations(violations: InvariantViolation[], subject: string): Promise<void> {
  const fresh = takeUnreported(violations, subject);
  for (const v of fresh) {
    await logClientActivity('warn', `invariant_${v.code}`, `אי-התאמה בספירת הפרסומים — ${v.message}`, v.meta);
  }
}

/* ------------------------------------------------------------------ log */

/** Publications in a window, for the dashboard's "today"/"this week" tiles. */
export async function countPublishedBetween(sinceISO: string, untilISO?: string): Promise<number> {
  let q = db().from('social_queue').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('published_at', sinceISO);
  if (untilISO) q = q.lte('published_at', untilISO);
  const res = await q;
  if (res.error) throw friendlyError(res.error);
  return res.count ?? 0;
}

export async function listActivity(limit = 40): Promise<ActivityEntry[]> {
  return unwrap<ActivityEntry[]>(await db().from('social_activity_log').select('*').order('at', { ascending: false }).limit(limit));
}

/** Creates a "publish now" schedule and kicks the worker immediately. */
export async function publishNow(postId: string, targetIds: string[]): Promise<void> {
  await createSchedule({
    post_id: postId,
    mode: 'now',
    timezone: 'Asia/Jerusalem',
    run_at: new Date().toISOString(),
    weekly: {},
    interval_days: null,
    interval_time: null,
    target_ids: targetIds,
  });
  await callSocialApi('/api/social/run');
}

/* ------------------------------------------------- live queue tuning */

/**
 * Everything the "הפרסום הבא" tuner needs about the queue that is still
 * waiting, in one read.
 *
 * "Pending" here means a row that has not started yet — 'scheduled' or
 * 'paused'. A 'publishing' / 'awaiting_confirmation' row is already mid-flight
 * and its instant is no longer ours to move, so it is deliberately out.
 *
 * Read it from the database rather than from whatever the dashboard happens to
 * be holding: src/app/social/page.tsx loads the queue newest-first with a limit
 * of 40, so with a long queue that array holds the FURTHEST-OUT rows, not the
 * next ones. A tuner that respaced that array would respace the wrong rows.
 */
export interface LiveQueueTarget {
  target: SocialTarget;
  /** Rows still waiting for this group. */
  pending: number;
  /** ISO of its soonest pending row. */
  nextAt: string | null;
}

export interface LiveQueuePlan {
  /** Pending rows, soonest first. */
  rows: QueueRow[];
  /** The gap actually between consecutive rows now (median). null if < 2 rows. */
  gapMinutes: number | null;
  /** The floor rules.ts enforces for a GROUP target right now. */
  effectiveGapMinutes: number;
  targets: LiveQueueTarget[];
  /** The post the pending rows belong to; null if they are mixed. */
  postId: string | null;
  campaignId: string | null;
  /**
   * The read hit LIVE_QUEUE_LIMIT, so `rows` is the soonest 500 and not the
   * whole queue. Additive to the agreed contract, and the screen needs it:
   * without it "ממתינים בתור: 500" is presented as a total when it is a cap,
   * and respaceQueue — which reads under the same limit — would leave the rows
   * beyond it sitting on instants the respaced ones now overlap.
   */
  truncated: boolean;
}

/**
 * Re-timeable rows: waiting on the clock rather than on a worker or a person.
 * From the single classification, so "pending" here means what it means
 * everywhere else in the module.
 */
const PENDING: QueueItem['status'][] = AUTOMATIC_WAITING_STATUSES;

/** A hard ceiling so one screen can never pull an unbounded table. */
const LIVE_QUEUE_LIMIT = 500;

/**
 * Same shape as QUEUE_SELECT, but the whole target row — the tuner lists the
 * groups themselves (picture, name, channel), not just the name on a row.
 */
const LIVE_QUEUE_SELECT =
  '*, target:social_targets(*), post:social_posts(id,title,media,link_url), variant:social_variants(id,label)';

/**
 * The median gap, not the mean: one row that somebody dragged a day out would
 * pull an average far away from the spacing every other row actually has, and
 * the owner would be shown a number that matches nothing on their screen.
 * Whole minutes, because that is the unit they edit in.
 */
function medianGapMinutes(sortedISO: string[]): number | null {
  if (sortedISO.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < sortedISO.length; i += 1) {
    const ms = new Date(sortedISO[i]).getTime() - new Date(sortedISO[i - 1]).getTime();
    if (Number.isFinite(ms)) gaps.push(Math.round(ms / 60_000));
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

/**
 * What rules.ts will actually demand between two GROUP publications:
 * src/lib/social/rules.ts adds browser.groupMinGapMinutes on top of
 * limits.minGapMinutes whenever the target's channel is 'facebook_group'.
 * Both settings are editable on the settings screen, so they are always read —
 * never assumed to still be the 45 + 20 the defaults ship with.
 */
export function effectiveGroupGap(limits: LimitsSettings, browser: BrowserSettings): number {
  return Math.max(0, Math.round(limits.minGapMinutes + browser.groupMinGapMinutes));
}

export async function liveQueuePlan(opts: { campaignId?: string } = {}): Promise<LiveQueuePlan> {
  let query = db()
    .from('social_queue')
    .select(LIVE_QUEUE_SELECT)
    .in('status', PENDING)
    .order('scheduled_at', { ascending: true })
    .limit(LIVE_QUEUE_LIMIT);
  if (opts.campaignId) query = query.eq('campaign_id', opts.campaignId);

  // One queue read; the two settings rows are the only other traffic, and they
  // are what decides whether the spacing on screen is even legal. All three go
  // out together — `await query` inside the array would have run first and made
  // this three round trips on a phone instead of one.
  const [rowsRes, limits, browser] = await Promise.all([query, getLimits(), getBrowserSettings()]);
  const rows = unwrap<QueueRow[]>(rowsRes);

  const targets: LiveQueueTarget[] = [];
  const byTarget = new Map<string, LiveQueueTarget>();
  for (const row of rows) {
    if (!row.target) continue;
    const seen = byTarget.get(row.target_id);
    if (seen) {
      seen.pending += 1;
      // Rows arrive ascending, so the first one seen is already the soonest.
      continue;
    }
    const entry: LiveQueueTarget = { target: row.target as SocialTarget, pending: 1, nextAt: row.scheduled_at };
    byTarget.set(row.target_id, entry);
    targets.push(entry);
  }

  const postIds = new Set(rows.map((r) => r.post_id));
  const campaignIds = new Set(rows.map((r) => r.campaign_id ?? null));

  return {
    rows,
    gapMinutes: medianGapMinutes(rows.map((r) => r.scheduled_at)),
    effectiveGapMinutes: effectiveGroupGap(limits, browser),
    targets,
    // Only a queue that is one post's can be added to — see addTargetsToQueue.
    postId: postIds.size === 1 ? [...postIds][0] : null,
    campaignId: opts.campaignId ?? (campaignIds.size === 1 ? ([...campaignIds][0] ?? null) : null),
    truncated: rows.length >= LIVE_QUEUE_LIMIT,
  };
}

/** The owner's own number, guarded. Not a Facebook limit and not a promise about one. */
export const MIN_GAP_MINUTES = 1;
export const MAX_GAP_MINUTES = 720;

/**
 * Postgres 23505 — the unique index (schedule_id, target_id, scheduled_at).
 * Recognised by code rather than by message text, because the message is
 * English, it names the constraint, and it is never shown to anyone.
 */
function isDuplicateSlot(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === '23505';
}

export interface GapSplit {
  /** What was asked for — the number the owner typed. */
  gapMinutes: number;
  /** What was written to limits.minGapMinutes. */
  minGapMinutes: number;
  /** What was written to (or left in) browser.groupMinGapMinutes. */
  groupMinGapMinutes: number;
  /** True when the owner's group surcharge had to move; the screen must SAY so. */
  surchargeChanged: boolean;
}

/**
 * Makes rules.ts demand exactly `gapMinutes` between two GROUP publications,
 * and returns what it wrote.
 *
 * This is the half of respaceQueue() that actually makes a spacing real, lifted
 * out so that anything which CREATES a queue (quick publish) can reuse it
 * instead of copying it. Re-stamping rows is a different job and stays below.
 *
 * WHY IT IS NEEDED AT ALL: src/lib/social/rules.ts defers a group publication
 * whenever now - lastPublishedAt < (limits.minGapMinutes +
 * browser.groupMinGapMinutes) * 60_000, and re-times the deferred row off the
 * LAST PUBLICATION rather than off its own scheduled_at. So scheduling rows 12
 * minutes apart while the engine still wants 65 does nothing at all: every row
 * is pushed back again on every claim, each claim burns one of the 40 attempts
 * the engine allows, and then the row is skipped. That is exactly how a campaign
 * on this deployment ended 112 skipped, 0 published.
 *
 * THE SPLIT, and why this one: groupMinGapMinutes is the owner's "groups need
 * more air than pages" surcharge; it is a deliberate setting and not ours to
 * reinterpret. So it stays put and the difference comes out of the global gap:
 *     limits.minGapMinutes = gapMinutes - browser.groupMinGapMinutes
 * If that would be negative — a gap smaller than the surcharge alone — the
 * global gap goes to 0 and the surcharge itself becomes the whole number. That
 * is the only way to honour the request, and `surchargeChanged` comes back true
 * so the caller can say it in words. Silently rewriting a setting the owner
 * chose is exactly the kind of thing they would never find out about.
 *
 * Both objects are written WHOLE. getSetting() spreads the defaults UNDER the
 * stored value, but saveSetting() replaces the entire jsonb — writing
 * { minGapMinutes } alone would wipe maxPerDay, maxPerTargetPerDay and dedupeDays.
 *
 * Global by nature: rules.ts has one spacing setting for the whole account, not
 * one per campaign. There is no scoped version of this and pretending otherwise
 * would be worse than saying so.
 */
export async function applyGapSettings(gapMinutes: number): Promise<GapSplit> {
  if (!Number.isInteger(gapMinutes) || gapMinutes < MIN_GAP_MINUTES || gapMinutes > MAX_GAP_MINUTES) {
    throw new Error(`המרווח צריך להיות מספר שלם של דקות, בין ${MIN_GAP_MINUTES} ל-${MAX_GAP_MINUTES}.`);
  }

  const [limits, browser] = await Promise.all([getLimits(), getBrowserSettings()]);
  const surcharge = Math.max(0, Math.round(browser.groupMinGapMinutes));
  const globalGap = gapMinutes >= surcharge ? gapMinutes - surcharge : 0;
  const newSurcharge = gapMinutes >= surcharge ? surcharge : gapMinutes;
  const surchargeChanged = newSurcharge !== browser.groupMinGapMinutes;

  // Settings first, always. The worker re-reads 'limits' and 'browser' on every
  // tick (worker/social-worker.ts), so from this moment the new spacing is the
  // one being enforced — and a row created (or moved) a second later is measured
  // against the number the owner just chose, not the old one.
  await saveSetting('limits', { ...limits, minGapMinutes: globalGap });
  if (surchargeChanged) await saveSetting('browser', { ...browser, groupMinGapMinutes: newSurcharge });

  return { gapMinutes, minGapMinutes: globalGap, groupMinGapMinutes: newSurcharge, surchargeChanged };
}

/**
 * Re-spaces the waiting queue to one publication every `gapMinutes`, and — the
 * part that actually makes it work — moves the settings so that the engine
 * agrees with the new spacing.
 *
 * WHY THE SETTINGS WRITE IS THE POINT, AND THE ROWS ARE NOT: moving the rows
 * without moving the settings is not a smaller version of this feature — it is a
 * queue that quietly dies, because rules.ts re-times every "too soon" row off the
 * last publication and skips it after 40 attempts. The write, the split and the
 * reason for the split now live in applyGapSettings() above, which quick publish
 * reuses; this function is the half that re-stamps the rows.
 *
 * Returns the number of rows that actually moved.
 */
export async function respaceQueue(gapMinutes: number, opts: { campaignId?: string; startAt?: string } = {}): Promise<number> {
  const startMs = opts.startAt ? new Date(opts.startAt).getTime() : NaN;
  // A minute from now by default: "now" would hand the worker a row it can claim
  // before the settings write below has landed.
  const start = Number.isFinite(startMs) ? startMs : Date.now() + 60_000;

  // Validates the number, splits it and writes both settings — see above. Note
  // the asymmetry, and it is deliberate: `campaignId` narrows which ROWS are
  // re-stamped, but the settings it writes are global.
  const { minGapMinutes: globalGap, groupMinGapMinutes: newSurcharge, surchargeChanged } = await applyGapSettings(gapMinutes);

  let query = db()
    .from('social_queue')
    .select('id, scheduled_at, status')
    .in('status', PENDING)
    .order('scheduled_at', { ascending: true })
    .limit(LIVE_QUEUE_LIMIT);
  if (opts.campaignId) query = query.eq('campaign_id', opts.campaignId);
  const pending = unwrap<{ id: string; scheduled_at: string; status: QueueItem['status'] }[]>(await query);

  const work = pending
    .map((row, i) => ({ id: row.id, next: new Date(start + i * gapMinutes * 60_000).toISOString(), was: row.scheduled_at }))
    // A row already sitting on its new instant needs no write, and skipping it
    // keeps the count we report equal to the number of rows that really moved.
    .filter((w) => w.next !== w.was);

  // social_queue has a UNIQUE index on (schedule_id, target_id, scheduled_at).
  // Two rows of one schedule for one group can therefore collide mid-respace if
  // one lands on an instant a row behind it has not vacated yet. Writing in the
  // direction of travel — last-first when the queue is moving later, first-first
  // when it is moving earlier — frees each instant before it is claimed, and is
  // enough for every queue that moves the same way all the way down.
  // Sequentially, because Supabase has no per-row UPDATE ... FROM and the order
  // is the whole point.
  const movingLater = work.length > 0 && new Date(work[0].next).getTime() >= new Date(work[0].was).getTime();
  const ordered = movingLater ? [...work].reverse() : work;

  let moved = 0;
  const writeRow = async (item: { id: string; next: string }) => {
    // Named statuses, like the rest of this file: a stale screen must never move
    // a row that has meanwhile started publishing.
    const res = await db()
      .from('social_queue')
      .update({ scheduled_at: item.next })
      .eq('id', item.id)
      .in('status', PENDING)
      .select('id');
    if (res.error) return res.error;
    moved += (res.data as { id: string }[] | null)?.length ?? 0;
    return null;
  };

  // A queue can also move BOTH ways at once — a longer gap starting earlier
  // pulls the head back while it pushes the tail out — and then no single
  // direction is collision-free. Rather than reason about which row crosses
  // which, a row that hits the unique index is simply set aside and written
  // again once every other row has vacated. One retry pass is all it can ever
  // need: after the first pass nothing of ours is left on an old instant.
  const blocked: { id: string; next: string }[] = [];
  let failed = 0;
  let firstError: unknown = null;
  for (const item of ordered) {
    const err = await writeRow(item);
    if (!err) continue;
    if (isDuplicateSlot(err)) {
      blocked.push(item);
      continue;
    }
    failed += 1;
    firstError ??= err;
  }
  for (const item of blocked) {
    const err = await writeRow(item);
    if (!err) continue;
    // Still taken — by a row outside this respace (another campaign's, or one
    // already publishing). Counted and reported, never swallowed.
    failed += 1;
    firstError ??= err;
  }

  const cappedNote = pending.length >= LIVE_QUEUE_LIMIT ? ` (רק ${LIVE_QUEUE_LIMIT} הפרסומים הקרובים בתור תוזמנו מחדש)` : '';
  const surchargeNote = surchargeChanged
    ? ` (המרווח הנוסף לקבוצות עודכן ל-${newSurcharge} דק׳ והמרווח הכללי ל-${globalGap} דק׳)`
    : '';
  await logClientActivity(
    failed ? 'warn' : 'info',
    'queue_respaced',
    `המרווח בין פרסומים נקבע ל-${gapMinutes} דק׳ — ${moved} פרסומים תוזמנו מחדש${cappedNote}${surchargeNote}`,
    { gapMinutes, minGapMinutes: globalGap, groupMinGapMinutes: newSurcharge, moved, failed, campaignId: opts.campaignId ?? null },
  );

  // Half-applied is a real outcome and the owner is told the real numbers,
  // through the same classifier every other failure here goes through.
  if (failed) {
    throw new Error(`${moved} פרסומים תוזמנו מחדש, אבל ${failed} לא זזו: ${friendlyMessage(firstError)}`);
  }
  return moved;
}

/**
 * Takes one group out of the waiting queue. Cancels exactly the way the rest of
 * this file cancels a row — status 'skipped' with a reason the owner can read in
 * the history — and names the statuses it is allowed to touch, so a publication
 * that already happened, or one that is running right now, is never rewritten.
 *
 * AND stops it being planned again, which is the half that makes the button
 * real. Cancelling the rows alone is undone within a minute: src/lib/social/plan.ts
 * runs every 60 seconds, occupiedSlots() deliberately ignores 'skipped' rows so
 * that a skipped publication may be re-planned, and the group is still listed in
 * schedule.target_ids — so a weekly or interval campaign puts every row straight
 * back, at the same instants, and the owner watches a group they removed reappear.
 * So the target is taken off the schedules that queued those rows too. A schedule
 * left with no targets at all can never produce anything again, so it is retired
 * rather than left ticking.
 *
 * Scope: only the schedules that actually put the cancelled rows there. A schedule
 * that has never been materialised holds no rows to cancel, so there is nothing
 * here to undo — it is still the scheduler screen's job to edit it.
 *
 * Returns how many rows were cancelled.
 */
export async function removeTargetFromQueue(targetId: string, opts: { campaignId?: string } = {}): Promise<number> {
  const { data: target } = await db().from('social_targets').select('name').eq('id', targetId).maybeSingle();
  const name = (target as { name?: string } | null)?.name ?? '';

  let query = db()
    .from('social_queue')
    .update({ status: 'skipped', step: '', skip_reason: name ? `הקבוצה "${name}" הוסרה מהתור` : 'הקבוצה הוסרה מהתור' })
    .eq('target_id', targetId)
    .in('status', CANCELLABLE);
  if (opts.campaignId) query = query.eq('campaign_id', opts.campaignId);
  const rows = unwrap<{ id: string; schedule_id: string | null }[]>(await query.select('id, schedule_id'));

  const unplanned = await unplanTarget(targetId, [...new Set(rows.map((r) => r.schedule_id).filter((id): id is string => Boolean(id)))]);

  await logClientActivity(
    'info',
    'queue_target_removed',
    `${name ? `הקבוצה "${name}"` : 'קבוצה'} הוסרה מהתור — ${rows.length} פרסומים בוטלו${unplanned ? `, והקבוצה הוסרה מ-${unplanned} תזמונים פעילים` : ''}`,
    { targetId, cancelled: rows.length, unplannedSchedules: unplanned, campaignId: opts.campaignId ?? null },
  );
  return rows.length;
}

/**
 * Takes a target off the given schedules so the planner stops re-creating rows
 * for it. Returns how many ACTIVE schedules were actually changed — an inactive
 * one ('now', 'once' and 'drip' retire themselves the moment they are planned)
 * can no longer produce anything, so it is left exactly as it is, as the record
 * of what was sent.
 */
async function unplanTarget(targetId: string, scheduleIds: string[]): Promise<number> {
  if (!scheduleIds.length) return 0;
  const schedules = unwrap<Pick<Schedule, 'id' | 'target_ids'>[]>(
    await db().from('social_schedules').select('id, target_ids').in('id', scheduleIds).eq('active', true),
  );
  let changed = 0;
  for (const schedule of schedules) {
    const remaining = (schedule.target_ids ?? []).filter((id) => id !== targetId);
    if (remaining.length === (schedule.target_ids ?? []).length) continue;
    // A schedule with no targets left has nothing to publish to; leaving it
    // active would only keep an empty plan alive in every future planner run.
    const patch = remaining.length ? { target_ids: remaining } : { target_ids: remaining, active: false };
    unwrap(await db().from('social_schedules').update(patch).eq('id', schedule.id));
    changed += 1;
  }
  return changed;
}

/**
 * The browser's half of plan.ts's dedupe hash.
 *
 * rules.ts looks a publication up by dedupe_hash to catch the same content going
 * out twice, and every hash already in the table was written by node's
 * createHash('sha256')...digest('hex') (src/lib/social/plan.ts, and sha256() in
 * server/crypto.ts). Both of those are server-only imports by design, so a row
 * created here has to reproduce that digest exactly — lowercase hex, two
 * characters per byte, zero-padded. Get it wrong and nothing breaks loudly: the
 * duplicate check simply stops matching, which is the worst kind of bug to ship
 * into a rule whose whole job is to be invisible when it works.
 */
async function sha256Hex(value: string): Promise<string> {
  // crypto.subtle exists only in a secure context (https, or localhost). On a
  // plain-http LAN address it is undefined, and an empty dedupe_hash would make
  // rules.ts skip the duplicate check entirely — so we refuse instead.
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('אי אפשר להוסיף קבוצות מהכתובת הזו. פתחו את המערכת בכתובת מאובטחת (https) ונסו שוב.');
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Adds groups to the queue that is already running: one row each, appended after
 * the last waiting row, one gap apart.
 *
 * The text and the variant are COPIED from a row that is already waiting for this
 * post rather than re-derived. Re-rendering here would mean re-running
 * pickVariant()'s rotation out of context and could hand the new group a variant
 * the owner never approved — rules.ts would then skip the row and the owner would
 * be left with a group in the list that never publishes.
 *
 * schedule_id stays null: the unique index (schedule_id, target_id, scheduled_at)
 * treats NULLs as distinct, so a hand-made row can never collide with a planned
 * one. The cost is that setScheduleActive(false) will not reach these rows — they
 * are cancelled by removeTargetFromQueue or by stopping the campaign.
 *
 * Returns how many rows were created.
 */
export async function addTargetsToQueue(targetIds: string[], opts: { campaignId?: string } = {}): Promise<number> {
  const wanted = [...new Set(targetIds.filter(Boolean))];
  if (!wanted.length) return 0;

  const plan = await liveQueuePlan(opts);
  if (!plan.rows.length) throw new Error('אין כרגע תור פעיל להוסיף אליו קבוצות.');
  // Honest refusal: with rows from more than one post there is no single text to
  // copy, and guessing which post the owner meant is worse than saying so.
  if (!plan.postId) throw new Error('בתור ממתינים פוסטים שונים, ולכן אי אפשר להוסיף קבוצות מכאן. הוסיפו אותן מתוך הפוסט עצמו.');

  // Prefer a row that actually carries text. The workers fall back to
  // renderPostText() when rendered_text is empty, so copying an empty one would
  // publish fine but store a dedupe_hash of the empty string — a hash that
  // matches nothing the worker ever publishes, quietly disabling the
  // duplicate-content rule for the new row.
  const withText = plan.rows.find((r) => r.post_id === plan.postId && r.rendered_text);
  const template = withText ?? plan.rows.find((r) => r.post_id === plan.postId);
  if (!template) throw new Error('לא נמצא פרסום קיים להעתיק ממנו את התוכן.');

  const already = new Set(plan.rows.filter((r) => r.post_id === plan.postId).map((r) => r.target_id));
  /*
   * The plan above was read before the gap and the template were worked out, so
   * it is already a little old. This second, narrow read is taken as late as
   * possible and covers every unfinished status rather than only the two the
   * tuner re-times — a row that moved to manual_pending or needs_attention in
   * the meantime is still this post waiting for this group.
   *
   * It narrows the double-tap window; it does not close it. These rows carry
   * schedule_id null, and the unique index is (schedule_id, target_id,
   * scheduled_at) with NULLs distinct, so the database cannot refuse a twin —
   * two calls that both read before either insert lands would still compute the
   * same instant for the same group. Closing it properly needs a partial unique
   * index on (post_id, target_id) for open rows, which is a migration, not a
   * change here. Publishing is not at risk either way: the workers run one job
   * at a time and rules.ts refuses a post that has already gone to a target.
   */
  const { data: openRows } = await db()
    .from('social_queue')
    .select('target_id')
    .eq('post_id', plan.postId)
    .in('target_id', wanted)
    .in('status', OPEN_STATUSES);
  for (const row of (openRows ?? []) as { target_id: string }[]) already.add(row.target_id);
  const fresh = wanted.filter((id) => !already.has(id));
  // Skipping instead of double-booking: a second row for the same group and the
  // same post would be skipped by rules.ts anyway ("הפוסט הזה כבר פורסם ל-…").
  if (!fresh.length) return 0;

  const gap = Math.max(MIN_GAP_MINUTES, plan.gapMinutes ?? plan.effectiveGapMinutes);
  const last = plan.rows[plan.rows.length - 1];
  const lastMs = new Date(last.scheduled_at).getTime();
  const from = Number.isFinite(lastMs) ? lastMs : Date.now();
  const mediaUrls = (template.post?.media ?? []).map((m: MediaItem) => m.url);

  const rows = await Promise.all(
    fresh.map(async (targetId, i) => ({
      schedule_id: null,
      post_id: plan.postId as string,
      // plan.ts reads campaign_id off the POST, and the template row was planned
      // from that same post, so it already carries the right value.
      campaign_id: template.campaign_id ?? null,
      variant_id: template.variant_id,
      target_id: targetId,
      scheduled_at: new Date(from + (i + 1) * gap * 60_000).toISOString(),
      status: 'scheduled' as const,
      // '' means "terminal" elsewhere in this codebase; the planner sets 'pending'.
      step: 'pending',
      require_confirmation: Boolean(template.require_confirmation),
      // Both of these default to '' in the schema, and both defaults are traps:
      // an empty rendered_text publishes an empty post, and an empty dedupe_hash
      // turns the duplicate-content rule off for this row.
      rendered_text: template.rendered_text,
      dedupe_hash: await sha256Hex(dedupeKey(targetId, template.rendered_text, mediaUrls)),
    })),
  );

  const inserted = unwrap<{ id: string }[]>(await db().from('social_queue').insert(rows).select('id'));
  await logClientActivity('info', 'queue_targets_added', `${inserted.length} קבוצות נוספו לתור, כל אחת ${gap} דק׳ אחרי הקודמת`, {
    targetIds: fresh,
    added: inserted.length,
    gapMinutes: gap,
    postId: plan.postId,
    campaignId: opts.campaignId ?? null,
  });
  return inserted.length;
}
