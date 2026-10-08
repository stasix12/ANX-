import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateQueueItem } from '../../src/lib/social/rules';
import { DEFAULT_LIMITS } from '../../src/lib/social/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * THIRTY SECONDS BETWEEN POSTS, DECIDED BY THE REAL ENGINE.
 *
 * "בהפרש פרסום בין פוסט לפוסט תעשה אופציה של 30 40 50 שניות בין פוסט לפוסט,
 *  ושבאמת יספיק לפרסם בתווך זמן זה."
 *
 * The gap used to live in a smallint of MINUTES, so one minute was a floor the
 * UNIT imposed rather than a decision anybody made. It is seconds now
 * (social-schema-v26.sql) — and a unit change is the kind of thing that looks
 * finished in the panel and is not, because the number has to survive four
 * more hands before it reaches a decision:
 *
 *   the column    → the SELECT → readSchedule() → nextPublishAt() → the engine
 *
 * THIS FILE IS HERE BECAUSE ONE OF THOSE HANDS WAS ALREADY DROPPING IT. The
 * SELECT in rules.ts named `schedule_gap_minutes` and not the new column, and
 * readSchedule() cannot tell a column that is missing from the TABLE from one
 * that is missing from the QUERY: both arrive as undefined, both fall back to
 * the minutes. The owner would pick thirty seconds, the panel would show
 * thirty seconds, and the thing that actually decides whether to publish would
 * enforce sixty — silently, exactly the way the 218-groups warning was silent.
 *
 * So the decisions below are MADE, against a fake PostgREST, and the query the
 * engine issues is asserted as well as the answer it gives.
 *
 *   npx tsx worker/test/campaign-gap.test.ts
 */

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.deepEqual(a, b, msg); };
const is = (c: unknown, msg: string) => { checks += 1; assert.ok(c, msg); };

interface Call { table: string; filters: [string, unknown][] }

/** The slice of the PostgREST builder rules.ts uses — see repeat-rules.test.ts,
    which this harness is lifted from, for why it records every call. */
function fakeDb(answer: (c: Call) => unknown): { db: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const add = (k: string, v: unknown) => { call.filters.push([k, v]); return chain; };
    for (const m of ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'is']) chain[m] = (k: string, v: unknown) => add(`${m}:${k}`, v);
    chain.not = (k: string, op: string, v: unknown) => add(`not:${k}:${op}`, v);
    chain.select = (cols: string) => add('select', cols);
    chain.order = (k: string) => add('order', k);
    chain.limit = (n: number) => add('limit', n);
    chain.maybeSingle = () => {
      const a = answer(call) as { error?: unknown } | null;
      if (a && typeof a === 'object' && 'error' in a) return Promise.resolve({ data: null, error: a.error });
      return Promise.resolve({ data: a ?? null, error: null });
    };
    chain.then = (res: (v: unknown) => unknown) => {
      const a = answer(call) as { data?: unknown; count?: number } | null;
      return Promise.resolve(res({ data: (a as { data?: unknown })?.data ?? a ?? null, count: (a as { count?: number })?.count ?? 0, error: null }));
    };
    return chain;
  };
  return { db: { from: builder } as unknown as SupabaseClient, calls };
}

const NOW = new Date('2026-10-08T12:00:00+03:00');
const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();

const TARGET = { id: 'g1', name: 'באר שבע ביחד', channel: 'facebook_group', enabled: true } as never;
const POST = { id: 'p1', status: 'ready', campaign_id: 'c1', base_text: 'ניקוי ספות', media: [] } as never;
const ITEM = { id: 'q9', campaign_id: 'c1', post_id: 'p1', target_id: 'g1', status: 'scheduled', dedupe_hash: null, attempts: 0 } as never;

/**
 * One decision. `gapSeconds` is what the owner picked; `gapMinutes` is the
 * legacy column beside it; `noSecondsColumn` is a database that has not run
 * v26 yet, where the seconds simply are not there.
 *
 * The campaign's window is OPEN all week and all day, so the only thing that
 * can defer this row is the gap — the point of the file.
 */
