/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  הפתרון המבריק — THE ONE FILE TO EDIT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every piece of business information the site shows lives here: name,
 * phone, WhatsApp, prices, services, service areas, reviews, before/after
 * photos, the Google reviews link, social links, analytics IDs and the list
 * of SEO landing pages. Change a value here and it propagates to every page,
 * every button and the structured data (JSON-LD) at once.
 *
 * Nothing in this file is invented on the business's behalf: numbers we do
 * not have are `null`, and reviews that are not real are flagged with
 * `placeholder: true` (the site shows them with a visible "example" badge
 * until they are replaced).
 */

import type { SceneKind } from '@/components/hamavrik/Illustrations';

/* ── Site root ─────────────────────────────────────────────────────────── */

/**
 * URL prefix the site lives under. This repository also hosts the ANX3D
 * store at `/`, so the cleaning site sits at `/sofa-cleaning`. To move it to
 * the root of its own domain later: rename `src/app/sofa-cleaning` to
 * `src/app/(site)` and set this to ''.
 */
export const SITE_BASE = '/sofa-cleaning';

/** Absolute origin used for canonical URLs, Open Graph and the sitemap. */
export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://anx3d.co.il';

/* ── Business ───────────────────────────────────────────────────────────── */

export const business = {
  name: 'הפתרון המבריק',
  /** Two-word wordmark, colored separately in the logo. */
  wordmark: ['הפתרון', 'המבריק'] as const,
  tagline: 'ניקוי ספות מקצועי בבית הלקוח',
  description:
    'ניקוי ספות, מזרנים, כורסאות, כיסאות, שטיחים וריפודי רכב בבית הלקוח — ציוד מקצועי, טיפול בכתמים וריחות, ניקוי עמוק ותוצאות שרואים. שירות בבאר שבע, ערד ודרום הארץ.',

  /** Display form, used in visible text. */
  phoneDisplay: '053-5257250',
  /** E.164 form for tel: links and schema.org. */
  phoneE164: '+972535257250',
  /** International form (no plus, no dashes) for wa.me links. */
  whatsappNumber: '972535257250',
  /** The pre-filled opening line of every WhatsApp button on the site. */
  whatsappGreeting:
    'שלום, הגעתי דרך האתר של הפתרון המבריק ואני רוצה לקבל הצעת מחיר לניקוי.',

  /** Shown next to "response time" claims. Keep honest. */
  responseNote: 'מענה מהיר בוואטסאפ בשעות הפעילות',

  /**
   * Opening hours for the LocalBusiness schema, in schema.org format
   * (e.g. ['Su-Th 08:00-20:00', 'Fr 08:00-14:00']). Leave empty until the
   * business confirms — nothing is shown or declared while empty.
   */
  openingHours: [] as string[],

  /**
   * Link of the "לכל הביקורות שלנו" button. Replace with the Google Maps
   * reviews URL of the business profile (Google Business Profile →
   * "Read reviews" → copy link). Until then it opens a Google search for
   * the business, which is a real, working destination rather than a dummy.
   */
  googleReviewsUrl: 'https://www.google.com/search?q=' + encodeURIComponent('הפתרון המבריק ניקוי ספות'),

  /** Social links. Empty string = the icon is not rendered. */
  social: {
    instagram: '',
    facebook: '',
    tiktok: '',
  },

  /** Geo center for LocalBusiness schema (Beer Sheva). */
  geo: { latitude: 31.2518, longitude: 34.7913 },
} as const;

/* ── Service areas ──────────────────────────────────────────────────────── */

export const serviceAreas = {
  /** The headline areas — shown big. */
  primary: ['באר שבע', 'ערד'],
  /**
   * Nearby towns listed under "והסביבה". Edit freely — the section says
   * "not sure we reach you? send a message", so a town on this list is an
   * invitation, not a promise of same-day arrival.
   */
  nearby: ['עומר', 'להבים', 'מיתר', 'דימונה', 'ירוחם', 'אופקים', 'נתיבות', 'רהט', 'כסייפה'],
  regionLabel: 'דרום הארץ',
  note: 'לא בטוחים שאנחנו מגיעים אליכם? שלחו הודעה עם שם היישוב ונענה מיד.',
} as const;

