/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THIRTY SECONDS: CAN THE ENGINE DO IT, AND WHAT DOES IT COST?
 *
 * "היעד: פרסום פוסט חדש כל 30 שניות במקום כל 60 שניות."
 *
 * Six questions were asked and this file answers all six, with numbers:
 *   100 tasks in a test environment     → section D, N = 100
 *   the PLANNED interval is 30 seconds  → section A
 *   two tasks in parallel               → section D, LANES = 2 and 3
 *   the system skips no task            → section D's missing-row assertion
 *   the times are synchronised          → section B and section C
 *   MEASURE the timing drift            → section F, printed and asserted
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The arithmetic is real: it imports
 * evaluateQueueItem, accountGapSeconds, splitAccountGap, windowedStagger,
 * projectQueue, spacingFrom, the Admission cursors and the display formatters
 * from the shipped modules and runs them unmodified. The clock is virtual —
 * 100 publications thirty seconds apart is fifty minutes of wall time and
 * package.json:17 is a fail-fast && chain. The database is an in-memory fake
 * PostgREST which models one UPDATE … WHERE as a single compare-and-set and
 * refuses a second open row per target the way
 * social_queue_one_open_per_target_idx does.
 *
 * AND THE ONE NUMBER THIS FILE CANNOT PRODUCE: how long one real publication
 * takes on the owner's PC against the real Facebook. PUB_MS is an INPUT. Every
 * cadence figure below is reported beside the publication duration it assumed,
 * never on its own.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateQueueItem, accountGapSeconds, splitAccountGap, accountGapLabel, PREP_LEAD_MS } from '../../src/lib/social/rules';
import { windowedStagger, projectQueue, spacingFrom, type ProjectableRow } from '../../src/lib/social/projection';
import { DEFAULT_BROWSER, DEFAULT_LIMITS } from '../../src/lib/social/types';
import { MIN_GAP_SECONDS, gapChoiceLabel, type CampaignSchedule } from '../../src/lib/social/campaign-schedule';
import { Admission, laneCountFor } from '../admission';
import { formatInstantHe, formatTimeHe } from '../../src/lib/social/time';

let checks = 0;
const eq = (a: unknown, b: unknown, m: string) => { checks += 1; assert.deepEqual(a, b, m); };
const is = (c: unknown, m: string) => { checks += 1; assert.ok(c, m); };
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/* ───────────────────────────── 1. THE VIRTUAL CLOCK ─────────────────────────
 * Discrete-event, not real timers: every lane awaits clock.sleep() and reads
 * clock.now(), so the 5-second poll, the publication's own duration and the
 * composer's hold are all virtual and the run is bit-identical between runs.
 * `guard` is there so a non-terminating engine fails the test instead of
 * hanging the chain. */
class Clock {
  ms: number;
  private waiters: { at: number; seq: number; go: () => void }[] = [];
  private seq = 0;
  constructor(startMs: number) { this.ms = startMs; }
  now(): Date { return new Date(this.ms); }
  sleep(d: number): Promise<void> {
    if (d <= 0) return Promise.resolve();
    return new Promise((go) => { this.waiters.push({ at: this.ms + d, seq: this.seq++, go }); });
  }
  async run(guard = 2_000_000): Promise<void> {
    let steps = 0;
    for (;;) {
      for (let i = 0; i < 80; i += 1) await Promise.resolve();
      if (!this.waiters.length) return;
      this.waiters.sort((a, b) => a.at - b.at || a.seq - b.seq);
      this.ms = Math.max(this.ms, this.waiters[0].at);
      const due = this.waiters.filter((w) => w.at <= this.ms);
      this.waiters = this.waiters.filter((w) => w.at > this.ms);
      for (const w of due) w.go();
      if ((steps += 1) > guard) throw new Error('clock ran away');
    }
  }
}

/* ──────────────── 2. THE WRITABLE FAKE POSTGREST ────────────────
 * The existing fakes in worker/test/ are read-only, and a compare-and-set
 * cannot be modelled by a builder with no write path. `update()` here
 * evaluates its filters ONCE against the rows as they are at that instant and
 * then assigns — which is what one `UPDATE … WHERE` does, and is the whole
 * reason "two lanes cannot claim one row" is testable at all. */
interface QRow {
  [k: string]: unknown;
  id: string; status: string; scheduled_at: string; published_at: string | null;
  target_id: string; post_id: string; campaign_id: string | null; variant_id: string | null;
  worker_id: string | null; attempts: number; dedupe_hash: string | null; step: string;
  claimed_at: string | null; step_at: string | null; skip_reason?: string | null;
}
/** OPEN_STATUSES from src/lib/social/status.ts, which is the index predicate. */
const OPEN = ['scheduled', 'manual_pending', 'needs_attention', 'awaiting_confirmation', 'paused', 'publishing'];

