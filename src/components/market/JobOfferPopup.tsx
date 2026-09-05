'use client';

import { useEffect, useState } from 'react';
import { shekel } from '@/lib/market/config';
import { acceptOffer, declineOffer } from '@/lib/market/engine';
import { useCollection } from '@/lib/market/hooks';
import { answersSummary } from '@/lib/market/services';
import type { BookingOffer } from '@/lib/market/types';
import { Btn } from './ui';

/**
 * The Uber-style incoming-job popup: full details, big accept button and a
 * live countdown. When it hits zero the engine expires the offer and moves on
 * to the next pro.
 */
export function JobOfferPopup({ offer }: { offer: BookingOffer }) {
  const { rows: bookings } = useCollection('bookings');
  const { rows: services } = useCollection('services');
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [busy, setBusy] = useState(false);

  const booking = bookings.find((b) => b.id === offer.bookingId);
  const service = services.find((s) => s.id === booking?.serviceId);

  useEffect(() => {
    const update = () => {
      if (!offer.expiresAt) return;
      setSecondsLeft(Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - Date.now()) / 1000)));
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [offer.expiresAt]);

  if (!booking || !service) return null;
  const pct = Math.min(100, (secondsLeft / 30) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-rise rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">עבודה חדשה! 🔔</h2>
          <span className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-black ${secondsLeft <= 10 ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-700'}`}>
            {secondsLeft}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full transition-all duration-500 ${secondsLeft <= 10 ? 'bg-red-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <p className="flex items-center gap-2 text-lg font-black text-slate-900">
            <span className="text-2xl">{service.icon}</span> {service.name}
          </p>
          {answersSummary(service, booking) && <p className="text-slate-600">{answersSummary(service, booking)}</p>}
          <p className="text-slate-600">📍 {booking.address}</p>
          <p className="text-slate-600">
            🕐 {booking.scheduledFor ? new Date(booking.scheduledFor).toLocaleString('he-IL', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'כמה שיותר מהר'}
          </p>
          {booking.notes && <p className="rounded-xl bg-slate-50 p-2 text-xs text-slate-500">“{booking.notes}”</p>}
          {booking.photos.length > 0 && (
            <div className="flex gap-2">
              {booking.photos.slice(0, 3).map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg object-cover" />
              ))}
            </div>
          )}
          <p className="text-2xl font-black text-emerald-600">
            {shekel(booking.quoteLowAgorot)}–{shekel(booking.quoteHighAgorot)}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Btn variant="secondary" disabled={busy} onClick={async () => { setBusy(true); await declineOffer(offer.id); setBusy(false); }}>
            דחה
          </Btn>
          <Btn variant="success" className="col-span-2 py-3 text-base" disabled={busy || secondsLeft === 0} onClick={async () => { setBusy(true); await acceptOffer(offer.id); setBusy(false); }}>
            ✓ קבל עבודה
          </Btn>
        </div>
      </div>
    </div>
  );
}
