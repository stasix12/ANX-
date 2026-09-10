import { categoryById } from './catalog';
import type {
  DecayConfig,
  DecayStep,
  Job,
  LeadItem,
  PlatformConfig,
  PricingRule,
} from './types';

/**
 * Pricing engine. Nothing here is hardcoded to a number or a service — every
 * figure comes from admin-editable rules (PlatformConfig.pricingRules and
 * .decay, edited at /hq/settings and stored in pricing_rules in production).
 */

/* ---------- Customer-quote suggestion (for the sales agent) ---------- */

/** Suggested customer price range from the catalog, before agent judgement. */
export function suggestCustomerPrice(
  items: LeadItem[],
  condition: string[],
): { min: number; max: number } {
  const base = items.reduce((sum, it) => {
    const cat = categoryById(it.categoryId);
    if (!cat) return sum;
    // A second unit of the same service costs less to serve — mild bundling.
    const bundled = cat.basePrice * (it.qty === 1 ? 1 : 1 + (it.qty - 1) * 0.8);
    return sum + bundled;
  }, 0);
  // Tough stains / odors justify a premium quote.
  const hard = condition.some((c) => c.includes('קשים') || c.includes('ריחות'));
  const min = roundTo5(base * (hard ? 1.0 : 0.9));
  const max = roundTo5(base * (hard ? 1.3 : 1.1));
  return { min, max };
}

/* ---------- Contractor-fee rules ---------- */

export interface FeeContext {
  customerPrice: number;
  categoryId: string | null;
  city: string | null;
  urgent: boolean;
}

/** Does a rule's scope apply to this job? Null scope fields mean "any". */
function ruleMatches(rule: PricingRule, ctx: FeeContext): boolean {
  if (!rule.active) return false;
  if (rule.categoryId && rule.categoryId !== ctx.categoryId) return false;
  if (rule.city && rule.city !== ctx.city) return false;
  if (rule.urgent !== null && rule.urgent !== ctx.urgent) return false;
  if (rule.minCustomerPrice !== null && ctx.customerPrice < rule.minCustomerPrice) return false;
  if (rule.maxCustomerPrice !== null && ctx.customerPrice > rule.maxCustomerPrice) return false;
  return true;
}

/** Highest priority wins; ties go to the more specific rule (more filters set). */
export function matchRule(rules: PricingRule[], ctx: FeeContext): PricingRule | null {
  const specificity = (r: PricingRule) =>
    [r.categoryId, r.city, r.urgent, r.minCustomerPrice, r.maxCustomerPrice].filter(
      (v) => v !== null,
    ).length;
  return (
    rules
      .filter((r) => ruleMatches(r, ctx))
      .sort((a, b) => b.priority - a.priority || specificity(b) - specificity(a))[0] ?? null
  );
}

export interface FeeSuggestion {
  min: number;
  max: number;
  suggested: number;
  ruleName: string;
}

/**
 * What to sell the job for. percent_range yields a min–max band with the
 * midpoint as the default; percent/fixed collapse the band to one figure.
 */
export function suggestFee(rules: PricingRule[], ctx: FeeContext): FeeSuggestion {
  const rule = matchRule(rules, ctx);
  if (!rule) {
    const fallback = roundTo5(ctx.customerPrice * 0.24);
    return { min: fallback, max: fallback, suggested: fallback, ruleName: 'ברירת מחדל' };
  }
  if (rule.mode === 'fixed') {
    return { min: rule.amount, max: rule.amount, suggested: rule.amount, ruleName: rule.name };
  }
  if (rule.mode === 'percent') {
    const fee = roundTo5((ctx.customerPrice * rule.percentMin) / 100);
    return { min: fee, max: fee, suggested: fee, ruleName: rule.name };
  }
  const min = roundTo5((ctx.customerPrice * rule.percentMin) / 100);
  const max = roundTo5((ctx.customerPrice * rule.percentMax) / 100);
  return { min, max, suggested: roundTo5((min + max) / 2), ruleName: rule.name };
}

/* ---------- Price decay ("מנגנון מחיר יורד") ---------- */

/**
 * Freeze the decay schedule onto the job at creation, so later config edits
 * don't retro-change live offers. Urgent jobs open already discounted.
 */
export function buildDecaySteps(baseFee: number, decay: DecayConfig, urgent: boolean): DecayStep[] {
  const floor = roundTo5((baseFee * decay.floorPercent) / 100);
  const startPercent = urgent ? decay.urgentStartPercent : 100;
  const steps: DecayStep[] = [{ afterMinutes: 0, fee: Math.max(floor, roundTo5((baseFee * startPercent) / 100)) }];
  for (const s of decay.steps) {
    const fee = Math.max(floor, roundTo5((baseFee * Math.min(s.percentOfBase, startPercent)) / 100));
    if (fee < steps[steps.length - 1].fee) steps.push({ afterMinutes: s.afterMinutes, fee });
  }
  return steps;
}

/** The fee a professional pays right now, given elapsed dispatch time. */
export function currentFee(
  job: Pick<Job, 'decaySteps' | 'dispatchStartedAt' | 'baseFee'>,
  now: number = Date.now(),
): number {
  if (!job.dispatchStartedAt || job.decaySteps.length === 0) return job.baseFee;
  const elapsedMin = (now - new Date(job.dispatchStartedAt).getTime()) / 60000;
  let fee = job.decaySteps[0].fee;
  for (const step of job.decaySteps) {
    if (elapsedMin >= step.afterMinutes) fee = step.fee;
  }
  return fee;
}

/* ---------- Per-job profitability ---------- */

export interface JobProfit {
  revenue: number;
  advertisingCost: number;
  otherCosts: number;
  grossProfit: number;
}

/**
 * Platform profit on one job. Fee model: revenue is the purchase fee the pro
 * paid. Payout model: revenue is customer price minus the pro's payout.
 */
export function jobProfit(job: Job): JobProfit {
  const revenue =
    job.feeModel === 'payout'
      ? job.customerPrice - (job.payoutAmount ?? 0)
      : (job.purchaseFee ?? job.baseFee);
  const otherCosts = job.paymentFee + job.refunds + job.discounts;
  return {
    revenue,
    advertisingCost: job.advertisingCost,
    otherCosts,
    grossProfit: revenue - job.advertisingCost - otherCosts,
  };
}

export const roundTo5 = (n: number): number => Math.round(n / 5) * 5;
