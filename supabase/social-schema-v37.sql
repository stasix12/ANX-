-- ---------------------------------------------------------------------------
-- social-schema-v37.sql — "תתן לזה לפרסם בכל מחיר"
--
-- מה v37 מתקן, ולמה v36 לא היה יכול:
--
--   הבא יוצא: 03/11 10:28  ·  עכשיו: 03/11 03:22  ·  בתור: 561
--
-- אין שורה אחת שהגיע זמנה. ה-worker לא מדלג ולא נתקע — הוא לא מצא כלום.
-- ולמה כל 561 השורות דחופות ל-10:28: לקמפיין יש חלון שעות פרסום
-- (schedule_enabled / schedule_start / schedule_end / schedule_days).
-- rules.ts לא מבטל שורה שמחוץ לחלון — הוא דוחה אותה לרגע הראשון שהחלון
-- מתיר. בשלוש וחצי בלילה החלון סגור, ולכן כל הסבב נדחף לפתיחה הבאה.
--
-- v36 הדליק את מתג החזרה ואיפס את המרווח. שניהם נכונים ושניהם לא נוגעים
-- בחלון — זה גדר אחרת, בטבלה אחרת, שנבדקת לפני כל קליק.
--
-- שני חלקים, ושניהם הפיכים במדויק:
--   1. מכבה את חלון השעות בכל קמפיין שאינו בארכיון  ("0 מגבלה").
--   2. מחזיר את השורות שממתינות בעתיד ל"עכשיו ואילך", במרווח שהקמפיין עצמו
--      הגדיר — כי כיבוי החלון לבד לא מפרסם כלום: השורות עדיין חתומות 10:28,
--      וה-worker מפרסם לפי scheduled_at.
--
-- אזהרה אחת, ואני רושם אותה כאן ולא רק בצ'אט: 561 פרסומים שיוצאים בלילה
-- במרווחים קצרים הם בדיוק מה שגורם לפייסבוק להגביל חשבון. החלון קיים כדי
-- למנוע את זה. אתה אמרת "0 מגבלה" ולקחת אחריות — אז זה מה שהסקריפט עושה,
-- במרווח שהקמפיין שלך הגדיר ולא מהיר ממנו.
--
-- אין DELETE. אין DROP. אין שינוי מבנה חוץ מטבלת גיבוי אחת שנוספת.
-- החזרה לאחור: social-schema-v37-rollback.sql, שמשחזר מהגיבוי ערך-ערך.
--
-- ⚠ הקובץ הזה הוא תיקון חד-פעמי מ-03.11.2026 והוחלף ב-social-schema-v39.sql.
-- הוא קורא את המרווח הגדול ביותר מכל הקמפיינים שאינם בארכיון וחותם לפיו את
-- כל התור — בכל העסקים, לא רק בשלך. כל עוד יש בטבלה שורה אחת עם 600 שניות,
-- הרצה שלו מעבירה כל לקוח לפרסום אחד לעשר דקות. לכן הוא נעול עכשיו: צריך
-- להצהיר במפורש שרוצים אותו (ראו את הנעילה מיד אחרי begin).
-- ---------------------------------------------------------------------------

begin;

-- ── נעילה: v37 לא רץ במקרה ──────────────────────────────────────────────────
-- v37 נכתב לערב אחד, 03.11.2026, ולמסד אחד. הוא חותם מחדש את כל התור לפי
-- המרווח האיטי ביותר שנמצא בטבלת הקמפיינים — חוצה עסקים, ללא סינון לפי
-- tenant. היום יש בטבלה שורות עם 600 שניות, ולכן הרצה שלו הייתה מאטה כל
-- לקוח לפרסום אחד לעשר דקות. את מה ש-v37 בא לתקן עושה היום v39.
-- הגוף של הסקריפט נשאר כפי שהיה בכוונה: זה תיעוד של מה שבוצע ב-03.11,
-- ולא מתקנים חשבון היסטורי. הנעילה מסירה את הסיכון בלי לשנות את הרשומה.
--
-- להרצה מכוונת, בפירוש ובידיעה:   set anx.v37_ack = 'yes';
do $$ begin
  if current_setting('anx.v37_ack', true) is distinct from 'yes' then
    raise exception 'v37 הוא תיקון חד-פעמי מ-03.11 והוחלף ב-v39. להרצה מכוונת: set anx.v37_ack = ''yes'';';
  end if;
end $$;

