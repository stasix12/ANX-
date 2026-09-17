import {
  STANDALONE,
  acCleaning,
  business,
  faq,
  type FeaturedVideo,
  mainVideo,
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

/** LocalBusiness – the anchor entity every page links back to. */
export function localBusinessSchema() {
  const real = reviews;
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
    '@id': BUSINESS_ID,
    name: business.name,
    description: business.description,
    url: absoluteUrl('/'),
    telephone: business.phoneE164,
    logo: publicUrl('/hamavrik/brand/logo.png'),
    // Written as the final file name on the standalone host: this string
    // travels inside a length-prefixed RSC text row, and the build script's
    // URL rewrite must never touch it (a changed length breaks hydration).
    image: [STANDALONE ? absoluteUrl('/opengraph-image.jpg') : absoluteUrl('/opengraph-image'), publicUrl('/video/anx-hero-poster.jpg')],
    priceRange: '₪₪',
    currenciesAccepted: 'ILS',
    areaServed: [...serviceAreas.primary, ...serviceAreas.nearby].map((name) => ({ '@type': 'City', name })),
    address: { '@type': 'PostalAddress', addressLocality: serviceAreas.primary[0], addressCountry: 'IL' },
    geo: { '@type': 'GeoCoordinates', ...business.geo },
    ...(business.openingHours.length ? { openingHours: business.openingHours } : {}),
    // The Google Business Profile joins here the day its URL is in config.ts.
    ...(business.googleMapsUrl ? { hasMap: business.googleMapsUrl } : {}),
    sameAs: [...Object.values(business.social), business.googleMapsUrl].filter(Boolean),
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

/** Service – one per service card, or the single service of a landing page. */
export function serviceSchema(service: Service, city?: string, description: string = service.description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: city ? `${service.name} ב${city}` : service.name,
    serviceType: service.name,
    description,
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

/** VideoObject for a real-footage clip – eligible for video rich results. */
export function videoSchema(video: FeaturedVideo) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: `${video.itemLabel} – ${video.problem} | ${business.name}`,
    description: video.description,
    thumbnailUrl: publicUrl(video.poster),
    contentUrl: publicUrl(video.mp4),
    // Search Console wants a full ISO 8601 datetime with a timezone; a bare
    // date is read as "time unknown". Midnight Israel time on the day it
    // was shot is the honest way to say "this day".
    uploadDate: /T/.test(video.date) ? video.date : `${video.date}T00:00:00+03:00`,
    duration: `PT${video.seconds}S`,
    publisher: { '@id': BUSINESS_ID },
  };
}

/** The main clip's schema, for the pages that open with it. */
export function featuredVideoSchema() {
  return mainVideo ? videoSchema(mainVideo) : null;
}

export function allServicesSchema() {
  return [...services.map((s) => serviceSchema(s)), acServiceSchema()];
}

/** The air-conditioner offer – priced per unit from `bulkMin` units up. */
export function acServiceSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: acCleaning.name,
    serviceType: acCleaning.name,
    description: acCleaning.lede,
    provider: { '@id': BUSINESS_ID },
    areaServed: serviceAreas.primary.map((name) => ({ '@type': 'City', name })),
    offers: {
      '@type': 'Offer',
      price: String(acCleaning.bulkFrom),
      priceCurrency: 'ILS',
      eligibleQuantity: { '@type': 'QuantitativeValue', minValue: acCleaning.bulkMin, unitText: 'מזגנים' },
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        minPrice: acCleaning.bulkFrom,
        priceCurrency: 'ILS',
        eligibleQuantity: { '@type': 'QuantitativeValue', minValue: acCleaning.bulkMin, unitText: 'מזגנים' },
      },
    },
  };
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
