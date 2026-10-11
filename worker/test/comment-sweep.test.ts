/*
 * THE ROW THAT SAYS "כותב עכשיו" AND IS NOT.
 *
 * A comment is claimed by flipping the row to 'commenting' and stamping
 * comment_at. If the machine stops between that write and the outcome, the row
 * stays claimed — and the screen renders the column with no freshness check,
 * so it reads "כותב עכשיו" for ever while nothing is writing anything.
 *
 * It is also counted as QUEUE, never as attention, so "879 בתור" silently
 * includes work that will never happen.
 *
 * Two properties decide whether that is safe, and this file pins both without
 * a database or a browser:
 *
 *   THE AGE     a claim seconds old is a worker doing its job and must not be
 *               touched. Only one older than COMMENT_CLAIM_STALE_MS is dead.
 *
 *   THE LANDING 'unverified', never 'pending'. Nobody knows whether the
 *               comment went up before the machine stopped, and the one
 *               outcome that must never happen is a SECOND comment under a
 *               live post. 'unverified' is outside the pending set and outside
 *               both retry paths, so a person looks and decides.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let checks = 0;
const is = (actual: unknown, expected: unknown, what: string): void => {
  checks += 1;
  assert.deepStrictEqual(actual, expected, what);
};

const worker = readFileSync(path.join(__dirname, '..', 'social-worker.ts'), 'utf8');

/* The constant, read out of the source so the rule below is the real one. */
const staleMs = (() => {
  const m = /const COMMENT_CLAIM_STALE_MS = (\d+) \* (\d+)_?(\d*);/.exec(worker);
  if (!m) throw new Error('COMMENT_CLAIM_STALE_MS is gone — the sweep has no age rule');
  return Number(m[1]) * Number(`${m[2]}${m[3]}`);
})();
is(staleMs, 15 * 60_000, 'a claim is considered dead after fifteen minutes');

/*
 * THE AGE RULE ITSELF. `.lt('comment_at', now - stale)` is strictly less-than
 * against a cutoff in the past, so:
 */
const NOW = 1_760_000_000_000;
const sweeps = (claimedAgoMs: number): boolean => {
  const commentAt = NOW - claimedAgoMs;
  const cutoff = NOW - staleMs;
  return commentAt < cutoff; // exactly what .lt('comment_at', cutoff) asks
};
is(sweeps(30_000), false, 'a claim thirty seconds old is a worker doing its job — it is not touched');
is(sweeps(14 * 60_000), false, 'nor is one at fourteen minutes');
is(sweeps(16 * 60_000), true, 'one at sixteen minutes is nobody holding it, and is reclaimed');
is(sweeps(26 * 60_000), true, 'and so is one from half an hour ago');

/*
 * THE LANDING. This is the duplicate-comment guard and it is not negotiable:
 * if this ever writes 'pending', every stuck row re-enters the candidate set
 * and gets a SECOND comment under a post that may already carry one.
 */
is(/comment_status: 'unverified'/.test(worker), true, "a reclaimed row lands on 'unverified'");
is(
  /\.update\(\{ comment_status: 'unverified'[\s\S]{0,260}?\.eq\('comment_status', 'commenting'\)/.test(worker),
  true,
  'and only a row that is actually claimed is reclaimed',
);
is(
  /\.update\(\{ comment_status: 'pending'[\s\S]{0,200}?\.eq\('comment_status', 'commenting'\)/.test(worker),
  false,
  "the sweep must NEVER put a claimed row back to 'pending' — that is a second comment under a live post",
);
is(
  /\.lt\('comment_at', new Date\(Date\.now\(\) - COMMENT_CLAIM_STALE_MS\)\.toISOString\(\)\)/.test(worker),
  true,
  'and the age is applied in the database, not guessed at in memory',
);

/*
 * AND IT RUNS BEFORE THE CANDIDATES ARE READ, not after. A row swept into
 * 'unverified' must leave the pending set in the same pass, or the read below
 * it would offer the claim a row the sweep had just condemned.
 */
const sweepAt = worker.indexOf('await sweepStuckComments(db);\n\n  const pending =');
is(sweepAt > 0, true, 'the sweep still runs immediately before the candidate read');

/*
 * TWO CALL SITES, AND BOTH MATTER. Startup covers a crash-and-restart; the one
 * inside the chore covers a worker that has been up for days and lost a row to
 * a write that failed. Dropping either leaves a row reading "כותב עכשיו" with
 * no path out of it.
 */
is((worker.match(/await sweepStuckComments\(db\);/g) ?? []).length, 2, 'the sweep is reachable from startup AND from the chore');

/*
 * THE REASON TRAVELS WITH THE ROW. "לא הצליח" with nothing beside it is what
 * makes a person press the same button again — which, on a row that may
 * already carry a comment, is the outcome this whole file exists to prevent.
 */
is(
  /comment_note: 'ה-worker נעצר באמצע הוספת התגובה\. בדקו בפוסט אם היא נוספה לפני שתנסו שוב\.'/.test(worker),
  true,
  'and it says why, and what to check, before anyone retries it',
);

/*
 * NEITHER RETRY PATH MAY TOUCH IT. Both carry .eq('comment_status','failed'),
 * so 'unverified' is outside the bulk button by construction.
 */
const client = readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'social', 'client.ts'), 'utf8');
is((client.match(/\.eq\('comment_status', 'failed'\)/g) ?? []).length >= 2, true, "both retry paths are narrowed to 'failed', so 'unverified' is never re-queued");

console.log(`comment sweep tests OK — ${checks} assertions`);
