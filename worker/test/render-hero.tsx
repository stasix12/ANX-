/*
 * THE DASHBOARD'S RUN CARD, as a page a browser can measure.
 *
 * Sibling of render-card.tsx, and for the same reason: the owner sent a
 * reference image of the MAIN screen — "זהו המסך הראשי / Dashboard של
 * התוכנה. זה לא מסך 'קמפיינים'" — and "1:1" is a claim about pixels, which no
 * source-drift guard can check. So the real LiveCampaignHero is rendered with
 * the real compiled stylesheet and measured in Chromium by
 * dashboard-hero.test.ts.
 *
 * REAL COMPONENT, REAL CLASSES, REAL THEME. Nothing here is a copy of the
 * card's markup: a copy is exactly what stops failing when the card changes.
 * The body carries `social-theme`, because /social is a white-and-violet app
 * and a card measured on the site's default dark palette is not the card.
 *
 * THE INSTANTS ARE RELATIVE TO NOW, not literals. "הפרסום הבא יתחיל ב:" prints
 * a date and the day it falls on, so a fixed 2026-10-01 in this file would
 * measure a line that says "מחר" today and something else tomorrow — and the
 * strip's whole geometry is that line's.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveCampaignHero } from '@/components/social/LiveCampaignHero';
import type { CampaignState } from '@/lib/social/campaign';
import { DEFAULT_CAMPAIGN_SCHEDULE, type CampaignSchedule } from '@/lib/social/campaign-schedule';

const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${fill}"/></svg>`)}`;
const img = [{ url: pic('#c4b5fd'), kind: 'image' }] as never;

const prog = (o: Partial<Record<string, number>>) =>
  ({ total: 0, published: 0, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 0, ...o }) as never;

const st = (p: unknown, extra: Partial<CampaignState> = {}): CampaignState =>
  ({
    progress: p as never,
    state: 'running',
    truncated: false,
    startedAt: null,
    estimatedCompletionAt: null,
    nextAt: null,
    nextTargetName: null,
    upcoming: [],
    done: [],
    now: [],
    ...extra,
  }) as CampaignState;

const inHours = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

/*
 * A RENDER AT A KNOWN MINUTE, for the two cards whose words depend on whether
 * a window is open RIGHT NOW.
 *
 * "למה זה 17:12 הפרסום יסתיים כבר" was a card that read differently depending
 * on the clock, and so was the test that was supposed to catch it: case 6
 * below carries the owner's Sun–Thu 08:00–22:00 window, so run on a Tuesday
 * morning it said "פתוח עד" and run on a Friday it said "הבא" — and the suite
 * asserted the Friday wording unconditionally. A test that passes on five days
 * of the week is not a test of either branch.
 *
 * So those cards name the instant they are drawn at. Scoped to one render and
 * restored in a `finally`: the card calls `new Date()` deep inside itself,
 * through nextAllowedAt and windowClosesAt, and there is no prop to thread a
 * clock down. Everything measured afterwards is the card as it was at that
 * minute, which is the only way a strip about "now" can be measured at all.
 */
function atClock<T>(iso: string | null, run: () => T): T {
  if (!iso) return run();
  const Real = Date;
  const fixed = new Real(iso).getTime();
  class Pinned extends Real {
    constructor(...a: unknown[]) {
      super(...((a.length ? a : [fixed]) as [number]));
    }
    static now(): number {
      return fixed;
    }
  }
  (globalThis as { Date: unknown }).Date = Pinned;
  try {
    return run();
  } finally {
    (globalThis as { Date: unknown }).Date = Real;
  }
}

/*
 * The two minutes used below, both inside the owner's own window definition
 * (`sched.reference`, Sunday–Thursday 08:00–22:00):
 *
 *   SHUT — Friday noon. Not a chosen day, so the next window is Sunday 08:00
 *          and the strip says when it OPENS.
 *   OPEN — Wednesday 10:00. A chosen day, inside the hours, so there is no
 *          future opening to name and the strip says when it CLOSES.
 */
const WINDOW_SHUT = '2026-10-02T12:00:00+03:00';
const WINDOW_OPEN = '2026-09-30T10:00:00+03:00';

/*
 * AND A "STARTED" THAT IS BEFORE THE MINUTE THE CARD IS DRAWN AT.
 *
 * `inHours` measures from the real clock, which is right for every unpinned
 * card and wrong for a pinned one: a round that began 22 hours ago by the wall
 * clock is five days in the FUTURE of 30.09, so the card read "התחיל בעוד 5
 * ימים" — "started in five days" — under a round reported as finished. Nothing
 * in the product can produce that (startedAt is the earliest published_at, and
 * a publication cannot be in the future), so it was the fixture contradicting
 * itself, and a fixture that states something impossible is measuring a card no
 * owner will ever see.
 */
const beforeClock = (clock: string, h: number) => new Date(new Date(clock).getTime() - h * 3600e3).toISOString();

