/*
 * ─────────────────────────────────────────────────────────────────────────────
 * מצב פרסום חכם — THREE GAPS, AND THE REST THAT NO LONGER EXISTS
 *
 * "סבב מהיר יוצא כל 40 שניות לקבוצה, בינוני כל דקה וחצי, ואיטי כל 2 דקות.
 *  תבטל את הדקות המתנה בין 10 פוסטים זה לא רלוונטי" — 08.11.2026.
 *
 * A mode used to carry a gap AND a rest after ten publications. The rest is
 * gone, and this file's job changed with it: it now proves the three gaps are
 * what was asked for, and — the harder half — that the rest was removed from
 * EVERY place it reached rather than switched off in one of them. A feature
 * half-removed is worse than one left in: the engine would hold rows the
 * screens no longer explain.
 *
 * WHAT THIS FILE PROVES:
 *
 *   §1  the three modes carry exactly 40s / 90s / 120s, ordered, and the rate
 *       on the card is the gap turned round rather than an invented average;
 *   §2  the old field "הפרש בין פרסומים" is still gone from EVERY screen,
 *       with no second place to set the same number;
 *   §3  the rest is gone from the engine, both gates, the client and all four
 *       screens — no helper, no read, no countdown, no leftover prop;
 *   §4  ten publications a minute ago hold NOTHING back any more, which is
 *       the behaviour change, run against an in-memory PostgREST;
 *   §5  the ordinary gap still holds, because that is the one brake left and
 *       removing a rest must not have loosened it;
 *   §6  nothing on the card promises anything about Facebook;
 *   §7  the days, the start time and the daily repeat are untouched.
 *
 * THE ARITHMETIC IS RUN, NOT READ. evaluateQueueItem() is imported from the
 * shipped module and executed; the source pins are for the wiring that cannot
 * be executed from here.
 *
 *   npx tsx worker/test/smart-pace.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';

import { PACE_PROFILES, PACE_UNAVAILABLE, evaluateQueueItem, paceCards, paceProfile, paceRatePerHour } from '../../src/lib/social/rules';
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

eq(PACE_PROFILES.map((p) => p.id), ['fast', 'medium', 'slow'], 'three modes, fast → slow');
/*
 * "רגיל" AND NOT "בינוני", SINCE 18.11.2026 — the reference image for
 * הגדרות ← מהירות פרסום names the middle card רגיל, and the word lives in this
 * one table so a card and a toast cannot spell one mode two ways. Same id,
 * same ninety seconds: it is a rename, not a fourth mode.
 */
eq(PACE_PROFILES.map((p) => p.label), ['מהיר', 'רגיל', 'איטי'], 'and the words the reference uses for them');

for (const [id, gap, tone] of [
  ['fast', 40, 'warning'],
  ['medium', 90, 'brand'],
  ['slow', 120, 'success'],
] as const) {
  const p = paceProfile(id)!;
  is(p, `${id} exists`);
  eq(p.gapSeconds, gap, `${id}: ${gap}s between publications — the owner's own number, 08.11.2026`);
  eq(p.tone, tone, `${id}: the colour the brief assigns it (orange / blue / green as a TOKEN, never a hex)`);
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
  is(paceRatePerHour(slower) < paceRatePerHour(faster), `${slower.id} publishes fewer an hour than ${faster.id}`);
}

/* ══════════════ 1b. THE GAPS THE OWNER SET, AND THE RATE THEY WORK OUT TO ═ */

eq(paceProfile('fast')!.gapSeconds, 40, 'מהיר is 40 seconds — "סבב מהיר יוצא כל 40 שניות לקבוצה"');
eq(paceProfile('medium')!.gapSeconds, 90, 'רגיל is a minute and a half — "בינוני כל דקה וחצי", the owner\'s own number, under the word the reference gives it');
eq(paceProfile('slow')!.gapSeconds, 120, 'איטי is two minutes');

