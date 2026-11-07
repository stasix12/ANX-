/*
 * ─────────────────────────────────────────────────────────────────────────────
 * מצב פרסום חכם — THE THREE MODES, THE REST, AND THE FIELD THAT IS GONE
 *
 * "בוא נגדיר לו 3 דפוסי התנהגות אחד מהיר השני בינוני השלישי, ושיהיה הפסקות
 *  אחרי נגיד 10 פוסטים רצופים הפסקה" — 07.11.2026, followed by a binding
 *  reference image and an eleven-section specification.
 *
 * WHAT THIS FILE PROVES, and in which section of the brief it is asked for:
 *
 *   §2  the old field "הפרש בין פרסומים" is gone from EVERY screen, with no
 *       second place to set the same number;
 *   §3  the three modes carry exactly the numbers specified, and nothing on
 *       the card promises anything about Facebook;
 *   §6  the rest runs after ten SUCCESSFUL publications, holds the queue,
 *       is displayed with the time left, and survives a refresh and a
 *       restart because it is derived rather than stored;
 *   §7  both publishing gates and the screen ask the SAME function, so two
 *       agents cannot pace differently;
 *   §9  the engine's behaviour is unchanged for an account that has not
 *       picked a mode — which is every account that exists today.
 *
 * THE ARITHMETIC IS RUN, NOT READ. paceRestRemainingMs() and
 * evaluateQueueItem() are imported from the shipped modules and executed
 * against an in-memory PostgREST; the source pins at the end are for the
 * wiring that cannot be executed from here.
 *
 *   npx tsx worker/test/smart-pace.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  PACE_PROFILES,
  evaluateQueueItem,
  paceProfile,
  paceRatePerHour,
  paceRestLabel,
  paceRestRemainingMs,
  PREP_LEAD_MS,
} from '../../src/lib/social/rules';
import { DEFAULT_BROWSER, DEFAULT_LIMITS, type LimitsSettings, type PaceId } from '../../src/lib/social/types';

let checks = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  checks += 1;
  assert.deepEqual(a, b, m);
};
const is = (c: unknown, m: string) => {
  checks += 1;
  assert.ok(c, m);
};
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(path.join(here, '..', '..', rel), 'utf8');

/**
 * THE SAME COMMENT-STRIPPER admin-panel.test.ts carries, and for the same
 * reason it was written: this repository's files explain at length what they
 * no longer do, so "the string is absent" has to mean absent from the CODE.
 * Five pins in one day matched a comment describing a deleted control.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

/* ══════════════ 1. THE TABLE IS THE SPECIFICATION, NUMBER FOR NUMBER ══════ */

eq(PACE_PROFILES.map((p) => p.id), ['fast', 'medium', 'slow'], 'three modes, fast → slow, which is the order an RTL row draws as איטי · בינוני · מהיר');
eq(PACE_PROFILES.map((p) => p.label), ['מהיר', 'בינוני', 'איטי'], 'and the words the brief uses for them');

for (const [id, gap, rest, tone] of [
  ['fast', 45, 7, 'warning'],
  ['medium', 120, 15, 'brand'],
  ['slow', 300, 30, 'success'],
] as const) {
  const p = paceProfile(id)!;
  is(p, `${id} exists`);
  eq(p.gapSeconds, gap, `${id}: ${gap}s between publications — the specification's own number`);
  eq(p.restMinutes, rest, `${id}: a ${rest}-minute rest`);
  eq(p.burst, 10, `${id}: ten in a run — "אחרי 10 פוסטים מוצלחים"`);
  eq(p.tone, tone, `${id}: the colour the specification assigns it (orange / blue / green as a TOKEN, never a hex)`);
}

eq(paceProfile(undefined), null, 'no mode stored is not a mode');
eq(paceProfile(null), null, 'and neither is null');
eq(paceProfile('nonsense' as PaceId), null, 'nor a value from a future version of this app');

