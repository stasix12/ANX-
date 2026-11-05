-- ---------------------------------------------------------------------------
-- social-schema-v38.sql — "לא צריך את המספר המנופח הזה זה מבלבל לקוחות"
--
-- מה v38 מוסיף, ולמה v27 לא היה יכול:
--
--   סה״כ פורסמו 204   ·   478 / 730   ·   252 קבוצות
--
-- שלושה מספרים נכונים על אותו כרטיס, ואף אחד מהם לא עונה על השאלה שבגללה
-- מסתכלים על הכרטיס: לכמה קבוצות מתוך ה-252 הפוסט כבר יצא.
--
-- 730 הוא מספר פרסומים, לא קבוצות. סבב מתכנן את אותה קבוצה יותר מפעם אחת,
-- ולכן מספר השורות הוא כפולה של מספר הקבוצות — ו"478 מתוך 730" ליד "252
-- קבוצות" נראה כמו סבב גדול פי שלושה מהעבודה האמיתית.
--
-- v27 הוסיף את המכנה בקבוצות (targets). את המונה הוא לא יכול היה להוסיף:
-- ספירה מובחנת (distinct) לא ניתנת לחישוב מתוך הספירה לפי סטטוס — קבוצה עם
-- שורה אחת שפורסמה ושורה אחת שממתינה הייתה נספרת פעמיים. זה חייב להיות
-- אגרגט נפרד, באותו view.
--
-- שתי עמודות חדשות בלבד, בסוף ה-view:
--   targets_published        — כמה קבוצות מובחנות קיבלו פרסום מוצלח (בכל החיים)
--   targets_published_today  — אותו דבר, להיום לפי אזור הזמן של ישראל
--
-- אין DELETE. אין DROP. אין שינוי בטבלה אחת. אין נתון שמשתנה. זה view —
-- הוא קורא, הוא לא כותב, ואפשר להריץ את הקובץ הזה שוב ושוב.
--
-- העמודות נוספות בסוף ה-SELECT במכוון: create or replace view מרשה להוסיף
-- עמודות אחרי הקיימות ואוסר לשנות סדר או להסיר, ולכן רק כך הקובץ נשאר ניתן
-- להרצה חוזרת.
--
-- החזרה לאחור: supabase/social-schema-v38-rollback.sql, שמחזיר את ה-view
-- לחמש העמודות של v27 בדיוק.
--
-- זה כלול כבר ב-supabase/social-latest.sql — הקובץ היחיד שצריך להריץ.
-- הקובץ הזה נשמר לידו בשביל ההיסטוריה של הלמה.
-- ---------------------------------------------------------------------------

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise notice 'v38: גרסת Postgres נמוכה מ-15 — ה-view לא עודכן. האפליקציה תספור קבוצות מתוך השורות שהיא רואה ותרשום שהמספר חלקי.';
    return;
  end if;

  execute $v$
    create or replace view public.social_campaign_targets
    with (security_invoker = true) as
    select
      q.campaign_id,
      count(distinct q.target_id)::int as targets,
      count(distinct q.target_id) filter (
        where (q.scheduled_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date
      )::int as targets_today,
      min(q.published_at) filter (where q.status = 'published') as first_published_at,
      max(q.published_at) filter (where q.status = 'published') as last_published_at,
      -- ── v38: כמה מהקבוצות האלה כבר קיבלו את הפוסט ──────────────────────
      --
      -- status = 'published' ולא published_at is not null: שורה יכולה לשאת
      -- חותמת זמן ובכל זאת להסתיים אחרת, וסטטוס הוא מה שכל מספר אחר
      -- באפליקציה סופר לפיו הצלחה.
      --
      -- "היום" נמדד לפי scheduled_at בדיוק כמו targets_today. לפי
      -- published_at, קבוצה שהפוסט שלה יצא הבוקר אבל נקבע לאתמול הייתה
      -- נכנסת למונה ולא למכנה — וכרטיס היה כותב "פורסם ל-253 מתוך 252".
      count(distinct q.target_id) filter (where q.status = 'published')::int as targets_published,
      count(distinct q.target_id) filter (
        where q.status = 'published'
          and (q.scheduled_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date
      )::int as targets_published_today
    from public.social_queue q
    where q.campaign_id is not null
    group by q.campaign_id
  $v$;

  execute 'grant select on public.social_campaign_targets to authenticated';
  execute 'grant select on public.social_campaign_targets to service_role';

  raise notice 'v38: הכרטיס יכול מעכשיו לכתוב "פורסם ל-X מתוך Y קבוצות" — שני המספרים מאותו אגרגט.';
end $$;

comment on view public.social_campaign_targets is
  'Distinct groups a campaign reaches, and how many of them already have the post (lifetime, and today in Asia/Jerusalem). A separate grouping from social_campaign_counts because a distinct count cannot be summed across statuses — a group with one published row and one waiting row would be counted twice. targets_published / targets_published_today added in v38, at the end of the select so create-or-replace stays legal. security_invoker: subject to the caller''s RLS on social_queue.';

-- ── מה זה אומר עכשיו ───────────────────────────────────────────────────────
select
  'v38 הוחל' as "מצב",
  count(*) as "סבבים",
  sum(targets) as "קבוצות בסך הכול",
  sum(targets_published) as "מתוכן קיבלו פרסום"
from public.social_campaign_targets;
