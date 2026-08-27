import type { SupabaseClient } from '@supabase/supabase-js';
import { hotScore, opportunityScore, signalStatus, windowDelta } from './scoring';
import type { Alert, AlertRule, Niche } from './types';

/**
 * The daily derived-metrics pass — everything it writes is provenance
 * DERIVED, computed strictly from ingested REAL rows:
 *   1. Hot Score per ad (with confidence + component breakdown)
 *   2. Niche metrics per niche×country (demand, activity, competition,
 *      opportunity, early-signal status)
 *   3. Competitor events for watched advertisers
 *   4. Alert evaluation
 */

const today = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

type AdRow = {
  id: string;
  advertiser_id: string;
  niche_key: string | null;
  country: string | null;
  body_hash: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_active: boolean;
  first_seen_at: string;
};

export type RollupReport = Record<string, number>;

export async function runRollup(db: SupabaseClient, niches: Niche[]): Promise<RollupReport> {
  const report: RollupReport = { ads_scored: 0, niche_rows: 0, competitor_events: 0, alert_events: 0 };

  // ---- load working set (bounded; fine for MVP scale) --------------------
  const { data: adsData } = await db
    .from('adsignal_ads')
    .select('id, advertiser_id, niche_key, country, body_hash, started_at, ended_at, is_active, first_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(5000);
  const ads = (adsData ?? []) as AdRow[];

  const { data: trendData } = await db
    .from('adsignal_trend_series')
    .select('niche_key, country, source, date, value')
    .gte('date', daysAgoIso(70).slice(0, 10))
    .order('date', { ascending: true });
  const trendRows = (trendData ?? []) as { niche_key: string; country: string; source: string; date: string; value: number }[];

  const { data: offerLinks } = await db
    .from('adsignal_ad_offers')
    .select('ad_id, offer_id, detected_at');
  const links = (offerLinks ?? []) as { ad_id: string; offer_id: string; detected_at: string }[];

  // ---- lookup structures --------------------------------------------------
  const adById = new Map(ads.map((a) => [a.id, a]));
  const variantCounts = new Map<string, number>(); // advertiser|body_hash -> n
  const advertiserRecentAds = new Map<string, number>(); // ads first seen ≤14d
  for (const ad of ads) {
    if (ad.body_hash) {
      const k = `${ad.advertiser_id}|${ad.body_hash}`;
      variantCounts.set(k, (variantCounts.get(k) ?? 0) + 1);
    }
    if (ad.first_seen_at >= daysAgoIso(14)) {
      advertiserRecentAds.set(ad.advertiser_id, (advertiserRecentAds.get(ad.advertiser_id) ?? 0) + 1);
    }
  }

  // Trend deltas per niche×country: prefer google_trends (7d vs prior 7d),
  // fall back to youtube. Null when there is no series — never fabricated.
  const trendSeries = new Map<string, number[]>();
  for (const row of trendRows) {
    const key = `${row.niche_key}|${row.country}|${row.source}`;
    if (!trendSeries.has(key)) trendSeries.set(key, []);
    trendSeries.get(key)!.push(Number(row.value));
  }
  const demandDelta = (nicheKey: string, country: string): number | null => {
    const gt = trendSeries.get(`${nicheKey}|${country}|google_trends`);
    if (gt) {
      const d = windowDelta(gt, 7);
      if (d !== null) return d;
    }
    const yt = trendSeries.get(`${nicheKey}|${country}|youtube`);
    return yt ? windowDelta(yt, 2) : null;
  };

  // Offer adoption: offer_id -> set of advertisers (for cluster momentum).
  const offerAdvertisers = new Map<string, Set<string>>();
  const offerAdvertisers7d = new Map<string, Set<string>>();
  for (const link of links) {
    const ad = adById.get(link.ad_id);
    if (!ad) continue;
    if (!offerAdvertisers.has(link.offer_id)) offerAdvertisers.set(link.offer_id, new Set());
    offerAdvertisers.get(link.offer_id)!.add(ad.advertiser_id);
    if (ad.first_seen_at >= daysAgoIso(7)) {
      if (!offerAdvertisers7d.has(link.offer_id)) offerAdvertisers7d.set(link.offer_id, new Set());
      offerAdvertisers7d.get(link.offer_id)!.add(ad.advertiser_id);
    }
  }
  const adOffers = new Map<string, string[]>();
  for (const link of links) {
    if (!adOffers.has(link.ad_id)) adOffers.set(link.ad_id, []);
    adOffers.get(link.ad_id)!.push(link.offer_id);
  }

  // ---- 1. Hot Score per ad -----------------------------------------------
  const scoreRows: Record<string, unknown>[] = [];
  for (const ad of ads) {
    if (!ad.is_active) continue;
    const started = ad.started_at ? new Date(ad.started_at).getTime() : null;
    const daysRunning = started ? Math.max(0, (Date.now() - started) / 86400_000) : null;
    const variants = ad.body_hash ? (variantCounts.get(`${ad.advertiser_id}|${ad.body_hash}`) ?? 1) : null;
    const persistence = Math.min(1, (advertiserRecentAds.get(ad.advertiser_id) ?? 0) / 3);
    const momentum = Math.max(
      0,
      ...(adOffers.get(ad.id) ?? []).map((o) => (offerAdvertisers7d.get(o)?.size ?? 0) / 10),
    );
    const trend = ad.niche_key && ad.country ? demandDelta(ad.niche_key, ad.country) : null;

    const result = hotScore({
      daysRunning,
      variantCount: variants,
      advertiserPersistence: persistence,
      clusterMomentum: Math.min(1, momentum),
      engagementVelocity: null, // no engagement source in P1 — stays honest
      nicheTrendDelta: trend,
    });
    scoreRows.push({
      ad_id: ad.id,
      date: today(),
      hot_score: result.score,
      confidence: result.confidence,
      components: result.components,
      provenance: 'DERIVED',
    });
  }
  for (let i = 0; i < scoreRows.length; i += 500) {
    await db.from('adsignal_ad_scores').upsert(scoreRows.slice(i, i + 500), { onConflict: 'ad_id,date' });
  }
  report.ads_scored = scoreRows.length;

  // ---- 2. Niche metrics ---------------------------------------------------
  const countriesSeen = new Set<string>(['IL']);
  for (const ad of ads) if (ad.country) countriesSeen.add(ad.country);

  type NicheAgg = {
    active: number;
    new7: number;
    prior7: number;
    advertisers: Set<string>;
    newAdvertisers: Set<string>;
    offers: Set<string>;
  };
  const aggs = new Map<string, NicheAgg>();
  const aggKey = (n: string, c: string) => `${n}|${c}`;
  for (const ad of ads) {
    if (!ad.niche_key || !ad.country) continue;
    const key = aggKey(ad.niche_key, ad.country);
    if (!aggs.has(key)) {
      aggs.set(key, { active: 0, new7: 0, prior7: 0, advertisers: new Set(), newAdvertisers: new Set(), offers: new Set() });
    }
    const agg = aggs.get(key)!;
    if (ad.is_active) {
      agg.active++;
      agg.advertisers.add(ad.advertiser_id);
    }
    if (ad.first_seen_at >= daysAgoIso(7)) {
      agg.new7++;
      agg.newAdvertisers.add(ad.advertiser_id);
    } else if (ad.first_seen_at >= daysAgoIso(14)) {
      agg.prior7++;
    }
    for (const offerId of adOffers.get(ad.id) ?? []) agg.offers.add(offerId);
  }

  const advertiserCounts = [...aggs.values()].map((a) => a.advertisers.size).sort((a, b) => a - b);
  const saturationPercentile = (n: number): number | null => {
    if (advertiserCounts.length < 3) return null;
    const below = advertiserCounts.filter((c) => c < n).length;
    return Math.round((below / advertiserCounts.length) * 100);
  };

  const nicheRows: Record<string, unknown>[] = [];
  for (const niche of niches) {
    for (const country of countriesSeen) {
      const agg = aggs.get(aggKey(niche.key, country));
      const demand = demandDelta(niche.key, country);
      if (!agg && demand === null) continue; // nothing known — write nothing

      const activity =
        agg && (agg.new7 > 0 || agg.prior7 > 0)
          ? agg.prior7 === 0
            ? 100
            : Math.round(((agg.new7 - agg.prior7) / agg.prior7) * 1000) / 10
          : null;
      const spreading = agg
        ? [...agg.offers].filter((o) => (offerAdvertisers.get(o)?.size ?? 0) >= 3).length
        : 0;
      const innovation = agg && agg.offers.size > 0 ? spreading / agg.offers.size : null;
      const saturation = agg ? saturationPercentile(agg.advertisers.size) : null;

      const opp = opportunityScore({
        demandGrowth: demand,
        adActivityGrowth: activity,
        offerInnovation: innovation,
        saturation,
      });
      const status = signalStatus({
        demandGrowth: demand,
        adActivityGrowth: activity,
        saturation,
        activeAdvertisers: agg?.advertisers.size ?? null,
      });

      nicheRows.push({
        niche_key: niche.key,
        country,
        date: today(),
        active_ads: agg?.active ?? null,
        new_ads_7d: agg?.new7 ?? null,
        active_advertisers: agg?.advertisers.size ?? null,
        new_advertisers_7d: agg?.newAdvertisers.size ?? null,
        demand_trend: demand,
        ad_activity: activity,
        competition: saturation,
        growth: Math.max(demand ?? -999, activity ?? -999) === -999 ? null : Math.max(demand ?? -999, activity ?? -999),
        opportunity: opp.score,
        signal_status: status,
        components: opp.components,
        confidence: opp.confidence,
        provenance: 'DERIVED',
      });
    }
  }
  if (nicheRows.length) {
    await db.from('adsignal_niche_metrics').upsert(nicheRows, { onConflict: 'niche_key,country,date' });
  }
  report.niche_rows = nicheRows.length;

  // ---- 3. Competitor events ----------------------------------------------
  const { data: watchData } = await db
    .from('adsignal_competitor_watches')
    .select('id, advertiser_id');
  for (const watch of watchData ?? []) {
    for (const ad of ads) {
      if (ad.advertiser_id !== watch.advertiser_id) continue;
      if (ad.first_seen_at >= daysAgoIso(1)) {
        const { error } = await db.from('adsignal_competitor_events').upsert(
          { watch_id: watch.id, kind: 'new_ad', dedupe_key: `new_ad:${ad.id}`, payload: { ad_id: ad.id } },
          { onConflict: 'watch_id,dedupe_key', ignoreDuplicates: true },
        );
        if (!error) report.competitor_events++;
      }
      if (!ad.is_active && ad.ended_at && ad.ended_at >= daysAgoIso(2)) {
        await db.from('adsignal_competitor_events').upsert(
          { watch_id: watch.id, kind: 'ad_stopped', dedupe_key: `ad_stopped:${ad.id}`, payload: { ad_id: ad.id } },
          { onConflict: 'watch_id,dedupe_key', ignoreDuplicates: true },
        );
      }
    }
  }

  // ---- 4. Alerts ----------------------------------------------------------
  const { data: alertData } = await db.from('adsignal_alerts').select('*').eq('is_active', true);
  for (const alert of (alertData ?? []) as Alert[]) {
    const fired = await evaluateAlert(alert.rule, { nicheRows, scoreRows, offerAdvertisers7d });
    for (const event of fired) {
      const { error, data } = await db
        .from('adsignal_alert_events')
        .upsert(
          { alert_id: alert.id, dedupe_key: `${today()}:${event.key}`, payload: event.payload },
          { onConflict: 'alert_id,dedupe_key', ignoreDuplicates: true },
        )
        .select('id');
      if (!error && data?.length) {
        report.alert_events++;
        await db.from('adsignal_alerts').update({ last_triggered_at: new Date().toISOString() }).eq('id', alert.id);
      }
    }
  }

  return report;
}

type EvalContext = {
  nicheRows: Record<string, unknown>[];
  scoreRows: Record<string, unknown>[];
  offerAdvertisers7d: Map<string, Set<string>>;
};

async function evaluateAlert(
  rule: AlertRule,
  ctx: EvalContext,
): Promise<{ key: string; payload: Record<string, unknown> }[]> {
  const fired: { key: string; payload: Record<string, unknown> }[] = [];
  if (rule.type === 'niche_opportunity') {
    for (const row of ctx.nicheRows) {
      if (row.country !== rule.country) continue;
      if (rule.niche_key && row.niche_key !== rule.niche_key) continue;
      if (typeof row.opportunity === 'number' && row.opportunity >= rule.min_opportunity) {
        fired.push({ key: `niche:${row.niche_key}:${row.country}`, payload: { ...rule, row } });
      }
    }
  } else if (rule.type === 'hot_ad') {
    for (const row of ctx.scoreRows) {
      if (typeof row.hot_score === 'number' && row.hot_score >= rule.min_score) {
        fired.push({ key: `ad:${row.ad_id}`, payload: { ...rule, ad_id: row.ad_id, hot_score: row.hot_score } });
      }
    }
  } else if (rule.type === 'offer_adoption') {
    for (const [offerId, advertisers] of ctx.offerAdvertisers7d) {
      if (advertisers.size >= rule.min_advertisers) {
        fired.push({ key: `offer:${offerId}`, payload: { ...rule, offer_id: offerId, advertisers: advertisers.size } });
      }
    }
  }
  return fired;
}
