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

/*
 * MINUTES AGO, NOT A FIXED DATE. The card shows the last 24 hours only, so a
 * fixture pinned to 2026-09-29 would fall outside the window the moment the
 * clock passed it and this file would measure the empty state while claiming
 * to measure the list. Everything finished is placed relative to now.
 */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/*
 * THE TWO EXCEPTION STATES ARE THE NEWEST ON PURPOSE. The finished list folds
 * at two, and "לא הצליח" and "צריך לבדוק" are the wordings most worth pinning
 * — an unverified comment may already be under the post, and calling it a
 * failure is what once put it in the bulk retry and posted a second one. Left
 * further down the list they fold away and the assertions about them pass on
 * an empty page.
 */

const done: QueueRow[] = [
  row({
    id: 'a',
    comment_status: 'done',
    comment_at: ago(45),
    permalink: 'https://facebook.com/groups/1/posts/9',
    target: { id: '1', name: 'באר שבע והסביבה ביחד', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/1' } as never,
  }),
  /* Yesterday, so the day heading has to appear. */
  row({
    id: 'b',
    comment_status: 'done',
    comment_at: ago(20 * 60),
    permalink: 'https://facebook.com/groups/2/posts/4',
    target: { id: '2', name: 'АРАД НАШ И РЕШАЕМ МЫ', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/2' } as never,
  }),
];

const rows: QueueRow[] = [
  /* The same publication as done[0] — present in both reads, as it is on a
     busy day. It must be drawn once. */
  row({ id: 'a', comment_status: 'done', comment_at: ago(45), permalink: 'https://facebook.com/groups/1/posts/9' }),
  row({
    id: 'c',
    comment_status: 'failed',
    comment_at: ago(20),
    comment_note: 'לא מצאנו את הפוסט בקבוצה. ייתכן שמנהל הקבוצה מחק אותו, או שהקבוצה סגרה תגובות על פוסטים של חברים.',
    permalink: '',
    target: { id: '3', name: 'ניקוי ספות — מבצעים באר שבע', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/3' } as never,
  }),
  row({
    id: 'd',
    comment_status: 'unverified',
    comment_at: ago(10),
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
 * ONE FROM THE DAY BEFORE, which must NOT appear. Without it the 24-hour
 * filter is asserted only by the absence of rows it was never given, which is
 * no assertion at all.
 */
done.push(
  row({
    id: 'old',
    comment_status: 'done',
    comment_at: ago(40 * 60),
    permalink: 'https://facebook.com/groups/8/posts/1',
    target: { id: '8', name: 'קבוצה מלפני יומיים', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/8' } as never,
  }),
);

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
      comment_at: ago(180 + i * 60),
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

/*
 * PUBLICATIONS STILL DUE, and only some of them are owed a comment.
 *
 * Two rounds: one carrying `comment_text` and one with none. Both have posts
 * waiting to go out; only the first round's may appear. Without the second the
 * filter is asserted by the absence of rows it was never given, which is no
 * assertion at all — the same trap the forty-hour-old comment above is there
 * to avoid.
 *
 * The hours are in the future, because these are the one list on this card
 * that prints a real clock.
 */
const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const campaigns = [
  { id: 'r1', name: 'סבב עם תגובה', service: '', city: '', language: 'he', status: 'active', notes: '', comment_text: 'מחיר: 299 ש"ח' },
  { id: 'r2', name: 'סבב בלי תגובה', service: '', city: '', language: 'he', status: 'active', notes: '', comment_text: '' },
] as never as import('@/lib/social/types').Campaign[];

const upcoming: QueueRow[] = [
  row({ id: 'u1', status: 'scheduled', campaign_id: 'r1', scheduled_at: soon(20), published_at: null, comment_status: '' }),
  row({
    id: 'u2',
    status: 'scheduled',
    campaign_id: 'r1',
    scheduled_at: soon(80),
    published_at: null,
    comment_status: '',
    target: { id: '7', name: 'ניקוי מזגנים — באר שבע', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/7' } as never,
  }),
  /* Its round has no comment text, so no comment is coming: it must NOT be
     drawn, however imminent its publication is. */
  row({ id: 'u3', status: 'scheduled', campaign_id: 'r2', scheduled_at: soon(5), published_at: null, comment_status: '' }),
];

const body = renderToStaticMarkup(
  createElement('div', { className: 'probe' }, createElement(CommentTimeline, { rows, done, totals, upcoming, campaigns })),
);

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="social-theme bg-ink-950"><div style="padding:16px">${body}</div></body></html>`);
