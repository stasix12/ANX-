import type { MetadataRoute } from 'next';
import { landingPages } from '@/lib/hamavrik/config';
import { absoluteUrl } from '@/lib/hamavrik/links';
import { fetchPublishedProducts } from '@/lib/products';
import { site } from '@/lib/site';

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const products = await fetchPublishedProducts();

  return [
    { url: site.url, lastModified, changeFrequency: 'weekly', priority: 1 },
    // הפתרון המבריק — the cleaning site and its city/service landing pages.
    { url: absoluteUrl('/'), lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/gallery'), lastModified, changeFrequency: 'weekly', priority: 0.7 },
    ...landingPages.map((page) => ({
      url: absoluteUrl(`/${page.slug}`),
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...products.map((product) => ({
      url: `${site.url}/products/${product.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
