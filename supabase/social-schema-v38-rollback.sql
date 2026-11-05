-- ---------------------------------------------------------------------------
-- social-schema-v38-rollback.sql — החזרת ה-view לחמש העמודות של v27.
--
-- מה זה עושה: מוריד את שתי העמודות ש-v38 הוסיף (targets_published,
-- targets_published_today) ומשאיר את social_campaign_targets בדיוק כפי
-- ש-v27 יצר אותו.
--
-- למה drop ולא create or replace: אפשר להוסיף עמודות ל-view קיים, אבל אי
-- אפשר להסיר — Postgres עונה "cannot drop columns from view". לכן ההסרה
-- דורשת הורדה ויצירה מחדש. זה view, לא טבלה: אין בו נתון אחד, ההורדה לא
-- מוחקת שורה, וההרשאות ניתנות מחדש מיד אחר כך באותה טרנזקציה.
--
-- מה קורה באפליקציה אחרי זה: הכרטיס מפסיק לקבל את מספר הקבוצות שפורסמו
-- מהמסד, סופר אותו מתוך השורות שהוא רואה, ורושם "לפחות" לפני המספר — כי
-- השורות האלה הן תצוגה מקדימה ולא הסבב כולו. שום מספר אחר לא זז.
--
-- אין DELETE. אין שינוי בשום טבלה. אפשר להריץ שוב ושוב.
-- ---------------------------------------------------------------------------

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise notice 'v38-rollback: גרסת Postgres נמוכה מ-15 — v38 לא רץ כאן מלכתחילה, אין מה להחזיר.';
    return;
  end if;

  execute 'drop view if exists public.social_campaign_targets';

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
      max(q.published_at) filter (where q.status = 'published') as last_published_at
    from public.social_queue q
    where q.campaign_id is not null
    group by q.campaign_id
  $v$;

  execute 'grant select on public.social_campaign_targets to authenticated';
  execute 'grant select on public.social_campaign_targets to service_role';

  raise notice 'v38-rollback: ה-view חזר לחמש העמודות של v27. הכרטיס יספור קבוצות מתוך השורות ויסמן את המספר כחלקי.';
end $$;

comment on view public.social_campaign_targets is
  'Distinct groups a campaign reaches (lifetime, and today in Asia/Jerusalem). A separate grouping from social_campaign_counts because a distinct count cannot be summed across statuses. security_invoker: subject to the caller''s RLS on social_queue.';
