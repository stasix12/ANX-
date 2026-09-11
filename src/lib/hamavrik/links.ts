import { business, SITE_BASE, SITE_ORIGIN } from '@/lib/hamavrik/config';

/**
 * Builds a wa.me deep link with a URL-encoded Hebrew message. Every WhatsApp
 * button on the site opens the same number; the message defaults to the
 * configured greeting and can be extended with context ("...לניקוי מזרן").
 */
export function waLink(message: string = business.whatsappGreeting): string {
  return `https://wa.me/${business.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** Greeting + a short, specific tail — tells the business which button converted. */
export function waLinkFor(context: string): string {
  return waLink(`${business.whatsappGreeting} ${context}`);
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
