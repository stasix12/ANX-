-- Social module v6: drip schedules get an explicit gap (minutes) between posts.
alter table public.social_schedules add column if not exists drip_gap_minutes int;
