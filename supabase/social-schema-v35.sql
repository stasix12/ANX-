-- v35 — כל החסימות יורדות. OPEN EVERYTHING.
--
-- "תוריד לגמרי את כל החסימות הקיימות כולל ה-20 שעות הכל אני לוקח אחריות על
--  המשתמש שלי." — הבעלים, 02.11.2026, 22:40
--
-- זה לא קובץ של תיקון באג. זאת החלטה של בעל החשבון על החשבון שלו, והיא נרשמת
-- כאן במילים שלו כדי שמי שיקרא את זה בעוד חצי שנה יידע שזה לא נפל בטעות.
--
-- ─── למה v34 לא הספיק, ולמה ה-20 שעות חזרו שוב ושוב ───────────────────────
--
-- v34 התיר לעמודה לקבל 0, והקוד הפסיק להשתמש בקבוע 20. מה שאף אחד מהם לא נגע
-- בו הוא ברירת המחדל של העמודה עצמה:
--
--     repeat_min_hours smallint not null default 20
--
-- וכשהבעלים מאפס סבב ומשיק מחדש, library.ts יוצר קמפיין חדש לגמרי עם
-- `saveCampaign({ name, status })` בלבד — כל שאר העמודות נופלות לברירות
-- המחדל. כלומר כל השקה מחדש ילדה קמפיין עם חלון של 20 שעות, לא משנה מה הוא
-- הגדיר קודם. זה מה שעצר את הפרסום הערב: rules.ts דחה בכ-20 שעות כל קבוצה
-- שכבר קיבלה את הפוסט היום, שזה כמעט כולן.
--
-- ─── מה הקובץ הזה עושה ─────────────────────────────────────────────────────
--
--   1. מאפס ל-0 את חלון החזרה בכל הקמפיינים הקיימים.
--   2. משנה את ברירת המחדל של העמודה ל-0, כדי שקמפיין חדש ייוולד פתוח.
--   3. מכבה בהגדרות החשבון את שלוש החסימות הנותרות: רצפת החזרה, הכלל שאוסר
--      על אותו פוסט לאותה קבוצה, וחלון התוכן הכפול.
--   4. מרים את המכסה היומית לכל קבוצה, שהייתה 2.
--
-- ─── מה הקובץ הזה *לא* נוגע בו, בכוונה ─────────────────────────────────────
--
-- המרווח בין שני פרסומים (30 שניות אצלו) נשאר בדיוק כמו שהוא. זה לא חסימה —
-- זה הקצב שהבעלים הגדיר ומסתכל עליו, והורדתו הייתה שולחת מאות פרסומים בלי
-- שום רווח ביניהם מהדפדפן שלו. אם הוא ירצה גם את זה, זה מסך ההגדרות.
--
-- ─── מה זה עולה, אמור במפורש ──────────────────────────────────────────────
--
-- פרסום חוזר של אותו פוסט לאותה קבוצה הוא הסימן הברור ביותר שמנהל קבוצה או
-- Meta מחפשים, והפרסום רץ מהדפדפן ומהחשבון האישי שלו. זאת הסיבה שהמספרים
-- האלה היו שם. הוא ביקש אותם למטה שלוש פעמים ולקח אחריות במפורש.
--
-- להרצה: Supabase → SQL Editor → להדביק → Run. אפשר להריץ שוב ושוב.
-- לחזרה אחורה: supabase/social-schema-v35-rollback.sql

do $$
declare
  touched int;
begin
  -- 1 ── כל הקמפיינים הקיימים
  update public.social_campaigns
     set repeat_min_hours = 0
   where repeat_min_hours is distinct from 0;
  get diagnostics touched = row_count;
  raise notice 'v35: % קמפיינים נפתחו (חלון החזרה אופס ל-0).', touched;
end $$;

-- 2 ── וכל קמפיין חדש ייוולד פתוח
alter table public.social_campaigns
  alter column repeat_min_hours set default 0;

-- ה-CHECK כבר מתיר 0 מאז v34; נאמר כאן שוב כדי שהרצה על מסד שדילג על v34
-- לא תיכשל על השורה הראשונה.
alter table public.social_campaigns
  drop constraint if exists social_campaigns_repeat_min_hours_ck;
alter table public.social_campaigns
  add constraint social_campaigns_repeat_min_hours_ck
  check (repeat_min_hours between 0 and 168);

-- 3+4 ── הגדרות החשבון.
--
-- ⚠️ בלי ON CONFLICT. היה כאן `on conflict (key)` והמסד ענה
--    "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification" — כי v17 הרחיב את המפתח הראשי של social_settings מ-(key)
--    ל-(tenant_id, key), ועל מסד שהריץ אותו אין יותר אילוץ על `key` לבדו.
--    התנאי ב-v17 מותנה, אז יש מסדים עם כל אחת משתי הצורות, ו-UPDATE עובד על
--    שתיהן. אם אין שורת 'limits' בכלל — נאמר על זה בקול ולא ננחש tenant_id,
--    כי שורה עם עסק שגוי גרועה מאין שורה.
--
-- social_settings הוא jsonb בלי סכימה, אז המפתחות נכתבים אחד-אחד לתוך הערך
-- הקיים ושום הגדרה אחרת (כולל המרווח של 30 השניות) לא נדרסת.
do $$
declare
  rows_hit int;
begin
  update public.social_settings
     set value = value
       || jsonb_build_object('repeatFloorHours', 0)
       || jsonb_build_object('blockRepeatToSameTarget', false)
       || jsonb_build_object('dedupeDays', 0)
       || jsonb_build_object('maxPerTargetPerDay', 2000)
       || jsonb_build_object('maxPerDay', greatest(coalesce((value ->> 'maxPerDay')::int, 0), 2000))
   where key = 'limits';
  get diagnostics rows_hit = row_count;
  if rows_hit = 0 then
    raise notice 'v35: לא נמצאה שורת הגדרות "limits". פתחו פעם אחת את מסך ההגדרות באפליקציה (זה יוצר אותה) והריצו את הקובץ שוב.';
  else
    raise notice 'v35: % שורות הגדרות עודכנו.', rows_hit;
  end if;
end $$;

-- ── מה יצא מזה, להסתכל עליו אחרי Run ─────────────────────────────────────
select
  'v35 הוחל' as "מצב",
  (select count(*) from public.social_campaigns where repeat_min_hours = 0) as "קמפיינים פתוחים",
  (select count(*) from public.social_campaigns where repeat_min_hours > 0) as "עדיין חסומים (0=הכל פתוח)",
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'social_campaigns'
      and column_name = 'repeat_min_hours') as "ברירת מחדל לקמפיין חדש",
  (select value ->> 'repeatFloorHours' from public.social_settings where key = 'limits') as "רצפת חזרה",
  (select value ->> 'blockRepeatToSameTarget' from public.social_settings where key = 'limits') as "חסימת אותו פוסט לאותה קבוצה",
  (select value ->> 'dedupeDays' from public.social_settings where key = 'limits') as "חלון תוכן כפול (ימים)",
  (select value ->> 'maxPerTargetPerDay' from public.social_settings where key = 'limits') as "מכסה יומית לקבוצה",
  (select value ->> 'maxPerDay' from public.social_settings where key = 'limits') as "מכסה יומית כוללת";
