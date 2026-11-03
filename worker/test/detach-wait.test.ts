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

/*
 * ONE CONSTANT MAY NOW BE WRITTEN IN TERMS OF ANOTHER.
 *
 * `SUBMIT_DETACH_VIDEO_MS = VIDEO_UPLOAD_TIMEOUT` is the honest spelling of
 * "as long as the upload may take, because Facebook transcodes inside the
 * same dialog" — and the first version of this helper evaluated the
 * right-hand side in an empty scope, so a name rather than an arithmetic
 * literal crashed it. It resolves names against the other constants in the
 * file now, to a fixed point, which also means a chain of two cannot quietly
 * read as null and skip the assertion that depends on it.
 */
const CONSTS: Record<string, string> = {};
for (const m of composer.matchAll(/const ([A-Z][A-Z0-9_]*) = ([^;]+);/g)) CONSTS[m[1]] = m[2];

const num = (name: string): number | null => {
  let expr = CONSTS[name];
  if (expr === undefined) return null;
  /* Substitute referenced constants until none are left. Bounded, so a
     circular definition fails the test instead of hanging it. */
  for (let pass = 0; pass < 8 && /[A-Z][A-Z0-9_]{2,}/.test(expr); pass++) {
    expr = expr.replace(/[A-Z][A-Z0-9_]{2,}/g, (ref) => (CONSTS[ref] !== undefined ? `(${CONSTS[ref]})` : ref));
  }
  if (/[A-Za-z]/.test(expr.replace(/_/g, ''))) return null;
  /* `3 * 60_000` — evaluated rather than parsed, so the test reads what the
     code means and not how it is spelled. */
  const value = Number(Function(`"use strict"; return (${expr.replace(/_/g, '')});`)());
  return Number.isFinite(value) ? value : null;
};

const upload = num('VIDEO_UPLOAD_TIMEOUT');
const detachVideo = num('SUBMIT_DETACH_VIDEO_MS');
const detachPlain = num('SUBMIT_DETACH_MS');

eq(upload, 15 * 60_000, 'the UPLOAD may still take fifteen minutes — that wait is not what was wrong');
ok(detachVideo !== null && detachPlain !== null, 'the detach wait has constants of its own');

/*
 * ─── THE TWO ASSERTIONS THAT USED TO LIVE HERE WERE WRONG, AND THEY WOULD
 *     HAVE BLOCKED THE FIX ─────────────────────────────────────────────────
 *
 * They read:
 *   ok(detachVideo < upload,        'waiting for the window to close is no longer the upload timeout');
 *   ok(detachVideo <= 5 * 60_000,   'a video post may not hold the only lane for more than five minutes');
 *
 * Both encoded an ARGUMENT rather than a measurement: that waitForUploads()
 * proves the bytes are at Facebook, so all that remains is the window coming
 * down, which is seconds. Sound, and false. For a video Facebook holds the
 * dialog open through TRANSCODING — work it does after the upload and before
 * it will accept the post, minutes long, invisible to waitForUploads(), and
 * nothing to do with bandwidth.
 *
 * His account settled it. 22:18 the constant went from 15 minutes to 3.
 * ~21:10 was the last video post that reached a group. By 04:10 there were
 * 215 attempts that day and 0 publications, every one ending in "חלון הפוסט
 * לא נסגר אחרי הלחיצה על פרסום" — and the group opened by hand held nothing
 * but the post from before the change. `git log --since 21:13 -- worker/`
 * names composer.ts exactly once in that window, in that commit.
 *
 * So the allowance goes back to the value that demonstrably published, and
 * the floor below is written as a FLOOR: this number may be raised, never
 * quietly shortened again on an argument. What actually fixed "זה נתקע פשוט"
 * was never the number — it was the slicing in section 3, which turned
 * fifteen minutes of silence into fifteen minutes that say how long they have
 * waited. That part stands, and that part is what this file really guards.
 */
ok(
  (detachVideo as number) >= 15 * 60_000,
  `a video post gets at least the fifteen minutes that demonstrably published; shortening it to 3 stopped 215 publications in one night (is ${(detachVideo as number) / 60_000}m)`,
);
ok((detachPlain as number) >= 60_000, 'but a photo post still gets a full minute and a half — Facebook is sometimes slow and a false timeout costs a human check');
ok(
  (detachPlain as number) <= 5 * 60_000,
  'and a PHOTO is still held to a short wait: the transcoding that justifies the long one does not happen for a photo, so a photo stuck past a few minutes is a real fault, not patience',
);
ok((detachVideo as number) > (detachPlain as number), 'a video is given strictly longer than a photo, because only the video is re-encoded');

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

/*
 * ─── AND IT TELLS THE DATABASE IT IS ALIVE, NOT ONLY THE TERMINAL ────────
 *
 * The slices made the wait legible to somebody standing at the machine. They
 * did nothing for the dashboard, which calls a worker offline after ninety
 * seconds of silence — and with the video allowance back at fifteen minutes
 * that silence is now ten times the threshold. A publication going perfectly
 * would read as "המחשב לא מחובר" ninety seconds after the click, and
 * pickStranded() reads the same ninety seconds as "that worker is gone", so
 * the row could be taken off a lane that is still holding it.
 *
 * onHold is the worker's heartbeat (social-worker.ts passes
 * `async () => heartbeat(state, 'online')`). The hold loop has always called
 * it; this one has to as well, for the same reason and more so.
 */
ok(/onHold\?\.\(\)/.test(block), 'the detach wait beats while it waits — the longest wait in the function may not be its most silent');
ok(/onHold\?\.\(\)\.catch\(/.test(block), 'and a failed heartbeat does not abort a publication that is still in progress');

const holdBlock = composer.slice(composer.indexOf('const holdFrom'), composer.indexOf("onStep('publishing')"));
ok(/onHold\?\.\(\)/.test(holdBlock), 'the notBefore hold still beats too — this test must not trade one silence for another');
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
