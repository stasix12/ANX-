/**
 * THE SCHEDULING PANEL ITSELF, so סבבים ביום is measured somewhere.
 *
 * The card lives inside CampaignSchedulePanel, and neither existing fixture
 * can see it: the campaigns LIST card measured 1008px against its 910 ceiling
 * with the card on it, and the hero draws the panel only behind
 * `editingSchedule` — a useState that is false on a server render, so
 * render-hero.tsx reaches it never. A green hero run with the card absent is
 * what sent me looking.
 *
 * So this renders the panel on its own, in the four shapes that matter.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CampaignSchedulePanel } from '@/components/social/CampaignSchedulePanel';
import { DEFAULT_CAMPAIGN_SCHEDULE, type CampaignRound } from '@/lib/social/campaign-schedule';

const base = { ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: true, start: '03:30', days: [0, 1, 2, 3, 4], gapSeconds: 30 };

type Prog = Record<string, { total: number; published: number; failed: number; skipped: number; scheduled: number; running: number; manual: number; finished: number }>;
const prog = (o: Partial<Prog[string]>) => ({ total: 0, published: 0, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 0, ...o });

/*
 * WHAT A CASE MAY CARRY BESIDES ITS ROUNDS — the account's repeat floor, and
 * an opening hour other than the base one.
 *
 * Added for the owner's own layout below, which needs both: 01:30 rather than
 * 03:30, and a floor of two rather than the hard-coded twelve. Both optional,
 * and absent means exactly what it meant before — `floorHours: undefined`
 * lands on the panel's own default parameter (MIN_REPEAT_HOURS), so every
 * case that existed here is rendered byte-for-byte as it was. They are
 * measured by probes that already pass and none of them moves.
 */
type Shape = { floorHours?: number; start?: string };

const cases: [string, CampaignRound[], { enabled: boolean; minHours: number } | undefined, Prog?, Shape?][] = [
  /* OFF — every campaign that exists today. The card is drawn, the list is not. */
  ['no extra rounds — the card as every campaign has it today', [], { enabled: false, minHours: 20 }],
  /* The owner's own reference: 03:30 and 15:30. */
  ['his reference: two rounds, repeat off — the card must say the second will publish nothing', [{ at: '15:30', enabled: true }], { enabled: false, minHours: 20 }],
  /* THE TALLEST SHAPE: two rounds, the repeat armed too long, so the warning
     paragraph is drawn under the add button. */
  ['two rounds and a twenty-hour repeat — the warning, which is the tallest this card gets', [{ at: '15:30', enabled: true }], { enabled: true, minHours: 20 }],
  /* Four rounds, the cap, with one switched off — the longest LIST, and the
     add button gone because the cap is reached. */
  ['four rounds, one switched off — the cap, and no add button',
    [{ at: '09:30', enabled: true }, { at: '15:30', enabled: true }, { at: '18:00', enabled: false }, { at: '21:30', enabled: true }],
    { enabled: true, minHours: 12 }],
  /*
   * THE NUMBERS. Round one is mid-flight — 12 of 50 handled, one in flight —
   * and round two has not begun. Round one's key is '' as well as '03:30',
   * because rows created before social_queue.round_at existed are its.
   */
  ['two rounds with real figures — round one publishing, round two waiting',
    [{ at: '15:30', enabled: true }], { enabled: true, minHours: 12 },
    {
      '03:30': prog({ total: 30, published: 8, failed: 1, skipped: 1, running: 1, scheduled: 19, finished: 10 }),
      '': prog({ total: 20, published: 2, scheduled: 18, finished: 2 }),
      '15:30': prog({ total: 50, scheduled: 50 }),
    }],
  /* And a round that is over, beside one that never ran. */
  ['round one finished, round two still waiting',
    [{ at: '15:30', enabled: true }], { enabled: true, minHours: 12 },
    { '03:30': prog({ total: 50, published: 48, failed: 2, finished: 50 }), '15:30': prog({ total: 50, scheduled: 50 }) }],
  /*
   * ─── HIS OWN LAYOUT, AND THE BUTTON THAT WAS NOT THERE ──────────────────
   *
   * "שיניתי לפחות מ-12 שעות ועדין לא נותן לפרסם."
   *
   * 01:30 and 23:30 are TWO HOURS apart around the clock, not twenty-two, and
   * he had already lowered the account's protection to two in Settings — so
   * his rounds clear the floor and the only thing refusing them is the
   * campaign's OWN twelve-hour window. The card measured every bit of that
   * correctly and then told him to "הורידו את החזרה ל-2 שעות": a number with
   * no control anywhere that sets it, because the campaign's window lost its
   * editor when the advanced queue controls came out at his request.
   *
   * verdict 'window-too-long' → repeatFitFor(verdict, 2) = max(2, ⌊2⌋) = 2,
   * so the panel must draw a real <button> reading exactly "הורידו את החזרה
   * ל-2 שעות". rounds-card.test.ts presses nothing; it asserts in a real
   * layout that the element IS a button — the one thing a grep of this file's
   * output cannot tell apart from a sentence, which is how two guards in this
   * suite once passed over a deleted feature.
   */
  ['his own layout: 01:30 and 23:30 against a twelve-hour window, floor 2 — the button that lowers it',
    [{ at: '23:30', enabled: true }], { enabled: true, minHours: 12 }, undefined, { start: '01:30', floorHours: 2 }],
  /*
   * AND THE SHAPE A WINDOW CANNOT FIX — which keeps the sentence and must get
   * NO button. 03:30 and 09:30 are six hours apart against the DEFAULT floor
   * of twelve, so the verdict is 'closer-than-the-floor', repeatFitFor()
   * returns null, and a button here would be exactly the decorative control
   * this product is not allowed to have: it would write a six and
   * repeatColumns() would clamp it straight back to twelve.
   */
  ['six hours apart against the default floor of twelve — the sentence, and NO button',
    [{ at: '09:30', enabled: true }], { enabled: true, minHours: 12 }],
];