/*
 * THE WINDOWS, including the one the reference image is set to.
 *
 * `image` is literally what the attached screenshot shows lit — א׳ ב׳ ג׳ ה׳,
 * 08:00–22:00, every 10 minutes — so the card this file renders first is the
 * card in the picture, and a difference between them is a difference anyone
 * can see rather than one argued about.
 */
const sched: Record<string, CampaignSchedule> = {
  image: { enabled: true, days: [0, 1, 2, 4], start: '08:00', end: '22:00', gapSeconds: 600 },
  reference: { ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: true },
  all: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:30', gapSeconds: 60 },
  none: { ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: true, days: [] },
  off: { ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: false },
};

const camp = (id: string, name: string, status: 'active' | 'paused' = 'active') =>
  ({ id, name, service: '', city: '', status }) as never;

/*
 * Each case is one shape that has, or could, break this card:
 *
 *  1  THE REFERENCE ITSELF — 50/50 handled, 100%, 40 published / 6 skipped /
 *     4 failed, the image's own window, something due tomorrow morning.
 *  2  a live run mid-round, which is the card most mornings.
 *  3  seven days, a one-minute gap, a round-the-clock window — the widest the
 *     three readout boxes ever have to be.
 *  4  no day chosen: the strip may NOT print the stored instant, because the
 *     engine will not publish at it.
 *  5  the switch off — every campaign that existed before this feature.
 *  6  a finished round with nothing queued: there is no next publication and
 *     the strip has to say so rather than invent one.
 *  7  no schedule passed at all, which is how any other caller mounts this
 *     card: no block, no strip, and the card exactly as it was.
 *  8  nothing queued and the switch OFF — the only state with no instant of
 *     any kind, and the one "לא מתוזמן" is for.
 *  9  a long Hebrew name with three-figure counts, globally paused.
 * 10  the same empty queue as 6, drawn at a minute when the window is OPEN —
 *     the one card that must say when the window CLOSES rather than when the
 *     next one opens, because there is no next one to name.
 * 11  HIS OWN SCREEN: a round that has ENDED, inside an open window. Case 10
 *     with the queue spent — and therefore the card that may print no time at
 *     all, because nothing will happen at any of them.
 * 12  the same, stopped by hand rather than finished.
 * 13  rows waiting for a person: "ממתין" is true, and it is not the clock
 *     they are waiting for.
 */
