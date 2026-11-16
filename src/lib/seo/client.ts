import { supabase } from '@/lib/supabase';
import { runQualityChecks, clearsGate, type Draft } from '@/lib/seo/quality';
import type { Article, ArticleStatus, KeywordRow, SeoLog, SeoRun } from '@/lib/seo/types';

/**
 * Dashboard data access, run as the signed-in admin.
 *
 * Writes go through the browser's Supabase client, so RLS applies with the
 * admin's own identity — the same trust model the CRM already uses for leads.
 * The service-role key stays on the server and is never involved in anything a
 * human does by hand.
 *
 * Publishing lives HERE rather than in the generation endpoint, and that split
 * is the spec's "no automatic publishing" rule made structural: the cycle can
 * only write 'draft' or 'pending_approval', and the only function in the
 * codebase that writes 'published' is `publishArticle` below, which is reached
 * exclusively from a click in the approval queue.
 */

const COLUMNS =
  'id, topic_key, lang, slug, city, status, title, meta_description, h1, body, faq, internal_links, keywords, quality_score, quality_report, run_id, approved_by, approved_at, rejection_reason, published_at, created_at, updated_at';

export class NotConfiguredError extends Error {
  constructor() {
    super('Supabase לא מוגדר — הוסיפו NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY');
    this.name = 'NotConfiguredError';
  }
}

function db() {
  if (!supabase) throw new NotConfiguredError();
  return supabase;
}

export function isConfigured(): boolean {
  return supabase !== null;
}

/** Every article, newest first. The queue filters this client-side. */
export async function listArticles(): Promise<Article[]> {
  const { data, error } = await db()
    .from('seo_articles')
    .select(COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Article[];
}

export async function getArticle(id: string): Promise<Article | null> {
  const { data, error } = await db().from('seo_articles').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Article) ?? null;
}

/**
 * Appends a snapshot before every change, so any edit, approval or publish can
 * be rolled back and so the audit trail answers "what exactly was approved".
 */
async function snapshot(article: Article, reason: string, userId: string | null) {
  await db()
    .from('seo_article_versions')
    .insert({ article_id: article.id, snapshot: article, reason, created_by: userId });
}

export async function listVersions(articleId: string) {
  const { data, error } = await db()
    .from('seo_article_versions')
    .select('id, article_id, snapshot, reason, created_by, created_at')
    .eq('article_id', articleId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; snapshot: Article; reason: string; created_at: string }[];
}

export type EditableFields = Pick<
  Article,
  'title' | 'meta_description' | 'h1' | 'body' | 'faq' | 'internal_links' | 'keywords'
>;

/**
 * Saves a hand edit and re-runs the quality gate on the result.
 *
 * Re-grading matters: an operator can edit a passing article into a failing one
 * (delete the price disclaimer, paste in a city we do not serve), and the
 * status follows the new verdict rather than staying stale. A published article
 * that stops clearing the gate drops back to the queue instead of silently
 * staying live.
 */