const body = cases
  .map(
    ([label, rounds, repeat, figures, shape]) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="panel-probe">${renderToStaticMarkup(
    createElement(CampaignSchedulePanel, {
      schedule: shape?.start ? { ...base, start: shape.start } : base,
      onChange: () => {},
      campaignName: 'ניקוי ספות באר שבע',
      repeat,
      onRepeatChange: repeat ? () => {} : undefined,
      rounds,
      onRoundsChange: () => {},
      roundProgress: figures,
      /* undefined for every case that names none, which is the panel's own
         default (MIN_REPEAT_HOURS) and so changes nothing above. */
      floorHours: shape?.floorHours,
    } as never),
  )}</div>`,
  )
  .join('');

/*
 * ─── AND THE SAME CARD AT THE WIDTH THE RUN CARD GIVES IT ─────────────────
 *
 * THE PROBES ABOVE ARE 328px WIDE AT 360 AND THAT IS NOT NARROW ENOUGH.
 *
 * On the dashboard the panel sits inside the run card, which adds its own
 * padding: the rounds card there measures 31→329, i.e. 298px. At that width
 * the round row WRAPS and the ⋮ lands at the right end of the second line —
 * which is the layout in which the old `absolute end-0` menu opened 63 pixels
 * off the side of the card. Measured at 328px it fitted, so this file's own
 * fixture could not see the defect and dashboard-hero.test.ts caught it alone.
 * A guard that only one fixture can fail is one fixture away from silence.
 *
 * So the busiest case is drawn again at 298 and at 260 — the run card's width,
 * and narrower still. These carry no `panel-probe` class on purpose: the
 * resting pass asserts exactly six panels and reads them by index, while the
 * open-menu pass walks `[data-rounds-card] details` across the whole page and
 * picks these up for free.
 */
const narrow = [298, 260]
  .map(
    (w) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">three rounds at ${w}px — the width the run card gives this panel</p>
  <div class="narrow-probe" style="width:${w}px">${renderToStaticMarkup(
    createElement(CampaignSchedulePanel, {
      schedule: base,
      onChange: () => {},
      campaignName: 'ניקוי ספות באר שבע',
      repeat: { enabled: true, minHours: 12 },
      onRepeatChange: () => {},
      rounds: [
        { at: '11:30', enabled: true },
        { at: '15:30', enabled: true },
        { at: '19:30', enabled: true },
      ],
      onRoundsChange: () => {},
    } as never),
  )}</div>`,
  )
  .join('');

/*
 * ─── AND HIS LAYOUT AT THE RUN CARD'S OWN WIDTHS ──────────────────────────
 *
 * THE BUTTON IS THE WIDEST SINGLE-LINE THING ON THIS CARD. It is `w-full` so
 * its own box cannot stick out, but a label that does not fit is clipped
 * inside a box that measures perfectly — which would be a 40px control the
 * owner cannot read, and no box measurement would catch it. So his case is
 * drawn again at 298 and 260, the widths the dashboard's run card actually
 * gives this panel, and the probe reads scrollWidth against clientWidth there.
 *
 * Its own class, not `panel-probe` and not `narrow-probe`: the resting pass
 * asserts an exact panel count and reads by index, and the narrow pass asserts
 * exactly two narrow probes. Neither moves. The open-menu pass walks
 * `[data-rounds-card] details` across the whole page and picks these up free.
 */
const fitNarrow = [298, 260]
  .map(
    (w) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">his own layout at ${w}px — the width the run card gives this panel</p>
  <div class="fit-probe" style="width:${w}px">${renderToStaticMarkup(
    createElement(CampaignSchedulePanel, {
      schedule: { ...base, start: '01:30' },
      onChange: () => {},
      campaignName: 'ניקוי ספות באר שבע',
      repeat: { enabled: true, minHours: 12 },
      onRepeatChange: () => {},
      floorHours: 2,
      rounds: [{ at: '23:30', enabled: true }],
      onRoundsChange: () => {},
    } as never),
  )}</div>`,
  )
  .join('');

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px">${body}${narrow}${fitNarrow}</div></body></html>`);
