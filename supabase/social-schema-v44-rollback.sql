-- ─── ביטול v44 · הסרת התגובה האוטומטית ───────────────────────────────────
--
-- מחזיר את התגובות למצב שבו רק אדם מסמן פרסום כ"ממתין לתגובה", בלחיצה על
-- הכפתור בכרטיס הסבב. כל שאר המנגנון — מציאת הפוסט, התגובה, האימות והתיעוד
-- — לא נגע ולא זז, גם לפני הקובץ הזה וגם אחריו.
--
-- אחרי שמריצים אותו, גרסה של האתר שכן מכירה את העמודות תקרא false ו-30
-- כברירת מחדל ותמשיך לעבוד; הכרטיס פשוט לא יצליח לשמור את המתג.
--
-- ⚠ העמודות נמחקות ואיתן הבחירה של הלקוח לכל סבב. מי שרוצה לשמור אותה לפני
--   ביטול יריץ קודם:
--     select id, name, comment_auto, comment_delay_seconds
--       from public.social_campaigns where comment_auto;
-- ---------------------------------------------------------------------------

drop index if exists public.social_queue_comment_arm_idx;

alter table public.social_campaigns
  drop constraint if exists social_campaigns_comment_delay_seconds_check;

alter table public.social_campaigns
  drop column if exists comment_auto,
  drop column if exists comment_delay_seconds;

do $$
begin
  raise notice 'v44 בוטל: התגובות חזרו להיות ידניות בלבד.';
end $$;
