'use client';

import { supabase } from '@/lib/supabase';
import { campaignState, type CampaignQueueRow, type CampaignState } from './campaign';
import { detectCity } from './cities';
import { friendlyError } from './errors';
import {
  DEFAULT_BROWSER,
  DEFAULT_BUSINESS,
  DEFAULT_LIMITS,
  WORKER_OFFLINE_AFTER_SECONDS,
  parseGroupUrl,
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
  type SocialAccount,
  type SocialTarget,
  type SocialWorker,
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
  const body = await res.json().catch(() => ({}));
  // A route may hand back a raw backend message; it never reaches the screen
  // unclassified.
  if (!res.ok) throw friendlyError(body?.error ?? `HTTP ${res.status}`, `הבקשה נכשלה (${res.status}).`);
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
  const parsed = parseGroupUrl(input.url);
  if (!parsed) throw new Error('כתובת לא תקינה — צריך קישור בסגנון facebook.com/groups/…');
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

export async function bulkUpdateTargets(ids: string[], patch: Partial<Pick<SocialTarget, 'enabled' | 'favorite' | 'category'>>): Promise<void> {
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
  if (!source) throw new Error('הקמפיין לא נמצא.');
  const { id: _id, created_at: _c, ...rest } = source;
  return unwrap<Campaign>(
    await db()
      .from('social_campaigns')
      .insert({ ...rest, name: `${source.name} — עותק`, status: 'active' })
      .select('*')
      .single(),
  );
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
  if (error) throw friendlyError(error);
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

/** True when the post still has scheduled (not yet published) queue rows. */
export async function hasPendingQueue(postId: string): Promise<number> {
  const res = await db().from('social_queue').select('id', { count: 'exact', head: true }).eq('post_id', postId).in('status', ['scheduled', 'publishing', 'awaiting_confirmation']);
  if (res.error) throw friendlyError(res.error);
  return res.count ?? 0;
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
  target: Pick<SocialTarget, 'id' | 'name' | 'channel' | 'url' | 'image_url'> | null;
  post: Pick<Post, 'id' | 'title' | 'media' | 'link_url'> | null;
  variant: Pick<Variant, 'id' | 'label'> | null;
}

const QUEUE_SELECT =
  '*, target:social_targets(id,name,channel,url,image_url), post:social_posts(id,title,media,link_url), variant:social_variants(id,label)';

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

/**
 * Retry and cancel both name the statuses they are allowed to act on, so a
 * stale screen (or a second tap while the first request is in flight) can
 * never move a row that has since started publishing or already published.
 * The write simply matches nothing and the caller reloads the real state.
 */
const RETRYABLE: QueueItem['status'][] = ['failed', 'skipped', 'needs_attention', 'scheduled', 'paused'];
const CANCELLABLE: QueueItem['status'][] = ['scheduled', 'awaiting_confirmation', 'needs_attention', 'paused', 'manual_pending'];

async function guardedUpdate(id: string, allowed: QueueItem['status'][], patch: Partial<QueueItem>): Promise<boolean> {
  const rows = unwrap<{ id: string }[]>(await db().from('social_queue').update(patch).eq('id', id).in('status', allowed).select('id'));
  return rows.length > 0;
}

export async function retryQueueItem(id: string): Promise<boolean> {
  return guardedUpdate(id, RETRYABLE, {
    status: 'scheduled',
    step: 'pending',
    scheduled_at: new Date().toISOString(),
    error: null,
    skip_reason: null,
  });
}

export async function cancelQueueItem(id: string): Promise<boolean> {
  return guardedUpdate(id, CANCELLABLE, { status: 'skipped', step: '', skip_reason: 'בוטל ידנית' });
}

export async function confirmQueueItem(id: string): Promise<void> {
  await updateQueueItem(id, { confirmed_at: new Date().toISOString() });
}

/** Rows a browser worker parked because Facebook asked for a human. */
export async function resumeNeedsAttention(postId?: string): Promise<number> {
  let q = db().from('social_queue').update({ status: 'scheduled', step: 'pending', error: null, scheduled_at: new Date().toISOString() }).eq('status', 'needs_attention');
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
      .or(`status.in.(scheduled,publishing,awaiting_confirmation,needs_attention,paused),and(status.in.(published,failed),updated_at.gte.${since})`)
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
    `הקמפיין "${campaign?.name ?? ''}" ${paused ? 'הושהה' : 'חזר לפעול'}`,
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
      .update({ status: 'skipped', step: '', skip_reason: 'הקמפיין נעצר' })
      .eq('campaign_id', id)
      .in('status', ['scheduled', 'awaiting_confirmation', 'needs_attention', 'paused'])
      .select('id'),
  );
  await logClientActivity('warn', 'campaign_stopped', `הקמפיין "${campaign?.name ?? ''}" נעצר — ${rows.length} פרסומים שטרם התחילו בוטלו`, {
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
  const out: Record<string, CampaignState> = {};
  for (const [id, list] of grouped) out[id] = campaignState(list, byId.get(id) ?? null);
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

/** Every queue row of one campaign, with its target — the control centre's feed. */
export async function campaignQueue(campaignId: string): Promise<QueueRow[]> {
  return unwrap<QueueRow[]>(
    await db().from('social_queue').select(QUEUE_SELECT).eq('campaign_id', campaignId).order('scheduled_at').limit(1000),
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

export async function sendWorkerCommand(workerId: string | null, command: WorkerCommandName): Promise<WorkerCommand> {
  return unwrap<WorkerCommand>(await db().from('social_worker_commands').insert({ worker_id: workerId, command }).select('*').single());
}

export async function listRecentCommands(limit = 5): Promise<WorkerCommand[]> {
  return unwrap<WorkerCommand[]>(await db().from('social_worker_commands').select('*').order('created_at', { ascending: false }).limit(limit));
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
      .in('status', ['scheduled', 'awaiting_confirmation', 'needs_attention', 'paused'])
      .select('id'),
  );
  return rows.length;
}

export async function countPublishedSince(sinceISO: string): Promise<number> {
  const res = await db().from('social_queue').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('published_at', sinceISO);
  if (res.error) throw friendlyError(res.error);
  return res.count ?? 0;
}

export async function countByStatus(): Promise<Record<QueueItem['status'], number>> {
  const rows = unwrap<{ status: QueueItem['status'] }[]>(await db().from('social_queue').select('status'));
  const out: Record<QueueItem['status'], number> = { scheduled: 0, publishing: 0, published: 0, failed: 0, skipped: 0, manual_pending: 0, needs_attention: 0, awaiting_confirmation: 0, paused: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
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
