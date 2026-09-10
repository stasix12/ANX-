import type { City, LeadItem, MarketingSource, ServiceCategory } from './types';

/**
 * Service catalog for the 'cleaning' vertical. Adding a category — or an
 * entirely new vertical — is adding rows here (or in the service_categories
 * table in production); no engine code refers to a specific service.
 */
export const CATEGORIES: ServiceCategory[] = [
  { id: 'sofa', vertical: 'cleaning', name: 'ניקוי ספות', emoji: '🛋️', basePrice: 350, unitLabel: 'מושבים', maxQty: 8, active: true },
  { id: 'corner_sofa', vertical: 'cleaning', name: 'ניקוי ספה פינתית', emoji: '🛋️', basePrice: 450, unitLabel: 'ספות', maxQty: 3, active: true },
  { id: 'mattress', vertical: 'cleaning', name: 'ניקוי מזרנים', emoji: '🛏️', basePrice: 250, unitLabel: 'מזרנים', maxQty: 6, active: true },
  { id: 'carpet', vertical: 'cleaning', name: 'ניקוי שטיחים', emoji: '🧶', basePrice: 200, unitLabel: 'שטיחים', maxQty: 8, active: true },
  { id: 'chairs', vertical: 'cleaning', name: 'ניקוי כיסאות', emoji: '🪑', basePrice: 60, unitLabel: 'כיסאות', maxQty: 20, active: true },
  { id: 'car', vertical: 'cleaning', name: 'ניקוי ריפודי רכב', emoji: '🚗', basePrice: 400, unitLabel: 'רכבים', maxQty: 3, active: true },
  { id: 'ac', vertical: 'cleaning', name: 'ניקוי מזגנים', emoji: '❄️', basePrice: 300, unitLabel: 'מזגנים', maxQty: 8, active: true },
];

export const categoryById = (id: string): ServiceCategory | undefined =>
  CATEGORIES.find((c) => c.id === id);

export const categoryName = (id: string): string => categoryById(id)?.name ?? id;

/** Compact "ספה פינתית + מזרן ×2" label for a job/lead's item list. */
export function itemsLabel(items: LeadItem[]): string {
  return items
    .map((it) => {
      const name = categoryName(it.categoryId).replace(/^ניקוי /, '');
      return it.qty > 1 ? `${name} ×${it.qty}` : name;
    })
    .join(' + ');
}

/** Condition tags offered in the funnel; free text rides in the notes. */
export const CONDITION_OPTIONS = [
  'כתמים רגילים',
  'כתמים קשים',
  'ריחות',
  'בעלי חיים',
  'ילדים קטנים',
  'לא נוקה שנים',
] as const;

/**
 * Cities with coordinates — powers distance ranking and the demand/supply
 * map without an external maps key. A maps adapter can replace this with
 * real geocoding later (docs/PLATFORM.md → "איפה מכניסים מפתחות").
 */
export const CITIES: City[] = [
  { id: 'beer-sheva', name: 'באר שבע', lat: 31.2518, lng: 34.7913 },
  { id: 'ofakim', name: 'אופקים', lat: 31.3141, lng: 34.6203 },
  { id: 'netivot', name: 'נתיבות', lat: 31.4171, lng: 34.5886 },
  { id: 'ashkelon', name: 'אשקלון', lat: 31.6688, lng: 34.5743 },
  { id: 'ashdod', name: 'אשדוד', lat: 31.8014, lng: 34.6435 },
  { id: 'kiryat-gat', name: 'קריית גת', lat: 31.6100, lng: 34.7642 },
  { id: 'rishon', name: 'ראשון לציון', lat: 31.9730, lng: 34.7925 },
  { id: 'tel-aviv', name: 'תל אביב', lat: 32.0853, lng: 34.7818 },
  { id: 'petah-tikva', name: 'פתח תקווה', lat: 32.0871, lng: 34.8878 },
  { id: 'netanya', name: 'נתניה', lat: 32.3215, lng: 34.8532 },
  { id: 'haifa', name: 'חיפה', lat: 32.7940, lng: 34.9896 },
  { id: 'jerusalem', name: 'ירושלים', lat: 31.7683, lng: 35.2137 },
];

export const cityById = (id: string): City | undefined => CITIES.find((c) => c.id === id);
export const cityName = (id: string): string => cityById(id)?.name ?? id;

/** Great-circle distance in km — good enough for ranking and display. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export const SOURCE_OPTIONS: { value: MarketingSource; label: string }[] = [
  { value: 'google', label: 'Google Ads' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'organic', label: 'אורגני' },
  { value: 'referral', label: 'הפניה' },
  { value: 'direct', label: 'ישיר' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

export const sourceLabel = (source: MarketingSource): string =>
  SOURCE_OPTIONS.find((s) => s.value === source)?.label ?? source;

/* ---------- Shared formatting ---------- */

export const formatPrice = (n: number): string =>
  `₪${Math.round(n).toLocaleString('he-IL')}`;

export const formatDateHe = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
};

/** "13:00–15:00" wrapped in LTR isolates so RTL doesn't flip the range. */
export const windowLabel = (start: string, end: string): string => `⁦${start}–${end}⁩`;

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDaysIso = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function relativeTimeHe(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const future = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60000);
  const label =
    mins < 1
      ? 'עכשיו'
      : mins < 60
        ? `${mins} דק׳`
        : mins < 60 * 24
          ? `${Math.round(mins / 60)} שע׳`
          : `${Math.round(mins / (60 * 24))} ימים`;
  if (mins < 1) return label;
  return future ? `בעוד ${label}` : `לפני ${label}`;
}
