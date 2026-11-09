-- ---------------------------------------------------------------------------
-- social-schema-v39.sql — "לא אמור ליהנות גם 600 שניות"
--
-- מה v39 מתקן:
--
--   social_campaigns.schedule_gap_seconds הוא עמודה עם `default 600`. אף
--   מסך לא כותב אותה כשנפתח סבב, ולכן כל סבב נולד עם מרווח של עשר דקות
--   שאף אחד לא בחר. plan.ts ו-rules.ts לוקחים max(קצב החשבון, מרווח הסבב)
--   כל עוד חלון השעות של הסבב דלוק — ולכן עשר הדקות האלה מנצחות כל מצב
--   פרסום שנבחר, גם "מהיר".
--
--   ככה סבב של 90 קבוצות נמתח על ארבעה ימים: 78 הפרשים רצופים של בדיוק
--   600.0 שניות, מ-09.11 15:00 עד 13.11 21:50, בזמן שהכרטיס אמר "מהיר".
--
-- הקוד תוקן בנפרד: סבב חדש נולד בקצב החשבון, שכפול לא יורש את המרווח של
-- המקור, ובחירת מצב פרסום מסנכרנת את כל הסבבים של החשבון. הקובץ הזה מטפל
-- רק בשורות שכבר קיימות — אלה שנולדו עם 600 לפני התיקון.
--
-- מה נמדד במסד ב-09.11.2026 (קריאה בלבד, לפני כל כתיבה):
--
--   41 סבבים, 3 עסקים מחזיקים אותם.
--   20 שורות נושאות בדיוק 600 שניות: 3 פעילות ו-17 בארכיון.
--   18 שורות בארכיון נושאות 60, שורה אחת בארכיון נושאת 40.
--   קצב החשבון: a79696d5 = 45 שניות · f7288ddf = 45 · beba0d53 = 120.
--   חמישה עסקים נוספים יושבים על 3900 שניות (65 דקות) ואין להם סבב אחד.
--
--   אישור 1 — 3 שורות פעילות שהמרווח שלהן גדול מקצב החשבון:
--     fd11fe06  f7288ddf   600 -> 45    (חלון כבוי)
--     dba6187c  f7288ddf   600 -> 45    (חלון כבוי)
--     8fc3fa4c  beba0d53   600 -> 120   (חלון כבוי)
--   שלושתן עם חלון שעות כבוי, ולכן הן לא מאטות כלום ברגע זה — והרגע שמישהו
--   מדליק חלון על אחת מהן, היא עוברת לפרסום אחד לעשר דקות.
--
--   אישור 2 — 35 שורות בארכיון, 23 מהן עם schedule_enabled = true. הן לא
--   מפרסמות כלום, ולכן זה לא דחוף; זה כן חשוב, כי לחיצה על "החזר סבב" על
--   אחת מ-23 האלה מחזירה בלם של עשר דקות לחיים.
--
-- מה הקובץ הזה לא עושה: הוא לא מזיז אף פרסום. השורות שכבר בתור שומרות את
-- החותמות שלהן; הקובץ מסיר בלם מהתכנון הבא ומשער התפיסה. להצמיד תור שכבר
-- נכתב למרווח החדש זה "הזיזו את התור" בטיונר, וזו פעולה של הבעל.
--
-- אין DELETE. אין DROP. אפשר להריץ שוב ושוב. הגיבוי נלקח פעם אחת, בהרצה
-- הראשונה, ושומר את המצב המקורי גם אם הקובץ ירוץ שוב.
-- החזרה לאחור: social-schema-v39-rollback.sql, שמשחזר מהגיבוי ערך-ערך.
--
-- ───────────────────────────────────────────────────────────────────────────
-- איך מריצים, ומה צריך לאשר במפורש
--
-- שני ה-UPDATE נעולים. בלי ההצהרות למטה הקובץ לוקח גיבוי, מתקן את ברירת
-- המחדל של העמודה, ולא נוגע באף שורה קיימת.
--
--   אישור 1 בלבד (3 שורות פעילות):
--     set anx.v39_live = 'yes';
--
--   אישור 2 בלבד (35 שורות בארכיון):
--     set anx.v39_archived = 'yes';
--
--   שניהם:
--     set anx.v39_live = 'yes';
--     set anx.v39_archived = 'yes';
--
-- את ההצהרה מריצים בחלון ה-SQL לפני הקובץ, באותו חיבור.
-- ---------------------------------------------------------------------------

