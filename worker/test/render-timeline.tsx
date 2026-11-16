/*
 * THE PUBLISHING ORDER — src/components/social/Timeline.tsx.
 *
 * The real component, through renderToStaticMarkup, inside the real <Card>
 * the real route wraps it in. It renders cleanly on the server: its only hook
 * is useTick(), a useState(() => Date.now()) with an interval behind a
 * useEffect, so a server pass gets the render clock and no ticking — which is
 * exactly one frame of the live screen.
 *
 * ─── THE CALL SITE, MIRRORED ──────────────────────────────────────────────
 *
 * src/app/social/campaigns/[id]/page.tsx:793-825 is the only one in the
 * product:
 *
 *   <Card title="תור הפרסום" subtitle="מתעדכן לבד כל 5 שניות"
 *         action={<SegmentedControl size="sm" label="תצוגה"
 *                   options={[{value:'queue',label:'רשימה'},
 *                             {value:'timeline',label:'ציר זמן'}]} …/>}>
 *     … <Timeline rows={state?.upcoming ?? []} limit={12} projected={projected} />
 *
 * `rows` is campaignStates()'s `upcoming` — TimelineRow, which is
 * Pick<QueueRow,'id'|'status'|'scheduled_at'|'published_at'|'updated_at'|
 * 'skip_reason'|'target'> (client.ts:1989). `projected` is projectQueue()'s
 * Map<rowId, ISO|null>. Both are built here with those exact shapes; no field
 * is invented.
 *
 * The `scrollable` + `done` + `total` + `onOpen` combination has no call site
 * in src/ today — the dashboard's rail is described in the component's own
 * props doc and the campaign screen passes none of them — so it is drawn as a
 * SECOND case, labelled, because every one of those four props changes this
 * component's geometry: `scrollable` puts the stops in a `max-h-[21rem]
 * overflow-y-auto` box, `onOpen` turns each stop into a <button>, `done` adds
 * the finished rows above the waiting ones, and `total` is what makes the
 * footer say a number at all.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ───────────────────────────────────────────
 *
 * Width decides whether a box holds its text. Every stop here is one of the
 * widest things this list can really draw:
 *
 *   · THE FOUR STATUS_LINE SENTENCES, all of them, because they sit under the
 *     group's name in a column the hour and the avatar have already taken
 *     from: "מפרסם עכשיו", "מוכן — ממתין לאישור שלכם" (the longest, and
 *     deliberately so — the component's own header explains that this strip
 *     may not call an awaiting row "publishing"), "ממתין לפרסום ידני",
 *     "דורש טיפול שלכם".
 *   · THE THREE DONE_LINE WORDS — "פורסם", "נכשל", "דולג" — on finished stops,
 *     which also draw the hollow rail dot and the dimmed hour.
 *   · ALL FOUR BRANCHES OF <Countdown>: a forecast far enough out to print
 *     "בעוד 22 ח 14 мин" territory (countdown.ts spells the duration with
 *     counted(), eighteen shapes, and i18n.ts answers them in figures), a
 *     slot that has just passed ("אמור לצאת עכשיו"), one hours behind
 *     ("באיחור · לפני 3 שעות"), and `projected.get(id) === null`, which is
 *     the longest single line on the strip: "מוחזק — לא נבחר יום פרסום
 *     בתזמון", 31 Hebrew characters in a 11px box.
 *   · A DATE DIVIDER, from a stop on tomorrow's date — formatDateHe() in an
 *     `uppercase tracking-wide` 11px line.
 *   · THE FOOTER'S OWN AGREEMENT, both ways: `counted()` + `agree()` produce
 *     "ועוד פרסום אחד אחריו" for one and "ועוד 2655 פרסומים אחריהם" for the
 *     owner's own planned day, which is the widest the queue gets
 *     (render-stats.tsx uses the same figure for the same reason).
 *   · THE EMPTY STATE, which is its own box and its own two sentences.
 *   · GROUP NAMES of the three shapes that break a row: the longest realistic
 *     Hebrew board name, the Cyrillic one from render-card.tsx inside an RTL
 *     list, and an unspaced Russian compound that cannot wrap at all.
 *
 * The instants are offsets from the render clock, because <Countdown> reads
 * `now` and a pinned past date would put every stop in "באיחור" and reach
 * only one of its four branches.
 *
 * NOTHING HERE TOUCHES THE NETWORK and nothing is published.
 */
import { createElement as h } from 'react';
import { renderSnapshot } from './render-html';
import { Timeline } from '@/components/social/Timeline';
import { Card, SegmentedControl } from '@/components/social/ui';
import type { TimelineRow } from '@/lib/social/client';

