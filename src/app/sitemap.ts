import type { MetadataRoute } from 'next';
import { fetchPublishedProducts } from '@/lib/products';
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
  ];
}