/* ── Services ───────────────────────────────────────────────────────────── */

export type ServiceId =
  | 'sofa'
  | 'mattress'
  | 'armchair'
  | 'chairs'
  | 'car'
  | 'carpet'
  | 'wall-to-wall'
  | 'stroller';

export interface Service {
  id: ServiceId;
  /** Short label for chips and the quick-quote picker. */
  label: string;
  /** Full name used as card title and in schema. */
  name: string;
  short: string;
  description: string;
  /** Which illustration the card draws until a real photo is configured. */
  scene: SceneKind;
  /** Optional real photo (put in /public/hamavrik/services/, 800×600+). */
  image: string | null;
  /** Starting price in ₪, or null to show "לפי הצעת מחיר". */
  priceFrom: number | null;
  /** Featured in the quick-quote picker and the main services grid. */
  featured: boolean;
}

export const services: Service[] = [
  {
    id: 'sofa',
    label: 'ספה',
    name: 'ניקוי ספות',
    short: 'ניקוי עמוק לספות בד, פינתיות ומערכות ישיבה — בבית הלקוח.',
    description:
      'ניקוי עמוק של הריפוד בשיטת הזרקה-יניקה, טיפול נקודתי בכתמים, נטרול ריחות והוצאת הלכלוך שהצטבר בתוך סיבי הבד. הספה מתייבשת תוך שעות ספורות ומוכנה לשימוש.',
    scene: 'sofa',
    image: null,
    priceFrom: 299,
    featured: true,
  },
  {
    id: 'mattress',
    label: 'מזרן',
    name: 'ניקוי מזרנים',
    short: 'הסרת כתמים, קרדית האבק ולכלוך עמוק ממזרנים — לשינה נקייה יותר.',
    description:
      'ניקוי עמוק ומקיף למזרנים: הסרת כתמי זיעה ונוזלים, טיפול בריחות והוצאת אבק מצטבר מתוך המזרן. מומלץ במיוחד למי שסובל מאלרגיות או לחדרי ילדים.',
    scene: 'mattress',
    image: null,
    priceFrom: 279,
    featured: true,
  },
  {
    id: 'armchair',
    label: 'כורסאות',
    name: 'ניקוי כורסאות',
    short: 'רענון והחזרת הצבע לכורסאות, כיסאות טלוויזיה וריקליינרים.',
    description:
      'כורסה נקייה משנה את כל הסלון. אנחנו מנקים כורסאות בד מכל הסוגים, כולל ריקליינרים וכורסאות הנקה, עם התאמת חומרי הניקוי לסוג הבד.',
    scene: 'armchair',
    image: null,
    priceFrom: null,
    featured: true,
  },
  {
    id: 'chairs',
    label: 'כיסאות',
    name: 'ניקוי כיסאות אוכל',
    short: 'כיסאות פינת אוכל מרופדים חוזרים להיראות חדשים.',
    description:
      'כיסאות פינת אוכל סופגים כתמי אוכל ושומן יום אחרי יום. ניקוי מקצועי מוציא את הלכלוך מתוך הריפוד ומחזיר את הצבע המקורי — לכל סט הכיסאות בביקור אחד.',
    scene: 'chair',
    image: null,
    priceFrom: null,
    featured: true,
  },
  {
    id: 'car',
    label: 'רכב',
    name: 'ניקוי ריפודי רכב',
    short: 'מושבים, ריפודי דלתות ושטיחוני רכב — ניקוי עמוק במקום שנוח לכם.',
    description:
      'ניקוי מושבי הרכב, ריפודי הדלתות, התקרה והשטיחונים בציוד מקצועי. מסירים כתמי קפה, אוכל, ריחות עשן וסימני שימוש — ומחזירים לרכב תחושה של חדש.',
    scene: 'car',
    image: null,
    priceFrom: 299,
    featured: true,
  },
  {
    id: 'carpet',
    label: 'שטיח',
    name: 'ניקוי שטיחים',
    short: 'שטיחים מכל הסוגים, בבית הלקוח וללא צורך בהובלה.',
    description:
      'ניקוי עמוק לשטיחים מבד, צמר וסיבים סינתטיים — הסרת כתמים, אבק ולכלוך שהצטבר בעומק הסיבים. הכול מתבצע אצלכם בבית, בלי לגלגל ולהוביל את השטיח לשום מקום.',
    scene: 'carpet',
    image: null,
    priceFrom: null,
    featured: true,
  },
  {
    id: 'wall-to-wall',
    label: 'שטיח מקיר לקיר',
    name: 'ניקוי שטיחים מקיר לקיר',
    short: 'ניקוי כל השטח בשיטת הזרקה-יניקה, כולל אזורי מעבר מלוכלכים.',
    description:
      'שטיחים מקיר לקיר צוברים לכלוך בעיקר באזורי המעבר. אנחנו מנקים את כל השטח בשיטת הזרקה-יניקה, עם דגש על הכתמים ואזורי השימוש הכבד, וללא השארת שאריות חומר.',
    scene: 'carpet',
    image: null,
    priceFrom: null,
    featured: false,
  },
  {
    id: 'stroller',
    label: 'עגלות וכיסאות ילדים',
    name: 'ניקוי עגלות וכיסאות ילדים',
    short: 'עגלות, כיסאות אוכל לתינוק וכיסאות בטיחות — ניקוי עדין ויסודי.',
    description:
      'ריפוד של עגלה או כיסא בטיחות בא במגע יומיומי עם התינוק. אנחנו מנקים אותו ביסודיות עם חומרים עדינים המתאימים לילדים, ומסירים כתמי אוכל, חלב ולכלוך יומיומי.',
    scene: 'stroller',
    image: null,
    priceFrom: null,
    featured: false,
  },
];

