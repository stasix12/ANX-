-- ============================================================================
-- v16 — THE ACCESS RULES. The step where the database stops showing everything
-- to everyone.
--
-- Until now every table carried the same rule: `to authenticated using (true)`
-- — "anyone who can sign in may read and write every row". Forty-four policies,
-- all of them saying that. It was the right rule while there was one person.
-- It is the reason a second business cannot be let in.
--
-- v15 added the `tenant_id` column. social-tenant-backfill.sql filled it in.
-- This file is the one that finally READS it:
--
--   * every row a signed-in person can see, change or delete must belong to a
--     business they are a member of;
--   * every row they create is stamped with their business automatically, so
--     no screen and no query had to change to make this true;
--   * `tenant_id` becomes required, so a row without an owner can no longer be
--     created by accident — there is no such thing as a row nobody owns.
--
-- FOR THE OWNER OF THIS APP, NOTHING CHANGES. You are a member of the one
-- business, every row already belongs to it, and the worker signs in as you.
-- Every screen shows exactly what it showed before.
--
-- IT SKIPS ITSELF IF IT IS NOT SAFE TO RUN. If there is no business yet, or if
-- any row still has no business, this file does nothing at all and says so —
-- because locking the rules down while rows are unassigned would hide your own
-- data from you. Run supabase/social-tenant-backfill.sql first, then this.
-- The last two queries in this file report which of the two happened, in
-- Hebrew, as a table you can read.
--
-- Safe to run again: no row is deleted, no value is changed.
--
-- TO UNDO (puts the old "everyone sees everything" rule back):
--   supabase/social-schema-v16-rollback.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. WHO IS ASKING. The two functions every rule below is built out of.
-- ---------------------------------------------------------------------------

-- The businesses this signed-in person belongs to. Empty array for a stranger,
-- and an empty array matches no row, which is the whole point.
--
-- SECURITY DEFINER because the policies call it from inside a query on some
-- other table, and it must be able to read the membership table there without
-- that table's own rule getting in the way. It is safe to define it that way
-- precisely because it takes no arguments and can only ever answer about
-- auth.uid() — the caller cannot ask it about somebody else.
create or replace function public.social_tenant_ids()
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(array_agg(tenant_id), '{}'::uuid[])
  from public.social_tenant_members
  where user_id = auth.uid()
$$;

-- Which business a new row belongs to when nothing said.
--
-- One member of one business: that one, obviously. A member of several (the
-- owner of the product, looking at a customer's workspace): NULL, and the
-- insert then fails on the NOT NULL rather than guessing wrong and writing a
-- customer's row into someone else's business. Guessing is the one thing this
-- must not do.
--
-- The last branch is for a migration or a maintenance query run from the SQL
-- editor, where there is no signed-in person at all. While there is exactly
-- one business in the whole database the answer is not ambiguous, so it is
-- given. The moment a second business exists it stops answering, which is
-- correct: from then on a bare INSERT from the editor has to say which.
create or replace function public.social_default_tenant()
  returns uuid
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  ids uuid[];
  only uuid;
begin
  if auth.uid() is not null then
    select public.social_tenant_ids() into ids;
    if coalesce(array_length(ids, 1), 0) = 1 then
      return ids[1];
    end if;
    return null;
  end if;
  if (select count(*) from public.social_tenants) = 1 then
    select id into only from public.social_tenants;
    return only;
  end if;
  return null;
end
$$;

grant execute on function public.social_tenant_ids() to authenticated, service_role;
grant execute on function public.social_default_tenant() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. STAMPING NEW ROWS. Why no screen had to change.
--
-- Ninety-odd queries in the app insert rows, and not one of them mentions
-- tenant_id. Rather than edit ninety-odd places — and miss one — the database
-- fills it in. A row that arrives without a business gets the business of the
-- person who sent it. A row that names one keeps it, and the policy below then
-- checks they were allowed to.
-- ---------------------------------------------------------------------------
create or replace function public.social_stamp_tenant()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.tenant_id is null then
    new.tenant_id := public.social_default_tenant();
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. THE RULES THEMSELVES — but only if it is safe.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'social_accounts', 'social_targets', 'social_campaigns', 'social_posts',
    'social_variants', 'social_schedules', 'social_queue', 'social_activity_log',
    'social_settings', 'social_workers', 'social_worker_commands'
  ];
  tenants bigint;
  orphans bigint;
  n bigint;
