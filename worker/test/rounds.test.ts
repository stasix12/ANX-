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
  eq(fixed.neededHours, 12, 'and twelve is the gap between HIS two rounds, which is what the arithmetic answers');
  /*
   * MIN_REPEAT_HOURS IS NOW ZERO, and this line is where that is recorded.
   *
   * It was 12 — the product's own judgement that one post should not reach
   * one group twice in a working day — and it was the floor every default in
   * campaign-schedule.ts was built from. The owner asked four times for it to
   * go ("תוריד לגמרי את כל החסימות הקיימות כולל ה-20 שעות הכל אני לוקח
   * אחריות על המשתמש שלי") and it is his account.
   *
   * Nothing above this line changed: the arithmetic that compares a round
   * layout against a window a campaign actually SET is untouched, and still
   * answers 12 for two rounds twelve hours apart. What is gone is the floor
   * underneath, so a campaign that sets nothing is not given one.
   */
  eq(MIN_REPEAT_HOURS, 0, 'there is no floor under a campaign that sets no window — the owner removed it, in writing, four times');

  /*
   * THE REPEAT OFF IS THE DEFAULT, and with it a second round is not slowed
   * down — it is refused for ever. A different sentence, so the card can offer
   * the right fix rather than a number.
   */
  const off = roundsVsRepeat(['03:30', '15:30'], repeat(false));
  is(!off.ok, 'with the repeat off, rules.ts refuses a second publication to a group for ever — a second round is decorative');
  eq(off.reason, 'repeat-off', 'and the card must say THAT, not "lower the window"');

  /*
   * THERE IS NO FLOOR LEFT TO BE CLOSER THAN.
   *
   * This used to be the case nothing could fix: twelve was a database CHECK
   * and a deliberate refusal to put one advertisement into one group twice
   * in a morning, so two rounds six hours apart were impossible however the
   * repeat was set, and the card said so rather than offering a number the
   * database would reject.
   *
   * With MIN_REPEAT_HOURS at 0 — the owner's decision, taken four times in
   * writing — six hours apart is simply a window that has to come down to
   * six, which IS a setting he can change. So the verdict is the ordinary
   * one and it carries the number.
   */
  const tooClose = roundsVsRepeat(['08:00', '14:00'], repeat(true, 12));
  is(!tooClose.ok, 'six hours apart still does not work while the window is twelve');
  eq(tooClose.reason, 'window-too-long', 'but it is now a window that can be lowered, not a floor that cannot — there is no floor');
  eq(tooClose.neededHours, 6, 'and the card can name the number that fixes it');
  /* And with the repeat OFF, the answer is the switch — there is no longer a
     floor to report ahead of it. 'closer-than-the-floor' is now unreachable
     for any layout, which is what removing the floor means. */
  eq(roundsVsRepeat(['08:00', '14:00'], repeat(false)).reason, 'repeat-off', 'with no floor left, the thing to tell him about is the switch');
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
  /*
   * ─── INVERTED BY THE OWNER, AND THIS IS NOW THE SAFETY PROPERTY ────────
   *
   * "למחוק גם את הסבבים זה מסוכן." סבבים ביום was the one control in this
   * product that multiplied how fast an account posts, and it was removed
   * days after Facebook rate-limited that account.
   *
   * So the claim this block runs is the opposite of the one it was written
   * for: weeklyPlanFor() no longer TAKES rounds, and the plan it hands the
   * engine carries exactly one occasion a day — whatever `schedule_rounds`
   * still holds for that campaign. The column is untouched; it is simply
   * never read. A second hour appearing here again means a campaign can
   * double its own rate with nothing on screen to show it.
   */
  const weekly = weeklyPlanFor(sched('03:30', [0, 1, 2, 3, 4, 5, 6]));
  eq(weekly['1'], ['03:30'], 'the plan handed to the engine carries ONE occasion for a chosen day');

  const plan = { mode: 'weekly' as const, timezone: 'Asia/Jerusalem', run_at: null, weekly, interval_days: null, interval_time: null };
  const from = new Date('2026-11-02T00:00:00+02:00');
  const until = new Date('2026-11-03T00:00:00+02:00');
  const slots = slotsFor(plan, from, until).map((d) => d.toISOString());
  eq(slots.length, 1, 'the shipped slot engine produces exactly ONE occasion in a day — the extra-rounds path is gone, not merely hidden');
  eq(slots[0], new Date('2026-11-02T03:30:00+02:00').toISOString(), 'at the hour the schedule names');

  /*
   * AND A STORED ROUND CANNOT BRING THE SECOND ONE BACK. This is the case
   * that matters for a campaign that HAD rounds before they were removed:
   * the column still holds them, and the plan must come out the same as for
   * a campaign that never had any.
   */
  const hadRounds = { ...plan, weekly: weeklyPlanFor(sched('03:30', [0, 1, 2, 3, 4, 5, 6])) };
  eq(slotsFor(hadRounds, from, until).length, 1, 'a campaign whose row still holds an armed round gets one occasion a day all the same');

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
  /* One hour now rather than two, and the requirement is unchanged: it must
     be the same hour on the local clock either side of the change. The
     drift this guards against is the offset leaking into a wall-clock
     value, which one occasion exposes exactly as well as two did. */
  eq(hours, ['03:30'], 'the occasion either side of the clock change is still at the hour the owner chose — it does not drift by an hour');
  is(across.length >= 3, `three days should carry at least three occasions across the change, got ${across.length}`);
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

