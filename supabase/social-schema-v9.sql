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
