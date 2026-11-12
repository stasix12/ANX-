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
-- GUARDED, AND IT HAD TO BE. This statement NARROWS the list, and it sits in a
-- file whose whole promise is that it can be run again. Once the machine has
-- ever been sent a command added later — 'switch' the moment somebody uses the
-- profile picker — this line meets a row it forbids, and in Supabase's editor
-- one run is one transaction: the error here takes the WHOLE file down with
-- it, so every migration below never runs and the owner is told a column is
-- missing by a screen while the file that adds it keeps failing at line 162.
-- The later block that widens the list to today's is left unguarded, because a
-- superset cannot be violated by a row the database already accepted.
do $$
begin
  if exists (select 1 from public.social_worker_commands where command not in ('login', 'check', 'logout', 'resume', 'verify')) then
    raise notice 'לטבלת הפקודות יש כבר פקודות חדשות יותר — הגבלה ישנה לא הוחלה מחדש, בכוונה.';
  else
    alter table public.social_worker_commands
      drop constraint if exists social_worker_commands_command_check;
    alter table public.social_worker_commands
      add constraint social_worker_commands_command_check
      check (command in ('login', 'check', 'logout', 'resume', 'verify'));
  end if;
end $$;


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


-- ───────────────────────── from social-schema-v19.sql ─────────────────────────

-- ============================================================================
-- v19 — A NEW CUSTOMER GETS A BUSINESS OF THEIR OWN.
--
-- v16 made every row belong to a business and hid every row from anyone who is
-- not a member of one. That is correct, and it left a hole nobody could see:
-- NOTHING ANYWHERE CREATES A BUSINESS. Not one file under src/ or worker/
-- writes to social_tenants or social_tenant_members — I checked before writing
-- this. So a new customer signs in perfectly, and lands on a dashboard with
-- nothing on it and no explanation, and every row they try to create fails on
-- a NOT NULL they will never see.
--
-- Until now the answer was hand-written SQL per customer. This is the answer.
--
-- WHY A FUNCTION AND NOT A SERVER ROUTE. A route would need the service-role
-- key, which bypasses every policy in this database — the one key that must
-- never be near a signup path. A `security definer` function can do exactly
-- one thing and nothing else, and what it can do is written here in twenty
-- lines that anybody can read.
--
-- WHY IT CANNOT BE ABUSED. It ignores everything the caller says about WHO
-- they are: the member row it writes is always auth.uid(), never an argument.
-- And it refuses outright if the caller already belongs to a business, so it
-- is not a way to make a thousand workspaces or to join an existing one — the
-- membership table stays writable only from here, and only for yourself, and
-- only once.
--
-- FOR THE OWNER, NOTHING HAPPENS. You already belong to a business, so the
-- first check returns it and the function does nothing at all.
--
-- Safe to run again.
-- TO UNDO: drop function if exists public.social_claim_workspace(text);
-- ============================================================================

create or replace function public.social_claim_workspace(business_name text default '')
  returns uuid
  language plpgsql
  volatile
  security definer
  set search_path = public
as $$
declare
  me uuid := auth.uid();
  mine uuid;
  fresh uuid;
begin
  /*
   * A signed-in person, or nobody. The service role has no auth.uid(), and a
   * workspace created with no owner would be a workspace nobody can ever
   * reach — and one more row for the next person's query to trip over.
   */
  if me is null then
    raise exception 'social_claim_workspace requires a signed-in user';
  end if;

  /* Already has one: hand it back. Idempotent, so the app may call this on
     every start without thinking about it. */
  select tenant_id into mine from public.social_tenant_members where user_id = me limit 1;
  if mine is not null then
    return mine;
  end if;

  /*
   * The empty string, NOT null. social_tenants.name is `not null default ''`,
   * and a nullif() here turned "the app did not ask for a name yet" into a
   * constraint violation on the very path the app uses — found by running the
   * real call rather than a convenient one. The name is filled in later from
   * the business settings screen.
   */
  insert into public.social_tenants (name)
  values (btrim(coalesce(business_name, '')))
  returning id into fresh;

  insert into public.social_tenant_members (tenant_id, user_id) values (fresh, me);

  /*
   * THE DEFAULTS, or the first screen they open is an empty settings page and
   * the planner has no limits to obey. Copied from the same seed
   * social-schema.sql writes for a fresh install, kept here rather than
   * referenced so that a customer created today gets what today's app expects.
   */
  insert into public.social_settings (tenant_id, key, value) values
    (fresh, 'limits',  '{"maxPerDay": 6, "maxPerTargetPerDay": 2, "minGapMinutes": 45, "dedupeDays": 14}'::jsonb),
    (fresh, 'control', '{"paused": false, "rateLimitedUntil": null}'::jsonb),
    (fresh, 'business','{"name": "", "phone": "", "whatsapp": "", "cities": [], "services": []}'::jsonb),
    (fresh, 'browser', '{"debugMode": false, "testMode": false, "requireConfirmation": false, "concurrentJobs": 1, "maxPerCampaignPerDay": 8, "groupMinGapMinutes": 20}'::jsonb)
  on conflict do nothing;

  return fresh;
end
$$;

/*
 * EXECUTE for signed-in people only, and explicitly revoked from everybody
 * else. Postgres grants EXECUTE to PUBLIC by default, which on Supabase means
 * PostgREST would expose this as an RPC an anonymous caller could reach — and
 * while it would refuse them (auth.uid() is null), a function that creates
 * rows should not be reachable by someone with no account at all.
 */
revoke execute on function public.social_claim_workspace(text) from public;
grant execute on function public.social_claim_workspace(text) to authenticated;

comment on function public.social_claim_workspace(text) is
  'Creates the caller''s own business the first time they sign in, with default settings, and returns it. Returns the existing one if they already have it. Never creates a second.';


-- ============================================================================
-- ## v20 ## כפילויות בתור — לכל קבוצה פרסום אחד שממתין, ולא יותר
--
-- הבעלים ראה בדשבורד כל קבוצה פעמיים, באותה דקה, וכל השורות "דולג". שום דבר
-- לא פורסם פעמיים — הכלל ב-rules.ts חוסם את זה, ולכן הן דולגו — אבל תור
-- שארוך פי שתיים מהאמת, שחציו נכשל מסיבה שמתארת משהו שלא קרה, הוא תקלה
-- בפני עצמה. מעכשיו זה נמנע במסד הנתונים עצמו.
--
-- בטוח להרצה חוזרת. לא מוחק שום שורה.
-- לביטול: supabase/social-schema-v20-rollback.sql
-- ============================================================================
-- v20 — ONE WAITING PUBLICATION PER GROUP. Enforced by the database.
--
-- WHAT THE OWNER SAW, on their own dashboard:
--
--   ערד-ערדניקים          16:09   דולג
--   ערד-ערדניקים          16:09   דולג
--   ערד-פנינת הנגב        16:10   דולג
--   ערד-פנינת הנגב        16:10   דולג
--   פורום עסקים…          16:11   דולג
--   פורום עסקים…          16:11   דולג
--
-- Every group twice, in the same minute, and every row skipped. Nothing was
-- double-posted — rules.ts refuses a post that has already gone to a group,
-- which is exactly why they all read דולג — but a queue twice the length of
-- the truth, half of which fails for a reason describing something the owner
-- never did, is its own failure.
--
-- WHY NEITHER EXISTING GUARD CAUGHT IT. The queue's unique index is
-- (schedule_id, target_id, scheduled_at): it can only see inside ONE schedule.
-- The planner's own check matched on post_id: it could only see ONE post. A
-- second campaign, with a different post, planning the same groups from the
-- same base time with the same one-minute stagger, is invisible to both.
--
-- WHY THIS HAS TO BE IN THE DATABASE and not only in plan.ts. The planner
-- reads which groups are taken and then inserts. Two planners running at once
-- — the PC worker's tick and the server's /api/social/run, which is exactly
-- what "publish now" does — both read the same free group and both insert.
-- No amount of checking before the write can close that; only the write can.
--
-- SAFE TO RUN TWICE. It deletes nothing, it publishes nothing, and it refuses
-- rather than half-applying.

