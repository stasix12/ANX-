import type { Metadata } from 'next';
import { ProductView } from '@/components/shop/views/ProductView';
import { SEED_PRODUCTS } from '@/lib/shop/seed';
import { site } from '@/lib/site';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return SEED_PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const p = SEED_PRODUCTS.find((x) => x.slug === slug);
  if (!p) return { title: 'המוצר לא נמצא' };
  return {
    title: p.name,
    description: p.description,
    alternates: { canonical: `/shop/p/${p.slug}` },
    openGraph: {
      type: 'website',
      locale: 'he_IL',
      siteName: 'ANX3D',
      title: `${p.name} | ANX3D`,
      description: p.description,
      images: [{ url: `${site.url}${p.cardImage ?? p.images[0]}` }],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const p = SEED_PRODUCTS.find((x) => x.slug === slug);
  // Product structured data. Ratings are left out on purpose while the
  // catalogue is sample data — they must not be published as real reviews.
  const jsonLd = p && {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.description,
    image: p.images.map((i) => `${site.url}${i}`),
    brand: { '@type': 'Brand', name: 'ANX3D' },
    material: p.material,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'ILS',
      price: p.price,
      url: `${site.url}/shop/p/${p.slug}`,
    },
  };
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
      <ProductView slug={slug} />
    </>
  );
}
