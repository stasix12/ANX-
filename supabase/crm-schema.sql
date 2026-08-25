-- ANX CRM — lead and job management for the cleaning business.
--
-- Run this once in the Supabase project's SQL Editor (Dashboard → SQL Editor →
-- New query → paste → Run), alongside schema.sql. It creates the leads table
-- and locks it down with Row Level Security so only signed-in admins can read
-- or write anything.
--
-- Unlike the products table, leads are private business data: customers'
-- names, phone numbers and addresses. The anon key gets NO access at all —
-- every policy here is restricted to authenticated users, and admin accounts
-- are created by hand in the Supabase dashboard (Authentication → Users →
-- Add user), exactly like the store's admin panel.

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  -- Date and time are separate nullable columns: a brand-new lead often has
  -- no scheduled slot yet, and splitting them keeps day-range queries plain
  -- (eq/gte/lte on a date) with no timezone arithmetic on the client.
  job_date date,
  job_time time,
  services text[] not null default '{}',
  price numeric,
  notes text not null default '',
  source text not null default 'other'
    check (source in ('google', 'facebook', 'instagram', 'whatsapp', 'other')),
  status text not null default 'new'
    check (status in ('new', 'pending', 'scheduled', 'on_way', 'completed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_job_date_idx on public.leads (job_date);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_phone_idx on public.leads (phone);

-- Reuses set_updated_at() from schema.sql; recreated here so this file also
-- runs standalone on a fresh project.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

drop policy if exists "admin read leads" on public.leads;
create policy "admin read leads"
  on public.leads for select
  to authenticated
  using (true);

drop policy if exists "admin insert leads" on public.leads;
create policy "admin insert leads"
  on public.leads for insert
  to authenticated
  with check (true);

drop policy if exists "admin update leads" on public.leads;
create policy "admin update leads"
  on public.leads for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin delete leads" on public.leads;
create policy "admin delete leads"
  on public.leads for delete
  to authenticated
  using (true);

-- Small key/value store for CRM integrations and preferences (e.g. the
-- Facebook Ads credentials). Same trust model as leads: RLS locks every
-- operation to the signed-in admin — the anon key can never read a token.
create table if not exists public.crm_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists crm_settings_set_updated_at on public.crm_settings;
create trigger crm_settings_set_updated_at
  before update on public.crm_settings
  for each row execute function public.set_updated_at();

alter table public.crm_settings enable row level security;

drop policy if exists "admin read settings" on public.crm_settings;
create policy "admin read settings"
  on public.crm_settings for select
  to authenticated
  using (true);

drop policy if exists "admin write settings" on public.crm_settings;
create policy "admin write settings"
  on public.crm_settings for insert
  to authenticated
  with check (true);

drop policy if exists "admin update settings" on public.crm_settings;
create policy "admin update settings"
  on public.crm_settings for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin delete settings" on public.crm_settings;
create policy "admin delete settings"
  on public.crm_settings for delete
  to authenticated
  using (true);
