-- ---------------------------------------------------------------------------
-- social-schema-v39-rollback.sql — החזרת המרווח של כל סבב למה שהיה.
--
-- מה זה עושה: מחזיר את schedule_gap_seconds ו-schedule_gap_minutes של כל
-- סבב לערך שנשמר בגיבוי של v39, ומחזיר את ברירת המחדל של העמודה ל-600.
--
-- מה זה לא עושה, וזה חייב להיאמר: זה מחזיר את המספרים, לא את החותמות. אם
-- כבר נבחר מצב פרסום והתור נחתם מחדש במרווח צפוף, החזרת המספר לא מרחיבה
-- בחזרה שורה שכבר בתור — המנוע מציית לחותמת. להרחיב תור שנכתב זה "הזיזו
-- את התור" בטיונר, וזו פעולה של הבעל.
--
-- אין DELETE. אין DROP. אפשר להריץ שוב ושוב.
--
-- טבלת הגיבוי נשארת במכוון. למחוק אותה זה מעשה נפרד ומכוון, אחרי שברור
-- שלא צריך אותה — ולא תופעת לוואי של החזרה לאחור.
-- ---------------------------------------------------------------------------

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'social_campaign_gap_backup_v39'
  ) then
    raise exception 'v39-rollback: טבלת הגיבוי social_campaign_gap_backup_v39 לא קיימת — v39 לא רץ כאן, ואין ממה להחזיר.';
  end if;
end $$;

-- ברירת המחדל חוזרת לערך שהיה לפני v39.
--
-- ודבר אחד שחייב להיאמר כאן: social-latest.sql עצמו קובע מהיום את ברירת
-- המחדל ל-30, ולכן הרצה שלו אחרי ההחזרה הזאת תחזיר אותה ל-30. זה לא באג
-- בהחזרה — ההחזרה מבטלת את v39, והרצה של social-latest.sql היא מעשה נפרד.
-- מי שרוצה להישאר על 600 צריך לשנות גם את הקובץ ההוא.
alter table public.social_campaigns alter column schedule_gap_seconds set default 600;
alter table public.social_campaigns alter column schedule_gap_minutes set default 10;

do $$
declare n int;
begin
  update public.social_campaigns c
     set schedule_gap_seconds = b.schedule_gap_seconds,
         schedule_gap_minutes = b.schedule_gap_minutes
    from public.social_campaign_gap_backup_v39 b
   where b.id = c.id
     and (c.schedule_gap_seconds, c.schedule_gap_minutes)
         is distinct from (b.schedule_gap_seconds, b.schedule_gap_minutes);

  get diagnostics n = row_count;
  raise notice 'v39-rollback: % סבבים הוחזרו למרווח שהיה להם לפני v39.', n;
end $$;

commit;

-- מה נשאר שונה מהגיבוי. רשימה ריקה היא התשובה הנכונה.
select c.id,
       c.name,
       c.status,
       b.schedule_gap_seconds as backup_seconds,
       c.schedule_gap_seconds as now_seconds
  from public.social_campaigns c
  join public.social_campaign_gap_backup_v39 b on b.id = c.id
 where c.schedule_gap_seconds is distinct from b.schedule_gap_seconds
 order by c.name;
