/**
 * One tracking function for the whole site.
 *
 * Events are pushed to `window.dataLayer` (Google Tag Manager picks them up as
 * Custom Events) and, when gtag.js is loaded directly (GA4 without GTM), sent
 * through `gtag('event', …)`. Meta Pixel receives a mirrored custom event.
 * Nothing here runs unless the corresponding ID is configured in .env.
 */

export type TrackEvent =
  | 'whatsapp_click'
  | 'phone_click'
  | 'form_start'
  | 'form_submit'
  | 'form_error'
  | 'pricing_cta_click'
  | 'google_package_cta_click'
  | 'website_package_cta_click'
  | 'cta_click'
  | 'roi_calculate'
  | 'faq_open'
  | 'portfolio_click';

export type TrackParams = Record<string, string | number | boolean | undefined>;

type DataLayerEvent = { event: string } & TrackParams;

declare global {
  interface Window {
    dataLayer?: DataLayerEvent[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export const analyticsIds = {
  gtm: process.env.NEXT_PUBLIC_GTM_ID ?? '',
  ga4: process.env.NEXT_PUBLIC_GA4_ID ?? '',
  gadsId: process.env.NEXT_PUBLIC_GADS_ID ?? '',
  gadsLeadLabel: process.env.NEXT_PUBLIC_GADS_LEAD_CONVERSION_LABEL ?? '',
  metaPixel: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '',
};

export function track(event: TrackEvent, params: TrackParams = {}): void {
  if (typeof window === 'undefined') return;
  const payload: DataLayerEvent = { event, ...params };

  // GTM / generic dataLayer consumers.
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(payload);

  // Direct gtag (GA4 loaded without GTM). Skipped when GTM is the loader, to
  // avoid double counting — GTM forwards dataLayer events to GA4 itself.
  if (window.gtag && !analyticsIds.gtm) {
    window.gtag('event', event, params);
  }

  // Google Ads conversion for the lead events, when a label is configured.
  if (window.gtag && analyticsIds.gadsId && analyticsIds.gadsLeadLabel) {
    if (event === 'form_submit' || event === 'whatsapp_click' || event === 'phone_click') {
      window.gtag('event', 'conversion', {
        send_to: `${analyticsIds.gadsId}/${analyticsIds.gadsLeadLabel}`,
        event_category: event,
      });
    }
  }

  // Meta Pixel mirror.
  if (window.fbq) {
    if (event === 'form_submit') window.fbq('track', 'Lead', params);
    else if (event === 'whatsapp_click' || event === 'phone_click') window.fbq('track', 'Contact', params);
    else window.fbq('trackCustom', event, params);
  }
}
