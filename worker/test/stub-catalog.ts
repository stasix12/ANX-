/*
 * THE CATALOG'S READS, STUBBED — so the SCREEN can be driven in a browser
 * without a Postgres behind it.
 *
 * It is a stand-in for src/lib/social/client.ts's four catalog exports and
 * nothing else: worker/test/catalog-screen.test.ts bundles the real component
 * with this module aliased in its place. The DATABASE half of the brief's
 * "תוך שנייה" is measured against a real Postgres holding 20,000 groups in
 * worker/test/catalog.test.ts; this half is about the screen.
 *
 * EVERY QUERY IT IS ASKED IS RECORDED, which is the point. "אין לבצע חיפוש
 * חיצוני" and "הסינון קורה במסד" are claims about what the screen SENDS, and
 * window.__queries is the evidence: if a filter were applied to an array in
 * the browser instead, the query would arrive without it.
 */
export const CATALOG_PAGE = 60;

/**
 * Which groups the publishing list already holds — the "כבר במערכת" mark.
 *
 * Two of the twenty thousand, chosen by id so the test can point at exactly
 * those rows and at a row that is NOT one of them.
 */
/*
 * THE TWO BIGGEST, not 'cat-1' and 'cat-2'.
 *
 * The catalog's default order is the biggest first, so a mark put on two
 * arbitrary ids lands on rows that are fourteen thousand places down and the
 * test asserts against something nobody can see. These two are on the first
 * page by construction, whatever the member formula below becomes.
 */
export const ALREADY_MINE: string[] = [];
/**
 * What Facebook's own search said about this account, for the handful of
 * groups it has looked at — the stand-in for his own גילוי קבוצות rows.
 *
 * Deliberately three different answers and a silence: a member, one he only
 * asked to join, one he is definitely not in, and everything else unknown.
 */
export async function listMembershipByExternalId(): Promise<Map<string, 'member' | 'requested' | 'none' | 'unknown'>> {
  const biggest = Array.from({ length: TOTAL }, (_, i) => group(i + 1))
    .sort((a, b) => (b.members ?? -1) - (a.members ?? -1) || a.external_id.localeCompare(b.external_id))
    .map((g) => g.external_id);
  return new Map([
    [biggest[2], 'member' as const],
    [biggest[3], 'requested' as const],
    [biggest[4], 'none' as const],
  ]);
}

/**
 * WHAT THE "DATABASE" HAS BEEN TOLD — the ids the harness really added.
 *
 * The screen no longer guesses which of a selection landed; it re-reads this
 * list. So the stub has to behave like the thing it stands in for: a group it
 * was told about comes back, and one it was not does not. Without this the
 * re-read would hand back the same three rows for ever and the test could not
 * tell a successful add from a refused one.
 */
const ADDED = new Set<string>();
export function markAdded(ids: string[]): void {
  for (const id of ids) ADDED.add(id);
}

export async function listTargetExternalIds(): Promise<Set<string>> {
  if (!ALREADY_MINE.length) {
    const biggest = Array.from({ length: TOTAL }, (_, i) => group(i + 1))
      .sort((a, b) => (b.members ?? -1) - (a.members ?? -1) || a.external_id.localeCompare(b.external_id))
      .slice(0, 2)
      .map((g) => g.external_id);
    ALREADY_MINE.push(...biggest);
  }
  return new Set([...ALREADY_MINE, ...ADDED]);
}

export interface CatalogGroup {
  external_id: string;
  name: string;
  url: string;
  image_url: string;
  members: number | null;
  privacy: string;
  city: string;
  region: string;
  language: string;
  category: string;
  status: string;
  last_seen_at: string;
}

export type CatalogSort = 'members' | 'name' | 'new';

export interface CatalogQuery {
  q?: string;
  city?: string;
  region?: string;
  language?: string;
  category?: string;
  sort?: CatalogSort;
  offset?: number;
  limit?: number;
}

export interface CatalogPage {
  rows: CatalogGroup[];
  total: number;
}

declare global {
  interface Window {
    /** Every query the screen has sent, in order. */
    __queries: CatalogQuery[];
    /** How long the stub waits before answering, so a slow database can be acted out. */
    __delayMs: number;
  }
}

if (typeof window !== 'undefined') {
  window.__queries = [];
  window.__delayMs = 0;
}

