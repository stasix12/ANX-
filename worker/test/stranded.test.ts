/**
 * THE ROW THAT RETIRES A GROUP FOR EVER — every rule in the recovery, run.
 *
 * social_queue_one_open_per_target_idx allows one open row per group, and a row
 * left in 'publishing' is open. So this is not a delayed publication: the group
 * is excluded from every round the planner builds afterwards, the card reads רץ
 * below 100% for ever because the row never finishes, and one wedged row
 * shortens the next round of a DIFFERENT campaign — the lock is per group and
 * account-wide.
 *
 * Both existing recoveries miss it. The server's sweepStuck() sits below the
 * refusal that returns early when there is more than one business, and there
 * are two businesses now. The worker's startup sweep is scoped to its own
 * worker_id and runs only at startup.
 *
 * And the rule that outranks recovery itself: A ROW WHOSE POST MAY ALREADY BE
 * LIVE IS NEVER RE-QUEUED. Getting that backwards is a second post in the same
 * group, which is the one fault this product cannot afford — the owner has
 * already been bitten by it once.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAYBE_LIVE_STEPS,
  STRANDED_AFTER_MS,
  WORKER_GONE_AFTER_MS,
  pickStranded,
  type StrandedRow,
  type WorkerSeen,
} from '../stranded';
import { WORKER_OFFLINE_AFTER_SECONDS } from '@/lib/social/types';

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
const NOW = Date.parse('2026-11-01T12:00:00.000Z');
const SELF = 'this-machine';
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const row = (o: Partial<StrandedRow> = {}): StrandedRow => ({
  id: 'q1',
  status: 'publishing',
  step: 'opening_group',
  worker_id: null,
  claimed_at: ago(STRANDED_AFTER_MS + 60_000),
  ...o,
});
const worker = (o: Partial<WorkerSeen> = {}): WorkerSeen => ({ id: 'other', last_seen_at: ago(5_000), ...o });

const pick = (o: { rows: StrandedRow[]; workers?: WorkerSeen[]; workersKnown?: boolean; held?: string[] }) =>
  pickStranded({
    rows: o.rows,
    workers: o.workers ?? [],
    workersKnown: o.workersKnown ?? true,
    selfId: SELF,
    held: o.held ?? [],
    nowMs: NOW,
  });

/* ───────────────── 1. the distinction that must never invert ────────────── */
{
  /* Never reached the Post button: nothing was published, so there is nothing
     for a person to check and parking it would hold the group while he looks. */
  for (const step of ['pending', 'opening_group', 'uploading_media', 'composing', null]) {
    const out = pick({ rows: [row({ step })] });
    eq(out.requeue, ['q1'], `a row stranded at ${step ?? 'no step'} never reached the click — it must go back to the queue`);
    eq(out.park, [], 'and must not be sent to the owner to confirm an event that did not happen');
  }

  /* May be live. This is the half that must never be re-queued. */
  for (const step of MAYBE_LIVE_STEPS) {
    const out = pick({ rows: [row({ step })] });
    eq(out.park, ['q1'], `a row stranded at ${step} may already be on Facebook — it goes to the owner, never back to the queue`);
    eq(out.requeue, [], 'a second post in the same group is the one fault this product cannot afford');
  }

  /* The two lists must agree across the two files that hold them. */
  const worker = src('../social-worker.ts');
  const inWorker = /const MAYBE_LIVE_STEPS = \[([^\]]+)\]/.exec(worker)?.[1] ?? '';
  const parsed = inWorker.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  eq(parsed, MAYBE_LIVE_STEPS, 'the two MAYBE_LIVE_STEPS lists have drifted apart — which is exactly how a row that is live gets re-queued');
}

/* ─────────────────── 2. a fresh claim is work, not wreckage ─────────────── */
{
  eq(pick({ rows: [row({ claimed_at: ago(60_000) })] }).requeue, [], 'a claim one minute old is a publication in progress');
  eq(pick({ rows: [row({ claimed_at: ago(STRANDED_AFTER_MS - 1_000) })] }).requeue, [], 'and so is one just under the threshold');
  eq(pick({ rows: [row({ claimed_at: ago(STRANDED_AFTER_MS + 1_000) })] }).requeue, ['q1'], 'just over it is stranded');
  is(STRANDED_AFTER_MS >= 10 * 60_000, 'the threshold must be generous — publishing a post with images over a slow uplink legitimately takes minutes');

  /* A corrupt or missing timestamp is not permission to act. */
  eq(pick({ rows: [row({ claimed_at: null })] }).requeue, [], 'a row with no claim time must be left for a person — acting on it risks either a double post or taking a live publication out of the queue');
  eq(pick({ rows: [row({ claimed_at: 'not a date' })] }).requeue, [], 'and so must an unparseable one');
}

