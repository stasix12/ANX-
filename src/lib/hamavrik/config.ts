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
    short: 'ספות בד, פינתיות ומערכות ישיבה — ניקוי עמוק בבית הלקוח.',
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
    short: 'הסרת כתמים, קרדית האבק ולכלוך עמוק — לשינה נקייה יותר.',
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
    short: 'רענון והחזרת הצבע לכורסאות, ריקליינרים וכיסאות טלוויזיה.',
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
    short: 'מושבים, ריפודי דלתות ושטיחונים — ניקוי עמוק במקום שנוח לכם.',
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
    short: 'שטיחים מכל הסוגים, בבית הלקוח וללא הובלה.',
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
    short: 'ניקוי כל השטח בשיטת הזרקה-יניקה, כולל אזורי מעבר.',
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

/** What every price includes — the "מה כלול" card next to the price list. */
export const priceIncludes = ['הגעה לבית הלקוח', 'ניקוי עמוק', 'טיפול בכתמים', 'נטרול ריחות', 'שאיבה לייבוש מהיר'];

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

/* ── Before / after gallery (REAL JOBS GO HERE) ─────────────────────── */

/**
 * One entry per job. Until `beforeImage`/`afterImage` point at real photos
 * the card draws the illustration named in `scene` and wears a small
 * "איור להמחשה" tag — never an invented "real" job. To publish a real job:
 *   1. drop the two photos in /public/hamavrik/jobs/ — SAME aspect ratio and
 *      SAME crop for both (the slider overlays one on the other; 1200×750 is
 *      ideal, WebP or JPG — next/image serves AVIF/WebP responsively),
 *   2. fill `beforeImage` and `afterImage` with their paths
 *      (e.g. '/hamavrik/jobs/sofa-1-before.webp'),
 *   3. write the real service / city / problem.
 * The home page shows the first `HOME_JOBS` entries; the gallery page shows
 * them all. The design does not change; only the pixels do.
 */
export interface BeforeAfterJob {
  id: string;
  service: ServiceId;
  /** Shown as "ספת בד | באר שבע". */
  itemLabel: string;
  city: string;
  /** What was treated — "ניקוי עמוק והסרת כתמים". */
  problem: string;
  /** Illustration used while the photos are null. */
  scene: SceneKind;
  beforeImage: string | null;
  afterImage: string | null;
}

/** How many before/after jobs the home page shows (the rest live in /gallery). */
export const HOME_JOBS = 4;

export const beforeAfterJobs: BeforeAfterJob[] = [
  { id: 'sofa-1', service: 'sofa', itemLabel: 'ספת בד', city: 'באר שבע', problem: 'ניקוי עמוק והסרת כתמים', scene: 'sofa', beforeImage: null, afterImage: null },
  { id: 'sofa-2', service: 'sofa', itemLabel: 'ספה פינתית', city: 'ערד', problem: 'נטרול ריחות וניקוי עמוק', scene: 'sofa', beforeImage: null, afterImage: null },
  { id: 'mattress-1', service: 'mattress', itemLabel: 'מזרן זוגי', city: 'באר שבע', problem: 'הסרת כתמים וקרדית האבק', scene: 'mattress', beforeImage: null, afterImage: null },
  { id: 'chairs-1', service: 'chairs', itemLabel: 'כיסאות פינת אוכל', city: 'עומר', problem: 'כתמי אוכל והחזרת צבע', scene: 'chair', beforeImage: null, afterImage: null },
  { id: 'car-1', service: 'car', itemLabel: 'מושבי רכב', city: 'באר שבע', problem: 'כתמי קפה וריחות', scene: 'car', beforeImage: null, afterImage: null },
  { id: 'carpet-1', service: 'carpet', itemLabel: 'שטיח סלון', city: 'באר שבע', problem: 'ניקוי עמוק והסרת אבק', scene: 'carpet', beforeImage: null, afterImage: null },
];

/** Gallery tabs; a job is filed under the tab of its service. */
export type GalleryCategory = 'sofa' | 'mattress' | 'chairs' | 'car' | 'carpet';
export const galleryCategories: { id: GalleryCategory; label: string }[] = [
  { id: 'sofa', label: 'ספות' },
  { id: 'mattress', label: 'מזרנים' },
  { id: 'chairs', label: 'כיסאות' },
  { id: 'car', label: 'רכב' },
  { id: 'carpet', label: 'שטיחים' },
];
export const galleryCategoryOf: Record<ServiceId, GalleryCategory> = {
  sofa: 'sofa',
  armchair: 'sofa',
  mattress: 'mattress',
  chairs: 'chairs',
  stroller: 'chairs',
  car: 'car',
  carpet: 'carpet',
  'wall-to-wall': 'carpet',
};

