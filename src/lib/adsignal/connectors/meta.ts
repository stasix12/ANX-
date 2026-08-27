import type { SupabaseClient } from '@supabase/supabase-js';
import type { Niche } from '../types';
import { contentHash, extractOffers, normalizeBody } from '../offers';
import { fetchJson, todayIso, type Connector, type ConnectorResult } from './types';

/**
 * Meta Ad Library (official `ads_archive` Graph API endpoint).
 *
 * What it truly returns:
 *  - ALL ads (commercial included) delivered to EU countries, with
 *    `eu_total_reach` — courtesy of the DSA.
 *  - Political/social-issue ads worldwide (Israel included), with spend and
 *    impression RANGES.
 * It does NOT return commercial ads that run only outside the EU (Israel's
 * commercial ads among them), and never returns likes/comments/shares.
 * Those gaps stay visible in the product instead of being papered over.
 */

const API = 'https://graph.facebook.com/v21.0/ads_archive';
const FIELDS = [
  'id',
  'page_id',
  'page_name',
  'ad_creative_bodies',
  'ad_creative_link_titles',
  'ad_creative_link_captions',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'ad_snapshot_url',
  'publisher_platforms',
  'languages',
  'eu_total_reach',
  'spend',
  'impressions',
].join(',');

const MAX_PAGES_PER_QUERY = 2; // 100 ads per page keeps daily quota sane

type MetaAd = {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  publisher_platforms?: string[];
  languages?: string[];
  eu_total_reach?: number;
  spend?: { lower_bound?: string; upper_bound?: string };
  impressions?: { lower_bound?: string; upper_bound?: string };
};

function countries(): string[] {
  return (process.env.ADSIGNAL_META_COUNTRIES ?? 'IL')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

export const metaConnector: Connector = {
  source: 'meta_ad_library',
  name: 'Meta Ad Library',
  requiredEnv: ['META_ADLIB_ACCESS_TOKEN'],
  coverage: {
    provides:
      'כל המודעות (כולל מסחריות) שמוצגות במדינות ה־EU עם טווחי Reach; מודעות פוליטיות/נושאים חברתיים בכל העולם כולל ישראל, עם טווחי הוצאה וחשיפות; תאריכי ריצה, טקסטים, פלטפורמות.',
    limits:
      'מודעות מסחריות שרצות רק בישראל אינן זמינות ב־API (רק ב־Ad Library באתר). אין נתוני לייקים/תגובות/שיתופים לאף מודעה.',
  },
  isConfigured: () => Boolean(process.env.META_ADLIB_ACCESS_TOKEN),

  async run(db: SupabaseClient, niches: Niche[]): Promise<ConnectorResult> {
    const token = process.env.META_ADLIB_ACCESS_TOKEN!;
    const stats = { queries: 0, ads_seen: 0, ads_upserted: 0, snapshots: 0, offers_linked: 0 };

    for (const country of countries()) {
      for (const niche of niches) {
        const keyword = (country === 'IL' ? niche.keywords_he[0] : niche.keywords_en[0]) ?? null;
        if (!keyword) continue;

        let after: string | undefined;
        for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
          const params = new URLSearchParams({
            access_token: token,
            search_terms: keyword,
            ad_reached_countries: JSON.stringify([country]),
            ad_active_status: 'ALL',
            ad_type: 'ALL',
            fields: FIELDS,
            limit: '100',
          });
          if (after) params.set('after', after);
          stats.queries++;

          const json = (await fetchJson(`${API}?${params}`)) as {
            data?: MetaAd[];
            paging?: { cursors?: { after?: string } };
          };
          const ads = json.data ?? [];
          stats.ads_seen += ads.length;
          if (ads.length) {
            await db.from('adsignal_raw_ingest').insert({
              source: 'meta_ad_library',
              external_id: `${country}:${niche.key}:${keyword}:p${page}`,
              payload: { count: ads.length, ads },
              processed_at: new Date().toISOString(),
            });
            const n = await normalizeBatch(db, ads, niche.key, country);
            stats.ads_upserted += n.ads;
            stats.snapshots += n.snapshots;
            stats.offers_linked += n.offers;
          }
          after = json.paging?.cursors?.after;
          if (!after || ads.length < 100) break;
        }
      }
    }
    return { ok: true, stats };
  },
};

async function normalizeBatch(
  db: SupabaseClient,
  ads: MetaAd[],
  nicheKey: string,
  country: string,
): Promise<{ ads: number; snapshots: number; offers: number }> {
  const out = { ads: 0, snapshots: 0, offers: 0 };
  const now = new Date().toISOString();

  for (const raw of ads) {
    if (!raw.id || !raw.page_id) continue;

    const { data: advertiser } = await db
      .from('adsignal_advertisers')
      .upsert(
        {
          platform: 'meta',
          external_id: raw.page_id,
          name: raw.page_name ?? `Page ${raw.page_id}`,
          page_url: `https://www.facebook.com/${raw.page_id}`,
          last_seen_at: now,
        },
        { onConflict: 'platform,external_id' },
      )
      .select('id')
      .single();
    if (!advertiser) continue;

    const body = raw.ad_creative_bodies?.[0] ?? null;
    const stop = raw.ad_delivery_stop_time ?? null;
    const isActive = !stop || new Date(stop).getTime() > Date.now();

    const { data: ad } = await db
      .from('adsignal_ads')
      .upsert(
        {
          platform: 'meta',
          external_id: raw.id,
          advertiser_id: advertiser.id,
          niche_key: nicheKey,
          country,
          language: raw.languages?.[0] ?? null,
          ad_type: null,
          title: raw.ad_creative_link_titles?.[0] ?? null,
          body,
          body_hash: body ? contentHash(normalizeBody(body)) : null,
          started_at: raw.ad_delivery_start_time ?? null,
          ended_at: stop,
          is_active: isActive,
          landing_url: raw.ad_creative_link_captions?.[0] ?? null,
          snapshot_url: raw.ad_snapshot_url ?? null,
          source_kind: 'api',
          last_seen_at: now,
        },
        { onConflict: 'platform,external_id' },
      )
      .select('id')
      .single();
    if (!ad) continue;
    out.ads++;

    const num = (v?: string) => (v === undefined || v === null ? null : Number(v) || null);
    await db.from('adsignal_ad_snapshots').upsert(
      {
        ad_id: ad.id,
        captured_at: todayIso(),
        is_active: isActive,
        reach_lower: raw.eu_total_reach ?? null,
        reach_upper: raw.eu_total_reach ?? null,
        spend_lower: num(raw.spend?.lower_bound),
        spend_upper: num(raw.spend?.upper_bound),
        impressions_lower: num(raw.impressions?.lower_bound),
        impressions_upper: num(raw.impressions?.upper_bound),
        provenance: 'REAL',
      },
      { onConflict: 'ad_id,captured_at' },
    );
    out.snapshots++;

    for (const offer of extractOffers([body, raw.ad_creative_link_titles?.[0]].filter(Boolean).join(' '))) {
      const { data: offerRow } = await db
        .from('adsignal_offers')
        .upsert({ normalized_text: offer.normalized, kind: offer.kind }, { onConflict: 'normalized_text' })
        .select('id')
        .single();
      if (offerRow) {
        await db
          .from('adsignal_ad_offers')
          .upsert({ ad_id: ad.id, offer_id: offerRow.id, detected_by: 'rule' }, { onConflict: 'ad_id,offer_id' });
        out.offers++;
      }
    }
  }
  return out;
}