do $$
declare
  extra   integer;
  groups  integer;
begin
  -- ------------------------------------------------------------------ 1/2
  -- NOTHING IS COLLAPSED HERE ANY MORE — v33.
  --
  -- This block used to mark every group's SECOND waiting publication as
  -- skipped, because the index below could not be created while they existed.
  -- v20 was entitled to do that: at that moment those rows were the same post
  -- queued twice and could never have published. They can now — the owner
  -- asked for exactly that, in these words, on 02.11.2026: "לפתוח הכל, גם אותו
  -- פוסט" — so a file that is re-run over a live database must not reach into
  -- his queue and decide which of his campaigns loses its place in line.
  -- "אסור למחוק מידע."
  --
  -- The statement is gone rather than commented out, so there is nothing here
  -- for a future edit to switch back on by accident.
  extra := 0;

  -- ------------------------------------------------------------------ 2/2
  -- AND THE RULE ITSELF IS GONE, which is the change v33 exists for.
  --
  -- social_queue_one_open_per_target_idx refused a second waiting publication
  -- for a group ACROSS THE WHOLE ACCOUNT, so a second campaign could not take
  -- a group a first campaign was holding. His Russian-language round carried
  -- fifty groups, another campaign held an open row for every one, and the
  -- planner dropped all fifty every pass — "אף קבוצה לא נכנסה לתור", night
  -- after night.
  --
  -- NOTHING ABOUT PUBLISHING CHANGES BY DROPPING IT. This constraint only ever
  -- governed what may SIT in the queue. What actually goes out is still
  -- rules.ts: each group's own daily quota (maxPerTargetPerDay, counted across
  -- every post), the account's daily ceiling, the gap between any two
  -- publications, and the repeat window — which still defers a second row for
  -- the same post and group until that window has passed.
  --
  -- social_queue's own unique key (schedule_id, target_id, scheduled_at) is
  -- untouched, so a planner race still cannot write two identical rows.
  drop index if exists public.social_queue_one_open_per_target_idx;
  drop index if exists public.social_queue_one_open_per_target_post_idx;

  -- ------------------------------------------------------------------ 3/3
  select count(distinct target_id) into groups
    from public.social_queue
   where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing');

  raise notice 'v33: לקבוצה יכולים להמתין כמה פרסומים. כרגע ממתינים ל-% קבוצות.', groups;
  raise notice 'מה שמחליט מה באמת יוצא לא השתנה: מכסה יומית לכל קבוצה, תקרה יומית, המרווח בין פרסומים וחלון החזרה.';
end $$;

