-- v14 — comment on a whole round's posts, when the owner decides to.
--
-- The first version of this commented automatically, the instant each post
-- went up, and was configured once in ההגדרות. Both halves were wrong. The
-- decision of WHEN belongs to the person — a price list is worth commenting
-- after a post has had a few hours to be seen, not in the same second — and
-- the text belongs to the ROUND it is about, not to a global setting that
-- would put last month's offer under this month's posts.
--
-- So the comment lives on the campaign, and each published row carries its own
-- state for it:
--
--   ''        nothing was asked for
--   'pending' asked for, not done yet
--   'done'    left on the post, and verified there
--   'failed'  asked for and could not be placed
--
-- Four states, not a boolean. "Not asked" and "asked and failed" are opposite
-- facts about a post that is already live and cannot be taken back, and a
-- screen that shows them alike would have the owner believing a phone number
-- is under a post where it is not.
--
-- Safe to run more than once.

alter table public.social_campaigns
  add column if not exists comment_text text not null default '',
  add column if not exists comment_media jsonb not null default '[]'::jsonb,
  add column if not exists comment_gap_seconds integer not null default 30;

comment on column public.social_campaigns.comment_text is
  'What to leave as a comment on this round''s posts. Belongs to the round, so it is about the round.';
comment on column public.social_campaigns.comment_media is
  'One image for that comment, as a MediaItem array. Facebook takes one attachment per comment.';
comment on column public.social_campaigns.comment_gap_seconds is
  'Seconds between one comment and the next. The owner''s choice, per round — a hundred posts at ten seconds is twenty minutes, at sixty it is an hour and a half.';

alter table public.social_queue
  add column if not exists comment_status text not null default '',
  add column if not exists comment_at timestamptz;

comment on column public.social_queue.comment_status is
  '''''|pending|done|failed. Empty means nobody asked for a comment on this post — which is not the same as one that failed.';

-- The worker asks for the oldest pending row of a round; this keeps that cheap.
create index if not exists social_queue_comment_idx
  on public.social_queue (comment_status, published_at)
  where comment_status = 'pending';

-- ---------------------------------------------------------------------------
-- Why a comment did not make it.
--
-- "לא הצליח" is the answer that makes a person press the same button again.
-- A post that was deleted by the group's admin, a group that closed comments,
-- and a Facebook security screen mid-round are three different things to do
-- next, and only one of them is worth retrying. The worker writes the sentence
-- it would have said in the terminal; the screen shows it under the group.
alter table public.social_queue
  add column if not exists comment_note text not null default '';

comment on column public.social_queue.comment_note is
  'A whole Hebrew sentence saying why the comment failed. Empty when it worked, or when nothing has been tried yet.';
