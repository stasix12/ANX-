-- ───────────────────────────────────────────────────────────────────────────
-- v30 — round_at: לאיזה סבב ביום שייכת כל שורה בתור.
--
-- "כל סבב חייב לקבל מזהה עצמאי, תור עצמאי, סטטוס עצמאי ומעקב התקדמות עצמאי."
--
-- WHY A COLUMN AND NOT A CALCULATION. A row's round can be guessed from
-- scheduled_at — the latest occasion at or before it — and the guess is right
-- until the moment a row is DEFERRED. rules.ts moves an instant for the
-- account gap, for a daily ceiling, for the campaign's own interval and for a
-- read it could not complete; social-latest.sql's own sweep moves others. The
-- moment one moves past the next occasion, a derived number counts it in a
-- round it was never part of — and a progress bar that moves a publication
-- from round one to round two is worse than no progress bar at all. So the
-- round is RECORDED when the row is created and never recomputed.
--
-- WHAT IS IN IT. 'HH:MM' on the local clock (Asia/Jerusalem), the occasion
-- src/lib/social/plan.ts stamped the row from. Text and not an index, because
-- an index would be renumbered the moment the owner adds an earlier round and
-- every finished row would silently change which round it belonged to.
--
-- NULL IS "ROUND ONE", and that is every row that exists today: one occasion
-- a day is what every campaign has had until now. The readers resolve null to
-- the first round, so an install that has not run this file — and every row
-- created before it did — reads exactly as it does now.
--
-- NO INDEX. The column is read only alongside campaign_id, which
-- social_queue_campaign_rollup_idx (v27) already covers, and the rollup reads
-- at most a few hundred rows per campaign. An index here would cost every
-- insert on the hottest table in the product to speed up a count that is
-- already fast.
--
-- SAFE TO RUN AGAIN. `add column if not exists`, nullable, no backfill.
--
-- TO UNDO IT: supabase/social-schema-v30-rollback.sql.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.social_queue
  add column if not exists round_at text;

comment on column public.social_queue.round_at is
  'הסבב ביום שאליו שייכת השורה: ''HH:MM'' מקומי, השעה שממנה המתכנן יצר אותה. ריק = הסבב הראשון, וכך גם כל שורה שנוצרה לפני הפיצ''ר.';

do $$
declare n bigint;
begin
  select count(*) into n from public.social_queue where round_at is null;
  raise notice 'v30: העמודה round_at נוספה. % שורות קיימות נספרות כסבב הראשון, ללא שינוי.', n;
end $$;
