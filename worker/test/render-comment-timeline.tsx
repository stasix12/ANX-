/*
 * THE FIXTURE comment-timeline.test.ts MEASURES.
 *
 * The real component with the real compiled Tailwind, inside .social-theme —
 * the scope /social's own layout wraps the screen in, where brand-* is the
 * purple the owner sees.
 *
 * THE ROWS ARE THE ONES THAT BREAK A RAIL:
 *
 *   - a failure carrying a long Hebrew reason, which is the row most likely to
 *     push the "לתגובה" link off the end;
 *   - a Cyrillic group name inside an RTL line;
 *   - an 'unverified', the state that must never be worded as a failure;
 *   - a row with NO permalink, so the link falls back to the group address —
 *     and a row with neither, which must render without a link rather than a
 *     dead one;
 *   - the same publication present in BOTH reads, which is what the de-dupe
 *     exists for: drawn twice it would be the rail claiming two comments under
 *     one post;
 *   - a comment from yesterday, so the day heading renders;
 *   - and enough waiting rows to prove the queue numbering starts at 1 for the
 *     next comment out rather than continuing the finished ones' count.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentTimeline } from '@/components/social/CommentTimeline';
import type { QueueRow } from '@/lib/social/client';

const row = (o: Partial<QueueRow> & { id: string }): QueueRow =>
  ({
    status: 'published',
    scheduled_at: '2026-09-29T15:00:00Z',
    published_at: '2026-09-29T15:00:00Z',
    target: { id: 't', name: 'קבוצה', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/1' },
    ...o,
  }) as QueueRow;

const done: QueueRow[] = [
  row({
    id: 'a',
    comment_status: 'done',
    comment_at: '2026-09-29T15:31:00Z',
    permalink: 'https://facebook.com/groups/1/posts/9',
    target: { id: '1', name: 'באר שבע והסביבה ביחד', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/1' } as never,
  }),
  /* Yesterday, so the day heading has to appear. */
  row({
    id: 'b',
    comment_status: 'done',
    comment_at: '2026-09-28T09:05:00Z',
    permalink: 'https://facebook.com/groups/2/posts/4',
    target: { id: '2', name: 'АРАД НАШ И РЕШАЕМ МЫ', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/2' } as never,
  }),
];

const rows: QueueRow[] = [
  /* The same publication as done[0] — present in both reads, as it is on a
     busy day. It must be drawn once. */
  row({ id: 'a', comment_status: 'done', comment_at: '2026-09-29T15:31:00Z', permalink: 'https://facebook.com/groups/1/posts/9' }),
  row({
    id: 'c',
    comment_status: 'failed',
    comment_at: '2026-09-29T16:02:00Z',
    comment_note: 'לא מצאנו את הפוסט בקבוצה. ייתכן שמנהל הקבוצה מחק אותו, או שהקבוצה סגרה תגובות על פוסטים של חברים.',
    permalink: '',
    target: { id: '3', name: 'ניקוי ספות — מבצעים באר שבע', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/3' } as never,
  }),
  row({
    id: 'd',
    comment_status: 'unverified',
    comment_at: '2026-09-29T16:40:00Z',
    comment_note: 'נלחץ Enter ופייסבוק לא אישרה. ייתכן שהתגובה כבר שם — כדאי להסתכל.',
    permalink: 'https://facebook.com/groups/4/posts/7',
    target: { id: '4', name: 'Арад - обо всём', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/4' } as never,
  }),
  /* No permalink and no group address: it must render with no link at all
     rather than an href of "". */
  row({ id: 'e', comment_status: 'commenting', permalink: '', target: null as never }),
  row({ id: 'f', comment_status: 'pending', published_at: '2026-09-29T17:10:00Z', permalink: '' }),
  row({
    id: 'g',
    comment_status: 'pending',
    published_at: '2026-09-29T17:20:00Z',
    permalink: '',
    target: { id: '5', name: 'ארד — לוח מודעות ומידע לתושבים', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/5' } as never,
  }),
  row({ id: 'h', comment_status: 'pending', published_at: '2026-09-29T17:30:00Z', permalink: '' }),
];

/*
 * ENOUGH OF EACH TO MAKE THE FOLD REAL. Each half shows four and folds the
 * rest, so with four in each half nothing would fold and the "הצג עוד" the
 * owner pointed at would never render — the test would be measuring an
 * unfolded card and calling it the folded one.
 */
for (let i = 0; i < 3; i += 1) {
  done.push(
    row({
      id: `p${i}`,
      comment_status: 'done',
      comment_at: `2026-09-29T1${i}:00:00Z`,
      permalink: `https://facebook.com/groups/9/posts/${i}`,
      target: { id: `9${i}`, name: `קבוצה נוספת ${i + 1}`, channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/9' } as never,
    }),
  );
  rows.push(row({ id: `w${i}`, comment_status: 'pending', published_at: `2026-09-29T18:${i}0:00Z`, permalink: '' }));
}

/* Far larger than the two windows above, which is the real case: the owner's
   own screen showed 124 failures and 126 waiting against reads capped at 60
   and 40. The footer must count THESE. */
const totals = { pending: 126, done: 18, failed: 124, unverified: 3 };

const body = renderToStaticMarkup(
  createElement('div', { className: 'probe' }, createElement(CommentTimeline, { rows, done, totals })),
);

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="social-theme bg-ink-950"><div style="padding:16px">${body}</div></body></html>`);