function store(queue: QRow[], campaigns: Record<string, Record<string, unknown>>) {
  const reads = { queue: 0, campaigns: 0 };
  function builder(table: string) {
    const fs: ((r: QRow) => boolean)[] = [];
    let patch: Record<string, unknown> | null = null;
    let head = false; let counting = false;
    let orderCol: string | null = null; let asc = true; let lim: number | null = null;
    let campaignId = '';
    const rows = () => (table === 'social_queue' ? queue : []);
    const settle = () => {
      if (table === 'social_campaigns') {
        reads.campaigns += 1;
        const c = campaigns[campaignId] ?? null;
        return { data: c, error: null, count: c ? 1 : 0 };
      }
      reads.queue += 1;
      if (patch) {
        const hit = rows().filter((r) => fs.every((f) => f(r)));
        for (const r of hit) {
          /* social_queue_one_open_per_target_idx, simulated: a row MOVING INTO
             an open status while another open row holds that target is 23505. */
          if (patch.status && OPEN.includes(String(patch.status)) && String(patch.status) !== r.status) {
            const clash = queue.find((o) => o !== r && o.target_id === r.target_id && OPEN.includes(o.status));
            if (clash) return { data: null, error: { message: 'social_queue_one_open_per_target_idx', code: '23505' }, count: 0 };
          }
          Object.assign(r, patch);
        }
        return { data: hit.map((r) => ({ id: r.id })), error: null, count: hit.length };
      }
      let out = rows().filter((r) => fs.every((f) => f(r)));
      if (orderCol) {
        const c = orderCol;
        out = out.slice().sort((a, b) => String(a[c] ?? '').localeCompare(String(b[c] ?? '')) * (asc ? 1 : -1));
      }
      if (lim !== null) out = out.slice(0, lim);
      if (head || counting) return { data: null, error: null, count: out.length };
      return { data: out, error: null, count: out.length };
    };
    const self: Record<string, unknown> = {
      select(_c?: string, o?: { count?: string; head?: boolean }) { if (o?.head) head = true; if (o?.count) counting = true; return self; },
      update(p: Record<string, unknown>) { patch = p; return self; },
      eq(c: string, v: unknown) { if (table === 'social_campaigns' && c === 'id') campaignId = String(v); fs.push((r) => r[c] === v); return self; },
      neq(c: string, v: unknown) { fs.push((r) => r[c] !== v); return self; },
      in(c: string, v: unknown[]) { fs.push((r) => v.includes(r[c])); return self; },
      not(c: string) { fs.push((r) => r[c] !== null && r[c] !== undefined); return self; },
      is(c: string) { fs.push((r) => r[c] === null); return self; },
      gte(c: string, v: string) { fs.push((r) => typeof r[c] === 'string' && (r[c] as string) >= v); return self; },
      lte(c: string, v: string) { fs.push((r) => typeof r[c] === 'string' && (r[c] as string) <= v); return self; },
      gt(c: string, v: string) { fs.push((r) => typeof r[c] === 'string' && (r[c] as string) > v); return self; },
      lt(c: string, v: string) { fs.push((r) => typeof r[c] === 'string' && (r[c] as string) < v); return self; },
      order(c: string, o?: { ascending?: boolean }) { orderCol = c; asc = o?.ascending ?? true; return self; },
      limit(n: number) { lim = n; return self; },
      maybeSingle() { const r = settle(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return Promise.resolve({ ...r, data: d }); },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(settle()).then(res, rej); },
    };
    return self;
  }
  return { db: { from: (t: string) => builder(t) } as unknown as SupabaseClient, reads, queue };
}

/* ───────────────────────────── 3. THE FIXTURE ───────────────────────────── */
const GAP = 30;
const N = 100;
const POLL_MS = 5_000;
const HOLD_CAP_MS = 3 * 60_000;          /* PREP_HOLD_CAP_MS, composer.ts */
const OPENS = Date.parse('2026-10-13T05:00:00.000Z'); /* 08:00 Asia/Jerusalem */
const SCHEDULE: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', gapSeconds: GAP };

/* The account floor lowered to the campaign's own gap, through the REAL split
   — the same values matchAccountGapTo(30) writes. */
const split = splitAccountGap(GAP, DEFAULT_BROWSER.groupMinGapMinutes * 60);
const LIMITS = {
  ...DEFAULT_LIMITS, maxPerDay: 1000, maxPerTargetPerDay: 5,
  minGapMinutes: Math.ceil(split.baseSeconds / 60), minGapSeconds: split.baseSeconds,
};
const BROWSER = {
  ...DEFAULT_BROWSER, maxPerCampaignPerDay: 0,
  groupMinGapMinutes: Math.ceil(split.surchargeSeconds / 60), groupMinGapSeconds: split.surchargeSeconds,
};
const CAMPAIGN_ROW = {
  status: 'active', schedule_enabled: true, schedule_days: [0, 1, 2, 3, 4, 5, 6],
  schedule_start: '08:00', schedule_gap_minutes: 1, schedule_gap_seconds: GAP,
  repeat_enabled: false, repeat_min_hours: 20,
};

