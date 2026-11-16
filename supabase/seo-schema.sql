-- הפתרון המבריק — AI SEO system for the southern-Israel cleaning business.
--
-- Run this once in the Supabase project's SQL Editor (Dashboard → SQL Editor →
-- New query → paste → Run), alongside schema.sql and crm-schema.sql. The file
-- is idempotent: running it again on an existing database is safe and changes
-- nothing.
--
-- Trust model, identical to crm-schema.sql: every table is locked behind Row
-- Level Security and every policy is restricted to `authenticated`. The anon
-- key gets NO access to drafts, keyword research or run logs. The ONE
-- exception is published articles, which are public web pages by definition
-- and therefore readable by anon — see the "public read published" policy.
--
-- No API key is ever stored here. The Anthropic key, the Google OAuth refresh
-- token and the cron secret live in server-side environment variables and are
-- read only inside /api/seo/* route handlers (see .env.example).

create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────────────────────
-- Articles
-- ───────────────────────────────────────────────────────────────────────────
--
-- One row per LANGUAGE VERSION. The Hebrew and Russian versions of the same
-- subject share a `topic_key`, which is what pairs them for hreflang and what
-- the weekly cycle counts ("two topics a week" = two topic_keys = four rows).
-- Each row is approved and published separately, because a spec requirement is
-- that one language going live must never drag the other live with it.
create table if not exists public.seo_articles (
  id uuid primary key default gen_random_uuid(),

  -- Groups the he/ru versions of one subject. Stable, slug-like, assigned at
  -- planning time before either version exists.
  topic_key text not null,
  lang text not null check (lang in ('he', 'ru')),

  -- The URL. Globally unique rather than unique-per-language: it IS the path
  -- segment under /articles/, so two languages can never claim one address.
  slug text not null unique,

  -- Target city, or null for a subject that is about the south in general.
  -- The check list is the service area — content for anywhere else is refused
  -- at the database level, not merely discouraged in a prompt.
  city text check (city in ('beer-sheva', 'arad', 'dimona', 'ofakim')),

  -- Draft → quality check → waiting for a human → live. 'rejected' is an end
  -- state that keeps the row for the audit trail instead of deleting it.
  status text not null default 'draft'
    check (status in ('draft', 'quality_check', 'pending_approval', 'published', 'rejected')),

  title text not null default '',
  meta_description text not null default '',
  h1 text not null default '',

  -- The article body as STRUCTURED BLOCKS, not HTML and not markdown:
  --   [{"type":"h2","text":"…"}, {"type":"p","text":"…"},
  --    {"type":"ul","items":["…"]}]
  -- Structured blocks are rendered as React text nodes, so a generated body
  -- can never inject markup. This is the XSS defence — there is no
  -- dangerouslySetInnerHTML anywhere in the publishing path.
  body jsonb not null default '[]'::jsonb,

  -- [{"q":"…","a":"…"}] — rendered as an accordion and as FAQPage JSON-LD.
  faq jsonb not null default '[]'::jsonb,

  -- [{"href":"/sofa-cleaning","anchor":"…"}] — validated against the real
  -- route list before publishing, so a published article cannot carry a 404.
  internal_links jsonb not null default '[]'::jsonb,

  -- The phrases this version targets. Russian targets are researched
  -- independently; they are not translations of the Hebrew ones.
  keywords text[] not null default '{}',

  -- Internal quality gate (0–100) and the per-check breakdown. Explicitly NOT
  -- a Google score, and labelled as such everywhere it is displayed.
  quality_score int check (quality_score between 0 and 100),
  quality_report jsonb not null default '{}'::jsonb,

  -- Which weekly run produced this row, for the dashboard's run history.
  run_id uuid,

  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  rejection_reason text not null default '',
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A subject may hold at most one row per language: the weekly cycle's
-- duplicate guard leans on this, so a retry cannot create a second Hebrew
-- version of a subject it already wrote.
create unique index if not exists seo_articles_topic_lang_idx
  on public.seo_articles (topic_key, lang);

create index if not exists seo_articles_status_idx on public.seo_articles (status);
create index if not exists seo_articles_city_idx on public.seo_articles (city);
create index if not exists seo_articles_published_idx
  on public.seo_articles (published_at desc) where status = 'published';

-- ───────────────────────────────────────────────────────────────────────────
-- Version history
-- ───────────────────────────────────────────────────────────────────────────
--
-- Every edit and every status change appends a snapshot, so an article can be
-- rolled back after a bad edit and so "who approved this, and what exactly did
-- they approve" has an answer.
create table if not exists public.seo_article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.seo_articles (id) on delete cascade,
  -- Full snapshot of the article row at this point in time.
  snapshot jsonb not null,
  -- What produced this version: 'generated', 'edited', 'approved', 'rejected',
  -- 'published', 'restored'.
  reason text not null default 'edited',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists seo_article_versions_article_idx
  on public.seo_article_versions (article_id, created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- Keyword research
-- ───────────────────────────────────────────────────────────────────────────
--
-- Rows here are ONLY ever written from real Search Console responses. There is
-- deliberately no search-volume or competition column: those numbers are not
-- available from GSC, and inventing them would make the dashboard lie.
create table if not exists public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  lang text not null check (lang in ('he', 'ru')),
  city text check (city in ('beer-sheva', 'arad', 'dimona', 'ofakim')),

  -- Straight from Search Console, for the window named by captured_for.
  impressions int not null default 0,
  clicks int not null default 0,
  ctr numeric not null default 0,
  position numeric,
  page text,

  -- Why this row is interesting, computed from the metrics above:
  -- 'high_impressions_low_ctr' | 'missing_content' | 'improve_existing'
  opportunity text
    check (opportunity in ('high_impressions_low_ctr', 'missing_content', 'improve_existing')),

  -- 'gsc' today. A second source would have to name itself here, so a reader
  -- can always tell where a number came from.
  source text not null default 'gsc' check (source in ('gsc')),

  -- The last day of the window these metrics cover.
  captured_for date not null,
  created_at timestamptz not null default now()
);

-- Re-running research for the same window updates rather than duplicates.
create unique index if not exists seo_keywords_unique_idx
  on public.seo_keywords (query, lang, captured_for);

create index if not exists seo_keywords_city_idx on public.seo_keywords (city);
create index if not exists seo_keywords_opportunity_idx on public.seo_keywords (opportunity);

-- ───────────────────────────────────────────────────────────────────────────
-- Weekly runs
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.seo_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'weekly' check (kind in ('weekly', 'manual')),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed')),
  topics_planned int not null default 0,
  articles_created int not null default 0,
  error text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists seo_runs_started_idx on public.seo_runs (started_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- Action and error log
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.seo_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.seo_runs (id) on delete cascade,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  action text not null,
  message text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists seo_logs_created_idx on public.seo_logs (created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- Non-secret settings
-- ───────────────────────────────────────────────────────────────────────────
--
-- The GSC property URL, whether the weekly cycle is paused, and similar
-- preferences. Secrets do NOT go here — see the header note.
create table if not exists public.seo_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ───────────────────────────────────────────────────────────────────────────
-- Reuses set_updated_at() from schema.sql; recreated here so this file also
-- runs standalone on a fresh project.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists seo_articles_set_updated_at on public.seo_articles;
create trigger seo_articles_set_updated_at
  before update on public.seo_articles
  for each row execute function public.set_updated_at();

drop trigger if exists seo_settings_set_updated_at on public.seo_settings;
create trigger seo_settings_set_updated_at
  before update on public.seo_settings
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ───────────────────────────────────────────────────────────────────────────
alter table public.seo_articles enable row level security;
alter table public.seo_article_versions enable row level security;
alter table public.seo_keywords enable row level security;
alter table public.seo_runs enable row level security;
alter table public.seo_logs enable row level security;
alter table public.seo_settings enable row level security;

-- Published articles are public web pages, so anon may read them — and ONLY
-- them. A draft, a rejected article or an article waiting for approval stays
-- invisible to the anon key, which is what keeps unapproved content off the
-- internet even if a page queried the table directly.
drop policy if exists "public read published articles" on public.seo_articles;
create policy "public read published articles"
  on public.seo_articles for select
  to anon
  using (status = 'published');

drop policy if exists "admin read articles" on public.seo_articles;
create policy "admin read articles"
  on public.seo_articles for select to authenticated using (true);

drop policy if exists "admin insert articles" on public.seo_articles;
create policy "admin insert articles"
  on public.seo_articles for insert to authenticated with check (true);

drop policy if exists "admin update articles" on public.seo_articles;
create policy "admin update articles"
  on public.seo_articles for update to authenticated using (true) with check (true);

drop policy if exists "admin delete articles" on public.seo_articles;
create policy "admin delete articles"
  on public.seo_articles for delete to authenticated using (true);

drop policy if exists "admin read versions" on public.seo_article_versions;
create policy "admin read versions"
  on public.seo_article_versions for select to authenticated using (true);

drop policy if exists "admin insert versions" on public.seo_article_versions;
create policy "admin insert versions"
  on public.seo_article_versions for insert to authenticated with check (true);

drop policy if exists "admin read keywords" on public.seo_keywords;
create policy "admin read keywords"
  on public.seo_keywords for select to authenticated using (true);

drop policy if exists "admin write keywords" on public.seo_keywords;
create policy "admin write keywords"
  on public.seo_keywords for insert to authenticated with check (true);

drop policy if exists "admin update keywords" on public.seo_keywords;
create policy "admin update keywords"
  on public.seo_keywords for update to authenticated using (true) with check (true);

drop policy if exists "admin read runs" on public.seo_runs;
create policy "admin read runs"
  on public.seo_runs for select to authenticated using (true);

drop policy if exists "admin write runs" on public.seo_runs;
create policy "admin write runs"
  on public.seo_runs for insert to authenticated with check (true);

drop policy if exists "admin update runs" on public.seo_runs;
create policy "admin update runs"
  on public.seo_runs for update to authenticated using (true) with check (true);

drop policy if exists "admin read logs" on public.seo_logs;
create policy "admin read logs"
  on public.seo_logs for select to authenticated using (true);

drop policy if exists "admin write logs" on public.seo_logs;
create policy "admin write logs"
  on public.seo_logs for insert to authenticated with check (true);

drop policy if exists "admin read seo settings" on public.seo_settings;
create policy "admin read seo settings"
  on public.seo_settings for select to authenticated using (true);

drop policy if exists "admin write seo settings" on public.seo_settings;
create policy "admin write seo settings"
  on public.seo_settings for insert to authenticated with check (true);

drop policy if exists "admin update seo settings" on public.seo_settings;
create policy "admin update seo settings"
  on public.seo_settings for update to authenticated using (true) with check (true);
