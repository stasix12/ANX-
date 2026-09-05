import type { Metadata, Viewport } from 'next';
import { MarketShell } from '@/components/market/MarketShell';
import { market } from '@/lib/market/config';

export const metadata: Metadata = {
  title: {
    default: `${market.name} — ${market.tagline}`,
    template: `%s | ${market.name}`,
  },
  description: market.description,
  manifest: '/market/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0284c7',
  colorScheme: 'light',
};

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return <MarketShell>{children}</MarketShell>;
}
