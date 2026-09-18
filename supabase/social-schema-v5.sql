-- Social module v5: city grouping for targets (auto-detected from the name).
alter table public.social_targets add column if not exists city text not null default '';
