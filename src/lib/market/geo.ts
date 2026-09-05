import type { GeoPoint, ServiceArea } from './types';

/**
 * Launch-region geography. Real coordinates so distance math and ETA are
 * honest; the schematic MapCanvas projects the same lat/lng, so swapping in
 * Google Maps/Mapbox later changes nothing upstream.
 */
export const DEFAULT_AREAS: ServiceArea[] = [
  { id: 'beer-sheva', name: 'באר שבע', center: { lat: 31.2518, lng: 34.7913 }, radiusKm: 12, active: true, waitlistOnly: false },
  { id: 'arad', name: 'ערד', center: { lat: 31.2589, lng: 35.2128 }, radiusKm: 10, active: true, waitlistOnly: false },
  { id: 'dimona', name: 'דימונה', center: { lat: 31.0687, lng: 35.0331 }, radiusKm: 10, active: true, waitlistOnly: false },
  { id: 'ashkelon', name: 'אשקלון', center: { lat: 31.6688, lng: 34.5743 }, radiusKm: 10, active: true, waitlistOnly: false },
  { id: 'ashdod', name: 'אשדוד', center: { lat: 31.8014, lng: 34.6435 }, radiusKm: 10, active: true, waitlistOnly: false },
  { id: 'ofakim', name: 'אופקים', center: { lat: 31.3141, lng: 34.6203 }, radiusKm: 8, active: true, waitlistOnly: false },
  { id: 'netivot', name: 'נתיבות', center: { lat: 31.4223, lng: 34.5886 }, radiusKm: 8, active: true, waitlistOnly: false },
  // Not launched yet — customers there get the waitlist flow.
  { id: 'tel-aviv', name: 'תל אביב', center: { lat: 32.0853, lng: 34.7818 }, radiusKm: 15, active: true, waitlistOnly: true },
  { id: 'jerusalem', name: 'ירושלים', center: { lat: 31.7683, lng: 35.2137 }, radiusKm: 15, active: true, waitlistOnly: true },
  { id: 'haifa', name: 'חיפה', center: { lat: 32.794, lng: 34.9896 }, radiusKm: 15, active: true, waitlistOnly: true },
];

/** Haversine distance in km. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Urban driving estimate: prep time + ~1.8 min per km, rounded to 5. */
export function etaMinutes(km: number): number {
  return Math.max(10, Math.round((8 + km * 1.8) / 5) * 5);
}

/** ETA window text like "25–40 דק'". */
export function etaWindow(km: number): string {
  const mid = etaMinutes(km);
  return `${mid}–${mid + 15} דק'`;
}

/**
 * Demo geocoder: matches a free-text address to a known area by city name and
 * jitters the pin inside it, so every demo address gets believable
 * coordinates. With a maps key configured, replace with the provider's
 * geocoding API (see src/lib/market/config.ts).
 */
export function geocodeAddress(
  address: string,
  areas: ServiceArea[],
): { location: GeoPoint; area: ServiceArea | null } {
  const area = areas.find((a) => address.includes(a.name)) ?? null;
  if (!area) return { location: { lat: 31.2518, lng: 34.7913 }, area: null };
  // Deterministic jitter from the address text — same address, same pin.
  let hash = 0;
  for (const ch of address) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  const dx = ((hash % 100) / 100 - 0.5) * 0.03;
  const dy = (((hash * 7) % 100) / 100 - 0.5) * 0.03;
  return { location: { lat: area.center.lat + dy, lng: area.center.lng + dx }, area };
}

/** Nearest area covering a point (inside its radius), else null. */
export function areaForPoint(point: GeoPoint, areas: ServiceArea[]): ServiceArea | null {
  let best: ServiceArea | null = null;
  let bestKm = Infinity;
  for (const area of areas) {
    if (!area.active) continue;
    const km = distanceKm(point, area.center);
    if (km <= area.radiusKm && km < bestKm) {
      best = area;
      bestKm = km;
    }
  }
  return best;
}
