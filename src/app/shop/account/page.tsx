import type { Metadata } from 'next';
import { AccountView } from '@/components/shop/views/AccountView';

export const metadata: Metadata = { title: 'אזור אישי', robots: { index: false } };

export default function AccountPage() {
  return <AccountView />;
}
