import { trackEvent } from './analytics';
import { advanceStatus } from './engine';
import { getStore, nowIso, uid } from './store';

/**
 * Payment abstraction. The marketplace only ever calls chargeBooking();
 * which provider actually moves money is decided here, so plugging in a real
 * Israeli PSP is: implement PaymentProvider for it, add the case in
 * getProvider(), set the env keys. Until then MockProvider approves
 * everything after a short delay — clearly labeled in the UI.
 *
 * Planned providers and where their keys go (.env.local, server-side only —
 * never NEXT_PUBLIC_*; real charges must run through a route handler or
 * Supabase Edge Function, not the browser):
 *   TRANZILA_TERMINAL / TRANZILA_PASSWORD
 *   MESHULAM_USER_ID / MESHULAM_API_KEY
 *   GROW_API_KEY
 *   PAYPLUS_API_KEY / PAYPLUS_SECRET
 *   STRIPE_SECRET_KEY
 */

export interface ChargeRequest {
  bookingId: string;
  amountAgorot: number;
  method: string; // 'cash' | 'card' | 'prepaid' | 'deposit'
}

export interface ChargeResult {
  ok: boolean;
  externalRef: string;
  error?: string;
}

export interface PaymentProvider {
  id: string;
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

const MockProvider: PaymentProvider = {
  id: 'mock',
  async charge(request) {
    await new Promise((r) => setTimeout(r, 900)); // simulate the PSP round-trip
    return { ok: true, externalRef: `mock-${request.bookingId.slice(0, 8)}-${Date.now()}` };
  },
};

function getProvider(): PaymentProvider {
  // switch (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER) { case 'tranzila': … }
  return MockProvider;
}

/** Charge (or record a cash payment for) a completed booking → status 'paid'. */
export async function chargeBooking(request: ChargeRequest): Promise<ChargeResult> {
  const provider = request.method === 'cash' ? MockProvider : getProvider();
  const result = await provider.charge(request);
  if (result.ok) {
    const store = getStore();
    const booking = await store.get('bookings', request.bookingId);
    if (booking) {
      await store.put('bookings', {
        ...booking,
        paymentMethod: request.method,
        updatedAt: nowIso(),
      });
      await advanceStatus(request.bookingId, 'paid', 'system', `שולם (${request.method})`);
    }
    trackEvent('PaymentCompleted', { method: request.method, amountAgorot: request.amountAgorot });
  }
  return { ...result, externalRef: result.externalRef };
}

/** Admin refund — reverses the payment record and flags the booking. */
export async function refundBooking(bookingId: string): Promise<void> {
  const store = getStore();
  const booking = await store.get('bookings', bookingId);
  if (!booking || booking.finalPriceAgorot === null) return;
  if (booking.professionalId) {
    await store.put('wallet', {
      id: uid(),
      professionalId: booking.professionalId,
      bookingId,
      kind: 'adjustment',
      amountAgorot: -booking.finalPriceAgorot,
      note: 'החזר ללקוח (Refund)',
      createdAt: nowIso(),
    });
  }
  await advanceStatus(bookingId, 'canceled', 'admin', 'בוצע החזר כספי');
}
