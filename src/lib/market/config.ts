/**
 * Marketplace brand + integration configuration. The whole marketplace reads
 * its identity and third-party keys from here — rebranding or plugging in a
 * real provider is an edit in this one file (plus .env.local for secrets).
 */

export const market = {
  /** Brand — placeholder name, swap freely. */
  name: 'קלינגו',
  nameEn: 'Cleango',
  tagline: 'מקצועני ניקוי לפי דרישה',
  description:
    'קלינגו מחברת אתכם למקצועני ניקוי מאומתים באזור שלכם — ספות, מזרנים, מזגנים ועוד. מחיר מראש, מעקב חי ותשלום מאובטח.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://anx3d.co.il',

  /**
   * Maps: MapCanvas renders a built-in schematic map that needs no key.
   * To switch to a real map, set one of these in .env.local and implement the
   * matching provider in src/components/market/MapCanvas.tsx:
   *   NEXT_PUBLIC_GOOGLE_MAPS_KEY=...   (Google Maps JS API)
   *   NEXT_PUBLIC_MAPBOX_TOKEN=...      (Mapbox GL)
   */
  googleMapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '',
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',

  /** Dispatch defaults — the live values are editable in /market/admin/settings. */
  dispatch: {
    offerTtlSeconds: 30,
    maxOffers: 6,
  },

  /** Platform economics defaults (admin-editable at runtime). */
  economics: {
    commissionPct: 15,
    leadFeeAgorot: 3000,
    referralCreditAgorot: 3000,
  },
} as const;

/** ₪ formatting for agorot amounts. 12900 → "129 ₪". */
export function shekel(agorot: number): string {
  const value = agorot / 100;
  const text = Number.isInteger(value) ? value.toLocaleString('he-IL') : value.toFixed(2);
  return `${text} ₪`;
}
