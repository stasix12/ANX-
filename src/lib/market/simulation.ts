import {
  acceptOffer,
  addMessage,
  advanceStatus,
  completeJob,
  submitBid,
  tickDispatch,
} from './engine';
import { getStore } from './store';
import type { Booking } from './types';

/**
 * Demo-pro autopilot. In demo mode the seeded pros (isDemo) behave like real
 * people so the whole Uber-style flow can be experienced immediately: they
 * accept a dispatched job after a few seconds, drive over, do the work and
 * even answer the chat. Runs as a tick from the customer's tracking screen —
 * timings are derived from row timestamps, so re-running a tick is harmless.
 *
 * Two hard rules keep it honest:
 *  - It only ever acts for demo pros, and never for the pro this browser is
 *    signed in as (activeProId) — a human playing the pro always wins.
 *  - It can be switched off entirely in /market/admin/settings
 *    (simulationEnabled), e.g. to test the offer-timeout path.
 */

const age = (iso: string) => Date.now() - Date.parse(iso);

const CHAT_REPLIES = [
  'היי! קיבלתי את ההזמנה, אני בדרך אליך 🙂',
  'אין בעיה, אני מטפל בזה.',
  'מגיע עם כל הציוד — אין מה לדאוג.',
  'מעולה, נתראה בקרוב!',
];

export async function runSimulationTick(bookingId: string, activeProId: string | null): Promise<void> {
  const store = getStore();
  const settings = await store.getSettings();
  // Offer expiry is real product behavior and runs regardless of simulation.
  await tickDispatch(bookingId);
  if (!settings.simulationEnabled) return;

  const booking = await store.get('bookings', bookingId);
  if (!booking) return;
  const pros = await store.list('professionals');
  const isSimPro = (proId: string | null) => {
    if (!proId || proId === activeProId) return false;
    return pros.find((p) => p.id === proId)?.isDemo === true;
  };

  if (booking.status === 'offered') {
    const offers = (await store.list('offers')).filter(
      (o) => o.bookingId === bookingId && o.status === 'sent',
    );
    for (const offer of offers) {
      if (!isSimPro(offer.professionalId)) continue;
      if (offer.kind === 'dispatch' && age(offer.createdAt) > 8000) {
        await acceptOffer(offer.id);
        return;
      }
      if (offer.kind === 'bid' && offer.priceAgorot === null && age(offer.createdAt) > 6000) {
        // Each demo pro bids around the quote with their own spread.
        const pro = pros.find((p) => p.id === offer.professionalId)!;
        const mid = (booking.quoteLowAgorot + booking.quoteHighAgorot) / 2;
        const spread = 0.85 + ((pro.id.charCodeAt(4) % 30) / 100);
        await submitBid(
          offer.id,
          Math.round((mid * spread) / 100) * 100,
          20 + (pro.id.charCodeAt(5) % 40),
          'שלום! אשמח לבצע את העבודה, כולל אחריות על התוצאה.',
        );
      }
    }
    return;
  }

  if (!isSimPro(booking.professionalId)) return;

  await maybeReplyInChat(booking);

  switch (booking.status) {
    case 'accepted':
      if (age(booking.updatedAt) > 12000) {
        await advanceStatus(bookingId, 'en_route', 'professional');
        await addMessage(bookingId, 'professional', 'יצאתי אליך! אעדכן כשאני מגיע 🚗');
      }
      break;
    case 'en_route':
      if (age(booking.updatedAt) > 25000) await advanceStatus(bookingId, 'arrived', 'professional');
      break;
    case 'arrived':
      if (age(booking.updatedAt) > 12000)
        await advanceStatus(bookingId, 'in_progress', 'professional');
      break;
    case 'in_progress':
      if (age(booking.updatedAt) > 30000) {
        const mid = Math.round((booking.quoteLowAgorot + booking.quoteHighAgorot) / 2 / 100) * 100;
        await completeJob(bookingId, mid);
        await addMessage(bookingId, 'professional', 'סיימנו! מקווה שאתם מרוצים מהתוצאה ✨');
      }
      break;
  }
}

/** Demo pro answers the customer's last chat message once, after a beat. */
async function maybeReplyInChat(booking: Booking): Promise<void> {
  const store = getStore();
  const thread = (await store.list('messages'))
    .filter((m) => m.bookingId === booking.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last = thread[thread.length - 1];
  if (!last || last.sender !== 'customer' || age(last.createdAt) < 4000) return;
  const reply = CHAT_REPLIES[thread.filter((m) => m.sender === 'professional').length % CHAT_REPLIES.length];
  await addMessage(booking.id, 'professional', reply);
}
