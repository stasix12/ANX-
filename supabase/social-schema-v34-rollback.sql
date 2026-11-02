-- Rollback of v34 — back to a minimum of one hour between two publications of
-- the same post to the same group.
--
-- IT REFUSES RATHER THAN REWRITING HIS CAMPAIGNS. The CHECK cannot be narrowed
-- to 1..168 while any campaign holds a zero, and the only way to apply it
-- anyway is to raise those zeros — which would be this script overruling the
-- setting the owner asked for three times ("תמחק את זה כבר", 02.11.2026) on
-- campaigns that are live.
--
-- So: if no campaign is on zero, the stricter rule is restored. If any is,
-- nothing changes and the script says how many and what the options are.
--
-- SAFE TO RUN TWICE, and safe to run when it cannot do its job.

do $$
declare zeroed int;
begin
  select count(*) into zeroed from public.social_campaigns where repeat_min_hours = 0;

  if zeroed > 0 then
    raise notice 'v34 rollback: לא בוצע. ל-% קמפיינים חלון חזרה של 0, והכלל המחמיר לא יכול להיווצר מעליהם.', zeroed;
    raise notice 'כדי להחזיר: העלו את החלון של הקמפיינים האלה ל-1 שעה לפחות (בהגדרות או בכרטיס) והריצו שוב.';
    raise notice 'שום דבר לא שונה. הכלל של v34 עדיין עומד.';
    return;
  end if;

  alter table public.social_campaigns
    drop constraint if exists social_campaigns_repeat_min_hours_ck;

  alter table public.social_campaigns
    add constraint social_campaigns_repeat_min_hours_ck
    check (repeat_min_hours between 1 and 168);

  raise notice 'v34 rollback: הוחזר. המינימום שוב שעה אחת.';
end $$;

select
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'social_campaigns_repeat_min_hours_ck') as "הכלל במסד";