/* The three must be rankable, or "מהיר / בינוני / איטי" are three names for
   nothing. Checked as a property of the table rather than of three literals,
   so re-tuning a number cannot silently cross two of them over. */
for (let i = 1; i < PACE_PROFILES.length; i += 1) {
  const slower = PACE_PROFILES[i];
  const faster = PACE_PROFILES[i - 1];
  is(slower.gapSeconds > faster.gapSeconds, `${slower.id} waits longer between publications than ${faster.id}`);
  is(slower.restMinutes > faster.restMinutes, `${slower.id} rests longer than ${faster.id}`);
  is(paceRatePerHour(slower) < paceRatePerHour(faster), `${slower.id} SUSTAINS fewer publications an hour than ${faster.id}`);
}

/* ══════════════ 2. THE RATE ON THE CARD IS THE SUSTAINED ONE ═════════════ */

/*
 * A run's first publication comes straight after the rest, so the cycle is
 * (burst − 1) gaps plus the rest. Quoting 3600/gap instead would describe the
 * fast mode as 80 an hour — a seven-minute burst presented as if it lasted all
 * day, which is the misreading the modes exist to correct.
 */
const expectRate = (p: { burst: number; gapSeconds: number; restMinutes: number }) =>
  (p.burst * 3600) / ((p.burst - 1) * p.gapSeconds + p.restMinutes * 60);

for (const p of PACE_PROFILES) {
  eq(Math.round(paceRatePerHour(p) * 100), Math.round(expectRate(p) * 100), `${p.id}: the rate is the cycle's, rest included`);
}
/* The three figures printed on the cards, so a change to any number here is
   visible as a change to the sentence the owner reads. */
eq(Math.round(paceRatePerHour(paceProfile('fast')!)), 44, 'מהיר sustains about 44 an hour — not the 80 its gap alone suggests');
eq(Math.round(paceRatePerHour(paceProfile('medium')!)), 18, 'בינוני about 18');
eq(Math.round(paceRatePerHour(paceProfile('slow')!)), 8, 'איטי about 8');

/*
 * AND ALL THREE ARE SLOWER THAN THE RATE THAT PRECEDED THIS ACCOUNT'S ONLY
 * RESTRICTION. 07.11.2026 21:40:13, after 158 publications at a sustained 69
 * an hour. That is not a claim that 69 caused it — the 02.11 night ran 152 an
 * hour and was not restricted — it is the one measured number this product
 * has, and a "mode" that published faster than it would be a brake in name.
 */
for (const p of PACE_PROFILES) {
  is(paceRatePerHour(p) < 69, `${p.id} sustains less than the 69/hour that preceded the account's only restriction`);
}

/* ══════════════ 3. AN ACCOUNT THAT HAS PICKED NOTHING IS UNCHANGED ═══════ */

is(!('pace' in DEFAULT_LIMITS), 'DEFAULT_LIMITS carries NO pace key — every one of the eight live settings rows loads with no mode, rests after nothing, and paces exactly as it did before this feature existed');
eq(paceRestRemainingMs(null, [Date.now(), Date.now() - 1000], Date.now()), 0, 'and with no mode, nothing is ever owed');

/* ══════════════ 4. paceRestRemainingMs — THE WHOLE TRUTH TABLE ═══════════ */

const MODE = paceProfile('fast')!; /* 45s gap, 10 in a run, 7-minute rest */
const REST_MS = MODE.restMinutes * 60_000;
const T = 1_762_500_000_000; /* a fixed instant; nothing here reads the clock */

/** `n` publications ending at `endAt`, each `gapMs` apart, newest first. */
const run = (n: number, endAt: number, gapMs: number) => Array.from({ length: n }, (_, i) => endAt - i * gapMs);

