'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChatPanel } from '@/components/market/ChatPanel';
import { MapCanvas } from '@/components/market/MapCanvas';
import { StatusTimeline } from '@/components/market/StatusTimeline';
import { Avatar, Btn, Card, EmptyState, Sheet, Skeleton, Stars, inputClass } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import {
  STATUS_LABELS,
  cancelBooking,
  chooseBid,
  retryBooking,
  submitReview,
} from '@/lib/market/engine';
import { etaWindow } from '@/lib/market/geo';
import { useCollection, useSettings, useTicker } from '@/lib/market/hooks';
import { chargeBooking } from '@/lib/market/payments';
import { useMarketSession } from '@/lib/market/session';
import { runSimulationTick } from '@/lib/market/simulation';
import { getStore } from '@/lib/market/store';
import type { Booking, Professional } from '@/lib/market/types';

/**
 * The live tracking screen — the heart of the customer experience. Statuses,
 * the map, the chat and the offers all update over the store's change feed;
 * a 2.5s tick drives dispatch timeouts and (in demo mode) the pro autopilot.
 */
export function OrderTracker({ bookingId }: { bookingId: string }) {
  const session = useMarketSession();
  const { rows: bookings, loading } = useCollection('bookings');
  const { rows: services } = useCollection('services');
  const { rows: pros } = useCollection('professionals');
  const { rows: offers } = useCollection('offers');
  const { rows: events } = useCollection('events');
  const { rows: availability } = useCollection('availability');
  const { rows: customers } = useCollection('customers');
  const settings = useSettings();

  useTicker(() => void runSimulationTick(bookingId, session.activeProId), 2500);

  const booking = bookings.find((b) => b.id === bookingId);
  const service = services.find((s) => s.id === booking?.serviceId);
  const pro = booking?.professionalId ? pros.find((p) => p.id === booking.professionalId) : null;
  const myOffers = useMemo(
    () => offers.filter((o) => o.bookingId === bookingId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [offers, bookingId],
  );
  const myEvents = useMemo(() => events.filter((e) => e.bookingId === bookingId), [events, bookingId]);

  if (loading || !settings) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  if (!booking) {
    return <EmptyState icon="🤷" title="ההזמנה לא נמצאה" subtitle="ייתכן שהיא נוצרה בדפדפן אחר (בדמו הנתונים מקומיים)" />;
  }

  const searchingPhase = ['searching', 'offered'].includes(booking.status);
  const activePhase = ['accepted', 'en_route', 'arrived', 'in_progress'].includes(booking.status);
  const canCancel = ['searching', 'offered', 'no_pros_available', 'accepted'].includes(booking.status);
  const proLocation = pro
    ? (availability.find((a) => a.professionalId === pro.id)?.location ?? pro.base)
    : null;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">הזמנה #{booking.id.slice(0, 8)}</p>
            <h1 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <span className="text-2xl">{service?.icon}</span> {service?.name}
            </h1>
            <p className="text-xs text-slate-500">{booking.address}</p>
          </div>
          <div className="text-end">
            <p className="text-xl font-black text-slate-900">
              {booking.finalPriceAgorot !== null
                ? shekel(booking.finalPriceAgorot)
                : `${shekel(booking.quoteLowAgorot)}–${shekel(booking.quoteHighAgorot)}`}
            </p>
            {booking.discountAgorot > 0 && (
              <p className="text-[11px] font-bold text-emerald-600">כולל הנחת קופון {shekel(booking.discountAgorot)}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Searching animation (auto mode) */}
      {searchingPhase && booking.mode !== 'bidding' && (
        <Card className="p-6 text-center">
          <div className="relative mx-auto h-24 w-24">
            <span className="absolute inset-0 animate-ping rounded-full bg-sky-200/70" />
            <span className="absolute inset-3 animate-ping rounded-full bg-sky-300/60 [animation-delay:250ms]" />
            <span className="absolute inset-0 flex items-center justify-center text-4xl">🔍</span>
          </div>
          <p className="mt-3 font-black text-slate-900">{STATUS_LABELS[booking.status]}</p>
          <p className="mt-1 text-sm text-slate-500">
            {booking.status === 'offered'
              ? 'העבודה נשלחה לבעל מקצוע מוביל באזור — ממתינים לאישור (עד 30 שניות)'
              : 'מדרגים את המקצוענים הזמינים באזור שלך…'}
          </p>
        </Card>
      )}

      {/* Bid mode: incoming quotes */}
      {booking.mode === 'bidding' && searchingPhase && (
        <Card className="p-4">
          <h2 className="font-black text-slate-900">הצעות מחיר שהתקבלו</h2>
          <p className="text-xs text-slate-400">הבקשה נשלחה ל-{booking.offeredProIds.length} בעלי מקצוע</p>
          <div className="mt-3 space-y-2">
            {myOffers.filter((o) => o.kind === 'bid' && o.priceAgorot !== null && o.status === 'sent').map((o) => {
              const bidPro = pros.find((p) => p.id === o.professionalId);
              if (!bidPro) return null;
              return (
                <div key={o.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={bidPro.businessName || bidPro.fullName} photoUrl={bidPro.photoUrl} size={36} />
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-900">{bidPro.businessName || bidPro.fullName}</p>
                      <Stars rating={bidPro.rating} size="text-xs" />
                    </div>
                    <div className="text-end">
                      <p className="font-black text-slate-900">{shekel(o.priceAgorot!)}</p>
                      <p className="text-[11px] text-emerald-600">הגעה ~{o.etaMinutes} דק'</p>
                    </div>
                  </div>
                  {o.message && <p className="mt-2 text-xs text-slate-500">“{o.message}”</p>}
                  <Btn className="mt-2 w-full" onClick={() => void chooseBid(o.id)}>
                    בחר הצעה זו
                  </Btn>
                </div>
              );
            })}
            {myOffers.filter((o) => o.kind === 'bid' && o.priceAgorot !== null).length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">ממתינים להצעות… בדרך כלל לוקח דקה-שתיים</p>
            )}
          </div>
        </Card>
      )}

      {/* No pros available — the smart fallback */}
      {booking.status === 'no_pros_available' && (
        <Card className="p-5 text-center">
          <span className="text-4xl">🕐</span>
          <p className="mt-2 font-black text-slate-900">כרגע אין מנקה זמין באזור שלך</p>
          <p className="mt-1 text-sm text-slate-500">זה קורה — הנה מה שאפשר לעשות:</p>
          <div className="mt-4 space-y-2">
            <Btn className="w-full" onClick={() => void retryBooking(booking.id, 'bidding')}>
              📨 קבל הצעות מחיר (גם ממי שלא מחובר כרגע)
            </Btn>
            <Link href={`/market/book?service=${booking.serviceId}&address=${encodeURIComponent(booking.address)}`} className="block">
              <Btn variant="secondary" className="w-full">📅 קבע למועד אחר</Btn>
            </Link>
            <Btn variant="secondary" className="w-full" onClick={() => void retryBooking(booking.id, 'auto')}>
              🔄 נסה שוב עכשיו
            </Btn>
          </div>
        </Card>
      )}

      {/* Assigned pro + live map */}
      {pro && booking.status !== 'canceled' && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Link href={`/pro/${pro.slug}`}>
              <Avatar name={pro.businessName || pro.fullName} photoUrl={pro.photoUrl} size={48} />
            </Link>
            <div className="flex-1">
              <p className="font-black text-slate-900">{pro.businessName || pro.fullName}</p>
              <p className="text-xs text-slate-500">
                <Stars rating={pro.rating} size="text-xs" /> · {pro.jobCount} עבודות
              </p>
            </div>
            {activePhase && booking.location && proLocation && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                {booking.status === 'en_route' ? `בדרך · ${etaWindow(2)}` : STATUS_LABELS[booking.status]}
              </span>
            )}
          </div>
          {activePhase && booking.location && proLocation && (
            <div className="mt-3">
              <MapCanvas
                center={booking.location}
                spanKm={10}
                heightClass="h-44"
                pins={[
                  { id: 'me', kind: 'customer', location: booking.location },
                  { id: pro.id, kind: 'pro', online: true, label: pro.businessName, location: proLocation },
                ]}
              />
            </div>
          )}
          <FavoriteToggle proId={pro.id} customers={customers} customerId={session.customerId} />
        </Card>
      )}

      {/* Timeline */}
      {booking.status !== 'no_pros_available' && (
        <Card className="p-4">
          <h2 className="mb-3 font-black text-slate-900">סטטוס ההזמנה</h2>
          <StatusTimeline booking={booking} events={myEvents} />
        </Card>
      )}

      {/* Chat */}
      {(activePhase || ['completed', 'paid', 'reviewed'].includes(booking.status)) && pro && (
        <div>
          <h2 className="mb-2 font-black text-slate-900">צ'אט עם {pro.fullName.split(' ')[0]}</h2>
          <ChatPanel bookingId={booking.id} me="customer" />
        </div>
      )}

      {/* Payment */}
      {booking.status === 'completed' && (
        <PaymentBox booking={booking} settingsMethods={settings.paymentMethods.filter((m) => m.enabled)} />
      )}

      {/* Review */}
      {booking.status === 'paid' && pro && service && (
        <ReviewForm booking={booking} pro={pro} customerName={session.customerName} />
      )}

      {booking.status === 'reviewed' && (
        <Card className="p-5 text-center">
          <span className="text-4xl">💚</span>
          <p className="mt-2 font-black text-slate-900">תודה על הדירוג!</p>
          <Link href={`/market/book?service=${booking.serviceId}&pro=${booking.professionalId}&address=${encodeURIComponent(booking.address)}`}>
            <Btn variant="success" className="mt-3">הזמן שוב את אותו מקצוען</Btn>
          </Link>
        </Card>
      )}

      {canCancel && <CancelButton bookingId={booking.id} />}
    </div>
  );
}

