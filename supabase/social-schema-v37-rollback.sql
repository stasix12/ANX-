-- ---------------------------------------------------------------------------
-- social-schema-v37-rollback.sql
--
-- מחזיר ערך-ערך מ-public.social_v37_backup: את מתג חלון השעות בכל קמפיין
-- שכובה, ואת חותמת הזמן המקורית בכל שורה שהוזזה. לא מוחק את הגיבוי —
-- מי שרוצה לנקות אותו עושה את זה במפורש, אחרי שראה שהתור חזר למקומו.
-- ---------------------------------------------------------------------------

begin;

do $$
declare n int;
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'social_v37_backup') then
    raise notice 'אין טבלת גיבוי — v37 לא רץ כאן, ואין מה להחזיר';
    return;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'social_campaigns'
                and column_name = 'schedule_enabled') then
    update public.social_campaigns c
       set schedule_enabled = b.flag
      from public.social_v37_backup b
     where b.kind = 'campaign' and b.id = c.id;
    get diagnostics n = row_count;
    raise notice 'חלון שעות הוחזר ב-% קמפיינים', n;
  end if;

  update public.social_queue q
     set scheduled_at = b.scheduled_at
    from public.social_v37_backup b
   where b.kind = 'queue' and b.id = q.id
     and b.scheduled_at is not null
     -- שורה שכבר פורסמה מאז לא מוזזת אחורה: החותמת שלה היא עובדה עכשיו
     and q.published_at is null;
  get diagnostics n = row_count;
  raise notice '% חותמות זמן הוחזרו', n;
end $$;

commit;

select count(*) filter (where kind = 'campaign') as "קמפיינים בגיבוי",
       count(*) filter (where kind = 'queue')    as "שורות בגיבוי"
from public.social_v37_backup;
