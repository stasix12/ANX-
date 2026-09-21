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
