-- ---------------------------------------------------------------------------
-- v23 — גילוי קבוצות. Finding groups that exist rather than typing in links.
-- ---------------------------------------------------------------------------
--
-- "לאפשר למשתמש להקליד מילת חיפוש, לדוגמה 'באר שבע', והמערכת תחפש קבוצות
--  Facebook רלוונטיות."
--
-- Until now every group in this product arrived the same way: the owner found
-- it in Facebook himself, copied the link, and pasted it in. That is fine for
-- the first ten and it is why the list stopped growing at a hundred and
-- thirty-four.
--
-- WHAT THIS IS NOT. It is not a joiner. Nothing here sends a join request, and
-- the worker that fills these tables is forbidden from pressing that button —
-- the owner opens the group and decides. These two tables hold what the search
-- results said, so a screen can show them, remember them, and tell him which
-- ones are new since the last time he looked.
--
-- WHY A TABLE AND NOT A CACHE. Three of the things asked for are only possible
-- with rows that outlive the search: "לא ליצור אותה שוב" (the same group found
-- by five different searches is one row), "כבר במערכת" (the link to the
-- publishing list), and "נמצאו 7 קבוצות חדשות מאז החיפוש האחרון", which is a
-- comparison against a previous run that has to have been written down.
--
-- Safe to run more than once.


-- ─────────────────────────────── the searches ───────────────────────────────

create table if not exists public.social_discovery_searches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  -- What he typed, kept exactly: it is shown back to him on a chip.
  query text not null,
  -- The same thing folded for comparison — lower case, single spaces. Hebrew
  -- has no case, but these searches are also in Russian and English, where
  -- "Беэр-Шева" and "беэр-шева" are one search and not two.
  normalized text not null,
  -- "מעקב אחרי קבוצות חדשות": re-run this one when the screen opens.
  watching boolean not null default false,
  -- The run that produced what is on screen now, and the one before it. Two,
  -- because "new since the last search" is a question about the gap between
  -- them, and with only the latest there is nothing to subtract.
  last_run_at timestamptz,
  previous_run_at timestamptz,
  last_found integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per phrase per business. Unlike the four indexes v17 had to widen,
-- this one is born per-business, so nothing anywhere needs a fallback for a
-- narrower version of it.
create unique index if not exists social_discovery_searches_tenant_query_idx
  on public.social_discovery_searches (tenant_id, normalized);

drop trigger if exists social_discovery_searches_set_updated_at on public.social_discovery_searches;
create trigger social_discovery_searches_set_updated_at
  before update on public.social_discovery_searches
  for each row execute function public.set_updated_at();


-- ──────────────────────────── the groups themselves ────────────────────────

create table if not exists public.social_discovery_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  -- Facebook's own id or vanity name, out of /groups/<this>/. It is the whole
  -- of the de-duplication rule and the only field here that is not allowed to
  -- be a guess.
  external_id text not null,
  name text not null default '',
  url text not null default '',
  image_url text not null default '',
  -- Null and not zero: "54.3K חברים" was not on the card, which is not the
  -- same fact as a group with nobody in it.
  members integer,
  privacy text not null default 'unknown'
    check (privacy in ('public', 'private', 'unknown')),
  -- THREE STATES AND AN UNKNOWN, for the same reason v22's audience has one.
  -- Facebook shows the membership of a group in the search results only
  -- sometimes; a product that read "I could not tell" as "you are not a
  -- member" would offer him a join button for groups he has been posting to
  -- for a year.
  membership text not null default 'unknown'
    check (membership in ('member', 'requested', 'none', 'unknown')),
  -- Every phrase that has ever turned this group up. An array rather than a
  -- join table because the only question ever asked of it is "did this search
  -- find it", and because a group found by six searches is still one row.
  queries text[] not null default '{}',
  -- When it first appeared, which is what "חדשות מאז החיפוש האחרון" counts,
  -- and when it was last confirmed to still be a result.
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set once it has been added to the publishing list, so the row can say
  -- "כבר במערכת" instead of offering to add it twice. ON DELETE SET NULL: a
  -- group removed from the publishing list becomes addable again rather than
  -- leaving a row pointing at nothing.
  target_id uuid references public.social_targets (id) on delete set null,
  -- "לא מעניין אותי" — kept rather than deleted, or the next search brings it
  -- straight back. Nothing in this product deletes what somebody found.
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists social_discovery_groups_tenant_external_idx
  on public.social_discovery_groups (tenant_id, external_id);

