/**
 * NOTHING THE OWNER PRESSES MAY SPIN FOR EVER.
 *
 * "אחרי שאני משנה בהגדרות קמפיין פרמטרים הוא משנה אבל נתקע... אני רוצה אחרי
 *  שאני לוחץ שינוי בקמפיין זה מייד שומר ולא טוען מסך בלי סוף."
 *
 * He photographed "עדכן מרווח ל-30 שניות" with a spinner on it. Two separate
 * things put it there, and this file holds both of them down.
 *
 *   1. NO CEILING ON A REQUEST. supabase-js sets no timeout on anything, so a
 *      request whose connection dies mid-flight on a phone never settles —
 *      not an error, not a result. The await never returns, and neither does
 *      the `finally` that would have cleared the spinner. No screen can fix
 *      that from the outside, so the ceiling is in the client itself.
 *
 *   2. ONE ROUND TRIP PER PUBLICATION. PostgREST has no per-row UPDATE ...
 *      FROM, so re-spacing the queue is one request per row, and they were
 *      awaited one after another: forty-two rows over 4G is about fifteen
 *      seconds of a spinner with nothing moving on it, which is
 *      indistinguishable from a hang. Now they go in waves, and the button
 *      counts.
 *
 * The first half is RUN here rather than read: timedFetch is called with the
 * global fetch stubbed, and what it passes on is inspected.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { timedFetch } from '../../src/lib/supabase';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/* ─────────────────────────── 1. the ceiling, run ────────────────────────── */
{
  const supabase = src('../../src/lib/supabase.ts');
  is(/global: \{ fetch: timedFetch \}/.test(supabase), 'the browser client no longer goes through the timing fetch — every request is unbounded again');
  is(/const REQUEST_TIMEOUT_MS = 60_000;/.test(supabase), 'the ceiling is not sixty seconds any more');
  is(/AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/.test(supabase), 'the ceiling is not an AbortSignal timeout');
}

