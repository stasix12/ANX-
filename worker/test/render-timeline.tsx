/*
 * THE DASHBOARD'S RAIL, rendered for real so a test can read what it says.
 *
 * Sibling of render-hero.tsx and render-card.tsx, and for the same reason: a
 * source grep can prove a string is in the file, and the question here is not
 * that. "למה יש הרבה שורות של דולג" was asked about a card whose finished rows
 * printed one grey word, while the sentence explaining each of them sat in the
 * database unread — so what has to be provable is what the COMPONENT puts on
 * the row, and how many finished rows it lets stand above the waiting ones.
 *
 * Three scenes, printed one after another with a marker between them so the
 * test can cut them apart:
 *   SCENE A — a busy evening: six finished stops (three skipped with their
 *             reasons, one skipped with none, two published) above three
 *             waiting ones. This is his screenshot.
 *   SCENE B — the same finished rows with NOTHING waiting, which is the card
 *             in its "מה קרה היום" mode, where every one of them belongs.
 *   SCENE C — one skipped row whose reason is a long sentence, to prove the
 *             row clamps it rather than growing.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Timeline } from '@/components/social/Timeline';
import type { TimelineRow } from '@/lib/social/client';

export const MARK = '<!--SCENE-->';

/* Floored to the minute and relative to now, for the reason render-hero gives:
   a literal date measures a row that says "מחר" today and something else
   tomorrow. These all sit in the past, which is where finished rows are. */
const base = Math.floor(Date.now() / 60_000) * 60_000;
const at = (minutesAgo: number) => new Date(base - minutesAgo * 60_000).toISOString();
const ahead = (minutes: number) => new Date(base + minutes * 60_000).toISOString();

const row = (over: Partial<TimelineRow> & { id: string; name: string }): TimelineRow =>
  ({
    id: over.id,
    status: over.status ?? 'skipped',
    scheduled_at: over.scheduled_at ?? at(7),
    published_at: over.published_at ?? null,
    skip_reason: over.skip_reason ?? null,
    target: { id: `t-${over.id}`, name: over.name, channel: 'facebook_group', image_url: null },
  }) as unknown as TimelineRow;

export const REASONS = {
  off: 'היעד "שכונת סיגליות באר שבע" כבוי.',
  already: 'הפוסט הזה כבר פורסם ל-"באר שבע ביחד באמת".',
  stopped: 'הסבב נעצר.',
  long: 'בדקנו את הקבוצה שוב בפייסבוק ואי אפשר לפרסם בה מהחשבון הזה ("רק חברי הקבוצה יכולים לפרסם"). הקבוצה כובתה ולא ייכנסו אליה פרסומים חדשים. אם זו טעות — הפעילו אותה כאן; אם אתם רוצים לצאת ממנה, צאו בפייסבוק.',
};

const done: TimelineRow[] = [
  row({ id: 'd1', name: 'שכונת סיגליות באר שבע', skip_reason: REASONS.off, scheduled_at: at(12) }),
  row({ id: 'd2', name: 'אופקים ביחד', status: 'published', published_at: at(11), scheduled_at: at(11) }),
  row({ id: 'd3', name: 'באר שבע ביחד באמת', skip_reason: REASONS.already, scheduled_at: at(10) }),
  row({ id: 'd4', name: 'ערד החדשה', skip_reason: REASONS.stopped, scheduled_at: at(9) }),
  /* The row written before any of this existed: no reason stored at all. It
     must still say something, and the something is the old word. */
  row({ id: 'd5', name: 'דרושים מחפשי עבודה', skip_reason: null, scheduled_at: at(8) }),
  row({ id: 'd6', name: 'אוכלים בבאר שבע', status: 'published', published_at: at(7), scheduled_at: at(7) }),
];

const waiting: TimelineRow[] = [
  row({ id: 'w1', name: 'מיתר כרמית עמר', status: 'scheduled', scheduled_at: ahead(3) }),
  row({ id: 'w2', name: 'נתיבות אופקים', status: 'scheduled', scheduled_at: ahead(6) }),
  row({ id: 'w3', name: 'רמות באר שבע', status: 'scheduled', scheduled_at: ahead(9) }),
];

const scenes = [
  createElement(Timeline, { rows: waiting, done, limit: 40, total: 355 }),
  createElement(Timeline, { rows: [], done, limit: 40, total: 0 }),
  createElement(Timeline, {
    rows: [],
    done: [row({ id: 'x1', name: 'קבוצה ארוכה', skip_reason: REASONS.long, scheduled_at: at(4) })],
    limit: 40,
  }),
];

process.stdout.write(scenes.map((s) => renderToStaticMarkup(s)).join(MARK));
