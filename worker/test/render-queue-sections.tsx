/*
 * THE FIXTURE src/components/social/QueueSections.tsx GETS MEASURED IN.
 *
 * The real component with the real compiled Tailwind, for the same reason
 * render-card.tsx exists: a hand-written copy of this list would stop failing
 * the moment the component changes. QueueSections' body is a useMemo over its
 * rows and four <Group> sections of real <PublicationItem>s — both render
 * fine under renderToStaticMarkup (useMemo is pure, and PublicationItem holds
 * only useState/useEffect, so the effects never run and the initial values
 * stand). The three <Sheet>s each PublicationItem carries render as their
 * closed themeAnchor span, exactly as they do on first paint in the app.
 *
 * Nothing here touches the network, Facebook, or a database.
 *
 * HOW THE PROPS ARE BUILT. Two hosts render it:
 *
 *   src/app/social/campaigns/[id]/page.tsx:820
 *     <QueueSections rows={rows} actions={queueActions} projected={projected} />
 *   src/components/social/LiveBoard.tsx:184
 *     <QueueSections rows={rows} actions={actions} busyRowId={rowBusy}
 *                    projected={projected}
 *                    emptyAction={<ButtonLink href="/social/posts/new">צרו פוסט ראשון</ButtonLink>} />
 *
 * so: a QueueRow[] off QUEUE_SELECT, a PublicationActions bag, `busyRowId`,
 * and `projected` — the Map<rowId, instant|null> projectQueue() returns. Both
 * hosts leave doneLimit (10) and nextLimit (12) at their defaults, which is
 * what decides where "ועוד N" appears. Field names are QueueItem's
 * (src/lib/social/types.ts:302) and the statuses come from the real buckets in
 * src/lib/social/status.ts. Nothing invented.
 *
 * Every action is passed, because a control nobody hands a handler to is not
 * drawn at all and a measurement that never sees it cannot find it too small:
 * onConfirm is what turns a waiting row's StatusPill into the "אשר" button,
 * and onRetry/onCancel/onStopTarget/onLeaveGroup fill the overflow menu.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ──────────────────────────────────────────
 *
 * Width is what decides whether a box holds its text, and a queue row is the
 * tightest box in this product: a 38px avatar, a `truncate` name over a
 * `truncate` status line, a status pill with `whitespace-nowrap`, and a 44px
 * overflow menu, all inside 320px. So:
 *
 *   · THE FOUR SECTION HEADINGS ALL AT ONCE. "דורשים אתכם", "מפרסם עכשיו",
 *     "הבאים בתור" and "הסתיימו" each render only when their bucket has rows,
 *     so one case carries all four — a heading is `text-[11px] uppercase
 *     tracking-wide` with a count in parentheses after it, and Russian's
 *     "Требуют вашего участия" is the longest of them.
 *   · FOUR-DIGIT COUNTS AND THE "ועוד N" TAILS. 1252 waiting and 1250
 *     finished, so both capped groups print `(1252)` / `(1250)` in the heading
 *     and "ועוד 1240" under the list. A repeating round reaches four digits in
 *     both buckets — the dashboard's own note names 1,027 lifetime
 *     publications on one round — and 1240 is the per-group figure
 *     render-queue-tuner-sheet.tsx uses for the same reason.
 *   · THE COUNTED NOUN AT EVERY FORM IT TURNS ON. Russian picks a noun's form
 *     off the last digits of the number before it, so the dedupe skip reason
 *     (rules.ts:819, `אותו תוכן כבר פורסם ליעד הזה ב-${dedupeDays} הימים
 *     האחרונים.`) is rendered at 1, 2, 5, 21 and 30 days, and the repeat
 *     variant (rules.ts:817, `...בעוד כ-${minHours} שעות.`) at 20 hours — the
 *     value render-card.tsx uses for the same setting.
 *   · THE LONGEST STATUS LINE IN EACH BUCKET. The held row ("מוחזק — לא נבחר
 *     יום פרסום בתזמון", which only `projected.get(id) === null` can produce),
 *     "מוכן — ממתין לאישור שלכם", "דורש טיפול שלכם · HH:MM", "ממתין לפרסום
 *     ידני", and the two live steps with their elapsed tails — "נשלח — בדקו
 *     בקבוצה · N שניות" is the longest thing this list ever puts on one line.
 *     The live group is the one with `pulse`, which is what makes
 *     PublicationItem tick, so those tails only exist there.
 *   · GROUP NAMES OF THE THREE SHAPES THAT BREAK A ROW: the longest realistic
 *     Hebrew board name, the same in Cyrillic inside an RTL list, and one
 *     unspaced Russian compound that has nowhere to wrap — the three
 *     render-queue-tuner-sheet.tsx and render-discovery.tsx already use. Names
 *     are DATA and are never translated, so they are the constant against
 *     which the Russian around them is measured.
 *   · A ROW MID-WRITE. `busyRowId` is set on the confirm row, so the one
 *     control in this flow that releases a publication to a real group is
 *     measured in its spinner state too.
 *   · AND THE EMPTY STATE, with LiveBoard's own title, description and
 *     button — the whole other branch of the component, and the widest
 *     paragraph it draws.
 */
