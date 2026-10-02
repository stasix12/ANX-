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
 * THE WINDOWS, including the one the reference image is set to.
 *
 * `image` is literally what the attached screenshot shows lit — א׳ ב׳ ג׳ ה׳,
 * 08:00–22:00, every 10 minutes — so the card this file renders first is the
 * card in the picture, and a difference between them is a difference anyone
 * can see rather than one argued about.
 */
const sched: Record<string, CampaignSchedule> = {
  image: { enabled: true, days: [0, 1, 2, 4], start: '08:00', end: '22:00', gapMinutes: 10 },
  reference: { ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: true },
  all: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:30', gapMinutes: 1 },
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
 *  8  a long Hebrew name with three-figure counts, globally paused.
 */
const cases = [
  ['the reference image: finished with failures, 50 groups', camp('1', 'פרסומת לרוסים סבב ראשון'),
    st(prog({ total: 50, published: 40, skipped: 6, failed: 4, finished: 50 }), { state: 'completed', startedAt: inHours(-6), nextAt: inHours(20) }),
    50, sched.image],
  ['a live run mid-round', camp('2', 'ניקוי ספות באר שבע'),
    st(prog({ total: 40, published: 12, scheduled: 28, finished: 12 }), { state: 'running', startedAt: inHours(-2), nextAt: inHours(1), nextTargetName: 'באר שבע מדברת' }),
    40, sched.reference],
  ['every day, every hour, a one-minute gap', camp('3', 'ניקוי שטיחים'),
    st(prog({ total: 40, published: 12, scheduled: 28, finished: 12 }), { state: 'running', startedAt: inHours(-3), nextAt: inHours(1) }),
    40, sched.all],
  ['no day chosen — nothing can go out', camp('4', 'ניקוי חלונות ערד'),
    st(prog({ total: 40, published: 12, scheduled: 28, finished: 12 }), { state: 'running', startedAt: inHours(-3), nextAt: inHours(1) }),
    40, sched.none],
  ['the switch off — the card as it was before this feature', camp('5', 'ניקוי מרפסות'),
    st(prog({ total: 40, published: 12, scheduled: 28, finished: 12 }), { state: 'running', startedAt: inHours(-3), nextAt: inHours(1) }),
    40, sched.off],
  ['a finished round with nothing queued', camp('6', 'ניקוי ריפודי רכב'),
    st(prog({ total: 20, published: 20, finished: 20 }), { state: 'completed', startedAt: inHours(-9) }),
    20, sched.reference],
  ['no schedule at all — any other caller', camp('7', 'סבב פרסום'),
    st(prog({ total: 15, published: 5, skipped: 10, finished: 15 }), { state: 'stopped', startedAt: inHours(-30) }),
    15, null],
  ['a long name, big numbers, publishing globally paused', camp('8', 'ניקוי ריפודי רכב ומושבים בבאר שבע והסביבה', 'paused'),
    st(prog({ total: 248, published: 120, scheduled: 100, skipped: 16, failed: 12, finished: 148 }), { state: 'paused', startedAt: inHours(-48), nextAt: inHours(4) }),
    124, sched.reference],
] as const;

const body = cases
  .map(
    ([label, c, s, targets, schedule]) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="hero-probe">${renderToStaticMarkup(
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
  )}</div>`,
  )
  .join('');

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px">${body}</div></body></html>`);
