import type { Metadata } from 'next';
import { AdminView } from '@/components/shop/views/AdminView';

export const metadata: Metadata = { title: 'ניהול החנות', robots: { index: false, follow: false } };

export default function ShopAdminPage() {
  return <AdminView />;
}
