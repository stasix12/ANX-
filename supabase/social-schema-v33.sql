-- v33 — THE QUEUE NO LONGER REFUSES A SECOND WAITING PUBLICATION FOR A GROUP.
--
-- "אני רוצה שיהיה אפשר לפרסם גם ככה ובכל תנאי גם יש עוד סבב אם אותם קבוצות
--  בקמפיין אחר." — the owner, 02.11.2026.
--
-- And then, asked directly which of his two instructions stands, because they
-- contradict each other and the contradiction is recorded in this repository:
-- "לפתוח הכל, גם אותו פוסט". So this drops the constraint entirely rather than
-- narrowing it to (target_id, post_id), which is what the first sentence alone
-- would have bought him.
--
-- WHAT IT REPLACES, AND WHOSE WORDS THOSE WERE. v20 created
-- social_queue_one_open_per_target_idx after he watched this on his own
-- dashboard:
--
--   ערד-ערדניקים          16:09   דולג
--   ערד-ערדניקים          16:09   דולג
--   ערד-פנינת הנגב        16:10   דולג
--   ערד-פנינת הנגב        16:10   דולג
--
-- and said "לא רוצה בכלל שתיהיה אופציה לפרסם פעמיים לאותן קבוצה". That
-- sentence is why worker/test/unit.test.ts asserted the planner's check was per
-- GROUP and not per post. He has now replaced it. The old sentence and the new
-- one are both his; this file records which one is in force and when it
-- changed, so nobody later reads the removal as drift.
--
-- WHAT HE WAS LOSING. His Russian-language campaign carries fifty groups.
-- Another campaign held an open row for every one of them, so the planner
-- dropped all fifty, every pass, and the activity log said:
--
--   אף קבוצה לא נכנסה לתור — לכל 50 הקבוצות כבר ממתין פרסום מסבב אחר
--
-- The log was honest; the rule behind it simply would not let two of his
-- campaigns share a group.
--
-- WHAT STILL PROTECTS THE ACCOUNT, AND IT IS NOT THIS INDEX. Nothing about
-- PUBLISHING changes here — this constraint only ever governed what may sit in
-- the queue. Every decision about what actually goes out stays exactly where it
-- was, in rules.ts:
--
--   · maxPerTargetPerDay  — each group's own daily quota, counted across every
--                           post and campaign;
--   · maxPerDay           — the account's daily ceiling;
--   · the account gap     — minGapMinutes + groupMinGapMinutes between any two
--                           publications, whatever campaign they belong to;
--   · the repeat window   — the same post may not reach the same group twice
--                           inside it (his is 20 hours). A second queued row
--                           for the same post and group is therefore DEFERRED
--                           until the window has passed, not published next to
--                           the first.
--
-- So the honest description of this change is: the queue may now get longer and
-- carry rows that wait, where before it refused to hold them at all.
--
-- WHAT IS NOT DROPPED. social_queue's own unique key
-- (schedule_id, target_id, scheduled_at) stays, so a planner race still cannot
-- write two identical rows for one schedule, group and instant.
--
-- SAFE TO RUN TWICE. It drops one index and nothing else. It deletes no rows,
-- publishes nothing, and cannot half-apply.

do $$
declare
  per_target integer;
begin
  drop index if exists public.social_queue_one_open_per_target_idx;
  -- Also the narrowed form, in case this file is run after a build that had it:
  -- the owner asked for all of it, including the same post twice.
  drop index if exists public.social_queue_one_open_per_target_post_idx;

  select count(distinct target_id) into per_target
    from public.social_queue
   where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing');

  raise notice 'v33: מעכשיו לקבוצה יכולים להמתין כמה פרסומים. כרגע ממתינים ל-% קבוצות.', per_target;
  raise notice 'מה שמחליט מה באמת יוצא לא השתנה: מכסה יומית לכל קבוצה, תקרה יומית, המרווח בין פרסומים וחלון החזרה.';
end $$;

select
  'v33 הוחל' as "מצב",
  count(*) filter (where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing')) as "ממתינים",
  count(distinct target_id) filter (where status in ('scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing')) as "קבוצות",
  (select count(*) from pg_indexes where schemaname = 'public'
    and indexname in ('social_queue_one_open_per_target_idx', 'social_queue_one_open_per_target_post_idx')) as "אינדקסים חוסמים (0 = נפתח)"
from public.social_queue;
