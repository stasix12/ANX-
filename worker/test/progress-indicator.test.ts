/**
 * NOTHING IN THIS PRODUCT MAY LOOK FROZEN WHILE IT IS WORKING.
 *
 * "שזה מחפש / טוען / מפרסם זה נראה כאילו זה נתקע. אני תמיד רוצה שיהיה איזה
 *  שהוא אינדיקטור שאני ידע את ההתקדמות שלו ולא שהוא נתקע."
 *
 * Three places, one rule, and the rule has a second half that matters as much
 * as the first: EVERY NUMBER ON SCREEN HAS TO BE ONE THE SYSTEM REALLY KNOWS.
 * A bar that fills on a timer, or a percentage of a publication, would make
 * the screen look alive by making it lie — and a wrong number is worse than a
 * spinner, because the owner acts on it.
 *
 * So what is added is only ever elapsed time and the stage the worker itself
 * reported:
 *
 *   · Loading()           — how long this screen has been waiting (it owns
 *                           its own mount instant, and nothing else).
 *   · a publishing row    — the stage from `step`, aged by `step_at`.
 *   · the dashboard card  — the same, per row in flight (measured for real in
 *                           publishing-scene.test.ts, which renders it).
 *
 * The arithmetic is run here; the wiring is read.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stageElapsed } from '../../src/components/social/PublicationItem';
import { LAUNCH_PENDING_MS, launchPending, neverLaunched } from '../../src/lib/social/campaign';
import type { QueueRow } from '../../src/lib/social/client';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-29T18:00:00.000Z');
const ago = (secs: number) => new Date(NOW - secs * 1000).toISOString();
const row = (o: Partial<QueueRow>): QueueRow => ({ id: 'q', status: 'publishing', step: 'uploading_media', ...o } as QueueRow);

/* ───────────────── 1. the stage counter: real, or silent ───────────────── */
{
  eq(stageElapsed(row({ step_at: ago(12) }), NOW), ' · 12 שניות', 'a publication twelve seconds into a stage must say so');
  eq(stageElapsed(row({ step_at: ago(1) }), NOW), ' · שנייה אחת', 'and Hebrew counts one properly');
  eq(stageElapsed(row({ step_at: ago(2) }), NOW), ' · שתי שניות', 'and two properly — the dual is not decoration');
  eq(stageElapsed(row({ step_at: ago(60) }), NOW), ' · דקה', 'a minute reads as a minute, not as 60 שניות');
  eq(stageElapsed(row({ step_at: ago(125) }), NOW), ' · שתי דקות', 'and two minutes as the dual');
  eq(stageElapsed(row({ step_at: ago(600) }), NOW), ' · 10 דקות', 'a long upload still counts');

  /*
   * SILENT RATHER THAN WRONG. Every one of these is a case where the honest
   * answer is nothing at all, and printing a number would be the screen
   * asserting something it does not know.
   */
  eq(stageElapsed(row({ step_at: ago(12) }), undefined), '', 'a host that does not re-read the row must print no counter at all — a number climbing on a frozen row says the publication is alive when the screen has no idea');
  eq(stageElapsed(row({ step_at: null as never }), NOW), '', 'a row with no stage stamp has nothing to count from');
  eq(stageElapsed(row({ step_at: ago(-30) }), NOW), '', "a PC clock ahead of the phone's must not print a negative age");
  eq(stageElapsed(row({ step_at: ago(0) }), NOW), '', 'nor a zero');
  eq(stageElapsed(row({ step_at: ago(3600) }), NOW), '', 'and past an hour there is nothing honest left to say — that clears the longest upload the composer allows');
  eq(stageElapsed(row({ step_at: 'not a date' }), NOW), '', 'an unparseable stamp is not a number');
}