interface RunOpts { lanes: number; pubMs: number; backlog: boolean; hang: string | null }
interface RunResult {
  lanes: number; pubMs: number;
  published: { id: string; at: number; planned: number; lane: number; clickAt: number }[];
  gaps: number[]; clickGaps: number[]; drift: number[];
  doubleClaims: string[]; deferred: string[]; indexHits: number;
  missing: string[]; perLane: number[]; wallMs: number;
}

/* ───────────────── 4. ONE RUN OF THE ENGINE, N LANES ─────────────────
 * This models the shipped control flow after the change: the claim, the rules
 * and both cursors inside admission.run(); the browser work outside it; the
 * final click instant re-confirmed inside it. Section G pins the real source
 * against this shape so the copy cannot drift. */
async function runEngine(o: RunOpts): Promise<RunResult> {
  const planned = windowedStagger(new Date(OPENS), N, GAP, SCHEDULE);
  const queue: QRow[] = planned.map((at, i) => ({
    id: `q${String(i).padStart(3, '0')}`, status: 'scheduled',
    scheduled_at: (o.backlog ? planned[0] : at).toISOString(), published_at: null,
    target_id: `g${String(i).padStart(3, '0')}`, post_id: 'p1', campaign_id: 'c1', variant_id: null,
    worker_id: null, attempts: 0, dedupe_hash: null, step: 'pending', claimed_at: null, step_at: null,
  }));
  const clock = new Clock(OPENS - 1000);
  const { db } = store(queue, { c1: CAMPAIGN_ROW });
  const browser = { ...BROWSER, concurrentJobs: o.lanes };
  const admission = new Admission();
  const lanes = laneCountFor({ want: o.lanes, gapMs: GAP * 1000, holdCapMs: HOLD_CAP_MS, serial: false });

  const published: RunResult['published'] = [];
  const claimedBy = new Map<string, number>();
  const doubleClaims: string[] = [];
  const deferred: string[] = [];
  let indexHits = 0;
  let hangLane = -1;

  /** The account's last real publication — the read rules.ts and the gate do. */
  const lastPublishedMs = async (): Promise<number> => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const r = (await (db.from('social_queue') as any)
      .select('published_at').eq('status', 'published').not('published_at', 'is', null)
      .order('published_at', { ascending: false }).limit(1).maybeSingle()) as { data: { published_at?: string } | null };
    return r.data?.published_at ? Date.parse(r.data.published_at) : 0;
  };

  async function lane(n: number): Promise<void> {
    for (;;) {
      if (published.length + (hangLane >= 0 ? 1 : 0) >= N) return;
      if (clock.ms > OPENS + 10 * 3_600_000) return;
      /* The due read, shaped like worker/social-worker.ts's: scheduled, due,
         soonest first, at most `lanes` rows. */
      const due = queue
        .filter((r) => r.status === 'scheduled' && r.scheduled_at <= clock.now().toISOString())
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
        .slice(0, lanes);
      if (!due.length) { await clock.sleep(POLL_MS); continue; }
      const item = due[0];

      /* ── THE ADMISSION SECTION ── */
      const reserved = await admission.run(async () => {
        const nowIso = clock.now().toISOString();
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const claimed = (await (db.from('social_queue') as any)
          .update({ status: 'publishing', step: 'opening', step_at: nowIso, claimed_at: nowIso, worker_id: `lane${n}`, attempts: item.attempts + 1 })
          .eq('id', item.id)
          .eq('status', 'scheduled')
          .select('id')) as { data: { id: string }[] | null; error: { code?: string } | null };
        if (claimed.error?.code === '23505') { indexHits += 1; return null; }
        if (!claimed.data?.length) return null;
        if (claimedBy.has(item.id)) doubleClaims.push(item.id);
        claimedBy.set(item.id, n);
        const decision = await evaluateQueueItem(db, {
          item: { ...item, attempts: item.attempts + 1 } as never,
          target: { id: item.target_id, name: item.target_id, channel: 'facebook_group', enabled: true } as never,
          post: { id: 'p1', status: 'ready', campaign_id: 'c1', base_text: 'x', media: [] } as never,
          variant: null, limits: LIMITS, browser, now: clock.now(),
        });
        if (decision.action !== 'publish') return { decision, slot: 0 } as const;
        const nb = (decision as { notBefore?: string }).notBefore;
        const slot = admission.issue({
          gapMs: GAP * 1000,
          notBeforeMs: nb ? Date.parse(nb) : clock.ms,
          lastPublishedMs: await lastPublishedMs(),
          nowMs: clock.ms,
        });
        return { decision, slot } as const;
      });
      if (!reserved) { await clock.sleep(POLL_MS); continue; }
      const d = reserved.decision;
      if (d.action === 'defer' || d.action === 'wait') {
        /* The hand-back: the attempt goes back too, so waiting is free. */
        deferred.push(item.id);
        item.status = 'scheduled'; item.worker_id = null; item.attempts -= 1;
        item.scheduled_at = (d as { until: string }).until;
        claimedBy.delete(item.id);
        await clock.sleep(POLL_MS); continue;
      }
      if (d.action === 'skip') { item.status = 'skipped'; item.skip_reason = (d as { reason: string }).reason; continue; }
      if (item.id === o.hang) { hangLane = n; await clock.sleep(12 * 3_600_000); return; }

      /* ── THE BROWSER WORK, OUTSIDE THE MUTEX ── */
      await clock.sleep(o.pubMs);

      /* ── THE CLICK INSTANT, RE-CONFIRMED INSIDE THE MUTEX ── */
      const clickAt = await admission.run(async () =>
        admission.commit({ gapMs: GAP * 1000, slotMs: reserved.slot, nowMs: clock.ms, lastPublishedMs: await lastPublishedMs() }));
      const until = Math.min(clickAt, clock.ms + HOLD_CAP_MS);
      if (until > clock.ms) await clock.sleep(until - clock.ms);
      const clicked = clock.ms;
      item.status = 'published'; item.published_at = clock.now().toISOString(); item.step = '';
      published.push({ id: item.id, at: clock.ms, clickAt: clicked, planned: planned[Number(item.id.slice(1))].getTime(), lane: n });
    }
  }

  const running = Array.from({ length: lanes }, (_, i) => lane(i));
  await clock.run();
  await Promise.all(running);

  published.sort((a, b) => a.at - b.at);
  const clicks = published.map((p) => p.clickAt).sort((a, b) => a - b);
  return {
    lanes, pubMs: o.pubMs, published,
    gaps: published.slice(1).map((p, i) => (p.at - published[i].at) / 1000),
    clickGaps: clicks.slice(1).map((c, i) => (c - clicks[i]) / 1000),
    drift: published.map((p) => (p.at - p.planned) / 1000),
    doubleClaims, deferred, indexHits,
    missing: queue.filter((r) => r.status !== 'published' && r.id !== o.hang).map((r) => `${r.id}:${r.status}`),
    perLane: Array.from({ length: lanes }, (_, i) => published.filter((p) => p.lane === i).length),
    wallMs: published.length > 1 ? published[published.length - 1].at - published[0].at : 0,
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function report(label: string, r: RunResult): void {
  console.log(
    '  %s\n    interval  mean %s  median %s  p95 %s  min %s  max %s  (s)\n    click-to-click  min %s  (s — the instant the floor is enforced on)\n    drift     mean %s  median %s  p95 %s  max %s  (s behind the planned instant)\n    wall      %ss for %d publications; ideal %ss; lanes %s; deferrals %d\n    FLOOR     %d of %d intervals below the %ds account floor',
    label,
    mean(r.gaps).toFixed(2), pct(r.gaps, 0.5).toFixed(2), pct(r.gaps, 0.95).toFixed(2), Math.min(...r.gaps).toFixed(2), Math.max(...r.gaps).toFixed(2),
    Math.min(...r.clickGaps).toFixed(2),
    mean(r.drift).toFixed(2), pct(r.drift, 0.5).toFixed(2), pct(r.drift, 0.95).toFixed(2), Math.max(...r.drift).toFixed(2),
    (r.wallMs / 1000).toFixed(0), r.published.length, ((r.published.length - 1) * GAP).toFixed(0), r.perLane.join('/'), r.deferred.length,
    r.clickGaps.filter((g) => g < GAP - 0.001).length, r.clickGaps.length, GAP,
  );
}

/** Every invariant that must hold of EVERY run, whatever the configuration. */
function assertSafe(r: RunResult, label: string): void {
  eq(r.doubleClaims, [], `${label}: NO ROW WAS CLAIMED TWICE — the compare-and-set on .eq('status','scheduled') is the whole guarantee`);
  eq(new Set(r.published.map((p) => p.id)).size, r.published.length, `${label}: no row published twice`);
  eq(r.missing, [], `${label}: NO TASK SKIPPED — every row is accounted for`);
  const under = r.clickGaps.filter((g) => g < GAP - 0.001);
  eq(under, [], `${label}: NOT ONE click is closer than the ${GAP}s account floor — the owner's own number is never broken to buy throughput`);
}

async function main(): Promise<void> {
  /* ════════════════ A. THE PLAN — the planned interval IS 30 seconds ═════ */
  eq(accountGapSeconds(LIMITS, BROWSER, true), GAP, 'the account floor reads back as exactly 30s for a group target');
  eq(accountGapSeconds(DEFAULT_LIMITS, DEFAULT_BROWSER, true), 65 * 60, 'and the SHIPPED default is still 65 minutes — this fixture lowered it, the defaults are untouched');
  eq(MIN_GAP_SECONDS, GAP, '30s is the floor the campaign panel offers, so nothing below it is being asked for');
  eq(split.baseSeconds + split.surchargeSeconds, GAP, 'the two stored columns add up to exactly the floor, which is what rules.ts compares against');

  const planned = windowedStagger(new Date(OPENS), N, GAP, SCHEDULE);
  eq(planned.length, N, '100 instants planned for 100 groups');
  eq([...new Set(planned.slice(1).map((d, i) => d.getTime() - planned[i].getTime()))], [GAP * 1000],
    'EVERY consecutive PLANNED gap is exactly 30000 ms — this is the assertion he asked for by name');
  is(planned[N - 1].getTime() - planned[0].getTime() === (N - 1) * GAP * 1000,
    'and the whole round spans 49.5 minutes, inside one 08:00–22:00 window, so no row is rolled to tomorrow');

  /* ════════════════ B. THE SCREENS — the same instants, everywhere ═══════ */
  const projRows: ProjectableRow[] = planned.map((at, i) => ({
    id: `q${String(i).padStart(3, '0')}`, scheduled_at: at.toISOString(), status: 'scheduled',
    campaign_id: 'c1', target: { channel: 'facebook_group' },
  }));
  const screen = projectQueue(projRows, {
    now: new Date(OPENS - 60_000),
    gates: { c1: { schedule: SCHEDULE, lastPublishedAt: null } },
    spacing: spacingFrom(LIMITS, BROWSER, null),
  });
  eq(screen.size, N, 'projection.ts answers for every row — and every screen in the product draws from it');
  for (let i = 0; i < N; i += 1) {
    eq(screen.get(projRows[i].id), projRows[i].scheduled_at,
      `row ${i}: the instant the screens project equals the instant the engine stored`);
  }
  /* A behind-schedule queue: the screens must agree with each other AND move
     forward, never project into the past. */
  const late = projectQueue(
    planned.map((_, i) => ({ ...projRows[i], scheduled_at: new Date(OPENS - 17 * 60_000 + i * GAP * 1000).toISOString() })),
    { now: new Date(OPENS), gates: { c1: { schedule: SCHEDULE, lastPublishedAt: null } }, spacing: spacingFrom(LIMITS, BROWSER, null) },
  );
  const lateIso = [...late.values()].filter((v): v is string => Boolean(v));
  eq(lateIso.length, N, 'a queue that has fallen 17 minutes behind is still answered for, row by row');
  is(lateIso.every((v) => Date.parse(v) >= OPENS), 'and not one row is projected into the past');
  const lateGaps = new Set(lateIso.slice(1).map((v, i) => Date.parse(v) - Date.parse(lateIso[i])));
  eq([...lateGaps], [GAP * 1000], 'the catch-up cascade is itself exactly 30s per row, so the countdown on every screen agrees');

  /* ════════════════ C. THE READOUT — a screen that can SAY 30 seconds ════ */
  eq(gapChoiceLabel(30), '30 שניות', 'the gap is spelled in seconds when it is seconds');
  eq(accountGapLabel(30), '30 שניות', 'and so is the floor, in the sentence a deferred row carries');
  const sixAt30 = Array.from({ length: 6 }, (_, i) => new Date(OPENS + i * GAP * 1000));
  eq(new Set(sixAt30.map((d) => formatTimeHe(d))).size, 3,
    'formatTimeHe is HH:MM, so six rows 30s apart collapse to THREE printed times — half the queue sharing a time with its neighbour');
  eq(new Set(sixAt30.map((d) => formatInstantHe(d))).size, 6,
    'formatInstantHe gives six distinct strings for six distinct instants — this is the fix for requirement 5');
  const onTheMinute = Array.from({ length: 6 }, (_, i) => new Date(OPENS + i * 10 * 60_000));
  eq(onTheMinute.map((d) => formatInstantHe(d)), onTheMinute.map((d) => formatTimeHe(d)),
    'and on a whole-minute cadence it is byte-identical to the old formatter, so no existing screen moves a pixel');

  /* ════════════════ D. THE LANE ARITHMETIC ══════════════════════════════ */
  eq(laneCountFor({ want: 3, gapMs: 30_000, holdCapMs: HOLD_CAP_MS, serial: false }), 3, 'at a 30s gap, three lanes fit inside the composer\'s 3-minute hold cap');
  eq(laneCountFor({ want: 3, gapMs: 65 * 60_000, holdCapMs: HOLD_CAP_MS, serial: false }), 1,
    'at the SHIPPED 65-minute floor it collapses to one lane — a second lane there would have the hold cap truncate its slot and turn a 65-minute floor into a 3-minute one');
  eq(laneCountFor({ want: 3, gapMs: 30_000, holdCapMs: HOLD_CAP_MS, serial: true }), 1, 'and confirmation mode is always serial: two questions at once is two 15-minute holds for one answer');
  eq(laneCountFor({ want: 9, gapMs: 30_000, holdCapMs: HOLD_CAP_MS, serial: false }), 3, 'and three is the ceiling whatever is asked for — one Chromium profile, one RAM budget');
  /* THE COMMIT CURSOR IS MONOTONIC, which is the whole proof of the floor:
     it is a counter advanced under the mutex, not a reading of the past, so no
     stale `published_at` and no estimate of how long a publication takes can
     put two clicks closer than the gap. */
  {
    const a = new Admission();
    const first = a.commit({ gapMs: 30_000, slotMs: 1_000, nowMs: 1_000, lastPublishedMs: 0 });
    const second = a.commit({ gapMs: 30_000, slotMs: 1_000, nowMs: 1_000, lastPublishedMs: 0 });
    const third = a.commit({ gapMs: 30_000, slotMs: 0, nowMs: 1_000, lastPublishedMs: 0 });
    eq([second - first, third - second], [30_000, 30_000],
      'three lanes all asking for the SAME instant with a stale last-published get three instants 30s apart');
    const b = new Admission();
    b.commit({ gapMs: 30_000, slotMs: 0, nowMs: 0, lastPublishedMs: 0 });
    eq(b.commit({ gapMs: 30_000, slotMs: 0, nowMs: 0, lastPublishedMs: 100_000 }),
      130_000, 'and a REAL publication later than the cursor still wins — the floor is the later of the two, never the earlier');
  }

  /* ════════════════ E. THE RUNS ═════════════════════════════════════════ */
  const PUB_MS = Number(process.env.PUB_MS ?? 45_000);
  console.log('\n  ── 100 TASKS, VIRTUAL CLOCK, REAL rules.ts ──');
  console.log('  Publication duration ASSUMED at %ds. This is an INPUT, not a measurement:', PUB_MS / 1000);
  console.log('  worker/social-worker.ts\'s own figure for a job is "30-60 seconds each".\n');

  const matrix: { label: string; o: RunOpts }[] = [
    { label: `1 lane,  publish ${PUB_MS / 1000}s, stamped queue`, o: { lanes: 1, pubMs: PUB_MS, backlog: false, hang: null } },
    { label: `2 lanes, publish ${PUB_MS / 1000}s, stamped queue`, o: { lanes: 2, pubMs: PUB_MS, backlog: false, hang: null } },
    { label: `3 lanes, publish ${PUB_MS / 1000}s, stamped queue`, o: { lanes: 3, pubMs: PUB_MS, backlog: false, hang: null } },
    { label: `1 lane,  publish 22s, stamped queue (fast post)`, o: { lanes: 1, pubMs: 22_000, backlog: false, hang: null } },
    { label: `2 lanes, publish 60s, stamped queue (slow post)`, o: { lanes: 2, pubMs: 60_000, backlog: false, hang: null } },
    { label: `3 lanes, publish 90s, stamped queue (slowest sustainable)`, o: { lanes: 3, pubMs: 90_000, backlog: false, hang: null } },
    { label: `3 lanes, publish 120s, stamped queue (OVER the ceiling)`, o: { lanes: 3, pubMs: 120_000, backlog: false, hang: null } },
    /* BACKLOG — every row already due, so ONLY the account floor paces them.
       This is the state after a respace, or after the PC was off for an hour,
       and it is the configuration naive parallelism destroys. */
    { label: `2 lanes, publish ${PUB_MS / 1000}s, BACKLOG (all 100 already due)`, o: { lanes: 2, pubMs: PUB_MS, backlog: true, hang: null } },
    { label: `3 lanes, publish ${PUB_MS / 1000}s, BACKLOG`, o: { lanes: 3, pubMs: PUB_MS, backlog: true, hang: null } },
    { label: `3 lanes, publish 85s, BACKLOG (the configuration naive lanes destroy)`, o: { lanes: 3, pubMs: 85_000, backlog: true, hang: null } },
  ];

  const results: RunResult[] = [];
  for (const { label, o } of matrix) {
    const r = await runEngine(o);
    eq(r.published.length, N, `${label}: all 100 rows published`);
    assertSafe(r, label);
    report(label, r);
    results.push(r);
  }

  /* TWO TASKS IN PARALLEL — proved by both lanes having done work. */
  const two = results[1];
  is(two.perLane.length === 2 && two.perLane.every((n) => n > 10),
    `TWO IN PARALLEL: both lanes published real work (${two.perLane.join(' / ')} of ${N})`);
  const three = results[2];
  is(three.perLane.length === 3 && three.perLane.every((n) => n > 10),
    `THREE IN PARALLEL: every lane published real work (${three.perLane.join(' / ')} of ${N})`);

  /* AT OR UNDER lanes × gap, THE CADENCE IS EXACTLY THE GAP. */
  for (const r of results) {
    if (r.pubMs <= r.lanes * GAP * 1000) {
      eq(Number(mean(r.gaps).toFixed(2)), GAP,
        `publish ${r.pubMs / 1000}s on ${r.lanes} lane(s) is inside ${r.lanes} × ${GAP}s, so the mean interval is exactly ${GAP}.00s`);
      eq(Number(pct(r.gaps, 0.95).toFixed(2)), GAP, `...and so is the p95, not just the mean`);
      eq(Number((r.wallMs / 1000).toFixed(0)), (N - 1) * GAP, `...and the round takes exactly as long as the plan says`);
    }
  }

  /* ABOVE IT, THE ENGINE IS HONEST ABOUT BEING LATE — the drift accumulates
     rather than the floor being broken. That is the assertion that keeps this
     report truthful the day a publication starts taking two minutes. */
  const over = results.find((r) => r.pubMs > r.lanes * GAP * 1000);
  is(over, 'the matrix includes one run above the ceiling, or nothing proves what happens there');
  if (over) {
    is(mean(over.gaps) > GAP + 1, `publish ${over.pubMs / 1000}s on ${over.lanes} lanes CANNOT hold 30s: measured ${mean(over.gaps).toFixed(2)}s`);
    is(over.drift[over.drift.length - 1] > over.drift[0] + 60,
      'and the lateness ACCUMULATES — the drift of the last row is minutes past the first, which is what "it cannot keep up" looks like in numbers');
    is(over.clickGaps.every((g) => g >= GAP - 0.001), 'but it is late rather than fast: not one click is closer than the floor');
  }

  /* A HUNG LANE MUST NOT STOP THE OTHERS (requirement 7). */
  for (const lanes of [2, 3]) {
    const r = await runEngine({ lanes, pubMs: PUB_MS, backlog: false, hang: 'q007' });
    eq(r.published.length, N - 1, `${lanes} lanes with one lane hung for twelve hours: the other ${lanes - 1} published all 99 remaining rows`);
    eq(r.missing, [], `${lanes} lanes, hung lane: not one row was lost`);
    assertSafe({ ...r, missing: [] }, `${lanes} lanes, hung lane`);
    report(`${lanes} lanes, publish ${PUB_MS / 1000}s, ONE LANE HUNG on q007`, r);
    is(r.perLane.filter((n) => n > 1).length >= lanes - 1, 'the surviving lanes carried the round');
  }

  /* ════════════════ F. THE DRIFT, SAID PLAINLY ══════════════════════════ */
  console.log('\n  ── DRIFT, DECOMPOSED ──');
  for (const r of results.filter((x) => x.pubMs <= x.lanes * GAP * 1000)) {
    const d = mean(r.drift);
    console.log('    %d lane(s), publish %ds: interval %s s, constant drift %s s = %ds publication + %ss poll/round-trip. NOT cumulative (max %s = mean %s).',
      r.lanes, r.pubMs / 1000, mean(r.gaps).toFixed(2), d.toFixed(2), r.pubMs / 1000, (d - r.pubMs / 1000).toFixed(2),
      Math.max(...r.drift).toFixed(2), d.toFixed(2));
    is(Math.max(...r.drift) - Math.min(...r.drift) < GAP,
      `${r.lanes} lanes @ ${r.pubMs / 1000}s: the drift is a CONSTANT phase offset, not an accumulating lag — spread ${(Math.max(...r.drift) - Math.min(...r.drift)).toFixed(2)}s`);
  }
  console.log('\n    The offset is one publication plus up to one %ds poll. It is the distance\n    between the planned grid and the wall clock, and it does NOT grow: the\n    interval stays %ds because each click is anchored to the previous click.\n', POLL_MS / 1000, GAP);

  /* ════════════════ G. THE SOURCE, PINNED ═══════════════════════════════ */
  const worker = src('../social-worker.ts');
  const rules = src('../../src/lib/social/rules.ts');
  const composer = src('../facebook/composer.ts');
  const sql = src('../../supabase/social-latest.sql');

  /* The claim is a compare-and-set, and this file's fake models that exact
     chain — so if the real one changes shape, this pin fails rather than the
     simulation silently drifting away from it. */
  is(/\.update\(\{ status: 'publishing'[\s\S]{0,400}?\.eq\('id', item\.id\)\s*\n\s*\.eq\('status', 'scheduled'\)\s*\n\s*\.select\('id'\)/.test(worker),
    "the claim must stay a compare-and-set: .eq('id') AND .eq('status','scheduled') — two lanes cannot both win it");
  is(/if \(!claimed\?\.length\) return;/.test(worker), 'and a lane that lost the race must give up the row, not carry on with it');

  /* The index that makes the due set one row per group, and the inner join
     that drops the NULL-target rows the index cannot constrain. */
  const idx = sql.match(/create unique index if not exists social_queue_one_open_per_target_idx[\s\S]*?where status in \(([^)]*)\)/);
  is(idx, 'social_queue_one_open_per_target_idx must still be a unique index on (target_id)');
  if (idx) {
    const inPredicate = idx[1].split(',').map((s) => s.trim().replace(/'/g, ''));
    eq(inPredicate.sort(), [...OPEN].sort(),
      'and its predicate must still be exactly OPEN_STATUSES — narrow it and two lanes can hold two rows for one group');
  }
  is(/target:social_targets!inner\(channel, account_id\)/.test(worker),
    'the due read must keep the INNER join: target_id is nullable, a unique index does not constrain NULLs, and the join is what keeps those rows out of a lane');

  /* The dedupe key is per target, which is why two lanes on two groups cannot
     race the duplicate-content rule. */
  is(/return `\$\{targetId\}\|/.test(src('../../src/lib/social/compose.ts')),
    'the dedupe hash must stay per-target, or two lanes on two groups start racing the duplicate rule');

  /* The hold is what makes the gap the gap, and it is capped. */
  is(/const PREP_HOLD_CAP_MS = 3 \* 60_000;/.test(composer), 'the hold cap is three minutes — laneCountFor() above is derived from it');
  is(composer.indexOf('if (input.notBefore) {') < composer.indexOf("await input.onStep('publishing')"),
    'and the hold still comes AFTER the post is written and the picture is in, so the wait IS the gap rather than being added to it');
  eq(PREP_LEAD_MS, 75_000,
    'PREP_LEAD_MS is UNCHANGED at 75s. At a 30s gap that makes the defer arm of the account gate unreachable and every row prepare-and-hold, which is how 30s is reached at all — shortening it revives a defer that adds DEFER_CUSHION_MS to every cycle');
  is(/const DEFER_CUSHION_MS = 5_000;/.test(rules),
    'and the cushion is still five seconds, which is why the lead must stay above the gap: a lead below it would make every cycle 35s');

  /* A browser timer must never be the scheduler. */
  const timerFires = /callSocialApi\(\s*['"`]\/api\/social\/run|publishNow\(|status:\s*'publishing'/;
  for (const f of ['../../src/app/social/page.tsx', '../../src/app/social/campaigns/page.tsx', '../../src/components/social/LiveBoard.tsx']) {
    const s = src(f);
    /* `\s*\}` and not `\n\s*\}`: the installer is built on a Windows runner,
       where every line ends CRLF and a bare \n never matches. */
    for (const m of s.matchAll(/set(?:Timeout|Interval)\(\s*(?:async\s*)?(?:\(\s*\)\s*=>\s*\{([\s\S]{0,1500}?)\s*\}|([A-Za-z_$][\w$]*))\s*,/g)) {
      const body = m[1] ?? (m[2] ? (s.match(new RegExp(`(?:const|function)\\s+${m[2]}\\b[\\s\\S]{0,1500}`)) ?? [''])[0] : '');
      is(!timerFires.test(body), `${f}: a browser timer must never trigger a publication — the scheduler is worker/social-worker.ts's own loop`);
    }
  }

  /*
   * ─── THE CONTROL THAT SETS THE GAP MUST SAY WHAT IT IS SETTING ──────────
   *
   * This whole file exists because the gap became SECONDS. The queue tuner's
   * value was migrated with it — seeded from gapSeconds, clamped to
   * MIN_GAP_SECONDS, handed to respaceQueue() which throws unless it is
   * seconds — and every LABEL on it was left saying minutes. A campaign on
   * the shipped 600-second gap showed "600" over "דקות בין פרסום לפרסום";
   * an owner correcting that to 10 got the queue re-spaced at thirty seconds
   * under a button reading "עדכן מרווח ל-30 דקות".
   *
   * Twenty times faster, on the one number that paces how fast this account
   * posts to Facebook, applied by a control that said it was slowing it down.
   */
  const tuner = src('../../src/components/social/QueueTunerSheet.tsx');
  const tunerCode = tuner.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  is(
    !/דקות בין פרסום לפרסום/.test(tunerCode),
    'the queue tuner still captions its seconds field with the word minutes',
  );
  is(!/מרווח בדקות/.test(tunerCode), 'and its field is still announced to a screen reader as minutes');
  is(/gapChoiceLabel\(gap\)/.test(tunerCode), 'the tuner no longer spells its own value with the product\u2019s one spelling of it');
  /* The stepper, the presets and the footer button all take the same spelling
     — three places that each said "דקות" over a number of seconds. */
  for (const call of ['gapChoiceLabel(STEP)', 'gapChoiceLabel(p)', 'gapChoiceLabel(MIN_GAP)']) {
    is(tunerCode.includes(call), `the tuner no longer spells ${call.replace('gapChoiceLabel(', '').replace(')', '')} in seconds`);
  }
  /* And the field can hold the shipped default at all: MAX_GAP is 43,200
     seconds and the input used to accept three characters. */
  is(!/slice\(0, 3\)/.test(tunerCode), 'the gap field is capped at three digits again — the ten-minute default cannot be typed');
  /* And the group surcharge is read in the same unit as the gap it is
     subtracted from. It was read in MINUTES (20) and taken off a value in
     SECONDS (1200), so the warning that says "your group surcharge is about
     to be rewritten" could only fire below twenty seconds — a value the
     minimum forbids — and the figure beside it was 1,180 of nothing. */
  is(
    /groupMinGapSeconds[\s\S]{0,160}groupMinGapMinutes \?\? 0\) \* 60/.test(tunerCode),
    'the tuner reads the group surcharge in minutes again and subtracts it from a value in seconds',
  );

  console.log('  %d assertions OK\n', checks);
}

void main().catch((e) => { console.error(e); process.exitCode = 1; });
