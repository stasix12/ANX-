/**
 * סבבים ביום (ריצות) — THE ARITHMETIC, RUN.
 *
 * "הפעלת מספר סבבי פרסום לאותו קמפיין באותו היום." Round 1 at 03:30, round 2
 * at 15:30, same campaign, same content, same groups.
 *
 * THE ENGINE COULD ALWAYS DO THIS. social_schedules.weekly is an array of
 * 'HH:MM' per weekday and slots.ts already loops it through zonedToUtc, so
 * several occasions a day in Asia/Jerusalem across a DST change is existing,
 * tested behaviour. What never existed is a way to SAY there is more than one.
 * This file owns the list, and the one question the card must answer out loud:
 *
 *   WILL THE SECOND ROUND ACTUALLY PUBLISH?
 *
 * Getting that wrong is silent. rules.ts refuses a second publication of one
 * post to one group for ever when the repeat is off, and inside
 * repeat_min_hours when it is on — so a second round whose groups are all
 * refused still opens, still shows a queue, and publishes nothing. The owner
 * would see a feature that works and an account that does not.
 *
 *   npx tsx worker/test/rounds.test.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { slotsFor } from '../../src/lib/social/slots';
import { zonedHM } from '../../src/lib/social/time';
import {
  DEFAULT_CAMPAIGN_SCHEDULE,
  MAX_EXTRA_ROUNDS,
  ABSOLUTE_MIN_REPEAT_HOURS,
  DEFAULT_CAMPAIGN_REPEAT,
  readRepeat,
  repeatWindowSentence,
  MAX_REPEAT_HOURS,
  MIN_REPEAT_HOURS,
  readRounds,
  roundStarts,
  roundsColumn,
  roundsSavedMessage,
  editRoundTime,
  nextFreeRoundStart,
  repeatFitFor,
  repeatFloorFrom,
  roundsVsRepeat,
  roundsWindowFix,
  smallestRoundGapHours,
  weeklyPlanFor,
  type CampaignRepeat,
  type CampaignRound,
  type CampaignSchedule,
  type RoundsVerdict,
} from '../../src/lib/social/campaign-schedule';

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};
const is = (c: unknown, msg: string) => {
  checks += 1;
  assert.ok(c, msg);
};

const sched = (start: string, days = [0, 1, 2, 3, 4]): CampaignSchedule => ({
  ...DEFAULT_CAMPAIGN_SCHEDULE,
  enabled: true,
  days,
  start,
});
const repeat = (enabled: boolean, minHours = 20): CampaignRepeat => ({ enabled, minHours });

/* ───────────── 1. A DATABASE THAT HAS NOT RUN THE MIGRATION ────────────── */
{
  /*
   * The whole backward-compatibility story is this one answer. Absent, null,
   * the wrong type and junk all have to read as "one round a day", because
   * that is what every campaign that exists today does.
   */
  eq(readRounds(undefined), [], 'no campaign at all reads as one round a day');
  eq(readRounds({}), [], 'a campaign whose database has never run v29 reads as one round a day');
  eq(readRounds({ schedule_rounds: undefined }), [], 'an absent column reads as one round a day');
  eq(readRounds({ schedule_rounds: null as never }), [], 'a NULL column reads as one round a day');
  eq(readRounds({ schedule_rounds: 'nonsense' as never }), [], 'a column holding something that is not an array must not throw');
  eq(readRounds({ schedule_rounds: [null, 3, 'x'] as never }), [], 'junk entries are dropped rather than carried as rounds');
}

/* ───────────── 2. WHAT A STORED ROUND MEANS ────────────────────────────── */
{
  eq(readRounds({ schedule_rounds: [{ at: '15:30', enabled: true }] }), [{ at: '15:30', enabled: true }], 'a stored round reads back');
  eq(
    readRounds({ schedule_rounds: [{ at: '9:05' } as never] }),
    [{ at: '09:05', enabled: true }],
    'a hand-written hour is normalised to one spelling, and a row with no `enabled` is ON — it exists because somebody added it',
  );
  /* And '9:5' is NOT a time by toMinutes()'s own regex, which wants two digits
     of minutes. Asserted rather than loosened: the parser is shared with the
     window and the gap, and widening it here would widen it there. */
  eq(readRounds({ schedule_rounds: [{ at: '9:5' } as never] }), [], "'9:5' is not an hour — the shared parser wants two digits of minutes, and this file does not get to change that");
  eq(readRounds({ schedule_rounds: [{ at: '25:00', enabled: true }] }), [], 'an hour that is not an hour is not a round');
  eq(readRounds({ schedule_rounds: [{ at: '15:30', enabled: false }] }), [{ at: '15:30', enabled: false }], 'a round switched off keeps its hour — "אסור למחוק מידע"');

  const many = Array.from({ length: 9 }, (_, i) => ({ at: `0${i + 1}:00`, enabled: true }));
  eq(readRounds({ schedule_rounds: many }).length, MAX_EXTRA_ROUNDS, 'a column holding more than the cap is read up to the cap, not refused');
  eq(roundsColumn(many).schedule_rounds.length, MAX_EXTRA_ROUNDS, 'and never WRITES more than the cap — the database CHECK would refuse the whole update');
}

/* ───────────── 3. THE LIST THE WEEKLY PLAN IS BUILT FROM ───────────────── */
{
  /*
   * ROUND ONE IS NOT IN THE COLUMN. It is schedule.start, the hour already on
   * the card. An hour stored in two places is the defect this product has been
   * bitten by twice, and the owner reported it again this week.
   */
  eq(roundStarts(sched('03:30'), []), ['03:30'], 'with no extra rounds the list is exactly the hour on the card');
  eq(
    roundStarts(sched('03:30'), [{ at: '15:30', enabled: true }]),
    ['03:30', '15:30'],
    "his own example: round one from the card's hour, round two from the column",
  );
  eq(
    roundStarts(sched('15:30'), [{ at: '03:30', enabled: true }]),
    ['03:30', '15:30'],
    'the list is sorted by the clock, not by which one is "round 1" — slots.ts walks it in order',
  );
  eq(
    roundStarts(sched('03:30'), [{ at: '15:30', enabled: false }]),
    ['03:30'],
    'a round switched off plans nothing, and the campaign is back to exactly its present behaviour',
  );
  eq(
    roundStarts(sched('03:30'), [{ at: '03:30', enabled: true }]),
    ['03:30'],
    'a round set to the hour already on the card is round one, not a second occasion — otherwise the planner would stamp two rows on one instant',
  );
}

/* ───────────── 4. HOW FAR APART, AROUND THE CLOCK ──────────────────────── */
{
  eq(smallestRoundGapHours(['03:30']), 24, 'one occasion a day is twenty-four hours from itself — which is what makes a one-round campaign measure as unchanged');
  eq(smallestRoundGapHours(['03:30', '15:30']), 12, 'his own example is exactly twelve hours apart');
  /*
   * CYCLIC, and this is the case a day-ordered subtraction gets wrong: 23:00
   * and 01:00 are two hours apart, not twenty-two, because the campaign runs
   * again tomorrow.
   */
  eq(smallestRoundGapHours(['23:00', '01:00']), 2, 'the gap wraps around midnight — the campaign publishes again tomorrow');
  eq(smallestRoundGapHours(['08:00', '12:00', '20:00']), 4, 'with three occasions it is the smallest of the gaps, including the wrap');
}

