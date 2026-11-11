-- ──────────── v41 ROLLBACK · take the publish cycle back out ───────────────
--
-- Undoes everything v41 added to supabase/social-latest.sql: the atomic
-- counter function and the table it locks. After this file runs, the dashboard
-- card disappears on its next load and the engine publishes exactly as it did
-- before v41, because every call site treats a missing table the same way it
-- treats a switched-off mechanism.
--
-- WHY THIS IS SAFE TO RUN ON A LIVE SYSTEM. social_publish_cycle holds no
-- publication, no campaign, no queue row and no history — only a counter, a
-- window and a hold instant, all of which are re-derivable by starting a fresh
-- cycle. Nothing else in the schema references it: it is the only table in the
-- product that nothing points at, which was a design choice for exactly this
-- moment.
--
-- WHAT IT DOES NOT DO: it does not resume a queue, publish anything, or touch
-- social_settings.control. A rollback that also started publishing would be
-- two decisions wearing one name.
--
-- THE ORDER MATTERS. The function is dropped first: while it exists over a
-- missing table, a worker mid-tick would get a relation error rather than the
-- quiet "no-tenant" answer it knows how to ignore.
-- ---------------------------------------------------------------------------

do $$
declare held timestamptz;
begin
  if to_regclass('public.social_publish_cycle') is null then
    raise notice 'v41 rollback: הטבלה לא קיימת — אין מה להסיר.';
    return;
  end if;
  select max(rest_until) into held from public.social_publish_cycle where rest_until > now();
  if held is not null then
    -- NOT AN ERROR, A WARNING. A hold in force is exactly the state somebody
    -- would roll back FROM, so refusing here would trap the owner behind the
    -- thing he is trying to undo. It is said out loud because the hold ends
    -- the moment the table goes, and that is the point.
    raise notice 'v41 rollback: יש הפסקה בתוקף עד %. היא מתבטלת עכשיו והפרסום יחזור מיד.', held;
  end if;
end $$;

drop function if exists public.social_publish_cycle_tick(integer, integer, integer, boolean);
drop table if exists public.social_publish_cycle;

do $$
begin
  raise notice 'v41 rollback: מחזור הפרסום הוסר. המנוע חוזר בדיוק להתנהגות שלפני v41, והכרטיסייה תיעלם מהלוח בטעינה הבאה.';
end $$;