eq(paceRestRemainingMs(MODE, run(9, T, 45_000), T), 0, 'nine in a row is not a run of ten — nothing is owed');
eq(paceRestRemainingMs(MODE, [], T), 0, 'an account that has never published owes nothing');
eq(
  paceRestRemainingMs(MODE, run(10, T, 45_000), T),
  REST_MS,
  'ten in a row, the newest this instant: the whole rest is owed, measured from that newest publication',
);
eq(
  paceRestRemainingMs(MODE, run(10, T - 60_000, 45_000), T),
  REST_MS - 60_000,
  'a minute into the rest, six minutes are left',
);
eq(paceRestRemainingMs(MODE, run(10, T - REST_MS, 45_000), T), 0, 'the instant the rest is up it is no longer owed');
eq(paceRestRemainingMs(MODE, run(10, T - REST_MS - 60_000, 45_000), T), 0, 'and a minute past it, still nothing');

/*
 * THE RUN RESETS ITSELF, WHICH IS WHY THERE IS NO COUNTER COLUMN AND NO
 * MIGRATION. A stretch as long as the rest, between two publications, IS a
 * rest — so the publication after one starts a new run.
 */
{
  const afterRest = [T, T - REST_MS - 1000, ...run(9, T - REST_MS - 1000 - 45_000, 45_000)];
  eq(paceRestRemainingMs(MODE, afterRest, T), 0, 'one publication after a completed rest is a run of ONE, not of eleven — the count restarts with nothing stored');
}
{
  /* A quiet night counts as a rest too, which is right: an account that
     published nothing for seven minutes has had its break. */
  const quiet = [T, ...run(9, T - 8 * 60_000, 45_000)];
  eq(paceRestRemainingMs(MODE, quiet, T), 0, 'a gap longer than the rest, from ANY cause, breaks the run');
}
{
  /* …and a gap one millisecond SHORT of the rest does not. */
  const nearly = [T, ...run(9, T - (REST_MS - 1), 45_000)];
  eq(paceRestRemainingMs(MODE, nearly, T), REST_MS, 'a gap one millisecond short of a rest is not a rest');
}

/* A run LONGER than the burst still rests, and rests from its newest row. */
eq(paceRestRemainingMs(MODE, run(10, T, 20_000), T), REST_MS, 'ten publications 20s apart — denser than the mode asks for — still trigger the rest');

/* Degenerate tables can never produce a hold. */
eq(paceRestRemainingMs({ ...MODE, burst: 0 }, run(10, T, 45_000), T), 0, 'a run length of zero rests after nothing');
eq(paceRestRemainingMs({ ...MODE, restMinutes: 0 }, run(10, T, 45_000), T), 0, 'and a rest of zero minutes is no rest');

/* The label never promises an instant that has not arrived. */
eq(paceRestLabel(REST_MS), '7 דק׳', 'a full rest reads as its own length');
eq(paceRestLabel(61_000), '2 דק׳', 'and a minute and a second rounds UP, never down');
eq(paceRestLabel(1), '1 דק׳', 'the last seconds are still "a minute", never "0 דק׳"');

/* ══════════════ 5. THE ENGINE ITSELF, RUN AGAINST A FAKE DATABASE ════════ */

/*
 * An in-memory PostgREST with just enough of the builder for the four reads
 * evaluateQueueItem makes. It records the LIMIT the spacing read asks for,
 * which is the one thing a mode changes about that query.
 */
