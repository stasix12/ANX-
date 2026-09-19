-- הפתרון המבריק — Social publishing module (Facebook Pages + manual groups).
--
-- Run once in the Supabase SQL Editor (safe to re-run). Requires the admin
-- Auth user that already opens /crm — the same account opens /social.
--
-- Trust model:
--   * social_secrets holds every encrypted Meta token. It has NO policies, so
--     neither the anon key nor a signed-in admin can read it from the browser;
--     only the server (service-role key) touches it, and even the server only
--     ever stores AES-256-GCM ciphertext (src/lib/social/server/crypto.ts).
--   * Every other table is business data the admin edits from the UI, locked
--     to authenticated users by RLS exactly like the CRM's leads table.
--   * The worker (route handlers under /api/social) runs with the service
--     role and is guarded by the admin's Supabase JWT or by SOCIAL_CRON_SECRET.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Connected Meta account (one per business; the table allows more).
-- ---------------------------------------------------------------------------
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'facebook' check (provider in ('facebook')),
  provider_user_id text not null,
  name text not null default '',
  -- Which permissions Meta actually granted at the last connect/sync, so the
  -- UI can explain exactly why a target is not API-publishable.
  granted_scopes text[] not null default '{}',
  declined_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);

drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row execute function public.set_updated_at();

-- Encrypted tokens. owner_kind: 'account' (user token) | 'target' (page token).
create table if not exists public.social_secrets (
  owner_kind text not null check (owner_kind in ('account', 'target')),
  owner_id uuid not null,
  ciphertext text not null,
  updated_at timestamptz not null default now(),
  primary key (owner_kind, owner_id)
);
alter table public.social_secrets enable row level security;
-- Deliberately no policies: service role only.

-- ---------------------------------------------------------------------------
-- Publishing targets. channel is the extension point for Instagram etc.
-- ---------------------------------------------------------------------------
create table if not exists public.social_targets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.social_accounts (id) on delete set null,
  channel text not null check (channel in ('facebook_page', 'facebook_group_manual', 'instagram')),
  external_id text not null default '',
  name text not null,
  url text not null default '',
  -- What Meta lets this token do on the target (Pages API "tasks").
  tasks text[] not null default '{}',
  -- ok | missing_permissions | manual_only | revoked
  permission_status text not null default 'manual_only'
    check (permission_status in ('ok', 'missing_permissions', 'manual_only', 'revoked')),
  can_api_publish boolean not null default false,
  enabled boolean not null default true,
  notes text not null default '',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists social_targets_channel_external_idx
  on public.social_targets (channel, external_id) where external_id <> '';

drop trigger if exists social_targets_set_updated_at on public.social_targets;
create trigger social_targets_set_updated_at
  before update on public.social_targets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Campaigns → posts → variants
