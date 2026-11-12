import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  JOIN_ENDING,
  JOIN_STEPS,
  joinCardView,
  joinPercent,
  joinProgressUsable,
  joinRunLine,
  joinRunPercent,
  joinStepStates,
  type JoinProgress,
} from '../../src/lib/social/join-run';

/**
 * לוג ההצטרפות — THE PART THAT DECIDES WHAT THE SCREEN CLAIMS.
 *
 * "אין להציג הצלחה לפני קבלת אישור אמיתי · הלוג חייב להתעדכן מנתוני המערכת
 *  בפועל, ללא נתונים מדומים · אין להמציא אחוזים לפי זמן שעבר."
 *
 * Those three sentences are properties of this module, not of the component,
 * which is why the component computes nothing. Everything below drives the
 * real functions; worker/test/discovery-row.test.ts then measures what they
 * produce, painted, in a browser at three widths.
 *
 *   npx tsx worker/test/join-log.test.ts
 */
let checks = 0;
function is(cond: unknown, what: string): void {
  checks += 1;
  assert.ok(cond, what);
}
function eq(a: unknown, b: unknown, what: string): void {
  checks += 1;
  assert.deepEqual(a, b, what);
}

const base: JoinProgress = {
  v: 1,
  total: 6,
  done: 0,
  joined: 0,
  pending: 0,
  index: 0,
  url: 'https://www.facebook.com/groups/g1',
  stage: null,
  clicked: false,
  outcome: '',
  gapUntil: null,
  at: '2026-11-12T20:55:00Z',
  startedAt: '2026-11-12T20:40:00Z',
};

/* ───────────────────────── the four steps ─────────────────────────────── */
{
  eq(JOIN_STEPS.length, 4, 'four steps, as the brief enumerates them');
  eq(
    [...JOIN_STEPS],
    ['מאתר את הקבוצה', 'שולח בקשת הצטרפות', 'ממתין לתשובה', 'סיום'],
    'and they are his four, in his order',
  );

  eq(joinStepStates(null, false), ['todo', 'todo', 'todo', 'todo'], 'before a group is opened, nothing has happened');
  eq(joinStepStates('locating', false), ['current', 'todo', 'todo', 'todo'], 'opening the group is the first step');
  eq(joinStepStates('sent', true), ['done', 'current', 'todo', 'todo'], 'the request is in');
  eq(joinStepStates('waiting', true), ['done', 'done', 'current', 'todo'], 'and the answer is being waited for');
  eq(joinStepStates('done', true), ['done', 'done', 'done', 'current'], 'a group we really pressed passed all four');

  /*
   * ─── THE ONE THAT MATTERS: A GROUP WE NEVER PRESSED ──────────────────
   *
   * Measured on this owner's own history — 46 'no-button' and 14 'already'
   * of 88 outcomes — two thirds of real groups return from joinOneGroup
   * BEFORE the button is pressed. Drawing those two steps as done would be
   * the screen narrating an action the machine did not take, which is the
   * whole of "ללא נתונים מדומים".
   */
  eq(
    joinStepStates('done', false),
    ['done', 'skipped', 'skipped', 'current'],
    'A GROUP WITH NO JOIN BUTTON NEVER SENT A REQUEST AND NEVER WAITED FOR AN ANSWER — those two steps are passed over, not ticked',
  );
}

/* ─────────────────── the bar, and where it comes from ─────────────────── */
{
  eq(joinPercent(null), 0, 'nothing started is nothing done');
  eq(joinPercent('locating'), 25, 'one of four');
  eq(joinPercent('sent'), 50, 'two');
  eq(joinPercent('waiting'), 75, 'three — the state the reference draws');
  eq(joinPercent('done'), 100, 'and a finished group is finished, however few steps it needed');

  /*
   * THE BAR IS A FUNCTION OF THE STEP AND OF NOTHING ELSE. Same blob, two
   * instants an hour apart, same answer: there is no clock in this module,
   * which is "אין להמציא אחוזים לפי זמן שעבר" expressed as a test.
   */
  const early = joinCardView({ ...base, stage: 'waiting', clicked: true, at: '2026-11-12T20:00:00Z' });
  const late = joinCardView({ ...base, stage: 'waiting', clicked: true, at: '2026-11-12T21:00:00Z' });
  eq(early.percent, late.percent, 'the bar does not move because time passed');
  eq(early.steps, late.steps, 'and neither do the steps');
}