import { createElement } from 'react';
import { renderSnapshot } from './render-html';
import { QueueSections } from '@/components/social/QueueSections';
import { ButtonLink } from '@/components/social/ui';
import type { QueueRow } from '@/lib/social/client';
import type { QueueStatus, QueueStep } from '@/lib/social/types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

/** The three name shapes that break a row, plus a short one for contrast. */
const NAMES = [
  'קבוצת תושבי שכונת נווה זאב ורמות באר שבע — קניה, מכירה, המלצות ועסקים מקומיים',
  'Беэр-Шева объявления, барахолка и советы жителей',
  'БеэрШеваОбъявленияКуплюПродамОтдамБесплатноБарахолкаЮгИзраиля',
  'דרושים דרום',
];

type RowSpec = {
  id: string;
  status: QueueStatus;
  name?: string;
  at?: number;
  done?: number;
  skip?: string;
  error?: string;
  step?: QueueStep;
  stepAgo?: number;
  url?: string;
  permalink?: string;
};

const row = (s: RowSpec, i = 0): QueueRow =>
  ({
    id: s.id,
    schedule_id: 'sch1',
    post_id: 'p1',
    variant_id: null,
    target_id: `t${s.id}`,
    scheduled_at: iso(s.at ?? now + HOUR),
    /* QueueRow carries created_at, and the planner writes it when it plans the
       row — so a fixture without it is not a QueueRow. */
    created_at: iso((s.at ?? now + HOUR) - 24 * HOUR),
    status: s.status,
    attempts: s.status === 'failed' ? 3 : 1,
    dedupe_hash: 'h',
    rendered_text: '',
    external_post_id: null,
    permalink: s.permalink ?? null,
    error: s.error ?? null,
    skip_reason: s.skip ?? null,
    claimed_at: null,
    published_at: s.status === 'published' ? iso(s.done ?? now - HOUR) : null,
    updated_at: s.done !== undefined ? iso(s.done) : null,
    step: s.step ?? '',
    step_at: s.stepAgo === undefined ? null : iso(now - s.stepAgo),
    require_confirmation: s.status === 'awaiting_confirmation',
    campaign_id: 'c1',
    method: 'browser',
    target: {
      id: `t${s.id}`,
      name: s.name ?? NAMES[i % NAMES.length],
      channel: 'facebook_group',
      url: s.url ?? 'https://www.facebook.com/groups/123',
      /* QueueRow's target has no picture when Facebook gave none, and the type
         spells that as absent rather than null. */
      image_url: undefined,
    },
    post: { id: 'p1', title: 'מחירון נובמבר — ניקוי ספות וריפודים', media: [], link_url: '' },
    variant: null,
  }) as QueueRow;

/* ── the rows the queue is actually made of ─────────────────────────────── */

/** Waiting on a person — NEEDS_HUMAN_STATUSES, pulled to the top. */
const attention: RowSpec[] = [
  { id: 'a1', status: 'awaiting_confirmation', name: NAMES[0] },
  /* The same control mid-write, which is the state `busyRowId` exists for. */
  { id: 'a2', status: 'awaiting_confirmation', name: NAMES[1] },
  { id: 'a3', status: 'manual_pending', name: NAMES[2] },
  { id: 'a4', status: 'needs_attention', name: NAMES[0], done: now - 38 * MIN, error: 'לא מצאתי את תיבת "כתבו משהו…" בקבוצה.' },
];

/** In flight — the one group with `pulse`, so the elapsed tails exist here. */
const inFlight: RowSpec[] = [
  { id: 'n1', status: 'publishing', name: NAMES[0], step: 'submitted', stepAgo: 42_000 },
  { id: 'n2', status: 'publishing', name: NAMES[1], step: 'uploading_media', stepAgo: 2 * MIN },
];

/**
 * Waiting on the clock. The first four are the shapes that differ; the rest
 * are filler so the group runs past nextLimit (12) and prints its "ועוד N"
 * with four digits, the way a repeating round's queue really does.
 */
const nextShapes: RowSpec[] = [
  /* `projected` holds null for this one — the only thing that can produce
     "מוחזק — לא נבחר יום פרסום בתזמון". */
  { id: 'q-held', status: 'scheduled', name: NAMES[0], at: now + 3 * HOUR },
  { id: 'q-today', status: 'scheduled', name: NAMES[1], at: now + 3 * HOUR },
  { id: 'q-otherday', status: 'scheduled', name: NAMES[2], at: now + 50 * HOUR },
  { id: 'q-paused', status: 'paused', name: NAMES[0], at: now + 5 * HOUR },
];
const next: RowSpec[] = [
  ...nextShapes,
  /*
   * Stamped AFTER the four shapes above, deliberately. The component sorts the
   * group by the instant each row will really go out, and `next.slice(0, 12)`
   * is what gets drawn — so filler stamped earlier than the shapes would push
   * every distinctive status line off the measured list and leave twelve
   * identical rows. A 1252-deep queue at a ten-minute gap really does run
   * days out, so this is the shape of one.
   */
  ...Array.from({ length: 1248 }, (_, i) => ({
    id: `q${i}`,
    status: 'scheduled' as QueueStatus,
    at: now + 52 * HOUR + i * 10 * MIN,
  })),
];

