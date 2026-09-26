-- ============================================================================
-- social-latest.sql — THE ONE FILE TO RUN.
--
-- Every change the app has needed since the database was first set up, in
-- order, all of it safe to run again. Copy it into Supabase → SQL Editor → Run.
--
-- WHY THIS EXISTS: these arrived as social-schema-v9, v10, v11, v12, v13, v14
-- — six files, and every screen that hit a missing column named a different
-- one. The owner of this app does not read SQL and does not always have a
-- computer; being told "run v13" on Tuesday and "run v14" on Thursday is how a
-- database ends up half-migrated, with comments that never go out and counters
-- that never appear and no way to tell which file was missed. That happened:
-- the dashboard was asking for v13 while this file's author was asking for
-- v14, and the owner had done one of them.
--
-- One file. Run it whenever something says a column is missing. Run it twice
-- if you are not sure — nothing here deletes anything or changes a value.
--
-- NOT INCLUDED: social-schema.sql and social-schema-v2.sql, which CREATE the
-- tables and seed settings. Those are the original setup, they are run once,
-- and a message that names one of them means something else entirely — that
-- this database was never set up, not that it is behind.
--
-- The numbered files are kept beside this one for the history of WHY each
-- change was made. worker/test/unit.test.ts checks that every statement in
-- them is also here, so this file cannot quietly fall behind.
-- ============================================================================

-- ─────────────────────────── from social-schema-v9.sql ───────────────────────────

-- v9 — WHO the browser worker is signed in to Facebook as.
--
-- The dashboard's "מחובר" chip has only ever meant "the PC sent a heartbeat".
-- It said nothing about which Facebook account that machine's browser profile
-- holds — and every group publication goes out under that name. On a shared
-- computer, or after somebody signs in as the wrong person, that is the one
-- fact worth putting on the screen.
--
-- Written by the worker on each login check (worker/facebook/account.ts). The
-- id comes from the c_user cookie and is authoritative; the name and avatar
-- are read from the page and may be absent, so both default to empty rather
-- than to anything invented.
--
-- Safe to run more than once.

alter table public.social_workers
  add column if not exists fb_user_id text not null default '',
  add column if not exists fb_user_name text not null default '',
  add column if not exists fb_avatar_url text not null default '';

comment on column public.social_workers.fb_user_id is
  'Facebook c_user id of the account this worker''s browser profile is signed in as. Empty when unknown.';
comment on column public.social_workers.fb_user_name is
  'Display name as Facebook rendered it. Empty when the page did not yield one — never guessed.';
comment on column public.social_workers.fb_avatar_url is
  'Public URL in the social-media bucket of the avatar the worker screenshotted. Empty when none.';


-- ─────────────────────────── from social-schema-v10.sql ───────────────────────────

-- v10 — let a stored picture be REPLACED, not only created.
--
-- social-schema.sql gave the social-media bucket three policies: public read,
-- authenticated insert, authenticated delete. No update. Supabase Storage's
-- upsert is an insert that turns into an UPDATE the moment the object already
-- exists, so every re-upload to a path that had been written once failed with
-- "new row violates row-level security policy".
--
-- It surfaced on the worker's Facebook avatar, which is written to a stable
-- path (workers/<id>.png) precisely so the dashboard cannot keep showing the
-- previous owner's face — the second write is the whole point, and it was the
-- one the policies forbade. The same wall sits under group pictures
-- (groups/<id>.png): a group that changed its photo could never show the new
-- one, and that failure was swallowed silently.
--
-- Read stays public because Facebook and the dashboard both fetch these by
-- URL. Writing stays limited to a signed-in user, exactly as before; this adds
-- the one verb that was missing, and nothing else.
--
-- Safe to run more than once.

drop policy if exists "social media admin update" on storage.objects;
create policy "social media admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'social-media')
  with check (bucket_id = 'social-media');


-- ─────────────────────────── from social-schema-v11.sql ───────────────────────────

