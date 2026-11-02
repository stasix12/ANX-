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

const cases: [string, CampaignRound[], { enabled: boolean; minHours: number } | undefined, Prog?][] = [
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
];

const body = cases
  .map(
    ([label, rounds, repeat, figures]) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="panel-probe">${renderToStaticMarkup(
    createElement(CampaignSchedulePanel, {
      schedule: base,
      onChange: () => {},
      campaignName: 'ניקוי ספות באר שבע',
      repeat,
      onRepeatChange: repeat ? () => {} : undefined,
      rounds,
      onRoundsChange: () => {},
      roundProgress: figures,
    } as never),
  )}</div>`,
  )
  .join('');

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px">${body}</div></body></html>`);
