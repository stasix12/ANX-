/**
 * THE ROUND'S SECOND PASS — every rule in it, run.
 *
 * "פוסטים שנכשלו להעביר, לא להתעקב עליהם כמו שאמרנו — להחזיר אותם לתור אחרי
 *  שפרסם את כל הקבוצות בסבב ולנסות שוב."
 *
 * Five rules, and each one has a way of being wrong that reading the code does
 * not catch:
 *
 *   · "once more" without a ceiling loops a dead group for ever;
 *   · "the round has finished" that counts a row waiting on a PERSON never
 *     fires at all, on exactly the rounds that need it most;
 *   · a group whose next round already queued it gets a unique-index
 *     rejection instead of a publication;
 *   · two failures for the same group in one pass collide with each other;
 *   · "at the end of the queue" computed from `now` instead of from the tail
 *     publishes the second pass in the middle of the first.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REVIVE_ATTEMPT_CEILING,
  REVIVE_CUSHION_MS,
  STILL_WORKING,
  pickRevivable,
  type FailedRow,
  type OpenRow,
} from '../revive';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const GAP = 30_000;
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

const open = (o: Partial<OpenRow> = {}): OpenRow => ({
  status: 'scheduled',
  campaign_id: 'round-a',
  target_id: 't-open',
  scheduled_at: at(10),
  ...o,
});
const failed = (o: Partial<FailedRow> = {}): FailedRow => ({
  id: 'q1',
  campaign_id: 'round-a',
  target_id: 't-1',
  attempts: 1,
  ...o,
});
const pick = (input: { open?: OpenRow[]; failed?: FailedRow[]; gapMs?: number }) =>
  pickRevivable({ open: input.open ?? [], failed: input.failed ?? [], nowMs: NOW, gapMs: input.gapMs ?? GAP });

/* ───────────────────────── 1. once more, and only once ─────────────────── */
{
  eq(pick({ failed: [failed({ attempts: 1 })] }).length, 1, 'a publication that failed its first attempt must get one more');
  eq(pick({ failed: [failed({ attempts: 2 })] }).length, 0, 'and a publication that has already had its second pass must never come back again');
  eq(pick({ failed: [failed({ attempts: 7 })] }).length, 0, 'nor one from the old three-attempt ladder');
  eq(REVIVE_ATTEMPT_CEILING, 2, 'the ceiling is what makes "once more" once — changing it changes the promise');

  /* The loop this prevents, stated as the sequence it would be: revived at 1,
     claimed to 2, failed at 2, refused. */
  const once = pick({ failed: [failed({ attempts: 1 })] });
  eq(once.length, 1, 'first revival');
  eq(pick({ failed: [failed({ attempts: 2 })] }).length, 0, 'and the claim that follows it closes the door');
}

/* ─────────────────── 2. a round that is still working is left alone ─────── */
{
  const stillGoing = pick({ open: [open({ status: 'scheduled', campaign_id: 'round-a' })], failed: [failed({ campaign_id: 'round-a' })] });
  eq(stillGoing.length, 0, 'a round with rows still waiting on the clock has not finished its groups');

  const publishing = pick({ open: [open({ status: 'publishing', campaign_id: 'round-a', target_id: 'x' })], failed: [failed({ campaign_id: 'round-a' })] });
  eq(publishing.length, 0, 'nor one with a row in flight right now');

  const otherRound = pick({ open: [open({ campaign_id: 'round-b', target_id: 'x' })], failed: [failed({ campaign_id: 'round-a' })] });
  eq(otherRound.length, 1, 'another round still publishing must not hold this one back');

  /*
   * AND THE ONE THAT MATTERS MOST: a row waiting on a PERSON is not the
   * round still working. Those sit for days, and holding the second pass
   * behind one would mean it never ran on the rounds that have failures.
   */
  for (const human of ['needs_attention', 'manual_pending', 'awaiting_confirmation']) {
    const waiting = pick({ open: [open({ status: human, campaign_id: 'round-a', target_id: 'x' })], failed: [failed({ campaign_id: 'round-a' })] });
    eq(waiting.length, 1, `a row in ${human} is waiting on a person — it must not postpone the second pass for ever`);
    is(!STILL_WORKING.includes(human), `${human} must not count as the round still working`);
  }
  for (const machine of ['scheduled', 'publishing']) {
    is(STILL_WORKING.includes(machine), `${machine} is the machine still working and must count`);
  }

  /* A failure with no round of its own is keyed on '' and follows the same
     rule — one open quick publish means the account is still mid-flight. */
  eq(pick({ open: [open({ campaign_id: null, target_id: 'x' })], failed: [failed({ campaign_id: null })] }).length, 0, 'a quick publish still waiting holds back other quick publishes');
}

