/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import {
  RUN_STATE_LABEL,
  campaignHeadline,
  campaignState,
  openRows,
  percentFinished,
  runBadge,
  percentPublished,
  runProgress,
  type CampaignQueueRow,
  type CampaignState,
} from '@/lib/social/campaign';
import { explainFailure } from '@/components/social/ErrorDetail';
import { AUTOMATIC_WAITING_STATUSES, ALL_QUEUE_STATUSES, OPEN_STATUSES, TERMINAL_STATUSES, summarizeQueue } from '@/lib/social/status';
import { startOfZonedDay } from '@/lib/social/time';
import type { Campaign, QueueStatus } from '@/lib/social/types';

/*
 * ===========================================================================
 * REPRODUCTION — "הושלמו / 100%" on the run card while the dashboard still
 * counts the same publications as waiting.
 *
 * READ THIS FIRST — WHAT THIS FILE IS AND IS NOT.
 *
 * THIS IS A SIMULATION. There is no Supabase credential in this checkout and
 * no network route to the owner's database, so NO QUERY IN THIS FILE EVER
 * TOUCHED THE LIVE DATABASE. Nothing here is a record of a real campaign run.
 * What it does is:
 *
 *   • drive the REAL pure functions — campaignState(), resolveState() (through
 *     it), percentDone(), campaignHeadline(), RUN_STATE_LABEL — from
 *     src/lib/social/campaign.ts, unmodified and imported directly;
 *
 *   • feed them from a FAKE in-memory Supabase client (fakeDb below) that
 *     implements the PostgREST semantics the module relies on: filters first,
 *     then ORDER BY, then LIMIT;
 *
 *   • re-state, in simCampaignStates() / simCountByStatus() / simListQueue(),
 *     the exact query chains that src/lib/social/client.ts sends. These are
 *     COPIES, not the originals: client.ts binds a module-level Supabase
 *     singleton (src/lib/supabase.ts exports `supabase` as a non-configurable
 *     getter) and there is no seam to inject a fake through without editing
 *     source, which this agent is not allowed to do. The copies are pinned to
 *     the originals by the source-drift guards at the bottom of this file — if
 *     someone changes a query in client.ts or a tile in page.tsx and does not
 *     change it here, this test says so instead of quietly lying.
 *
 * EVERY ASSERTION BELOW ENCODES WHAT THE SCREEN SHOULD SAY. When this file
 * was written they were failing, and the failures WERE the bug report. They
 * now pass against the fixed modules, and the file has become the regression
 * guard for the same defects: if "הושלמו" ever goes back to covering a skip,
 * or 'paused' back in front of the completion check, this goes red again.
 * Nothing in src/ is touched by this file.
 *
 * Run it with:   npx tsx worker/test/progress-contradiction.test.ts
 * It is part of `npm run test:social`.
 * ===========================================================================
 */

/* --------------------------------------------------------------- fixtures */

/** One queue row, in the columns the two reads actually select. */
interface Row extends CampaignQueueRow {
  campaign_id: string | null;
  worker_id: string | null;
  claimed_at: string | null;
}

const NOW = new Date('2026-09-19T09:00:00.000Z');
const POST = 'post-sofas-beersheva';
const RUN = 'run-1';

const CAMPAIGN_ACTIVE: Campaign = {
  id: RUN,
  name: 'ניקוי ספות — באר שבע',
  service: 'ניקוי ספות וריפודים',
  city: 'באר שבע',
  language: 'he',
  status: 'active',
  notes: '',
  created_at: '2026-09-18T05:00:00.000Z',
};
const CAMPAIGN_PAUSED: Campaign = { ...CAMPAIGN_ACTIVE, status: 'paused' };

/** 28 groups, 20 minutes apart, starting 06:00Z on the day of the run. */
const SIZE = 28;
const slotAt = (i: number) => new Date(Date.parse('2026-09-19T06:00:00.000Z') + i * 20 * 60_000).toISOString();

/**
 * Builds the 28-row campaign in a given shape. `plan` names a status per row
 * index; every row gets published_at exactly when the worker would write it
 * (on success only — see worker/social-worker.ts runJob finish()).
 */
function buildRun(plan: QueueStatus[], opts: { workerIdOn?: number } = {}): Row[] {
  if (plan.length !== SIZE) throw new Error(`the fixture is ${SIZE} rows, got ${plan.length}`);
  return plan.map((status, i) => ({
    id: `q${String(i + 1).padStart(2, '0')}`,
    status,
    scheduled_at: slotAt(i),
    published_at: status === 'published' ? slotAt(i) : null,
    target_id: `t${String(i + 1).padStart(2, '0')}`,
    post_id: POST,
    campaign_id: RUN,
    worker_id: opts.workerIdOn === i ? 'worker-pc' : null,
    claimed_at: opts.workerIdOn === i ? new Date(NOW.getTime() - 40 * 60_000).toISOString() : null,
    target: { id: `t${String(i + 1).padStart(2, '0')}`, name: `קבוצה ${i + 1}`, channel: 'facebook_group' },
  }));
}

/** `n` of `status`, then the rest of `fill`. */
function plan(...runs: [QueueStatus, number][]): QueueStatus[] {
  const out: QueueStatus[] = [];
  for (const [status, n] of runs) for (let i = 0; i < n; i += 1) out.push(status);
  return out;
}

/* ------------------------------------------------- the fake Supabase client */

/**
 * A minimal PostgREST stand-in. It matters that filters are applied BEFORE
 * order and limit, exactly as the real server does — the truncation defect in
 * step 10 only reproduces if the limit is the last thing that happens.
 */
interface Result {
  data: Row[];
  error: null;
  count: number;
}

function builder(source: Row[]) {
  const filters: ((r: Row) => boolean)[] = [];
  let orderCol: string | null = null;
  let ascending = true;
  let lim: number | null = null;

  const self: any = {
    select(_cols: string, _opts?: { count?: 'exact'; head?: boolean }) {
      return self;
    },
    eq(col: string, val: unknown) {
      filters.push((r) => (r as any)[col] === val);
      return self;
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.includes((r as any)[col]));
      return self;
    },
    not(col: string, op: string, val: unknown) {
      if (op !== 'is' || val !== null) throw new Error('the fake implements only .not(col, "is", null)');
      filters.push((r) => (r as any)[col] !== null && (r as any)[col] !== undefined);
      return self;
    },
    gte(col: string, val: string) {
      filters.push((r) => typeof (r as any)[col] === 'string' && (r as any)[col] >= val);
      return self;
    },
    lte(col: string, val: string) {
      filters.push((r) => typeof (r as any)[col] === 'string' && (r as any)[col] <= val);
      return self;
    },
    lt(col: string, val: string) {
      filters.push((r) => typeof (r as any)[col] === 'string' && (r as any)[col] < val);
      return self;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderCol = col;
      ascending = opts?.ascending ?? true;
      return self;
    },
    limit(n: number) {
      lim = n;
      return self;
    },
    run(): Result {
      let out = source.filter((r) => filters.every((f) => f(r)));
      if (orderCol) {
        const c = orderCol;
        out = out
          .slice()
          .sort((a, b) => String((a as any)[c] ?? '').localeCompare(String((b as any)[c] ?? '')) * (ascending ? 1 : -1));
      }
      if (lim !== null) out = out.slice(0, lim);
      return { data: out, error: null, count: out.length };
    },
    then(resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(self.run()).then(resolve, reject);
    },
  };
  return self;
}

function fakeDb(rows: Row[]) {
  return {
    /* Every row, unfiltered and unordered — what a grouped VIEW aggregates
       over. Not a query: the view has no ceiling and no order, which is the
       whole reason the counts moved into it. */
    all: () => rows,
    from(table: string) {
      if (table !== 'social_queue') throw new Error(`the fake serves social_queue only, asked for "${table}"`);
      return builder(rows);
    },
  };
}

/* ------------------------------- the reads, copied from src/lib/social/*.ts */

/**
 * src/lib/social/client.ts — `const CAMPAIGN_ROLLUP_LIMIT = 1000;` (not exported).
 *
 * IT WAS 5000, AND THAT IS WHY SCENARIO 10 BELOW USED TO BE A SIMULATION OF
 * SOMETHING THAT COULD NOT HAPPEN IN PRODUCTION. PostgREST's `db-max-rows` is
 * 1000 on this project, so the server never returned more than 1000 rows no
 * matter what the client asked for — which made `rows.length >= 5000`
 * permanently false and the `truncated` flag dead code. The card's
 * `!state.truncated` clause, the one thing standing between a capped read and
 * a green "הקמפיין הסתיים בהצלחה" over still-waiting publications, was
 * unreachable.
 *
 * The ceiling is now the server's own, so `rows.length >= LIMIT` is true
 * exactly when the server truncated, and this simulation reproduces the real
 * cut rather than a hypothetical one.
 */
const CAMPAIGN_ROLLUP_LIMIT = 1000;

/** client.ts — `const ROLLUP_DONE_LIMIT = 500;` (not exported). */
const ROLLUP_DONE_LIMIT = 500;

/**
 * SIMULATION of the v27 view `social_campaign_counts`.
 *
 * The view is `select campaign_id, status, count(*), count(*) filter (today)
 * from social_queue where campaign_id is not null group by 1,2` — an exact
 * aggregate with NO ceiling and no ordering, which is the entire point of it.
 * Computing it here from the same fixture rows is therefore not an
 * approximation of the database; it is the same arithmetic.
 */
function simCampaignCounts(rows: Row[], todayISO: string) {
  const out: Record<string, { lifetime: Record<string, number>; today: Record<string, number> }> = {};
  for (const r of rows) {
    if (!r.campaign_id) continue;
    const e = (out[r.campaign_id] ??= { lifetime: {}, today: {} });
    e.lifetime[r.status] = (e.lifetime[r.status] ?? 0) + 1;
    if (r.scheduled_at.slice(0, 10) === todayISO) e.today[r.status] = (e.today[r.status] ?? 0) + 1;
  }
  return out;
}

