import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveQueueHero } from '../../src/components/social/LiveCampaignHero';
import { addDaysISO, zonedDateISO, zonedToUtc } from '../../src/lib/social/time';

/**
 * "כל יום רק את הכמות פוסטים המתוזמנים לאותו היום ואז יתאפס."
 *
 * The daily bar measured publications against `maxPerDay` — the ceiling in
 * settings, a number he typed once that says nothing about today. "22 מתוך
 * 300" over a day holding 48 publications reads as 7% done when he is nearly
 * half way, and it never moves relative to anything he recognises.
 *
 * It now measures against WHAT TODAY HOLDS: what has gone out plus what is
 * still waiting before the next local midnight. Two properties fall out of
 * that definition rather than being enforced anywhere, and both are asserted
 * below because both are the request:
 *
 *   IT RESETS WITH NO JOB TO RESET IT. Tomorrow the boundary is tomorrow's and
 *   this morning's publications are no longer counted — there is no midnight
 *   task that could fail to run, and nothing to be stale.
 *
 *   IT CAN NEVER BE SMALLER THAN WHAT HAS ALREADY GONE OUT, because what has
 *   gone out is one of its two halves. The old denominator could be: lowering
 *   the cap in settings after publishing put the bar past its own end.
 *
 *   npx tsx worker/test/today-count.test.ts
 */

