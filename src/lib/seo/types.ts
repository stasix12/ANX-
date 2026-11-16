import type { CitySlug, Lang } from '@/lib/seo/config';

/**
 * Article bodies are structured blocks, never HTML and never markdown.
 *
 * This is the XSS defence from the spec's security section: a block's text is
 * rendered as a React text node, so generated content cannot introduce markup,
 * a script tag or an attribute. There is no dangerouslySetInnerHTML anywhere
 * in the publishing path — see src/components/seo/ArticleBody.tsx.
 */
export type Block =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] };

export type FaqEntry = { q: string; a: string };

export type InternalLink = { href: string; anchor: string };

export type ArticleStatus =
  | 'draft'
  | 'quality_check'
  | 'pending_approval'
  | 'published'
  | 'rejected';

/** One language version of one subject. Mirrors public.seo_articles. */
export type Article = {
  id: string;
  topic_key: string;
  lang: Lang;
  slug: string;
  city: CitySlug | null;
  status: ArticleStatus;
  title: string;
  meta_description: string;
  h1: string;
  body: Block[];
  faq: FaqEntry[];
  internal_links: InternalLink[];
  keywords: string[];
  quality_score: number | null;
  quality_report: QualityReport | Record<string, never>;
  run_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A single automated check. `pass` false blocks the approval queue. */
export type QualityCheck = {
  id: string;
  /** Hebrew label shown in the dashboard. */
  label: string;
  pass: boolean;
  /** Why it failed, or what was verified when it passed. */
  detail: string;
};

export type QualityReport = {
  /** 0–100. An INTERNAL score — explicitly not a Google score. */
  score: number;
  checks: QualityCheck[];
  checkedAt: string;
};

/** A keyword row from Search Console. No invented volume or difficulty. */
export type KeywordRow = {
  id: string;
  query: string;
  lang: Lang;
  city: CitySlug | null;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number | null;
  page: string | null;
  opportunity: 'high_impressions_low_ctr' | 'missing_content' | 'improve_existing' | null;
  source: 'gsc';
  captured_for: string;
  created_at: string;
};

export type SeoRun = {
  id: string;
  kind: 'weekly' | 'manual';
  status: 'running' | 'succeeded' | 'partial' | 'failed';
  topics_planned: number;
  articles_created: number;
  error: string;
  started_at: string;
  finished_at: string | null;
};

export type SeoLog = {
  id: string;
  run_id: string | null;
  level: 'info' | 'warn' | 'error';
  action: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
};

/**
 * What the dashboard shows when a dependency is missing.
 *
 * The spec requires the UI to say plainly that data is unavailable or that an
 * API is not configured, rather than rendering a plausible-looking zero. Every
 * panel that depends on an external service returns one of these.
 */
export type ConnectionState =
  | { state: 'connected' }
  | { state: 'not_configured'; missing: string[] }
  | { state: 'error'; message: string };
