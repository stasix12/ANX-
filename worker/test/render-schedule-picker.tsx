/*
 * THE SCHEDULING PICKER, AS A MEASURABLE PAGE — src/components/social/SchedulePicker.tsx.
 *
 * Written for the Russian layout sweep: of the 59 components the publishing
 * app renders, this one was reachable from no fixture at all, so neither it nor
 * the SchedulePlanPreview inside it had ever been measured in Russian in a
 * browser.
 *
 * THE REAL COMPONENT, not a copy of its markup. SchedulePicker is a client
 * component whose body only uses useRef / useEffect / useMemo, so
 * renderToStaticMarkup renders all of it: the effect that scrolls the selected
 * mode into view never runs (which costs nothing here — the strip is an
 * overflow-x-auto scroller and the probe exempts scrollers), and useMemo is
 * computed inline. Everything on this page is the shipped component with the
 * shipped Tailwind classes; a hand-written copy is exactly what stops failing
 * when the component changes.
 *
 * THE PROPS ARE THE ROUTE'S. src/components/social/PostEditor.tsx:864 is the
 * only place this component is mounted, inside `<Card title="תזמון">` in the
 * left track of `grid gap-5 lg:grid-cols-[1fr_380px]` under SocialShell's
 * `mx-auto max-w-6xl px-4` main. All four boxes are reproduced below, because
 * the width of the box is what decides whether the Russian fits: at 1280px the
 * picker gets 848px, not the whole page.
 *
 *   value           the editor's own initial draft (PostEditor.tsx:158), with
 *                   `mode` switched per case — five modes, five different sets
 *                   of controls, and no single render shows more than one.
 *   targetCount     selectedObjects.length
 *   targetNames     selectedObjects.map(t => t.name)
 *   spacingSeconds  accountGapSeconds(limits, browser, true)
 *   publishWindow   readSchedule(campaign)
 *
 * ─── THE SHAPES CHOSEN, AND WHY ───────────────────────────────────────────
 *
 * Width decides whether a box holds its text, so every figure is the widest
 * this screen can really produce and each is a number the app can hold:
 *
 *   · 292 TARGETS. The owner's own queue, quoted in render-quick-publish-sheet's
 *     notes ("292 groups at 'a minute' is five hours"). It is the four-digit-
 *     adjacent case for "292 יעדים" on the summary line and for the
 *     "ועוד 286 — האחרון ב-…" tail under the six rows, which is the longest
 *     sentence SchedulePlanPreview can print.
 *   · THE SHIPPED SPACING, 45 + 20 MINUTES. limits.minGapMinutes ships at 45
 *     (types.ts:822) and the group surcharge at 20 — the sum this file's own
 *     notes call "the shipped 45+20 spacing" — so accountGapSeconds() is 3900
 *     and accountGapLabel() prints its longest realistic reading in the two
 *     places each summary repeats it. 292 targets at 3900s is also the only way
 *     the plan spans enough days for "אחרון" to carry a dayHint, which is the
 *     tallest the three-up stat row gets.
 *   · AND ONE CASE AT ZERO SPACING, because `simultaneous` is a completely
 *     different sentence — `כל 292 היעדים` in the truncating name column
 *     instead of a group name — and it is only reachable with the gap set to 0
 *     in Settings. finish() computes `simultaneous: !spacingSeconds`, so no
 *     amount of data reaches it otherwise.
 *   · THE LONGEST GROUP NAMES THE QUEUE REALLY HOLDS, in the three shapes that
 *     break a row, and in the first six slots because SchedulePlanPreview draws
 *     `plan.slots.slice(0, 6)`: the longest realistic Hebrew board name,
 *     Cyrillic inside an RTL list, and an unspaced Russian compound with
 *     nowhere to wrap. All three are lifted from the names the existing
 *     fixtures already use, so they are shapes this product really holds.
 *   · EVERY WEEKDAY LIT, with two and three hours on a day. WEEKDAYS_HE is the
 *     FULL day names ('ראשון' … 'שבת'), seven chips plus seven labelled rows,
 *     and the per-day row is the only place the ✕ and "+ שעה" controls exist
 *     at all — they need `times.length > 1`, so a one-hour day draws neither.
 *   · THE PUBLISHING WINDOW ON, Sun–Thu from 08:00 with a ten-minute campaign
 *     gap — the reference's own setting, read through the real readSchedule()
 *     the way PostEditor reads it off a campaign row. With it the planner rolls
 *     292 staggered stamps into five days a week, which is what makes the
 *     "ימים" figure two digits.
 *   · AND THE EMPTY STATE, 0 targets: the one case that prints
 *     'עדיין לא נבחרו יעדים.' instead of the panel.
 *
 * NOT PINNED TO A CLOCK. SchedulePicker calls planFor(value, …, new Date(), …)
 * itself, so the instants move with the day — the same as render-card.tsx,
 * which builds its `nextAt` off Date.now(). Nothing here reads the network,
 * publishes, or writes anything.
 */
import { createElement } from 'react';
import { renderSnapshot } from './render-html';
import { SchedulePicker, type ScheduleDraft } from '@/components/social/SchedulePicker';
import { Card } from '@/components/social/ui';
import { readSchedule } from '@/lib/social/campaign-schedule';
import { accountGapSeconds } from '@/lib/social/rules';
import { zonedDateISO } from '@/lib/social/time';

/** PostEditor.tsx:158, verbatim — the draft the editor opens with. */
const DRAFT: ScheduleDraft = {
  mode: 'now',
  date: '',
  time: '09:00',
  weekly: {},
  intervalDays: 2,
  intervalTime: '09:00',
  dripPerDay: 0,
  dripGapMinutes: 20,
  dripStart: '09:00',
  dripEnd: '20:00',
};