export async function saveArticleEdit(
  article: Article,
  fields: EditableFields,
  userId: string | null,
): Promise<Article> {
  await snapshot(article, 'edited', userId);

  const others = (await listArticles()).filter((a) => a.id !== article.id) as unknown as Draft[];
  const draft: Draft = {
    lang: article.lang,
    city: article.city,
    ...fields,
  };
  const report = runQualityChecks(draft, others);
  const passes = clearsGate(report);

  const nextStatus: ArticleStatus =
    article.status === 'published'
      ? passes
        ? 'published'
        : 'pending_approval'
      : passes
        ? 'pending_approval'
        : 'draft';

  const { data, error } = await db()
    .from('seo_articles')
    .update({
      ...fields,
      quality_score: report.score,
      quality_report: report,
      status: nextStatus,
    })
    .eq('id', article.id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Article;
}

/** Re-runs the gate without editing — used after the checks themselves change. */
export async function recheckArticle(article: Article, userId: string | null): Promise<Article> {
  return saveArticleEdit(
    article,
    {
      title: article.title,
      meta_description: article.meta_description,
      h1: article.h1,
      body: article.body,
      faq: article.faq,
      internal_links: article.internal_links,
      keywords: article.keywords,
    },
    userId,
  );
}

/**
 * Approves and publishes, in one deliberate action.
 *
 * The gate is re-evaluated at this exact moment rather than trusting the stored
 * score: the checks may have tightened, or a sibling article may have been
 * published since, making this one a duplicate. Publishing something that no
 * longer passes is refused outright.
 */
export async function publishArticle(article: Article, userId: string | null): Promise<Article> {
  const others = (await listArticles()).filter((a) => a.id !== article.id) as unknown as Draft[];
  const report = runQualityChecks(
    {
      lang: article.lang,
      city: article.city,
      title: article.title,
      meta_description: article.meta_description,
      h1: article.h1,
      body: article.body,
      faq: article.faq,
      internal_links: article.internal_links,
      keywords: article.keywords,
    },
    others,
  );
  if (!clearsGate(report)) {
    const failed = report.checks.filter((c) => !c.pass).map((c) => c.label).join(', ');
    throw new Error(`המאמר לא עובר את בדיקות האיכות ולכן לא ניתן לפרסם: ${failed}`);
  }

  await snapshot(article, 'published', userId);
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('seo_articles')
    .update({
      status: 'published',
      quality_score: report.score,
      quality_report: report,
      approved_by: userId,
      approved_at: now,
      // Keeps the original date when an article is re-published after an edit.
      published_at: article.published_at ?? now,
      rejection_reason: '',
    })
    .eq('id', article.id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Article;
}

/** Takes a published article back off the site, keeping its content. */
export async function unpublishArticle(article: Article, userId: string | null): Promise<Article> {
  await snapshot(article, 'unpublished', userId);
  const { data, error } = await db()
    .from('seo_articles')
    .update({ status: 'pending_approval' })
    .eq('id', article.id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Article;
}

/** Sends an article back for rework, with the reason recorded. */
export async function returnForFixes(
  article: Article,
  reason: string,
  userId: string | null,
): Promise<Article> {
  await snapshot(article, 'returned', userId);
  const { data, error } = await db()
    .from('seo_articles')
    .update({ status: 'draft', rejection_reason: reason })
    .eq('id', article.id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Article;
}

export async function rejectArticle(
  article: Article,
  reason: string,
  userId: string | null,
): Promise<Article> {
  await snapshot(article, 'rejected', userId);
  const { data, error } = await db()
    .from('seo_articles')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('id', article.id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Article;
}

/** Restores a previous version's content. Never restores a 'published' status. */
export async function restoreVersion(
  article: Article,
  snapshotData: Article,
  userId: string | null,
): Promise<Article> {
  return saveArticleEdit(
    article,
    {
      title: snapshotData.title,
      meta_description: snapshotData.meta_description,
      h1: snapshotData.h1,
      body: snapshotData.body,
      faq: snapshotData.faq,
      internal_links: snapshotData.internal_links,
      keywords: snapshotData.keywords,
    },
    userId,
  );
}

export async function listKeywords(limit = 500): Promise<KeywordRow[]> {
  const { data, error } = await db()
    .from('seo_keywords')
    .select('id, query, lang, city, impressions, clicks, ctr, position, page, opportunity, source, captured_for, created_at')
    .order('impressions', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KeywordRow[];
}

export async function listRuns(limit = 20): Promise<SeoRun[]> {
  const { data, error } = await db()
    .from('seo_runs')
    .select('id, kind, status, topics_planned, articles_created, error, started_at, finished_at')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SeoRun[];
}

export async function listLogs(limit = 100): Promise<SeoLog[]> {
  const { data, error } = await db()
    .from('seo_logs')
    .select('id, run_id, level, action, message, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SeoLog[];
}

/**
 * Calls a server endpoint with the admin's own access token.
 *
 * The token is what the route verifies against Supabase — see
 * src/lib/seo/server/auth.ts. No API key of any kind passes through the
 * browser.
 */
export async function callSeoApi<T>(path: string, body: unknown = {}): Promise<T> {
  const client = db();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('אין הרשאה — התחברו מחדש');

  const res = await fetch(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `השרת החזיר שגיאה ${res.status}`);
  return json;
}
