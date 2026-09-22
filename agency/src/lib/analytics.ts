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
  | 'form_submit_error'
  | 'pricing_cta_click'
  | 'google_package_cta_click'
  | 'website_package_cta_click'
  | 'cta_click'
  | 'roi_calculate'
  | 'faq_open'
  | 'portfolio_click'
  | 'roi_cta_click'
  | 'section_view'
  | 'sticky_bar_view';

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

/** Every param key we ever send — pushed as null when absent so GTM's data
 *  model does not carry a value over from an earlier event. */
const PARAM_KEYS = [
  'location',
  'label',
  'destination',
  'package',
  'context',
  'note',
  'field',
  'error_type',
  'error_code',
  'method',
  'has_business_name',
  'has_roi_context',
  'intent_source',
  'deal_value',
  'customers',
  'monthly_result',
  'question_id',
  'question_text',
  'project_name',
  'section_id',
] as const;

export function track(event: TrackEvent, params: TrackParams = {}): void {
  if (typeof window === 'undefined') return;
  const reset = Object.fromEntries(PARAM_KEYS.map((k) => [k, null]));
  const payload = { ...reset, event, ...params } as unknown as DataLayerEvent;

  // GTM / generic dataLayer consumers.
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(payload);

  // Everything below is the direct-gtag path. With GTM configured the
  // container owns GA4 / Ads / Meta, so nothing else fires here.
  if (analyticsIds.gtm) return;

  if (window.gtag) {
    window.gtag('event', event, params);
  }

  // Google Ads conversion for the lead events, when a label is configured.
  // A WhatsApp click that follows a form submission (or carries the form's
  // details) is the same lead, so it is not counted a second time.
  const followUp = params.context === 'after_submit' || params.context === 'form_fallback';
  if (window.gtag && analyticsIds.gadsId && analyticsIds.gadsLeadLabel && !followUp) {
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
    else if ((event === 'whatsapp_click' || event === 'phone_click') && !followUp)
      window.fbq('track', 'Contact', params);
    else window.fbq('trackCustom', event, params);
  }
}
