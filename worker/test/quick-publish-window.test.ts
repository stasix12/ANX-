/**
 * "פרסם עכשיו" MAY NOT QUIETLY BECOME "פרסם במשך שבוע".
 *
 * "אצל לקוח יש בעיה, זה לא נותן להוציא פוסטים אם התזמון שאנחנו מסמנים מיידי,
 *  זה מזיז את זה ליום אחר. והכל נראה מבולבל. תעשה סדר אחת ולתמיד."
 *
 * He photographed the launch report: מתחיל 23:40:58 · 31.10, צפוי להסתיים
 * 23:49:30 · 07.11, 292 יעדים. Seven days, for 292 groups at a gap of thirty
 * seconds — which is under three hours of publishing.
 *
 * THE CAUSE WAS ONE LINE. draftFor() gave every quick publish a daily
 * publishing window that STARTED at the minute the button was pressed and
 * ended at 23:59. Pressed at 23:40, that is nineteen minutes — and dripSlots
 * rolls past the window's end to the NEXT day and restarts the cursor at the
 * window's start, which is 23:40 again. So the launch got nineteen minutes a
 * night, thirty-eight slots the first night and thirty-nine thereafter, for
 * as many nights as it took.
 *
 * The comment it replaced was guarding against the opposite fault — a hidden
 * 09:00–20:00 window rolling an evening publish to the morning. `run_at`
 * still fixes the first instant, so that is still guarded; what changed is
 * only where the cursor resumes after midnight.
 *
 * THIS RUNS THE REAL PLANNER. planQuickPublish is what the sheet calls on
 * every keystroke and what the launch itself plans from, and the numbers
 * below are its own.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planQuickPublish, type QuickPublishContext } from '../../src/lib/social/library';
import { DEFAULT_BROWSER, DEFAULT_LIMITS, type SocialTarget } from '../../src/lib/social/types';
import { zonedDateISO } from '../../src/lib/social/time';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

/** 23:40:28 Asia/Jerusalem on Saturday 31.10.2026 — the owner's own instant. */
const NIGHT = new Date('2026-10-31T21:40:28.000Z');
/** The same launch in the morning, to show the fault was time-of-day bound. */
const MORNING = new Date('2026-10-31T07:00:00.000Z');

const targets = (n: number): SocialTarget[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `קבוצה ${i}`, channel: 'facebook_group', enabled: true }) as SocialTarget);

const ctx = (n: number): QuickPublishContext => ({
  targets: targets(n),
  limits: DEFAULT_LIMITS,
  browser: DEFAULT_BROWSER,
  publishedToday: 0,
  queuedByDay: new Map(),
  effectiveGapSeconds: 30,
  campaignId: null,
  campaignPublishedToday: 0,
});

const plan = (n: number, gapSeconds: number, now: Date) =>
  planQuickPublish(ctx(n), { targetIds: targets(n).map((t) => t.id), mode: 'now', gapSeconds }, now);

const days = (p: { startAt: string; endAt: string | null }) =>
  p.endAt
    ? Math.round(
        (Date.parse(zonedDateISO(new Date(p.endAt))) - Date.parse(zonedDateISO(new Date(p.startAt)))) / 86_400_000,
      ) + 1
    : 1;

/* ─────────────── 1. the owner's launch, through the real planner ────────── */
{
  const p = plan(292, 30, NIGHT);
  /*
   * The old window made this eight days and the finish 23:49:30 on 07.11 —
   * his screenshot to the second. Two is what the gap alone demands: 292 × 30s
   * is 2h26m, and a launch at 23:40 crosses midnight on the way.
   */
  eq(days(p), 2, 'a "publish now" at 23:40 must not spread 292 groups over more than the night it crosses');
  is(
    !p.endAt || Date.parse(p.endAt) - Date.parse(p.startAt) < 3 * 3600_000,
    `292 groups at thirty seconds is under three hours of publishing — this plan takes ${Math.round(((Date.parse(p.endAt ?? p.startAt) - Date.parse(p.startAt)) / 3600_000) * 10) / 10} hours`,
  );
  eq(p.rows.length, 292, 'and every group must get a slot');
  /* The first one still goes out tonight: run_at fixes it, which is what the
     window this replaced was written to protect. */
  eq(zonedDateISO(new Date(p.startAt)), '2026-10-31', 'the first publication must still be tonight — "פרסם עכשיו" means now');
}

/* ─────────────── 2. the same launch in the morning, unchanged ──────────── */
{
  const p = plan(292, 30, MORNING);
  eq(days(p), 1, 'a morning launch of the same 292 groups finishes the same day, as it always did');
  eq(p.rows.length, 292, 'and loses nothing');
}

/* ───────── 3. the shipped gap is slow, but it may not be a year ────────── */
{
  /*
   * DEFAULT_LIMITS/DEFAULT_BROWSER ship a 65-minute floor, which is what a
   * NEW business — a customer — opens this sheet with. Under the old window
   * that was ONE group a night: 292 nights, finishing next August. It is
   * still slow, and that is the owner's own anti-spam policy rather than a
   * defect; what may not happen is the window turning it into a year.
   */
  const p = plan(292, 65 * 60, NIGHT);
  is(days(p) <= 15, `at the shipped 65-minute gap the same launch must not run for ${days(p)} days — the window used to make it 291`);
  eq(p.rows.length, 292, 'with every group still planned');
}

/* ─────────────── 4. and one group still goes out immediately ───────────── */
{
  const p = plan(1, 30, NIGHT);
  eq(p.mode, 'now', 'a single group must not be demoted to a drip — that is what puts the first slot a whole gap away');
  eq(days(p), 1, 'and it goes out tonight');
}

/* ─────────────────────── 5. the line itself, pinned ────────────────────── */
{
  const library = readFileSync(new URL('../../src/lib/social/library.ts', import.meta.url), 'utf8');
  const draft = library.slice(library.indexOf('function draftFor('), library.indexOf('function slotsForDraft('));
  is(draft.length > 400, 'draftFor is found');
  is(/windowStart: '00:00',/.test(draft), 'the quick-publish window is derived from the clock again — that is the whole of "זה מזיז את זה ליום אחר"');
  is(!/localHm/.test(draft), 'and the launch minute must not be the window start');

  /* The report panel stops presenting a forecast as a record. */
  const sheet = readFileSync(new URL('../../src/components/social/QuickPublishSheet.tsx', import.meta.url), 'utf8');
  is(/צפי — התור עוד לא נבנה/.test(sheet), 'when nothing was written the three boxes must say they are a forecast');
  is(/יעדים שנבחרו/.test(sheet), 'and the targets box must say it holds the ASK — the planner writes fewer whenever a group is already waiting');
  is(
    /accountGapLabel\(result\.gap\.minGapSeconds \+ result\.gap\.groupMinGapSeconds\)/.test(sheet),
    'the gap sentence must read the SECONDS — summing the two rounded-up minute mirrors printed "1 דק׳" over an engine running at thirty seconds',
  );
  is(!/minGapMinutes \+ result\.gap\.groupMinGapMinutes/.test(sheet), 'and the minute mirrors must not come back');
  is(/result\.resumable \?/.test(sheet), 'the "press המשך" remedy must be offered only where it is the remedy');
  is(/spanDays > 1 &&/.test(sheet), 'and a launch that does not all go out today must say so in words, not only in a second date');
}

console.log(`quick-publish window OK — ${checks} assertions, planned by the product's own planner`);
