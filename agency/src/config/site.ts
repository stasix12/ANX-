/**
 * ═══════════════════════════════════════════════════════════════════════
 *  הגדרות האתר — הקובץ היחיד שצריך לערוך כדי להתאים את האתר לעסק שלכם.
 *
 *  כל ערך שמסומן TODO הוא placeholder. שום ערך כאן אינו נתון אמיתי עד
 *  שתחליפו אותו. מזהי Analytics מגיעים מ-.env (ראו .env.example) ולא מכאן.
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Production origin. Falls back to the host's production URL (Vercel) and
 * fails the build if nothing is available — canonicals, sitemap and JSON-LD
 * must never point at a placeholder domain.
 */
function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (raw) {
    if (!/^https?:\/\/[^/]+$/.test(raw)) {
      throw new Error(`[site] NEXT_PUBLIC_SITE_URL must be an origin without a path, got "${raw}"`);
    }
    return raw;
  }
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[site] NEXT_PUBLIC_SITE_URL is not set. Canonicals, sitemap and JSON-LD would point at a placeholder domain. Set it (e.g. https://example.co.il) and rebuild.',
    );
  }
  return 'http://localhost:3000';
}

export const site = {
  /** TODO: שם המותג כפי שיופיע בכותרת, בלוגו ובפוטר. */
  name: 'ANX Digital',
  /** TODO: שורת תיאור קצרה (מופיעה ליד הלוגו ובמטא-דאטה). */
  tagline: 'בניית אתרים וקידום בגוגל לעסקים',
  /**
   * TODO: כתובת האתר המלאה בפרודקשן, בלי סלאש בסוף.
   * משמשת ל-canonical, sitemap, OpenGraph ו-Schema.
   */
  url: resolveSiteUrl(),

  contact: {
    /**
     * TODO: מספר WhatsApp בפורמט בינלאומי ללא + וללא רווחים (למשל 972501234567).
     * ריק = כפתורי WhatsApp מוסתרים אוטומטית.
     */
    whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '',
    /**
     * TODO: מספר טלפון בפורמט בינלאומי ללא + (למשל 972501234567).
     * ריק = קישורי טלפון מוסתרים אוטומטית.
     */
    phone: process.env.NEXT_PUBLIC_PHONE_NUMBER ?? '',
    /** TODO: אימייל ליצירת קשר. ריק = לא מוצג. */
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '',
    /** TODO: אזור שירות (מוצג בפוטר וב-Schema). */
    areaServed: 'ישראל',
    /** TODO: עיר/כתובת. ריק = לא מוצג ולא נכנס ל-Schema. */
    addressLocality: '',
  },

  /** TODO: קישורים לפרופילים חברתיים. ריק = לא מוצג. */
  social: {
    facebook: '',
    instagram: '',
    linkedin: '',
    /** קישור לביקורות Google (Google Business Profile). */
    googleReviews: '',
  },

  /** שעות פעילות לתצוגה בפוטר (טקסט חופשי). ריק = לא מוצג. */
  openingHours: '',

  /**
   * תאריך עדכון תוכן אחרון (ISO). מזין את sitemap ואת Schema. עדכנו ידנית
   * כשמשנים טקסטים — לא אוטומטית, כדי שגוגל יתייחס לזה ברצינות.
   */
  lastUpdated: '2026-09-22',
  legalPagesUpdated: '2026-09-22',
} as const;

/** True on preview/staging builds — the site then asks not to be indexed. */
export const noIndex =
  process.env.NEXT_PUBLIC_NOINDEX === '1' ||
  (Boolean(process.env.VERCEL_ENV) && process.env.VERCEL_ENV !== 'production');

/**
 * חבילות ותמחור. price = null מציג "הצעת מחיר לפי אפיון".
 * כדי להציג מחיר: price: 4900, וניתן להוסיף priceNote (למשל "לא כולל מע״מ").
 */
export type PricingTier = {
  id: 'website' | 'website-google';
  price: number | null;
  /** טקסט קטן מתחת למחיר, למשל "לא כולל מע״מ" או "החל מ-". */
  priceNote: string;
  /** מחיר ניהול חודשי (לחבילת Google). null = לא מוצג. */
  monthly: number | null;
  monthlyNote: string;
  popular: boolean;
};

export const pricing: Record<PricingTier['id'], PricingTier> = {
  website: {
    id: 'website',
    price: null, // TODO: למשל 4900
    priceNote: '',
    monthly: null,
    monthlyNote: '',
    popular: false,
  },
  'website-google': {
    id: 'website-google',
    price: null, // TODO: מחיר הקמה
    priceNote: '',
    monthly: null, // TODO: דמי ניהול חודשיים
    monthlyNote: 'לא כולל תקציב מדיה',
    popular: true,
  },
};

/** מטבע ופורמט מספרים (עברית-ישראל). */
export const locale = 'he-IL';
export const currency = 'ILS';
