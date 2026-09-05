-- LeadCloser AI — multi-tenant schema with Row Level Security.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Every business (organisation) is an isolated tenant: each table carries
-- organization_id and every policy checks lc_is_member(organization_id), so a
-- business can never read or write another business's rows — even with a
-- valid session. The anon key has no access at all. Column names are the
-- snake_case form of the TypeScript fields in src/lib/lc/types.ts; nested
-- structures are jsonb.

create extension if not exists "pgcrypto";

-- ───────────────────────────── Tenancy ─────────────────────────────
create table if not exists public.lc_organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  industry text not null default 'upholstery_cleaning',
  locale text not null default 'he' check (locale in ('he','ru','en')),
  currency text not null default 'ILS',
  timezone text not null default 'Asia/Jerusalem',
  phone text not null default '',
  city text not null default '',
  onboarding_step int not null default 0,
  active boolean not null default false,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.lc_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.lc_organization_members (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  user_id text not null,
  email text not null default '',
  full_name text not null default '',
  role text not null default 'owner' check (role in ('owner','admin','worker')),
  worker_id text,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists lc_members_user_idx on public.lc_organization_members (user_id);

-- Membership helper used by every policy. SECURITY DEFINER so the check does
-- not recurse into the members table's own RLS.
create or replace function public.lc_is_member(org_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lc_organization_members m
    where m.organization_id = org_id and m.user_id = auth.uid()::text
  );
$$;

create or replace function public.lc_role(org_id text)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.lc_organization_members m
  where m.organization_id = org_id and m.user_id = auth.uid()::text limit 1;
$$;

-- Mirror auth.users into lc_users.
create or replace function public.lc_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.lc_users (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists lc_on_auth_user_created on auth.users;
create trigger lc_on_auth_user_created after insert on auth.users
  for each row execute function public.lc_handle_new_user();

-- ───────────────────────────── Per-organisation singletons ─────────────────────────────
create table if not exists public.lc_ai_agent_settings (
  organization_id text primary key references public.lc_organizations(id) on delete cascade,
  business_name text not null default '',
  agent_name text not null default '',
  tone text not null default 'friendly',
  custom_tone text not null default '',
  languages jsonb not null default '["he"]',
  greeting jsonb not null default '{}',
  description text not null default '',
  service_areas jsonb not null default '[]',
  working_hours jsonb not null default '{}',
  slot_minutes int not null default 30,
  travel_buffer_min int not null default 30,
  blocked_times jsonb not null default '[]',
  faqs jsonb not null default '[]',
  never_say jsonb not null default '[]',
  handoff_rules jsonb not null default '{}',
  ask_for_photos boolean not null default true,
  auto_book boolean not null default true,
  offer_slots_count int not null default 2
);

create table if not exists public.lc_subscriptions (
  organization_id text primary key references public.lc_organizations(id) on delete cascade,
  plan text not null default 'pro' check (plan in ('starter','pro','business')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled')),
  period_end timestamptz not null default now() + interval '14 days',
  provider text not null default 'mock',
  external_id text
);

-- ───────────────────────────── Core entities ─────────────────────────────
create table if not exists public.lc_customers (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  name text not null,
  phone text not null default '',
  language text not null default 'he',
  addresses jsonb not null default '[]',
  city text not null default '',
  notes text not null default '',
  tags jsonb not null default '[]',
  source text not null default 'other',
  lifetime_value numeric not null default 0,
  last_contact_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists lc_customers_org_idx on public.lc_customers (organization_id);
create index if not exists lc_customers_phone_idx on public.lc_customers (organization_id, phone);

create table if not exists public.lc_lead_sources (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  key text not null,
  ad_spend_month numeric not null default 0,
  enabled boolean not null default true,
  unique (organization_id, key)
);

create table if not exists public.lc_leads (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  customer_id text not null references public.lc_customers(id) on delete cascade,
  conversation_id text not null,
  source text not null default 'other',
  channel text not null default 'whatsapp',
  status text not null default 'new' check (status in ('new','qualified','quoted','booked','lost')),
  language text not null default 'he',
  qualification jsonb not null default '{}',
  quote_id text,
  booking_id text,
  lost_reason text,
  ai_handled boolean not null default true,
  value numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lc_leads_org_created_idx on public.lc_leads (organization_id, created_at desc);
create index if not exists lc_leads_status_idx on public.lc_leads (organization_id, status);

create table if not exists public.lc_conversations (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  lead_id text not null,
  customer_id text not null,
  channel text not null default 'whatsapp',
  language text not null default 'he',
  status text not null default 'new' check (status in ('new','ai','waiting','quote_sent','booked','lost','human')),
  ai_paused boolean not null default false,
  unread_count int not null default 0,
  last_message_text text not null default '',
  last_message_at timestamptz not null default now(),
  agent_state jsonb not null default '{}',
  follow_up_stage int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists lc_conversations_org_last_idx on public.lc_conversations (organization_id, last_message_at desc);

create table if not exists public.lc_messages (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  conversation_id text not null references public.lc_conversations(id) on delete cascade,
  sender text not null check (sender in ('customer','ai','owner','system')),
  text text not null default '',
  attachments jsonb not null default '[]',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists lc_messages_conv_idx on public.lc_messages (conversation_id, created_at);

create table if not exists public.lc_services (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  name jsonb not null default '{}',
  base_price numeric not null default 0,
  unit text not null default 'item',
  duration_min int not null default 60,
  category text not null default 'other',
  keywords jsonb not null default '{}',
  active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.lc_pricing_rules (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  type text not null,
  name jsonb not null default '{}',
  active boolean not null default true,
  config jsonb not null default '{}'
);

create table if not exists public.lc_quotes (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  lead_id text not null,
  conversation_id text not null,
  lines jsonb not null default '[]',
  adjustments jsonb not null default '[]',
  subtotal numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'sent',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.lc_bookings (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  lead_id text not null,
  quote_id text,
  customer_id text not null,
  worker_id text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'active' check (status in ('active','cancelled')),
  created_by text not null default 'ai',
  created_at timestamptz not null default now()
);
create index if not exists lc_bookings_org_start_idx on public.lc_bookings (organization_id, start_at);

create table if not exists public.lc_jobs (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  booking_id text not null,
  lead_id text not null,
  customer_id text not null,
  worker_id text,
  service_summary text not null default '',
  service_ids jsonb not null default '[]',
  address text not null default '',
  city text not null default '',
  scheduled_at timestamptz not null,
  duration_min int not null default 60,
  price numeric not null default 0,
  payment_status text not null default 'unpaid',
  status text not null default 'booked' check (status in ('booked','confirmed','on_the_way','in_progress','completed','cancelled')),
  internal_notes text not null default '',
  customer_notes text not null default '',
  photos jsonb not null default '[]',
  lead_source text not null default 'other',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lc_jobs_org_sched_idx on public.lc_jobs (organization_id, scheduled_at);

create table if not exists public.lc_workers (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  name text not null,
  phone text not null default '',
  color text not null default 'indigo',
  working_hours jsonb not null default '{}',
  service_areas jsonb not null default '[]',
  can_see_prices boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.lc_automations (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  key text not null,
  trigger text not null,
  name jsonb not null default '{}',
  enabled boolean not null default true,
  delay_minutes int not null default 0,
  message jsonb not null default '{}',
  language text not null default 'auto',
  audience text not null default 'customer'
);

create table if not exists public.lc_automation_runs (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  automation_id text not null,
  automation_key text not null,
  entity_type text not null,
  entity_id text not null,
  conversation_id text,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','sent','skipped','failed')),
  rendered_message text not null default '',
  recovered_value numeric not null default 0
);
create index if not exists lc_runs_due_idx on public.lc_automation_runs (organization_id, status, scheduled_at);

create table if not exists public.lc_activity_logs (
  id text primary key,
  organization_id text not null references public.lc_organizations(id) on delete cascade,
  actor text not null default 'system',
  entity_type text not null,
  entity_id text not null,
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists lc_logs_org_idx on public.lc_activity_logs (organization_id, created_at desc);

-- ───────────────────────────── Row Level Security ─────────────────────────────
-- Organisations: members read; any signed-in user may create one (they become
-- its owner via the members insert that follows); owners/admins update.
alter table public.lc_organizations enable row level security;
drop policy if exists "lc org select" on public.lc_organizations;
create policy "lc org select" on public.lc_organizations for select to authenticated using (public.lc_is_member(id));
drop policy if exists "lc org insert" on public.lc_organizations;
create policy "lc org insert" on public.lc_organizations for insert to authenticated with check (true);
drop policy if exists "lc org update" on public.lc_organizations;
create policy "lc org update" on public.lc_organizations for update to authenticated using (public.lc_role(id) in ('owner','admin')) with check (public.lc_role(id) in ('owner','admin'));
drop policy if exists "lc org delete" on public.lc_organizations;
create policy "lc org delete" on public.lc_organizations for delete to authenticated using (public.lc_role(id) = 'owner');

alter table public.lc_users enable row level security;
drop policy if exists "lc users self" on public.lc_users;
create policy "lc users self" on public.lc_users for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Members: a user may add themself as owner of an org that has no members yet
-- (workspace creation), owners/admins manage the rest.
alter table public.lc_organization_members enable row level security;
drop policy if exists "lc members select" on public.lc_organization_members;
create policy "lc members select" on public.lc_organization_members for select to authenticated using (public.lc_is_member(organization_id));
drop policy if exists "lc members insert" on public.lc_organization_members;
create policy "lc members insert" on public.lc_organization_members for insert to authenticated
  with check (
    (user_id = auth.uid()::text and role = 'owner' and not exists (select 1 from public.lc_organization_members m where m.organization_id = lc_organization_members.organization_id))
    or public.lc_role(organization_id) in ('owner','admin')
  );
drop policy if exists "lc members update" on public.lc_organization_members;
create policy "lc members update" on public.lc_organization_members for update to authenticated using (public.lc_role(organization_id) in ('owner','admin'));
drop policy if exists "lc members delete" on public.lc_organization_members;
create policy "lc members delete" on public.lc_organization_members for delete to authenticated using (public.lc_role(organization_id) in ('owner','admin'));

-- Every tenant table: full access for members of that organisation only.
do $$
declare t text;
begin
  foreach t in array array[
    'lc_ai_agent_settings','lc_subscriptions','lc_customers','lc_lead_sources','lc_leads','lc_conversations',
    'lc_messages','lc_services','lc_pricing_rules','lc_quotes','lc_bookings','lc_jobs','lc_workers',
    'lc_automations','lc_automation_runs','lc_activity_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lc tenant select" on public.%I', t);
    execute format('create policy "lc tenant select" on public.%I for select to authenticated using (public.lc_is_member(organization_id))', t);
    execute format('drop policy if exists "lc tenant insert" on public.%I', t);
    execute format('create policy "lc tenant insert" on public.%I for insert to authenticated with check (public.lc_is_member(organization_id))', t);
    execute format('drop policy if exists "lc tenant update" on public.%I', t);
    execute format('create policy "lc tenant update" on public.%I for update to authenticated using (public.lc_is_member(organization_id)) with check (public.lc_is_member(organization_id))', t);
    execute format('drop policy if exists "lc tenant delete" on public.%I', t);
    execute format('create policy "lc tenant delete" on public.%I for delete to authenticated using (public.lc_is_member(organization_id))', t);
  end loop;
end $$;

-- Workers with can_see_prices = false read jobs through this view: the price
-- and payment columns are blanked for them. The app uses it when the signed-in
-- member has role 'worker'.
create or replace view public.lc_jobs_for_worker as
  select j.id, j.organization_id, j.booking_id, j.lead_id, j.customer_id, j.worker_id, j.service_summary, j.service_ids,
         j.address, j.city, j.scheduled_at, j.duration_min,
         case when coalesce(w.can_see_prices, true) then j.price else null end as price,
         case when coalesce(w.can_see_prices, true) then j.payment_status else null end as payment_status,
         j.status, j.internal_notes, j.customer_notes, j.photos, j.lead_source, j.completed_at, j.created_at
  from public.lc_jobs j
  left join public.lc_organization_members m on m.organization_id = j.organization_id and m.user_id = auth.uid()::text
  left join public.lc_workers w on w.id = m.worker_id;

-- Storage bucket for customer photos (public read, member write).
insert into storage.buckets (id, name, public) values ('lc-photos', 'lc-photos', true) on conflict (id) do nothing;
drop policy if exists "lc photos read" on storage.objects;
create policy "lc photos read" on storage.objects for select using (bucket_id = 'lc-photos');
drop policy if exists "lc photos write" on storage.objects;
create policy "lc photos write" on storage.objects for insert to authenticated with check (bucket_id = 'lc-photos');