function fakeDb(published: number[]) {
  const asked: { limit: number | null }[] = [];
  const builder = (table: string) => {
    let lim: number | null = null;
    let counting = false;
    let cols = '';
    /*
     * HOW THE SPACING READ IS TOLD FROM THE OTHERS. evaluateQueueItem makes
     * four reads of social_queue; only one of them is the account-wide
     * spacing read, and it is the only one that selects `published_at` alone
     * with a single `eq` (the status). The repeat and dedupe guards add
     * post_id / target_id / dedupe_hash. Without this the fake answered the
     * repeat guard with ten rows and every decision came back "כבר פורסם".
     */
    let eqs = 0;
    const self: Record<string, unknown> = {
      select(c?: string, o?: { count?: string; head?: boolean }) {
        cols = c ?? '';
        if (o?.count || o?.head) counting = true;
        return self;
      },
      eq: () => {
        eqs += 1;
        return self;
      },
      neq: () => self,
      in: () => self,
      not: () => self,
      is: () => self,
      gte: () => self,
      lte: () => self,
      gt: () => self,
      lt: () => self,
      order: () => self,
      limit(n: number) {
        lim = n;
        return self;
      },
      maybeSingle: () => Promise.resolve({ data: null, error: null, count: 0 }),
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        if (table !== 'social_queue') return Promise.resolve({ data: null, error: null, count: 0 }).then(res, rej);
        if (counting) return Promise.resolve({ data: null, error: null, count: 0 }).then(res, rej);
        if (cols !== 'published_at' || eqs !== 1) return Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej);
        asked.push({ limit: lim });
        const rows = published
          .slice()
          .sort((a, b) => b - a)
          .slice(0, lim ?? published.length)
          .map((t) => ({ published_at: new Date(t).toISOString() }));
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(res, rej);
      },
    };
    return self;
  };
  return { db: { from: (t: string) => builder(t) } as unknown as SupabaseClient, asked };
}

const ctxFor = (limits: LimitsSettings, now: Date) => ({
  item: {
    id: 'q1',
    campaign_id: null,
    post_id: 'p1',
    target_id: 't1',
    variant_id: null,
    status: 'scheduled',
    scheduled_at: now.toISOString(),
    published_at: null,
    attempts: 0,
    dedupe_hash: null,
  },
  target: { id: 't1', name: 'קבוצה', channel: 'facebook_group', enabled: true },
  post: { id: 'p1', base_text: 'שלום', media: [], status: 'ready', campaign_id: null },
  variant: null,
  limits,
  browser: { ...DEFAULT_BROWSER, maxPerCampaignPerDay: 0, groupMinGapMinutes: 0, groupMinGapSeconds: 0 },
  now,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
}) as any;

/*
 * WRAPPED IN A FUNCTION, not written at the top level, because tsx transforms
 * this file to CJS and top-level await is not available there. The sync
 * sections below run first; this one is awaited at the foot of the file, and
 * a rejection exits non-zero rather than printing a pass.
 */
async function engineChecks(): Promise<void> {
  /* No mode: the spacing read asks for ONE row, exactly as it always has. */
  {
    const now = new Date(T);
    const { db, asked } = fakeDb(run(10, T - 10 * 60_000, 45_000));
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: 10, minGapMinutes: 1 };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(decision.action, 'publish', 'with no mode picked, ten recent publications hold nothing back — the engine is exactly what it was');
    eq(asked.at(-1)?.limit, 1, 'and the spacing read asks for the single most recent row, byte for byte the query it was');
  }

  /* The mode, mid-run: the rest holds the row and says so. */
  {
    const now = new Date(T);
    const { db, asked } = fakeDb(run(10, T - 60_000, 45_000));
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: 45, minGapMinutes: 1, pace: 'fast' };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(asked.at(-1)?.limit, MODE.burst, 'with a mode the read asks for the run length, because a run cannot be told from a broken stretch with one row');
    eq(decision.action, 'defer', 'ten publications a minute ago means the row waits');
    is(
      decision.action === 'defer' && decision.reason.includes('הפסקה אחרי 10 פרסומים רצופים'),
      'and the reason says REST, naming the run length — not "מרווח", which would tell the owner his gap is seven minutes',
    );
    is(
      decision.action === 'defer' && Date.parse(decision.until) >= T + REST_MS - 60_000,
      'and it comes back no earlier than the rest allows',
    );
  }

  /* The rest is over: the row goes. */
  {
    const now = new Date(T);
    const { db } = fakeDb(run(10, T - REST_MS - 1000, 45_000));
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: 45, minGapMinutes: 1, pace: 'fast' };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(decision.action, 'publish', 'once the rest has run, publishing resumes on its own — nothing has to be pressed');
  }

  /* Close enough to prepare inside: a hold, not a deferral — the same shape the
     gap uses, so a rest ending in under PREP_LEAD_MS does not cost a round trip. */
  {
    const now = new Date(T);
    const { db } = fakeDb(run(10, T - REST_MS + 30_000, 45_000));
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: 45, minGapMinutes: 1, pace: 'fast' };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(decision.action, 'publish', 'a rest with 30s left lets the row through…');
    is(
      decision.action === 'publish' && decision.notBefore && Date.parse(decision.notBefore) > T,
      '…with the instant attached, so the composer holds the final click (PREP_LEAD_MS)',
    );
    is(30_000 <= PREP_LEAD_MS, 'sanity: 30s is inside the preparation lead this test is relying on');
  }

  /* A run of nine under a mode: ordinary spacing, no rest. */
  {
    const now = new Date(T);
    const { db } = fakeDb(run(9, T - 120_000, 45_000));
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: 45, minGapMinutes: 1, pace: 'fast' };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(decision.action, 'publish', 'nine in a run and the gap satisfied: the tenth goes out, and only then does the rest begin');
  }
}

