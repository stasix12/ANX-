-- ───────────────────────────────────────────────────────────────────────────
-- v29 rollback — החזרת המערכת לסבב אחד ביום.
--
-- WHAT IT COSTS. Every campaign goes back to publishing once a day, at
-- schedule_start. The hours the owner typed for his second and later rounds
-- are IN this column, so dropping it loses them — and this repository does not
-- delete information. The column is therefore KEPT and only the rule is
-- undone: the constraint goes, and the code stops reading it the moment
-- WORKER_VERSION rolls back, because readRounds() returns [] for a Campaign
-- interface that no longer declares the field.
--
-- If the column genuinely must go, the last line does it — but read the one
-- above it first, and copy the hours somewhere before you run it.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.social_campaigns
  drop constraint if exists social_campaigns_schedule_rounds_ck;

do $$
declare n bigint;
begin
  select count(*) into n from public.social_campaigns
   where jsonb_typeof(schedule_rounds) = 'array' and jsonb_array_length(schedule_rounds) > 0;
  raise notice 'v29-rollback: הכלל הוסר. ל-% קמפיינים עדיין שמורות שעות סבב בעמודה, והן לא נמחקו.', n;
end $$;

-- DELIBERATELY NOT RUN. Uncomment only after copying the hours out:
-- alter table public.social_campaigns drop column if exists schedule_rounds;
