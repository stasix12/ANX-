/*
 * THE FIXTURE stat-strip.test.ts MEASURES.
 *
 * "אני רוצה פאנל סטטיסטיקות אחד, אופקי, אלגנטי ומחולק לארבע עמודות — בדיוק
 *  כמו ברפרנס. לא ארבע כרטיסיות נפרדות."
 *
 * The real component with the real Tailwind classes, rendered to HTML so a
 * browser can measure it. Anything hand-written here would be measuring a
 * copy, and a copy is exactly what stops failing when the component changes.
 *
 * THREE SHAPES, because the panel has to survive all three:
 *
 *   1  THE REFERENCE'S OWN NUMBERS — 124 published, 162 waiting, 15 failed,
 *      0 comments — with the failure chip and the queue's reset on screen,
 *      which is the drawing he sent and the day he actually has.
 *   2  A QUIET DAY, every figure 0: nothing is coloured, no chip, no action.
 *      This is the state that proves "a red zero is noise, not a warning".
 *   3  FOUR DIGITS EVERYWHERE, with the longest secondary lines the screen
 *      can produce. 2655 waiting is his own planned day; it is the widest the
 *      data gets, and the width is what decides whether four columns fit a
 *      320px phone.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlertTriangleIcon, MessageIcon, SendIcon, UsersIcon } from '@/components/icons';
import { StatStrip, type StatStripItem } from '@/components/social/ui';

const ic = { className: 'h-[18px] w-[18px]', 'aria-hidden': true } as const;

/** The four columns exactly as src/app/social/page.tsx builds them. */
function items(d: {
  today: number;
  week: number;
  waiting: number;
  later: number;
  failed: number;
  skipped: number;
  comments: number;
  commentsPending: number;
  pending: number;
}): StatStripItem[] {
  return [
    {
      key: 'published',
      icon: createElement(SendIcon, ic),
      tone: d.today ? 'good' : 'neutral',
      label: 'פורסמו היום',
      value: d.today,
      sub: d.week ? `${d.week} מתחילת השבוע` : undefined,
      href: '/social/history?status=published&range=1',
    },
    {
      key: 'waiting',
      icon: createElement(UsersIcon, ic),
      tone: d.waiting ? 'brand' : 'neutral',
      label: 'ממתינים היום',
      value: d.waiting,
      sub: d.later ? `ועוד ${d.later} אחרי חצות` : undefined,
      href: '/social/history?status=scheduled',
      action: d.pending ? { label: 'אפס הכל', title: `אפס את כל התור, לא רק היום (${d.pending})`, onClick: () => undefined } : undefined,
    },
    {
      key: 'failed',
      icon: createElement(AlertTriangleIcon, ic),
      tone: d.failed ? 'bad' : 'neutral',
      label: 'נכשלו היום',
      value: d.failed,
      chipLabel: d.failed ? 'טיפול נדרש' : undefined,
      sub: d.skipped ? `ועוד ${d.skipped} דולגו` : undefined,
      href: '/social/history?status=failed&range=1',
    },
    {
      key: 'comments',
      icon: createElement(MessageIcon, ic),
      tone: 'neutral',
      label: 'תגובות היום',
      value: d.comments,
      sub: d.commentsPending ? `${d.commentsPending} ממתינות` : undefined,
      href: '/social/history?status=published&range=1',
    },
  ];
}

const CASES = [
  { id: 'reference', data: { today: 124, week: 812, waiting: 162, later: 145, failed: 15, skipped: 3, comments: 0, commentsPending: 0, pending: 307 } },
  { id: 'quiet', data: { today: 0, week: 0, waiting: 0, later: 0, failed: 0, skipped: 0, comments: 0, commentsPending: 0, pending: 0 } },
  { id: 'wide', data: { today: 1234, week: 8125, waiting: 2655, later: 1493, failed: 108, skipped: 44, comments: 962, commentsPending: 71, pending: 4148 } },
];

const body = CASES.map((c) =>
  createElement('div', { key: c.id, 'data-strip-case': c.id, className: 'mb-5' }, createElement(StatStrip, { items: items(c.data) })),
);

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">${renderToStaticMarkup(createElement('div', null, body))}</main>
</div>
</body></html>`,
);
