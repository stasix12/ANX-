import 'server-only';
import { getAdsignalDb } from './db';
import type {
  Ad,
  AiAnalysis,
  Alert,
  Advertiser,
  ConnectorState,
  Niche,
  NicheMetrics,
} from './types';

/**
 * Read-side helpers for the screens. Every function returns null/[] when the
 * database is not configured; screens translate that into an honest setup
 * notice, never into invented rows.
 */

export type AdWithScore = Ad & {
  advertiser: Pick<Advertiser, 'id' | 'name' | 'page_url'> | null;
  hot_score: number | null;
  score_confidence: number | null;
  score_components: Record<string, number> | null;
};

export function dbConfigured(): boolean {
  return getAdsignalDb() !== null;
}

export async function getNiches(): Promise<Niche[]> {
  const db = getAdsignalDb();
  if (!db) return [];
  const { data } = await db.from('adsignal_niches').select('*').order('sort');
  return (data ?? []) as Niche[];
}

/** Attach the latest hot score to a list of ads. */
async function attachScores(ads: (Ad & { advertiser: AdWithScore['advertiser'] })[]): Promise<AdWithScore[]> {
  const db = getAdsignalDb();
  if (!db || !ads.length) {
    return ads.map((a) => ({ ...a, hot_score: null, score_confidence: null, score_components: null }));
  }
  const { data } = await db
    .from('adsignal_ad_scores')
    .select('ad_id, date, hot_score, confidence, components')
    .in('ad_id', ads.map((a) => a.id))
    .order('date', { ascending: false });
  const latest = new Map<string, { hot_score: number; confidence: number; components: Record<string, number> }>();
  for (const row of data ?? []) {
    if (!latest.has(row.ad_id)) {
      latest.set(row.ad_id, {
        hot_score: Number(row.hot_score),
        confidence: Number(row.confidence),
        components: row.components as Record<string, number>,
      });
    }
  }
  return ads.map((a) => ({
    ...a,
    hot_score: latest.get(a.id)?.hot_score ?? null,
    score_confidence: latest.get(a.id)?.confidence ?? null,
    score_components: latest.get(a.id)?.components ?? null,
  }));
}

export type ExplorerFilters = {
  country?: string;
  platform?: string;
  niche?: string;
  q?: string;
  advertiser?: string;
  active?: 'active' | 'inactive' | 'all';
  minScore?: number;
  minDays?: number;
  offerKind?: string;
};

export async function getExplorerAds(filters: ExplorerFilters, limit = 60): Promise<AdWithScore[]> {
  const db = getAdsignalDb();
  if (!db) return [];
  let query = db
    .from('adsignal_ads')
    .select('*, advertiser:adsignal_advertisers(id, name, page_url)')
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (filters.country) query = query.eq('country', filters.country);
  if (filters.platform) query = query.eq('platform', filters.platform);
  if (filters.niche) query = query.eq('niche_key', filters.niche);
  if (filters.q) query = query.ilike('body', `%${filters.q}%`);
  if (filters.advertiser) query = query.ilike('adsignal_advertisers.name', `%${filters.advertiser}%`);
  if (filters.active === 'active') query = query.eq('is_active', true);
  if (filters.active === 'inactive') query = query.eq('is_active', false);
  if (filters.minDays) {
    query = query.lte('started_at', new Date(Date.now() - filters.minDays * 86400_000).toISOString());
  }

  const { data } = await query;
  let ads = await attachScores((data ?? []) as (Ad & { advertiser: AdWithScore['advertiser'] })[]);
  if (filters.minScore) ads = ads.filter((a) => (a.hot_score ?? -1) >= filters.minScore!);
  return ads;
}

export async function getTopAds(country: string | null, limit = 8): Promise<AdWithScore[]> {
  const db = getAdsignalDb();
  if (!db) return [];
  const { data: scores } = await db
    .from('adsignal_ad_scores')
    .select('ad_id, hot_score, date')
    .order('date', { ascending: false })
    .order('hot_score', { ascending: false })
    .limit(200);
  const ids = [...new Set((scores ?? []).map((s) => s.ad_id))].slice(0, 100);
  if (!ids.length) return [];
  let query = db
    .from('adsignal_ads')
    .select('*, advertiser:adsignal_advertisers(id, name, page_url)')
    .in('id', ids)
    .eq('is_active', true);
  if (country) query = query.eq('country', country);
  const { data } = await query;
  const withScores = await attachScores((data ?? []) as (Ad & { advertiser: AdWithScore['advertiser'] })[]);
  return withScores.sort((a, b) => (b.hot_score ?? 0) - (a.hot_score ?? 0)).slice(0, limit);
}

