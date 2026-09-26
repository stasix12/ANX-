-- ============================================================================
-- UNDO v16 — put the old rule back: anyone who can sign in sees everything.
--
-- Run this only if something in the app stopped showing rows after v16 and it
-- has to work RIGHT NOW. It is a step backwards, not a fix: while it is in
-- effect a second business would see the first one's data, so it is a way to
-- keep the owner working for an evening, not a place to stay.
--
-- It deletes nothing. tenant_id keeps its values; it just stops being read,
-- and stops being required.
--
-- Run supabase/social-schema-v17-rollback.sql FIRST if v17 ran, because the
-- wider uniqueness rules only make sense while tenant_id is required.
-- ============================================================================
do $$
declare
  t text;
  tables text[] := array[
    'social_accounts', 'social_targets', 'social_campaigns', 'social_posts',
    'social_variants', 'social_schedules', 'social_queue', 'social_activity_log',
    'social_settings', 'social_workers', 'social_worker_commands'
  ];
begin
  if to_regclass('public.social_content_categories') is not null then
    tables := tables || array['social_content_categories'];
  end if;

  foreach t in array tables loop
    execute format('drop trigger if exists %I on public.%I', t || '_stamp_tenant', t);
    execute format('alter table public.%I alter column tenant_id drop not null', t);
    execute format($f$
      drop policy if exists "admin select" on public.%1$I;
      create policy "admin select" on public.%1$I for select to authenticated using (true);
      drop policy if exists "admin insert" on public.%1$I;
      create policy "admin insert" on public.%1$I for insert to authenticated with check (true);
      drop policy if exists "admin update" on public.%1$I;
      create policy "admin update" on public.%1$I for update to authenticated using (true) with check (true);
      drop policy if exists "admin delete" on public.%1$I;
      create policy "admin delete" on public.%1$I for delete to authenticated using (true);
    $f$, t);
  end loop;
  raise notice 'ההרשאות חזרו למצב הפתוח על % טבלאות. כל מי שמחובר רואה הכול.', array_length(tables, 1);
end $$;

select 'פתוח — כל מי שמחובר רואה הכול.' as "מצב",
       (select count(*) from pg_policies
          where schemaname = 'public' and tablename like 'social\_%'
            and (qual = 'true' or with_check = 'true')) as "כללים פתוחים";