-- ---------------------------------------------------------------------------
create table if not exists public.social_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service text not null default '',
  city text not null default '',
  language text not null default 'he' check (language in ('he', 'ru', 'mixed')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists social_campaigns_set_updated_at on public.social_campaigns;
create trigger social_campaigns_set_updated_at
  before update on public.social_campaigns
  for each row execute function public.set_updated_at();

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.social_campaigns (id) on delete set null,
  title text not null default '',
  base_text text not null default '',
  language text not null default 'he' check (language in ('he', 'ru')),
  link_url text not null default '',
  cta_type text not null default '',
  phone text not null default '',
  whatsapp_url text not null default '',
  -- [{ kind: 'image' | 'video', url, path, name }]
  media jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_posts_campaign_idx on public.social_posts (campaign_id);
drop trigger if exists social_posts_set_updated_at on public.social_posts;
create trigger social_posts_set_updated_at
  before update on public.social_posts
  for each row execute function public.set_updated_at();

create table if not exists public.social_variants (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts (id) on delete cascade,
  label text not null default 'A',
  text text not null default '',
  language text not null default 'he' check (language in ('he', 'ru')),
  approval text not null default 'pending' check (approval in ('pending', 'approved', 'rejected')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_variants_post_idx on public.social_variants (post_id);
drop trigger if exists social_variants_set_updated_at on public.social_variants;
create trigger social_variants_set_updated_at
  before update on public.social_variants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Schedules (the plan) and the queue (concrete publications).
-- ---------------------------------------------------------------------------
create table if not exists public.social_schedules (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts (id) on delete cascade,
  -- now | once | weekly | interval
  mode text not null check (mode in ('now', 'once', 'weekly', 'interval')),
  timezone text not null default 'Asia/Jerusalem',
  -- once: the instant. interval: the first run.
  run_at timestamptz,
  -- weekly: { "0": ["09:00","18:00"], "3": ["12:30"] }  (0 = Sunday)
  weekly jsonb not null default '{}'::jsonb,
  -- interval: every N days at HH:MM (local)
  interval_days int,
  interval_time text,
  target_ids uuid[] not null default '{}',
  active boolean not null default true,
  -- how far ahead the planner has materialised queue rows
  planned_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_schedules_post_idx on public.social_schedules (post_id);
drop trigger if exists social_schedules_set_updated_at on public.social_schedules;
create trigger social_schedules_set_updated_at
  before update on public.social_schedules
  for each row execute function public.set_updated_at();

create table if not exists public.social_queue (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.social_schedules (id) on delete set null,
  post_id uuid not null references public.social_posts (id) on delete cascade,
  variant_id uuid references public.social_variants (id) on delete set null,
  target_id uuid not null references public.social_targets (id) on delete cascade,
  scheduled_at timestamptz not null,
  -- scheduled | publishing | published | failed | skipped | manual_pending
  status text not null default 'scheduled'
    check (status in ('scheduled', 'publishing', 'published', 'failed', 'skipped', 'manual_pending')),
  attempts int not null default 0,
  -- exact text + media hash used for duplicate prevention
  dedupe_hash text not null default '',
  rendered_text text not null default '',
  external_post_id text,
  permalink text,
  error text,
  skip_reason text,
  claimed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_queue_due_idx on public.social_queue (status, scheduled_at);
create index if not exists social_queue_target_idx on public.social_queue (target_id, published_at);
create index if not exists social_queue_hash_idx on public.social_queue (dedupe_hash, published_at);
-- The planner is idempotent thanks to this: re-running never duplicates a
-- slot. Deliberately NOT partial: ON CONFLICT via PostgREST cannot match a
-- partial index, and NULL schedule_ids are distinct anyway.
create unique index if not exists social_queue_slot_idx
  on public.social_queue (schedule_id, target_id, scheduled_at);
drop trigger if exists social_queue_set_updated_at on public.social_queue;
create trigger social_queue_set_updated_at
  before update on public.social_queue
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Activity log (never contains tokens — see server/log.ts) and settings.
-- ---------------------------------------------------------------------------
create table if not exists public.social_activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  event text not null,
  message text not null default '',
  meta jsonb not null default '{}'::jsonb
);
create index if not exists social_activity_log_at_idx on public.social_activity_log (at desc);

create table if not exists public.social_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists social_settings_set_updated_at on public.social_settings;
create trigger social_settings_set_updated_at
  before update on public.social_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: admin (any authenticated user) reads and writes business data.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'social_accounts', 'social_targets', 'social_campaigns', 'social_posts',
    'social_variants', 'social_schedules', 'social_queue', 'social_activity_log',
    'social_settings'
  ] loop
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

-- ---------------------------------------------------------------------------
-- Media storage: public read (Meta fetches photos/videos by URL), admin write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do nothing;

drop policy if exists "social media public read" on storage.objects;
create policy "social media public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'social-media');

drop policy if exists "social media admin write" on storage.objects;
create policy "social media admin write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'social-media');

drop policy if exists "social media admin delete" on storage.objects;
create policy "social media admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'social-media');

-- Default anti-spam settings (only inserted when missing).
--
-- 'business' is seeded EMPTY on purpose. The phone number and WhatsApp link in
-- this row are appended to the text of every published post (see
-- renderPostText in src/lib/social/compose.ts), so a seeded number belongs to
-- whoever wrote the seed and not to whoever runs the install. This file used to
-- carry one business's real contact details, which every fresh install then
-- published under its own name. Fill these in on the settings screen
-- (/social/settings → "פרטי העסק") before the first publish; an empty phone or
-- WhatsApp is simply left off the post.
--
-- `on conflict do nothing` means an existing deployment keeps whatever it has.
insert into public.social_settings (key, value) values
  ('limits', '{"maxPerDay": 6, "maxPerTargetPerDay": 2, "minGapMinutes": 45, "dedupeDays": 14}'::jsonb),
  ('control', '{"paused": false, "rateLimitedUntil": null}'::jsonb),
  ('business', '{"name": "", "phone": "", "whatsapp": "", "cities": [], "services": []}'::jsonb)
on conflict (key) do nothing;
