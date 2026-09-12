import { business, landingPages, serviceById, SITE_BASE, SITE_ORIGIN } from '@/lib/hamavrik/config';

/**
 * Builds a wa.me deep link with a URL-encoded Hebrew message. Every WhatsApp
 * button on the site opens the same number with a message the customer can
 * send as-is.
 */
export function waLink(message: string = waAsk()): string {
  return `https://wa.me/${business.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * The prepared message: one sentence, the thing being cleaned, and an
 * invitation to attach the photo the price depends on.
 *
 *   waAsk()                         → "היי, הגעתי דרך האתר. אשמח למחיר לניקוי ספה — הנה תמונה:"
 *   waAsk('ניקוי מזרן', 'באר שבע')  → "...אשמח למחיר לניקוי מזרן בבאר שבע — הנה תמונה:"
 *
 * There is deliberately NO source tag. The site used to send "(מה-Hero)",
 * "(מהפוטר)" and friends inside the customer's own message — internal
 * bookkeeping that reads, to the person about to hit send, like being
 * tracked. Which button converted belongs in analytics (`track('whatsapp_
 * click', { location })`), not in their chat.
 */
export function waAsk(noun: string = 'ניקוי ספה', city?: string): string {
  const where = city ? ` ב${city}` : '';
  return `${business.whatsappOpener} אשמח למחיר ל${noun}${where} — ${business.whatsappPhotoLine}`;
}

/**
 * The prepared message for whatever page the visitor is on. The site-wide
 * buttons (header, menu, sticky bar) used to say "ניקוי ספה" on the mattress
 * page too, which handed the business a message about the wrong item from the
 * most-tapped button on the page.
 */
export function waAskForPath(pathname: string | null): string {
  const slug = (pathname ?? '').replace(`${SITE_BASE}/`, '');
  const page = landingPages.find((p) => p.slug === slug);
  if (!page) return waAsk();
  return waAsk(serviceById[page.service].waNoun, page.city);
}

/** tel: link in E.164 form — dials correctly from any country and any device. */
export const telLink = `tel:${business.phoneE164}`;

/** Internal link, prefixed with the site's route base. `href('/arad')` → `/sofa-cleaning/arad`. */
export function href(path: string = ''): string {
  const full = `${SITE_BASE}${path === '/' ? '' : path}`;
  return full || '/';
}

/** Absolute URL for canonical / Open Graph / JSON-LD. */
export function absoluteUrl(path: string = ''): string {
  return `${SITE_ORIGIN}${SITE_BASE}${path === '/' ? '' : path}`;
}

/** Absolute URL for a file under /public (JSON-LD image fields need absolute URLs). */
export function publicUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${SITE_ORIGIN}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`;
}