-- v11 — a one-time payload on a worker command.
--
-- Added so the dashboard can hand the local worker a Facebook username and
-- password to type into Facebook's own login form, instead of a person walking
-- to the machine. That is what a customer of this product needs: they buy it,
-- they enter their own details on their own phone, and their own account
-- publishes to their own groups.
--
-- IT IS NOT A PASSWORD STORE, and the shape of this column is the whole
-- argument. It carries one value for one command, and the worker empties it in
-- the same statement that claims the command — before the browser is even
-- opened. Nothing reads it twice, nothing keeps it, and no screen ever shows
-- it back. A product that stored these would be holding other people's
-- Facebook passwords in a database, which is a different and much heavier
-- thing to be.
--
-- The activity log and the command's own `result` never receive it either:
-- worker/db.ts's scrub() redacts any key matching /password|secret|token/ and
-- the login result is a sentence, not an echo.
--
-- Safe to run more than once.

alter table public.social_worker_commands
  add column if not exists payload jsonb not null default '{}'::jsonb;

comment on column public.social_worker_commands.payload is
  'One-time input for this command (e.g. login credentials). The worker empties it in the same update that claims the command — never a store, never read back by the dashboard.';


-- ─────────────────────────── from social-schema-v12.sql ───────────────────────────

-- v12 — finish a Facebook login WITHOUT going to the machine.
--
-- Until now the answer to "Facebook is asking for a code" was: walk to the
-- computer and type it into the window. That is fine for one owner with the
-- machine in the next room, and impossible for everything this is meant to
-- become — a customer who bought the product and whose browser runs on a
-- server they will never touch.
--
-- So the challenge comes to the screen instead. When Facebook interrupts a
-- login, the worker photographs exactly what it is showing, publishes the
-- picture, and waits; the app renders it and sends back whatever the person
-- typed, as a one-time `verify` command payload that is wiped on claim like
-- every other one.
--
-- The picture goes to the PRIVATE social-debug bucket and is read through a
-- short-lived signed URL, because it is a photograph of somebody's Facebook
-- mid-login. `login_stage` is what the screen branches on; both are cleared
-- the moment the login resolves, so a finished challenge cannot linger and be
-- answered twice.
--
-- Safe to run more than once.

alter table public.social_workers
  add column if not exists login_stage text not null default '',
  add column if not exists login_shot text not null default '',
  add column if not exists login_asked_at timestamptz;

comment on column public.social_workers.login_stage is
  'Empty, or ''challenge'' while Facebook is asking a person something mid-login. Cleared as soon as the login resolves.';
comment on column public.social_workers.login_shot is
  'Object path in the private social-debug bucket of what Facebook is showing. Read through a signed URL, never public.';
comment on column public.social_workers.login_asked_at is
  'When the challenge was raised, so a stale one can be recognised rather than answered.';

-- 'verify' carries the code the person typed on the screen.
alter table public.social_worker_commands
  drop constraint if exists social_worker_commands_command_check;
alter table public.social_worker_commands
  add constraint social_worker_commands_command_check
  check (command in ('login', 'check', 'logout', 'resume', 'verify'));


-- ─────────────────────────── from social-schema-v13.sql ───────────────────────────

-- v13 — how a published post actually did, read off the post itself.
--
-- "How many people saw this" is the question a round is run to answer, and it
-- is also the easiest place in this product to invent a number. So what gets
-- stored here is only what Facebook actually puts on the page:
--
--   metrics_seen       "נצפה על ידי N" when Facebook shows it — and it does
--                      not always. NULL means it was not shown, which is a
--                      different fact from 0 and must stay tellable apart.
--   metrics_views      plays on a VIDEO post, which Facebook reports as
--                      "N צפיות" instead. Kept apart from metrics_seen on
--                      purpose: a play is somebody who watched, an impression
--                      is a post that crossed a screen, and one column for
--                      both would let a screen label the first as the second.
--   metrics_reactions  likes and other reactions
--   metrics_comments   comments
--   metrics_shares     shares
--
-- Every one is NULLABLE ON PURPOSE. A group post whose counters have not been
-- read yet, a post whose page would not load, and a post that genuinely got
-- nothing are three different things; a default of 0 would flatten all three
-- into "nobody cared", which is a lie the screen would state confidently.
--
-- There is no reach or impressions column and there will not be one. Meta
-- closed the Groups API in April 2024 and group posts carry no such figure on
-- the page either. A number here would have to be guessed from group size,
-- and a guessed audience is the one number a customer would actually make
-- decisions on.
--
-- Safe to run more than once.

