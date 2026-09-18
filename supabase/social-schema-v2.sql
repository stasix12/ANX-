-- הפתרון המבריק — Social module, phase 2: Facebook Groups via a local
-- Playwright worker. Run AFTER social-schema.sql (safe to re-run).
--
-- What changes:
--   * a new target channel 'facebook_group' handled by the local browser
--     worker (Pages keep using the Graph API exactly as before);
--   * finer queue states (needs_attention / awaiting_confirmation / paused)
--     plus a `step` column the worker updates as it moves through a job;
--   * social_workers + social_worker_commands: the dashboard ↔ worker link;
--   * a PRIVATE bucket for failure screenshots (never public);
--   * conservative browser-automation defaults in social_settings.

-- ---------------------------------------------------------------- targets
alter table public.social_targets drop constraint if exists social_targets_channel_check;
alter table public.social_targets
  add constraint social_targets_channel_check
  check (channel in ('facebook_page', 'facebook_group', 'facebook_group_manual', 'instagram'));

alter table public.social_targets drop constraint if exists social_targets_permission_status_check;
alter table public.social_targets
  add constraint social_targets_permission_status_check
  check (permission_status in ('ok', 'missing_permissions', 'manual_only', 'revoked', 'browser'));

alter table public.social_targets add column if not exists last_published_at timestamptz;
alter table public.social_targets add column if not exists last_status text not null default '';
alter table public.social_targets add column if not exists last_error text not null default '';

-- Groups added in phase 1 (manual kit) become browser-published groups.
update public.social_targets
  set channel = 'facebook_group', permission_status = 'browser'
  where channel = 'facebook_group_manual';

-- ------------------------------------------------------------------ queue
alter table public.social_queue drop constraint if exists social_queue_status_check;
alter table public.social_queue
  add constraint social_queue_status_check
  check (status in ('scheduled', 'publishing', 'published', 'failed', 'skipped', 'manual_pending',
                    'needs_attention', 'awaiting_confirmation', 'paused'));

alter table public.social_queue add column if not exists step text not null default '';
alter table public.social_queue add column if not exists step_at timestamptz;
alter table public.social_queue add column if not exists worker_id uuid;
alter table public.social_queue add column if not exists screenshot_path text;
alter table public.social_queue add column if not exists require_confirmation boolean not null default false;
alter table public.social_queue add column if not exists confirmed_at timestamptz;
alter table public.social_queue add column if not exists campaign_id uuid references public.social_campaigns (id) on delete set null;

create index if not exists social_queue_campaign_idx on public.social_queue (campaign_id, status);
create index if not exists social_queue_post_target_idx on public.social_queue (post_id, target_id, status);

-- -------------------------------------------------------------- schedules
alter table public.social_schedules add column if not exists variant_strategy text not null default 'rotate'
  check (variant_strategy in ('rotate', 'distribute', 'fixed'));
-- { "<target_id>": "<variant_id>" } — explicit per-target assignment.
alter table public.social_schedules add column if not exists variant_map jsonb not null default '{}'::jsonb;
alter table public.social_schedules add column if not exists require_confirmation boolean not null default false;

-- ---------------------------------------------------------------- workers
create table if not exists public.social_workers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- online | needs_attention | offline (offline is derived from last_seen_at too)
  status text not null default 'offline' check (status in ('online', 'needs_attention', 'offline')),
  -- connected | needs_auth | disconnected | unknown
  browser_state text not null default 'unknown'
    check (browser_state in ('connected', 'needs_auth', 'disconnected', 'unknown')),
  attention_message text not null default '',
  current_job_id uuid,
  debug_mode boolean not null default false,
  version text not null default '',
  host text not null default '',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists social_workers_set_updated_at on public.social_workers;
create trigger social_workers_set_updated_at
  before update on public.social_workers
  for each row execute function public.set_updated_at();

create table if not exists public.social_worker_commands (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.social_workers (id) on delete cascade,
  -- login | check | logout | resume
  command text not null check (command in ('login', 'check', 'logout', 'resume')),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  result text not null default '',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists social_worker_commands_pending_idx on public.social_worker_commands (status, created_at);

do $$
declare t text;
begin
  foreach t in array array['social_workers', 'social_worker_commands'] loop
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

-- ---------------------------------------------------- failure screenshots
-- Private: read only through short-lived signed URLs from the dashboard.
insert into storage.buckets (id, name, public)
values ('social-debug', 'social-debug', false)
on conflict (id) do nothing;

drop policy if exists "social debug admin read" on storage.objects;
create policy "social debug admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'social-debug');

drop policy if exists "social debug admin write" on storage.objects;
create policy "social debug admin write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'social-debug');

drop policy if exists "social debug admin delete" on storage.objects;
create policy "social debug admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'social-debug');

-- --------------------------------------------------------------- settings
insert into public.social_settings (key, value) values
  ('browser', '{"debugMode": true, "testMode": true, "requireConfirmation": true, "concurrentJobs": 1, "maxPerCampaignPerDay": 8, "groupMinGapMinutes": 20}'::jsonb)
on conflict (key) do nothing;
