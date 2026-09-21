-- Social module v8: owner-managed content categories for the content library.
-- Run after v7 (safe to re-run).

-- The owner's own way of grouping posts ("ספות", "מזגנים", "מבצעים"…).
-- Nothing is seeded: an empty list means they have not made one yet, which is
-- the truth, and a category the module invented would be a category they never
-- chose. Deliberately a separate concept from social_targets.category (v7),
-- which groups GROUPS — the two must never be shown under one word.
create table if not exists public.social_content_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- The order the chips appear in; set to "last" on create, editable later.
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- lower(name) so "ספות" and "ספות" in another casing cannot become two chips
-- with the post count split between them.
create unique index if not exists social_content_categories_name_idx
  on public.social_content_categories (lower(name));
drop trigger if exists social_content_categories_set_updated_at on public.social_content_categories;
create trigger social_content_categories_set_updated_at
  before update on public.social_content_categories
  for each row execute function public.set_updated_at();

-- A post belongs to at most one content category. `on delete set null` mirrors
-- social_posts.campaign_id (social-schema.sql:113) and is the whole point:
-- deleting a category must never delete the owner's posts — they simply fall
-- back to uncategorised.
alter table public.social_posts add column if not exists category_id uuid
  references public.social_content_categories (id) on delete set null;
create index if not exists social_posts_category_idx on public.social_posts (category_id);

-- Library usage stats ("published 12 times, last on…") are aggregated from the
-- queue rather than counted into a column that drifts the moment a row is
-- cancelled or retried. The read filters on status with no post predicate, so
-- social_queue_post_target_idx (leading post_id) cannot serve it and
-- social_queue_due_idx orders by scheduled_at, not published_at. NOT partial:
-- social-schema.sql:205-207 records that PostgREST's ON CONFLICT cannot match a
-- partial index, and the house style here is non-partial for that reason.
create index if not exists social_queue_post_status_idx
  on public.social_queue (status, post_id, published_at desc);

-- RLS: same shape as every other business table (social-schema.sql:238-260) —
-- any authenticated user reads and writes.
alter table public.social_content_categories enable row level security;
drop policy if exists "admin select" on public.social_content_categories;
create policy "admin select" on public.social_content_categories for select to authenticated using (true);
drop policy if exists "admin insert" on public.social_content_categories;
create policy "admin insert" on public.social_content_categories for insert to authenticated with check (true);
drop policy if exists "admin update" on public.social_content_categories;
create policy "admin update" on public.social_content_categories for update to authenticated using (true) with check (true);
drop policy if exists "admin delete" on public.social_content_categories;
create policy "admin delete" on public.social_content_categories for delete to authenticated using (true);
