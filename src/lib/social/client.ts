'use client';

import { supabase } from '@/lib/supabase';
import { campaignState, type CampaignQueueRow, type CampaignState } from './campaign';
import { detectCity } from './cities';
import { repeatColumns, type CampaignRepeat, type CampaignSchedule } from './campaign-schedule';
import { JOINED_QUERY, normalizeQuery } from './discovery';
import { dedupeKey } from './compose';
import { friendlyError, friendlyMessage } from './errors';
import { checkCampaignInvariants, checkQueueInvariants, takeUnreported, type InvariantViolation } from './invariants';
import {
  ALL_QUEUE_STATUSES,
  AUTOMATIC_WAITING_STATUSES,
  NEEDS_HUMAN_STATUSES,
  TERMINAL_STATUSES,
  CANCELLABLE_STATUSES,
  OPEN_STATUSES,
  summarizeQueue,
  type QueueSummary,
} from './status';
import { upsertScoped } from './tenant';
import {
  DEFAULT_BROWSER,
  DEFAULT_BUSINESS,
  DEFAULT_LIMITS,
  WORKER_OFFLINE_AFTER_SECONDS,
  parseGroupUrl,
  parseGroupShareUrl,
  TIMEZONE,
  type ActivityEntry,
  type WeeklyPlan,
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
  type QueueStatus,
  type Variant,
  type WorkerCommand,
  type WorkerCommandName,
  type DiscoveredGroupRow,
  type DiscoverySearchRow,
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
  // 'tenant_id,key' once supabase/social-latest.sql has widened the settings
  // key to one row per business, 'key' before then. src/lib/social/tenant.ts
  // says why the target is discovered rather than assumed.
  unwrap(await upsertScoped(
    (onConflict) => db().from('social_settings').upsert({ key, value }, { onConflict }),
    'tenant_id,key',
    'key',
  ));
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

/**
 * Groups and pages this account can publish to, with one piece of repair work
 * attached — and the repair is now done ONCE.
 *
 * THE BACKFILL. A row created before the city column existed has no city, and
 * every screen that groups by city needs one, so detectCity() fills it in from
 * the name and the row is updated to match. That part is unchanged: the same
 * function, the same value, the same column.
 *
 * WHAT WAS WRONG WITH IT. The updates were fired on EVERY call, with no memory
 * and no bound — one request per city-less group, all at once, every time
 * anything asked for the list. This function is called by the groups screen,
 * the post editor, the target picker, the queue tuner, the library's reach
 * calculation AND the dashboard's thirty-second poll. On an account where a
 * hundred groups predate the column, opening the groups screen opened a
 * hundred concurrent writes alongside the reads the screen was waiting for,
 * through the same connection — and did it again on the next visit, and the
 * one after, for ever, because a write that failed and a write that succeeded
 * both left the next call looking at the same freshly-read row.
 *
 * NOW: attempted once per row per session. `t.city` is still set in memory on
 * every call whether or not the write is made, so what the caller gets back is
 * byte-for-byte what it got before — the saving is entirely in requests that
 * were repeating work already done.
 */
const cityBackfilled = new Set<string>();

export async function listTargets(): Promise<SocialTarget[]> {
  const rows = unwrap<SocialTarget[]>(await db().from('social_targets').select('*').order('channel').order('name'));
  // Backfill cities for rows created before the column existed (or never classified).
  for (const t of rows) {
    if (t.city) continue;
    /* In memory for the caller, every time — this is what the screens read. */
    t.city = detectCity(t.name);
    if (cityBackfilled.has(t.id)) continue;
    cityBackfilled.add(t.id);
    db().from('social_targets').update({ city: t.city }).eq('id', t.id).then(() => undefined, () => undefined);
  }
  return rows;
}

export async function updateTarget(
  id: string,
  patch: Partial<Pick<SocialTarget, 'enabled' | 'name' | 'url' | 'notes' | 'city' | 'favorite' | 'category'>>,
): Promise<void> {
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
/**
 * Asks the worker to open these groups again — the one lever the browser has
 * over what the machine looks at next.
 *
 * `picture` is what separates the two callers. A sweep over every group is
 * asking one question: can this account still post there. A deliberate
 * refresh of ONE group is usually asking for its new cover. The worker cannot
 * tell those apart from a null timestamp, so the second one clears image_url
 * as well and the worker's rule becomes simply "fetch a picture when there
 * isn't one".
 *
 * It is worth the extra column, because the cover work is about sixteen of
 * the twenty-seven seconds a group costs — most of it a `networkidle` wait
 * Facebook does not satisfy — and over a hundred groups that is the
 * difference between an hour and twenty minutes.
 */
/* ────────────────────────────── גילוי קבוצות ──────────────────────────────
 *
 * Reads and writes for the discovery screen. None of these talk to Facebook:
 * the machine does that, once, when it is sent a `discover` command, and
 * everything below is about the rows it left behind.
 */

const DISCOVERY_COLUMNS =
  'id, external_id, name, url, image_url, members, privacy, membership, queries, first_seen_at, last_seen_at, target_id, hidden';

/** Every group a given phrase has ever turned up, newest sighting first. */
export async function listDiscovered(query?: string): Promise<DiscoveredGroupRow[]> {
  let q = db().from('social_discovery_groups').select(DISCOVERY_COLUMNS).order('last_seen_at', { ascending: false }).limit(500);
  if (query) {
    /*
     * `contains` on the array column, which the GIN index serves. The phrase
     * is normalised on the way in for the same reason it is normalised on the
     * way out: a chip copied from a Hebrew page carries invisible bidi marks,
     * and an exact match against the raw text would find nothing while looking
     * identical on screen.
     */
    q = q.contains('queries', [normalizeQuery(query)]);
  }
  return unwrap<DiscoveredGroupRow[]>(await q);
}

/**
 * The chips under the search box — what he has looked for before.
 *
 * THE RESERVED PHRASE IS NOT ONE OF THEM, and leaving it in did real damage.
 * The "my own groups" scan files its results under JOINED_QUERY so they share
 * the table, and that row came back here as an ordinary saved search: it
 * appeared as a chip, the screen loaded the newest search into the box on
 * arrival, and Facebook was handed "@joined" to search. It searched it
 * literally. The owner's screen filled with "JAMS Joined Artists Musicians
 * and Singers" and "I Started a Facebook Group But Nobody Joined", offered as
 * groups he belongs to — and because those results were filed under the same
 * reserved phrase, they became the "my groups" list itself.
 *
 * He never typed it. The machinery typed it for him.
 */
export async function listSearches(limit = 12): Promise<DiscoverySearchRow[]> {
  return unwrap<DiscoverySearchRow[]>(
    await db()
      .from('social_discovery_searches')
      .select('id, query, normalized, watching, last_run_at, previous_run_at, last_found')
      .neq('normalized', JOINED_QUERY)
      .order('last_run_at', { ascending: false, nullsFirst: false })
      .limit(limit),
  );
}

/**
 * The external ids already in the publishing list.
 *
 * "אם הקבוצה כבר קיימת ברשימת הקבוצות של מערכת הפרסום — להציג ✓ כבר במערכת."
 * The discovery row's own `target_id` is not enough on its own: a group he
 * added by pasting a link last month has no link to this row, and without
 * this read the screen would offer to add it a second time and the insert
 * would be refused by the unique index with an error he did not earn.
 *
 * One column, and only the groups — this runs beside a list of results.
 */
export async function listTargetExternalIds(): Promise<Set<string>> {
  const rows = unwrap<{ external_id: string }[]>(
    await db().from('social_targets').select('external_id').eq('channel', 'facebook_group').neq('external_id', ''),
  );
  return new Set(rows.map((r) => r.external_id));
}

/**
 * THE PICTURES THE PUBLISHING LIST ALREADY HAS, BY GROUP.
 *
 * "בקוביה הסגולה איפה שהאות תכניס לשם את התמונה של הקבוצה (כמו שאתה מושך
 *  מקבוצות שאני מכניס ידני)."
 *
 * He is pointing at a picture this app already holds. A group he added by hand
 * had its page opened once and its cover stored — so for every discovery row
 * marked "במערכת", the picture is sitting in social_targets under the same
 * Facebook id, and the row was drawing a letter beside it.
 *
 * Costs one small read of a table the screen already queries, and nothing else:
 * no Facebook traffic, no storage upload, no worker, and no waiting for the
 * next search. The discovery feature's own picture path still fills in the
 * groups he is NOT in — this is for the ones the app has already met.
 */
export async function listTargetPictures(): Promise<Map<string, string>> {
  const rows = unwrap<{ external_id: string; image_url: string | null }[]>(
    await db()
      .from('social_targets')
      .select('external_id, image_url')
      .eq('channel', 'facebook_group')
      .neq('external_id', '')
      .neq('image_url', ''),
  );
  const out = new Map<string, string>();
  for (const r of rows) if (r.image_url) out.set(r.external_id, r.image_url);
  return out;
}

/** Ask the machine to run a search. The answer arrives as rows, not as text. */
export async function startDiscovery(workerId: string | null, query: string): Promise<{ id: string }> {
  return sendWorkerCommand(workerId, 'discover', { query: query.trim() });
}

/**
 * Ask the machine to read Facebook's own list of the groups this account is
 * in — not a search.
 *
 * "אני רוצה לאחר שאני מצטרף לקבוצות שיהיה אופציה לראות קבוצות שעדיין לא
 *  התווספו למערכת ולהוסיף אותם במכה."
 *
 * It rides the `discover` command with a different source rather than taking a
 * name of its own, so the owner does not have to run another migration: the
 * CHECK on social_worker_commands lists every command by name.
 */
export async function startJoinedScan(workerId: string | null): Promise<{ id: string }> {
  return sendWorkerCommand(workerId, 'discover', { source: 'joined' });
}

/**
 * ASK THE MACHINE TO JOIN THE GROUPS HE TICKED.
 *
 * "תוסיף לי אופציה שאני יכול לסמן את הקבוצות האלה שאני לא נמצא בהם, ושהתוכנה
 *  תפתח קבוצה קבוצה ותצרתף אוטומטי."
 *
 * ADDRESSES AND NOT IDS, because the worker opens them: an id would have to be
 * turned into an address somewhere, and the place that builds a URL a browser
 * will visit with his live session should be the place that can be read for
 * it. The worker checks every one of them again with parseGroupUrl before it
 * opens anything — this list comes from a screen, and a screen is not
 * evidence.
 *
 * A COMMAND OF ITS OWN rather than riding `discover`, which costs one line of
 * SQL: the discover branch is documented "No join, no request, no click", and
 * that sentence is what makes it safe to point at a box the owner types into.
 */
export async function startJoinGroups(workerId: string | null, urls: string[]): Promise<{ id: string }> {
  return sendWorkerCommand(workerId, 'join', { urls: urls.slice(0, 200) });
}

/**
 * Everything that scan has ever found — AND ONLY WHAT IT CONFIRMED.
 *
 * The bucket alone is not enough. It was, and the owner watched ninety-three
 * groups named things like "joined me" offered to him as his own: a literal
 * search for the reserved phrase had landed in the same bucket, and the card
 * showed whatever was in it.
 *
 * `membership = member` is the second lock and the honest one. readMyGroups
 * sets it on every row it returns, because Facebook's own list of a person's
 * groups IS their membership; nothing a search writes can claim it without
 * the card having said so. Two independent things now have to be true before
 * a group is called his.
 */
export async function listJoined(): Promise<DiscoveredGroupRow[]> {
  const rows = await listDiscovered(JOINED_QUERY);
  /*
   * `hidden` goes out HERE rather than only where the missing list is built,
   * so the card's two numbers count the same set. They did not: the headline
   * counted every row and the list under it skipped the dismissed ones, so
   * dismissing the last missing group turned "מתוך 164 … 1 עוד לא ברשימת
   * הפרסום" into "כל 164 הקבוצות … כבר ברשימת הפרסום" — a sentence about 164
   * groups that was true of 163. On this card a dismissal means "זאת לא קבוצה
   * שלי", so a dismissed row is not one of his groups and is not counted as
   * one.
   */
  return rows.filter((r) => r.membership === 'member' && !r.hidden);
}

/** "לא מעניין אותי" — kept rather than deleted, or the next search brings it back. */
export async function hideDiscovered(id: string, hidden: boolean): Promise<void> {
  unwrap(await db().from('social_discovery_groups').update({ hidden }).eq('id', id));
}

/** Remember a phrase, so the screen can re-run it and say what is new. */
export async function watchSearch(id: string, watching: boolean): Promise<void> {
  unwrap(await db().from('social_discovery_searches').update({ watching }).eq('id', id));
}

/**
 * "הוסף לרשימת הקבוצות שלי" — one discovered group into the publishing list.
 *
 * The link back is written in a SECOND statement, on purpose: the group being
 * in the publishing list is the thing that matters, and a failure to record
 * which discovery row it came from must not undo it. Worst case the row says
 * "כבר במערכת" from listTargetExternalIds instead of from its own column,
 * which is the same sentence on screen.
 */
export async function adoptDiscovered(row: Pick<DiscoveredGroupRow, 'id' | 'url' | 'name'>): Promise<SocialTarget> {
  const target = await addGroup({ url: row.url, name: row.name });
  await db()
    .from('social_discovery_groups')
    .update({ target_id: target.id })
    .eq('id', row.id)
    .then(undefined, () => undefined);
  return target;
}

export async function requestGroupRefresh(ids?: string[], opts?: { picture?: boolean }): Promise<void> {
  const patch: Record<string, unknown> = { last_synced_at: null };
  if (opts?.picture) patch.image_url = '';
  let q = db().from('social_targets').update(patch).eq('channel', 'facebook_group');
  if (ids?.length) q = q.in('id', ids);
  unwrap(await q);
}

export async function bulkUpdateTargets(
  ids: string[],
  patch: Partial<Pick<SocialTarget, 'enabled' | 'favorite' | 'category' | 'city'>>,
): Promise<void> {
  if (!ids.length) return;
  unwrap(await db().from('social_targets').update(patch).in('id', ids));
}

/**
 * REMOVING A GROUP IS A DECISION, AND גילוי קבוצות HAS TO REMEMBER IT.
 *
 * "ברגע שאני מסיר קבוצה באפליקציה שלי שלא תקפוץ לי בתור אופציה להוספה
 *  לקבוצות שאני כבר חבר בהם."
 *
 * He is right, and until now it did the opposite. The "הקבוצות שלך בפייסבוק"
 * card offers every group he is in that the publishing list does not have — so
 * the moment he removed one, it became a group he is in that the list does not
 * have, and the card offered it straight back. The only way out of that loop
 * was to remove it and then dismiss it, twice, for ever.
 *
 * So a removal marks the discovery row dismissed. `hidden` already means "the
 * owner said no to this one" — it is what the ✕ on the card and "לא רלוונטי"
 * in the search results write — and removing the group from the publishing
 * list says the same thing with a bigger gesture. Reusing it costs him no
 * migration and is reversible from the screen he already has
 * ("הצג קבוצות שהוסתרו").
 *
 * READ BEFORE THE DELETE, because it cannot be read after: `target_id` is a
 * foreign key with ON DELETE SET NULL, so the link this needs is gone the
 * instant the row is. And matched on BOTH sides — the link and the group's own
 * id — because a group added by hand has no link but can still have been found
 * by a search.
 *
 * The dismissal is deliberately second: if it fails, the group is still
 * removed, which is what he asked for. A removal that failed because the
 * discovery table did not take an update would be a worse answer than a card
 * that offers the group again.
 */
async function dismissDiscoveredFor(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { data } = await db().from('social_targets').select('id, external_id').in('id', ids);
  const externalIds = (data ?? []).map((r) => (r as { external_id: string }).external_id).filter(Boolean);
  await db()
    .from('social_discovery_groups')
    .update({ hidden: true })
    .in('target_id', ids)
    .then(undefined, () => undefined);
  if (externalIds.length) {
    await db()
      .from('social_discovery_groups')
      .update({ hidden: true })
      .in('external_id', externalIds)
      .then(undefined, () => undefined);
  }
}

export async function bulkDeleteTargets(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await dismissDiscoveredFor(ids);
  unwrap(await db().from('social_targets').delete().in('id', ids));
}

export async function deleteTarget(id: string): Promise<void> {
  await dismissDiscoveredFor([id]);
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
 * WHAT THE CAMPAIGNS LIST NEEDS TO KNOW ABOUT POSTS, and not a byte more.
 *
 * That screen draws, per campaign: a cover, how many posts the run has, and
 * where "ערוך" goes. Three facts. It got them by calling listPosts() — every
 * non-archived post in the account, `base_text` and all, with no limit — and
 * filtering the result in the browser. An owner with two hundred drafts
 * downloaded two hundred post bodies to draw twenty-five thumbnails, on every
 * visit to the screen.
 *
 * The columns here are exactly the three uses plus the one the ORDER depends
 * on. Same rows, same order, same results on screen; a fraction of the bytes.
 *
 * `campaign_id is not null` is not a narrowing of the result either: the
 * caller matches each row against a campaign id, and a post belonging to no
 * campaign can never match one.
 */
export interface CampaignPostSummary {
  id: string;
  campaign_id: string;
  media: MediaItem[];
  updated_at: string;
}

export async function listCampaignPosts(): Promise<CampaignPostSummary[]> {
  return unwrap<CampaignPostSummary[]>(
    await db()
      .from('social_posts')
      .select('id, campaign_id, media, updated_at')
      .neq('status', 'archived')
      .not('campaign_id', 'is', null)
      /* The same order listPosts() used, because the caller takes [0] as "the
         post last worked on" — the one "ערוך" opens. */
      .order('updated_at', { ascending: false }),
  );
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
/**
 * The most recently edited posts, for the "start from one of mine" picker.
 *
 * Its own read rather than listPosts(), which fetches every non-archived post
 * in the account with base_text and media included, has no limit, and is
 * therefore capped by PostgREST's own row ceiling without saying so. A picker
 * needs a dozen covers; a phone on a metered plan should not download the
 * whole library to draw them.
 */
export async function listRecentPosts(limit = 12): Promise<Post[]> {
  return unwrap<Post[]>(
    await db()
      .from('social_posts')
      .select('id, title, base_text, language, link_url, cta_type, phone, whatsapp_url, media, campaign_id, status, created_at, updated_at')
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(limit),
  );
}

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

/**
 * CHZARA — arm or disarm a round's daily repeat, and the schedule row behind it.
 *
 * "הקמפיין פעיל, אמור לצאת כל יום מ-8 בבוקר עד 22 בלילה כל דקה."
 *
 * TWO WRITES, AND THE SECOND ONE IS THE FEATURE. The two columns on the
 * campaign only tell rules.ts that a repeat is PERMITTED; by themselves they
 * publish nothing, exactly like the window columns beside them. What actually
 * makes a round happen again is a schedule row, and the shape that recurs
 * already exists and is already planned by planQueue(): mode 'weekly' is read
 * on every pass (it is `active = true` and, unlike 'now'/'once'/'drip', never
 * retires itself), slotsFor() produces one occasion per chosen weekday, and
 * plan.ts staggers that occasion's targets apart. Nothing new had to be built
 * for the recurrence; it had to be ASKED FOR.
 *
 * THE DAYS AND THE HOUR ARE HIS, NOT A SECOND SETTING. The weekly plan is built
 * out of the campaign's own `schedule_days` and `schedule_start` — the chips
 * and the hour already on the card. A separate "which days does it repeat on"
 * control would be a second scheduling mechanism, which this product has a
 * standing rule against and has been bitten by once already.
 *
 * THE TARGETS ARE THE ROUND'S OWN, carried from the schedule that launched it.
 * A repeat that quietly published somewhere the round never did would be the
 * worst possible shape for this feature.
 *
 * TURNING IT OFF STOPS THE NEXT ROUND AND NOTHING ELSE. The weekly row is
 * deactivated, so no further occasions are planned; rows already in the queue
 * keep their instants, because "אין לאפס את התור" and because a publication the
 * owner has already been promised is not something a settings change may
 * cancel.
 */
export async function setCampaignRepeat(
  campaign: Pick<Campaign, 'id' | 'name'>,
  repeat: CampaignRepeat,
  schedule: CampaignSchedule,
): Promise<void> {
  unwrap(await db().from('social_campaigns').update(repeatColumns(repeat)).eq('id', campaign.id));

  const posts = unwrap<{ id: string }[]>(await db().from('social_posts').select('id').eq('campaign_id', campaign.id));
  const postIds = posts.map((p) => p.id);
  if (!postIds.length) return;

  /* Every weekly row this function has ever armed for this round. Matched on
     the mode as well as the post, so a one-off or a drip the owner set up
     himself is never touched by this switch. */
  const existing = unwrap<{ id: string; post_id: string; target_ids: string[] }[]>(
    await db().from('social_schedules').select('id, post_id, target_ids').in('post_id', postIds).eq('mode', 'weekly'),
  );

  if (!repeat.enabled) {
    if (existing.length) unwrap(await db().from('social_schedules').update({ active: false }).in('id', existing.map((r) => r.id)));
    await logClientActivity('info', 'campaign_repeat_off', `החזרה היומית של "${campaign.name}" כובתה`, { campaignId: campaign.id });
    return;
  }

  /*
   * ONE OCCASION PER CHOSEN DAY, AT THE WINDOW'S OPENING HOUR.
   *
   * Not at "now", and not at the hour the owner happened to press the switch:
   * the round is supposed to start when his publishing day starts, and
   * `schedule_start` is where he already said that is. A repeat that began at
   * 21:50 because that is when he turned it on would publish four groups and
   * then defer two hundred to tomorrow.
   */
  const weekly: WeeklyPlan = {};
  for (const day of schedule.days) weekly[String(day)] = [schedule.start];

  for (const postId of postIds) {
    const mine = existing.filter((r) => r.post_id === postId);
    if (mine.length) {
      unwrap(await db().from('social_schedules').update({ mode: 'weekly', weekly, active: true }).in('id', mine.map((r) => r.id)));
      continue;
    }
    /*
     * NO WEEKLY ROW YET, so this round was launched once and the targets have
     * to come from the row that launched it. Newest first: a round relaunched
     * to a different list repeats the list it last went out to, which is the
     * one the owner is looking at on the card.
     */
    const source = unwrap<{ target_ids: string[] }[]>(
      await db().from('social_schedules').select('target_ids').eq('post_id', postId).order('created_at', { ascending: false }).limit(1),
    );
    const targetIds = source[0]?.target_ids ?? [];
    /* A round with no targets to repeat is not armed at all. An empty weekly
       row would sit there active for ever, planning nothing, and the card would
       promise a round that could never produce a publication. */
    if (!targetIds.length) continue;
    unwrap(
      await db()
        .from('social_schedules')
        .insert({ post_id: postId, mode: 'weekly', timezone: TIMEZONE, run_at: null, weekly, interval_days: null, interval_time: null, target_ids: targetIds, active: true }),
    );
  }

  await logClientActivity(
    'warn',
    'campaign_repeat_on',
    `"${campaign.name}" יחזור על עצמו בכל יום פרסום — אותו פוסט לאותן קבוצות, לא יותר מפעם ב-${repeat.minHours} שעות`,
    { campaignId: campaign.id, minHours: repeat.minHours },
  );
}

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
/**
 * A queue row with only what a TIMELINE ROW DRAWS — and it is a fraction of
 * one.
 *
 * QUEUE_SELECT is `*` plus three joins, and `*` on social_queue carries
 * rendered_text: the entire published post, per row. On a day of two hundred
 * publications that is two hundred copies of the post body, plus every
 * error, skip_reason, screenshot path, comment note and metrics column, plus
 * the joined post's whole media array — fetched every thirty seconds, on a
 * metered Israeli mobile plan, to draw a name, a time and a coloured dot.
 *
 * That cost is why the dashboard's strip was capped at six and why raising
 * the cap looked expensive. It was expensive because of what each row
 * weighed, not because of how many there were.
 */
const TIMELINE_SELECT = 'id, status, scheduled_at, published_at, target:social_targets(id,name,channel,image_url)';

export type TimelineRow = Pick<QueueRow, 'id' | 'status' | 'scheduled_at' | 'published_at' | 'target'>;

/**
 * Today's finished publications, for the dashboard's rail.
 *
 * Ordered DESCENDING and bounded to the past for the same reason listQueue's
 * caller was: a row can be terminal with its slot still in the future — a
 * duplicate skipped before its turn, a run stopped mid-flight — and unbounded
 * those future slots sort to the top and take every place. The component
 * turns the result round to run forwards in time.
 */
export async function listTimelineDone(opts: { since: string; until: string; limit?: number }): Promise<TimelineRow[]> {
  const res = await db()
    .from('social_queue')
    .select(TIMELINE_SELECT)
    .in('status', TERMINAL_STATUSES)
    .gte('scheduled_at', opts.since)
    .lte('scheduled_at', opts.until)
    .order('scheduled_at', { ascending: false })
    .limit(opts.limit ?? 500);
  if (res.error) throw friendlyError(res.error);
  return (res.data ?? []) as unknown as TimelineRow[];
}

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

/**
 * The IDs of every publication that is waiting on a PERSON, and nothing else
 * about them.
 *
 * The dashboard's orange bar already knows how many there are — queueSummary()
 * counts them. What it did not know is WHICH, and without that the only kind
 * of "I have seen this" it could offer was a flag that hides the next one too
 * (see seen.ts). So: one column, no join, no media, no target. It rides in the
 * dashboard's existing Promise.all and is by a distance the cheapest read in
 * it.
 *
 * THE LIMIT IS LOAD-BEARING AND SO IS RETURNING A SHORT LIST HONESTLY. A
 * capped result would let the screen mark "everything" as seen while holding
 * only the first slice of it, and the rows past the cap would then be hidden
 * by a tap that never showed them. The caller compares this list's length
 * against the counted total and simply does not offer to dismiss when the two
 * disagree — which is why this returns what it got rather than paging.
 */
export const WAITING_FOR_YOU_LIMIT = 200;

export async function listWaitingForYouIds(): Promise<string[]> {
  const rows = unwrap<{ id: string }[]>(
    await db()
      .from('social_queue')
      .select('id')
      .in('status', NEEDS_HUMAN_STATUSES)
      .order('scheduled_at', { ascending: true })
      .limit(WAITING_FOR_YOU_LIMIT),
  );
  return rows.map((r) => r.id);
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
    .eq('status', 'needs_attention')
    /*
     * EXCEPT THE ROWS WHOSE POST MAY ALREADY BE ON FACEBOOK.
     *
     * The worker writes `step: 'submitted'` when it parks a row at or past
     * the final click — see the note in worker/social-worker.ts. Those rows
     * are the one case where re-running is not a retry but a second post to
     * the same group, and rules.ts cannot catch it: both of its duplicate
     * guards count rows with `status = 'published'`, and a parked row is
     * `needs_attention`. The publication happened; nothing in the database
     * says so.
     *
     * This button is "המשך סבב" — a secondary control with no confirmation
     * and no count, pressed after clearing a Facebook checkpoint. It must not
     * be able to repost. The owner's way back for these rows is the per-row
     * "נסה שוב", pressed while looking at that row and its screenshot.
     */
    .neq('step', 'submitted');
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

/**
 * Ask for a comment on every post this round has already published.
 *
 * THE OWNER DECIDES WHEN, which is the whole point: a price list is worth
 * adding once the post has had a few hours to be seen, and the first version
 * of this commented in the same second the post went up. Pressing this is that
 * decision, and it can be pressed again later with different words.
 *
 * Only rows that are PUBLISHED are marked — a row still waiting to go out has
 * nothing to comment on yet.
 *
 * It used to require a permalink too, and that was a bug with a very visible
 * face: publishing to a group never captures one, so nothing ever matched, the
 * button stayed dead, and the screen told the owner their round had published
 * nothing to comment on while a hundred and twenty-two posts sat above it. The
 * worker finds the post by its own text on the group's page, which is the only
 * handle a group post gives.
 *
 * Already-done rows are marked again on purpose: pressing this a second time
 * means "say this too", not "skip the ones that worked".
 */
export async function queueCampaignComment(
  campaignId: string,
  text: string,
  media: MediaItem[],
  gapSeconds: number,
): Promise<number> {
  const saved = await db()
    .from('social_campaigns')
    /* Clamped here as well as in the input, because this is the last place
       before the database and a value out of range would be a worker pacing
       itself by a number nobody meant. */
    .update({ comment_text: text, comment_media: media, comment_gap_seconds: Math.max(5, Math.min(600, Math.round(gapSeconds))) })
    .eq('id', campaignId);
  /*
   * THE MISSING MIGRATION SAYS SO, IN HEBREW, NAMING THE FILE.
   *
   * Without this the button read as dead: Postgres answers a missing column
   * with an English sentence about relations, friendlyMessage has nothing to
   * map it to, and the owner is left pressing a button that does nothing and
   * says nothing they can act on. It is the single likeliest reason this write
   * fails, and it takes a minute to fix once somebody knows.
   */
  if (saved.error) {
    if (/column|comment_text|comment_media|comment_gap_seconds/i.test(saved.error.message)) {
      throw new Error('צריך להריץ את social-latest.sql ב-Supabase לפני שאפשר להוסיף תגובות. אפשר להריץ אותו שוב גם אם כבר הרצתם.');
    }
    throw new Error(saved.error.message);
  }
  const marked = await db()
    .from('social_queue')
    /* The old reason is cleared with the state it explained. A row that says
       "ממתין" under last week's "הפוסט נמחק" is a screen contradicting
       itself. */
    .update({ comment_status: 'pending', comment_at: null, comment_note: '' })
    .eq('campaign_id', campaignId)
    .eq('status', 'published')
    /*
     * EXCEPT THE ONE THE WORKER IS HOLDING RIGHT NOW.
     *
     * 'commenting' is a claim: the browser is open on that post and a comment
     * is being typed into it. Pushing it back to 'pending' from here takes it
     * out of the claim it is standing in, and if the worker's write of the
     * outcome then fails for any reason, the next tick picks the row up and
     * comments on the same live post a second time — under the owner's name,
     * permanently. Exactly the thing the claim was added to prevent, arriving
     * through the screen instead of through a crash.
     *
     * One post out of the round misses this particular re-queue. It gets the
     * comment it was already being given.
     */
    .neq('comment_status', 'commenting')
    .select('id');
  if (marked.error) {
    if (/column|comment_status|comment_note/i.test(marked.error.message)) {
      throw new Error('צריך להריץ את social-latest.sql ב-Supabase לפני שאפשר להוסיף תגובות. אפשר להריץ אותו שוב גם אם כבר הרצתם.');
    }
    throw new Error(marked.error.message);
  }
  return marked.data?.length ?? 0;
}

/**
 * Every publication with a comment asked for on it, across all rounds.
 *
 * The round's own screen shows its own list; this is what the main screen
 * needs, because the owner asked to see which groups are being commented on
 * without first remembering which round they belong to. Pending first — that
 * is the part still moving.
 */
export interface CommentTotals {
  pending: number;
  done: number;
  failed: number;
  /* Sent, and never confirmed. Apart from `failed` because the retry acts on
     failed and must not touch this one — the comment may already be live. */
  unverified: number;
}

/**
 * The REAL totals, counted in the database rather than in the list.
 *
 * The card counted the rows it had loaded, so a task of a hundred and
 * seventeen posts reported itself as fifty-nine — the page size, presented as
 * a fact about the work. Counting where the rows are costs three head requests
 * and cannot drift from the list it sits above.
 */
export async function commentTotals(): Promise<CommentTotals> {
  const count = async (status: string) => {
    const res = await db()
      .from('social_queue')
      .select('id', { count: 'exact', head: true })
      .eq('comment_status', status);
    return res.error ? 0 : (res.count ?? 0);
  };
  const [pending, claimed, done, failed, unverified] = await Promise.all([
    count('pending'),
    /* Held by the worker at this instant. Still waiting, from the owner's
       side, so it is added to that number rather than shown as its own. */
    count('commenting'),
    count('done'),
    count('failed'),
    count('unverified'),
  ]);
  return { pending: pending + claimed, done, failed, unverified };
}

/**
 * The same counts, but only for comments that FINISHED since an instant.
 *
 * The card's headline used to read "231 הצליחו מתוך 356" for ever: three
 * numbers with no date filter, sitting under a row of tiles that had just been
 * taught to describe one day. The owner asked the obvious question — why did
 * this one not reset too.
 *
 * `comment_at` is the stamp the worker writes with every outcome
 * (worker/social-worker.ts, saveCommentOutcome), so this is "finished today",
 * which is the fact the headline claims to state.
 *
 * NOT `pending`. A comment still waiting has no outcome and therefore no day —
 * it is queued work, and scoping it to today would make the number shrink at
 * midnight while the queue behind it had not moved at all.
 */
export async function commentTotalsSince(sinceISO: string): Promise<{ done: number; failed: number; unverified: number }> {
  const count = async (status: string) => {
    const res = await db()
      .from('social_queue')
      .select('id', { count: 'exact', head: true })
      .eq('comment_status', status)
      .gte('comment_at', sinceISO);
    return res.error ? 0 : (res.count ?? 0);
  };
  const [done, failed, unverified] = await Promise.all([count('done'), count('failed'), count('unverified')]);
  return { done, failed, unverified };
}

/**
 * Comments that went up since an instant — one count, for the week line.
 *
 * Narrower than commentTotalsSince() on purpose: that one runs three head
 * requests to work out a success rate, and the tile's second line needs one
 * number. This screen already polls every thirty seconds on a metered phone
 * plan, and two more counts a minute for a figure nobody divides by is how a
 * dashboard becomes expensive without becoming more useful.
 */
export async function countCommentsDoneSince(sinceISO: string): Promise<number> {
  const res = await db()
    .from('social_queue')
    .select('id', { count: 'exact', head: true })
    .eq('comment_status', 'done')
    .gte('comment_at', sinceISO);
  return res.error ? 0 : (res.count ?? 0);
}

/**
 * The comments that went up, newest first — the list behind the green tile.
 *
 * Its own read rather than a filter over listCommentQueue(), because that one
 * is ordered `published_at` ASCENDING and capped: it holds the OLDEST rows
 * with a comment on them, which is right for chasing failures and exactly
 * wrong for "show me what just went out". Asked for by the owner, who wanted
 * to click the success count and see which groups it actually meant.
 *
 * `permalink` is the POST's address. There is no column anywhere for a link to
 * a comment itself — Facebook gives a group post one handle and the comment
 * lives under it — so the link opens the post, with the comment beneath it.
 */
export async function listCommentsDone(limit = 40): Promise<QueueRow[]> {
  const res = await db()
    .from('social_queue')
    .select(QUEUE_SELECT)
    .eq('comment_status', 'done')
    .order('comment_at', { ascending: false })
    .limit(limit);
  if (res.error) return [];
  return (res.data ?? []) as unknown as QueueRow[];
}

/**
 * The comments that have NOT been written yet, in the order the worker will
 * take them.
 *
 * WHY THIS EXISTS AND listCommentQueue() COULD NOT DO IT. That read asks for
 * every row carrying any comment state, oldest publication first, capped at
 * sixty. On a fresh account the cap never bites and the pending rows are in
 * there. On the owner's account there are 482 such rows, so the sixty oldest
 * are the earliest things they ever published — all of them long since
 * commented on. The 75 still waiting were outside the window every single
 * time, and the dashboard's rail showed a queue of nothing while the card
 * above it counted 75 in the queue. "לא מראה", and it was right.
 *
 * Narrowed to the two live states rather than re-ordered, because the order
 * is the one thing that must not change: the worker claims the oldest
 * publication first, so this is also the order they will go out in, which is
 * what lets the screen number them.
 *
 * A LEAN SELECT, not QUEUE_SELECT. That one is `*` plus three joins, and `*`
 * on social_queue carries rendered_text — the entire published post — per
 * row. This list draws a name, a state and a link.
 */
const COMMENT_WAIT_SELECT =
  'id, status, comment_status, comment_at, published_at, scheduled_at, permalink, campaign_id, target:social_targets(id,name,channel,url,image_url)';

export async function listCommentsWaiting(limit = 60): Promise<QueueRow[]> {
  const res = await db()
    .from('social_queue')
    .select(COMMENT_WAIT_SELECT)
    .in('comment_status', ['pending', 'commenting'])
    .order('published_at', { ascending: true })
    .limit(limit);
  /* Same silence as listCommentQueue, for the same reason: this runs on the
     dashboard's poll, and the screen that can explain a missing column is the
     one with the button. */
  if (res.error) return [];
  return (res.data ?? []) as unknown as QueueRow[];
}

export async function listCommentQueue(limit = 60): Promise<QueueRow[]> {
  const res = await db()
    .from('social_queue')
    .select(QUEUE_SELECT)
    .neq('comment_status', '')
    .order('published_at', { ascending: true })
    .limit(limit);
  /* A missing column is not an error worth showing here: this runs on the
     dashboard's poll, and the screen that can actually explain it is the one
     with the button. */
  if (res.error) return [];
  return (res.data ?? []) as unknown as QueueRow[];
}

/**
 * Put the round's failed comments back in the queue, and only those.
 *
 * Pressing "add a comment" again would re-mark every published row, including
 * the ones that already have a comment under them — the owner would be asking
 * for a second comment on those without meaning to. A failure is the one thing
 * worth retrying on its own, and after a fix to how posts are found there is
 * every reason to.
 */
/**
 * Put ONE failed comment back in the queue.
 *
 * The same write as retryFailedComments() below, narrowed to a row, because
 * the card now offers the retry beside the group it failed on and a button
 * under one name must not quietly act on the other twenty-six. The alternative
 * was a per-row control that secretly retried the whole round, which is a
 * button that lies about what it does.
 *
 * It carries the same refusal, and that refusal is the reason this is a
 * separate function rather than a filter on the caller: it will only move a
 * row that is 'failed'. 'unverified' means Enter was pressed and Facebook
 * never confirmed — the comment may be under the post right now, and a retry
 * would put a second one there, under the owner's name, permanently.
 *
 * Returns whether anything moved, so a row that was already retried elsewhere
 * reports honestly instead of flashing success.
 */
export async function retryComment(id: string): Promise<boolean> {
  const res = await db()
    .from('social_queue')
    .update({ comment_status: 'pending', comment_at: null, comment_note: '' })
    .eq('id', id)
    .eq('comment_status', 'failed')
    .select('id');
  if (res.error) throw new Error(res.error.message);
  return (res.data?.length ?? 0) > 0;
}

export async function retryFailedComments(campaignId: string): Promise<number> {
  const res = await db()
    .from('social_queue')
    .update({ comment_status: 'pending', comment_at: null, comment_note: '' })
    .eq('campaign_id', campaignId)
    /*
     * AND NEVER ON 'unverified'. That state means Enter was pressed and
     * Facebook did not confirm — the comment may be under the post right now,
     * and this button would put a second one there, under the owner's name,
     * permanently. Those rows say "צריך לבדוק" and wait for a person to look.
     */
    .eq('comment_status', 'failed')
    .select('id');
  if (res.error) throw new Error(res.error.message);
  return res.data?.length ?? 0;
}

/** How the round's comment task is going, for the screen that asked for it. */
export function commentProgress(rows: Pick<QueueRow, 'status' | 'comment_status'>[]): {
  pending: number;
  done: number;
  failed: number;
  unverified: number;
} {
  let pending = 0;
  let done = 0;
  let failed = 0;
  let unverified = 0;
  for (const r of rows) {
    /* 'commenting' is a row the worker is holding right now. It counts as
       waiting, not as a fourth number on the screen: from the owner's side it
       is still "this one has not got its comment yet". */
    if (r.comment_status === 'pending' || r.comment_status === 'commenting') pending += 1;
    else if (r.comment_status === 'done') done += 1;
    else if (r.comment_status === 'failed') failed += 1;
    /* Counted apart from 'failed' because the button below acts on 'failed'
       and must not act on this one — the comment may already be live. */
    else if (r.comment_status === 'unverified') unverified += 1;
  }
  return { pending, done, failed, unverified };
}

export async function screenshotUrl(path: string): Promise<string | null> {
  const { data, error } = await db().storage.from('social-debug').createSignedUrl(path, 600);
  if (error) return null;
  return data.signedUrl;
}

/* ------------------------------------------------------------ campaigns */

/** Ceiling for the cross-campaign rollup read. */
/*
 * 1000 AND NOT 5000 — ABOVE THE SERVER'S OWN CEILING THE GUARD IS DEAD.
 *
 * PostgREST's `db-max-rows` is 1000 by default on Supabase; countByStatus's
 * comment in this same file says so, and every other limit here sits at or
 * under it (CAMPAIGN_QUEUE_LIMIT 1000, LIVE_QUEUE_LIMIT 500, CAP_SCAN_LIMIT
 * 500, WAITING_FOR_YOU_LIMIT 200). This one asked for 5000, so the server
 * returned 1000, `rows.length >= 5000` was false, and `truncated` could never
 * become true.
 *
 * That is not a wasted flag. It is the flag CampaignCard's `finishedClean`
 * depends on: this read is ordered by scheduled_at ascending, so what falls
 * past the cut is the furthest-out SCHEDULED rows — a run whose pending rows
 * are dropped reports published === total, resolves to 'completed', and the
 * card draws a green "הקמפיין הסתיים בהצלחה" over publications that are still
 * waiting to go out. The `!state.truncated` clause exists to block exactly
 * that, and it has been unreachable.
 *
 * At the ceiling, `rows.length >= LIMIT` is true exactly when the server
 * truncated — which is the shape CAMPAIGN_QUEUE_LIMIT already has.
 */
const CAMPAIGN_ROLLUP_LIMIT = 1000;

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

/**
 * The same cover, for several runs, in ONE request.
 *
 * The dashboard used to feature exactly one run and read its cover on its own.
 * It now shows every live run in a swipe strip, and the obvious way to fill
 * that strip — runCoverMedia() per card — is N requests on the screen whose
 * speed the owner complained about by name. This is one.
 *
 * SAME RULE PER CAMPAIGN as runCoverMedia(): the most recently updated
 * non-archived post wins, and if that post has no media the answer is nothing
 * rather than an older post's picture. Rows arrive newest-first, so the first
 * one seen for a campaign is that post; `seen` is what keeps a later row from
 * standing in for it.
 *
 * The ceiling is high enough to be irrelevant for a strip of a handful of runs
 * and low enough that this can never pull a whole table: it is PostgREST's own
 * cap, which is the only number here that is not ours to choose.
 */
export async function runCovers(campaignIds: string[]): Promise<Record<string, MediaItem[]>> {
  if (!campaignIds.length) return {};
  const { data } = await db()
    .from('social_posts')
    .select('campaign_id, media')
    .in('campaign_id', campaignIds)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(CAMPAIGN_ROLLUP_LIMIT);
  const out: Record<string, MediaItem[]> = {};
  const seen = new Set<string>();
  for (const row of (data ?? []) as { campaign_id: string | null; media?: MediaItem[] }[]) {
    const id = row.campaign_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (row.media?.length) out[id] = row.media;
  }
  return out;
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
  /* A list of addresses is a legitimate payload now (see startJoinGroups), so
     this is no longer a map of strings. Still JSON and still one-time: the
     worker empties the column in the same update that claims the command. */
  payload?: Record<string, string | string[]>,
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

/**
 * One command, by the id its insert returned.
 *
 * It exists so a screen can WAIT for an answer instead of guessing at how long
 * the machine takes. The profile switcher is the case that needed it: pressing
 * a name queues a command, the computer then spends half a minute inside
 * Facebook, and until this existed the app learned the outcome only from the
 * next sixty-second read of the worker row — so a switch that had already
 * failed still looked like it was in progress, and one that had succeeded took
 * a minute to show.
 *
 * Named columns, not '*', for the reason listRecentCommands gives: `payload`
 * may hold a password for the second before the worker claims the row.
 */
export async function getWorkerCommand(id: string): Promise<WorkerCommand | null> {
  const { data, error } = await db().from('social_worker_commands').select(COMMAND_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as WorkerCommand | null) ?? null;
}

/*
 * HOW LONG A SCREEN WILL WAIT FOR THE MACHINE, and how often it asks.
 *
 * The computer picks a command up within five seconds (SOCIAL_WORKER_POLL_MS)
 * and then spends the rest of the time inside Facebook — for a profile switch
 * that is a page load, the account menu, the row, Facebook's own reload,
 * sometimes a confirmation, then re-reading who it has become. Twenty to forty
 * seconds is ordinary and a slow machine on a slow line is worse, so the
 * ceiling is generous: it exists to stop a screen waiting forever on a computer
 * that was switched off mid-command, not to judge how long Facebook may take.
 *
 * ONE SECOND between asks — one row, by its primary key, and only while
 * something is actually in flight. It was two and a half, which on a switch that
 * now takes five or six seconds was up to half of the remaining wait spent
 * looking at a finished answer nobody had fetched yet.
 */
export const COMMAND_POLL_MS = 1_000;
export const COMMAND_WAIT_MS = 150_000;

/**
 * Wait for one command to finish, and hand back how it went.
 *
 * `null` means it has not finished — not that it failed. The command is still
 * in the queue and the machine will run it when it gets to it, so a screen that
 * gets null must say exactly that rather than reporting a failure that has not
 * happened.
 *
 * A read that throws (a phone that lost signal for a moment) is not an answer
 * either and simply costs one tick.
 */
export async function waitForWorkerCommand(id: string, waitMs = COMMAND_WAIT_MS): Promise<WorkerCommand | null> {
  /* The default suits a command that answers in seconds. A join run is paced
     on purpose — a minute or two between groups — so its caller passes its own
     ceiling rather than being told after thirty seconds that the machine is
     slow, which it is not: it is being careful. */
  for (let waited = 0; waited < waitMs; waited += COMMAND_POLL_MS) {
    await new Promise((done) => setTimeout(done, COMMAND_POLL_MS));
    const cmd = await getWorkerCommand(id).catch(() => null);
    if (cmd?.status === 'done' || cmd?.status === 'failed') return cmd;
  }
  return null;
}

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

/**
 * Failures and skips since an instant — the dashboard's "נכשלו היום" tile.
 *
 * IT USED TO BE AN ALL-TIME HEAD COUNT, and the owner asked for this after
 * looking at a "38 נכשלו" that had been accumulating since the product's
 * first week, beside a "0 פורסמו היום" that was about today. One tile
 * describing this morning and the tile next to it describing the whole of
 * recorded history, in the same row, in the same size.
 *
 * `updated_at`, not a column named for the failure, because there is no such
 * column: a row records WHEN it failed only through the trigger that stamps
 * every update (social-schema.sql, social_queue_set_updated_at). That makes
 * this "reached a terminal state today" rather than "failed today", and the
 * two differ only if something touches a finished row later — which nothing
 * does. It is the same instant listLiveQueue() already treats as the moment a
 * publication finished, so both screens agree about which day a failure
 * belongs to.
 */
export async function countFailuresSince(sinceISO: string): Promise<{ failed: number; skipped: number }> {
  const count = async (status: QueueStatus) => {
    const res = await db().from('social_queue').select('id', { count: 'exact', head: true }).eq('status', status).gte('updated_at', sinceISO);
    if (res.error) throw friendlyError(res.error);
    return res.count ?? 0;
  };
  const [failed, skipped] = await Promise.all([count('failed'), count('skipped')]);
  return { failed, skipped };
}

/**
 * WHEN THIS ACCOUNT LAST PUBLISHED ANYTHING — the instant rules.ts measures its
 * spacing rule from, read the same way rules.ts reads it.
 *
 * "הפרש בין פוסטים: כל דקה" is the campaign's own gap, and the engine enforces
 * a second one on top: limits.minGapMinutes, plus browser.groupMinGapMinutes
 * for a group, counted from the most recent publication of the WHOLE account.
 * Without this instant a card can only ever know half the answer, and the half
 * it knew was the smaller one — so it printed a minute the engine would not
 * honour, and a worker holding for that gap claims nothing, writes no
 * deferral, and leaves the wrong minute on screen for the whole wait.
 *
 * NOT SCOPED BY CAMPAIGN, and not by account either — deliberately the same
 * unscoped read as rules.ts and the worker's spacingGate, whose own comment
 * explains why ("DELIBERATELY NOT SCOPED BY ACCOUNT"). A narrower read here
 * would answer a different question from the one being enforced, which is how
 * the two drifted apart in the first place.
 *
 * One row, one column. Null on a database that has never published.
 */
export async function lastPublishedAt(): Promise<string | null> {
  const res = await db()
    .from('social_queue')
    .select('published_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) throw friendlyError(res.error);
  return (res.data as { published_at: string } | null)?.published_at ?? null;
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
 * HOW MANY WAITING PUBLICATIONS FALL INSIDE A WINDOW — an exact head count,
 * no rows transferred.
 *
 * "כאן הפרסומים הקרובים להראות רק את מה שעומד להתפרסם בתווך זמן של 24 שעות."
 *
 * The dashboard's upcoming list is a capped read (UPCOMING_LIMIT rows, soonest
 * first), so counting the window by filtering that array in JavaScript would
 * print the CEILING as the total the moment more than forty rows were due —
 * the exact fault this file's own comments keep naming. This asks the
 * database, which is the only thing that knows.
 *
 * Same statuses as the list it describes (AUTOMATIC_WAITING_STATUSES), so the
 * number under the card and the rows inside it count the same set.
 */
export async function countWaitingWithin(untilISO: string): Promise<number> {
  const res = await db()
    .from('social_queue')
    .select('id', { count: 'exact', head: true })
    .in('status', AUTOMATIC_WAITING_STATUSES as unknown as string[])
    .lte('scheduled_at', untilISO);
  if (res.error) throw friendlyError(res.error);
  return res.count ?? 0;
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

/**
 * The activity log, newest first.
 *
 * `before` and `since` both filter on `at`, which is the one indexed column on
 * this table (social_activity_log_at_idx). That is not a detail: filtering by
 * `event` or `level` server-side would be a sequential scan of every row the
 * product has ever written, so the surfaces that need those narrow the rows
 * they already hold (see filterActivity() in activity.ts) rather than asking
 * the database for them.
 *
 * `before` is a cursor, not a page number: it takes the `at` of the last row
 * already on screen, so a row written while the owner is reading cannot shift
 * the window and make a row appear twice or not at all.
 */
export async function listActivity(limit = 40, opts: { before?: string; since?: string } = {}): Promise<ActivityEntry[]> {
  let q = db().from('social_activity_log').select('*').order('at', { ascending: false }).limit(limit);
  if (opts.before) q = q.lt('at', opts.before);
  if (opts.since) q = q.gte('at', opts.since);
  return unwrap<ActivityEntry[]>(await q);
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
