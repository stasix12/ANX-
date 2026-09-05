/**
 * Event tracking seam. Every funnel step calls trackEvent(); today the sinks
 * are a dev console log + an in-browser ring buffer (used by the admin
 * dashboard), and adding Google Analytics / Meta Pixel / TikTok Pixel later
 * is just another sink here — the call sites never change.
 *
 * Keys go in .env.local when the time comes:
 *   NEXT_PUBLIC_GA_ID, NEXT_PUBLIC_META_PIXEL_ID, NEXT_PUBLIC_TIKTOK_PIXEL_ID
 */

export type EventName =
  | 'LandingViewed'
  | 'LocationSelected'
  | 'ServiceSelected'
  | 'QuoteViewed'
  | 'BookingStarted'
  | 'BookingCompleted'
  | 'ProfessionalAccepted'
  | 'PaymentCompleted';

const BUFFER_KEY = 'cleango:analytics';
const BUFFER_MAX = 500;

export interface TrackedEvent {
  name: EventName;
  props: Record<string, unknown>;
  at: string;
}

export function trackEvent(name: EventName, props: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  const event: TrackedEvent = { name, props, at: new Date().toISOString() };
  try {
    const buffer = JSON.parse(window.localStorage.getItem(BUFFER_KEY) ?? '[]') as TrackedEvent[];
    buffer.push(event);
    window.localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer.slice(-BUFFER_MAX)));
  } catch {
    // storage full/blocked — analytics must never break the product
  }
  if (process.env.NODE_ENV !== 'production') console.debug('[analytics]', name, props);
  // Future sinks:
  // window.gtag?.('event', name, props);
  // window.fbq?.('trackCustom', name, props);
  // window.ttq?.track(name, props);
}

export function readEvents(): TrackedEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(BUFFER_KEY) ?? '[]') as TrackedEvent[];
  } catch {
    return [];
  }
}