/*
 * The rate is now 3600/gap and nothing else. It used to average a
 * burst-and-rest cycle, which was the right arithmetic while a rest existed
 * and would be a lie about the engine now that none does.
 */
for (const p of PACE_PROFILES) {
  eq(Math.round(paceRatePerHour(p) * 100), Math.round((3600 / p.gapSeconds) * 100), `${p.id}: the rate is the gap turned round, with nothing averaged into it`);
}
eq(Math.round(paceRatePerHour(paceProfile('fast')!)), 90, 'מהיר ≈ 90 an hour');
eq(Math.round(paceRatePerHour(paceProfile('medium')!)), 40, 'רגיל ≈ 40 an hour');
eq(Math.round(paceRatePerHour(paceProfile('slow')!)), 30, 'איטי ≈ 30 an hour');

/*
 * AND NO MODE IS SOLD AS A DEFENCE. Measured on 08.11.2026 against this
 * installation's own history: the account ran 94–100 actions an hour on eight
 * separate days with no rate limit, and a customer's account runs a 15-second
 * gap at up to 138 an hour and has never been rate limited at all. So the
 * gaps here are a choice about throughput, not a shield, and §6 below pins
 * that no string on the card claims otherwise.
 */

/* ══════════════ 2. THE PaceProfile TABLE CARRIES ONLY A GAP ══════════════ */

for (const p of PACE_PROFILES) {
  /* Cast because the TYPE no longer declares these — which is half the point.
     The other half is that no row still CARRIES them, so a mode cannot have a
     rest the type has forgotten how to describe. */
  const row = p as unknown as Record<string, unknown>;
  is(!('burst' in row), `${p.id} has no run length — the rest was removed, not defaulted to something harmless`);
  is(!('restMinutes' in row), `${p.id} has no rest length either`);
  eq(Object.keys(row).sort(), ['gapSeconds', 'id', 'label', 'tone'], `${p.id} carries a gap, a name and a colour, and nothing else`);
}

/* ══════════════ 3. AN ACCOUNT THAT HAS PICKED NOTHING IS UNCHANGED ═══════ */

is(!('pace' in DEFAULT_LIMITS), 'DEFAULT_LIMITS carries NO pace key — every live settings row loads with no mode and paces exactly as it did before this feature existed');

/* ══════════════ 4. THE REST IS GONE FROM EVERY PLACE IT REACHED ══════════ */

