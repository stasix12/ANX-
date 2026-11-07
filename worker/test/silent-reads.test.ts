/*
 * THE SEVEN PLACES WHERE A FAILED DATABASE CALL DECIDED SOMETHING
 *
 * An adversarial audit of the whole publishing path — five readers, each
 * finding verified by a second agent whose instruction was to REFUTE it —
 * returned 49 confirmed findings of one shape. These are the seven on the
 * path that runs on the owner's own machine, the ones the verifier graded
 * "blocks-publishing". Every one of them has the same anatomy:
 *
 *   supabase-js does not throw. A write the database refused and a write
 *   that matched nothing both RESOLVE. So `const { data } = await …` throws
 *   away the only thing that could tell a fault from a fact, and the code
 *   below it reads the absence of data as an answer — usually the most
 *   permissive answer available.
 *
 * ONE — THE CLAIM (runJobInner). `if (!claimed?.length) return;` answered
 * both "another lane won the race" and "the database refused this UPDATE".
 * Nothing else in the product would have said a word: the due SELECT throws
 * on its own error but stays legal under an UPDATE-only policy denial,
 * idleNoticeShown is cleared before the lanes start so `worker_holding`
 * cannot fire, and the lane's catch needs a throw. A queue that cannot be
 * claimed at all looked exactly like a queue with nothing due.
 *
 * TWO AND THREE — THE RESTART SWEEP. Both writes bare, on the first requests
 * the process makes. A refused park leaves rows on 'publishing' with a
 * maybe-live step: invisible in "דורשים אתכם" and holding their group out of
 * every round the planner builds, with sweepStranded fifteen minutes away.
 *
 * FOUR — THE CONFIRMATION PARK. A bare write, and the poll below reads any
 * status that is not 'awaiting_confirmation' as 'declined' — which the caller
 * turns into a TERMINAL 'skipped' reading "הפרסום בוטל לפני הלחיצה הסופית".
 * A refused write told the owner he cancelled a publication he never saw.
 *
 * FIVE — THE COMMENT GAP. `since` undefined, and the rate limit below is
 * guarded on `since`, so it simply did not apply. spacingGate() states the
 * rule for publications in so many words — "A SPACING READ THAT FAILED MEANS
 * WAIT, NOT GO" — three thousand lines above.
 *
 * SIX — targetsAlreadyWaiting (plan.ts). An empty set means "nothing is
 * waiting for this post", which re-queues every group on every pass. The
 * index that used to catch the duplicate underneath is dropped by
 * social-latest.sql, so this read is the only per-post brake left.
 *
 * SEVEN — THE OPEN-ROWS READ (client.ts). The set built from liveQueuePlan
 * holds only 'scheduled' and 'paused'; a group whose row is 'publishing',
 * 'needs_attention', 'manual_pending' or 'awaiting_confirmation' is caught
 * here and nowhere else. A failed read added a second row for a group that
 * already had one in flight.
 *
 * Source-level, deliberately: reproducing any of them needs a database that
 * refuses one specific write. What a test CAN do is refuse the shape.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');

const worker = strip(read('../social-worker.ts'));
const db = strip(read('../db.ts'));
const plan = strip(read('../../src/lib/social/plan.ts'));
const client = strip(read('../../src/lib/social/client.ts'));

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};

/** The source between two anchors, so a window cannot silently widen. */
function between(src: string, from: string, to: string, what: string): string {
  const a = src.indexOf(from);
  assert.ok(a > -1, `${what}: the opening anchor is gone — re-point this test rather than deleting it`);
  const b = src.indexOf(to, a + from.length);
  assert.ok(b > a, `${what}: the closing anchor is gone — re-point this test rather than deleting it`);
  return src.slice(a, b);
}

/* ───────────── one: the claim tells a refusal from a lost race ─────────── */

const claim = between(worker, 'const attempts = item.attempts + 1;', 'state.currentJobs.add', 'the claim');

