import type { SupabaseClient } from '@supabase/supabase-js';
import type { Niche } from '../types';
import { fetchJson, type Connector, type ConnectorResult } from './types';

/**
 * Google Trends via SerpApi (a paid, ToS-clean provider). Google's official
 * Trends API is still in limited alpha; this provider sits behind the same
 * table shape so it can be swapped the day the official API opens up.
 * Stored value is Google's relative search-interest index (0–100) — REAL,
 * but an index, never an absolute search volume.
 *
 * Quota note: one request per niche per run. On SerpApi's free tier (100
 * searches/month) run this weekly, or set ADSIGNAL_TRENDS_NICHES to a
 * comma-separated subset of niche keys.
 */

const API = 'https://serpapi.com/search.json';

export const trendsConnector: Connector = {
  source: 'google_trends',
  name: 'Google Trends (SerpApi)',
  requiredEnv: ['SERPAPI_KEY'],
  coverage: {
    provides: 'עניין חיפוש יחסי (0–100) לפי מילת מפתח ומדינה, כולל ישראל — 90 ימים אחורה בכל ריצה.',
    limits: 'אינדקס יחסי, לא נפחי חיפוש מוחלטים. מוגבל במכסת ה־SerpApi של החשבון שלך.',
  },
  isConfigured: () => Boolean(process.env.SERPAPI_KEY),

  async run(db: SupabaseClient, niches: Niche[]): Promise<ConnectorResult> {
    const key = process.env.SERPAPI_KEY!;
    const stats = { queries: 0, points: 0 };
    const only = (process.env.ADSIGNAL_TRENDS_NICHES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const selected = only.length ? niches.filter((n) => only.includes(n.key)) : niches;

    for (const niche of selected) {
      const keyword = niche.keywords_he[0];
      if (!keyword) continue;

      const params = new URLSearchParams({
        engine: 'google_trends',
        q: keyword,
        geo: 'IL',
        date: 'today 3-m',
        api_key: key,
      });
      stats.queries++;
      const json = (await fetchJson(`${API}?${params}`)) as {
        interest_over_time?: {
          timeline_data?: { timestamp?: string; date?: string; values?: { value?: string | number }[] }[];
        };
      };
      const points = json.interest_over_time?.timeline_data ?? [];

      await db.from('adsignal_raw_ingest').insert({
        source: 'google_trends',
        external_id: `IL:${niche.key}:${keyword}`,
        payload: { keyword, points: points.length },
        processed_at: new Date().toISOString(),
      });

      const rows = points
        .map((p) => {
          const ts = p.timestamp ? Number(p.timestamp) * 1000 : NaN;
          if (!Number.isFinite(ts)) return null;
          const value = Number(p.values?.[0]?.value);
          if (!Number.isFinite(value)) return null;
          return {
            niche_key: niche.key,
            country: 'IL',
            keyword,
            source: 'google_trends',
            date: new Date(ts).toISOString().slice(0, 10),
            value,
            meta: {},
            provenance: 'REAL',
          };
        })
        .filter(Boolean) as Record<string, unknown>[];

      if (rows.length) {
        await db
          .from('adsignal_trend_series')
          .upsert(rows, { onConflict: 'niche_key,country,keyword,source,date' });
        stats.points += rows.length;
      }
    }
    return { ok: true, stats };
  },
};
