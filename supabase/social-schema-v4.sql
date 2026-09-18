-- Social module v4: group avatar pulled from Facebook by the local worker.
alter table public.social_targets add column if not exists image_url text not null default '';
