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

export interface CatalogQuery {
  q?: string;
  city?: string;
  language?: string;
  category?: string;
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
const CITIES = ['באר שבע', 'תל אביב', 'ירושלים', 'אשדוד', 'ערד'];
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
    region: 'דרום',
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
    if (query.language && g.language !== query.language) continue;
    if (query.category && g.category !== query.category) continue;
    all.push(g);
  }
  const from = query.offset ?? 0;
  const limit = query.limit ?? CATALOG_PAGE;
  return { rows: all.slice(from, from + limit), total: all.length };
}

export async function catalogStats(): Promise<{ total: number; unavailable: number; updatedAt: string | null }> {
  return { total: TOTAL, unavailable: 206, updatedAt: '2026-11-18T00:00:00.000Z' };
}

export async function catalogFacets(): Promise<{ cities: string[]; languages: string[]; categories: string[]; capped: boolean }> {
  return { cities: CITIES, languages: ['he', 'ru'], categories: ['יד שנייה'], capped: false };
}
