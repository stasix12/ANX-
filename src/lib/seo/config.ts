/**
 * The SEO system's single source of truth.
 *
 * Everything the content engine is allowed to state as fact lives here. The
 * generator is handed THIS OBJECT and nothing else — it has no other channel
 * through which a price, a service or a city could reach a published page. If
 * a fact is not in this file, no article can claim it.
 *
 * The spec's hard rules are enforced structurally rather than by asking the
 * model nicely:
 *   - Only the four cities below exist. The database rejects any other value.
 *   - Prices come from `pricing`, which the business owner supplied directly.
 *     The generator is told to quote them as "starting from" and never to
 *     invent a figure for a service with no listed price.
 *   - There are no review quotes, no customer counts and no success rates
 *     anywhere in this file, because the business has not supplied any.
 */

/** Languages the system writes in. Hebrew is RTL, Russian is LTR. */
export const LANGS = ['he', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_META: Record<Lang, { dir: 'rtl' | 'ltr'; label: string; htmlLang: string }> = {
  he: { dir: 'rtl', label: 'עברית', htmlLang: 'he-IL' },
  ru: { dir: 'ltr', label: 'רוסית', htmlLang: 'ru-IL' },
};

/**
 * The service area — the whole of it. The business serves southern Israel, and
 * the spec is explicit that content must never imply service anywhere else, so
 * this list is also a CHECK constraint in seo-schema.sql.
 *
 * To add a city the business genuinely serves: add it here AND to the two
 * check constraints in supabase/seo-schema.sql.
 */
export const CITIES = [
  {
    slug: 'beer-sheva',
    he: 'באר שבע',
    ru: 'Беэр-Шева',
    /** Used only to vary article angles, never stated as a fact in copy. */
    note: 'העיר הגדולה בדרום, הרבה דירות שכורות ודירות סטודנטים',
  },
  { slug: 'arad', he: 'ערד', ru: 'Арад', note: 'אזור מדברי, אבק ושרב' },
  { slug: 'dimona', he: 'דימונה', ru: 'Димона', note: 'עיר משפחות, הרבה בתים פרטיים' },
  { slug: 'ofakim', he: 'אופקים', ru: 'Офаким', note: 'עיר משפחות צומחת בנגב המערבי' },
] as const;

export type CitySlug = (typeof CITIES)[number]['slug'];

export const CITY_SLUGS = CITIES.map((c) => c.slug) as readonly CitySlug[];

export function cityBySlug(slug: string | null | undefined) {
  return CITIES.find((c) => c.slug === slug) ?? null;
}

/** How the region itself is named, per language. */
export const REGION = {
  he: 'דרום הארץ',
  ru: 'юг Израиля',
} as const;

/**
 * The services, each with the page it should link to. `priceFrom` is null
 * where the business has not published a figure — the generator is instructed
 * to say the price depends on the item and to point at WhatsApp, rather than
 * guess.
 */
export const SERVICES = [
  { key: 'sofa', he: 'ניקוי ספות', ru: 'химчистка диванов', priceFrom: 299, link: '/sofa-cleaning' },
  { key: 'corner-sofa', he: 'ניקוי ספה פינתית', ru: 'химчистка угловых диванов', priceFrom: 350, link: '/sofa-cleaning' },
  { key: 'mattress', he: 'ניקוי מזרנים', ru: 'чистка матрасов', priceFrom: 279, link: '/sofa-cleaning' },
  { key: 'armchair', he: 'ניקוי כורסאות', ru: 'химчистка кресел', priceFrom: null, link: '/sofa-cleaning' },
  { key: 'chairs', he: 'ניקוי כיסאות אוכל', ru: 'чистка стульев', priceFrom: null, link: '/sofa-cleaning' },
  { key: 'carpet', he: 'ניקוי שטיחים', ru: 'чистка ковров', priceFrom: null, link: '/sofa-cleaning' },
  { key: 'car', he: 'ניקוי ריפודי רכב', ru: 'химчистка салона автомобиля', priceFrom: 299, link: '/sofa-cleaning' },
] as const;

export type ServiceKey = (typeof SERVICES)[number]['key'];

/**
 * Prices as the business owner gave them. "From" prices only: the final figure
 * depends on size, fabric and condition, which is stated as a disclaimer on
 * every article that mentions money.
 */
export const pricing = {
  currency: '₪',
  disclaimer: {
    he: 'המחיר הסופי נקבע לפי גודל הפריט, סוג הבד ומצב הריפוד. אפשר לשלוח תמונה בוואטסאפ ולקבל הצעת מחיר מדויקת.',
    ru: 'Окончательная цена зависит от размера, типа ткани и состояния обивки. Отправьте фото в WhatsApp, чтобы получить точную цену.',
  },
} as const;

/**
 * Every internal link target the generator may produce. A link outside this
 * list is stripped by the quality gate, which is what makes "no broken links"
 * a property of the system rather than a hope.
 */
export const LINK_TARGETS = [
  { href: '/sofa-cleaning', he: 'ניקוי ספות מקצועי בבית הלקוח', ru: 'профессиональная химчистка диванов на дому' },
  { href: '/articles', he: 'כל המאמרים', ru: 'все статьи' },
] as const;

/** Weekly output: two subjects, each in both languages. */
export const WEEKLY_TOPICS = 2;

/**
 * Minimum body length the quality gate demands, in words. Below this an
 * article reads as filler, which is the failure mode the spec calls out.
 */
export const MIN_WORDS = 450;

/** The internal quality score an article must reach to enter the approval queue. */
export const QUALITY_PASS = 70;
