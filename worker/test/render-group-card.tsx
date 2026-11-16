/*
 * ─── THE GROUP TILE, PRINTED SO A BROWSER CAN MEASURE IT ──────────────────
 *
 * src/components/social/GroupCard.tsx is the narrowest box in the product:
 * four across a phone, which the component's own comment works out as ~80px
 * of card and 64px inside it. Every caption on it is 11px/14px text in that
 * 64px. Nothing had ever measured it in Russian, and a break here is a break
 * on all hundred and twenty-three rows of /social/groups.
 *
 * THE REAL COMPONENT, with the real Tailwind classes, through
 * renderToStaticMarkup. GroupCard holds no state of its own; in browsing mode
 * the tile is a `next/link` (which render-card.tsx and render-setup-checklist.tsx
 * already print statically through CampaignCard and SetupChecklist), and in
 * picking mode it is a plain button. Both modes are printed, because the
 * markup, the hit boxes and the 28px mark differ between them.
 *
 * THE PROPS ARE THE ROUTE'S PROPS. src/app/social/groups/page.tsx:880-889
 * passes `group`, `selectionMode` (its `picking`), `selected`, `onSelect`,
 * `actions` (menuFor(g), the eight entries at 406-447, the last one danger),
 * `nextAt` (nextByTarget[g.id]) and `cityLabel` — which the PAGE computes as
 * `g.city || detectCity(g.name)` (page.tsx:251), so a set city and a guessed
 * one arrive here as the same string and the card tells them apart by
 * `group.city` alone. Both branches are below. Every field is a SocialTarget
 * field (src/lib/social/types.ts:29-64); nothing is invented. The route's
 * `<ul>` grid and the shell's `<main>` (SocialShell.tsx:1280) are reproduced,
 * because the column width IS the measurement.
 *
 * ─── WHICH SHAPES, AND WHY THESE ──────────────────────────────────────────
 *
 *  1  THE WIDEST NAME THIS LIST REALLY HOLDS: a Russian group name written as
 *     one closed compound, with nowhere to break. render-discovery.tsx already
 *     carries this exact name for the same reason — a name with spaces wraps
 *     and hides the fault. Plus the widest city label in cities.ts
 *     ("מצפה רמון" → "Мицпе-Рамон"), a category, a favourite star, a date from
 *     LAST year (formatDayMonthHe adds the year only then, time.ts:204-213, so
 *     "18.09.25" is the widest this line prints) and a booked next slot — the
 *     one-line meta the component merged into a single `truncate` paragraph.
 *  2  A GROUP WHOSE NAME IS IN THE DICTIONARY. "באר שבע ביחד" is the
 *     group-name field's own placeholder and i18n.ts carries an entry for it
 *     ('Наш район') — so a group a customer really called that is a group
 *     whose NAME can be rewritten. A group name is the customer's data and
 *     must come through untouched in both languages; this case is here to
 *     catch it if it does not. Its city is a GUESS (no `group.city`), which is
 *     the branch that prints "באר שבע?".
 *  3  A SHARE LINK NOBODY HAS FOLLOWED YET. external_id carries
 *     PENDING_SHARE_PREFIX and client.ts:251 names the row after that same
 *     token when no name was typed, so the card shows the token with "מזוהה…"
 *     under it — the state the component says exists to stop the tile looking
 *     like a bug.
 *  4  NOT SYNCED YET: last_synced_at null, so the meta line is "מושך פרטים…".
 *  5  SWITCHED OFF BY THE WORKER (last_status 'left'): the amber dot, its long
 *     title attribute — the longest string the card can hand the translator —
 *     and "טרם פורסם", which is the shortest Hebrew and nearly the longest
 *     Russian on the whole screen.
 *  6  PAUSED BY THE OWNER: the grey dot and the "מושהית" title, the other dot
 *     branch.
 *  7  A PAGE, not a group: `channel: 'facebook_page'` takes the circular
 *     avatar, and its name is the longest Hebrew one here.
 *
 * Pictures are inline SVG data URIs (as render-card.tsx does it): the worker
 * copies real covers into our own storage, and a flat tile of the right size
 * is all `object-fit: cover` needs. The fixture never reaches the network.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChartIcon, MapPinIcon, PauseIcon, PencilIcon, PlayIcon, RepeatIcon, StarIcon, TrashIcon, UsersIcon } from '@/components/icons';
import { GroupCard } from '@/components/social/GroupCard';
import type { MenuAction } from '@/components/social/ui';
import { PENDING_SHARE_PREFIX, type SocialTarget } from '@/lib/social/types';

/* A flat tile the size of a real cover crop — no network, same geometry. */
const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${fill}"/></svg>`)}`;

const mk = { className: 'h-4.5 w-4.5' } as const;

