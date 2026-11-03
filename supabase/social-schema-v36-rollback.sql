-- החזרה לאחור של v36. מחזירה את ברירת המחדל של repeat_enabled ל-false, כפי
-- שהייתה לפני v31. היא אינה מכבה בחזרה סבבים שהודלקו: ערך false אינו ניתן
-- להבחנה מ"אף אחד מעולם לא בחר" (ראו readRepeat ב-campaign-schedule.ts), ולכן
-- כיבוי גורף היה הופך החלטה של הבעלים להיעדר החלטה. מי שרוצה לכבות סבב מסוים
-- עושה זאת מהכרטיס שלו.
begin;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'social_campaigns' and column_name = 'repeat_enabled'
  ) then
    alter table public.social_campaigns alter column repeat_enabled set default false;
  end if;
end $$;
commit;
