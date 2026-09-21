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