/*
 * The whole point of this section. A rest removed from the table but left in
 * a gate would hold rows no screen explains; left in a screen but not the
 * gate would count down a hold that is not happening. Both have happened in
 * this product with other settings, which is why this is checked by name in
 * all seven files rather than trusted to one.
 */
{
  const rules = stripComments(src('src/lib/social/rules.ts'));
  const worker = stripComments(src('worker/social-worker.ts'));
  const client = stripComments(src('src/lib/social/client.ts'));
  const card = stripComments(src('src/components/social/SmartPaceCard.tsx'));
  const next = stripComments(src('src/components/social/NextPublication.tsx'));
  const panel = stripComments(src('src/components/social/CampaignSchedulePanel.tsx'));
  const board = stripComments(src('src/components/social/CampaignScheduleBoard.tsx'));
  const dash = stripComments(src('src/app/social/page.tsx'));
  const camps = stripComments(src('src/app/social/campaigns/page.tsx'));

  is(!/paceRestRemainingMs/.test(rules), 'the rest rule is gone from rules.ts — there is no implementation left to drift from');
  is(!/paceRestLabel/.test(rules), 'and so is its label');
  is(!/paceRestRemainingMs|paceRestLabel|restMs/.test(worker), "the worker's pre-claim gate no longer knows about a rest");
  is(!/readPaceRest|PaceRestState/.test(client), 'the client no longer reads one');
  is(!/restUntil|data-pace-resting|בהפסקה/.test(card), 'the mode card draws no countdown');
  is(!/restUntil|data-resting|בהפסקה/.test(next), 'and neither does the next-publication block');
  is(!/restUntil/.test(panel), 'the panel takes no such prop');
  is(!/restUntil/.test(board), 'nor the board');
  is(!/paceRest/.test(dash), 'the dashboard no longer polls for one');
  is(!/paceRest/.test(camps), 'nor does the campaigns screen');

  /* And no screen still writes the sentence. */
  for (const [name, code] of [['card', card], ['panel', panel], ['dashboard', dash], ['campaigns', camps]] as const) {
    is(!/הפסקה אוטומטית/.test(code), `${name} no longer promises an automatic rest`);
    is(!/פרסומים רצופים/.test(code), `${name} no longer counts publications in a row`);
  }

  /* ONE READ, ONE ROW — in both gates, which is what it was before modes. */
  const gate = rules.slice(rules.indexOf('export async function evaluateQueueItem'));
  is(/\.limit\(1\)/.test(gate), 'the per-row spacing read asks for the single most recent publication');
  is(!/pace\.burst/.test(gate), 'and not for a run length that no longer exists');
  is(/\.limit\(1\)/.test(worker), "the worker's gate asks for exactly the same one row");
  is(/gate\.gapMs \/ 2/.test(worker), 'and the waiting line is throttled on the gap alone, which is the only wait left');

  /* The one write a mode still makes. */
  const apply = client.slice(client.indexOf('export async function applyPace'), client.indexOf('export async function liveQueuePlan'));
  is(apply.length > 200, 'applyPace was located');
  is(apply.indexOf('applyGapFloor(') < apply.indexOf("saveSetting('limits'"), 'applyGapFloor runs FIRST and the pace is written onto the row it leaves');
  is(/\.\.\.limits, pace: id/.test(apply), 'and the pace is written onto a FRESH read, never onto a copy a screen loaded at mount');
}

/* ══════════════ 5. THE ENGINE, RUN AGAINST A FAKE DATABASE ═══════════════ */

const MODE = paceProfile('fast')!; /* 40s gap, no rest */
const T = 1_762_500_000_000; /* a fixed instant; nothing here reads the clock */

