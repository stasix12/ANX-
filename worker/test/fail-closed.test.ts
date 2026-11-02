/**
 * A READ THAT FAILED IS NOT AN ANSWER — AND THE PROOF IS RUN, NOT READ.
 *
 * Five queries decide whether a post may go out. Four of them threw their
 * error away and read the empty result that came back with it as a fact:
 *
 *   1  "is this campaign still active?"      → no answer read as NOT paused
 *   2  "when did this campaign last publish?" → no answer read as NEVER
 *   3  "has this post reached this group?"    → no answer read as NO
 *   4  "when did anything last publish?"      → no answer read as NEVER
 *
 * Every one of those four readings is the permissive one. So a single dropped
 * connection — an ordinary event between a Windows PC and Supabase — did not
 * delay a publication, it REMOVED A RULE:
 *
 *   · a campaign the owner had PAUSED published;
 *   · the interval he set inside the campaign was not applied at all;
 *   · THE SAME POST PUBLISHED TWICE TO THE SAME GROUP — the one thing this
 *     engine exists to refuse, and the complaint it was written for;
 *   · the minimum gap protecting his Facebook account was not enforced.
 *
 * And none of it would show anywhere. The post publishes, successfully, by a
 * rule nobody switched off.
 *
 * The unique index does not cover this. social_queue_one_open_per_target_idx
 * constrains OPEN rows per target; a second publication of the same post two
 * hours later is not an open row.
 *
 * WHAT THIS FILE DOES. It drives the REAL evaluateQueueItem against a fake
 * PostgREST, failing exactly one read per case and asserting the decision is
 * `wait` — the action that costs one minute and gives the attempt back. The
 * control case answers every read cleanly and asserts `publish`, so each wait
 * below is caused by the failure and by nothing else. A source scan cannot
 * prove this; only making the decision can.
 *
 *   npx tsx worker/test/fail-closed.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateQueueItem } from '../../src/lib/social/rules';
import type { RuleDecision } from '../../src/lib/social/rules';
import { DEFAULT_LIMITS } from '../../src/lib/social/types';
import type { SupabaseClient } from '@supabase/supabase-js';

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};
const is = (c: unknown, msg: string) => {
  checks += 1;
  assert.ok(c, msg);
};

/* ──────────────────── a PostgREST that can also fail ────────────────────── */

interface Call {
  table: string;
  filters: [string, unknown][];
}

/**
 * The slice of the query builder rules.ts uses. Both endings matter and the
 * sibling fake in repeat-rules.test.ts only honours one of them: a read ended
 * with .maybeSingle() AND a read that is simply awaited (the list read and the
 * head count) have to be able to come back as an error, or the three cases
 * below that use the awaited form would quietly test the happy path.
 */
function fakeDb(answer: (c: Call) => unknown): { db: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const add = (k: string, v: unknown) => {
      call.filters.push([k, v]);
      return chain;
    };
    for (const m of ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'is']) chain[m] = (k: string, v: unknown) => add(`${m}:${k}`, v);
    chain.not = (k: string, op: string, v: unknown) => add(`not:${k}:${op}`, v);
    chain.select = (cols: string) => add('select', cols);
    chain.order = (k: string) => add('order', k);
    chain.limit = (n: number) => add('limit', n);
    const shaped = () => {
      const a = answer(call) as { error?: unknown; data?: unknown; count?: number } | null;
      if (a && typeof a === 'object' && 'error' in a) return { data: null, count: null, error: a.error };
      return { data: (a as { data?: unknown } | null)?.data ?? a ?? null, count: (a as { count?: number } | null)?.count ?? 0, error: null };
    };
    chain.maybeSingle = () => Promise.resolve(shaped());
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(res(shaped()));
    return chain;
  };
  return { db: { from: builder } as unknown as SupabaseClient, calls };
}

/* ───────────────────── which of the five reads is this? ─────────────────── */

type Read = 'campaign_schedule' | 'campaign_status' | 'campaign_last' | 'post_to_target' | 'account_last' | 'other';

/**
 * Named by what the query ASKS, not by the order it arrives in, so adding a
 * read to the engine cannot silently shift a case onto the wrong query.
 */
