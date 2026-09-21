import { sendHit } from '@/lib/hamavrik/beacon';
import { analytics } from '@/lib/hamavrik/config';

/**
 * Conversion events the site fires. Each one lands in four places when the
 * corresponding tag is configured in config.ts:
 *   • the site's own counter (/api/hit → /admin) — always, on the standalone site
 *   • window.dataLayer  — always (works with Google Tag Manager as-is)
 *   • gtag('event')     — GA4 + Google Ads conversion (when a label is set)
 *   • fbq('trackCustom')— Meta Pixel, plus the standard Lead / Contact events
 */
export type TrackEvent =
  | 'whatsapp_click'
  | 'phone_click'
  | 'quote_started'
  | 'quote_completed'
  | 'service_selected'
  | 'before_after_interaction';

export type TrackParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

const META_STANDARD: Partial<Record<TrackEvent, string>> = {
  quote_completed: 'Lead',
  whatsapp_click: 'Contact',
  phone_click: 'Contact',
};

export function track(event: TrackEvent, params: TrackParams = {}): void {
  if (typeof window === 'undefined') return;

  sendHit('event', { name: event, meta: params });

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...params });

  if (typeof window.gtag === 'function') {
    window.gtag('event', event, params);
    const label =
      analytics.googleAdsConversionLabels[event as keyof typeof analytics.googleAdsConversionLabels];
    if (analytics.googleAdsId && label) {
      window.gtag('event', 'conversion', { send_to: `${analytics.googleAdsId}/${label}` });
    }
  }

  if (typeof window.fbq === 'function') {
    window.fbq('trackCustom', event, params);
    const standard = META_STANDARD[event];
    if (standard) window.fbq('track', standard, params);
  }
}
