/**
 * ONE ROUND'S GAP MAY NOT RE-PACE EVERY OTHER ROUND.
 *
 * "קמפיינים מתבלבלים עם תורים של קמפיינים אחרים."
 *
 * The spacing floor is ACCOUNT-WIDE: rules.ts reads one number for every row of
 * every campaign, and the worker's gate claims nothing at all while it is shut.
 * applyGapFloor() wrote that number UNCONDITIONALLY, in both directions, and
 * respaceQueue() called it as its first act — with `campaignId` narrowing only
 * which ROWS got re-stamped.
 *
 * So: open the queue tuner on round A, widen 30 seconds to 10 minutes, and the
 * account floor becomes 10 minutes. Round B, still set to 30 seconds, publishes
 * once every ten — while B's panel, B's card and B's stored instants all still
 * say thirty seconds.
 *
 * The product already refuses this three lines up the same handler, and says
 * why: matchAccountGapTo() "only ever LOWERS", because "raising the floor from
 * here would let one campaign slow every other campaign in the account — a side
 * effect nobody asked for". applyGapFloor had the authority to undo that
 * refusal, and used it.
 *
 * AND THE HALF THAT REFUSING ALONE DOES NOT FIX, which is why this file also
 * pins a sentence: when the floor is ABOVE what the round asked for, the round
 * does not get what it asked for. Two gates pace this product and the later
 * instant wins. The old behaviour hid that by dragging the floor down to match;
 * refusing to raise it hides it the other way — unless somebody says so out
 * loud. So the respace report now says it in words.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const client = src('../../src/lib/social/client.ts');
const slice = (from: string, to: string) => client.slice(client.indexOf(from), client.indexOf(to));

/* ─────────────── 1. applyGapFloor can be told to stand down ─────────────── */
{
  const fn = slice('export async function applyGapFloor(', 'The publishing window of each of these campaigns');
  is(fn.length > 600, 'applyGapFloor is found');
  is(
    /export async function applyGapFloor\(gapSeconds: number, opts: \{ lowerOnly\?: boolean \} = \{\}\)/.test(fn),
    'applyGapFloor no longer takes a scope at all — so a campaign-scoped caller has no way to ask it not to raise the account floor',
  );
  is(/if \(opts\.lowerOnly\) \{/.test(fn), 'the lower-only branch is gone');
  is(
    /const wasSeconds = accountGapSeconds\(limits, browser, true\);\s*if \(wasSeconds <= want\) \{/.test(fn),
    'the stand-down must compare against the floor the ENGINE reads (accountGapSeconds, base + group surcharge) — comparing against either half alone lets the other half raise it',
  );
  is(/surchargeChanged: false,/.test(fn), 'standing down must report that nothing moved, or the screen announces a change that did not happen');
  /* It must still write in both directions when NOT scoped: the account's own
     tuner is the screen where the floor IS the thing being edited. */
  is(
    fn.indexOf('const { baseSeconds, surchargeSeconds } = splitAccountGap(want, curSurcharge);') > fn.indexOf('if (opts.lowerOnly) {'),
    'the unconditional write must still follow the branch — an account-wide tuner that can only lower can never put the floor back up',
  );
}

/* ──────────────── 2. respaceQueue passes the scope it has ───────────────── */
{
  const fn = slice('export async function respaceQueue(', 'Takes one group out of the waiting queue');
  is(fn.length > 2000, 'respaceQueue is found');
  is(
    /await applyGapFloor\(gapSeconds, \{ lowerOnly: Boolean\(opts\.campaignId\) \}\)/.test(fn),
    'respaceQueue must pass its own scope to the floor write — this one line IS the bug: `campaignId` narrowed the rows and left the settings global',
  );
  is(!/= await applyGapFloor\(gapSeconds\);/.test(fn), 'and the unscoped call must not survive beside it');
  /* unit.test.ts pins that the floor is still written from here at all —
     "moving the rows without moving the floor is the queue that quietly dies". */
  is(/await applyGapFloor\(/.test(fn), 'the floor write must still happen here: moving the rows without it is a queue that quietly dies');

  /* And the sentence, because a refusal nobody is told about is a new silence. */
  is(/const floorSeconds = floor\.minGapSeconds \+ floor\.groupMinGapSeconds;/.test(fn), 'the report must know the floor the engine will actually enforce');
  is(
    /floorSeconds > gapSeconds/.test(fn),
    'nothing compares the floor against what the round asked for — so a round set to thirty seconds under a 65-minute floor publishes every 65 minutes with no screen saying why',
  );
  is(/המרווח הכללי של החשבון הוא/.test(fn), 'and it must say it in words the owner reads, not only in a number');
  is(/accountFloorSeconds: floorSeconds/.test(fn), 'the activity row must carry the floor, so the history can be checked against the panel');
  is(/scopedToCampaign: Boolean\(opts\.campaignId\)/.test(fn), 'and whether this respace spoke for one round or for the account');
}

/* ───────── 3. a quick publish of one post may not re-pace the rest ──────── */
{
  const library = src('../../src/lib/social/library.ts');
  is(
    /await applyGapFloor\(draft\.gapSeconds, \{ lowerOnly: Boolean\(ctx\.campaignId\) \}\)/.test(library),
    'a quick publish that belongs to a round must not raise the account floor either — it is the same unconditional write, reached from the other screen',
  );
  is(!/await applyGapFloor\(draft\.gapSeconds\);/.test(library), 'and the unscoped call must not survive');
}

/* ───────── 4. the invariant this was always supposed to protect ─────────── */
{
  const fn = slice('export async function matchAccountGapTo(', 'What applyGapFloor() wrote');
  is(/if \(wasSeconds <= want\) return \{ changed: false/.test(fn), 'matchAccountGapTo must still refuse to raise — it is the rule this change stops being able to undo');
  is(
    /raising the floor from here would let one[\s*]+campaign slow every other campaign/i.test(client),
    'the reason must stay written down where the next person edits this',
  );
}

console.log(`campaign floor OK — ${checks} assertions`);
