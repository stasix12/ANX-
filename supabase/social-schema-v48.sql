-- ─── v48 · מאגר הקבוצות הארצי ────────────────────────────────────────────
--
--   "יש לפתח בתוך האפליקציה הקיימת מאגר קבוצות פייסבוק מרכזי, ארצי, חכם
--    ומתעדכן אוטומטית... כאשר משתמש פותח את מסך הקבוצות, המערכת חייבת
--    להציג מיד את הקבוצות שכבר קיימות במסד הנתונים." — 18.11.2026
--
-- ─── טבלה חדשה, ולא הרחבה של הקיימת ──────────────────────────────────────
--
-- הדרך הטבעית הייתה לפתוח את ההרשאות על social_targets. היא שוברת הרשמה של
-- לקוח חדש: src/lib/social/auth.ts סופרת שורות ב-social_targets מיד אחרי
-- יצירת סביבה, ומתייחסת לכל שורה שנראית כהוכחה שכללי ההפרדה לא הוחלפו —
-- ומנתקת את המשתמש. טבלה חדשה אינה נספרת שם.
--
-- ובנוסף: v17 הרחיבה במכוון את כלל הייחודיות כך שלכל עסק תהיה שורה משלו
-- לאותה קבוצה ציבורית. המאגר הזה הוא השכבה השנייה ולא החלפה שלה — לכל לקוח
-- נשארות הקבוצות שלו, עם סטטוס החברות שלו, בטבלה שלו.
--
-- ─── בלי tenant_id, וזו כל הנקודה ────────────────────────────────────────
--
-- קבוצת פייסבוק ציבורית אינה נתון של אף לקוח. מה ששייך ללקוח — האם הוא חבר,
-- האם הוא מפרסם שם, איזה קמפיין — נשאר ב-social_targets ואינו נוגע כאן.
-- "חבר בקבוצה" במיוחד: זו טענה על חשבון פייסבוק מסוים, ויש לה כותב אמין
-- אחד — סריקת רשימת הקבוצות של אותו חשבון. משותפת, היא הופכת לטענה על
-- החשבון של מישהו אחר, וזה בדיוק חוסר הסנכרון שדווח כאן בשבוע שעבר.
--
-- ─── המפתח הראשי הוא מזהה הקבוצה בפייסבוק ────────────────────────────────
--
-- ולכן כפילות אינה "בעיה שמנקים" אלא דבר שאי אפשר לבטא. זה גם אומר שאין
-- עמודת id מלאכותית: המזהה של פייסבוק הוא הזהות, ושום שורה שנייה לא יכולה
-- לטעון לאותה קבוצה.
--
-- ─── הרשאות: קריאה והוספה לכל מחובר, עדכון מוגבל, מחיקה לאף אחד ──────────
--
-- הזרוע שרצה על המחשב של הלקוח עובדת עם המפתח הציבורי ועם הסשן שלו, לא עם
-- מפתח שרת. מדיניות "רק שרת" הייתה הופכת את המאגר לכזה שאיש לא יכול למלא.
--
-- לכן: כל מחובר קורא, כל מחובר מוסיף — וזה איך המאגר גדל — אבל עדכון מוגבל
-- לעמודות רענון בלבד, ברמת ההרשאות של Postgres ולא ברמת מדיניות. מזהה
-- וקישור של קבוצה קיימת אינם ניתנים לשינוי בכלל, ואין GRANT DELETE לאף אחד.
--
-- והמדיניות נכתבת כ-auth.uid() is not null ולא כ-true, במכוון:
-- supabase/social-tenant-lock-strays.sql סורק טבלאות social_* שהמדיניות
-- שלהן היא qual='true' וסוגר אותן אוטומטית לפי עסק. המאגר הזה נועד להיות
-- משותף, ועליו לשרוד את הסורק הזה.
--
-- ─── והוא לא נפתח ריק ────────────────────────────────────────────────────
--
-- נזרע מכל מה שהמערכת כבר מכירה: הקבוצות שהתגלו (social_discovery_groups)
-- והקבוצות שכבר נוספו כיעדים (social_targets). עיר מגיעה מהיעדים, שם היא
-- כבר מזוהה; שפה מזוהה כאן לפי טווחי תווים, כי זה מה שאפשר להגיד בוודאות
-- משם של קבוצה.
--
-- בטוח להריץ פעמיים.
--
-- לביטול: supabase/social-schema-v48-rollback.sql
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