begin
  -- v8 created this one and social-latest.sql deliberately does not include
  -- v8, so on most databases it is simply absent. A bare reference to a table
  -- that is not there aborts the WHOLE script in Supabase's editor, where a
  -- run is one transaction — which is how an earlier version of v15 took the
  -- owner's migration down with it.
  if to_regclass('public.social_content_categories') is not null then
    tables := tables || array['social_content_categories'];
  end if;

  select count(*) into tenants from public.social_tenants;
  if tenants = 0 then
    raise notice 'אין עדיין אף עסק בטבלת העסקים — כללי ההרשאות לא הוחלפו, בכוונה. יש להריץ קודם את supabase/social-tenant-backfill.sql';
    return;
  end if;

  -- A business with nobody in it is a locked door with no key cut. This is
  -- what a brand-new installation looks like — the tables exist, a business
  -- row exists, and the person who will own it has not signed up yet — and
  -- locking down now would leave them staring at a dashboard with nothing on
  -- it and no way to explain why.
  if not exists (select 1 from public.social_tenant_members) then
    raise notice 'אף משתמש לא משויך לעסק — כללי ההרשאות לא הוחלפו, בכוונה. יש להירשם למערכת ואז להריץ את supabase/social-tenant-backfill.sql';
    return;
  end if;

  -- Any row still without a business means the backfill has not run, or has
  -- not finished. Locking down now would hide exactly those rows from the
  -- person who owns them, and they are usually the newest ones.
  orphans := 0;
  foreach t in array tables loop
    execute format('select count(*) from public.%I where tenant_id is null', t) into n;
    if n > 0 then
      raise notice 'לטבלה % יש % שורות בלי עסק.', t, n;
    end if;
    orphans := orphans + n;
  end loop;
  if orphans > 0 then
    raise notice 'יש % שורות בלי עסק — כללי ההרשאות לא הוחלפו, בכוונה. יש להריץ את supabase/social-tenant-backfill.sql ואז את הקובץ הזה שוב.', orphans;
    return;
  end if;

  foreach t in array tables loop
    -- Stamp first, so that making the column required cannot break an insert
    -- that was working a second ago.
    execute format('drop trigger if exists %I on public.%I', t || '_stamp_tenant', t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.social_stamp_tenant()',
      t || '_stamp_tenant', t);

    -- No such thing as a row nobody owns. Idempotent: already-set stays set.
    execute format('alter table public.%I alter column tenant_id set not null', t);

    -- Every policy reads tenant_id, so every table gets the index for it.
    execute format('create index if not exists %I on public.%I (tenant_id)', t || '_tenant_idx', t);

    execute format('alter table public.%I enable row level security', t);

    /*
     * The same four names the old permissive policies used, ON PURPOSE.
     *
     * Postgres OR-s permissive policies together: if this file added rules
     * under new names and social-schema.sql were ever re-run, the old
     * `using (true)` would come back ALONGSIDE these and win every time —
     * wide open again, with four tenant-scoped policies sitting there looking
     * reassuring. Reusing the names means there is exactly one rule per table
     * per verb, whichever file ran last. (social-schema.sql and v2 now refuse
     * to re-create them once tenancy exists; this is the second lock on the
     * same door.)
     *
     * `in (select unnest(...))` rather than `= any(social_tenant_ids())`:
     * written as an uncorrelated sub-query, Postgres works the list out ONCE
     * for the whole query and hashes it, instead of calling the function again
     * for every row it looks at. On a queue with a couple of thousand rows
     * that is the difference between a screen that opens and one that hangs.
     */
    execute format($f$
      drop policy if exists "admin select" on public.%1$I;
      create policy "admin select" on public.%1$I for select to authenticated
        using (tenant_id in (select unnest(public.social_tenant_ids())));

      drop policy if exists "admin insert" on public.%1$I;
      create policy "admin insert" on public.%1$I for insert to authenticated
        with check (tenant_id in (select unnest(public.social_tenant_ids())));

      drop policy if exists "admin update" on public.%1$I;
      create policy "admin update" on public.%1$I for update to authenticated
        using (tenant_id in (select unnest(public.social_tenant_ids())))
        with check (tenant_id in (select unnest(public.social_tenant_ids())));

      drop policy if exists "admin delete" on public.%1$I;
      create policy "admin delete" on public.%1$I for delete to authenticated
        using (tenant_id in (select unnest(public.social_tenant_ids())));
    $f$, t);
  end loop;

  -- v15 wrote "Not read by anything yet" on every one of these columns, and
  -- as of this file that sentence is false: every policy above reads it.
  foreach t in array tables loop
    execute format(
      'comment on column public.%I.tenant_id is %L',
      t,
      'Which business this row belongs to. Every policy on this table filters by it, and it is required.');
  end loop;

  raise notice 'כללי ההרשאות הוחלפו על % טבלאות.', array_length(tables, 1);
end $$;

-- ---------------------------------------------------------------------------
-- 4. WHAT ACTUALLY HAPPENED. Two tables to read, because a NOTICE is easy to
--    miss and "I ran it" is not the same as "it took".
-- ---------------------------------------------------------------------------
select
  case
    when (select count(*) from pg_policies
          where schemaname = 'public' and tablename like 'social\_%'
            and (qual = 'true' or with_check = 'true')) > 0
      then 'פתוח — כל מי שמחובר רואה הכול. ההרשאות לא הוחלפו.'
    else 'מוגן — כל טבלה מסוננת לפי עסק.'
  end as "מצב",
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename like 'social\_%'
       and (qual = 'true' or with_check = 'true')) as "כללים פתוחים שנשארו",
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename like 'social\_%'
       and (qual like '%social_tenant_ids%' or with_check like '%social_tenant_ids%')) as "כללים לפי עסק";