let checks = 0;
const is = (c: unknown, msg: string) => {
  checks += 1;
  assert.ok(c, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

const card = (publishedToday: number, plannedToday: number, dailyTarget = 300): string =>
  renderToStaticMarkup(
    createElement(LiveQueueHero, {
      systemState: 'running',
      publishedToday,
      dailyTarget,
      plannedToday,
      pendingCancellable: 0,
      nextAt: null,
      nextTargetName: null,
      workerOnline: true,
    } as never),
  );

/* ───────── 1. the bar is about TODAY, not about the ceiling ───────────── */
{
  const html = card(22, 48);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  is(/22\s*\/\s*48/.test(text), `the ratio must be out of today's own total — got: ${text.slice(0, 160)}`);
  is(text.includes('מתוך המתוכננים להיום'), 'and must say that is what it is out of');
  /* THE CEILING IS NOT THE DENOMINATOR ANY MORE. Asserted on the ratio rather
     than on the page, because 300 is still legitimately named below — as the
     limit it is, which is all it was ever able to tell him. */
  is(!/22\s*\/\s*300/.test(text), 'the settings ceiling is no longer what the bar is measured against');
  is(text.includes('300'), 'but it is still stated, because it is still a real limit');

  /*
   * THE BAR AGREES WITH THE FIGURE ABOVE IT — one number, two drawings.
   *
   * Checked on the FILL'S WIDTH and not only on its label, and that distinction
   * caught a real hole: a mutation that pointed the bar back at the 300 while
   * leaving the label alone passed every other assertion here. The label is
   * what a screen reader is told; the width is what he sees. They are two
   * expressions and nothing but this line makes them say the same thing.
   */
  is(/aria-label="22 מתוך 48[^"]*"/.test(html), `the bar's own label must say the same thing — got: ${(html.match(/aria-label="[^"]*מתוך[^"]*"/) ?? [])[0]}`);
  const fill = Number((html.match(/width:\s*([\d.]+)%/) ?? [])[1]);
  is(Math.abs(fill - (22 / 48) * 100) < 0.5, `the bar must be filled to 22 of 48 (${(22 / 48 * 100).toFixed(1)}%), not to 22 of the ceiling — got ${fill}%`);
}

/* ───────── 2. nothing today is a sentence, not a bar out of zero ───────── */
{
  const html = card(0, 0);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  is(text.includes('אין פרסומים מתוכננים להיום'), 'a day with nothing in it says so');
  /*
   * AND DRAWS NO BAR. A ratio out of zero is a bar that is either empty or
   * full depending on how the division is written, and neither is a fact —
   * ProgressBar's own Math.max(1, total) would have drawn an empty one, which
   * reads as "0 of something" on a day that has no something.
   */
  is(!/role="progressbar"/.test(html) && !/aria-label="0 מתוך 0/.test(html), 'and draws no progress bar at all');
}

/* ───────── 3. it cannot be smaller than what has gone out ─────────────── */
{
  /*
   * The old denominator could be. `maxPerDay` is editable at any moment, so
   * lowering it after a busy morning put the figure past the end of its own
   * bar — "48 / 20". The new one is published + waiting, so the published half
   * is inside it by construction; this is the regression test for the day
   * somebody "optimises" it into a separate count.
   */
  const html = card(48, 48);
  is(/48\s*\/\s*48/.test(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')), 'a finished day reads as complete, not as overflowing');
  is(/aria-label="48 מתוך 48/.test(html), 'and the bar is full rather than past its end');
}

/* ───────── 4. "ואז יתאפס" — the boundary that makes it reset ──────────── */
{
  /*
   * THE RESET IS THE BOUNDARY, AND THE BOUNDARY IS A CALENDAR DATE IN THE
   * ZONE — not `now + 24h`.
   *
   * Israel's two clock changes make one day 23 hours long and another 25.
   * A 24-hour window would end an hour early on one of them and an hour late
   * on the other, so for one day a year "today" would silently include an hour
   * of tomorrow's publications, or drop an hour of its own.
   */
  const TZ = 'Asia/Jerusalem';
  const nextMidnight = (iso: string) => zonedToUtc(addDaysISO(zonedDateISO(new Date(iso), TZ), 1), '00:00', TZ);

  /* An ordinary day: midnight is midnight. */
  eq(
    nextMidnight('2026-10-06T14:01:00+03:00').toISOString(),
    new Date('2026-10-07T00:00:00+03:00').toISOString(),
    'the day ends at the next local midnight',
  );
  /* 25.10.2026, the Sunday Israel goes back to +02:00 at 02:00 — a 25-hour
     day. The boundary is still that date's midnight, not 24 hours later. */
  const dstBack = nextMidnight('2026-10-25T14:00:00+02:00');
  eq(dstBack.toISOString(), new Date('2026-10-26T00:00:00+02:00').toISOString(), 'and on the 25-hour day it is still midnight');
  is(
    dstBack.getTime() - new Date('2026-10-25T14:00:00+02:00').getTime() !== 24 * 3_600_000,
    'which is NOT what "now + 24h" would have given on that day',
  );
  /* 27.03.2026, the Friday the clock goes forward — a 23-hour day. */
  eq(
    nextMidnight('2026-03-27T14:00:00+03:00').toISOString(),
    new Date('2026-03-28T00:00:00+03:00').toISOString(),
    'and on the 23-hour day too',
  );

  /* AND IT MOVES. Two consecutive days do not share a boundary, which is the
     whole of "ואז יתאפס": nothing resets the counter, the window moves. */
  is(
    nextMidnight('2026-10-06T23:59:00+03:00').getTime() < nextMidnight('2026-10-07T00:01:00+03:00').getTime(),
    'a minute after midnight is counting a different day',
  );
}

/* ───────── 5. and the page really asks for that boundary ──────────────── */
{
  const page = readFileSyncStripped('src/app/social/page.tsx');
  is(
    /countWaitingWithin\(zonedToUtc\(addDaysISO\(zonedDateISO\(now\), 1\), '00:00'\)/.test(page),
    "the dashboard counts what is waiting before the next LOCAL midnight — a `now + 24h` here is the one-day-a-year bug above",
  );
  is(/plannedToday: today \+ waitingToday/.test(page), 'and today holds what went out plus what is still to go');
}

function readSyncStrip(file: string): string {
  return require('node:fs')
    .readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}
function readFileSyncStripped(file: string): string {
  return readSyncStrip(file);
}

console.log(`today's count OK — ${checks} assertions, rendered and across both clock changes`);
