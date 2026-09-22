/**
 * ═══════════════════════════════════════════════════════════════════════
 *  הגדרות האתר — הקובץ היחיד שצריך לערוך כדי להתאים את האתר לעסק שלכם.
 *
 *  כל ערך שמסומן TODO הוא placeholder. שום ערך כאן אינו נתון אמיתי עד
 *  שתחליפו אותו. מזהי Analytics מגיעים מ-.env (ראו .env.example) ולא מכאן.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const site = {
  /** TODO: שם המותג כפי שיופיע בכותרת, בלוגו ובפוטר. */
  name: 'ANX Digital',
  /** TODO: שורת תיאור קצרה (מופיעה ליד הלוגו ובמטא-דאטה). */
  tagline: 'אתרים ו-Google Ads לעסקים',
  /**
   * TODO: כתובת האתר המלאה בפרודקשן, בלי סלאש בסוף.
   * משמשת ל-canonical, sitemap, OpenGraph ו-Schema.
   */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com',

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
  openingHours: 'א׳–ה׳ 09:00–18:00',
} as const;

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
    monthlyNote: 'דמי ניהול חודשיים, לא כולל תקציב מדיה',
    popular: true,
  },
};

/** מטבע ופורמט מספרים (עברית-ישראל). */
export const locale = 'he-IL';
export const currency = 'ILS';
