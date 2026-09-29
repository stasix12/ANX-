/*
 * THE NIGHTLY GROUP CHECK'S CLOCK.
 *
 * "תעשה את זה כפעולה אוטומטית בכל סוף יום" — and the whole feature is three
 * comparisons that are wrong in ways nobody notices for a day at a time. A
 * check that fires twice sends a hundred and twenty page loads at somebody's
 * Facebook account instead of sixty; a check that never fires is a promise the
 * screen makes and the machine does not keep. Neither shows up as an error.
 *
 * Every instant below is written on the OWNER'S clock (Asia/Jerusalem, +03:00
 * in September) precisely because the worker's own may be UTC — a container
 * that sweeps at 23:00 its time is sweeping at two in the afternoon theirs.
 */
import assert from 'node:assert/strict';
import { NIGHTLY_OVERDUE_MS, inQuietHours, nightlyDue } from '../nightly';

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

const at = (iso: string) => new Date(iso);

/* ------------------------------------------------ 1. once the day is over */
is(
  nightlyDue({ lastISO: null, now: at('2026-09-29T23:05:00+03:00') }),
  'at 23:05 with no check ever recorded, it is due',
);
/*
 * A FIRST-EVER CHECK RUNS AT ONCE, whatever the hour — "never" is treated as
 * infinitely overdue rather than as a day that has not ended yet.
 *
 * My first version of this test asserted the opposite, and the code was right:
 * there is no previous sweep to be spacing away from, the owner has just asked
 * for the feature, and the work itself is paced regardless. Making them wait
 * until 23:00 tonight to see anything happen would be a worse answer to "do it
 * automatically" than doing it.
 */
is(
  nightlyDue({ lastISO: null, now: at('2026-09-29T14:00:00+03:00') }),
  'a first-ever check does not wait for the evening',
);
is(
  !nightlyDue({ lastISO: '2026-09-29T08:00:00+03:00', now: at('2026-09-29T22:55:00+03:00') }),
  'but at 22:55, with a check already done this morning, the day has not ended and nothing is owed',
);
is(
  nightlyDue({ lastISO: '2026-09-28T23:04:00+03:00', now: at('2026-09-29T23:05:00+03:00') }),
  'and last night’s check does not count for tonight',
);

/* ------------------------------------------------------- 2. and only once */
is(
  !nightlyDue({ lastISO: '2026-09-29T23:05:00+03:00', now: at('2026-09-29T23:40:00+03:00') }),
  'half an hour later the same night, it is done',
);
/*
 * THE ONE THAT MATTERS. "Done in the last 24 hours" would let 23:10 and
 * 00:10 both fire — two nights of traffic inside an hour, at the exact
 * boundary the rule is about.
 */
is(
  !nightlyDue({ lastISO: '2026-09-29T23:10:00+03:00', now: at('2026-09-30T00:10:00+03:00') }),
  'a check at 23:10 still counts at 00:10 — it is "since this local day began", not "in the last 24 hours"',
);
/* Which is not the same as "the check may only run at 23:00": a sweep that
   ran in the morning because it was overdue owns that whole day. */
is(
  !nightlyDue({ lastISO: '2026-09-30T09:00:00+03:00', now: at('2026-09-30T23:30:00+03:00') }),
  'and a morning check because it was overdue holds until the next local day',
);

/* ------------------------------- 3. a machine that is never awake at 23:00 */
/*
 * A PC shut at 18:00 and opened at 09:00 never sees the hour. Without this the
 * feature does nothing at all for the person who asked for it — silently.
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

/* --------------------------------------------- 4. a stamp it cannot trust */
/*
 * A machine with a wrong clock, or a row written by a PC in another timezone.
 * Read as "done", a future stamp switches the check off until the date catches
 * up — for however long that is, and with nothing on any screen saying so.
 */
is(
  nightlyDue({ lastISO: '2027-01-01T00:00:00+03:00', now: at('2026-09-29T23:05:00+03:00') }),
  'a stamp in the future is treated as never, not as done',
);
is(
  nightlyDue({ lastISO: 'not a date', now: at('2026-09-29T23:05:00+03:00') }),
  'and so is one that is not a date at all',
);
is(
  nightlyDue({ lastISO: undefined, now: at('2026-09-29T23:05:00+03:00') }),
  'and a missing one',
);

/* ------------------------------------------ 5. the owner's clock, not ours */
/*
 * 20:05 UTC is 23:05 in Be'er Sheva. The same instant read on the machine's
 * own clock would be three hours early — and on a container, which is what
 * the hosted worker runs in, the sweep would land in the middle of the
 * afternoon.
 */
/*
 * BOTH CARRY LAST NIGHT'S CHECK, which is what isolates the hour.
 *
 * A stamp from earlier the SAME day answers "done today" before the hour is
 * ever consulted, and a stamp from days ago answers "overdue" — either way the
 * timezone is not what the assertion measures. Last night is the one window
 * where the hour is the only thing left to decide, and getting that wrong is
 * how I wrote this assertion twice before it said what it meant.
 */
is(
  nightlyDue({ lastISO: '2026-09-28T23:10:00+03:00', now: at('2026-09-29T20:05:00Z') }),
  '20:05 UTC is 23:05 on the owner’s clock, and that is the clock the rule reads',
);
is(
  !nightlyDue({ lastISO: '2026-09-28T23:10:00+03:00', now: at('2026-09-29T20:05:00+03:00') }),
  'while 20:05 on the owner’s clock is still the evening, not the end of it',
);

/* ------------------------------------------------------------ quiet hours */

/*
 * The window in which the worker may browse Facebook for things nobody asked
 * for. It wraps midnight, which is the whole reason it is a function and not
 * a comparison written inline at the call site: `h >= 23 && h < 6` is never
 * true, and it would have switched the view-count sweep off altogether rather
 * than moving it to the night.
 */
is(inQuietHours(at('2026-09-29T20:30:00Z')), '23:30 on the owner’s clock is inside the quiet hours');
is(inQuietHours(at('2026-09-29T21:00:00Z')), 'and so is midnight');
is(inQuietHours(at('2026-09-30T00:30:00Z')), 'and 03:30');
is(inQuietHours(at('2026-09-30T02:59:00Z')), 'and 05:59, the last minute of it');
is(!inQuietHours(at('2026-09-30T03:00:00Z')), 'but 06:00 is the morning — the machine goes quiet for the owner, not the other way round');
is(!inQuietHours(at('2026-09-29T09:00:00Z')), 'midday is not the time to open two hundred group pages');
is(!inQuietHours(at('2026-09-29T19:59:00Z')), 'nor 22:59, one minute before the day is declared over');

/*
 * THE CLOCK IS THE OWNER'S, NOT THE MACHINE'S, and this is the pair that
 * proves it rather than merely restating the range. Each is quiet on one
 * clock and not on the other, so a rule reading UTC gives the opposite answer
 * to both.
 */
is(inQuietHours(at('2026-09-29T20:30:00Z')), '20:30 UTC would be a working evening; 23:30 in Be’er Sheva is not');
is(!inQuietHours(at('2026-09-30T04:00:00Z')), 'and 04:00 UTC is 07:00 there — the owner is up, so the browsing stops');

console.log(`nightly check tests OK — ${checks} assertions`);
