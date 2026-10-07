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
 * A FIXED CLOCK, AND EVERY ROW PLACED AGAINST IT.
 *
 * The card's window used to be a rolling 24 hours, so this file placed rows
 * against the real clock — a date literal would have fallen out of the window
 * the moment the machine's clock passed it, and the file would have measured
 * the empty state while claiming to measure the list.
 *
 * The window is now the local DAY, and "the local day" moves: a row twenty
 * hours old is yesterday at half past six in the evening and today at half
 * past two in the morning. Against the real clock this fixture would pass all
 * afternoon and fail at night. So the component is handed this instant as its
 * `now` and every row is placed against the same one.
 *
 * 18:30 Israel time on purpose: it puts the twenty-hour-old row at 22:30 the
 * previous evening — INSIDE the old rolling window and OUTSIDE today, which
 * is the one row that tells the two windows apart.
 */
export const NOW = new Date('2026-09-29T18:30:00+03:00');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

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
    comment_at: ago(14),
    permalink: 'https://facebook.com/groups/1/posts/9',
    target: { id: '1', name: 'באר שבע והסביבה ביחד', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/1' } as never,
  }),
  /*
   * TWENTY HOURS OLD — 22:30 the previous evening against this fixture's
   * clock. Inside a rolling 24-hour window and outside today, so it is the row
   * that tells the old window from the new one: it must NOT be drawn, and it
   * must be counted in the "תגובות קודמות לא מוצגות" line rather than vanish.
   */
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
    comment_at: ago(12),
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
];

/*
 * THE WAITING ONES COME FROM THEIR OWN READ — and the fixture proves why.
 *
 * `rows` below carries NO pending row at all, which is exactly the shape the
 * owner's account produced: listCommentQueue asks for every comment state
 * oldest-publication-first capped at sixty, and with 482 such rows the sixty
 * oldest were all long finished. The queue was outside the window every time,
 * so the rail showed nothing waiting while the bar counted 75 in it.
 *
 * So if the component ever goes back to deriving the queue from `rows`, these
 * four disappear and the assertions about "הבא בתור" and the estimates fail.
 */
const waiting: QueueRow[] = [
  row({ id: 'e', comment_status: 'commenting', published_at: ago(9), permalink: '', target: null as never }),
  row({ id: 'f', comment_status: 'pending', published_at: ago(8), permalink: '' }),
  row({
    id: 'g',
    comment_status: 'pending',
    published_at: ago(7),
    permalink: '',
    target: { id: '5', name: 'ארד — לוח מודעות ומידע לתושבים', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/5' } as never,
  }),
  row({ id: 'h', comment_status: 'pending', published_at: ago(6), permalink: '' }),
];

/*
 * ONE FROM THE DAY BEFORE, which must NOT appear. Without it the window is
 * asserted only by the absence of rows it was never given, which is no
 * assertion at all.
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
  /*
   * TWO MINUTES APART, which is the owner's real pace — their own screen read
   * 23:28, 23:30, 23:32, 23:34, 23:35.
   *
   * The WHOLE finished series is on that spacing, not just these three. The
   * median is taken over every usable interval in the day, so leaving the
   * others at five, twenty-five and ten minutes made the median five and the
   * assertion below was asserting my arithmetic rather than the component's.
   * The only interval deliberately left huge is the one to yesterday's
   * comment, which the 30-minute filter is there to drop.
   */
  done.push(
    row({
      id: `p${i}`,
      comment_status: 'done',
      comment_at: ago(16 + i * 2),
      permalink: `https://facebook.com/groups/9/posts/${i}`,
      target: { id: `9${i}`, name: `קבוצה נוספת ${i + 1}`, channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/9' } as never,
    }),
  );
  waiting.push(row({ id: `w${i}`, comment_status: 'pending', published_at: ago(5 - i), permalink: '' }));
}

/* Far larger than the two windows above, which is the real case: the owner's
   own screen showed 124 failures and 126 waiting against reads capped at 60
   and 40. The footer must count THESE. */
const totals = { pending: 126, done: 18, failed: 124, unverified: 3 };

/*
 * AND TODAY'S OWN OUTCOMES, which are a different scope and deliberately a
 * much smaller number — "ציר זמן לעשות נתונים רק מה שקשור לאותו היום".
 *
 * Nothing like `totals` on purpose: if the card ever fell back to the lifetime
 * figures the rendered line would read 18 rather than 9, and a test that gave
 * both the same numbers could not tell the two apart.
 */
const today = { done: 9, failed: 2, unverified: 1 };

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
const soon = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

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
  /*
   * TOMORROW LUNCHTIME, in a round that DOES carry a comment. Real work, and
   * not this rail's: "ציר זמן לעשות נתונים רק מה שקשור לאותו היום". Without
   * it the look-ahead's day boundary is asserted only by the absence of rows
   * the fixture never offered, which is no assertion at all.
   */
  row({
    id: 'u4',
    status: 'scheduled',
    campaign_id: 'r1',
    scheduled_at: soon(18 * 60),
    published_at: null,
    comment_status: '',
    target: { id: '10', name: 'קבוצה של מחר', channel: 'facebook_group', image_url: null, url: 'https://facebook.com/groups/10' } as never,
  }),
];


const body = renderToStaticMarkup(
  createElement('div', { className: 'probe' }, createElement(CommentTimeline, { rows, waiting, done, totals, today, upcoming, campaigns, now: NOW })),
);

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="social-theme bg-ink-950"><div style="padding:16px">${body}</div></body></html>`);
