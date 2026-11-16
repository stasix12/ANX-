import { supabase } from '@/lib/supabase';
import type { Lang } from '@/lib/seo/config';
import type { Article } from '@/lib/seo/types';

/**
 * Article reads, shared by the public pages and the dashboard.
 *
 * Public reads go through the browser/anon client, whose RLS policy exposes
 * ONLY rows with status = 'published' (see supabase/seo-schema.sql). So even a
 * bug in a query here cannot surface an unapproved draft on the website — the
 * database refuses to return it.
 *
 * Every function degrades to an empty result when Supabase is not configured,
 * which is what keeps `next build` and the static export working on a checkout
 * with no environment variables.
 */

const COLUMNS =
  'id, topic_key, lang, slug, city, status, title, meta_description, h1, body, faq, internal_links, keywords, quality_score, quality_report, run_id, approved_by, approved_at, rejection_reason, published_at, created_at, updated_at';

/** Every published article, newest first. Drives /articles and the sitemap. */
export async function fetchPublishedArticles(): Promise<Article[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('seo_articles')
    .select(COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  if (error || !data) return [];
  return data as unknown as Article[];
}

/** One published article by slug, or null. */
export async function fetchPublishedArticle(slug: string): Promise<Article | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('seo_articles')
    .select(COLUMNS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as Article;
}

/**
 * The other language version of a subject, if it is published.
 *
 * This is what hreflang is built from, and the spec is specific that hreflang
 * may only point at versions that actually went live — so an unpublished
 * counterpart must return null and produce no tag. The `status` filter here and
 * the anon RLS policy both enforce that.
 */
export async function fetchCounterpart(
  topicKey: string,
  otherLang: Lang,
): Promise<Pick<Article, 'slug' | 'lang' | 'title'> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('seo_articles')
    .select('slug, lang, title')
    .eq('topic_key', topicKey)
    .eq('lang', otherLang)
    .eq('status', 'published')
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as Pick<Article, 'slug' | 'lang' | 'title'>;
}

/** Published articles that share a city — the "more about this city" rail. */
export async function fetchRelated(
  article: Pick<Article, 'id' | 'lang' | 'city'>,
  limit = 4,
): Promise<Pick<Article, 'slug' | 'title' | 'city' | 'lang'>[]> {
  if (!supabase) return [];
  let query = supabase
    .from('seo_articles')
    .select('slug, title, city, lang')
    .eq('status', 'published')
    .eq('lang', article.lang)
    .neq('id', article.id)
    .limit(limit);
  if (article.city) query = query.eq('city', article.city);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as unknown as Pick<Article, 'slug' | 'title' | 'city' | 'lang'>[];
}

/** Plain-text word count, for the reading-time line on an article. */
export function readingMinutes(article: Pick<Article, 'body'>): number {
  const words = article.body
    .map((b) => (b.type === 'ul' ? b.items.join(' ') : b.text))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  // 200 wpm is the usual figure for Hebrew and Russian prose alike.
  return Math.max(1, Math.round(words / 200));
}
