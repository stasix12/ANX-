-- Social module v8: "גילוי קבוצות" — a waiting room in front of social_targets.
-- Run after v7 (safe to re-run).
--
-- Why a second table and not more columns on social_targets: a discovered group
-- is not yet a publishing target. It may be a group the owner is not in, has
-- only asked to join, or will decide to ignore. social_targets is the queue's
-- input (plan.ts reads schedule.target_ids off it), so a row that must never be
-- published to does not belong there. A row graduates by going through
-- addGroup() and keeping target_id as the link — there is still exactly one
-- group model in this product.
--
-- There is no Meta API behind any of this: Meta removed the whole Groups API on
-- 2024-04-22, so nothing here searches Facebook. Rows arrive from the owner
-- pasting links, and the optional enrichment pass is the local worker opening
-- the group page in the owner's own Chrome.

-- --------------------------------------------------------- discovered groups
create table if not exists public.social_discovered_groups (
  id uuid primary key default gen_random_uuid(),
  -- Numeric id or vanity slug, lowercased; '' while unknown. Starts equal to
  -- url_key and diverges only when the worker reads the page's canonical
  -- numeric id for a group first captured by its vanity URL.
  fb_group_id text not null default '',
  -- The dedupe key: lowercase(id-or-slug) with everything after it stripped.
  -- See normalizeGroupUrl() in src/lib/social/discovery.ts.
  url_key text not null,
  url text not null,
  name text not null default '',
  image_url text not null default '',
  city text not null default '',
  category text not null default '',
  -- Only ever 'public'/'private' when the group page said so in words.
  privacy text not null default 'unknown' check (privacy in ('public', 'private', 'unknown')),
  -- NULL means "not read". NEVER 0 as a stand-in for an unknown count.
  members_count integer,
  -- Who the owner is to this group. 'UNKNOWN' until it was read or set by hand.
  membership text not null default 'UNKNOWN'
    check (membership in ('NOT_MEMBER', 'JOIN_REQUEST_SENT', 'MEMBER', 'REJECTED', 'UNKNOWN')),
  -- 'owner' outranks 'system': an automatic read may correct a hand-set value
  -- upward but never downgrade it (a group that only admins post in shows no
  -- composer, which is exactly what a non-member page looks like).
  membership_set_by text not null default 'system' check (membership_set_by in ('system', 'owner')),
  discovery_source text not null default 'paste',
  search_keyword text not null default '',
  target_id uuid references public.social_targets (id) on delete set null,
  ignored boolean not null default false,
  enrich_state text not null default 'idle' check (enrich_state in ('idle', 'queued', 'done', 'failed')),
  last_error text not null default '',
  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Full (non-partial) unique index: PostgREST's ON CONFLICT cannot match a
-- partial one (see the note at supabase/social-schema.sql:205), and bulk
-- capture upserts a whole paste in one round trip.
create unique index if not exists social_discovered_groups_url_key_idx
  on public.social_discovered_groups (url_key);
-- Partial by necessity — '' is the "not known yet" value and repeats.
create unique index if not exists social_discovered_groups_fb_id_idx
  on public.social_discovered_groups (fb_group_id) where fb_group_id <> '';
create index if not exists social_discovered_groups_list_idx
  on public.social_discovered_groups (ignored, membership);
-- The worker's queue read: only rows the owner opted in for.
create index if not exists social_discovered_groups_enrich_idx
  on public.social_discovered_groups (enrich_state, discovered_at);

drop trigger if exists social_discovered_groups_set_updated_at on public.social_discovered_groups;
create trigger social_discovered_groups_set_updated_at
  before update on public.social_discovered_groups
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------- RLS
-- Without this the table is readable and writable by anyone holding the anon
-- key; with RLS on and no policies every read from the dashboard returns [].
do $$
declare t text;
begin
  foreach t in array array['social_discovered_groups'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin select" on public.%I', t);
    execute format('create policy "admin select" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "admin insert" on public.%I', t);
    execute format('create policy "admin insert" on public.%I for insert to authenticated with check (true)', t);
    execute format('drop policy if exists "admin update" on public.%I', t);
    execute format('create policy "admin update" on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('drop policy if exists "admin delete" on public.%I', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using (true)', t);
  end loop;
end $$;
