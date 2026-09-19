'use client';

import { supabase } from '@/lib/supabase';
import { addGroup, logClientActivity } from './client';
import { KNOWN_CITIES, OTHER_CITY, detectCity } from './cities';
import { friendlyError } from './errors';
import { parseGroupUrl } from './types';

/**
 * "גילוי קבוצות" — finding Facebook groups to publish in, honestly.
 *
 * THE PREMISE, so nobody redesigns around a wish: there is no Meta API here and
 * there cannot be one. Meta announced the deprecation of the whole Facebook
 * Groups API on 2024-01-23 (Graph API v19.0) and removed it from every version
 * on 2024-04-22; groups_access_member_info and publish_to_groups went with it,
 * along with a group admin's ability to install an app on a group at all. There
 * is no endpoint that searches groups, and none that sends a join request.
 *
 * So discovery is three legitimate automations around one manual step:
 *
 *   A. buildKeywords() + facebookGroupSearchUrl() — phrase generation. Pure
 *      string work, never touches Meta. Each phrase becomes a one-tap link to
 *      Facebook's own search page, which the owner's own browser follows.
 *   B. capturePastedGroups() — the owner pastes whatever they copied (one link,
 *      forty links, or a slab of text with links buried in it) and this pulls
 *      every group out of it, deduped against both this table and the groups
 *      already in social_targets.
 *   C. requestEnrichment() — opt-in, per batch: the local worker opens those
 *      group pages in the owner's own Chrome and reads what the page plainly
 *      says. Slow on purpose. See worker/social-worker.ts.
 *
 * Nothing here ever claims an action Facebook did not let us take, and nothing
 * here invents a number: members_count is null until it was read, privacy is
 * 'unknown' until the page said so, membership is 'UNKNOWN' until it was read
 * or the owner marked it themselves.
 *
 * The first half of this file is pure and side-effect free — no database, no
 * browser APIs — so it can be unit-tested and reused anywhere.
 */

/* ===================================================================== */
/* Pure helpers                                                          */
/* ===================================================================== */

export type Membership = 'NOT_MEMBER' | 'JOIN_REQUEST_SENT' | 'MEMBER' | 'REJECTED' | 'UNKNOWN';
export type GroupPrivacy = 'public' | 'private' | 'unknown';
export type EnrichState = 'idle' | 'queued' | 'done' | 'failed';
export type MembershipSetBy = 'system' | 'owner';

export interface DiscoveredGroup {
  id: string;
  /** Numeric id or vanity slug, lowercased. '' while unknown. */
  fbGroupId: string;
  /** The dedupe key — see normalizeGroupUrl(). */
  urlKey: string;
  url: string;
  name: string;
  imageUrl: string;
  city: string;
  category: string;
  privacy: GroupPrivacy;
  /** null means "not read". Never 0 as a stand-in. */
  membersCount: number | null;
  membership: Membership;
  membershipSetBy: MembershipSetBy;
  discoverySource: string;
  searchKeyword: string;
  /** Set once the group lives in social_targets too. */
  targetId: string | null;
  ignored: boolean;
  enrichState: EnrichState;
  lastError: string;
  discoveredAt: string;
  lastCheckedAt: string | null;
  updatedAt: string;
}

export interface DiscoveryDomain {
  id: string;
  label: string;
}

/**
 * The kinds of group this business actually wants. Hebrew labels because the
 * owner reads only Hebrew; the ids are stable and safe to store.
 */
export const DISCOVERY_DOMAINS: DiscoveryDomain[] = [
  { id: 'local', label: 'מקומיות' },
  { id: 'business', label: 'עסקים' },
  { id: 'residents', label: 'תושבים' },
  { id: 'secondhand', label: 'יד שנייה' },
  { id: 'pros', label: 'בעלי מקצוע' },
  { id: 'moms', label: 'אמהות' },
  { id: 'jobs', label: 'דרושים' },
];

/* ------------------------------------------------------- URL normalising */

