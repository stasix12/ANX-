-- ============================================================================
-- social-schema-v15.sql — WHO A ROW BELONGS TO. Nothing reads it yet.
--
-- This is the first step of turning a one-owner app into one several
-- businesses can use, and it is deliberately the smallest step that exists.
-- After running it, NOTHING about the app changes: no screen, no button, no
-- query, no publication. Not one line of TypeScript reads any of it.
--
-- WHY IT HAS TO COME FIRST. Every table in this database is protected by the
-- same policy: `to authenticated using (true)` — "any signed-in person may
-- read and write every row". That is correct for an app with one user and
-- catastrophic for an app with two. It cannot be replaced by a real policy
-- until there is something for a policy to compare: a column saying which
-- business a row is for. That column is what this file adds, and nothing else.
--
-- SAFE TO RUN TWICE. Every statement is `if not exists`. Nothing is deleted,
-- no value is changed, no column becomes required, nothing gains a default,
-- nothing gains a foreign key. A column that is null on every row cannot
-- break a query that does not mention it.
--
-- WHAT IS DELIBERATELY NOT HERE:
--   * No backfill. Filling these columns in is a separate, reversible step,
--     and it must not live in a file whose promise is "run it again whenever
--     you are unsure" — a backfill that re-runs after a second business
--     exists would hand them the first one's data.
--   * No `default auth.uid()`. Three writers here are the server itself with
--     no signed-in person behind them (the planner, the activity log, the
--     settings writer), and a default would have stamped them null-or-wrong
--     while the planner swallows its own error — the only symptom being
--     "מתוזמנים 0" on a screen.
--   * No `not null`, no foreign key to social_tenants. Those are the LAST
--     step, after every row is filled and every worker has updated, and they
--     are the only part of this that is hard to undo.
--   * social_secrets is excluded on purpose. It already has an `owner_id`
--     meaning something entirely different (which account a secret is for),
--     it is service-role only with no policy at all, and giving it a second
--     ownership column would be an invitation to confuse them. It gets its
--     tenant through the account it belongs to.
--
-- TO UNDO: `drop table if exists public.social_tenant_members, public.social_tenants cascade;`
-- and `alter table public.<each> drop column if exists tenant_id;`
-- ============================================================================

-- A business. One row per customer of the product; one row, for now, for the
-- owner of it.
create table if not exists public.social_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  created_at timestamptz not null default now()
);

-- Which people may act for which business. A person can belong to more than
-- one, which is what makes "the owner can look at a customer's workspace to
-- help them" possible later without a second login.
create table if not exists public.social_tenant_members (
  tenant_id uuid not null references public.social_tenants(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.social_tenants enable row level security;
alter table public.social_tenant_members enable row level security;

-- A person may see WHICH businesses they belong to, and nothing else.
--
-- THERE IS NO INSERT, UPDATE OR DELETE POLICY HERE, and that absence is the
-- security of the whole design. Membership is written only by the server with
-- the service role. If a signed-in person could add a row here, they could
-- add themselves to somebody else's business — and this table is the thing
-- every future policy will trust to decide what they may see. The table that
-- enforces the boundary may never be writable from the other side of it.
drop policy if exists "own membership" on public.social_tenant_members;
create policy "own membership"
  on public.social_tenant_members for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own tenants" on public.social_tenants;
create policy "own tenants"
  on public.social_tenants for select to authenticated
  using (
    exists (
      select 1 from public.social_tenant_members m
      where m.tenant_id = social_tenants.id and m.user_id = auth.uid()
    )
  );

-- The column, on every table that holds a business's own data. Nullable,
-- unread, unconstrained. Named tenant_id rather than owner_id because
-- social_secrets.owner_id already means something else entirely.
alter table public.social_accounts add column if not exists tenant_id uuid;
alter table public.social_targets add column if not exists tenant_id uuid;
alter table public.social_campaigns add column if not exists tenant_id uuid;
alter table public.social_posts add column if not exists tenant_id uuid;
alter table public.social_variants add column if not exists tenant_id uuid;
alter table public.social_schedules add column if not exists tenant_id uuid;
alter table public.social_queue add column if not exists tenant_id uuid;
alter table public.social_activity_log add column if not exists tenant_id uuid;
alter table public.social_settings add column if not exists tenant_id uuid;
alter table public.social_workers add column if not exists tenant_id uuid;
alter table public.social_worker_commands add column if not exists tenant_id uuid;
-- social_content_categories is created by v8, which social-latest.sql
-- deliberately does not include — so on a database that never ran v8 the
-- table is simply absent, and a bare `alter table` aborts the WHOLE script in
-- Supabase's editor, where a run is one transaction. Found by applying this
-- file to an empty Postgres, which is the only way it shows.
do $$
begin
  if to_regclass('public.social_content_categories') is not null then
    alter table public.social_content_categories add column if not exists tenant_id uuid;
    comment on column public.social_content_categories.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
  end if;
end $$;

comment on column public.social_accounts.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_targets.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_campaigns.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_posts.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_variants.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_schedules.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_queue.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_activity_log.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_settings.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_workers.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
comment on column public.social_worker_commands.tenant_id is 'Which business this row belongs to. Not read by anything yet.';