export const serviceById = Object.fromEntries(services.map((s) => [s.id, s])) as Record<ServiceId, Service>;

/* ── Price list ─────────────────────────────────────────────────────────── */

export interface PriceRow {
  label: string;
  /** Starting price in ₪; null renders "לפי הצעת מחיר". */
  from: number | null;
  note?: string;
  highlight?: boolean;
}

export const priceList: PriceRow[] = [
  { label: 'ניקוי ספה', from: 299, note: 'ספה תלת-מושבית סטנדרטית', highlight: true },
  { label: 'ניקוי ספה פינתית', from: 350, note: 'מערכת ישיבה פינתית' },
  { label: 'ניקוי מזרן', from: 279, note: 'מזרן זוגי, צד אחד' },
  { label: 'ניקוי ריפודי רכב', from: 299, note: 'מושבים קדמיים ואחוריים' },
  { label: 'ניקוי כורסה', from: null },
  { label: 'ניקוי כיסאות אוכל', from: null, note: 'מחיר לסט' },
  { label: 'ניקוי שטיחים', from: null, note: 'לפי גודל' },
];

export const priceDisclaimer =
  'המחיר הסופי נקבע בהתאם לגודל, סוג הבד ומצב הריפוד. ניתן לשלוח תמונה לקבלת הצעת מחיר מדויקת.';

/* ── Before / after gallery ─────────────────────────────────────────────── */

export interface BeforeAfterItem {
  /** Which category tab the item sits under. */
  category: 'sofa' | 'mattress' | 'chairs' | 'car' | 'carpet';
  title: string;
  chips: string[];
  /** Illustration used while `before`/`after` are null. */
  scene: SceneKind;
  /**
   * Real photo paths (under /public, ideally 1200×750, same framing for both).
   * Example: '/hamavrik/before-after/sofa-1-before.webp'.
   */
  before: string | null;
  after: string | null;
}

export const beforeAfterCategories: { id: BeforeAfterItem['category']; label: string }[] = [
  { id: 'sofa', label: 'ספות' },
  { id: 'mattress', label: 'מזרנים' },
  { id: 'chairs', label: 'כיסאות' },
  { id: 'car', label: 'רכב' },
  { id: 'carpet', label: 'שטיחים' },
];

