import { distanceKm, etaMinutes } from './geo';
import type { Availability, Booking, GeoPoint, Professional } from './types';

/**
 * The matching algorithm: scores every eligible pro 0–100 for a booking and
 * returns them best-first. Deliberately NOT nearest-first — distance is the
 * biggest single factor but rating, reliability and fairness (time since the
 * pro's last job) all move the needle, so good pros further away beat a
 * mediocre one next door, and work spreads instead of starving newcomers.
 */

export interface ScoredPro {
  pro: Professional;
  score: number;
  distanceKm: number;
  etaMinutes: number;
  priceAgorot: number;
  online: boolean;
  parts: Record<string, number>;
}

const WEIGHTS = {
  distance: 30,
  rating: 20,
  experience: 10,
  acceptance: 10,
  price: 10,
  fairness: 10,
  boost: 10,
} as const;

export function proPriceFor(pro: Professional, serviceId: string, basePriceAgorot: number): number {
  const link = pro.services.find((s) => s.serviceId === serviceId);
  return link?.priceAgorot ?? basePriceAgorot;
}

/** Is this pro able to take this booking at all (before any ranking)? */
export function isEligible(
  pro: Professional,
  booking: Pick<Booking, 'serviceId' | 'areaId' | 'location'>,
  proLocation: GeoPoint,
): boolean {
  if (pro.status !== 'active') return false;
  if (!pro.services.some((s) => s.serviceId === booking.serviceId)) return false;
  if (booking.areaId && !pro.areaIds.includes(booking.areaId)) return false;
  if (booking.location && distanceKm(proLocation, booking.location) > pro.workRadiusKm)
    return false;
  return true;
}

export function scorePros(
  booking: Pick<
    Booking,
    'serviceId' | 'areaId' | 'location' | 'quoteLowAgorot' | 'quoteHighAgorot' | 'offeredProIds'
  >,
  pros: Professional[],
  availability: Availability[],
  basePriceAgorot: number,
  options?: { requireOnline?: boolean },
): ScoredPro[] {
  const requireOnline = options?.requireOnline ?? true;
  const now = Date.now();
  const online = new Map(availability.map((a) => [a.professionalId, a]));

  const scored: ScoredPro[] = [];
  for (const pro of pros) {
    const avail = online.get(pro.id);
    const isOnline = Boolean(avail?.online);
    if (requireOnline && !isOnline) continue;
    const proLocation = avail?.location ?? pro.base;
    if (!isEligible(pro, booking, proLocation)) continue;
    if (booking.offeredProIds.includes(pro.id)) continue;

    const km = booking.location ? distanceKm(proLocation, booking.location) : 5;
    const price = proPriceFor(pro, booking.serviceId, basePriceAgorot);

    const parts: Record<string, number> = {};
    // Distance: full marks at the door, zero at the pro's own radius edge.
    parts.distance = WEIGHTS.distance * Math.max(0, 1 - km / Math.max(pro.workRadiusKm, 1));
    // Rating: 4.0 → 0, 5.0 → full; unrated newcomers get a neutral half.
    parts.rating =
      pro.reviewCount === 0
        ? WEIGHTS.rating * 0.5
        : WEIGHTS.rating * Math.max(0, Math.min(1, (pro.rating - 4) / 1));
    // Experience saturates logarithmically — 30 jobs is already "proven".
    parts.experience = WEIGHTS.experience * Math.min(1, Math.log10(1 + pro.jobCount) / 1.5);
    parts.acceptance = WEIGHTS.acceptance * (pro.acceptancePct / 100);
    // Price: full marks at/below the quote midpoint, fading to 0 at 1.5×.
    const mid = (booking.quoteLowAgorot + booking.quoteHighAgorot) / 2 || price;
    parts.price = WEIGHTS.price * Math.max(0, Math.min(1, 1 - (price / mid - 1) * 2));
    // Fairness: the longer since the pro's last job, the higher (24h → full).
    const hoursSince = pro.lastJobAt ? (now - Date.parse(pro.lastJobAt)) / 36e5 : 24;
    parts.fairness = WEIGHTS.fairness * Math.min(1, hoursSince / 24);
    parts.boost = WEIGHTS.boost * Math.min(1, pro.boost / 100);

    const score = Object.values(parts).reduce((a, b) => a + b, 0);
    scored.push({
      pro,
      score: Math.round(score * 10) / 10,
      distanceKm: Math.round(km * 10) / 10,
      etaMinutes: etaMinutes(km),
      priceAgorot: price,
      online: isOnline,
      parts,
    });
  }

  return scored.sort((a, b) => b.score - a.score);
}
