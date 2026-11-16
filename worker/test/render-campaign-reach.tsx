/*
 * THE FIXTURE src/components/social/CampaignReach.tsx GETS MEASURED IN.
 *
 * The real component with the real compiled Tailwind, for the same reason
 * render-card.tsx and render-stats.tsx exist: anything hand-written here would
 * measure a copy, and a copy is what stops failing the moment the component
 * changes. Nothing in this file touches the network, a clock or a database.
 *
 * HOW THE PROPS ARE BUILT. src/app/social/campaigns/[id]/page.tsx:833 is the
 * one route that renders it:
 *
 *     {rows && <CampaignReach rows={rows} truncated={Boolean(state?.truncated)}
 *                             publishedTotal={state?.everPublished} />}
 *
 * so the three props here are a QueueRow[] straight off QUEUE_SELECT, the
 * round's `truncated` flag, and `everPublished` — the round's LIFETIME
 * publication count, which is what "מכל N ה..." is measured against. Field
 * names are QueueItem's (src/lib/social/types.ts:302): metrics_seen,
 * metrics_views, metrics_reactions, metrics_comments, metrics_shares,
 * metrics_at. Nothing invented.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ──────────────────────────────────────────
 *
 * Width is what decides whether a box holds its text, and this card's whole
 * body is a `grid-cols-2 sm:grid-cols-4` of fixed-ratio tiles — so the widest
 * figure and the longest sub-line are the measurement:
 *
 *   1  THE VIDEO ROUND, 1027 publications. `everPublished` of 1027 is the
 *      lifetime count src/app/social/page.tsx names by hand in its own note
 *      about this exact field ("a write that queues a comment on 1,027 of
 *      them"), so it is a real shape and not an invented one. Every metric is
 *      present, which is the ONLY state that draws FIVE tiles — the video tile
 *      appears beside "נצפה על ידי" rather than instead of it — so at 320px
 *      the grid is 2 columns and the fifth tile sits alone on a third row.
 *      Five-digit sums (48,210 seen) because 1027 posts is where the figures
 *      stop being three digits, and `toLocaleString('he-IL')` puts a comma in
 *      them that the tabular-nums <dd> has to hold.
 *
 *   2  TWENTY-ONE, which is the counted noun's FIRST Russian plural form.
 *      Russian picks the form off the last digits: 21 takes "публикация",
 *      5 takes "публикаций", 2 takes "публикации", and the three differ in
 *      width. 21 is the one no other case here would reach.
 *
 *   3  A ROUND FACEBOOK SHOWED NOTHING ON — views.posts === 0 and seen.posts
 *      === 0, so the exposure tile renders with the honest dash and the
 *      longest sub-line the tile has: "פייסבוק לא מציגה". `truncated` is on
 *      too, which is the only state that appends the counting caveat sentence
 *      ("הספירה מתייחסת לפרסומים שמוצגים במסך הזה בלבד.") to the footer, and
 *      only 2 of 5 posts carry reactions — so the OTHER sub-line branch,
 *      "מתוך 2 פרסומים", is measured here as well.
 *
 *   4  ONE PUBLICATION, which is the one place agree() prints the bare
 *      singular "מכל 1 הפרסום" — a different Hebrew word, and a different
 *      Russian form, from every case above it.
 *
 * `metrics_at` is pinned, so the "עודכן לאחרונה" stamp is identical on every
 * run.
 */
import { createElement } from 'react';
import { renderSnapshot } from './render-html';
import { CampaignReach } from '@/components/social/CampaignReach';
import type { QueueRow } from '@/lib/social/client';

/* The instant every stamp on the card is read from: 20:40 in Israel. */
const READ_AT = '2026-11-15T18:40:00Z';

type Metrics = Pick<QueueRow, 'metrics_seen' | 'metrics_views' | 'metrics_reactions' | 'metrics_comments' | 'metrics_shares' | 'metrics_at'>;