/* ───────────── 5. WILL THE SECOND ROUND ACTUALLY PUBLISH? ──────────────── */
{
  /* One round: nothing to say, whatever the repeat is set to. */
  is(roundsVsRepeat(['03:30'], repeat(false)).ok, 'a single round is never in conflict with anything');
  is(roundsVsRepeat(['03:30'], repeat(true, 20)).ok, 'and neither is a single round with the repeat armed — this is every campaign today');

  /*
   * HIS EXACT SETTINGS, which is the case this whole file exists for. Two
   * rounds twelve hours apart, with the repeat armed at the default twenty.
   * rules.ts would defer every group round one reached — "פורסם לקבוצה הזו
   * לאחרונה — החזרה הבאה בעוד כ-8 שעות" — and round two would publish nothing.
   */
  const his = roundsVsRepeat(['03:30', '15:30'], repeat(true, 20));
  is(!his.ok, 'two rounds twelve hours apart with a twenty-hour repeat window must NOT be reported as fine — round two would publish nothing at all');
  eq(his.reason, 'window-too-long', 'and the reason names the setting that has to change');
  eq(his.smallestGapHours, 12, 'the arithmetic the card prints');
  eq(his.neededHours, 12, 'and the number the repeat would have to be lowered to');

  /* Lowered to match: his example works, exactly at the floor. */
  const fixed = roundsVsRepeat(['03:30', '15:30'], repeat(true, 12));
  is(fixed.ok, 'at twelve hours the repeat window matches the gap and both rounds publish — the closest two rounds this engine will ever allow');
  eq(fixed.neededHours, 12, 'and twelve is MIN_REPEAT_HOURS, so there is no room below it');
  eq(MIN_REPEAT_HOURS, 12, 'the floor this file reasons about is the floor the database enforces');

  /*
   * THE REPEAT OFF IS THE DEFAULT, and with it a second round is not slowed
   * down — it is refused for ever. A different sentence, so the card can offer
   * the right fix rather than a number.
   */
  const off = roundsVsRepeat(['03:30', '15:30'], repeat(false));
  is(!off.ok, 'with the repeat off, rules.ts refuses a second publication to a group for ever — a second round is decorative');
  eq(off.reason, 'repeat-off', 'and the card must say THAT, not "lower the window"');

  /*
   * CLOSER THAN THE FLOOR: nothing helps. 12 is a database CHECK and a
   * deliberate refusal to put one advertisement into one group twice in a
   * morning. The card must not offer a fix that the database would reject.
   */
  const tooClose = roundsVsRepeat(['08:00', '14:00'], repeat(true, 12));
  is(!tooClose.ok, 'six hours apart cannot work however the repeat is set');
  eq(tooClose.reason, 'closer-than-the-floor', 'and it is a different reason, because there is no setting that fixes it');
  eq(roundsVsRepeat(['08:00', '14:00'], repeat(false)).reason, 'closer-than-the-floor', 'the floor is reported before the repeat switch, because it is the one that cannot be answered');
}

/* ───── 6. THE REAL SLOT ENGINE, RUN — two occasions a day, in Jerusalem ── */
{
  /*
   * THE CLAIM THIS WHOLE FEATURE RESTS ON, and it is run rather than argued:
   * social_schedules.weekly is an array per weekday and slots.ts already loops
   * it. If that were not true, everything above would be arithmetic about
   * nothing.
   *
   * No new scheduling code is under test here. weeklyPlanFor() builds the
   * plan; the SHIPPED slotsFor() turns it into instants.
   */
  const weekly = weeklyPlanFor(sched('03:30', [0, 1, 2, 3, 4, 5, 6]), [{ at: '15:30', enabled: true }]);
  eq(weekly['1'], ['03:30', '15:30'], 'the plan handed to the engine carries both occasions for a chosen day');

  const plan = { mode: 'weekly' as const, timezone: 'Asia/Jerusalem', run_at: null, weekly, interval_days: null, interval_time: null };
  const from = new Date('2026-11-02T00:00:00+02:00');
  const until = new Date('2026-11-03T00:00:00+02:00');
  const slots = slotsFor(plan, from, until).map((d) => d.toISOString());
  eq(slots.length, 2, 'the shipped slot engine produces TWO occasions in one day from one schedule row — no second scheduler is involved');
  eq(slots[0], new Date('2026-11-02T03:30:00+02:00').toISOString(), 'round one lands at 03:30 local');
  eq(slots[1], new Date('2026-11-02T15:30:00+02:00').toISOString(), 'round two lands at 15:30 local');

  /* And one round is still one occasion, which is every campaign today. */
  const onePlan = { ...plan, weekly: weeklyPlanFor(sched('03:30', [0, 1, 2, 3, 4, 5, 6]), []) };
  eq(slotsFor(onePlan, from, until).length, 1, 'a campaign with no extra rounds still gets exactly one occasion a day');

  /*
   * ─── ACROSS THE CLOCK CHANGE ──────────────────────────────────────────
   *
   * Israel leaves daylight saving at 02:00 on the last Sunday of October —
   * 25.10.2026 — and both hours here are LOCAL, so the gap between them in
   * real elapsed time is not constant across that night. The requirement is
   * "אזור הזמן Asia/Jerusalem, כולל שעון קיץ וחורף", and what it means in
   * practice is that each round keeps the hour the owner chose rather than
   * drifting by one. Asserted against the local wall clock, not against a
   * UTC offset, because the offset is the thing that changes.
   */
  const dstFrom = new Date('2026-10-24T00:00:00+03:00');
  const dstUntil = new Date('2026-10-26T23:59:00+02:00');
  const across = slotsFor(plan, dstFrom, dstUntil);
  const local = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const hours = [...new Set(across.map(local))].sort();
  eq(hours, ['03:30', '15:30'], 'every occasion either side of the clock change is still at the hour the owner chose — no round drifts by an hour');
  is(across.length >= 4, `three days should carry at least four occasions across the change, got ${across.length}`);
}