/* ─────────────── 2. the shared spinner counts its own wait ─────────────── */
{
  const ui = src('../../src/components/social/ui.tsx');
  const loading = ui.slice(ui.indexOf('export function Loading()'), ui.indexOf('export function Loading()') + 1600);
  is(loading.length > 300, 'Loading is found');
  is(/role="status"/.test(loading), 'the shared spinner is silent to a screen reader again — SpinnerIcon is aria-hidden, so without this a loading screen announces nothing');
  is(/waited >= 4000/.test(loading), 'the four-second threshold is gone — a counter on every instant tap is noise');
  is(/setInterval\(/.test(loading) && /visibilityState === 'hidden'/.test(loading), 'the counter must tick once a second and must not re-render a backgrounded tab');
  is(/clearInterval/.test(loading), 'and must clear its interval, or every screen change leaks a timer');

  const waiting = ui.slice(ui.indexOf('function waitingHe'), ui.indexOf('export function Loading()'));
  is(/ממתין/.test(waiting) && !/לפני/.test(waiting), 'the wait is present tense: "לפני 12 שניות" under a live spinner reads as a stamp on something that already finished');
  is(/ממתין יותר מדקה/.test(waiting), 'past a minute it says so rather than counting into a ladder nobody can see');

  /* AND NO INVENTED PROGRESS, anywhere in the component. */
  is(!/%/.test(loading), 'a percentage of a screen load is a number this component cannot know');
  is(!/ProgressBar|width:/.test(loading), 'and a bar that fills on a timer is the same lie with a shape');
}

/* ──────────────── 3. the counter is opt-in, and opted into once ────────── */
{
  const item = src('../../src/components/social/PublicationItem.tsx');
  is(/live = false,/.test(item), 'the row counter must default OFF — a list that reads once may not grow a clock');
  is(
    /const ticking = live && row\.status === 'publishing' && Boolean\(row\.step_at\);/.test(item),
    'and must tick only on a row that is actually publishing, with a stamp to count from',
  );
  is(/statusLine\(row, projectedAt, now\)/.test(item), 'the component no longer hands its clock to the status line');

  const sections = src('../../src/components/social/QueueSections.tsx');
  is(/live=\{pulse\}/.test(sections), 'the queue list no longer opts its live group in');
  is(
    /items=\{now\}[\s\S]{0,200}pulse\s*\/>/.test(sections),
    'and `pulse` must still mean the "מפרסם עכשיו" group — that is the seam the counter rides on',
  );

  /* The two screens that read once must NOT be opted in. */
  for (const [file, what] of [
    ['../../src/app/social/history/page.tsx', 'the history screen'],
    ['../../src/app/social/groups/[id]/page.tsx', "a group's own page"],
  ] as const) {
    is(!/live=\{?true/.test(src(file)), `${what} reads its rows once — a counter there would be the screen asserting a publication is alive`);
  }
}

/* ───────────── 4. the dashboard card is handed the rows at all ─────────── */
{
  const page = src('../../src/app/social/page.tsx');
  is(
    /listQueue\(\{ status: IN_FLIGHT_STATUSES, limit: 3, order: 'asc' \}\)/.test(page),
    'the dashboard no longer reads the rows a worker is holding — it knew only the count, which is why the card froze between stages',
  );
  is(/inFlightRows=\{data\.inFlightRows\}/.test(page), 'and no longer hands them to the card');

  const hero = src('../../src/components/social/LiveCampaignHero.tsx');
  is(/useTick\(\(Boolean\(nextAt\) \|\| inFlightRows\.length > 0\) && !paused\)/.test(hero), 'the card must keep a beat while something is in flight, or the counter it draws never moves');
  /*
   * RE-POINTED ONTO THE CARD THAT SAYS IT NOW. The hero used to print one
   * line per held row — group, stage, age — and this pinned that it did so
   * only while something was really publishing. The ANX Live Flow reference
   * says the same thing in a card of its own, with the stage under the group
   * name and the stage's own position as a bar, and the gate is the same
   * gate: a row the engine is not on is not drawn as going out.
   */
  is(
    /const working = sceneMode === 'preparing' \|\| sceneMode === 'sending';/.test(hero),
    'the card draws "what is going out" only while the engine is really on a row',
  );
  is(
    /const live = working \? \(inFlightRows\[0\] \?\? null\) : null;/.test(hero),
    'and the row it draws is one a worker is holding — a dead worker holds rows too, which is what the gate is for',
  );
  /*
   * THE NAME MAY BE CUT; THE STAGE MAY NOT. A group's name is data and can be
   * any length — the owner's longest is a 48-character Russian title — but
   * the stage is the whole reason the line exists, and a card that truncated
   * to "מעלה מד…" would be the frozen card this file was written for.
   */
  const flowCss = src('../../src/app/globals.css');
  const nameRule = flowCss.slice(flowCss.indexOf('.anxf-now-name span'), flowCss.indexOf('.anxf-now-step'));
  const stepRule = flowCss.slice(flowCss.indexOf('.anxf-now-step'), flowCss.indexOf('.anxf-now-cover'));
  is(/text-overflow:\s*ellipsis/.test(nameRule), 'the group name is allowed to be cut');
  is(!/text-overflow|white-space:\s*nowrap/.test(stepRule), 'and the stage beside it is not');
}

/* ───────── 5. a launch that has not become rows yet, and says so ───────── */
{
  /*
   * "אני מפעיל קמפיין מהספריה לתזמון מיידי, ולמעלה לוקח לו זמן איפה שרשום
   *  ממתינים בתור וזה נראה כמו באג."
   *
   * Sending writes an ACTIVE schedule row; the rows themselves are written by
   * the planner, which for groups is the program on the PC running on its own
   * cadence. For the whole of that gap the card said "הסבב עוד לא הושק.
   * הוסיפו פוסט, בחרו קבוצות ושלחו" — the one thing he had just done.
   */
  const NOW = Date.parse('2026-11-01T15:12:00.000Z');
  const ago = (secs: number) => new Date(NOW - secs * 1000).toISOString();
  const empty = { total: 0, published: 0, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 0 };
  const st = (o: Record<string, unknown>) =>
    ({ state: 'not_started', progress: empty, startedAt: null, everPublished: 0, armedAt: null, ...o }) as never;

  is(!neverLaunched(st({ armedAt: ago(40) })), 'a round with an armed schedule has been launched — the card may not tell him to launch it');
  is(neverLaunched(st({})), 'and a round that really has none is still told so');

  eq(launchPending(st({ armedAt: ago(40) }), NOW), ago(40), 'a launch forty seconds old with nothing in the queue is still on its way');
  eq(launchPending(st({}), NOW), null, 'a round that was never launched is not waiting for rows');
  eq(launchPending(st({ armedAt: ago(40), progress: { ...empty, total: 5, scheduled: 5 } }), NOW), null, 'a round whose rows have arrived is not waiting for them');
  eq(launchPending(st({ armedAt: ago(40), everPublished: 12 }), NOW), null, 'nor one that has published before — that schedule was armed long ago');
  /*
   * THE BOUND IS WHAT STOPS A REPEATING ROUND WEARING THIS EVERY SATURDAY: an
   * armed schedule with no rows today is ordinary on a day it does not
   * publish, and without a limit the line would be permanent.
   */
  eq(launchPending(st({ armedAt: ago(16 * 60) }), NOW), null, 'past the bound the card goes back to what it said before');
  is(LAUNCH_PENDING_MS === 15 * 60_000, 'and the bound is fifteen minutes — far longer than the planner takes, far shorter than a day');
  eq(launchPending(st({ armedAt: new Date(NOW + 60_000).toISOString() }), NOW), null, "a stamp in the future is a clock that disagrees, not a launch");

  /* --- and the block that draws it --- */
  const next = src('../../src/components/social/NextPublication.tsx');
  is(
    next.indexOf('הסבב הושק') < next.indexOf('הסבב עוד לא הושק'),
    'the launched-and-building branch must come BEFORE the never-launched one — they answer the same three readout kinds with opposite facts',
  );
  is(/elapsedHe\(secs\)/.test(next), 'the line must count from the launch — a frozen sentence is the thing he reported');
  is(/const slow = secs >= 120;/.test(next), 'and past two minutes it must stop saying "any moment now" and name what would explain the delay');
  is(/הסבב הושק — התור עדיין לא נבנה/.test(next), 'with the honest wording for that case');
  is(!/%/.test(next.slice(next.indexOf('function Words'))), 'and no percentage anywhere — nothing here knows how far along the planner is');
  /*
   * RE-POINTED 07.11.2026 AND AGAIN 08.11.2026, SAME RULE. The tick's
   * condition briefly gained a fourth term when מצב פרסום חכם taught this
   * block to count down an automatic rest; the rest was removed and the term
   * went with it. Asserted term by term rather than as one regex, which is
   * stronger: a future edit can add a reason to tick without silently
   * dropping one of these three.
   */
  const tickCall = next.slice(next.indexOf('const now = useTick('), next.indexOf('const left = at ?'));
  is(/at !== null/.test(tickCall), 'the tick must run while something is scheduled');
  is(/Boolean\(armedAt\)/.test(tickCall), 'the tick must run while a launch is pending, or the counter freezes at the second it first rendered');
  is(/Boolean\(frozenUntil\)/.test(tickCall), 'and while a Meta freeze stands, which may be the only moving thing on the card');
  is(!/restUntil/.test(tickCall), 'and NOT for an automatic rest — there is no longer one to count down');

  const board = src('../../src/components/social/CampaignScheduleBoard.tsx');
  is(/armedAt=\{armedAt\}/.test(board), 'the board no longer carries the launch instant through to the block');
  const hero = src('../../src/components/social/LiveCampaignHero.tsx');
  is(/armedAt=\{launchPending\(state, Date\.now\(\)\)\}/.test(hero), 'and the card no longer asks campaign.ts for the decision');

  /* The fact itself has to be read, or every state carries null for ever. */
  const client = src('../../src/lib/social/client.ts');
  is(/\.from\('social_schedules'\)[\s\S]{0,200}\.eq\('active', true\)/.test(client), 'campaignStates no longer reads which rounds are armed');
  is(/armedAt: armedAt\.get\(id\) \?\? null/.test(client), 'and no longer attaches it to the state');
}

console.log(`progress-indicator OK — ${checks} assertions`);
