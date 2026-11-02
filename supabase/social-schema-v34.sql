-- v34 — THE REPEAT WINDOW MAY BE ZERO: NO MINIMUM AT ALL.
--
-- "לא הסרת את המגבלה של ה-20 שעות! תמחק את זה כבר." — the owner, 02.11.2026,
-- after "לפתוח הכל, גם אותו פוסט". Third telling, and he was right each time.
--
-- WHAT HE KEPT SEEING, two minutes old in his activity log, on a campaign he
-- had just created:
--
--   חזרה יומית הופעלה — "סבב פרסום" יחזור על עצמו בכל יום פרסום —
--   אותו פוסט לאותן קבוצות, לא יותר מפעם ב-20 שעות
--
-- WHY NEITHER EARLIER CHANGE TOUCHED IT. Making the floor adjustable (Settings
-- → repeatFloorHours) and dropping the queue constraint (v33) both left the
-- twenty alone, because it came from somewhere else entirely:
-- DEFAULT_CAMPAIGN_REPEAT.minHours was a hard-coded 20 in
-- src/lib/social/campaign-schedule.ts, and readRepeat() fell back to THAT
-- constant for any row with no stored window. The account's own floor could
-- only ever raise a stored number up toward itself; it could not lower a
-- constant. So every campaign he created was stamped with twenty hours and no
-- setting on any screen could reach it.
--
-- That constant is now MIN_REPEAT_HOURS (12), the documented default, and the
-- fallback is the ACCOUNT'S floor rather than the constant. This file is the
-- other half: the column's CHECK was `between 1 and 168`, so even with the code
-- willing to write a zero the database would have refused it, and the owner
-- would have met "שמירת החזרה נכשלה" instead of the setting he asked for.
--
-- WHAT ZERO MEANS, EXACTLY. rules.ts computes the window as
-- `repeat.minHours * 3_600_000` and compares published_at against
-- `now - window`. Nought milliseconds excludes nothing, so the same post may
-- reach the same group again on the very next round, with no minimum between
-- them. That is what he asked for, in those words, three times.
--
-- WHAT STILL STANDS, because none of it is this column: each group's own daily
-- quota (maxPerTargetPerDay), the account's daily ceiling (maxPerDay), and the
-- gap between any two publications (minGapMinutes + groupMinGapMinutes). A
-- zero window does not make the engine publish faster than the account's gap,
-- and it does not raise any daily number.
--
-- NOBODY GETS ZERO BY ACCIDENT. The column's default is unchanged, the app's
-- default is MIN_REPEAT_HOURS, and repeatFloorFrom() returns MIN_REPEAT_HOURS
-- for any account that has not set repeatFloorHours. Zero is reachable only by
-- typing it into Settings.
--
-- SAFE TO RUN AGAIN. The constraint is dropped and recreated; no row is read,
-- changed or deleted.
-- To undo: supabase/social-schema-v34-rollback.sql — read it first, it cannot
-- run while any campaign holds a zero.

alter table public.social_campaigns
  drop constraint if exists social_campaigns_repeat_min_hours_ck;

alter table public.social_campaigns
  add constraint social_campaigns_repeat_min_hours_ck
  check (repeat_min_hours between 0 and 168);

comment on column public.social_campaigns.repeat_min_hours is
  'המינימום שחייב לעבור בין פרסום של הפוסט הזה לקבוצה לבין הפרסום הבא לאותה קבוצה, בשעות. 0–168, כאשר 0 פירושו בלי מרווח מינימלי בכלל. ברירת המחדל של האפליקציה היא 12 ונקבעת בהגדרות (repeatFloorHours).';

do $$
declare zeroed int; below int;
begin
  select count(*) into zeroed from public.social_campaigns where repeat_min_hours = 0;
  select count(*) into below  from public.social_campaigns where repeat_min_hours < 12;
  raise notice 'v34: אפס מותר מעכשיו. % קמפיינים על 0 (בלי מרווח), % מתחת ל-12.', zeroed, below;
  raise notice 'מה שלא השתנה: המכסה היומית לכל קבוצה, התקרה היומית, והמרווח בין פרסום לפרסום.';
end $$;

select
  'v34 הוחל' as "מצב",
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'social_campaigns_repeat_min_hours_ck') as "הכלל במסד";