/* ─────────────────────────── "N מתוך M טופלו" ─────────────────────────── */
{
  eq(joinRunLine(2, 6), '2 מתוך 6 טופלו', 'the sentence the brief asks for, verbatim');
  eq(joinRunPercent(2, 6), 33, 'and the run bar is groups handled over groups asked for');
  eq(joinRunPercent(6, 6), 100, 'all of them is all of it');

  /*
   * NO DENOMINATOR, NO BAR — and this case is real, not defensive. The
   * worker empties a command's payload in the same statement that claims the
   * row, so the list of addresses a run was given is not in the database at
   * all: 0 of 222 command rows in production kept one. When the browser that
   * sent them has also forgotten, the honest answer is the count alone.
   */
  eq(joinRunLine(2, null), '2 טופלו', 'without a denominator it reports the count and claims no fraction');
  eq(joinRunPercent(2, null), null, 'and draws no bar at all rather than an invented one');
  eq(joinRunPercent(2, 0), null, 'a zero denominator is not a denominator');
}

/* ──────────────────── how a group is allowed to end ───────────────────── */
{
  eq(Object.keys(JOIN_ENDING).length, 7, 'every outcome joinOneGroup can return has a sentence');
  for (const [outcome, ending] of Object.entries(JOIN_ENDING)) {
    is(ending.said.length > 0, `${outcome} says something a person can read`);
    is(['good', 'warn', 'bad'].includes(ending.tone), `${outcome} has a real tone`);
  }

  /*
   * ─── GREEN MEANS A MEMBERSHIP, AND NOTHING ELSE MEANS GREEN ──────────
   *
   * "אין להציג הצלחה לפני קבלת אישור אמיתי. יש להבחין בין הצטרפות שאושרה
   *  לבין בקשה שנשלחה וממתינה לאישור."
   *
   * `pending` is a request sitting in front of a human admin the worker will
   * never see answer it. recordJoinOutcome raises the group to 'member' for
   * joined and already ONLY, and this is the same line drawn in colour.
   */
  eq(
    Object.entries(JOIN_ENDING).filter(([, e]) => e.tone === 'good').map(([o]) => o).sort(),
    ['already', 'joined'],
    'ONLY A REAL MEMBERSHIP IS GREEN — a request waiting for an admin is not one',
  );
  eq(JOIN_ENDING.pending.tone, 'warn', 'a sent request is amber, and says it is waiting for an admin');
  is(JOIN_ENDING.pending.said.includes('ממתינה לאישור'), 'and says so in words, not only in colour');
}

/* ───────────────────── the card the screen is handed ──────────────────── */
{
  const live = joinCardView({ ...base, stage: 'waiting', clicked: true });
  eq(live.percent, 75, 'the live card is three quarters through');
  eq(live.tone, null, 'and has no ending colour yet');
  eq(live.said, '', 'nor an ending sentence — nothing has ended');

  const ended = joinCardView({ ...base, stage: 'done', clicked: true, outcome: 'joined' });
  eq(ended.tone, 'good', 'a group we joined ends green');
  eq(ended.said, 'הצטרפנו לקבוצה', 'and says so');

  const refused = joinCardView({ ...base, stage: 'done', clicked: false, outcome: 'no-button' });
  eq(refused.steps, ['done', 'skipped', 'skipped', 'current'], 'and a group with no button shows what really happened to it');
  eq(refused.tone, 'bad', 'ending red');

  /* A blob with an outcome but no stage cannot happen, and if it ever does
     it must draw nothing rather than a half-state. */
  eq(joinCardView({ ...base, stage: null, outcome: 'joined' }).tone, null, 'an outcome without a stage colours nothing');
}

/* ──────────────── what is too old or too strange to draw ──────────────── */
{
  const now = Date.parse('2026-11-12T21:00:00Z');
  is(joinProgressUsable({ ...base, at: '2026-11-12T20:55:00Z' }, now), 'five minutes old is live');
  is(!joinProgressUsable(null, now), 'nothing is not a run');
  is(!joinProgressUsable({ ...base, v: 2, at: '2026-11-12T20:55:00Z' }, now), 'a shape this reader does not know draws nothing');
  is(!joinProgressUsable({ ...base, at: '2026-11-12T19:00:00Z' }, now), 'two hours stale is not a live run');
  is(!joinProgressUsable({ ...base, at: 'not a date' }, now), 'and an unreadable clock is not a live run either');

  /*
   * WHY STALENESS IS CHECKED AT ALL: `status === 'running'` is not liveness.
   * Two login commands in this production database have been 'running' since
   * September and nothing in the product sweeps them. A blob left behind by
   * a run that died must not draw a stepper for ever.
   */
}

