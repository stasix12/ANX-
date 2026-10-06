import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateQueueItem } from '../../src/lib/social/rules';
import { DEFAULT_LIMITS } from '../../src/lib/social/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * CHZARA — THE DECISION ITSELF, RUN, not read off the source.
 *
 * "אותו פוסט לאותן קבוצות כל יום."
 *
 * That is the one thing this engine was built to refuse. rules.ts has carried
 * a flat "never twice to the same group" since the first week, for a good
 * reason: group publishing runs through the owner's own Facebook session, so
 * repeating identical content to one group risks HIS account. He has now asked
 * for the repeat, in writing, after being told what it costs.
 *
 * SO THE RULE WAS NOT REMOVED. IT WAS GIVEN A CLOCK — "not again within N
 * hours" instead of "not again" — and this file is the proof that the clock is
 * real. Four things have to hold together or the switch is worse than not
 * having one:
 *
 *   1  OFF IS UNCHANGED. A campaign that has not asked for this, or whose
 *      database has never heard of the columns, still gets "never twice".
 *   2  ON STILL REFUSES A REPEAT THAT IS TOO SOON. Nineteen hours is not a day.
 *   3  TOO SOON IS DEFERRED, NEVER SKIPPED. A skip would shrink every round
 *      after the first — 219 groups on Monday, 180 on Tuesday — with no reason
 *      on any screen.
 *   4  THE DEFERRAL LANDS WHEN THE WAIT IS ACTUALLY OVER, not a poll earlier.
 *
 * It drives the REAL evaluateQueueItem against a fake PostgREST, because the
 * only way to be sure what a decision is is to make it.
 *
 *   npx tsx worker/test/repeat-rules.test.ts
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

/* ───────────────────────── a Supabase that answers ──────────────────────── */

interface Call {
  table: string;
  filters: [string, unknown][];
}

/**
 * The query builder rules.ts uses, as far as it uses it: a chain of filters
 * that is awaited, or ended with .maybeSingle(). Every call is recorded, so a
 * test can assert what was ASKED as well as what was decided — the repeat
 * check must still be scoped to this post and this target, and a loosened
 * query would be a second change hiding inside the first.
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
    chain.maybeSingle = () => {
      /*
       * A READ THAT FAILS IS A SHAPE THIS FAKE HAS TO BE ABLE TO PRODUCE.
       *
       * The first version always answered `error: null`, so the "database
       * without the v25 columns" case below never reached the fallback it was
       * written to exercise — it silently tested the happy path twice, and a
       * mutation that made the repeat default to ON walked straight past it.
       * An answer carrying an `error` key is now returned as the error.
       */
      const a = answer(call) as { error?: unknown; data?: unknown } | null;
      if (a && typeof a === 'object' && 'error' in a) return Promise.resolve({ data: null, error: a.error });
      return Promise.resolve({ data: a ?? null, error: null });
    };
    /* Awaiting the builder itself is how rules.ts ends a list read and a head
       count, so it is a thenable that resolves to the same shaped answer. */
    chain.then = (res: (v: unknown) => unknown) => {
      const a = answer(call) as { data?: unknown; count?: number } | null;
      return Promise.resolve(res({ data: (a as { data?: unknown })?.data ?? a ?? null, count: (a as { count?: number })?.count ?? 0, error: null }));
    };
    return chain;
  };
  return { db: { from: builder } as unknown as SupabaseClient, calls };
}

const NOW = new Date('2026-10-07T08:00:00+03:00');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const TARGET = { id: 'g1', name: 'באר שבע ביחד', channel: 'facebook_group', enabled: true } as never;
const POST = { id: 'p1', status: 'ready', campaign_id: 'c1', base_text: 'מבצע ניקוי ספות', media: [] } as never;
const ITEM = { id: 'q9', campaign_id: 'c1', post_id: 'p1', target_id: 'g1', status: 'scheduled', dedupe_hash: null, attempts: 0 } as never;

/**
 * One decision, with the whole world configured by three facts: whether the
 * campaign repeats, how long ago this post last reached this group, and how
 * long ago anything at all published.
 */
