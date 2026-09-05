import type { MetadataRoute } from 'next';
import { DEMO_PROS } from '@/lib/market/demoData';
import { DEFAULT_AREAS } from '@/lib/market/geo';
import { DEFAULT_SERVICES } from '@/lib/market/services';
import { fetchPublishedProducts } from '@/lib/products';
import { site } from '@/lib/site';

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const products = await fetchPublishedProducts();

  // Marketplace SEO surface: home, pro landing, service×city pages, profiles.
  const marketplace: MetadataRoute.Sitemap = [
    { url: `${site.url}/market`, lastModified, changeFrequency: 'daily' as const, priority: 0.9 },
    { url: `${site.url}/pro`, lastModified, changeFrequency: 'weekly' as const, priority: 0.7 },
    ...DEFAULT_SERVICES.filter((s) => s.active).flatMap((service) =>
      DEFAULT_AREAS.filter((a) => a.active).map((city) => ({
        url: `${site.url}/${service.id}/${city.id}`,
        lastModified,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ),
    ...DEMO_PROS.filter((p) => p.status === 'active').map((pro) => ({
      url: `${site.url}/pro/${pro.slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];

  return [
    ...marketplace,
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
