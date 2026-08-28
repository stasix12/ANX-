import type { SupabaseClient } from '@supabase/supabase-js';
import type { Niche } from '../types';
import { ANCHOR_KEYWORD } from '../taxonomy';
import { fetchJson, todayIso, type Connector, type ConnectorResult } from './types';

/**
 * Google Trends — the system's primary demand source. Three REAL series:
 *
 *  - google_trends       per-keyword interest over time (0–100, self-relative)
 *  - google_trends_cmp   cross-service RELATIVE VOLUME: comparison batches
 *                        that all include one anchor keyword, rescaled so the
 *                        anchor = 100. This is what makes "which service is
 *                        searched the most right now" answerable — single-
 *                        keyword indexes are NOT comparable to each other.
 *  - google_trends_rising  Google's own "rising related queries" per service,
 *                        value = growth % (very large for Breakout).
 *
 * Providers: SerpApi when SERPAPI_KEY is set (timeline only, stable), else
 * the public unofficial endpoints behind the Trends site (all three series).
 */

const SERPAPI = 'https://serpapi.com/search.json';
const GT = 'https://trends.google.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

type Point = { date: string; value: number };
type Widget = { id?: string; token?: string; request?: unknown };

export const trendsConnector: Connector = {
  source: 'google_trends',
  name: 'Google Trends',
  requiredEnv: [],
  coverage: {
    provides:
      'עניין חיפוש יחסי לכל שירות (90 יום), נפח יחסי השוואתי בין השירותים (שיטת עוגן), וחיפושים מזנקים (Rising) — הכול לישראל. עם SERPAPI_KEY רץ דרך ספק יציב; בלי מפתח — דרך הערוץ הציבורי הלא־רשמי של Google Trends.',
    limits: 'אינדקסים יחסיים, לא נפחי חיפוש מוחלטים. הערוץ הלא־רשמי אינו מובטח על ידי Google.',
  },
  isConfigured: () => true,

  async run(db: SupabaseClient, niches: Niche[]): Promise<ConnectorResult> {
    const useSerpapi = Boolean(process.env.SERPAPI_KEY);
    const stats: Record<string, number> = {
      queries: 0, points: 0, cmp_points: 0, rising_points: 0, failed_keywords: 0,
    };
    const only = (process.env.ADSIGNAL_TRENDS_NICHES ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const selected = only.length ? niches.filter((n) => only.includes(n.key)) : niches;
    const cookie = useSerpapi ? '' : await bootstrapCookie();
    let firstError: string | null = null;
    const today = todayIso();

    // ---- pass 1: per-service timeline + rising queries --------------------
    for (const niche of selected) {
      const keyword = niche.keywords_he[0];
      if (!keyword) continue;
      stats.queries++;
      try {
        if (useSerpapi) {
          const points = await fetchViaSerpapi(keyword);
          stats.points += await storeTimeline(db, niche.key, keyword, points, 'serpapi');
        } else {
          const widgets = await explore(cookie, [keyword]);
          const points = await fetchTimeline(cookie, widgets);
          stats.points += await storeTimeline(db, niche.key, keyword, points, 'google_unofficial');
          const rising = await fetchRising(cookie, widgets).catch(() => []);
          if (rising.length) {
            const rows = rising.slice(0, 8).map((r) => ({
              niche_key: niche.key,
              country: 'IL',
              keyword: r.query,
              source: 'google_trends_rising',
              date: today,
              value: r.value,
              meta: { base_keyword: keyword, formatted: r.formatted },
              provenance: 'REAL',
            }));
            await db.from('adsignal_trend_series')
              .upsert(rows, { onConflict: 'niche_key,country,keyword,source,date' });
            stats.rising_points += rows.length;
          }
        }
      } catch (err) {
        stats.failed_keywords++;
        if (!firstError) firstError = `${keyword}: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (!useSerpapi) await sleep(1200);
    }

    // ---- pass 2: anchored comparison batches → relative volume ------------
    if (!useSerpapi) {
      const others = selected
        .map((n) => ({ key: n.key, kw: n.keywords_he[0] }))
        .filter((x) => x.kw && x.kw !== ANCHOR_KEYWORD) as { key: string; kw: string }[];
      const anchorNiche = selected.find((n) => n.keywords_he[0] === ANCHOR_KEYWORD);

      for (let i = 0; i < others.length; i += 4) {
        const batch = others.slice(i, i + 4);
        try {
          const kws = [ANCHOR_KEYWORD, ...batch.map((b) => b.kw)];
          const widgets = await explore(cookie, kws);
          const series = await fetchMultiTimeline(cookie, widgets, kws.length);
          const avg7 = series.map((vals) => {
            const recent = vals.slice(-7);
            return recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
          });
          const anchorAvg = avg7[0] || 1;
          const rows = batch.map((b, j) => ({
            niche_key: b.key,
            country: 'IL',
            keyword: b.kw,
            source: 'google_trends_cmp',
            date: today,
            value: Math.round(((avg7[j + 1] ?? 0) / anchorAvg) * 100),
            meta: { anchor: ANCHOR_KEYWORD },
            provenance: 'REAL',
          }));
          if (anchorNiche && i === 0) {
            rows.push({
              niche_key: anchorNiche.key, country: 'IL', keyword: ANCHOR_KEYWORD,
              source: 'google_trends_cmp', date: today, value: 100,
              meta: { anchor: ANCHOR_KEYWORD }, provenance: 'REAL',
            });
          }
          await db.from('adsignal_trend_series')
            .upsert(rows, { onConflict: 'niche_key,country,keyword,source,date' });
          stats.cmp_points += rows.length;
        } catch (err) {
          stats.failed_keywords++;
          if (!firstError) firstError = `cmp: ${err instanceof Error ? err.message : String(err)}`;
        }
        await sleep(1200);
      }
    }

    if (stats.points === 0 && firstError) {
      return { ok: false, stats, error: `no data ingested (${firstError})` };
    }
    return { ok: true, stats, ...(firstError ? { error: `partial: ${firstError}` } : {}) };
  },
};

async function storeTimeline(
  db: SupabaseClient, nicheKey: string, keyword: string, points: Point[], provider: string,
): Promise<number> {
  if (!points.length) return 0;
  const rows = points.map((p) => ({
    niche_key: nicheKey, country: 'IL', keyword, source: 'google_trends',
    date: p.date, value: p.value, meta: { provider }, provenance: 'REAL',
  }));
  await db.from('adsignal_trend_series')
    .upsert(rows, { onConflict: 'niche_key,country,keyword,source,date' });
  await db.from('adsignal_raw_ingest').insert({
    source: 'google_trends', external_id: `IL:${nicheKey}:${keyword}`,
    payload: { keyword, points: rows.length, provider }, processed_at: new Date().toISOString(),
  });
  return rows.length;
}

async function fetchViaSerpapi(keyword: string): Promise<Point[]> {
  const params = new URLSearchParams({
    engine: 'google_trends', q: keyword, geo: 'IL', date: 'today 3-m',
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
      redirect: 'follow', cache: 'no-store',
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
      'user-agent': UA, 'accept-language': 'en-US,en;q=0.9',
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

async function explore(cookie: string, keywords: string[]): Promise<Widget[]> {
  const req = JSON.stringify({
    comparisonItem: keywords.map((keyword) => ({ keyword, geo: 'IL', time: 'today 3-m' })),
    category: 0, property: '',
  });
  const url = `${GT}/trends/api/explore?hl=en-US&tz=-120&req=${encodeURIComponent(req)}`;
  const parsed = parseGoogleJson(await gtFetch(url, cookie)) as { widgets?: Widget[] };
  return parsed.widgets ?? [];
}

async function widgetData(cookie: string, widget: Widget, endpoint: string): Promise<unknown> {
  if (!widget.token || !widget.request) throw new Error(`no widget for ${endpoint}`);
  const url =
    `${GT}/trends/api/widgetdata/${endpoint}?hl=en-US&tz=-120` +
    `&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${encodeURIComponent(widget.token)}`;
  return parseGoogleJson(await gtFetch(url, cookie));
}

async function fetchTimeline(cookie: string, widgets: Widget[]): Promise<Point[]> {
  const widget = widgets.find((w) => w.id === 'TIMESERIES');
  const data = (await widgetData(cookie, widget ?? {}, 'multiline')) as {
    default?: { timelineData?: { time?: string; value?: number[] }[] };
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

/** Timeline of a comparison request: one value-array per keyword, shared scale. */
async function fetchMultiTimeline(cookie: string, widgets: Widget[], count: number): Promise<number[][]> {
  const widget = widgets.find((w) => w.id === 'TIMESERIES');
  const data = (await widgetData(cookie, widget ?? {}, 'multiline')) as {
    default?: { timelineData?: { value?: number[] }[] };
  };
  const timeline = data.default?.timelineData ?? [];
  return Array.from({ length: count }, (_, i) =>
    timeline.map((p) => p.value?.[i]).filter((v): v is number => typeof v === 'number'),
  );
}

async function fetchRising(
  cookie: string, widgets: Widget[],
): Promise<{ query: string; value: number; formatted: string }[]> {
  const widget = widgets.find((w) => w.id === 'RELATED_QUERIES');
  const data = (await widgetData(cookie, widget ?? {}, 'relatedsearches')) as {
    default?: { rankedList?: { rankedKeyword?: { query?: string; value?: number; formattedValue?: string }[] }[] };
  };
  // rankedList[0] = top, rankedList[1] = rising
  const rising = data.default?.rankedList?.[1]?.rankedKeyword ?? [];
  return rising
    .filter((r) => r.query && typeof r.value === 'number')
    .map((r) => ({ query: r.query!, value: r.value!, formatted: r.formattedValue ?? '' }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
