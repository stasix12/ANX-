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

alter table public.social_worker_commands
  drop constraint if exists social_worker_commands_command_check;
alter table public.social_worker_commands
  add constraint social_worker_commands_command_check
  check (command in ('login', 'check', 'logout', 'resume', 'verify', 'profiles', 'switch'));
