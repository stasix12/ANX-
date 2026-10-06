import assert from 'node:assert/strict';
import { planQueue } from '../../src/lib/social/plan';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * THE PLANNER MUST NOT SAY THE SAME THING EVERY MINUTE.
 *
 * "קבוצות לא נכנסו לסבב · 219 קבוצות לא נכנסו לתור בהפעלה הזו כי הפוסט כבר
 *  ממתין אליהן מסבב קודם · לפני פחות מדקה" — four of them, inside one minute.
 *
 * planQueue runs every 60 seconds and re-derives its whole 48-hour window each
 * pass. A ONE-OFF launch never showed this: it retires itself at the end of its
 * first pass, so it gets one chance to complain. A RECURRING schedule does not
 * retire, so every pass found the same groups still busy with the round already
 * running and wrote the same warning again — for ever, burying the activity log
 * and the notification bell under a fact that had not changed since the last
 * time it was written. It arrived with CHZARA, which is what made schedules
 * recurring in the first place.
 *
 * WHAT THIS FILE PINS DOWN is a sequence, not a value, so it drives the REAL
 * planQueue twice against a fake PostgREST that remembers what the first pass
 * wrote — because "it says it once and then goes quiet" cannot be observed in
 * a single call, and a single call is what every cheaper test would have made.
 *
 *   npx tsx worker/test/plan-noise.test.ts
 */

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};
const is = (c: unknown, msg: string) => {
  checks += 1;
  assert.ok(c, msg);
};

interface Row {
  id: string;
  target_id: string;
  post_id: string;
  scheduled_at: string;
  status: string;
}

/**
 * A Supabase that holds one post, one schedule and a queue, and answers the
 * eight shapes planQueue asks for. Writes land in `queue`, so a second pass
 * sees what the first one did — which is the whole point.
 */
interface Plan {
  id: string;
  post: string;
  mode: 'weekly' | 'now';
  targets: string[];
  busy: string[];
  /* Different hours, so two schedules in one pass cannot collide on a slot. */
  hour: string;
}

function world(plans: Plan[]) {
  const queue: Row[] = plans.flatMap((p) =>
    p.busy.map((t, i) => ({
      id: `pre-${p.id}-${i}`,
      target_id: t,
      post_id: p.post,
      /* Already waiting from the round that is still running. */
      scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
      status: 'scheduled',
    })),
  );
  const log: { level: string; event: string; message: string }[] = [];
  const schedules = plans.map((p) => ({
    id: p.id,
    post_id: p.post,
    mode: p.mode,
    timezone: 'Asia/Jerusalem',
    run_at: p.mode === 'now' ? new Date().toISOString() : null,
    /* Every weekday at an hour inside the horizon, so a slot always exists. */
    weekly: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [p.hour]])),
    interval_days: null,
    interval_time: null,
    target_ids: p.targets,
    active: true,
    planned_until: null,
  }));
  const allTargets = [...new Set(plans.flatMap((p) => p.targets))];

  const builder = (table: string) => {
    const f = new Map<string, unknown>();
    const chain: Record<string, unknown> = {};
    const add = (k: string, v: unknown) => {
      f.set(k, v);
      return chain;
    };
    for (const m of ['eq', 'neq', 'gte', 'lte', 'in', 'is', 'select', 'order', 'limit']) chain[m] = (k: string, v: unknown) => add(`${m}:${k}`, v);
    chain.not = (k: string, _op: string, v: unknown) => add(`not:${k}`, v);
    chain.update = (patch: Record<string, unknown>) => add('update', patch);

    const answer = (): { data: unknown; error: null; count: number } => {
      if (table === 'social_schedules') return { data: f.has('update') ? [] : schedules, error: null, count: 0 };
      if (table === 'social_posts') {
        const id = String(f.get('eq:id') ?? 'p1');
        return { data: { id, status: 'ready', campaign_id: `c-${id}`, base_text: 'מבצע', media: [] }, error: null, count: 0 };
      }
      if (table === 'social_campaigns') return { data: [], error: null, count: 0 };
      if (table === 'social_settings') return { data: [], error: null, count: 0 };
      if (table === 'social_variants') return { data: [], error: null, count: 0 };
      if (table === 'social_targets') return { data: allTargets.map((t) => ({ name: `קבוצה ${t}` })), error: null, count: 0 };
      if (table === 'social_queue') return { data: queue, error: null, count: queue.length };
      return { data: [], error: null, count: 0 };
    };
    chain.maybeSingle = () => Promise.resolve({ data: (answer().data as unknown[])?.length === undefined ? answer().data : null, error: null });
    chain.single = chain.maybeSingle;
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(res(answer()));
    /* The one write that matters: a row per (target, slot), refused when that
       pair is already there — the database's own unique key, which is what
       makes a re-plan idempotent. */
    chain.upsert = (row: Record<string, unknown>) => {
      const key = `${row.target_id}|${new Date(row.scheduled_at as string).toISOString()}`;
      const exists = queue.some((r) => `${r.target_id}|${new Date(r.scheduled_at).toISOString()}` === key);
      const written = exists ? [] : [{ id: `q${queue.length}` }];
      if (!exists) queue.push({ id: `q${queue.length}`, target_id: row.target_id as string, post_id: String(row.post_id), scheduled_at: row.scheduled_at as string, status: 'scheduled' });
      const out: Record<string, unknown> = {};
      out.select = () => Promise.resolve({ data: written, error: null });
      return out;
    };
    return chain;
  };

  const db = { from: builder } as unknown as SupabaseClient;
  const note = async (level: string, event: string, message: string) => {
    log.push({ level, event, message });
  };
  return { db, log, queue, note };
}

