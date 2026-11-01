/**
 * A LOST STEP WRITE MAY NOT BECOME A SECOND POST.
 *
 * This one is mine. The stranded-row sweep that shipped an hour ago reads the
 * ROW's `step` to decide whether a publication reached the Post button. The step
 * write in onStep had its error DISCARDED — supabase-js resolves with
 * `{ data, error }` rather than throwing, so a failed UPDATE was a no-op nobody
 * noticed, and `lastStep` still moved in memory so this process's own answer
 * stayed right while the row kept the step before it.
 *
 * Put together: the write of 'publishing' fails, the click lands, the post is on
 * Facebook, the write of 'verifying' fails too (one blip, two writes), the row is
 * later stranded — and fifteen minutes later the sweep reads a pre-click step and
 * publishes the same post to the same group a SECOND TIME.
 *
 * The fault was dormant before the sweep: only a restart re-queued such a row.
 * The sweep made it reachable every fifteen minutes, so closing it belongs to
 * that change.
 *
 * THE CLICK IS THE LINE, and composer.ts fixes where it is: onStep('publishing')
 * at :367, postButton.click() at :369, onStep('verifying') at :372 — each
 * AWAITED, so a throw from a pre-click step stops the click from happening.
 * Before the click, refusing costs a minute. After it, refusing would BE the
 * double post.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAYBE_LIVE_STEPS } from '../stranded';

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
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const worker = src('../social-worker.ts');
const composer = src('../facebook/composer.ts');

/* ───── 1. the click is where this test believes it is ──────────────────── */
{
  /*
   * ON THE STRIPPED SOURCE. composer.ts:226 mentions `postButton.click()`
   * inside a comment, two hundred lines above the call — so indexOf over the
   * raw file puts the click BEFORE the step and this test fails on correct
   * code. Third time a comment quoting code has bitten a guard today.
   */
  const bare = code(composer);
  const publishAt = bare.indexOf("onStep('publishing')");
  const clickAt = bare.indexOf('postButton.click()');
  const verifyAt = bare.indexOf("onStep('verifying')");
  is(publishAt >= 0 && clickAt >= 0 && verifyAt >= 0, 'the composer still names these three moments');
  is(publishAt < clickAt, "onStep('publishing') must still run BEFORE the click — the whole fix rests on it");
  is(clickAt < verifyAt, "and onStep('verifying') AFTER it");
  is(
    /await input\.onStep\('publishing'\)/.test(composer),
    'the composer must AWAIT the pre-click step — without the await a throw cannot stop the click, and the guard is decorative',
  );
}

/* ───── 2. a pre-click write failure refuses to continue ────────────────── */
{
  const handler = code(worker.slice(worker.indexOf('onStep: async (step) => {'), worker.indexOf('confirm: requireConfirmation')));
  is(handler.length > 200, 'the onStep handler is found');
  is(
    /const \{ error: stepErr \} = await db\.from\('social_queue'\)\.update\(\{ step, step_at: new Date\(\)\.toISOString\(\) \}\)\.eq\('id', item\.id\);/.test(handler),
    "the step write must CAPTURE its error — supabase-js resolves with { data, error } and never throws, so an un-destructured write is a failure nobody notices",
  );
  is(/if \(!stepErr\) return;/.test(handler), 'and act on it');
  is(
    /throw new Error\(`\$\{STEP_WRITE_REFUSED\}: \$\{stepErr\.message\}`\);/.test(handler),
    'a pre-click step whose write failed must THROW, so the click never happens — a row back in the queue costs a minute, a stale step costs a second post in the same group',
  );
  /* And the post-click step must NOT throw. */
  is(
    /if \(step === 'verifying'\) \{[\s\S]{0,600}return;\s*\}/.test(handler),
    "'verifying' is the only step after the click, and it must be carried rather than thrown — refusing there would BE the double post",
  );
  is(
    handler.indexOf("step === 'verifying'") < handler.indexOf('throw new Error('),
    'the post-click branch must come FIRST, or the throw catches it too',
  );
}

/* ───── 3. the refusal lands on the unspent-attempt path ────────────────── */
{
  is(/const STEP_WRITE_REFUSED = 'step write refused';/.test(worker), 'the sentinel is gone');
  is(
    /\|step write refused\/i;/.test(worker),
    'the sentinel must be an alternative of LOCAL_FAULT_RE, spelled out IN the regex literal: unit.test.ts lifts that regex with a pattern that only matches a literal, so interpolating the const breaks the guard that checks the regex is a literal',
  );
  /* Which path that is, by name: back to the queue in a minute, attempt unspent. */
  const branch = worker.slice(worker.indexOf('if (LOCAL_FAULT_RE.test(raw)) {'), worker.indexOf('if (LOCAL_FAULT_RE.test(raw)) {') + 700);
  is(/status: 'scheduled',/.test(branch), 'the local-fault branch must still re-queue rather than fail the row');
  is(/attempts: item\.attempts,/.test(branch), 'with the attempt unspent — this is the machine’s fault, not the group’s');
  is(/60_000/.test(branch), 'and a minute later, not fifteen');
}

/* ───── 4. the sweep this protects, and why the two must agree ──────────── */
{
  eq(MAYBE_LIVE_STEPS, ['publishing', 'verifying', 'submitted'], 'the maybe-live set changed — it is what the sweep reads, and this fix exists because a pre-click step reaching it means a re-queue');
  is(
    !MAYBE_LIVE_STEPS.includes('ready_to_publish'),
    "'ready_to_publish' must stay OUT of the maybe-live set: it is genuinely pre-click, and the fix is to stop the row ever being left there, not to widen the set and park healthy rows on the owner",
  );
  for (const preClick of ['opening', 'composer_opened', 'uploading_media', 'ready_to_publish']) {
    is(!MAYBE_LIVE_STEPS.includes(preClick), `'${preClick}' is before the click and must not be treated as maybe-live`);
  }
  /* The composer's own step list must not have grown a post-click step that
     this file does not know about. */
  const steps = /export type ComposerStep =([^;]+);/.exec(composer)?.[1] ?? '';
  const named = steps.split('|').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  eq(named, ['opening', 'composer_opened', 'uploading_media', 'ready_to_publish', 'publishing', 'verifying'], 'the composer gained or lost a step — re-read which side of the click it falls on before trusting the branch above');
}

console.log(`step-write OK — ${checks} assertions`);