async function decide(opts: { repeat?: { enabled: boolean; minHours: number } | null; lastToThisGroup?: string | null; columnsMissing?: boolean; campaignGone?: boolean }) {
  const { db, calls } = fakeDb((c) => {
    if (c.table === 'social_campaigns') {
      /* The row is simply not there — a campaign deleted while its queue rows
         survived. BOTH reads come back empty and the engine has nothing to
         read a repeat off at all. */
      if (opts.campaignGone) return null;
      /* A database that has not run v25 — the select names columns that do not
         exist, so PostgREST fails the whole read and rules.ts falls back. */
      if (opts.columnsMissing && c.filters.some(([k, v]) => k === 'select' && String(v).includes('repeat_enabled'))) {
        return { error: { message: 'column social_campaigns.repeat_enabled does not exist' } };
      }
      /* The fallback read asks for the status alone, and that is all it gets —
         anything else here would hand the engine columns it just proved are
         not in the database. */
      if (opts.columnsMissing) return { status: 'active' };
      return {
        status: 'active',
        schedule_enabled: false,
        repeat_enabled: opts.repeat?.enabled ?? false,
        repeat_min_hours: opts.repeat?.minHours ?? 20,
      };
    }
    /* The repeat read: scoped to this post AND this target, ordered newest. */
    const f = new Map(c.filters as [string, unknown][]);
    if (f.get('eq:post_id') === 'p1' && f.get('eq:target_id') === 'g1') {
      return { data: opts.lastToThisGroup ? [{ published_at: opts.lastToThisGroup }] : [] };
    }
    /* Nothing else has published, so neither spacing rule has anything to say
       and the decision this file is about is the only one left. */
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
  return { decision, calls };
}

async function main(): Promise<void> {
  /* ── 1. OFF IS EXACTLY WHAT IT ALWAYS WAS ──────────────────────────────── */
  {
    const { decision } = await decide({ repeat: null, lastToThisGroup: hoursAgo(400) });
    eq(decision.action, 'skip', 'with the repeat off, a post that reached this group is never sent again');
    is(/כבר פורסם/.test((decision as { reason: string }).reason), 'and the reason is the one it has always been');
  }
  {
    /* SIXTEEN DAYS AGO AND STILL REFUSED. "Never" has no window, and that is
       the behaviour every existing campaign keeps. */
    const { decision } = await decide({ repeat: { enabled: false, minHours: 20 }, lastToThisGroup: hoursAgo(16 * 24) });
    eq(decision.action, 'skip', 'off means off however long ago it was');
  }
  {
    /*
     * A DATABASE THAT HAS NOT RUN v25 READS AS OFF, which is the safe end of
     * the choice: the fallback read drops the two columns, readRepeat resolves
     * `enabled: false`, and the engine behaves exactly as it does today.
     */
    const { decision } = await decide({ repeat: { enabled: true, minHours: 20 }, lastToThisGroup: hoursAgo(400), columnsMissing: true });
    eq(decision.action, 'skip', 'a database without the columns falls back to "never twice", never to "always"');
  }
  {
    /* And with nothing published to this group, nothing is in the way. */
    const { decision } = await decide({ repeat: null, lastToThisGroup: null });
    eq(decision.action, 'publish', 'a group this post has not reached is published to');
  }

  /* ── 2 & 3. ON: TOO SOON IS HELD, NOT DROPPED ─────────────────────────── */
  {
    const { decision } = await decide({ repeat: { enabled: true, minHours: 20 }, lastToThisGroup: hoursAgo(19) });
    eq(decision.action, 'defer', 'NINETEEN HOURS IS NOT A DAY — a repeat that is too soon waits');
    is(!/skip/.test(decision.action), 'and it is NOT dropped: a skip would shrink every round after the first');
    is(/החזרה הבאה/.test((decision as { reason: string }).reason), 'and the line says when it comes back rather than that it failed');
    /*
     * 4 — AND IT WAKES UP WHEN THE WAIT IS OVER, not a poll before it. An
     * instant even a second early is a row that defers again, and again, until
     * MAX_DEFERRALS throws it away — which is how a "waiting" row becomes a
     * silent loss.
     */
    const until = new Date((decision as { until: string }).until).getTime();
    const earliestLegal = new Date(hoursAgo(19)).getTime() + 20 * 3_600_000;
    is(until >= earliestLegal, `the deferral must land at or after the legal instant (${new Date(until).toISOString()} vs ${new Date(earliestLegal).toISOString()})`);
    is(until - earliestLegal < 60_000, 'and not meaningfully later — the round would walk off its hour');
  }
  {
    const { decision } = await decide({ repeat: { enabled: true, minHours: 20 }, lastToThisGroup: hoursAgo(21) });
    eq(decision.action, 'publish', 'TWENTY-ONE HOURS IS A DAY — the repeat goes out');
  }
  {
    /* The boundary itself: at exactly the interval, the wait is over. */
    const { decision } = await decide({ repeat: { enabled: true, minHours: 20 }, lastToThisGroup: hoursAgo(20) });
    eq(decision.action, 'publish', 'at exactly the interval the repeat is allowed');
  }
  {
    /*
     * A LONGER INTERVAL IS HONOURED, so the number on the panel is the number
     * the engine uses. 48 hours with 30 gone is still a wait.
     */
    const { decision } = await decide({ repeat: { enabled: true, minHours: 48 }, lastToThisGroup: hoursAgo(30) });
    eq(decision.action, 'defer', 'the interval the owner chose is the one enforced, not a fixed day');
  }
  {
    /*
     * THE ONE THAT PROTECTS HIM FROM HIS OWN RETRY. A publication ten minutes
     * ago cannot be repeated now however the switch is set — which is the half
     * of the old rule worth keeping, and the reason this is a clock and not a
     * removal.
     */
    const { decision } = await decide({ repeat: { enabled: true, minHours: 20 }, lastToThisGroup: hoursAgo(0.2) });
    eq(decision.action, 'defer', 'a round that somehow ran twice in a morning still cannot double-post');
  }
  {
    /*
     * AND A PUBLICATION THAT CANNOT BE DATED COUNTS AS JUST NOW. A row marked
     * published with no instant is the one case where the safe reading and the
     * convenient reading differ, and the safe one holds the post back.
     */
    const { db } = fakeDb((c) => {
      if (c.table === 'social_campaigns') return { status: 'active', schedule_enabled: false, repeat_enabled: true, repeat_min_hours: 20 };
      const f = new Map(c.filters as [string, unknown][]);
      if (f.get('eq:post_id') === 'p1' && f.get('eq:target_id') === 'g1') return { data: [{ published_at: null }] };
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
    eq(decision.action, 'defer', 'an undatable publication is treated as "just now", never as "long ago"');
  }

  {
    /*
     * A ROW WITH NO CAMPAIGN AT ALL — the one state where the hoisted default
     * is the only thing deciding, and therefore the only place a mistake in it
     * can be seen.
     *
     * Queue rows without a campaign exist: addTargetsToQueue() writes
     * `campaign_id: null`, and a post launched before runs existed has none
     * either. There is no row to read a repeat off, so the engine falls back —
     * and a fallback into "repeats are permitted" would quietly let every one
     * of those rows re-publish for ever. A permission is not something to fall
     * back into.
     */
    const { db } = fakeDb((c) => {
      const f = new Map(c.filters as [string, unknown][]);
      if (f.get('eq:post_id') === 'p1' && f.get('eq:target_id') === 'g1') return { data: [{ published_at: hoursAgo(400) }] };
      return null;
    });
    const decision = await evaluateQueueItem(db, {
      item: { ...(ITEM as object), campaign_id: null } as never,
      target: TARGET,
      post: { ...(POST as object), campaign_id: null } as never,
      variant: null,
      limits: { ...DEFAULT_LIMITS, minGapMinutes: 0 },
      now: NOW,
    });
    eq(decision.action, 'skip', 'a row with no campaign gets the strict rule — the default is never a permission');
  }

  {
    /*
     * THE CAMPAIGN ROW IS GONE, so neither read returns anything and the
     * engine has nothing at all to read a repeat off.
     *
     * This is the other half of "a permission is not something to fall back
     * into", and it is a different code path from the row with no campaign id:
     * there the lookup is never attempted, here it is attempted and finds
     * nothing. A fallback into "on" would let a deleted campaign's orphaned
     * rows re-publish for ever, with no screen anywhere able to stop them.
     */
    const { decision } = await decide({ repeat: { enabled: true, minHours: 20 }, lastToThisGroup: hoursAgo(400), campaignGone: true });
    eq(decision.action, 'skip', 'a campaign row that cannot be read falls back to "never twice", never to "always"');
  }

  /* ── and the query was not quietly widened ────────────────────────────── */
  {
    const { calls } = await decide({ repeat: { enabled: true, minHours: 20 }, lastToThisGroup: hoursAgo(30) });
    const probe = calls.find((c) => c.filters.some(([k, v]) => k === 'eq:post_id' && v === 'p1'));
    is(probe, 'the repeat check must actually read the queue');
    const f = new Map(probe!.filters as [string, unknown][]);
    /* SCOPED, exactly as the old count was. A check that lost one of these
       would answer about the wrong post, the wrong group, or a row that never
       published — and would then permit or refuse the wrong publication. */
    eq(f.get('eq:status'), 'published', 'only publications count');
    eq(f.get('eq:post_id'), 'p1', 'this post');
    eq(f.get('eq:target_id'), 'g1', 'this group');
    eq(f.get('neq:id'), 'q9', 'and not the row being decided');
    is(f.has('order'), 'ordered, because "how long ago" needs the most recent one');
  }

  /* ── the source-level claims that cannot be driven ────────────────────── */
  {
    const rules = readFileSync(new URL('../../src/lib/social/rules.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
    /* THE DEFAULT IS THE SAFE ONE. A row with no campaign, or a campaign whose
       read failed, must get "never twice" — a permission is not something to
       fall back into. */
    is(/let repeat: CampaignRepeat = DEFAULT_CAMPAIGN_REPEAT;/.test(rules), 'the repeat defaults to off before anything is read');
    is(/if \(campaign\) repeat = readRepeat\(campaign\);/.test(rules), 'and is only raised from a campaign row that was actually read');
    /* The gate above it is untouched: the owner's global switch still comes
       first, and `!== false` still means an older settings row blocks. */
    is(rules.includes('if (limits.blockRepeatToSameTarget !== false) {'), 'the global switch still gates the whole check');
  }

  console.log(`repeat rules OK — ${checks} assertions, decided by the real engine against a fake database`);
}

void main();
