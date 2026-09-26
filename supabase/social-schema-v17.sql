-- ============================================================================
-- v17 — THE FOUR PLACES WHERE TWO BUSINESSES COLLIDE.
--
-- v16 made every row private to the business that owns it. That is not yet
-- enough to let a second business in, because four uniqueness rules in this
-- database were written when "unique" and "unique to you" were the same
-- sentence:
--
--   social_settings   — one row per KEY. One 'limits' row in the whole
--                       database. The second business to save its posting
--                       limits gets "duplicate key" and cannot save at all.
--   social_targets    — one row per (channel, external_id). Two businesses
--                       advertising in the same public Facebook group is the
--                       normal case, not an edge case, and the second one to
--                       add it is refused.
--   social_workers    — one row per NAME. Two customers whose PC is called
--                       DESKTOP-4F2A — Windows' default shape — and the
--                       second worker never registers, so it never publishes.
--   social_accounts   — one row per (provider, provider_user_id). A Facebook
--                       account used by two businesses, or by one business
--                       twice, hits the same wall.
--
-- All four were proved, not guessed: on a copy of this database with two
-- businesses in it, each of these four inserts failed with a duplicate-key
-- error — an error that also tells the second business that the first one
-- exists, which is its own small leak.
--
-- Every one of them becomes "unique WITHIN a business" instead.
--
-- FOR THE OWNER OF THIS APP, NOTHING CHANGES. With one business, "unique" and
-- "unique within the one business" are the same set of rows. No row moves, no
-- row is deleted, no value changes.
--
-- IT SKIPS ITSELF IF v16 HAS NOT TAKEN. Widening these rules while tenant_id
-- can still be NULL would be worse than leaving them alone: Postgres treats
-- two NULLs as different, so a unique index on (tenant_id, key) over
-- unassigned rows permits 'limits' twice, and the app would start reading a
-- settings row at random. So this only runs where tenant_id is already
-- required — which is exactly what v16 does, last.
--
-- Safe to run again.
--
-- TO UNDO: supabase/social-schema-v17-rollback.sql
-- ============================================================================

do $$
declare
  required boolean;
begin
  select bool_and(is_nullable = 'NO') into required
  from information_schema.columns
  where table_schema = 'public' and column_name = 'tenant_id'
    and table_name in ('social_settings', 'social_targets', 'social_workers', 'social_accounts');

  if not coalesce(required, false) then
    raise notice 'כללי ההרשאות של v16 עדיין לא הוחלפו — כללי הייחודיות לא הורחבו, בכוונה.';
    return;
  end if;

  -- ---------------------------------------------------------------- settings
  -- The primary key itself. Dropping and re-adding a primary key rewrites no
  -- data; it is the same rows with a wider key. Nothing references this table
  -- by foreign key, which is why it can be done at all.
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indrelid
    where c.relname = 'social_settings' and i.indisprimary
      and (select count(*) from unnest(i.indkey) k) = 2
  ) then
    alter table public.social_settings drop constraint if exists social_settings_pkey;
    alter table public.social_settings add primary key (tenant_id, key);
    raise notice 'הגדרות: המפתח הורחב ל-(עסק, מפתח).';
  end if;

  -- ----------------------------------------------------------------- targets
  -- The original is partial — `where external_id <> ''` — because a group
  -- added by URL before it has an id must not collide with every other one.
  -- The partiality is kept exactly; only the business is added in front.
  if to_regclass('public.social_targets_tenant_channel_external_idx') is null then
    create unique index social_targets_tenant_channel_external_idx
      on public.social_targets (tenant_id, channel, external_id)
      where external_id <> '';
  end if;
  drop index if exists public.social_targets_channel_external_idx;

  -- ----------------------------------------------------------------- workers
  if to_regclass('public.social_workers_tenant_name_idx') is null then
    create unique index social_workers_tenant_name_idx
      on public.social_workers (tenant_id, name);
  end if;
  alter table public.social_workers drop constraint if exists social_workers_name_key;

  -- ---------------------------------------------------------------- accounts
  if to_regclass('public.social_accounts_tenant_provider_user_idx') is null then
    create unique index social_accounts_tenant_provider_user_idx
      on public.social_accounts (tenant_id, provider, provider_user_id);
  end if;
  alter table public.social_accounts drop constraint if exists social_accounts_provider_provider_user_id_key;

  raise notice 'כללי הייחודיות הורחבו — ייחודי בתוך העסק, לא בכל המערכת.';
end $$;

-- What it did, as a table rather than a notice.
select
  case when to_regclass('public.social_targets_tenant_channel_external_idx') is null
       then 'לא הורחב' else 'לפי עסק' end as "קבוצות",
  case when to_regclass('public.social_workers_tenant_name_idx') is null
       then 'לא הורחב' else 'לפי עסק' end as "מחשבים",
  case when to_regclass('public.social_accounts_tenant_provider_user_idx') is null
       then 'לא הורחב' else 'לפי עסק' end as "חשבונות",
  case when (select count(*) from pg_index i join pg_class c on c.oid = i.indrelid
             where c.relname = 'social_settings' and i.indisprimary
               and (select count(*) from unnest(i.indkey) k) = 2) = 0
       then 'לא הורחב' else 'לפי עסק' end as "הגדרות";
