/*
 * THE ACTIVITY LOG, AS A MEASURABLE PAGE — src/components/social/ActivityFeed.tsx.
 *
 * Nothing in this product has ever measured this component in a browser, and
 * it is the one surface whose sentences exist in NO file: the worker composes
 * them at run time out of a group's name, a count, a quota and a stamp
 * (`logActivity('warn','retry', \`ניסיון ${n} לפרסום נכשל. ${err.message} …\`)`
 * — worker.ts:500), so what the DOM translator has to fit into a 320px card is
 * a string that was assembled minutes earlier on somebody's PC.
 *
 * The REAL component, through renderToStaticMarkup, inside the REAL <Card> and
 * the REAL shell container — nothing here is a hand-written copy of its
 * markup, because a copy stops failing the day the card changes.
 *
 * ─── THE TWO CALL SITES, BOTH OF THEM ─────────────────────────────────────
 *
 * Built exactly as the two routes build it, field for field:
 *
 *   · the dashboard — src/app/social/page.tsx:2247
 *       <Card title="פעילות אחרונה" action={<Link>הצג הכל</Link>}>
 *         <ActivityFeed entries={data.log} limit={5} onChanged={load}
 *                       onOpen={(id) => setDetail(id)} />
 *     Five rows, no technical disclosure. This is the narrow one: the Card's
 *     header sits above it and the feed gets the full column.
 *
 *   · the activity screen — src/app/social/activity/page.tsx:168
 *       <ActivityFeed entries={visible} limit={visible.length} onChanged={load}
 *                     onOpen={…} emptyText="אין פעילות בסינון הזה." technical />
 *     `technical` adds a THIRD action to the row's action line ("פרטים מלאים"),
 *     which is the widest that line ever gets: "נסה שוב" + "פתח את הקבוצה" +
 *     "פרטים מלאים" on one wrapping flex row at `ps-[46px]`.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ───────────────────────────────────────────
 *
 * Width decides whether a box holds its text, so every row here is the widest
 * the log can really produce. Each is a real writer's real format string:
 *
 *   1  THE OWNER'S OWN FAILURE, verbatim — the sentence quoted at the top of
 *      src/lib/social/activity-text.ts as the line he read on his dashboard,
 *      with the group name, the attempt number, the quoted Facebook control
 *      ("כתבו משהו…"), the selectors file and the retry stamp. plainMessage()
 *      strips the file name and cuts at the first full stop, so the card gets
 *      the first clause and the rest stays behind "פרטים מלאים". It is the
 *      longest `detail` this component can draw, and it lights all three
 *      actions at once (canRetry + targetUrl + hasTechnicalDetail).
 *   2  THE SAME FAILURE WITH A CYRILLIC GROUP, because `t.subject` is a
 *      user-supplied name on its own `dir="auto" text-right` line and these
 *      names are Russian and Hebrew in one list (the case CampaignCard's
 *      fixture names: "Город Арад , глазами жителей").
 *   3  worker_run — `ריגה (מתוזמנת): N פורסמו, N ידניים, N דולגו, N נכשלו`
 *      (worker.ts:251) with the owner's own planned day in it: 124/3/121/15.
 *      Four counts in one comma-separated line is the composed sentence the
 *      translator has the least to hold on to.
 *   4  stuck_rows_released — a count, a quoted screen name and the longest
 *      single clause of the lot (worker.ts:339).
 *   5  deferred — the account gap reason from rules.ts:896 through the real
 *      accountGapLabel() shape ("10 דק׳").
 *   6  skipped — the per-target daily quota reason (rules.ts:691), the longest
 *      of the eighteen skip reasons, with the group name INSIDE the sentence
 *      as well as in meta.target.
 *   7  rate_limit — graph.ts:151, a reason plus a resume stamp.
 *   8  worker_started with meta.version, the one row whose detail is NOT the
 *      message: activityText() promotes "גרסה 3.39.0" out of meta.
 *   9  published — `פורסם ל-"<name>" (גרסה <label>)` (worker.ts:470) on the
 *      longest realistic Hebrew group name, which is also the one row drawn
 *      with the filled green check tile rather than an outlined mark.
 *  10  manual_pending — `"<name>": <instructions>` (worker.ts:453).
 *  11  an event with no TITLE entry, so BY_LEVEL carries it ("תקלה"), holding
 *      a message with no Hebrew at all — the TECHNICAL fallback branch.
 *  12  needs_attention, the warn tone, with the four-digit queue the owner's
 *      own reset produces.
 *
 * THE AGE PILL IS PART OF THE WIDTH. It is `shrink-0 whitespace-nowrap` and
 * shares one line with the sentence, so every pixel it takes is a pixel the
 * sentence loses — the file's own header says so and measures it at 390px. The
 * rows are therefore stamped across all six branches of agePill(): "עכשיו",
 * "לפני דקה", "לפני 47 דק׳", "לפני שעה", "לפני 23 שע׳", and past 48 hours the
 * hand-back to relativeHe ("לפני 3 ימים"). Offsets from the render clock, so
 * each branch is reached on every run.
 *
 * WHAT DOES NOT RENDER: the per-row technical panel. It is behind
 * `openRow === e.id`, a useState that renderToStaticMarkup leaves at null, so
 * the <pre> of raw JSON and the verbatim message are not on this page. The
 * BUTTON that opens it is, and it is the button that competes for the row's
 * width. Noted rather than worked around — nothing may edit the component.
 *
 * NOTHING HERE TOUCHES THE NETWORK and nothing is published: onChanged/onOpen
 * are inert arrows, which is all the component needs to decide whether to draw
 * a control.
 */