/** The card's "⋯", exactly as groups/page.tsx:406-447 builds it. */
const menu = (g: SocialTarget): MenuAction[] => [
  { label: 'פתח את הקבוצה בפייסבוק', icon: createElement(UsersIcon, mk), onSelect: () => undefined },
  { label: 'פרופיל והיסטוריה', icon: createElement(ChartIcon, mk), onSelect: () => undefined },
  { label: 'צור פוסט לקבוצה הזו', icon: createElement(PencilIcon, mk), onSelect: () => undefined },
  { label: 'שייך לעיר', icon: createElement(MapPinIcon, mk), onSelect: () => undefined },
  { label: g.favorite ? 'הסר מהמועדפות' : 'הוסף למועדפות', icon: createElement(StarIcon, mk), onSelect: () => undefined },
  {
    label: g.enabled ? 'השהה קבוצה' : 'הפעל קבוצה',
    icon: createElement(g.enabled ? PauseIcon : PlayIcon, mk),
    onSelect: () => undefined,
  },
  { label: 'רענן ובדוק קבוצה', icon: createElement(RepeatIcon, mk), onSelect: () => undefined },
  { label: 'הסר מהרשימה', icon: createElement(TrashIcon, mk), danger: true, onSelect: () => undefined },
];

const target = (t: Partial<SocialTarget>): SocialTarget => ({
  id: 'g0',
  account_id: null,
  channel: 'facebook_group',
  external_id: '100064123456789',
  name: '',
  url: 'https://www.facebook.com/groups/100064123456789',
  tasks: [],
  permission_status: 'browser',
  can_api_publish: false,
  enabled: true,
  notes: '',
  last_synced_at: '2026-11-15T19:00:00Z',
  last_published_at: null,
  created_at: '2026-03-02T09:00:00Z',
  ...t,
});

/** The page computes this, not the card — groups/page.tsx:251. */
const CASES: { group: SocialTarget; cityLabel?: string; nextAt?: string }[] = [
  {
    group: target({
      id: 'g1',
      name: 'БеэрШеваОбъявленияКуплюПродамОтдамБесплатноБарахолкаЮгИзраиля',
      city: 'מצפה רמון',
      category: 'לוחות מכירה',
      favorite: true,
      image_url: pic('#c4b5fd'),
      last_published_at: '2025-09-18T06:30:00Z',
    }),
    cityLabel: 'מצפה רמון',
    nextAt: '2026-11-20T07:10:00Z',
  },
  {
    group: target({
      id: 'g2',
      name: 'באר שבע ביחד',
      category: 'קהילתי',
      image_url: pic('#a5b4fc'),
      last_published_at: '2026-11-14T06:30:00Z',
    }),
    /* No `city` on the row — so this is detectCity()'s guess, and the card
       prints it with the "?" that marks it as one. */
    cityLabel: 'באר שבע',
  },
  {
    group: target({
      id: 'g3',
      external_id: `${PENDING_SHARE_PREFIX}AbCdEf1234567890`,
      name: `${PENDING_SHARE_PREFIX}AbCdEf1234567890`,
      url: 'https://www.facebook.com/share/g/AbCdEf1234567890',
      last_synced_at: null,
    }),
    cityLabel: 'אחר',
  },
  {
    group: target({ id: 'g4', name: 'Чистка диванов Беэр-Шева и окрестности', city: 'באר שבע', last_synced_at: null }),
    cityLabel: 'באר שבע',
  },
  {
    group: target({
      id: 'g5',
      name: 'דירות למכירה ולהשכרה בבאר שבע והסביבה',
      city: 'באר שבע',
      category: 'נדל״ן',
      enabled: false,
      last_status: 'left',
      image_url: pic('#fcd34d'),
    }),
    cityLabel: 'באר שבע',
  },
  {
    group: target({
      id: 'g6',
      name: 'ארד — לוח מודעות ומידע לתושבים',
      city: 'ערד',
      favorite: true,
      enabled: false,
      last_published_at: '2026-10-29T06:30:00Z',
    }),
    cityLabel: 'ערד',
  },
  {
    group: target({
      id: 'g7',
      channel: 'facebook_page',
      name: 'ניקוי ספות וריפודים בבאר שבע והסביבה',
      city: 'קריית גת',
      category: 'עסקי',
      image_url: pic('#86efac'),
      last_published_at: '2026-11-15T05:00:00Z',
    }),
    cityLabel: 'קריית גת',
    nextAt: '2026-11-17T08:40:00Z',
  },
];

/** The route's own grid — groups/page.tsx:878. */
function grid(selectionMode: boolean, selectedIds: string[]) {
  return createElement(
    'ul',
    { className: 'grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 [&>*]:min-w-0' },
    CASES.map((c) =>
      createElement(GroupCard, {
        key: c.group.id,
        group: c.group,
        selectionMode,
        selected: selectedIds.includes(c.group.id),
        onSelect: () => undefined,
        actions: menu(c.group),
        nextAt: c.nextAt,
        cityLabel: c.cityLabel,
      }),
    ),
  );
}

const label = (s: string) => `<p style="color:#9aa;font:12px sans-serif;margin:18px 0 6px">${s}</p>`;

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="crm-page mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">
    ${label('browsing — the tile is a link, with the star, the dot and the "⋯" in its corners')}
    ${renderToStaticMarkup(grid(false, []))}
    ${label('picking — the tile is one big toggle, with the 28px mark; two of these are selected')}
    ${renderToStaticMarkup(grid(true, ['g1', 'g5']))}
  </main>
</div>
</body></html>`,
);