/* ── Featured before/after video (REAL FOOTAGE) ─────────────────────────── */

/**
 * The one clip that does the selling: the customer's own footage cut into
 * "לפני → אחרי" (files under /public/hamavrik/video/). Shown at the top of
 * the before/after section on the home page and on sofa landing pages.
 * Set to null to hide. Fill `city` once known — nothing is invented.
 */
export const featuredVideo = {
  mp4: '/hamavrik/video/sofa-before-after.mp4',
  webm: null,
  poster: '/hamavrik/video/sofa-before-after-poster.jpg',
  /** Portrait 4:5 — keep new clips at the same ratio so the card doesn't change. */
  aspect: '4/5',
  itemLabel: 'ספת בד',
  city: null as string | null,
  problem: 'ניקוי עמוק והסרת כתמים',
  service: 'sofa' as ServiceId,
} as {
  mp4: string;
  webm: string | null;
  poster: string;
  aspect: string;
  itemLabel: string;
  city: string | null;
  problem: string;
  service: ServiceId;
} | null;

/* ── Work gallery (REAL PHOTOS GO HERE) ─────────────────────────────────── */

/**
 * Plain photos from jobs (the dirty water, the wand on the fabric, a finished
 * living room). The section is hidden while this list is empty — nothing
 * fake is shown in its place. Files: /public/hamavrik/gallery/*.webp.
 */
export interface GalleryPhoto {
  src: string;
  alt: string;
  caption?: string;
}
export const workGallery: GalleryPhoto[] = [];

/* ── Google review screenshots (REAL SCREENSHOTS GO HERE) ────────────────── */

/**
 * Optional screenshots of real Google reviews, shown under the review cards.
 * Files: /public/hamavrik/reviews/*.webp (portrait phone screenshots work
 * best). Hidden while empty.
 */
export const reviewScreenshots: GalleryPhoto[] = [];

/* ── Hero media (REAL HERO PHOTO/VIDEO GOES HERE) ───────────────────────── */

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

/* ── Google reviews (REAL REVIEWS GO HERE) ──────────────────────────────── */

/**
 * Real Google reviews only. While this list is empty the reviews section
 * shows a clean "reviews coming soon" state with the link to the Google
 * profile — never an invented quote. Copy each review verbatim from Google
 * (with the customer's first name and city as shown there).
 */
export interface Review {
  name: string;
  city: string;
  text: string;
  rating: 1 | 2 | 3 | 4 | 5;
  /** ISO date of the review, optional ("2026-03-14"). */
  date?: string;
}

export const reviews: Review[] = [
  // { name: 'דנה', city: 'באר שבע', text: '…', rating: 5, date: '2026-03-14' },
];

/* ── How it works ───────────────────────────────────────────────────────── */

export const steps = [
  { icon: 'camera', title: 'שולחים תמונה', desc: 'מצלמים את הספה ושולחים ב-WhatsApp.' },
  { icon: 'tag', title: 'מקבלים מחיר מראש', desc: 'הצעה ברורה לפי גודל ומצב — בלי הפתעות.' },
  { icon: 'calendar', title: 'קובעים מועד', desc: 'יום ושעה שנוחים לכם.' },
  { icon: 'home', title: 'מגיעים עד הבית', desc: 'עם כל הציוד. אתם לא מכינים כלום.' },
] as const;

/* ── Why us ─────────────────────────────────────────────────────────────── */

export const whyUs = [
  { icon: 'machine', title: 'ציוד מקצועי', desc: 'הזרקה-יניקה בלחץ — לא מכשיר ביתי.' },
  { icon: 'droplet', title: 'טיפול מקצועי בכתמים', desc: 'שיטה וחומרים לפי סוג הבד.' },
  { icon: 'home', title: 'שירות בבית הלקוח', desc: 'לא מובילים שום דבר לשום מקום.' },
  { icon: 'chat', title: 'שירות אישי', desc: 'תיאום ברור והצעת מחיר מראש.' },
] as const;

/* ── FAQ ────────────────────────────────────────────────────────────────── */