/** `n` publications ending at `endAt`, each `gapMs` apart, newest first. */
const run = (n: number, endAt: number, gapMs: number) => Array.from({ length: n }, (_, i) => endAt - i * gapMs);

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
    const { db, asked } = fakeDb(run(10, T - 10 * 60_000, 40_000));
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: 10, minGapMinutes: 1 };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(decision.action, 'publish', 'with no mode picked, ten recent publications hold nothing back');
    eq(asked.at(-1)?.limit, 1, 'and the spacing read asks for the single most recent row');
  }

  /*
   * ─── THE BEHAVIOUR CHANGE, STATED AS A TEST ─────────────────────────────
   *
   * This exact case used to return `defer` with "הפסקה אחרי 10 פרסומים
   * רצופים". Ten publications forty seconds apart, the newest a minute ago,
   * a mode in force — and the row now goes out, because the gap is satisfied
   * and there is no rest left to owe. If this ever returns `defer` again, a
   * rest has come back from somewhere.
   */
  {
    const now = new Date(T);
    const { db, asked } = fakeDb(run(10, T - 60_000, 40_000));
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: 40, minGapMinutes: 1, pace: 'fast' };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(asked.at(-1)?.limit, 1, 'with a mode the read STILL asks for one row — the run length is gone');
    eq(decision.action, 'publish', 'ten publications a minute ago no longer rest the queue: the row goes out');
  }

  /* A hundred in a row changes nothing either. */
  {
    const now = new Date(T);
    const { db } = fakeDb(run(100, T - 60_000, 40_000));
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: 40, minGapMinutes: 1, pace: 'fast' };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(decision.action, 'publish', 'and neither does a hundred — there is no run length at any size');
  }

  /*
   * ─── BUT THE GAP STILL HOLDS, WHICH IS THE ONE BRAKE LEFT ───────────────
   *
   * Removing the rest must not have loosened the gap. The last publication
   * was ten seconds ago under a mode asking for forty, so the row waits —
   * and the reason says מרווח, which is now the only reason this gate gives.
   */
  {
    /* The SLOW mode, so the wait left (110s) is longer than PREP_LEAD_MS and
       the gate has to defer rather than hold the row inside the lead. */
    const slow = paceProfile('slow')!;
    const now = new Date(T);
    const { db } = fakeDb([T - 10_000]);
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: slow.gapSeconds, minGapMinutes: 1, pace: 'slow' };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(decision.action, 'defer', 'a publication ten seconds ago under a two-minute mode does NOT go out — the gap survived the removal');
    is(
      decision.action === 'defer' && !/הפסקה|רצופים/.test(decision.reason),
      'and the reason it gives is the gap, never a rest',
    );
    is(
      decision.action === 'defer' && Date.parse(decision.until) >= T + slow.gapSeconds * 1000 - 10_000,
      'and it comes back no earlier than the gap allows',
    );
  }

  /* A gap with less than PREP_LEAD_MS left is a HOLD, not a deferral — the
     shape that saves a round trip, and the only remaining user of it. */
  {
    const now = new Date(T);
    const { db } = fakeDb([T - 10_000]);
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: MODE.gapSeconds, minGapMinutes: 1, pace: 'fast' };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(decision.action, 'publish', 'under the 40-second mode, 30 seconds left is inside the preparation lead…');
    is(
      decision.action === 'publish' && decision.notBefore && Date.parse(decision.notBefore) > T,
      '…so the row is prepared with the instant attached and the composer holds the final click',
    );
  }

  /* Once the gap has run, it goes. */
  {
    const now = new Date(T);
    const { db } = fakeDb([T - (MODE.gapSeconds * 1000 + 1000)]);
    const limits: LimitsSettings = { ...DEFAULT_LIMITS, maxPerDay: 9999, maxPerTargetPerDay: 9999, dedupeDays: 0, minGapSeconds: MODE.gapSeconds, minGapMinutes: 1, pace: 'fast' };
    const decision = await evaluateQueueItem(db, ctxFor(limits, now));
    eq(decision.action, 'publish', 'and a second past the gap it publishes');
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
  /*
   * ─── RE-POINTED 18.11.2026 ────────────────────────────────────────────
   *
   *   "יש להעביר את בחירת מהירות הפרסום מלוח הבקרה אל מסך ההגדרות."
   *
   * This used to assert the panel RENDERS the mode card. The picker moved to
   * הגדרות, so the pin inverts: the panel must no longer draw it, and — the
   * half that matters — the gap must not come back as a field here either,
   * which the two assertions above already hold.
   */
  is(!/SmartPaceCard/.test(panel), 'the panel no longer draws the speed picker — it moved to הגדרות ← מהירות פרסום');
  is(!/onPaceChange/.test(panel), 'and takes no handler for writing a mode');
}
{
  const quick = stripComments(src('src/components/social/QuickPublishSheet.tsx'));
  is(!/QUICK_GAPS\.map/.test(quick), 'the launch sheet no longer draws its six quick-gap chips');
  is(!/aria-label="מרווח בין פרסומים"/.test(quick), 'nor its gap select');
}
{
  const settings = stripComments(src('src/app/social/settings/page.tsx'));
  is(!/minGapMinutes:/.test(settings), 'and Settings still has no BOX for the gap, and still does not write it in save() — which is what stops a screen open for ten minutes reverting a mode picked in between');
  /*
   * AND THIS IS WHERE THE MODE IS CHOSEN NOW. The gap is still not a field —
   * it is written by applyPace, from a tap, onto a fresh read of both rows.
   */
  is(/SmartPaceCard/.test(settings), 'Settings draws the four speed cards — "יש להעביר את בחירת מהירות הפרסום... אל מסך ההגדרות"');
  is(/applyPace\(id\)/.test(settings), 'and writes through the one writer every screen used, rather than a second copy of it');
  /* UP TO pickPace AND NOT TO clearRateLimit: pickPace sits between the two,
     and a slice that swallowed it would be asserting that the mode is absent
     from the very function that writes it. */
  const save = settings.slice(settings.indexOf('async function save()'), settings.indexOf('const pacing = useRef'));
  is(save.length > 100, 'save() could not be isolated — the check below would be vacuous');
  is(!/applyPace|pace:/.test(save), 'the speed is NOT part of שמור: it writes on the tap, because applyPace touches the browser row too and save() may not');
}