function which(c: Call): Read {
  const f = new Map(c.filters);
  const select = String(f.get('select') ?? '');
  if (c.table === 'social_campaigns') return select.includes('repeat_enabled') ? 'campaign_schedule' : 'campaign_status';
  if (c.table !== 'social_queue') return 'other';
  /*
   * `not('published_at','is',null)` is what separates the two "when did it
   * last publish" reads from the three DAILY COUNTS, which filter on
   * `gte:published_at` instead and go through countPublished — a function that
   * already throws on its error. Without this condition the per-campaign count
   * classifies as campaign_last, and the case that breaks campaign_last would
   * be breaking a read whose failure is handled somewhere else entirely.
   */
  const lastPublication = f.has('not:published_at:is');
  if (f.has('eq:post_id') && f.has('eq:target_id')) return 'post_to_target';
  if (lastPublication && f.has('eq:campaign_id')) return 'campaign_last';
  if (lastPublication && f.has('eq:status')) return 'account_last';
  return 'other';
}

const NOW = new Date('2026-11-02T10:00:00+02:00');
const DEAD = { message: 'TypeError: fetch failed' };

const TARGET = { id: 'g1', name: 'ניקוי ספות באר שבע', channel: 'facebook_group', enabled: true } as never;
const POST = { id: 'p1', status: 'ready', campaign_id: 'c1', base_text: 'מבצע ניקוי ספות', media: [] } as never;
const ITEM = { id: 'q9', campaign_id: 'c1', post_id: 'p1', target_id: 'g1', status: 'scheduled', dedupe_hash: null, attempts: 0 } as never;

/**
 * One decision, with exactly one read broken.
 *
 * Everything else answers the way a healthy database would for a post that is
 * cleared to go: an active campaign, a window that is open now, nothing
 * published before. `fail: null` is the control.
 */
async function decide(opts: { fail: Read | null; scheduleColumnsMissing?: boolean; status?: string }) {
  const { db, calls } = fakeDb((c) => {
    const read = which(c);
    if (read === opts.fail) return { error: DEAD };
    switch (read) {
      case 'campaign_schedule':
        /* A database that predates the schedule columns: PostgREST refuses the
           whole select, which is the ONE error the engine is allowed to read
           as an answer, and the status-only read below is the fallback. */
        if (opts.scheduleColumnsMissing) return { error: { message: 'column social_campaigns.repeat_enabled does not exist' } };
        return {
          status: opts.status ?? 'active',
          schedule_enabled: true,
          schedule_days: [0, 1, 2, 3, 4, 5, 6],
          schedule_start: '00:00',
          schedule_gap_minutes: 1,
          repeat_enabled: false,
          repeat_min_hours: 20,
        };
      case 'campaign_status':
        return { status: opts.status ?? 'active' };
      case 'campaign_last':
        return null;
      case 'post_to_target':
        return { data: [] };
      case 'account_last':
        return null;
      default:
        return null;
    }
  });
  const decision = await evaluateQueueItem(db, {
    item: ITEM,
    target: TARGET,
    post: POST,
    variant: null,
    limits: { ...DEFAULT_LIMITS, minGapMinutes: 0 },
    now: NOW,
  });
  return { decision, reads: calls.map(which) };
}

/* `publish` carries no reason, so the union has to be narrowed rather than
   widened — the first draft typed the parameter as { reason?: string } and tsc
   refused it, which is the second time this session the typecheck has caught
   something no test could see. */
const reasonOf = (d: RuleDecision) => ('reason' in d ? d.reason : '');

