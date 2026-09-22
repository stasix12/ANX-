import { pricing, site } from '@/config/site';
import { seo, services } from '@/content/copy';
import { faq } from '@/content/faq';
import { homeTitle, withBrand } from '@/lib/metadata';

/**
 * JSON-LD builders. Everything comes from config/content; empty values are
 * stripped by `compact()` so no placeholder ever reaches the graph.
 */

type Json = Record<string, unknown>;

function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    const arr = value.map(compact).filter((v) => v !== undefined && v !== null && v !== '');
    return arr as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) {
      const c = compact(v);
      if (c === undefined || c === null || c === '') continue;
      if (Array.isArray(c) && c.length === 0) continue;
      if (typeof c === 'object' && !Array.isArray(c) && Object.keys(c as Json).length === 0) continue;
      out[k] = c;
    }
    return out as T;
  }
  return value;
}

const ids = {
  website: `${site.url}/#website`,
  business: `${site.url}/#business`,
  serviceWebsite: `${site.url}/#service-website`,
  serviceAds: `${site.url}/#service-google-ads`,
  offerWebsite: `${site.url}/#offer-website`,
  offerAds: `${site.url}/#offer-google-ads`,
  faq: `${site.url}/#faq`,
  breadcrumb: `${site.url}/#breadcrumb`,
  webpage: `${site.url}/#webpage`,
};

const telephone = site.contact.phone ? `+${site.contact.phone}` : '';
const sameAs = [site.social.facebook, site.social.instagram, site.social.linkedin].filter(Boolean);

export const breadcrumbId = (path: string): string => `${site.url}${path === '/' ? '/' : path}#breadcrumb`;

export function breadcrumbs(items: { name: string; path: string }[]): Json {
  const last = items[items.length - 1]?.path ?? '/';
  return {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId(last),
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${site.url}${item.path}`,
    })),
  };
}

function offer(id: string, price: number | null): Json {
  return {
    '@type': 'Offer',
    '@id': id,
    url: `${site.url}/#pricing`,
    availability: 'https://schema.org/InStock',
    priceCurrency: 'ILS',
    ...(typeof price === 'number' ? { price } : {}),
  };
}

export function homeGraph(): Json {
  const graph: Json[] = [
    {
      '@type': 'WebSite',
      '@id': ids.website,
      url: `${site.url}/`,
      name: site.name,
      inLanguage: 'he-IL',
      publisher: { '@id': ids.business },
    },
    {
      '@type': 'ProfessionalService',
      '@id': ids.business,
      name: site.name,
      url: `${site.url}/`,
      description: seo.serviceDescription,
      telephone,
      email: site.contact.email,
      image: `${site.url}/opengraph-image`,
      areaServed: { '@type': 'Country', name: 'Israel' },
      address: site.contact.addressLocality
        ? { '@type': 'PostalAddress', addressLocality: site.contact.addressLocality, addressCountry: 'IL' }
        : undefined,
      sameAs,
      knowsLanguage: 'he',
      makesOffer: [{ '@id': ids.offerWebsite }, { '@id': ids.offerAds }],
    },
    {
      '@type': 'Service',
      '@id': ids.serviceWebsite,
      name: services.website.title,
      serviceType: 'בניית אתרים לעסקים',
      description: services.website.description,
      provider: { '@id': ids.business },
      areaServed: { '@type': 'Country', name: 'Israel' },
      url: `${site.url}/#services`,
      offers: offer(ids.offerWebsite, pricing.website.price),
    },
    {
      '@type': 'Service',
      '@id': ids.serviceAds,
      name: services.google.title,
      serviceType: 'קידום ממומן בגוגל',
      description: services.google.description,
      provider: { '@id': ids.business },
      areaServed: { '@type': 'Country', name: 'Israel' },
      url: `${site.url}/#services`,
      offers: offer(ids.offerAds, pricing['website-google'].price),
    },
    {
      '@type': 'FAQPage',
      '@id': ids.faq,
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    breadcrumbs([{ name: 'דף הבית', path: '/' }]),
    {
      '@type': 'WebPage',
      '@id': ids.webpage,
      url: `${site.url}/`,
      name: homeTitle,
      isPartOf: { '@id': ids.website },
      about: { '@id': ids.business },
      inLanguage: 'he-IL',
      breadcrumb: { '@id': ids.breadcrumb },
      primaryImageOfPage: `${site.url}/opengraph-image`,
      dateModified: site.lastUpdated,
    },
  ];
  return compact({ '@context': 'https://schema.org', '@graph': graph });
}

export function legalPageGraph(name: string, path: string): Json {
  return compact({
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbs([
        { name: 'דף הבית', path: '/' },
        { name, path },
      ]),
      {
        '@type': 'WebPage',
        '@id': `${site.url}${path}#webpage`,
        url: `${site.url}${path}`,
        name: withBrand(name),
        isPartOf: { '@id': ids.website },
        about: { '@id': ids.business },
        inLanguage: 'he-IL',
        breadcrumb: { '@id': breadcrumbId(path) },
        dateModified: site.legalPagesUpdated,
      },
    ],
  });
}

/** Safe serialisation for a <script type="application/ld+json">. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
