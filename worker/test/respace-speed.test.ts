/**
 * RE-SPACING A REAL QUEUE HAS TO FINISH INSIDE THE SHEET'S OWN DEADLINE.
 *
 * The owner changed the gap on a 218-row queue and got
 * "השינוי נשלח, אבל לא קיבלנו אישור בזמן" — over a queue that had in fact been
 * re-spaced correctly. His screenshot proves it: 218 waiting, first at 14:30,
 * last at 16:18:30, which is 217 × 30s to the second. The arithmetic was right
 * and the REPORT timed out.
 *
 * THE CAUSE IS A COUNT OF ROUND TRIPS, so this file counts them. PostgREST has
 * no per-row UPDATE ... FROM, so every row is its own request, and they are
 * spent one wave after another. At six lanes his queue is 37 waves, plus about
 * six more round trips for the settings, the window read, the row read and the
 * activity line — forty-three, strictly serial, on a phone on 4G.
 *
 * AND THE SECOND HALF: when the deadline DOES fire, the sheet has been counting
 * rows all along ("מעדכן… 47 מתוך 218") and the message threw that number away.
 * Being asked to go and check by hand what the screen was counting a second
 * earlier is the same fault as the spinner this deadline replaced.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const client = src('../../src/lib/social/client.ts');
const tuner = src('../../src/components/social/QueueTunerSheet.tsx');

const num = (re: RegExp, where: string, what: string): number => {
  const m = re.exec(where);
  assert.ok(m, `${what} — not found`);
  return Number(m[1].replace(/_/g, ''));
};

/* ───────── 1. the budget, in round trips, for HIS queue ────────────────── */
{
  const lanes = num(/const RESTAMP_LANES = (\d+);/, client, 'RESTAMP_LANES');
  const limit = num(/const LIVE_QUEUE_LIMIT = (\d+);/, client, 'LIVE_QUEUE_LIMIT');
  const deadlineMs = num(/const SHEET_DEADLINE_MS = ([\d_]+);/, tuner, 'SHEET_DEADLINE_MS');

  /* Everything respaceQueue spends besides the row writes: two setting reads
     (parallel), two setting writes, the campaign-window read, the pending-row
     read and the activity line. */
  const OVERHEAD_TRIPS = 6;
  /* A pessimistic-but-real mobile round trip. His screenshot was taken at
     02:23 on 4G; 400ms is an ordinary figure for a Supabase round trip from an
     Israeli phone, and the point of the budget is to hold at that speed. */
  const TRIP_MS = 400;

  const tripsFor = (rows: number) => Math.ceil(rows / lanes) + OVERHEAD_TRIPS;

  const his = tripsFor(218);
  is(
    his * TRIP_MS < deadlineMs,
    `his own queue must fit the deadline: 218 rows at ${lanes} lanes is ${his} round trips, ${his * TRIP_MS}ms at ${TRIP_MS}ms each, against a ${deadlineMs}ms deadline`,
  );
  /* And with the headroom to still fit when the connection is half that speed,
     because "it worked on my connection" is how this shipped at six. */
  is(
    his * TRIP_MS * 2 < deadlineMs,
    `and at half that speed too — ${his * TRIP_MS * 2}ms against ${deadlineMs}ms. Without this the fix holds only for the phone it was measured on`,
  );
  /* The worst case the function will ever see is the cap it reads under. */
  is(
    tripsFor(limit) * TRIP_MS < deadlineMs,
    `a full ${limit}-row queue must fit as well: ${tripsFor(limit)} round trips, ${tripsFor(limit) * TRIP_MS}ms against ${deadlineMs}ms`,
  );
  /* Six is what produced his error; pin the direction so nobody walks it back. */
  is(lanes >= 16, `six lanes is what timed out on his 218-row queue — ${lanes} is not enough of a change to matter`);
  /*
   * AND AN UPPER BOUND, because wider is not monotonically better: the wave is
   * what keeps the direction of travel between waves, and rows that collide
   * inside one are handed to a retry pass that is deliberately one at a time.
   */
  is(lanes <= 64, `${lanes} lanes pushes collisions into the serial retry pass, which is slower than the waves it saved`);
  is(
    /The retry pass stays one at a time/.test(client),
    'the retry pass must still be serial — the bound above is only sound while it is, so if it ever becomes parallel re-derive the bound',
  );
}

/* ───────── 2. the deadline reports what the screen already knew ────────── */
{
  const fn = tuner.slice(tuner.indexOf('function withDeadline'), tuner.indexOf('const STEP = 30;'));
  is(fn.length > 400, 'withDeadline is found');
  is(/soFar\?: \(\) => \{ done: number; total: number \} \| null/.test(fn), 'the deadline must be able to ask how far the work got');
  is(
    /at\.done >= at\.total/.test(fn),
    'when every row was acknowledged the message must say so — sending him to check whether anything changed is sending him to verify work that is demonstrably finished',
  );
  is(/אין צורך לנסות שוב/.test(fn), 'and must say he need not try again');
  is(/at\.done > 0/.test(fn), 'a partial run must report its own number rather than fall back to the blind sentence');
  is(/מה שעודכן נשמר/.test(fn), 'and must say the finished rows are kept, because they are');
  /* The blind sentence stays for the one case it is true of: nothing counted. */
  is(/השינוי נשלח, אבל לא קיבלנו אישור בזמן/.test(fn), 'the original sentence must remain for the case it is actually true of — no row acknowledged at all');

  /* A REF, not the state: the timer fires outside render and would read the
     value closed over when the mutation started, which is always null. */
  is(/const progressRef = useRef<\{ done: number; total: number \} \| null>\(null\);/.test(tuner), 'the live count must be held in a ref');
  is(/withDeadline\(fn\(\), \(\) => progressRef\.current\)/.test(code(tuner)), 'and handed to the deadline');
  is(
    /progressRef\.current = \{ done, total \};\s*setProgress\(\{ done, total \}\);/.test(tuner),
    'the ref and the state must be written together, or the message and the line above it disagree',
  );
  is(!/withDeadline\(fn\(\)\);/.test(code(tuner)), 'no call site may still use the blind form');
}

console.log(`respace speed OK — ${checks} assertions`);
