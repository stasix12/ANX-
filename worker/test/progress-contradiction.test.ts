/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import {
  RUN_STATE_LABEL,
  campaignHeadline,
  campaignState,
  openRows,
  percentFinished,
  percentPublished,
  runProgress,
  type CampaignQueueRow,
  type CampaignState,
} from '@/lib/social/campaign';
import { AUTOMATIC_WAITING_STATUSES, ALL_QUEUE_STATUSES, summarizeQueue } from '@/lib/social/status';
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
    from(table: string) {
      if (table !== 'social_queue') throw new Error(`the fake serves social_queue only, asked for "${table}"`);
      return builder(rows);
    },
  };
}

/* ------------------------------- the reads, copied from src/lib/social/*.ts */

/** src/lib/social/client.ts:496 — `const CAMPAIGN_ROLLUP_LIMIT = 5000;` (not exported). */
const CAMPAIGN_ROLLUP_LIMIT = 5000;

/**
 * SIMULATION of client.ts campaignStates() (client.ts:504-528). Same select,
 * same .not('campaign_id','is',null), same .order('scheduled_at'), same
 * .limit(CAMPAIGN_ROLLUP_LIMIT), same grouping in JS, and then the REAL
 * campaignState() from campaign.ts.
 */
async function simCampaignStates(
  db: ReturnType<typeof fakeDb>,
  campaigns: Campaign[],
  campaignIds?: string[],
): Promise<Record<string, CampaignState<Row>>> {
  if (campaignIds && campaignIds.length === 0) return {};
  let query = db
    .from('social_queue')
    .select('id, status, scheduled_at, published_at, target_id, post_id, campaign_id, target:social_targets(id,name,channel,image_url)')
    .not('campaign_id', 'is', null)
    .order('scheduled_at')
    .limit(CAMPAIGN_ROLLUP_LIMIT);
  if (campaignIds) query = query.in('campaign_id', campaignIds);
  const { data: rows } = (await query) as Result;
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const list = grouped.get(row.campaign_id as string);
    if (list) list.push(row);
    else grouped.set(row.campaign_id as string, [row]);
  }
  const truncated = rows.length >= CAMPAIGN_ROLLUP_LIMIT;
  const out: Record<string, CampaignState<Row>> = {};
  for (const [id, list] of grouped) out[id] = campaignState(list, byId.get(id) ?? null, { truncated });
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
   *  A run whose still-future rows fall past the 5000th campaign row by
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
     * The ceiling is still there — it is what keeps one screen from pulling an
     * unbounded table — so the fix is not that the number changes, it is that
     * the number stops being presented as a total. campaignStates() now
     * detects its own ceiling and every state built from a capped read carries
     * `truncated`, which the hero and the run page render in words.
     */
    expect(
      '10 rollup truncation',
      'INV-6',
      'a run card built from a capped read says so, instead of printing the slice as the run',
      { truncated: c.truncated, readRows: c.total },
      { truncated: true, readRows: 14 },
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

  const pin = (name: string, haystack: string, needle: string) =>
    expect('guards', 'source-drift', `${name} still reads as this test simulates it`, haystack.includes(needle), true, NONE);

  pin('client.ts CAMPAIGN_ROLLUP_LIMIT', client, 'const CAMPAIGN_ROLLUP_LIMIT = 5000;');
  pin('client.ts campaignStates truncation flag', client, 'const truncated = rows.length >= CAMPAIGN_ROLLUP_LIMIT;');
  pin('client.ts campaignStates campaign_id filter', client, ".not('campaign_id', 'is', null)");
  pin('client.ts listQueue order is the caller\'s', client, ".order('scheduled_at', { ascending: opts.order === 'asc' })");
  pin('client.ts countByStatus is exact', client, "select('id', { count: 'exact', head: true }).eq('status', status)");
  pin('page.tsx upcoming read is ascending', page, "listQueue({ status: AUTOMATIC_WAITING_STATUSES, limit: UPCOMING_LIMIT, order: 'asc' })");
  pin('page.tsx queued tile', page, 'value={summary.queued}');
  pin('page.tsx needs-you tile', page, 'value={summary.needsHuman}');
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
  pin('LiveCampaignHero ratio counts handled rows', hero, '<Ratio done={view.handled} total={view.total}');
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
