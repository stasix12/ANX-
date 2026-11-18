-- ─── v44 · תגובה אוטומטית אחרי פרסום ─────────────────────────────────────
--
-- "יש להסיר מלוח הבקרה את הכרטיס הקיים ״מצב פרסום חכם״ ולהחליפו בכרטיס
--  החדש: ״תגובה מהירה אחרי פוסט״... לאחר פרסום מוצלח, המערכת מנסה להוסיף
--  את התגובה לפוסט המתאים."
--
-- מה שכבר היה כאן, ולא נבנה מחדש: כל מנגנון התגובות. לסבב יש comment_text,
-- comment_media ו-comment_gap_seconds (v14), ולכל פרסום יש comment_status,
-- comment_at, comment_note ו-comment_shot. הזרוע שבמחשב כבר מוצאת את הפוסט,
-- מגיבה, מאמתת מול פייסבוק ומתעדת הצלחה וכישלון. מה שלא היה הוא מי מסמן
-- שורה כ"ממתינה לתגובה": עד היום רק אדם, בלחיצה על כפתור.
--
-- שתי עמודות, ולא יותר:
--
--   comment_auto            המתג. כבוי לכל סבב קיים, ולכן הקובץ הזה לא משנה
--                           את ההתנהגות של אף חשבון עד שמישהו מדליק אותו.
--
--   comment_delay_seconds   כמה להמתין אחרי שהפוסט יצא לפני שמגיבים עליו.
--                           זה לא comment_gap_seconds — ההוא הוא המרווח בין
--                           תגובה לתגובה, וזה הגיל המינימלי של הפוסט.
--
-- מה שבמפורש לא נוסף: עמודה ל"סוג תגובה" ועמודה ל"תצוגה". סוג התגובה כבר
-- נגזר מ-comment_media (יש תמונה או אין), ועמודה שנייה שאומרת את אותו דבר
-- היא מקור אמת שני לאותה עובדה. "תצוגה" היא היום ערך אחד — אחרי כל פוסט —
-- ועמודה שיכולה להחזיק רק ערך אחד אינה הגדרה.
--
-- בטוח להריץ פעמיים. לא נוגע בשורות קיימות, בנתונים או בהרשאות.
--
-- לביטול: supabase/social-schema-v44-rollback.sql
-- ---------------------------------------------------------------------------

alter table public.social_campaigns
  add column if not exists comment_auto boolean not null default false,
  add column if not exists comment_delay_seconds integer not null default 30;

comment on column public.social_campaigns.comment_auto is
  'When true, a publication of this round is armed for its comment once it has gone out and aged past comment_delay_seconds. The arming is the ONLY new behaviour: everything after it — finding the post, commenting, verifying, logging — is the mechanism that already existed for the owner-pressed button. Off for every existing round.';

comment on column public.social_campaigns.comment_delay_seconds is
  'How old a publication must be before its comment is armed, in seconds. NOT comment_gap_seconds, which is the spacing between one comment and the next: this one is the age of the post.';

-- טווח שפוי, באותה צורה שבה schedule_gap_seconds מוגן. 5 שניות זה "מיד
-- בפועל", ושעה היא גבול שמעליו אף אחד לא מתכוון לתגובה "אחרי הפוסט".
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'social_campaigns_comment_delay_seconds_check'
  ) then
    alter table public.social_campaigns
      add constraint social_campaigns_comment_delay_seconds_check
      check (comment_delay_seconds between 5 and 3600);
  end if;
end $$;

-- האינדקס שהזרוע תשתמש בו כשהיא מחפשת שורות לחימוש. בלעדיו הסריקה היא על
-- כל הפרסומים שיצאו אי פעם; איתה היא על אלה שעוד לא נגעו בהם.
create index if not exists social_queue_comment_arm_idx
  on public.social_queue (campaign_id, published_at)
  where status = 'published' and comment_status = '';

do $$
begin
  raise notice 'v44: comment_auto ו-comment_delay_seconds קיימות. כל הסבבים כבויים עד שמדליקים אותם מהכרטיס, והזרוע תתחיל לחמש שורות אחרי שהתוכנה במחשב תתעדכן.';
end $$;