const skips = (log: { event: string }[]) => log.filter((e) => e.event === 'plan_targets_skipped').length;

async function main(): Promise<void> {
  /* ── 1. THE BUG: every group already busy, nothing to plan ───────────── */
  {
    const w = world([{ id: 's1', post: 'p1', mode: 'weekly', targets: ['t1', 't2', 't3'], busy: ['t1', 't2', 't3'], hour: '09:00' }]);
    await planQueue({ db: w.db, log: w.note as never });
    await planQueue({ db: w.db, log: w.note as never });
    await planQueue({ db: w.db, log: w.note as never });
    eq(
      skips(w.log),
      0,
      `A PASS THAT PLANNED NOTHING HAS NOTHING TO REPORT — it wrote ${skips(w.log)} warnings for a fact that had not changed, once a minute, for ever`,
    );
  }

  /* ── 2. AND THE REPORT IS NOT LOST: a partial occasion still says so ─── */
  {
    const w = world([{ id: 's1', post: 'p1', mode: 'weekly', targets: ['t1', 't2', 't3'], busy: ['t2'], hour: '09:00' }]);
    await planQueue({ db: w.db, log: w.note as never });
    eq(skips(w.log), 1, 'a pass that planned SOME and left one out says which — that is what this message is for');
    is(/קבוצה t2/.test(w.log.find((e) => e.event === 'plan_targets_skipped')!.message), 'and it names the group, because a count is not something anybody can act on');
  }

  /* ── 3. AND IT SAYS IT ONCE ──────────────────────────────────────────── */
  {
    /*
     * THE SEQUENCE IS THE CLAIM. The first pass plans what it can and reports
     * the group it could not; every pass after it finds the same rows already
     * written, plans nothing new, and must fall silent. One call could never
     * show this, which is why the fake database remembers.
     */
    const w = world([{ id: 's1', post: 'p1', mode: 'weekly', targets: ['t1', 't2', 't3'], busy: ['t2'], hour: '09:00' }]);
    await planQueue({ db: w.db, log: w.note as never });
    const after1 = skips(w.log);
    await planQueue({ db: w.db, log: w.note as never });
    await planQueue({ db: w.db, log: w.note as never });
    await planQueue({ db: w.db, log: w.note as never });
    eq(skips(w.log), after1, `said once and then quiet — three more passes added ${skips(w.log) - after1} repeats of it`);
  }

  /* ── 4. a one-off launch is untouched ────────────────────────────────── */
  {
    /* The case this message was written for, and the one that never produced
       the drip: the schedule retires after its first pass, so it had exactly
       one chance to complain. It still takes it. */
    const w = world([{ id: 's1', post: 'p1', mode: 'now', targets: ['t1', 't2'], busy: ['t2'], hour: '09:00' }]);
    await planQueue({ db: w.db, log: w.note as never });
    eq(skips(w.log), 1, 'a one-off launch still reports the group it left out');
  }

  /* ── 5. and nothing is reported when nothing was left out ────────────── */
  {
    const w = world([{ id: 's1', post: 'p1', mode: 'weekly', targets: ['t1', 't2'], busy: [], hour: '09:00' }]);
    await planQueue({ db: w.db, log: w.note as never });
    eq(skips(w.log), 0, 'a clean pass says nothing about groups it did not skip');
  }

  /* ── 6. TWO CAMPAIGNS, AND THE COUNT IS PER SCHEDULE ────────────────── */
  {
    /*
     * HIS ACTUAL SCREEN had four of these in one minute, for different
     * campaigns — one of them the 50-group Arad round. With a count taken from
     * the pass as a WHOLE, a campaign that planned nothing would report its
     * skips whenever ANY OTHER campaign in the same pass had planned
     * something: the drip would survive, just needing a second campaign to
     * trigger it. A single-schedule fixture cannot see that, and did not.
     */
    const w = world([
      /* Plans freely — every pass it has something new to write. */
      { id: 'sA', post: 'pA', mode: 'weekly', targets: ['a1', 'a2'], busy: [], hour: '09:00' },
      /* Entirely blocked, exactly like his round that is still running. */
      { id: 'sB', post: 'pB', mode: 'weekly', targets: ['b1', 'b2'], busy: ['b1', 'b2'], hour: '11:00' },
    ]);
    await planQueue({ db: w.db, log: w.note as never });
    eq(skips(w.log), 0, "a blocked campaign stays silent even when another campaign in the same pass planned rows");
  }

  console.log(`planner noise OK — ${checks} assertions, planQueue driven repeatedly against a database that remembers`);
}

void main();
