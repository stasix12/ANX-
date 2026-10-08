-- ───────────────────────────────────────────────────────────────────────────
-- v26 — the gap between two publications of one campaign, in SECONDS.
--
-- "בהפרש פרסום בין פוסט לפוסט תעשה אופציה של 30 40 50 שניות בין פוסט לפוסט."
--
-- schedule_gap_minutes is a smallint checked between 1 and 30, so a minute
-- was the floor the UNIT imposed — not a decision anyone made. This adds the
-- seconds column beside it and leaves the old one in place, written in step
-- and rounded UP, so a dashboard or a worker that has not been updated reads
-- a value that is SLOWER than asked for rather than faster. Slower is the
-- safe direction for the one number in this product that paces how fast an
-- account posts.
--
-- Safe to run more than once. Nothing is dropped and no campaign changes
-- behaviour: every existing row is backfilled with exactly the gap it already
-- had.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.social_campaigns
  add column if not exists schedule_gap_seconds smallint not null default 600;

-- Existing campaigns keep the gap they have. `default 600` above only covers
-- rows created from now on; this covers the ones already there.
update public.social_campaigns
   set schedule_gap_seconds = greatest(30, least(1800, coalesce(schedule_gap_minutes, 10) * 60))
 where schedule_gap_seconds is distinct from
       greatest(30, least(1800, coalesce(schedule_gap_minutes, 10) * 60));

alter table public.social_campaigns
  drop constraint if exists social_campaigns_schedule_gap_seconds_range;

-- Thirty seconds is the floor because it is the shortest step the machine has
-- any chance of meeting: rules.ts lets a row through up to PREP_LEAD_MS (75s)
-- early so the group page, the typing and the upload happen INSIDE the gap
-- rather than on top of it. Below that the owner is asking for something one
-- browser cannot keep.
alter table public.social_campaigns
  add constraint social_campaigns_schedule_gap_seconds_range
  check (schedule_gap_seconds between 30 and 1800);

comment on column public.social_campaigns.schedule_gap_seconds is
  'Seconds between two publications of this campaign (30..1800). Canonical since v26; schedule_gap_minutes is kept beside it, rounded up, for readers that predate this column.';