export const beforeAfter: BeforeAfterItem[] = [
  { category: 'sofa', title: 'ספה תלת-מושבית, בד', chips: ['ניקוי עמוק', 'טיפול בכתמים'], scene: 'sofa', before: null, after: null },
  { category: 'sofa', title: 'ספה פינתית', chips: ['נטרול ריחות', 'ניקוי עמוק'], scene: 'sofa', before: null, after: null },
  { category: 'mattress', title: 'מזרן זוגי', chips: ['הסרת כתמים', 'קרדית האבק'], scene: 'mattress', before: null, after: null },
  { category: 'chairs', title: 'כיסאות פינת אוכל', chips: ['כתמי אוכל', 'החזרת צבע'], scene: 'chair', before: null, after: null },
  { category: 'car', title: 'מושבי רכב', chips: ['כתמי קפה', 'ריחות'], scene: 'car', before: null, after: null },
  { category: 'carpet', title: 'שטיח סלון', chips: ['ניקוי עמוק', 'אבק'], scene: 'carpet', before: null, after: null },
];

/* ── Hero media ─────────────────────────────────────────────────────────── */

/**
 * The hero visual. Real footage of the extraction wand pulling dirt out of
 * upholstery — muted, looping, with a poster so the page paints before a
 * byte of video arrives. To replace with a photo, set `video: null` and
 * point `image` at a file under /public.
 */
export const heroMedia = {
  video: {
    webm: '/video/anx-hero.webm',
    mp4: '/video/anx-hero.mp4',
    poster: '/video/anx-hero-poster.jpg',
  } as { webm: string; mp4: string; poster: string } | null,
  image: null as string | null,
  caption: 'צילום אמיתי מעבודה שלנו',
};

/* ── Social proof ───────────────────────────────────────────────────────── */

/**
 * Trust-bar numbers. Every value is optional: a null is simply not shown.
 * Fill in only with figures the business can stand behind
 * (e.g. reviewCount: 120, rating: 4.9, yearsActive: 6).
 */
export const stats = {
  rating: null as number | null,
  reviewCount: null as number | null,
  yearsActive: null as number | null,
  jobsDone: null as number | null,
};

export const trustPoints = [
  { icon: 'home', title: 'שירות בבית הלקוח', desc: 'מגיעים אליכם עם כל הציוד' },
  { icon: 'machine', title: 'ציוד מתקדם', desc: 'הזרקה-יניקה בלחץ מקצועי' },
  { icon: 'sparkle', title: 'ניקוי עמוק', desc: 'מתוך סיבי הריפוד, לא רק מבחוץ' },
  { icon: 'shield', title: 'שירות מקצועי', desc: 'הצעת מחיר ברורה מראש' },
] as const;

/* ── Reviews ────────────────────────────────────────────────────────────── */

export interface Review {
  name: string;
  city: string;
  text: string;
  rating: 1 | 2 | 3 | 4 | 5;
  /** 'google' shows the Google mark next to the review. */
  source: 'google' | 'whatsapp' | 'facebook';
  /**
   * ⚠️  PLACEHOLDER FLAG. `true` renders a visible "ביקורת לדוגמה" badge and
   * keeps the review OUT of the structured data. Replace the text with a
   * real customer review (with permission) and set this to false.
   */
  placeholder: boolean;
}