/**
 * Finished — TERMINAL_STATUSES, so published, failed and skipped together.
 * The skip reasons are rules.ts's own two sentences at every count the Russian
 * plural turns on, plus the three bare cancellation reasons client.ts writes.
 */
const doneShapes: RowSpec[] = [
  { id: 'd1', status: 'published', name: NAMES[0], done: now - 20 * MIN, permalink: 'https://www.facebook.com/groups/123/posts/4567/' },
  { id: 'd2', status: 'failed', name: NAMES[1], done: now - 35 * MIN, error: 'הקבוצה דורשת אישור מנהל לכל פוסט חדש.' },
  { id: 'd3', status: 'skipped', name: NAMES[2], done: now - 40 * MIN, skip: 'אותו תוכן כבר פורסם ליעד הזה ב-21 הימים האחרונים.' },
  { id: 'd4', status: 'skipped', name: NAMES[0], done: now - 45 * MIN, skip: 'אותו תוכן כבר פורסם ליעד הזה ב-30 הימים האחרונים.' },
  { id: 'd5', status: 'skipped', name: NAMES[1], done: now - 50 * MIN, skip: 'אותו תוכן כבר פורסם ליעד הזה ב-5 הימים האחרונים.' },
  { id: 'd6', status: 'skipped', name: NAMES[2], done: now - 55 * MIN, skip: 'אותו תוכן כבר פורסם ליעד הזה ב-2 הימים האחרונים.' },
  { id: 'd7', status: 'skipped', name: NAMES[0], done: now - 60 * MIN, skip: 'אותו תוכן כבר פורסם ליעד הזה ב-1 הימים האחרונים.' },
  { id: 'd8', status: 'skipped', name: NAMES[1], done: now - 65 * MIN, skip: 'אותו תוכן כבר פורסם ליעד הזה לאחרונה — החזרה הבאה בעוד כ-20 שעות.' },
  { id: 'd9', status: 'skipped', name: NAMES[2], done: now - 70 * MIN, skip: 'בוטל — עצירת כל התורים' },
  { id: 'd10', status: 'skipped', name: NAMES[0], done: now - 75 * MIN, skip: 'הקבוצה הושהתה' },
];
const done: RowSpec[] = [
  ...doneShapes,
  ...Array.from({ length: 1240 }, (_, i) => ({
    id: `d-f${i}`,
    status: 'published' as QueueStatus,
    done: now - (80 + i) * MIN,
  })),
];

const specs: RowSpec[] = [...attention, ...inFlight, ...next, ...done];
const rows: QueueRow[] = specs.map((s, i) => row(s, i));

/*
 * projectQueue()'s answer. `null` on exactly one row — the campaign's schedule
 * is on and no day is lit, which is the state its own header says the caller
 * may not print a stored instant over — and a real instant on the rest,
 * 95 minutes later than the stamp, which is what a window and a gap do to a
 * row and is why PublicationItem takes this prop at all.
 */
const projected = new Map<string, string | null>([
  ['q-held', null],
  ...next.filter((s) => s.id !== 'q-held').map((s) => [s.id, iso((s.at ?? now + HOUR) + 95 * MIN)] as [string, string]),
]);

const noop = () => undefined;
const actions = {
  onRetry: noop,
  onCancel: noop,
  onConfirm: noop,
  onRunNow: noop,
  onScreenshot: noop,
  onStopTarget: noop,
  onLeaveGroup: noop,
};

const CASES: { id: string; what: string; node: React.ReactNode }[] = [
  {
    id: 'full-queue',
    what: 'all four sections at once — 1252 waiting, 1250 finished, both "ועוד 1240" tails, every status shape',
    node: createElement(QueueSections, { rows, actions, busyRowId: 'a2', projected } as never),
  },
  {
    id: 'empty',
    what: "LiveBoard's empty state — its own title, description and button",
    node: createElement(QueueSections, {
      rows: [],
      actions,
      projected: new Map(),
      emptyAction: createElement(ButtonLink, { href: '/social/posts/new' }, 'צרו פוסט ראשון'),
    } as never),
  },
];

const body = CASES.map(
  (c) => `
  <p data-no-translate style="color:#9aa;font:12px sans-serif;margin:18px 0 6px" data-case="${c.id}">${c.what}</p>
  <section class="surface rounded-card border border-ink-700 p-4">${renderSnapshot(c.node)}</section>`,
).join('');

/* SocialShell.tsx:1280 verbatim — the box the queue card really sits in. */
process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">${body}</main>
</div>
</body></html>`,
);
