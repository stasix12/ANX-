/**
 * Registry for future local-SEO pages such as /website-building-beer-sheva.
 *
 * Both arrays are empty on purpose: the dynamic route in
 * src/app/[slug]/page.tsx builds one static page per entry in `cityPages`,
 * so nothing is generated (and nothing thin is indexed) until real,
 * city-specific copy exists. Adding a city is a data-only change here.
 */

export type ServiceSlug = 'website-building' | 'google-ads';

export type City = {
  /** ASCII slug used in the URL: 'beer-sheva'. */
  slug: string;
  /** 'באר שבע' */
  name: string;
  /** Prepositional form for titles and sentences: 'בבאר שבע'. */
  nameIn: string;
  /** Slugs of nearby cities to cross-link (max 6). */
  nearby?: string[];
};

export type CityPage = {
  city: City['slug'];
  service: ServiceSlug;
  /** Unique intro written for this city (≥120 words). */
  intro: string;
  /** ≥3 concrete, city-specific points. */
  localPoints: string[];
  /** ≥3 Q/A unique to this page. */
  faq: { q: string; a: string }[];
  /** ISO date for the sitemap. */
  lastUpdated: string;
};

export const serviceLabels: Record<ServiceSlug, { title: string; verb: string }> = {
  'website-building': { title: 'בניית אתרים לעסקים', verb: 'בניית אתרים' },
  'google-ads': { title: 'קידום ממומן בגוגל', verb: 'קידום ממומן בגוגל' },
};

export const cities: City[] = [
  // { slug: 'beer-sheva', name: 'באר שבע', nameIn: 'בבאר שבע', nearby: ['arad'] },
];

export const cityPages: CityPage[] = [];

export const cityPagePath = (p: CityPage): string => `/${p.service}-${p.city}`;

/** Build-time guard: refuses thin or duplicate pages instead of publishing them. */
export function validateCityPages(): CityPage[] {
  const seen = new Set<string>();
  for (const page of cityPages) {
    const key = `${page.service}-${page.city}`;
    if (seen.has(key)) throw new Error(`[cities] duplicate page ${key}`);
    seen.add(key);
    if (!cities.some((c) => c.slug === page.city)) {
      throw new Error(`[cities] page ${key} references unknown city "${page.city}"`);
    }
    if (page.intro.trim().split(/\s+/).length < 120) {
      throw new Error(`[cities] ${key}: intro must be at least 120 words`);
    }
    if (page.localPoints.length < 3) throw new Error(`[cities] ${key}: at least 3 localPoints`);
    if (page.faq.length < 3) throw new Error(`[cities] ${key}: at least 3 FAQ items`);
  }
  return cityPages;
}
