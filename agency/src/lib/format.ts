import { currency, locale } from '@/config/site';

const ils = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency,
  maximumFractionDigits: 0,
});

const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

/** 10000 → "‏10,000 ₪" */
export function formatCurrency(value: number): string {
  return ils.format(value);
}

/** 10000 → "10,000" */
export function formatNumber(value: number): string {
  return num.format(value);
}
