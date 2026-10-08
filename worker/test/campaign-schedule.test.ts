import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_CAMPAIGN_SCHEDULE,
  GAP_CHOICES,
  MAX_GAP_SECONDS,
  MIN_GAP_SECONDS,
  gapChoiceLabel,
  gapMinutesFor,
  TIME_CHOICES,
  WEEKDAY_SHORT,
  dayRelativeHe,
  daysLabel,
  isAllowedAt,
  nextAllowedAt,
  nextPublishAt,
  readSchedule,
  windowClosesAt,
  scheduleColumns,
  scheduleSummary,
  type CampaignSchedule,
} from '../../src/lib/social/campaign-schedule';

/**
 * "תזמון פרסום" — THE ENGINE HALF, which is the half that can lose a
 * publication.
 *
 * The panel on the card is a picture of five values. What those five values DO
 * is decided here and in rules.ts, and there are exactly two ways this feature
 * can go wrong for the owner, both of them silent:
 *
 *   IT PUBLISHES WHEN HE SAID NOT TO. A post lands in forty groups at 02:00
 *   under his own name. There is no undo for that.
 *
 *   IT NEVER PUBLISHES AGAIN. A window the arithmetic can never satisfy — an
 *   end before its start, a day index that is not a day, a gap of zero — and
 *   the queue simply stops, with every card still saying "רץ".
 *
 * So most of what follows is about the edges: the instant the window opens,
 * the instant it closes, the day after the last chosen one, the week after
 * that, and the two days a year the clock moves.
 *
 * AND ONE RULE ABOVE ALL THE OTHERS: "אין לאפס את התור. אין להתחיל את הקמפיין
 * מחדש. יש להמשיך מאותו מקום." A publication outside the window is DEFERRED,
 * never skipped — it keeps its row, its group and its place, and goes out when
 * the window opens. The wiring section at the bottom checks that rules.ts says
 * `defer` and never `skip` on any branch this file reaches.
 *
 *   npx tsx worker/test/campaign-schedule.test.ts
 */

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

/**
 * An instant from an Israeli wall clock, for readable expectations below.
 *
 * THE OFFSET IS WRITTEN OUT, NOT COMPUTED, and that is the point: a helper
 * that asked the module under test where the clock change falls would agree
 * with any bug it had about exactly that. Israel ran on +03:00 (IDT) from
 * 02:00 on Friday 27 March 2026 until 02:00 on Sunday 25 October 2026, and on
 * +02:00 either side of it.
 */
const at = (s: string): Date =>
  new Date(`${s}${s >= '2026-03-27T02:00' && s < '2026-10-25T02:00' ? '+03:00' : '+02:00'}`);
const say = (d: Date | null): string =>
  d === null
    ? 'null'
    : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

/** The owner's own: Sunday–Thursday, 08:00–22:00, every ten minutes. */
const ref: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4], start: '08:00', end: '22:00', gapSeconds: 600 };

