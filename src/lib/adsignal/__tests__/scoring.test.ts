import { describe, expect, it } from 'vitest';
import { hotScore, opportunityScore, signalStatus, windowDelta } from '../scoring';

describe('hotScore', () => {
  it('scores a long-running multi-variant ad high with full confidence inputs', () => {
    const r = hotScore({
      daysRunning: 60,
      variantCount: 8,
      advertiserPersistence: 1,
      clusterMomentum: 1,
      engagementVelocity: 1,
      nicheTrendDelta: 100,
    });
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.confidence).toBe(1);
  });

  it('renormalizes weights and lowers confidence when components are missing', () => {
    const full = hotScore({
      daysRunning: 30, variantCount: 4,
      advertiserPersistence: null, clusterMomentum: null,
      engagementVelocity: null, nicheTrendDelta: null,
    });
    // only 45 of 100 weight available
    expect(full.confidence).toBeCloseTo(Math.sqrt(0.45), 2);
    expect(full.components).not.toHaveProperty('clusterMomentum');
    expect(full.score).toBeGreaterThan(0);
  });

  it('returns zero score and zero confidence with no inputs — never invents', () => {
    const r = hotScore({
      daysRunning: null, variantCount: null, advertiserPersistence: null,
      clusterMomentum: null, engagementVelocity: null, nicheTrendDelta: null,
    });
    expect(r).toEqual({ score: 0, confidence: 0, components: {} });
  });

  it('saturates longevity around 60 days instead of growing forever', () => {
    const base = { variantCount: null, advertiserPersistence: null, clusterMomentum: null, engagementVelocity: null, nicheTrendDelta: null };
    const d60 = hotScore({ ...base, daysRunning: 60 });
    const d300 = hotScore({ ...base, daysRunning: 300 });
    expect(d60.score).toBe(100);
    expect(d300.score).toBe(100);
  });
});

describe('windowDelta', () => {
  it('computes percent change between adjacent windows', () => {
    expect(windowDelta([10, 10, 10, 20, 20, 20], 3)).toBe(100);
    expect(windowDelta([20, 20, 10, 10], 2)).toBe(-50);
  });
  it('returns null (not 0) when history is insufficient', () => {
    expect(windowDelta([5, 5, 5], 2)).toBeNull();
  });
  it('handles a zero prior window without dividing by zero', () => {
    expect(windowDelta([0, 0, 5, 5], 2)).toBe(100);
    expect(windowDelta([0, 0, 0, 0], 2)).toBe(0);
  });
});

describe('opportunityScore', () => {
  it('rewards demand outpacing competition', () => {
    const high = opportunityScore({ demandGrowth: 80, adActivityGrowth: 30, offerInnovation: 0.5, saturation: 20 });
    const low = opportunityScore({ demandGrowth: -20, adActivityGrowth: 0, offerInnovation: 0, saturation: 90 });
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.confidence).toBe(1);
  });
  it('drops missing components from the weighting', () => {
    const r = opportunityScore({ demandGrowth: 40, adActivityGrowth: null, offerInnovation: null, saturation: null });
    expect(r.confidence).toBeCloseTo(Math.sqrt(0.35), 2);
  });
});

describe('signalStatus', () => {
  it('classifies the lifecycle stages', () => {
    expect(signalStatus({ demandGrowth: 40, adActivityGrowth: null, saturation: 10, activeAdvertisers: 2 })).toBe('emerging');
    expect(signalStatus({ demandGrowth: 15, adActivityGrowth: 5, saturation: 40, activeAdvertisers: 10 })).toBe('growing');
    expect(signalStatus({ demandGrowth: 60, adActivityGrowth: 40, saturation: 60, activeAdvertisers: 30 })).toBe('hot');
    expect(signalStatus({ demandGrowth: 3, adActivityGrowth: 2, saturation: 90, activeAdvertisers: 50 })).toBe('saturated');
    expect(signalStatus({ demandGrowth: null, adActivityGrowth: null, saturation: null, activeAdvertisers: null })).toBe('quiet');
  });
});
