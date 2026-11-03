-- ─────────────────────────────────────────────────────────────────────────
-- v36 — המתג ש-v35 לא נגע בו, ודוח שאומר למה בפועל דולג
--
--   "זה לא מפרסם, זה פשוט מדלג על הפוסטים, כמו שהיה מקודם"
--   "0 מגבלה"  ·  "תתן לזה לפרסם בכל מחיר"
--
-- v35 אפס את repeat_min_hours, את repeatFloorHours, את dedupeDays ואת
-- blockRepeatToSameTarget. הוא לא נגע ב-repeat_enabled אפילו פעם אחת.
--
-- ו-rules.ts בודק את המתג לפני המרווח:
--
--     if (previous && previous.length > 0) {
--       if (!repeat.enabled) return skip('הפוסט הזה כבר פורסם ל-"…"');
--       ... רק אחרי זה נבדק המרווח ...
--
-- כלומר על פוסט שכבר פורסם ל-252 הקבוצות, מתג כבוי מדלג על כולן מיד, והמרווח
-- שאופס לא נבדק אפילו פעם אחת. זאת הסיבה ש"0 מגבלה" היה נכון ולא הספיק.
--
-- הקובץ הזה אינו משנה מבנה: הוא מדליק את המתג על סבבים קיימים, מוודא שברירת
-- המחדל שלו true (v31 עשה זאת; כאן זה idempotent למסד שלא הריץ אותו), ומדפיס
-- דוח. אין בו DELETE ואין DROP.
--
-- החזרה לאחור: supabase/social-schema-v36-rollback.sql
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- 1. ברירת המחדל, למקרה שמסד זה לא הריץ את v31.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'social_campaigns' and column_name = 'repeat_enabled'
  ) then
    alter table public.social_campaigns alter column repeat_enabled set default true;
  end if;
end $$;

-- 2. המתג נדלק על כל סבב שאינו בארכיון.
--    סבב בארכיון נשאר כפי שהוא: הוא נגמר, והדלקתו תחזיר פרסומים שהופסקו.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'social_campaigns' and column_name = 'repeat_enabled'
  ) then
    update public.social_campaigns
       set repeat_enabled = true
     where status <> 'archived'
       and repeat_enabled is distinct from true;
  end if;
end $$;

-- 3. וגם המרווח, למקרה שסבב נוצר אחרי v35 עם ערך ישן.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'social_campaigns' and column_name = 'repeat_min_hours'
  ) then
    update public.social_campaigns
       set repeat_min_hours = 0
     where status <> 'archived'
       and repeat_min_hours is distinct from 0;
  end if;
end $$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- הדוח. זה החלק שאומר למה בפועל דולג — הסיבה נשמרת על כל שורה דולגת
-- (social_queue.skip_reason) ומעולם לא נקראה מחוץ למסך אחד.
-- ─────────────────────────────────────────────────────────────────────────

-- א. מה הודלק
select
  count(*) filter (where status <> 'archived')                               as "סבבים פעילים",
  count(*) filter (where status <> 'archived' and repeat_enabled)            as "מתוכם עם חזרה דולקת",
  count(*) filter (where status <> 'archived' and coalesce(repeat_min_hours, 0) > 0) as "מתוכם עם מרווח שעדיין גדול מאפס"
from public.social_campaigns;

-- ב. ⇦ זאת השורה החשובה: כל סיבות הדילוג של 24 השעות האחרונות, לפי שכיחות.
select
  coalesce(nullif(skip_reason, ''), '(ללא סיבה רשומה)') as "סיבת הדילוג",
  count(*)                                              as "כמה שורות",
  max(updated_at)                                       as "האחרונה"
from public.social_queue
where status = 'skipped'
  and updated_at > now() - interval '24 hours'
group by 1
order by 2 desc
limit 20;

-- ג. קבוצות כבויות — הן מדולגות עם 'היעד "…" כבוי', וזה נראה כמו דילוג ללא סיבה.
select
  count(*) filter (where enabled)                                as "קבוצות דולקות",
  count(*) filter (where not enabled)                            as "קבוצות כבויות",
  count(*) filter (where not enabled and permission_status = 'revoked') as "מתוכן: פייסבוק שללה הרשאה"
from public.social_targets
where channel = 'facebook_group';