/* A deterministic catalog: 20,000 groups over five cities and three languages,
   the same shape the real table is loaded with in catalog.test.ts. */
const CITIES = ['באר שבע', 'תל אביב-יפו', 'ירושלים', 'אשדוד', 'ערד'];
/* Their real regions — the same answer src/lib/social/cities-data.ts gives. */
const REGION_OF: Record<string, string> = {
  'באר שבע': 'דרום',
  'תל אביב-יפו': 'מרכז',
  'ירושלים': 'מרכז',
  אשדוד: 'דרום',
  ערד: 'דרום',
};
const LANGUAGES = ['he', 'ru', ''];
const NAMES = ['קבוצת מודעות', 'Объявления', 'יד שנייה', 'דרושים'];
const TOTAL = 20_000;

function group(i: number): CatalogGroup {
  return {
    external_id: `cat-${i}`,
    name: `${NAMES[i % NAMES.length]} ${i}`,
    url: `https://facebook.com/groups/cat-${i}`,
    image_url: '',
    members: (i * 7) % 50_000,
    privacy: i % 3 === 0 ? 'public' : 'private',
    city: CITIES[i % CITIES.length],
    region: REGION_OF[CITIES[i % CITIES.length]],
    language: LANGUAGES[i % LANGUAGES.length],
    category: i % 4 === 0 ? 'יד שנייה' : '',
    status: i % 97 === 0 ? 'unavailable' : 'active',
    last_seen_at: '2026-11-18T00:00:00.000Z',
  };
}

/* The filtering happens HERE, standing in for Postgres — which is the whole
   point: the screen hands over a query and is given a page and a count. */
export async function searchCatalog(query: CatalogQuery = {}): Promise<CatalogPage> {
  window.__queries.push({ ...query });
  if (window.__delayMs) await new Promise((r) => setTimeout(r, window.__delayMs));
  const all: CatalogGroup[] = [];
  for (let i = 1; i <= TOTAL; i += 1) {
    const g = group(i);
    if (query.q && !g.name.includes(query.q)) continue;
    if (query.city && g.city !== query.city) continue;
    if (query.region && g.region !== query.region) continue;
    if (query.language && g.language !== query.language) continue;
    if (query.category && g.category !== query.category) continue;
    all.push(g);
  }
  /* The stand-in for Postgres' ORDER BY: available first, then the chosen
     order, then the id as a tie-break — exactly what searchCatalog asks for. */
  const rank = (g: CatalogGroup) => (g.status === 'unavailable' ? 1 : 0);
  all.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (query.sort === 'name') return a.name.localeCompare(b.name, 'he') || a.external_id.localeCompare(b.external_id);
    if (query.sort === 'new') return b.last_seen_at.localeCompare(a.last_seen_at) || a.external_id.localeCompare(b.external_id);
    return (b.members ?? -1) - (a.members ?? -1) || a.external_id.localeCompare(b.external_id);
  });
  const from = query.offset ?? 0;
  const limit = query.limit ?? CATALOG_PAGE;
  return { rows: all.slice(from, from + limit), total: all.length };
}

export async function catalogStats(): Promise<{ total: number; unavailable: number; updatedAt: string | null }> {
  return { total: TOTAL, unavailable: 206, updatedAt: '2026-11-18T00:00:00.000Z' };
}

/**
 * The filter values WITH their counts, as social_catalog_facets() returns
 * them — values and counts out of the database, never a DISTINCT over a
 * sample of rows in the browser.
 */
export async function catalogFacets(): Promise<{
  cities: { value: string; groups: number }[];
  regions: { value: string; groups: number }[];
  languages: { value: string; groups: number }[];
  categories: { value: string; groups: number }[];
  capped: boolean;
}> {
  const tally = (get: (g: CatalogGroup) => string) => {
    const n = new Map<string, number>();
    for (let i = 1; i <= TOTAL; i += 1) {
      const v = get(group(i));
      if (v) n.set(v, (n.get(v) ?? 0) + 1);
    }
    return [...n.entries()].map(([value, groups]) => ({ value, groups })).sort((a, b) => b.groups - a.groups);
  };
  return {
    cities: tally((g) => g.city),
    /* The stub's five cities are in three different regions, which is what
       lets the test prove the city list narrows when a region is chosen. */
    regions: tally((g) => g.region),
    languages: tally((g) => g.language),
    categories: tally((g) => g.category),
    capped: false,
  };
}