async function main(): Promise<void> {
  /* ─────── 0. THE CONTROL: a healthy database lets this post out ────────── */
  {
    const { decision, reads } = await decide({ fail: null });
    eq(decision.action, 'publish', 'with every read answering, this post is cleared to publish — without that the waits below prove nothing');
    /* And all four reads under test were actually reached, or a case below
       would be failing a query the engine never makes. */
    for (const r of ['campaign_schedule', 'campaign_last', 'post_to_target', 'account_last'] as Read[]) {
      is(reads.includes(r), `the control never performed the "${r}" read — the case that fails it is testing nothing`);
    }
  }

  /* ─────── 1. the schedule read — the window and the days ───────────────── */
  {
    const { decision } = await decide({ fail: 'campaign_schedule' });
    eq(decision.action, 'wait', 'a failed schedule read must not publish: the fallback reports "no schedule", and every hour of every day becomes allowed');
    is(/הגדרות התזמון/.test(reasonOf(decision)), 'and the sentence must say which read failed');
    is((decision as { attention?: boolean }).attention === true, 'a wait the machine caused must be marked for the activity log');
  }

  /* ─────── 2. the status read — a PAUSED campaign must not publish ──────── */
  {
    const { decision } = await decide({ fail: 'campaign_status', scheduleColumnsMissing: true });
    eq(decision.action, 'wait', 'the fallback read decides whether the campaign is paused or stopped; losing it must not be read as "running"');
    is(/אם הסבב פעיל/.test(reasonOf(decision)), 'and the sentence must name it');
    is((decision as { attention?: boolean }).attention === true, 'marked for the log');
  }
  {
    /* THE CASE THAT GIVES case 2 ITS TEETH. On the same path, with the read
       answering, "paused" is obeyed — so what case 2 prevents is a real
       publication of a campaign the owner stopped by hand. */
    const { decision } = await decide({ fail: null, scheduleColumnsMissing: true, status: 'paused' });
    eq(decision.action, 'wait', 'a paused campaign waits');
    is(/מושהה/.test(reasonOf(decision)), 'with the pause as its reason');
    is(
      (decision as { attention?: boolean }).attention !== true,
      'an ordinary pause must NOT be marked for the log — it happens on every poll of every paused campaign and would bury the feed',
    );
  }

  /* ─────── 3. the campaign's own last publication — his interval ────────── */
  {
    const { decision } = await decide({ fail: 'campaign_last' });
    eq(decision.action, 'wait', 'losing this read reads as "nothing has published yet", and the campaign\'s own interval has nothing to measure from');
    is(/פרסם לאחרונה/.test(reasonOf(decision)), 'and the sentence must say so');
    is((decision as { attention?: boolean }).attention === true, 'marked for the log');
  }

  /* ─────── 4. THE DOUBLE PUBLISH — the one this engine exists for ───────── */
  {
    const { decision } = await decide({ fail: 'post_to_target' });
    eq(
      decision.action,
      'wait',
      'an undefined list read as an empty one means "this post never reached this group" — one failed request and the same post publishes to the same group twice',
    );
    is(/כבר פורסם לקבוצה/.test(reasonOf(decision)), 'and the sentence must name the check that could not run');
    is((decision as { attention?: boolean }).attention === true, 'marked for the log');
  }
  {
    /* The teeth again: with the read answering, a group that already has this
       post is refused. That is what case 4 protects. */
    const { db } = fakeDb((c) => {
      const read = which(c);
      if (read === 'post_to_target') return { data: [{ published_at: new Date(NOW.getTime() - 3_600_000).toISOString() }] };
      if (read === 'campaign_schedule') return { status: 'active', schedule_enabled: false, repeat_enabled: false, repeat_min_hours: 20 };
      return null;
    });
    const decision = await evaluateQueueItem(db, {
      item: ITEM,
      target: TARGET,
      post: POST,
      variant: null,
      limits: { ...DEFAULT_LIMITS, minGapMinutes: 0 },
      now: NOW,
    });
    eq(decision.action, 'skip', 'a post that already reached this group is refused — which is exactly the rule a failed read was switching off');
  }

  /* ─────── 5. the account-wide gap — the belt around his account ────────── */
  {
    const { decision } = await decide({ fail: 'account_last' });
    eq(decision.action, 'wait', 'losing this read skips the whole spacing block: the minimum gap between any two publications is not enforced at all');
    is(/הפרסום האחרון/.test(reasonOf(decision)), 'and the sentence must say which read failed');
    is((decision as { attention?: boolean }).attention === true, 'marked for the log');
  }

  /* ─────── 6. AND THE CLASS IS CLOSED, not just these five ──────────────── */
  {
    /*
     * The bug was never one query, it was a HABIT: `const { data } = await db`
     * discards the error by construction, and every future read written that
     * way reopens this file's whole subject. There is now not one left in
     * rules.ts, and this is what keeps it that way — comments stripped first,
     * because a sentence quoting code has defeated three guards in this suite
     * already.
     */
    const rules = readFileSync(new URL('../../src/lib/social/rules.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const offenders = [...rules.matchAll(/const \{\s*data[\s,:}][^\n]*/g)].map((m) => m[0].trim());
    eq(
      offenders,
      [],
      `a read in rules.ts destructures \`data\` without its \`error\` again — that single habit is this whole file's subject: ${offenders.join(' | ')}`,
    );
    /* And every read that remains is inspected. Five reads, five error checks
       (countPublished throws on its own, which is the sixth). */
    const guarded = (rules.match(/\.error\b/g) ?? []).length;
    is(guarded >= 6, `only ${guarded} error checks left in rules.ts — there are five reads plus the count, and each needs one`);
  }

  console.log(`fail-closed OK — ${checks} assertions, the engine's five reads each broken in turn against a real decision`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
