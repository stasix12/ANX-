-- Social module v3: "drip" schedules — spread one post across many groups
-- over several days (N per day inside a daily window). Run after v2.
alter table public.social_schedules drop constraint if exists social_schedules_mode_check;
alter table public.social_schedules
  add constraint social_schedules_mode_check
  check (mode in ('now', 'once', 'weekly', 'interval', 'drip'));

alter table public.social_schedules add column if not exists drip_per_day int;
alter table public.social_schedules add column if not exists drip_window_start text not null default '09:00';
alter table public.social_schedules add column if not exists drip_window_end text not null default '20:00';
