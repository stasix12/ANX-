/**
 * External-integration abstraction layer. Every provider sits behind an
 * interface with a mock default, so swapping in a real vendor is: add the
 * key to .env.local, implement the adapter, flip the export. Nothing else
 * in the app changes (docs/PLATFORM.md → "איפה מכניסים מפתחות").
 */

export interface MessagingAdapter {
  readonly provider: string;
  /** Send a WhatsApp/SMS message; resolves with a delivery id. */
  send(toPhone: string, text: string): Promise<{ id: string; mock: boolean }>;
}

/**
 * WhatsApp Business API adapter. Real implementation: POST to
 * graph.facebook.com/v20.0/{WHATSAPP_PHONE_ID}/messages with
 * Authorization: Bearer {WHATSAPP_TOKEN} — both read from env on the
 * server side (never expose the token to the browser; route through a
 * Next.js route handler).
 */
export const whatsappAdapter: MessagingAdapter = {
  provider: process.env.NEXT_PUBLIC_WHATSAPP_MODE === 'live' ? 'whatsapp-business' : 'mock',
  async send(toPhone, text) {
    // Mock mode: open the wa.me composer so the flow is still real for the agent.
    if (typeof window !== 'undefined') {
      const digits = toPhone.replace(/\D/g, '').replace(/^0/, '972');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    }
    return { id: `mock-${Date.now()}`, mock: true };
  },
};

export interface PaymentsAdapter {
  readonly provider: string;
  /** Charge a card / redirect to a hosted page; resolves when captured. */
  charge(amountIls: number, description: string): Promise<{ ok: boolean; txId: string; mock: boolean }>;
}

/**
 * Israeli PSP adapter (Tranzila / Meshulam / Grow). Real implementation:
 * create a payment page server-side with the provider key from env, redirect,
 * confirm via webhook → then call the wallet TOP_UP action.
 */
export const paymentsAdapter: PaymentsAdapter = {
  provider: 'mock',
  async charge(amountIls) {
    return { ok: amountIls > 0, txId: `mock-pay-${Date.now()}`, mock: true };
  },
};

export interface PushAdapter {
  readonly provider: string;
  requestPermission(): Promise<boolean>;
}

/** Web-Push adapter; real implementation stores the subscription server-side. */
export const pushAdapter: PushAdapter = {
  provider: 'mock',
  async requestPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    return (await Notification.requestPermission()) === 'granted';
  },
};