/* ─────────── and the component must not do any of this itself ─────────── */
{
  const card = readFileSync(new URL('../../src/components/social/Discovery.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../src/app/social/discover/page.tsx', import.meta.url), 'utf8');

  /*
   * The component is handed a decided view and draws it. If it started
   * deciding — a `stage === 'sent' ? …` of its own — then what this file
   * proves and what the screen shows could drift apart, which is exactly how
   * a screen ends up contradicting the data behind it.
   */
  is(!/stage === '/.test(card), 'Discovery.tsx does not decide the stepper for itself — joinCardView does');
  is(/JOIN_STEPS\.map/.test(card), 'it draws the four steps from the one list of them');
  is(/run\.steps\[i\]/.test(card), 'and the state of each from the view it was handed');

  /*
   * THE PERCENTAGE ON SCREEN AND THE WIDTH OF THE BAR ARE ONE NUMBER.
   * A bar that says 75% and draws 60% is the kind of thing nobody reports
   * and everybody distrusts.
   */
  is(/\{run\.percent\}%/.test(card), 'the number is the view\'s percent');
  is(/inlineSize: `\$\{run\.percent\}%`/.test(card), 'and so is the width of the fill — one number, not two');

  /* The run strip counts the OUTCOMES, which are rows the worker wrote, not
     anything the blob claims about itself. */
  is(/joinRunLine\(Object\.keys\(joinRun\.byUrl\)\.length/.test(page), 'the run line counts groups that really finished');
  is(/joinRunPercent\(Object\.keys\(joinRun\.byUrl\)\.length/.test(page), 'and so does the run bar');

  /*
   * ─── THE COLUMN THAT MUST NOT JOIN COMMAND_COLUMNS ───────────────────
   *
   * Eight consumers share that constant — login, the profile switcher,
   * discovery, the scan, leave, and both recent-command lists that the PC
   * status card renders on every /social screen. Naming an unknown column
   * there would make every one of those selects fail on a database that has
   * not run the migration: commands would run to their full timeout, and the
   * status card would throw on every screen. One unrun migration would take
   * the product out.
   */
  const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  const columns = client.match(/const COMMAND_COLUMNS = '([^']*)'/);
  is(columns, 'COMMAND_COLUMNS is still a named list');
  is(!columns?.[1].includes('progress'), 'and `progress` is NOT in it — an unrun migration must not break every other command');
  is(/joinProgressColumnMissing/.test(client), 'the join reader degrades by itself when the column is absent');
  is(/event', 'group_join'/.test(client) || /eq\('event', 'group_join'\)/.test(client), 'and the outcomes come from the rows the worker already writes');
}

/* ─────────── the worker reports, and reporting cannot cost a run ──────── */
{
  const join = readFileSync(new URL('../facebook/join.ts', import.meta.url), 'utf8');

  /*
   * SYNCHRONOUS, AND THE SIGNATURE IS THE GUARANTEE. A reporter that
   * returned a promise could be awaited by accident, and an await here would
   * sit inside the three seconds Facebook is given to answer the click — a
   * longer wait is a DIFFERENT classification, not a later one: a page that
   * has not settled reads `pending`, the same page a moment later reads
   * `joined`.
   */
  is(/report\?: \(stage: JoinStage\) => void/.test(join), 'the reporter returns void, so it physically cannot be awaited');
  is(/onStage\?: \(index: number, url: string, stage: JoinStage\) => void/.test(join), 'and so does the hook that carries it');
  is(!/await report/.test(join) && !/await hooks\.onStage/.test(join), 'and nothing awaits a report');
  is(/catch \{\s*\/\* A report is never worth a run\. \*\//.test(join), 'a throwing reporter cannot end a run');

  /* THE ORDER THAT MAKES 'skipped' TRUE. Every return above the click is a
     group we never pressed, so 'sent' must be reported after it. */
  const clickAt = join.indexOf('await join.click()');
  const sentAt = join.indexOf("stage('sent')");
  const waitAt = join.indexOf("stage('waiting')");
  const timeoutAt = join.indexOf('await page.waitForTimeout(3_000)');
  is(clickAt > 0 && sentAt > clickAt, "'sent' is reported AFTER the click, so a group we never pressed never claims to have sent anything");
  is(waitAt > sentAt && timeoutAt > waitAt, "and 'waiting' immediately before the wait it describes");

  /* The pacing, the cap and the stop conditions are the account's safety and
     are not this feature's business. */
  is(/GAP_MIN_MS = 60_000/.test(join), 'the gap between groups is untouched');
  is(/JOIN_RUN_CAP = 15/.test(join), 'and so is the run cap');

  const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  is(/makeProgressReporter/.test(worker), 'the worker has a reporter');
  is(/commands_progress_missing/.test(worker), 'which says once, in Hebrew, when the column is not there');
  is(/progress\.gap\(msLeft\)/.test(worker), 'the pause between groups is reported as a pause');
  is(!/stage: 'waiting'.*gap/s.test(worker.slice(worker.indexOf('onWait'), worker.indexOf('onWait') + 400)), 'and never as a stage');
}

console.log(`join log OK — ${checks} assertions`);
