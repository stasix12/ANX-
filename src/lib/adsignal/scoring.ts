import type { SignalStatus } from './types';

/**
 * Pure scoring functions. Everything here is a DERIVED metric: computed from
 * REAL rows, never invented. A component that has no underlying data is passed
 * as null and simply drops out — the remaining weights are renormalized and
 * the confidence value shrinks, so a score never pretends to know more than
 * its inputs.
 */

export type HotScoreInput = {
  /** Days the ad has been delivering (from platform start/stop dates). */
  daysRunning: number | null;
  /** Ads by the same advertiser sharing this creative body. */
  variantCount: number | null;
  /** Did the advertiser start new ads in this niche in the last 14 days? 0..1 */
  advertiserPersistence: number | null;
  /** Advertisers newly joining this ad's concept over 7d, scaled 0..1. */
  clusterMomentum: number | null;
  /** Reach/engagement growth where a source truly provides it, scaled 0..1. */
  engagementVelocity: number | null;
  /** 30d search-trend slope of the ad's niche, in percent (e.g. 40 = +40%). */
  nicheTrendDelta: number | null;
};

export type HotScoreResult = {
  score: number;
  confidence: number;
  components: Record<string, number>;
};

const WEIGHTS: Record<keyof HotScoreInput, number> = {
  daysRunning: 25,
  variantCount: 20,
  advertiserPersistence: 15,
  clusterMomentum: 20,
  engagementVelocity: 10,
  nicheTrendDelta: 10,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Normalize each raw input to 0..1 before weighting. */
function normalizeComponent(key: keyof HotScoreInput, value: number): number {
  switch (key) {
    case 'daysRunning':
      // Log curve saturating around 60 days: surviving spend is the signal.
      return clamp01(Math.log1p(Math.max(0, value)) / Math.log1p(60));
    case 'variantCount':
      return clamp01(value / 8);
    case 'nicheTrendDelta':
      // -50%..+100% mapped onto 0..1, flat trend = 0.33.
      return clamp01((value + 50) / 150);
    default:
      return clamp01(value);
  }
}

export function hotScore(input: HotScoreInput): HotScoreResult {
  const components: Record<string, number> = {};
  let weighted = 0;
  let availableWeight = 0;
  let totalWeight = 0;

  for (const key of Object.keys(WEIGHTS) as (keyof HotScoreInput)[]) {
    const weight = WEIGHTS[key];
    totalWeight += weight;
    const raw = input[key];
    if (raw === null || raw === undefined || Number.isNaN(raw)) continue;
    const normalized = normalizeComponent(key, raw);
    components[key] = Math.round(normalized * 100) / 100;
    weighted += normalized * weight;
    availableWeight += weight;
  }

  if (availableWeight === 0) return { score: 0, confidence: 0, components };

  return {
    score: Math.round((weighted / availableWeight) * 100),
    confidence: Math.round(Math.sqrt(availableWeight / totalWeight) * 100) / 100,
    components,
  };
}

/**
 * Percent change of the recent window vs. the window before it.
 * Returns null when there is not enough history to say anything —
 * "no data" must stay distinguishable from "0% change".
 */
export function windowDelta(values: number[], window: number): number | null {
  if (values.length < window * 2) return null;
  const recent = values.slice(-window);
  const prior = values.slice(-window * 2, -window);
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const priorSum = sum(prior);
  const recentSum = sum(recent);
  if (priorSum === 0) return recentSum > 0 ? 100 : 0;
  return Math.round(((recentSum - priorSum) / priorSum) * 1000) / 10;
}

export type OpportunityInput = {
  /** % change in search demand (Trends/YouTube), or null when unknown. */
  demandGrowth: number | null;
  /** % change in active ads, or null when unknown. */
  adActivityGrowth: number | null;
  /** Share (0..1) of recent offers spreading to 3+ advertisers, or null. */
  offerInnovation: number | null;
  /** Saturation percentile 0..100 vs other niches, or null. */
  saturation: number | null;
};

export function opportunityScore(input: OpportunityInput): HotScoreResult {
  const parts: [string, number | null, number][] = [
    ['demandGrowth', input.demandGrowth === null ? null : clamp01((input.demandGrowth + 50) / 150), 35],
    ['adActivityGrowth', input.adActivityGrowth === null ? null : clamp01((input.adActivityGrowth + 50) / 150), 25],
    ['offerInnovation', input.offerInnovation === null ? null : clamp01(input.offerInnovation), 15],
    ['lowSaturation', input.saturation === null ? null : clamp01(1 - input.saturation / 100), 25],
  ];
  const components: Record<string, number> = {};
  let weighted = 0;
  let availableWeight = 0;
  let totalWeight = 0;
  for (const [name, value, weight] of parts) {
    totalWeight += weight;
    if (value === null) continue;
    components[name] = Math.round(value * 100) / 100;
    weighted += value * weight;
    availableWeight += weight;
  }
  if (availableWeight === 0) return { score: 0, confidence: 0, components };
  return {
    score: Math.round((weighted / availableWeight) * 100),
    confidence: Math.round(Math.sqrt(availableWeight / totalWeight) * 100) / 100,
    components,
  };
}

/**
 * Lifecycle classification for a niche×country:
 *   emerging  — demand or activity just started accelerating from a low base
 *   growing   — sustained growth, competition still moderate
 *   hot       — strong growth with heavy ad activity
 *   saturated — many advertisers, growth flattening
 *   quiet     — nothing notable (or not enough data)
 */
export function signalStatus(input: {
  demandGrowth: number | null;
  adActivityGrowth: number | null;
  saturation: number | null;
  activeAdvertisers: number | null;
}): SignalStatus {
  const demand = input.demandGrowth;
  const activity = input.adActivityGrowth;
  const saturation = input.saturation ?? 0;
  const advertisers = input.activeAdvertisers ?? 0;
  const growth = Math.max(demand ?? -Infinity, activity ?? -Infinity);

  if (growth === -Infinity) return 'quiet';
  if (saturation >= 75 && growth < 15) return 'saturated';
  if (growth >= 25 && (saturation >= 50 || advertisers >= 20)) return 'hot';
  if (growth >= 25 && advertisers < 5) return 'emerging';
  if (growth >= 10) return 'growing';
  return 'quiet';
}
