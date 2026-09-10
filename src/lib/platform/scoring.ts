import { categoryById } from './catalog';
import type { Lead, LeadTier, ProLevel, Professional } from './types';

/* ---------- Lead scoring (HOT / WARM / COLD) ---------- */

/** Estimated customer value of a lead from the catalog's base prices. */
export function leadValue(lead: Pick<Lead, 'items'>): number {
  return lead.items.reduce((sum, it) => {
    const cat = categoryById(it.categoryId);
    return sum + (cat ? cat.basePrice * it.qty : 0);
  }, 0);
}

/**
 * 0–100 score → tier. Weights mirror the spec: urgency, potential value,
 * photos (serious customers photograph the stain), responsiveness, and job
 * size. Deterministic and cheap, so it can re-run on every lead update.
 */
export function leadScore(lead: Lead): number {
  let score = 0;

  // How fast the customer wants service — today is a buying signal.
  if (lead.preferred === 'today') score += 30;
  else if (lead.preferred === 'tomorrow') score += 22;
  else score += 10;

  // Potential ticket value.
  const value = leadValue(lead);
  if (value >= 800) score += 25;
  else if (value >= 500) score += 20;
  else if (value >= 300) score += 14;
  else score += 8;

  // Uploaded photos = real intent.
  if (lead.photos.length > 0) score += 15;

  // Multi-item jobs close bigger and cancel less.
  const units = lead.items.reduce((n, it) => n + it.qty, 0);
  if (units >= 3) score += 10;
  else if (units >= 2) score += 6;

  // Already answered an agent.
  if (lead.answered) score += 15;

  // Reachable on WhatsApp keeps the follow-up channel open.
  if (lead.hasWhatsapp) score += 5;

  return Math.min(100, score);
}

export function leadTier(score: number): LeadTier {
  if (score >= 65) return 'HOT';
  if (score >= 40) return 'WARM';
  return 'COLD';
}

export const TIER_META: Record<LeadTier, { label: string; badgeClass: string }> = {
  HOT: { label: '🔥 HOT', badgeClass: 'bg-red-500/15 text-red-600' },
  WARM: { label: 'WARM', badgeClass: 'bg-amber-500/15 text-amber-700' },
  COLD: { label: 'COLD', badgeClass: 'bg-sky-500/15 text-sky-700' },
};

/* ---------- Professional score (0–100) ---------- */

/**
 * The internal quality score dispatch ranks by and the pro sees on his
 * profile. Built from ratings, completion, cancellations, punctuality,
 * responsiveness, volume, complaints and repeat customers.
 */
export function proScore(pro: Professional): number {
  const ratingPart = pro.ratingCount > 0 ? (pro.rating / 5) * 30 : 18; // neutral start
  const completionRate = pro.totalTaken > 0 ? pro.completedJobs / pro.totalTaken : 0.9;
  const completionPart = completionRate * 20;
  const cancelRate = pro.totalTaken > 0 ? pro.cancelledJobs / pro.totalTaken : 0;
  const cancelPart = Math.max(0, 1 - cancelRate * 4) * 15;
  const onTimePart = pro.onTimeRate * 10;
  // 30s response is full marks; 10 minutes is zero.
  const responsePart = Math.max(0, 1 - Math.max(0, pro.avgResponseSec - 30) / 570) * 10;
  const volumePart = Math.min(1, pro.completedJobs / 100) * 8;
  const repeatPart = Math.min(1, pro.repeatCustomers / 10) * 4;
  const complaintsPenalty = Math.min(8, pro.complaintsCount * 2);

  const total =
    ratingPart +
    completionPart +
    cancelPart +
    onTimePart +
    responsePart +
    volumePart +
    repeatPart -
    complaintsPenalty +
    3; // base for being approved on the platform

  return Math.max(0, Math.min(100, Math.round(total)));
}

/** Gamification levels; thresholds combine volume and quality. */
export function proLevel(pro: Professional): ProLevel {
  const score = proScore(pro);
  if (pro.completedJobs >= 150 && score >= 85) return 'diamond';
  if (pro.completedJobs >= 60 && score >= 75) return 'gold';
  if (pro.completedJobs >= 15 && score >= 60) return 'silver';
  return 'bronze';
}

export const LEVEL_META: Record<ProLevel, { label: string; emoji: string; perk: string }> = {
  bronze: { label: 'Bronze', emoji: '🥉', perk: 'גישה לעבודות באזור שלך' },
  silver: { label: 'Silver', emoji: '🥈', perk: 'עדיפות בהתראות על עבודות' },
  gold: { label: 'Gold', emoji: '🥇', perk: 'גישה מוקדמת לעבודות (Wave 1)' },
  diamond: { label: 'Diamond', emoji: '💎', perk: 'עבודות Priority ואזורים נוספים' },
};
