import type { Locale } from './types';

const intlLocale: Record<Locale, string> = { he: 'he-IL', ru: 'ru-RU', en: 'en-IL' };

export function formatMoney(amount: number, locale: Locale = 'he', opts: { compact?: boolean; decimals?: boolean } = {}): string {
  const n = Math.round(amount);
  if (opts.compact && Math.abs(n) >= 10_000) {
    return `₪${(n / 1000).toLocaleString(intlLocale[locale], { maximumFractionDigits: 1 })}K`;
  }
  return `₪${n.toLocaleString(intlLocale[locale], { maximumFractionDigits: opts.decimals ? 2 : 0 })}`;
}

export function formatNumber(n: number, locale: Locale = 'he'): string {
  return n.toLocaleString(intlLocale[locale]);
}

export function formatPercent(n: number, locale: Locale = 'he'): string {
  return `${n.toLocaleString(intlLocale[locale], { maximumFractionDigits: 1 })}%`;
}

export function formatTime(iso: string | Date, locale: Locale = 'he'): string {
  return new Date(iso).toLocaleTimeString(intlLocale[locale], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDate(iso: string | Date, locale: Locale = 'he', style: 'short' | 'medium' | 'long' | 'weekday' = 'medium'): string {
  const d = new Date(iso);
  if (style === 'short') return d.toLocaleDateString(intlLocale[locale], { day: 'numeric', month: 'numeric' });
  if (style === 'long') return d.toLocaleDateString(intlLocale[locale], { weekday: 'long', day: 'numeric', month: 'long' });
  if (style === 'weekday') return d.toLocaleDateString(intlLocale[locale], { weekday: 'short', day: 'numeric', month: 'short' });
  return d.toLocaleDateString(intlLocale[locale], { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string | Date, locale: Locale = 'he'): string {
  return `${formatDate(iso, locale, 'weekday')} · ${formatTime(iso, locale)}`;
}

export function formatMonth(d: Date, locale: Locale = 'he'): string {
  return d.toLocaleDateString(intlLocale[locale], { month: 'long', year: 'numeric' });
}

export function weekdayShort(dayIndex: number, locale: Locale = 'he'): string {
  // 2023-01-01 was a Sunday.
  const d = new Date(2023, 0, 1 + dayIndex);
  return d.toLocaleDateString(intlLocale[locale], { weekday: 'short' });
}
export function weekdayLong(dayIndex: number, locale: Locale = 'he'): string {
  const d = new Date(2023, 0, 1 + dayIndex);
  return d.toLocaleDateString(intlLocale[locale], { weekday: 'long' });
}

/** "5m", "2h", "3d" style relative label. */
export function timeAgo(iso: string | Date, locale: Locale = 'he', now = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const dict = {
    he: { now: 'עכשיו', m: 'דק׳', h: 'שע׳', d: 'ימים' },
    ru: { now: 'сейчас', m: 'мин', h: 'ч', d: 'дн' },
    en: { now: 'now', m: 'm', h: 'h', d: 'd' },
  }[locale];
  if (m < 1) return dict.now;
  if (m < 60) return `${m} ${dict.m}`;
  if (h < 24) return `${h} ${dict.h}`;
  return `${d} ${dict.d}`;
}

export function formatDuration(min: number, locale: Locale = 'he'): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const l = { he: ['שע׳', 'דק׳'], ru: ['ч', 'мин'], en: ['h', 'min'] }[locale];
  if (h && m) return `${h} ${l[0]} ${m} ${l[1]}`;
  if (h) return `${h} ${l[0]}`;
  return `${m} ${l[1]}`;
}
