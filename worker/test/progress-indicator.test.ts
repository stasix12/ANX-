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
  is(/\{publishing && inFlightRows\.length > 0 && \(/.test(hero), 'and must draw the live lines only while something really is publishing');
  is(/data-must-fit/.test(hero.slice(hero.indexOf('inFlightRows.map'))), 'the stage and its counter must be marked as text that may never be cut');
}

console.log(`progress-indicator OK — ${checks} assertions`);