select
  'v20 + v33 הוחלו' as "מצב",
  count(*) filter (where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing')) as "ממתינים",
  count(distinct target_id) filter (where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing')) as "קבוצות",
  (select count(*) from pg_indexes where schemaname = 'public'
    and indexname in ('social_queue_one_open_per_target_idx', 'social_queue_one_open_per_target_post_idx')) as "אינדקסים חוסמים (0 = נפתח)"
from public.social_queue;
-- ─────────────────────────── from social-schema-v21.sql ───────────────────────────

-- v21 — the other profiles on the Facebook account, and which one publishes.
--
-- A customer opened the account menu on the machine that publishes and showed
-- two entries: his own name, and his business. Facebook has let one account
-- carry several profiles for years; this product knew only the one whose
-- c_user cookie the browser profile happened to hold, so every group post went
-- out under it and there was no way to say otherwise.
--
-- The list is written ONLY by the worker, and only from rows it read out of
-- Facebook's own menu — never from anything a screen sent it. It is not a
-- credential and not a secret: it is two or three display names that the
-- person it belongs to sees every time they open Facebook.
--
-- Nothing here changes which account is signed in. The switching is Facebook's
-- own feature, performed in Facebook's own menu; this column only remembers
-- what that menu offered, so a phone can show the choice without opening a
-- browser on a computer in another city.
--
-- Safe to run more than once.

alter table public.social_workers
  add column if not exists fb_profiles jsonb not null default '[]'::jsonb,
  add column if not exists fb_profiles_at timestamptz;

comment on column public.social_workers.fb_profiles is
  'Profiles Facebook''s account menu offered, as [{id,name}]. Written by the worker from what it read; [] means never read, or read and empty.';
comment on column public.social_workers.fb_profiles_at is
  'When that list was last read. Null when it never was — which the screen must not present as "no other profiles".';

-- AND THE DATABASE HAS TO ALLOW THE TWO NEW INSTRUCTIONS.
--
-- social_worker_commands.command carries a CHECK that lists every command by
-- name, and v21 added two — 'profiles' and 'switch' — without touching it. So
-- the dashboard's button was refused by the database before the machine ever
-- heard of it: pressed, nothing happened, and the reason was a constraint
-- nobody was looking at.
--
-- The list is replaced rather than extended, because that is the only form
-- that is safe to run twice.

-- GUARDED, AND IT HAD TO BE. This statement NARROWS the list, and it sits in a
-- file whose whole promise is that it can be run again. Once the machine has
-- ever been sent a command added later — 'switch' the moment somebody uses the
-- profile picker — this line meets a row it forbids, and in Supabase's editor
-- one run is one transaction: the error here takes the WHOLE file down with
-- it, so every migration below never runs and the owner is told a column is
-- missing by a screen while the file that adds it keeps failing at line 1208.
-- The later block that widens the list to today's is left unguarded, because a
-- superset cannot be violated by a row the database already accepted.
do $$
begin
  if exists (select 1 from public.social_worker_commands where command not in ('login', 'check', 'logout', 'resume', 'verify', 'profiles', 'switch')) then
    raise notice 'לטבלת הפקודות יש כבר פקודות חדשות יותר — הגבלה ישנה לא הוחלה מחדש, בכוונה.';
  else
    alter table public.social_worker_commands
      drop constraint if exists social_worker_commands_command_check;
    alter table public.social_worker_commands
      add constraint social_worker_commands_command_check
      check (command in ('login', 'check', 'logout', 'resume', 'verify', 'profiles', 'switch'));
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- v22 — WHICH GROUPS HAVE POTENTIAL CUSTOMERS IN THEM
-- ---------------------------------------------------------------------------
--
-- "תעשה שיהיה אפשר לפרסם רק לקבוצות שיש בהם לקוחות פוטנציאליים, שלא אשלח
-- לקבוצות שאין שם לקוחות שלי."
--
-- One mark per group, made by the owner. The app suggests and explains; only a
-- tap writes. THREE states and not two: 'unknown' is "nobody has said yet",
-- which is deliberately not the same as 'none' — every group that exists today
-- is unknown, so a product that read that as a refusal would stop a whole
-- round the first time the switch was turned on.
--
-- Nothing changes until the owner turns on "לפרסם רק לקבוצות עם לקוחות" in
-- settings. Until then this column is recorded and read, and refuses nothing.
--
-- Safe to run more than once.

alter table public.social_targets
-- NOTHING IN THE PRODUCT READS THIS COLUMN ANY MORE.
--
-- "לפרסם רק לאן שיש לקוחות" was removed at the owner's request: the card on
-- the groups screen, the marks, the filters, the settings switch, the
-- suggestion and the gate in rules.ts and the planner are all gone. The column
-- and the constraint below are deliberately LEFT ALONE — whatever he marked is
-- his, dropping a column is deleting it, and an unread column costs nothing.
-- The comment two statements down still describes the switch that enforced it;
-- it is kept verbatim so a re-run of this file changes nothing at all.
  add column if not exists audience text not null default 'unknown';

-- The list is replaced rather than extended, because that is the only form that
-- is safe to run twice.
alter table public.social_targets
  drop constraint if exists social_targets_audience_check;
alter table public.social_targets
  add constraint social_targets_audience_check
  check (audience in ('unknown', 'customers', 'none'));

comment on column public.social_targets.audience is
  'Owner''s own mark: customers = my customers are in this group, none = they are not, unknown = nobody has said yet. Enforced only while limits.customersOnly is on. Never written by an automatic classifier.';


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
  check (command in ('login', 'check', 'logout', 'resume', 'verify', 'profiles', 'switch', 'discover', 'join'));

-- ─────────────────────────── join ───────────────────────────
--
-- "שהתוכנה תפתח קבוצה קבוצה ותצרתף אוטומטי."
--
-- A command of its own rather than another source on `discover`, and the extra
-- line of SQL is the point: the discover branch in the worker is documented as
-- "No join, no request, no click", which is what makes it safe to point at a
-- search box somebody types into. A join is a different thing done to his
-- account and it says so by name, here and in the activity log.
--
-- The payload carries the group addresses. The worker re-checks every one of
-- them with parseGroupUrl before it opens anything: this list is built by a
-- screen, and a screen is not evidence about what a browser carrying a live
-- Facebook session should visit.


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


-- ─────────────────────────── from social-schema-v24.sql ───────────────────────────

-- v24 — תזמון פרסום לכל קמפיין: ימים, שעות, והפרש בין פוסט לפוסט.
--
-- OFF FOR EVERY CAMPAIGN THAT ALREADY EXISTS. A round that has never been
-- touched reads schedule_enabled = false, and rules.ts never reaches the
-- window check — nothing about its behaviour changes until the switch on its
-- card is turned on. See supabase/social-schema-v24.sql for the whole note.

alter table public.social_campaigns
  add column if not exists schedule_enabled boolean not null default false;

alter table public.social_campaigns
  add column if not exists schedule_days smallint[] not null default '{0,1,2,3,4}';

alter table public.social_campaigns
  add column if not exists schedule_start text not null default '08:00';
alter table public.social_campaigns
  add column if not exists schedule_end text not null default '22:00';

-- schedule_end IS NO LONGER READ BY ANYTHING, and it is kept anyway.
--
-- "יש להסיר לחלוטין את אפשרות שעת הסיום מממשק הכרטיס... להשאיר רק: שעת
--  התחלת הפרסום, הפרש בין פרסום לפרסום, ימי הפרסום שנבחרו."
--
-- A chosen day now runs from schedule_start to local midnight. readSchedule()
-- stopped reading this column and scheduleColumns() stopped writing it, so
-- every value already stored survives untouched — "אסור למחוק מידע" — and a
-- rollback reads the old hours straight back out. Dropping it would make that
-- impossible and would gain nothing: it is one text column per campaign.
comment on column public.social_campaigns.schedule_end is
  'DISUSED since the closing hour was removed from the product. A publishing day runs from schedule_start to local midnight. Kept, unread and unwritten, so the hours each campaign used to be set to are not lost.';

alter table public.social_campaigns
  add column if not exists schedule_gap_minutes smallint not null default 10;

-- 1 ולא 10, בשביל אותה סיבה שהעמודה בשניות עומדת על 30 — ראו את ההערה שם.
-- העמודה הזאת היא המראה המעוגלת של העמודה בשניות; gapMinutesFor(30) הוא 1,
-- ולכן שתי ברירות המחדל אומרות מהיום אותו דבר.
alter table public.social_campaigns
  alter column schedule_gap_minutes set default 1;

alter table public.social_campaigns
  drop constraint if exists social_campaigns_schedule_gap_check;
alter table public.social_campaigns
  add constraint social_campaigns_schedule_gap_check
  check (schedule_gap_minutes between 1 and 30);

comment on column public.social_campaigns.schedule_enabled is
  'Off = the window is not enforced at all, which is how every campaign that existed before v24 behaves. Only the panel on the campaign card turns it on.';
comment on column public.social_campaigns.schedule_days is
  'Weekdays this campaign may publish on, 0 = Sunday .. 6 = Saturday. An empty array holds every publication rather than dropping it.';
comment on column public.social_campaigns.schedule_gap_minutes is
  'Minutes between one publication OF THIS CAMPAIGN and the next, 1-30. Separate from settings.minGapMinutes, which is the whole account.';

-- ───────────────────────────────────────────────────────────────────────────
-- v26 — the gap between two publications of one campaign, in SECONDS.
--
-- "בהפרש פרסום בין פוסט לפוסט תעשה אופציה של 30 40 50 שניות בין פוסט לפוסט."
--
-- schedule_gap_minutes is a smallint checked between 1 and 30, so a minute
-- was the floor the UNIT imposed — not a decision anyone made. This adds the
-- seconds column beside it and leaves the old one in place, written in step
-- and rounded UP, so a dashboard or a worker that has not been updated reads
-- a value that is SLOWER than asked for rather than faster. Slower is the
-- safe direction for the one number in this product that paces how fast an
-- account posts.
--
-- Safe to run more than once. Nothing is dropped and no campaign changes
-- behaviour: every existing row is backfilled with exactly the gap it already
-- had.
-- ───────────────────────────────────────────────────────────────────────────

-- ברירת המחדל היא 30, לא 600, וזה לא סתירה ל"איטי זה הכיוון הבטוח" שכתוב
-- למעלה — זה אותו כלל בעמודה הנכונה. הכלל הזה מדבר על קצב החשבון, ושם מספר
-- קטן יותר הוא פרסום מהיר יותר. העמודה הזאת היא בלם של סבב אחד, והמנוע לוקח
-- max(קצב החשבון, מרווח הסבב): מספר קטן כאן לא יכול להאיץ כלום, כי קצב
-- החשבון נשאר השער הקובע. מספר גדול כאן כן יכול להאט הכל.
--
-- ו-600 כאן זה לא היפותטי: הקוד לא כתב את העמודה בלידה, כל סבב נולד עם עשר
-- דקות שאף אחד לא בחר, ו-20 מ-41 השורות החיות נשאו 600 ב-09.11.2026 — אחת
-- מהן מתחה סבב של 90 קבוצות על ארבעה ימים בזמן שהכרטיס אמר "מהיר". הקוד
-- כותב מהיום את המרווח במפורש, ולכן זו רק רשת ביטחון; רשת ביטחון של עשר
-- דקות היא בדיוק מה שהפיל את זה.
alter table public.social_campaigns
  add column if not exists schedule_gap_seconds smallint not null default 600;

alter table public.social_campaigns
  alter column schedule_gap_seconds set default 30;

-- Existing campaigns keep the gap they have. `default 600` above only covers
-- rows created from now on; this covers the ones already there.
--
-- העמודה בשניות היא המקור, והדקות שלידה הן רק מראה מעוגלת כלפי מעלה. לכן
-- מילוי שקורא את הדקות מרחיב מרווח שהבעל בחר: gapMinutesFor(40) מחזיר 1,
-- כלומר 60 שניות, וקצב של 40 שניות היה נמחק בכל הרצה חוזרת של הקובץ הזה.
-- מי שיש לו כבר ערך בשניות שומר עליו; רק שורה שאין לה ערך כזה נגזרת מהדקות.
update public.social_campaigns
   set schedule_gap_seconds = greatest(30, least(1800, coalesce(nullif(schedule_gap_seconds, 0), coalesce(schedule_gap_minutes, 10) * 60)))
 where schedule_gap_seconds is distinct from
       greatest(30, least(1800, coalesce(nullif(schedule_gap_seconds, 0), coalesce(schedule_gap_minutes, 10) * 60)));

alter table public.social_campaigns
  drop constraint if exists social_campaigns_schedule_gap_seconds_range;

-- Thirty seconds is the floor because it is the shortest step the machine has
-- any chance of meeting: rules.ts lets a row through up to PREP_LEAD_MS (75s)
-- early so the group page, the typing and the upload happen INSIDE the gap
-- rather than on top of it. Below that the owner is asking for something one
-- browser cannot keep.
alter table public.social_campaigns
  add constraint social_campaigns_schedule_gap_seconds_range
  check (schedule_gap_seconds between 30 and 1800);

comment on column public.social_campaigns.schedule_gap_seconds is
  'Seconds between two publications of this campaign (30..1800). Canonical since v26; schedule_gap_minutes is kept beside it, rounded up, for readers that predate this column.';
-- ---------------------------------------------------------------------------
-- v25 — חזרה יומית: לפרסם את אותו פוסט שוב, בימים ובשעות שכבר הוגדרו.
-- ---------------------------------------------------------------------------
--
-- "הקמפיין פעיל, אמור לצאת כל יום מ 8 בבוקר עד 22 בלילה כל דקה."
--
-- He believed he had configured a recurring publisher. He had not, and nothing
-- in the product did: v24's five columns are a WINDOW — they can only ever
-- prevent a publication, never cause one — and a round whose queue empties
-- resolves to 'completed' and stays there. Both halves of that are now said
-- plainly on the card (4.2.0). These two columns are the other answer: the
-- recurrence itself, asked for explicitly and turned on per round.
--
-- WHAT IT IS BUILT OUT OF, AND WHAT IS NEW. Almost nothing is new. A weekly
-- schedule row (social_schedules.mode = 'weekly') already re-plans itself for
-- ever — planQueue() reads `active = true` and only 'now'/'once'/'drip' retire
-- themselves — and slotsFor() already spreads one occasion's targets apart.
-- The single thing standing between that and what he asked for is the guard in
-- rules.ts that refuses to send the same post to the same group twice, ever.
--
-- SO THE GUARD IS NOT REMOVED. IT IS GIVEN A CLOCK.
--
-- `repeat_min_hours` is the minimum that must pass between one publication of
-- this post to a group and the next one to that same group. Off, the rule is
-- "never twice" exactly as before. On, it is "not again within N hours" — a
-- weaker rule, chosen deliberately and visibly, and still a rule: a round that
-- somehow ran twice in an afternoon cannot post twice to the same group, and a
-- retry after a failure cannot double-post.
--
-- 20 HOURS, NOT 24. The owner publishes in a daily window, and a round that
-- starts at 08:00 and takes four hours ends at 12:00; a 24-hour rule would then
-- hold tomorrow's 08:00 publication until noon and drag the round later every
-- day until it fell out of the window entirely. 20 hours is the longest value
-- that keeps a daily round at the same hour, and the floor below is what stops
-- it being set to something that would publish the same ad twice in a morning.
--
-- THIS IS AN AGGRESSIVE SETTING AND THE PRODUCT SAYS SO. Posting the same
-- advertisement into the same groups day after day is what group admins remove
-- people for and what Meta's own spam systems are looking for. Nothing here
-- hides the repetition, randomises it, or tries to make it harder to detect —
-- it publishes openly, through the owner's own session, at the pace he set, and
-- the screen that turns it on says what it risks. It is his account and his
-- decision; the product's job is to make the decision an informed one.
--
-- OFF FOR EVERY CAMPAIGN THAT ALREADY EXISTS. The default is false, nothing
-- changes until the switch is pressed, and a database that has not run this
-- file reads the same false through readRepeat().
--
-- Safe to run more than once. Nothing here deletes or rewrites a value.

alter table public.social_campaigns
  add column if not exists repeat_enabled boolean not null default false;

alter table public.social_campaigns
  add column if not exists repeat_min_hours smallint not null default 20;

-- The floor is the whole of the safety argument, so the database holds it too
-- and not only the editor: a value under 12 would let the same post reach the
-- same group twice inside one publishing day, which is not "daily" by any
-- reading and is the shape that gets an account restricted fastest.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'social_campaigns_repeat_min_hours_ck'
  ) then
    alter table public.social_campaigns
      add constraint social_campaigns_repeat_min_hours_ck
      check (repeat_min_hours between 12 and 168);
  end if;
end $$;

comment on column public.social_campaigns.repeat_enabled is
  'חזרה יומית: מותר לפרסם את אותו פוסט שוב לאותה קבוצה, בכפוף ל-repeat_min_hours. כבוי = לעולם לא פעמיים.';
comment on column public.social_campaigns.repeat_min_hours is
  'המינימום שחייב לעבור בין פרסום של הפוסט הזה לקבוצה לבין הפרסום הבא לאותה קבוצה. 12–168.';

-- ─────────────────────────── from social-schema-v27.sql ───────────────────────────

-- ───────────────────────────────────────────────────────────────────────────
-- v27 — ספירה אמיתית של כל סבב, ישירות מבסיס הנתונים.
--
-- "28/28, 100%, הסתיים — ובפועל המערכת מפרסמת בהרבה יותר קבוצות."
--
-- WHAT WENT WRONG. campaignStates() in src/lib/social/client.ts asked ONE
-- question for EVERY campaign at once: the 1,000 earliest rows of
-- social_queue, account-wide, ordered by scheduled_at ascending. It then
-- grouped them by campaign_id in JavaScript and set progress.total to the
-- length of each group.
--
-- Three things follow from that, and all three were on the owner's screen:
--
--   1. The ceiling is SHARED. One big campaign fills the window and a small
--      one is counted from whatever crumbs are left.
--   2. The order is ASCENDING, so what falls off the end is the furthest-out
--      rows — which are exactly the ones still waiting. A round whose pending
--      rows are dropped reports published === total, resolves to 'completed',
--      and draws 100%.
--   3. A repeating round is then filtered to TODAY in JavaScript, AFTER the
--      cut. The window is full of old rows, so "today's round" is counted
--      from the handful of today that happened to fit — and because the cut
--      favours the earliest, those are the ones that have already published.
--
-- 28 of 28 handled, 27 published, one skipped, 100%, "הסתיים". Every number
-- true about the slice and false about the round.
--
-- WHAT THIS FILE ADDS. A view that answers the count in the one place that
-- can answer it exactly — the database — with no row ever crossing the wire.
-- One request returns at most (campaigns × statuses) rows instead of a
-- thousand queue rows, so it is also cheaper than what it replaces, which
-- matters on a metered Israeli mobile plan.
--
-- `today` rides along beside `total` so a repeating round is counted for
-- today WITHOUT a second query and WITHOUT filtering a capped list — the
-- filter that made this worse is now part of the aggregate.
--
-- SAFE TO RUN AGAIN. It creates a view and an index. It reads nothing it does
-- not already read, writes nothing, drops nothing, and changes no row. To
-- undo it: `drop view public.social_campaign_counts;` — the app falls back to
-- counting rows exactly as it did before, which is the behaviour this file
-- replaces rather than depends on.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. the index the aggregate reads ──────────────────────────────────────
--
-- Without it, every dashboard poll is a sequential scan of social_queue. With
-- it the grouping is served from the index alone. The column order is the one
-- the view groups by, with scheduled_at last so the `today` filter is covered
-- by the same index.
create index if not exists social_queue_campaign_rollup_idx
  on public.social_queue (campaign_id, status, scheduled_at)
  where campaign_id is not null;

-- ─── 2. the view, and the one property that makes it safe ─────────────────
do $$
begin
  /*
   * security_invoker IS NOT OPTIONAL HERE.
   *
   * social_queue carries tenant_id and is under row-level security: a
   * customer may read only the rows of a business they belong to (see the
   * "admin select" policy in v16). A view in Postgres runs with the
   * privileges of the user who CREATED it unless this is set — so a view
   * created by the project owner would return every tenant's counts to every
   * signed-in user. That is a data leak, not a bug in a number.
   *
   * It needs Postgres 15 or newer. Supabase has been on 15 since 2023, but
   * rather than create an unsafe view on an older server this refuses and
   * says so: the app works without the view (it falls back to counting the
   * rows it can see), and a leak would not announce itself.
   */
  if current_setting('server_version_num')::int < 150000 then
    raise notice 'v27: בסיס הנתונים הזה ישן מדי ל-security_invoker (צריך Postgres 15 ומעלה). התצוגה לא נוצרה — האפליקציה תמשיך לעבוד בלעדיה, עם ספירה מקורבת.';
    return;
  end if;

  execute $v$
    create or replace view public.social_campaign_counts
    with (security_invoker = true) as
    select
      q.campaign_id,
      q.status,
      count(*)::int as total,
      /*
       * TODAY, IN THE ZONE THE OWNER LIVES IN, decided by the database.
       *
       * It used to be a JavaScript filter over a capped array. Here it is a
       * FILTER on the aggregate, so it is exact, it costs no extra request,
       * and it cannot be applied to the wrong set.
       *
       * `at time zone` resolves a timestamptz to local wall-clock time, so
       * the two Israeli clock changes a year are handled by the calendar
       * rather than by adding 86,400,000 milliseconds — the same discipline
       * src/lib/social/time.ts uses.
       *
       * scheduled_at and NOT published_at: the question a card answers is
       * "how is today's round going", and a row that belongs to today's round
       * but has not gone out yet is part of that answer.
       */
      count(*) filter (
        where (q.scheduled_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date
      )::int as today
    from public.social_queue q
    where q.campaign_id is not null
    group by q.campaign_id, q.status
  $v$;

  execute 'grant select on public.social_campaign_counts to authenticated';
  execute 'grant select on public.social_campaign_counts to service_role';

  raise notice 'v27: ספירת הסבבים מגיעה מעכשיו ישירות מבסיס הנתונים — בלי תקרה ובלי חיתוך.';
end $$;

comment on view public.social_campaign_counts is
  'Exact per-campaign, per-status queue counts (lifetime and today in Asia/Jerusalem). Added in v27 because campaignStates() was deriving progress.total from a 1,000-row account-wide slice, which made a round report 100% while rows were still waiting. security_invoker: it is subject to the caller''s RLS on social_queue.';

-- ─── 4. how many GROUPS a round reaches ────────────────────────────────────
--
-- "בפועל המערכת מפרסמת בהרבה יותר קבוצות."
--
-- A SEPARATE VIEW, because it is a different grouping and not a different
-- column. social_campaign_counts groups by (campaign, status); a distinct
-- count of groups cannot be summed out of it — a group that has one published
-- row and one waiting row would be counted twice.
--
-- The dashboard derived this in JavaScript as
-- `new Set([...upcoming, ...done].map(r => r.target_id)).size`, over the same
-- capped arrays that produced 28/28. So the card said "מפרסם ל-28 קבוצות"
-- about a round reaching 269 of them.
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    return;  -- see the notice in step 2
  end if;

  execute $v$
    create or replace view public.social_campaign_targets
    with (security_invoker = true) as
    select
      q.campaign_id,
      count(distinct q.target_id)::int as targets,
      count(distinct q.target_id) filter (
        where (q.scheduled_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date
      )::int as targets_today,
      /*
       * WHEN THE ROUND ACTUALLY STARTED, and when it last published.
       *
       * The card reads "התחיל לפני 6 שעות" off the rows it was handed, and
       * those rows are a PREVIEW of the most recent finished ones. The
       * earliest publication inside a newest-first preview is not the round's
       * first publication — it is the age of the oldest row that happened to
       * survive the cut, so the sentence drifts later every time the account
       * publishes anything at all. min() over every row is the only honest
       * answer, and the database is the only thing that can give it.
       */
      min(q.published_at) filter (where q.status = 'published') as first_published_at,
      max(q.published_at) filter (where q.status = 'published') as last_published_at,
      /*
       * ─── v38 ADDED THESE TWO, AND THEY GO LAST ───────────────────────────
       *
       * "שיספור רק את הקבוצות שאליהם אמור לצאת הפרסום וכמה פורסם מתוכם, לא
       *  צריך את המספר המנופח הזה זה מבלבל לקוחות."
       *
       * The card had the DENOMINATOR in groups (`targets`, above) and the
       * NUMERATOR in publications — "478 / 730" one line under "252 קבוצות".
       * Both numbers were true and the pair was not a ratio of anything: a
       * round plans the same group more than once, so the rows are a multiple
       * of the groups.
       *
       * AT THE END OF THE SELECT ON PURPOSE. `create or replace view` may add
       * columns after the existing ones and may not reorder or remove any, so
       * putting them here is what lets this file stay runnable twice — which
       * is the one promise it makes.
       *
       * `status = 'published'` and not `published_at is not null`: a row can
       * carry a timestamp and still have ended some other way, and status is
       * what every other figure in the app counts success by.
       *
       * TODAY IS SCHEDULED_AT HERE TOO, matching `targets_today` exactly. By
       * published_at instead, a group whose post went out this morning but was
       * due yesterday would be inside the numerator and outside the
       * denominator — a card reading "פורסם ל-253 מתוך 252 קבוצות".
       */
      count(distinct q.target_id) filter (where q.status = 'published')::int as targets_published,
      count(distinct q.target_id) filter (
        where q.status = 'published'
          and (q.scheduled_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date
      )::int as targets_published_today
    from public.social_queue q
    where q.campaign_id is not null
    group by q.campaign_id
  $v$;

  execute 'grant select on public.social_campaign_targets to authenticated';
  execute 'grant select on public.social_campaign_targets to service_role';
end $$;

comment on view public.social_campaign_targets is
  'Distinct groups a campaign reaches, and how many of them already have the post (lifetime, and today in Asia/Jerusalem). A separate grouping from social_campaign_counts because a distinct count cannot be summed across statuses — a group with one published row and one waiting row would be counted twice. targets_published / targets_published_today added in v38, at the end of the select so create-or-replace stays legal. security_invoker: subject to the caller''s RLS on social_queue.';

-- ─── 5. what it says right now ─────────────────────────────────────────────
select
  'v27 הוחל' as "מצב",
  count(distinct campaign_id) as "סבבים",
  sum(total) as "פרסומים בסך הכול",
  sum(today) as "מתוכם היום"
from public.social_campaign_counts;

-- ---------------------------------------------------------------------------
-- v28 — drip_gap_seconds. See supabase/social-schema-v28.sql for the whole
-- story; the short version is that src/lib/social/library.ts has written this
-- column on every multi-group launch since 12.10.2026 and no file in this
-- repository ever created it, so PostgREST answered PGRST204 and the launch
-- threw. A round already running was unaffected (the daily repeat writes no
-- drip_* fields), which is why publishing kept working while nothing new
-- could be started.
--
-- Nullable, so slots.ts keeps falling back to drip_gap_minutes. Safe to run
-- again. To undo: alter table public.social_schedules drop column drip_gap_seconds;
-- ---------------------------------------------------------------------------
alter table public.social_schedules
  add column if not exists drip_gap_seconds integer;

comment on column public.social_schedules.drip_gap_seconds is
  'מרווח בשניות בין פרסום לפרסום בהשקה מרובת קבוצות. גובר על drip_gap_minutes כשהוא קיים; ריק = להשתמש בדקות.';

do $$
declare n bigint;
begin
  select count(*) into n from public.social_schedules where drip_gap_seconds is null and mode <> 'now';
  raise notice 'v28: העמודה drip_gap_seconds נוספה. % תזמונים קיימים ימשיכו להשתמש בדקות.', n;
end $$;

-- ---------------------------------------------------------------------------
-- v29 — סבבים ביום (ריצות). See supabase/social-schema-v29.sql for the whole
-- story; the short version is that the engine has ALWAYS been able to run
-- several occasions a day — social_schedules.weekly is an array of 'HH:MM' per
-- weekday and slots.ts already loops it, in Asia/Jerusalem, across a
-- daylight-saving change — and what never existed is a way to say there is
-- more than one. Both writers of `weekly` build exactly [schedule_start].
--
-- This adds no scheduler. It adds the LIST those two writers build from, and
-- it holds the SECOND and later occasions only: round one is schedule_start,
-- the hour already on the card, because an hour stored in two places is the
-- defect this product has been bitten by twice.
--
-- Empty by default, which readRounds() resolves to "one round a day" — exactly
-- what every campaign does today. Safe to run again.
-- To undo: supabase/social-schema-v29-rollback.sql.
-- ---------------------------------------------------------------------------
alter table public.social_campaigns
  add column if not exists schedule_rounds jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'social_campaigns_schedule_rounds_ck'
  ) then
    alter table public.social_campaigns
      add constraint social_campaigns_schedule_rounds_ck
      check (jsonb_typeof(schedule_rounds) = 'array' and jsonb_array_length(schedule_rounds) <= 4);
  end if;
end $$;

comment on column public.social_campaigns.schedule_rounds is
  'סבבי פרסום נוספים באותו יום: [{"at":"HH:MM","enabled":true}]. הסבב הראשון הוא schedule_start ואינו כאן. ריק = סבב אחד ביום, ההתנהגות הקיימת.';

do $$
declare n bigint;
begin
  select count(*) into n from public.social_campaigns;
  raise notice 'v29: העמודה schedule_rounds נוספה. % קמפיינים קיימים ממשיכים עם סבב אחד ביום, ללא שינוי.', n;
end $$;

-- ---------------------------------------------------------------------------
-- v30 — round_at. See supabase/social-schema-v30.sql for the whole story; the
-- short version is that a row's round can be GUESSED from scheduled_at right
-- up until the row is deferred, and then the guess counts a publication in a
-- round it was never part of. So the round is recorded when the row is
-- created and never recomputed.
--
-- 'HH:MM' local, written by src/lib/social/plan.ts. NULL is "round one",
-- which is every row that exists today. Safe to run again.
-- To undo: supabase/social-schema-v30-rollback.sql.
-- ---------------------------------------------------------------------------
alter table public.social_queue
  add column if not exists round_at text;

comment on column public.social_queue.round_at is
  'הסבב ביום שאליו שייכת השורה: ''HH:MM'' מקומי, השעה שממנה המתכנן יצר אותה. ריק = הסבב הראשון, וכך גם כל שורה שנוצרה לפני הפיצ''ר.';

do $$
declare n bigint;
begin
  select count(*) into n from public.social_queue where round_at is null;
  raise notice 'v30: העמודה round_at נוספה. % שורות קיימות נספרות כסבב הראשון, ללא שינוי.', n;
end $$;

-- ---------------------------------------------------------------------------
-- v31 — חזרה יומית פעילה כברירת מחדל. See supabase/social-schema-v31.sql for
-- the whole story. The short version: "חזרה יומית תשאיר כברירת מחדל תמיד
-- עובדת" — the owner, 02.11.2026. The default becomes true, and every ACTIVE
-- campaign still carrying the old `false` is switched on. PAUSED and ARCHIVED
-- campaigns are left exactly as they are, so a deliberate "not this one"
-- survives for everything he is not currently running.
--
-- repeat_min_hours and its 12..168 CHECK are untouched: how CLOSE two
-- publications to one group may be does not change, only whether a second one
-- happens at all. That is what makes several rounds a day reach the same
-- groups twice.
--
-- Safe to run again — the update matches only rows still on false.
-- To undo: supabase/social-schema-v31-rollback.sql, which CANNOT restore
-- which active campaigns were off before this ran, and says so.
-- ---------------------------------------------------------------------------
alter table public.social_campaigns
  alter column repeat_enabled set default true;

update public.social_campaigns
   set repeat_enabled = true
 where repeat_enabled = false
   and status = 'active';

comment on column public.social_campaigns.repeat_enabled is
  'חזרה יומית: מותר לפרסם את אותו פוסט שוב לאותה קבוצה, בכפוף ל-repeat_min_hours. ברירת המחדל היא פעיל (v31); כבוי = לעולם לא פעמיים.';

do $$
declare n bigint; off_n bigint;
begin
  select count(*) into n from public.social_campaigns where repeat_enabled;
  select count(*) into off_n from public.social_campaigns where not repeat_enabled;
  raise notice 'v31: חזרה יומית פעילה ב-% קמפיינים. % נשארו כבויים (מושהים או שנעצרו).', n, off_n;
end $$;

-- ---------------------------------------------------------------------------
-- v32 — ההגנה של 12 שעות הופכת לברירת מחדל שאפשר לשנות. See
-- supabase/social-schema-v32.sql for the whole story. The short version:
-- "תוסיף אופציה בהגדרות לשחק עם זה" — the owner, 02.11.2026. The CHECK v25
-- added refused anything under 12 hours; that twelve was this product's own
-- judgement, not a rule of Facebook's. The database floor becomes 1 (the
-- smallest a whole-hours column can say) and the app still defaults to 12
-- for any account that has not changed it in Settings.
--
-- NO EXISTING CAMPAIGN CHANGES. Every stored value is already 12 or more.
-- To undo: supabase/social-schema-v32-rollback.sql, which REFUSES while any
-- campaign is under 12 rather than quietly raising it.
-- ---------------------------------------------------------------------------
alter table public.social_campaigns
  drop constraint if exists social_campaigns_repeat_min_hours_ck;

alter table public.social_campaigns
  add constraint social_campaigns_repeat_min_hours_ck
  check (repeat_min_hours between 0 and 168);

comment on column public.social_campaigns.repeat_min_hours is
  'המינימום שחייב לעבור בין פרסום של הפוסט הזה לקבוצה לבין הפרסום הבא לאותה קבוצה, בשעות. 0–168, כאשר 0 פירושו בלי מרווח מינימלי בכלל (v34). ברירת המחדל של האפליקציה היא 12 ונקבעת בהגדרות (repeatFloorHours).';

do $$
declare below int;
begin
  select count(*) into below from public.social_campaigns where repeat_min_hours < 12;
  raise notice 'v32: הרצפה במסד ירדה ל-שעה אחת. % קמפיינים נמצאים כרגע מתחת ל-12 שעות (ברירת המחדל של האפליקציה עדיין 12).', below;
end $$;


-- ─────────────────────── v40 · leave: לצאת מקבוצה ──────────────────────────
--
-- "תוסיף כאן אופציה מהירה לצאת מהקבוצות שכשלו ולא ניתן לפרסם בהן."
--
-- WITHOUT THIS LINE THE BUTTON IS DECORATIVE, and that is not a guess: the
-- comment forty lines above records v21 shipping two commands without
-- touching this CHECK — pressed, refused by the database before the machine
-- ever heard of them, and the reason invisible. worker/test/profiles.test.ts
-- was written after that and caught this one before it shipped.
--
-- The list is REPLACED rather than extended, which is the only form that is
-- safe to run twice.
--
-- TO UNDO: supabase/social-schema-v40-rollback.sql. It re-adds the list
-- without 'leave' and REFUSES while any command row still names it, rather
-- than leaving rows the constraint forbids.
-- ---------------------------------------------------------------------------
alter table public.social_worker_commands
  drop constraint if exists social_worker_commands_command_check;
alter table public.social_worker_commands
  add constraint social_worker_commands_command_check
  check (command in ('login', 'check', 'logout', 'resume', 'verify', 'profiles', 'switch', 'discover', 'join', 'leave'));

do $$
begin
  raise notice 'v40: הפקודה leave מותרת. היציאה מקבוצה מתבצעת במחשב של הלקוח, אחרי אישור במסך, והקבוצה מכובה רק על תשובה שפייסבוק נתנה.';
end $$;


-- ──────────── v41 · מחזור פרסום: הפסקה אוטומטית אחרי 100 פרסומים ───────────
--
-- "כל 100 פרסומים מוצלחים בקבוצות פייסבוק תתחיל הפסקה של 8 שעות."
-- "ביממה של 24 שעות אפשר עד שתי סבבים (200) קבוצות ככה אנחנו בסדר."
--
-- A TABLE OF ITS OWN, AND NOT A FIELD ON social_settings.control.
--
-- The `control` row is read-modify-written whole by at least four writers —
-- worker/social-worker.ts:1045 (the thaw), src/lib/social/server/worker.ts:246
-- (the mid-loop re-read), src/lib/social/server/graph.ts:137 (setCooldown) and
-- the dashboard's own clear. Each reads the jsonb, spreads it and writes it
-- back. A counter living there would lose increments to whichever writer read
-- first, which is the lost-update bug commit b70bd67 exists about — and this
-- counter decides whether the owner's account gets limited by Facebook, so it
-- is the last number in this product that may be approximately right.
--
-- NOT A WINDOW QUERY EITHER. "count the rows published since the cycle began"
-- looks obvious and is wrong here: the confirmation sweep at
-- worker/social-worker.ts:4610 writes `published_at: row.published_at ||
-- row.claimed_at || ...`, BACKDATING a late confirmation into a window that
-- has already closed. The same window read twice returns different numbers.
-- So the count is a cursor that only ever moves forward, incremented once by
-- the publication that earned it.
--
-- TO UNDO: supabase/social-schema-v41-rollback.sql. It drops the function and
-- the table; nothing else in the product reads them, and with the table gone
-- the engine falls back to exactly the behaviour it has today.
--
-- AMENDED BY v42 (12.11): a hold already running is re-computed from the
-- configured pause rather than frozen at the length it was created with, so
-- shortening the pause reaches the hold the owner is sitting inside. Only
-- ever shorter, and never past the day's ceiling. See the note at the
-- re-base below; to undo just that, supabase/social-schema-v42-rollback.sql.
-- ---------------------------------------------------------------------------
create table if not exists public.social_publish_cycle (
  tenant_id uuid primary key references public.social_tenants(id) on delete cascade,
  -- OFF BY DEFAULT. This is the feature flag: until the owner turns the card's
  -- switch on, social_publish_cycle_tick() counts nothing and holds nothing,
  -- so deploying this file changes no behaviour at all.
  enabled boolean not null default false,
  -- Publications inside the round that is running now. 0..limit-1.
  cycle_count integer not null default 0,
  -- Rounds completed inside the 24-hour window that began at window_started_at.
  rounds_in_window integer not null default 0,
  window_started_at timestamptz not null default now(),
  -- The hold itself. NULL, or an instant publishing may not resume before.
  rest_until timestamptz,
  -- When the current round began, for the card's own reading.
  cycle_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_publish_cycle enable row level security;

do $$
begin
  if to_regclass('public.social_tenant_members') is null then
    raise notice 'v41: אין עדיין חלוקה לעסקים — כללי ההרשאות של מחזור הפרסום לא נוצרו. הריצו קודם את החלק של v16.';
    return;
  end if;
  -- The same four names and the same shape as every other table here; see the
  -- long note above the v16 loop for why the names are reused rather than new.
  drop policy if exists "admin select" on public.social_publish_cycle;
  create policy "admin select" on public.social_publish_cycle for select to authenticated
    using (tenant_id in (select unnest(public.social_tenant_ids())));
  drop policy if exists "admin insert" on public.social_publish_cycle;
  create policy "admin insert" on public.social_publish_cycle for insert to authenticated
    with check (tenant_id in (select unnest(public.social_tenant_ids())));
  drop policy if exists "admin update" on public.social_publish_cycle;
  create policy "admin update" on public.social_publish_cycle for update to authenticated
    using (tenant_id in (select unnest(public.social_tenant_ids())))
    with check (tenant_id in (select unnest(public.social_tenant_ids())));
  drop policy if exists "admin delete" on public.social_publish_cycle;
  create policy "admin delete" on public.social_publish_cycle for delete to authenticated
    using (tenant_id in (select unnest(public.social_tenant_ids())));
end $$;

-- ─── AND THE TENANT STAMP, WHICHOUT WHICH THE SWITCH CANNOT BE PRESSED ────
--
-- Every tenant-scoped table in this product gets `social_stamp_tenant` as a
-- BEFORE INSERT trigger, created by the v16 loop over its own list of tables.
-- This table was added after that list and is therefore not in it — so an
-- insert that does not carry tenant_id fails on the primary key, which is
-- exactly what the dashboard's switch does: it must not send a business id
-- from the browser ("אסור לסמוך על ID שנשלח מה-Frontend בלבד"), so it sends
-- none and the database decides whose row it is.
--
-- FOUND BY READING THE DIFF, not by a test: every path in the suite reached
-- the row through social_publish_cycle_tick(), which inserts it itself, so
-- nothing ever exercised a plain insert. The first press of the switch on a
-- fresh business would have thrown.
do $$
begin
  if to_regproc('public.social_stamp_tenant') is null then
    raise notice 'v41: אין עדיין פונקציית שיוך לעסק — הריצו קודם את החלק של v16.';
    return;
  end if;
  drop trigger if exists social_publish_cycle_stamp_tenant on public.social_publish_cycle;
  create trigger social_publish_cycle_stamp_tenant
    before insert on public.social_publish_cycle
    for each row execute function public.social_stamp_tenant();
end $$;

drop trigger if exists social_publish_cycle_set_updated_at on public.social_publish_cycle;
create trigger social_publish_cycle_set_updated_at
  before update on public.social_publish_cycle
  for each row execute function public.set_updated_at();

-- ─────────── the one write, and the only place the ceiling is decided ──────
--
-- `select … for update` IS THE LOCK, and it is why this is a database function
-- rather than four lines in the worker. The brief asks for "נעילה אטומית או
-- מנגנון שקול כדי למנוע מעבר של מכסת 100 הפרסומים עקב עבודה מקבילה", and the
-- only primitive the app layer has is a compare-and-set on a row it read a
-- moment ago — which two lanes can both lose, or both win, depending on
-- timing. Here the second caller BLOCKS on the first caller's row lock until
-- its transaction commits, then reads the number the first one wrote. There
-- is no interleaving to get wrong.
--
-- IT IS CALLED ONCE PER PUBLICATION AND RETURNS THE WHOLE STATE, so the worker
-- never has to read the row separately and never computes the ceiling itself —
-- one decision, one place, whichever machine is publishing.
--
-- `security invoker` ON PURPOSE: the caller's own RLS decides which row this
-- can touch, exactly as it does for every other write in the product. A
-- definer function here would be a hole through tenancy for the sake of a
-- counter.
create or replace function public.social_publish_cycle_tick(
  p_limit integer default 100,
  p_rest_hours integer default 8,
  p_rounds_per_window integer default 2,
  p_count boolean default true
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  me uuid := public.social_default_tenant();
  row public.social_publish_cycle;
  now_ timestamptz := now();
  rest_candidate timestamptz;
  /*
   * WHICH CALL CLOSED THE ROUND, and it has to be said out loud rather than
   * inferred from `restUntil`. Every caller that arrives during a hold also
   * carries a restUntil — it is reporting the hold, not causing it — so
   * "did this publication start the pause" is unanswerable from the outside.
   * The worker needs it to write ONE log line per pause instead of one per
   * publication, and the concurrency test needs it to tell one winner from
   * seven lanes that merely saw the winner's work.
   */
  crossed boolean := false;
begin
  if me is null then
    -- No single business to act for. Say so rather than guessing one: the
    -- worker treats a null tenant as "the mechanism is not configured" and
    -- publishes exactly as it did before this file ran.
    return jsonb_build_object('ok', false, 'crossed', false, 'reason', 'no-tenant');
  end if;

  insert into public.social_publish_cycle (tenant_id) values (me) on conflict (tenant_id) do nothing;
  select * into row from public.social_publish_cycle where tenant_id = me for update;

  if not row.enabled then
    -- THE FEATURE FLAG, read inside the lock. Off: nothing is counted and
    -- nothing is held, and the row is left exactly as it was so turning the
    -- switch on later starts from a clean round rather than a stale one.
    return jsonb_build_object(
      'ok', true, 'enabled', false, 'crossed', false, 'count', row.cycle_count, 'limit', p_limit,
      'restUntil', null, 'resting', false, 'roundsInWindow', row.rounds_in_window
    );
  end if;

  -- THE 24-HOUR WINDOW ROLLS FIRST, so a round that completes just after the
  -- window turns over is the first of the new window and not the third of the
  -- old one.
  if now_ - row.window_started_at >= interval '24 hours' then
    row.window_started_at := now_;
    row.rounds_in_window := 0;
  end if;

  -- ─── v42 · A HOLD IN FORCE FOLLOWS A PAUSE THAT WAS SHORTENED ───────────
  --
  -- "אני רוצה שההשהיה בין סבב לסבב של 100 קבוצות יהיה 6 שעות ולא 8 כמו עכשיו.
  --  ואת הפרסום שרץ עכשיו גם שיהיה לפי המספרים האלה."
  --
  -- Before this, the instant was computed once when the round closed and was
  -- then immutable: shortening the pause changed the NEXT hold and left the
  -- running one at its old length. That is defensible — and it is not what
  -- the owner means when he shortens a pause while sitting inside one.
  --
  -- SO IT IS RE-COMPUTED FROM THE MOMENT THE ROUND CLOSED, every call, with
  -- the pause this caller is configured with. Two properties make it safe:
  --
  --   · ONLY EVER SHORTER (`least`). A configuration change can bring a hold
  --     forward, never push it out. That is what makes it monotone: a fleet
  --     running two versions converges on the shorter pause instead of
  --     flipping the instant back and forth on the owner's screen every time
  --     a different caller ticks. Raising the pause takes effect on the next
  --     round, which is the only direction where waiting costs nothing.
  --
  --   · THE DAY'S CEILING IS A FLOOR HERE. When the window's rounds are
  --     spent, the candidate is still pushed out to the end of the 24-hour
  --     window exactly as it was when the hold was created — so shortening
  --     the pause CANNOT buy a third round in a day. That is the property
  --     that actually protects the account, and it is asserted on its own in
  --     worker/test/cycle-db.test.ts.
  if row.rest_until is not null then
    rest_candidate := row.cycle_started_at + make_interval(hours => p_rest_hours);
    if row.rounds_in_window >= p_rounds_per_window then
      rest_candidate := greatest(rest_candidate, row.window_started_at + interval '24 hours');
    end if;
    row.rest_until := least(row.rest_until, rest_candidate);
    -- AND THE CEILING IS RE-IMPOSED, not merely preserved. `least` above can
    -- only keep a hold that is already shorter than the candidate — so a row
    -- whose rest_until sits BELOW the end of a spent window (a hand-edited
    -- row, a row written by an older version, a repair run by somebody at
    -- three in the morning) would have kept that shorter hold and released a
    -- third round inside the day. Caught by the test, not by reading: the
    -- first version of this block passed `least` alone and the ceiling
    -- assertion failed by exactly the ten minutes the fixture was off by.
    if row.rounds_in_window >= p_rounds_per_window then
      row.rest_until := greatest(row.rest_until, row.window_started_at + interval '24 hours');
    end if;
  end if;

  -- A hold that has expired is cleared HERE, on the first call past the
  -- instant, so the worker never has to write this row to resume. A hold the
  -- block above just brought into the past is cleared by this same line.
  if row.rest_until is not null and row.rest_until <= now_ then
    row.rest_until := null;
  end if;

  if p_count and row.rest_until is null then
    row.cycle_count := row.cycle_count + 1;
    if row.cycle_count >= p_limit then
      row.cycle_count := 0;
      row.rounds_in_window := row.rounds_in_window + 1;
      row.cycle_started_at := now_;
      rest_candidate := now_ + make_interval(hours => p_rest_hours);
      -- AND THE SECOND CEILING, which is the owner's own number: "ביממה של 24
      -- שעות אפשר עד שתי סבבים (200)". Eight hours alone is not enough to
      -- guarantee it — at the fast end of his measured pace (31/hour) a round
      -- takes 3.2 hours, so a cycle is 11.2 hours and a third round starts
      -- inside the day. When the window's rounds are spent, the hold runs to
      -- the end of the window instead, whichever is later.
      if row.rounds_in_window >= p_rounds_per_window then
        rest_candidate := greatest(rest_candidate, row.window_started_at + interval '24 hours');
      end if;
      row.rest_until := rest_candidate;
      crossed := true;
    end if;
  end if;

  update public.social_publish_cycle set
    cycle_count = row.cycle_count,
    rounds_in_window = row.rounds_in_window,
    window_started_at = row.window_started_at,
    cycle_started_at = row.cycle_started_at,
    rest_until = row.rest_until
  where tenant_id = me;

  return jsonb_build_object(
    'ok', true,
    'enabled', true,
    'crossed', crossed,
    'count', row.cycle_count,
    'limit', p_limit,
    'restUntil', row.rest_until,
    -- THE SERVER'S OWN VERDICT ON WHETHER IT IS HOLDING, and the reason it is
    -- here rather than worked out by the caller: "שינוי שעה במערכת (Clock
    -- change) לא משבש את ההפסקה". The expiry above was just applied against
    -- THIS server's now(), so a non-null instant at this point means the hold
    -- is in force — a fact, not a comparison the agent's PC clock could get
    -- wrong by hours. The engine gate trusts this; the card's countdown is
    -- still drawn from restUntil, because digits have to move once a second.
    'resting', row.rest_until is not null,
    'roundsInWindow', row.rounds_in_window,
    'roundsPerWindow', p_rounds_per_window,
    'windowStartedAt', row.window_started_at,
    'cycleStartedAt', row.cycle_started_at
  );
end
$$;

grant execute on function public.social_publish_cycle_tick(integer, integer, integer, boolean) to authenticated, service_role;

do $$
begin
  raise notice 'v41: מחזור הפרסום קיים והמנגנון כבוי (enabled=false). הוא לא סופר ולא עוצר דבר עד שהמתג בלוח הבקרה נדלק.';
end $$;

-- ───────── v43 · איפה ריצת ההצטרפות עומדת, בזמן אמת ───────────────────────
--
-- "אני תמיד רוצה שיהיה איזה שהוא אינדיקטור שאני ידע את ההתקדמות שלו ולא
--  שהוא נתקע."
--
-- מסך גילוי הקבוצות הראה ספינר אחד בתוך כפתור אחד — עד חצי שעה — בזמן
-- שהתוכנה במחשב פותחת קבוצה אחרי קבוצה ומחכה דקה־שתיים בין אחת לשנייה
-- בכוונה. אי אפשר היה להבדיל בין ריצה שמקצבת את עצמה לבין ריצה שמתה.
--
-- עמודה אחת, jsonb, ריקה כברירת מחדל. התוכנה במחשב דורסת אותה כשהריצה
-- מתקדמת — איזו קבוצה, באיזה שלב, כמה טופלו מתוך כמה, ומתי נגמרת ההפסקה
-- שבין קבוצה לקבוצה — והמסך קורא אותה באותה שאילתה שהוא כבר עושה ממילא.
--
-- למה לא payload: הוא מתרוקן באותה פקודה בדיוק שתופסת את השורה, וזה בכוונה —
-- פקודת התחברות מחזיקה בו סיסמה לשנייה.
--
-- למה לא result: הוא מוצג כמו שהוא בשני מסכים (כרטיס הדפדפן בלוח הבקרה ומסך
-- החשבון), ולכן JSON שם היה מופיע על המסך.
--
-- מה שומרים כאן: כתובת קבוצה, שם שלב ומספרים. לא סיסמה, לא טוקן, לא מידע אישי.
--
-- בטוח להריץ פעמיים. לא נוגע בנתונים קיימים, בשורות או בהרשאות. בלי העמודה
-- הזאת המסך ממשיך לעבוד — הוא מראה את תוצאות ההצטרפות מתוך יומן הפעילות,
-- רק בלי ארבעת השלבים בזמן אמת.
--
-- לביטול: supabase/social-schema-v43-rollback.sql
-- ---------------------------------------------------------------------------
alter table public.social_worker_commands
  add column if not exists progress jsonb;

comment on column public.social_worker_commands.progress is
  'Live position of a running command, overwritten by the worker as it goes. Read only by the discovery screen''s join reader, deliberately NOT part of COMMAND_COLUMNS. Never a store and never a secret: a group address, a stage name and counts.';

do $$
begin
  raise notice 'v43: העמודה progress קיימת. מסך גילוי הקבוצות יציג את שלבי ההצטרפות בזמן אמת אחרי שהתוכנה במחשב תתעדכן ל-4.66.0 ומעלה.';
end $$;