/*
 * accountGapSeconds(limits, browser, true) with the shipped numbers: 45
 * minutes of account floor plus the 20-minute group surcharge = 3900s.
 */
const SPACING = accountGapSeconds({ minGapMinutes: 45, minGapSeconds: 2700 }, { groupMinGapMinutes: 20, groupMinGapSeconds: 1200 }, true);

/*
 * readSchedule() off a campaign row, exactly as PostEditor's `publishWindow`
 * memo does it: the reference's window — Sunday to Thursday, open from 08:00,
 * ten minutes between this campaign's own publications.
 */
const WINDOW = readSchedule({
  schedule_enabled: true,
  schedule_days: [0, 1, 2, 3, 4],
  schedule_start: '08:00',
  schedule_gap_seconds: 600,
});

/*
 * The first six are what SchedulePlanPreview actually draws (slice(0, 6)), so
 * the three shapes that break a row sit at the front. The rest are the queue
 * behind them — real board names, repeated the way a real account's list of
 * 292 southern groups repeats.
 */
const HEAD = [
  'לוח מודעות דרום - באר שבע, אופקים, נתיבות, רהט והסביבה',
  'БеэрШеваОбъявленияКуплюПродамОтдамБесплатноБарахолкаЮгИзраиля',
  'Чистка диванов Беэр-Шева и окрестности — объявления',
  'Беэр-Шева — באר שבע והסביבה',
  'אופקים ביחד — קהילת העסקים והתושבים',
  'ארד — לוח מודעות ומידע לתושבים',
];
const TAIL = ['באר שבע והסביבה ביחד', 'לוח באר שבע — מודעות ועסקים', 'ניקוי ספות — מבצעים באר שבע', 'עסקים בבאר שבע', 'Наша Беэр-Шева 24', 'АРАД НАШ И РЕШАЕМ МЫ'];
const NAMES = [...HEAD, ...Array.from({ length: 292 - HEAD.length }, (_, i) => TAIL[i % TAIL.length])];

/** Every weekday lit, two hours on most and three on Thursday. */
const WEEKLY = {
  '0': ['09:00', '18:00'],
  '1': ['09:00', '18:00'],
  '2': ['09:00', '13:30', '18:00'],
  '3': ['09:00', '18:00'],
  '4': ['08:30', '12:00', '20:30'],
  '5': ['10:00', '17:00'],
  '6': ['20:00', '22:30'],
};

const CASES: { id: string; what: string; draft: ScheduleDraft; count: number; spacing: number }[] = [
  {
    id: 'now',
    what: 'פרסם עכשיו — 292 יעדים, המרווח המשולח',
    draft: { ...DRAFT, mode: 'now' },
    count: 292,
    spacing: SPACING,
  },
  {
    /* The `simultaneous` branch, reachable only with the gap set to 0. */
    id: 'now-simultaneous',
    what: 'פרסם עכשיו — בלי מרווח, כולם באותו רגע',
    draft: { ...DRAFT, mode: 'now' },
    count: 292,
    spacing: 0,
  },
  {
    id: 'once',
    what: 'תאריך ושעה',
    draft: { ...DRAFT, mode: 'once', date: '2026-12-24', time: '20:45' },
    count: 292,
    spacing: SPACING,
  },
  {
    id: 'weekly',
    what: 'ימים קבועים — כל שבעת הימים דולקים',
    draft: { ...DRAFT, mode: 'weekly', weekly: WEEKLY },
    count: 292,
    spacing: SPACING,
  },
  {
    /*
     * TODAY, not a fixed date. planFor()'s weekly/interval branch only looks
     * two weeks ahead (`until = now + 14 days`), so a start date further out
     * than that prints 'לא נמצאו מועדים בשבועיים הקרובים' and the whole
     * preview — the three-up stats, the six rows, the tail — never renders.
     * Three days apart puts five occasions inside the horizon.
     */
    id: 'interval',
    what: 'כל X ימים',
    draft: { ...DRAFT, mode: 'interval', date: zonedDateISO(new Date()), intervalDays: 3, intervalTime: '20:45' },
    count: 292,
    spacing: SPACING,
  },
  {
    id: 'drip',
    what: 'הפצה הדרגתית — חלון שעות וקצב יומי',
    draft: { ...DRAFT, mode: 'drip', date: '2026-12-24', dripGapMinutes: 90, dripPerDay: 120, dripStart: '08:30', dripEnd: '22:30' },
    count: 292,
    spacing: SPACING,
  },
  {
    /* 'עדיין לא נבחרו יעדים.' — the one case with no plan at all. */
    id: 'empty',
    what: 'בלי יעדים',
    draft: { ...DRAFT, mode: 'now' },
    count: 0,
    spacing: SPACING,
  },
];

const body = CASES.map((c) =>
  createElement(
    'div',
    { key: c.id, 'data-picker-case': c.id, className: 'mb-5' },
    createElement('p', { style: { color: '#9aa', font: '12px sans-serif', margin: '14px 0 4px' } }, c.what),
    createElement(Card, {
      title: 'תזמון',
      children: createElement(SchedulePicker, {
        value: c.draft,
        onChange: () => undefined,
        targetCount: c.count,
        targetNames: NAMES.slice(0, c.count),
        spacingSeconds: c.spacing,
        publishWindow: WINDOW,
      }),
    }),
  ),
);

/*
 * SocialShell's main plus PostEditor's own two-track grid, so the left column
 * is 848px at a desk and the whole width on a phone — which is the geometry
 * that decides this.
 */
process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">
    <div class="grid gap-5 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
      <div class="min-w-0 space-y-5">${renderSnapshot(createElement('div', null, body))}</div>
    </div>
  </main>
</div>
</body></html>`,
);
