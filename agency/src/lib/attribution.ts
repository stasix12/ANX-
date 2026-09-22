/**
 * Captures ad-click identifiers and UTM parameters from the landing URL and
 * keeps them for the session, so the lead payload can say which campaign
 * produced it. Nothing here is personal data.
 */

const KEYS = [
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;
type Key = (typeof KEYS)[number];
export type Attribution = Partial<Record<Key, string>> & { landing_page?: string; referrer?: string };

const STORAGE_KEY = 'lead_attribution';

export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = readAttribution();
    const params = new URLSearchParams(window.location.search);
    const fresh: Attribution = {};
    for (const key of KEYS) {
      const value = params.get(key);
      if (value) fresh[key] = value.slice(0, 200);
    }
    const hasFresh = Object.keys(fresh).length > 0;
    if (!existing.landing_page || hasFresh) {
      const merged: Attribution = {
        ...existing,
        ...fresh,
        landing_page: existing.landing_page ?? window.location.pathname + window.location.search,
        referrer: existing.referrer ?? (document.referrer || undefined),
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    }
  } catch {
    // sessionStorage unavailable (private mode) — attribution is best-effort.
  }
}

export function readAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}
