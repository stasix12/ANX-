import type { Metadata } from 'next';
import { CheckoutView } from '@/components/shop/views/CheckoutView';

export const metadata: Metadata = { title: 'תשלום', robots: { index: false } };

export default function CheckoutPage() {
  return <CheckoutView />;
}
