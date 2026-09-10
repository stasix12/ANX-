import { cityById, distanceKm } from './catalog';
import { proLevel, proScore } from './scoring';
import type { DispatchConfig, Job, Professional } from './types';

/**
 * Dispatch algorithm — eligibility filter, weighted ranking, and expanding
 * waves. Everything is a pure function of (job, pros, config, now), which is
 * what lets the demo compute waves deterministically on read and lets
 * production run the exact same logic in a scheduled server job.
 */

export function proDistanceToJobKm(pro: Professional, job: Pick<Job, 'lat' | 'lng'>): number {
  return distanceKm(pro.lat, pro.lng, job.lat, job.lng);
}

/** Who may ever see this job: approved + online + does the work + in reach. */
export function eligiblePros(job: Job, pros: Professional[]): Professional[] {
  return pros.filter((pro) => {
    if (!pro.approved || !pro.online) return false;
    if (job.excludedProIds.includes(pro.id)) return false;
    if (!job.items.every((it) => pro.services.includes(it.categoryId))) return false;
    const jobCity = cityById(job.city);
    const inAreas = pro.areas.includes(job.city) || pro.city === job.city;
    const inRadius = jobCity ? proDistanceToJobKm(pro, job) <= pro.radiusKm : false;
    return inAreas || inRadius;
  });
}

export interface RankedPro {
  pro: Professional;
  distanceKm: number;
  rank: number;
}

/**
 * Weighted ranking. Each factor is normalized to 0..1 before its weight so
 * admins can reason about the weights at /hq/settings; higher rank = offered
 * earlier.
 */
export function rankPros(job: Job, pros: Professional[], config: DispatchConfig): RankedPro[] {
  const w = config.weights;
  return pros
    .map((pro) => {
      const dist = proDistanceToJobKm(pro, job);
      const distanceFactor = Math.max(0, 1 - dist / 40);
      const scoreFactor = proScore(pro) / 100;
      const completionFactor = pro.totalTaken > 0 ? pro.completedJobs / pro.totalTaken : 0.85;
      const cancelRate = pro.totalTaken > 0 ? pro.cancelledJobs / pro.totalTaken : 0;
      const cancelFactor = Math.max(0, 1 - cancelRate * 4);
      const responseFactor = Math.max(0, 1 - Math.max(0, pro.avgResponseSec - 30) / 570);
      // Fairness: whoever got fewer jobs lately gets a head start.
      const loadFactor = 1 - Math.min(1, pro.jobsLast7d / 10);
      // Smart-notification affinity: home turf and habitual ticket size.
      const affinityFactor = pro.city === job.city ? 1 : pro.areas.includes(job.city) ? 0.8 : 0.5;
      // Gamification perk: gold/diamond earn early access.
      const level = proLevel(pro);
      const levelBonus = level === 'diamond' ? 0.1 : level === 'gold' ? 0.05 : 0;

      const rank =
        distanceFactor * w.distance +
        scoreFactor * w.score +
        completionFactor * w.completion +
        cancelFactor * w.cancellations +
        responseFactor * w.response +
        loadFactor * w.recentLoad +
        affinityFactor * w.affinity +
        levelBonus;

      return { pro, distanceKm: dist, rank };
    })
    .sort((a, b) => b.rank - a.rank);
}

export interface WaveState {
  /** 0-based index of the currently open wave. */
  waveIndex: number;
  /** Pros the job is visible to right now, in rank order. */
  visible: RankedPro[];
  /** Seconds until the next wave opens; null on the last wave. */
  nextWaveInSec: number | null;
}

/**
 * Which wave is open and who is inside it, from elapsed dispatch time. Wave
 * sizes are cumulative; size -1 opens the job to every eligible pro.
 */
export function waveState(job: Job, ranked: RankedPro[], config: DispatchConfig, now: number = Date.now()): WaveState {
  const waves = config.waves.length > 0 ? config.waves : [{ size: -1, afterSeconds: 0 }];
  const startedAt = job.dispatchStartedAt ? new Date(job.dispatchStartedAt).getTime() : now;
  const elapsedSec = Math.max(0, (now - startedAt) / 1000);
  // Urgent re-dispatch skips the queue and goes wide immediately.
  if (job.urgent) return { waveIndex: waves.length - 1, visible: ranked, nextWaveInSec: null };

  let waveIndex = 0;
  for (let i = 0; i < waves.length; i++) {
    if (elapsedSec >= waves[i].afterSeconds) waveIndex = i;
  }
  const size = waves[waveIndex].size;
  const visible = size === -1 ? ranked : ranked.slice(0, size);
  const next = waves[waveIndex + 1];
  return {
    waveIndex,
    visible,
    nextWaveInSec: next ? Math.max(0, Math.round(next.afterSeconds - elapsedSec)) : null,
  };
}

/** Everything /pro needs to decide whether to show a job to this pro now. */
export function jobVisibleToPro(
  job: Job,
  pro: Professional,
  allPros: Professional[],
  config: DispatchConfig,
  now: number = Date.now(),
): { visible: boolean; distanceKm: number } {
  const eligible = eligiblePros(job, allPros);
  const mine = eligible.find((p) => p.id === pro.id);
  if (!mine) return { visible: false, distanceKm: 0 };
  const ranked = rankPros(job, eligible, config);
  const wave = waveState(job, ranked, config, now);
  const entry = wave.visible.find((r) => r.pro.id === pro.id);
  return { visible: Boolean(entry), distanceKm: entry?.distanceKm ?? proDistanceToJobKm(pro, job) };
}
