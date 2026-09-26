-- ============================================================================
-- הדבק את כל הקובץ הזה ב-SQL Editor של Supabase ולחץ Run.
--
-- הוא עושה שני דברים:
--   1. יוצר את הטבלאות ואת העמודות (v15)
--   2. יוצר עסק אחד — שלך — ומסמן שכל מה שקיים שייך לו
--
-- אחרי שהוא רץ, שום דבר באפליקציה לא משתנה. אף מסך, אף כפתור, אף פרסום.
-- בסוף תופיע טבלה עם מספרים — כמה שורות שויכו בכל טבלה.
--
-- בטוח להרצה חוזרת: החלק הראשון לא מוחק ולא משנה ערכים, והחלק השני מסרב
-- לרוץ ברגע שיש יותר מעסק אחד.
-- ============================================================================

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


-- ============================================================================
-- social-tenant-backfill.sql — RUN ONCE. Says that everything here is yours.
--
-- v15 added a `tenant_id` column to every table and left it empty. This fills
-- it in: it creates one business — yours — and marks every row that already
-- exists as belonging to it.
--
-- AFTER RUNNING IT, NOTHING CHANGES. No screen, no button, no publication.
-- Still nothing in the app reads these columns. This only means that when the
-- access rules are replaced later, your own data is already on the right side
-- of them — and that a second business, when it arrives, is separable from
-- yours because yours is marked.
--
-- WHY IT IS NOT IN social-latest.sql. That file promises, in its own header,
-- that it is safe to run again whenever something looks wrong — and it keeps
-- that promise: it contains no UPDATE at all. This file is the opposite kind
-- of thing. A backfill that re-ran after a second business existed would hand
-- that business every row of yours. So it lives apart, and it guards itself.
--
-- THE GUARD. Everything below happens only while there is exactly ONE
-- business in the table. The moment a second one exists this file becomes a
-- no-op that says so. Running it twice today is also a no-op, because nothing
-- is null the second time.
--
-- TO UNDO:
--   update public.social_queue set tenant_id = null;   -- and the others
--   delete from public.social_tenant_members;
--   delete from public.social_tenants;
-- ============================================================================

-- One business, created only if there is not one already.
insert into public.social_tenants (name)
select 'הפתרון המבריק'
where not exists (select 1 from public.social_tenants);

do $$
declare
  t uuid;
  tenants bigint;
  members bigint;
begin
  select count(*) into tenants from public.social_tenants;
  if tenants <> 1 then
    raise notice 'יש כבר יותר מעסק אחד (%) — המילוי לא רץ, בכוונה.', tenants;
    return;
  end if;
  select id into t from public.social_tenants;

  /*
   * EVERY PERSON WHO CAN SIGN IN TODAY BECOMES A MEMBER, and that is the
   * faithful migration rather than a generous one.
   *
   * Right now every policy on every table reads `to authenticated using
   * (true)`: anyone who can sign in already sees everything. Making all of
   * them members of the one business preserves exactly that — nobody gains
   * access they did not have, nobody loses access they did have. Handing the
   * business to one chosen person instead would be a CHANGE, and could lock
   * the owner out of their own data the day the real policies land.
   */
  insert into public.social_tenant_members (tenant_id, user_id)
  select t, u.id from auth.users u
  on conflict do nothing;
  select count(*) into members from public.social_tenant_members where tenant_id = t;
  raise notice 'עסק אחד, % משתמשים משויכים אליו.', members;

  update public.social_accounts         set tenant_id = t where tenant_id is null;
  update public.social_targets          set tenant_id = t where tenant_id is null;
  update public.social_campaigns        set tenant_id = t where tenant_id is null;
  update public.social_posts            set tenant_id = t where tenant_id is null;
  update public.social_variants         set tenant_id = t where tenant_id is null;
  update public.social_schedules        set tenant_id = t where tenant_id is null;
  update public.social_queue            set tenant_id = t where tenant_id is null;
  update public.social_activity_log     set tenant_id = t where tenant_id is null;
  update public.social_settings         set tenant_id = t where tenant_id is null;
  update public.social_workers          set tenant_id = t where tenant_id is null;
  update public.social_worker_commands  set tenant_id = t where tenant_id is null;

  -- Created by v8, which social-latest.sql does not include, so it may not be
  -- here at all. Same guard as in v15, for the same reason.
  if to_regclass('public.social_content_categories') is not null then
    execute format('update public.social_content_categories set tenant_id = %L where tenant_id is null', t);
  end if;
end $$;

-- What it did. Every number should be the whole table; a zero next to a table
-- you know has rows means something did not take, and is worth saying so.
select 'קבוצות' as "טבלה", count(*) filter (where tenant_id is not null) as "משויכות", count(*) as "סך הכול" from public.social_targets
union all select 'פרסומים בתור', count(*) filter (where tenant_id is not null), count(*) from public.social_queue
union all select 'סבבים',        count(*) filter (where tenant_id is not null), count(*) from public.social_campaigns
union all select 'פוסטים',       count(*) filter (where tenant_id is not null), count(*) from public.social_posts
union all select 'תזמונים',      count(*) filter (where tenant_id is not null), count(*) from public.social_schedules
union all select 'יומן פעילות',  count(*) filter (where tenant_id is not null), count(*) from public.social_activity_log
union all select 'הגדרות',       count(*) filter (where tenant_id is not null), count(*) from public.social_settings;
