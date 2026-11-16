/*
 * ─── THE CONTENT LIBRARY'S TILE, PRINTED SO A BROWSER CAN MEASURE IT ──────
 *
 * src/components/social/ContentCard.tsx repeats down the library grid —
 * `grid-cols-2` on a phone — so a caption that does not fit is not one bad
 * card, it is every row of the screen. Nothing had ever measured it in
 * Russian, which is what this fixture is for.
 *
 * THE REAL COMPONENT, with the real Tailwind classes, through
 * renderToStaticMarkup. ContentCard is a client component whose only hook is
 * `useState<number | null>(null)` for a video's duration, so static markup
 * gives exactly the first paint the app gives: `seconds` stays null and no
 * duration is claimed, which is the component's own documented behaviour when
 * the browser cannot read the metadata.
 *
 * THE PROPS ARE THE ROUTE'S PROPS. src/app/social/library/page.tsx:510-519
 * passes `item`, `selected`, `onSelect`, `onPublish`, `onOpen`, `actions`
 * (menuFor(it), five entries, the last one danger) and `categoryName`; the
 * grid around it is the route's own `<ul>` and the shell's own `<main>`
 * (SocialShell.tsx:1280). Every field below is a LibraryPost field
 * (src/lib/social/library.ts:106-130) built by toLibraryPost() — nothing is
 * invented.
 *
 * ─── WHICH SHAPES, AND WHY THESE ──────────────────────────────────────────
 *
 * Width is what decides whether a box holds its text, so each case is the
 * widest thing that place can really hold:
 *
 *  1  THE FULL TILE. Four-digit publications (1248 — a post of his that goes
 *     out daily to ~160 groups reaches that inside two weeks), 312 waiting in
 *     the queue (the "§ בתור" chip at its widest realistic count), a draft, a
 *     category, a two-file carousel and a date from LAST year — formatDayMonthHe
 *     adds the year only then (time.ts:204-213), so "18.09.25" is the widest
 *     date this line can print.
 *  2  NEVER PUBLISHED, WITH SKIPS. `nothingYet` is the longest string on the
 *     card: "טרם פורסם · 84 דולגו" in a `truncate` span, 84 being a full run
 *     that published nothing. Its Russian is "Ещё не опубликовано · 84 …" —
 *     the single biggest growth on the screen. Plus the singular queue chip
 *     ("אחד בתור"), which is a different dictionary entry from the counted one.
 *  3  A TEXT-ONLY POST. No media at all, so `kind` is "טקסט" and the cover
 *     becomes the post's own text under `line-clamp-5` — a fixed-height box,
 *     which is where "spilled" lives.
 *  4  THE EVERYDAY CARD: one picture, published once, no category, nothing
 *     waiting. Most of the grid looks like this and it is the only case with
 *     room to spare, so it is the control.
 *  5  AN UNTITLED DRAFT with no text and no media — `title` falls through to
 *     "ללא כותרת", and the selection is ON, which is the only state that
 *     draws the checked circle and the brand border.
 *
 * Covers are inline SVG data URIs, as render-card.tsx does it: a flat tile of
 * the real size is all `object-fit: cover` needs, and the fixture never
 * reaches the network.
 */
import { createElement } from 'react';
import { renderSnapshot } from './render-html';
import { BoxIcon, CopyIcon, EyeIcon, PencilIcon, TagIcon } from '@/components/icons';
import { ContentCard } from '@/components/social/ContentCard';
import type { MenuAction } from '@/components/social/ui';
import type { LibraryPost } from '@/lib/social/library';
import type { MediaItem, Post } from '@/lib/social/types';

/* A flat tile the size of a real cover — no network, same geometry. */
const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><rect width="120" height="100" fill="${fill}"/></svg>`)}`;

const image = (n: string, fill: string): MediaItem => ({ kind: 'image', url: pic(fill), path: `social-media/${n}`, name: n });
const video = (n: string, fill: string): MediaItem => ({ kind: 'video', url: pic(fill), path: `social-media/${n}`, name: n });

/** The card's "⋯", exactly as library/page.tsx:255-299 builds it. */
const mk = { className: 'h-4.5 w-4.5' } as const;
const menu = (): MenuAction[] => [
  { label: 'תצוגה מקדימה', icon: createElement(EyeIcon, mk), onSelect: () => undefined },
  { label: 'ערוך ותזמן בעורך', icon: createElement(PencilIcon, mk), onSelect: () => undefined },
  { label: 'שכפל לפוסט חדש', icon: createElement(CopyIcon, mk), onSelect: () => undefined },
  { label: 'שנה קטגוריית תוכן', icon: createElement(TagIcon, mk), onSelect: () => undefined },
  { label: 'העבר לארכיון', icon: createElement(BoxIcon, mk), danger: true, onSelect: () => undefined },
];