/* ------------------------------------------------------------------ *
 * 1. READING A CAMPAIGN ROW. Every value here arrives from Postgres and
 *    three versions of this app may have written it.
 * ------------------------------------------------------------------ */
{
  /*
   * THE ONE THAT MAKES THIS FEATURE SAFE TO SHIP. A campaign that existed
   * before v24, and a database that has not run social-latest.sql, both arrive
   * as a row with none of these columns on it. If that read as "enabled" with
   * default days, every existing round would silently stop publishing outside
   * 08:00–22:00 the moment this deployed — a behaviour change nobody asked for,
   * on rounds that are already running.
   */
  eq(readSchedule({}).enabled, false, 'A CAMPAIGN WITH NO SCHEDULE COLUMNS IS OFF — this is the whole backward-compatibility story');
  eq(readSchedule(null).enabled, false, 'and so is a campaign that could not be read at all');
  eq(readSchedule(undefined).enabled, false, 'and so is one that was never passed');
  eq(readSchedule({ schedule_enabled: undefined }).enabled, false, 'an undefined switch is off, not on');
  eq(readSchedule({ schedule_enabled: 'true' as never }).enabled, false, 'and the string "true" is not a boolean — only true is true');

  /* The values the panel opens on, which are the reference image's own. */
  eq(readSchedule({}).days, [0, 1, 2, 3, 4], 'the default week is Sunday to Thursday');
  eq(readSchedule({}).start, '08:00', 'opening at 08:00');
  eq(readSchedule({}).end, '22:00', 'closing at 22:00');
  eq(readSchedule({}).gapSeconds, 600, 'ten minutes apart');

  /*
   * EVERY ONE OF THESE WOULD BE A CAMPAIGN THAT NEVER PUBLISHES AGAIN, and
   * none of them would show up as an error anywhere.
   */
  /*
   * RE-POINTED TO SECONDS, NOT DELETED. The gap is stored in seconds since
   * v26 — "תעשה אופציה של 30 40 50 שניות" — and every clamp below is the same
   * claim it always made, in the unit the value now has.
   */
  eq(readSchedule({ schedule_gap_seconds: 0 }).gapSeconds, 600, 'a gap of zero is not a gap — it falls back rather than publishing in a tight loop');
  eq(readSchedule({ schedule_gap_seconds: -5 }).gapSeconds, 600, 'A NEGATIVE GAP WOULD PUT EVERY PUBLICATION IN THE PAST, on every claim, for ever');
  eq(readSchedule({ schedule_gap_seconds: 10 }).gapSeconds, MIN_GAP_SECONDS, 'ten seconds is below the floor the panel offers');
  eq(readSchedule({ schedule_gap_seconds: 99999 }).gapSeconds, MAX_GAP_SECONDS, 'and 99999 seconds is past the top of it');
  eq(readSchedule({ schedule_gap_seconds: 45.6 as never }).gapSeconds, 46, 'a fractional gap rounds rather than producing fractional instants');
  eq(readSchedule({ schedule_gap_seconds: NaN as never, schedule_gap_minutes: 7 }).gapSeconds, 420, 'a NaN in seconds falls back to the minutes beside it');

  /*
   * A DATABASE THAT HAS NOT RUN v26 YET. The column simply is not there, so
   * every campaign arrives with minutes and no seconds. Reading the minutes
   * is what keeps a dashboard that is ahead of its database working as it
   * did — rather than silently resetting every campaign in the account to
   * the ten-minute default, which is what Number(undefined) would do.
   */
  eq(readSchedule({ schedule_gap_minutes: 3 }).gapSeconds, 180, 'before the migration, the minutes column still decides');
  eq(readSchedule({ schedule_gap_minutes: 30 }).gapSeconds, 1800, 'including at the top of its old range');

  eq(readSchedule({ schedule_start: '25:00' }).start, '08:00', 'there is no 25 o’clock');
  eq(readSchedule({ schedule_start: '08:70' }).start, '08:00', 'nor a 70th minute');
  eq(readSchedule({ schedule_start: 'morning' as never }).start, '08:00', 'nor a word');
  eq(readSchedule({ schedule_start: '8:30' }).start, '08:30', 'but a single-digit hour is a real time and is kept, padded');

  /*
   * AN END BEFORE ITS START. 22:00 to 08:00 is how a person writes "overnight",
   * and this product does not do overnight windows — slots.ts has clamped the
   * same pair the same way since it was written, and two modules disagreeing
   * about what that means is worse than either answer.
   */
  const backwards = readSchedule({ schedule_start: '22:00', schedule_end: '08:00' });
  eq(backwards.end, '23:59', 'an end before its start runs to midnight instead');
  /*
   * AND THAT IS THE WHOLE POINT — this used to collapse onto the start, which
   * is a window exactly one instant wide. rules.ts defers to the allowed
   * instant plus a five-second cushion, so every claim landed five seconds
   * past the only legal moment and deferred to the next chosen day, for ever:
   * a campaign set to an overnight window never published anything. Reproduced
   * before the fix. The assertion that replaces the old one is not "it has
   * some window" but "a publication deferred into it is actually inside it".
   */
  const over = { ...backwards, enabled: true, days: [0, 1, 2, 3, 4] };
  const allowed = nextAllowedAt(over, at('2026-10-04T09:00'));
  is(allowed !== null, 'the campaign can still publish');
  is(isAllowedAt(over, new Date(allowed!.getTime() + 5_000)), 'AND FIVE SECONDS PAST THAT INSTANT IS STILL INSIDE THE WINDOW — the defer cushion lands in it rather than past it');
  is(isAllowedAt(over, at('2026-10-04T23:30')), 'and so is half past eleven at night');

  eq(readSchedule({ schedule_days: [9, -1, 3, 3, 1] }).days, [1, 3], 'junk day indices are dropped and the real ones de-duplicated and sorted');
  eq(readSchedule({ schedule_days: [] }).days, [], 'AN EMPTY WEEK IS A REAL CHOICE and is kept — see the branch for it below');
  eq(readSchedule({ schedule_days: 'sunday' as never }).days, [0, 1, 2, 3, 4], 'but a non-array is not a week at all');

  /* Round-trip: what the panel writes is what the next read sees. */
  eq(readSchedule(scheduleColumns(ref)), ref, 'what is written to the row reads back as the same schedule');
}

