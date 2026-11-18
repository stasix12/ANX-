-- ─── v45 · עיכוב התגובה נמדד בשעות, לא בשניות ────────────────────────────
--
-- "באופציות תשאיר רק עיכוב תגובה - לבחירה מ שעה אחת עד 12 שעות" — 18.11.2026
--
-- v44 נתנה ל-comment_delay_seconds טווח של 5 שניות עד שעה, כי הרפרנס של אותו
-- בוקר צייר "30 שניות". הבחירה עכשיו היא שעה עד שתים-עשרה שעות, ו-12 שעות הן
-- 43,200 שניות — מעל התקרה שה-CHECK מאפשר, ולכן ה-DB היה דוחה כל בחירה כזו.
--
-- העמודה לא משנה משמעות ולא משנה יחידה: היא הייתה שניות והיא נשארת שניות.
-- רק מה שמותר לשים בה זז.
--
-- ─── מה קורה לערכים שכבר בשדה ──────────────────────────────────────────────
--
-- כל סבב קיים מחזיק את ברירת המחדל של v44 — 30 — כי הפיצ'ר נולד באותו יום,
-- המתג כבוי בכל סבב, ואף מסך לא נתן לבחור ערך אחר. 30 נמוך מהמינימום החדש,
-- ולכן השורות האלה חייבות לעלות לשעה אחת לפני שה-CHECK נכנס לתוקף — אחרת
-- ההגבלה נדחית על נתונים קיימים והקובץ כולו נכשל.
--
-- זו לא מחיקת מידע: הערך שמועבר הוא ברירת מחדל שאיש לא בחר, והוא מועבר
-- למינימום החדש ולא לאפס. סבב שבו מישהו כן בחר ערך — אם קיים כזה — יעלה גם
-- הוא לשעה, כי אין יותר דרך לבטא פחות מזה, וזה נאמר כאן במפורש ולא בשקט.
--
-- מי שרוצה לדעת מה היה לפני, יריץ לפני הקובץ:
--   select id, name, comment_delay_seconds from public.social_campaigns
--     where comment_delay_seconds < 3600;
--
-- בטוח להריץ פעמיים.
--
-- לביטול: supabase/social-schema-v45-rollback.sql
-- ---------------------------------------------------------------------------

-- 1. ההגבלה הישנה יורדת לפני שהערכים זזים, כדי ששתי הפעולות לא יילחמו.
alter table public.social_campaigns
  drop constraint if exists social_campaigns_comment_delay_seconds_check;

-- 2. כל ערך שאי אפשר יותר לבטא עולה למינימום החדש — שעה אחת.
update public.social_campaigns
   set comment_delay_seconds = 3600
 where comment_delay_seconds < 3600;

-- 3. ברירת המחדל לסבב חדש היא שעה, לא חצי דקה.
alter table public.social_campaigns
  alter column comment_delay_seconds set default 3600;

-- 4. והטווח החדש: שעה עד שתים-עשרה שעות.
alter table public.social_campaigns
  add constraint social_campaigns_comment_delay_seconds_check
  check (comment_delay_seconds between 3600 and 43200);

comment on column public.social_campaigns.comment_delay_seconds is
  'How old a publication must be before its comment is armed, in SECONDS — chosen in whole hours on screen, 3600..43200 (one hour to twelve). NOT comment_gap_seconds, which is the spacing between one comment and the next: this one is the age of the post.';

do $$
begin
  raise notice 'v45: עיכוב התגובה הוא שעה עד 12 שעות, וברירת המחדל שעה. סבבים שהחזיקו פחות מזה עלו לשעה.';
end $$;
