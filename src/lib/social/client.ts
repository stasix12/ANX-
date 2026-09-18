'use client';

import { supabase } from '@/lib/supabase';
import {
  DEFAULT_BUSINESS,
  DEFAULT_LIMITS,
  type ActivityEntry,
  type BusinessSettings,
  type Campaign,
  type ControlSettings,
  type LimitsSettings,
  type MediaItem,
  type Post,
  type QueueItem,
  type Schedule,
  type SocialAccount,
  type SocialTarget,
  type Variant,
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
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/* ------------------------------------------------------------------ API */

export async function callSocialApi<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('נדרשת התחברות.');
  const res = await fetch(path, {
    method: init.method ?? 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `הבקשה נכשלה (${res.status}).`);
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

export async function setPaused(paused: boolean): Promise<void> {
  const control = await getControl();
  await saveSetting('control', { ...control, paused });
}

/* -------------------------------------------------------------- targets */

export async function listTargets(): Promise<SocialTarget[]> {
  return unwrap<SocialTarget[]>(await db().from('social_targets').select('*').order('channel').order('name'));
}

export async function updateTarget(id: string, patch: Partial<Pick<SocialTarget, 'enabled' | 'name' | 'url' | 'notes'>>): Promise<void> {
  unwrap(await db().from('social_targets').update(patch).eq('id', id));
}

export async function addManualGroup(input: { name: string; url: string; notes?: string }): Promise<SocialTarget> {
  return unwrap<SocialTarget>(
    await db()
      .from('social_targets')
      .insert({
        channel: 'facebook_group_manual',
        external_id: '',
        name: input.name,
        url: input.url,
        notes: input.notes ?? '',
        permission_status: 'manual_only',
        can_api_publish: false,
        enabled: true,
      })
      .select('*')
      .single(),
  );
}

export async function deleteTarget(id: string): Promise<void> {
  unwrap(await db().from('social_targets').delete().eq('id', id));
}

export async function getAccount(): Promise<SocialAccount | null> {
  return unwrap<SocialAccount | null>(
    await db().from('social_accounts').select('*').is('revoked_at', null).order('connected_at', { ascending: false }).limit(1).maybeSingle(),
  );
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

export async function deleteCampaign(id: string): Promise<void> {
  unwrap(await db().from('social_campaigns').delete().eq('id', id));
}

/* ---------------------------------------------------------------- posts */

export async function listPosts(): Promise<Post[]> {
  return unwrap<Post[]>(await db().from('social_posts').select('*').neq('status', 'archived').order('updated_at', { ascending: false }));
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

export async function archivePost(id: string): Promise<void> {
  unwrap(await db().from('social_posts').update({ status: 'archived' }).eq('id', id));
  unwrap(await db().from('social_schedules').update({ active: false }).eq('post_id', id));
  unwrap(await db().from('social_queue').update({ status: 'skipped', skip_reason: 'הפוסט הועבר לארכיון' }).eq('post_id', id).eq('status', 'scheduled'));
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

export async function uploadMedia(file: File): Promise<MediaItem> {
  const client = db();
  const kind: MediaItem['kind'] = file.type.startsWith('video/') ? 'video' : 'image';
  const ext = (file.name.split('.').pop() ?? (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage.from('social-media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from('social-media').getPublicUrl(path);
  return { kind, url: data.publicUrl, path, name: file.name };
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

export async function listSchedules(postId?: string): Promise<Schedule[]> {
  let q = db().from('social_schedules').select('*').order('created_at', { ascending: false });
  if (postId) q = q.eq('post_id', postId);
  return unwrap<Schedule[]>(await q);
}

export async function setScheduleActive(id: string, active: boolean): Promise<void> {
  unwrap(await db().from('social_schedules').update({ active }).eq('id', id));
  if (!active) {
    unwrap(
      await db()
        .from('social_queue')
        .update({ status: 'skipped', skip_reason: 'התזמון בוטל' })
        .eq('schedule_id', id)
        .eq('status', 'scheduled'),
    );
  }
}

/* ---------------------------------------------------------------- queue */

export interface QueueRow extends QueueItem {
  target: Pick<SocialTarget, 'id' | 'name' | 'channel' | 'url'> | null;
  post: Pick<Post, 'id' | 'title' | 'media' | 'link_url'> | null;
  variant: Pick<Variant, 'id' | 'label'> | null;
}

const QUEUE_SELECT =
  '*, target:social_targets(id,name,channel,url), post:social_posts(id,title,media,link_url), variant:social_variants(id,label)';

export async function listQueue(opts: { status?: QueueItem['status'][]; since?: string; until?: string; limit?: number } = {}): Promise<QueueRow[]> {
  let q = db().from('social_queue').select(QUEUE_SELECT).order('scheduled_at', { ascending: false }).limit(opts.limit ?? 200);
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

export async function retryQueueItem(id: string): Promise<void> {
  await updateQueueItem(id, { status: 'scheduled', scheduled_at: new Date().toISOString(), error: null, skip_reason: null });
}

export async function cancelQueueItem(id: string): Promise<void> {
  await updateQueueItem(id, { status: 'skipped', skip_reason: 'בוטל ידנית' });
}

export async function markManualPublished(id: string, permalink: string): Promise<void> {
  await updateQueueItem(id, { status: 'published', published_at: new Date().toISOString(), permalink: permalink || null, error: null });
}

export async function cancelAllScheduled(): Promise<number> {
  const rows = unwrap<{ id: string }[]>(
    await db().from('social_queue').update({ status: 'skipped', skip_reason: 'בוטל — עצירת כל התורים' }).eq('status', 'scheduled').select('id'),
  );
  return rows.length;
}

export async function countPublishedSince(sinceISO: string): Promise<number> {
  const res = await db().from('social_queue').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('published_at', sinceISO);
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}

export async function countByStatus(): Promise<Record<QueueItem['status'], number>> {
  const rows = unwrap<{ status: QueueItem['status'] }[]>(await db().from('social_queue').select('status'));
  const out: Record<QueueItem['status'], number> = { scheduled: 0, publishing: 0, published: 0, failed: 0, skipped: 0, manual_pending: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}

/* ------------------------------------------------------------------ log */

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