ok(/error: claimErr/.test(claim), 'the claim keeps the error — a refused UPDATE and a lost race are not the same answer');
ok(/if \(claimErr\)/.test(claim), 'and acts on it rather than falling into the ordinary "somebody else took it" return');
ok(/'claim_failed'/.test(claim), "it raises claim_failed, because nothing else in the product reports a queue that cannot be claimed");
ok(/logActivity\('error', 'claim_failed'/.test(claim), "at level 'error', so it clears NotificationBell's own predicate and reaches the owner's screen");
ok(/state\.claimNoticeShown/.test(claim), 'latched: the tick polls every few seconds and a permission fault does not clear itself');
ok(/state\.claimNoticeShown = false/.test(claim), 'and un-latched by the first claim that works, so the next episode is reported too');
ok(/claimNoticeShown\?: boolean/.test(worker), 'the latch is a declared field on WorkerState, not an ad-hoc property');

/* ───────────── two and three: the restart sweep ─────────────────────────── */

const startup = between(worker, "const MAYBE_LIVE_STEPS = ['publishing', 'verifying', 'submitted'];", 'await sweepStuckComments(db);', 'the restart sweep');

ok(/error: parkErr/.test(startup), 'the restart park keeps its error — it runs before the pulse, when a token fault is most likely');
ok(/error: requeueErr/.test(startup), 'and so does the requeue beside it');
ok((startup.match(/'write_failed'/g) ?? []).length === 2, 'both report write_failed when the database refused them, rather than leaving rows wedged in silence');
ok(
  /} else if \(requeued\?\.length\)/.test(startup),
  'and the cheerful "N הוחזרו לתור" line is now in the ELSE: a write that failed must not also print a success',
);

/* ───────────── four: a refused park is not a cancellation ───────────────── */

const park = between(worker, 'async function waitForConfirmation', 'const deadline', 'the confirmation park');

ok(/\.select\('id'\)/.test(park), 'the park asks whether it landed');
ok(/parkErr \|\| !parked\?\.length/.test(park), 'and treats both a refusal and a no-op as "this did not happen"');
ok(
  /return 'stopped'/.test(park),
  "handing the row back rather than letting the poll read it as 'declined' — which the caller turns into a TERMINAL skip saying the owner cancelled",
);
ok(!/return 'declined'/.test(park), 'and never reports a cancellation nobody made');

/* ───────────── five: a spacing read that failed means wait ──────────────── */

const gap = between(worker, "const { data: previous", 'const gapSec', 'the comment gap');

ok(/error: previousErr/.test(gap), 'the comment-gap read keeps its error');
ok(/if \(previousErr\) continue;/.test(gap), 'and holds, because the gap below is guarded on `since` and would simply not apply');

/*
 * THE RULE IT IS COPYING, still in place. If spacingGate() ever stops failing
 * closed, the sentence this test quotes stops being true and the guard above
 * is quoting a rule nobody follows.
 */
ok(
  /if \(lastError\) return \{ open: false/.test(between(worker, 'async function spacingGate', 'const stamps = ((rows', 'spacingGate')),
  'publications still refuse to go on a failed spacing read — the rule the comment guard above is quoting',
);

/* ───────────── six: the planner's only per-post brake ───────────────────── */

const waiting = between(plan, 'async function targetsAlreadyWaiting', 'return new Set', 'targetsAlreadyWaiting');

ok(/const \{ data, error \}/.test(waiting), 'targetsAlreadyWaiting keeps its error');
ok(/if \(error\) throw new Error\(error\.message\)/.test(waiting), 'and throws: an empty set means "nothing is waiting", which re-queues every group on every pass');

/* ───────────── seven: the read that catches a group already in flight ───── */

const openRows = between(client, 'const openRes = await db()', 'const fresh =', 'the open-rows read');

ok(/\.in\('status', OPEN_STATUSES\)/.test(openRows), 'it still asks about every OPEN status — the ones liveQueuePlan cannot see');
ok(/if \(openRes\.error\) throw friendlyError\(openRes\.error\)/.test(openRows), 'and refuses rather than guessing: a failed read here adds a second row for a group that already has one in flight');

/* ───────────── and the stored identity is not thrown away on a bad read ── */

const session = between(db, 'const { data: existing', 'existsSync(sessionFile())', 'the session read');

ok(/error: sessionError/.test(session), 'getSession keeps its error');
ok(/!existing\.session && sessionError/.test(session), 'and a failed refresh REQUEST is told apart from a session that is genuinely gone');
ok(/throw new Error\(/.test(session), 'the worker stops and retries on the next start instead of opening a sign-in window at four in the morning');

console.log(`✓ silent-reads: ${checks} בדיקות עברו`);
