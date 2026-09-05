import { supabase } from '@/lib/supabase';
import { LocalStore } from './store/local';
import { SupabaseStore } from './store/supabase';
import type { LcStore } from './store/types';
import type { Locale } from './types';

/**
 * Session plumbing: which store is active (demo in the browser or Supabase),
 * which organisation is open, and the UI locale. All persisted in
 * localStorage so a reload lands exactly where the user left off.
 */
export type Mode = 'demo' | 'live';

const KEYS = { mode: 'lc:mode', org: 'lc:org', locale: 'lc:locale' };

const ls = {
  get: (k: string) => (typeof window === 'undefined' ? null : window.localStorage.getItem(k)),
  set: (k: string, v: string) => typeof window !== 'undefined' && window.localStorage.setItem(k, v),
  del: (k: string) => typeof window !== 'undefined' && window.localStorage.removeItem(k),
};

export const hasSupabase = Boolean(supabase);

export function getMode(): Mode | null {
  const m = ls.get(KEYS.mode);
  return m === 'demo' || m === 'live' ? m : null;
}
export function setMode(mode: Mode | null) {
  if (mode) ls.set(KEYS.mode, mode);
  else ls.del(KEYS.mode);
}
export function getOrgId(): string | null {
  return ls.get(KEYS.org);
}
export function setOrgId(id: string | null) {
  if (id) ls.set(KEYS.org, id);
  else ls.del(KEYS.org);
}
export function getStoredLocale(): Locale | null {
  const l = ls.get(KEYS.locale);
  return l === 'he' || l === 'ru' || l === 'en' ? l : null;
}
export function setStoredLocale(l: Locale) {
  ls.set(KEYS.locale, l);
}

let localStore: LocalStore | null = null;
let supabaseStore: SupabaseStore | null = null;

export function storeFor(mode: Mode): LcStore {
  if (mode === 'live' && supabase) return (supabaseStore ??= new SupabaseStore(supabase));
  return (localStore ??= new LocalStore());
}

export function supabaseStoreOrNull(): SupabaseStore | null {
  if (!supabase) return null;
  return (supabaseStore ??= new SupabaseStore(supabase));
}
