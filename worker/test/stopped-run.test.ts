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
 *   2. worker/revive.ts handed the failures back for another attempt on every
 *      idle pass, because its note deferred the decision to rules.ts: "rules.ts
 *      still holds each row to its campaign's days and hours". It does — by
 *      skipping it. So each revival spent a write and one of three attempts to
 *      manufacture another skipped row. THAT MECHANISM NO LONGER EXISTS: the
 *      owner withdrew the second pass on 08.11.2026 ("פרסום שנכשל לדלג ולא
 *      להחזיר לתור"), so this step cannot recur at all;
 *   3. plan.ts:812 swept the same rows in bulk every sixty seconds on top.
 *
 * Nobody pressed anything, and nothing on screen named the round that had been
 * stopped. Three fixes, and this file is the guard over all three:
 *
 *   · client.ts ensureRunForPost brings a stopped run's WAITING rows across on
 *     relaunch — they have no history to protect and cannot publish where they
 *     are;
 *   · worker/revive.ts refused a failure whose run is archived — now moot,
 *     and asserted as moot below;
 *   · rules.ts says so when the row and the post disagree.
 *
 * All three are source-level, because reproducing them needs Supabase.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

/* ───────── one: THE SECOND PASS IS GONE, so step 2 cannot happen ───────── */

/*
 * This file used to prove that worker/revive.ts refused a failure belonging to
 * an archived run. On 08.11.2026 the owner withdrew the second pass entirely —
 * "פרסום שנכשל לדלג ולא להחזיר לתור" — so step 2 of the loop above is not
 * fixed any more, it is IMPOSSIBLE: nothing hands a failure back, whatever run
 * it belongs to. worker/test/revive.test.ts is the guard over the removal; the
 * one line here is what keeps THIS file honest about which of its three fixes
 * still has a mechanism behind it.
 */
const workerSrc = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
ok(!/pickRevivable|reviveFailedRows/.test(workerSrc), 'no second pass exists to revive a stopped run\'s failure in the first place');

/* ───────── two: the relaunch brings the stranded waiting rows across ──── */

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