/* ══════════════ 9. THE CARD, AND WHAT IT MAY NOT SAY ═════════════════════ */

/*
 * ─── RE-POINTED 18.11.2026 TO A NEW REFERENCE IMAGE ──────────────────────
 *
 *   "ארבע כרטיסיות עגולות לחלוטין (בטוח / רגיל / מהיר / איטי), אייקון ושם
 *    ממורכזים, בחירה מודגשת בכחול מלא עם טקסט לבן... ללא תיאורים ארוכים,
 *    קומפקטי ורספונסיבי (שתי שורות של שתיים במסכים צרים)."
 *
 * The card was three tiles in one row inside a white shell on a campaign card.
 * It is four circles on the settings screen now. What each pin was protecting
 * is re-asked of the new shape — the radio semantics, one source for the
 * labels, the second channel beside colour, the numbers spoken and not drawn,
 * the min-w-0 guard, and the promise no mode may make — and one pin is NEW and
 * is the whole of what this brief added: the fourth card cannot be pressed.
 */
{
  const card = src('src/components/social/SmartPaceCard.tsx');
  const code = stripComments(card);

  is(/role="radiogroup"/.test(code) && /role="radio"/.test(code), 'the modes are a radio group — one choice, announced as one choice');
  is(/aria-checked=\{on\}/.test(code), 'with the chosen one marked for a screen reader');
  is(/paceCards\(\)/.test(code), 'the row is built FROM rules.ts, so a card and a gate cannot disagree about a mode or its name');
  is(!/PACE_PROFILES\.map/.test(code), 'and not from a second, hand-written list beside it');
  is(/grid-cols-2/.test(code) && /sm:grid-cols-4/.test(code), 'two up on a phone, four across from the first breakpoint — "שתי שורות של שתיים במסכים צרים"');
  is(/rounded-full/.test(code) && /aspect-square/.test(code), 'and each one is a circle — "כרטיסיות עגולות לחלוטין"');

  /* ─── THE FOURTH CARD IS DRAWN AND CANNOT BE CHOSEN ─────────────────────
   *
   *   "אין להמציא ערכים למצב ״בטוח״. אם לא קיימת הגדרה, יש להשאיר אותו לא
   *    זמין עד להגדרה מפורשת."
   *
   * The product has three gaps and the reference draws four cards. The fourth
   * ships disabled rather than with a number nobody decided — the same answer
   * this repository gave the first time it was asked (CampaignTile.tsx, pinned
   * by campaign-tile.test.ts).
   */
  eq(paceCards().map((c) => c.id), ['safe', 'medium', 'fast', 'slow'], 'four cards, in the order the reference draws them');
  eq(paceCards().map((c) => c.label), ['בטוח', 'רגיל', 'מהיר', 'איטי'], 'with the reference\'s own four words');
  eq(paceCards().filter((c) => c.profile === null).map((c) => c.id), ['safe'], 'exactly one of them has no profile — and it is בטוח');
  eq(PACE_UNAVAILABLE.id, 'safe', 'the unavailable mode is named once, in rules.ts');
  is(!('gapSeconds' in (PACE_UNAVAILABLE as unknown as Record<string, unknown>)), 'and it carries NO gap — the type cannot hold a value nobody has decided');
  is(!PACE_PROFILES.some((p) => p.id === ('safe' as PaceId)), 'it is not in the table the engine reads, so nothing can be paced by it');
  eq(paceProfile('safe' as PaceId), null, 'and a row that somehow stored it resolves to "no mode" rather than crashing');
  is(/disabled=\{disabled \|\| unavailable\}/.test(code), 'the card with no profile is disabled');
  is(/card\.profile && onChange\(card\.profile\.id\)/.test(code), 'and cannot send a mode even if something pressed it');

  is(/bg-brand-500/.test(code), 'the chosen one is solid blue — "בחירה מודגשת בכחול מלא"');
  is(/text-on-brand/.test(code), 'with white glyph and word on it');
  is(/border-brand-700/.test(code), 'and a border a shade darker than the fill — "מסגרת מודגשת עדינה"');
  is(/from-ink-850 to-ink-800/.test(code), 'while the unchosen ones stay white falling to the pale blue — "לבן/תכלת עם מסגרת כחולה דקה"');
  is(/motion-safe:transition-all/.test(code) && /motion-safe:scale-/.test(code), 'the selection animation is short AND behind motion-safe — a phone asked to stop animating gets the colours without the movement');
  is(/CheckIcon/.test(code), 'a check mark is the second channel a fill colour alone cannot give a colour-blind reader');
  is((code.match(/<CheckIcon/g) ?? []).length === 1, 'and exactly one is rendered — "סימון בחירה ברור, ללא כפילות"');
  is(/LeafIcon/.test(code), 'איטי still wears a leaf');
  is(!/ShieldIcon/.test(code), 'and nothing wears a shield — a shield is a promise about Meta, which no mode here may make, least of all the one called "בטוח"');

  /* THE NUMBERS ARE STILL READ OFF THE TABLE — and still not painted. */
  is(/data-pace-state/.test(code), 'the card states the chosen mode and its interval in one place');
  is(/className="sr-only"/.test(code), 'and that place is spoken, not drawn — "ללא תיאורים ארוכים"');
  is(/paceRatePerHour\(card\.profile\)/.test(code), 'each mode still quotes the rate, computed rather than typed');
  is(/paceGapWords\(card\.profile\.gapSeconds\)/.test(code), 'and its own gap off the table');

  /*
   * A CARD MAY NOT PAINT A NUMBER. Asserted on the JSX that actually renders —
   * from the glyph to the close of the button — rather than on the whole file,
   * because the gap and the rate DO appear above it, inside the aria-label,
   * which is the point: spoken, never drawn.
   */
  {
    const body = code.slice(code.indexOf('<Icon className='), code.indexOf('</button>'));
    is(body.length > 80, 'the card body could not be isolated — the checks over it would be vacuous');
    is(!/paceGapWords/.test(body), 'no card draws its gap as text');
    is(!/paceRatePerHour/.test(body), 'and none draws its rate');
    is(/\{card\.label\}/.test(body), 'the only text a card renders is the mode\'s own word');
  }

  /* EVERY multi-column grid in this product carries the min-w-0 guard, or a
     long word inside one blows the card's width out on a phone. */
  for (const m of code.matchAll(/className="[^"]*grid-cols-\d[^"]*"/g)) {
    is(/\[&>\*\]:min-w-0/.test(m[0]), `every grid carries the min-w-0 guard — ${m[0].slice(0, 70)}`);
  }

  /*
   * "אין להציג את המצבים כהבטחה למניעת חסימות בפייסבוק."
   *
   * This checks the STRINGS, not the comments — a comment may quote the
   * forbidden phrase to explain why it is absent, and this file's own prose
   * does exactly that. It matters more now than it did: one of the four cards
   * is literally called "safe", and nothing on this screen may let that word
   * become a claim about Facebook.
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
