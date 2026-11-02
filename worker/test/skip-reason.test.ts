import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * "למה יש הרבה שורות של דולג"
 *
 * Six rows on the dashboard's rail reading nothing but the grey word "דולג".
 * Every one of the fourteen places in this codebase that skips a publication
 * writes a Hebrew sentence saying which rule stopped it — and the card fetched
 * none of them, so the owner reasoned from the only thing the row did show,
 * its hour, and reached a conclusion the engine does not support (that two
 * publications on the same second cancel each other; the spacing rule defers a
 * row and costs it nothing — src/lib/social/rules.ts).
 *
 * This holds the two halves of that fix:
 *   1. the reason reaches the row — proved by RENDERING the real component,
 *      not by grepping for a string, because a column that is not selected
 *      cannot be printed however the JSX reads;
 *   2. the finished rows may not bury the waiting ones on a card that calls
 *      itself "הפרסומים הקרובים".
 *
 *   npx tsx worker/test/skip-reason.test.ts
 */

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(a: T, b: T, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};

/* ─────────────────────────── 1. the read ──────────────────────────────── */

const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');

const selectLine = client.split('\n').find((l) => l.startsWith('const TIMELINE_SELECT =')) ?? '';
ok(selectLine, 'TIMELINE_SELECT is still a single declaration this test can read');
ok(/\bskip_reason\b/.test(selectLine), 'the rail fetches skip_reason — without it the component cannot print a reason whatever its JSX says');

const pickLine = client.split('\n').find((l) => l.startsWith('export type TimelineRow =')) ?? '';
ok(/'skip_reason'/.test(pickLine), "and the row type carries it, so a component reading row.skip_reason is not reading `any`");

/*
 * AND THE SELECT STAYS LEAN. The reason this column was missing in the first
 * place is a documented discipline: QUEUE_SELECT is `*` and carries
 * rendered_text — the whole post body — per row, 500 rows a poll on a metered
 * Israeli mobile plan. One short nullable sentence is affordable; the body is
 * not, and nothing else may ride in behind it.
 */
for (const forbidden of ['rendered_text', 'error', 'meta', 'screenshot_path']) {
  ok(!new RegExp(`\\b${forbidden}\\b`).test(selectLine), `the rail still does not fetch ${forbidden} — it is drawn from a name, a time and a dot`);
}

/* ─────────────────────── 2. what the row actually says ────────────────── */

const html = execFileSync('npx', ['tsx', 'worker/test/render-timeline.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 });
const [busy, quiet, longOne, swept] = html.split('<!--SCENE-->');
ok(busy && quiet && longOne && swept, 'the four scenes rendered');

/* The reasons are on the rows, verbatim. */
ok(busy.includes('הפוסט הזה כבר פורסם ל-&quot;באר שבע ביחד באמת&quot;.'), 'a skipped row prints the rule that stopped it, in full');
ok(busy.includes('הסבב נעצר.'), 'and so does the next one — each row its own reason, not one sentence for the card');

/* A row written before this existed, or by a path that stored nothing, still
   has to say something. The old word is that something. */
ok(/>דולג</.test(busy), 'a skip with no stored reason still reads "דולג" rather than an empty line');

/* The other two outcomes are complete sentences already and are left alone. */
ok(/>פורסם</.test(busy), '"פורסם" is untouched');
ok(!/>פורסם[^<]/.test(busy), 'and nothing was concatenated onto it');

/* The long one is clamped, not printed at full height: this is a rail of
   stops, and the whole text is one tap away in the detail sheet. */
ok(/line-clamp-2/.test(longOne), 'a long reason is clamped to two lines');

/* ──────────────── 3. the finished rows may not bury the queue ─────────── */

const rows = (s: string) => s.split('<li').length - 1;
/*
 * Six finished rows and three waiting ones. Before this, all nine rendered and
 * the box — about six rows tall — opened on nothing but what had already
 * happened, under the heading "הפרסומים הקרובים". That is what the owner
 * photographed and asked about.
 */
eq(rows(busy), 7, 'a busy evening draws four finished stops and all three waiting ones — the queue is on screen');
ok(!busy.includes('היעד &quot;שכונת סיגליות באר שבע&quot; כבוי.'), 'the oldest finished row is the one dropped, not a waiting one');
ok(busy.includes('מיתר כרמית עמר') && busy.includes('רמות באר שבע'), 'every waiting stop survives the cap — the cap is on the finished half alone');

/*
 * AND IT LIFTS WHEN NOTHING IS WAITING. With an empty queue the dashboard
 * retitles the card "מה קרה היום" and the finished rows ARE the card.
 */
eq(rows(quiet), 6, 'with nothing queued, every finished stop is drawn — that card is the day');

/* ───── 3b. one cancel is drawn as one moment, not as an evening ───────── */

/*
 * THE SECOND THING THIS SCREEN DID TO HIM TONIGHT. "אף אחד לא עצר כלום."
 *
 * A whole-queue cancel is ONE UPDATE, and every row it touches keeps the
 * minute it had been planned for. Drawn at those slots, the rail replays the
 * cancel across the evening one row at a time, and it reads as something
 * still happening. The scene has three rows planned 70, 40 and 15 minutes
 * ago and all cancelled one minute ago; they must land on one clock reading.
 */
const clocks = (s: string) => (s.match(/tabular-nums[^>]*>([^<]+)</g) ?? []).map((m) => m.replace(/.*>/, ''));
const sweptClocks = clocks(swept);
eq(sweptClocks.length, 3, 'the three swept rows are drawn');
eq(new Set(sweptClocks).size, 1, 'and all three carry the SAME minute — one cancel, one moment, not a stream across the evening');
ok(sweptClocks.every((c) => c !== '—'), 'with a real instant on each, not a dash');

const timeline = readFileSync(new URL('../../src/components/social/Timeline.tsx', import.meta.url), 'utf8');
ok(/row\.published_at \?\? row\.updated_at \?\? row\.scheduled_at/.test(timeline), 'a finished stop is placed at when it finished, and falls back to its slot only when the database gave neither');
ok(/const DONE_ON_SCREEN = \d+;/.test(timeline), 'the cap is a named constant with the reasoning beside it');
ok(/waiting\.length \? finished\.slice\(-DONE_ON_SCREEN\) : finished/.test(timeline), 'and it applies only while something is still waiting');

console.log(`✓ skip-reason: ${checks} בדיקות עברו`);