/* ------------------------------------------------------------------ *
 * 2. THE CHOICES THE PANEL OFFERS.
 * ------------------------------------------------------------------ */
{
  /* "הפרש בין פוסטים חייב להיות ניתן לבחירה בטווח 1–30 דקות. כל מספר שלם בין
     1 ל-30 צריך להיות אפשרי." Every one, not a selection of round numbers. */
  /*
   * RE-POINTED: the list was thirty whole minutes. It is now the three
   * sub-minute steps the owner asked for, then the same thirty minutes —
   * "תעשה אופציה של 30 40 50 שניות בין פוסט לפוסט".
   */
  eq(GAP_CHOICES.length, 33, 'three seconds-steps plus the thirty minutes');
  eq(GAP_CHOICES.slice(0, 4).join(','), '30,40,50,60', 'thirty, forty and fifty seconds come first, then one minute');
  eq(GAP_CHOICES[0], MIN_GAP_SECONDS, 'the list starts exactly at the floor the clamp enforces');
  eq(GAP_CHOICES[GAP_CHOICES.length - 1], MAX_GAP_SECONDS, 'and ends exactly at its ceiling — a choice the clamp would reject is a trap');
  eq(
    GAP_CHOICES.filter((n) => n < MIN_GAP_SECONDS || n > MAX_GAP_SECONDS),
    [],
    'and nothing in between is outside it either',
  );
  eq(gapChoiceLabel(30), '30 שניות', 'a sub-minute step is spelled in seconds');
  eq(gapChoiceLabel(60), 'דקה', 'sixty seconds is a minute, not "60 שניות"');
  eq(gapChoiceLabel(600), '10 דק׳', 'and the minutes read as they always did');
  /* The legacy column beside the seconds rounds UP, never below one: a reader
     that predates v26 must be SLOWER than asked for, never faster. */
  eq(gapMinutesFor(30), 1, 'thirty seconds is written as one minute for an old reader');
  eq(gapMinutesFor(50), 1, 'and so is fifty');
  eq(gapMinutesFor(61), 2, 'and anything over a minute rounds up, never down');
  eq(gapMinutesFor(600), 10, 'a whole number of minutes is itself');
  eq(
    GAP_CHOICES.filter((n, i) => i >= 3 && n !== (i - 2) * 60),
    [],
    'and EVERY whole number in between — "כל מספר שלם בין 1 ל-30 צריך להיות אפשרי"',
  );
  eq(TIME_CHOICES[0], '00:00', 'the clock starts at midnight');
  eq(TIME_CHOICES.at(-1), '23:30', 'and ends at half past eleven');
  is(TIME_CHOICES.every((t) => /^([01]\d|2[0-3]):(00|30)$/.test(t)), 'every time offered is a real 24-hour time — "שעות בפורמט 24 שעות"');
}

/* ------------------------------------------------------------------ *
 * 3. THE WINDOW ITSELF. Sunday 2026-10-04 is a chosen day; Friday the 2nd
 *    and Saturday the 3rd are not.
 * ------------------------------------------------------------------ */
{
  is(isAllowedAt(ref, at('2026-10-04T12:00')), 'midday on a Sunday is inside the window');
  is(isAllowedAt(ref, at('2026-10-04T08:00')), 'AND SO IS THE INSTANT IT OPENS — an exclusive edge here loses the first publication of every day');
  is(isAllowedAt(ref, at('2026-10-04T22:00')), 'and the instant it closes');
  is(!isAllowedAt(ref, at('2026-10-04T07:59')), 'a minute before it opens is not');
  is(!isAllowedAt(ref, at('2026-10-04T22:01')), 'nor a minute after it closes');
  is(!isAllowedAt(ref, at('2026-10-02T12:00')), 'nor midday on a Friday, which is not a chosen day');
  is(isAllowedAt({ ...ref, enabled: false }, at('2026-10-02T03:00')), 'WITH THE SWITCH OFF EVERYTHING IS ALLOWED — the campaign behaves exactly as it did before this existed');
}

/* ------------------------------------------------------------------ *
 * 4. WHERE A PUBLICATION GOES WHEN IT CANNOT GO NOW.
 * ------------------------------------------------------------------ */
{
  eq(nextAllowedAt(ref, at('2026-10-04T12:00'))?.getTime(), at('2026-10-04T12:00').getTime(), 'inside the window, now is the answer — nothing is delayed for its own sake');
  eq(say(nextAllowedAt(ref, at('2026-10-04T06:00'))), say(at('2026-10-04T08:00')), 'before it opens, the publication waits for the opening — not for tomorrow');

  /*
   * THE SENTENCE THE WHOLE FEATURE IS ABOUT: "אם מגיעים לשעת הסיום: לא לפרסם
   * יותר באותו יום. הקמפיין צריך להמתין אוטומטית ליום הפעילות הבא ולהמשיך
   * משעת ההתחלה שהוגדרה."
   */
  eq(say(nextAllowedAt(ref, at('2026-10-04T23:30'))), say(at('2026-10-05T08:00')), 'PAST CLOSING IT IS THE NEXT DAY AT THE OPENING HOUR, not the next minute and not midnight');

  /* Thursday night rolls over the weekend to Sunday, because Friday and
     Saturday are not chosen. */
  eq(say(nextAllowedAt(ref, at('2026-10-01T23:00'))), say(at('2026-10-04T08:00')), 'Thursday night waits for Sunday — the two days in between are not chosen');
  eq(say(nextAllowedAt(ref, at('2026-10-02T12:00'))), say(at('2026-10-04T08:00')), 'and so does a Friday afternoon');

  /*
   * THE EIGHTH DAY. One chosen day, and this instant is past its closing time:
   * the answer is the same weekday NEXT WEEK. A loop of seven returns null
   * here, and null is read as "this campaign can never publish".
   */
  const sundayOnly: CampaignSchedule = { ...ref, days: [0] };
  eq(say(nextAllowedAt(sundayOnly, at('2026-10-04T23:00'))), say(at('2026-10-11T08:00')), 'ONE CHOSEN DAY, PAST ITS CLOSE: next week, and never null');

  /* No day at all: the one input nothing can satisfy, and the caller is told
     so rather than handed an instant it would have to guess about. */
  eq(nextAllowedAt({ ...ref, days: [] }, at('2026-10-04T12:00')), null, 'with no day chosen there is no next instant, and the function says so');

  eq(nextAllowedAt({ ...ref, enabled: false }, at('2026-10-02T03:00'))?.getTime(), at('2026-10-02T03:00').getTime(), 'with the switch off the answer is always "now"');
}

