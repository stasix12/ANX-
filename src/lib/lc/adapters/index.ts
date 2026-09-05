/**
 * External-service adapters. Every integration the product will eventually
 * need is an interface here with a mock implementation, so wiring the real
 * API later never touches application code.
 */

export interface OutboundMessage {
  to: string; // phone
  text: string;
  language: string;
  conversationId: string;
}

export interface MessagingAdapter {
  readonly name: string;
  readonly connected: boolean;
  send(msg: OutboundMessage): Promise<{ ok: boolean; externalId?: string }>;
}

export class MockWhatsAppAdapter implements MessagingAdapter {
  readonly name = 'WhatsApp (mock)';
  readonly connected = false;
  async send(msg: OutboundMessage) {
    return { ok: true, externalId: `mock_${msg.conversationId}_${Date.now()}` };
  }
}

export interface PaymentsAdapter {
  readonly name: string;
  readonly connected: boolean;
  createCheckout(input: { plan: string; organizationId: string }): Promise<{ url: string | null }>;
}
export class MockPaymentsAdapter implements PaymentsAdapter {
  readonly name = 'Payments (mock — Stripe-ready)';
  readonly connected = false;
  async createCheckout() {
    return { url: null };
  }
}

export interface ReviewsAdapter {
  readonly name: string;
  readonly connected: boolean;
  reviewLink(organizationId: string): string;
}
export class MockGoogleReviewsAdapter implements ReviewsAdapter {
  readonly name = 'Google Reviews (mock)';
  readonly connected = false;
  reviewLink() {
    return 'https://g.page/r/review';
  }
}

export interface AdsAdapter {
  readonly name: string;
  readonly connected: boolean;
  monthlySpend(source: string): Promise<number | null>;
}
export class MockAdsAdapter implements AdsAdapter {
  readonly name = 'Ad platforms (mock)';
  readonly connected = false;
  async monthlySpend() {
    return null;
  }
}

export interface VisionAdapter {
  readonly name: string;
  analyze(url: string): Promise<{ label: string; confidence: number }>;
}
export class MockVisionAdapter implements VisionAdapter {
  readonly name = 'Photo analysis (mock)';
  async analyze() {
    return { label: 'standard fabric, everyday soiling', confidence: 0.8 };
  }
}

export const adapters = {
  messaging: new MockWhatsAppAdapter(),
  payments: new MockPaymentsAdapter(),
  reviews: new MockGoogleReviewsAdapter(),
  ads: new MockAdsAdapter(),
  vision: new MockVisionAdapter(),
};

export const INTEGRATIONS = [
  { key: 'whatsapp', name: 'WhatsApp Business', adapter: adapters.messaging },
  { key: 'ai', name: 'AI provider', adapter: { name: 'Rule-based agent (mock) · Anthropic-ready', connected: false } },
  { key: 'payments', name: 'Payments', adapter: adapters.payments },
  { key: 'reviews', name: 'Google Reviews', adapter: adapters.reviews },
  { key: 'ads', name: 'Ad platforms (Google / Meta)', adapter: adapters.ads },
];