/* ──────────────── 3. whose row is it, and is that one alive ─────────────── */
{
  /* Held by this process right now: the lane will finish it. */
  eq(pick({ rows: [row({ worker_id: SELF, claimed_at: ago(3 * 3600_000) })], held: ['q1'] }).requeue, [], 'a row a lane is holding is never stranded, however old the claim — the publication is in flight');

  /* This process's claim with no lane behind it: the lane died without
     finishing, and the startup sweep only ever runs at startup. */
  eq(pick({ rows: [row({ worker_id: SELF })] }).requeue, ['q1'], "this process's own claim with no lane holding it must be recovered — a worker up for days never looks again, and the startup sweep covers only a restart");

  /* Another machine, still reporting: not ours to take. */
  eq(
    pick({ rows: [row({ worker_id: 'other' })], workers: [worker({ id: 'other', last_seen_at: ago(5_000) })] }).requeue,
    [],
    'a row claimed by a worker that is still reporting must be left alone — taking it is how two machines publish the same row',
  );

  /* Another machine, gone. */
  eq(
    pick({ rows: [row({ worker_id: 'other' })], workers: [worker({ id: 'other', last_seen_at: ago(10 * 60_000) })] }).requeue,
    ['q1'],
    'a row claimed by a worker that stopped reporting is stranded',
  );

  /* A worker that said goodbye is gone whatever its stamp says — the same
     rule listWorkers() now applies on the dashboard. */
  eq(
    pick({ rows: [row({ worker_id: 'other' })], workers: [worker({ id: 'other', last_seen_at: ago(1_000), status: 'offline' })] }).requeue,
    ['q1'],
    "a worker that reported 'offline' is gone even with a one-second-old stamp",
  );

  /* No worker_id at all: nobody is holding it. */
  eq(pick({ rows: [row({ worker_id: null })] }).requeue, ['q1'], 'a row nobody claimed is the plainest case of all');

  /* And when the workers read failed, "who is alive" is unknown. */
  const blind = pick({
    rows: [row({ id: 'a', worker_id: 'other' }), row({ id: 'b', worker_id: null }), row({ id: 'c', worker_id: SELF })],
    workersKnown: false,
  });
  eq(blind.requeue, ['b', 'c'], 'with the workers read failed, only rows nobody claimed and this process’s own orphans may be swept — another machine’s row is left to the server’s sweep');
}

/* ───────────────── 4. the liveness window matches the product's ─────────── */
{
  eq(WORKER_GONE_AFTER_MS, WORKER_OFFLINE_AFTER_SECONDS * 1000, 'the sweep and the dashboard must agree on when a computer is gone, or the screen says connected while the sweep takes its rows away');
}

/* ───────── 5. the sweep that already existed, finally reachable ─────────── */
{
  const server = src('../../src/lib/social/server/worker.ts');
  const run = server.slice(server.indexOf('export async function runWorker('), server.indexOf('async function runWorkerLocked('));
  is(run.length > 300, 'runWorker is found');
  const sweepAt = run.indexOf('sweepStuck(db)');
  const refusalAt = run.indexOf('moreThanOneBusiness(db)');
  is(sweepAt >= 0, 'runWorker no longer recovers stranded rows at all');
  is(refusalAt >= 0, 'the multi-business refusal is gone from runWorker — this test is pinned to its position');
  is(
    sweepAt < refusalAt,
    'the stranded-row sweep must run BEFORE the "more than one business" refusal. There are two businesses now, so below it the sweep never runs — and a row left in ‘publishing’ bars its group from every future round, for ever',
  );

  /* It must not ALSO still run inside the locked body, or every run pays for
     it twice. */
  const locked = server.slice(server.indexOf('async function runWorkerLocked('));
  is(!/^\s*await sweepStuck\(db\);/m.test(locked), 'the sweep must have moved, not been duplicated — two calls per run is two sets of writes for one job');
}

/* ────────────── 6. and the worker really runs its own, repeatedly ───────── */
{
  const worker = src('../social-worker.ts');
  is(/await sweepStranded\(state\)/.test(worker), 'the worker no longer sweeps stranded rows at all — it is the one process that certainly runs for this owner, whatever the cron is doing');
  is(
    /if \(Date\.now\(\) - state\.lastStrandedAt < STRANDED_EVERY_MS\) return;/.test(worker),
    'the sweep must stand down between looks — without the early return it is two reads every five seconds, for ever',
  );
  const fn = worker.slice(worker.indexOf('async function sweepStranded'), worker.indexOf('async function sweepStranded') + 2600);
  is(fn.length > 500, 'sweepStranded is found');
  is(/pickStranded\(/.test(fn), 'and it must take its decision from the tested rules, not re-derive them inline');
  is(/step: 'submitted'/.test(fn), "a parked row must carry 'submitted', which the bulk “המשך סבב” deliberately skips");
  is(/status: 'scheduled',\s*step: 'pending'/.test(fn), 'a re-queued row must go back as a plain scheduled row');
  is(
    /try \{[\s\S]{0,300}sweepStranded[\s\S]{0,400}catch/.test(worker),
    'the sweep must not be able to throw out of the tick — a transient database error may not take the publishing loop down',
  );
}

console.log(`stranded OK — ${checks} assertions`);
