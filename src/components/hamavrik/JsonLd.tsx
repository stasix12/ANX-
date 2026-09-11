import {
  business,
  faq,
  priceList,
  reviews,
  serviceAreas,
  services,
  type LandingPage,
  type Service,
} from '@/lib/hamavrik/config';
import { absoluteUrl, publicUrl } from '@/lib/hamavrik/links';

/** Renders one JSON-LD script; `<` is escaped per the Next.js guide. */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

const BUSINESS_ID = `${absoluteUrl('/')}#business`;

/** LocalBusiness — the anchor entity every page links back to. */
export function localBusinessSchema() {
  const real = reviews.filter((r) => !r.placeholder);
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
    '@id': BUSINESS_ID,
    name: business.name,
    description: business.description,
    url: absoluteUrl('/'),
    telephone: business.phoneE164,
    image: publicUrl('/video/anx-hero-poster.jpg'),
    priceRange: '₪₪',
    currenciesAccepted: 'ILS',
    areaServed: [...serviceAreas.primary, ...serviceAreas.nearby].map((name) => ({ '@type': 'City', name })),
    address: { '@type': 'PostalAddress', addressLocality: serviceAreas.primary[0], addressCountry: 'IL' },
    geo: { '@type': 'GeoCoordinates', ...business.geo },
    ...(business.openingHours.length ? { openingHours: business.openingHours } : {}),
    sameAs: Object.values(business.social).filter(Boolean),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'מחירון ניקוי ריפודים',
      itemListElement: priceList
        .filter((row) => row.from !== null)
        .map((row) => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: row.label },
          price: String(row.from),
          priceCurrency: 'ILS',
          priceSpecification: { '@type': 'PriceSpecification', minPrice: row.from, priceCurrency: 'ILS' },
        })),
    },
    ...(real.length
      ? {
          review: real.map((r) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: r.name },
            reviewBody: r.text,
            reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
          })),
        }
      : {}),
  };
}

/** Service — one per service card, or the single service of a landing page. */
export function serviceSchema(service: Service, city?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: city ? `${service.name} ב${city}` : service.name,
    serviceType: service.name,
    description: service.description,
    provider: { '@id': BUSINESS_ID },
    areaServed: city ? { '@type': 'City', name: city } : serviceAreas.primary.map((name) => ({ '@type': 'City', name })),
    ...(service.priceFrom
      ? {
          offers: {
            '@type': 'Offer',
            price: String(service.priceFrom),
            priceCurrency: 'ILS',
            priceSpecification: { '@type': 'PriceSpecification', minPrice: service.priceFrom, priceCurrency: 'ILS' },
          },
        }
      : {}),
  };
}

export function allServicesSchema() {
  return services.map((s) => serviceSchema(s));
}

export function faqSchema(items: readonly { q: string; a: string }[] = faq) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function landingBreadcrumb(page: LandingPage) {
  return breadcrumbSchema([
    { name: business.name, path: '/' },
    { name: page.h1, path: `/${page.slug}` },
  ]);
}
