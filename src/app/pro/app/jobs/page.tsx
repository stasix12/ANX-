'use client';

import { useMemo, useState } from 'react';
import { ChatPanel } from '@/components/market/ChatPanel';
import { Btn, Card, EmptyState, Sheet, inputClass } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import {
  STATUS_LABELS,
  advanceStatus,
  cancelBooking,
  completeJob,
  submitBid,
} from '@/lib/market/engine';
import { distanceKm } from '@/lib/market/geo';
import { useCollection } from '@/lib/market/hooks';
import { useMarketSession } from '@/lib/market/session';
import { answersSummary } from '@/lib/market/services';
import type { Booking, BookingOffer, BookingStatus, Professional, Service } from '@/lib/market/types';

/**
 * The pro's work screen: bid requests to answer, live jobs to advance
 * through the status machine, a nearest-neighbour route for today, and
 * history. Dispatch popups are global (ProShell) — this page covers
 * everything after the accept.
 */

type Tab = 'new' | 'today' | 'history';

const NEXT_ACTION: Partial<Record<BookingStatus, { to: BookingStatus; label: string }>> = {
  accepted: { to: 'en_route', label: '🚗 יצאתי ללקוח' },
  en_route: { to: 'arrived', label: '📍 הגעתי' },
  arrived: { to: 'in_progress', label: '🧽 התחלתי לעבוד' },
};

