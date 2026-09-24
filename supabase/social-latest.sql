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
  add column if not exists comment_note text not null default '';

comment on column public.social_queue.comment_note is
  'A whole Hebrew sentence saying why the comment failed. Empty when it worked, or when nothing has been tried yet.';
