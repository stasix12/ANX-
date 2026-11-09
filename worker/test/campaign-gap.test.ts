import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateQueueItem, PACE_PROFILES } from '../../src/lib/social/rules';
import { DEFAULT_CAMPAIGN_SCHEDULE, GAP_CHOICES, MAX_GAP_SECONDS, MIN_GAP_SECONDS, readSchedule, scheduleColumns } from '../../src/lib/social/campaign-schedule';
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

  /* ══════════════════════════════════════════════════════════════════ *
   *  THE OTHER THREE WRITERS OF scheduled_at USE THE CAMPAIGN'S OWN GAP
   * ══════════════════════════════════════════════════════════════════ */
  /*
   * planQueue composes `max(account floor, campaign gap)` and rolls the
   * result through the window. For a long time it was the only writer that
   * did. The other two applied half of each campaign's schedule and ignored
   * the other half:
   *
   *   respaceQueue      passed each campaign's WINDOW as the gate and the
   *                     GLOBAL gap as the spacing, so a ten-minute campaign
   *                     came out thirty seconds apart inside the right hours.
   *   addTargetsToQueue applied neither — `from + (i+1) * gap`, flat — so
   *                     five groups appended at 23:00 on a Thursday landed on
   *                     Friday, a day that campaign forbids.
   *
   * Both are now the planner's composition. Pinned as source, because both
   * live behind a Supabase client this file does not stand up.
   */
  {
    const client = readFileSync('src/lib/social/client.ts', 'utf8');
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const code = strip(client);

    is(
      /const ownGapSeconds = Math\.max\(gapSeconds, own\?\.enabled \? own\.gapSeconds : 0\);/.test(code),
      'respaceQueue spaces every campaign at the global gap again, ignoring each campaign\u2019s own',
    );
    is(
      /windowedCascade\(\s*indexes\.map\(\(i\) => bases\[i\]\),\s*ownGapSeconds,/.test(code),
      'and the cascade is still handed the global gap rather than the composed one',
    );
    is(
      /const stampGapSeconds = Math\.max\(gapSeconds, ownWindow\?\.enabled \? ownWindow\.gapSeconds : 0\);/.test(code),
      'addTargetsToQueue appends at the account gap again, ignoring the campaign\u2019s own',
    );
    is(
      /const stamps = windowedCascade\(/.test(code),
      'addTargetsToQueue writes flat arithmetic again — rows can land on a day the campaign forbids',
    );
    /* And it reads the window from the one helper, rather than inventing a
       second way to ask what a campaign's hours are. */
    is(/const ownWindow = ownId \? \(await campaignWindows\(\[ownId\]\)\)/.test(code), 'addTargetsToQueue no longer reads the campaign\u2019s window at all');
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE NUMBER ON THE CARD IS THE NUMBER THE ENGINE USES.

     "קודם כל שאני משיק קמפיין אני מגדיר מרווח פרסום 30 שניות ומסך ראשי מופיע
      לי 10 דק זה לא מסונכרן זה בעיה ראשונה."

     Three numbers carried the name "מרווח בין פרסומים":
       1. the launch sheet's, written to the ACCOUNT settings by
          applyGapFloor() (library.ts) — the real one;
       2. the run card's, `schedule_gap_seconds` on the campaign row, which
          plan.ts reads only while the schedule flag is UP and which no gate
          reads at publish time at all;
       3. the account settings, which spacingGate() and evaluateQueueItem()
          both compare against.

     And the write was one-directional: changeSchedule guards its
     matchAccountGapTo behind `next.enabled`, so with the flag down the card's
     number governed nothing and could not even lower the floor. He launched
     at thirty seconds, set the card to ten minutes, and published every
     thirty — which is the cadence Facebook rate-limited the account over.

     The owner's decision was "את המספר האמיתי". These hold the three pieces
     of that in place. Comments stripped first.

     ─── RE-POINTED 07.11.2026 — THE FIELD IS GONE, THE FAULT IS NOT ──────

     "יש להסיר לחלוטין מהממשק את השדה הישן: הפרש בין פרסומים. אין להשאיר אותו
      במקום אחר ואין ליצור הגדרה כפולה."

     The dropdown these checks were written around no longer exists on any
     screen, and neither does `onAccountGapChange`. What has NOT changed is
     the fault: three numbers wore one name, the card showed the inert one,
     and the write was asymmetric. מצב פרסום חכם chooses the gap now — three
     modes rather than a list of seconds — and every piece of the anatomy
     above still has to hold, one hand further along:

       WHAT IS SHOWN     the panel still resolves the gap from the ACCOUNT
                         floor, and hands that number to <SmartPaceCard>
                         (`currentGapSeconds`) instead of to a <select>. The
                         campaign's own column still reaches no screen.
       WHAT IS WRITTEN   applyPace() → applyGapFloor(pace.gapSeconds), no
                         lowerOnly: the same symmetric write, moved out of
                         the two screens and into client.ts so that the two
                         cannot drift from each other.
       WHO WRITES IT     both screens, through changePace, in the same order
                         as before — the account floor first, then the
                         campaign save, or the re-stamp uses the old floor.

     Each assertion below says which of the three it now pins. Nothing was
     softened: where a control was deleted the check moved onto the control
     that replaced it, and the negatives that guarded against the campaign's
     own number being shown or written are re-aimed at the new prop rather
     than dropped.

     ONE LEFTOVER, REPORTED RATHER THAN PINNED: src/app/social/page.tsx still
     defines `changeAccountGap` — the old applyGapFloor + changeSchedule pair
     — and nothing calls it; src/app/social/campaigns/page.tsx still imports
     applyGapFloor without using it. Both are unreachable: no control on
     either screen writes a gap any more, so nothing below is pinned to them.
     Asserting their absence would be asserting a change to src/, which this
     file may not make.
     ══════════════════════════════════════════════════════════════════════ */
  {
    const bare = (rel: string) =>
      readFileSync(new URL(rel, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
    const panel = bare('../../src/components/social/CampaignSchedulePanel.tsx');
    const dash = bare('../../src/app/social/page.tsx');
    const hero = bare('../../src/components/social/LiveCampaignHero.tsx');
    const card = bare('../../src/components/social/CampaignCard.tsx');
    const camps = bare('../../src/app/social/campaigns/page.tsx');
    /* ADDED 07.11.2026, because the control and the write both moved: the gap
       the panel resolves is now printed by <SmartPaceCard>, and the symmetric
       floor write now lives in client.ts's applyPace() rather than being typed
       out twice on two screens. Both files are read here so the checks below
       can follow the number instead of pinning where it used to be. */
    const paceCard = bare('../../src/components/social/SmartPaceCard.tsx');
    const clientSrc = bare('../../src/lib/social/client.ts');
    for (const [name, src] of [['panel', panel], ['dashboard', dash], ['hero', hero], ['card', card], ['campaigns', camps], ['pace card', paceCard], ['client', clientSrc]] as const) {
      assert.ok(src.length > 2000, `${name} did not load — ${src.length} chars, and every check below would pass on emptiness`);
    }

    /* 1 — WHAT IS SHOWN. The mode card and its two sentences read the
           account's gap, and nothing on the panel reads the campaign's. */
    assert.ok(
      /const effectiveGapSeconds =\s*typeof accountFloorSeconds === 'number'/.test(panel),
      'the panel must resolve the gap from the ACCOUNT floor before drawing it',
    );
    /*
     * RE-POINTED 07.11.2026. This was `value={String(effectiveGapSeconds)}`:
     * the <select> the gap was chosen in. The field is deleted, so the number
     * the panel resolves is handed to the control that replaced it. Same
     * number, same boundary, one element further on — and this is still the
     * single line that decides whether the figure on screen is the one the
     * engine obeys.
     */
    assert.ok(/currentGapSeconds=\{effectiveGapSeconds\}/.test(panel), 'and the mode card must be handed that, not the campaign\'s stored number');
    assert.ok(!/currentGapSeconds=\{shown\.gapSeconds\}/.test(panel), 'the card is back on the campaign column — that is the number the engine never reads');
    /*
     * RE-POINTED 07.11.2026. This counted two `gapLabel(gapShown)` calls —
     * the panel's two summary sentences, which both had to name the resolved
     * gap rather than one naming it and the other naming the campaign's own.
     * The summary strip states no interval at all now ("ימי פרסום: … | משעה
     * HH:MM"), so the claim is re-aimed at where the interval IS stated: the
     * panel states none of its own, and the mode card's two sentences — one
     * for a mode picked, one for none picked — are the only two, both off the
     * one prop above. "אין ליצור הגדרה כפולה" is the same requirement said
     * from the other end.
     */
    assert.ok(!/gapLabel\(/.test(panel), 'the panel must print no interval of its own — one place names the gap, and it is the mode card');
    assert.ok(!/gapShown/.test(panel), 'and must keep no second resolved copy of it to print from');
    assert.ok(
      (paceCard.match(/data-pace-summary/g) ?? []).length === 2,
      'the mode card carries exactly two summary sentences — one for a mode picked, one for none picked',
    );
    assert.ok(
      /accountGapLabel\(currentGapSeconds\)/.test(paceCard),
      'the no-mode sentence names the ACCOUNT gap it was handed — that is the state every account that exists today loads in, and there the number is the whole truth',
    );
    assert.ok(
      /const selected = paceProfile\(pace\)/.test(paceCard) && /paceGapWords\(selected\.gapSeconds\)/.test(paceCard),
      'and the picked-mode sentence names the mode\'s own gap — the number applyPace WROTE into that same account floor, so the two sentences still cannot disagree',
    );

    /* 2 — WHAT IS WRITTEN. applyGapFloor, symmetric, before anything else.
     *
     * RE-POINTED 07.11.2026. The prop is `onPaceChange` and the handler is
     * `changePace`; the symmetric write itself moved one file deeper, into
     * applyPace() in client.ts, which both screens call. The three claims are
     * the three that were here before — the panel writes nothing itself, the
     * write raises as well as lowers, and the account floor lands before the
     * campaign save — pinned at their new addresses.
     */
    assert.ok(/onChange=\{onPaceChange\}/.test(panel), 'the panel must hand the change to its caller rather than writing the campaign column');
    assert.ok(!/gapSeconds:/.test(panel), 'and must write no gap into the schedule it saves — it no longer has a gap of its own to write');
    assert.ok(/onPaceChange=\{onPaceChange\}/.test(hero), 'the run card must pass that handler through');
    assert.ok(/onPaceChange=\{\(id\) => void changePace\(run\.campaign, id\)\}/.test(dash), 'and the dashboard must wire it to a handler of its own');
    const apply = clientSrc.slice(clientSrc.indexOf('export async function applyPace'), clientSrc.indexOf('export async function liveQueuePlan'));
    assert.ok(apply.length > 150, 'applyPace could not be isolated — the two checks over it would be vacuous');
    assert.ok(
      /const gap = await applyGapFloor\(pace\.gapSeconds\);/.test(apply),
      'THE WRITE: applyGapFloor with no lowerOnly — the asymmetric call is exactly what refused his ten minutes',
    );
    assert.ok(
      !/lowerOnly/.test(apply),
      'the mode write is lowering only again — picking a SLOWER mode would be refused in silence, which is the same fault with the sign flipped',
    );
    const handler = dash.slice(dash.indexOf('const changePace'), dash.indexOf('const changeRepeat'));
    assert.ok(handler.length > 200, 'the handler could not be isolated — the checks over it would be vacuous');
    assert.ok(
      handler.indexOf('applyPace') < handler.indexOf('changeSchedule'),
      'the account floor must be written BEFORE the campaign save, or the re-stamp uses the old floor',
    );
    assert.ok(
      /gapSeconds: pace\.gapSeconds/.test(handler),
      'and the campaign column must be written to the same number — plan.ts takes max(account, campaign), and two numbers disagreeing is the fault being fixed',
    );

    /* 2b — BOTH SCREENS, OR THEY DISAGREE.
     *
     * "שעת פרסום ותזמון הפוסטים לא מסונכרן בן מסך פרסום קמפיינים לבין המסך
     *  הראשי."
     *
     * The campaigns list already handed the card accountFloorSeconds, so it
     * SHOWED the account's gap — and went on writing the campaign's column,
     * which the engine never reads. A gap set there reverted on the next read
     * while the same field on the dashboard stuck. Two screens, one field,
     * one writer.
     *
     * RE-POINTED 07.11.2026: one MODE now rather than one field, and the one
     * writer is applyPace() — so "one writer" is structural instead of being
     * two identical handlers that have to be kept identical by hand. The
     * campaigns screen must call it rather than keep a copy of the floor
     * write, which is what the negative below is for.
     */
    assert.ok(/onPaceChange=\{onPaceChange\}/.test(card), 'the campaigns card must pass the mode handler through');
    assert.ok(/onPaceChange=\{\(id\) => void changePace\(c, id\)\}/.test(camps), 'and the campaigns screen must wire it');
    assert.ok(/await applyPace\(id\);/.test(camps), 'with the same symmetric write the dashboard makes — the one inside applyPace, not a second copy of it');
    assert.ok(!/applyGapFloor\(/.test(camps), 'the campaigns screen is writing the account floor itself again — two writers of one number is the fault being fixed');
    for (const [name, src, column] of [
      ['dashboard', dash, 'gapSeconds: pace.gapSeconds'],
      ['campaigns', camps, 'gapSeconds: picked.gapSeconds'],
    ] as const) {
      const h = src.slice(src.indexOf('const changePace'), src.indexOf('const changeRepeat'));
      assert.ok(h.length > 200, `${name}: the handler could not be isolated — the order check below would be vacuous`);
      assert.ok(h.indexOf('applyPace') < h.indexOf('changeSchedule'), `${name}: the account floor must be written before the campaign save`);
      assert.ok(h.includes(column), `${name}: the campaign column must be written to the mode's own number as well`);
      assert.ok(!/lowerOnly/.test(h), `${name}: the write is lowering only — a slower mode would be refused in silence`);
    }

    /* 3 — AND THE ENGINE STILL READS ONLY THE ACCOUNT'S. This is the fact the
           whole change rests on; if it ever stops being true, the card goes
           back to showing something the queue does not obey. */
    const rules = bare('../../src/lib/social/rules.ts');
    const worker = bare('../../worker/social-worker.ts');
    assert.ok(/accountGapSeconds\(limits, ctx\.browser/.test(rules), 'the per-row gate must read the account gap');
    assert.ok(/accountGapSeconds\(limits, browser, true\)/.test(worker), 'and so must the worker\'s spacing gate');
    assert.ok(!/schedule\.gapSeconds/.test(rules), 'rules.ts is reading the campaign gap — then the card and the gate have two sources again');
    /*
     * ADDED 07.11.2026, and it is the same fact from the new mechanism's side.
     * A mode is a THIRD place a gap could come from, and it would be the
     * easiest of the three to read at publish time — PACE_PROFILES is in
     * rules.ts, beside the gate. It is not read there: picking a mode WRITES
     * its gap into the account pair through applyPace, and both gates go on
     * reading the pair. The moment a gate reads a mode's gap directly, the
     * owner can change a mode and have the queue obey a number no screen
     * resolved — which is 10 דק/30 שניות again, wearing a new name.
     */
    assert.ok(!/pace\.gapSeconds/.test(rules), 'no gate reads a MODE\'s gap at publish time — it is written into the account floor, which is the one number both gates compare against');
    assert.ok(!/pace\.gapSeconds/.test(worker), 'and the worker\'s gate does not either');

    /* ── 4. AND PICKING A MODE REACHES EVERY ROUND, NOT ONLY THE CARD TAPPED ─
     *
     *   "לא אמור ליהנות גם 600 שניות, הפרסום צריך לצאת אחד אחרי השני לפי קצב
     *    מהיר בינוני או בטוח לפי מה שבחרתי"   09.11.2026
     *
     * EVERYTHING ABOVE WAS GREEN WHILE THIS WAS BROKEN, and that is why these
     * assertions exist. The two handlers were pinned to write the mode's gap
     * into the campaign column — and they each write it to ONE campaign, the
     * one whose card was tapped. `social_campaigns.schedule_gap_seconds`
     * carries `default 600` in Postgres and no screen set it at birth, so a
     * round created after the mode was picked kept ten minutes nobody chose,
     * and max(account, campaign) handed it the decision.
     *
     * Measured in the live database on 09.11.2026: 20 of 41 rounds carried
     * exactly 600 seconds, and one of them stretched 90 groups across four
     * days (78 consecutive deltas of exactly 600.0 s) while the card said
     * "מהיר".
     */
    const paceSlice = clientSrc.slice(
      clientSrc.indexOf('export async function applyPace'),
      clientSrc.indexOf('export async function liveQueuePlan'),
    );
    assert.ok(paceSlice.length > 400, 'the applyPace slice could not be isolated — the checks below would be vacuous');
    assert.ok(/from\('social_campaigns'\)/.test(paceSlice), 'picking a mode reaches the rounds themselves, not only the account settings');
    assert.ok(
      /\.update\(\{\s*schedule_gap_seconds: pace\.gapSeconds,/.test(paceSlice),
      'writing the mode\'s own gap into every round of the account — a round born later used to keep the 600 default, and that is exactly what happened on 09.11.2026',
    );
    assert.ok(
      /schedule_gap_minutes: gapMinutesFor\(pace\.gapSeconds\)/.test(paceSlice),
      'with the rounded-up minutes beside it, so a worker that has not updated is slower than asked rather than faster',
    );
    assert.ok(/\.in\('id', ids\)/.test(paceSlice), 'scoped to an explicit list of ids — never a bare filter, because the RLS policy permits every tenant the signed-in user belongs to');
    assert.ok(/tenants\.size > 1/.test(paceSlice), 'and it refuses outright when more than one business is visible from here — single-tenancy is written in code, not inferred from today\'s data');
    /* AND IT MOVES NO PUBLICATION. This is the safety call the whole fan-out
       rests on: writing a column removes a brake, it does not bring any
       publication forward. The account-wide re-anchor starts from now() and
       lays the whole queue out from there, so one tap would have dragged
       another round's overdue rows onto today. */
    assert.ok(!/respaceQueue/.test(paceSlice), 'the fan-out writes numbers and re-anchors no queue — that would pull another round\'s overdue rows onto today');
    assert.ok(!/rescheduleCampaignQueue/.test(paceSlice), 'and it re-stamps no round either; the one re-stamp stays where it is, on the card that was tapped');

    /* ── 5. A ROUND IS BORN AT THE ACCOUNT'S OWN PACE ────────────────────── */
    const bornSlice = clientSrc.slice(
      clientSrc.indexOf('async function bornGapSeconds'),
      clientSrc.indexOf('export async function ensureRunForPost'),
    );
    assert.ok(bornSlice.length > 300, 'the birth slice could not be isolated — the checks below would be vacuous');
    assert.ok(
      /effectiveGroupGapSeconds\(limits, browser\)/.test(bornSlice),
      'a new round is born at what rules.ts will actually demand between two group publications — not at a column default',
    );
    assert.ok(
      /Math\.min\(MAX_GAP_SECONDS, Math\.max\(MIN_GAP_SECONDS,/.test(bornSlice),
      'clamped into the column\'s own 30..1800 CHECK, towards MAX: a gap above 1800 would make the insert fail outright and break opening a round, and MAX can never speed anything up because the account stays the binding gate',
    );
    assert.ok(/schedule_gap_seconds: born,/.test(bornSlice), 'and the birth value is written explicitly, so Postgres never supplies one');
    const dupSlice = clientSrc.slice(
      clientSrc.indexOf('export async function duplicateCampaign'),
      clientSrc.indexOf('export async function duplicateCampaign') + 900,
    );
    assert.ok(
      /schedule_gap_seconds: born,/.test(dupSlice),
      'a DUPLICATE is born at the account\'s pace too — the row spread makes the source\'s gap an EXPLICIT insert value, which no column default and no one-time migration can ever reach, so duplicating any of the 20 rows at 600 re-created the defect',
    );
    assert.ok(
      /const OPTIONAL_CAMPAIGN_COLUMNS = \['repeat_enabled', 'repeat_min_hours', 'schedule_gap_seconds', 'schedule_gap_minutes'\] as const;/.test(clientSrc),
      'and both gap columns are listed as optional, because PostgREST refuses the whole write when one column is missing and a database that predates v26 must still be able to open a round',
    );
  }

  /* ───── 5. THE ENGINE OBEYS THE COLUMN — WHICH IS WHY IT MUST NEVER HOLD A
             NUMBER NOBODY CHOSE ─────────────────────────────────────────────
   *
   * Written deliberately in BOTH directions, because the first draft of this
   * guard asserted the wrong thing: that a round storing 600 on a 40-second
   * account should publish at 41 seconds. It must not, and no part of this
   * change makes it. rules.ts and plan.ts take max(account, campaign) and
   * they are not touched — the engine is right to enforce what is stored.
   *
   * So the fault was never in the gate. It was that 600 reached the column at
   * all: `default 600` in Postgres, no writer at birth, and a mode that only
   * reached the round whose card was tapped. These two cases pin the
   * consequence, so that the next person who finds the 600 cannot mistake it
   * for a gate that is too strict and go and loosen the gate.
   */
  {
    const { decision } = await decide({ gapSeconds: 600, sinceLast: 41 });
    eq(
      decision.action,
      'defer',
      'A ROUND STORING TEN MINUTES IS ENFORCED AT TEN MINUTES, 41 seconds in. The engine is right; the number is the bug, and it got there from a column default nobody chose',
    );
  }
  {
    const { decision } = await decide({ gapSeconds: 40, sinceLast: 41 });
    eq(
      decision.action,
      'publish',
      'and the same round storing the mode\'s own 40 publishes one after another — which is what picking "מהיר" now writes into every round of the account',
    );
  }

  /* ───── 6. THE COLUMN MAY ONLY EVER BRAKE; IT MAY NEVER BE THE GATE ─────
   *
   * Pure, over every shipped mode and the four account floors that exist
   * live today (40 = PACE_PROFILES.fast, 45 = the owner's stale stored pace,
   * 120 = a third tenant, 3900 = the five tenants on the shipped default).
   *
   * THIS ASSERTION IS ONLY NON-CIRCULAR BECAUSE THE TWO SCHEDULE SCREENS NO
   * LONGER PUSH THE COLUMN INTO THE ACCOUNT FLOOR. While they did, `floor`
   * was a function of the column one save later, and the comparison proved
   * nothing — see the re-pointed block in account-gap.test.ts.
   */
  {
    /* AND EVERY SHIPPED MODE FITS THE COLUMN IT IS WRITTEN INTO. applyPace
       writes pace.gapSeconds straight into schedule_gap_seconds, whose CHECK
       is 30..1800 — a mode outside that would make the whole fan-out answer
       an error, land in the activity log, and leave the rounds un-synced
       while the account pace had already changed. */
    for (const pace of PACE_PROFILES) {
      is(
        pace.gapSeconds >= MIN_GAP_SECONDS && pace.gapSeconds <= MAX_GAP_SECONDS,
        `the mode "${pace.label}" is ${pace.gapSeconds}s, outside the 30..1800 the campaign column accepts — picking it would write the account pace and then fail to reach a single round`,
      );
    }
    for (const pace of PACE_PROFILES) {
      for (const floor of [40, 45, 120, 3900]) {
        const stored = Math.min(MAX_GAP_SECONDS, Math.max(MIN_GAP_SECONDS, pace.gapSeconds));
        const read = readSchedule({ schedule_gap_seconds: stored } as never).gapSeconds;
        if (stored > floor) continue;
        eq(
          Math.max(floor, read),
          floor,
          `"${pace.label}" (${pace.gapSeconds}s) stored against a ${floor}s account: the gate must still be the account's own number`,
        );
      }
    }
  }

  /* ───── 7. AND NO WRITER MAY EMIT THE ZERO THAT ROUND-TRIPS AS SIXTY ────
   *
   * The trap worth keeping written down, because it is why the fix is "a
   * small positive number everywhere" and never 0 as a sentinel:
   *   • the column carries `check (schedule_gap_seconds between 30 and 1800)`,
   *     so 0 is refused outright by Postgres;
   *   • readSchedule()'s `rawSeconds > 0` treats 0 as "column absent" and
   *     falls back to the minutes;
   *   • gapMinutesFor(0) is 1, written beside it.
   * So a stored 0 round-trips as SIXTY SECONDS, not as "no gap at all".
   */
  {
    for (const choice of GAP_CHOICES) {
      const cols = scheduleColumns({ enabled: true, days: [0], start: '08:00', gapSeconds: choice } as never);
      eq(cols.schedule_gap_seconds, choice, `the gap the owner picked (${choice}s) is written through unchanged — no rounding, no unit trip`);
      eq(cols.schedule_gap_minutes, Math.max(1, Math.ceil(choice / 60)), `with the rounded-up minutes beside it (${choice}s)`);
      is((cols.schedule_gap_seconds as number) >= MIN_GAP_SECONDS, `and never below the column's CHECK floor (${choice}s)`);
    }
    for (const bad of [0, -5, Number.NaN]) {
      const cols = scheduleColumns({ enabled: true, days: [0], start: '08:00', gapSeconds: bad } as never);
      is(
        (cols.schedule_gap_seconds as number) >= MIN_GAP_SECONDS,
        `a schedule carrying ${bad} is NEVER written as ${bad} — the CHECK would refuse the whole save, and a stored 0 reads back as 60 rather than as "no gap"`,
      );
      eq(
        cols.schedule_gap_seconds,
        DEFAULT_CAMPAIGN_SCHEDULE.gapSeconds,
        `and it falls back to exactly what readSchedule() falls back to for the same input (${bad}) — the read and the write of one number must not disagree, which is this module's oldest scar`,
      );
      is((cols.schedule_gap_minutes as number) >= 1, `with a minutes column of at least 1 (${bad})`);
    }
  }

  console.log(`campaign gap tests OK — ${checks} assertions, decided by the real engine against a fake database`);
}

void main();
