/**
 * City and street autocomplete backed by Israel's official address registry
 * on data.gov.il — free, keyless, CORS-served, so the browser queries it
 * directly. The base is overridable so the local mock can stand in during
 * development.
 */

const BASE = process.env.NEXT_PUBLIC_PLACES_BASE ?? 'https://data.gov.il';

/** מרשם היישובים — city names under the שם_ישוב field. */
const CITIES_RESOURCE = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba';
/** מרשם הרחובות — street names under שם_רחוב, keyed by city via שם_ישוב. */
const STREETS_RESOURCE = '9ad3862c-8391-4b2f-84a4-2d4c68625f4b';

/* eslint-disable @typescript-eslint/no-explicit-any */
async function datastoreSearch(
  resourceId: string,
  query: string,
  filters?: Record<string, string>,
): Promise<any[]> {
  const params = new URLSearchParams({ resource_id: resourceId, q: query, limit: '12' });
  if (filters) params.set('filters', JSON.stringify(filters));
  const response = await fetch(`${BASE}/api/3/action/datastore_search?${params}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) return [];
  return body.result?.records ?? [];
}

/** Unique, prefix-matches first, capped for a phone-sized dropdown. */
function tidy(values: string[], query: string): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (value && !seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique
    .sort((a, b) => Number(b.startsWith(query)) - Number(a.startsWith(query)))
    .slice(0, 8);
}

export async function searchCities(query: string): Promise<string[]> {
  const records = await datastoreSearch(CITIES_RESOURCE, query);
  return tidy(
    records.map((r) => String(r['שם_ישוב'] ?? '').trim()),
    query,
  );
}

/** Streets matching `query`; narrowed to `city` when one is filled in. */
export async function searchStreets(query: string, city?: string): Promise<string[]> {
  const trimmedCity = city?.trim();
  const records = await datastoreSearch(
    STREETS_RESOURCE,
    query,
    trimmedCity ? { שם_ישוב: trimmedCity } : undefined,
  );
  return tidy(
    records.map((r) => String(r['שם_רחוב'] ?? '').trim()),
    query,
  );
}
