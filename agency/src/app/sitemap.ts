import type { MetadataRoute } from 'next';
import { site } from '@/config/site';
import { cityPagePath, validateCityPages } from '@/content/cities';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site.url}/`, lastModified: site.lastUpdated, changeFrequency: 'monthly', priority: 1 },
    {
      url: `${site.url}/accessibility`,
      lastModified: site.legalPagesUpdated,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    { url: `${site.url}/privacy`, lastModified: site.legalPagesUpdated, changeFrequency: 'yearly', priority: 0.3 },
    ...validateCityPages().map((page) => ({
      url: `${site.url}${cityPagePath(page)}`,
      lastModified: page.lastUpdated,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
