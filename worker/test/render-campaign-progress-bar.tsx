/*
 * THE FIXTURE src/components/social/CampaignProgressBar.tsx GETS MEASURED IN.
 *
 * The real component with the real compiled Tailwind, for the same reason
 * render-stats.tsx exists: a hand-written copy of this markup would stop
 * failing the moment the component changes, which is the whole reason this
 * repo renders the real thing. Nothing here touches the network or a clock.
 *
 * HOW THE PROPS ARE BUILT. src/app/social/campaigns/[id]/page.tsx:555 is the
 * only route that renders it:
 *
 *     <div className="mt-4">{state && <CampaignProgressBar progress={state.progress} />}</div>
 *
 * — one prop, a CampaignProgress (src/lib/social/types.ts:433), inside a Card
 * on the run screen. So each case below is a progress object with the fields
 * that type really has (total/published/failed/skipped/scheduled/running/
 * manual/finished) and nothing invented. The caption above the bar comes from
 * runProgress() in src/lib/social/campaign.ts, which the component calls
 * itself — it is not built here.
 *
 * ─── WHY THESE NUMBERS ───────────────────────────────────────────────────
 *
 * The legend is six counted labels on one wrapping row at `text-[11px]`, and
 * in Russian a counted noun has THREE forms picked off the last digits of the
 * number in front of it. The component's own LegendItem switches on
 * `count === 1` for the Hebrew, so the Russian it hands the translator differs
 * between 1 and everything else — and the forms differ in width. So the cases
 * walk the counts the forms actually turn on: 1, 2, 5, 21 and a four-digit
 * figure, with each of the six labels taking its turn at 1.
 *
 *   1  ONE OF EVERYTHING. total 6, every bucket at exactly 1 — the only state
 *      in which all six labels print their SINGULAR ("1 פורסם", "1 דולג",
 *      "1 דורש פעולה"), and the only state that draws all six at once with the
 *      conditional two ("רץ", "דורש פעולה") lit.
 *   2  TWO AND FIVE AND TWENTY-ONE TOGETHER. published 21, scheduled 5,
 *      skipped 2, failed 21 — the three Russian plural forms side by side on
 *      one line, in the widest combination the six labels can hold.
 *   3  FOUR DIGITS, with the running and manual buckets lit. 2655 is the
 *      owner's own planned day (the figure render-stats.tsx uses for the same
 *      reason), 1027 the lifetime publication count src/app/social/page.tsx
 *      names by hand. This is the widest the legend row ever gets: six labels,
 *      four digits on four of them.
 *   4  A RUN THAT ONLY FAILED. total 29, failed 29 — the state the component's
 *      own docstring was written for ("a run of 29 rows that all failed drew a
 *      bar filled to its full width with 0% printed beside it"), so the bar is
 *      one full-width red segment and three of the four always-on labels read
 *      zero. Zero takes the THIRD Russian form, which no other case here has
 *      on those labels.
 *   5  THE COMPONENT'S OWN REFERENCE STATE, and the ONLY one that reaches
 *      agree()'s singular in the caption. Its docstring names the shape by
 *      hand: "1 מתוך 29 טופלו" above the bar, "0 פורסמו · 28 ממתינים · 1 דולג
 *      · 0 נכשלו" below it. finished is 1, so the caption is in fact
 *      "1 מתוך 29 טופל" — a DIFFERENT Hebrew sentence from the "...טופלו" of
 *      every case above, and the commonest value this caption takes.
 *   6  NOTHING CREATED YET. total 0, which is the component's early return —
 *      a single sentence and no bar at all.
 */
import { createElement } from 'react';
import { renderSnapshot } from './render-html';
import { CampaignProgressBar } from '@/components/social/CampaignProgressBar';
import { EMPTY_PROGRESS, type CampaignProgress } from '@/lib/social/types';

/** A progress object with `finished` kept honest: published + failed + skipped. */
const prog = (o: Partial<CampaignProgress>): CampaignProgress => {
  const p = { ...EMPTY_PROGRESS, ...o };
  return { ...p, finished: p.published + p.failed + p.skipped };
};

const CASES: { id: string; what: string; progress: CampaignProgress }[] = [
  {
    id: 'one-of-each',
    what: 'one of everything — every label at its singular, all six lit, "1 מתוך 6 טופל"',
    progress: prog({ total: 6, published: 1, scheduled: 1, skipped: 1, failed: 1, running: 1, manual: 1 }),
  },
  {
    id: 'two-five-twentyone',
    what: '21 published · 5 waiting · 2 skipped · 21 failed — the three Russian plural forms on one line',
    progress: prog({ total: 49, published: 21, scheduled: 5, skipped: 2, failed: 21 }),
  },
  {
    id: 'four-digit',
    what: 'four digits on four labels, with "רצים" and "דורשים פעולה" lit — the widest the legend gets',
    progress: prog({ total: 4812, published: 1027, scheduled: 2655, skipped: 1024, failed: 1006, running: 4, manual: 100 }),
  },
  {
    id: 'all-failed',
    what: 'a run of 29 rows that all failed — the bar full red, three always-on labels at zero',
    progress: prog({ total: 29, failed: 29 }),
  },
  {
    id: 'reference-one-handled',
    what: "the component's own reference run: 1 of 29 handled — the caption's singular \"טופל\"",
    progress: prog({ total: 29, published: 0, scheduled: 28, skipped: 1, failed: 0 }),
  },
  {
    id: 'empty',
    what: 'nothing created yet — the early return, one sentence and no bar',
    progress: prog({ total: 0 }),
  },
];

/*
 * Each case inside the box the run screen gives it: a Card's `p-4` content
 * column. The component itself sets no width, so the box around it is the
 * measurement, and `max-w-6xl … px-4` is SocialShell.tsx:1280 verbatim.
 */
const body = CASES.map(
  (c) => `
  <p data-no-translate style="color:#9aa;font:12px sans-serif;margin:18px 0 6px" data-case="${c.id}">${c.what}</p>
  <section class="surface rounded-card border border-ink-700 p-4">${renderSnapshot(
    createElement('div', { className: 'mt-4' }, createElement(CampaignProgressBar, { progress: c.progress })),
  )}</section>`,
).join('');

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
