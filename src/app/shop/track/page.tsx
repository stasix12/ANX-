import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TrackOrder, TrackWithParams } from '@/components/shop/views/OrderViews';

export const metadata: Metadata = { title: 'מעקב הזמנה', robots: { index: false } };

export default function TrackPage() {
  return (
    <Suspense fallback={<TrackOrder id={null} />}>
      <TrackWithParams />
    </Suspense>
  );
}
