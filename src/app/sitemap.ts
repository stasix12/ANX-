import type { MetadataRoute } from 'next';
import { landingPages, STANDALONE } from '@/lib/hamavrik/config';
import { absoluteUrl } from '@/lib/hamavrik/links';
import { fetchPublishedProducts } from '@/lib/products';
import { site } from '@/lib/site';

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  // הפתרון המבריק — the cleaning site and its city/service landing pages.
  const cleaning: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified, changeFrequency: 'weekly', priority: STANDALONE ? 1 : 0.9 },
    { url: absoluteUrl('/gallery'), lastModified, changeFrequency: 'monthly', priority: 0.5 },
    ...landingPages.map((page) => ({
      url: absoluteUrl(`/${page.slug}`),
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];

  // On its own domain the cleaning site is the whole site: no store URLs, and
  // no build-time trip to the store's database.
  if (STANDALONE) return cleaning;

  const products = await fetchPublishedProducts();
  return [
    { url: site.url, lastModified, changeFrequency: 'weekly', priority: 1 },
    ...cleaning,
    ...products.map((product) => ({
      url: `${site.url}/products/${product.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