export const reviews: Review[] = [
  {
    name: 'שם הלקוח/ה',
    city: 'באר שבע',
    text: '[ביקורת לדוגמה — להחלפה בביקורת אמיתית מ-Google] כאן יופיע ציטוט של לקוח/ה על ניקוי הספה: מה היה המצב לפני, איך התנהל השירות ומה התוצאה.',
    rating: 5,
    source: 'google',
    placeholder: true,
  },
  {
    name: 'שם הלקוח/ה',
    city: 'ערד',
    text: '[ביקורת לדוגמה — להחלפה בביקורת אמיתית] כאן יופיע ציטוט על ניקוי מזרן או כורסה: זמן הגעה, יחס, ומה הלקוח/ה הרגיש/ה אחרי הניקוי.',
    rating: 5,
    source: 'google',
    placeholder: true,
  },
  {
    name: 'שם הלקוח/ה',
    city: 'עומר',
    text: '[ביקורת לדוגמה — להחלפה בביקורת אמיתית] כאן יופיע ציטוט על ניקוי ריפודי רכב או שטיח, כולל האם המחיר תאם את ההצעה שנסגרה מראש.',
    rating: 5,
    source: 'google',
    placeholder: true,
  },
];

/* ── How it works ───────────────────────────────────────────────────────── */

export const steps = [
  { title: 'שולחים תמונה', desc: 'מצלמים את הספה (או המזרן, הכיסא, הרכב) ושולחים בוואטסאפ.' },
  { title: 'מקבלים הצעת מחיר', desc: 'הצעה ברורה לפי גודל, סוג הבד ומצב הריפוד — בלי הפתעות.' },
  { title: 'מתאמים הגעה', desc: 'קובעים יום ושעה שנוחים לכם.' },
  { title: 'מגיעים ומנקים', desc: 'מגיעים אליכם עם כל הציוד ומבצעים ניקוי עמוק במקום.' },
  { title: 'נהנים מספה נקייה', desc: 'ריפוד נקי, רענן וללא ריחות — מוכן לשימוש תוך שעות ספורות.' },
] as const;

/* ── Why us ─────────────────────────────────────────────────────────────── */

export const whyUs = [
  { icon: 'machine', title: 'ציוד מקצועי', desc: 'אנחנו עובדים עם ציוד מתקדם לניקוי עמוק של הריפוד — לא מכשיר ביתי.' },
  { icon: 'droplet', title: 'טיפול מקצועי בכתמים', desc: 'התאמת שיטת העבודה וחומרי הניקוי לסוג הבד ולמצב הספה.' },
  { icon: 'home', title: 'שירות בבית הלקוח', desc: 'אין צורך להוביל את הספה לשום מקום. הכול מתבצע אצלכם.' },
  { icon: 'chat', title: 'שירות אישי', desc: 'תקשורת ישירה, תיאום ברור והצעת מחיר מראש.' },
  { icon: 'sparkle', title: 'ניקוי עמוק', desc: 'הוצאת הלכלוך שמצטבר בתוך סיבי הריפוד — לא רק ניקוי חיצוני.' },
  { icon: 'clock', title: 'ייבוש מהיר', desc: 'שאיבה חזקה משאירה את הריפוד לח בלבד, כך שהוא מתייבש תוך שעות.' },
] as const;

/* ── FAQ ────────────────────────────────────────────────────────────────── */