alter table public.social_queue
  add column if not exists metrics_seen integer,
  add column if not exists metrics_views integer,
  add column if not exists metrics_reactions integer,
  add column if not exists metrics_comments integer,
  add column if not exists metrics_shares integer,
  add column if not exists metrics_at timestamptz;

comment on column public.social_queue.metrics_seen is
  'Facebook''s own "seen by" count for this group post. NULL = Facebook did not show one, which is not the same as zero.';
comment on column public.social_queue.metrics_views is
  'Plays on a video post ("N צפיות"). NULL = not a video, or Facebook showed no count.';
comment on column public.social_queue.metrics_at is
  'When the counters were last read off the post. NULL = never read.';

-- The worker picks the oldest-read published rows first; this keeps that cheap.
create index if not exists social_queue_metrics_idx
  on public.social_queue (status, metrics_at)
  where permalink is not null;


-- ─────────────────────────── from social-schema-v14.sql ───────────────────────────

-- v14 — comment on a whole round's posts, when the owner decides to.
--
-- The first version of this commented automatically, the instant each post
-- went up, and was configured once in ההגדרות. Both halves were wrong. The
-- decision of WHEN belongs to the person — a price list is worth commenting
-- after a post has had a few hours to be seen, not in the same second — and
-- the text belongs to the ROUND it is about, not to a global setting that
-- would put last month's offer under this month's posts.
--
-- So the comment lives on the campaign, and each published row carries its own
-- state for it:
--
--   ''        nothing was asked for
--   'pending' asked for, not done yet
--   'done'    left on the post, and verified there
--   'failed'  asked for and could not be placed
--
-- Four states, not a boolean. "Not asked" and "asked and failed" are opposite
-- facts about a post that is already live and cannot be taken back, and a
-- screen that shows them alike would have the owner believing a phone number
-- is under a post where it is not.
--
-- Safe to run more than once.

alter table public.social_campaigns
  add column if not exists comment_text text not null default '',
  add column if not exists comment_media jsonb not null default '[]'::jsonb,
  add column if not exists comment_gap_seconds integer not null default 30;

comment on column public.social_campaigns.comment_text is
  'What to leave as a comment on this round''s posts. Belongs to the round, so it is about the round.';
comment on column public.social_campaigns.comment_media is
  'One image for that comment, as a MediaItem array. Facebook takes one attachment per comment.';
comment on column public.social_campaigns.comment_gap_seconds is
  'Seconds between one comment and the next. The owner''s choice, per round — a hundred posts at ten seconds is twenty minutes, at sixty it is an hour and a half.';

alter table public.social_queue
  add column if not exists comment_status text not null default '',
  add column if not exists comment_at timestamptz;

