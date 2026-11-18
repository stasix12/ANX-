-- ─── v46 · "אחרי פוסט" מתחיל מרגע ההדלקה, לא מההיסטוריה ──────────────────
--
--   "אז מה זה כל התגובות שצריכות לצאת כאן? תוסיף לי כפתור איפוס"
--   — 18.11.2026, אחרי שהתור קפץ מ-25 ל-166 תוך חצי שעה
--
-- ─── מה היה שבור ──────────────────────────────────────────────────────────
--
-- החימוש האוטומטי חיפש "כל פרסום שיצא, שעדיין לא ביקשו עליו תגובה, ושעבר
-- העיכוב". לא הייתה לו רצפה תחתונה. כלומר ברגע שהמתג נדלק, כל מה שהסבב
-- פרסם אי פעם — גם מלפני שבועות — הפך בבת אחת למועמד.
--
-- "תגובה מהירה אחרי פוסט" אמורה לחול מרגע ההדלקה והלאה. העמודה הזו היא
-- הרגע הזה.
--
-- ─── למה עמודה ולא created_at או updated_at ──────────────────────────────
--
-- updated_at זז בכל כתיבה לשורה, כולל כתיבה שאין לה קשר לתגובות. created_at
-- הוא מתי נוצר הסבב, לא מתי נדלק המתג. ושניהם לא יודעים להבדיל בין הדלקה
-- ראשונה להדלקה שנייה אחרי כיבוי — וזה בדיוק ההבדל שקובע מה ייכנס לתור.
--
-- NULL משמעו "המתג מעולם לא נדלק מאז שהעמודה קיימת". החימוש מתייחס לזה
-- כאל חסם שלא ניתן לעבור: סבב כזה לא מחמש כלום עד שמישהו מדליק את המתג
-- ומטביע רגע. זו הברירה הבטוחה — סבב שכבר דולק היום יפסיק לגרור היסטוריה
-- ברגע שהקובץ הזה ירוץ, וימשיך מהרגע שבו יודלק מחדש.
--
-- ─── ומה קורה לתור שכבר נבנה ──────────────────────────────────────────────
--
-- הקובץ מרוקן אותו. רק שורות שממתינות (pending) ושלא נגעו בהן — לא
-- 'done', לא 'failed', לא 'unverified' ולא 'commenting'. אלה הן שורות
-- שאיש לא ביקש עליהן תגובה במפורש: החימוש סימן אותן בגלל הבאג.
--
-- זו לא מחיקת מידע: הפרסומים עצמם לא נגעים, ההיסטוריה של תגובות שכבר יצאו
-- נשמרת במלואה, והערות קודמות של שורות שהגיבו לא נמחקות.
--
-- ⚠ שורה שסומנה ידנית — לחיצה על "הוסף תגובה" בכרטיס הסבב — נמצאת באותו
--   מצב בדיוק ואין דרך להבדיל ביניהן, ולכן גם היא יוצאת מהתור. מי שרוצה
--   לסמן שוב ידנית יעשה זאת מהכרטיס. לראות מה עומד לצאת מהתור לפני:
--     select campaign_id, count(*) from public.social_queue
--      where comment_status = 'pending' group by 1;
--
-- בטוח להריץ פעמיים.
--
-- לביטול: supabase/social-schema-v46-rollback.sql
-- ---------------------------------------------------------------------------

alter table public.social_campaigns
  add column if not exists comment_auto_since timestamptz;

comment on column public.social_campaigns.comment_auto_since is
  'The instant comment_auto was last switched ON. The arm considers only publications whose published_at is at or after it, so turning the switch on never reaches back into what the round already published. NULL means the switch has not been turned on since this column existed, and the arm treats that as a floor nothing can pass.';

-- ─── והתור שנבנה מהבאג יוצא ────────────────────────────────────────────────
-- רק 'pending', ורק הוא. הפרסומים, ההיסטוריה וההערות לא נגעים.
update public.social_queue
   set comment_status = '', comment_at = null, comment_note = ''
 where comment_status = 'pending';

do $$
declare left_over integer;
begin
  select count(*) into left_over from public.social_queue where comment_status = 'pending';
  raise notice 'v46: comment_auto_since קיימת, והתור רוקן. ממתינות שנשארו: %', left_over;
end $$;