/* ─────────────────── 3. a group that is spoken for is skipped ───────────── */
{
  /* The next round queued this group again: one open row per group, so
     reviving it would be a unique-index rejection rather than a publication. */
  const taken = pick({
    open: [open({ campaign_id: 'round-b', target_id: 't-1' })],
    failed: [failed({ campaign_id: 'round-a', target_id: 't-1' })],
  });
  eq(taken.length, 0, "a group that already has an open row elsewhere must be left where it is");

  /* Even when the row holding it is only waiting on a person — the index
     counts that too, which is why `busyTargets` and `busyCampaigns` are built
     from different halves of the same list. */
  const human = pick({
    open: [open({ status: 'needs_attention', campaign_id: 'round-b', target_id: 't-1' })],
    failed: [failed({ campaign_id: 'round-a', target_id: 't-1' })],
  });
  eq(human.length, 0, 'the one-open-row-per-group index counts a row waiting on a person too');

  /* Two failures for the same group in one pass would collide with each
     other, so only the first goes. */
  const twice = pick({ failed: [failed({ id: 'a', target_id: 't-1' }), failed({ id: 'b', target_id: 't-1' })] });
  eq(twice.map((r) => r.id), ['a'], 'two failures for one group must not both be revived into open rows');
}

/* ───────────────────────── 4. where they land ──────────────────────────── */
{
  /* After the tail of the whole queue — "אחרי שפרסם את כל הקבוצות" — one gap
     apart, not all on the same instant (the slot index would reject that). */
  const out = pick({
    open: [open({ campaign_id: 'round-b', target_id: 'x', scheduled_at: at(10) }), open({ campaign_id: 'round-b', target_id: 'y', scheduled_at: at(25) })],
    failed: [failed({ id: 'a', target_id: 't-1' }), failed({ id: 'b', target_id: 't-2' }), failed({ id: 'c', target_id: 't-3' })],
  });
  eq(out.length, 3, 'three failures, three revivals');
  const first = Date.parse(out[0].at);
  eq(first, Date.parse(at(25)) + GAP, 'the second pass must start one gap after the LAST row in the queue, not after the first');
  eq(Date.parse(out[1].at) - first, GAP, 'and the revived rows must be a gap apart from each other');
  eq(Date.parse(out[2].at) - Date.parse(out[1].at), GAP, 'every one of them');

  /* An empty queue: from now, with a cushion, because a row stamped for this
     instant can be claimed before the write that moved it has settled. */
  const empty = pick({ failed: [failed()] });
  eq(Date.parse(empty[0].at), NOW + REVIVE_CUSHION_MS, 'with nothing in the queue the second pass starts from now plus the cushion');
  is(REVIVE_CUSHION_MS >= 1000, 'the cushion is what stops a row being claimed before its own write lands');

  /* A tail already in the past must not drag the pass backwards. */
  const stale = pick({ open: [open({ campaign_id: 'round-b', target_id: 'x', scheduled_at: at(-240) })], failed: [failed()] });
  is(Date.parse(stale[0].at) >= NOW, 'an overdue tail must not stamp the second pass in the past');

  /* A zero or nonsense gap may not produce a queue stacked on one instant. */
  const noGap = pick({ failed: [failed({ id: 'a', target_id: 't-1' }), failed({ id: 'b', target_id: 't-2' })], gapMs: 0 });
  is(Date.parse(noGap[1].at) > Date.parse(noGap[0].at), 'even with no gap configured, two revived rows may not share an instant');
}

/* ───────────────── 5. the worker really calls it, and guardedly ─────────── */
{
  const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  is(/await reviveFailedRows\(state, limits, browser\);/.test(worker), 'the worker no longer runs the second pass at all');
  is(/if \(!due\?\.length\) \{[\s\S]{0,400}reviveFailedRows/.test(worker), 'the second pass must run only when nothing is due — a round with rows left has not finished');

  const fn = worker.slice(worker.indexOf('async function reviveFailedRows'), worker.indexOf('function idle(state: WorkerState'));
  is(fn.length > 400, 'the sweep is found');
  is(/\.lt\('attempts', REVIVE_ATTEMPT_CEILING\)/.test(fn), 'the read no longer narrows by the attempt ceiling');
  is(/\.eq\('status', 'failed'\)[\s\S]{0,200}\.select\('id'\)/.test(fn), 'the write is no longer a compare-and-set on failed — a row retried by hand would be re-stamped under the owner');
  is(/confirmed_at: null/.test(fn), 'a re-queued row must not carry a confirmation stamp from the first pass');
  is(/status: 'scheduled',\s*step: 'pending'/.test(fn), 'a revived row must go back as a plain scheduled row');
  is(!/attempts:/.test(fn), 'the sweep must not touch `attempts` — that counter IS the record of the second pass');
  is(/REVIVE_EVERY_MS/.test(fn), 'the sweep must be paced, or it runs three reads every five seconds');

  /* And the guard around the call, so a transient database error cannot take
     the publishing loop down with it. */
  is(
    /try \{[\s\S]{0,200}await reviveFailedRows[\s\S]{0,400}catch \(err\) \{/.test(worker),
    'the second pass must not be able to throw out of the tick',
  );
}

console.log(`revive OK — ${checks} assertions`);
