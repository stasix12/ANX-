'use client';

import Link from 'next/link';
import { Avatar, Card, EmptyState, Skeleton } from '@/components/market/ui';
import { useCollection } from '@/lib/market/hooks';
import { useMarketSession } from '@/lib/market/session';

/** Chat inbox: one thread per booking that has messages. */
export default function MessagesPage() {
  const session = useMarketSession();
  const { rows: bookings, loading } = useCollection('bookings');
  const { rows: messages } = useCollection('messages');
  const { rows: pros } = useCollection('professionals');

  const threads = bookings
    .filter((b) => b.customerId === session.customerId && b.professionalId)
    .map((b) => {
      const thread = messages
        .filter((m) => m.bookingId === b.id)
        .sort((a, z) => z.createdAt.localeCompare(a.createdAt));
      return { booking: b, last: thread[0], pro: pros.find((p) => p.id === b.professionalId) };
    })
    .filter((t) => t.last)
    .sort((a, b) => b.last!.createdAt.localeCompare(a.last!.createdAt));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-xl font-black text-slate-900">הודעות</h1>
      {loading && [1, 2].map((i) => <Skeleton key={i} className="mb-3 h-20" />)}
      {!loading && threads.length === 0 && (
        <EmptyState icon="💬" title="אין שיחות עדיין" subtitle="צ'אט נפתח אוטומטית ברגע שבעל מקצוע מקבל הזמנה שלך" />
      )}
      {threads.map(({ booking, last, pro }) => (
        <Link key={booking.id} href={`/market/orders/${booking.id}`}>
          <Card className="mb-3 flex items-center gap-3 p-4">
            <Avatar name={pro?.businessName || pro?.fullName || '?'} photoUrl={pro?.photoUrl} size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-black text-slate-900">{pro?.businessName || pro?.fullName}</p>
              <p className="truncate text-xs text-slate-500">
                {last!.kind === 'image' ? '📷 תמונה' : last!.body}
              </p>
            </div>
            <span className="text-[11px] text-slate-400">
              {new Date(last!.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </Card>
        </Link>
      ))}
    </div>
  );
}
