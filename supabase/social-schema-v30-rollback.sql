-- ───────────────────────────────────────────────────────────────────────────
-- v30 rollback — ביטול הזיהוי של סבב לכל שורה.
--
-- WHAT IT COSTS. Per-round progress stops being exact: every row reads as the
-- first round again, which is correct for a campaign with one occasion a day
-- and wrong for one with two. Nothing stops publishing — round_at is read by
-- the counters and by nothing that decides whether a post goes out.
--
-- The column is KEPT, because what is in it is a record of which round each
-- publication belonged to and this repository does not delete information. A
-- rolled-back reader simply stops reading it.
--
-- If the column genuinely must go, the last line does it.
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare n bigint;
begin
  select count(*) into n from public.social_queue where round_at is not null;
  raise notice 'v30-rollback: % שורות עדיין נושאות את שעת הסבב שלהן, והן לא נמחקו.', n;
end $$;

-- DELIBERATELY NOT RUN:
-- alter table public.social_queue drop column if exists round_at;
