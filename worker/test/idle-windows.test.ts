/*
 * "ככה הוא פותח לי חלון אחרי חלון בלי סיבה ובלי עבודה שהרצתי בתוכנה"
 *
 * The owner filmed their monitor: Chrome window after Chrome window, with no
 * campaign running and nothing queued. This file is the guard over the two
 * defects behind it, because neither is visible in a diff and both look
 * perfectly correct in isolation.
 *
 * ONE — THE HINT NOBODY READ. Three idle chores end a failed attempt with
 * `state.lastCheckAt = 0` and a bare `return`, meaning "the Facebook session
 * looks dead, re-verify it before trusting me". The only code that read
 * lastCheckAt sat behind `if (!due?.length …) { …chores…; return; }` — the
 * branch taken when a publication IS due, which an idle worker never reaches.
 * So an expired login plus an empty queue was: open a window, meet the login
 * wall, give up, write nothing, sleep five seconds, do it again. Forever,
 * with browserState still reading 'connected' and not one line in the feed.
 *
 * TWO — CHORES THAT NEVER RECORD THE ATTEMPT. A chore selects "rows that
 * still need X" and, on the paths where X cannot be worked out, writes
 * nothing at all. The same rows are therefore selected on the next tick, five
 * seconds later, for ever. resolveAddresses was fixed for this long ago with
 * `state.addressTried`; its three siblings never were.
 *
 * These are source-level assertions on purpose. Reproducing the loop needs a
 * live Facebook session that is expired on demand, which is not a thing a
 * test can have; what a test CAN do is refuse to let the two shapes back in.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');

/** The body of a named function, from its declaration to the next one. */
function body(name: string): string {
  const at = src.indexOf(`async function ${name}(`);
  assert.ok(at > -1, `${name} is gone — re-point this test rather than deleting it`);
  const next = src.indexOf('\nasync function ', at + 10);
  return src.slice(at, next === -1 ? src.length : next);
}

/* ---------------------------------- one: the session is asked on both paths */

assert.ok(/async function sessionReady\(/.test(src), 'sessionReady() is the one place the login answer is decided');

const tick = body('tick');
const calls = tick.match(/await sessionReady\(state, headless\)/g) ?? [];
assert.strictEqual(
  calls.length,
  2,
  'sessionReady must be asked on BOTH tick paths — once before the idle chores and once before a batch of jobs. ' +
    'One call means the idle path is trusting a login nobody verified, which is the endless-windows bug exactly.',
);

/* The idle branch is the one that used to have no check at all. Its call must
   come BEFORE the chores array, or the first chore still opens the window. */
const chores = tick.indexOf('const chores:');
assert.ok(chores > -1, 'the chore list moved — re-point this test');
assert.ok(
  tick.lastIndexOf('await sessionReady(state, headless)', chores) > -1,
  'the idle path must verify the session BEFORE the first chore opens a page',
);

/* The old inline check is gone rather than left beside the helper: two places
   deciding the same thing is how they came to disagree in the first place. */
assert.ok(
  !/Date\.now\(\) - state\.lastCheckAt > 10 \* 60_000/.test(tick),
  'the ten-minute login window lives in sessionReady now, not inlined in tick',
);

/* And the hint the chores set must actually be what re-opens the question. */
const ready = body('sessionReady');
assert.ok(/state\.lastCheckAt/.test(ready), 'sessionReady must read lastCheckAt — that is the hint the chores set');
assert.ok(/state\.attention = check\.detail/.test(ready), 'a bad answer must raise attention, which is what stops the next tick at the top');
assert.ok(/browser_needs_auth/.test(ready), 'and it must reach the activity feed — a silent spin is half of what was reported');

/* -------------------------- two: a chore that gives up records the attempt */

for (const [fn, key] of [
  ['resolveShareLinks', 'share:'],
  ['syncPostMetrics', 'metrics:'],
] as const) {
  const b = body(fn);
  assert.ok(b.includes(`inBackOff(state, \`${key}`), `${fn} must skip a row it already failed on this run`);
  assert.ok(b.includes(`backOff(state, \`${key}`), `${fn} must record the attempt, or the same row is reopened every five seconds`);
  /* The skip has to be before the window opens, not after. */
  const skip = b.indexOf('inBackOff(');
  const open = b.indexOf('session.newPage(');
  assert.ok(skip > -1 && open > -1 && skip < open, `${fn} must check the back-off BEFORE opening a page — after it, the window has already cost what it costs`);
}

/* resolveShareLinks has two ways of coming back with nothing, and the first
   version of this fix covered only one of them. */
const share = body('resolveShareLinks');
assert.strictEqual(
  (share.match(/backOff\(state, `share:/g) ?? []).length,
  2,
  'both of resolveShareLinks’ empty-handed paths must back off: the link that did not resolve AND the catch',
);

/* The sibling that was fixed long ago must keep its guard. */
assert.ok(/state\.addressTried/.test(body('resolveAddresses')), 'resolveAddresses keeps the per-run guard it was given');

/* A back-off that a restart does not clear would be a row nobody can retry;
   one that outlives the poll interval by too little is no back-off at all. */
assert.ok(/const CHORE_BACKOFF_MS = 30 \* 60_000;/.test(src), 'the back-off is half an hour — far above the five-second poll, well inside one sitting');
assert.ok(/retryAfter\?: Map<string, number>/.test(src), 'it is in memory, so no migration stands between the owner and a calm machine');

/* ------------------------------------------------------- what must not move */

/* Every chore still closes its page. The windows in the video were opened one
   at a time and closed; had they leaked, this would be a different bug. */
/* Counted against each other rather than against a number I would have to
   keep up to date — and getting that number wrong is exactly what this
   assertion is for. */
const opened = (src.match(/session\.newPage\(/g) ?? []).length;
const closed = (src.match(/await page\??\.close\(\)\.catch\(\(\) => undefined\)/g) ?? []).length;
assert.strictEqual(closed, opened, `every page this worker opens must be closed in a finally — ${opened} opened, ${closed} closed`);

console.log('idle-window tests OK');
