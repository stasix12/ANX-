import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetail } from '@/components/ProductDetail';
import { categoryName, fetchProductBySlug, fetchPublishedProducts } from '@/lib/products';
import { site } from '@/lib/site';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Runs at build time in CI, which — unlike this project's own dev sandbox —
 * has real internet access, so it can reach Supabase directly. Every
 * currently-published product gets pre-rendered here; a brand-new product
 * still shows up immediately in the homepage catalogue (that grid fetches
 * live), and gets this dedicated static page at the next deploy — pushes
 * redeploy automatically, and a scheduled rebuild also runs hourly so a new
 * product's own page never waits long even without one.
 */
export async function generateStaticParams() {
  const products = await fetchPublishedProducts();
  // output: 'export' refuses to build a dynamic route with zero params. A
  // transient Supabase outage (or an as-yet-unseeded database) must not be
  // able to take the whole site down on the next scheduled rebuild, so an
  // empty result falls back to one placeholder path instead of failing the
  // build — it 404s harmlessly; real slugs replace it the moment the fetch
  // above actually returns data.
  if (products.length === 0) return [{ slug: '_placeholder' }];
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);

  if (!product) {
    return { title: 'המוצר לא נמצא' };
  }

  const description = `${product.tagline} מתאים ל-Sabrina · ${site.shippingNote} · הזמנה ישירה בוואטסאפ.`;

  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: 'website',
      locale: 'he_IL',
      url: `${site.url}/products/${product.slug}`,
      siteName: site.name,
      title: `${product.name} | ${site.name}`,
      description,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const allProducts = await fetchPublishedProducts();
  const related = allProducts
    .filter((item) => item.category === product.category && item.slug !== product.slug)
    .slice(0, 3);

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    brand: { '@type': 'Brand', name: site.name },
    category: categoryName(product.category),
    image: product.images.map((image) => (/^https?:\/\//.test(image) ? image : `${site.url}${image}`)),
    ...(product.price !== undefined && {
      offers: {
        '@type': 'Offer',
        price: product.salePrice ?? product.price,
        priceCurrency: 'ILS',
        availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: `${site.url}/products/${product.slug}`,
      },
    }),
  };

  return (
    <article className="pb-16 sm:pb-20">
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
        <ProductDetail slug={slug} initialProduct={product} initialRelated={related} />
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
    </article>
  );
}