/**
 * Path segments that follow /groups/ but are not a group: Facebook's own
 * group surfaces. Without this list "facebook.com/groups/feed/" becomes a
 * group called "feed", and every paste that includes the owner's own groups
 * feed adds a row that can never be opened.
 */
const RESERVED_GROUP_SLUGS = new Set([
  'feed', 'create', 'discover', 'browse', 'search', 'joins', 'home', 'invites',
  'notifications', 'pending', 'categories', 'your_groups', 'member_requests', 'edit',
]);

/** Punctuation a slug picks up when a link is copied out of running prose. */
const TRAILING_JUNK = /[).,;:!?"'\]}»>־–—…]+$/;
const LEADING_JUNK = /^[([{"'«<]+/;

/**
 * One group URL, reduced to the single form everything else compares against.
 *
 * Handles, deliberately and with a test case each:
 *   /groups/123456789/                      → numeric id
 *   /groups/beersheva.yad2/                 → vanity slug (dots are legal in slugs)
 *   /groups/123/posts/456, /permalink/9/    → the id is the first segment only
 *   ?fbclid=…&ref=share, #anchor            → dropped
 *   m. / web. / mbasic. / touch. hosts      → all become www
 *   fb.com/groups/123                       → same group
 *   "facebook.com/groups/x" with no scheme  → assumed https
 *   l.facebook.com/l.php?u=<encoded>        → unwrapped first (Facebook's own
 *                                             redirect wrapper, which is what
 *                                             you get copying a link out of a
 *                                             post; its path has no /groups/
 *                                             so parseGroupUrl alone rejects it)
 *   trailing "))" / "," / whitespace        → stripped off the slug
 *   /groups/feed/ and friends               → rejected, not a group
 *
 * THE KEY is what dedupes, so it is lowercased: Facebook group URLs are
 * case-insensitive and "Beersheva.Yad2" and "beersheva.yad2" are one group.
 * The canonical url is built from the key for the same reason — a lowercased
 * group URL always resolves, and it makes the external_id that addGroup()
 * derives stable, so the same group can never enter social_targets twice with
 * two different casings.
 *
 * What it CANNOT do: tell a vanity slug and the group's numeric id apart as the
 * same group. facebook.com/groups/beersheva.yad2 and facebook.com/groups/
 * 1234567890 are one group and look like two here. The worker's enrichment pass
 * reads the page's canonical numeric id and reconciles them afterwards.
 */
export function normalizeGroupUrl(input: string): { url: string; key: string; fbGroupId: string } | null {
  if (typeof input !== 'string') return null;
  let raw = input.trim().replace(LEADING_JUNK, '').replace(TRAILING_JUNK, '');
  if (!raw) return null;

  // Facebook's redirect wrapper: l.facebook.com/l.php?u=<percent-encoded url>.
  const wrapped = raw.match(/[?&]u=([^&\s]+)/i);
  if (wrapped && /\/l\.php|lm\.facebook\.com|l\.facebook\.com/i.test(raw)) {
    try {
      raw = decodeURIComponent(wrapped[1]);
    } catch {
      /* keep the original and let parseGroupUrl decide */
    }
  }

  const parsed = parseGroupUrl(raw);
  if (!parsed) return null;

  const slug = parsed.externalId.trim().replace(TRAILING_JUNK, '').replace(LEADING_JUNK, '');
  if (!slug) return null;
  const key = slug.toLowerCase();
  if (RESERVED_GROUP_SLUGS.has(key)) return null;

  return { url: `https://www.facebook.com/groups/${key}`, key, fbGroupId: key };
}

/**
 * Anything in a slab of pasted text that could be a link. Stops at whitespace
 * and at the punctuation that surrounds a link in prose; the query string's
 * own & and = are kept so the l.php wrapper above still arrives intact.
 */
const URLISH_RE = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:facebook|fb)\.com\/[^\s"'<>{}\[\]|\\]*/gi;

export interface PastedScan {
  /** The distinct groups the text contained, in the order they appeared. */
  groups: { url: string; key: string; fbGroupId: string }[];
  /** How many times a group link appeared that was a repeat of one already seen. */
  repeats: number;
  /** Links that point at /groups/ but yielded no group id we could use. */
  unreadable: number;
}

/**
 * Pulls every group out of pasted text.
 *
 * WHAT IS AND IS NOT COUNTED, because a number the owner cannot act on is worse
 * than no number at all:
 *   - prose is not counted. It is prose.
 *   - a Facebook link that is not a group link (a marketplace item, a profile,
 *     a photo) is NOT counted as unreadable. It is a perfectly good link that
 *     simply is not a group, and this screen never promised to take it.
 *     Counting it would alarm the owner about nothing — copy a slab of Facebook
 *     text and you get a dozen of them.
 *   - a link that DOES point at /groups/ but yields nothing usable IS counted:
 *     that is the case where the owner pasted something they believed was a
 *     group and it did not arrive, so they need to hear about it. Facebook's own
 *     group surfaces (/groups/feed/, /groups/discover/) land here too.
 *   - a repeat of a group already found is counted separately from a group this
 *     table already held. They are different facts and the screen says so.
 */
export function scanPastedText(text: string): PastedScan {
  const groups: { url: string; key: string; fbGroupId: string }[] = [];
  const seen = new Set<string>();
  let repeats = 0;
  let unreadable = 0;
  for (const match of String(text ?? '').matchAll(URLISH_RE)) {
    const token = match[0];
    const hit = normalizeGroupUrl(token);
    if (!hit) {
      if (LOOKS_LIKE_GROUP_LINK.test(token)) unreadable += 1;
      continue;
    }
    if (seen.has(hit.key)) {
      repeats += 1;
      continue;
    }
    seen.add(hit.key);
    groups.push(hit);
  }
  return { groups, repeats, unreadable };
}

/**
 * "The owner meant this to be a group link." Used only to decide whether a
 * link that failed to normalise is worth reporting — never to accept one.
 */
const LOOKS_LIKE_GROUP_LINK = /\/groups\//i;

/** Every group URL in a slab of text, normalised, deduped, in the order found. */
export function extractGroupUrls(text: string): string[] {
  return scanPastedText(text).groups.map((g) => g.url);
}

/* ------------------------------------------------------ phrase generation */

/**
 * Latin spellings per city.
 *
 * These are not invented: every one of them is already matched by the regexes
 * in src/lib/social/cities.ts — that file just never exposed them as strings,
 * because detectCity() only ever needs to go the other way. The one addition is
 * "Be'er Sheva", which the owner asked for by name and which cities.ts does not
 * match (its pattern is /beer[\s-]?sheva/); a group found under that spelling
 * still classifies correctly, because detectCity() runs on the group's real
 * Hebrew name once the worker reads it.
 *
 * The Hebrew name stays the canonical key everywhere, so nothing here changes
 * how a city is stored or detected. (It lives in this file rather than in
 * cities.ts only because cities.ts is shared with the worker and the other
 * screens, and this table is a discovery concern.)
 */
const CITY_LATIN: Record<string, string[]> = {
  'ערד': ['Arad'],
  'באר שבע': ['Beer Sheva', "Be'er Sheva", 'Beersheba'],
  'אופקים': ['Ofakim'],
  'דימונה': ['Dimona'],
  'נתיבות': ['Netivot'],
  'שדרות': ['Sderot'],
  'ירוחם': ['Yeruham'],
  'מצפה רמון': ['Mitzpe Ramon'],
  'אשקלון': ['Ashkelon'],
  'אשדוד': ['Ashdod'],
  'קריית גת': ['Kiryat Gat'],
  'עומר': ['Omer'],
  'להבים': ['Lehavim'],
  'מיתר': ['Meitar'],
  'רהט': ['Rahat'],
};

/** The Latin spellings of a city, or [] for one we have none for. */
export function cityLatinNames(city: string): string[] {
  return CITY_LATIN[city.trim()] ?? [];
}

/**
 * Hebrew phrase shapes per domain. `c` is the city name; `ב${c}` is correct
 * Hebrew for every city in the list above ("בבאר שבע", "בערד", "באופקים").
 * Both spellings of the words the owner's neighbours actually type are here
 * ("יד שנייה" / "יד שניה", "אמהות" / "אימהות") — Facebook's search does not
 * conflate them, and a group named one way will not surface under the other.
 */
const DOMAIN_PHRASES: Record<string, (c: string) => string[]> = {
  local: (c) => [`קהילת ${c}`, `קבוצות ${c}`],
  business: (c) => [`עסקים ${c}`, `עסקים מקומיים ב${c}`, `ממליצים ${c}`],
  residents: (c) => [`תושבי ${c}`, `מה קורה ב${c}`],
  secondhand: (c) => [`יד שנייה ${c}`, `יד שניה ${c}`, `יד 2 ${c}`],
  pros: (c) => [`בעלי מקצוע ${c}`, `ממליצים על בעלי מקצוע ב${c}`],
  moms: (c) => [`אמהות ${c}`, `אימהות ${c}`],
  jobs: (c) => [`דרושים ${c}`, `עבודה ${c}`],
};

/** Domain labels on their own — what a search without a city can still be. */
const DOMAIN_ONLY: Record<string, string[]> = {
  local: ['קבוצות מקומיות'],
  business: ['עסקים מקומיים'],
  residents: ['תושבים'],
  secondhand: ['יד שנייה', 'יד שניה'],
  pros: ['בעלי מקצוע'],
  moms: ['אמהות'],
  jobs: ['דרושים'],
};

function tidy(phrase: string): string {
  return phrase.replace(/\s+/g, ' ').trim();
}

/**
 * City × domains → the search phrases to try, broadest first.
 *
 * The bare city spellings come first — Hebrew, then every Latin spelling —
 * because the plain city name is the widest net and it is what the owner
 * searched by hand before this screen existed. Domain phrases follow, in the
 * order the domains were picked.
 *
 * A city we hold no spellings for (the owner typed their own) still produces
 * every domain phrase; only the transliterations are missing, because
 * inventing them would be guessing at a name we do not know.
 *
 * NOTHING HERE TOUCHES FACEBOOK. These are strings. What the owner finds after
 * opening one is knowledge this system does not have and must never imply.
 */
export function buildKeywords(city: string, domainIds: string[]): string[] {
  const name = tidy(city ?? '');
  const domains = (domainIds ?? []).filter((id) => Boolean(DOMAIN_PHRASES[id]));
  const out: string[] = [];

  if (!name || name === OTHER_CITY) {
    // No city: the domain labels are all that is left, and they are still a
    // usable search. Better than fabricating a city we were not given.
    for (const id of domains) out.push(...(DOMAIN_ONLY[id] ?? []));
    return dedupePhrases(out);
  }

  out.push(name);
  out.push(...cityLatinNames(name));
  for (const id of domains) out.push(...DOMAIN_PHRASES[id](name));
  return dedupePhrases(out);
}

function dedupePhrases(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const phrase = tidy(raw);
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }
  return out;
}

/** Cities to offer in the picker: the business's own first, then the rest. */
export function discoveryCities(businessCities: string[] = []): string[] {
  const mine = businessCities.map((c) => tidy(c)).filter(Boolean);
  const rest = KNOWN_CITIES.filter((c) => !mine.includes(c));
  return [...new Set([...mine, ...rest])];
}

/**
 * Facebook's own group search page. A plain, supported https URL — exactly what
 * Facebook's UI itself produces — opened in a new tab so the owner's browser
 * follows it as them. This is a link, not a request: nothing reads the results,
 * and the system never learns what the search returned.
 */
export function facebookGroupSearchUrl(q: string): string {
  return `https://www.facebook.com/search/groups/?q=${encodeURIComponent(tidy(q))}`;
}

/* ===================================================================== */
/* Supabase-backed                                                       */
/* ===================================================================== */

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

interface DiscoveredRow {
  id: string;
  fb_group_id: string;
  url_key: string;
  url: string;
  name: string;
  image_url: string;
  city: string;
  category: string;
  privacy: GroupPrivacy;
  members_count: number | null;
  membership: Membership;
  membership_set_by: MembershipSetBy;
  discovery_source: string;
  search_keyword: string;
  target_id: string | null;
  ignored: boolean;
  enrich_state: EnrichState;
  last_error: string;
  discovered_at: string;
  last_checked_at: string | null;
  updated_at: string;
}

function toGroup(row: DiscoveredRow): DiscoveredGroup {
  return {
    id: row.id,
    fbGroupId: row.fb_group_id ?? '',
    urlKey: row.url_key,
    url: row.url,
    name: row.name ?? '',
    imageUrl: row.image_url ?? '',
    city: row.city ?? '',
    category: row.category ?? '',
    privacy: row.privacy ?? 'unknown',
    // Postgres NULL survives as null: "not read" must never arrive as 0.
    membersCount: row.members_count === null || row.members_count === undefined ? null : Number(row.members_count),
    membership: row.membership ?? 'UNKNOWN',
    membershipSetBy: row.membership_set_by ?? 'system',
    discoverySource: row.discovery_source ?? '',
    searchKeyword: row.search_keyword ?? '',
    targetId: row.target_id ?? null,
    ignored: Boolean(row.ignored),
    enrichState: row.enrich_state ?? 'idle',
    lastError: row.last_error ?? '',
    discoveredAt: row.discovered_at,
    lastCheckedAt: row.last_checked_at ?? null,
    updatedAt: row.updated_at,
  };
}

const TABLE = 'social_discovered_groups';
/** Group channels as they exist in social_targets (v2 kept the legacy name). */
const GROUP_CHANNELS = ['facebook_group', 'facebook_group_manual'];
/** PostgREST puts `in` lists in the URL, so long pastes go out in chunks. */
const IN_CHUNK = 100;

function chunk<T>(list: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function listDiscovered(opts: { includeIgnored?: boolean } = {}): Promise<DiscoveredGroup[]> {
  let q = db().from(TABLE).select('*').order('discovered_at', { ascending: false }).limit(1000);
  if (!opts.includeIgnored) q = q.eq('ignored', false);
  return unwrap<DiscoveredRow[]>(await q).map(toGroup);
}

/**
 * The four numbers the screen puts at the top. Every one of them counts rows in
 * this table — none of them counts searches run, links opened, or anything else
 * the system cannot see.
 */
export async function discoveryCounts(): Promise<{ found: number; notMember: number; pending: number; member: number }> {
  const rows = unwrap<{ membership: Membership }[]>(await db().from(TABLE).select('membership').eq('ignored', false));
  const out = { found: rows.length, notMember: 0, pending: 0, member: 0 };
  for (const row of rows) {
    if (row.membership === 'NOT_MEMBER') out.notMember += 1;
    else if (row.membership === 'JOIN_REQUEST_SENT') out.pending += 1;
    else if (row.membership === 'MEMBER') out.member += 1;
  }
  return out;
}

export interface CaptureResult {
  /** Rows created for groups that were genuinely new. */
  added: number;
  /** Distinct groups in the text that this table ALREADY held. Not repeats — see `repeats`. */
  duplicates: number;
  /** Groups the owner already publishes to — recorded and linked, never offered as new. */
  alreadyTargets: number;
  /** The same group written more than once in this one paste. */
  repeats: number;
  /** Links pointing at /groups/ that yielded no usable group id. */
  unreadable: number;
}

/**
 * One paste in, one honest result out.
 *
 * added + duplicates + alreadyTargets is EXACTLY the number of distinct groups
 * the text contained — each of the three counts a different, separately true
 * thing, and no group is counted twice:
 *   added          — new to this table.
 *   duplicates     — this table already had it.
 *   alreadyTargets — the owner already publishes to it.
 * `repeats` sits outside that sum: it counts extra WRITINGS of a group, not
 * extra groups, and is reported on its own line so "40 links became 20 groups"
 * is explained rather than mysterious. Conflating the two — reporting an
 * in-paste repeat as "already in the discovery list" — would tell the owner
 * something about their data that is simply untrue.
 *
 * A group that is already a publishing target is counted only under
 * alreadyTargets — it is recorded (so the next paste dedupes against it and the
 * screen can say "כבר אצלך") but it is never presented as a discovery.
 *
 * Note what is deliberately NOT done: a group found in social_targets is linked
 * via target_id and its membership is left at 'UNKNOWN'. Being in the publishing
 * pool is strong evidence the owner is a member — but it is evidence, not a
 * reading, and this table does not hold guesses. The screen says "כבר במאגר
 * הפרסום" from target_id, which is a fact.
 */
export async function capturePastedGroups(text: string, meta: { city?: string; keyword?: string } = {}): Promise<CaptureResult> {
  const scan = scanPastedText(text);
  if (!scan.groups.length) {
    return { added: 0, duplicates: 0, alreadyTargets: 0, repeats: scan.repeats, unreadable: scan.unreadable };
  }

  const keys = scan.groups.map((g) => g.key);
  const client = db();

  // What this table already holds — matched on url_key AND on fb_group_id.
  // Both, because the worker's reconciliation step can leave a row whose
  // url_key is still the vanity slug it was captured by while its fb_group_id
  // has become the group's numeric id. A paste of the numeric URL then collides
  // with the fb_group_id unique index and nothing else would have caught it —
  // and an unhandled 23505 would fail the whole paste, not just that link.
  type ExistingRow = Pick<DiscoveredRow, 'id' | 'url_key' | 'fb_group_id' | 'target_id'>;
  const byId = new Map<string, ExistingRow>();
  for (const part of chunk(keys)) {
    for (const column of ['url_key', 'fb_group_id'] as const) {
      const rows = unwrap<ExistingRow[]>(await client.from(TABLE).select('id, url_key, fb_group_id, target_id').in(column, part));
      for (const row of rows) byId.set(row.id, row);
    }
  }
  const existingByKey = new Map<string, ExistingRow>();
  for (const row of byId.values()) {
    existingByKey.set(row.url_key, row);
    if (row.fb_group_id) existingByKey.set(row.fb_group_id, row);
  }

  // What the publishing pool already holds. Matched on BOTH the stored
  // external_id and the stored url, normalised — a row added years ago may carry
  // a mixed-case slug, an m.facebook.com url, or a url with a ?ref= on it.
  const targets = unwrap<{ id: string; external_id: string; url: string }[]>(
    await client.from('social_targets').select('id, external_id, url').in('channel', GROUP_CHANNELS),
  );
  const targetByKey = new Map<string, string>();
  for (const t of targets) {
    if (t.external_id) targetByKey.set(t.external_id.trim().toLowerCase(), t.id);
    const viaUrl = t.url ? normalizeGroupUrl(t.url) : null;
    if (viaUrl) targetByKey.set(viaUrl.key, t.id);
  }

  const city = (meta.city ?? '').trim();
  const keyword = (meta.keyword ?? '').trim();

  const fresh: Record<string, unknown>[] = [];
  const relink: { id: string; targetId: string }[] = [];
  // Only groups this table already held. In-paste repeats are scan.repeats and
  // are reported separately — they are not "already in the discovery list".
  let duplicates = 0;
  let alreadyTargets = 0;

  for (const group of scan.groups) {
    const targetId = targetByKey.get(group.key) ?? null;
    const row = existingByKey.get(group.key);
    if (row) {
      duplicates += 1;
      // Backfill the link if the group joined the publishing pool since it was
      // first discovered (or was promoted from another screen).
      if (targetId && !row.target_id) relink.push({ id: row.id, targetId });
      continue;
    }
    if (targetId) alreadyTargets += 1;
    fresh.push({
      fb_group_id: group.fbGroupId,
      url_key: group.key,
      url: group.url,
      city,
      search_keyword: keyword,
      discovery_source: 'paste',
      target_id: targetId,
    });
  }

  // One round trip per 100 groups, not one per link. The unique index on
  // url_key is full rather than partial, so PostgREST's ON CONFLICT can
  // actually match it and the same paste submitted twice is a no-op.
  let added = 0;
  for (const part of chunk(fresh)) {
    added += (await insertCaptured(part)).filter((r) => !r.target_id).length;
  }
  for (const item of relink) {
    unwrap(await client.from(TABLE).update({ target_id: item.targetId }).eq('id', item.id));
  }

  await logClientActivity(
    'info',
    'discovery_captured',
    `גילוי קבוצות: ${added} קבוצות חדשות נקלטו, ${duplicates} היו כבר ברשימה, ${alreadyTargets} כבר במאגר הפרסום`,
    { added, duplicates, alreadyTargets, repeats: scan.repeats, unreadable: scan.unreadable, city, keyword },
  );

  return { added, duplicates, alreadyTargets, repeats: scan.repeats, unreadable: scan.unreadable };
}

/**
 * One chunk of a paste. ON CONFLICT can only name one index, so a row that
 * collides on the OTHER unique index (fb_group_id) still raises 23505 — and it
 * would take the whole chunk down with it. The pre-check above makes that rare;
 * this makes it harmless: the chunk is retried a row at a time and only the
 * colliding rows are dropped.
 */
async function insertCaptured(rows: Record<string, unknown>[]): Promise<{ id: string; target_id: string | null }[]> {
  if (!rows.length) return [];
  const write = (batch: Record<string, unknown>[]) =>
    db().from(TABLE).upsert(batch, { onConflict: 'url_key', ignoreDuplicates: true }).select('id, target_id');
  const res = await write(rows);
  if (!res.error) return (res.data ?? []) as { id: string; target_id: string | null }[];
  if (rows.length === 1) {
    if (isDuplicate(res.error)) return [];
    throw friendlyError(res.error);
  }
  const out: { id: string; target_id: string | null }[] = [];
  for (const row of rows) {
    const one = await write([row]);
    if (one.error) {
      if (isDuplicate(one.error)) continue;
      throw friendlyError(one.error);
    }
    out.push(...((one.data ?? []) as { id: string; target_id: string | null }[]));
  }
  return out;
}

/** Postgres 23505 — a unique index. Recognised by code, never by message text. */
function isDuplicate(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505';
}

/**
 * The owner's own mark. membership_set_by='owner' is what stops an automatic
 * read from quietly undoing it later (worker/social-worker.ts).
 */
export async function setMembership(ids: string[], membership: Membership): Promise<number> {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return 0;
  let n = 0;
  for (const part of chunk(list)) {
    const rows = unwrap<{ id: string }[]>(
      await db()
        .from(TABLE)
        // last_error is cleared: whatever the previous automatic read disagreed
        // about, the owner has now answered it.
        .update({ membership, membership_set_by: 'owner', last_error: '' })
        .in('id', part)
        .select('id'),
    );
    n += rows.length;
  }
  return n;
}

export async function setIgnored(ids: string[], ignored: boolean): Promise<number> {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return 0;
  let n = 0;
  for (const part of chunk(list)) {
    const rows = unwrap<{ id: string }[]>(await db().from(TABLE).update({ ignored }).in('id', part).select('id'));
    n += rows.length;
  }
  return n;
}

/**
 * Opt in to the worker reading these group pages.
 *
 * This is not an API call and must never be described as one: it queues the
 * groups for the local worker to OPEN IN THE OWNER'S OWN CHROME, the same
 * browser and the same session that publishes for them. Reading groups they are
 * not in is a more conspicuous pattern than reading their own, so it is opt-in
 * per batch, two per idle tick, and publishing always goes first.
 */
export async function requestEnrichment(ids: string[]): Promise<number> {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return 0;
  let n = 0;
  for (const part of chunk(list)) {
    const rows = unwrap<{ id: string }[]>(
      await db()
        .from(TABLE)
        .update({ enrich_state: 'queued', last_error: '' })
        .in('id', part)
        // A row already queued stays queued; re-queueing a row the worker is
        // mid-read on would only make it look newly requested.
        .neq('enrich_state', 'queued')
        .select('id'),
    );
    n += rows.length;
  }
  return n;
}

export interface PromoteResult {
  added: number;
  skipped: number;
  /** One Hebrew line per group that was REFUSED. Only refusals — the screen
   *  renders these under "קבוצות שלא נוספו למאגר". */
  reasons: string[];
  /** Hebrew lines about groups that DID go through but are worth a word (one
   *  that was already in the pool and got linked rather than re-created).
   *  Kept apart from `reasons` because listing a success under "not added"
   *  tells the owner the opposite of what happened. */
  notes: string[];
}

/**
 * Graduation: a group the owner is a member of moves into social_targets.
 *
 * It goes through addGroup() — the one and only group-creation path — and the
 * discovery row keeps target_id pointing at what it created. Nothing here
 * inserts into social_targets directly.
 *
 * A group that is not marked MEMBER is refused with a reason, because a target
 * is publishable the moment it is put on a schedule (rules.ts skips only
 * disabled ones), and publishing into a group the owner is not in is exactly
 * the failure this whole screen exists to prevent.
 */
export async function promoteToTargets(ids: string[]): Promise<PromoteResult> {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return { added: 0, skipped: 0, reasons: [], notes: [] };

  const rows: DiscoveredRow[] = [];
  for (const part of chunk(list)) {
    rows.push(...unwrap<DiscoveredRow[]>(await db().from(TABLE).select('*').in('id', part)));
  }

  let added = 0;
  let skipped = 0;
  const reasons: string[] = [];
  const notes: string[] = [];
  const label = (row: DiscoveredRow) => row.name || row.url_key;

  for (const row of rows) {
    if (row.target_id) {
      skipped += 1;
      reasons.push(`"${label(row)}" כבר נמצאת במאגר הפרסום.`);
      continue;
    }
    if (row.membership !== 'MEMBER') {
      skipped += 1;
      reasons.push(`"${label(row)}" — לא סומנה כקבוצה שאתם חברים בה, ולכן לא נוספה למאגר הפרסום.`);
      continue;
    }
    try {
      // Already there under a different discovery row, or added by hand from the
      // groups screen: link it instead of failing. This is a success, not an error.
      const existing = unwrap<{ id: string } | null>(
        await db().from('social_targets').select('id').in('channel', GROUP_CHANNELS).eq('external_id', row.url_key).limit(1).maybeSingle(),
      );
      const targetId = existing ? existing.id : (await addGroup({ url: row.url, name: row.name || undefined })).id;
      unwrap(await db().from(TABLE).update({ target_id: targetId }).eq('id', row.id));
      added += 1;
      // A success, so it belongs in notes — not in the refusal list.
      if (existing) notes.push(`"${label(row)}" כבר הייתה במאגר הפרסום — הקבוצות חוברו זו לזו.`);
    } catch (err) {
      skipped += 1;
      // friendlyError() has already turned anything from Supabase into Hebrew;
      // addGroup()'s own refusals are Hebrew to begin with.
      reasons.push(`"${label(row)}" — ${friendlyError(err, 'ההוספה למאגר הפרסום נכשלה.').message}`);
    }
  }

  if (added) {
    await logClientActivity('info', 'discovery_promoted', `${added} קבוצות מ"גילוי קבוצות" נוספו למאגר הפרסום`, { added, skipped });
  }
  return { added, skipped, reasons, notes };
}

/**
 * City for a discovered group: the one the search was generated for, until the
 * worker learns the group's real name and detectCity() can do better. Exported
 * so the screen shows the same value the rest of the product does.
 */
export function discoveryCity(group: Pick<DiscoveredGroup, 'name' | 'city'>): string {
  if (group.name) {
    const fromName = detectCity(group.name);
    if (fromName !== OTHER_CITY) return fromName;
  }
  return group.city || OTHER_CITY;
}