async function ceiling(): Promise<void> {
  const seen: (RequestInit | undefined)[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    seen.push(init);
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  try {
    /* An ordinary query carries a ceiling it did not ask for. */
    await timedFetch('https://example.supabase.co/rest/v1/social_queue?id=eq.1');
    const query = seen[0]?.signal;
    is(query instanceof AbortSignal, 'a query goes out with no abort signal — a dead connection would hang it for ever');
    is(query?.aborted === false, 'and it must not be aborted before it is even sent');

    /*
     * STORAGE IS EXEMPT, and that is the half that must never be "tidied
     * away": a post's photographs over a slow uplink can honestly take
     * minutes, and cutting an upload at sixty seconds would break publishing
     * in order to fix a spinner.
     */
    await timedFetch('https://example.supabase.co/storage/v1/object/social-media/a.jpg', { method: 'POST', body: 'x' });
    is(seen[1]?.signal == null, 'an upload is now cut off by the ceiling — a photo on a slow line takes longer than any query');
    is(seen[1]?.method === 'POST', 'and the rest of the request must pass through untouched');

    /* A caller's own signal still decides. */
    const mine = new AbortController();
    mine.abort();
    await timedFetch('https://example.supabase.co/rest/v1/social_queue?id=eq.2', { signal: mine.signal });
    is(seen[2]?.signal?.aborted === true, "a caller's own abort must survive being combined with the ceiling");
  } finally {
    globalThis.fetch = real;
  }
}

/* ──────────────────── 2. the re-stamp, in waves, counted ────────────────── */
{
  const client = src('../../src/lib/social/client.ts');
  const write = client.slice(client.indexOf('async function writeNewInstants'), client.indexOf('export async function respaceQueue'));
  is(write.length > 400, 'writeNewInstants is found');

  is(/const RESTAMP_LANES = \d+;/.test(client), 'the wave size is gone — the rows are written one round trip at a time again');
  const lanes = Number(/const RESTAMP_LANES = (\d+);/.exec(client)?.[1]);
  /*
   * THE RANGE WAS 2..12 AND THE OWNER FOUND THE TOP OF IT.
   *
   * Twelve was chosen before there was any evidence about how big a real queue
   * gets. His was 218 rows: at six lanes that is 37 waves plus about six round
   * trips of overhead, and on a phone on 4G it ran past the sheet's
   * ninety-second deadline — so he was told the change had not been confirmed
   * over a queue that had in fact been re-spaced correctly, to the second.
   *
   * The intent of this assertion is unchanged and still worth keeping: one at a
   * time is the bug this file exists for, and a flood is a different bug,
   * because the wave is what holds the direction of travel between waves and
   * anything it floods lands in a retry pass that is deliberately serial.
   *
   * What changed is that the number is no longer a guess. worker/test/
   * respace-speed.test.ts derives it from the deadline, the row cap and a
   * mobile round trip, and asserts the budget holds at half that speed too.
   * This stays as the coarse sanity bound; that file owns the real one.
   */
  is(lanes >= 2 && lanes <= 64, `a wave of ${lanes} is outside the sane range: one at a time is the bug, and a flood is a different one`);
  is(
    lanes >= 16,
    `a wave of ${lanes} is what timed out on a real 218-row queue — see worker/test/respace-speed.test.ts, which derives the floor from the sheet's own deadline`,
  );

  is(/for \(let at = 0; at < ordered\.length; at \+= RESTAMP_LANES\)/.test(write), 'the main pass no longer walks the queue in waves');
  is(/await Promise\.all\(/.test(write), 'and the rows inside a wave are no longer in flight together');

  /*
   * THE DIRECTION OF TRAVEL IS WHAT KEEPS THE SLOTS FREE, so the waves must
   * walk `ordered` — the list that was reversed for a queue moving later —
   * and the collision retry must stay one at a time.
   */
  is(/const ordered = movingLater \? \[\.\.\.work\]\.reverse\(\) : work;/.test(write), 'the direction of travel is gone, and with it the reason the waves are safe');
  const retry = write.slice(write.indexOf('for (const item of blocked)'));
  is(retry.length > 80 && !/Promise\.all/.test(retry), 'the collision retry must stay sequential — it is the resolver, and ordering is its whole point');

  /* A stalled write is one row's failure, not the sheet's. */
  is(/stallSignal\(\)/.test(write), 'a single re-stamp can hang for ever again');
  is(/const STALL_MS = 25_000;/.test(client), 'the per-write stall guard changed length without this test being told');
  is(/\.catch\(\(err: unknown\) => err \?\? new Error\('write failed'\)\)/.test(write), 'an aborted write must be counted, not thrown out of the whole run');

  /* And the count reaches the screen. */
  is(/onProgress\?: \(done: number, total: number\) => void/.test(client), 'the progress callback is gone, so the button has nothing to count');
  is(/writeNewInstants\(work, opts\.onProgress\)/.test(client), 'respaceQueue no longer forwards progress to the writer');
}

/* ───────────────────── 3. the sheet: it ends, and it counts ─────────────── */
{
  const tuner = src('../../src/components/social/QueueTunerSheet.tsx');
  is(/const SHEET_DEADLINE_MS = 90_000;/.test(tuner), 'the sheet-wide deadline is gone — a stalled read can hold the button for ever');
  /* The call gained a second argument — the live row counter, so the message
     can say how far it got instead of asking him to check by hand. The intent
     here is unchanged: the mutation must RUN under the deadline. Pinned whole
     rather than as a prefix, because a prefix that stops before the closing
     paren passes whatever is added later, which is the weakness this suite has
     been bitten by elsewhere. respace-speed.test.ts owns what the counter means. */
  is(
    /await withDeadline\(fn\(\), \(\) => progressRef\.current\)/.test(tuner),
    'the mutation is no longer run under the deadline',
  );
  is(/Promise\.race\(\[work, bell\]\)\.finally\(\(\) => clearTimeout\(timer\)\)/.test(tuner), 'the deadline no longer clears its own timer, or no longer races');

  /*
   * NOT CANCELLED, DELIBERATELY. A half-written queue is worse than a slow
   * one, so the deadline stops WAITING and says so; it does not abort the
   * work. The sentence has to be honest about that.
   */
  is(/השינוי נשלח, אבל לא קיבלנו אישור בזמן/.test(tuner), 'the deadline no longer tells the owner the change was sent — which it was');
  is(!/abort\(\)/.test(tuner), 'the deadline must not cancel the work: a queue half re-stamped is worse than a slow one');

  const run = tuner.slice(tuner.indexOf('const run = useCallback'), tuner.indexOf('const commitGap ='));
  is(/setProgress\(null\);[\s\S]{0,200}try \{/.test(run), 'the counter is not reset when a mutation starts');
  is(/finally \{[\s\S]{0,120}setBusy\(null\);[\s\S]{0,120}setProgress\(null\);/.test(run), 'the counter must be cleared with the spinner, in the same finally');

  /* The handler now writes the ref beside the state, so the deadline (which
     fires from a timer, outside render) can read a count that is current. Both
     writes are required: the ref alone leaves the visible line stale, the state
     alone leaves the message blind. */
  is(
    /onProgress: \(done, total\) => \{\s*progressRef\.current = \{ done, total \};\s*setProgress\(\{ done, total \}\);\s*\}/.test(tuner),
    'the re-space no longer reports its progress to the sheet',
  );
  is(/busy === 'respace' && progress[\s\S]{0,120}מעדכן… \$\{progress\.done\} מתוך \$\{progress\.total\}/.test(tuner), 'the button no longer counts while it works — a still spinner is what he photographed');
}

ceiling()
  .then(() => {
    console.log(`no-endless-spinner OK — ${checks} assertions, the request ceiling exercised against a stubbed fetch`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