/** One published QueueRow. Only `status` and the metrics columns are read by
    this card; the rest is QueueItem's own shape so the type is honest. */
const row = (id: string, m: Partial<Metrics>): QueueRow =>
  ({
    id,
    schedule_id: null,
    post_id: 'p1',
    variant_id: null,
    target_id: `t${id}`,
    scheduled_at: '2026-11-15T06:00:00Z',
    status: 'published',
    attempts: 1,
    dedupe_hash: '',
    rendered_text: '',
    external_post_id: null,
    permalink: null,
    error: null,
    skip_reason: null,
    claimed_at: null,
    published_at: '2026-11-15T06:01:00Z',
    metrics_seen: null,
    metrics_views: null,
    metrics_reactions: null,
    metrics_comments: null,
    metrics_shares: null,
    metrics_at: null,
    target: null,
    post: null,
    variant: null,
    ...m,
  }) as QueueRow;

/**
 * `n` published rows whose metric totals come to exactly the figures given.
 *
 * The card sums over rows rather than taking a total, so a five-digit figure
 * has to be built out of real per-post numbers: the remainder goes on the
 * first row and the rest share the floor, which is what a real round looks
 * like anyway. `covered` is how many of the rows the worker actually read —
 * the rest carry nulls, which is the "null is not zero" case the component is
 * built around.
 */
function rows(
  n: number,
  totals: { seen?: number; views?: number; reactions?: number; comments?: number; shares?: number },
  covered = n,
): QueueRow[] {
  const share = (total: number | undefined, i: number): number | null => {
    if (total === undefined) return null;
    const floor = Math.floor(total / covered);
    return i === 0 ? total - floor * (covered - 1) : floor;
  };
  return Array.from({ length: n }, (_, i) =>
    i < covered
      ? row(String(i + 1), {
          metrics_seen: share(totals.seen, i),
          metrics_views: share(totals.views, i),
          metrics_reactions: share(totals.reactions, i),
          metrics_comments: share(totals.comments, i),
          metrics_shares: share(totals.shares, i),
          metrics_at: READ_AT,
        })
      : row(String(i + 1), {}),
  );
}

const CASES: { id: string; what: string; node: React.ReactNode }[] = [
  {
    id: 'video-1027',
    what: '1027 publications, every metric present — five tiles, five-digit sums',
    node: createElement(CampaignReach, {
      rows: rows(1027, { seen: 48210, views: 12964, reactions: 3185, comments: 1042, shares: 418 }),
      truncated: false,
      publishedTotal: 1027,
    }),
  },
  {
    id: 'twenty-one',
    what: '21 publications — the first Russian plural form, which no other case reaches',
    node: createElement(CampaignReach, {
      rows: rows(21, { seen: 2104, views: 961, reactions: 212, comments: 48, shares: 21 }),
      truncated: false,
      publishedTotal: 21,
    }),
  },
  {
    id: 'nothing-shown',
    what: 'Facebook showed no exposure figure, the read was capped, and only 2 of 5 posts were read',
    node: createElement(CampaignReach, {
      rows: rows(5, { reactions: 24, comments: 5, shares: 2 }, 2),
      truncated: true,
      publishedTotal: 5,
    }),
  },
  {
    id: 'single',
    what: 'one publication — the bare singular "מכל 1 הפרסום"',
    node: createElement(CampaignReach, {
      rows: rows(1, { seen: 212, reactions: 9, comments: 2, shares: 1 }),
      truncated: false,
      publishedTotal: 1,
    }),
  },
];

const body = CASES.map(
  (c) => `
  <p data-no-translate style="color:#9aa;font:12px sans-serif;margin:18px 0 6px" data-case="${c.id}">${c.what}</p>
  ${renderSnapshot(c.node)}`,
).join('');

/* The container the campaign screen really draws this card in —
   SocialShell.tsx:1280, `mx-auto min-w-0 max-w-6xl overflow-x-clip px-4`. */
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