function FavoriteToggle({
  proId,
  customers,
  customerId,
}: {
  proId: string;
  customers: { id: string; favorites: string[] }[];
  customerId: string;
}) {
  const me = customers.find((c) => c.id === customerId);
  if (!me) return null;
  const isFav = me.favorites.includes(proId);
  const toggle = async () => {
    const store = getStore();
    const fresh = await store.get('customers', customerId);
    if (!fresh) return;
    await store.put('customers', {
      ...fresh,
      favorites: isFav ? fresh.favorites.filter((f) => f !== proId) : [...fresh.favorites, proId],
    });
  };
  return (
    <button onClick={() => void toggle()} className="mt-3 text-sm font-bold text-sky-700 hover:underline">
      {isFav ? '★ במועדפים — הזמנה חוזרת בלחיצה מ"מועדפים"' : '☆ שמור במועדפים להזמנה חוזרת'}
    </button>
  );
}

function PaymentBox({
  booking,
  settingsMethods,
}: {
  booking: Booking;
  settingsMethods: { id: string; label: string }[];
}) {
  const [method, setMethod] = useState(settingsMethods[0]?.id ?? 'cash');
  const [paying, setPaying] = useState(false);
  const amount = booking.finalPriceAgorot ?? booking.quoteHighAgorot;
  return (
    <Card className="p-4">
      <h2 className="font-black text-slate-900">תשלום — {shekel(amount)}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {settingsMethods.map((m) => (
          <button key={m.id} onClick={() => setMethod(m.id)} className={`rounded-xl border-2 p-3 text-sm font-bold ${method === m.id ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <Btn
        variant="success"
        className="mt-3 w-full py-3"
        disabled={paying}
        onClick={async () => {
          setPaying(true);
          await chargeBooking({ bookingId: booking.id, amountAgorot: amount, method });
          setPaying(false);
        }}
      >
        {paying ? 'מעבד תשלום…' : method === 'cash' ? 'שילמתי במזומן ✓' : 'שלם עכשיו'}
      </Btn>
      <p className="mt-2 text-center text-[11px] text-slate-400">סליקה בסביבת דמו (Mock) — חיבור Tranzila/Meshulam/Grow/PayPlus מוכן ב-payments.ts</p>
    </Card>
  );
}

function ReviewForm({
  booking,
  pro,
  customerName,
}: {
  booking: Booking;
  pro: Professional;
  customerName: string;
}) {
  const [scores, setScores] = useState({ quality: 5, punctuality: 5, service: 5, price: 4 });
  const [text, setText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const labels: Record<keyof typeof scores, string> = {
    quality: 'איכות העבודה',
    punctuality: 'עמידה בזמנים',
    service: 'שירות',
    price: 'מחיר',
  };
  return (
    <Card className="p-4">
      <h2 className="font-black text-slate-900">איך היה עם {pro.businessName || pro.fullName}?</h2>
      <div className="mt-3 space-y-2">
        {(Object.keys(labels) as (keyof typeof scores)[]).map((key) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600">{labels[key]}</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setScores((s) => ({ ...s, [key]: n }))} className={`text-xl ${n <= scores[key] ? 'text-amber-400' : 'text-slate-200'}`} aria-label={`${n} כוכבים`}>
                  ★
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="ספרו לנו (לא חובה)…" className={`${inputClass} mt-3`} />
      <label className="mt-2 block cursor-pointer text-sm font-bold text-sky-700">
        📷 {photoUrl ? 'תמונה צורפה ✓' : 'צרף תמונת תוצאה'}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => setPhotoUrl(String(reader.result));
            reader.readAsDataURL(f);
          }}
        />
      </label>
      <Btn
        className="mt-3 w-full"
        onClick={() =>
          void submitReview({
            bookingId: booking.id,
            professionalId: pro.id,
            customerId: booking.customerId,
            customerName,
            serviceId: booking.serviceId,
            ...scores,
            text,
            photoUrl,
          })
        }
      >
        שלח דירוג
      </Btn>
    </Card>
  );
}

function CancelButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <>
      <button onClick={() => setOpen(true)} className="mx-auto block text-sm font-bold text-red-500 hover:underline">
        ביטול הזמנה
      </button>
      {open && (
        <Sheet title="לבטל את ההזמנה?" onClose={() => setOpen(false)}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבת הביטול (לא חובה)" className={inputClass} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn variant="danger" onClick={async () => { await cancelBooking(bookingId, 'customer', reason || 'ביטול לקוח'); setOpen(false); }}>
              כן, בטל
            </Btn>
            <Btn variant="secondary" onClick={() => setOpen(false)}>חזרה</Btn>
          </div>
        </Sheet>
      )}
    </>
  );
}
