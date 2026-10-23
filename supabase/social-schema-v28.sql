-- ───────────────────────────────────────────────────────────────────────────
-- v28 — העמודה שחסרה: drip_gap_seconds. בלעדיה כל השקה של פוסט ליותר
--        מקבוצה אחת נכשלת.
--
-- WHAT IS BROKEN RIGHT NOW. Since 12.10.2026 (commit 219b942, "Thirty seconds
-- was eleven floors, not one") the launch path writes a column that does not
-- exist in any .sql file in this repository:
--
--   src/lib/social/library.ts:681  scheduleInputFor() → drip_gap_seconds
--   src/lib/social/slots.ts:35     dripSlots() reads it back
--   src/lib/social/types.ts:208    declares it on the Schedule row
--
-- draftFor() (library.ts) chooses mode 'drip' for ANY launch with more than
-- one target, and scheduleInputFor() adds the five drip_* fields to every
-- non-'now' mode. So createSchedule() (client.ts) inserts the column, PostgREST
-- answers PGRST204 — "Could not find the 'drip_gap_seconds' column of
-- 'social_schedules' in the schema cache" — unwrap() throws, and the launch
-- ends with nothing queued.
--
-- A round that was ALREADY running is untouched: the daily repeat writes its
-- weekly rows through setCampaignRepeat(), which does not carry drip_* at all.
-- That is why publishing kept working while every new launch failed, and why
-- the library fills up with posts that say "טרם פורסם".
--
-- WHY NO TEST CAUGHT IT. worker/test/unit.test.ts:1830 asserts the field IS
-- written, by reading library.ts as text. Nothing compared what the code
-- writes against what the database has. worker/test/schema-columns.test.ts
-- now does, against a real Postgres built from these files.
--
-- WHAT THIS FILE DOES. Adds one nullable integer column. It writes no row,
-- drops nothing, and changes no behaviour on its own: slots.ts already falls
-- back to drip_gap_minutes when the seconds are absent (slots.ts:35-39), so a
-- database that has run this and one that has not differ only in whether the
-- launch succeeds.
--
-- SAFE TO RUN AGAIN. `add column if not exists`.
--
-- TO UNDO IT: `alter table public.social_schedules drop column drip_gap_seconds;`
-- Nothing reads it except slots.ts, which treats it as optional, so dropping it
-- returns the product to whole-minute drip gaps rather than breaking it.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.social_schedules
  add column if not exists drip_gap_seconds integer;

comment on column public.social_schedules.drip_gap_seconds is
  'מרווח בשניות בין פרסום לפרסום בהשקה מרובת קבוצות. גובר על drip_gap_minutes כשהוא קיים; ריק = להשתמש בדקות.';

-- The minutes column stays and stays authoritative for an un-updated reader:
-- slots.ts rounds the seconds UP into it on every write, so a worker that has
-- not been updated publishes SLOWER than asked rather than faster — the safe
-- direction for the one number that paces an account.

do $$
declare n bigint;
begin
  select count(*) into n from public.social_schedules where drip_gap_seconds is null and mode <> 'now';
  raise notice 'v28: העמודה drip_gap_seconds נוספה. % תזמונים קיימים ימשיכו להשתמש בדקות.', n;
end $$;