export type AdDetail = {
  ad: AdWithScore;
  snapshots: {
    captured_at: string;
    is_active: boolean;
    reach_lower: number | null;
    reach_upper: number | null;
    impressions_lower: number | null;
    impressions_upper: number | null;
    spend_lower: number | null;
    spend_upper: number | null;
  }[];
  offers: { normalized_text: string; kind: string; detected_by: string }[];
  analysis: AiAnalysis | null;
  variantCount: number;
};

export async function getAdDetail(id: string): Promise<AdDetail | null> {
  const db = getAdsignalDb();
  if (!db) return null;
  const { data: adRow } = await db
    .from('adsignal_ads')
    .select('*, advertiser:adsignal_advertisers(id, name, page_url)')
    .eq('id', id)
    .maybeSingle();
  if (!adRow) return null;
  const [withScore] = await attachScores([adRow as Ad & { advertiser: AdWithScore['advertiser'] }]);

  const { data: snapshots } = await db
    .from('adsignal_ad_snapshots')
    .select('captured_at, is_active, reach_lower, reach_upper, impressions_lower, impressions_upper, spend_lower, spend_upper')
    .eq('ad_id', id)
    .order('captured_at', { ascending: true })
    .limit(90);

  const { data: offerRows } = await db
    .from('adsignal_ad_offers')
    .select('detected_by, offer:adsignal_offers(normalized_text, kind)')
    .eq('ad_id', id);

  const { data: analysis } = await db
    .from('adsignal_ai_analyses')
    .select('*')
    .eq('ad_id', id)
    .maybeSingle();

  let variantCount = 1;
  if (adRow.body_hash) {
    const { count } = await db
      .from('adsignal_ads')
      .select('id', { count: 'exact', head: true })
      .eq('advertiser_id', adRow.advertiser_id)
      .eq('body_hash', adRow.body_hash);
    variantCount = count ?? 1;
  }

  return {
    ad: withScore,
    snapshots: snapshots ?? [],
    offers: (offerRows ?? []).map((r) => {
      const offer = r.offer as unknown as { normalized_text: string; kind: string } | null;
      return { normalized_text: offer?.normalized_text ?? '', kind: offer?.kind ?? '', detected_by: r.detected_by };
    }),
    analysis: (analysis as AiAnalysis | null) ?? null,
    variantCount,
  };
}

export async function getNicheMetrics(country: string): Promise<NicheMetrics[]> {
  const db = getAdsignalDb();
  if (!db) return [];
  const { data } = await db
    .from('adsignal_niche_metrics')
    .select('*')
    .eq('country', country)
    .order('date', { ascending: false })
    .limit(200);
  const latest = new Map<string, NicheMetrics>();
  for (const row of (data ?? []) as NicheMetrics[]) {
    if (!latest.has(row.niche_key)) latest.set(row.niche_key, row);
  }
  return [...latest.values()].sort((a, b) => (b.opportunity ?? 0) - (a.opportunity ?? 0));
}

export async function getTrendSparklines(country: string): Promise<Map<string, number[]>> {
  const db = getAdsignalDb();
  const out = new Map<string, number[]>();
  if (!db) return out;
  const { data } = await db
    .from('adsignal_trend_series')
    .select('niche_key, source, date, value')
    .eq('country', country)
    .gte('date', new Date(Date.now() - 35 * 86400_000).toISOString().slice(0, 10))
    .order('date', { ascending: true });
  for (const row of data ?? []) {
    // Prefer google_trends; only fall back to youtube when nothing else exists.
    const key = row.niche_key as string;
    if (row.source === 'google_trends' || !out.has(key)) {
      if (row.source !== 'google_trends' && out.has(key)) continue;
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(Number(row.value));
    }
  }
  return out;
}

export type TrendingOffer = {
  offer_id: string;
  normalized_text: string;
  kind: string;
  advertisers: number;
  advertisers7d: number;
  ads: number;
};