begin;

-- ── 0. גיבוי לפני שנוגעים בשורה אחת ─────────────────────────────────────────
-- בלי זה אין החזרה לאחור. 41 מספרים הם לא משהו שמשחזרים מהזיכרון.
create table if not exists public.social_campaign_gap_backup_v39 (
  id                   uuid        primary key,
  schedule_gap_seconds smallint    not null,
  schedule_gap_minutes smallint    not null,
  status               text        not null,
  saved_at             timestamptz not null default now()
);

comment on table public.social_campaign_gap_backup_v39 is
  'גיבוי של v39: המרווח של כל סבב לפני שהוא יושר לקצב החשבון. social-schema-v39-rollback.sql קורא מכאן. on conflict do nothing — הגיבוי נלקח פעם אחת ולא נדרס בהרצה חוזרת.';

insert into public.social_campaign_gap_backup_v39 (id, schedule_gap_seconds, schedule_gap_minutes, status)
select id, schedule_gap_seconds, schedule_gap_minutes, status
  from public.social_campaigns
on conflict (id) do nothing;

-- ── 1. ברירת המחדל של העמודה — מסד שייבנה מחדש לא ייצר את התקלה שוב ─────────
-- 30 ו-1 הם MIN_GAP_SECONDS ו-gapMinutesFor(30) בקוד. הקוד כותב מהיום את
-- המרווח במפורש בלידה, ולכן ברירת המחדל היא רק רשת ביטחון — אבל רשת ביטחון
-- של עשר דקות היא בדיוק מה שהפיל את זה.
alter table public.social_campaigns alter column schedule_gap_seconds set default 30;
alter table public.social_campaigns alter column schedule_gap_minutes set default 1;

-- ── 2. קצב החשבון של כל עסק, מחושב בדיוק כמו accountGapSeconds() ────────────
-- העמודה בשניות מנצחת את הדקות שלידה כשהיא קיימת — אותה העדפה בדיוק
-- ש-splitAccountGap משתמשת בה בצד הכתיבה, כדי שהמספר שמוצג והמספר שנשמר
-- יהיו מספר אחד. 45 ו-20 הן ברירות המחדל שנשלחו (DEFAULT_LIMITS.minGapMinutes
-- ו-DEFAULT_BROWSER.groupMinGapMinutes), כלומר 3900 שניות לעסק שלא נגע בכלום.
-- נמחק קודם רק אם הוא כבר קיים באותו חיבור, כדי שהרצה שנייה באותו חלון
-- SQL לא תיפול על "view כבר קיים" ולא תדפיס אזהרה מבלבלת בהרצה ראשונה.
do $$ begin
  if to_regclass('pg_temp.v39_gap') is not null then execute 'drop view pg_temp.v39_gap'; end if;
end $$;
create temporary view v39_gap as
select t.id as tenant_id,
       coalesce(nullif(l.value->>'minGapSeconds', '')::int,
                coalesce(nullif(l.value->>'minGapMinutes', '')::int, 45) * 60)
     + coalesce(nullif(b.value->>'groupMinGapSeconds', '')::int,
                coalesce(nullif(b.value->>'groupMinGapMinutes', '')::int, 20) * 60) as seconds
  from public.social_tenants t
  left join public.social_settings l on l.tenant_id = t.id and l.key = 'limits'
  left join public.social_settings b on b.tenant_id = t.id and b.key = 'browser';