export const faq = [
  {
    q: 'כמה זמן לוקח ניקוי ספה?',
    a: 'ספה תלת-מושבית סטנדרטית לוקחת בדרך כלל בין 45 דקות לשעה וחצי, בהתאם לגודל, לסוג הבד ולכמות הכתמים. ספה פינתית או מערכת ישיבה גדולה יכולה לקחת יותר. אנחנו אומרים לכם מראש כמה זמן להקצות.',
  },
  {
    q: 'כמה זמן לוקח לספה להתייבש?',
    a: 'ברוב המקרים בין 3 ל-6 שעות, תלוי בסוג הבד, בעובי הריפוד ובאוורור בבית. השאיבה החזקה מוציאה את רוב הלחות כבר במהלך הניקוי, כך שהריפוד נשאר לח ולא רטוב. פתיחת חלון או הפעלת מזגן מקצרות את הזמן.',
  },
  {
    q: 'האם אפשר להסיר כל כתם?',
    a: 'את רוב הכתמים — כן: אוכל, שתייה, לכלוך יומיומי, זיעה וריחות. כתמים ותיקים מאוד, כתמי צבע או כתמים שנוקו בעבר בחומר לא מתאים עלולים להשאיר סימן קל. אנחנו בודקים את התמונה ואומרים לכם בכנות מה ריאלי עוד לפני שהגענו.',
  },
  {
    q: 'האם אתם מגיעים לבית הלקוח?',
    a: 'כן, תמיד. כל הניקוי מתבצע אצלכם בבית (או ליד הרכב, במקרה של ריפודי רכב). אנחנו מגיעים עם כל הציוד והחומרים ולא צריך להוביל שום דבר.',
  },
  {
    q: 'האם צריך להכין משהו לפני שאתם מגיעים?',
    a: 'כמעט כלום. מומלץ להוריד מהספה כריות נוי, שמיכות וחפצים אישיים ולפנות גישה נוחה אליה. אנחנו צריכים רק נקודת חשמל וגישה למים. את השאר אנחנו עושים.',
  },
  {
    q: 'האם אפשר לנקות ספה כשיש ילדים או בעלי חיים בבית?',
    a: 'כן. אנחנו משתמשים בחומרי ניקוי המתאימים לסביבה ביתית ושואבים את החומר מתוך הריפוד בסיום, כך שלא נשארות שאריות. מומלץ להמתין עד שהריפוד יבש לפני שחוזרים לשבת עליו.',
  },
  {
    q: 'כמה עולה ניקוי ספה?',
    a: 'ניקוי ספה תלת-מושבית מתחיל ב-299 ₪, וספה פינתית ב-350 ₪. המחיר הסופי נקבע לפי הגודל, סוג הבד ומצב הריפוד — ונסגר מראש, לפני שהגענו. שלחו תמונה בוואטסאפ ותקבלו הצעת מחיר מדויקת.',
  },
  {
    q: 'איך מקבלים הצעת מחיר?',
    a: 'הכי פשוט: מצלמים את הספה ושולחים לנו בוואטסאפ למספר 053-5257250 (או דרך הטופס באתר). אנחנו חוזרים אליכם עם מחיר ברור וזמינות. אפשר גם פשוט להתקשר.',
  },
] as const;

/* ── Professional explainer (SEO content) ───────────────────────────────── */

export const explainer = [
  {
    title: 'מהו ניקוי ספות מקצועי?',
    body: 'ניקוי ספות מקצועי הוא תהליך שמנקה את הריפוד לעומק, ולא רק את פני השטח שלו. במקום להסתפק בשפשוף חיצוני, משתמשים בציוד שמזריק תמיסת ניקוי לתוך סיבי הבד ושואב אותה בחזרה יחד עם הלכלוך, האבק, השומן והריחות שהצטברו בפנים במשך שנים. התוצאה היא ספה שנראית, מרגישה ומריחה נקייה באמת.',
  },
  {
    title: 'למה ניקוי ביתי רגיל לא מגיע לעומק הריפוד?',
    body: 'שואב אבק ביתי מוציא רק את האבק העליון, ומטלית עם חומר ניקוי בעיקר מורחת את הכתם ומשאירה שאריות חומר בתוך הבד. הלכלוך שבאמת מעניין — זיעה, שומן מהעור, פירורים, קרדית האבק — יושב עמוק בתוך המילוי והסיבים, ואף מברשת לא מגיעה לשם. בלי שאיבה חזקה שמושכת את הלכלוך החוצה, הוא פשוט נשאר.',
  },
  {
    title: 'איך עובדת שיטת ההזרקה-יניקה?',
    body: 'המכונה מזריקה לתוך הריפוד תמיסת ניקוי בלחץ מבוקר, שמפרקת את הלכלוך והכתמים בתוך הסיבים. מיד אחר כך, ראש השאיבה שואב את התמיסה בחזרה יחד עם כל מה שהיא הפרידה מהבד. אפשר לראות את ההבדל בעיניים: המים שנשאבים יוצאים חומים-אפורים, והריפוד נשאר לח בלבד ומתייבש תוך שעות. לפני הזרקה מבצעים שאיבה יבשה וטיפול מקדים בכתמים, ואחרי — שאיבה נוספת לייבוש.',
  },
  {
    title: 'אילו כתמים אפשר לנסות להסיר?',
    body: 'כתמי אוכל ושתייה (קפה, יין, רטבים), כתמי זיעה ושומן, לכלוך מבעלי חיים, כתמי חלב ומזון תינוקות, סימני שימוש כלליים ואפרוריות של הבד. כל אלה בדרך כלל יורדים היטב. כתמי דיו, צבע, אקונומיקה או שריפה הם מסוג אחר: הם משנים את הצבע של הסיב עצמו, ולכן לא תמיד ניתן להסיר אותם לגמרי. אנחנו מעדיפים לומר זאת מראש מאשר להבטיח ולא לעמוד בזה.',
  },
  {
    title: 'כמה זמן לוקח לספה להתייבש?',
    body: 'בדרך כלל בין 3 ל-6 שעות. הסיבה שזה מהיר יחסית היא השאיבה החזקה בסיום, שמוציאה את רוב הלחות. בדים עבים או מילוי ספוג יכולים לקחת מעט יותר. חדר מאוורר, מאוורר תקרה או מזגן מקצרים את הזמן. מומלץ לא לשבת על הספה עד שהיא יבשה לחלוטין כדי לא להטביע סימנים בבד הלח.',
  },
  {
    title: 'באיזו תדירות מומלץ לנקות ספה?',
    body: 'לבית ממוצע — פעם בשנה עד שנה וחצי. במשפחה עם ילדים קטנים, בעלי חיים, או אצל מי שסובל מאלרגיות, מומלץ פעם בחצי שנה עד שנה. ניקוי סדיר שומר על הבד, מונע הצטברות של ריחות וקרדית האבק ומאריך משמעותית את חיי הספה, הרבה מעבר לעלות הניקוי.',
  },
] as const;

