import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * "זה נתקע פשוט" — a terminal sitting on `verifying`, two hundred
 * publications queued behind it, and nothing moving.
 *
 * It was not stuck. After the "פרסום" click the composer waits for Facebook's
 * post window to close, and that wait had been given VIDEO_UPLOAD_TIMEOUT —
 * fifteen minutes — whenever the post carried a video. The worker publishes in
 * ONE lane, so every video publication whose dialog lingered froze the whole
 * queue for a quarter of an hour, printing nothing in between.
 *
 * The number was wrong, not cautious: fifteen minutes is how long the UPLOAD
 * may take, and the upload is finished before the click — waitForUploads()
 * returns only after Facebook's own progress bar has appeared and gone. Two
 * different waits had collapsed into one constant.
 *
 * This file holds the three things that make that safe to shorten:
 *   1. the detach wait is its own constant, not the upload's;
 *   2. the upload wait is untouched, because that one really can take minutes;
 *   3. running out still carries afterSubmit, so the row is parked as "may
 *      already be published" rather than retried — shortening the wait can
 *      never turn into a second post.
 *
 *   npx tsx worker/test/detach-wait.test.ts
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

const composer = stripComments(readFileSync(new URL('../facebook/composer.ts', import.meta.url), 'utf8'));

/* ─────────── 1. the two waits are two numbers ─────────────────────────── */

const num = (name: string): number | null => {
  const m = composer.match(new RegExp(`const ${name} = ([^;]+);`));
  if (!m) return null;
  /* `3 * 60_000` — evaluated rather than parsed, so the test reads what the
     code means and not how it is spelled. */
  return Number(Function(`"use strict"; return (${m[1].replace(/_/g, '')});`)());
};

const upload = num('VIDEO_UPLOAD_TIMEOUT');
const detachVideo = num('SUBMIT_DETACH_VIDEO_MS');
const detachPlain = num('SUBMIT_DETACH_MS');

eq(upload, 15 * 60_000, 'the UPLOAD may still take fifteen minutes — that wait is not what was wrong');
ok(detachVideo !== null && detachPlain !== null, 'the detach wait has constants of its own');
ok((detachVideo as number) < (upload as number), 'and waiting for the window to close is no longer the upload timeout');
ok((detachVideo as number) <= 5 * 60_000, `a video post may not hold the only lane for more than five minutes after the click (is ${(detachVideo as number) / 60_000}m)`);
ok((detachPlain as number) >= 60_000, 'but a photo post still gets a full minute and a half — Facebook is sometimes slow and a false timeout costs a human check');
ok((detachVideo as number) >= (detachPlain as number), 'and a video is given at least as long as a photo, because it may be re-encoded');

/* ─────────── 2. the click site uses them, and nothing else ────────────── */

const verify = composer.slice(composer.indexOf("onStep('verifying')"));
const block = verify.slice(0, verify.indexOf('const publishedAt'));
ok(/SUBMIT_DETACH_VIDEO_MS/.test(block) && /SUBMIT_DETACH_MS/.test(block), 'the detach wait reads the detach constants');
ok(!/VIDEO_UPLOAD_TIMEOUT/.test(block), 'and never the upload timeout again — that conflation is the bug');
/* The upload wait still has it, or we fixed the wrong line. */
ok(/waitForUploads\([^)]*VIDEO_UPLOAD_TIMEOUT/.test(composer), 'the upload itself still gets the long timeout');

/* ─────────── 3. it says it is alive while it waits ────────────────────── */

ok(/DETACH_TICK_MS/.test(block), 'the wait is sliced, so the terminal is not silent for minutes');
ok(/ממתין לסגירת חלון הפוסט/.test(block), 'and each slice prints how long it has been waiting');
const tick = num('DETACH_TICK_MS');
ok(tick !== null && (tick as number) <= 30_000, 'a line at least every thirty seconds, or it still reads as frozen');

/* ─────────── 4. running out never becomes a second post ───────────────── */

/*
 * THE WHOLE SAFETY ARGUMENT FOR SHORTENING IT. `afterSubmit` is the third
 * argument of PublishError, and social-worker.ts turns it into
 * needs_attention/step='submitted' — a row a person checks, never one the
 * queue retries.
 */
const timeoutThrow = block.slice(block.indexOf("PublishError('timeout'"));
ok(timeoutThrow.length > 0, 'the timeout throw is still there');
ok(/,\s*true\s*\)/.test(timeoutThrow.slice(0, 300)), 'and it still carries afterSubmit — the post may be live, so the row goes to a person, not back to the queue');
const rejected = block.slice(block.indexOf("PublishError('rejected'"));
ok(/,\s*true\s*\)/.test(rejected.slice(0, 300)), 'and so does the branch where Facebook printed a refusal');

/* And the worker still honours it. */
const worker = stripComments(readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8'));
ok(/err instanceof PublishError && err\.afterSubmit/.test(worker), 'the worker still reads afterSubmit');
ok(/step: 'submitted'/.test(worker), "and still parks such a row with the mark that keeps it out of every bulk cancel");

console.log(`✓ detach-wait: ${checks} בדיקות עברו`);
