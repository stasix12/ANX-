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