async function decide(opts: { gapSeconds?: number; gapMinutes?: number; sinceLast: number | null; noSecondsColumn?: boolean }) {
  const { db, calls } = fakeDb((c) => {
    if (c.table === 'social_campaigns') {
      const row: Record<string, unknown> = {
        status: 'active',
        schedule_enabled: true,
        schedule_days: [0, 1, 2, 3, 4, 5, 6],
        schedule_start: '00:00',
        schedule_end: '23:59',
        schedule_gap_minutes: opts.gapMinutes ?? 10,
        repeat_enabled: false,
        repeat_min_hours: 20,
      };
      if (!opts.noSecondsColumn) row.schedule_gap_seconds = opts.gapSeconds ?? 600;
      return row;
    }
    const f = new Map(c.filters as [string, unknown][]);
    /* The campaign's own last publication, and the account-wide one, are the
       same read in this fixture: one post went out `sinceLast` ago. */
    if (c.table === 'social_queue' && f.has('eq:status') && opts.sinceLast !== null) {
      return f.has('eq:post_id') ? { data: [] } : { published_at: secondsAgo(opts.sinceLast), data: [] };
    }
    return null;
  });
  const decision = await evaluateQueueItem(db, {
    item: ITEM,
    target: TARGET,
    post: POST,
    variant: null,
    /* The ACCOUNT-WIDE floor is taken out of the way on purpose. It is a
       separate gate with its own control, it is still whole minutes, and with
       its default of 45 it would swallow every assertion below — this file is
       about the campaign's own gap and nothing else. */
    limits: { ...DEFAULT_LIMITS, minGapMinutes: 0 },
    now: NOW,
  });
  return { decision, calls };
}

