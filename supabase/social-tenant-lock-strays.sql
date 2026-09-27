-- ============================================================================
-- social-tenant-lock-strays.sql — THE TABLES NO FILE KNEW ABOUT.
--
-- Run AFTER supabase/social-latest.sql, and only if the check below still
-- reports open rules. On a database where nothing strayed it does nothing and
-- says so.
--
-- WHY IT IS NEEDED AT ALL.
--
-- v16 replaces `to authenticated using (true)` with a rule that filters by
-- business, and it does that for the tables named in a list inside the file.
-- The list is correct about the tables anybody wrote down. It cannot be
-- correct about a table that exists only in the database.
--
-- On this installation there was one: social_discovered_groups. It appears in
-- no migration, no query and no component — nothing in the repository mentions
-- the name. It is left over from an earlier shape of the worker, and because
-- no file knew it existed, no file locked it. After v16 ran, 48 of 52 open
-- rules were gone and 4 remained, all of them on that one table.
--
-- A table nobody uses is still a table everybody can read.
--
-- WHAT IT DOES. For every table in `public` named social_* that still carries
-- an open rule:
--   * requires a tenant_id with no empty values — social-tenant-repair.sql
--     adds the column and fills it, so run that first;
--   * stamps new rows, indexes the column, and replaces the four open rules
--     with the same four tenant-scoped ones v16 writes, under the same names;
--   * skips, loudly, anything it cannot do that to.
--
-- It never touches social_tenants or social_tenant_members: their rules are
-- about membership, not ownership, and are already correct.
--
-- IT DELETES NOTHING AND DROPS NOTHING. A stray table keeps its rows. Whether
-- an unused table should exist at all is a separate decision, made by a person,
-- on a day when nothing is on fire.
--
-- Safe to run again.
-- TO UNDO, per table:
--   drop policy "admin select" on public.<table>;  -- and insert/update/delete
--   create policy "admin select" on public.<table> for select to authenticated
--     using (true);                                -- the old, open rule
-- ============================================================================

do $$
declare
  tbl     text;
  nulls   bigint;
  locked  int := 0;
  skipped int := 0;
begin
  -- The helpers every rule below is built from. They arrive with v16, so their
  -- absence means social-latest.sql has not run and this file would write
  -- policies that reference a function that does not exist.
  if to_regprocedure('public.social_tenant_ids()') is null
     or to_regprocedure('public.social_stamp_tenant()') is null then
    raise exception
      'חסרות הפונקציות של v16. יש להריץ קודם את supabase/social-latest.sql.';
  end if;

  for tbl in
    select distinct p.tablename
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename like 'social\_%'
      and (p.qual = 'true' or p.with_check = 'true')
      and p.tablename not in ('social_tenants', 'social_tenant_members')
    order by 1
  loop
    -- No column, nothing to filter on. Reported rather than invented: adding a
    -- column is social-tenant-repair.sql's job, and a file that both discovers
    -- and improvises is a file nobody can predict.
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = tbl and c.column_name = 'tenant_id')
    then
      raise notice 'דילוג על % — אין עמודת שיוך. הריצו קודם את social-tenant-repair.sql.', tbl;
      skipped := skipped + 1;
      continue;
    end if;

    -- A null tenant_id under a tenant-scoped rule is a row NOBODY can see,
    -- including the person it belongs to. Locking over one is how a repair
    -- turns into data loss that looks like data loss.
    execute format('select count(*) from public.%I where tenant_id is null', tbl) into nulls;
    if nulls > 0 then
      raise notice 'דילוג על % — % שורות בלי עסק. הריצו קודם את social-tenant-repair.sql.', tbl, nulls;
      skipped := skipped + 1;
      continue;
    end if;

    execute format('drop trigger if exists %I on public.%I', tbl || '_stamp_tenant', tbl);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.social_stamp_tenant()',
      tbl || '_stamp_tenant', tbl);

    execute format('alter table public.%I alter column tenant_id set not null', tbl);
    execute format('create index if not exists %I on public.%I (tenant_id)', tbl || '_tenant_idx', tbl);
    execute format('alter table public.%I enable row level security', tbl);

    /*
     * THE SAME FOUR NAMES v16 USES, for the same reason it gives: Postgres
     * OR-s permissive policies together, so a rule added under a new name
     * would sit BESIDE the open one rather than replace it, and the open one
     * would win every time — wide open, with four tenant-scoped policies
     * beneath it looking reassuring.
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
    $f$, tbl);

    raise notice 'הטבלה % נסגרה.', tbl;
    locked := locked + 1;
  end loop;

  if locked = 0 and skipped = 0 then
    raise notice 'לא נמצאה אף טבלה פתוחה. אין מה לעשות.';
  else
    raise notice 'נסגרו % טבלאות, דולגו %.', locked, skipped;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- THE SAME CHECK THAT FOUND THIS, so the answer is read rather than assumed.
-- ---------------------------------------------------------------------------
select
  case
    when (select count(*) from pg_policies
          where schemaname = 'public' and tablename like 'social%'
            and (qual = 'true' or with_check = 'true')) = 0
      then 'סגור — אין אף טבלה שכל מי שמחובר רואה'
    else 'עדיין פתוח — שלחו לי את שם הטבלה מהעמודה הבאה'
  end as "מצב",
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename like 'social%'
       and (qual = 'true' or with_check = 'true')) as "כללים פתוחים",
  coalesce((select string_agg(distinct tablename, ', ') from pg_policies
     where schemaname = 'public' and tablename like 'social%'
       and (qual = 'true' or with_check = 'true')), '—') as "טבלאות פתוחות",
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename like 'social%'
       and (qual like '%social_tenant_ids%' or with_check like '%social_tenant_ids%')) as "כללים לפי עסק";