const NOW = Date.now();
const inMs = (ms: number) => new Date(NOW + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const HE_GROUP = 'בעלי עסקים וממתבים בבאר שבע והסביבה — קנייה, מכירה והמלצות';
const RU_GROUP = 'Город Арад , глазами жителей';
/* The unspaced compound render-discovery.tsx uses: nowhere to wrap. */
const RU_LONG = 'Предпринимателиизюжногорайона';

/* TimelineRow, exactly — client.ts:1989. `target` is the row's joined group. */
const row = (
  id: string,
  status: TimelineRow['status'],
  at: string,
  name: string,
  extra: Partial<TimelineRow> = {},
): TimelineRow =>
  ({
    id,
    status,
    scheduled_at: at,
    published_at: null,
    updated_at: null,
    skip_reason: null,
    target: { id: `t-${id}`, name, image_url: null, channel: 'group' },
    ...extra,
  }) as unknown as TimelineRow;

/* ── what is still waiting, as campaignStates().upcoming hands it over ── */
const WAITING: TimelineRow[] = [
  /* publishing — the one status that may say it is happening now. */
  row('1', 'publishing', inMs(-30 * 1000), HE_GROUP),
  /* the longest STATUS_LINE in the file. */
  row('2', 'awaiting_confirmation', inMs(-2 * MIN), RU_GROUP),
  row('3', 'manual_pending', inMs(-5 * MIN), RU_LONG),
  row('4', 'needs_attention', inMs(-12 * MIN), HE_GROUP),
  /* scheduled, so <Countdown> draws: a slot just passed, one far out, one
     hours behind, and one held with no instant at all (see PROJECTED). */
  /* 60s past: countdownTo gives due=true, overdue=false (OVERDUE_AFTER_SECONDS
     is 120), which is the only way to reach "אמור לצאת עכשיו". */
  row('5', 'scheduled', inMs(-60 * 1000), HE_GROUP),
  row('6', 'scheduled', inMs(22 * HOUR + 14 * MIN), RU_GROUP),
  row('7', 'scheduled', inMs(-3 * HOUR), HE_GROUP),
  row('8', 'scheduled', inMs(10 * MIN), RU_LONG),
  /* paused — nothing to add under the name, so the hour carries the stop. */
  row('9', 'paused', inMs(40 * MIN), HE_GROUP),
  /* tomorrow, which opens the date divider. */
  row('10', 'scheduled', inMs(26 * HOUR), HE_GROUP),
  row('11', 'scheduled', inMs(26 * HOUR + 10 * MIN), RU_GROUP),
  row('12', 'scheduled', inMs(27 * HOUR), RU_LONG),
];

/* projectQueue()'s answer: an instant, or null for a row held because the
   campaign's schedule is on with no day lit (projection.ts). Row 8 is that
   null — the longest line the strip can print. */
const PROJECTED = new Map<string, string | null>([
  ['5', inMs(-60 * 1000)],
  ['6', inMs(22 * HOUR + 14 * MIN)],
  ['7', inMs(-3 * HOUR)],
  ['8', null],
  ['10', inMs(26 * HOUR)],
  ['11', inMs(26 * HOUR + 10 * MIN)],
  ['12', inMs(27 * HOUR)],
]);

/* ── today's finished rows, as listTimelineDone() hands them over: newest
   first, stamped on updated_at (the component turns them round itself) ── */
const DONE: TimelineRow[] = [
  row('d1', 'skipped', inMs(-40 * MIN), RU_GROUP, {
    updated_at: new Date(NOW - 40 * MIN).toISOString(),
    skip_reason: 'הפוסט הזה כבר פורסם לקבוצה הזו.',
  }),
  row('d2', 'failed', inMs(-70 * MIN), HE_GROUP, { updated_at: new Date(NOW - 70 * MIN).toISOString() }),
  row('d3', 'published', inMs(-95 * MIN), RU_LONG, {
    updated_at: new Date(NOW - 95 * MIN).toISOString(),
    published_at: new Date(NOW - 95 * MIN).toISOString(),
  }),
];

/* The route's own header control — src/app/social/campaigns/[id]/page.tsx:796. */
const tabs = h(SegmentedControl, {
  size: 'sm',
  label: 'תצוגה',
  value: 'timeline',
  onChange: () => undefined,
  options: [
    { value: 'queue', label: 'רשימה' },
    { value: 'timeline', label: 'ציר זמן' },
  ],
} as never);

const label = (text: string) => h('p', { className: 'mb-1 mt-5 text-[11px] text-mist-500' }, text);

const body = renderSnapshot(
  h(
    'div',
    { className: 'space-y-4' },
    /* 1 — the call site, byte for byte. */
    label('the campaign screen, exactly as it builds it: limit 12, a projection, no footer number'),
    h(
      'div',
      { 'data-timeline-case': 'campaign' },
      h(Card, { title: 'תור הפרסום', subtitle: 'מתעדכן לבד כל 5 שניות', action: tabs, children: h(Timeline, { rows: WAITING, limit: 12, projected: PROJECTED }) }),
    ),
    /* 2 — every prop the component documents, which no route passes today. */
    label('the scrollable rail the props doc describes: done rows above waiting ones, an exact total, tappable stops'),
    h(
      'div',
      { 'data-timeline-case': 'rail' },
      h(Card, { title: 'הפרסומים הקרובים', children: h(Timeline, {
          rows: WAITING,
          limit: 12,
          done: DONE,
          total: 2655,
          scrollable: true,
          projected: PROJECTED,
          onOpen: () => undefined,
        }) }),
    ),
    /* 3 — the footer's singular branch: "ועוד פרסום אחד אחריו". */
    label('the footer’s singular agreement — one row beyond the window'),
    h(
      'div',
      { 'data-timeline-case': 'footer-one' },
      h(Card, { title: 'תור הפרסום', children: h(Timeline, { rows: WAITING, limit: 11, total: 12, projected: PROJECTED }) }),
    ),
    /* 4 — nothing planned at all. */
    label('the empty state'),
    h('div', { 'data-timeline-case': 'empty' }, h(Card, { title: 'תור הפרסום', children: h(Timeline, { rows: [] }) })),
  ),
);

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="crm-page mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">${body}</main>
</div>
</body></html>`,
);
