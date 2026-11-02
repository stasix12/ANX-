/*
 * "הוא מדלג ורושם הסבב נעצר למרות שלא עשיתי כלום"
 *
 * Sent after a day of this, and he was right twice over: he had stopped
 * nothing recently, and the round that WAS stopped was not the round he was
 * watching run.
 *
 * THE LOOP, end to end. He resets a round — which archives it — and launches
 * the post again. The relaunch opens a fresh run and repoints the post, so the
 * card correctly reads פעיל. But the rows already in the queue still carry the
 * OLD run's id, and rules.ts:290 reads `item.campaign_id ?? post.campaign_id`:
 * the ROW'S label wins. So:
 *
 *   1. each leftover row reaches its slot and is skipped — "הסבב נעצר." —
 *      under a card that says the round is active;
 *   2. worker/revive.ts hands the failures back for another attempt on every
 *      idle pass, because its note deferred the decision to rules.ts: "rules.ts
 *      still holds each row to its campaign's days and hours". It does — by
 *      skipping it. So each revival spent a write and one of three attempts to
 *      manufacture another skipped row;
 *   3. plan.ts:812 swept the same rows in bulk every sixty seconds on top.
 *
 * Nobody pressed anything, and nothing on screen named the round that had been
 * stopped. Three fixes, and this file is the guard over all three:
 *
 *   · client.ts ensureRunForPost brings a stopped run's WAITING rows across on
 *     relaunch — they have no history to protect and cannot publish where they
 *     are;
 *   · worker/revive.ts refuses a failure whose run is archived;
 *   · rules.ts says so when the row and the post disagree.
 *
 * The revive rule is tested BEHAVIOURALLY against the real function. The other
 * two are source-level, because reproducing them needs Supabase.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REVIVE_ATTEMPT_CEILING, pickRevivable, type FailedRow, type OpenRow } from '../revive';

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

const NOW = Date.parse('2026-11-02T23:40:00.000Z');
const LIVE = 'c0000000-0000-4000-8000-000000000001';
const DEAD = 'c0000000-0000-4000-8000-000000000002';

const failed = (id: string, campaign: string | null, target: string): FailedRow => ({
  id,
  campaign_id: campaign,
  target_id: target,
  attempts: 0,
});

/* No open rows at all: the round has finished every group it had, which is the
   only moment the second pass runs. */
const NO_OPEN: OpenRow[] = [];

/* ─────────────── one: a failure of a STOPPED run does not come back ─────── */

const both = pickRevivable({
  open: NO_OPEN,
  failed: [failed('r-live', LIVE, 't1'), failed('r-dead', DEAD, 't2')],
  nowMs: NOW,
  gapMs: 30_000,
  stopped: new Set([DEAD]),
});
eq(
  both.map((r) => r.id),
  ['r-live'],
  'the live round\'s failure is revived and the stopped round\'s is not — reviving it writes a skip, never a publication',
);

/* AND WITHOUT THE SET IT BEHAVES AS BEFORE. A caller that could not read the
   list must not silently stop reviving everything. */
const noSet = pickRevivable({ open: NO_OPEN, failed: [failed('r-dead', DEAD, 't2')], nowMs: NOW, gapMs: 30_000 });
eq(noSet.map((r) => r.id), ['r-dead'], 'absent `stopped` means "nothing is stopped", not "revive nothing"');

/* A ROW WITH NO RUN IS NOT A STOPPED ROW. Quick publishes queue rows with a
   null campaign_id; `r.campaign_id &&` is what keeps their second pass, and
   dropping it would silence the one path that has no card to look at. */
const orphan = pickRevivable({
  open: NO_OPEN,
  failed: [failed('r-orphan', null, 't3')],
  nowMs: NOW,
  gapMs: 30_000,
  stopped: new Set([DEAD, '']),
});
eq(orphan.map((r) => r.id), ['r-orphan'], 'a failure with no run at all is still revived, even when the stopped set contains an empty string');

/* The other four rules still hold with the new filter in place — a guard that
   lets an older rule through is not a guard. */
const ceiling = pickRevivable({
  open: NO_OPEN,
  failed: [{ ...failed('r-spent', LIVE, 't4'), attempts: REVIVE_ATTEMPT_CEILING }],
  nowMs: NOW,
  gapMs: 30_000,
  stopped: new Set([DEAD]),
});
eq(ceiling.length, 0, 'the attempt ceiling is still enforced beside the stopped-run filter');

const busy = pickRevivable({
  open: [{ status: 'scheduled', campaign_id: LIVE, target_id: 't9', scheduled_at: new Date(NOW + 60_000).toISOString() }],
  failed: [failed('r-busy-round', LIVE, 't5')],
  nowMs: NOW,
  gapMs: 30_000,
  stopped: new Set([DEAD]),
});
eq(busy.length, 0, 'a round still working keeps its failures until it has finished');

/* ─────────── two: the caller supplies the set, and fails closed ─────────── */

const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
const code = worker
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

