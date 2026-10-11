-- ───────────────────────────────────────────────────────────────────────────
-- v27 — ספירה אמיתית של כל סבב, ישירות מבסיס הנתונים.
--
-- "28/28, 100%, הסתיים — ובפועל המערכת מפרסמת בהרבה יותר קבוצות."
--
-- WHAT WENT WRONG. campaignStates() in src/lib/social/client.ts asked ONE
-- question for EVERY campaign at once: the 1,000 earliest rows of
-- social_queue, account-wide, ordered by scheduled_at ascending. It then
-- grouped them by campaign_id in JavaScript and set progress.total to the
-- length of each group.
--
-- Three things follow from that, and all three were on the owner's screen:
--
--   1. The ceiling is SHARED. One big campaign fills the window and a small
--      one is counted from whatever crumbs are left.
--   2. The order is ASCENDING, so what falls off the end is the furthest-out
--      rows — which are exactly the ones still waiting. A round whose pending
--      rows are dropped reports published === total, resolves to 'completed',
--      and draws 100%.
--   3. A repeating round is then filtered to TODAY in JavaScript, AFTER the
--      cut. The window is full of old rows, so "today's round" is counted
--      from the handful of today that happened to fit — and because the cut
--      favours the earliest, those are the ones that have already published.
--
-- 28 of 28 handled, 27 published, one skipped, 100%, "הסתיים". Every number
-- true about the slice and false about the round.
--
-- WHAT THIS FILE ADDS. A view that answers the count in the one place that
-- can answer it exactly — the database — with no row ever crossing the wire.
-- One request returns at most (campaigns × statuses) rows instead of a
-- thousand queue rows, so it is also cheaper than what it replaces, which
-- matters on a metered Israeli mobile plan.
--
-- `today` rides along beside `total` so a repeating round is counted for
-- today WITHOUT a second query and WITHOUT filtering a capped list — the
-- filter that made this worse is now part of the aggregate.
--
-- SAFE TO RUN AGAIN. It creates a view and an index. It reads nothing it does
-- not already read, writes nothing, drops nothing, and changes no row. To
-- undo it: `drop view public.social_campaign_counts;` — the app falls back to
-- counting rows exactly as it did before, which is the behaviour this file
-- replaces rather than depends on.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── 1. the index the aggregate reads ──────────────────────────────────────
--
-- Without it, every dashboard poll is a sequential scan of social_queue. With
-- it the grouping is served from the index alone. The column order is the one
-- the view groups by, with scheduled_at last so the `today` filter is covered
-- by the same index.
create index if not exists social_queue_campaign_rollup_idx
  on public.social_queue (campaign_id, status, scheduled_at)
  where campaign_id is not null;

