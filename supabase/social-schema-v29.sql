-- ───────────────────────────────────────────────────────────────────────────
-- v29 — סבבים ביום (ריצות): יותר מסבב פרסום אחד ביום לאותו קמפיין.
--
-- "הפעלת מספר סבבי פרסום לאותו קמפיין באותו היום." סבב 1 ב-03:30, סבב 2
-- ב-15:30 — אותו קמפיין, אותו תוכן, אותן קבוצות, בלי לשכפל קמפיין.
--
-- THE ENGINE HAS ALWAYS BEEN ABLE TO RUN SEVERAL OCCASIONS A DAY.
-- social_schedules.weekly is Record<weekday, 'HH:MM'[]> and src/lib/social/
-- slots.ts already loops that array, converting every entry through
-- zonedToUtc — so several occasions a day, in Asia/Jerusalem, across a
-- daylight-saving change, is existing and tested behaviour. What never existed
-- is a way to SAY there is more than one: both writers of `weekly`
-- (syncWeeklyHours and setCampaignRepeat, src/lib/social/client.ts) build
-- exactly `[schedule_start]`, one entry per chosen day, and the second would
-- overwrite anything the first had put there.
--
-- So this file adds no scheduler. The product has a standing rule against a
-- second scheduling mechanism and has been bitten by one already. It adds the
-- LIST those two writers build their one entry from.
--
-- WHY ON THE CAMPAIGN AND NOT ON social_schedules. Same reason v24 put the
-- window there: a campaign has many schedule rows (one per post) and the hours
-- are a property of the ROUND, not of a post. Putting them on the schedule row
-- would mean two posts in one campaign could disagree about when the campaign
-- publishes, and the owner has no screen on which to see or fix that.
--
-- WHY THE FIRST ROUND IS NOT IN HERE. Round one is schedule_start, the hour
-- already on the card. An hour stored in two places is the defect this product
-- has been bitten by twice, most recently this week — "אני רוצה לשנות את השעה
-- בערוך מועד והוא משאיר את אותה השעה שהיה רשום בקמפיין". This column holds the
-- SECOND and later occasions only.
--
-- WHAT DOES NOT CHANGE FOR AN EXISTING INSTALL. The default is an empty array,
-- which readRounds() resolves to "one round a day" — exactly what every
-- campaign does today. No row is written, nothing is dropped, and a database
-- that has not run this file reads the same empty answer through the same
-- function, because schedule_rounds is optional on the Campaign interface.
--
-- WHAT IS DELIBERATELY NOT IN HERE. No per-round gap column. The gap between
-- publications is schedule_gap_seconds and it paces the ACCOUNT, not one
-- round; giving each round its own would let two rounds disagree about how
-- fast one Facebook account may post, which is the number that gets an account
-- restricted. The card shows the campaign's gap on every round row.
--
-- A NUMBER THE CARD HAS TO SAY OUT LOUD, not a thing this file can enforce:
-- rules.ts refuses a second publication of one post to one group inside
-- repeat_min_hours, whose floor is 12 (v25). Rounds at 03:30 and 15:30 are
-- exactly 12 hours apart — the closest two rounds the engine will ever allow —
-- and they publish only if repeat_enabled is on AND repeat_min_hours is 12.
-- With the default of 20 the second round is refused for every group the first
-- one reached. The cap of four below is for the same reason: more than two
-- rounds a day cannot reach the same groups whatever is configured.
--
-- SAFE TO RUN AGAIN. `add column if not exists`, and the constraint is added
-- only when it is absent.
--
-- TO UNDO IT: supabase/social-schema-v29-rollback.sql.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.social_campaigns
  add column if not exists schedule_rounds jsonb not null default '[]'::jsonb;

-- The shape is enforced here and not only in the editor, the same way v24's
-- gap range and v25's repeat floor are: an array, and at most four entries.
-- Four, because with the 12-hour floor above at most TWO rounds a day can ever
-- reach the same groups — the room is for rounds the owner has switched off
-- and for laying out a day, not for a fifth publication that cannot happen.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'social_campaigns_schedule_rounds_ck'
  ) then
    alter table public.social_campaigns
      add constraint social_campaigns_schedule_rounds_ck
      check (jsonb_typeof(schedule_rounds) = 'array' and jsonb_array_length(schedule_rounds) <= 4);
  end if;
end $$;

comment on column public.social_campaigns.schedule_rounds is
  'סבבי פרסום נוספים באותו יום: [{"at":"HH:MM","enabled":true}]. הסבב הראשון הוא schedule_start ואינו כאן. ריק = סבב אחד ביום, ההתנהגות הקיימת.';

do $$
declare n bigint;
begin
  select count(*) into n from public.social_campaigns;
  raise notice 'v29: העמודה schedule_rounds נוספה. % קמפיינים קיימים ממשיכים עם סבב אחד ביום, ללא שינוי.', n;
end $$;
