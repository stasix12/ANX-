-- ───────────────────────────────────────────────────────────────────────────
-- v31 — חזרה יומית פעילה כברירת מחדל.
--
-- "חזרה יומית תשאיר כברירת מחדל תמיד עובדת." — בעל המערכת, 02.11.2026.
--
-- WHAT CHANGES. repeat_enabled defaults to true for every campaign created
-- from now on, and every ACTIVE campaign that still carries the old `false`
-- is switched on. src/lib/social/campaign-schedule.ts reads the same way:
-- `repeat_enabled !== false`, so only the switch, pressed, stops a repeat.
--
-- WHAT IT MEANS, and it is not a cosmetic default: the same post goes to the
-- same groups on every publishing day, no sooner than repeat_min_hours apart.
-- That is what the amber paragraph on the card warns about — group admins
-- remove people for it and Meta's spam systems look for it. It is the owner's
-- decision about his own account; this file is him making it.
--
-- WHAT IS NOT TOUCHED:
--   · repeat_min_hours, and its 12..168 CHECK. How CLOSE two publications to
--     one group may be is unchanged; only whether they happen at all.
--   · the never-twice-inside-the-window rule in rules.ts.
--   · campaigns that are PAUSED or ARCHIVED. Only `status = 'active'` rows
--     are switched on, so a round the owner stopped stays as he left it and
--     the information "this one was deliberately not repeating" survives for
--     everything he is not currently running.
--
-- THE ROLLBACK CANNOT PUT EVERY CAMPAIGN BACK, and says so: which ACTIVE
-- campaigns were off before this ran is not recorded anywhere. It restores
-- the default and leaves the rows. Read v31-rollback before running it.
--
-- SAFE TO RUN AGAIN. The update matches only rows still on false.
-- ───────────────────────────────────────────────────────────────────────────

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