const post = (p: Partial<Post>): Post => ({
  id: 'p0',
  campaign_id: null,
  title: '',
  base_text: '',
  language: 'he',
  link_url: '',
  cta_type: '',
  phone: '',
  whatsapp_url: '',
  media: [],
  status: 'ready',
  created_at: '2026-01-04T08:00:00Z',
  updated_at: '2026-11-14T08:00:00Z',
  ...p,
});

/** toLibraryPost()'s own shape — library.ts:278-289. */
const item = (p: Post, u: Partial<Omit<LibraryPost, 'post'>> = {}): LibraryPost => ({
  post: p,
  categoryId: null,
  publishCount: 0,
  lastPublishedAt: null,
  pendingCount: 0,
  publishedTargetIds: [],
  skippedCount: 0,
  failedCount: 0,
  ...u,
});

const CASES: { id: string; item: LibraryPost; selected: boolean; categoryName: string | null }[] = [
  {
    id: 'full',
    selected: false,
    categoryName: 'לפני ואחרי',
    item: item(
      post({
        id: 'p1',
        title: 'ניקוי ספות וריפודים בבאר שבע והסביבה — מבצע לפני ואחרי',
        base_text: 'ניקוי ספות עד הבית, בלי כימיקלים, עם אחריות. מתקשרים ומתאמים תוך יום.',
        status: 'draft',
        media: [image('IMG_20261114_214307_HDR.jpg', '#c4b5fd'), video('WhatsApp Video 2026-11-14 at 21.43.07.mp4', '#a78bfa')],
      }),
      { categoryId: 'c1', publishCount: 1248, pendingCount: 312, lastPublishedAt: '2025-09-18T06:30:00Z', publishedTargetIds: ['t1', 't2'], skippedCount: 96, failedCount: 12 },
    ),
  },
  {
    id: 'nothing-yet',
    selected: false,
    categoryName: 'ספות',
    item: item(
      post({
        id: 'p2',
        title: 'ניקוי ריפודי רכב ומושבים',
        base_text: 'ניקוי ריפודי רכב במקום, בלי להשאיר את האוטו.',
        media: [image('seats.png', '#a5b4fc')],
      }),
      { categoryId: 'c2', publishCount: 0, pendingCount: 1, skippedCount: 84, failedCount: 0 },
    ),
  },
  {
    id: 'text-only',
    selected: false,
    categoryName: null,
    item: item(
      post({
        id: 'p3',
        title: '',
        base_text:
          'מחפשים ניקוי ספות בבאר שבע? אנחנו מגיעים עד הבית עם מכונת מים חמים, מנקים ספה, פינתית, מזרנים וריפודי רכב, ויוצאים רק כשהכול נקי ויבש. אחריות מלאה.',
      }),
      { publishCount: 37, lastPublishedAt: '2026-11-12T09:15:00Z', publishedTargetIds: ['t3'], skippedCount: 0 },
    ),
  },
  {
    id: 'everyday',
    selected: false,
    categoryName: null,
    item: item(
      post({ id: 'p4', title: 'מזגנים — ניקוי וחיטוי', base_text: 'ניקוי מזגן לפני הקיץ.', media: [image('ac.png', '#bae6fd')] }),
      { publishCount: 1, lastPublishedAt: '2026-11-15T07:00:00Z', publishedTargetIds: ['t4'] },
    ),
  },
  {
    id: 'untitled-selected',
    selected: true,
    categoryName: null,
    item: item(post({ id: 'p5', title: '', base_text: '', status: 'draft' }), { pendingCount: 0, publishCount: 0, skippedCount: 0 }),
  },
];

const cards = CASES.map((c) =>
  createElement(ContentCard, {
    key: c.item.post.id,
    item: c.item,
    selected: c.selected,
    onSelect: () => undefined,
    onPublish: () => undefined,
    onOpen: () => undefined,
    actions: menu(),
    categoryName: c.categoryName,
  }),
);

/* The route's own grid (library/page.tsx:508) inside the shell's own main
   (SocialShell.tsx:1280) — the column width IS the measurement. */
const grid = createElement(
  'ul',
  { className: 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 [&>*]:min-w-0' },
  cards,
);

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="crm-page mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">${renderSnapshot(grid)}</main>
</div>
</body></html>`,
);