async function main(): Promise<void> {
  /* ── 1. THE QUERY ASKS FOR THE COLUMN ─────────────────────────────────── */
  {
    const { calls } = await decide({ gapSeconds: 30, sinceLast: null });
    const select = calls
      .filter((c) => c.table === 'social_campaigns')
      .flatMap((c) => c.filters.filter(([k]) => k === 'select').map(([, v]) => String(v)));
    is(select.length > 0, 'the engine reads the campaign at all');
    is(
      select.some((s) => s.includes('schedule_gap_seconds')),
      `THE SELECT MUST NAME THE SECONDS COLUMN. readSchedule() cannot tell a column missing from the table from one missing from the query — both are undefined, both fall back to minutes. Got: ${JSON.stringify(select)}`,
    );
    is(
      select.some((s) => s.includes('schedule_gap_minutes')),
      'and it still asks for the minutes beside them, which is the fallback for a database that has not run v26',
    );
  }

  /* ── 2. THIRTY SECONDS IS THIRTY SECONDS ──────────────────────────────── */
  {
    const { decision } = await decide({ gapSeconds: 30, sinceLast: 40 });
    eq(decision.action, 'publish', 'FORTY SECONDS AFTER THE LAST POST, with a thirty-second gap, it goes');
  }
  {
    /*
     * The one that fails if anything on the path rounds to minutes: forty
     * seconds is PAST a thirty-second gap and SHORT of a one-minute one, so a
     * single Math.ceil anywhere turns this from "publish" into "wait".
     */
    const { decision } = await decide({ gapSeconds: 30, gapMinutes: 1, sinceLast: 40 });
    eq(decision.action, 'publish', 'and the minutes column sitting beside it, rounded up to 1, does not get a vote');
  }
  {
    /*
     * AND THIS IS THE MECHANISM THAT MAKES A SUB-MINUTE GAP POSSIBLE AT ALL,
     * which I had wrong in the first draft of this file: at forty seconds
     * into a fifty-second gap the engine does NOT refuse. PREP_LEAD_MS lets a
     * row through up to 75 seconds early and hands back the instant, so the
     * group page, the typing and the upload all happen INSIDE the remaining
     * ten seconds and the composer holds the final click until the gap is
     * actually up. The interval the owner gets is the gap, or the length of
     * one publication — whichever is longer.
     *
     * So the claim is not "it is refused". It is "it is let through AND told
     * when" — and the instant has to be the gap's own, to the second.
     */
    const { decision } = await decide({ gapSeconds: 50, sinceLast: 40 });
    eq(decision.action, 'publish', 'FIFTY SECONDS, forty gone: the row is let through to prepare');
    const notBefore = (decision as { notBefore?: string }).notBefore;
    is(Boolean(notBefore), 'carrying the instant the click must wait for, rather than being allowed to fire early');
    eq(
      Math.round((new Date(notBefore!).getTime() - NOW.getTime()) / 1000),
      10,
      'and that instant is ten seconds out — the gap to the second, not rounded up to the next minute',
    );
  }

  /* ── 3. TOO SOON IS WORDED IN THE UNIT THE OWNER CHOSE ────────────────── */
  {
    /*
     * Far enough out that the engine states the wait rather than holding the
     * click: PREP_LEAD_MS lets a row through up to 75s early, so a gap that
     * closes inside that window is a `publish` with a `notBefore` and carries
     * no sentence at all.
     */
    const { decision } = await decide({ gapSeconds: 1800, sinceLast: 60 });
    eq(decision.action, 'defer', 'a gap that is nowhere near closing defers');
    const reason = (decision as { reason: string }).reason;
    is(/30 דקות|שלושים/.test(reason), `and says how long in minutes when it is minutes — got "${reason}"`);
    is(!/0\.\d/.test(reason), 'never as a fraction');
  }
  {
    const { decision } = await decide({ gapSeconds: 40, sinceLast: 1 });
    const reason = (decision as { reason?: string }).reason ?? '';
    is(
      !/דק׳|דקות/.test(reason),
      `A SUB-MINUTE GAP IS NEVER DESCRIBED IN MINUTES. "נדחה כדי לשמור מרווח של 0.6 דק׳" is a sentence nobody should have to read — got "${reason}"`,
    );
  }

  /* ── 4. A DATABASE THAT HAS NOT RUN v26 IS SLOWER, NEVER FASTER ───────── */
  {
    /*
     * ASSERTED ON THE INSTANT, NOT ON "REFUSED". Both of these are `publish`
     * — see the note above: everything inside PREP_LEAD_MS is let through to
     * prepare. What separates thirty seconds from sixty is WHEN the composer
     * is told to click, and that is the only place the difference is visible.
     */
    const withColumn = await decide({ gapSeconds: 30, gapMinutes: 1, sinceLast: 40 });
    eq(withColumn.decision.action, 'publish', 'with the seconds column, a thirty-second gap is already closed at forty');
    eq(
      (withColumn.decision as { notBefore?: string }).notBefore,
      undefined,
      'so there is nothing left to wait for — no held click at all',
    );

    const without = await decide({ noSecondsColumn: true, gapMinutes: 1, sinceLast: 40 });
    eq(without.decision.action, 'publish', 'WITHOUT THE COLUMN the row is still let through to prepare');
    const held = (without.decision as { notBefore?: string }).notBefore;
    is(Boolean(held), 'but the click is held');
    eq(
      Math.round((new Date(held!).getTime() - NOW.getTime()) / 1000),
      20,
      'for the twenty seconds left of a MINUTE — the fallback errs slow, which is the safe direction for a number that paces an account',
    );
  }

  /* ── 5. THE PANEL AND THE ENGINE CANNOT DRIFT ─────────────────────────── */
  {
    /*
     * The floor is written in three places that must agree or the owner is
     * offered a choice the database rejects: the option list, the clamp in
     * readSchedule, and the CHECK constraint. The first two are already
     * pinned in campaign-schedule.test.ts against each other; this pins the
     * third, which is in SQL and therefore invisible to the type system.
     */
    const sql = readFileSync('supabase/social-schema-v26.sql', 'utf8');
    is(/check \(schedule_gap_seconds between 30 and 1800\)/.test(sql), 'the database allows exactly the range the panel offers');
    is(/add column if not exists schedule_gap_seconds/.test(sql), 'and adds the column without assuming it is absent');
    is(
      /update public\.social_campaigns[\s\S]*schedule_gap_minutes/.test(sql),
      'and BACKFILLS existing campaigns from the gap they already have — a default would silently re-time every campaign in the account',
    );
    const latest = readFileSync('supabase/social-latest.sql', 'utf8');
    is(
      latest.includes('schedule_gap_seconds'),
      'and social-latest.sql carries it too, which is the file a fresh install runs',
    );
  }

  console.log(`campaign gap tests OK — ${checks} assertions, decided by the real engine against a fake database`);
}

void main();