comment on column public.social_queue.comment_status is
  '''''|pending|done|failed. Empty means nobody asked for a comment on this post — which is not the same as one that failed.';

-- The worker asks for the oldest pending row of a round; this keeps that cheap.
create index if not exists social_queue_comment_idx
  on public.social_queue (comment_status, published_at)
  where comment_status = 'pending';

-- ---------------------------------------------------------------------------
-- Why a comment did not make it.
--
-- "לא הצליח" is the answer that makes a person press the same button again.
-- A post that was deleted by the group's admin, a group that closed comments,
-- and a Facebook security screen mid-round are three different things to do
-- next, and only one of them is worth retrying. The worker writes the sentence
-- it would have said in the terminal; the screen shows it under the group.
alter table public.social_queue
  add column if not exists comment_note text not null default '',
  add column if not exists comment_shot text not null default '';

comment on column public.social_queue.comment_note is
  'A whole Hebrew sentence saying why the comment failed. Empty when it worked, or when nothing has been tried yet.';

-- And a picture of what the worker's browser was actually looking at.
--
-- Words were not enough. Three rounds went by on "לא מצאנו את הפוסט" while the
-- owner was looking straight at the post on his phone; the one thing neither
-- side could see was the page as the WORKER had it — the group, a login wall,
-- a feed that never loaded. Same private social-debug bucket the login
-- challenge uses, opened through a short-lived signed link.
comment on column public.social_queue.comment_shot is
  'Object path in the private social-debug bucket of the page when a comment failed. Empty when it worked.';

-- ============================================================================
-- v15 — WHO A ROW BELONGS TO. Nothing reads it yet.
--
-- The first step of turning a one-owner app into one several businesses can
-- use, and deliberately the smallest step that exists. After running it,
-- nothing about the app changes: no screen, no button, no publication. Not
-- one line of the app reads any of it.
--
-- It has to come first because every table here is protected by the same
-- policy — "any signed-in person may read and write every row" — which is
-- correct for one user and catastrophic for two, and cannot be replaced until
-- there is a column saying which business a row is for.
--
-- Safe to run again: everything is `if not exists`, nothing is deleted, no
-- value changes, no column becomes required.
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


-- ───────────────────────── from social-schema-v16.sql ─────────────────────────

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


-- ───────────────────────── from social-schema-v17.sql ─────────────────────────

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


-- ───────────────────────── from social-schema-v18.sql ─────────────────────────

-- ============================================================================
-- v18 — THE OTHER TWO MODULES. Leads, products and CRM settings stop being
-- visible to everyone who can sign in.
--
-- v16 fixed the publishing tables. It did not touch the three that belong to
-- the other halves of this app, and they carry the same `using (true)`:
--
--   public.leads         — every enquiry: name, phone, what they asked for.
--   public.crm_settings  — the CRM's key/value store, Facebook Ads credentials
--                          among them.
--   public.products      — the storefront, hidden rows included.
--
-- supabase/schema.sql says so in its own words: "There is no public sign-up
-- flow in this project — admin accounts are created by hand, so 'authenticated'
-- here always means an admin." That sentence is true today and stops being
-- true the day a customer can sign up. On that day, without this file, the
-- first customer to sign in can read every lead this business has ever taken.
--
-- These three tables are NOT multi-tenant and are not being made multi-tenant:
-- they are one business's CRM and one business's shop, and a customer of the
-- publishing product has no business in either. So the rule is simpler than
-- v16's — not "your business's rows" but "the owner of this app, or nobody".
--
-- WHAT DOES NOT CHANGE: the storefront's public read of published products
-- stays exactly as it was (`to anon using (published = true)`), because that
-- is the shop working, and the owner is a member of the owning business, so
-- every CRM and admin screen keeps behaving identically.
--
-- IT SKIPS ITSELF if there is no owning business to point at. Same discipline
-- as v16: it would rather leave a door open than lock the owner out of their
-- own leads.
--
-- Safe to run again. TO UNDO: supabase/social-schema-v18-rollback.sql
-- ============================================================================

-- WHICH BUSINESS IS THE OWNER'S. Marked rather than inferred: "the oldest row"
-- is true today and would quietly become false the first time these rows are
-- restored from a backup in a different order.
alter table public.social_tenants
  add column if not exists is_app_owner boolean not null default false;

comment on column public.social_tenants.is_app_owner is
  'True for the business that owns this installation — the one whose CRM, leads and storefront live here. Exactly one row should have it.';

-- The first business created is the owner's; every later one is a customer.
update public.social_tenants set is_app_owner = true
where id = (select id from public.social_tenants order by created_at, id limit 1)
  and not exists (select 1 from public.social_tenants where is_app_owner);

-- Is the person asking a member of the owning business?
--
-- SECURITY DEFINER for the same reason as social_tenant_ids(): it is called
-- from inside a policy on some other table and has to read the membership
-- table without that table's own rule getting in the way. It takes no
-- arguments, so it can only ever answer about the caller.
create or replace function public.social_is_app_owner()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.social_tenant_members m
    join public.social_tenants t on t.id = m.tenant_id
    where m.user_id = auth.uid() and t.is_app_owner
  )
$$;

grant execute on function public.social_is_app_owner() to authenticated, service_role;

do $$
declare
  t text;
  owner_exists boolean;
begin
  select exists (select 1 from public.social_tenants where is_app_owner) into owner_exists;
  if not owner_exists then
    raise notice 'אין עסק מסומן כבעל המערכת — ההרשאות של הלידים, המוצרים וה-CRM לא הוחלפו, בכוונה.';
    return;
  end if;
  if not exists (select 1 from public.social_tenant_members m
                 join public.social_tenants t on t.id = m.tenant_id where t.is_app_owner) then
    raise notice 'אף משתמש לא משויך לעסק של בעל המערכת — ההרשאות לא הוחלפו, בכוונה.';
    return;
  end if;

  -- leads
  if to_regclass('public.leads') is not null then
    execute $f$
      drop policy if exists "admin read leads" on public.leads;
      create policy "admin read leads" on public.leads for select to authenticated
        using (public.social_is_app_owner());
      drop policy if exists "admin insert leads" on public.leads;
      create policy "admin insert leads" on public.leads for insert to authenticated
        with check (public.social_is_app_owner());
      drop policy if exists "admin update leads" on public.leads;
      create policy "admin update leads" on public.leads for update to authenticated
        using (public.social_is_app_owner()) with check (public.social_is_app_owner());
      drop policy if exists "admin delete leads" on public.leads;
      create policy "admin delete leads" on public.leads for delete to authenticated
        using (public.social_is_app_owner());
    $f$;
  end if;

  -- crm_settings
  if to_regclass('public.crm_settings') is not null then
    execute $f$
      drop policy if exists "admin read settings" on public.crm_settings;
      create policy "admin read settings" on public.crm_settings for select to authenticated
        using (public.social_is_app_owner());
      drop policy if exists "admin write settings" on public.crm_settings;
      create policy "admin write settings" on public.crm_settings for insert to authenticated
        with check (public.social_is_app_owner());
      drop policy if exists "admin update settings" on public.crm_settings;
      create policy "admin update settings" on public.crm_settings for update to authenticated
        using (public.social_is_app_owner()) with check (public.social_is_app_owner());
      drop policy if exists "admin delete settings" on public.crm_settings;
      create policy "admin delete settings" on public.crm_settings for delete to authenticated
        using (public.social_is_app_owner());
    $f$;
  end if;

  -- products. The anon read of published rows is deliberately left alone — it
  -- is the shop, and it was never the leak.
  if to_regclass('public.products') is not null then
    execute $f$
      drop policy if exists "admin read all" on public.products;
      create policy "admin read all" on public.products for select to authenticated
        using (public.social_is_app_owner());
      drop policy if exists "admin insert" on public.products;
      create policy "admin insert" on public.products for insert to authenticated
        with check (public.social_is_app_owner());
      drop policy if exists "admin update" on public.products;
      create policy "admin update" on public.products for update to authenticated
        using (public.social_is_app_owner()) with check (public.social_is_app_owner());
      drop policy if exists "admin delete" on public.products;
      create policy "admin delete" on public.products for delete to authenticated
        using (public.social_is_app_owner());
    $f$;
  end if;

  -- The storefront's photo bucket: public read stays, writing becomes the
  -- owner's. A customer of the publishing product has no reason to upload a
  -- product photo, and every reason not to be able to replace one.
  execute $f$
    drop policy if exists "product images admin write" on storage.objects;
    create policy "product images admin write" on storage.objects for insert to authenticated
      with check (bucket_id = 'product-images' and public.social_is_app_owner());
    drop policy if exists "product images admin update" on storage.objects;
    create policy "product images admin update" on storage.objects for update to authenticated
      using (bucket_id = 'product-images' and public.social_is_app_owner())
      with check (bucket_id = 'product-images' and public.social_is_app_owner());
    drop policy if exists "product images admin delete" on storage.objects;
    create policy "product images admin delete" on storage.objects for delete to authenticated
      using (bucket_id = 'product-images' and public.social_is_app_owner());
  $f$;

  raise notice 'הלידים, ה-CRM והחנות שייכים מעכשיו רק לעסק של בעל המערכת.';
end $$;

select
  case when (select count(*) from pg_policies
               where schemaname = 'public' and tablename in ('leads', 'crm_settings', 'products')
                 and roles::text like '%authenticated%' and (qual = 'true' or with_check = 'true')) > 0
       then 'פתוח — כל מי שמחובר רואה את הלידים' else 'רק בעל המערכת' end as "לידים, CRM וחנות",
  (select count(*) from public.social_tenants where is_app_owner) as "עסקים מסומנים כבעלים";
