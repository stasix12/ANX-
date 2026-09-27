-- ============================================================================
-- social-tenant-repair.sql — RUN ONCE, AND ONLY IF A SECOND PERSON CAN ALREADY
-- SIGN IN.
--
-- WHY THIS FILE EXISTS RATHER THAN social-tenant-backfill.sql.
--
-- The backfill was written for a database with exactly one human in it. Its
-- central line is:
--
--     insert into social_tenant_members select t, u.id from auth.users u;
--
-- "every person who can sign in becomes a member of the one business" — which
-- was the faithful migration on the day it was written, because the rule in
-- force back then was `using (true)` and everyone already saw everything.
--
-- That sentence stops being faithful the moment somebody who is NOT the owner
-- has an account. On this installation that already happened: the signup page
-- went live, an account was opened to test it, and it landed inside the
-- owner's data. Running the backfill now would write that account into the
-- owner's business permanently and call the leak a membership.
--
-- So this file does the same job with one difference that matters: the owner
-- is NAMED, by the email they sign in with, and nobody else is made a member
-- of anything.
--
-- WHAT IT DOES
--   1. Works out who the owner is — the oldest account, which on this
--      installation is a fact and not a guess, because every row here predates
--      the signup page. It prints the email it chose, refuses to choose when
--      the accounts are too close in age to tell, and takes one explicitly if
--      you would rather say.
--   2. Gives them a business, unless they already have one.
--   3. Marks every row that has no business yet as theirs. Every row in this
--      database predates the signup page, so every one of them is the owner's.
--   4. Says what it did, as a table.
--
-- WHAT IT DOES NOT DO
--   * It changes NO access rule. Nothing becomes visible or invisible today.
--     That is supabase/social-latest.sql, which must be run AFTER this and
--     which refuses to run while a single row is still unassigned.
--   * It deletes nothing and it removes nobody from anything. If it finds
--     other people already attached to the owner's business it says so and
--     leaves them alone, because that is a decision for a person to make.
--
-- SAFE TO RUN TWICE. The second run finds nothing left to mark.
--
-- TO UNDO:
--   update public.social_queue set tenant_id = null;   -- and the others
--   delete from public.social_tenant_members;
--   delete from public.social_tenants;
-- ============================================================================

do $$
declare
  -- ┌──────────────────────────────────────────────────────────────────────┐
  -- │  LEAVE THIS EMPTY and the owner is worked out below. Fill it in only │
  -- │  if this file refuses to choose, or chooses wrong.                   │
  -- └──────────────────────────────────────────────────────────────────────┘
  owner_email text := '';

  me       uuid;
  t        uuid;
  tbl      text;
  n        bigint;
  marked   bigint := 0;
  others   bigint;
  tenants  bigint;
  accounts bigint;
  born     timestamptz;
  second   timestamptz;