-- The screen's one filter: every group a given phrase found.
create index if not exists social_discovery_groups_queries_idx
  on public.social_discovery_groups using gin (queries);

drop trigger if exists social_discovery_groups_set_updated_at on public.social_discovery_groups;
create trigger social_discovery_groups_set_updated_at
  before update on public.social_discovery_groups
  for each row execute function public.set_updated_at();


-- ───────────────────────── the command that fills them ─────────────────────
--
-- The CHECK on social_worker_commands.command lists every command by name, and
-- v21 shipped two without touching it: the button was refused by the database
-- before the machine ever heard of it — pressed, nothing happened, and the
-- reason was a constraint nobody was looking at. The list is replaced rather
-- than extended, because that is the only form that is safe to run twice.

alter table public.social_worker_commands
  drop constraint if exists social_worker_commands_command_check;
alter table public.social_worker_commands
  add constraint social_worker_commands_command_check
  check (command in ('login', 'check', 'logout', 'resume', 'verify', 'profiles', 'switch', 'discover'));


-- ──────────────────────────── who may see them ─────────────────────────────
--
-- The same four rules v16 put on every other table, applied here the same way
-- — and under the same guard. A brand-new installation has the tables and no
-- business yet; locking down then would leave the owner looking at a screen
-- with nothing on it and no way to explain why. So on a database where
-- tenancy is not established these two tables get the wide-open rule the rest
-- of the schema had before v16, and supabase/social-tenant-backfill.sql
-- followed by this file again closes them, exactly like every other table.

do $$
declare
  t text;
  tables text[] := array['social_discovery_searches', 'social_discovery_groups'];
  ready boolean;
begin
  ready := exists (select 1 from public.social_tenants)
       and exists (select 1 from public.social_tenant_members);

  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    if ready then
      -- Stamp first, so making the column required cannot break an insert that
      -- was working a second ago.
      execute format('drop trigger if exists %I on public.%I', t || '_stamp_tenant', t);
      execute format(
        'create trigger %I before insert on public.%I for each row execute function public.social_stamp_tenant()',
        t || '_stamp_tenant', t);
      execute format('update public.%I set tenant_id = public.social_default_tenant() where tenant_id is null', t);
      execute format('alter table public.%I alter column tenant_id set not null', t);
      execute format('create index if not exists %I on public.%I (tenant_id)', t || '_tenant_idx', t);

      -- The same four policy NAMES as every other table, for the reason v16
      -- gives: Postgres OR-s permissive policies together, so one name per
      -- table per verb is the only shape where the last file to run wins.
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
    else
      raise notice 'אין עדיין עסק במערכת — גילוי הקבוצות נפתח לכל משתמש מחובר, כמו שאר הטבלאות לפני v16.';
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
    end if;
  end loop;
end $$;

comment on table public.social_discovery_searches is
  'One row per search phrase per business. Holds only what was typed and when it was last run — never a credential, never a cookie.';
comment on table public.social_discovery_groups is
  'Facebook groups a search turned up. Written only from what the signed-in account could already see in its own search results; nothing here joins a group.';
comment on column public.social_discovery_groups.membership is
  'member = already in it, requested = a join request is pending, none = not a member, unknown = the search results did not say. Never guessed at.';

select
  (select count(*) from public.social_discovery_searches) as "חיפושים שמורים",
  (select count(*) from public.social_discovery_groups) as "קבוצות שנמצאו";
