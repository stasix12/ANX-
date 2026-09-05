'use client';

import { useMemo, useState } from 'react';
import { Btn, Card, Sheet, inputClass } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { STATUS_LABELS, advanceStatus } from '@/lib/market/engine';
import { useCollection } from '@/lib/market/hooks';
import { refundBooking } from '@/lib/market/payments';
import type { Booking, BookingStatus } from '@/lib/market/types';

/** Admin: every booking, with status override and refund. */
export default function AdminBookingsPage() {
  const { rows: bookings } = useCollection('bookings');
  const { rows: services } = useCollection('services');
  const { rows: pros } = useCollection('professionals');
  const { rows: messages } = useCollection('messages');
  const [statusFilter, setStatusFilter] = useState('all');
  const [open, setOpen] = useState<Booking | null>(null);

  const list = useMemo(
    () =>
      bookings
        .filter((b) => statusFilter === 'all' || b.status === statusFilter)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [bookings, statusFilter],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">עבודות ({bookings.length})</h1>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} w-52`}>
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {list.length === 0 && <Card className="p-8 text-center text-sm text-slate-400">אין עבודות עדיין</Card>}
        {list.map((b) => {
          const service = services.find((s) => s.id === b.serviceId);
          const pro = pros.find((p) => p.id === b.professionalId);
          return (
            <Card key={b.id} className="cursor-pointer p-4 transition hover:border-sky-300" onClick={() => setOpen(b)}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-black">{service?.icon} {service?.name}</span>
                <span className="text-slate-500">👤 {b.customerName}</span>
                <span className="text-slate-500">🧑‍🔧 {pro ? pro.businessName || pro.fullName : '—'}</span>
                <span className="text-slate-400">📍 {b.address}</span>
                <span className="ms-auto rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-black text-sky-700">{STATUS_LABELS[b.status]}</span>
                <span className="font-black">{b.finalPriceAgorot !== null ? shekel(b.finalPriceAgorot) : `~${shekel(b.quoteHighAgorot)}`}</span>
                {b.commissionAgorot !== null && <span className="text-xs text-emerald-600">עמלה {shekel(b.commissionAgorot)}</span>}
              </div>
            </Card>
          );
        })}
      </div>

      {open && (
        <Sheet title={`הזמנה #${open.id.slice(0, 8)}`} onClose={() => setOpen(null)}>
          <div className="space-y-3 text-sm">
            <p><b>נוצרה:</b> {new Date(open.createdAt).toLocaleString('he-IL')}</p>
            <p><b>לקוח:</b> {open.customerName} · {open.customerPhone}</p>
            <p><b>כתובת:</b> {open.address}</p>
            {open.notes && <p><b>הערות:</b> {open.notes}</p>}
            {open.photos.length > 0 && (
              <div className="flex gap-2">
                {open.photos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ))}
              </div>
            )}
            <p><b>הודעות בצ'אט:</b> {messages.filter((m) => m.bookingId === open.id).length}</p>
            <div>
              <p className="mb-1 font-bold">שינוי סטטוס (Override):</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STATUS_LABELS) as BookingStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={async () => {
                      await advanceStatus(open.id, s, 'admin', 'שינוי ידני מהאדמין');
                      setOpen(null);
                    }}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${open.status === s ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500 hover:border-sky-300'}`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            {open.finalPriceAgorot !== null && (
              <Btn variant="danger" className="w-full" onClick={async () => { await refundBooking(open.id); setOpen(null); }}>
                ביצוע Refund מלא ({shekel(open.finalPriceAgorot)})
              </Btn>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
