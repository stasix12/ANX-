-- Fix: the planner's "insert or ignore" (ON CONFLICT) needs a full unique
-- index — Postgres cannot match a partial one from PostgREST. NULL
-- schedule_id values are distinct, so ad-hoc rows are unaffected.
drop index if exists public.social_queue_slot_idx;
create unique index if not exists social_queue_slot_idx
  on public.social_queue (schedule_id, target_id, scheduled_at);
