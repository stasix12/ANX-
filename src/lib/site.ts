/** Central brand + contact configuration. Edit here, it propagates everywhere. */

export const site = {
  name: 'ANX3D',
  tagline: 'Professional Cleaning Equipment',
  description:
    'ANX3D מייצרת ידיות שאיבה, צינורות ומתאמים למכונות Sabrina — ציוד שפותח עבור אנשי מקצוע בתחום ניקוי הספות והריפודים. משלוחים לכל הארץ.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://anx3d.co.il',
  /** Display form, used in visible text. */
  phoneDisplay: '053-5257250',
  /** International form (no plus, no dashes), used to build wa.me links. */
  whatsappNumber: '972535257250',
  instagram: 'https://instagram.com/anx3d',
  tiktok: 'https://tiktok.com/@anx3d',
  shippingNote: 'משלוחים לכל הארץ',
} as const;

/**
 * Builds a wa.me deep link with a properly URL-encoded Hebrew message.
 * encodeURIComponent is what keeps the RTL text intact across clients.
 */
export function whatsappLink(message: string): string {
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** Standard order message for a specific product. */
export function orderMessage(productName: string): string {
  return `היי, מעוניין להזמין את ${productName}`;
}

/** Ready-made link for the "order this product" buttons. */
export function orderLink(productName: string): string {
  return whatsappLink(orderMessage(productName));
}

/** Generic link for the header / hero / contact buttons. */
export const generalWhatsappLink = whatsappLink(
  'היי, הגעתי מהאתר של ANX3D ואשמח לקבל פרטים על הציוד ל-Sabrina',
);
