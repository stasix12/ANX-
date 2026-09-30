-- v22 — WHICH GROUPS HAVE POTENTIAL CUSTOMERS IN THEM
--
-- "תעשה שיהיה אפשר לפרסם רק לקבוצות שיש בהם לקוחות פוטנציאליים, שלא אשלח
-- לקבוצות שאין שם לקוחות שלי."
--
-- One mark per group, made by the owner. The app suggests and explains; only a
-- tap writes. THREE states and not two: 'unknown' is "nobody has said yet",
-- which is deliberately not the same as 'none' — every group that exists today
-- is unknown, so a product that read that as a refusal would stop a whole
-- round the first time the switch was turned on.
--
-- Nothing changes until the owner turns on "לפרסם רק לקבוצות עם לקוחות" in
-- settings. Until then this column is recorded and read, and refuses nothing.
--
-- Safe to run more than once.

alter table public.social_targets
  add column if not exists audience text not null default 'unknown';

-- The list is replaced rather than extended, because that is the only form that
-- is safe to run twice.
alter table public.social_targets
  drop constraint if exists social_targets_audience_check;
alter table public.social_targets
  add constraint social_targets_audience_check
  check (audience in ('unknown', 'customers', 'none'));

comment on column public.social_targets.audience is
  'Owner''s own mark: customers = my customers are in this group, none = they are not, unknown = nobody has said yet. Enforced only while limits.customersOnly is on. Never written by an automatic classifier.';