begin
  -- 1. v15 must have run, or there is nothing to fill in.
  if to_regclass('public.social_tenants') is null
     or to_regclass('public.social_tenant_members') is null then
    raise exception
      'הטבלאות social_tenants / social_tenant_members לא קיימות. יש להריץ קודם את supabase/social-schema-v15.sql.';
  end if;

  -- 2. WHO THE OWNER IS.
  --
  --    Given explicitly, it is looked up and a miss STOPS the file: a typo must
  --    not become a decision about who owns a database.
  --
  --    Left empty, it is the OLDEST account — and on this installation that is
  --    a fact rather than a heuristic. Every row in these tables was written by
  --    the owner's worker, over months, before a signup page existed at all.
  --    Any account older than that page is the owner's; any account younger
  --    than it arrived through it.
  --
  --    The two guards below are what keep that from decaying into a guess on
  --    some other installation:
  --      * the oldest account must be at least a day old, or nothing here is
  --        established enough to hand a database to;
  --      * the two oldest must be more than an hour apart, or "oldest" is not
  --        a meaningful distinction and a person has to say which.
  --    Either way it prints the email it picked, and marking rows changes no
  --    access rule — so a wrong pick is visible and reversible before
  --    social-latest.sql makes it matter.
  if btrim(owner_email) <> '' then
    select u.id into me
    from auth.users u
    where lower(btrim(u.email)) = lower(btrim(owner_email));

    if me is null then
      raise exception
        'לא נמצא משתמש עם האימייל "%". תקנו את השורה owner_email למעלה ונסו שוב. לא בוצע שום שינוי.',
        owner_email;
    end if;
  else
    select count(*) into accounts from auth.users;
    if accounts = 0 then
      raise exception 'אין אף משתמש רשום. לא בוצע שום שינוי.';
    end if;

    select u.id, u.email, u.created_at into me, owner_email, born
    from auth.users u order by u.created_at, u.id limit 1;

    if born > now() - interval '1 day' then
      raise exception
        'החשבון הוותיק ביותר נפתח לפני פחות מיממה, אז אי אפשר להסיק ממנו מי הבעלים. מלאו owner_email למעלה. לא בוצע שום שינוי.';
    end if;

    if accounts > 1 then
      select u.created_at into second
      from auth.users u order by u.created_at, u.id offset 1 limit 1;
      if second < born + interval '1 hour' then
        raise exception
          'שני החשבונות הוותיקים ביותר נפתחו בהפרש של פחות משעה, אז "הוותיק" לא אומר כלום. מלאו owner_email למעלה. לא בוצע שום שינוי.';
      end if;
    end if;

    raise notice 'הבעלים שנבחר: % (החשבון הוותיק ביותר, נפתח ב-%).', owner_email, born;
  end if;

  /* Carried to the report at the bottom. A session GUC rather than a table:
     the decision has to survive to the next statement, not to next week. */
  perform set_config('app.repair_owner', owner_email, false);

  -- 3. THEIR BUSINESS. An existing one is reused; a missing one is created.
  --
  --    It never ADOPTS somebody else's business. "The only tenant in the
  --    table" is exactly the reasoning that would have handed this database to
  --    the test account, because on an installation where v19 never ran the
  --    only tenant row can easily be the newcomer's.
  select m.tenant_id into t
  from public.social_tenant_members m
  where m.user_id = me
  limit 1;

  if t is null then
    insert into public.social_tenants (name) values ('הפתרון המבריק') returning id into t;
    insert into public.social_tenant_members (tenant_id, user_id) values (t, me);
    raise notice 'נוצר עסק חדש לבעלים.';
  else
    raise notice 'לבעלים כבר יש עסק — משתמשים בו.';
  end if;

  -- 4. ANY TABLE THE RULES LEAVE OPEN MUST BE ABLE TO CARRY A BUSINESS.
  --
  --    v15 added the column to the twelve tables that existed when it was
  --    written. This looks instead at what is TRUE NOW: a table whose rule
  --    still reads `using (true)` is a table everyone can read, and the only
  --    way to close it is a column to filter on. Adding one is additive and
  --    reversible; leaving a readable table without one is neither.
  for tbl in
    select distinct p.tablename
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename like 'social\_%'
      and (p.qual = 'true' or p.with_check = 'true')
      and p.tablename not in ('social_tenants', 'social_tenant_members')
      and not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = p.tablename
          and c.column_name = 'tenant_id')
    order by 1
  loop
    execute format('alter table public.%I add column tenant_id uuid', tbl);
    raise notice 'הטבלה % לא הייתה ב-v15 — נוספה לה עמודת שיוך.', tbl;
  end loop;

  -- 5. EVERY UNASSIGNED ROW IS THE OWNER'S.
  --
  --    Discovered rather than listed, so a table added after v15 was written
  --    is filled in too instead of being silently skipped — a skipped table is
  --    a table social-latest.sql will then refuse to lock, which is the exact
  --    failure this installation is recovering from.
  --
  --    social_tenant_members carries a tenant_id that means something else
  --    (which business a person belongs to, not which business owns the row),
  --    so it is never touched here.
  for tbl in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'tenant_id'
      and c.table_name like 'social\_%'
      and c.table_name not in ('social_tenants', 'social_tenant_members')
      and exists (select 1 from pg_tables pt
                  where pt.schemaname = 'public' and pt.tablename = c.table_name)
    order by 1
  loop
    execute format('update public.%I set tenant_id = %L where tenant_id is null', tbl, t);
    get diagnostics n = row_count;
    marked := marked + n;
    if n > 0 then
      raise notice '% — % שורות סומנו כשלכם.', tbl, n;
    end if;
  end loop;

  raise notice 'סך הכול % שורות סומנו.', marked;

  -- 6. THINGS A PERSON SHOULD DECIDE, NOT THIS FILE.
  select count(*) into others
  from public.social_tenant_members
  where tenant_id = t and user_id <> me;
  if others > 0 then
    raise notice 'שימו לב: עוד % משתמשים משויכים לעסק שלכם. הקובץ הזה לא מסיר אף אחד.', others;
  end if;

  select count(*) into tenants from public.social_tenants;
  if tenants > 1 then
    raise notice 'יש % עסקים במערכת. זה תקין אם כבר נרשמו לקוחות.', tenants;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- WHAT ACTUALLY HAPPENED, as a table — because a NOTICE is easy to miss on a
-- phone, and "I ran it" is not the same as "it took".
--
-- query_to_xml runs the count against each table found above, so this report
-- covers whatever this database actually contains rather than a list written
-- months ago.
-- ---------------------------------------------------------------------------
with per_table as (
  select
    c.table_name,
    (xpath('/row/c/text()', query_to_xml(
      format('select count(*) as c from public.%I where tenant_id is null', c.table_name),
      false, true, '')))[1]::text::bigint as unassigned
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.column_name = 'tenant_id'
    and c.table_name like 'social\_%'
    and c.table_name not in ('social_tenants', 'social_tenant_members')
    and exists (select 1 from pg_tables pt
                where pt.schemaname = 'public' and pt.tablename = c.table_name)
)
select
  case
    when coalesce(sum(unassigned), 0) = 0
      then 'מוכן — אפשר להריץ עכשיו את social-latest.sql'
    else 'עדיין יש שורות בלי עסק — אל תמשיכו, שלחו לי את המספר'
  end                                                 as "מצב",
  /* THE LINE TO READ BEFORE GOING ON. If this is not the email you sign in to
     the dashboard with, stop: everything in this database was just marked as
     that person's. Nothing is locked yet, so it is still undoable. */
  coalesce(nullif(current_setting('app.repair_owner', true), ''), '?')
                                                      as "הכול סומן כשייך ל",
  coalesce(sum(unassigned), 0)                        as "שורות בלי עסק",
  (select count(*) from public.social_tenants)        as "עסקים",
  (select count(*) from public.social_tenant_members) as "שיוכים"
from per_table;