/* ───── 7. WHICH ROUND A QUEUE ROW BELONGS TO, recorded not guessed ────── */
{
  /*
   * "כל סבב חייב לקבל מזהה עצמאי." social_queue.round_at holds the occasion's
   * local 'HH:MM', written once by plan.ts.
   *
   * WHAT IS RUN HERE AND WHAT IS READ, stated plainly rather than blurred:
   * zonedHM() is RUN, including across the clock change, because that is the
   * value that gets stored. planQueue() itself cannot be driven from this
   * suite — it speaks PostgREST, and the local Postgres the db tests use has
   * none — so the line that writes the column is PINNED as source, with the
   * one plausible mistake pinned against explicitly.
   */
  const tz = 'Asia/Jerusalem';
  eq(zonedHM(new Date('2026-11-02T03:30:00+02:00'), tz), '03:30', 'the stored round is the occasion on the local clock');
  eq(zonedHM(new Date('2026-11-02T15:30:00+02:00'), tz), '15:30', 'and the second occasion likewise');
  /* Summer time: the same local hours, two different UTC offsets, one spelling. */
  eq(zonedHM(new Date('2026-10-24T03:30:00+03:00'), tz), '03:30', 'the stored round does not change when the clock does — it is a local hour, not an offset');
  eq(zonedHM(new Date('2026-10-24T15:30:00+03:00'), tz), '15:30', 'likewise the afternoon round the day before the change');
  /* A key, not a display string: zero-padded, 24-hour, no locale marks. */
  eq(zonedHM(new Date('2026-11-02T09:05:00+02:00'), tz), '09:05', 'single-digit hours are padded, so two equal rounds compare equal as text');

  const plan = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  is(/round_at: zonedHM\(/.test(plan), 'the planner no longer records which round it stamped a row from — per-round progress would be a guess again');
  /*
   * FROM THE OCCASION, NOT FROM THE ROW'S OWN INSTANT, and this is the whole
   * assertion. windowedStagger spaces each target out from the occasion, so a
   * round of two hundred groups at thirty seconds runs an hour and a half past
   * its own start. Taking the round from `slot` — the row's time — would push
   * the tail of a long round into the next one, which is exactly the lie the
   * column exists to prevent.
   */
  is(
    /round_at: zonedHM\(slots\[slotIndex\]/.test(plan),
    "the round is taken from the row's own instant instead of from the occasion — the tail of a long round would be counted in the next one",
  );
  is(!/round_at: zonedHM\(slot,/.test(plan), 'and `slot` is the staggered instant, not the occasion');
}

/* ───── 8. THE WINDOW HAS TO COME DOWN, OR THE FEATURE IS A DECORATION ──── */
/*
 * "יש לממש את הפונקציונליות בפועל ולא ליצור כפתורים דקורטיביים."
 *
 * Section 6 above proves the card can SAY that a second round will not
 * publish. This proves the app DOES something about it. The owner's own
 * example is the case: 03:30 and 15:30, twelve hours apart, against a repeat
 * window whose default is twenty — so without this subtraction every row of
 * round two defers past his publishing window and is eventually thrown away.
 */
{
  const r = (at: string, enabled = true) => ({ at, enabled });

  /* ── the owner's own example, start to finish ──────────────────────────── */
  {
    const fix = roundsWindowFix(sched('03:30'), [r('15:30')], repeat(true, 20));
    eq(fix.lowerTo, 12, 'his 03:30 + 15:30 against the default 20-hour window must lower it to 12, or round two publishes nothing');
    eq(fix.repeatOff, false, 'and with the repeat armed there is nothing else in the way');
    /* AND THE LOWERED WINDOW ACTUALLY ALLOWS IT — asked of the same function
       the card and the engine ask, not of my arithmetic about it. */
    const after = roundsVsRepeat(roundStarts(sched('03:30'), [r('15:30')]), repeat(true, fix.lowerTo as number));
    eq(after.reason, 'ok', 'and after the fix the verdict must be ok — a lowering that still refuses is worth nothing');
    is(after.ok, 'both rounds will be allowed to reach the same groups');
  }

  /* ── one round changes nothing. The whole backward-compatibility story. ── */
  {
    const fix = roundsWindowFix(sched('08:00'), [], repeat(true, 20));
    eq(fix.lowerTo, null, 'a campaign with one occasion a day must not have its window touched');
    eq(fix.repeatOff, false, 'and nothing is reported about a switch it does not need');
    eq(roundsWindowFix(sched('08:00'), [r('20:00', false)], repeat(true, 20)).lowerTo, null, 'nor one whose only extra round is switched OFF');
  }

  /* ── a window ALREADY short enough is left alone ──────────────────────── */
  {
    eq(roundsWindowFix(sched('03:30'), [r('15:30')], repeat(true, 12)).lowerTo, null, 'a window that already fits is not rewritten');
    eq(roundsWindowFix(sched('06:00'), [r('20:00')], repeat(true, 13)).lowerTo, null, '13 hours inside a 14-hour gap is fine and must not be touched');
  }

  /*
   * ── AND IT NEVER GOES UNDER THE FLOOR ─────────────────────────────────
   *
   * Twelve is a CHECK in the database and a deliberate refusal to put one
   * advertisement into one group twice in a morning. Two rounds four hours
   * apart must get the card's refusal, NOT a window of four.
   */
  {
    const fix = roundsWindowFix(sched('08:00'), [r('12:00')], repeat(true, 20));
    eq(fix.lowerTo, null, 'two rounds four hours apart must not lower the window below the floor — the card refuses them instead');
    eq(roundsVsRepeat(roundStarts(sched('08:00'), [r('12:00')]), repeat(true, 20)).reason, 'closer-than-the-floor', 'and that is the verdict the card draws');
    /*
     * EVERY GAP UNDER THE FLOOR, SWEPT — and what this does and does not
     * prove, measured rather than assumed.
     *
     * It proves the COMPOSITION: no pair of rounds, however close, can come
     * out of roundsWindowFix() with a window under twelve hours. That is the
     * property that matters, and it is the one the database CHECK would
     * otherwise have to catch at write time.
     *
     * It does NOT exercise the Math.max() clamp in roundsWindowFix, and I
     * checked rather than guessing: deleting the clamp leaves this whole file
     * green, because roundsVsRepeat answers 'closer-than-the-floor' before it
     * ever answers 'window-too-long', so neededHours cannot be under twelve by
     * the time the clamp sees it. The clamp is defence against that ORDER
     * changing — and the order is pinned by section 6, which goes red on both
     * halves of that mutation. The clamp stays; this comment is here so nobody
     * reads the sweep as proof of it.
     */
    for (const at of ['08:30', '09:00', '11:00', '15:00', '19:59']) {
      const f = roundsWindowFix(sched('08:00'), [r(at)], repeat(true, 20));
      is(f.lowerTo === null || f.lowerTo >= MIN_REPEAT_HOURS, `a round at ${at} must never produce a window under ${MIN_REPEAT_HOURS} hours (got ${String(f.lowerTo)})`);
    }
  }

  /* ── THE SWITCH IS HIS. Reported, never pressed. ───────────────────────── */
  {
    const fix = roundsWindowFix(sched('03:30'), [r('15:30')], repeat(false, 20));
    eq(fix.repeatOff, true, 'with חזרה יומית off, a second round must be reported as unable to reach the same groups');
    /*
     * THE BODY, NOT THE SIGNATURE. saveCampaignRounds's parameter type names
     * both repeat columns because the function READS them, so a check over the
     * whole function would be satisfied by the type annotation alone and would
     * prove nothing about what is written.
     */
    const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
    const save = client.slice(client.indexOf('export async function saveCampaignRounds'), client.indexOf('export async function setCampaignRepeat('));
    const whole = save.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const code = whole.slice(whole.indexOf('const written ='));
    is(save.length > 400, 'saveCampaignRounds is gone, or the function after it was renamed');
    is(code.length > 300, 'its body could not be isolated — every check below would be vacuous');
    is(/roundsWindowFix\(/.test(code), 'the writer must ask roundsWindowFix() rather than carrying a second copy of the arithmetic');
    is(!/repeat_enabled/.test(code), 'and it must NEVER write repeat_enabled — pressing the owner’s switch for him is the screen overruling a choice he made');
    is(/repeat_min_hours/.test(code), 'it does write the window, which is the one thing it is allowed to change');
    is(/logClientActivity\(/.test(code), 'and a window the app lowered by itself must reach his history — he has no memory of choosing it');
  }

  /*
   * ── AND A DATABASE WITHOUT THE WINDOW COLUMN MUST STILL SAVE THE ROUNDS ─
   *
   * PostgREST refuses the WHOLE write when one named column is absent. That is
   * not a hypothetical: adding round_at to three screen selects blanked this
   * owner's entire dashboard earlier this session. So the column that is not
   * the point of the call is dropped and the write retried.
   */
  {
    /*
     * THE BODY, NOT THE SIGNATURE. saveCampaignRounds's parameter type names
     * both repeat columns because the function READS them, so a check over the
     * whole function would be satisfied by the type annotation alone and would
     * prove nothing about what is written.
     */
    const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
    const save = client.slice(client.indexOf('export async function saveCampaignRounds'), client.indexOf('export async function setCampaignRepeat('));
    const whole = save.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const code = whole.slice(whole.indexOf('const written ='));
    is(code.length > 300, 'its body could not be isolated — every check below would be vacuous');
    is(
      /isMissingColumnNamed\([\s\S]{0,80}'repeat_min_hours'\)/.test(code),
      'a database without repeat_min_hours must not lose the rounds too — the write has to be retried without it',
    );
    const retry = code.indexOf("update(written)");
    is(retry > code.indexOf("'repeat_min_hours'"), 'and the retry must come after the check, writing the rounds alone');
    is(
      /windowLoweredTo = null;/.test(code),
      'and the owner must not be told a window was lowered on a database that has no such column',
    );
  }

  /* ── THE SENTENCE HE READS. One builder, both screens. ─────────────────── */
  {
    const m = (armed: number, res: Parameters<typeof roundsSavedMessage>[2]) => roundsSavedMessage('בוקר טוב', armed, res);
    is(/לא נבחר אף יום פרסום/.test(m(1, { skippedNoDay: true }).text), 'no publishing day chosen is said first — nothing else matters until a day is picked');
    eq(m(1, { skippedNoDay: true }).tone, 'info', 'and it is not celebrated as a success');
    is(/כובו/.test(m(0, { skippedNoDay: false }).text), 'every extra round switched off says so');
    is(/2 סבבים/.test(m(1, { skippedNoDay: false }).text), 'one extra round is TWO rounds a day — the first one counts');
    is(/3 סבבים/.test(m(2, { skippedNoDay: false }).text), 'and two extra rounds are three');
    /* The window, named with its number. A toast that says "saved" while a
       setting he chose has quietly changed is the complaint this product
       already has a name for. */
    const lowered = m(1, { skippedNoDay: false, windowLoweredTo: 12 });
    is(/12 שעות/.test(lowered.text), 'a window the app lowered must be named, with its number, in the toast he actually reads');
    is(/חלון החזרה/.test(lowered.text), 'and named as what it is');
    /* And OFF outranks it: one stops a publication, the other is a detail. */
    const off = m(1, { skippedNoDay: false, windowLoweredTo: 12, repeatOff: true });
    is(/חזרה יומית/.test(off.text) && /כבוי/.test(off.text), 'a repeat that is OFF must be the sentence he gets, even when a window was also lowered');
    eq(off.tone, 'info', 'and it is not a success — a round that will not reach its groups never is');
    /* Both screens must use it rather than writing their own. */
    for (const rel of ['../../src/app/social/page.tsx', '../../src/app/social/campaigns/page.tsx']) {
      const screen = readFileSync(new URL(rel, import.meta.url), 'utf8');
      is(/roundsSavedMessage\(/.test(screen), `${rel} must build the rounds toast with the shared builder`);
      is(!/סבבים בכל יום פרסום`/.test(screen), `${rel} must not carry its own copy of the sentence — two copies is how one screen forgets the window`);
    }

    /*
     * ─── AND THE SCREEN MUST SHOW THE WINDOW IT JUST CHANGED ──────────────
     *
     * THE DASHBOARD IS THE ONLY SCREEN THAT SAVES ROUNDS TODAY, and the two
     * assertions below are not the same kind of claim. Saying so because I
     * nearly shipped the second one as if it were.
     */
    const dash = readFileSync(new URL('../../src/app/social/page.tsx', import.meta.url), 'utf8');
    is(/rounds=\{readRounds\(run\.campaign\)\}/.test(dash), 'the dashboard must pass the campaign\u2019s rounds to the run card, or the feature is wired to nothing');
    const saver = dash.slice(dash.indexOf('const changeRounds = useCallback'), dash.indexOf('const changeRepeat = useCallback'));
    is(/await load\(\)/.test(saver), 'and must re-read after saving rounds, which is how its card learns the window the save lowered');

    /*
     * THE CAMPAIGNS LIST IS A PRE-EMPTIVE GUARD, NOT A MEASUREMENT.
     *
     * That screen has a changeRounds of its own — and nothing calls it: the
     * list card is never passed `rounds`, and it predates this change (it is
     * dead in HEAD too). The reason is measured and recorded in render-card
     * .tsx: with the rounds on, the tallest fixture went 901 → 1008px at 360px
     * against a 910px ceiling. The owner's reference puts them on the RUN
     * card, which is where they are.
     *
     * So this pins the writer for the day the card can hold them. It proves
     * the code is correct, NOT that the screen does this today — and the
     * second assertion is what stops anyone reading it the other way.
     */
    const list = readFileSync(new URL('../../src/app/social/campaigns/page.tsx', import.meta.url), 'utf8');
    is(
      /repeat_min_hours: result\.windowLoweredTo/.test(list),
      'if the campaigns screen ever saves rounds it must merge the lowered window into its own list — a poll owns that list and replaces it wholesale, so merging only the rounds column leaves the card printing the interval the save just replaced',
    );
    is(
      !/rounds=\{/.test(list),
      'the campaigns LIST card is still not passed rounds (measured: 1008px against a 910px ceiling) — the moment it is, the assertion above stops being pre-emptive and the height ceiling in campaign-card.test.ts has to be re-measured',
    );
  }
}

/* ── 9. THE FLOOR IS THE ACCOUNT'S NOW, AND THE TOAST STOPPED LYING ────── */
/*
 * "את ההגנה של החזרה יומית של אותו הפוסט לאותו קבוצה יש הגנה של 12 שעות
 *  תוסיף אופציה בהגדרות לשחק עם זה." — the owner, 02.11.2026.
 *
 * WHAT HIS SCREEN WAS ACTUALLY DOING, measured by driving the real engine
 * before any of this was written: rounds at 03:30, 06:30 and 18:30 were saved
 * and armed into social_schedules.weekly; the planner created rows; and
 * evaluateQueueItem DEFERRED round two from 06:30 to 23:30 — at which point
 * that parked row is the single open row the group is allowed, so it blocked
 * round three's occasion entirely. Three rounds asked for, two delivered, one
 * of them at an hour he never chose. And the toast said
 * "יפרסם 3 סבבים בכל יום פרסום".
 */
{
  const r = (at: string, enabled = true) => ({ at, enabled });

  /* ── the floor comes off the account, and is absent by default ───────── */
  {
    eq(repeatFloorFrom(null), MIN_REPEAT_HOURS, 'an account that never set a floor keeps the twelve it has always had');
    eq(repeatFloorFrom({}), MIN_REPEAT_HOURS, 'and so does one whose settings row has no such key');
    eq(repeatFloorFrom({ repeatFloorHours: 3 }), 3, 'the owner’s own number is what governs');
    /*
     * ─── ZERO IS A NUMBER NOW, AND IT IS HIS ────────────────────────────
     *
     * "לא הסרת את המגבלה של ה-20 שעות! תמחק את זה כבר." — 02.11.2026, after
     * "לפתוח הכל, גם אותו פוסט". This assertion was the inverse until then:
     * zero was raised to one hour, and this file asserted the absolute floor
     * could never be under an hour because the column stores whole hours. v34
     * widens the CHECK to 0..168 and zero now means what it says — no minimum
     * at all between two publications of the same post to the same group.
     *
     * A NEGATIVE IS STILL NOT A NUMBER. Zero is a setting; minus nine is a
     * mistake, and the database would refuse it anyway.
     */
    eq(repeatFloorFrom({ repeatFloorHours: 0 }), 0, 'zero stays zero — no minimum at all, which is what he asked for three times');
    eq(repeatFloorFrom({ repeatFloorHours: -9 }), ABSOLUTE_MIN_REPEAT_HOURS, 'a negative is raised to the absolute floor');
    eq(repeatFloorFrom({ repeatFloorHours: 9999 }), MAX_REPEAT_HOURS, 'and a year is the ceiling');
    eq(repeatFloorFrom({ repeatFloorHours: 'x' } as never), MIN_REPEAT_HOURS, 'nonsense falls back to the default rather than to zero');
    eq(ABSOLUTE_MIN_REPEAT_HOURS, 0, 'the absolute floor is zero — see its note, and v34');

    /*
     * AND THE 20 IS GONE FROM THE ONE PLACE THAT KEPT STAMPING IT. He created
     * a campaign and the activity log said "לא יותר מפעם ב-20 שעות" two
     * minutes later; the number came from DEFAULT_CAMPAIGN_REPEAT.minHours,
     * which no screen and no setting could reach.
     */
    eq(DEFAULT_CAMPAIGN_REPEAT.minHours, MIN_REPEAT_HOURS, 'a new campaign starts on the documented default, not an undocumented twenty');
    is(DEFAULT_CAMPAIGN_REPEAT.minHours !== 20, 'the hard-coded twenty must not come back');

    /*
     * AND A ROW WITH NO STORED WINDOW READS THE ACCOUNT'S FLOOR, not the
     * constant — which is what made his own setting unreachable.
     */
    eq(readRepeat({ repeat_enabled: true } as never, 2).minHours, 2, 'an unstored window reads the account floor');
    eq(readRepeat({ repeat_enabled: true } as never, 0).minHours, 0, 'including a floor of zero');
    eq(readRepeat({ repeat_enabled: true } as never).minHours, MIN_REPEAT_HOURS, 'and the documented default when no floor is passed');

    /* The sentence a screen prints must not read "פעם ב-0 שעות". */
    is(/לא יותר מפעם ב-5 שעות/.test(repeatWindowSentence(5)), 'a real window is stated in hours');
    is(!/0/.test(repeatWindowSentence(0)), 'and a window of nought is described, not printed as a number');
  }

  /* ── HIS OWN CASE, before and after ──────────────────────────────────── */
  {
    const his = [r('06:30'), r('18:30')];
    const before = roundsVsRepeat(roundStarts(sched('03:30'), his), repeat(true, 12));
    eq(before.reason, 'closer-than-the-floor', 'on the default floor his three rounds cannot publish — which is what his screen was doing');
    eq(before.smallestGapHours, 3, 'and the closest two are three hours apart');

    /* The setting he asked for, doing the one thing he asked it to do. */
    const after = roundsVsRepeat(roundStarts(sched('03:30'), his), repeat(true, 3), repeatFloorFrom({ repeatFloorHours: 3 }));
    eq(after.reason, 'ok', 'with the account floor at three hours the same layout is allowed');
    is(after.ok, 'and the card says so');
  }

  /* ── AND THE WINDOW STILL HAS TO COME DOWN WITH IT ───────────────────── */
  {
    /* Floor 3, window still the default 20: the gap is legal now, so this is
       'window-too-long' rather than 'closer-than-the-floor', and the fix
       lowers the window to the gap — to THREE, not to twelve. */
    const fix = roundsWindowFix(sched('03:30'), [r('06:30')], repeat(true, 20), 3);
    eq(fix.reason, 'window-too-long', 'a legal gap against a long window is the case the app can fix by itself');
    eq(fix.lowerTo, 3, 'and it lowers to the gap, not to the old constant — clamping to 12 here would overrule the setting he just changed');
    eq(roundsVsRepeat(roundStarts(sched('03:30'), [r('06:30')]), repeat(true, fix.lowerTo as number), 3).reason, 'ok', 'and the result publishes');
  }

  /* ── THE VERDICT TRAVELS, WHICH IS WHAT STOPS THE TOAST LYING ────────── */
  {
    const fix = roundsWindowFix(sched('03:30'), [r('06:30'), r('18:30')], repeat(true, 12));
    eq(fix.reason, 'closer-than-the-floor', 'the fix must carry the verdict, or the caller cannot tell this apart from success');
    eq(fix.lowerTo, null, 'there is nothing to lower — no window under the floor is legal');
    eq(fix.repeatOff, false, 'and the repeat is on, so that is not the reason either');
    eq(fix.floorHours, MIN_REPEAT_HOURS, 'and it reports the floor it judged against, so the sentence can name the number');

    const said = roundsSavedMessage('ניקוי ספות', 2, { skippedNoDay: false, ...fix });
    is(!/יפרסם 3 סבבים בכל יום פרסום$/.test(said.text), 'THE TOAST MUST NOT CLAIM THREE ROUNDS WILL PUBLISH — measured, his layout delivers two, one of them at 23:30');
    is(/3 שעות/.test(said.text), 'it must name the gap he actually set');
    is(/12 שעות/.test(said.text), 'and the protection that refuses it');
    is(/בהגדרות/.test(said.text), 'and point at the setting that can change it, which is the control he asked for by name');
    eq(said.tone, 'info', 'and it is not a success — a round that will not publish never is');
  }

  /* ── "+ הוסף סבב נוסף" MUST NOT PROPOSE AN HOUR THAT IS ALREADY TAKEN ── */
  {
    /*
     * THE SECOND PRESS USED TO PROPOSE ROUND ONE'S OWN HOUR. From 03:30 it
     * offered 15:30, then 15:30 + 12 = 27:30 which wraps to 03:30 — and
     * roundStarts() de-duplicates it away, so the card drew a row the engine
     * never got. A button that adds nothing while looking like it worked.
     */
    const first = nextFreeRoundStart(['03:30']) as string;
    is(first !== null, 'a day with one round must have somewhere to put a second');
    is(smallestRoundGapHours(['03:30', first]) >= MIN_REPEAT_HOURS, `the proposed ${first} must clear the floor against 03:30`);

    const second = nextFreeRoundStart(['03:30', first]);
    eq(second, null, 'on a twelve-hour floor a day holds exactly two rounds, so the third press must be offered nothing rather than a duplicate');

    /* And with the floor lowered, the day has room — each proposal clearing
       the floor against EVERY existing round, not just the last one. */
    let starts = ['03:30'];
    for (let n = 0; n < 3; n += 1) {
      const at = nextFreeRoundStart(starts, 3);
      is(at !== null, `a three-hour floor must still have room after ${starts.length} rounds`);
      is(!starts.includes(at as string), `${at} is already taken — this is the duplicate the old arithmetic produced`);
      starts = [...starts, at as string];
      is(
        smallestRoundGapHours(starts) >= 3,
        `after adding ${at} the closest pair is ${smallestRoundGapHours(starts)}h, under the three-hour floor: ${starts.join(', ')}`,
      );
    }
  }

  /* ── AND THE PANEL ASKS FOR A FREE HOUR RATHER THAN COMPUTING ONE ────── */
  {
    const panel = readFileSync(new URL('../../src/components/social/CampaignSchedulePanel.tsx', import.meta.url), 'utf8')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    is(/nextFreeRoundStart\(starts, floorHours\)/.test(panel), 'the add button must ask for a free hour, against the account floor');
    is(!/plusHours\(/.test(panel), 'and must not carry the wrapping arithmetic that proposed an hour already in use');
    is(/rounds\.length < MAX_EXTRA_ROUNDS && nextFreeRoundStart\(/.test(panel), 'and must disappear when the day has no room left, rather than offering a press that does nothing');
    /* THE SAVE BUTTON HE ASKED FOR, and the write that is no longer per-keystroke. */
    is(/type="submit"/.test(panel), 'the round menu must carry a submit button — "אין כפתור שאני שומר את ההגדרות"');
    is(/שמור את השעה/.test(panel), 'and it must say so in his own words');
    is(/onSubmit=\{\(e\) => \{/.test(panel), 'and the write must happen on submit');
    is(
      !/<input\s+type="time"[\s\S]{0,400}onChange=/.test(panel),
      'the time field must NOT write on change any more — it used to arm an intermediate hour like 01:30 into weekly while he was still typing 18:30',
    );
    is(/new FormData\(e\.currentTarget\)/.test(panel), 'and it reads its own field rather than holding a draft in state, which this panel is not allowed to do');
    /*
     * AND IT REFUSES AN HOUR ANOTHER ROUND ALREADY HOLDS.
     *
     * Measured before this guard existed: with rounds at 03:30, 06:30 and
     * 18:30, setting the third to 06:30 produced two identical entries, and
     * both roundsColumn() and roundStarts() de-duplicate — so the round
     * vanished from the card AND from the database with nothing said. Worse,
     * while the duplicate existed, one edit rewrote BOTH entries, because the
     * handler matches rounds by their time.
     */
    is(/editRoundTime\(rounds, starts, at,/.test(panel), 'the save must ask editRoundTime() rather than deciding inline — an inline guard here cannot be driven, and the first one was hollow under an `if (false && …)` mutation');
    is(/reportValidity\(\)/.test(panel), 'and must say so with the browser\u2019s own validation, which needs no state');
  }

  /* ── AND THE DECISION ITSELF, DRIVEN ─────────────────────────────────── */
  {
    const list = [r('06:30'), r('18:30')];
    const starts3 = ['03:30', '06:30', '18:30'];

    const moved = editRoundTime(list, starts3, '18:30', '21:00');
    is(moved.ok, 'a free hour must be accepted');
    eq(moved.ok && moved.rounds.map((x) => x.at), ['06:30', '21:00'], 'and only the round being edited moves');

    /*
     * THE ONE THAT COST A ROUND. Measured on the shipped card: setting round
     * three to 06:30 produced two identical entries, roundsColumn() and
     * roundStarts() both de-duplicated, and the round vanished from the
     * screen and the database with nothing said.
     */
    const clash = editRoundTime(list, starts3, '18:30', '06:30');
    is(!clash.ok, 'an hour another round already holds must be REFUSED, not de-duplicated into one round');
    eq(!clash.ok && clash.reason, 'taken', 'and the reason must say which, so the screen can tell him');
    /* Proof of what it prevents: the write the old handler would have made. */
    eq(
      roundsColumn(list.map((x) => (x.at === '18:30' ? { ...x, at: '06:30' } : x))).schedule_rounds.length,
      1,
      'the old behaviour collapsed two rounds into one on the way to the database — which is the loss this refusal exists to stop',
    );

    eq(!editRoundTime(list, starts3, '18:30', '18:30').ok && 'unchanged', 'unchanged', 'saving the same hour writes nothing');
    eq(!editRoundTime(list, starts3, '18:30', '').ok && 'invalid', 'invalid', 'and a half-typed value is refused rather than armed');
    /* The window's own hour counts as taken: it is in `starts` and is not an
       extra round, so moving onto it would hide a round behind the window. */
    eq(!editRoundTime(list, starts3, '18:30', '03:30').ok && 'taken', 'taken', "the window's own hour is taken too — a round hidden behind it is a round that never runs");
  }
}


/* ── 10. THE NUMBER THE CARD NAMES IS THE NUMBER THE BUTTON WRITES ─────── */
/*
 * "שיניתי לפחות מ-12 שעות ועדין לא נותן לפרסם." — the owner, 02.11.2026.
 *
 * He lowered the account's protection to two hours in Settings. His campaign
 * has rounds at 01:30 and 23:30 — two hours apart ACROSS MIDNIGHT — against a
 * repeat window of twelve. The card re-measured his rounds against the two he
 * had just set, correctly, and then printed "הורידו את החזרה ל-2 שעות": a
 * number with NO CONTROL ANYWHERE THAT SETS IT, because the campaign's own
 * window lost its editor when the advanced queue controls came out at his
 * request. And underneath that sentence every writer clamped back to the
 * hard-coded twelve, so even a write of two was raised again on its way to the
 * database. The setting was accepted by Settings and undone by the save.
 *
 * WHAT THIS SECTION PROVES is the arithmetic and the pass-through: ONE copy of
 * "which window would let these rounds publish" (repeatFitFor), asked by both
 * the writer and the card's button so the two cannot name one number and write
 * another — and every caller handing down the account's floor instead of the
 * constant. Whether the button is drawn and reachable is a measured question
 * and belongs to the browser suite; this file owns the numbers and the wiring.
 */
{
  const r = (at: string, enabled = true) => ({ at, enabled });

  /* ── THE ONE FIX, ON EVERY VERDICT ────────────────────────────────────── */
  {
    /* A window longer than the gap is the ONE case a window can fix. */
    const long = roundsVsRepeat(['03:30', '15:30'], repeat(true, 20));
    eq(long.reason, 'window-too-long', 'his original example is still the fixable case');
    eq(repeatFitFor(long, MIN_REPEAT_HOURS), 12, 'and the fix is the gap — twelve hours, which is what roundsWindowFix has always written');

    /* AND IT IS THE GAP, NOT THE FLOOR. On an account whose protection is two
       hours, rounds twelve hours apart must get a window of TWELVE: lowering
       it to the floor would be the app choosing a tighter protection than his
       rounds need, on his Facebook account, without being asked. */
    const wide = roundsVsRepeat(['03:30', '15:30'], repeat(true, 20), 2);
    eq(wide.reason, 'window-too-long', 'twelve hours apart on a two-hour floor is fixable too');
    eq(repeatFitFor(wide, 2), 12, 'and the fix is the twelve his rounds need, not the two his floor would also permit');
    eq(repeatFitFor(roundsVsRepeat(['06:00', '20:00'], repeat(true, 20), 2), 2), 10, 'and ten for a ten-hour gap — the arithmetic is the gap, whatever the floor is');

    /*
     * THE OTHER HALF OF THE Math.max, and what it is really defending — said
     * plainly rather than dressed up as engine output. Two things make the
     * floor side unreachable from roundsVsRepeat(): it answers
     * 'closer-than-the-floor' BEFORE 'window-too-long', so a fixable verdict
     * always has smallestGapHours >= floorHours, and neededHours is
     * Math.floor of that gap, which for an integer floor is still >= it. The
     * clamp therefore defends against a fractional floor or a change in the
     * order of those two branches — and the ORDER is pinned by section 5. So
     * it is driven here on a verdict built by hand, and this comment is here
     * so nobody reads that as the engine producing it.
     */
    const byHand: RoundsVerdict = { ok: false, smallestGapHours: 2.5, neededHours: 2, reason: 'window-too-long' };
    eq(repeatFitFor(byHand, 3), 3, 'the fix never goes under the floor it was given — a window the database would refuse is not a fix');

    /* ── AND NULL EVERYWHERE A WINDOW CANNOT HELP ───────────────────────── */
    const fine = roundsVsRepeat(['03:30', '15:30'], repeat(true, 12));
    eq(fine.reason, 'ok', 'a window that already fits');
    eq(repeatFitFor(fine, MIN_REPEAT_HOURS), null, 'nothing to offer when both rounds already publish — a button here would rewrite a setting for no reason');

    const off = roundsVsRepeat(['03:30', '15:30'], repeat(false));
    eq(off.reason, 'repeat-off', 'the switch is off');
    eq(repeatFitFor(off, MIN_REPEAT_HOURS), null, 'no window makes a second publication legal while חזרה יומית is off — the fix is his switch, and the card must offer THAT');

    const closer = roundsVsRepeat(['08:00', '14:00'], repeat(true, 12));
    eq(closer.reason, 'closer-than-the-floor', 'six hours apart on a twelve-hour floor');
    eq(
      repeatFitFor(closer, MIN_REPEAT_HOURS),
      null,
      'rounds closer together than the account floor cannot be fixed by ANY window — a button there would write a number, the floor would still refuse the gap, and that is the decorative button one layer down',
    );

    /* ── AN OMITTED FLOOR BEHAVES AS THE TWELVE IT ALWAYS WAS ───────────── */
    const needsFive: RoundsVerdict = { ok: false, smallestGapHours: 5, neededHours: 5, reason: 'window-too-long' };
    eq(repeatFitFor(needsFive), MIN_REPEAT_HOURS, 'with no floor passed the default is MIN_REPEAT_HOURS, so an old caller writes exactly what it used to');
    eq(repeatFitFor(needsFive, 2), 5, 'and an account that lowered its protection gets its own number through');
    eq(repeatFitFor(long), repeatFitFor(long, MIN_REPEAT_HOURS), 'the default and the constant are the same answer on real engine output too');
  }

  /* ── ONE ARITHMETIC: THE WRITER AND THE CARD CANNOT DRIFT ──────────────-- */
  {
    /*
     * THE ASSERTION THIS WHOLE EXPORT EXISTS FOR. roundsWindowFix() decides
     * what the SAVE writes; repeatFitFor() decides what the BUTTON writes and
     * what the sentence names. They were one expression copied into one place
     * and are now one function asked twice — and this table is what stops
     * anybody re-inlining it.
     */
    const table: [string, CampaignRound[], CampaignRepeat, number][] = [
      ['03:30', [r('15:30')], repeat(true, 20), MIN_REPEAT_HOURS],
      ['01:30', [r('23:30')], repeat(true, 12), 2],
      ['06:00', [r('20:00')], repeat(true, 20), 2],
      ['03:30', [r('06:30'), r('18:30')], repeat(true, 20), 3],
      ['08:00', [r('12:00')], repeat(true, 20), MIN_REPEAT_HOURS],
      ['03:30', [r('15:30')], repeat(false, 20), MIN_REPEAT_HOURS],
      ['08:00', [], repeat(true, 20), MIN_REPEAT_HOURS],
      ['03:30', [r('15:30', false)], repeat(true, 20), MIN_REPEAT_HOURS],
      ['03:30', [r('15:30')], repeat(true, 12), MIN_REPEAT_HOURS],
    ];
    let offered = 0;
    for (const [start, rounds, rep, floor] of table) {
      const fix = roundsWindowFix(sched(start), rounds, rep, floor);
      const fit = repeatFitFor(roundsVsRepeat(roundStarts(sched(start), rounds), rep, floor), floor);
      const name = `${start} + [${rounds.map((x) => `${x.at}${x.enabled ? '' : ' off'}`).join(', ')}], repeat ${rep.enabled ? rep.minHours : 'off'}, floor ${floor}`;
      eq(fix.lowerTo, fit, `the save and the card must name the same window for ${name} — one names it, the other writes it`);
      if (fit !== null) offered += 1;
    }
    is(offered >= 4, `only ${offered} of the rows above produce a window at all — a table of nulls would prove nothing`);
    /* And with BOTH floors left out, which is every caller that has not been
       told the account's number yet. */
    eq(
      roundsWindowFix(sched('03:30'), [r('15:30')], repeat(true, 20)).lowerTo,
      repeatFitFor(roundsVsRepeat(roundStarts(sched('03:30'), [r('15:30')]), repeat(true, 20))),
      'and they agree on their defaults too, so the agreement does not depend on being passed a floor',
    );
  }

  /* ── HIS OWN CASE, AS ARITHMETIC ───────────────────────────────────────── */
  {
    const floor = repeatFloorFrom({ repeatFloorHours: 2 });
    eq(floor, 2, 'the two hours he typed into Settings survive repeatFloorFrom() — anything else and the rest of this block is about a number he never set');

    const starts = roundStarts(sched('01:30'), [r('23:30')]);
    eq(starts, ['01:30', '23:30'], 'his layout: the hour on the card and one extra round');

    const his = roundsVsRepeat(starts, repeat(true, 12), floor);
    eq(his.smallestGapHours, 2, '01:30 and 23:30 are TWO hours apart, around midnight — not twenty-two, because the campaign publishes again tomorrow');
    eq(his.reason, 'window-too-long', 'so on his own floor the gap is legal and the campaign window is the only thing in the way');
    eq(repeatFitFor(his, floor), 2, 'and the number the card names is two — the window his rounds actually need');

    /* AND PRESSING IT GENUINELY MAKES HIS ROUNDS PUBLISHABLE. Asked of the
       same function the card and the engine ask, not of my arithmetic about
       it: a button that writes a number which still refuses to publish is the
       complaint he opened with, moved one screen along. */
    const after = roundsVsRepeat(starts, repeat(true, repeatFitFor(his, floor) as number), floor);
    eq(after.reason, 'ok', 'after the write both of his rounds are allowed to reach the same groups');
    is(after.ok, 'which is the whole of what he asked for');

    /* And the save agrees, so the two routes to the same number cannot differ. */
    eq(roundsWindowFix(sched('01:30'), [r('23:30')], repeat(true, 12), floor).lowerTo, 2, 'and saving his rounds would write the same two');

    /*
     * ─── THE STATE HE WAS ACTUALLY STUCK IN ────────────────────────────
     *
     * The same layout with the floor left at its default: his rounds are
     * CLOSER than the protection, so no window helps and there is nothing to
     * offer — which is why the Settings control had to exist first, and why
     * this button must not appear here.
     */
    const stuck = roundsVsRepeat(starts, repeat(true, 12));
    eq(stuck.reason, 'closer-than-the-floor', 'on the old hard twelve his two hours read as too close, and no campaign setting could have answered it');
    eq(repeatFitFor(stuck), null, 'so no window is offered — the sentence points at the protection in Settings instead, which is the control he went and used');
  }

  /* ── THE PASS-THROUGH. EVERY WRITER GETS THE ACCOUNT'S FLOOR ──────────── */
  /*
   * These read raw source, and a raw-source guard is worth exactly what it is
   * mutation-tested at: two guards in this suite once passed while the feature
   * they named was deleted, because `{false && …}` leaves every string in
   * place. Each check below was broken in src/, seen to fail with its own
   * message, and restored.
   */
  {
    /* Comments out, so a sentence ABOUT a call is never read as a call. */
    const bare = (text: string) =>
      text
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');

    /* The arguments of one call, split at top-level commas. */
    const argsAt = (text: string, open: number): string[] => {
      const out: string[] = [];
      let depth = 0;
      let cur = '';
      for (let i = open; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '(' || ch === '[' || ch === '{') {
          depth += 1;
          if (depth === 1) continue;
        } else if (ch === ')' || ch === ']' || ch === '}') {
          depth -= 1;
          if (depth === 0) {
            out.push(cur);
            break;
          }
        } else if (ch === ',' && depth === 1) {
          out.push(cur);
          cur = '';
          continue;
        }
        cur += ch;
      }
      return out.map((a) => a.trim()).filter((a) => a !== '');
    };

    /* ── THE TWO WRITERS THEMSELVES ─────────────────────────────────────── */
    const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
    {
      const start = client.indexOf('export async function setCampaignRepeat(');
      const next = client.indexOf('\nexport ', start + 10);
      const fn = bare(client.slice(start, next > start ? next : undefined));
      is(fn.length > 300, 'setCampaignRepeat could not be isolated — every check in this block would be vacuous');
      is(
        /repeatColumns\(repeat,\s*floorHours\)/.test(fn),
        'setCampaignRepeat must write repeatColumns(repeat, floorHours): repeatColumns clamps UP to its floor, so writing without one raises a two-hour window back to twelve on its way to the database — "שיניתי לפחות מ-12 שעות ועדין לא נותן לפרסם" in its purest form',
      );
      is(!/repeatColumns\(repeat\)/.test(fn), 'and must not have a second, floorless write left beside it');
      is(/floorHours: number = MIN_REPEAT_HOURS/.test(fn), 'and the floor is a defaulted parameter, so a caller with no settings row behaves exactly as it always has');
    }
    {
      const save = bare(client.slice(client.indexOf('export async function saveCampaignRounds'), client.indexOf('export async function setCampaignRepeat(')));
      is(save.length > 400, 'saveCampaignRounds could not be isolated — every check in this block would be vacuous');
      is(
        /readRepeat\(campaign,\s*floorHours\)/.test(save),
        "saveCampaignRounds must read readRepeat(campaign, floorHours): readRepeat clamps the stored window UP to the floor it is given, so on the default it judges a two-hour window as twelve and lowers nothing the owner needs",
      );
      is(!/readRepeat\(campaign\)/.test(save), 'and must not read it on the default floor anywhere in that body');
    }

    /* ── AND EVERY CALL SITE, SCANNED ───────────────────────────────────── */
    /*
     * A SCAN, NOT A LIST OF LINES. The floor was hard-coded in eleven places
     * at once; a guard naming the ones that were fixed would say nothing about
     * the twelfth somebody adds next week. So every .ts/.tsx under src/ is
     * walked and every call is counted — a new screen that forgets the floor
     * fails this without anybody remembering to come back here.
     */
    const SRC = new URL('../../src/', import.meta.url);
    const srcFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f));
    is(srcFiles.length > 20, `only ${srcFiles.length} source files were found under src/ — the scan below would be vacuous`);
    /* Floors, not exact counts: a screen may legitimately stop calling one of
       these, and lowering a number here is a deliberate act. */
    for (const [name, atLeast] of [['setCampaignRepeat', 5], ['saveCampaignRounds', 2]] as [string, number][]) {
      let sites = 0;
      for (const rel of srcFiles) {
        const text = bare(readFileSync(new URL(rel, SRC), 'utf8'));
        const re = new RegExp(`(?<![\\w$.])${name}\\s*\\(`, 'g');
        for (let m = re.exec(text); m; m = re.exec(text)) {
          if (/function\s+$/.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
          sites += 1;
          const args = argsAt(text, m.index + m[0].length - 1);
          is(
            args.length >= 4,
            `${rel}: ${name}(${args.join(', ')}) passes ${args.length} arguments and not four — without the account's floor this write clamps his window back up to ${MIN_REPEAT_HOURS}`,
          );
        }
      }
      is(sites >= atLeast, `only ${sites} call sites of ${name}( were found in src/ (expected at least ${atLeast}) — the per-site check above was vacuous`);
    }

    /* ── THE LIST SCREEN, WHICH ALREADY HAD THE NUMBER AND THREW IT AWAY ── */
    {
      const listSrc = bare(readFileSync(new URL('../../src/app/social/campaigns/page.tsx', import.meta.url), 'utf8'));
      const loadStart = listSrc.indexOf('const load = useCallback');
      const loadEnd = listSrc.indexOf('}, []);', loadStart);
      is(loadStart > 0 && loadEnd > loadStart, 'load() could not be isolated in the campaigns screen — the check below would be vacuous');
      is(
        /setFloorHours\(repeatFloorFrom\(lim\)\)/.test(listSrc.slice(loadStart, loadEnd)),
        "the campaigns screen's load() already read getLimits() and threw the repeat floor away — it must keep it, or this list goes on judging his rounds against twelve while the dashboard judges them against two",
      );
      is(
        /floorHours=\{floorHours\}/.test(listSrc),
        'and must hand that floor to the campaign card, or the same campaign reads one way on the dashboard and another in the list',
      );
      is(
        /useState<number>\(MIN_REPEAT_HOURS\)/.test(listSrc),
        'and until the first load answers it holds MIN_REPEAT_HOURS — a screen that does not yet know the account’s number must not act as though the protection were lower than it is',
      );
    }

    /* ── THE SENTENCE, AND THE BUTTON THAT NOW ANSWERS IT ───────────────── */
    {
      const panel = bare(readFileSync(new URL('../../src/components/social/CampaignSchedulePanel.tsx', import.meta.url), 'utf8'));
      const from = panel.indexOf("verdict.reason === 'closer-than-the-floor'");
      const to = panel.indexOf("verdict.reason === 'repeat-off'", from);
      is(from > 0 && to > from, 'the closer-than-the-floor sentence could not be isolated in the panel — the checks below would be vacuous');
      const sentence = panel.slice(from, to);
      is(
        /בפחות מ-\{floorHours\} שעות/.test(sentence),
        'the sentence must name the floor it actually judged against — printing the constant told him the system refuses under twelve hours on the very screen that had just measured him against two',
      );
      is(!/MIN_REPEAT_HOURS/.test(sentence), 'and the hard-coded constant must be gone from that sentence, not merely joined by the prop');
      /* The number named and the number written come from one call. */
      is(/repeatFitFor\(verdict, floorHours\)/.test(panel), 'the card must ask repeatFitFor() for the window it offers, against the account floor');
      is(
        /onRepeatChange\(\{ \.\.\.repeat, minHours: repeatFit \}\)/.test(panel),
        'and the button must write the very number it printed — a button labelled with one window that writes another is worse than the sentence it replaced',
      );
      /*
       * AND THE TRIPWIRE FOR THE WAY THESE CHECKS GET DEFEATED. Two guards in
       * this suite once passed while the thing they named was gone, because
       * `{false && …}` leaves every string in the file. So the warning block
       * is isolated and a render condition hard-wired to false is refused
       * inside it — the one mutation a text guard cannot otherwise see. Scoped
       * to that block rather than the file, because `false &&` elsewhere in a
       * component is somebody else's business.
       *
       * WHAT THIS DOES NOT PROVE is that the button renders, is on screen and
       * is reachable at 360px. That is measured, in the browser suite. This is
       * a fence, not a measurement.
       */
      const blockFrom = panel.indexOf('verdict && !verdict.ok && (');
      const blockTo = panel.indexOf('</button>', panel.indexOf('minHours: repeatFit'));
      is(blockFrom > 0 && blockTo > blockFrom, 'the warning block could not be isolated in the panel — the two checks below would be vacuous');
      const block = panel.slice(blockFrom, blockTo);
      is(
        /repeatFit !== null && repeat && onRepeatChange && \(/.test(block),
        'the button must be drawn exactly when pressing it would change the answer — and a read-only caller, with no onRepeatChange, keeps the sentence that names the number instead',
      );
      is(
        !/\bfalse\s*&&/.test(block),
        'a render condition hard-wired to false is inside the warning block — that is exactly how a guard over raw source passes while the feature it names is deleted',
      );
    }
  }
}
console.log(`rounds OK — ${checks} assertions over the list, the clock, the shipped slot engine and the one question the card must answer`);
