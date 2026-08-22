import type { MetadataRoute } from 'next';
import { products } from '@/lib/products';
import { site } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: site.url, lastModified, changeFrequency: 'weekly', priority: 1 },
    ...products.map((product) => ({
      url: `${site.url}/products/${product.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
