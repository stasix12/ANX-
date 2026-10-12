import type { Order, PaymentMethodId } from './types';

/**
 * Payment provider boundary.
 *
 * Card details are never collected or stored by this site. A real provider
 * (e.g. an Israeli licensed acquirer's hosted payment page — Tranzila,
 * CardCom, PayPlus, Meshulam/Grow — or Stripe Checkout) is opened with the
 * order id and total, the customer pays on the provider's page, and the
 * provider calls back with a transaction reference. Only then is the order
 * marked paid (actions.confirmPayment).
 *
 * Until a provider is connected the store runs DemoProvider: an explicit
 * "demo payment" step that charges nothing. Replacing it is a matter of
 * implementing PaymentProvider and verifying the callback server-side.
 */

export interface PaymentResult {
  status: 'approved' | 'declined' | 'cancelled';
  reference?: string;
}

export interface PaymentProvider {
  id: string;
  /** True when this provider performs real charges. */
  live: boolean;
  label: string;
}

export const PAYMENT_METHODS: { id: PaymentMethodId; name: string; note: string }[] = [
  { id: 'card', name: 'כרטיס אשראי', note: 'בעמוד התשלום המאובטח של חברת הסליקה' },
  { id: 'bit', name: 'Bit', note: 'תשלום מהאפליקציה' },
  { id: 'paypal', name: 'PayPal', note: 'מעבר לחשבון PayPal' },
];

export const activeProvider: PaymentProvider = {
  id: 'demo',
  live: false,
  label: 'מצב הדגמה — לא מתבצע חיוב',
};

/** Demo-only transaction reference, shaped like a provider's. */
export function demoReference(order: Order): string {
  return `DEMO-${order.number}-${Date.now().toString(36).toUpperCase()}`;
}
