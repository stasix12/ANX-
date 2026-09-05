import type { I18nText, Locale } from './types';

/** Short, URL-safe, collision-resistant id. Prefix helps when debugging. */
export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${rand}` : rand;
}

export const nowISO = () => new Date().toISOString();

export function addMinutes(iso: string | Date, minutes: number): Date {
  const d = new Date(iso);
  return new Date(d.getTime() + minutes * 60_000);
}
export function addDays(iso: string | Date, days: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d;
}
export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
export function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}
export function startOfMonth(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), 1);
  return c;
}
/** Week starting Sunday (Israeli convention). */
export function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  c.setDate(c.getDate() - c.getDay());
  return c;
}
export function sameDay(a: Date | string, b: Date | string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
export function toDateKey(d: Date | string): string {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}
export function toTimeKey(d: Date | string): string {
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}
export function fromDateTimeKeys(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
export function minutesBetween(a: string | Date, b: string | Date): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}
export function isWithin(iso: string | Date, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export function pick(text: I18nText | undefined, locale: Locale, fallback = ''): string {
  if (!text) return fallback;
  return text[locale] ?? text.en ?? text.he ?? text.ru ?? fallback;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
export function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}
export function groupBy<T, K extends string>(xs: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of xs) {
    const k = key(x);
    (out[k] ??= []).push(x);
  }
  return out;
}
export function sortBy<T>(xs: T[], key: (x: T) => number | string, dir: 'asc' | 'desc' = 'asc'): T[] {
  return [...xs].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const r = ka < kb ? -1 : ka > kb ? 1 : 0;
    return dir === 'asc' ? r : -r;
  });
}

/** Deterministic PRNG (mulberry32) so demo data is stable between reloads. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
    weighted: <T>(entries: readonly [T, number][]): T => {
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of entries) {
        r -= w;
        if (r <= 0) return v;
      }
      return entries[entries.length - 1][0];
    },
  };
}

/** Detects the script of a customer message: Hebrew, Cyrillic, else Latin/English. */
export function detectLanguage(text: string, fallback: Locale = 'he'): Locale {
  const he = (text.match(/[֐-׿]/g) ?? []).length;
  const ru = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  if (he === 0 && ru === 0 && en === 0) return fallback;
  if (he >= ru && he >= en) return 'he';
  if (ru >= en) return 'ru';
  return 'en';
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;
  return digits;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
