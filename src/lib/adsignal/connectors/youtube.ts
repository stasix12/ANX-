import type { SupabaseClient } from '@supabase/supabase-js';
import type { Niche } from '../types';
import { fetchJson, todayIso, type Connector, type ConnectorResult } from './types';

/**
 * YouTube Data API v3 — an ORGANIC momentum signal, not ad data.
 * For each niche keyword we count videos published in the last 7 days
 * (regionCode=IL, Hebrew relevance) and sum their public view counts.
 * The stored value is "new videos found (sampled, max 50)" — a real,
 * honestly-labeled proxy for creator/consumer interest in the niche.
 *
 * Quota: search.list costs 100 units; one keyword per niche keeps a daily
 * sync around 1,300 of the 10,000 free units.
 */

const SEARCH = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS = 'https://www.googleapis.com/youtube/v3/videos';

export const youtubeConnector: Connector = {
  source: 'youtube',
  name: 'YouTube Data API',
  requiredEnv: ['YOUTUBE_API_KEY'],
  coverage: {
    provides:
      'סטטיסטיקות ציבוריות של סרטונים (צפיות/לייקים) וחיפוש לפי אזור ושפה — סיגנל אורגני לנישות שמתחממות בישראל.',
    limits: 'לא נתוני מודעות. ערך הסדרה = מספר סרטונים חדשים ב־7 ימים (מדגם עד 50) + סך צפיות.',
  },
  isConfigured: () => Boolean(process.env.YOUTUBE_API_KEY),

  async run(db: SupabaseClient, niches: Niche[]): Promise<ConnectorResult> {
    const key = process.env.YOUTUBE_API_KEY!;
    const stats = { queries: 0, points: 0 };
    const publishedAfter = new Date(Date.now() - 7 * 86400_000).toISOString();

    for (const niche of niches) {
      const keyword = niche.keywords_he[0];
      if (!keyword) continue;

      const searchParams = new URLSearchParams({
        key,
        part: 'id',
        q: keyword,
        type: 'video',
        publishedAfter,
        regionCode: 'IL',
        relevanceLanguage: 'iw',
        maxResults: '50',
      });
      stats.queries++;
      const search = (await fetchJson(`${SEARCH}?${searchParams}`)) as {
        items?: { id?: { videoId?: string } }[];
      };
      const ids = (search.items ?? []).map((i) => i.id?.videoId).filter(Boolean) as string[];

      let viewSum = 0;
      if (ids.length) {
        const videoParams = new URLSearchParams({ key, part: 'statistics', id: ids.join(','), maxResults: '50' });
        const videos = (await fetchJson(`${VIDEOS}?${videoParams}`)) as {
          items?: { statistics?: { viewCount?: string } }[];
        };
        viewSum = (videos.items ?? []).reduce((s, v) => s + (Number(v.statistics?.viewCount) || 0), 0);
      }

      await db.from('adsignal_raw_ingest').insert({
        source: 'youtube',
        external_id: `IL:${niche.key}:${keyword}`,
        payload: { keyword, videoCount: ids.length, viewSum },
        processed_at: new Date().toISOString(),
      });
      await db.from('adsignal_trend_series').upsert(
        {
          niche_key: niche.key,
          country: 'IL',
          keyword,
          source: 'youtube',
          date: todayIso(),
          value: ids.length,
          meta: { viewSum, sampledMax: 50, windowDays: 7 },
          provenance: 'REAL',
        },
        { onConflict: 'niche_key,country,keyword,source,date' },
      );
      stats.points++;
    }
    return { ok: true, stats };
  },
};
