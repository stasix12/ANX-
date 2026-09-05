'use client';

import Link from 'next/link';
import { STATUS_LABELS } from '@/lib/market/engine';
import { shekel } from '@/lib/market/config';
import { Card, EmptyState, Skeleton } from '@/components/market/ui';
import { useCollection } from '@/lib/market/hooks';
import { useMarketSession } from '@/lib/market/session';
import type { BookingStatus } from '@/lib/market/types';

const ACTIVE: BookingStatus[] = [
  'searching', 'offered', 'no_pros_available', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed',
];

const statusTone = (status: BookingStatus) =>
  status === 'canceled'
    ? 'bg-red-50 text-red-700'
    : ['paid', 'reviewed'].includes(status)
      ? 'bg-emerald-50 text-emerald-700'
      : ['searching', 'offered'].includes(status)
        ? 'bg-amber-50 text-amber-700'
        : 'bg-sky-50 text-sky-700';

export default function OrdersPage() {
  const session = useMarketSession();
  const { rows: bookings, loading } = useCollection('bookings');
  const { rows: services } = useCollection('services');
  const { rows: pros } = useCollection('professionals');

  const mine = bookings
    .filter((b) => b.customerId === session.customerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = mine.filter((b) => ACTIVE.includes(b.status));
  const past = mine.filter((b) => !ACTIVE.includes(b.status));

  const item = (b: (typeof mine)[number]) => {
    const service = services.find((s) => s.id === b.serviceId);
    const pro = b.professionalId ? pros.find((p) => p.id === b.professionalId) : null;
    return (
      <Link key={b.id} href={`/market/orders/${b.id}`}>
        <Card className="mb-3 flex items-center gap-3 p-4 transition hover:border-sky-300">
          <span className="text-3xl">{service?.icon ?? '🧽'}</span>
          <div className="min-w-0 flex-1">
            <p className="font-black text-slate-900">{service?.name ?? b.serviceId}</p>
            <p className="truncate text-xs text-slate-500">
              {b.address}
              {pro && ` · ${pro.businessName || pro.fullName}`}
            </p>
            <p className="text-[11px] text-slate-400">
              {new Date(b.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="text-end">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone(b.status)}`}>
              {STATUS_LABELS[b.status]}
            </span>
            <p className="mt-1 text-sm font-black text-slate-900">
              {b.finalPriceAgorot !== null ? shekel(b.finalPriceAgorot) : `~${shekel(b.quoteHighAgorot)}`}
            </p>
          </div>
        </Card>
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-xl font-black text-slate-900">ההזמנות שלי</h1>
      {loading && [1, 2, 3].map((i) => <Skeleton key={i} className="mb-3 h-24" />)}
      {!loading && mine.length === 0 && (
        <EmptyState icon="🧾" title="עוד אין הזמנות" subtitle="ההזמנה הראשונה שלך במרחק שתי לחיצות מהמסך הראשי" />
      )}
      {active.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-black text-slate-500">פעילות</h2>
          {active.map(item)}
        </>
      )}
      {past.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-black text-slate-500">היסטוריה</h2>
          {past.map(item)}
        </>
      )}
    </div>
  );
}