/* ══════════════ 6. §2 — THE OLD FIELD IS GONE FROM EVERY SCREEN ══════════ */

/*
 * "יש להסיר לחלוטין מהממשק את השדה הישן: הפרש בין פרסומים. אין להשאיר אותו
 *  במקום אחר ואין ליצור הגדרה כפולה."
 *
 * Walked rather than listed, so a new screen cannot reintroduce the field by
 * being somewhere this test does not look. Comments are stripped first: this
 * repository explains at length what it no longer does, and five pins in one
 * day have matched a comment describing a deleted control.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const uiFiles = walk(path.join(here, '..', '..', 'src'));
is(uiFiles.length > 50, `sanity: ${uiFiles.length} source files walked — a scan of nothing matches nothing`);

const offenders: string[] = [];
for (const file of uiFiles) {
  const code = stripComments(readFileSync(file, 'utf8'));
  /* The label itself, in any of the two spellings the product has used for
     it, as a STRING a screen could render. */
  if (/(?:label|aria-label|aria)\s*=\s*["'{`][^"'`}]*(?:הפרש בין פרסומים|מרווח בין פרסומים)/.test(code)) {
    offenders.push(path.relative(path.join(here, '..', '..'), file));
  }
}
eq(offenders, [], 'no screen labels a control "הפרש בין פרסומים" or "מרווח בין פרסומים" any more — מצב פרסום חכם is the only place that number is chosen');

/* And the two controls that actually wrote it are gone by shape, not by name. */
{
  const panel = stripComments(src('src/components/social/CampaignSchedulePanel.tsx'));
  is(!/GAP_CHOICES/.test(panel), 'the campaign panel no longer offers a list of gaps');
  is(!/onAccountGapChange/.test(panel), 'and no longer takes a handler for writing one');
  is(/SmartPaceCard/.test(panel), 'it renders מצב פרסום חכם instead');
}
{
  const quick = stripComments(src('src/components/social/QuickPublishSheet.tsx'));
  is(!/QUICK_GAPS\.map/.test(quick), 'the launch sheet no longer draws its six quick-gap chips');
  is(!/aria-label="מרווח בין פרסומים"/.test(quick), 'nor its gap select');
}
{
  const settings = stripComments(src('src/app/social/settings/page.tsx'));
  is(!/minGapMinutes:/.test(settings), 'and Settings no longer WRITES the gap — the box is gone, and so is the field in its save, which is what stops a screen open for ten minutes reverting a mode picked in between');
}

/* ══════════════ 7. §7 — ONE RULE, ASKED BY EVERY AGENT ═══════════════════ */

