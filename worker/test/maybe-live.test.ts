import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * "רשום דולג , אבל בפועל נכנסתי וראיתי שזה פרסם , זה חמור מאד."
 *
 * He was right, and it was not the display.
 *
 * When the "פרסום" click may already have landed — the window closed, the
 * line dropped, the success write failed three times — the worker refuses to
 * guess. It parks the row as `needs_attention` with `step: 'submitted'`, the
 * mark meaning "a person must look in the group". That is the product's one
 * defence against publishing the same post twice to the same group, and it is
 * load-bearing in a way the status alone is not: rules.ts's two duplicate
 * guards count rows with `status = 'published'`, which a parked row never
 * gets, and plan.ts's targetsAlreadyWaiting holds the group only while a row
 * for that post is still OPEN. The parked row keeps that second guard shut.
 *
 * `needs_attention` is a WAITING status, so it is in CANCELLABLE — and every
 * bulk cancel in the product swept the parked row to 'skipped' with the rows
 * that genuinely never ran, writing `step: ''` over the mark. One of those
 * cancels, the planner's sweep of stopped campaigns, runs with nobody
 * pressing anything. The row goes terminal, both guards release, and the next
 * planner pass queues the same post to the same group again.
 *
 * So: every bulk cancel must exclude the mark, the planner's sweep most of
 * all, and the per-row cancel — a decision made by a person looking at that
 * row — may go through but may not erase it.
 *
 *   npx tsx worker/test/maybe-live.test.ts
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

/*
 * COMMENTS ARE NOT CODE, and in this file it matters twice over: the note on
 * cancelQueueItem explains why it must not write `step: ''` — by quoting
 * `step: ''` — and the first version of this test read that quote as the
 * thing it forbids and failed against a correct tree. Strings are kept,
 * because the Hebrew reasons ARE the code here.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (two === '//') {
      const end = src.indexOf('\n', i);
      i = end === -1 ? src.length : end;
      continue;
    }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      out += ch;
      i += 1;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const read = (p: string) => stripComments(readFileSync(new URL(p, import.meta.url), 'utf8'));
const client = read('../../src/lib/social/client.ts');
const plan = read('../../src/lib/social/plan.ts');
const worker = read('../social-worker.ts');
const status = read('../../src/lib/social/status.ts');

/* ───────── 1. the mark exists at both ends, and means one thing ───────── */

ok(/export const MAYBE_LIVE_STEP = 'submitted';/.test(client), 'the mark is a named constant, not a string repeated at seven call sites');
ok(/step: 'submitted'/.test(worker), 'and the worker is still what writes it');
/* Four writers in the worker: the startup sweep, the stranded sweep, and the
   two in-job parks. Fewer than four means one of them stopped marking. */
const marks = worker.split("step: 'submitted'").length - 1;
ok(marks >= 3, `the worker still parks maybe-live rows with the mark (found ${marks} writers)`);

/*
 * THE REASON THE MARK IS NEEDED AT ALL: 'needs_attention' is cancellable.
 * If that ever stops being true this whole file can go — and it should be
 * deleted deliberately, not silently outlived.
 */
ok(/export const CANCELLABLE_STATUSES: QueueStatus\[\] = \[\.\.\.WAITING_STATUSES\];/.test(status), 'CANCELLABLE is still every waiting status');
ok(/needs_attention: 'waiting'/.test(status), "…and 'needs_attention' is still one of them, which is exactly why the cancels need the guard below");

/* ───────── 2. every bulk cancel refuses a maybe-live row ──────────────── */

/*
 * Found structurally rather than by a list of line numbers: any statement in
 * client.ts that writes status 'skipped' over a SET of rows (it filters by
 * status rather than by one id) must carry the guard. A new cancel written
 * tomorrow is caught by this without anybody remembering to add it here.
 */
const statements = client.split(';');
const bulkCancels = statements.filter((st) => /status: 'skipped'/.test(st) && /\.in\('status', CANCELLABLE\)/.test(st));
ok(bulkCancels.length >= 6, `every bulk cancel is found by this test (found ${bulkCancels.length})`);
for (const st of bulkCancels) {
  const what = (st.match(/skip_reason: ([^,}]+)/) ?? [, '?'])[1].slice(0, 46);
  ok(/\.neq\('step', MAYBE_LIVE_STEP\)/.test(st), `a bulk cancel must not sweep a row whose post may be live — ${what}`);
}

/* The planner's sweep is the one nobody presses, so it is named explicitly
   rather than left to the structural search above (it lives in another file). */
const sweep = plan.slice(plan.indexOf('async function stoppedCampaigns'));
const body = sweep.slice(0, sweep.indexOf('\n}') + 2);
ok(/\.in\('status', CANCELLABLE_STATUSES\)/.test(body), 'the planner still sweeps a stopped campaign');
ok(/\.neq\('step', 'submitted'\)/.test(body), 'and it must leave the maybe-live rows alone — this is the cancel that runs by itself');
ok(/stopped_campaign_maybe_live/.test(body), 'and say how many it left, or they are a surprise waiting for him later');

/* ───────── 3. the per-row cancel decides, but does not destroy ────────── */

const manual = client.slice(client.indexOf('export async function cancelQueueItem'));
const manualBody = manual.slice(0, manual.indexOf('\n}') + 2);
ok(/CANCELLABLE/.test(manualBody), 'a person may still cancel one row by hand');
ok(!/step: ''/.test(manualBody), "…but may not clear the mark while doing it — a terminal row with no step says nothing about a post that may be out there");

/* ───────── 4. the one caller that always knew ─────────────────────────── */

const resume = client.slice(client.indexOf('export async function resumeNeedsAttention'));
ok(/\.neq\('step', 'submitted'\)|\.neq\('step', MAYBE_LIVE_STEP\)/.test(resume.slice(0, 2500)), 'resumeNeedsAttention still refuses them too — it is the precedent the rest of this file now follows');

/* ───────── 5. and the stop says what it left behind ───────────────────── */

const stop = client.slice(client.indexOf('export async function stopCampaign'));
const stopBody = stop.slice(0, stop.indexOf('\n}') + 2);
ok(/\.eq\('step', MAYBE_LIVE_STEP\)/.test(stopBody), 'stopCampaign counts the rows it did not cancel');
ok(/maybeLive/.test(stopBody), 'and puts the number where the owner reads it');
eq(
  (readFileSync(new URL('../../src/lib/social/activity.ts', import.meta.url), 'utf8').match(/stopped_campaign_maybe_live: '(\w+)'/) ?? [, ''])[1],
  'failure',
  'and that line is filed as a failure — a post may be live with nothing recording it, which is not quiet system news',
);

console.log(`✓ maybe-live: ${checks} בדיקות עברו`);
