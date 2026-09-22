import { site } from '@/config/site';

/**
 * Prefilled WhatsApp messages per entry point. The brief fixed the first two;
 * the rest keep the same voice so the business owner can see where a lead came from.
 */
export const whatsappMessages = {
  default: 'היי, הגעתי דרך האתר ואני מעוניין לקבל פרטים על בניית אתר לעסק.',
  google: 'היי, הגעתי דרך האתר ואני מעוניין באתר + קידום בגוגל.',
  pricing: 'היי, הגעתי דרך האתר ואני רוצה להבין איזה מסלול מתאים לעסק שלי — אתר או אתר + Google Ads.',
  unsure: 'היי, הגעתי דרך האתר. יש לי עסק ואני עדיין לא בטוח מה מתאים לי — אשמח להתייעץ.',
  roi: 'היי, הגעתי דרך האתר ואני רוצה לדבר על אתר שיביא לעסק שלי יותר לקוחות.',
  faq: 'היי, הגעתי דרך האתר ויש לי שאלה: ',
  portfolio: 'היי, הגעתי דרך האתר ואשמח לראות דוגמאות לאתרים בתחום שלי.',
} as const;

export type WhatsAppContext = keyof typeof whatsappMessages | 'after_submit' | 'form_fallback';

export const hasWhatsApp = site.contact.whatsapp.length > 0;
export const hasPhone = site.contact.phone.length > 0;

/** Builds a wa.me link with the message for the given context (or a custom text). */
export function whatsappHref(contextOrText: WhatsAppContext | string = 'default'): string {
  const text =
    contextOrText in whatsappMessages
      ? whatsappMessages[contextOrText as keyof typeof whatsappMessages]
      : contextOrText;
  const number = site.contact.whatsapp;
  // No number configured yet: keep links valid but harmless (owner sees a clear TODO in config).
  if (!number) return '/#contact';
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
