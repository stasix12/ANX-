/*
 * ─── "ממתינים בתור" MEANS TODAY. EVERY TIME, EVERYWHERE ───────────────────
 *
 * "מהיום כלל ברזל, חישוב של ממתינים בתור זה רק מה שאמור לצאת באותו היום."
 *
 * This is a standing rule, not a bug report, so it is held as one: the test
 * below is mostly a NEGATIVE — no surface may print the whole-queue figure
 * next to those words again. Three screens had already been corrected one at
 * a time over as many weeks, and each time a fourth was found later, because
 * nothing stopped the next one being written.
 *
 * WHAT WAS ON HIS SCREEN when he wrote the rule: the tile said "ממתינים בתור
 * להיום · 285" and the card ten centimetres below it said "560 ממתינים בתור",
 * on a day that was going to publish 285. Both numbers were true of something.
 * Only one of them was true of the words beside it.
 *
 * TODAY IS THE CALENDAR DATE IN Asia/Jerusalem, not now+24h: twice a year a
 * day is 23 or 25 hours long, and a rolling window would quietly count part of
 * tomorrow on one of them and lose part of today on the other.
 *
 *   npx tsx worker/test/waiting-today.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: boolean, claim: string) => {
  checks += 1;
  assert.ok(cond, claim);
};
const pin = (claim: string, src: string, needle: string) => {
  checks += 1;
  assert.ok(src.includes(needle), `${claim}\n  missing: ${needle}`);
};

const dash = readFileSync(new URL('../../src/app/social/page.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');

/**
 * The file with its comments removed.
 *
 * Every negative below is about what the SCREEN says, and this file explains
 * each correction in prose that necessarily quotes the wrong version. A guard
 * that reads its own explanation passes for ever and protects nothing.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}
const live = code(dash);

/* ─── §1 — the rule, as a negative ───────────────────────────────────────── */

{
  /*
   * THE WHOLE-QUEUE FIGURE MAY NOT BE PRINTED BESIDE THOSE WORDS.
   *
   * `summary.queued` is every waiting row the account holds, on every day. It
   * is still the right thing to GATE on — a PC that is off while work is
   * queued is a problem whichever day the work belongs to — so the rule is
   * about printing, and the test is about proximity: the figure and the words
   * may not appear in the same sentence.
   */
  const around = 220;
  for (let i = live.indexOf('summary.queued'); i !== -1; i = live.indexOf('summary.queued', i + 1)) {
    const window = live.slice(Math.max(0, i - around), i + around);
    checks += 1;
    assert.ok(
      !/ממתינים בתור|ממתין בתור/.test(window),
      `THE IRON RULE: a whole-queue figure printed beside "ממתינים בתור"\n  near: ${live.slice(Math.max(0, i - 90), i + 90).replace(/\s+/g, ' ')}`,
    );
  }
  /* And the gates are still allowed, or the alert that matters stops firing. */
  pin('the PC-is-off alert still triggers on the whole queue', live, '!data.workerOnline && summary.queued > 0');
}

/* ─── §2 — and what the three surfaces print instead ─────────────────────── */

{
  pin('the column counts today', live, 'value: data.waitingToday');
  /*
   * RE-POINTED, AND THE RULE GOT STRONGER RATHER THAN WEAKER.
   *
   * This pinned the exact words "ממתינים בתור להיום". The four tiles became
   * one panel of four columns — "לא ארבע כרטיסיות נפרדות" — and in a column
   * 89px wide that label wraps onto two lines at every phone width, which is
   * the ragged, taller panel he asked not to have. It reads "ממתינים היום"
   * now, on one line, and the reference he drew writes it shorter still.
   *
   * What may NOT happen is the scope going missing: the figure is today's and
   * the list behind it is not, so the label has to say which day. That is the
   * rule, and it is asserted here as a pattern rather than as one spelling —
   * a label that drops "היום" fails whatever else it says.
   */
  checks += 1;
  assert.ok(/label: 'ממתינים[^']*היום'/.test(live), 'and the label still says WHICH DAY the figure is about');

  /*
   * RE-POINTED 09.11.2026. This sentence was the subtitle of "הפרסומים
   * הקרובים", deleted as a duplicate of "תור פרסומים" above it — so the
   * surface is gone, not the rule. The iron rule ("חישוב של ממתינים בתור זה
   * רק מה שאמור לצאת באותו היום") is held below as a NEGATIVE across the
   * whole screen, which is the stronger half and the one that stops a fourth
   * surface being written the old way.
   */
  checks += 1;
  assert.ok(!live.includes('ממתינים בתור להיום`'), 'the deleted card\'s subtitle is gone, not left dangling');
  pin('the PC-is-off alert counts today', live, "counted(data.waitingToday, 'פרסום אחד ממתין בתור להיום'");

  /*
   * AND NOTHING IS DROPPED IN SILENCE. A screen that stopped counting 275 rows
   * would be the honest number on a dishonest page: he taps through, lands on
   * a longer list, and concludes the number is broken. Both surfaces name the
   * remainder in the same words.
   */
  /*
   * RE-POINTED 09.11.2026: there were two surfaces naming the remainder — the
   * tile and the deleted "הפרסומים הקרובים" card. One is left, and it must
   * still name it. A screen that stopped counting 275 rows would be the honest
   * number on a dishonest page: he taps through, lands on a longer list, and
   * concludes the number is broken.
   */
  const remainder = (live.match(/אחרי חצות/g) ?? []).length;
  is(remainder >= 1, `the tile still names what falls after midnight — found ${remainder}`);

  /*
   * AND THE ALERT STILL SPEAKS WHEN TODAY IS EMPTY. At 23:00, with nothing
   * left today and five hundred rows for tomorrow, a scoped number would read
   * "0 ממתינים" and look like a fault. The gate is the whole queue; only the
   * sentence is scoped.
   */
  pin('an empty today does not print a zero', live, "'הפרסומים הקרובים ממתינים בתור'");
}

/* ─── §3 — and "today" is the local calendar day ─────────────────────────── */

{
  /*
   * NOT now+24h. Two clock changes a year make one day 23 hours and another
   * 25, so a rolling window counts part of tomorrow on one and loses part of
   * today on the other — on the two days of the year when the owner is most
   * likely to be looking.
   */
  pin('today ends at the next LOCAL midnight', live, "countWaitingWithin(zonedToUtc(addDaysISO(zonedDateISO(now), 1), '00:00').toISOString())");
  is(
    !/countWaitingWithin\(new Date\(Date\.now\(\) \+ 24 \* 3_600_000\)/.test(live),
    'THE BUG: a rolling 24-hour window is not "today"',
  );

  /* The window counts what the engine will release on its own — a row waiting
     for a person is counted and named separately, which is why it is not in
     this status set. */
  pin('the count asks the database, not a capped array', client, "export async function countWaitingWithin(untilISO: string): Promise<number> {");
  pin('and counts the rows that move on their own', client, ".in('status', AUTOMATIC_WAITING_STATUSES as unknown as string[])");
}

console.log(`waiting-today OK — ${checks} assertions`);
