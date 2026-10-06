-- ---------------------------------------------------------------------------
-- v25 — חזרה יומית: לפרסם את אותו פוסט שוב, בימים ובשעות שכבר הוגדרו.
-- ---------------------------------------------------------------------------
--
-- "הקמפיין פעיל, אמור לצאת כל יום מ 8 בבוקר עד 22 בלילה כל דקה."
--
-- He believed he had configured a recurring publisher. He had not, and nothing
-- in the product did: v24's five columns are a WINDOW — they can only ever
-- prevent a publication, never cause one — and a round whose queue empties
-- resolves to 'completed' and stays there. Both halves of that are now said
-- plainly on the card (4.2.0). These two columns are the other answer: the
-- recurrence itself, asked for explicitly and turned on per round.
--
-- WHAT IT IS BUILT OUT OF, AND WHAT IS NEW. Almost nothing is new. A weekly
-- schedule row (social_schedules.mode = 'weekly') already re-plans itself for
-- ever — planQueue() reads `active = true` and only 'now'/'once'/'drip' retire
-- themselves — and slotsFor() already spreads one occasion's targets apart.
-- The single thing standing between that and what he asked for is the guard in
-- rules.ts that refuses to send the same post to the same group twice, ever.
--
-- SO THE GUARD IS NOT REMOVED. IT IS GIVEN A CLOCK.
--
-- `repeat_min_hours` is the minimum that must pass between one publication of
-- this post to a group and the next one to that same group. Off, the rule is
-- "never twice" exactly as before. On, it is "not again within N hours" — a
-- weaker rule, chosen deliberately and visibly, and still a rule: a round that
-- somehow ran twice in an afternoon cannot post twice to the same group, and a
-- retry after a failure cannot double-post.
--
-- 20 HOURS, NOT 24. The owner publishes in a daily window, and a round that
-- starts at 08:00 and takes four hours ends at 12:00; a 24-hour rule would then
-- hold tomorrow's 08:00 publication until noon and drag the round later every
-- day until it fell out of the window entirely. 20 hours is the longest value
-- that keeps a daily round at the same hour, and the floor below is what stops
-- it being set to something that would publish the same ad twice in a morning.
--
-- THIS IS AN AGGRESSIVE SETTING AND THE PRODUCT SAYS SO. Posting the same
-- advertisement into the same groups day after day is what group admins remove
-- people for and what Meta's own spam systems are looking for. Nothing here
-- hides the repetition, randomises it, or tries to make it harder to detect —
-- it publishes openly, through the owner's own session, at the pace he set, and
-- the screen that turns it on says what it risks. It is his account and his
-- decision; the product's job is to make the decision an informed one.
--
-- OFF FOR EVERY CAMPAIGN THAT ALREADY EXISTS. The default is false, nothing
-- changes until the switch is pressed, and a database that has not run this
-- file reads the same false through readRepeat().
--
-- Safe to run more than once. Nothing here deletes or rewrites a value.

alter table public.social_campaigns
  add column if not exists repeat_enabled boolean not null default false;

alter table public.social_campaigns
  add column if not exists repeat_min_hours smallint not null default 20;

-- The floor is the whole of the safety argument, so the database holds it too
-- and not only the editor: a value under 12 would let the same post reach the
-- same group twice inside one publishing day, which is not "daily" by any
-- reading and is the shape that gets an account restricted fastest.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'social_campaigns_repeat_min_hours_ck'
  ) then
    alter table public.social_campaigns
      add constraint social_campaigns_repeat_min_hours_ck
      check (repeat_min_hours between 12 and 168);
  end if;
end $$;

comment on column public.social_campaigns.repeat_enabled is
  'חזרה יומית: מותר לפרסם את אותו פוסט שוב לאותה קבוצה, בכפוף ל-repeat_min_hours. כבוי = לעולם לא פעמיים.';
comment on column public.social_campaigns.repeat_min_hours is
  'המינימום שחייב לעבור בין פרסום של הפוסט הזה לקבוצה לבין הפרסום הבא לאותה קבוצה. 12–168.';
