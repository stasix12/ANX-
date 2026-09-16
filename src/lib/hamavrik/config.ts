/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  הפתרון המבריק – THE ONE FILE TO EDIT
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
 * The cleaning site can be built two ways from this one repository:
 *
 *  - Alongside the ANX3D store, at `/sofa-cleaning` on the store's domain
 *    (the default – nothing to set).
 *  - As its own site at the root of its own domain, e.g. https://hamavrik.co.il
 *    – `npm run build:hamavrik`, which sets NEXT_PUBLIC_HAMAVRIK_STANDALONE=1
 *    and assembles only the cleaning pages into dist-hamavrik/. Every link,
 *    canonical, sitemap entry and JSON-LD URL then drops the `/sofa-cleaning`
 *    prefix, and the sitemap/robots/manifest describe this site alone.
 */
export const STANDALONE = process.env.NEXT_PUBLIC_HAMAVRIK_STANDALONE === '1';

/** URL prefix the site lives under: '' on its own domain, `/sofa-cleaning` next to the store. */
export const SITE_BASE = STANDALONE ? '' : '/sofa-cleaning';

/** Absolute origin used for canonical URLs, Open Graph and the sitemap. */
export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://anx3d.co.il';

/* ── Business ───────────────────────────────────────────────────────────── */

