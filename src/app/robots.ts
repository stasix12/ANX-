import type { MetadataRoute } from 'next';
import { SITE_ORIGIN, STANDALONE } from '@/lib/hamavrik/config';
import { site } from '@/lib/site';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  // The cleaning site on its own domain has nothing to hide from crawlers.
  if (STANDALONE) {
    return { rules: { userAgent: '*', allow: '/' }, sitemap: `${SITE_ORIGIN}/sitemap.xml` };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/crm'] },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
