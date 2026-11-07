/*
 * THE DASHBOARD, AS A PAGE A BROWSER CAN MEASURE.
 *
 * "יש לצמצם את השטח האנכי של לוח הבקרה בכ־20%–30%" — a demand about the
 * height of a screen, which nothing in this suite could measure, because the
 * screen is a client component behind a Supabase session and an app router
 * and its identity bar was three hundred lines inside that component.
 *
 * So this is the real chrome and the real blocks, in the real order, with the
 * real classNames around them: the bar, the two actions, the four figures and
 * the live-flow panel, inside the same <main> the shell renders. Every number
 * below is fixture data; every ELEMENT is the shipped component. A copy of
 * the markup would measure a copy, and a copy is what stops failing when the
 * component changes.
 *
 * WHAT IS NOT HERE, and why: the bottom tab bar (position: fixed, so it adds
 * nothing to the column and its own height is pinned in SocialShell's own
 * comment), the campaign swiper (its card has a measured suite of its own in
 * render-hero.tsx), the activity feed and the reference card at the foot of
 * the page — all four are below the fold on every phone and none of them is
 * what the compaction brief is about.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlertTriangleIcon, MessageIcon, PauseIcon, PlusIcon, SendIcon, UsersIcon } from '@/components/icons';
import { IdentityBar } from '@/components/social/SocialShell';
import { LiveQueueHero } from '@/components/social/LiveCampaignHero';
import type { FlowRow } from '@/components/social/LiveFlow';
import { Button, ButtonLink, StatStrip, type StatStripItem } from '@/components/social/ui';

const ic = { className: 'h-[18px] w-[18px]', 'aria-hidden': true } as const;

/*
 * THE COLUMN'S OWN SPACING, AND IT IS PINNED TO THE PAGE.
 *
 * This fixture would otherwise carry its own copy of the dashboard's stack
 * gap and keep measuring it after the page had changed. dashboard-size.test.ts
 * asserts that src/app/social/page.tsx still spells it this way.
 */
const COLUMN = 'space-y-3';

/** The two action buttons' own override, pinned the same way. */
const BTN = 'flex-col !items-start gap-0 !py-2';

/* The same two paddings SocialShell puts on <main> for a screen with hideTitle. */
const MAIN = 'crm-page mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 pb-4 pt-1';

const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="${fill}"/></svg>`)}`;

/** The four columns exactly as src/app/social/page.tsx builds them. */
const stats: StatStripItem[] = [
  {
    key: 'published',
    icon: createElement(SendIcon, ic),
    tone: 'good',
    label: 'פורסמו היום',
    value: 124,
    sub: '812 מתחילת השבוע',
    href: '/social/history?status=published&range=1',
  },
  {
    key: 'waiting',
    icon: createElement(UsersIcon, ic),
    tone: 'brand',
    label: 'ממתינים היום',
    value: 162,
    sub: 'ועוד 145 אחרי חצות',
    href: '/social/history?status=scheduled',
    action: { label: 'אפס הכל', title: 'אפס את כל התור, לא רק היום (307)', onClick: () => undefined },
  },
  {
    key: 'failed',
    icon: createElement(AlertTriangleIcon, ic),
    tone: 'bad',
    label: 'נכשלו היום',
    value: 15,
    chipLabel: 'טיפול נדרש',
    sub: 'ועוד 3 דולגו',
    href: '/social/history?status=failed&range=1',
  },
  {
    key: 'comments',
    icon: createElement(MessageIcon, ic),
    tone: 'neutral',
    label: 'תגובות היום',
    value: 0,
    href: '/social/history?status=published&range=1',
  },
];

const queue: FlowRow[] = [
  { id: 'r-done', name: 'באר שבע והסביבה', state: 'done', at: '20:15', image: pic('#2f7d32') },
  { id: 'r-live', name: 'קבוצת באר שבע', state: 'live', note: 'מפרסם עכשיו', image: pic('#1557d6') },
  { id: 'r-next', name: 'לוח באר שבע — מודעות ועסקים', state: 'next' },
];

/* The two actions, exactly as the dashboard builds them when nothing is paused. */
const actions = createElement(
  'div',
  { className: 'grid grid-cols-2 gap-2.5 [&>*]:min-w-0' },
  createElement(
    ButtonLink,
    { href: '/social/posts/new', size: 'lg', variant: 'primary', className: BTN } as never,
    createElement(
      'span',
      { className: 'flex items-center gap-1.5 text-[15px] font-extrabold leading-5' },
      createElement(PlusIcon, { 'aria-hidden': true, className: 'h-4 w-4' }),
      'פוסט חדש',
    ),
    createElement('span', { className: 'text-[11px] font-semibold leading-[15px] opacity-80' }, 'צור ותזמן פוסט לקבוצות'),
  ),
  createElement(
    Button,
    { size: 'lg', variant: 'secondary', className: BTN } as never,
    createElement(
      'span',
      { className: 'flex items-center gap-1.5 text-[15px] font-extrabold leading-5' },
      createElement(PauseIcon, { 'aria-hidden': true, className: 'h-4 w-4' }),
      'השהה פרסום',
    ),
    createElement('span', { className: 'text-[11px] font-semibold leading-[15px] opacity-80' }, 'עצור זמנית את המערכת'),
  ),
);

const hero = createElement(LiveQueueHero, {
  systemState: 'active',
  workerOnline: true,
  publishingBlocked: false,
  publishedToday: 124,
  dailyTarget: 300,
  plannedToday: 286,
  pendingCancellable: 162,
  nextAt: new Date('2026-11-07T18:30:00+02:00').toISOString(),
  nextTargetName: 'קבוצת באר שבע',
  inFlight: 1,
  inFlightRows: [
    {
      id: 'q-live',
      status: 'publishing',
      step: 'uploading_media',
      step_at: new Date('2026-11-07T18:29:48+02:00').toISOString(),
      scheduled_at: new Date('2026-11-07T18:29:00+02:00').toISOString(),
      target: { name: 'Чистка диванов Беэр-Шева и окрестности — объявления', image_url: pic('#7a4bd0') },
      post: { media: [] },
    },
  ],
  flowRows: queue,
  fbAccount: { name: 'Stas Terehin', avatar: pic('#1550c4') },
  profiles: [],
  onSwitchProfile: () => undefined,
  onRefresh: () => undefined,
  updatedAt: new Date('2026-11-07T18:30:00+02:00'),
} as never);

/*
 * THE BAR, WITH THE STATE THE REFERENCE DRAWS: a system that is running, so
 * the pill is the green "המערכת פעילה" the image shows. The other three
 * states go through the same map and are measured by the suite, not here.
 */
const bar = createElement(IdentityBar, {
  title: 'לוח בקרה',
  who: { name: 'Stas Terehin', avatar: pic('#1550c4') },
  pending: null,
  pcOnline: true,
  state: { label: 'המערכת פעילה', tone: 'good' },
  whoOpen: false,
  onAvatar: () => undefined,
  pcOpen: false,
  onPc: () => undefined,
  settingsActive: false,
} as never);

const page = createElement(
  'div',
  { className: 'min-h-dvh bg-ink-950 pb-[calc(4.5rem+var(--safe-b))]' },
  bar,
  createElement(
    'main',
    { 'data-main': true, className: MAIN },
    createElement('h1', { className: 'sr-only' }, 'לוח בקרה'),
    createElement('div', { 'data-column': true, className: COLUMN }, actions, createElement('section', null, createElement(StatStrip, { items: stats })), hero),
  ),
);

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">${renderToStaticMarkup(page)}</div>
</body></html>`,
);
