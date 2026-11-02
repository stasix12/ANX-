-- חזרה אחורה מ-v35 — מחזיר את החסימות.
--
-- v35 הוריד כל חסימה על פרסום חוזר, לבקשת בעל החשבון ובאחריותו. הקובץ הזה
-- מחזיר את ברירות המחדל השמרניות. הוא קיים כי כל מיגרציה בפרויקט הזה חייבת
-- דרך חזרה, ולא כי מישהו ביקש אותו.
--
-- ─── מה הוא מחזיר ומה לא ───────────────────────────────────────────────────
--
-- ברירת המחדל של העמודה והגדרות החשבון חוזרות. הקמפיינים הקיימים —
-- לא נוגעים בהם, וזה בכוונה: v35 כתב 0 על כל שורה קיימת ואין שום רישום של מה
-- היה שם קודם, אז "החזרה" הייתה ניחוש שנראה כמו שחזור. קמפיין שצריך חלון
-- יקבל אותו מהמסך שלו, בעין, במספר שהבעלים בוחר.
--
-- ⚠️ להריץ רק אחרי שמורידים ידנית את החזרה היומית בקמפיינים שרצים, אחרת
--    CHECK החדש יסרב לשורות שיושבות על 0.

do $$
declare
  open_rows int;
begin
  select count(*) into open_rows from public.social_campaigns where repeat_min_hours = 0;
  if open_rows > 0 then
    raise exception 'יש % קמפיינים עם חלון חזרה 0. החזרת ה-CHECK תסרב להם. קבעו להם חלון במסך הקמפיין ואז הריצו שוב.', open_rows;
  end if;
end $$;

alter table public.social_campaigns
  alter column repeat_min_hours set default 20;

alter table public.social_campaigns
  drop constraint if exists social_campaigns_repeat_min_hours_ck;
alter table public.social_campaigns
  add constraint social_campaigns_repeat_min_hours_ck
  check (repeat_min_hours between 12 and 168);

update public.social_settings
   set value = value
     || jsonb_build_object('repeatFloorHours', 12)
     || jsonb_build_object('blockRepeatToSameTarget', true)
     || jsonb_build_object('dedupeDays', 14)
     || jsonb_build_object('maxPerTargetPerDay', 2)
 where key = 'limits';

select
  'v35 בוטל' as "מצב",
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'social_campaigns'
      and column_name = 'repeat_min_hours') as "ברירת מחדל לקמפיין חדש",
  (select value ->> 'blockRepeatToSameTarget' from public.social_settings where key = 'limits') as "חסימת אותו פוסט לאותה קבוצה";
