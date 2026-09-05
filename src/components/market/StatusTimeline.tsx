'use client';

import { STATUS_LABELS, STATUS_RAIL } from '@/lib/market/engine';
import type { Booking, BookingEvent } from '@/lib/market/types';

/** The customer's live progress rail — Uber-style, updated in real time. */
export function StatusTimeline({ booking, events }: { booking: Booking; events: BookingEvent[] }) {
  const currentIndex = STATUS_RAIL.indexOf(booking.status);
  const eventTime = (status: string) => {
    const ev = [...events].reverse().find((e) => e.status === status);
    return ev
      ? new Date(ev.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      : null;
  };

  if (booking.status === 'canceled') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
        ההזמנה בוטלה{booking.cancelReason ? ` — ${booking.cancelReason}` : ''}
      </div>
    );
  }

  return (
    <ol className="relative ms-3 border-s-2 border-slate-200">
      {STATUS_RAIL.map((status, i) => {
        const reachedReviewed = booking.status === 'reviewed';
        const done = reachedReviewed || (currentIndex >= 0 && i < currentIndex);
        const current = !reachedReviewed && i === currentIndex;
        const time = eventTime(status);
        return (
          <li key={status} className="mb-4 ms-5 last:mb-0">
            <span
              className={`absolute -start-[9px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                done
                  ? 'border-emerald-500 bg-emerald-500'
                  : current
                    ? 'border-sky-500 bg-white'
                    : 'border-slate-300 bg-white'
              }`}
            >
              {current && <span className="h-1.5 w-1.5 animate-ping rounded-full bg-sky-500" />}
              {done && <span className="text-[9px] leading-none text-white">✓</span>}
            </span>
            <p className={`text-sm ${current ? 'font-black text-sky-700' : done ? 'font-bold text-slate-700' : 'text-slate-400'}`}>
              {STATUS_LABELS[status]}
              {time && <span className="ms-2 text-[11px] font-normal text-slate-400">{time}</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
