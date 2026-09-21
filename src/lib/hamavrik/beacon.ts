import { STANDALONE } from '@/lib/hamavrik/config';

/**
 * The site's own visit counter – a few bytes to /api/hit, handled by the
 * Cloudflare worker in scripts/hamavrik-worker and stored in the site's D1
 * database, read back by the owner's /admin page.
 *
 * No cookies: a per-tab session id (sessionStorage) says "one visit", a
 * per-browser id (localStorage) says "same person came back". The entry
 * page's path, referrer and query string travel with every hit so the worker
 * can name the visit's source (Google Ads, Google, Facebook, WhatsApp,
 * direct), campaign, keyword and landing page without a join. Only the standalone site has the endpoint.
 */
export type HitType = 'view' | 'ping' | 'event';

function rand(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function stored(store: Storage | null, key: string, make: () => string): string {
  try {
    const v = store?.getItem(key);
    if (v) return v;
    const n = make();
    store?.setItem(key, n);
    return n;
  } catch {
    return make();
  }
}

interface Ids {
  sid: string;
  vid: string;
  entryRef: string;
  entryQuery: string;
  entryPath: string;
}

let ids: Ids | null = null;

function getIds(): Ids {
  if (ids) return ids;
  const ss = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  const ls = typeof localStorage !== 'undefined' ? localStorage : null;
  ids = {
    sid: stored(ss, 'hv_sid', rand),
    vid: stored(ls, 'hv_vid', rand),
    entryRef: stored(ss, 'hv_ref', () => document.referrer || ''),
    entryQuery: stored(ss, 'hv_q', () => location.search || ''),
    entryPath: stored(ss, 'hv_lp', () => location.pathname || '/'),
  };
  return ids;
}

export function beaconEnabled(): boolean {
  if (!STANDALONE || typeof window === 'undefined') return false;
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return false;
  return true;
}

export function sendHit(type: HitType, extra: { name?: string; meta?: Record<string, unknown> } = {}): void {
  if (!beaconEnabled()) return;
  const { sid, vid, entryRef, entryQuery, entryPath } = getIds();
  const body = JSON.stringify({
    t: type,
    n: extra.name,
    p: location.pathname,
    r: entryRef,
    q: entryQuery,
    l: entryPath,
    s: sid,
    v: vid,
    w: window.innerWidth,
    m: extra.meta,
  });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon('/api/hit', new Blob([body], { type: 'application/json' }))) return;
  } catch {}
  fetch('/api/hit', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
}
