import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderSuccess, OrderSuccessWithParams } from '@/components/shop/views/OrderViews';

export const metadata: Metadata = { title: 'אישור הזמנה', robots: { index: false } };

export default function OrderPage() {
  return (
    <Suspense fallback={<OrderSuccess id={null} />}>
      <OrderSuccessWithParams />
    </Suspense>
  );
}
