import type { Metadata } from 'next';
import { MarketHome } from './MarketHome';

export const metadata: Metadata = {
  // Absolute: the parent template lives in this segment's own layout, so the
  // root (store) template would otherwise suffix this page.
  title: { absolute: 'קלינגו — הזמנת ניקוי ספות, מזרנים ומזגנים באזור שלך' },
  alternates: { canonical: '/market' },
};

export default function MarketPage() {
  return <MarketHome />;
}
