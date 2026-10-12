import { SEED_CATEGORIES, SEED_PRODUCTS } from './seed';

/**
 * Slugs that get pre-rendered, indexable pages at build time
 * (/shop/p/[slug], /shop/c/[slug]). Products or categories created later in
 * the admin panel are served by the client-side routes until the next build.
 */
export const STATIC_PRODUCT_SLUGS = new Set(SEED_PRODUCTS.map((p) => p.slug));
export const STATIC_CATEGORY_SLUGS = new Set(['all', ...SEED_CATEGORIES.map((c) => c.slug)]);