{
  const rules = stripComments(src('src/lib/social/rules.ts'));
  const worker = stripComments(src('worker/social-worker.ts'));
  const client = stripComments(src('src/lib/social/client.ts'));

  is(/export function paceRestRemainingMs\(/.test(rules), 'the rest rule has exactly one implementation, and it is in rules.ts');
  is(/paceRestRemainingMs\(/.test(worker), "the worker's own pre-claim gate ASKS that function rather than repeating it — the gap drifted between these two gates once already");
  is(/paceRestRemainingMs\(/.test(client), 'and so does the screen, so what is displayed and what is enforced cannot disagree');

  /* The rest is decided BEFORE the gap. Both can be owed at once, the rest is
     always the later instant, and the gap's branch returns on its own — so the
     other order would defer for the gap, come back, and defer again for the
     rest, telling the owner his gap is seven minutes on the way. */
  const gate = rules.slice(rules.indexOf('export async function evaluateQueueItem'));
  is(gate.indexOf('paceRestRemainingMs(pace, stamps') < gate.indexOf('accountGapSeconds(limits, ctx.browser'), 'the rest is checked before the gap, or the owner reads the wrong reason');

  /* One read serves both gates, and the mode is the only thing that changes
     about it. */
  is(/\.limit\(pace \? Math\.max\(1, pace\.burst\) : 1\)/.test(gate), 'the spacing read asks for the run length with a mode and for one row without one');
  is(/\.limit\(pace \? Math\.max\(1, pace\.burst\) : 1\)/.test(worker), "and the worker's gate asks for exactly the same thing");

  /* Only successful publications count. */
  is(/\.eq\('status', 'published'\)/.test(client), 'readPaceRest counts published rows only — "פרסום שנכשל אינו נחשב לפרסום מוצלח", structurally');

  /* The notice cannot spam the activity log for the length of a rest. */
  is(/Math\.max\(gate\.gapMs, gate\.restMs\) \/ 2/.test(worker), 'the waiting line is said once per WAIT, not once per gap — a 45s gap beside a 7-minute rest would otherwise write the same line every 22 seconds for seven minutes');

  /* The two writes a mode makes, in the order that does not lose one. */
  const apply = client.slice(client.indexOf('export async function applyPace'), client.indexOf('export async function liveQueuePlan'));
  is(apply.length > 200, 'applyPace was located');
  is(apply.indexOf('applyGapFloor(') < apply.indexOf("saveSetting('limits'"), 'applyGapFloor runs FIRST and the pace is written onto the row it leaves — the other order has applyGapFloor re-read the row before the pace lands and write it back without it');
  is(/\.\.\.limits, pace: id/.test(apply), 'and the pace is written onto a FRESH read, never onto a copy a screen loaded at mount');
}

/* ══════════════ 8. §6 — "בהפסקה" IS ON SCREEN, WITH THE TIME LEFT ════════ */

{
  const next = stripComments(src('src/components/social/NextPublication.tsx'));
  is(/data-resting/.test(next), 'the next-publication block has a resting state');
  is(/בהפסקה · חוזר לפרסם בעוד/.test(next), 'and it says so, with the time left, the way it already says it for a Meta freeze');
  is(/data-resting-why/.test(next), 'with the reason under it — a timer with no reason beside it is a machine that stopped for no stated cause');
  is(/countdownTo\(restUntil, now\)/.test(next), 'counted by the same helper the freeze uses, so two clocks on one card cannot format differently');
  is(/Boolean\(restUntil\)/.test(next), 'and the tick is armed for it, or the countdown renders once and freezes there');
  /* A freeze outranks a rest: one is Facebook holding the account and the
     other is the account's own chosen mode. */
  is(/const resting = !frozen &&/.test(next), 'a Meta freeze outranks a rest — two countdowns on one line is how a card stops being readable');

  const card = stripComments(src('src/components/social/SmartPaceCard.tsx'));
  is(/data-pace-resting/.test(card), 'and the mode card shows the rest too, where the mode that caused it is');
}

/* ══════════════ 9. §3 — THE CARD, AND WHAT IT MAY NOT SAY ════════════════ */

{
  const card = src('src/components/social/SmartPaceCard.tsx');
  const code = stripComments(card);

  is(/role="radiogroup"/.test(code) && /role="radio"/.test(code), 'the three modes are a radio group — one choice, announced as one choice');
  is(/aria-checked=\{on\}/.test(code), 'with the chosen one marked for a screen reader');
  is(/PACE_PROFILES\.map/.test(code), 'the row is built FROM the table the engine reads, so a card and a gate cannot disagree about a mode');
  is(/grid-cols-3/.test(code), 'all three on one line — "יש להציג את שלוש האפשרויות בשורה אחת"');
  is(/border-brand-500/.test(code), 'the chosen one takes a blue border — "יודגש באמצעות מסגרת כחולה"');
  is(/bg-brand-300\/15/.test(code), 'with a soft fill behind it — "רקע עדין"');
  is(/CheckIcon/.test(code), 'and a check mark, which is the second channel a border colour alone cannot give a colour-blind reader');
  is(/data-pace-summary/.test(code), 'there is a dynamic summary line under the row — "שורת סיכום דינמית המציגה את הקצב ואת משך ההפסקה"');
  is(/paceRatePerHour\(selected\)/.test(code), 'and it quotes the SUSTAINED rate, not the gap pretending to be a rate');
  is(/PACE_PROFILES\[0\]\.burst/.test(code), 'the "אחרי כל 10 פרסומים" pill reads its number off the table rather than spelling it out');

  /* EVERY multi-column grid in this product carries the min-w-0 guard, or a
     long word inside one blows the card's width out on a phone. */
  for (const m of code.matchAll(/className="[^"]*grid-cols-\d[^"]*"/g)) {
    is(/\[&>\*\]:min-w-0/.test(m[0]), `every grid carries the min-w-0 guard — ${m[0].slice(0, 70)}`);
  }

  /*
   * "אין להציג את המצבים כהבטחה למניעת חסימות בפייסבוק."
   *
   * The reference image's own subtitle ends "להגנה מפייסבוק". That half is
   * deliberately not reproduced: the specification forbids it in so many
   * words, and the two cannot both be honoured. This checks the STRINGS, not
   * the comments — a comment may quote the forbidden phrase to explain why it
   * is absent, and this file's own prose above does exactly that.
   */
  for (const bad of ['להגנה מפייסבוק', 'מונע חסימה', 'ימנע חסימה', 'לא תיחסם', 'בטוח מול פייסבוק', 'מבטיח']) {
    is(!code.includes(bad), `the card never promises "${bad}" — no mode can promise anything about Meta`);
  }
}

/* ══════════════ 10. §5 — THE DAYS AND THE SCHEDULE ARE UNTOUCHED ═════════ */

{
  const panel = stripComments(src('src/components/social/CampaignSchedulePanel.tsx'));
  is(/DAY_LABELS\.map/.test(panel), 'all seven days are still choosable');
  is(/grid-cols-7/.test(panel), 'on one row, in week order, exactly as before');
  is(/min-h-10/.test(panel), 'at the 40px floor campaign-card.test.ts hit-tests');
  is(/toggleDay/.test(panel), 'and a tap still toggles in both directions');
  is(/onDraft=\{setStartDraft\}/.test(panel) && /onCommit=\{commitStart\}/.test(panel), 'the start-time picker still drafts on the wheel and writes once on close — the fix for "the wheel threw him out mid-pick"');
  is(/שעת התחלה/.test(panel), 'and the row is still labelled שעת התחלה');
  is(/חזרה יומית/.test(panel), 'the daily repeat is still here');
  is(/NextPublication/.test(panel), 'and so is "הפרסום הבא"');
  /* The reference puts הפרסום הבא last, under the repeat. */
  is(panel.lastIndexOf('NextPublication') > panel.indexOf('חזרה יומית'), 'with "הפרסום הבא" below "חזרה יומית", which is the order the 07.11 image draws');
}

engineChecks()
  .then(() => {
    console.log(`✓ smart-pace: ${checks} בדיקות עברו`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