const cases = [
  /*
   * 1 — THE REFERENCE IMAGE'S STRIP: a publication, its date, and the day it
   *     falls on.
   *
   * RUNNING, NOT COMPLETED, AND THAT CORRECTION IS PART OF THE ANSWER. His
   * reference mock drew "הסתיים עם כשלים" over "הפרסום הבא יתחיל ב: 08:10",
   * and this fixture copied it — a finished round with a next publication,
   * which campaign.ts cannot produce (a run is 'completed' exactly when no row
   * is open) and which is precisely the belief that cost him weeks: that an
   * ended round goes out again. The strip the image is a spec for belongs to a
   * round that is still running, and that is what is measured here.
   */
  ['the reference image: a live round, 50 groups', camp('1', 'פרסומת לרוסים סבב ראשון'),
    st(prog({ total: 50, published: 40, skipped: 6, failed: 4, scheduled: 0, finished: 50 }), { state: 'running', startedAt: inHours(-6), nextAt: inHours(20) }),
    50, sched.image, null],
  ['a live run mid-round', camp('2', 'ניקוי ספות באר שבע'),
    st(prog({ total: 40, published: 12, scheduled: 28, finished: 12 }), { state: 'running', startedAt: inHours(-2), nextAt: inHours(1), nextTargetName: 'באר שבע מדברת' }),
    40, sched.reference, null],
  ['every day, every hour, a one-minute gap', camp('3', 'ניקוי שטיחים'),
    st(prog({ total: 40, published: 12, scheduled: 28, finished: 12 }), { state: 'running', startedAt: inHours(-3), nextAt: inHours(1) }),
    40, sched.all, null],
  ['no day chosen — nothing can go out', camp('4', 'ניקוי חלונות ערד'),
    st(prog({ total: 40, published: 12, scheduled: 28, finished: 12 }), { state: 'running', startedAt: inHours(-3), nextAt: inHours(1) }),
    40, sched.none, null],
  ['the switch off — the card as it was before this feature', camp('5', 'ניקוי מרפסות'),
    st(prog({ total: 40, published: 12, scheduled: 28, finished: 12 }), { state: 'running', startedAt: inHours(-3), nextAt: inHours(1) }),
    40, sched.off, null],
  ['nothing queued yet, window SHUT', camp('6', 'ניקוי ריפודי רכב'),
    st(prog({ total: 0 }), { state: 'not_started' }),
    20, sched.reference, WINDOW_SHUT],
  ['no schedule at all — any other caller', camp('7', 'סבב פרסום'),
    st(prog({ total: 15, published: 5, skipped: 10, finished: 15 }), { state: 'stopped', startedAt: inHours(-30) }),
    15, null, null],
  /* 9 — nothing queued AND the switch off. The only state left with no
         instant of any kind to print, and the one "לא מתוזמן" is for. */
  ['nothing queued yet and the schedule off', camp('9', 'ניקוי דלתות'),
    st(prog({ total: 0 }), { state: 'not_started' }),
    20, sched.off, null],
  ['a long name, big numbers, publishing globally paused', camp('8', 'ניקוי ריפודי רכב ומושבים בבאר שבע והסביבה', 'paused'),
    st(prog({ total: 248, published: 120, scheduled: 100, skipped: 16, failed: 12, finished: 148 }), { state: 'paused', startedAt: inHours(-48), nextAt: inHours(4) }),
    124, sched.reference, null],
  /*
   * 10 — A FINISHED ROUND WHOSE WINDOW IS OPEN RIGHT NOW. His own card.
   *
   * "למה זה 17:12 הפרסום יסתיים כבר" — a finished round, Friday lit, 05:00 to
   * 22:00, and at 17:13 the strip read "חלון הפרסום הבא: 17:12". Nothing was
   * wrong with the instant: the first moment a schedule permits, when it
   * permits this one, is this one. It was wrong to CALL it the next window,
   * and a minute later it was a time that had gone.
   *
   * Identical to case 6 in every respect but the minute it is drawn at, which
   * is the whole claim: one schedule, one empty queue, two different true
   * sentences depending only on whether the window is open.
   */
  ['nothing queued yet, window OPEN NOW', camp('10', 'פרסומת לרוסים'),
    st(prog({ total: 0 }), { state: 'not_started' }),
    138, sched.reference, WINDOW_OPEN],
  /*
   * 11 — HIS OWN SCREEN, AT THE MINUTE HE SENT IT.
   *
   * "הקמפיין פעיל, אמור לצאת כל יום מ-8 בבוקר עד 22 בלילה כל דקה. למה זה מראה
   *  לי שסבב פרסום מתחיל ב-22:00? מה זה כל הבאגים האלה של התזמונים!"
   *
   * 219 of 219 handled, the schedule switched on, Tuesday 10:12 inside an
   * 08:00–22:00 window. Every number on the card was right and the card still
   * told him a round was coming, because the only instant it had to offer came
   * from the schedule and the schedule does not know the queue is empty.
   *
   * Identical to case 10 in schedule and in minute. The ONLY difference is
   * that this round has ended — which is the entire claim: a window is a fact
   * about publications that exist.
   */
  ['HIS SCREEN: a finished round inside an open window', camp('11', 'סבב פרסום'),
    st(prog({ total: 219, published: 196, failed: 23, finished: 219 }), { state: 'completed', startedAt: beforeClock(WINDOW_OPEN, 22) }),
    219, sched.reference, WINDOW_OPEN],
  /* 12 — stopped by hand rather than finished: same silence, different word. */
  ['a round he stopped, inside an open window', camp('12', 'ניקוי מזגנים'),
    st(prog({ total: 80, published: 30, skipped: 50, finished: 80 }), { state: 'stopped', startedAt: beforeClock(WINDOW_OPEN, 4) }),
    80, sched.reference, WINDOW_OPEN],
  /*
   * 13 — rows waiting for a PERSON. Nothing is queued on the clock, so every
   * window sentence applied here too — "אין פרסום ממתין" over publications
   * that are, in fact, waiting, and on him.
   */
  ['rows waiting for a person, inside an open window', camp('13', 'ניקוי שטיחים ערד'),
    st(prog({ total: 12, published: 5, manual: 7, finished: 5 }), { state: 'needs_attention', startedAt: beforeClock(WINDOW_OPEN, 3) }),
    12, sched.reference, WINDOW_OPEN],
] as const;

const body = cases
  .map(
    ([label, c, s, targets, schedule, clock]) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="hero-probe">${atClock((clock as string | null) ?? null, () => renderToStaticMarkup(
    /* createElement, NOT a direct call. The card holds `editingSchedule` in a
       useState now, and a component invoked as a plain function has no hook
       dispatcher — React throws before it renders a pixel. */
    createElement(LiveCampaignHero, {
      campaign: c as never,
      state: s as never,
      media: img,
      targetCount: targets as number,
      startedAt: (s as CampaignState).startedAt,
      workerOnline: true,
      globalPaused: (c as { id: string }).id === '8',
      onPause: () => {},
      onResume: () => {},
      onReset: () => {},
      onTune: () => {},
      schedule: (schedule as CampaignSchedule | null) ?? undefined,
      onScheduleChange: schedule ? () => {} : undefined,
    } as never),
  ))}</div>`,
  )
  .join('');

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px">${body}</div></body></html>`);