/* ───── 8. THE FEATURE IS GONE, AND THESE ARE THE DOORS IT CANNOT COME BACK
            THROUGH ──────────────────────────────────────────────────────── */
/*
 * "למחוק גם את הסבבים זה מסוכן."
 *
 * Sections 8, 9 and 10 used to test the WRITER (saveCampaignRounds), the toast
 * it produced and the card that drove it. All three are deleted: סבבים ביום
 * was the one control in this product that multiplies how fast an account
 * posts, and it was removed days after Facebook rate-limited that account.
 *
 * REPLACED, NOT DROPPED. The requirement inverted, so the guard inverts with
 * it. Everything above this line still runs — the stored shape, the list, the
 * clock arithmetic, the real slot engine — because `schedule_rounds` is still
 * a column with values in it ("אסור למחוק מידע") and the pure functions that
 * read it still exist. What may never come back is a path from that column to
 * a published post, and each of these is one such path nailed shut.
 *
 * Comments are stripped before every negative, so a note explaining the
 * removal cannot satisfy a check that the removal happened.
 */
{
  const bare = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

  const client = bare('../../src/lib/social/client.ts');
  const sched_ = bare('../../src/lib/social/campaign-schedule.ts');
  const panel = bare('../../src/components/social/CampaignSchedulePanel.tsx');
  const board = bare('../../src/components/social/CampaignScheduleBoard.tsx');
  const dash = bare('../../src/app/social/page.tsx');
  const camps = bare('../../src/app/social/campaigns/page.tsx');
  const hero = bare('../../src/components/social/LiveCampaignHero.tsx');
  const card = bare('../../src/components/social/CampaignCard.tsx');

  /* 0 — NOT VACUOUS. Every negative below is satisfied by an unreadable file,
         so each source is proved to have arrived first. */
  for (const [name, src] of [['client', client], ['campaign-schedule', sched_], ['panel', panel], ['board', board],
                             ['dashboard', dash], ['campaigns', camps], ['hero', hero], ['card', card]] as const) {
    is(src.length > 2000, `${name} did not load — ${src.length} chars, and every check over it would pass on emptiness`);
  }

  /* 1 — THE WRITER. Nothing can fill the column any more. */
  is(!/saveCampaignRounds/.test(client), 'the rounds writer is back in client.ts');
  is(!/RoundsColumnMissing/.test(client), 'and so is the migration error that only it could raise');
  for (const [name, src] of [['dashboard', dash], ['campaigns', camps]] as const) {
    is(!/saveCampaignRounds/.test(src), `the ${name} screen is calling the rounds writer again`);
    is(!/roundsColumn\(/.test(src), `the ${name} screen is building the rounds column again`);
  }

  /* 2 — THE PLAN. Even a column full of armed rounds cannot add an hour. */
  is(
    /export function weeklyPlanFor\(schedule: CampaignSchedule\): Record<string, string\[\]>/.test(sched_),
    'weeklyPlanFor takes rounds again — that is the parameter the extra occasions arrived through',
  );
  is(/roundStarts\(schedule, \[\]\)/.test(sched_), 'and it builds the plan from the schedule alone');
  is(!/readRounds\(/.test(client), 'client.ts is reading the stored rounds again');
  is(!/readRounds\(/.test(dash) && !/readRounds\(/.test(camps), 'a screen is reading the stored rounds again');
  is(
    /syncWeeklyHours\(\s*campaignId: string,[\s\S]{0,400}schedule: CampaignSchedule,\s*\): Promise/.test(client),
    'syncWeeklyHours takes a rounds argument again — that is the other door into social_schedules.weekly',
  );

  /* 3 — THE CONTROL. No card, no switch, no prop, on any screen. */
  for (const [name, src] of [['panel', panel], ['board', board], ['hero', hero], ['card', card]] as const) {
    is(!/סבבים ביום/.test(src), `the ${name} draws the rounds control again`);
    is(!/data-rounds-card/.test(src), `the ${name} draws the rounds card again`);
    is(!/onRoundsChange/.test(src), `the ${name} can write rounds again`);
  }
  is(!/rounds=\{/.test(dash) && !/rounds=\{/.test(camps), 'a screen is handing rounds to the panel again');
  is(!/roundsSavedMessage\(/.test(dash) && !/roundsSavedMessage\(/.test(camps), 'a screen is announcing a rounds save again');

  /* 4 — AND THE DATA IS STILL THERE. The guard above must not be satisfied by
         someone having deleted the column instead. "אסור למחוק מידע." */
  is(/schedule_rounds/.test(bare('../../src/lib/social/types.ts')), 'the schedule_rounds column was removed from the model — the values in it are the owner\'s');
  is(/export function readRounds\(/.test(sched_), 'and the reader that can still make sense of them is gone too');
}
console.log(`rounds OK — ${checks} assertions over the list, the clock, the shipped slot engine and the one question the card must answer`);
