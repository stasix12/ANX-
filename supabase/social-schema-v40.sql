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
