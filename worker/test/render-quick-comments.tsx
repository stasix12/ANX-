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

/**
 * `today` is what the campaign card counts; `ever` is what this strip counts.
 *
 * They were the same field until the daily repeat arrived, and then they were
 * not: a repeating round's progress is scoped to TODAY, so between midnight
 * and the day's first publication it reads zero while the round has hundreds of
 * publications behind it. Campaign 3 below is exactly that state.
 */
const st = (
  today: number,
  iso: string,
  channel?: string,
  opts: { todayOnly?: boolean; ever?: number } = {},
): CampaignState => {
  const ever = opts.ever ?? today;
  return {
    progress: prog(today),
    state: 'completed',
    truncated: false,
    todayOnly: opts.todayOnly ?? false,
    startedAt: iso,
    everPublished: ever,
    lastPublishedAt: ever > 0 ? iso : null,
    lastPublishedChannel: ever > 0 ? (channel ?? 'facebook_group') : null,
    estimatedCompletionAt: null,
    nextAt: null,
    nextTargetName: null,
    nextChannel: null,
    upcoming: [],
    /* Today's finished rows. Empty for the repeating round below, which is the
       whole point: the strip must not be reading this. */
    done: today > 0 ? done(iso, channel) : ([] as never),
    now: [],
  } as CampaignState;
};

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
  /* Published yesterday. Also absent — the strip is about today. */
  mk('8', 'סבב של אתמול'),
];

/**
 * THE DAY THIS FIXTURE IS SET ON. 15:00 in Israel on the 25th.
 *
 * Pinned and handed to the component, because the strip now shows only the
 * rounds that published TODAY — "להציע תגובות מהירות רק לקמפיינים שפורסמו
 * באותו היום" — and a fixture dated against the real clock would be empty on
 * every day but the one it was written.
 */
const NOW = new Date('2026-09-25T12:00:00Z');

const states: Record<string, CampaignState> = {
  '1': st(28, '2026-09-25T11:20:00Z'),
  '2': st(1, '2026-09-25T08:15:00Z'),
  /*
   * THE SHARP CASE, kept in the fixture rather than described in a comment.
   *
   * A repeating round whose row was due at 23:58 and published at 00:05 — so
   * it published TODAY while today's scoped counter reads zero, because the
   * row belongs to yesterday's slice. It must appear.
   *
   * This is the regression behind "לאן נעלם המשבצת של התגובות מהירות?" in its
   * sharpest form: a strip that asks `progress.published` drops it, a strip
   * that asks when it actually published keeps it. It is campaign 3 and not a
   * seventh entry on purpose — the strip keeps six, so "the strip drew 6
   * cards" below is also the assertion that this one is still in it.
   */
  '3': st(0, '2026-09-24T21:05:00Z', 'facebook_group', { todayOnly: true, ever: 122 }),
  '4': st(15, '2026-09-25T07:30:00Z'),
  '5': st(9, '2026-09-25T06:12:00Z'),
  '6': st(41, '2026-09-25T05:00:00Z'),
  '7': st(0, '2026-09-19T06:12:00Z'),
  /* Published YESTERDAY at 15:00 Israel time. Not today, so not here — and a
     `now - 24h` window would wrongly keep it until this afternoon. */
  '8': st(60, '2026-09-24T12:00:00Z'),
};

const body = renderToStaticMarkup(
  createElement('div', { className: 'probe' }, createElement(QuickCommentsCard, { campaigns, states, now: NOW, onComment: () => {} })),
);

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="social-theme bg-ink-950"><div style="padding:16px">${body}</div></body></html>`);
