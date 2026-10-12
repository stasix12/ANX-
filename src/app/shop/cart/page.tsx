import type { Metadata } from 'next';
import { CartView } from '@/components/shop/views/CartView';

export const metadata: Metadata = { title: 'העגלה שלי', robots: { index: false } };

export default function CartPage() {
  return <CartView />;
}
