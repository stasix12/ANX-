/*
 * THE NIGHTLY GROUP CHECK'S CLOCK.
 *
 * "תעשה את זה כפעולה אוטומטית בכל סוף יום", and then, once it was clear how
 * much browsing the sweep really is, "לעשות מאוחר בלילה בין 2-3". The whole
 * feature is three comparisons that are wrong in ways nobody notices for a day
 * at a time. A check that fires twice sends a hundred and twenty page loads at
 * somebody's Facebook account instead of sixty; a check that never fires is a
 * promise the screen makes and the machine does not keep. Neither shows up as
 * an error.
 *
 * Every instant below is written on the OWNER'S clock (Asia/Jerusalem, +03:00
 * in September) precisely because the worker's own may be UTC — a container
 * sweeping at 02:00 its time is sweeping at five in the morning theirs, and a
 * rule written the other way round lands in the middle of their working day.
 */
import assert from 'node:assert/strict';
import { NIGHTLY_FROM, NIGHTLY_OVERDUE_MS, NIGHTLY_TO, nightlyDue } from '../nightly';

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

const at = (iso: string) => new Date(iso);

/* ------------------------------------------------ 1. in the small hours */
is(
  nightlyDue({ lastISO: null, now: at('2026-09-30T02:05:00+03:00') }),
  'at 02:05 with no check ever recorded, it is due',
);
is(
  nightlyDue({ lastISO: '2026-09-29T20:00:00+03:00', now: at('2026-09-30T03:59:00+03:00') }),
  'and 03:59 is still inside the window',
);
/*
 * A FIRST-EVER CHECK RUNS AT ONCE, whatever the hour — "never" is treated as
 * infinitely overdue rather than as a night that has not arrived yet.
 *
 * My first version of this test asserted the opposite, and the code was right:
 * there is no previous sweep to be spacing away from, the owner has just asked
 * for the feature, and the work itself is paced regardless. Making them wait
 * until two tomorrow morning to see anything happen would be a worse answer to
 * "do it automatically" than doing it.
 */
is(
  nightlyDue({ lastISO: null, now: at('2026-09-29T14:00:00+03:00') }),
  'a first-ever check does not wait for the small hours',
);
is(
  nightlyDue({ lastISO: '2026-09-29T02:04:00+03:00', now: at('2026-09-30T02:05:00+03:00') }),
  'and last night’s check does not count for tonight',
);

/* ----------------------------- 2. THE BUG THE MOVE TO 02:00 COULD HAVE MADE */
/*
 * This rule used to read `zonedHour(now) >= NIGHTLY_HOUR` with the hour at 23.
 * That says "23:00 or later", and since 23 is the last hour of the day it
 * could only ever mean the one hour — so it was indistinguishable from a
 * window, and passed for months.
 *
 * Move the same test to 2 and it becomes "02:00 or later": true at ten in the
 * morning, true at six in the evening, true at every hour the owner is
 * actually at their desk. It would have turned "בין 2-3" into "whenever the
 * machine happens to be on", which is the precise complaint that led here —
 * a browser opening group after group in the middle of the day.
 *
 * Both ends of the window are therefore asserted, with a stamp from last night
 * so the hour is the only thing left to decide.
 */
/*
 * YESTERDAY EVENING, and the hour of it is chosen rather than incidental.
 *
 * To isolate the hour, a case must be neither "done since this local day
 * began" nor "overdue" — either answers before the hour is consulted. My
 * first draft used a stamp from the previous NIGHT, which is 39 hours before
 * six the following evening: past the 36-hour overdue line, so the rule
 * correctly said "due" and the assertion I had written for the hour was
 * really measuring the backstop. An evening stamp leaves every instant below
 * inside 36 hours and on the previous local day, which is the one window
 * where only the hour can decide.
 */
const yesterdayEvening = '2026-09-29T20:00:00+03:00';
is(
  !nightlyDue({ lastISO: yesterdayEvening, now: at('2026-09-30T10:00:00+03:00') }),
  'ten in the morning is NOT the window — the old `hour >= 2` form would have said it was',
);
is(
  !nightlyDue({ lastISO: yesterdayEvening, now: at('2026-09-30T18:00:00+03:00') }),
  'nor six in the evening',
);
is(
  !nightlyDue({ lastISO: yesterdayEvening, now: at('2026-09-30T23:30:00+03:00') }),
  'nor 23:30, which is when this used to run',
);
is(
  !nightlyDue({ lastISO: yesterdayEvening, now: at('2026-09-30T01:59:00+03:00') }),
  'nor 01:59, one minute early',
);
is(
  !nightlyDue({ lastISO: yesterdayEvening, now: at('2026-09-30T04:00:00+03:00') }),
  'nor 04:00, one minute late',
);
is(NIGHTLY_FROM < NIGHTLY_TO, 'the window has two ends, and they are the right way round');