/**
 * SIMULATION of client.ts campaignStates() — THREE reads now, and the reason
 * is the owner's 28/28 screen.
 *
 * It was ONE read: the 1,000 earliest queue rows of the whole account,
 * ordered by scheduled_at ascending, grouped by campaign in JavaScript, with
 * progress.total set to each group's length. Three faults compounded in that:
 * the ceiling was SHARED between campaigns, the ascending order dropped
 * exactly the rows still waiting, and a repeating round was then filtered to
 * today AFTER the cut. The result on his phone was "28 / 28 טופלו · 100% ·
 * הסתיים — חלק דולגו" over a round publishing to hundreds of groups.
 *
 * Now: the COUNTS come from the v27 view (exact, per campaign, today computed
 * inside the aggregate); the OPEN rows come from a read bounded by the one
 * open row per group that v20's unique index allows; the DONE rows are a
 * newest-first preview that no number is derived from.
 */
async function simCampaignStates(
  db: ReturnType<typeof fakeDb>,
  campaigns: Campaign[],
  campaignIds?: string[],
  opts: { countsView?: boolean; todayISO?: string } = {},
): Promise<Record<string, CampaignState<Row>>> {
  if (campaignIds && campaignIds.length === 0) return {};
  const SELECT = 'id, status, scheduled_at, published_at, target_id, post_id, campaign_id, target:social_targets(id,name,channel,image_url)';

  let openQuery = db
    .from('social_queue')
    .select(SELECT)
    .not('campaign_id', 'is', null)
    .in('status', OPEN_STATUSES)
    .order('scheduled_at')
    .limit(CAMPAIGN_ROLLUP_LIMIT);
  if (campaignIds) openQuery = openQuery.in('campaign_id', campaignIds);

  let doneQuery = db
    .from('social_queue')
    .select(SELECT)
    .not('campaign_id', 'is', null)
    .in('status', TERMINAL_STATUSES)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(ROLLUP_DONE_LIMIT);
  if (campaignIds) doneQuery = doneQuery.in('campaign_id', campaignIds);

  const { data: openRows } = (await openQuery) as Result;
  const { data: doneRows } = (await doneQuery) as Result;
  const openTruncated = openRows.length >= CAMPAIGN_ROLLUP_LIMIT;
  const doneTruncated = doneRows.length >= ROLLUP_DONE_LIMIT;
  const rowsAreWhole = !openTruncated && !doneTruncated;

  /* `countsView: false` is a database that has not run social-latest.sql yet —
     the fallback path, where the numbers come from the rows again and every
     surface is told so. */
  const counts = opts.countsView === false ? null : simCampaignCounts(db.all(), opts.todayISO ?? NOW.toISOString().slice(0, 10));

  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const grouped = new Map<string, Row[]>();
  const seen = new Set<string>();
  for (const row of [...openRows, ...doneRows]) {
    seen.add(row.id as string);
    const list = grouped.get(row.campaign_id as string);
    if (list) list.push(row);
    else grouped.set(row.campaign_id as string, [row]);
  }

  const todayISO = opts.todayISO ?? NOW.toISOString().slice(0, 10);
  /*
   * TODAY'S FINISHED ROWS — mirroring campaignStates(). The lifetime preview
   * answers "could we read all of HISTORY"; a repeating round is counted for
   * TODAY. Bounded by scheduled_at, NOT published_at, because a skipped or
   * failed row has no published_at and would be invisible to the other read.
   */
  const dayAfter = new Date(Date.parse(`${todayISO}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
  const anyRepeats = (campaignIds ?? campaigns.map((c) => c.id)).some(
    (id) => Boolean((byId.get(id) as { repeat_enabled?: boolean } | undefined)?.repeat_enabled),
  );
  let todayIsWhole = true;
  if (!counts && doneTruncated && anyRepeats) {
    let todayQuery = db
      .from('social_queue')
      .select(SELECT)
      .not('campaign_id', 'is', null)
      .in('status', TERMINAL_STATUSES)
      .gte('scheduled_at', `${todayISO}T00:00:00.000Z`)
      .lt('scheduled_at', `${dayAfter}T00:00:00.000Z`)
      .order('scheduled_at', { ascending: false })
      .limit(CAMPAIGN_ROLLUP_LIMIT);
    if (campaignIds) todayQuery = todayQuery.in('campaign_id', campaignIds);
    const { data: todayRows } = (await todayQuery) as Result;
    todayIsWhole = todayRows.length < CAMPAIGN_ROLLUP_LIMIT;
    for (const row of todayRows) {
      if (seen.has(row.id as string)) continue;
      seen.add(row.id as string);
      const list = grouped.get(row.campaign_id as string);
      if (list) list.push(row);
      else grouped.set(row.campaign_id as string, [row]);
    }
  }
  const sliceIsWhole = (todayOnly: boolean): boolean => !openTruncated && (todayOnly ? todayIsWhole : !doneTruncated);

  for (const id of Object.keys(counts ?? {})) if (!grouped.has(id)) grouped.set(id, []);
  if (campaignIds) for (const id of campaignIds) if (!grouped.has(id)) grouped.set(id, []);

  const out: Record<string, CampaignState<Row>> = {};
  for (const [id, all] of grouped) {
    const campaign = byId.get(id) ?? null;
    const todayOnly = Boolean((campaign as { repeat_enabled?: boolean } | null)?.repeat_enabled);
    const list = todayOnly ? all.filter((r) => r.scheduled_at.slice(0, 10) === todayISO) : all;
    const exact = counts?.[id];
    out[id] = campaignState(list, campaign, {
      truncated: exact ? false : !sliceIsWhole(todayOnly),
      todayOnly,
      lifetime: all,
      counts: exact
        ? { progress: todayOnly ? exact.today : exact.lifetime, everPublished: exact.lifetime.published ?? 0 }
        : undefined,
    });
  }
  return out;
}

/**
 * SIMULATION of client.ts countByStatus(). It is now nine exact head counts,
 * one per status — no rows transferred and nothing for PostgREST's db-max-rows
 * to cap, which is what used to make the largest numbers on the dashboard a
 * ceiling printed as a fact.
 */
async function simCountByStatus(db: ReturnType<typeof fakeDb>): Promise<Record<QueueStatus, number>> {
  const entries = await Promise.all(
    ALL_QUEUE_STATUSES.map(async (status) => {
      const res = (await db.from('social_queue').select('id', { count: 'exact', head: true }).eq('status', status)) as Result;
      return [status, res.count] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<QueueStatus, number>;
}

/**
 * SIMULATION of client.ts listQueue(). The order is now the caller's: the
 * limit is applied AFTER the sort, so a descending read with a limit hands
 * back the furthest-out rows. "הפרסומים הקרובים" asks for 'asc'.
 */
async function simListQueue(
  db: ReturnType<typeof fakeDb>,
  opts: { status?: QueueStatus[]; limit?: number; order?: 'asc' | 'desc' } = {},
): Promise<Row[]> {
  let q = db.from('social_queue').select('*').order('scheduled_at', { ascending: opts.order === 'asc' }).limit(opts.limit ?? 200);
  if (opts.status?.length) q = q.in('status', opts.status);
  return ((await q) as Result).data;
}

/** SIMULATION of client.ts countPublishedSince() (client.ts:637-641). */
async function simCountPublishedSince(db: ReturnType<typeof fakeDb>, sinceISO: string): Promise<number> {
  const res = (await db
    .from('social_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('published_at', sinceISO)) as Result;
  return res.count;
}

/* ---------------------------------------------------- the two views on screen */

/**
 * What the dashboard renders — src/app/social/page.tsx load() and the tile
 * block at page.tsx:258-300, plus `pending` at page.tsx:120.
 */
interface DashboardView {
  publishedToday: number;
  /** tile "ממתינים בתור" — everything that moves on its own. */
  scheduled: number;
  /** tile "דורשים אתכם" — everything that waits for a person. */
  needsAction: number;
  /** tile "נכשלו" (all time) */
  failed: number;
  /** page.tsx:120 — the figure the "delete the queue" dialog quotes. */
  pending: number;
  /** Card "הפרסומים הקרובים" — listQueue scheduled, re-sorted ascending. */
  upcomingIds: string[];
  /** Rows the four tiles show nowhere at all. */
  invisibleIds: string[];
  /** Of those, the ones that have NOT finished — a publication still owed to
   *  the owner that no tile on the control centre mentions. */
  invisibleUnfinishedIds: string[];
}

async function dashboard(db: ReturnType<typeof fakeDb>): Promise<DashboardView> {
  const counts = await simCountByStatus(db);
  const summary = summarizeQueue(counts);
  const publishedToday = await simCountPublishedSince(db, startOfZonedDay(NOW).toISOString());
  // page.tsx now asks ascending, so these ARE the soonest rows.
  const upcoming = await simListQueue(db, { status: AUTOMATIC_WAITING_STATUSES, limit: 40, order: 'asc' });
  const all = ((await db.from('social_queue').select('*')) as Result).data;
  // A row is invisible when no tile on the control centre counts it. The tiles
  // are: published TODAY, queued (scheduled + paused + publishing), needs-you
  // (awaiting_confirmation + manual_pending + needs_attention) and failed —
  // between them every open row exactly once. A skipped row and a publication
  // from an earlier day are finished history, reachable from the history
  // screen rather than counted twice on the dashboard.
  const invisibleIds = all
    .filter((r) => {
      if (AUTOMATIC_WAITING_STATUSES.includes(r.status) || r.status === 'publishing') return false;
      if (r.status === 'failed') return false;
      if (['awaiting_confirmation', 'manual_pending', 'needs_attention'].includes(r.status)) return false;
      if (r.status === 'published') return !(r.published_at && r.published_at >= startOfZonedDay(NOW).toISOString());
      return true;
    })
    .map((r) => r.id);
  const UNFINISHED: QueueStatus[] = ['scheduled', 'publishing', 'awaiting_confirmation', 'paused', 'manual_pending', 'needs_attention'];
  const unfinished = new Set(all.filter((r) => UNFINISHED.includes(r.status)).map((r) => r.id));
  return {
    publishedToday,
    scheduled: summary.queued,
    needsAction: summary.needsHuman,
    failed: counts.failed,
    pending: summary.cancellable,
    upcomingIds: upcoming.map((r) => r.id),
    invisibleIds,
    invisibleUnfinishedIds: invisibleIds.filter((id) => unfinished.has(id)),
  };
}

/**
 * What the run card renders — src/components/social/LiveCampaignHero.tsx:
 *   :177  <Ratio done={state.progress.done} total={state.progress.total} suffix="הושלמו" />
 *   :179  {pct}%   (percentDone)
 *   :174  <StatePill label={RUN_STATE_LABEL[state.state]} …/>
 *   :158  const paused = state.state === 'paused';  → the "המשך סבב" button
 * plus page.tsx:170, which is how the card counts what has not gone out yet.
 */
interface CardView {
  headline: string;
  /** The number the card prints beside "פורסמו". */
  completedShown: number;
  total: number;
  /** The SUCCESS ratio — publications over the total. */
  percent: number;
  /** The PROGRESS ratio the bar is actually drawn at — handled over total. */
  percentHandled: number;
  /** The two sentences runProgress() writes, exactly as the card renders them. */
  handledLabel: string;
  publishedLabel: string;
  /** The state was built from a capped read, so the card must say so. */
  truncated: boolean;
  stateLabel: string;
  resumeOffered: boolean;
  /** page.tsx resetRun(): scheduled + running + manual. */
  waiting: number;
  publishedReally: number;
  failedReally: number;
  skippedReally: number;
  upcomingIds: string[];
}

function card(state: CampaignState<Row> | undefined): CardView {
  const s = (state ?? campaignState<Row>([], null)) as CampaignState<Row>;
  return {
    headline: campaignHeadline(s as unknown as CampaignState),
    completedShown: s.progress.published,
    total: s.progress.total,
    percent: percentPublished(s.progress),
    percentHandled: percentFinished(s.progress),
    handledLabel: runProgress(s.progress).handledLabel,
    publishedLabel: runProgress(s.progress).publishedLabel,
    truncated: s.truncated,
    stateLabel: RUN_STATE_LABEL[s.state],
    resumeOffered: s.state === 'paused',
    waiting: openRows(s.progress),
    publishedReally: s.progress.published,
    failedReally: s.progress.failed,
    skippedReally: s.progress.skipped,
    upcomingIds: s.upcoming.map((r) => r.id),
  };
}

/* ------------------------------------------------------------- the reporter */

interface Failure {
  step: string;
  id: string;
  claim: string;
  expected: unknown;
  actual: unknown;
  defect: string;
}

const failures: Failure[] = [];
let checks = 0;

function expect(step: string, id: string, claim: string, actual: unknown, expected: unknown, defect: string): void {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push({ step, id, claim, expected, actual, defect });
  }
}

const NONE = '—';

/* =========================================================================== */
/*  THE RUN                                                                    */
/* =========================================================================== */

async function view(rows: Row[], campaign: Campaign, extra: Row[] = []) {
  const db = fakeDb([...rows, ...extra]);
  const campaigns = [campaign];
  // page.tsx: only non-archived campaigns are rolled up for the hero.
  const states = await simCampaignStates(db, campaigns, campaigns.filter((c) => c.status !== 'archived').map((c) => c.id));
  return { card: card(states[campaign.id]), dash: await dashboard(db), state: states[campaign.id] };
}

/**
 * INV-1 — the two screens must agree about what has not gone out yet.
 * Every publication the run card treats as unfinished must be counted by a
 * dashboard tile. The owner's whole report is this invariant breaking.
 */
function invWaitingAgreement(step: string, v: { card: CardView; dash: DashboardView }): void {
  expect(
    step,
    'INV-1',
    'every publication the run card counts as still waiting is counted by a dashboard tile',
    { cardWaiting: v.card.waiting, dashboardWaiting: v.dash.scheduled + v.dash.needsAction, unaccounted: v.dash.invisibleUnfinishedIds },
    { cardWaiting: v.card.waiting, dashboardWaiting: v.card.waiting, unaccounted: [] },
    NONE,
  );
}

/**
 * INV-2 — "הושלמו" and the bar must mean PUBLISHED.
 * campaign.ts:70 sums published + failed + skipped into progress.done, and
 * both the headline and percentDone() are driven from it.
 */
/**
 * What campaignHeadline() must produce: publications, then what the rest became.
 *
 * RE-POINTED at the Hebrew, not weakened — still an independent re-spelling of
 * the sentence, byte for byte, written here rather than imported. Hebrew puts
 * a count of one in the singular and agrees the verb with it, so "1 נכשלו" was
 * the old expectation pinning a defect. Two and above are untouched.
 */
function expectedHeadline(c: CardView): string {
  const rest = [
    c.skippedReally ? (c.skippedReally === 1 ? 'פרסום אחד דולג' : `${c.skippedReally} דולגו`) : '',
    c.failedReally ? (c.failedReally === 1 ? 'פרסום אחד נכשל' : `${c.failedReally} נכשלו`) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const head = `${c.publishedReally} מתוך ${c.total} ${c.publishedReally === 1 ? 'פורסם' : 'פורסמו'}`;
  return rest ? `${head} · ${rest}` : head;
}

function invCompletedMeansPublished(step: string, v: { card: CardView }): void {
  const c = v.card;
  expect(
    step,
    'INV-2',
    'the figure beside "הושלמו" is the number PUBLISHED, not published+failed+skipped',
    { shown: c.completedShown, headline: c.headline },
    { shown: c.publishedReally, headline: c.total ? expectedHeadline(c) : 'אין פרסומים מתוכננים' },
    c.completedShown === c.publishedReally ? NONE : '(A) campaign.ts progress.done = published + failed + skipped',
  );
  /*
   * RE-LABELLED, not weakened: the assertion below is byte-for-byte the same
   * computation it always made. What changed is what it is ABOUT. The bar the
   * card draws is now the handled ratio (INV-2d), and this figure is the
   * success ratio that must stay separately available and separately correct.
   */
  expect(
    step,
    'INV-2b',
    'the publications figure is published / total, whatever the bar is drawn at',
    c.percent,
    c.total ? Math.round((c.publishedReally / c.total) * 100) : 0,
    c.percent === (c.total ? Math.round((c.publishedReally / c.total) * 100) : 0)
      ? NONE
      : '(A) campaign.ts:117 percentDone() reads the same conflated progress.done',
  );
  /*
   * INV-2d — the bar's own figure, added when the bar moved to handled rows.
   *
   * The bar is the round's PROGRESS now, so a run with one of 29 rows failed
   * is no longer drawn at 0%. What must not come back is the bar's figure
   * standing in for the run's success, so this pins both sentences at once:
   * the percentage is over handled rows, and the publications figure is
   * printed beside it in words, always, including when it is zero.
   */
  const handled = c.publishedReally + c.failedReally + c.skippedReally;
  expect(
    step,
    'INV-2d',
    'the bar is drawn at the HANDLED ratio, with the publications figure printed beside it in its own sentence',
    { percentHandled: c.percentHandled, handled: c.handledLabel, published: c.publishedLabel },
    {
      percentHandled: !c.total ? 0 : handled >= c.total ? 100 : Math.min(99, Math.round((handled / c.total) * 100)),
      handled: c.total ? `${handled} מתוך ${c.total} ${handled === 1 ? 'טופל' : 'טופלו'}` : 'אין פרסומים מתוכננים',
      published: c.total ? `${c.publishedReally} מתוך ${c.total} ${c.publishedReally === 1 ? 'פורסם' : 'פורסמו'}` : 'אין פרסומים מתוכננים',
    },
    NONE,
  );
}

async function main(): Promise<void> {
  /* ----------------------------------------------------------------------
   * 1 — before launch. Nothing planned yet.
   * -------------------------------------------------------------------- */
  {
    const v = await view([], CAMPAIGN_ACTIVE);
    expect('1 before launch', 'card', 'an unlaunched run says so instead of showing a bar', {
      headline: v.card.headline,
      percent: v.card.percent,
      label: v.card.stateLabel,
    }, { headline: 'אין פרסומים מתוכננים', percent: 0, label: 'טרם התחיל' }, NONE);
    expect('1 before launch', 'featured', 'no hero card is shown at all (page.tsx requires progress.total)', Boolean(v.state?.progress.total), false, NONE);
    expect('1 before launch', 'tiles', 'every tile is zero', [v.dash.publishedToday, v.dash.scheduled, v.dash.needsAction, v.dash.failed], [0, 0, 0, 0], NONE);
    expect('1 before launch', 'upcoming', '"הפרסומים הקרובים" is empty', v.dash.upcomingIds, [], NONE);
    invWaitingAgreement('1 before launch', v);
    invCompletedMeansPublished('1 before launch', v);
  }

  /* ----------------------------------------------------------------------
   * 2 — right after launch. 28 rows written by plan.ts, all 'scheduled'.
   * -------------------------------------------------------------------- */
  {
    const rows = buildRun(plan(['scheduled', 28]));
    const v = await view(rows, CAMPAIGN_ACTIVE);
    expect('2 after launch', 'card', '0 of 28, nothing has gone out', {
      headline: v.card.headline,
      percent: v.card.percent,
      label: v.card.stateLabel,
    }, { headline: '0 מתוך 28 פורסמו', percent: 0, label: 'טרם התחיל' }, NONE);
    expect('2 after launch', 'tiles', 'the dashboard shows all 28 as scheduled', [v.dash.publishedToday, v.dash.scheduled, v.dash.needsAction, v.dash.failed], [0, 28, 0, 0], NONE);
    expect('2 after launch', 'upcoming', 'all 28 are listed as upcoming, soonest first', v.dash.upcomingIds, rows.map((r) => r.id), NONE);
    expect('2 after launch', 'pending', 'the queue-delete dialog would quote 28', v.dash.pending, 28, NONE);
    invWaitingAgreement('2 after launch', v);
    invCompletedMeansPublished('2 after launch', v);
  }

  /* ----------------------------------------------------------------------
   * 3 — the first three have published.
   * -------------------------------------------------------------------- */
  {
    const rows = buildRun(plan(['published', 3], ['scheduled', 25]));
    const v = await view(rows, CAMPAIGN_ACTIVE);
    expect('3 first publishes', 'card', '3 of 28, 11%, running', {
      headline: v.card.headline,
      percent: v.card.percent,
      label: v.card.stateLabel,
    }, { headline: '3 מתוך 28 פורסמו', percent: 11, label: 'רץ' }, NONE);
    expect('3 first publishes', 'tiles', 'today 3, scheduled 25', [v.dash.publishedToday, v.dash.scheduled, v.dash.needsAction, v.dash.failed], [3, 25, 0, 0], NONE);
    expect('3 first publishes', 'upcoming', '25 still listed as upcoming', v.dash.upcomingIds.length, 25, NONE);
    expect('3 first publishes', 'card-upcoming', 'the card and the dashboard list the SAME 25 rows', v.card.upcomingIds, v.dash.upcomingIds, NONE);
    invWaitingAgreement('3 first publishes', v);
    invCompletedMeansPublished('3 first publishes', v);
  }

  /* ----------------------------------------------------------------------
   * 4 — mid-run, one failed and one skipped.
   *     10 published · 1 failed · 1 skipped · 16 still scheduled.
   * -------------------------------------------------------------------- */
  {
    const rows = buildRun(plan(['published', 10], ['failed', 1], ['skipped', 1], ['scheduled', 16]));
    const v = await view(rows, CAMPAIGN_ACTIVE);
    expect('4 mid-run', 'breakdown', 'the card knows the real breakdown', {
      published: v.card.publishedReally,
      failed: v.card.failedReally,
      skipped: v.card.skippedReally,
    }, { published: 10, failed: 1, skipped: 1 }, NONE);
    invCompletedMeansPublished('4 mid-run', v);
    expect('4 mid-run', 'tiles', 'today 10, scheduled 16, failed 1', [v.dash.publishedToday, v.dash.scheduled, v.dash.needsAction, v.dash.failed], [10, 16, 0, 1], NONE);
    expect('4 mid-run', 'upcoming', '16 upcoming', v.dash.upcomingIds.length, 16, NONE);
    invWaitingAgreement('4 mid-run', v);
  }

  /* ----------------------------------------------------------------------
   * 5 — the last row is terminal. 26 published · 1 failed · 1 skipped.
   * -------------------------------------------------------------------- */
  let step5: Awaited<ReturnType<typeof view>>;
  {
    const rows = buildRun(plan(['published', 26], ['failed', 1], ['skipped', 1]));
    step5 = await view(rows, CAMPAIGN_ACTIVE);
    const v = step5;
    invCompletedMeansPublished('5 run finished', v);
    expect('5 run finished', 'state', 'the run is over, so the state is "הושלם"', v.card.stateLabel, 'הושלם', NONE);
    expect('5 run finished', 'tiles', 'nothing is waiting any more', [v.dash.scheduled, v.dash.needsAction], [0, 0], NONE);
    expect('5 run finished', 'upcoming', '"הפרסומים הקרובים" is empty', v.dash.upcomingIds, [], NONE);
    invWaitingAgreement('5 run finished', v);
  }

  /* ----------------------------------------------------------------------
   * 6 — page refresh. The SAME rows, handed back by the database in a
   *     different physical order (PostgREST guarantees nothing beyond the
   *     ORDER BY key). Same data must give the same answers.
   * -------------------------------------------------------------------- */
  {
    const rows = buildRun(plan(['published', 26], ['failed', 1], ['skipped', 1]));
    const shuffled = [...rows].reverse();
    const v = await view(shuffled, CAMPAIGN_ACTIVE);
    expect('6 refresh', 'stability', 'the run card is identical after a refresh', v.card, step5.card, NONE);
    expect('6 refresh', 'stability', 'the dashboard is identical after a refresh', v.dash, step5.dash, NONE);
    // Re-stated here on purpose: whatever the card says at step 5, it is not a
    // transient — it comes back the same on every reload.
    invCompletedMeansPublished('6 refresh', v);
  }

  /* ----------------------------------------------------------------------
   * 7 — a worker that died mid-row.
   *     26 published · 1 left in 'publishing' with worker_id stamped 40
   *     minutes ago · 1 still scheduled.
   *
   *     The server worker deliberately will not touch this row: its sweep is
   *     .eq('status','publishing').is('worker_id', null) (server/worker.ts),
   *     because the row belongs to the PC worker. So it sits in 'publishing'
   *     until that worker restarts.
   * -------------------------------------------------------------------- */
  {
    const rows = buildRun(plan(['published', 26], ['publishing', 1], ['scheduled', 1]), { workerIdOn: 26 });
    const v = await view(rows, CAMPAIGN_ACTIVE);
    expect('7a worker died', 'card', 'the card knows one row is in flight', {
      running: v.state?.progress.running,
      waiting: v.card.waiting,
      label: v.card.stateLabel,
    }, { running: 1, waiting: 2, label: 'רץ' }, NONE);
    invWaitingAgreement('7a worker died', v);
    expect(
      '7a worker died',
      'INV-1b',
      'no publication that has not finished is invisible to every tile on the control centre',
      v.dash.invisibleUnfinishedIds,
      [],
      v.dash.invisibleUnfinishedIds.length ? '(C) no dashboard tile renders counts.publishing / awaiting_confirmation / skipped — page.tsx:258-300' : NONE,
    );
    invCompletedMeansPublished('7a worker died', v);

    /* The worker restarts. worker/social-worker.ts:125-128:
     *   update({status:'needs_attention', …}).eq('worker_id', id)
     *     .in('status', ['publishing','awaiting_confirmation'])
     * Applied verbatim to the fixture. */
    const recovered = rows.map((r) =>
      r.worker_id === 'worker-pc' && (r.status === 'publishing' || r.status === 'awaiting_confirmation')
        ? { ...r, status: 'needs_attention' as QueueStatus }
        : r,
    );
    const w = await view(recovered, CAMPAIGN_ACTIVE);
    expect('7b worker restarted', 'recovery', 'the stuck row becomes "דורש טיפול" and the two screens line up again', {
      cardWaiting: w.card.waiting,
      scheduled: w.dash.scheduled,
      needsAction: w.dash.needsAction,
      invisible: w.dash.invisibleUnfinishedIds,
    }, { cardWaiting: 2, scheduled: 1, needsAction: 1, invisible: [] }, NONE);
    invWaitingAgreement('7b worker restarted', w);
    invCompletedMeansPublished('7b worker restarted', w);
  }

  /* ----------------------------------------------------------------------
   * 8 — DEFECT (B). Every row terminal, campaign record still 'paused'.
   *     resolveState() checks paused BEFORE it checks completion
   *     (campaign.ts:109 before :110).
   * -------------------------------------------------------------------- */
  {
    const rows = buildRun(plan(['published', 26], ['failed', 1], ['skipped', 1]));
    const v = await view(rows, CAMPAIGN_PAUSED);
    expect(
      '8 paused + all terminal',
      'INV-3',
      'a run whose every publication is finished reads "הושלם", not "מושהה"',
      v.card.stateLabel,
      'הושלם',
      v.card.stateLabel === 'הושלם' ? NONE : "(B) campaign.ts:109 `if (campaignStatus === 'paused') return 'paused';` runs before the completion check on :110",
    );
    expect(
      '8 paused + all terminal',
      'INV-4',
      'the card does not offer "המשך סבב" when there is nothing left to resume',
      { resumeOffered: v.card.resumeOffered, resumable: v.card.waiting },
      { resumeOffered: false, resumable: 0 },
      v.card.resumeOffered ? '(B) LiveCampaignHero.tsx:158 `const paused = state.state === \'paused\'` drives a button over an empty queue' : NONE,
    );
    expect('8 paused + all terminal', 'dashboard', 'the dashboard confirms there is nothing to resume', [v.dash.scheduled, v.dash.needsAction, v.dash.upcomingIds.length], [0, 0, 0], NONE);
    invCompletedMeansPublished('8 paused + all terminal', v);
  }

  /* ----------------------------------------------------------------------
   * 9 — DEFECT (A) at full strength. Published NOTHING, skipped everything.
   *     This is the evening the owner lost: 112 skipped, 0 published, a bar
   *     that read complete.
   * -------------------------------------------------------------------- */
  {
    const rows = buildRun(plan(['skipped', 28]));
    const v = await view(rows, CAMPAIGN_ACTIVE);
    invCompletedMeansPublished('9 nothing published', v);
    expect(
      '9 nothing published',
      'INV-2c',
      'a run that published nothing does not read as a finished run at 100%',
      { percent: v.card.percent, headline: v.card.headline, label: v.card.stateLabel },
      { percent: 0, headline: '0 מתוך 28 פורסמו · 28 דולגו', label: 'הושלם' },
      v.card.percent === 0 ? NONE : '(A) 28 skipped rows are counted as "הושלמו" and fill the bar to 100%',
    );
    expect(
      '9 nothing published',
      'INV-5',
      'no publication that has not finished is invisible to every tile',
      v.dash.invisibleUnfinishedIds,
      [],
      NONE,
    );
    expect(
      '9 nothing published',
      'INV-5b',
      'the run card says, in words, that 28 publications were skipped — so a queue that produced nothing is not silent',
      { headline: v.card.headline, skipped: v.card.skippedReally, published: v.card.publishedReally },
      { headline: '0 מתוך 28 פורסמו · 28 דולגו', skipped: 28, published: 0 },
      NONE,
    );
    expect('9 nothing published', 'tiles', 'nothing is waiting any more, and nothing failed', [v.dash.publishedToday, v.dash.scheduled, v.dash.needsAction, v.dash.failed], [0, 0, 0, 0], NONE);
  }

  /* ----------------------------------------------------------------------
   * 10 — THE OWNER'S LITERAL PAIRING, reproduced.
   *
   *  "הושלמו / 100%" on the run card AND the same publications listed under
   *  "הפרסומים הקרובים". The two screens read DIFFERENT row sets and nothing
   *  reconciles them:
   *
   *    • the card  ← campaignStates(): .order('scheduled_at') ASC then
   *                  .limit(CAMPAIGN_ROLLUP_LIMIT) — the cut falls on the
   *                  rows with the LATEST scheduled_at, i.e. exactly the ones
   *                  that have not happened yet;
   *    • the tiles ← countByStatus(), and "upcoming" ← listQueue(), both
   *                  unscoped and unaffected by that ceiling.
   *
   *  A run whose still-future rows fall past the last campaign row the server
 *  will return (CAMPAIGN_ROLLUP_LIMIT, which is now PostgREST's own 1000) by
   *  scheduled_at therefore reports 100% on rows that are only the part of
   *  itself that fitted. Its own scheduled rows are simultaneously on screen
   *  as upcoming. campaignStates() reports no truncation flag at all — note
   *  that library.ts's postUsage() DOES return `truncated` for exactly this
   *  reason (library.ts:204-210).
   *
   *  Reachable in this project because a run is reused by every launch of its
   *  post (library.ts quickPublish: "Re-launching the same post reuses it"),
   *  so a run's row count only ever grows — the owner's "tenth recurrence".
   * -------------------------------------------------------------------- */
  {
    const filler: Row[] = Array.from({ length: CAMPAIGN_ROLLUP_LIMIT - 14 }, (_, i) => ({
      id: `f${i}`,
      status: 'published' as QueueStatus,
      scheduled_at: new Date(Date.parse('2026-01-01T00:00:00.000Z') + i * 60_000).toISOString(),
      published_at: new Date(Date.parse('2026-01-01T00:00:00.000Z') + i * 60_000).toISOString(),
      target_id: 't-old',
      post_id: 'post-old',
      campaign_id: 'run-old',
      worker_id: null,
      claimed_at: null,
      target: { id: 't-old', name: 'ישן', channel: 'facebook_group' },
    }));
    const early = buildRun(plan(['published', 14], ['scheduled', 14])).slice(0, 14).map((r) => ({
      ...r,
      scheduled_at: new Date(Date.parse('2026-09-18T06:00:00.000Z') + Number(r.id.slice(1)) * 20 * 60_000).toISOString(),
      published_at: new Date(Date.parse('2026-09-18T06:00:00.000Z') + Number(r.id.slice(1)) * 20 * 60_000).toISOString(),
    }));
    const late = buildRun(plan(['scheduled', 28])).slice(14).map((r) => ({
      ...r,
      scheduled_at: new Date(Date.parse('2026-09-19T12:00:00.000Z') + Number(r.id.slice(1)) * 20 * 60_000).toISOString(),
    }));
    const db = fakeDb([...filler, ...early, ...late]);
    const campaigns: Campaign[] = [{ ...CAMPAIGN_ACTIVE, id: 'run-old', name: 'סבב ישן' }, CAMPAIGN_ACTIVE];
    const states = await simCampaignStates(db, campaigns, campaigns.map((c) => c.id));
    const c = card(states[RUN]);
    const d = await dashboard(db);
    const mineInUpcoming = d.upcomingIds.filter((id) => late.some((r) => r.id === id));

    /*
     * ───────── AND NOW THE NUMBER ITSELF IS RIGHT ─────────
     *
     * This assertion used to read `{ truncated: true, readRows: 14 }`: the
     * ceiling was accepted as unavoidable and the fix was that the card
     * DISCLOSED it. That was the best a row-counting rollup could do, and it
     * is what the owner photographed on 11.10 — "28 / 28 טופלו · 100%" with
     * "הסבב גדול מדי לספור אותו כאן במלואו" printed underneath it, the card
     * contradicting its own footnote in larger type.
     *
     * The count is not a row-counting question any more. v27's view answers it
     * in the database, over every row, with no ceiling near it — so the card
     * reports the round's real size and has nothing to disclose.
     */
    expect(
      '10 rollup truncation',
      'INV-6',
      'a run whose rows fall past the read ceiling still reports its REAL size, because the count no longer comes from the rows',
      { truncated: c.truncated, readRows: c.total },
      { truncated: false, readRows: 28 },
      NONE,
    );
    expect(
      '10 rollup truncation',
      'INV-7',
      'THE REPORTED CONTRADICTION: a card reading 100% beside its own rows listed as upcoming is now impossible — either nothing of the run is upcoming, or the card is flagged as partial',
      { contradiction: c.percent === 100 && mineInUpcoming.length > 0 && !c.truncated },
      { contradiction: false },
      NONE,
    );
    /*
     * THE OPEN ROWS ARE NOT A SAMPLE EITHER, and that is a database rule
     * rather than a hope: v20's social_queue_one_open_per_target_idx allows
     * one open row per group, so the account's whole open set is bounded by
     * its number of groups. The 14 still-waiting rows of this run are all
     * present however much finished history sits in front of them — which is
     * what the old single ascending read could not promise.
     */
    expect(
      '10 rollup truncation',
      'INV-6b',
      'and every one of the run\u2019s waiting rows is readable, however much finished history precedes it',
      states[RUN].upcoming.length,
      14,
      NONE,
    );

    /* ───────── THE FALLBACK, for a database that has not run v27 ─────────
     *
     * No view, so the numbers come from the rows again — and then every
     * surface must be told, because the slice is all there is. This is the
     * branch the card's `!state.truncated` clauses have always existed for,
     * and the branch the BADGE did not check until this fix.
     */
    const noView = await simCampaignStates(db, campaigns, campaigns.map((x) => x.id), { countsView: false });
    const cn = card(noView[RUN]);
    /*
     * AND THE FALLBACK IS BETTER TOO, for a reason worth stating: the open
     * read is FILTERED BY STATUS now, so finished history can no longer crowd
     * out the rows still waiting. Under the old single ascending read, 986
     * published rows filled the window and all 14 of this run's scheduled rows
     * fell off the end — 14 of 28, reported as the whole run. Here even
     * without the view every waiting row is present, so the row count IS the
     * run and nothing has to be disclosed.
     *
     * `openTruncated` is therefore only reachable on an account with a
     * thousand OPEN rows, and v20's one-open-row-per-group index means that
     * takes a thousand groups.
     */
    expect(
      '10 rollup truncation',
      'INV-6c',
      'even without the view the rows carry the whole run — and a ONE-OFF round, counted over its LIFE out of a SHARED history preview that was cut, still says it cannot prove that',
      { truncated: cn.truncated, readRows: cn.total },
      { truncated: true, readRows: 28 },
      NONE,
    );
    /*
     * THE GUARD ITSELF, exercised directly rather than through a scenario that
     * can no longer produce it. This is the badge the owner photographed:
     * resolveState() calls a run 'completed' when nothing is open, and on a
     * count that is not the round's, "nothing open" means "the open rows were
     * the ones we could not see".
     */
    const partial = { ...noView[RUN], truncated: true, state: 'completed' as const };
    expect(
      '10 rollup truncation',
      'INV-6d',
      'and a badge over a count that is NOT the round\u2019s refuses to end it — this is the "הסתיים — חלק דולגו" the owner photographed',
      runBadge(partial).label,
      'ספירה חלקית',
      NONE,
    );
    expect(
      '10 rollup truncation',
      'INV-6e',
      'and the bar refuses to reach 100% on a count that is not the round\u2019s',
      runProgress({ ...partial.progress, scheduled: 0, running: 0, manual: 0, finished: partial.progress.total, published: partial.progress.total }, false, true).percent,
      99,
      NONE,
    );
    expect(
      '10 rollup truncation',
      'INV-7b',
      'and the screens that draw it disclose the cap in Hebrew',
      [
        readFileSync('src/components/social/LiveCampaignHero.tsx', 'utf8').includes('state.truncated'),
        readFileSync('src/app/social/campaigns/[id]/page.tsx', 'utf8').includes('state?.truncated'),
      ],
      [true, true],
      NONE,
    );
  }

  /* =========================================================================
   * 11. THE OWNER\u2019S SCREEN OF 11.10 — "28 / 28 טופלו · 100% · הסתיים".
   *
   * "בפועל המערכת מפרסמת בהרבה יותר קבוצות."
   *
   * The exact shape, reproduced: a REPEATING round (CHZARA on, so it is
   * counted for today), a thousand rows of older history in front of it
   * account-wide, and today\u2019s round part published and part still waiting.
   *
   * Under the old single read: the window filled with the oldest rows, the
   * todayOnly filter then ran over what was left, and because an ascending cut
   * keeps the EARLIEST rows what survived of today was the part that had
   * already gone out. Everything finished, nothing open, 100%, "הסתיים".
   * ======================================================================= */
  {
    const DAY = '2026-09-19';
    const history: Row[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `h${i}`,
      status: 'published' as QueueStatus,
      scheduled_at: new Date(Date.parse('2026-08-01T00:00:00.000Z') + i * 60_000).toISOString(),
      published_at: new Date(Date.parse('2026-08-01T00:00:00.000Z') + i * 60_000).toISOString(),
      target_id: `t-h${i}`,
      post_id: POST,
      campaign_id: RUN,
      worker_id: null,
      claimed_at: null,
      target: { id: `t-h${i}`, name: `קבוצה ${i}`, channel: 'facebook_group' },
    }));
    /* Today: 27 published, 1 skipped, and 241 still waiting — 269 groups, the
       number of groups the owner actually has. */
    const todayDone: Row[] = Array.from({ length: 28 }, (_, i) => ({
      id: `d${i}`,
      status: (i === 27 ? 'skipped' : 'published') as QueueStatus,
      scheduled_at: `${DAY}T05:${String(i).padStart(2, '0')}:00.000Z`,
      published_at: i === 27 ? null : `${DAY}T05:${String(i).padStart(2, '0')}:00.000Z`,
      target_id: `t-d${i}`,
      post_id: POST,
      campaign_id: RUN,
      worker_id: null,
      claimed_at: null,
      target: { id: `t-d${i}`, name: `קבוצה ד${i}`, channel: 'facebook_group' },
    }));
    const todayWaiting: Row[] = Array.from({ length: 241 }, (_, i) => ({
      id: `w${i}`,
      status: 'scheduled' as QueueStatus,
      scheduled_at: `${DAY}T${String(6 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
      published_at: null,
      target_id: `t-w${i}`,
      post_id: POST,
      campaign_id: RUN,
      worker_id: null,
      claimed_at: null,
      target: { id: `t-w${i}`, name: `קבוצה ו${i}`, channel: 'facebook_group' },
    }));
    const db = fakeDb([...history, ...todayDone, ...todayWaiting]);
    const repeating = { ...CAMPAIGN_ACTIVE, repeat_enabled: true } as Campaign;
    const states = await simCampaignStates(db, [repeating], [RUN], { todayISO: DAY });
    const c = card(states[RUN]);
    const badge = runBadge(states[RUN]);
    const view = runProgress(states[RUN].progress, states[RUN].todayOnly, states[RUN].truncated);

    expect(
      '11 the 28/28 screen',
      'INV-8',
      'THE REPORTED FAULT: today\u2019s round is 269 publications, not the 28 of them that fitted inside an account-wide window of the oldest rows',
      { total: c.total, published: states[RUN].progress.published, skipped: states[RUN].progress.skipped, waiting: states[RUN].progress.scheduled },
      { total: 269, published: 27, skipped: 1, waiting: 241 },
      NONE,
    );
    expect(
      '11 the 28/28 screen',
      'INV-8b',
      'so it is not 100% and it has not ended — 241 publications are still to go',
      { percent: view.percent, state: states[RUN].state, label: badge.label },
      { percent: 10, state: 'running', label: 'רץ' },
      NONE,
    );
    expect(
      '11 the 28/28 screen',
      'INV-8c',
      'and nothing tells the owner the round is too big to count, because it is not',
      states[RUN].truncated,
      false,
      NONE,
    );
    /* THE SEPARATE BUCKETS the owner asked for, each from a real count. */
    expect(
      '11 the 28/28 screen',
      'INV-8d',
      'every bucket is counted on its own and the six of them partition the round exactly',
      states[RUN].progress.published +
        states[RUN].progress.failed +
        states[RUN].progress.skipped +
        states[RUN].progress.scheduled +
        states[RUN].progress.running +
        states[RUN].progress.manual,
      269,
      NONE,
    );
    /* AND TODAY IS TODAY. The lifetime of this round is 1,269 rows; the card
       is about today's and says so, and "has it ever published" is still
       answered from the whole life of it. */
    expect(
      '11 the 28/28 screen',
      'INV-8e',
      'a repeating round is counted for today, while "has it ever published" stays a question about its whole life',
      { todayOnly: states[RUN].todayOnly, today: c.total, ever: states[RUN].everPublished },
      { todayOnly: true, today: 269, ever: 1027 },
      NONE,
    );
  }

  /* =========================================================================
   * 12 — THE 39/39 "ספירה חלקית" SCREEN, 11/10 22:00
   *
   * "מה זה ההתראות הכתומות בלמעלה של הקמפיין ובשביל מה זה?"
   *
   * Two repeating rounds on a database that has NOT run social-latest.sql, so
   * there are no counting views and the numbers come from the rows. Three days
   * of history fill the shared 500-row lifetime preview, and the old flag —
   * one `rowsAreWhole` for the whole call — stamped EVERY campaign in it as
   * uncountable. A 39-row round was told it is "too big to count", printed
   * "לפחות 39 מתוך 39" at 99%, and wore an orange "ספירה חלקית" badge.
   *
   * Campaign A also carries a SKIPPED row from today. It has no published_at,
   * so it sorts last out of the lifetime preview whatever its age — which is
   * exactly why today is read by scheduled_at and not by published_at. INV-9b
   * is the assertion that proves that hole is closed.
   * ======================================================================= */
  {
    const DAY = '2026-10-11';
    const A = 'run-a';
    const B = 'run-b';
    const past = (d: number, i: number, run: string, tag: string): Row => ({
      id: `h-${run}-${d}-${i}`,
      status: 'published' as QueueStatus,
      scheduled_at: `2026-10-0${8 + d}T09:${String(i % 60).padStart(2, '0')}:00.000Z`,
      published_at: `2026-10-0${8 + d}T09:${String(i % 60).padStart(2, '0')}:00.000Z`,
      target_id: `t-${tag}${i}`,
      post_id: POST,
      campaign_id: run,
      worker_id: null,
      claimed_at: null,
      target: { id: `t-${tag}${i}`, name: `קבוצה ${tag}${i}`, channel: 'facebook_group' },
    });
    /* Three prior days, 223 a day — enough that the shared 500-row preview of
       lifetime history is full before today is reached at all. */
    const history: Row[] = [];
    for (let d = 0; d < 3; d += 1) {
      for (let i = 0; i < 184; i += 1) history.push(past(d, i, A, 'a'));
      for (let i = 0; i < 39; i += 1) history.push(past(d, i, B, 'b'));
    }
    /* Today, campaign A: 182 published, one SKIPPED (no published_at), one
       still waiting on a person — 184, the owner's own number. */
    const todayA: Row[] = Array.from({ length: 184 }, (_, i) => {
      const status: QueueStatus = i === 182 ? 'skipped' : i === 183 ? 'manual_pending' : 'published';
      const at = `${DAY}T${String(9 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`;
      return {
        id: `a${i}`,
        status,
        scheduled_at: at,
        published_at: status === 'published' ? at : null,
        target_id: `t-a-${i}`,
        post_id: POST,
        campaign_id: A,
        worker_id: null,
        claimed_at: null,
        target: { id: `t-a-${i}`, name: `קבוצה א${i}`, channel: 'facebook_group' },
      };
    });
    /* Today, campaign B: 39 published and nothing else. The card he
       photographed. */
    const todayB: Row[] = Array.from({ length: 39 }, (_, i) => ({
      id: `b${i}`,
      status: 'published' as QueueStatus,
      scheduled_at: `${DAY}T14:${String(i % 60).padStart(2, '0')}:00.000Z`,
      published_at: `${DAY}T14:${String(i % 60).padStart(2, '0')}:00.000Z`,
      target_id: `t-b-${i}`,
      post_id: POST,
      campaign_id: B,
      worker_id: null,
      claimed_at: null,
      target: { id: `t-b-${i}`, name: `קבוצה ב${i}`, channel: 'facebook_group' },
    }));

    const db = fakeDb([...history, ...todayA, ...todayB]);
    const runA = { ...CAMPAIGN_ACTIVE, id: A, repeat_enabled: true } as Campaign;
    const runB = { ...CAMPAIGN_ACTIVE, id: B, repeat_enabled: true } as Campaign;
    const states = await simCampaignStates(db, [runA, runB], [A, B], { countsView: false, todayISO: DAY });
    const sa = states[A];
    const sb = states[B];

    expect(
      '12 the 39/39 partial-count screen',
      'INV-9',
      'THE REPORTED FAULT: neither round is "too big to count" — one of them has thirty-nine rows',
      { a: sa.truncated, b: sb.truncated },
      { a: false, b: false },
      NONE,
    );
    expect(
      '12 the 39/39 partial-count screen',
      'INV-9b',
      'and today is counted by when a row was DUE, so the skipped row — which has no published_at and falls out of a published_at preview first — is still in the total',
      {
        aTotal: sa.progress.total,
        aPublished: sa.progress.published,
        aSkipped: sa.progress.skipped,
        aManual: sa.progress.manual,
        bTotal: sb.progress.total,
        bPublished: sb.progress.published,
      },
      { aTotal: 184, aPublished: 182, aSkipped: 1, aManual: 1, bTotal: 39, bPublished: 39 },
      NONE,
    );
    const viewB = runProgress(sb.progress, sb.todayOnly, sb.truncated);
    expect(
      '12 the 39/39 partial-count screen',
      'INV-9c',
      'so 39 of 39 is a hundred per cent, said plainly, under a green badge — no "לפחות", no orange',
      { percent: viewB.percent, hedged: viewB.handledLabel.startsWith('לפחות'), badge: runBadge(sb).label },
      { percent: 100, hedged: false, badge: 'הושלם' },
      NONE,
    );
    const viewA = runProgress(sa.progress, sa.todayOnly, sa.truncated);
    expect(
      '12 the 39/39 partial-count screen',
      'INV-9d',
      'and the round with one publication waiting on a person says THAT, which is the one thing on the card he can act on',
      { state: sa.state, badge: runBadge(sa).label, percent: viewA.percent, hedged: viewA.handledLabel.startsWith('לפחות') },
      { state: 'needs_attention', badge: 'דורש טיפול', percent: 99, hedged: false },
      NONE,
    );
    /*
     * THE CLEAR IS A PROOF, NOT A BLANKET. Push today itself past the read's
     * own ceiling and the round is flagged again — which is the whole reason
     * the new read discloses its own limit instead of trusting it.
     */
    const flood: Row[] = Array.from({ length: CAMPAIGN_ROLLUP_LIMIT + 5 }, (_, i) => ({
      id: `f${i}`,
      status: 'published' as QueueStatus,
      scheduled_at: `${DAY}T${String(9 + Math.floor(i / 600)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
      published_at: `${DAY}T${String(9 + Math.floor(i / 600)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
      target_id: `t-f-${i}`,
      post_id: POST,
      campaign_id: A,
      worker_id: null,
      claimed_at: null,
      target: { id: `t-f-${i}`, name: `קבוצה פ${i}`, channel: 'facebook_group' },
    }));
    const bigStates = await simCampaignStates(fakeDb([...history, ...flood, ...todayB]), [runA, runB], [A, B], {
      countsView: false,
      todayISO: DAY,
    });
    expect(
      '12 the 39/39 partial-count screen',
      'INV-9e',
      'a day genuinely larger than one read still says so — the clear is earned per round, not handed out',
      bigStates[A].truncated,
      true,
      NONE,
    );
  }

  /* =========================================================================
   * SOURCE-DRIFT GUARDS
   * The simulations above are copies. These pin them to the originals: if a
   * query or a tile moves and this file is not updated, the failure says so
   * rather than the simulation quietly diverging from the app.
   * ======================================================================= */
  const src = (p: string) => readFileSync(p, 'utf8');
  const client = src('src/lib/social/client.ts');
  const page = src('src/app/social/page.tsx');
  const hero = src('src/components/social/LiveCampaignHero.tsx');
  const campaignSrc = src('src/lib/social/campaign.ts');
  const pcWorker = src('worker/social-worker.ts');
  const srvWorker = src('src/lib/social/server/worker.ts');

  /* ======================================================================= */
  /*  ONE CARD, TWO OPPOSITE SENTENCES — "פורסם · Published" and, under it,   */
  /*  a red "הפרסום נכשל" with a retry button.                                */
  /*                                                                          */
  /*  Photographed by the owner on 28.09. Both halves were reading the         */
  /*  database correctly. On a SUCCESSFUL publication the worker writes a      */
  /*  remark into the column named `error`:                                    */
  /*                                                                          */
  /*    worker/social-worker.ts   error: note || null                          */
  /*                                                                          */
  /*  and the remark is good news with a caveat — the group is moderated so    */
  /*  the post is queued for its admin, or the post went out but was not       */
  /*  found in the feed afterwards to confirm it. explainFailure() had no      */
  /*  branch for a published row, so a non-empty `error` matched none of its   */
  /*  patterns and fell through to the generic "it failed".                    */
  /*                                                                          */
  /*  A column called `error` that carries success notes is the trap. These    */
  /*  assertions hold the reading side to the rule that survives it: STATUS    */
  /*  DECIDES, and a published row is never a failure.                         */
  /* ======================================================================= */
  {
    const published = (error: string) => ({ status: 'published' as QueueStatus, error, skip_reason: null });

    for (const [name, note] of [
      ['awaiting the group admin', 'הפוסט ממתין לאישור מנהל הקבוצה.'],
      ['not found in the feed', 'לא הצלחתי לאמת את הפוסט בפיד — בדקו בקבוצה.'],
      ['both at once', 'הפוסט ממתין לאישור מנהל הקבוצה. לא הצלחתי לאמת את הפוסט בפיד — בדקו בקבוצה.'],
      ['some remark nobody predicted', 'משהו אחר לגמרי'],
    ] as const) {
      const info = explainFailure(published(note));
      expect(
        'published-note',
        'PUB-1',
        `a published row (${name}) is never headlined as a failure`,
        info.headline.includes('נכשל'),
        false,
        'the green pill says published and the red text says it failed, on the same card, about the same post',
      );
      expect(
        'published-note',
        'PUB-2',
        `a published row (${name}) offers no retry`,
        info.canRetry,
        false,
        'a retry button under a post that already went out asks the owner to publish the same words to the same group twice',
      );
      expect(
        'published-note',
        'PUB-3',
        `a published row (${name}) is not painted as an error`,
        info.tone,
        note.includes('לא הצלחתי לאמת') ? 'warn' : 'note',
        'red is the colour of something being wrong, and nothing is wrong',
      );
    }

    /* The two real notes are still RECOGNISED rather than swept into one
       shrug: the owner has to know which of the two happened, because one
       needs them to look in the group and the other needs nothing at all. */
    expect(
      'published-note',
      'PUB-4',
      'the moderated-group note names moderation',
      explainFailure(published('הפוסט ממתין לאישור מנהל הקבוצה.')).headline,
      'הפוסט עלה וממתין לאישור מנהל הקבוצה',
      NONE,
    );
    expect(
      'published-note',
      'PUB-4b',
      'both remarks at once keep BOTH facts — moderation explains the miss, and the warning to not republish survives',
      (() => {
        const both = explainFailure(published('הפוסט ממתין לאישור מנהל הקבוצה. לא הצלחתי לאמת את הפוסט בפיד — בדקו בקבוצה.'));
        return [both.headline.includes('אישור מנהל'), both.advice.includes('כפול'), both.tone];
      })(),
      [true, true, 'warn'],
      'a chain of ifs hands this case to whichever pattern is written first, and the calm one was first',
    );
    expect(
      'published-note',
      'PUB-5',
      'the unverified note tells them to look, and warns against publishing again',
      explainFailure(published('לא הצלחתי לאמת את הפוסט בפיד — בדקו בקבוצה.')).advice.includes('כפול'),
      true,
      'without it the natural reaction to "we could not verify" is to press publish again',
    );

    /* And a row that really did fail still reads as a failure. The fix must
       not have bought quiet by making everything quiet. */
    const failed = explainFailure({ status: 'failed' as QueueStatus, error: 'משהו נשבר', skip_reason: null });
    expect('published-note', 'PUB-6', 'a failed row still says so, in red, with a retry', [failed.headline, failed.tone, failed.canRetry], ['הפרסום נכשל', 'error', true], NONE);
  }

  const pin = (name: string, haystack: string, needle: string) =>
    expect('guards', 'source-drift', `${name} still reads as this test simulates it`, haystack.includes(needle), true, NONE);

  /*
   * THIS PIN IS NOT JUST ABOUT THE NUMBER MATCHING. A rollup limit ABOVE the
   * server's db-max-rows (1000) cannot be hit, so `truncated` would go back to
   * being permanently false and scenario 10 would pass while testing a branch
   * production can never take. If this ever has to move, it may only move
   * DOWN, and this simulation must move with it.
   */
  pin('client.ts CAMPAIGN_ROLLUP_LIMIT', client, `const CAMPAIGN_ROLLUP_LIMIT = ${CAMPAIGN_ROLLUP_LIMIT};`);
  expect(
    'guards',
    'source-drift',
    'and it is at or under PostgREST db-max-rows, so a capped read can actually set `truncated`',
    CAMPAIGN_ROLLUP_LIMIT > 0 && CAMPAIGN_ROLLUP_LIMIT <= 1000,
    true,
    NONE,
  );
  pin('client.ts ROLLUP_DONE_LIMIT', client, `const ROLLUP_DONE_LIMIT = ${ROLLUP_DONE_LIMIT};`);
  pin('client.ts campaignStates open-read truncation flag', client, 'const openTruncated = openRows.length >= CAMPAIGN_ROLLUP_LIMIT;');
  /* THE THREE READS, pinned by shape. If any of them goes back to being one
     account-wide ascending read, the 28/28 scenario below stops reproducing
     what production does and this says so. */
  pin('client.ts open-rows read', client, ".in('status', OPEN_STATUSES as unknown as string[])");
  pin('client.ts done-rows read', client, "order('published_at', { ascending: false, nullsFirst: false })");
  pin('client.ts counts come from the v27 view', client, "from('social_campaign_counts')");
  /*
   * AND THE FOURTH READ, the one that lets a small round out of the hedge.
   *
   * These four pins are the whole of the fix the owner asked for, and each
   * one is load-bearing in a different direction:
   *
   *   sliceIsWhole   the open ceiling is the FIRST term, unconditionally —
   *                  it is the 28/28 guard and may never be relaxed;
   *   scheduled_at   today is read by when a row was DUE, because a skipped
   *                  or failed row has no published_at and would otherwise be
   *                  silently absent from today's total;
   *   todayIsWhole   the new read discloses its OWN ceiling instead of
   *                  trusting it, so the clear stays a proof;
   *   seen           a row reachable from two reads is counted once. Counting
   *                  it twice makes a total too BIG, which is the mirror
   *                  image of everything else this file guards.
   */
  pin(
    'client.ts wholeness is per scope, open ceiling first',
    client,
    'const sliceIsWhole = (todayOnly: boolean): boolean => !openTruncated && (todayOnly ? todayIsWhole : !doneTruncated);',
  );
  pin('client.ts today is read by when a row was due', client, ".gte('scheduled_at', dayStart.toISOString())");
  pin('client.ts and closed at the next midnight', client, ".lt('scheduled_at', dayEnd.toISOString())");
  pin('client.ts the today read discloses its own ceiling', client, 'todayIsWhole = todayRows.length < CAMPAIGN_ROLLUP_LIMIT;');
  pin('client.ts a row in two reads is counted once', client, 'if (seen.has(row.id)) continue;');
  pin('campaign.ts takes exact counts', campaignSrc, 'if (opts.counts) {');
  pin('campaign.ts state resolves from the counts', campaignSrc, 'resolveState(progress, campaign?.status, progress.total,');
  pin('campaign.ts badge refuses to end a round it cannot count', campaignSrc, "if (state.truncated && state.state === 'completed') {");
  pin('client.ts campaignStates campaign_id filter', client, ".not('campaign_id', 'is', null)");
  pin('client.ts listQueue order is the caller\'s', client, ".order('scheduled_at', { ascending: opts.order === 'asc' })");
  pin('client.ts countByStatus is exact', client, "select('id', { count: 'exact', head: true }).eq('status', status)");
  pin('page.tsx upcoming read is ascending', page, "listQueue({ status: AUTOMATIC_WAITING_STATUSES, limit: UPCOMING_LIMIT, order: 'asc' })");
  /*
   * THE FAILURES TILE IS ABOUT TODAY, like the tile at the other end of its
   * row. It printed summary.failed — an all-time count with no date filter —
   * so a screen showing "0 פורסמו היום" also showed "38 נכשלו", four tiles
   * apart, same row, same size, one about this morning and one about every
   * day since the install. The owner read the 38 as today's and asked why.
   */
  pin('page.tsx failures tile counts today', page, 'value={data.failedToday}');
  pin('page.tsx failures tile says which day', page, 'label="נכשלו היום"');
  pin('page.tsx failures tile opens today', page, "href=\"/social/history?status=failed&range=1\"");
  pin('page.tsx skips counted today too', page, 'data.skippedToday');
  pin('client.ts failures are counted from an instant', client, 'export async function countFailuresSince(sinceISO: string)');
  pin('client.ts uses the finish stamp, as listLiveQueue does', client, ".eq('status', status).gte('updated_at', sinceISO)");
  /* Both numbers in that row come from ONE midnight, or they are about two
     different days while sitting next to each other. */
  pin('page.tsx one midnight for both tiles', page, 'countFailuresSince(startOfZonedDay(now).toISOString())');

  /*
   * THE WEEK UNDER THE DAY. Once the row resets at midnight, every tile in it
   * reads zero on a morning before the first publication — and a dashboard
   * that says "nothing" about a week that published two hundred posts is
   * describing the clock, not the work.
   */
  pin('time.ts knows where the week starts', readFileSync(new URL('../../src/lib/social/time.ts', import.meta.url), 'utf8'), 'export function startOfZonedWeek');
  pin('page.tsx counts the week from Sunday', page, 'countPublishedSince(startOfZonedWeek(now).toISOString())');
  pin('page.tsx counts the week of comments too', page, 'countCommentsDoneSince(startOfZonedWeek(now).toISOString())');
  pin('published tile carries the week', page, 'note={data.weekPublished ?');
  pin('comments tile carries the week', page, 'note={data.weekComments ?');
  /* The two spans must never be confused for one another, so the second line
     says which it is rather than being a bare number under a daily figure. */
  pin('the week line says it is the week', page, 'מתחילת השבוע');

  /* The row is the first thing on the screen now. It used to sit under the
     system card, which on a quiet morning says nothing but "אין פרסום מתוזמן"
     — so the day was one scroll below a card announcing there was no day. */
  expect(
    'guards',
    'source-drift',
    'the tile row comes before the system card',
    page.indexOf('1 — HOW MANY, AND IT COMES FIRST NOW') < page.indexOf('<LiveQueueHero'),
    true,
    NONE,
  );

  /*
   * "+ קמפיין חדש" MUST LEAD WHERE THE WORK IS.
   *
   * It was wired to this page's own editor sheet — name, service, city,
   * language, notes — which does create a campaign row and is not what anybody
   * means by opening one: "למה לא נותן לי לרשום פוסט להוסיף תמונות לתזמן כמו
   * שהיה לפני". A campaign with no post in it is a name, not a campaign.
   * ensureRunForPost() opens the campaign by itself when a post is scheduled,
   * which is why this screen never had a create button before.
   */
  {
    const camp = readFileSync(new URL('../../src/app/social/campaigns/page.tsx', import.meta.url), 'utf8');
    /* The DESTINATION, not the formatting. This pinned the whole one-line
       element, so giving the button the design specification's height broke a
       guard that is about where it leads. The two halves below are what the
       owner's complaint was about: a ButtonLink (not a Button with an
       onClick), and /social/posts/new (not this page's rename sheet). */
    /* THE headerAction SLOT ALONE, because this page has a second
       ButtonLink to the same place — the empty state's "כתבו את הפוסט
       הראשון" — and a pin over the whole file passed with the header's own
       destination changed. Verified by changing it: the slice fails, the
       file-wide search did not. */
    /* The slice is computed, so its own ends are checked first: reorder the
       two props and indexOf would hand slice() a backwards range, which
       returns '' and fails both pins below with a message about the
       destination rather than about prop order. */
    const headerAt = camp.indexOf('headerAction=');
    const pausedAt = camp.indexOf('paused={');
    expect('guards', 'source-drift', 'the headerAction slice has both of its ends, in order', headerAt >= 0 && pausedAt > headerAt, true, NONE);
    const headerAction = camp.slice(headerAt, pausedAt);
    pin('new-campaign button goes to the post editor', headerAction, '<ButtonLink href="/social/posts/new"');
    pin('new-campaign button is still the one labelled that', headerAction, '+ קמפיין חדש');
    expect(
      'guards',
      'source-drift',
      'the new-campaign button does not open the rename sheet',
      /headerAction=\{<Button onClick=\{\(\) => openEditor\(\)\}/.test(camp),
      false,
      NONE,
    );
    /*
     * AND "ערוך" OPENS THE POST — "אני רוצה שיהיה אפשר לערוך את טקסט הפרסום /
     * תמונת מדיה של הפוסט ולא את מה שזה נותן עכשיו. את זה תמחק לא רלוונטי."
     *
     * This read `pin('the editor sheet is for editing', camp, 'title="עריכת
     * קמפיין"')` — the sheet of service, city, name, language and notes, none
     * of which is what goes out. The sheet is deleted, so the pin is inverted:
     * it must not come back, and the button it stood behind must point at the
     * screen that holds the text and the pictures.
     */
    expect('guards', 'source-drift', 'the campaign-rename sheet is gone, not orphaned', camp.includes('עריכת קמפיין'), false, NONE);
    pin('"ערוך" opens this campaign\u2019s post', camp, 'editHref={mine.length ? `/social/posts/${mine[0].id}`');
    pin('and a campaign with no post gets a new one already attached to it', camp, '`/social/posts/new?campaign=${c.id}`}');
  }

  /* The bottom bar is the navigation. A card of shortcuts to screens the tab
     bar already holds is a second door to the same room, and on a phone it
     costs a scroll to offer nothing. */
  pin('dashboard has no duplicate shortcut row', page, 'THE THREE SHORTCUT TILES USED TO SIT HERE');
  expect('guards', 'source-drift', 'QuickActions is gone rather than orphaned', page.includes('<QuickActions />'), false, NONE);

  pin('page.tsx queued tile', page, 'value={summary.queued}');
  /* RE-POINTED with unit.test.ts: the tile is gone (always 0, so nobody read
     the row), the figure is not — it names itself in the queue tile's sub-line
     and still raises the banner above the row. INV-1 below is about the
     NUMBER being on screen, not about which element carries it. */
  pin('page.tsx needs-you count survives the tile', page, 'ועוד ${summary.needsHuman} דורשים אתכם');
  pin('page.tsx pending figure is the cancellable count', page, 'const pending = summary.cancellable;');
  pin('page.tsx resetRun quotes what a stop can cancel', page, 'const waiting = cancellableRows(state.progress);');
  /*
   * RE-POINTED, not weakened — all three, each at the rule that replaced the
   * one it pinned.
   *
   * The ratio pinned `<Ratio done={progress.published} … suffix="פורסמו" />`:
   * the big figure on the run card is the publications count, and the bar
   * beside it therefore the publications ratio. That is the defect — one of 29
   * rows failed and the card drew 0% and printed "0%". The big figure is the
   * round's progress now, and the publications figure is a labelled sentence
   * directly under the bar, pinned on the next line so this move can never
   * quietly become "the successes were dropped".
   *
   * The two button pins read the state NAME, and were wrong in opposite
   * directions: "השהה" was offered on a run with nothing left to hold back
   * (and toasted "הסבב הושהה" over a write that could not move a row), and
   * "המשך סבב" vanished on a genuinely paused run whose remaining rows all
   * wait on a person. They now read campaign.ts's two predicates: pause is
   * about the ROWS, resume is about the RECORD.
   */
  /*
   * RE-POINTED a second time, and only at the part of the line that carries
   * the rule. The needle held the whole element including suffix="טופלו"; the
   * suffix is now `agree(view.handled, 'טופל', 'טופלו')`, because one handled
   * row printed "1 / 29 טופלו". The rule this pin exists for — the big figure
   * on the run card is the HANDLED count, not the publications count — lives
   * entirely in `done={view.handled}`, which is what the needle now reads.
   * INV-2d above still pins both full sentences, grammar included.
   */
  pin('LiveCampaignHero ratio counts handled rows', hero, 'done={view.handled}');
  pin('LiveCampaignHero ratio counts them out of the round', hero, 'total={view.total}');
  /* AND IT SAYS WHICH DAY IT IS ABOUT. runProgress() puts "היום" into
     handledLabel for a repeating round on purpose; this card renders the raw
     figures instead of that label, so the word never reached the screen — a
     true number under a sentence that does not say what it is about. */
  pin('LiveCampaignHero names the scope of its figures', hero, "state.todayOnly ? ' היום' : ''");
  pin('LiveCampaignHero still prints the publications figure', hero, 'view.publishedLabel');
  pin('LiveCampaignHero resume follows the campaign record', hero, 'const showResume = canResumeRun(progress, campaign.status);');
  pin('LiveCampaignHero pause is offered only when it can act', hero, 'const showPause = canPauseRun(progress, campaign.status);');
  pin('LiveCampaignHero resume label', hero, 'המשך סבב');
  pin('campaign.ts finished = published+failed+skipped', campaignSrc, 'progress.finished = progress.published + progress.failed + progress.skipped;');
  pin('campaign.ts terminal check before paused', campaignSrc, "if (openRows(p) === 0) return 'completed';");
  /*
   * RE-POINTED. This pinned the literal old BODY of percentPublished. That
   * body is gone — both percentages go through one clamped ratio() now — but
   * the rule it protected is not: publications are still their own figure, and
   * rounding may no longer round a run up to 100 while a publication is still
   * waiting (249 of 250 printed "100%"). The needle moves to the two lines
   * that carry those rules.
   */
  pin('campaign.ts publications are their own ratio', campaignSrc, 'return ratio(progress.published, progress.total);');
  pin('campaign.ts 100% is reserved for the exact count', campaignSrc, 'if (part >= total) return 100;');
  /* The line that makes all of this necessary. If the worker ever stops
     putting success notes in `error`, these guards fail and whoever changed it
     is pointed straight at the reading side that was built around it. */
  pin('worker writes the success note into `error`', pcWorker, 'error: note || null,');
  pin('worker note: moderated group', pcWorker, "'הפוסט ממתין לאישור מנהל הקבוצה.'");
  pin('worker note: unverified in feed', pcWorker, "'לא הצלחתי לאמת את הפוסט בפיד — בדקו בקבוצה.'");
  pin('pc worker crash recovery', pcWorker, ".in('status', ['publishing', 'awaiting_confirmation']);");
  pin('server worker leaves browser rows alone', srvWorker, ".is('worker_id', null)");

  /* ---------------------------------------------------------------- report */
  const width = 76;
  console.log('='.repeat(width));
  console.log('REPRODUCTION — run card vs dashboard, 28-row campaign (SIMULATED, no live database)');
  console.log('='.repeat(width));
  console.log(`${checks} assertions, ${failures.length} failing\n`);
  failures.forEach((f, i) => {
    console.log(`FAIL ${i + 1}/${failures.length}  [step ${f.step}] ${f.id}`);
    console.log(`  claim     : ${f.claim}`);
    console.log(`  expected  : ${JSON.stringify(f.expected)}`);
    console.log(`  got       : ${JSON.stringify(f.actual)}`);
    console.log(`  defect    : ${f.defect}`);
    console.log('');
  });
  if (!failures.length) {
    console.log('All green: every contradiction this file was written to reproduce is gone.');
    console.log('progress-contradiction tests OK');
    return;
  }
  console.log('-'.repeat(width));
  console.log('A failure here means a contradiction the owner reported has come back.');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