-- ── 3. אישור 1 — הסבבים הפעילים ─────────────────────────────────────────────
--
-- שני התנאים האחרונים הם הבטיחות, ושניהם במכוון:
--
--   g.seconds between 30 and 1800 — עסק שקצב החשבון שלו מחוץ לטווח ש-CHECK
--   על העמודה מרשה מדולג, לא נקצץ. לקצץ 15 שניות ל-30 זה לחתוך ללקוח כזה
--   את התפוקה בחצי, וזו לא החלטה של מיגרציה.
--
--   c.schedule_gap_seconds > g.seconds — סבב שכבר צפוף יותר מקצב החשבון לא
--   מורחב. הקובץ הזה מסיר בלם; הוא לא מוסיף אחד.
--
-- לפי המדידה של 09.11 התנאי הראשון לא מדלג על כלום: שלושת העסקים שמחזיקים
-- סבבים נמצאים בטווח. הוא קיים בשביל היום שבו זה לא יהיה נכון.
do $$
declare n int;
begin
  if current_setting('anx.v39_live', true) is distinct from 'yes' then
    raise notice 'v39: אישור 1 (סבבים פעילים) לא ניתן — לא נגעתי באף שורה פעילה. להרצה: set anx.v39_live = ''yes'';';
    return;
  end if;

  update public.social_campaigns c
     set schedule_gap_seconds = g.seconds,
         schedule_gap_minutes = greatest(1, least(30, ceil(g.seconds / 60.0)::int))
    from v39_gap g
   where c.tenant_id = g.tenant_id
     and c.status <> 'archived'
     and g.seconds between 30 and 1800
     and c.schedule_gap_seconds > g.seconds;

  get diagnostics n = row_count;
  raise notice 'v39: אישור 1 — % סבבים פעילים יושרו לקצב החשבון שלהם.', n;
end $$;

-- ── 4. אישור 2 — הסבבים בארכיון ─────────────────────────────────────────────
-- אותם תנאים בדיוק, status = 'archived'. הם מפרסמים אפס, ולכן זה לא דחוף.
-- זה נכלל כדי ש"החזר סבב" על אחת מ-23 השורות שבארכיון עם חלון דלוק לא
-- יחזיר בלם של עשר דקות לחיים.
do $$
declare n int;
begin
  if current_setting('anx.v39_archived', true) is distinct from 'yes' then
    raise notice 'v39: אישור 2 (ארכיון) לא ניתן — לא נגעתי באף שורה בארכיון. להרצה: set anx.v39_archived = ''yes'';';
    return;
  end if;

  update public.social_campaigns c
     set schedule_gap_seconds = g.seconds,
         schedule_gap_minutes = greatest(1, least(30, ceil(g.seconds / 60.0)::int))
    from v39_gap g
   where c.tenant_id = g.tenant_id
     and c.status = 'archived'
     and g.seconds between 30 and 1800
     and c.schedule_gap_seconds > g.seconds;

  get diagnostics n = row_count;
  raise notice 'v39: אישור 2 — % סבבים בארכיון יושרו לקצב החשבון שלהם.', n;
end $$;

commit;

-- ── 5. מה זז, ומה נשאר כמו שהיה — נקרא, לא מונח ─────────────────────────────
-- שתי השאילתות האלה הן חלק מהתיקון ולא קוסמטיקה: "הנחתי שזה עבד" הוא איך
-- שהתקלה הזאת חיה עשרים שורות.

-- (א) כל שורה שהמרווח שלה זז, עם היה/עכשיו.
select c.id,
       c.name,
       c.status,
       c.schedule_enabled                      as window_on,
       b.schedule_gap_seconds                  as was_seconds,
       c.schedule_gap_seconds                  as now_seconds,
       b.schedule_gap_minutes                  as was_minutes,
       c.schedule_gap_minutes                  as now_minutes
  from public.social_campaigns c
  join public.social_campaign_gap_backup_v39 b on b.id = c.id
 where c.schedule_gap_seconds is distinct from b.schedule_gap_seconds
 order by c.status, c.name;

-- (ב) כל שורה שנשארה מעל קצב החשבון של העסק שלה, ולמה. רשימה ריקה היא
--     התשובה הנכונה אחרי שני האישורים.
select c.id,
       c.name,
       c.status,
       c.schedule_enabled      as window_on,
       c.schedule_gap_seconds  as campaign_seconds,
       g.seconds               as account_seconds,
       case
         when g.seconds not between 30 and 1800
           then 'קצב החשבון מחוץ לטווח 30..1800 — מדולג במכוון, לא נקצץ'
         when c.status = 'archived'
           then 'בארכיון — דורש אישור 2'
         else 'פעיל — דורש אישור 1'
       end as why
  from public.social_campaigns c
  join v39_gap g on g.tenant_id = c.tenant_id
 where c.schedule_gap_seconds > g.seconds
 order by c.status, c.name;