/* ------------------------------------------------------------------ *
 * 5. THE GAP, AND THE WINDOW, TOGETHER — which is what rules.ts calls.
 * ------------------------------------------------------------------ */
{
  eq(
    say(nextPublishAt(ref, at('2026-10-04T12:00'), at('2026-10-04T11:55'))),
    say(at('2026-10-04T12:05')),
    'five minutes after the last publication, with ten asked for: the next is at 12:05',
  );
  eq(
    say(nextPublishAt(ref, at('2026-10-04T12:00'), at('2026-10-04T11:30'))),
    say(at('2026-10-04T12:00')),
    'and a gap that has already passed delays nothing',
  );
  eq(say(nextPublishAt(ref, at('2026-10-04T12:00'), null)), say(at('2026-10-04T12:00')), 'a campaign that has never published waits only for its window');

  /*
   * THE TWO CONSTRAINTS COMPOSE IN ONE DIRECTION ONLY. The gap pushes 21:55
   * past the 22:00 close, so the answer is the next DAY's opening — not 22:05,
   * which is what applying the window first and the gap afterwards produces.
   */
  eq(
    say(nextPublishAt(ref, at('2026-10-04T21:58'), at('2026-10-04T21:55'))),
    say(at('2026-10-05T08:00')),
    'A GAP THAT CROSSES THE CLOSING TIME ROLLS TO THE NEXT DAY — gap first, window second, and never the other way round',
  );

  eq(nextPublishAt({ ...ref, days: [] }, at('2026-10-04T12:00'), null), null, 'and no chosen day is still no answer, gap or not');
  eq(
    nextPublishAt({ ...ref, enabled: false }, at('2026-10-04T03:00'), at('2026-10-04T02:59'))?.getTime(),
    at('2026-10-04T03:00').getTime(),
    'WITH THE SWITCH OFF THE GAP IS NOT APPLIED EITHER — the account-wide spacing in rules.ts is untouched and still does its job',
  );
}

/* ------------------------------------------------------------------ *
 * 6. THE TWO DAYS A YEAR THE CLOCK MOVES.
 *
 * Israel puts its clocks back at 02:00 on Sunday 25 October 2026, making that
 * Sunday 25 hours long. Every instant here is built from a wall clock in the
 * zone (zonedToUtc) rather than by adding 86,400,000ms, and this is what says
 * so: a window computed by millisecond arithmetic lands an hour out on these
 * days, which is an hour of publishing either side of what the owner set.
 * ------------------------------------------------------------------ */
{
  eq(say(nextAllowedAt(ref, at('2026-10-24T23:00'))), say(at('2026-10-25T08:00')), 'the window opens at 08:00 on the day the clock goes back — 08:00 by the clock on the wall');
  is(isAllowedAt(ref, at('2026-10-25T08:00')), 'and that instant is inside it');
  is(!isAllowedAt(ref, at('2026-10-25T07:30')), 'while half an hour earlier is not, on a day that is 25 hours long');

  /* And forward, in March: the 27th is a Friday (not chosen), so a Thursday
     night rolls to Sunday the 29th — across the changeover. */
  eq(say(nextAllowedAt(ref, at('2026-03-26T23:00'))), say(at('2026-03-29T08:00')), 'and across the spring change, the opening hour is still the opening hour');
}

/* ------------------------------------------------------------------ *
 * 7. THE SUMMARY LINE, which is the only thing on screen that says what all
 *    five values add up to.
 * ------------------------------------------------------------------ */
{
  eq(scheduleSummary(ref), 'א׳, ב׳, ג׳, ד׳, ה׳ · 08:00 – 22:00 · כל 10 דקות', 'the whole line, from the five values the reference itself shows');
  eq(daysLabel({ ...ref, days: [0, 1, 2, 4] }), 'א׳, ב׳, ג׳, ה׳', 'the brief’s own example — four days, in order, with ד׳ left out');
  eq(daysLabel({ ...ref, days: [4, 0, 2, 1] }), 'א׳, ב׳, ג׳, ה׳', 'and the order is the week’s, not the order he tapped them in');
  eq(daysLabel({ ...ref, days: [0, 1, 2, 3, 4, 5, 6] }), 'כל הימים', 'seven days is a sentence, not a list of seven — it would be the longest line on the card');
  eq(daysLabel({ ...ref, days: [] }), 'לא נבחר אף יום', 'AND NO DAY SAYS SO OUT LOUD — the state where nothing publishes may not look like any other');

  /* Hebrew counts one and two differently, and "כל 1 דקות" is the kind of
     line that tells a customer nobody read the screen. */
  eq(scheduleSummary({ ...ref, gapSeconds: 60 }).endsWith('כל דקה'), true, 'one minute is "כל דקה"');
  eq(scheduleSummary({ ...ref, gapSeconds: 120 }).endsWith('כל שתי דקות'), true, 'two is "כל שתי דקות"');
  eq(scheduleSummary({ ...ref, gapSeconds: 180 }).endsWith('כל 3 דקות'), true, 'and three onwards carries the digit');
  eq(scheduleSummary({ ...ref, gapSeconds: 30 }).endsWith('כל 30 שניות'), true, 'and a sub-minute gap is spelled in seconds, not as a fraction of a minute');

  is(scheduleSummary(ref).includes('08:00 – 22:00'), 'the window is printed as a range, start first');
  is(!/⁦|⁩/.test(scheduleSummary(ref)), 'and with no bidi control characters in it — this string also reaches an aria-label, and a screen reader reads those aloud');
}

