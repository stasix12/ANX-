import type { Metadata } from 'next';
import { OrderTracker } from './OrderTracker';

export const metadata: Metadata = { title: 'מעקב הזמנה' };

/**
 * Order data is per-browser (demo) or per-user (Supabase) — nothing to
 * prerender. The placeholder param keeps `output: 'export'` builds happy the
 * same way the store's product pages do.
 */
export async function generateStaticParams() {
  return [{ id: '_placeholder' }];
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderTracker bookingId={id} />;
}