/* ── SEO landing pages ──────────────────────────────────────────────────── */

/**
 * Each entry becomes a static page at `${SITE_BASE}/${slug}`, with its own
 * title, H1, meta description, JSON-LD and breadcrumbs. To add a page
 * ("ניקוי מזרנים בדימונה"), add an object here — nothing else to touch.
 */
export interface LandingPage {
  slug: string;
  service: ServiceId;
  city: string;
  /** <title> (without the brand suffix). */
  title: string;
  h1: string;
  description: string;
  /** Two or three sentences shown under the H1, written for that city. */
  intro: string;
}

export const landingPages: LandingPage[] = [
  {
    slug: 'beer-sheva',
    service: 'sofa',
    city: 'באר שבע',
    title: 'ניקוי ספות בבאר שבע — החל מ-299 ₪, בבית הלקוח',
    h1: 'ניקוי ספות בבאר שבע',
    description:
      'ניקוי ספות מקצועי בבאר שבע בבית הלקוח: ציוד מתקדם, טיפול בכתמים וריחות, ניקוי עמוק וייבוש מהיר. החל מ-299 ₪. שלחו תמונה בוואטסאפ וקבלו הצעת מחיר.',
    intro:
      'מגיעים לכל שכונות באר שבע עם הציוד המקצועי המלא — רמות, נווה זאב, נאות לון, הכלניות, שכונה ד׳ ועד לעיר העתיקה. שולחים תמונה של הספה, מקבלים מחיר, ואנחנו אצלכם.',
  },
  {
    slug: 'arad',
    service: 'sofa',
    city: 'ערד',
    title: 'ניקוי ספות בערד — שירות מקצועי בבית הלקוח',
    h1: 'ניקוי ספות בערד',
    description:
      'ניקוי ספות בערד בבית הלקוח: ניקוי עמוק בשיטת הזרקה-יניקה, טיפול בכתמים וריחות, ייבוש מהיר. הצעת מחיר בוואטסאפ תוך דקות.',
    intro:
      'שירות ניקוי ספות מקצועי בערד ובסביבה, ללא צורך להוביל שום דבר. מגיעים אליכם הביתה עם כל הציוד ומחזירים לספה את המראה הנקי.',
  },
  {
    slug: 'mattress-cleaning-beer-sheva',
    service: 'mattress',
    city: 'באר שבע',
    title: 'ניקוי מזרנים בבאר שבע — החל מ-279 ₪',
    h1: 'ניקוי מזרנים בבאר שבע',
    description:
      'ניקוי מזרנים מקצועי בבאר שבע בבית הלקוח: הסרת כתמים, קרדית האבק וריחות. החל מ-279 ₪. שלחו תמונה וקבלו הצעת מחיר בוואטסאפ.',
    intro:
      'מזרן נקי הוא שינה בריאה יותר. מנקים מזרנים בכל גודל בבאר שבע — הסרת כתמי זיעה ונוזלים, טיפול בריחות והוצאת אבק מצטבר, עם ייבוש מהיר באותו יום.',
  },
  {
    slug: 'car-upholstery-beer-sheva',
    service: 'car',
    city: 'באר שבע',
    title: 'ניקוי ריפודי רכב בבאר שבע — החל מ-299 ₪',
    h1: 'ניקוי ריפודי רכב בבאר שבע',
    description:
      'ניקוי ריפודי רכב בבאר שבע: מושבים, ריפודי דלתות ושטיחונים בניקוי עמוק. מגיעים אליכם. החל מ-299 ₪. הצעת מחיר בוואטסאפ.',
    intro:
      'הרכב מלווה אתכם כל יום — ומושבים סופגים הכול. מנקים ריפודי רכב בבאר שבע במקום שנוח לכם: בבית, בעבודה או בחניון.',
  },
  {
    slug: 'carpet-cleaning-beer-sheva',
    service: 'carpet',
    city: 'באר שבע',
    title: 'ניקוי שטיחים בבאר שבע — בבית הלקוח, ללא הובלה',
    h1: 'ניקוי שטיחים בבאר שבע',
    description:
      'ניקוי שטיחים מקצועי בבאר שבע בבית הלקוח: שטיחי סלון, שטיחים מקיר לקיר ושטיחי צמר. ניקוי עמוק, הסרת כתמים וייבוש מהיר. הצעת מחיר בוואטסאפ.',
    intro:
      'לא צריך לגלגל את השטיח ולחכות שבועיים. מנקים שטיחים בבאר שבע אצלכם בבית — שטיחי סלון, חדרי ילדים ושטיחים מקיר לקיר.',
  },
];

