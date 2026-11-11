-- ───────────────── v40 ROLLBACK · take 'leave' back out ────────────────────
--
-- Undoes the one statement v40 added to supabase/social-latest.sql: the
-- `leave` command is removed from the CHECK on social_worker_commands.command,
-- so the dashboard's "צא מהקבוצה בפייסבוק" stops being accepted.
--
-- IT REFUSES RATHER THAN BREAKING THE TABLE. A constraint cannot be added
-- while rows violate it, and silently deleting somebody's command history to
-- make room for a rollback would be worse than the rollback not running. So
-- the count is taken first and the whole thing aborts with the number.
--
-- NOTHING ELSE IS TOUCHED. No group is switched back on, because leaving a
-- group happened on Facebook and this file cannot undo that; the groups the
-- feature switched off stay off, and the owner switches any of them back on
-- from the groups screen if he wants to.
-- ---------------------------------------------------------------------------
do $$
declare stuck int;
begin
  select count(*) into stuck from public.social_worker_commands where command = 'leave';
  if stuck > 0 then
    raise exception 'v40 rollback: יש % שורות פקודה מסוג leave. מחקו או שנו אותן קודם — הרולבק לא נוגע בהיסטוריה.', stuck;
  end if;
end $$;

alter table public.social_worker_commands
  drop constraint if exists social_worker_commands_command_check;
alter table public.social_worker_commands
  add constraint social_worker_commands_command_check
  check (command in ('login', 'check', 'logout', 'resume', 'verify', 'profiles', 'switch', 'discover', 'join'));

do $$
begin
  raise notice 'v40 rollback: הפקודה leave כבר לא מתקבלת. הכפתור במסך יחזיר שגיאה עד שתריצו שוב את social-latest.sql.';
end $$;
