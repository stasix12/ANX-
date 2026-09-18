-- Social module v7: favorites, categories and campaign metadata.
-- Run after v6 (safe to re-run).

-- Groups/pages can be starred and categorised for fast filtering.
alter table public.social_targets add column if not exists favorite boolean not null default false;
alter table public.social_targets add column if not exists category text not null default '';
create index if not exists social_targets_favorite_idx on public.social_targets (favorite) where favorite;

-- Campaigns carry their own goal so progress can be shown as X / Y.
alter table public.social_campaigns add column if not exists archived_at timestamptz;

-- Queue rows record which channel actually published them, for the history's
-- "method" column (api = Graph API, browser = local worker, manual = by hand).
alter table public.social_queue add column if not exists method text not null default ''
  check (method in ('', 'api', 'browser', 'manual'));
