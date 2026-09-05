import type { Metadata } from 'next';
import { DEMO_PROS } from '@/lib/market/demoData';
import { market } from '@/lib/market/config';
import { ProPublicProfile } from './ProPublicProfile';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Public professional profile — an SEO page per pro. Seeded pros are
 * prerendered; pros created at runtime render client-side from the live
 * store (and, with Supabase configured, would be picked up by the next
 * scheduled rebuild like the store's product pages are).
 */
export function generateStaticParams() {
  return DEMO_PROS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const pro = DEMO_PROS.find((p) => p.slug === slug);
  if (!pro) return { title: 'פרופיל בעל מקצוע' };
  const name = pro.businessName || pro.fullName;
  return {
    title: `${name} — ניקוי מקצועי ב${pro.city}`,
    description: `${name}: דירוג ${pro.rating}, ${pro.jobCount} עבודות, ${pro.yearsExperience} שנות ניסיון. הזמנה מיידית דרך ${market.name}.`,
    alternates: { canonical: `/pro/${pro.slug}` },
  };
}

export default async function ProProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const seeded = DEMO_PROS.find((p) => p.slug === slug);
  const jsonLd = seeded && {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: seeded.businessName || seeded.fullName,
    address: { '@type': 'PostalAddress', addressLocality: seeded.city, addressCountry: 'IL' },
    ...(seeded.reviewCount > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: seeded.rating,
        reviewCount: seeded.reviewCount,
      },
    }),
  };

  return (
    <>
      <ProPublicProfile slug={slug} />
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
    </>
  );
}
