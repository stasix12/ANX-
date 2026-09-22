import type { Metadata } from 'next';
import { site } from '@/config/site';
import { seo } from '@/content/copy';

/** Brand suffix for <title>; empty brand → no dangling separator. */
export const brand = site.name.trim();
export const withBrand = (title: string): string => (brand ? `${title} | ${brand}` : title);
export const homeTitle = withBrand(seo.title);

const openGraphBase = {
  type: 'website',
  locale: 'he_IL',
  siteName: brand || undefined,
} as const;

/**
 * Per-page Open Graph block. Next merges `openGraph` shallowly, so every page
 * passes its own title/description/url through here.
 */
export function pageOpenGraph(path: string, title: string, description: string): Metadata['openGraph'] {
  return { ...openGraphBase, url: path, title, description };
}

export function pageTwitter(title: string, description: string): Metadata['twitter'] {
  return { card: 'summary_large_image', title, description };
}

export const homeOpenGraph = pageOpenGraph('/', seo.ogTitle, seo.ogDescription);
export const homeTwitter = pageTwitter(seo.ogTitle, seo.ogDescription);