export async function getTrendingOffers(limit = 30): Promise<TrendingOffer[]> {
  const db = getAdsignalDb();
  if (!db) return [];
  const { data } = await db
    .from('adsignal_ad_offers')
    .select('offer_id, ad:adsignal_ads(advertiser_id, first_seen_at), offer:adsignal_offers(normalized_text, kind)')
    .limit(5000);
  const map = new Map<string, TrendingOffer & { advSet: Set<string>; adv7Set: Set<string> }>();
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
  for (const row of data ?? []) {
    const ad = row.ad as unknown as { advertiser_id: string; first_seen_at: string } | null;
    const offer = row.offer as unknown as { normalized_text: string; kind: string } | null;
    if (!ad || !offer) continue;
    if (!map.has(row.offer_id)) {
      map.set(row.offer_id, {
        offer_id: row.offer_id,
        normalized_text: offer.normalized_text,
        kind: offer.kind,
        advertisers: 0,
        advertisers7d: 0,
        ads: 0,
        advSet: new Set(),
        adv7Set: new Set(),
      });
    }
    const entry = map.get(row.offer_id)!;
    entry.ads++;
    entry.advSet.add(ad.advertiser_id);
    if (ad.first_seen_at >= cutoff) entry.adv7Set.add(ad.advertiser_id);
  }
  return [...map.values()]
    .map(({ advSet, adv7Set, ...rest }) => ({ ...rest, advertisers: advSet.size, advertisers7d: adv7Set.size }))
    .sort((a, b) => b.advertisers - a.advertisers)
    .slice(0, limit);
}

export async function getAlerts(): Promise<{ alerts: Alert[]; events: { id: number; alert_id: string; triggered_at: string; payload: Record<string, unknown>; seen: boolean }[] }> {
  const db = getAdsignalDb();
  if (!db) return { alerts: [], events: [] };
  const [{ data: alerts }, { data: events }] = await Promise.all([
    db.from('adsignal_alerts').select('*').order('created_at', { ascending: false }),
    db.from('adsignal_alert_events').select('*').order('triggered_at', { ascending: false }).limit(50),
  ]);
  return { alerts: (alerts ?? []) as Alert[], events: events ?? [] };
}

export type CompetitorView = {
  id: string;
  label: string | null;
  advertiser: Pick<Advertiser, 'id' | 'name' | 'page_url' | 'platform'>;
  activeAds: number;
  totalAds: number;
  events: { kind: string; detected_at: string; payload: Record<string, unknown> }[];
};

export async function getCompetitors(): Promise<CompetitorView[]> {
  const db = getAdsignalDb();
  if (!db) return [];
  const { data: watches } = await db
    .from('adsignal_competitor_watches')
    .select('id, label, advertiser:adsignal_advertisers(id, name, page_url, platform)')
    .order('created_at', { ascending: false });
  const out: CompetitorView[] = [];
  for (const watch of watches ?? []) {
    const advertiser = watch.advertiser as unknown as CompetitorView['advertiser'];
    const [{ count: active }, { count: total }, { data: events }] = await Promise.all([
      db.from('adsignal_ads').select('id', { count: 'exact', head: true }).eq('advertiser_id', advertiser.id).eq('is_active', true),
      db.from('adsignal_ads').select('id', { count: 'exact', head: true }).eq('advertiser_id', advertiser.id),
      db.from('adsignal_competitor_events').select('kind, detected_at, payload').eq('watch_id', watch.id).order('detected_at', { ascending: false }).limit(20),
    ]);
    out.push({
      id: watch.id,
      label: watch.label,
      advertiser,
      activeAds: active ?? 0,
      totalAds: total ?? 0,
      events: events ?? [],
    });
  }
  return out;
}

export async function getConnectorStates(): Promise<ConnectorState[]> {
  const db = getAdsignalDb();
  if (!db) return [];
  const { data } = await db.from('adsignal_connector_state').select('*');
  return (data ?? []) as ConnectorState[];
}

export type Counts = { ads: number; activeAds: number; advertisers: number; offers: number; trendPoints: number };

export async function getCounts(): Promise<Counts> {
  const db = getAdsignalDb();
  if (!db) return { ads: 0, activeAds: 0, advertisers: 0, offers: 0, trendPoints: 0 };
  const [ads, activeAds, advertisers, offers, trendPoints] = await Promise.all([
    db.from('adsignal_ads').select('id', { count: 'exact', head: true }),
    db.from('adsignal_ads').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('adsignal_advertisers').select('id', { count: 'exact', head: true }),
    db.from('adsignal_offers').select('id', { count: 'exact', head: true }),
    db.from('adsignal_trend_series').select('id', { count: 'exact', head: true }),
  ]);
  return {
    ads: ads.count ?? 0,
    activeAds: activeAds.count ?? 0,
    advertisers: advertisers.count ?? 0,
    offers: offers.count ?? 0,
    trendPoints: trendPoints.count ?? 0,
  };
}

export async function searchAdvertisers(q: string, limit = 10): Promise<Advertiser[]> {
  const db = getAdsignalDb();
  if (!db || !q) return [];
  const { data } = await db
    .from('adsignal_advertisers')
    .select('*')
    .ilike('name', `%${q}%`)
    .limit(limit);
  return (data ?? []) as Advertiser[];
}
