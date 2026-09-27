-- v20 — ONE WAITING PUBLICATION PER GROUP. Enforced by the database.
--
-- WHAT THE OWNER SAW, on their own dashboard:
--
--   ערד-ערדניקים          16:09   דולג
--   ערד-ערדניקים          16:09   דולג
--   ערד-פנינת הנגב        16:10   דולג
--   ערד-פנינת הנגב        16:10   דולג
--   פורום עסקים…          16:11   דולג
--   פורום עסקים…          16:11   דולג
--
-- Every group twice, in the same minute, and every row skipped. Nothing was
-- double-posted — rules.ts refuses a post that has already gone to a group,
-- which is exactly why they all read דולג — but a queue twice the length of
-- the truth, half of which fails for a reason describing something the owner
-- never did, is its own failure.
--
-- WHY NEITHER EXISTING GUARD CAUGHT IT. The queue's unique index is
-- (schedule_id, target_id, scheduled_at): it can only see inside ONE schedule.
-- The planner's own check matched on post_id: it could only see ONE post. A
-- second campaign, with a different post, planning the same groups from the
-- same base time with the same one-minute stagger, is invisible to both.
--
-- WHY THIS HAS TO BE IN THE DATABASE and not only in plan.ts. The planner
-- reads which groups are taken and then inserts. Two planners running at once
-- — the PC worker's tick and the server's /api/social/run, which is exactly
-- what "publish now" does — both read the same free group and both insert.
-- No amount of checking before the write can close that; only the write can.
--
-- SAFE TO RUN TWICE. It deletes nothing, it publishes nothing, and it refuses
-- rather than half-applying.

do $$
declare
  extra   integer;
  groups  integer;
begin
  -- ------------------------------------------------------------------ 1/3
  -- The duplicates that already exist. The index cannot be created while they
  -- are there, and they must not be deleted: they are the owner's record of
  -- what was attempted. So the EXTRA rows — never the first of each group —
  -- are marked skipped, with a reason that says what happened and does not
  -- pretend to be anything else.
  with ranked as (
    select
      id,
      row_number() over (partition by target_id order by scheduled_at, created_at, id) as n
    from public.social_queue
    where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing')
  )
  update public.social_queue q
     set status      = 'skipped',
         step        = '',
         skip_reason = 'כפילות — לקבוצה הזו כבר המתין פרסום אחר. מעכשיו זה נמנע מראש.'
    from ranked r
   where q.id = r.id
     and r.n > 1;
  get diagnostics extra = row_count;

  if extra > 0 then
    raise notice 'v20: % שורות כפולות סומנו כדולגו (לא נמחקו — הן בהיסטוריה).', extra;
  end if;

  -- ------------------------------------------------------------------ 2/3
  -- The rule itself. Partial, so it constrains only what is still waiting: a
  -- group that has published is free again immediately, which is what makes a
  -- second round to the same groups possible at all.
  --
  -- The status list is written out rather than referenced because an index
  -- predicate has to be immutable — it is OPEN_STATUSES from
  -- src/lib/social/status.ts, and worker/test/unit.test.ts fails the build if
  -- the two ever drift apart.
  create unique index if not exists social_queue_one_open_per_target_idx
    on public.social_queue (target_id)
    where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing');

  -- ------------------------------------------------------------------ 3/3
  select count(distinct target_id) into groups
    from public.social_queue
   where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing');

  raise notice 'v20: מעכשיו לכל קבוצה יכול להמתין פרסום אחד בלבד. כרגע ממתינים ל-% קבוצות.', groups;
end $$;

select
  'v20 הוחל' as "מצב",
  count(*) filter (where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing')) as "ממתינים",
  count(distinct target_id) filter (where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing')) as "קבוצות",
  count(*) filter (where skip_reason like 'כפילות%') as "כפילויות שנוקו"
from public.social_queue;
