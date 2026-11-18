-- ─── ביטול v45 · חזרה לטווח השניות של v44 ────────────────────────────────
--
-- מחזיר את comment_delay_seconds לטווח 5 שניות עד שעה ולברירת מחדל של 30.
--
-- ⚠ ערך שנבחר מעל שעה אינו יכול לשרוד את הביטול הזה: ה-CHECK הישן ידחה אותו.
--   לכן כל ערך מעל 3600 יורד ל-3600 — שעה — שהיא הערך החוקי הקרוב ביותר
--   למה שנבחר, ולא לברירת המחדל. מי שרוצה לשמור את הבחירות לפני הביטול יריץ:
--     select id, name, comment_delay_seconds from public.social_campaigns
--       where comment_delay_seconds > 3600;
--
-- הערכים שהועלו ל-3600 על ידי v45 לא חוזרים ל-30: אין לדעת מי מהם היה 30 מאז
-- ומי נבחר. המתג עצמו (comment_auto) לא נגע כאן בכלל.
-- ---------------------------------------------------------------------------

alter table public.social_campaigns
  drop constraint if exists social_campaigns_comment_delay_seconds_check;

update public.social_campaigns
   set comment_delay_seconds = 3600
 where comment_delay_seconds > 3600;

alter table public.social_campaigns
  alter column comment_delay_seconds set default 30;

alter table public.social_campaigns
  add constraint social_campaigns_comment_delay_seconds_check
  check (comment_delay_seconds between 5 and 3600);

do $$
begin
  raise notice 'v45 בוטל: עיכוב התגובה חזר לטווח 5 שניות עד שעה.';
end $$;