/* ------------------------------------------------------- 3. and only once */
is(
  !nightlyDue({ lastISO: '2026-09-30T02:05:00+03:00', now: at('2026-09-30T02:40:00+03:00') }),
  'half an hour later the same night, it is done',
);
/*
 * "Done in the last 24 hours" would let a check at 02:10 and another at 02:20
 * the next local day both fire inside 24 hours and one minute. The rule is
 * "since this local day began", which is what makes a night a night.
 */
is(
  !nightlyDue({ lastISO: '2026-09-30T02:10:00+03:00', now: at('2026-09-30T23:50:00+03:00') }),
  'a check at 02:10 still counts at 23:50 the same day',
);
/* Which is not the same as "the check may only run at 02:00": a sweep that ran
   in the morning because it was overdue owns that whole day. */
is(
  !nightlyDue({ lastISO: '2026-09-30T09:00:00+03:00', now: at('2026-09-30T23:30:00+03:00') }),
  'and a morning check because it was overdue holds until the next local day',
);

/* ------------------------------ 4. a machine that is never awake at 02:00 */
/*
 * A PC shut at 18:00 and opened at 09:00 never sees the hour. Without this the
 * feature does nothing at all for the person who asked for it — silently. It
 * matters more at 02:00 than it did at 23:00: far fewer machines are on.
 */
is(
  nightlyDue({ lastISO: '2026-09-28T09:00:00+03:00', now: at('2026-09-30T09:05:00+03:00') }),
  'two days later at 09:05, overdue by more than 36 hours, it runs anyway',
);
is(
  !nightlyDue({ lastISO: '2026-09-29T09:00:00+03:00', now: at('2026-09-30T09:05:00+03:00') }),
  'but a check 24 hours old at nine in the morning waits for tonight rather than drifting an hour earlier every day',
);
is(
  NIGHTLY_OVERDUE_MS > 24 * 3_600_000,
  'the overdue window is deliberately longer than a day, which is what stops that drift',
);

/* --------------------------------------------- 5. a stamp it cannot trust */
/*
 * A machine with a wrong clock, or a row written by a PC in another timezone.
 * Read as "done", a future stamp switches the check off until the date catches
 * up — for however long that is, and with nothing on any screen saying so.
 */
is(
  nightlyDue({ lastISO: '2027-01-01T00:00:00+03:00', now: at('2026-09-30T02:05:00+03:00') }),
  'a stamp in the future is treated as never, not as done',
);
is(
  nightlyDue({ lastISO: 'not a date', now: at('2026-09-30T02:05:00+03:00') }),
  'and so is one that is not a date at all',
);
is(
  nightlyDue({ lastISO: undefined, now: at('2026-09-30T02:05:00+03:00') }),
  'and a missing one',
);

/* ------------------------------------------ 6. the owner's clock, not ours */
/*
 * BOTH CARRY LAST NIGHT'S CHECK, which is what isolates the hour.
 *
 * A stamp from earlier the SAME day answers "done today" before the hour is
 * ever consulted, and a stamp from days ago answers "overdue" — either way the
 * timezone is not what the assertion measures. Last night is the one window
 * where the hour is the only thing left to decide, and getting that wrong is
 * how I wrote this assertion twice before it said what it meant.
 *
 * 23:05 UTC is 02:05 in Be'er Sheva, and 02:05 UTC is 05:05 there. So each of
 * these is inside the window on one clock and outside it on the other, and a
 * rule reading the machine's own gives the wrong answer to both.
 */
is(
  nightlyDue({ lastISO: yesterdayEvening, now: at('2026-09-29T23:05:00Z') }),
  '23:05 UTC is 02:05 on the owner’s clock, and that is the clock the rule reads',
);
is(
  !nightlyDue({ lastISO: yesterdayEvening, now: at('2026-09-30T02:05:00Z') }),
  'while 02:05 UTC is 05:05 there — past the window, and the owner may be up',
);

console.log(`nightly check tests OK — ${checks} assertions`);