export default function ProJobsPage() {
  const session = useMarketSession();
  const proId = session.activeProId;
  const { rows: bookings } = useCollection('bookings');
  const { rows: offers } = useCollection('offers');
  const { rows: services } = useCollection('services');
  const { rows: pros } = useCollection('professionals');

  const [tab, setTab] = useState<Tab>('today');
  const [chatFor, setChatFor] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<Booking | null>(null);

  const pro = pros.find((p) => p.id === proId);

  const myBids = offers.filter(
    (o) => o.professionalId === proId && o.kind === 'bid' && o.status === 'sent' && o.priceAgorot === null,
  );
  const mine = bookings.filter((b) => b.professionalId === proId);
  const activeJobs = mine
    .filter((b) => ['accepted', 'en_route', 'arrived', 'in_progress', 'completed'].includes(b.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const history = mine
    .filter((b) => ['paid', 'reviewed', 'canceled'].includes(b.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  /** Greedy nearest-neighbour route over today's open jobs. */
  const route = useMemo(() => {
    if (!pro) return [];
    const open = activeJobs.filter((b) => b.location && b.status !== 'completed');
    const ordered: Booking[] = [];
    let cursor = pro.base;
    const pool = [...open];
    while (pool.length > 0) {
      pool.sort((a, b) => distanceKm(cursor, a.location!) - distanceKm(cursor, b.location!));
      const next = pool.shift()!;
      ordered.push(next);
      cursor = next.location!;
    }
    return ordered;
  }, [activeJobs, pro]);

  const serviceOf = (b: Booking) => services.find((s) => s.id === b.serviceId);

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-xl font-black">העבודות שלי</h1>

      <div className="mt-3 flex rounded-xl border border-slate-200 bg-white p-1 text-sm font-bold">
        {(
          [
            ['new', `חדשות${myBids.length > 0 ? ` (${myBids.length})` : ''}`],
            ['today', `פעילות${activeJobs.length > 0 ? ` (${activeJobs.length})` : ''}`],
            ['history', 'היסטוריה'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex-1 rounded-lg py-2 ${tab === id ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {tab === 'new' && (
          <>
            {myBids.length === 0 && (
              <EmptyState icon="📭" title="אין בקשות חדשות" subtitle='כשאתם במצב "זמין", עבודות מיידיות קופצות כחלון גדול; כאן מגיעות בקשות להצעת מחיר' />
            )}
            {myBids.map((offer) => (
              <BidCard key={offer.id} offer={offer} booking={bookings.find((b) => b.id === offer.bookingId)} service={services.find((s) => s.id === bookings.find((b) => b.id === offer.bookingId)?.serviceId)} />
            ))}
          </>
        )}

        {tab === 'today' && (
          <>
            {route.length > 1 && (
              <Card className="p-4">
                <p className="font-black">🗺️ מסלול מומלץ להיום</p>
                <ol className="mt-2 space-y-1 text-sm text-slate-600">
                  {route.map((b, i) => (
                    <li key={b.id}>
                      <span className="font-black text-emerald-600">{i + 1}.</span> {b.address}
                      <span className="text-xs text-slate-400"> · {serviceOf(b)?.shortName}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
            {activeJobs.length === 0 && <EmptyState icon="🧘" title="אין עבודות פעילות" subtitle="עברו למצב זמין כדי לקבל עבודות חדשות" />}
            {activeJobs.map((b) => {
              const action = NEXT_ACTION[b.status];
              const service = serviceOf(b);
              return (
                <Card key={b.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black">{service?.icon} {service?.name}</p>
                      <p className="text-xs text-slate-500">{service && answersSummary(service, b)}</p>
                      <p className="mt-1 text-sm text-slate-600">📍 {b.address}</p>
                      <p className="text-sm text-slate-600">👤 {b.customerName} {['en_route', 'arrived', 'in_progress', 'completed'].includes(b.status) ? `· ${b.customerPhone}` : '· הטלפון ייחשף ביציאה לדרך'}</p>
                    </div>
                    <div className="text-end">
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700">{STATUS_LABELS[b.status]}</span>
                      <p className="mt-1 font-black">{b.finalPriceAgorot !== null ? shekel(b.finalPriceAgorot) : `${shekel(b.quoteLowAgorot)}–${shekel(b.quoteHighAgorot)}`}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {action && (
                      <Btn variant="success" className="flex-1" onClick={() => void advanceStatus(b.id, action.to, 'professional')}>
                        {action.label}
                      </Btn>
                    )}
                    {b.status === 'in_progress' && (
                      <Btn variant="success" className="flex-1" onClick={() => setFinishing(b)}>✅ סיימתי את העבודה</Btn>
                    )}
                    {b.status === 'completed' && (
                      <span className="flex-1 rounded-xl bg-emerald-50 p-2.5 text-center text-sm font-bold text-emerald-700">ממתין לתשלום הלקוח…</span>
                    )}
                    <Btn variant="secondary" onClick={() => setChatFor(chatFor === b.id ? null : b.id)}>💬 צ'אט</Btn>
                    {['accepted', 'en_route'].includes(b.status) && (
                      <Btn variant="danger" onClick={() => void cancelPro(b, pro)}>ביטול</Btn>
                    )}
                  </div>
                  {chatFor === b.id && (
                    <div className="mt-3">
                      <ChatPanel bookingId={b.id} me="professional" />
                    </div>
                  )}
                </Card>
              );
            })}
          </>
        )}

        {tab === 'history' && (
          <>
            {history.length === 0 && <EmptyState icon="🗂️" title="אין היסטוריה עדיין" />}
            {history.map((b) => (
              <Card key={b.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-black">{serviceOf(b)?.icon} {serviceOf(b)?.name}</p>
                  <p className="text-xs text-slate-400">{new Date(b.updatedAt).toLocaleDateString('he-IL')} · {b.address}</p>
                </div>
                <div className="text-end">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${b.status === 'canceled' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {STATUS_LABELS[b.status]}
                  </span>
                  {b.finalPriceAgorot !== null && <p className="mt-1 text-sm font-black">{shekel(b.finalPriceAgorot)}</p>}
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      {finishing && <FinishSheet booking={finishing} onClose={() => setFinishing(null)} />}
    </div>
  );
}

async function cancelPro(booking: Booking, pro: Professional | undefined) {
  await cancelBooking(booking.id, 'professional', 'בוטל על ידי בעל המקצוע');
  if (pro) {
    // Cancellations hurt the pro's score — tracked as an EWMA like acceptance.
    const { getStore } = await import('@/lib/market/store');
    await getStore().put('professionals', {
      ...pro,
      cancelPct: Math.round((pro.cancelPct * 0.9 + 100 * 0.1) * 10) / 10,
    });
  }
}

function BidCard({ offer, booking, service }: { offer: BookingOffer; booking?: Booking; service?: Service }) {
  const [price, setPrice] = useState('');
  const [eta, setEta] = useState('30');
  const [message, setMessage] = useState('');
  if (!booking || !service) return null;
  return (
    <Card className="p-4">
      <p className="font-black">📨 בקשה להצעת מחיר — {service.icon} {service.name}</p>
      <p className="text-xs text-slate-500">{answersSummary(service, booking)}</p>
      <p className="mt-1 text-sm text-slate-600">📍 {booking.address}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder='מחיר בש"ח' className={inputClass} />
        <input type="number" value={eta} onChange={(e) => setEta(e.target.value)} placeholder="זמן הגעה (דק')" className={inputClass} />
      </div>
      <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="הודעה קצרה ללקוח" className={`${inputClass} mt-2`} />
      <Btn className="mt-2 w-full" disabled={!price} onClick={() => void submitBid(offer.id, Number(price) * 100, Number(eta) || 30, message)}>
        שליחת הצעה
      </Btn>
    </Card>
  );
}

function FinishSheet({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const mid = Math.round((booking.quoteLowAgorot + booking.quoteHighAgorot) / 2 / 100);
  const [price, setPrice] = useState(String(mid));
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="סיום עבודה" onClose={onClose}>
      <p className="text-sm text-slate-500">
        מה המחיר הסופי? חייב להיות בטווח שהוצג ללקוח ({shekel(booking.quoteLowAgorot)}–{shekel(booking.quoteHighAgorot)}).
      </p>
      <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputClass} mt-3`} />
      <Btn
        variant="success"
        className="mt-3 w-full py-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const agorot = Math.min(booking.quoteHighAgorot, Math.max(booking.quoteLowAgorot, Number(price) * 100));
          await completeJob(booking.id, agorot);
          onClose();
        }}
      >
        אישור סיום — {shekel(Math.min(booking.quoteHighAgorot, Math.max(booking.quoteLowAgorot, Number(price || 0) * 100)))}
      </Btn>
    </Sheet>
  );
}