export const business = {
  name: 'הפתרון המבריק',
  /** Two-word wordmark, colored separately in the logo. */
  wordmark: ['הפתרון', 'המבריק'] as const,
  tagline: 'ניקוי ספות מקצועי בבית הלקוח',
  description:
    'ניקוי ספות, מזרנים, כורסאות, כיסאות, שטיחים וריפודי רכב בבית הלקוח – ציוד מקצועי, טיפול בכתמים וריחות, ניקוי עמוק ותוצאות שרואים. שירות בבאר שבע, ערד ודרום הארץ.',

  /** Display form, used in visible text. */
  phoneDisplay: '053-5257250',
  /** E.164 form for tel: links and schema.org. */
  phoneE164: '+972535257250',
  /** International form (no plus, no dashes) for wa.me links. */
  whatsappNumber: '972535257250',
  /**
   * Every prepared WhatsApp message is built from these two lines:
   *   <opener> אשמח למחיר ל<מה> – <photoLine>
   * No source tags ("(from the hero)") ever reach the customer's chat —
   * which button converted is recorded in analytics, not in their WhatsApp.
   * The message always ends by inviting the photo the price depends on.
   */
  whatsappOpener: 'היי, הגעתי דרך האתר.',
  whatsappPhotoLine: 'הנה תמונה:',

  /**
   * Opening hours for the LocalBusiness schema, in schema.org format
   * (e.g. ['Su-Th 08:00-20:00', 'Fr 08:00-14:00']). Leave empty until the
   * business confirms – nothing is shown or declared while empty.
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

/**
 * The three places where the visitor has seen something specific before
 * tapping, so the message can say so. Everything else uses `waAsk()` in
 * links.ts – one sentence, no tags, ending with the photo invitation.
 */
export const whatsappMessages = {
  video: 'היי, ראיתי את הסרטון באתר. אשמח למחיר לניקוי – הנה תמונה:',
  prices: 'היי, ראיתי את המחירון באתר. אשמח למחיר מדויק – הנה תמונה:',
  areas: 'היי, אני מ-____ – אתם מגיעים אליי? אשמח גם למחיר לניקוי ספה, הנה תמונה:',
} as const;

/* ── Service areas ──────────────────────────────────────────────────────── */

export const serviceAreas = {
  /** The headline areas – shown big. */
  primary: ['באר שבע', 'ערד'],
  /**
   * Nearby towns listed under "והסביבה". Edit freely – the section says
   * "not sure we reach you? send a message", so a town on this list is an
   * invitation, not a promise of same-day arrival.
   */
  nearby: ['עומר', 'להבים', 'מיתר', 'דימונה', 'ירוחם', 'אופקים', 'נתיבות', 'רהט', 'כסייפה'],
  regionLabel: 'דרום הארץ',
  note: 'לא בטוחים שאנחנו מגיעים אליכם? שלחו הודעה עם שם היישוב ונגיד לכם.',
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
  /**
   * Singular noun for the prepared WhatsApp message:
   * "אשמח למחיר ל<waNoun> – הנה תמונה:". Written out rather than derived
   * from `name`, so a plural title never turns into broken Hebrew.
   */
  waNoun: string;
  /**
   * How this service appears as a line in the quick-quote WhatsApp message,
   * e.g. "🛋️ ספה 3 מושבים" or "🪑 6 כיסאות". `one`/`many` are the singular and
   * plural nouns (Hebrew cannot be pluralised by rule); `variants`, when set,
   * is a size the customer must pick (seats, mattress size) and is appended
   * to the noun.
   */
  quote: { emoji: string; one: string; many: string; variants?: readonly string[] };
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
    waNoun: 'ניקוי ספה',
    quote: { emoji: '🛋️', one: 'ספה', many: 'ספות', variants: ['2 מושבים', '3 מושבים', '4 מושבים', 'פינתית'] },
    short: 'ספות בד, פינתיות ומערכות ישיבה – ניקוי עמוק בבית הלקוח.',
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
    waNoun: 'ניקוי מזרן',
    quote: { emoji: '🛏️', one: 'מזרן', many: 'מזרנים', variants: ['יחיד', 'זוגי'] },
    short: 'הסרת כתמים, קרדית האבק ולכלוך עמוק – לשינה נקייה יותר.',
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
    waNoun: 'ניקוי כורסה',
    quote: { emoji: '💺', one: 'כורסה', many: 'כורסאות' },
    short: 'כורסאות, ריקליינרים וכורסאות הנקה – מנקים במקום, לפי סוג הבד.',
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
    waNoun: 'ניקוי כיסאות פינת האוכל',
    quote: { emoji: '🪑', one: 'כיסא', many: 'כיסאות' },
    short: 'כתמי אוכל ושומן מכל הסט – בביקור אחד.',
    description:
      'כיסאות פינת אוכל סופגים כתמי אוכל ושומן יום אחרי יום. ניקוי מקצועי מוציא את הלכלוך מתוך הריפוד ומחזיר את הצבע המקורי – לכל סט הכיסאות בביקור אחד.',
    scene: 'chair',
    image: null,
    priceFrom: null,
    featured: true,
  },
  {
    id: 'car',
    label: 'רכב',
    name: 'ניקוי ריפודי רכב',
    waNoun: 'ניקוי ריפודי הרכב',
    quote: { emoji: '🚗', one: 'ריפודי רכב', many: 'רכבים' },
    short: 'מושבים, ריפודי דלתות ושטיחונים – ניקוי עמוק במקום שנוח לכם.',
    description:
      'ניקוי מושבי הרכב, ריפודי הדלתות, התקרה והשטיחונים בציוד מקצועי. מסירים כתמי קפה, אוכל, ריחות עשן וסימני שימוש.',
    scene: 'car',
    image: null,
    priceFrom: 299,
    featured: true,
  },
  {
    id: 'carpet',
    label: 'שטיח',
    name: 'ניקוי שטיחים',
    waNoun: 'ניקוי שטיח',
    quote: { emoji: '🧹', one: 'שטיח', many: 'שטיחים' },
    short: 'שטיחים מכל הסוגים, בבית הלקוח וללא הובלה.',
    description:
      'ניקוי עמוק לשטיחים מבד, צמר וסיבים סינתטיים – הסרת כתמים, אבק ולכלוך שהצטבר בעומק הסיבים. הכול מתבצע אצלכם בבית, בלי לגלגל ולהוביל את השטיח לשום מקום.',
    scene: 'carpet',
    image: null,
    priceFrom: null,
    featured: true,
  },
  {
    id: 'wall-to-wall',
    label: 'שטיח מקיר לקיר',
    name: 'ניקוי שטיחים מקיר לקיר',
    waNoun: 'ניקוי שטיח מקיר לקיר',
    quote: { emoji: '🧹', one: 'שטיח מקיר לקיר', many: 'שטיחים מקיר לקיר' },
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
    waNoun: 'ניקוי עגלה או כיסא ילדים',
    quote: { emoji: '🍼', one: 'עגלה או כיסא ילדים', many: 'עגלות וכיסאות ילדים' },
    short: 'עגלות, כיסאות אוכל לתינוק וכיסאות בטיחות – ניקוי עדין ויסודי.',
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

/** What every price includes – the "מה כלול" card next to the price list. */
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
  'המחיר הסופי תלוי בגודל, בסוג הבד ובכתמים. שלחו תמונה ונסגור מחיר מדויק לפני ההגעה.';

/**
 * The ONE way a price is written on this site: digits, a non-breaking space,
 * then ₪ – "299 ₪". Without the space the bidi algorithm moves the sign to
 * the wrong side of the number and the most-read detail on the page ("החל
 * מ-299 ₪") renders as "החל מ-₪299", which reads like a bug. Render it
 * inside <bdi dir="rtl"> so surrounding text can never flip it again – a bare
 * <bdi> is dir="auto", finds no strong character in "299 ₪", falls back to LTR
 * and puts the sign back on the wrong side, which is the bug we are fixing.
 */
export function priceText(amount: number): string {
  return `${amount}\u00A0₪`;
}

/**
 * Which price-list row a quick-quote selection points at. The form and the
 * `#prices` table therefore quote the same number by construction – two
 * hand-maintained lists would drift apart within a month.
 */
export function quotePriceRow(service: ServiceId, variant?: string): PriceRow | null {
  const label =
    service === 'sofa' && variant === 'פינתית'
      ? 'ניקוי ספה פינתית'
      : ({
          sofa: 'ניקוי ספה',
          mattress: 'ניקוי מזרן',
          car: 'ניקוי ריפודי רכב',
          armchair: 'ניקוי כורסה',
          chairs: 'ניקוי כיסאות אוכל',
          carpet: 'ניקוי שטיחים',
        } as Partial<Record<ServiceId, string>>)[service];
  return priceList.find((row) => row.label === label) ?? null;
}

/* ── Air-conditioner cleaning (its own offer, apart from upholstery) ─── */

/**
 * Air conditioners are not upholstery: they get their own band low on the
 * page, their own WhatsApp message and their own price, and stay out of the
 * sofa quote form, the upholstery grid and the "#prices" table on purpose.
 *
 * The one price the owner gave is per unit from `bulkMin` units up. Below
 * that there is no published price – the section says so and sends the
 * customer to WhatsApp rather than inventing a number.
 */
export const acCleaning = {
  name: 'ניקוי מזגנים',
  emoji: '❄️',
  /** Singular / plural for the WhatsApp line: "מזגן אחד", "3 מזגנים". */
  one: 'מזגן',
  many: 'מזגנים',
  /** ₪ per unit, from `bulkMin` units and up. */
  bulkFrom: 199,
  bulkMin: 3,
  maxQty: 10,
  lede: 'גם המזגנים בבית מגיעים אלינו – ומחיר משתלם במיוחד כשמנקים כמה מזגנים באותו ביקור.',
} as const;

/* ── Before / after gallery (REAL JOBS GO HERE) ─────────────────────── */

/**
 * One entry per job. Until `beforeImage`/`afterImage` point at real photos
 * the card draws the illustration named in `scene` and wears a small
 * "איור להמחשה" tag – never an invented "real" job. To publish a real job:
 *   1. drop the two photos in /public/hamavrik/jobs/ – SAME aspect ratio and
 *      SAME crop for both (the slider overlays one on the other; 1200×750 is
 *      ideal, WebP or JPG – next/image serves AVIF/WebP responsively),
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
  /** What was treated – "ניקוי עמוק והסרת כתמים". */
  problem: string;
  /** Illustration used while the photos are null. */
  scene: SceneKind;
  beforeImage: string | null;
  afterImage: string | null;
}

/** How many before/after jobs the home page shows (the rest live in /gallery). */
export const HOME_JOBS = 4;

export const beforeAfterJobs: BeforeAfterJob[] = [
  // First on purpose: the corner sofa is the most-asked-about item and the
  // strongest pair – the cleaning wand is still on the seat in the before.
  {
    id: 'sofa-corner-1',
    service: 'sofa',
    itemLabel: 'ספה פינתית',
    city: 'באר שבע',
    problem: 'ניקוי עמוק – הבד האפור חזר לצבע האחיד שלו',
    scene: 'sofa',
    beforeImage: '/hamavrik/jobs/sofa-corner-wide-before.jpg',
    afterImage: '/hamavrik/jobs/sofa-corner-wide-after.jpg',
  },
  {
    id: 'sofa-1',
    service: 'sofa',
    itemLabel: 'ספת בד תלת-מושבית',
    city: 'באר שבע',
    problem: 'ניקוי עמוק – הלכלוך שנספג בבד יצא, הצבע חזר',
    scene: 'sofa',
    // Real job photos, same sofa, same room, before and after.
    beforeImage: '/hamavrik/jobs/sofa-grey-before.jpg',
    afterImage: '/hamavrik/jobs/sofa-grey-after.jpg',
  },
  {
    id: 'mattress-1',
    service: 'mattress',
    itemLabel: 'מזרן יחיד',
    city: 'באר שבע',
    problem: 'ניקוי עמוק – הכתם שנספג לתוך המזרן יצא לגמרי',
    scene: 'mattress',
    beforeImage: '/hamavrik/jobs/mattress-single-before.jpg',
    afterImage: '/hamavrik/jobs/mattress-single-after.jpg',
  },
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

/* ── Featured video (REAL FOOTAGE) ──────────────────────────────────────── */

export interface FeaturedVideo {
  mp4: string;
  webm: string | null;
  poster: string;
  /** CSS aspect ratio of the file: '9/16' (portrait) or '4/3' (landscape). The card adapts. */
  aspect: '9/16' | '4/3';
  eyebrow: string;
  title: string;
  itemLabel: string;
  city: string | null;
  problem: string;
  description: string;
  points: string[];
  service: ServiceId;
  /** ISO date the footage was shot/published (for the VideoObject schema). */
  date: string;
  /** Length in seconds (for the schema). */
  seconds: number;
}

const armchairsCopy = {
  eyebrow: 'מהשטח',
  title: 'ככה אנחנו עובדים.',
  itemLabel: 'כורסאות בד',
  city: null,
  problem: 'ניקוי עמוק בהזרקה-יניקה',
  description: 'שואבים, מזריקים תמיסה בלחץ ושואבים בחזרה – עד שהמים שיוצאים נקיים.',
  points: ['ציוד מקצועי, לא מכשיר ביתי', 'הכול מתבצע אצלכם בבית', 'הריפוד מתייבש תוך מספר שעות'],
  service: 'armchair' as ServiceId,
  date: '2026-09-11',
  seconds: 33,
};

/** The technician's clip as shot – portrait, full quality, no fill. */
export const featuredVideoPortrait: FeaturedVideo = {
  mp4: '/hamavrik/video/process-armchairs-portrait.mp4',
  webm: null,
  poster: '/hamavrik/video/process-armchairs-portrait-poster.jpg',
  aspect: '9/16',
  ...armchairsCopy,
};

/** The same clip inside a 4:3 frame with a blurred fill on both sides. */
export const featuredVideoWide: FeaturedVideo = {
  mp4: '/hamavrik/video/process-armchairs.mp4',
  webm: null,
  poster: '/hamavrik/video/process-armchairs-poster.jpg',
  aspect: '4/3',
  ...armchairsCopy,
};

/**
 * The one clip that does the selling, shown at the top of the before/after
 * section on the home page, on sofa landing pages and in the gallery.
 * Pick `featuredVideoPortrait` or `featuredVideoWide` (or null to hide).
 * To add a new clip: drop MP4 + poster under /public/hamavrik/video/ and
 * describe it like the two above. Nothing here is invented – fill `city`
 * when known.
 */
export const featuredVideo: FeaturedVideo | null = featuredVideoPortrait;

/**
 * THE 15–25s "before → process → after" CLIP GOES HERE.
 *
 * While this is null NOTHING is rendered – no section, no heading, no
 * "coming soon" frame. An empty box that announces something that does not
 * exist is what made a real visitor ask "wait, is this a new business?" about
 * the reviews section; we are not repeating it for the video.
 *
 * To publish: drop the MP4 + a poster frame under /public/hamavrik/video/ and
 * describe the clip here exactly like the two above. Hard requirements so the
 * page stays fast: ≤1MB, H.264 with the moov atom at the front, a real poster.
 * It then replaces the current clip at the top of the page.
 */
export const processVideo: FeaturedVideo | null = null;

/* ── Work gallery (REAL PHOTOS GO HERE) ─────────────────────────────────── */

/**
 * Plain photos from jobs (the dirty water, the wand on the fabric, a finished
 * living room). The section is hidden while this list is empty – nothing
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
 * upholstery – muted, looping, with a poster so the page paints before a
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

/**
 * Four claims, each one backed by an answer in the FAQ below – and each one
 * said exactly once on the page (the trust strip, "why us" and the steps used
 * to repeat the same four promises three times over).
 */
export const trustPoints = [
  { icon: 'home', title: 'מגיעים אליכם', desc: 'עם כל הציוד. לא מובילים כלום' },
  { icon: 'machine', title: 'מכונה, לא מטלית', desc: 'מזריקה תמיסה ושואבת אותה מתוך הבד' },
  { icon: 'droplet', title: 'מתייבש תוך מספר שעות', desc: 'לח ולא רטוב. מאוורר או מזגן מקצרים את הזמן' },
  { icon: 'camera', title: 'מחיר לפי תמונה', desc: 'מקבלים מחיר ב‑WhatsApp לפני ההגעה' },
] as const;

/* ── Google reviews (REAL REVIEWS GO HERE) ──────────────────────────────── */

/**
 * Real Google reviews only. While this list is empty the reviews section
 * shows a clean "reviews coming soon" state with the link to the Google
 * profile – never an invented quote. Copy each review verbatim from Google
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
  { icon: 'camera', title: 'שולחים תמונה', desc: 'מצלמים את הספה ושולחים ב‑WhatsApp.' },
  { icon: 'tag', title: 'מקבלים מחיר מראש', desc: 'הצעה ברורה לפי גודל ומצב – בלי הפתעות.' },
  { icon: 'calendar', title: 'קובעים מועד', desc: 'יום ושעה שנוחים לכם.' },
  { icon: 'home', title: 'מגיעים עד הבית', desc: 'עם כל הציוד. אתם רק מפנים גישה לספה.' },
] as const;

/* ── Why us ─────────────────────────────────────────────────────────────── */

/**
 * Four things that are true here and are NOT repeated anywhere else on the
 * page. Nothing here is a number, a rating or a guarantee – say only what the
 * business has actually confirmed.
 *
 * OWNER: this is the slot for "מי אנחנו" – a first name, one first-person
 * sentence and one photo from a phone. That single block is worth more than
 * every other change on this page; it is left out until you send them.
 */
export const whyUs = [
  {
    icon: 'droplet',
    title: 'אומרים מראש מה יירד ומה לא',
    desc: 'כתמי דיו, צבע או אקונומיקה משנים את צבע הסיב עצמו. מסתכלים על התמונה ואומרים בכנות מה ריאלי – לפני שמגיעים.',
  },
  {
    icon: 'home',
    title: 'אתם כמעט לא מכינים כלום',
    desc: 'מורידים כריות נוי ומפנים גישה. אנחנו צריכים רק נקודת חשמל וגישה למים.',
  },
  {
    icon: 'sparkle',
    title: 'רואים את זה בעיניים',
    desc: 'המים שנשאבים מהריפוד יוצאים חומים-אפורים. זה הלכלוך שהיה בפנים, לא על פני השטח.',
  },
  {
    icon: 'chat',
    title: 'בלי הפתעות בסוף',
    desc: 'אם בשטח המצב שונה ממה שראינו בתמונה – אומרים לכם לפני שמתחילים, לא אחרי.',
  },
] as const;

/* ── FAQ ────────────────────────────────────────────────────────────────── */

/**
 * Order matters: the two questions people actually arrive with – what does it
 * cost, and will MY stain come out – come first. They are also the two
 * answers that close deals, and they are honest, which is the point.
 *
 * OWNER: three questions are still missing because only you know the answers —
 * what happens if a stain does not come out, exactly which cleaning agents are
 * used, and how soon you can usually arrive. Send them and they go in here.
 */
export const faq = [
  {
    q: 'כמה עולה ניקוי ספה?',
    a: `ניקוי ספה תלת-מושבית מתחיל ב-${priceText(299)} וספה פינתית ב-${priceText(350)}. המחיר הסופי נקבע לפי גודל הפריט, סוג הבד ומצב הכתמים. שולחים תמונה ב‑WhatsApp למספר 053-5257250 ומקבלים מחיר שנסגר מראש, לפני שאנחנו מגיעים.`,
  },
  {
    q: 'האם הכתם שלי ירד?',
    a: 'את רוב הכתמים – כן: אוכל, שתייה, זיעה, לכלוך יומיומי וריחות. כתמי דיו, צבע או אקונומיקה משנים את צבע הסיב עצמו ולא תמיד יורדים לגמרי. אנחנו בודקים את התמונה ואומרים לכם בכנות מה ריאלי לפני שהגענו.',
  },
  {
    q: 'כמה זמן לוקח לספה להתייבש?',
    a: 'ברוב המקרים בין 3 ל-6 שעות. השאיבה החזקה מוציאה את רוב הלחות כבר במהלך הניקוי, כך שהריפוד נשאר לח ולא רטוב. חלון פתוח, מאוורר או מזגן מקצרים את הזמן. מומלץ לא לשבת על הספה עד שהיא יבשה לגמרי.',
  },
  {
    q: 'כמה זמן לוקח הניקוי עצמו?',
    a: 'ספה תלת-מושבית סטנדרטית לוקחת בדרך כלל בין 45 דקות לשעה וחצי, בהתאם לגודל, לסוג הבד ולכמות הכתמים. ספה פינתית או מערכת ישיבה גדולה יכולה לקחת יותר – אנחנו אומרים לכם מראש כמה זמן להקצות.',
  },
  {
    // Restored: the first thing a parent asks before letting a technician in.
    // Describes the METHOD only. The claim about which cleaning agents are
    // used is the owner's to make – do not write it here until he does.
    q: 'אפשר לנקות כשיש ילדים או בעלי חיים בבית?',
    a: 'כן. שיטת ההזרקה-יניקה שואבת את תמיסת הניקוי בחזרה מתוך הריפוד בסיום, כך שלא נשארות שאריות חומר בבד. מומלץ להמתין עד שהריפוד יבש לגמרי – בדרך כלל 3 עד 6 שעות – לפני שחוזרים לשבת עליו, ולאוורר את החדר בינתיים.',
  },
  {
    q: 'צריך להכין משהו לפני שאתם מגיעים?',
    a: 'כמעט כלום: להוריד מהספה כריות נוי, שמיכות וחפצים אישיים ולפנות גישה נוחה אליה. אנחנו צריכים רק נקודת חשמל וגישה למים.',
  },
  {
    q: 'אתם מגיעים לבית הלקוח?',
    a: 'כן, תמיד. כל הניקוי מתבצע אצלכם בבית (או ליד הרכב). אנחנו מגיעים עם כל הציוד והחומרים ולא צריך להוביל שום דבר.',
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
    body: 'שואב אבק ביתי מוציא רק את האבק העליון, ומטלית עם חומר ניקוי בעיקר מורחת את הכתם ומשאירה שאריות חומר בבד. הלכלוך שבאמת מעניין – זיעה, שומן מהעור, פירורים, קרדית האבק – יושב עמוק בתוך המילוי והסיבים. בלי שאיבה חזקה שמושכת אותו החוצה, הוא פשוט נשאר.',
  },
  {
    title: 'איך עובדת שיטת ההזרקה-יניקה?',
    body: 'המכונה מזריקה לתוך הריפוד תמיסת ניקוי בלחץ מבוקר שמפרקת את הלכלוך בתוך הסיבים, וראש השאיבה שואב אותה מיד בחזרה עם כל מה שהיא הפרידה מהבד. רואים את זה בעיניים: המים שנשאבים יוצאים חומים-אפורים. לפני כן מבצעים שאיבה יבשה וטיפול מקדים בכתמים, ואחרי כן שאיבה נוספת לייבוש.',
  },
  {
    title: 'באיזו תדירות מומלץ לנקות ספה?',
    body: 'לבית ממוצע – פעם בשנה עד שנה וחצי. עם ילדים קטנים, בעלי חיים או אלרגיות, מומלץ פעם בחצי שנה עד שנה. ניקוי סדיר שומר על הבד, מונע הצטברות של ריחות וקרדית האבק ומאריך את חיי הספה הרבה מעבר לעלות הניקוי.',
  },
] as const;

/* ── SEO landing pages ──────────────────────────────────────────────────── */

/**
 * Each entry becomes a static page at `${SITE_BASE}/${slug}`, with its own
 * title, H1, meta description, JSON-LD and breadcrumbs. To add a page
 * ("ניקוי מזרנים בדימונה"), add an object here – nothing else to touch.
 */
export interface LandingPage {
  slug: string;
  service: ServiceId;
  city: string;
  /** <title> (without the brand suffix). */
  title: string;
  h1: string;
  /** Meta description only – never shown on the page (it used to be, and it
   *  opened the ad's landing page with four lines repeating the H1). */
  description: string;
  /** One or two lines under the H1, written for this page. Keep it short:
   *  it sits above the price pill on a phone. */
  heroSubtitle: string;
  /** Kept for the JSON-LD service description. */
  intro: string;
  /**
   * A block of copy unique to this page, rendered under the quote form.
   * This is what stops a city page from being a near-duplicate of the home
   * page – write it about the place, not about the service.
   */
  localBlock?: { title: string; body: string };
  /** Replaces the shared FAQ entries whose question matches, so a mattress
   *  page never asks "how long does a SOFA take to dry". */
  faqOverrides?: { q: string; a: string; replaces: string }[];
}

export const landingPages: LandingPage[] = [
  {
    slug: 'beer-sheva',
    service: 'sofa',
    city: 'באר שבע',
    title: 'ניקוי ספות בבאר שבע – החל מ-299 ₪, בבית הלקוח',
    h1: 'ניקוי ספות בבאר שבע',
    description:
      'ניקוי ספות מקצועי בבאר שבע בבית הלקוח: ציוד מתקדם, טיפול בכתמים וריחות, ניקוי עמוק וייבוש מהיר. החל מ-299 ₪. שלחו תמונה ב‑WhatsApp וקבלו הצעת מחיר.',
    heroSubtitle: 'מגיעים לכל שכונות באר שבע – מרמות ועד העיר העתיקה – עם כל הציוד. שולחים תמונה, מקבלים מחיר.',
    intro:
      'מגיעים לכל שכונות באר שבע עם הציוד המקצועי המלא – רמות, נווה זאב, נאות לון, הכלניות, שכונה ד׳ ועד לעיר העתיקה. שולחים תמונה של הספה, מקבלים מחיר, ואנחנו אצלכם.',
    localBlock: {
      title: 'מגיעים לכל באר שבע',
      body: 'רמות, נווה זאב, נאות לון, הכלניות, שכונה ד׳, נווה נוי, ועד העיר העתיקה. מגיעים עם כל הציוד עד הדלת – אין צורך להוביל שום דבר, ואין צורך לפנות את הסלון.',
    },
  },
  {
    slug: 'arad',
    service: 'sofa',
    city: 'ערד',
    title: 'ניקוי ספות בערד – שירות מקצועי בבית הלקוח',
    h1: 'ניקוי ספות בערד',
    description:
      'ניקוי ספות בערד בבית הלקוח: ניקוי עמוק בשיטת הזרקה-יניקה, טיפול בכתמים וריחות, ייבוש מהיר. הצעת מחיר ב‑WhatsApp, בשעות הפעילות.',
    heroSubtitle: 'מגיעים לערד עם כל הציוד ומנקים אצלכם בבית. שולחים תמונה, מקבלים מחיר, קובעים יום.',
    intro:
      'שירות ניקוי ספות מקצועי בערד ובסביבה, ללא צורך להוביל שום דבר. מגיעים אליכם הביתה עם כל הציוד ומחזירים לספה את המראה הנקי.',
  },
  {
    slug: 'mattress-cleaning-beer-sheva',
    service: 'mattress',
    city: 'באר שבע',
    title: 'ניקוי מזרנים בבאר שבע – החל מ-279 ₪',
    h1: 'ניקוי מזרנים בבאר שבע',
    description:
      'ניקוי מזרנים מקצועי בבאר שבע בבית הלקוח: הסרת כתמים, קרדית האבק וריחות. החל מ-279 ₪. שלחו תמונה וקבלו הצעת מחיר ב‑WhatsApp.',
    heroSubtitle: 'כתמי זיעה, ריחות ואבק שמצטברים בתוך המזרן. מנקים אצלכם בבית, והמזרן מתייבש תוך מספר שעות.',
    faqOverrides: [
      {
        replaces: 'כמה עולה ניקוי ספה?',
        q: 'כמה עולה ניקוי מזרן?',
        a: `ניקוי מזרן זוגי מתחיל ב-${priceText(279)} לצד אחד. המחיר הסופי נקבע לפי גודל המזרן ומצב הכתמים. שולחים תמונה ב‑WhatsApp למספר 053-5257250 ומקבלים מחיר שנסגר מראש, לפני שאנחנו מגיעים.`,
      },
    ],
    intro:
      'מזרן נקי הוא שינה בריאה יותר. מנקים מזרנים בכל גודל בבאר שבע – הסרת כתמי זיעה ונוזלים, טיפול בריחות והוצאת אבק מצטבר, עם ייבוש מהיר באותו יום.',
  },
  {
    slug: 'car-upholstery-beer-sheva',
    service: 'car',
    city: 'באר שבע',
    title: 'ניקוי ריפודי רכב בבאר שבע – החל מ-299 ₪',
    h1: 'ניקוי ריפודי רכב בבאר שבע',
    description:
      'ניקוי ריפודי רכב בבאר שבע: מושבים, ריפודי דלתות ושטיחונים בניקוי עמוק. מגיעים אליכם. החל מ-299 ₪. הצעת מחיר ב‑WhatsApp.',
    heroSubtitle: 'מושבים סופגים הכול – קפה, אוכל, ריח עשן. מנקים איפה שנוח לכם: בבית, בעבודה או בחניון.',
    faqOverrides: [
      {
        replaces: 'כמה עולה ניקוי ספה?',
        q: 'כמה עולה ניקוי ריפודי רכב?',
        a: `ניקוי ריפודי רכב מתחיל ב-${priceText(299)} למושבים הקדמיים והאחוריים. המחיר הסופי נקבע לפי גודל הרכב ומצב הריפוד. שולחים תמונה ב‑WhatsApp למספר 053-5257250 ומקבלים מחיר שנסגר מראש.`,
      },
    ],
    intro:
      'הרכב מלווה אתכם כל יום – ומושבים סופגים הכול. מנקים ריפודי רכב בבאר שבע במקום שנוח לכם: בבית, בעבודה או בחניון.',
  },
  {
    slug: 'carpet-cleaning-beer-sheva',
    service: 'carpet',
    city: 'באר שבע',
    title: 'ניקוי שטיחים בבאר שבע – בבית הלקוח, ללא הובלה',
    h1: 'ניקוי שטיחים בבאר שבע',
    description:
      'ניקוי שטיחים מקצועי בבאר שבע בבית הלקוח: שטיחי סלון, שטיחים מקיר לקיר ושטיחי צמר. ניקוי עמוק, הסרת כתמים וייבוש מהיר. הצעת מחיר ב‑WhatsApp.',
    heroSubtitle: 'לא צריך לגלגל את השטיח ולחכות שבועיים. מנקים אצלכם בבית – סלון, חדרי ילדים ומקיר לקיר.',
    faqOverrides: [
      {
        replaces: 'כמה עולה ניקוי ספה?',
        q: 'כמה עולה ניקוי שטיח?',
        a: 'מחיר ניקוי שטיח נקבע לפי גודל השטיח וסוג הסיבים, ולכן אין לו מחיר פתיחה אחיד. שולחים תמונה ב‑WhatsApp למספר 053-5257250 עם מידות משוערות, ומקבלים מחיר שנסגר מראש לפני שאנחנו מגיעים.',
      },
    ],
    intro:
      'לא צריך לגלגל את השטיח ולחכות שבועיים. מנקים שטיחים בבאר שבע אצלכם בבית – שטיחי סלון, חדרי ילדים ושטיחים מקיר לקיר.',
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
 * it ALSO posts the lead as JSON ({ items: [{ service, label, qty, variant }], city, page }) to it
 * first – a Zapier/Make hook, Google Sheets script, or the CRM in this repo.
 */
export const leads = {
  webhookUrl: '',
};

/* ── Navigation ─────────────────────────────────────────────────────────── */

/**
 * In page order, so the menu is a map of the page rather than a list of
 * whatever existed first. "ביקורות" is not here while there are none, and
 * "לפני ואחרי" is not here while the only real proof is the video.
 */
export const nav = [
  { href: '#prices', label: 'מחירון' },
  { href: '#quote', label: 'הצעת מחיר' },
  { href: '#services', label: 'שירותים' },
  { href: '#faq', label: 'שאלות ותשובות' },
  { href: '#areas', label: 'אזורי שירות' },
  { href: '#air-conditioners', label: 'מזגנים' },
] as const;