/* ── Conversion tracking ────────────────────────────────────────────────── */

/**
 * Fill in to activate. Empty = the tag is not loaded at all (no requests,
 * no cookies). Events fired by the site: whatsapp_click, phone_click,
 * quote_form_submit, service_click, before_after_interaction.
 */
export const analytics = {
  /** GA4 measurement ID, e.g. 'G-XXXXXXXXXX'. */
  ga4MeasurementId: '',
  /** Google Ads conversion ID, e.g. 'AW-XXXXXXXXX'. */
  googleAdsId: '',
  /** Google Ads conversion labels per action, e.g. { whatsapp: 'AbCdEfGh' }. */
  googleAdsConversionLabels: {
    whatsapp_click: '',
    phone_click: '',
    quote_form_submit: '',
  },
  /** Meta Pixel ID, e.g. '1234567890'. */
  metaPixelId: '',
};

/* ── Lead capture ───────────────────────────────────────────────────────── */

/**
 * The quick-quote form always hands the lead to WhatsApp. If this URL is set
 * it ALSO posts the lead as JSON ({ name, phone, city, service, page }) to it
 * first — a Zapier/Make hook, Google Sheets script, or the CRM in this repo.
 */
export const leads = {
  webhookUrl: '',
};

/* ── Navigation ─────────────────────────────────────────────────────────── */

export const nav = [
  { href: '#services', label: 'שירותים' },
  { href: '#prices', label: 'מחירון' },
  { href: '#before-after', label: 'לפני ואחרי' },
  { href: '#reviews', label: 'ביקורות' },
  { href: '#faq', label: 'שאלות ותשובות' },
  { href: '#contact', label: 'צור קשר' },
] as const;