export const faq = [
  {
    q: 'כמה זמן לוקח ניקוי ספה?',
    a: 'ספה תלת-מושבית סטנדרטית לוקחת בדרך כלל בין 45 דקות לשעה וחצי, בהתאם לגודל, לסוג הבד ולכמות הכתמים. ספה פינתית או מערכת ישיבה גדולה יכולה לקחת יותר — אנחנו אומרים לכם מראש כמה זמן להקצות.',
  },
  {
    q: 'כמה זמן לוקח לספה להתייבש?',
    a: 'ברוב המקרים בין 3 ל-6 שעות. השאיבה החזקה מוציאה את רוב הלחות כבר במהלך הניקוי, כך שהריפוד נשאר לח ולא רטוב. חלון פתוח, מאוורר או מזגן מקצרים את הזמן. מומלץ לא לשבת על הספה עד שהיא יבשה לגמרי.',
  },
  {
    q: 'האם אפשר להסיר כל כתם?',
    a: 'את רוב הכתמים — כן: אוכל, שתייה, זיעה, לכלוך יומיומי וריחות. כתמי דיו, צבע או אקונומיקה משנים את צבע הסיב עצמו ולא תמיד יורדים לגמרי. אנחנו בודקים את התמונה ואומרים לכם בכנות מה ריאלי לפני שהגענו.',
  },
  {
    q: 'האם אתם מגיעים לבית הלקוח?',
    a: 'כן, תמיד. כל הניקוי מתבצע אצלכם בבית (או ליד הרכב). אנחנו מגיעים עם כל הציוד והחומרים ולא צריך להוביל שום דבר.',
  },
  {
    q: 'האם צריך להכין משהו לפני שמגיעים?',
    a: 'כמעט כלום: להוריד מהספה כריות נוי, שמיכות וחפצים אישיים ולפנות גישה נוחה אליה. אנחנו צריכים רק נקודת חשמל וגישה למים.',
  },
  {
    q: 'איך נקבע המחיר?',
    a: 'לפי גודל הפריט, סוג הבד ומצב הכתמים. ניקוי ספה תלת-מושבית מתחיל ב-299 ₪ וספה פינתית ב-350 ₪. שולחים תמונה ב-WhatsApp למספר 053-5257250, ומקבלים מחיר סופי שנסגר מראש — המחיר שנסגר הוא המחיר שתשלמו.',
  },
] as const;

/* ── Professional explainer (SEO content) ───────────────────────────────── */

export const explainer = [
  {
    title: 'מהו ניקוי ספות מקצועי?',
    body: 'ניקוי ספות מקצועי מנקה את הריפוד לעומק, ולא רק את פני השטח שלו. במקום שפשוף חיצוני, הציוד מזריק תמיסת ניקוי לתוך סיבי הבד ושואב אותה בחזרה יחד עם הלכלוך, האבק, השומן והריחות שהצטברו בפנים במשך שנים. התוצאה היא ספה שנראית, מרגישה ומריחה נקייה באמת.',
  },
  {
    title: 'למה ניקוי ביתי רגיל לא מגיע לעומק הריפוד?',
    body: 'שואב אבק ביתי מוציא רק את האבק העליון, ומטלית עם חומר ניקוי בעיקר מורחת את הכתם ומשאירה שאריות חומר בבד. הלכלוך שבאמת מעניין — זיעה, שומן מהעור, פירורים, קרדית האבק — יושב עמוק בתוך המילוי והסיבים. בלי שאיבה חזקה שמושכת אותו החוצה, הוא פשוט נשאר.',
  },
  {
    title: 'איך עובדת שיטת ההזרקה-יניקה?',
    body: 'המכונה מזריקה לתוך הריפוד תמיסת ניקוי בלחץ מבוקר שמפרקת את הלכלוך בתוך הסיבים, וראש השאיבה שואב אותה מיד בחזרה עם כל מה שהיא הפרידה מהבד. רואים את זה בעיניים: המים שנשאבים יוצאים חומים-אפורים. לפני כן מבצעים שאיבה יבשה וטיפול מקדים בכתמים, ואחרי כן שאיבה נוספת לייבוש.',
  },
  {
    title: 'באיזו תדירות מומלץ לנקות ספה?',
    body: 'לבית ממוצע — פעם בשנה עד שנה וחצי. עם ילדים קטנים, בעלי חיים או אלרגיות, מומלץ פעם בחצי שנה עד שנה. ניקוי סדיר שומר על הבד, מונע הצטברות של ריחות וקרדית האבק ומאריך את חיי הספה הרבה מעבר לעלות הניקוי.',
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
 * quote_started, quote_completed, service_selected, before_after_interaction.
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
    quote_completed: '',
  },
  /** Meta Pixel ID, e.g. '1234567890'. */
  metaPixelId: '',
};

/* ── Lead capture ───────────────────────────────────────────────────────── */

/**
 * The quick-quote form always hands the lead to WhatsApp. If this URL is set
 * it ALSO posts the lead as JSON ({ service, seats, stains, city, page }) to it
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
  { href: '#areas', label: 'אזורי שירות' },
] as const;