import { createElement } from 'react';
import { renderSnapshot } from './render-html';
import { ActivityFeed } from '@/components/social/ActivityFeed';
import { Card } from '@/components/social/ui';
import type { ActivityEntry } from '@/lib/social/types';

/* Offsets from the render clock, one per branch of agePill(). */
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

/* The longest realistic names in this product's own data: a Hebrew board name
   of the shape render-card.tsx uses, the Cyrillic one from the same fixture,
   and an unspaced Russian compound that cannot wrap at all. */
const HE_GROUP = 'בעלי עסקים וממתבים בבאר שבע והסביבה — קנייה, מכירה והמלצות';
const RU_GROUP = 'Город Арад , глазами жителей';

const ROWS: ActivityEntry[] = [
  /* 1 — the owner's own line, verbatim from activity-text.ts's header. */
  {
    id: 1,
    at: ago(40 * 1000),
    level: 'error',
    event: 'publish_failed',
    message:
      'ניסיון 2 לפרסום נכשל. לא מצאתי את תיבת "כתבו משהו…" בקבוצה. ייתכן שאין הרשאת פרסום או ש-Facebook שינתה את הממשק (facebook/selectors.ts). המערכת תנסה שוב ב-27.09.2026, 18:51.',
    meta: {
      queueId: 'q-1',
      target: HE_GROUP,
      targetUrl: 'https://www.facebook.com/groups/1234567890',
      attempts: 2,
    },
  },
  /* 2 — the same failure about a Cyrillic group. */
  {
    id: 2,
    at: ago(MIN),
    level: 'error',
    event: 'publish_failed',
    message:
      'ניסיון 3 לפרסום נכשל. הקבוצה דרשה אישור מנהל לפני פרסום ולכן הפוסט לא נשלח. המערכת תנסה שוב ב-16.11.2026, 09:40.',
    meta: {
      queueId: 'q-2',
      target: RU_GROUP,
      targetUrl: 'https://www.facebook.com/groups/2234567890',
      attempts: 3,
    },
  },
  /* 3 — the run report, four counts composed into one line (worker.ts:251). */
  {
    id: 3,
    at: ago(47 * MIN),
    level: 'info',
    event: 'worker_run',
    message: 'ריצה (מתוזמנת): 124 פורסמו, 3 ידניים, 121 דולגו, 15 נכשלו',
    meta: { published: 124, manual: 3, skipped: 121, failed: 15 },
  },
  /* 4 — the longest single clause the worker writes (worker.ts:339). */
  {
    id: 4,
    at: ago(HOUR),
    level: 'warn',
    event: 'stuck_rows_released',
    message: '108 פרסומים נתקעו אצל worker שאינו מדווח והועברו ל"דורשים אתכם"',
    meta: { freed: 108 },
  },
  /* 5 — the account-wide gap (rules.ts:896, through accountGapLabel). */
  {
    id: 5,
    at: ago(2 * HOUR),
    level: 'info',
    event: 'deferred',
    message: 'נדחה כדי לשמור מרווח של 10 דק׳ בין פרסומים',
    meta: { queueId: 'q-5', until: new Date(NOW + 10 * MIN).toISOString() },
  },
  /* 6 — the per-target daily quota (rules.ts:691). */
  {
    id: 6,
    at: ago(3 * HOUR),
    level: 'warn',
    event: 'skipped',
    message: `"${HE_GROUP}" קיבלה היום את המכסה שלה (3) — הפרסום ימתין למחר`,
    meta: { queueId: 'q-6', target: HE_GROUP },
  },
  /* 7 — Meta asking for a slower pace (graph.ts:151). Not a failure. */
  {
    id: 7,
    at: ago(5 * HOUR),
    level: 'warn',
    event: 'rate_limit',
    message: 'פייסבוק ביקשה להאט את קצב הפרסום — הפרסום מושהה ויתחדש ב-16.11.2026, 11:20.',
    meta: { minutes: 180, until: new Date(NOW + 180 * MIN).toISOString() },
  },
  /* 8 — the one row whose detail comes out of meta, not out of message. */
  {
    id: 8,
    at: ago(23 * HOUR),
    level: 'info',
    event: 'worker_started',
    message: 'ה-worker "worker@stas-pc" עלה (stas-pc)',
    meta: { version: '3.39.0', host: 'stas-pc' },
  },
  /* 9 — the filled green check tile, on the longest name (worker.ts:470). */
  {
    id: 9,
    at: ago(25 * HOUR),
    level: 'info',
    event: 'published',
    message: `פורסם ל-"${HE_GROUP}" (גרסה ב׳)`,
    meta: { queueId: 'q-9', target: HE_GROUP, permalink: 'https://www.facebook.com/groups/1234567890/posts/999' },
  },
  /*
   * 10 — a publication handed back to a person.
   *
   * THE MESSAGE THIS ROW USED TO CARRY WAS WRITTEN HERE AND NOWHERE ELSE:
   * "פתחו את הקבוצה, הדביקו את הטקסט מהפוסט ולחצו פרסום — ואז סמנו כאן
   * שפורסם." appears in no file of this product — `grep -rn` over src,
   * worker, desktop and the renderer finds only this line. A fixture that
   * invents a sentence measures a screen the app never shows: the Russian
   * suites then report an untranslated line that cannot be fixed, because
   * there is nothing to add an entry for. So the message is the app's own
   * words for this state — src/components/social/Timeline.tsx:109 and
   * PublicationItem.tsx:170 both print exactly this — and the group it
   * belongs to arrives through meta.target, which is where this row's group
   * really comes from.
   */
  {
    id: 10,
    at: ago(30 * HOUR),
    level: 'warn',
    event: 'manual_pending',
    message: 'ממתין לפרסום ידני',
    meta: { queueId: 'q-10', target: RU_GROUP },
  },
  /* 11 — no TITLE entry and no Hebrew in the message: BY_LEVEL plus the
     TECHNICAL fallback line. */
  {
    id: 11,
    at: ago(40 * HOUR),
    level: 'error',
    event: 'browser_start_failed',
    message: 'Error: Failed to launch the browser process! spawn /opt/chromium ENOENT',
    meta: { code: 'ENOENT' },
  },
  /* 12 — the warn mark, with the four-digit queue his own reset produces. */
  {
    id: 12,
    at: ago(3 * 24 * HOUR),
    level: 'warn',
    event: 'needs_attention',
    message: '4148 פרסומים ממתינים להחלטה שלכם לפני שהסבב יכול להמשיך.',
    meta: { queueId: 'q-12', target: HE_GROUP, targetUrl: 'https://www.facebook.com/groups/3234567890' },
  },
];