create table if not exists public.social_group_catalog (
  -- מזהה הקבוצה בפייסבוק — מספר או שם ורבלי, כפי שהוא מופיע אחרי /groups/.
  -- זהו המפתח הראשי: שתי שורות לאותה קבוצה אינן אפשריות.
  external_id text primary key,
  name text not null default '',
  url text not null default '',
  image_url text not null default '',
  -- NULL ולא אפס: "לא ידוע כמה חברים" אינו אותה עובדה כמו "קבוצה ריקה".
  members integer,
  privacy text not null default 'unknown'
    check (privacy in ('public', 'private', 'unknown')),
  -- עיר, אזור, שפה וקטגוריה — ארבע עמודות ולא מחרוזת אחת, כי כל אחת מהן
  -- היא סינון שהמסך מציע בנפרד, ושדה חופשי אחד שמחזיק את כולן הוא בדיוק
  -- מה שמונע את זה היום.
  city text not null default '',
  region text not null default '',
  language text not null default '',
  category text not null default '',
  -- 'unavailable' נכתב רק כשיש ראיה — קבוצה שנמחקה או שאי אפשר לפתוח.
  -- היעדר ראיה נשאר 'active', כי מאגר שמסמן קבוצות כלא-זמינות בניחוש
  -- מוחק בהדרגה את עצמו.
  status text not null default 'active'
    check (status in ('active', 'unavailable')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.social_group_catalog is
  'The national catalog of public Facebook groups. Deliberately has NO tenant_id: a public group is nobody''s data. What belongs to a customer — membership, whether they publish there, which campaign — stays in social_targets and never appears here.';

-- ─── אינדקסים: זה מה שהופך "תוך שנייה" לתכונה ולא לתקווה ─────────────────
-- חיפוש שם הוא ILIKE '%...%', ובלי trigram הוא סריקה מלאה על כל שורה.
create index if not exists social_group_catalog_name_trgm_idx
  on public.social_group_catalog using gin (name gin_trgm_ops);
create index if not exists social_group_catalog_city_idx on public.social_group_catalog (city) where city <> '';
create index if not exists social_group_catalog_language_idx on public.social_group_catalog (language) where language <> '';
create index if not exists social_group_catalog_category_idx on public.social_group_catalog (category) where category <> '';
-- הסדר שהמסך פותח בו: הזמינות קודם, ואז הגדולות.
create index if not exists social_group_catalog_rank_idx
  on public.social_group_catalog (status, members desc nulls last);

alter table public.social_group_catalog enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'social_group_catalog' and policyname = 'catalog read') then
    create policy "catalog read" on public.social_group_catalog
      for select to authenticated using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'social_group_catalog' and policyname = 'catalog add') then
    create policy "catalog add" on public.social_group_catalog
      for insert to authenticated with check (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'social_group_catalog' and policyname = 'catalog refresh') then
    create policy "catalog refresh" on public.social_group_catalog
      for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
  end if;
end $$;

-- ואין policy למחיקה. ההיעדר הוא ההגנה, כמו בטבלאות הזהות עצמן.

revoke all on public.social_group_catalog from authenticated;
grant select, insert on public.social_group_catalog to authenticated;
-- עדכון רק של עמודות רענון. external_id ו-url אינם ברשימה: אי אפשר להפנות
-- שורה קיימת לקבוצה אחרת, גם לא בטעות.
grant update (name, image_url, members, privacy, city, region, language, category, status, last_seen_at, updated_at)
  on public.social_group_catalog to authenticated;

-- ─── זריעה ───────────────────────────────────────────────────────────────
-- distinct on: אותה קבוצה יכולה להופיע אצל כמה לקוחות; נלקחת הרשומה שנראתה
-- לאחרונה, כי היא זו שהשם והתמונה שלה עדכניים.
insert into public.social_group_catalog (external_id, name, url, image_url, members, privacy, first_seen_at, last_seen_at)
select distinct on (d.external_id)
       d.external_id, d.name, d.url, d.image_url, d.members, d.privacy, d.first_seen_at, d.last_seen_at
  from public.social_discovery_groups d
 where coalesce(d.external_id, '') <> ''
 order by d.external_id, d.last_seen_at desc
on conflict (external_id) do nothing;

insert into public.social_group_catalog (external_id, name, url, city, first_seen_at, last_seen_at)
select distinct on (t.external_id)
       t.external_id, t.name, t.url, coalesce(t.city, ''), t.created_at, coalesce(t.last_synced_at, t.created_at)
  from public.social_targets t
 where coalesce(t.external_id, '') <> ''
   and t.channel in ('facebook_group', 'facebook_group_manual')
 order by t.external_id, t.created_at desc
on conflict (external_id) do nothing;

-- עיר מהיעדים גם לשורות שהגיעו מהגילוי: שם היא כבר מזוהה.
update public.social_group_catalog c
   set city = t.city
  from public.social_targets t
 where t.external_id = c.external_id
   and coalesce(t.city, '') <> ''
   and c.city = '';

-- ─── שפה, לפי מה שאפשר להגיד בוודאות משם של קבוצה ────────────────────────
--
-- זו אינה ניחוש אלא עובדה על הכתב: שם שכתוב בקירילית הוא שם רוסי.
--
-- ⚠ שתי אותיות רצופות, לא אחת, ובדיוק בסדר הזה — כי אותו כלל כתוב גם
--   ב-src/lib/social/language.ts (catalogLanguage), שם הוא מחושב לכל קבוצה
--   חדשה שהמחשב מוסיף למאגר. אות קירילית בודדת בשם עברי היא כמעט תמיד
--   מקלדת בפריסה הלא נכונה, ושם מעורב ("Беэр-Шева — באר שבע") הוא רוסי
--   לצורך הפרסום, ולכן העברית נבדקת אחרונה. worker/test/catalog.test.ts
--   מריץ את שני המימושים על אותם שמות ונכשל אם הם נותנים תשובות שונות.
update public.social_group_catalog
   set language = case
     -- הבלוק הראשי של הקירילית ועוד התוספת שלו (0500–052F), כדי שגם שם
     -- אוקראיני לא ייפול על אות אחת. הכלל ב-TypeScript מכיר את כל טווחי
     -- הקירילית שיש ביוניקוד, ולכן שם נדיר שכתוב בצורות תצוגה ייזרע כאן
     -- כ"לא ידוע" ויתוקן מעצמו בסנכרון השבועי הראשון שיראה אותו.
     when name ~ '[Ѐ-ԯ]{2}' then 'ru'
     when name ~ '[؀-ۿ]{2}' then 'ar'
     when name ~ '[֐-׿]{2}' then 'he'
     else ''
   end
 where language = '';

do $$
declare n integer;
begin
  select count(*) into n from public.social_group_catalog;
  raise notice 'v48: מאגר הקבוצות הארצי קיים עם % קבוצות.', n;
end $$;