-- ── 0. גיבוי לפני שנוגעים בשורה אחת ─────────────────────────────────────────
-- בלי זה אין החזרה לאחור, ו-561 חותמות זמן הן לא משהו שמשחזרים מהזיכרון.

create table if not exists public.social_v37_backup (
  kind        text        not null,          -- 'campaign' | 'queue'
  id          uuid        not null,
  scheduled_at timestamptz,                  -- queue: החותמת המקורית
  flag        boolean,                       -- campaign: schedule_enabled המקורי
  taken_at    timestamptz not null default now(),
  primary key (kind, id)
);

comment on table public.social_v37_backup is
  'גיבוי של v37: החותמות והמתגים לפני כיבוי חלון השעות והחזרת התור ל"עכשיו". social-schema-v37-rollback.sql קורא מכאן.';

-- ── 1. חלון השעות — כיבוי, אם העמודה בכלל קיימת ─────────────────────────────
do $$
declare
  n int;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'social_campaigns'
       and column_name = 'schedule_enabled'
  ) then
    raise notice 'אין עמודת schedule_enabled — אין חלון שעות לכבות, ולא נעשה כלום';
  else
    insert into public.social_v37_backup (kind, id, flag)
    select 'campaign', c.id, c.schedule_enabled
      from public.social_campaigns c
     where c.status <> 'archived'
       and c.schedule_enabled is true
    on conflict (kind, id) do nothing;

    update public.social_campaigns
       set schedule_enabled = false
     where status <> 'archived'
       and schedule_enabled is true;

    get diagnostics n = row_count;
    raise notice 'חלון שעות כובה ב-% קמפיינים', n;
  end if;
end $$;

-- ── 2. התור חוזר ל"עכשיו ואילך" ─────────────────────────────────────────────
--
-- המרווח: הגדול מבין מה שהקמפיינים הפעילים הגדירו, ולא פחות מ-30 שניות.
-- מרווח אחד גלובלי ולא לכל קמפיין בנפרד, כי שני קמפיינים שמפרסמים לאותו
-- חשבון פייסבוק חולקים את אותו גרון — ושני טורים שמשולבים זה בזה הם בדיוק
-- מה שהחשבון רואה כפעילות אוטומטית.
--
-- row_number גלובלי גם מבטיח שלא יהיו שתי שורות באותו רגע, מה שהאינדקס
-- הייחודי (schedule_id, target_id, scheduled_at) היה דוחה בשקט.

do $$
declare
  gap_s  int;
  n      int;
  has_gap boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'social_campaigns'
       and column_name = 'schedule_gap_seconds'
  ) into has_gap;

  if has_gap then
    select greatest(30, coalesce(max(schedule_gap_seconds), 30))
      into gap_s
      from public.social_campaigns
     where status <> 'archived';
  else
    gap_s := 30;
  end if;

  raise notice 'מרווח שנבחר: % שניות', gap_s;

  -- גיבוי החותמות המקוריות
  insert into public.social_v37_backup (kind, id, scheduled_at)
  select 'queue', q.id, q.scheduled_at
    from public.social_queue q
    join public.social_campaigns c on c.id = q.campaign_id
   where q.status = 'scheduled'
     and q.published_at is null
     and q.scheduled_at > now()
     and c.status <> 'archived'
  on conflict (kind, id) do nothing;

  with ordered as (
    select q.id,
           row_number() over (order by q.scheduled_at, q.id) - 1 as n
      from public.social_queue q
      join public.social_campaigns c on c.id = q.campaign_id
     where q.status = 'scheduled'
       and q.published_at is null
       and q.scheduled_at > now()
       and c.status <> 'archived'
  )
  update public.social_queue q
     set scheduled_at = now() + (ordered.n * (gap_s || ' seconds')::interval)
    from ordered
   where q.id = ordered.id;

  get diagnostics n = row_count;
  raise notice '% שורות הוחזרו ל"עכשיו ואילך"', n;
end $$;

commit;

-- ── 3. מה קרה בפועל ─────────────────────────────────────────────────────────

select
  to_char(min(scheduled_at), 'DD/MM HH24:MI') as "הבא יוצא",
  to_char(max(scheduled_at), 'DD/MM HH24:MI') as "האחרון",
  count(*)                                    as "בתור",
  to_char(now(), 'DD/MM HH24:MI')             as "עכשיו"
from public.social_queue q
join public.social_campaigns c on c.id = q.campaign_id
where q.status = 'scheduled' and c.status <> 'archived';
