-- ───────────────────────────────────────────────────────────────────────────
-- v31 rollback — חזרה יומית חוזרת להיות כבויה כברירת מחדל.
--
-- WHAT IT CANNOT DO, said first: v31 switched every ACTIVE campaign that was
-- off ON, and did not record which ones those were. This file cannot put them
-- back. It restores the DEFAULT for campaigns created from here on and leaves
-- every existing row exactly as it is — because switching them all off would
-- stop the repeat on campaigns the owner had armed himself, which is the same
-- mistake in the other direction.
--
-- If the repeat must be off everywhere, that is the commented line at the
-- bottom, and it is a decision about every campaign at once.
--
-- THE CODE NEEDS NO ROLLBACK, and that is deliberate. readRepeat() in
-- campaign-schedule.ts is STRICT — `repeat_enabled === true` — so it reports
-- what the row says and nothing more. An earlier version of this change made
-- it `!== false` instead, which would have had to be reverted in step with
-- this file, and which also turned a missing column into a permission to
-- republish inside the engine. The owner's default lives in the DATA (the
-- ALTER below) and in DEFAULT_CAMPAIGN_REPEAT, which is what a NEW campaign
-- is created with; the engine's own fallback is REPEAT_WHEN_UNKNOWN and is
-- off whatever this file does.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.social_campaigns
  alter column repeat_enabled set default false;

do $$
declare n bigint;
begin
  select count(*) into n from public.social_campaigns where repeat_enabled;
  raise notice 'v31-rollback: ברירת המחדל כבויה שוב. % קמפיינים קיימים עדיין פעילים בחזרה יומית, ולא נגעתי בהם.', n;
end $$;

-- DELIBERATELY NOT RUN — this stops the daily repeat on every campaign,
-- including ones the owner armed by hand:
-- update public.social_campaigns set repeat_enabled = false;
