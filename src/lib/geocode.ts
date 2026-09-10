import { CITIES } from '@/lib/platform/catalog';

/**
 * Address autocomplete for Israeli addresses, behind a provider-agnostic
 * function so vendors can be swapped without touching the UI.
 *
 * Default provider: Photon (photon.komoot.io) — a free OpenStreetMap
 * geocoder that supports typeahead queries, CORS from the browser, and
 * Hebrew street/city names, with no API key. Requests are biased to the
 * caller's location (device GPS and/or a chosen city) and filtered to
 * Israel.
 *
 * To switch to Google Places Autocomplete: put the key in .env.local as
 * NEXT_PUBLIC_MAPS_KEY and reimplement fetchRemote() against
 * https://places.googleapis.com/v1/places:autocomplete — the
 * AddressSuggestion shape below stays the same.
 */

export interface AddressSuggestion {
  /** Full display label: "רגר 40, באר שבע". */
  label: string;
  /** What belongs in the address field: "רגר 40". */
  addressLine: string;
  /** City name in Hebrew when known: "באר שבע". */
  city: string;
  lat: number;
  lng: number;
}

/** Israel bounding box (minLon,minLat,maxLon,maxLat) — keeps results local. */
const ISRAEL_BBOX = '34.2,29.4,35.95,33.4';

/* ---------- Device location, asked once and cached ---------- */

let cachedLocation: { lat: number; lng: number } | null = null;
let locationPromise: Promise<{ lat: number; lng: number } | null> | null = null;

/**
 * Resolve the device location once (3s budget). Failures — permission
 * denied, no GPS, desktop — resolve to null and autocomplete simply runs
 * without the bias.
 */
export function deviceLocation(): Promise<{ lat: number; lng: number } | null> {
  if (cachedLocation) return Promise.resolve(cachedLocation);
  if (locationPromise) return locationPromise;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  locationPromise = new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cachedLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        resolve(cachedLocation);
      },
      () => resolve(null),
      { timeout: 3000, maximumAge: 10 * 60 * 1000 },
    );
  });
  return locationPromise;
}

/* ---------- Provider: Photon ---------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromPhotonFeature(f: any): AddressSuggestion | null {
  const p = f?.properties ?? {};
  // Keep it in Israel; OSM tags carry either the ISO code or a country name.
  const country = String(p.countrycode ?? p.country ?? '');
  if (country && !['IL', 'ISR', 'Israel', 'ישראל'].includes(country)) return null;

  const city = String(p.city ?? p.town ?? p.village ?? p.county ?? '');
  const street = String(p.street ?? (p.osm_key === 'highway' ? p.name : '') ?? '');
  const house = String(p.housenumber ?? '');
  const name = String(p.name ?? '');

  const addressLine = street ? `${street}${house ? ` ${house}` : ''}` : name;
  if (!addressLine) return null;
  const label = city && city !== addressLine ? `${addressLine}, ${city}` : addressLine;
  const [lng, lat] = f?.geometry?.coordinates ?? [null, null];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { label, addressLine, city, lat, lng };
}

async function fetchRemote(
  query: string,
  bias: { lat: number; lng: number } | null,
  signal: AbortSignal | undefined,
): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({ q: query, limit: '8', bbox: ISRAEL_BBOX });
  if (bias) {
    params.set('lat', String(bias.lat));
    params.set('lon', String(bias.lng));
    // Stronger location bias: nearby results outrank global matches.
    params.set('zoom', '14');
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  const json = await res.json();
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const f of json?.features ?? []) {
    const s = fromPhotonFeature(f);
    if (s && !seen.has(s.label)) {
      seen.add(s.label);
      out.push(s);
    }
  }
  return out.slice(0, 6);
}

/** Offline/blocked fallback: match the platform's own city list. */
function localFallback(query: string): AddressSuggestion[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return CITIES.filter((c) => c.name.includes(q)).map((c) => ({
    label: c.name,
    addressLine: '',
    city: c.name,
    lat: c.lat,
    lng: c.lng,
  }));
}

/**
 * The one entry point the UI calls. Never throws: a failed or blocked
 * network falls back to local city matches (possibly empty).
 */
export async function suggestAddresses(
  query: string,
  bias: { lat: number; lng: number } | null,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const remote = await fetchRemote(q, bias, signal);
    return remote.length > 0 ? remote : localFallback(q);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return localFallback(q);
  }
}
