import type { Metadata } from 'next';
import { ProShell } from '@/components/market/ProShell';
import { market } from '@/lib/market/config';

export const metadata: Metadata = {
  title: { default: `${market.name} Pro`, template: `%s | ${market.name} Pro` },
  robots: { index: false },
};

export default function ProAppLayout({ children }: { children: React.ReactNode }) {
  return <ProShell>{children}</ProShell>;
}
