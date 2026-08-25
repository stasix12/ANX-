import type { Metadata } from 'next';

/**
 * Segment metadata for the trading dashboard — a private tool, kept out of
 * search engines just like the CRM.
 */
export const metadata: Metadata = {
  title: 'מסחר יומי אוטומטי — ANX',
  robots: { index: false, follow: false },
};

export default function TradingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
