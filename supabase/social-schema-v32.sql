-- ───────────────────────────────────────────────────────────────────────────
-- v32 — ההגנה של 12 שעות הופכת לברירת מחדל שאפשר לשנות, ולא לחוק.
--
-- "את ההגנה של החזרה יומית של אותו הפוסט לאותו קבוצה יש הגנה של 12 שעות
--  תוסיף אופציה בהגדרות לשחק עם זה." — בעל המערכת, 02.11.2026.
--
-- WHAT THIS CHANGES, AND IT IS ONE NUMBER. The CHECK v25 put on
-- repeat_min_hours refused anything under 12 hours. That twelve was this
-- product's own judgement — "not twice in one working day" — and never a rule
-- of Facebook's. The floor becomes 1 instead, which is simply the smallest
-- thing a whole-hours column can say, and WHICH value an account actually
-- uses is decided in the app by LimitsSettings.repeatFloorHours. That setting
-- lives in social_settings, which is schemaless jsonb, so it needs no column
-- here and no migration of its own.
--
-- NOTHING CHANGES FOR ANY EXISTING CAMPAIGN. Every stored value is already
-- 12 or more and stays exactly as it is; the app still defaults to 12 for an
-- account that has never touched the setting. This file only stops the
-- DATABASE from refusing a smaller number that the owner has deliberately
-- chosen.
--
-- WHY HE ASKED, measured rather than guessed: with rounds at 03:30, 06:30 and
-- 18:30 the engine deferred round two from 06:30 to 23:30, and that parked row
-- is the single open row a group is allowed — so it blocked round three
-- entirely. He asked for three publications a day and the system gave him two,
-- one of them at an hour he never chose, while the screen said it had saved
-- three.
--
-- WHAT IT COSTS, SAID PLAINLY. Republishing the same post to the same group is
-- the clearest spam signal a group admin or Meta looks for, and group
-- publishing runs through the owner's OWN browser session — so the account at
-- risk is his. This file does not lower anybody's protection; it lets him
-- lower his own, deliberately, from a screen that says what it means.
--
-- SAFE TO RUN AGAIN. The constraint is dropped and recreated.
-- To undo: supabase/social-schema-v32-rollback.sql — and read it first, it
-- cannot run while any campaign holds a value under 12.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.social_campaigns
  drop constraint if exists social_campaigns_repeat_min_hours_ck;

alter table public.social_campaigns
  add constraint social_campaigns_repeat_min_hours_ck
  check (repeat_min_hours between 1 and 168);

comment on column public.social_campaigns.repeat_min_hours is
  'המינימום שחייב לעבור בין פרסום של הפוסט הזה לקבוצה לבין הפרסום הבא לאותה קבוצה, בשעות. 1–168. ברירת המחדל של החשבון היא 12 ונקבעת בהגדרות (repeatFloorHours).';

do $$
declare below int;
begin
  select count(*) into below from public.social_campaigns where repeat_min_hours < 12;
  raise notice 'v32: הרצפה במסד ירדה ל-שעה אחת. % קמפיינים נמצאים כרגע מתחת ל-12 שעות (ברירת המחדל של האפליקציה עדיין 12).', below;
end $$;