ok(/\.from\('social_campaigns'\)\s*\.select\('id'\)\s*\.eq\('status', 'archived'\)/.test(code), 'the worker reads which runs are stopped');
ok(/if \(deadErr\) throw new Error\(deadErr\.message\);/.test(code), 'and FAILS CLOSED: a pass that cannot find out does not run, because the cost of guessing wrong is the treadmill being fixed');
/* `\s*` AND NEVER A BARE `\n`: the installer is built on a Windows runner, so
   the file arrives with CRLF and a regex anchored on `\n` alone matches
   nothing there — a guard that silently stops guarding on the one machine that
   matters. package.test.ts enforces this, and it has now caught me twice. */
ok(/stopped,\s*\}\);/.test(code), 'and hands the set to pickRevivable');
/* Ordering: the read must come BEFORE the call that consumes it. */
ok(code.indexOf("eq('status', 'archived')") < code.indexOf('stopped,'), 'the set is read before it is used');

/* ───────── three: the relaunch brings the stranded waiting rows across ──── */

const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
const ensure = client.slice(client.indexOf('export async function ensureRunForPost'), client.indexOf('export async function', client.indexOf('export async function ensureRunForPost') + 10));

ok(/const stranded = post\.campaign_id \?\? null;/.test(ensure), 'the run being left behind is remembered — library.ts used to pass null in its place and throw that id away');
ok(/\.eq\('campaign_id', stranded\)/.test(ensure), 'and its waiting rows are brought across');
ok(/\.is\('campaign_id', null\)/.test(ensure), 'orphans are still adopted as they always were');

/*
 * HISTORY IS NEVER MOVED. OPEN_STATUSES is waiting + in-flight, so a published
 * row cannot be re-stamped — which matters because social_campaign_counts
 * aggregates by campaign_id, and moving a published row would hand the new run
 * the old one's totals. The product promises the opposite: "the next launch of
 * that post opens a new run whose count starts at zero".
 */
eq(
  (ensure.match(/\.in\('status', OPEN_STATUSES\)/g) ?? []).length,
  2,
  'BOTH writes are bounded to OPEN_STATUSES — a published row is its run\'s history and may never be re-stamped',
);

/*
 * NO FILTER INJECTION. The stranded id reaches us from the browser (PostEditor
 * passes post.campaign_id straight through), and PostgREST's `or=` takes a
 * STRING: interpolating a caller-supplied value into it is a filter-injection
 * surface. `.eq()` is parameterised by supabase-js, so the id never becomes
 * syntax. Two writes instead of one `.or()` is the whole reason.
 */
ok(!/\.or\(`campaign_id/.test(ensure), 'the stranded id is never interpolated into a PostgREST or= string');
ok(!/\$\{stranded\}/.test(ensure), 'and never interpolated anywhere else either');

/*
 * AND A PAUSED RUN IS NOT TOUCHED. The early return hands back any run that is
 * still active or paused, so nothing below it can run for one — otherwise
 * relaunching would silently empty a round the owner had merely paused.
 */
ok(
  /if \(existing && existing\.status !== 'archived'\) return existing\.id;/.test(ensure),
  'a run that is active or paused is reused and returned before any row is moved',
);
ok(
  ensure.indexOf("!== 'archived'") < ensure.indexOf('const stranded'),
  'that return stands in front of the rescue, which is what scopes the rescue to a finished run',
);

const librarySrc = readFileSync(new URL('../../src/lib/social/library.ts', import.meta.url), 'utf8');
/* Comment-stripped, because the fix's own note explains the line it forbids —
   the fifth time in this project that a guard has matched its own prose. */
const library = librarySrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, ''))
  .join('\n');
ok(
  /ensureRunForPost\(\{ id: post\.id, title: post\.title, campaign_id: post\.campaign_id \}\)/.test(library),
  'the launch path hands over the post\'s REAL run, archived or not — passing null is what left the rows with nobody able to find them',
);
ok(!/runEnded/.test(library), 'and the duplicate archived check is gone: ensureRunForPost already refuses a run that is not active or paused');

/* ─────────────── four: the skip says which round, when they differ ──────── */

const rules = readFileSync(new URL('../../src/lib/social/rules.ts', import.meta.url), 'utf8');
ok(/const movedOn = Boolean\(item\.campaign_id && post\.campaign_id && item\.campaign_id !== post\.campaign_id\);/.test(rules), 'the engine notices when the row and the post disagree about which run this is');
ok(/נשאר משויך לסבב קודם שנעצר/.test(rules), 'and says so, instead of a bare "הסבב נעצר" over a card reading פעיל');
ok(/reason: 'הסבב נעצר\.'/.test(rules) || /: 'הסבב נעצר\.',/.test(rules), 'a genuinely stopped round still gets the plain sentence');
/* The row's label still wins for COUNTING — that is correct and deliberate,
   and it is the reason the mismatch can exist at all. Flipping it here would
   change what maxPerCampaignPerDay and the per-round gap are scoped to. */
ok(/const campaignId = item\.campaign_id \?\? post\.campaign_id;/.test(rules), "the row's run still decides what the row is COUNTED under — the fix is upstream, not a flipped precedence");

console.log(`✓ stopped-run: ${checks} בדיקות עברו`);