const noop = () => undefined;

/* The dashboard's card, built as src/app/social/page.tsx:2242 builds it. The
   "הצג הכל" action is a plain <a> here rather than next/link, which renders
   the same <a className="inline-flex min-h-11 …"> and keeps the fixture out of
   the app router. */
const dashboard = createElement(Card, { title: 'פעילות אחרונה',
    action: createElement(
      'a',
      {
        href: '/social/activity',
        className:
          'inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-bold text-brand-400',
      },
      'הצג הכל',
    ), children: createElement(ActivityFeed, { entries: ROWS, limit: 5, onChanged: noop, onOpen: noop }) });

/* The activity screen's card, built as src/app/social/activity/page.tsx:152
   builds it — including the window subtitle, which is composed from two
   counts and is itself a sentence that exists in no file. */
const screen = createElement(Card, { title: 'פעילות',
    subtitle: `${ROWS.length} מוצגות מתוך ${ROWS.length} שנטענו`, children: createElement(ActivityFeed, {
    entries: ROWS,
    limit: ROWS.length,
    onChanged: noop,
    onOpen: noop,
    emptyText: 'אין פעילות בסינון הזה.',
    technical: true,
  }) });

/* The empty branch, which is its own sentence and its own box. */
const empty = createElement(Card, { title: 'פעילות', children: createElement(ActivityFeed, { entries: [], emptyText: 'אין פעילות בסינון הזה.' }) });

const body = renderSnapshot(
  createElement(
    'div',
    { className: 'space-y-4' },
    createElement('div', { 'data-feed-case': 'dashboard' }, dashboard),
    createElement('div', { 'data-feed-case': 'activity-screen' }, screen),
    createElement('div', { 'data-feed-case': 'empty' }, empty),
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