/* ------------------------------------------------------------------ *
 * 8. THE WIRING. Every one of these is a way the arithmetic above could be
 *    perfect and the product still wrong.
 * ------------------------------------------------------------------ */
{
  const rules = readFileSync(new URL('../../src/lib/social/rules.ts', import.meta.url), 'utf8');
  /* The block this feature added, from the schedule read to the end of it. */
  const block = rules.slice(rules.indexOf('const schedule = readSchedule(campaign)'), rules.indexOf('A FULL DAILY QUOTA'));
  is(block.length > 400, 'the schedule block is still in rules.ts — every check below reads it');

  /*
   * THE RULE THE OWNER STATED TWICE: "אין לאפס את התור... יש להמשיך מאותו
   * מקום." A skip DESTROYS a publication; a defer moves its instant and keeps
   * everything else. The daily-quota branch below this one was changed from
   * skip to defer for exactly this reason, after six of a 28-group round were
   * deleted inside sixteen minutes.
   */
  is(!/action: 'skip'/.test(block), 'NOTHING IN THE WINDOW BLOCK SKIPS A PUBLICATION — a window is a rate, not a verdict on a particular post');
  eq((block.match(/action: 'defer'/g) ?? []).length, 2, 'both of its branches defer: outside the window, and with no day chosen at all');
  is(/nextPublishAt\(schedule, now, lastAt\)/.test(block), 'and the instant it waits for comes from the same function the card prints');

  /* The campaign's own last publication, not the account's — otherwise a
     second campaign publishing would reset this one's interval. */
  is(/\.eq\('campaign_id', campaignId\)[\s\S]{0,200}\.eq\('status', 'published'\)/.test(block), 'the interval is measured from THIS campaign’s last publication');
  is(/if \(schedule\.enabled\)/.test(block), 'and none of it runs — not even the query — for a campaign with the switch off');

  /*
   * TWO GATES, ONE INSTANT. The campaign's interval and the account-wide
   * spacing can both say "prepare now, click later", and whichever ran first
   * used to return and throw the other's instant away: an account gap of one
   * minute would have erased a campaign gap of thirty.
   */
  is(/let holdUntil: Date \| null = null/.test(rules), 'the two "not before" gates share one instant');
  is(/holdFor\(allowed\)/.test(rules), 'the campaign’s interval raises it');
  is(/holdFor\(new Date\(new Date\(last\.published_at\)\.getTime\(\) \+ gapMs\)\)/.test(rules), 'the account-wide one raises it too, instead of returning on its own');
  is(/return holdUntil \? \{ action: 'publish', notBefore: \(holdUntil as Date\)\.toISOString\(\) \}/.test(rules), 'and the single return hands over the later of the two');

  /* A missing column must not stop the engine. */
  is(/if \(full\.error\)[\s\S]{0,260}select\('status'\)/.test(rules), 'A DATABASE WITHOUT THE v24 COLUMNS STILL PUBLISHES — the read falls back to the status alone rather than refusing');

  const card = readFileSync(new URL('../../src/components/social/CampaignCard.tsx', import.meta.url), 'utf8');
  /*
   * THE SAME TWO CLAIMS, NOW ABOUT THE MODULE THAT HOLDS THEM.
   *
   * Both of these lines used to live inside CampaignCard, and so did a copy of
   * them inside LiveCampaignHero — which is how the two cards came to disagree
   * about the same campaign, one of them printing a window edge over a spent
   * queue. The derivation moved to schedule-readout.ts, which every card now
   * asks; the rules it must obey did not change, so the pins follow it rather
   * than being deleted.
   */
  const readout = readFileSync(new URL('../../src/lib/social/schedule-readout.ts', import.meta.url), 'utf8');
  is(/scheduleReadout\(schedule, state/.test(card), '"הבא בתור" asks the one module that decides what a card may say about time');
  is(/nextPublishAt\(schedule, from, lastPublishedAt/.test(readout), 'and that module computes it with the engine’s own function, not a second copy of these rules');
  /*
   * WITH THE SWITCH OFF, THE WINDOW IS NOT APPLIED — which is what the switch
   * means, and it is still true. The line that used to be pinned here returned
   * `state.nextAt` verbatim; it now returns the later of that and the
   * ACCOUNT-WIDE floor, because rules.ts enforces that one whatever the
   * campaign's window is set to. Pinning the old literal would have pinned a
   * second bug in place: a card reading "כל דקה · 10:13" over an engine that
   * will not publish before 11:17.
   *
   * So the claim is pinned as what it actually is — the off path reaches no
   * window arithmetic at all — rather than as one exact expression.
   */
  const offPath = readout.slice(readout.indexOf('if (!on || !schedule)'), readout.indexOf('if (!on || !schedule)') + 120);
  is(/return \{ kind: 'due'/.test(offPath), 'with the switch off the queued row is reported as due, not held');
  is(!/nextPublishAt|nextAllowedAt|windowClosesAt/.test(offPath), 'and no window arithmetic is applied to it — that is what "off" means');
  /* And the floor that is NOT the window still reaches it. */
  is(/accountFloorMs\(spacing, state\.nextChannel/.test(readout), 'the account-wide spacing floor is applied whether the campaign window is on or off');
  is(/לא נבחר יום פרסום/.test(card), 'with no day chosen it says so rather than printing an instant the engine will not publish at');
  is(/<CampaignSchedulePanel/.test(card), 'the panel is rendered by the card itself — "אל תפתח Modal. אל תפתח Popup. אל תיצור מסך חדש"');

  const page = readFileSync(new URL('../../src/app/social/campaigns/page.tsx', import.meta.url), 'utf8');
  is(/schedule=\{readSchedule\(c\)\}/.test(page), 'the panel is fed from the campaign row, so a refresh shows what was saved');
  is(/saveCampaign\(\{ id: campaign\.id, name: campaign\.name, \.\.\.columns \}\)/.test(page), 'and a change is WRITTEN to that row — "ההגדרות חייבות להישמר גם לאחר Refresh"');
  is(/setCampaigns\(\(list\) => \(list \?\? \[\]\)\.map/.test(page), 'a write that fails puts the card back, rather than leaving it showing a window the engine never heard of');
  is(/clearTimeout\(scheduleTimers\.current\[campaign\.id\]\)/.test(page), 'and three taps in a second are one write, not three racing each other');

  const panel = readFileSync(new URL('../../src/components/social/CampaignSchedulePanel.tsx', import.meta.url), 'utf8');
  is(/aria-pressed=\{on\}/.test(panel), 'each day is a pressed-state control, so a screen reader can say which are chosen');
  is(/grid-cols-7/.test(panel), 'and the seven are a grid of seven, which is what keeps them on one row at every width');
  is(/schedule\.days\.includes\(day\) \? schedule\.days\.filter/.test(panel), 'tapping a chosen day un-chooses it — "חובה לאפשר Multi Select", in both directions');
  is(/dir="ltr"/.test(panel), 'the clock range is an LTR island, or the bidi algorithm prints "22:00 – 08:00"');
  is(!/useState/.test(panel), 'the panel holds no state of its own — what is on screen is what the page has, which is what the database has');

  /* The migration, and the one file the owner is ever told to run. */
  const v24 = readFileSync(new URL('../../supabase/social-schema-v24.sql', import.meta.url), 'utf8');
  const latest = readFileSync(new URL('../../supabase/social-latest.sql', import.meta.url), 'utf8');
  for (const column of ['schedule_enabled', 'schedule_days', 'schedule_start', 'schedule_end', 'schedule_gap_minutes']) {
    is(new RegExp(`add column if not exists ${column}`).test(v24), `v24 adds ${column}, and only if it is missing`);
    is(new RegExp(`add column if not exists ${column}`).test(latest), `and social-latest.sql carries it — there is one file to run`);
  }
  is(/schedule_enabled boolean not null default false/.test(latest), 'THE SWITCH DEFAULTS TO OFF, so running the migration changes nothing about a campaign that is already going');
  is(/check \(schedule_gap_minutes between 1 and 30\)/.test(latest), 'and the database refuses a gap outside the range the panel offers');
}

/* ------------------------------------------------------------------ *
 * 9. THE PANEL'S OWN COLOURS, COMPUTED RATHER THAN ASSERTED IN A COMMENT.
 *
 * worker/test/contrast.test.ts measures the pairs a theme DECLARES, and every
 * colour this panel introduces is a composite instead: brand-300 at 10% over
 * white for the block, the same purple at 20% over THAT for the summary strip.
 * Three of them came out under AA the first time and the eye caught none of
 * them — the labels at 4.40, a white chip label at the light end of
 * .grad-primary at 3.96, and amber on its own tint at 4.18.
 *
 * Read from globals.css, not copied here, so a theme change moves these with
 * it rather than leaving the numbers lying.
 * ------------------------------------------------------------------ */
{
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.social-theme {'), css.indexOf('\n}', css.indexOf('.social-theme {')));
  const token = (name: string): [number, number, number] => {
    const m = new RegExp(`--color-${name}:\\s*#([0-9a-fA-F]{6})`).exec(block);
    assert.ok(m, `the social theme declares no --color-${name}`);
    const hex = m![1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  };
  const lum = (c: [number, number, number]) =>
    0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
  const ratio = (a: [number, number, number], b: [number, number, number]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg: [number, number, number], alpha: number, bg: [number, number, number]) =>
    fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha))) as [number, number, number];

  const white: [number, number, number] = [255, 255, 255];
  /* The two grounds the panel paints, exactly as the classes composite them. */
  const panel = over(token('brand-300'), 0.1, white);
  const strip = over(token('brand-300'), 0.2, panel);

  const AA = 4.5;   // body text
  const UI = 3;     // a control's own boundary — WCAG 1.4.11

  const pairs: [string, number, number][] = [
    ['"תזמון פרסום" on the panel', ratio(token('mist-100'), panel), AA],
    ['the labels ("ימי פרסום", "שעת סיום") on the panel', ratio(token('mist-300'), panel), AA],
    ['an unchosen day\u2019s letter on its white chip', ratio(token('mist-300'), white), AA],
    ['a chosen day\u2019s letter at the LIGHT end of its gradient', ratio(token('on-brand'), token('brand-500')), AA],
    ['a chosen day\u2019s letter at the dark end', ratio(token('on-brand'), token('brand-600')), AA],
    ['"סיכום תזמון" on its strip', ratio(token('brand-400'), strip), AA],
    ['"לא נבחר אף יום" on its white strip', ratio(token('warning-400'), white), AA],
    ['the value inside a time field', ratio(token('mist-100'), white), AA],
    ['an unchosen chip\u2019s own edge against the panel', ratio(token('ink-600'), panel), UI],
    ['a time field\u2019s edge against the panel', ratio(token('ink-600'), panel), UI],
  ];
  for (const [what, got, floor] of pairs) {
    is(got >= floor, `${what} measures ${got.toFixed(2)}:1 — under the ${floor}:1 it needs`);
  }

  /*
   * AND THE PANEL HAS TO BE USING THOSE TOKENS.
   *
   * Everything above proves a pair of colours is readable. It proves nothing
   * about the component, and the first version of this block was exactly that
   * hole: putting the labels back to mist-500 — the 4.40 this section exists
   * to have caught — left all ten ratios passing, because they were ratios
   * between tokens nobody was checking were in use. Each line below names the
   * element, the token, and the number it would otherwise fall to.
   */
  const panelSrc = readFileSync(new URL('../../src/components/social/CampaignSchedulePanel.tsx', import.meta.url), 'utf8');

  /*
   * BY ELEMENT, NOT BY A BAN ON THE TOKEN. The first version of this read
   * "mist-500 appears nowhere in the file" and failed on the chevron inside a
   * time field — which sits on WHITE (4.95), not on the tint, and is a mark
   * rather than text. A guard that is wrong about where a colour is cannot be
   * trusted about whether it is readable.
   */
  is(/text-mist-300">ימי פרסום/.test(panelSrc), 'the "ימי פרסום" label is mist-300 on the tint (5.61), not mist-500 (4.40)');
  is(/leading-\[13px\] text-mist-300/.test(panelSrc), 'and so is every field\u2019s own label, which sits on the same tint');
  /* `'grad-primary` with the quote: the class being APPLIED, not the note
     above it explaining why it is not. A bare /grad-primary/ matched its own
     explanation and the check could never fail. */
  is(!/'grad-primary/.test(panelSrc), 'a chosen day does not use .grad-primary — it runs out to #a855f7, where a white letter is 3.96:1');
  is(
    /\? 'border-transparent bg-gradient-to-l from-brand-600 to-brand-500 text-on-brand/.test(panelSrc),
    'it uses the discovery screen\u2019s chip gradient, whose lightest end is 5.70',
  );
  is(/border-ink-600 bg-ink-900/.test(panelSrc), 'an unchosen chip carries the control-edge token — white on this tint is 1.13:1, which is no edge at all');
  is(!/bg-warning-400\/\d/.test(panelSrc), '"לא נבחר אף יום" is not amber on an amber tint (4.18)');
  is(/bg-ink-900 text-warning-400/.test(panelSrc), 'it is amber on white, which is 5.43');
}

function ch(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/* ─────────────────────── "מחר (חמישי)" — the line under the date ───────── */
{
  /*
   * WHY THIS IS A CALENDAR COMPARISON AND NOT A SUBTRACTION. The dashboard
   * strip prints a date and, under it, the day it falls on. 23:50 tonight and
   * 00:10 after midnight are twenty minutes apart and are NOT the same day;
   * a "less than 24 hours away" rule calls the second one "היום" and sends the
   * owner looking for a publication on the wrong date.
   */
  const now = at('2026-10-01T23:50'); // a Thursday
  eq(dayRelativeHe(at('2026-10-01T23:55'), now), 'היום (חמישי)', 'five minutes later is still today');
  eq(dayRelativeHe(at('2026-10-02T00:10'), now), 'מחר (שישי)', 'twenty minutes later is tomorrow, because it is a different date');
  eq(dayRelativeHe(at('2026-10-03T08:00'), now), 'מחרתיים (שבת)', 'and the day after that has its own word in Hebrew');
  /* Beyond that a count would be arithmetic the owner has to do. The date is
     beside it; the day name is what the date needs. */
  eq(dayRelativeHe(at('2026-10-04T08:00'), now), 'יום ראשון', 'further out, the day is simply named');
  eq(dayRelativeHe(at('2026-10-10T08:00'), now), 'שבת', 'and שבת is not called "יום שבת"');

  /* THE CLOCK CHANGE DOES NOT MOVE A DAY BOUNDARY. 25.10.2026 is the Sunday
     Israel goes back to +02:00 at 02:00, so that calendar day is 25 hours
     long — a millisecond rule reads its last hour as the next day. */
  const dst = at('2026-10-25T00:30');
  eq(dayRelativeHe(at('2026-10-25T23:00'), dst), 'היום (ראשון)', 'the 25-hour day is still one day');
  eq(dayRelativeHe(at('2026-10-26T00:30'), dst), 'מחר (שני)', 'and the day after it is tomorrow, not "מחרתיים"');

  /* Seven names, in the same order the chips and zonedWeekday() use, and none
     of them carrying the word "יום" — the caller's sentence supplies it. */
  eq(WEEKDAY_SHORT.length, 7, 'seven weekday names');
  is(!WEEKDAY_SHORT.some((n) => n.startsWith('יום')), 'none of them repeats the word the sentence around them already has');
  eq(WEEKDAY_SHORT[0], 'ראשון', 'index 0 is Sunday, as zonedWeekday() numbers them');
  eq(WEEKDAY_SHORT[6], 'שבת', 'and index 6 is Saturday');
}

/* ───── "למה זה 17:12 הפרסום יסתיים כבר" — the window that is already open ── */
{
  /*
   * THE QUESTION nextAllowedAt() CANNOT BE ASKED.
   *
   * It answers "the first instant this schedule permits at or after `from`",
   * and when `from` is itself permitted that answer is `from`. Correct, and
   * the dashboard printed it under "חלון הפרסום הבא:" — so at 17:13 his
   * screen read 17:12, a minute that had gone, as if it were an appointment.
   *
   * windowClosesAt() is the other half of the same fact: not when the window
   * opens, but when the one he is standing in shuts. Null means "not now",
   * never "never" — outside the window nextAllowedAt() is the honest answer
   * and the caller falls back to it.
   */
  eq(say(nextAllowedAt(ref, at('2026-09-30T10:00'))), say(at('2026-09-30T10:00')), 'inside the window, the first permitted instant IS now — the 17:12');
  eq(say(windowClosesAt(ref, at('2026-09-30T10:00'))), say(at('2026-09-30T22:00')), 'and what is actually ahead of him is the close');

  /* THE EDGES ARE INSIDE. The minute it opens and the minute it closes are
     both permitted — isAllowedAt uses >= and <=, and a close that read "not
     open" at 22:00 would blank the strip for one minute a day. */
  eq(say(windowClosesAt(ref, at('2026-09-30T08:00'))), say(at('2026-09-30T22:00')), 'the opening minute is inside the window');
  eq(say(windowClosesAt(ref, at('2026-09-30T22:00'))), say(at('2026-09-30T22:00')), 'and so is the closing minute');

  /* NOT NOW, THREE WAYS — and every one of them must be null, because each is
     a case where the strip has a real future opening to name instead. */
  eq(windowClosesAt(ref, at('2026-09-30T07:59')), null, 'before it opens there is no open window');
  eq(windowClosesAt(ref, at('2026-09-30T22:01')), null, 'after it closes there is no open window');
  eq(windowClosesAt(ref, at('2026-10-02T12:00')), null, 'and Friday is not a chosen day, whatever the hour');

  /* THE SWITCH OFF IS NOT AN OPEN WINDOW. isAllowedAt() answers `true` for a
     disabled schedule — rightly, since nothing is restricting the queue — and
     a close derived from that would put "חלון הפרסום פתוח עד: 22:00" on a card
     with no schedule running at all. */
  eq(windowClosesAt({ ...ref, enabled: false }, at('2026-09-30T10:00')), null, 'a switched-off schedule has no window to be inside');
  eq(windowClosesAt({ ...ref, days: [] }, at('2026-09-30T10:00')), null, 'and neither has one with no day chosen');

  /*
   * THE CLOCK CHANGE. 25.10.2026 is the Sunday Israel goes back to +02:00 at
   * 02:00, so that Sunday is 25 hours long. The close is a WALL CLOCK time
   * resolved against the calendar date in the zone, so it is 22:00 local on
   * both sides of the change — which a millisecond offset from "now" would
   * get wrong by an hour exactly once a year, on a day the owner is as likely
   * to be publishing as any other.
   */
  eq(say(windowClosesAt(ref, at('2026-10-25T10:00'))), say(at('2026-10-25T22:00')), 'the close is 22:00 local on the day the clock goes back');
  eq(say(windowClosesAt(ref, at('2026-03-29T10:00'))), say(at('2026-03-29T22:00')), 'and on a summer-time Sunday too');
}

console.log(`campaign schedule tests OK — ${checks} assertions`);
