-- ---------------------------------------------------------------------------
-- v24 — תזמון פרסום לכל קמפיין: ימים, שעות, והפרש בין פוסט לפוסט.
-- ---------------------------------------------------------------------------
--
-- "המערכת רשאית לפרסם רק בימים שנבחרו, רק בין 08:00 ל-22:00, ובהפרש של 10
--  דקות בין פרסום לפרסום. אם מגיעים לשעת הסיום: לא לפרסם יותר באותו יום...
--  אין לאפס את התור. אין להתחיל את הקמפיין מחדש. יש להמשיך מאותו מקום."
--
-- WHY ON THE CAMPAIGN AND NOT ON THE SCHEDULE. social_schedules already holds
-- a drip window (drip_window_start/end, drip_gap_minutes) and it is the right
-- place for it — except that a schedule belongs to a POST, and what the owner
-- is setting here is a property of the ROUND: the card he is looking at, the
-- thing he presses pause on, the thing "הבא בתור" belongs to. A round with two
-- posts in it would otherwise carry two windows that can disagree, and the
-- card has one panel.
--
-- OFF FOR EVERY CAMPAIGN THAT ALREADY EXISTS, which is the whole of the
-- backward compatibility story and the reason the default on the first column
-- is false rather than true. A campaign that has never been touched reads
-- `schedule_enabled = false`, src/lib/social/campaign-schedule.ts
-- short-circuits on it, and rules.ts never reaches the window check. Nothing
-- about an existing round's behaviour changes until the switch is turned on.
--
-- AND THE APP DOES NOT NEED THIS FILE TO KEEP WORKING. listCampaigns() selects
-- '*', so on a database that has not run it the columns simply are not there,
-- readSchedule() resolves the same `enabled: false`, and every campaign
-- publishes exactly as it does today. Only pressing the switch fails, with the
-- message that names social-latest.sql.
--
-- Safe to run more than once. Nothing here deletes or rewrites a value.

alter table public.social_campaigns
  add column if not exists schedule_enabled boolean not null default false;

-- 0 = ראשון … 6 = שבת, the same numbering zonedWeekday() returns, so the
-- database, the engine and the seven chips on the card all count days the same
-- way. The default is the working week here; it is only what the panel OPENS
-- on, since the switch above is off.
alter table public.social_campaigns
  add column if not exists schedule_days smallint[] not null default '{0,1,2,3,4}';

-- 'HH:MM' local (Asia/Jerusalem), as text for the same reason every other time
-- of day in this schema is text: a `time` column would be read back by
-- PostgREST as '08:00:00' and the two selects on the card offer '08:00'.
alter table public.social_campaigns
  add column if not exists schedule_start text not null default '08:00';
alter table public.social_campaigns
  add column if not exists schedule_end text not null default '22:00';

-- "הפרש בין פוסטים חייב להיות ניתן לבחירה בטווח 1–30 דקות."
alter table public.social_campaigns
  add column if not exists schedule_gap_minutes smallint not null default 10;

-- The range is enforced here as well as in the app, because this column feeds
-- a defer instant: a 0 would make the gap no gap at all, and a negative one
-- would push a publication into the past on every claim. Dropped first so the
-- file is safe to run twice.
alter table public.social_campaigns
  drop constraint if exists social_campaigns_schedule_gap_check;
alter table public.social_campaigns
  add constraint social_campaigns_schedule_gap_check
  check (schedule_gap_minutes between 1 and 30);

comment on column public.social_campaigns.schedule_enabled is
  'Off = the window is not enforced at all, which is how every campaign that existed before v24 behaves. Only the panel on the campaign card turns it on.';
comment on column public.social_campaigns.schedule_days is
  'Weekdays this campaign may publish on, 0 = Sunday .. 6 = Saturday. An empty array holds every publication rather than dropping it.';
comment on column public.social_campaigns.schedule_gap_minutes is
  'Minutes between one publication OF THIS CAMPAIGN and the next, 1-30. Separate from settings.minGapMinutes, which is the whole account.';

select
  count(*) as "קמפיינים",
  count(*) filter (where schedule_enabled) as "עם תזמון פעיל"
from public.social_campaigns;
