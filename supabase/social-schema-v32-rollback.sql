-- ───────────────────────────────────────────────────────────────────────────
-- v32 rollback — החזרת הרצפה של 12 שעות למסד הנתונים.
--
-- READ THIS BEFORE RUNNING IT. The CHECK cannot be put back while any campaign
-- holds a value under 12: Postgres validates an added constraint against every
-- existing row and the ALTER fails. So this file REFUSES rather than guessing,
-- and tells you exactly which campaigns are in the way.
--
-- That is deliberate. The alternative — quietly raising those campaigns back to
-- 12 — would overrule a choice the owner made on purpose, and "אסור למחוק
-- מידע" covers a setting as much as a row. If you genuinely want them raised,
-- the statement is at the bottom, commented out, and it is a decision about
-- every campaign at once.
--
-- The app side needs no rollback: LimitsSettings.repeatFloorHours is optional
-- and absent by default, so an account that never set it is already governed
-- by MIN_REPEAT_HOURS = 12.
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare below int;
begin
  select count(*) into below from public.social_campaigns where repeat_min_hours < 12;
  if below > 0 then
    raise exception 'v32-rollback: % קמפיינים עם repeat_min_hours מתחת ל-12. העלו אותם ידנית, או הסירו את ההערה מהשורה האחרונה בקובץ. לא נגעתי בכלום.', below;
  end if;
end $$;

alter table public.social_campaigns
  drop constraint if exists social_campaigns_repeat_min_hours_ck;

alter table public.social_campaigns
  add constraint social_campaigns_repeat_min_hours_ck
  check (repeat_min_hours between 12 and 168);

comment on column public.social_campaigns.repeat_min_hours is
  'המינימום שחייב לעבור בין פרסום של הפוסט הזה לקבוצה לבין הפרסום הבא לאותה קבוצה. 12–168.';

-- DELIBERATELY NOT RUN — this overrules every campaign the owner set below 12:
-- update public.social_campaigns set repeat_min_hours = 12 where repeat_min_hours < 12;
