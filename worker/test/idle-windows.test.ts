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

/**
 * The same file with every comment removed.
 *
 * Needed because this file explains, at length and in prose, the exact lines
 * it forbids — so a bare search finds its own explanation and passes (or, as
 * happened here, fails) on nothing. Twice now a guard in this project has
 * been anchored on a string that only ever appeared in a comment; an
 * assertion that cannot tell code from prose is not an assertion.
 */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

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

/* ------------------- one-and-a-half: the loop the FIRST fix introduced */

/*
 * The first attempt at this made it worse, and the owner filmed it again:
 * "עדיין פותח בלי סוף לא תיקנתה כלום". sessionReady read `lastCheckAt`, and
 * the chores "asked" for a re-check by setting `lastCheckAt = 0`. But zero is
 * not a request, it is a permanent claim that the last check was in 1970 — so
 * every tick verified the login (a window), the chore failed and zeroed the
 * clock again, and the next tick verified it again. Twice the windows.
 *
 * A request has to be consumed by whoever answers it.
 */
assert.ok(
  !/state\.lastCheckAt = 0/.test(code),
  'no chore may zero the login clock: that is not "check once more", it is "never trust the clock again" — and with sessionReady reading it, a window every tick',
);
assert.ok(/recheckSession\?: boolean/.test(src), 'a chore asks for a re-check with a flag');
const readyBody = body('sessionReady');
assert.ok(
  /state\.recheckSession = false/.test(readyBody),
  'sessionReady must CONSUME the request — an unread one costs a window on every tick for ever',
);
/* Consumed before the early return, or a request made while the answer is
   still fresh survives to be asked again next tick. */
const consumed = readyBody.indexOf('state.recheckSession = false');
const early = readyBody.indexOf('return true');
assert.ok(consumed > -1 && early > -1 && consumed < early, 'the request is consumed before the cached-answer shortcut, not after it');

/*
 * A consumed flag stops one chore asking for ever; it does not stop MANY
 * chores each asking once per tick, and a login check is itself a window. So
 * the request has a floor under it: however many ask, the answer is re-taken
 * at most once a minute.
 */
assert.ok(/const RECHECK_FLOOR_MS = 60_000;/.test(src), 'a chore-requested re-check is rate-limited, or the request becomes the storm');
assert.ok(
  /asked \? RECHECK_FLOOR_MS : LOGIN_RECHECK_MS/.test(readyBody),
  'the floor must be what a request buys — not a bypass of the cache altogether',
);

/* --------------- three: the chore that never ended is gone altogether */

/*
 * The third video: v3.41.0, every loop above already fixed, and it was still
 * opening group after group — "למה הוא עדיין ממשיך לפתוח קבוצות!!". Not a
 * loop this time. syncPostMetrics re-read the view counter on every post from
 * the last thirty days, every six hours, and one reading means opening its
 * group and scrolling to find our post: at the 231 publications on the
 * dashboard, ~920 group pages a day and close to seven hours of it. Silently,
 * and at about eleven windows per five minutes — under the breaker below.
 *
 * Moving it to the small hours was the first answer. The owner's was better:
 * "לא צריך לבדוק צפיות .. גם ככה לא רואים את זה בפייסבוק". Facebook barely
 * reports a group post's counters, so the most expensive thing this worker
 * did was buying a number nobody could read. It is gone, and this asserts it
 * STAYS gone rather than being reinstated by somebody who finds the columns
 * and assumes they should be filled.
 */
assert.ok(!/syncPostMetrics/.test(code), 'view counts are not collected — the columns keep what they have, nothing refills them');
assert.ok(!/readPostMetrics/.test(code), 'and the reader is not imported, so it cannot creep back into another chore');
assert.ok(!/METRICS_STALE_HOURS|METRICS_PER_TICK|METRICS_MAX_AGE_DAYS/.test(code), 'nor its constants');

/* The sweep the owner DOES want has a home, and it is not the working day. */
const sweepSrc = readFileSync(new URL('../nightly.ts', import.meta.url), 'utf8');
assert.ok(/export const NIGHTLY_FROM = 2;/.test(sweepSrc), 'the group sweep runs from 02:00 — "לעשות מאוחר בלילה בין 2-3"');
assert.ok(/export const NIGHTLY_TO = 4;/.test(sweepSrc), 'and stops before 04:00');
assert.ok(
  /h >= NIGHTLY_FROM && h < NIGHTLY_TO/.test(sweepSrc),
  'bounded at BOTH ends: `hour >= 2` alone is true all day, which would put the sweep back in the middle of the owner’s afternoon',
);

/* ------------------------------------ the breaker that does not need a cause */

assert.ok(/const IDLE_WINDOW_LIMIT = 40;/.test(src), 'an idle worker has a ceiling on windows per five minutes');
assert.ok(/recentPageOpens\(5 \* 60_000\)/.test(src), 'and it is measured, not assumed');
const brk = tick.indexOf('IDLE_WINDOW_LIMIT');
assert.ok(brk > -1 && brk < tick.indexOf('const chores:'), 'the breaker runs before the chores — after them it is a post-mortem');
assert.ok(
  tick.indexOf('sessionReady') > -1 && brk < tick.lastIndexOf('await sessionReady(state, headless)', tick.indexOf('const chores:')),
  'and before the session check, which is itself a window',
);
assert.ok(/worker_window_storm/.test(src), 'tripping it reaches the activity feed — the owner should never have to film a monitor to report this');

/* Every window carries what it was for, or the breaker can only say "40". */
const opens = src.match(/session\.newPage\([^)]*\)/g) ?? [];
for (const o of opens) {
  assert.ok(/,\s*'/.test(o), `every newPage must say what it is for — ${o} does not`);
}

/* -------------------------- two: a chore that gives up records the attempt */

for (const [fn, key] of [
  ['resolveShareLinks', 'share:'],
  ['syncGroupProfiles', 'profile:'],
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

/*
 * THE ONE THAT ACTUALLY CAUSED IT. syncGroupProfiles selects groups by
 * `last_synced_at IS NULL` ordered by created_at, so a row it does not stamp
 * is the row it picks again five seconds later — for ever, over one deleted
 * or private group sitting at the head of the queue, with the account signed
 * in perfectly well the whole time.
 */
const profiles = body('syncGroupProfiles');
/* From the branch to the reset that follows it — searched FORWARD from the
   branch, because `let blind = 0;` above the loop is an earlier match and
   slicing to it runs the range backwards into nothing. */
const blankAt = profiles.indexOf('if (!profile) {');
const blankPath = profiles.slice(blankAt, profiles.indexOf('blind = 0;', blankAt));
assert.ok(blankPath.length > 0, 'the blank-profile path moved — re-point this test');
assert.ok(
  /last_synced_at: new Date\(\)\.toISOString\(\)/.test(blankPath),
  'a group that came back blank MUST be stamped, or the sweep never reaches the second group',
);
assert.ok(/last_error:/.test(blankPath), 'and it must say so on the groups screen rather than going quiet');
assert.ok(/continue;/.test(blankPath), 'one blank group is a group, not the account — the sweep goes on to the next');
assert.ok(/blind >= 2/.test(blankPath), 'but two in a row IS the account: stop, and ask for one session check');
assert.ok(/state\.recheckSession = true/.test(blankPath), 'asked with the flag, which is consumed — never by zeroing the clock');

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
