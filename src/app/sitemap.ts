import type { MetadataRoute } from 'next';
import { fetchPublishedProducts } from '@/lib/products';
import { SEED_CATEGORIES, SEED_PRODUCTS } from '@/lib/shop/seed';
import { site } from '@/lib/site';

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const products = await fetchPublishedProducts();

  return [
    { url: site.url, lastModified, changeFrequency: 'weekly', priority: 1 },
    {
      url: `${site.url}/sofa-cleaning`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    ...products.map((product) => ({
      url: `${site.url}/products/${product.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    // ANX3D 3D-print store (/shop)
    { url: `${site.url}/shop`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${site.url}/shop/categories`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    ...['all', ...SEED_CATEGORIES.map((c) => c.slug)].map((slug) => ({
      url: `${site.url}/shop/c/${slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...SEED_PRODUCTS.map((p) => ({
      url: `${site.url}/shop/p/${p.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
