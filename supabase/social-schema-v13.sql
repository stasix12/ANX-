-- v13 — how a published post actually did, read off the post itself.
--
-- "How many people saw this" is the question a round is run to answer, and it
-- is also the easiest place in this product to invent a number. So what gets
-- stored here is only what Facebook actually puts on the page:
--
--   metrics_seen       "נצפה על ידי N" when Facebook shows it — and it does
--                      not always. NULL means it was not shown, which is a
--                      different fact from 0 and must stay tellable apart.
--   metrics_views      plays on a VIDEO post, which Facebook reports as
--                      "N צפיות" instead. Kept apart from metrics_seen on
--                      purpose: a play is somebody who watched, an impression
--                      is a post that crossed a screen, and one column for
--                      both would let a screen label the first as the second.
--   metrics_reactions  likes and other reactions
--   metrics_comments   comments
--   metrics_shares     shares
--
-- Every one is NULLABLE ON PURPOSE. A group post whose counters have not been
-- read yet, a post whose page would not load, and a post that genuinely got
-- nothing are three different things; a default of 0 would flatten all three
-- into "nobody cared", which is a lie the screen would state confidently.
--
-- There is no reach or impressions column and there will not be one. Meta
-- closed the Groups API in April 2024 and group posts carry no such figure on
-- the page either. A number here would have to be guessed from group size,
-- and a guessed audience is the one number a customer would actually make
-- decisions on.
--
-- Safe to run more than once.

alter table public.social_queue
  add column if not exists metrics_seen integer,
  add column if not exists metrics_views integer,
  add column if not exists metrics_reactions integer,
  add column if not exists metrics_comments integer,
  add column if not exists metrics_shares integer,
  add column if not exists metrics_at timestamptz;

comment on column public.social_queue.metrics_seen is
  'Facebook''s own "seen by" count for this group post. NULL = Facebook did not show one, which is not the same as zero.';
comment on column public.social_queue.metrics_views is
  'Plays on a video post ("N צפיות"). NULL = not a video, or Facebook showed no count.';
comment on column public.social_queue.metrics_at is
  'When the counters were last read off the post. NULL = never read.';

-- The worker picks the oldest-read published rows first; this keeps that cheap.
create index if not exists social_queue_metrics_idx
  on public.social_queue (status, metrics_at)
  where permalink is not null;
