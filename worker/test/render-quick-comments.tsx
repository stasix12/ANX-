/*
 * THE FIXTURE quick-comments.test.ts MEASURES.
 *
 * The real component with the real compiled Tailwind, for the same reason
 * render-card.tsx exists: anything hand-written here would measure a copy, and
 * a copy is what stops failing the moment the component changes.
 *
 * THE SHAPES CHOSEN ARE THE ONES THAT BREAK STRIPS. A very long Hebrew name
 * that must truncate rather than push the card wide; a Cyrillic name inside an
 * RTL card, which clips at the wrong end without dir="auto"; a one-word name,
 * which is what exposes a card that sizes itself to its text instead of to a
 * fixed width; a run that published to a single group, which is the only place
 * the singular "קבוצה" is ever rendered; and six of them in total, because the
 * strip's whole job is to hold more than fits and let a thumb reach the rest.
 *
 * It renders inside .social-theme, which is the class /social's own layout
 * wraps the screen in. Without it every ink/mist/brand token resolves to the
 * storefront's DARK set and the measurement would be of a card no owner sees.
 * (This said .crm-theme at first, which is a DIFFERENT scope in the same
 * stylesheet — the CRM's, where brand-* is blue. Sizes were unaffected, but it
 * was measuring the wrong product, and it is why I told the owner their accent
 * was blue when /social's brand-* is in fact purple.)
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuickCommentsCard } from '@/components/social/QuickCommentsCard';
import type { Campaign } from '@/lib/social/types';
import type { CampaignState } from '@/lib/social/campaign';

const prog = (published: number) =>
  ({ total: published, published, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: published }) as never;

/* `done` carries only what the card reads off it: when the row published, and
   the channel of the group it went to. */
const done = (iso: string, channel = 'facebook_group') =>
  [{ id: 'r', status: 'published', scheduled_at: iso, published_at: iso, target: { id: 't', name: 'g', channel, image_url: null } }] as never;

const st = (published: number, iso: string, channel?: string): CampaignState =>
  ({
    progress: prog(published),
    state: 'completed',
    truncated: false,
  todayOnly: false,
    startedAt: iso,
    estimatedCompletionAt: null,
    nextAt: null,
    nextTargetName: null,
    nextChannel: null,
    upcoming: [],
    done: done(iso, channel),
    now: [],
  }) as CampaignState;

const mk = (id: string, name: string): Campaign =>
  ({ id, name, service: '', city: '', language: 'he', status: 'active', notes: '' }) as Campaign;

const campaigns: Campaign[] = [
  mk('1', 'ניקוי ריפודי רכב ומושבים בבאר שבע ובכל הסביבה — מבצע ספטמבר'),
  mk('2', 'Арад наш дом и решаем мы'),
  mk('3', 'ספות'),
  mk('4', 'ניקוי מזגנים באר שבע'),
  mk('5', 'ניקוי מזרונים'),
  mk('6', 'ניקוי ספות פינתיות'),
  /* Never published, so it must not appear at all: the button under the strip
     promises a comment, and a comment needs posts to land on. */
  mk('7', 'סבב שעוד לא רץ'),
];

const states: Record<string, CampaignState> = {
  '1': st(28, '2026-09-25T11:20:00Z'),
  '2': st(1, '2026-09-24T08:15:00Z'),
  '3': st(122, '2026-09-23T13:40:00Z'),
  '4': st(15, '2026-09-22T07:30:00Z'),
  '5': st(9, '2026-09-21T06:12:00Z'),
  '6': st(41, '2026-09-20T06:12:00Z'),
  '7': st(0, '2026-09-19T06:12:00Z'),
};

const body = renderToStaticMarkup(
  createElement('div', { className: 'probe' }, createElement(QuickCommentsCard, { campaigns, states, onComment: () => {} })),
);

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="social-theme bg-ink-950"><div style="padding:16px">${body}</div></body></html>`);
