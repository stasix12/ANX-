-- Undoes v20's RULE. It cannot undo v20's cleanup, and does not pretend to:
-- the rows it marked skipped stay marked, because a row that says 'skipped'
-- with a reason is a record of a decision and un-saying it would be a lie
-- about what the queue did. Nothing was deleted, so nothing is lost.
--
-- After this, two campaigns can again queue the same group twice. Run it only
-- if the one-per-group rule turns out to block something real.
drop index if exists public.social_queue_one_open_per_target_idx;
select 'v20 בוטל — שוב אפשר שיותר מפרסום אחד ימתין לאותה קבוצה' as "מצב";