-- ─── 2. the view, and the one property that makes it safe ─────────────────
do $$
begin
  /*
   * security_invoker IS NOT OPTIONAL HERE.
   *
   * social_queue carries tenant_id and is under row-level security: a
   * customer may read only the rows of a business they belong to (see the
   * "admin select" policy in v16). A view in Postgres runs with the
   * privileges of the user who CREATED it unless this is set — so a view
   * created by the project owner would return every tenant's counts to every
   * signed-in user. That is a data leak, not a bug in a number.
   *
   * It needs Postgres 15 or newer. Supabase has been on 15 since 2023, but
   * rather than create an unsafe view on an older server this refuses and
   * says so: the app works without the view (it falls back to counting the
   * rows it can see), and a leak would not announce itself.
   */
  if current_setting('server_version_num')::int < 150000 then
    raise notice 'v27: בסיס הנתונים הזה ישן מדי ל-security_invoker (צריך Postgres 15 ומעלה). התצוגה לא נוצרה — האפליקציה תמשיך לעבוד בלעדיה, עם ספירה מקורבת.';
    return;
  end if;

  execute $v$
    create or replace view public.social_campaign_counts
    with (security_invoker = true) as
    select
      q.campaign_id,
      q.status,
      count(*)::int as total,
      /*
       * TODAY, IN THE ZONE THE OWNER LIVES IN, decided by the database.
       *
       * It used to be a JavaScript filter over a capped array. Here it is a
       * FILTER on the aggregate, so it is exact, it costs no extra request,
       * and it cannot be applied to the wrong set.
       *
       * `at time zone` resolves a timestamptz to local wall-clock time, so
       * the two Israeli clock changes a year are handled by the calendar
       * rather than by adding 86,400,000 milliseconds — the same discipline
       * src/lib/social/time.ts uses.
       *
       * scheduled_at and NOT published_at: the question a card answers is
       * "how is today's round going", and a row that belongs to today's round
       * but has not gone out yet is part of that answer.
       */
      count(*) filter (
        where (q.scheduled_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date
      )::int as today
    from public.social_queue q
    where q.campaign_id is not null
    group by q.campaign_id, q.status
  $v$;

  execute 'grant select on public.social_campaign_counts to authenticated';
  execute 'grant select on public.social_campaign_counts to service_role';

  raise notice 'v27: ספירת הסבבים מגיעה מעכשיו ישירות מבסיס הנתונים — בלי תקרה ובלי חיתוך.';
end $$;

comment on view public.social_campaign_counts is
  'Exact per-campaign, per-status queue counts (lifetime and today in Asia/Jerusalem). Added in v27 because campaignStates() was deriving progress.total from a 1,000-row account-wide slice, which made a round report 100% while rows were still waiting. security_invoker: it is subject to the caller''s RLS on social_queue.';

-- ─── 4. how many GROUPS a round reaches ────────────────────────────────────
--
-- "בפועל המערכת מפרסמת בהרבה יותר קבוצות."
--
-- A SEPARATE VIEW, because it is a different grouping and not a different
-- column. social_campaign_counts groups by (campaign, status); a distinct
-- count of groups cannot be summed out of it — a group that has one published
-- row and one waiting row would be counted twice.
--
-- The dashboard derived this in JavaScript as
-- `new Set([...upcoming, ...done].map(r => r.target_id)).size`, over the same
-- capped arrays that produced 28/28. So the card said "מפרסם ל-28 קבוצות"
-- about a round reaching 269 of them.
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    return;  -- see the notice in step 2
  end if;

  execute $v$
    create or replace view public.social_campaign_targets
    with (security_invoker = true) as
    select
      q.campaign_id,
      count(distinct q.target_id)::int as targets,
      count(distinct q.target_id) filter (
        where (q.scheduled_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date
      )::int as targets_today,
      /*
       * WHEN THE ROUND ACTUALLY STARTED, and when it last published.
       *
       * The card reads "התחיל לפני 6 שעות" off the rows it was handed, and
       * those rows are a PREVIEW of the most recent finished ones. The
       * earliest publication inside a newest-first preview is not the round's
       * first publication — it is the age of the oldest row that happened to
       * survive the cut, so the sentence drifts later every time the account
       * publishes anything at all. min() over every row is the only honest
       * answer, and the database is the only thing that can give it.
       */
      min(q.published_at) filter (where q.status = 'published') as first_published_at,
      max(q.published_at) filter (where q.status = 'published') as last_published_at
    from public.social_queue q
    where q.campaign_id is not null
    group by q.campaign_id
  $v$;

  execute 'grant select on public.social_campaign_targets to authenticated';
  execute 'grant select on public.social_campaign_targets to service_role';
end $$;

comment on view public.social_campaign_targets is
  'Distinct groups a campaign reaches (lifetime, and today in Asia/Jerusalem). A separate grouping from social_campaign_counts because a distinct count cannot be summed across statuses. security_invoker: subject to the caller''s RLS on social_queue.';

-- ─── 5. what it says right now ─────────────────────────────────────────────
select
  'v27 הוחל' as "מצב",
  count(distinct campaign_id) as "סבבים",
  sum(total) as "פרסומים בסך הכול",
  sum(today) as "מתוכם היום"
from public.social_campaign_counts;
