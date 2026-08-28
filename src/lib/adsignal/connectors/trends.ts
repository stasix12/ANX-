import type { SupabaseClient } from '@supabase/supabase-js';
import type { Niche } from '../types';
import { fetchJson, type Connector, type ConnectorResult } from './types';

/**
 * Google Trends — relative search interest (0–100) per niche keyword, geo IL.
 *
 * Two providers behind one table shape:
 *  - SerpApi (SERPAPI_KEY set): a paid, stable, ToS-clean provider.
 *  - Unofficial fallback (no key): the public JSON endpoints that back the
 *    Google Trends website — the same channel the pytrends library has used
 *    for years. Public data, no login; but unofficial, unversioned, and can
 *    be rate-limited or break without notice. The status screen says which
 *    provider ran. Values are REAL either way: a relative index, never
 *    absolute search volumes.
 */

const SERPAPI = 'https://serpapi.com/search.json';
const GT = 'https://trends.google.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

type Point = { date: string; value: number };

export const trendsConnector: Connector = {
  source: 'google_trends',
  name: 'Google Trends',
  requiredEnv: [],
  coverage: {
    provides:
      'עניין חיפוש יחסי (0–100) לפי מילת מפתח ומדינה, כולל ישראל — 90 ימים אחורה. עם SERPAPI_KEY רץ דרך ספק יציב; בלי מפתח רץ דרך הערוץ הציבורי הלא־רשמי של Google Trends (עלול להיחסם זמנית).',
    limits: 'אינדקס יחסי, לא נפחי חיפוש מוחלטים. הערוץ הלא־רשמי אינו מובטח על ידי Google.',
  },
  isConfigured: () => true,

  async run(db: SupabaseClient, niches: Niche[]): Promise<ConnectorResult> {
    const useSerpapi = Boolean(process.env.SERPAPI_KEY);
    const stats: Record<string, number> = { queries: 0, points: 0, failed_keywords: 0 };
    const only = (process.env.ADSIGNAL_TRENDS_NICHES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const selected = only.length ? niches.filter((n) => only.includes(n.key)) : niches;

    const cookie = useSerpapi ? '' : await bootstrapCookie();
    let firstError: string | null = null;

    for (const niche of selected) {
      const keyword = niche.keywords_he[0];
      if (!keyword) continue;
      stats.queries++;
      try {
        const points = useSerpapi
          ? await fetchViaSerpapi(keyword)
          : await fetchViaGoogle(keyword, cookie);
        if (points.length) {
          const rows = points.map((p) => ({
            niche_key: niche.key,
            country: 'IL',
            keyword,
            source: 'google_trends',
            date: p.date,
            value: p.value,
            meta: { provider: useSerpapi ? 'serpapi' : 'google_unofficial' },
            provenance: 'REAL',
          }));
          await db
            .from('adsignal_trend_series')
            .upsert(rows, { onConflict: 'niche_key,country,keyword,source,date' });
          stats.points += rows.length;
          await db.from('adsignal_raw_ingest').insert({
            source: 'google_trends',
            external_id: `IL:${niche.key}:${keyword}`,
            payload: { keyword, points: rows.length, provider: useSerpapi ? 'serpapi' : 'google_unofficial' },
            processed_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        stats.failed_keywords++;
        if (!firstError) firstError = `${keyword}: ${err instanceof Error ? err.message : String(err)}`;
      }
      // Be gentle with the unofficial endpoint — spread the requests out.
      if (!useSerpapi) await sleep(1500);
    }

    if (stats.points === 0 && firstError) {
      return { ok: false, stats, error: `no data ingested (${firstError})` };
    }
    return { ok: true, stats, ...(firstError ? { error: `partial: ${firstError}` } : {}) };
  },
};

async function fetchViaSerpapi(keyword: string): Promise<Point[]> {
  const params = new URLSearchParams({
    engine: 'google_trends',
    q: keyword,
    geo: 'IL',
    date: 'today 3-m',
    api_key: process.env.SERPAPI_KEY!,
  });
  const json = (await fetchJson(`${SERPAPI}?${params}`)) as {
    interest_over_time?: { timeline_data?: { timestamp?: string; values?: { value?: string | number }[] }[] };
  };
  return (json.interest_over_time?.timeline_data ?? [])
    .map((p) => {
      const ts = p.timestamp ? Number(p.timestamp) * 1000 : NaN;
      const value = Number(p.values?.[0]?.value);
      if (!Number.isFinite(ts) || !Number.isFinite(value)) return null;
      return { date: new Date(ts).toISOString().slice(0, 10), value };
    })
    .filter(Boolean) as Point[];
}

/** Grab the NID cookie the way a browser visit would. */
async function bootstrapCookie(): Promise<string> {
  try {
    const res = await fetch(`${GT}/trends/explore?geo=IL&hl=en-US`, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      cache: 'no-store',
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    return setCookie.map((c) => c.split(';')[0]).join('; ');
  } catch {
    return '';
  }
}

async function gtFetch(url: string, cookie: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept-language': 'en-US,en;q=0.9',
      ...(cookie ? { cookie } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Strip Google's anti-JSON-hijacking prefix ")]}'," and parse. */
function parseGoogleJson(text: string): unknown {
  const idx = text.indexOf('{');
  if (idx < 0) throw new Error('unexpected response shape');
  return JSON.parse(text.slice(idx));
}

async function fetchViaGoogle(keyword: string, cookie: string): Promise<Point[]> {
  const exploreReq = JSON.stringify({
    comparisonItem: [{ keyword, geo: 'IL', time: 'today 3-m' }],
    category: 0,
    property: '',
  });
  const exploreUrl = `${GT}/trends/api/explore?hl=en-US&tz=-120&req=${encodeURIComponent(exploreReq)}`;
  const explore = parseGoogleJson(await gtFetch(exploreUrl, cookie)) as {
    widgets?: { id?: string; token?: string; request?: unknown }[];
  };
  const widget = (explore.widgets ?? []).find((w) => w.id === 'TIMESERIES');
  if (!widget?.token || !widget.request) throw new Error('no TIMESERIES widget');

  const dataUrl =
    `${GT}/trends/api/widgetdata/multiline?hl=en-US&tz=-120` +
    `&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${encodeURIComponent(widget.token)}`;
  const data = parseGoogleJson(await gtFetch(dataUrl, cookie)) as {
    default?: { timelineData?: { time?: string; value?: number[]; hasData?: boolean[] }[] };
  };
  return (data.default?.timelineData ?? [])
    .map((p) => {
      const ts = p.time ? Number(p.time) * 1000 : NaN;
      const value = p.value?.[0];
      if (!Number.isFinite(ts) || typeof value !== 'number') return null;
      return { date: new Date(ts).toISOString().slice(0, 10), value };
    })
    .filter(Boolean) as Point[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
