import type { Metadata } from 'next';
import { AdminShell } from '@/components/market/AdminShell';

export const metadata: Metadata = {
  title: 'ניהול הפלטפורמה',
  robots: { index: false, follow: false },
};

export default function MarketAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
