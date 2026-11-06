/*
 * ─── THE PLANNER WRITES FOR TODAY, AND NOT ONE MINUTE FURTHER ─────────────
 *
 * "אני רוצה שהמתכנן יספור רק את של אותו היום הנוכחי בלבד לא 48 שעות."
 *
 * WHAT THE 48 HOURS DID, measured on the owner's live database on 06/11:
 *
 *   one pass at 20:50 planned today's 12:00 occasion AND tomorrow's — 232
 *   groups each, 464 rows, created in the same second. When the start hour
 *   was changed at 23:48 the queue was re-stamped, and the cascade laid
 *   tomorrow's round end to end after today's: 12:00 → 15:51, every group
 *   twice, one hour fifty-six apart, same post, same dedupe hash. The
 *   account's same-group repeat floor is 0, so nothing stood in the way.
 *
 * A day-long horizon removes that by construction rather than by a guard:
 * tomorrow's occasion is not written until tomorrow, so a re-stamp has
 * nothing to pull forward.
 *
 * WHAT IT COSTS. The 48 hours were also a buffer — a round whose hour passed
 * while the PC was asleep still had its rows and published them late. Planned
 * only for today, a window missed while the machine is off is missed for
 * good. That is the trade, it was asked for, and it is written down here so
 * nobody re-widens the horizon without meeting it.
 *
 *   npx tsx worker/test/plan-horizon.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { endOfPlanningDay } from '../../src/lib/social/plan';
import { slotsFor } from '../../src/lib/social/slots';
import { zonedDateISO } from '../../src/lib/social/time';

let checks = 0;
const is = (cond: boolean, claim: string) => {
  checks += 1;
  assert.ok(cond, claim);
};
const eq = (actual: unknown, expected: unknown, claim: string) => {
  checks += 1;
  assert.deepEqual(actual, expected, `${claim}\n  expected: ${JSON.stringify(expected)}\n  got     : ${JSON.stringify(actual)}`);
};

const IL = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'medium' }).format(d);

/* ─── §1 — the boundary is local midnight, every day of the year ─────────── */

{
  /*
   * NOT `now + 24h`. A rolling window drifts with the minute the planner
   * happens to run at: a round at 23:30 would fall inside the horizon on one
   * pass and outside it on the next, and on a clock-change day it would be
   * planned twice or not at all. Midnight in Asia/Jerusalem is a fact about
   * the day, not about when the pass started.
   */
  for (const iso of [
    '2026-11-06T07:01:00Z',
    '2026-11-06T21:59:00Z',
    '2026-01-01T00:00:01Z',
    '2026-06-30T12:00:00Z',
    /* Both Israeli clock changes, where a 24-hour window is 23 or 25. */
    '2026-03-27T13:00:00Z',
    '2026-10-25T12:00:00Z',
  ]) {
    const now = new Date(iso);
    const until = endOfPlanningDay(now);
    is(IL(until).endsWith('23:59:59'), `the horizon ends at local midnight — now ${IL(now)} gave ${IL(until)}`);
    eq(zonedDateISO(until), zonedDateISO(now), `and on the SAME local day — now ${IL(now)} gave ${IL(until)}`);
    is(until.getTime() > now.getTime(), `and is always ahead of the pass that asked — now ${IL(now)}`);
  }
}

{
  /* STRICTLY BEFORE TOMORROW. slotsFor() takes `at <= until`, so a horizon of
     exactly 00:00 would catch tomorrow's midnight occasion — the very thing
     this change exists to stop, one minute wide. */
  const until = endOfPlanningDay(new Date('2026-11-06T07:01:00Z'));
  const tomorrowMidnight = new Date('2026-11-06T22:00:00Z'); // 07/11 00:00 Israel
  is(until.getTime() < tomorrowMidnight.getTime(), 'the horizon stops strictly before tomorrow begins');
}

{
  /* ONE ANSWER PER DAY, whatever the hour of the pass — the planner runs every
     minute and a horizon that moved with it would re-plan a different set each
     time. */
  const morning = endOfPlanningDay(new Date('2026-11-06T06:00:00Z'));
  const evening = endOfPlanningDay(new Date('2026-11-06T19:00:00Z'));
  eq(morning.toISOString(), evening.toISOString(), 'every pass on one day shares one horizon');
}

/* ─── §2 — and the occasion count that caused the duplicate ──────────────── */

{
  /*
   * THE REPRODUCTION, with his own schedule: weekly, every day, 12:00.
   *
   * With the 48-hour horizon this returned TWO instants — today's 12:00 and
   * tomorrow's — and both were written in one pass. That is the second copy
   * of every publication, before any re-stamp touched it.
   */
  const weekly = {
    mode: 'weekly' as const,
    timezone: 'Asia/Jerusalem',
    weekly: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), ['12:00']])),
    run_at: null,
    interval_days: null,
    interval_time: null,
  };
  const now = new Date('2026-11-06T07:01:00Z'); // 09:01 Israel, before the occasion
  const from = new Date(now.getTime() - 15 * 60_000);

  const today = slotsFor(weekly as never, from, endOfPlanningDay(now));
  eq(today.length, 1, 'a day-long horizon plans one occasion');
  is(IL(today[0]).startsWith('06/11/2026, 12:00'), `and it is today's — got ${IL(today[0])}`);

  /* THE OLD HORIZON, kept here as the thing being fixed rather than described
     in a comment: two occasions, which is two rows per group. */
  const old = slotsFor(weekly as never, from, new Date(now.getTime() + 48 * 3_600_000));
  eq(old.length, 2, 'THE BUG: 48 hours planned tomorrow as well');
  is(IL(old[1]).startsWith('07/11/2026'), 'and the second instant belonged to tomorrow');
}

{
  /* A ROUND LATER TODAY IS STILL PLANNED — the horizon shortens the future,
     not the day. */
  const weekly = {
    mode: 'weekly' as const,
    timezone: 'Asia/Jerusalem',
    weekly: { '5': ['23:30'] },
    run_at: null,
    interval_days: null,
    interval_time: null,
  };
  const now = new Date('2026-11-06T07:01:00Z'); // Friday 09:01 Israel
  const slots = slotsFor(weekly as never, new Date(now.getTime() - 900_000), endOfPlanningDay(now));
  eq(slots.length, 1, 'an occasion at 23:30 tonight is inside the horizon');
  is(IL(slots[0]).startsWith('06/11/2026, 23:30'), `and keeps its hour — got ${IL(slots[0])}`);
}

/* ─── §3 — the planner uses it, and no arithmetic horizon survives ───────── */

const plan = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8');

{
  checks += 1;
  assert.ok(plan.includes('const until = endOfPlanningDay(now);'), 'planQueue plans to the end of today');
  checks += 1;
  assert.ok(
    !/HORIZON_HOURS/.test(plan),
    'the old constant may not linger — a second horizon in the file is a second answer to "how far ahead"',
  );
  checks += 1;
  assert.ok(
    !/now\.getTime\(\) \+ \d+ \* 3_600_000/.test(plan),
    'THE BUG: a rolling now+N-hours window drifts with the minute the pass runs at',
  );
  /* THE BOUNDARY IS THE ZONE'S, not the server's. */
  checks += 1;
  assert.ok(
    plan.includes("zonedToUtc(addDaysISO(zonedDateISO(now), 1), '00:00')"),
    'and midnight is local midnight, so the two Israeli clock changes are the calendar’s problem and not ours',
  );
  checks += 1;
  assert.ok(plan.includes('.getTime() - 1)'), 'one millisecond short of tomorrow, because slotsFor takes `at <= until`');
}

console.log(`plan horizon OK — ${checks} assertions`);
