import { renderToStaticMarkup } from 'react-dom/server';
import { GroupRow, Figure } from '@/components/social/Discovery';
import { Button, Card, inputClass } from '@/components/social/ui';
import type { DiscoveredGroupRow } from '@/lib/social/types';
import { ChevronDownIcon, ClockIcon, CloseIcon, SearchIcon } from '@/components/icons';

const row = (over: Partial<DiscoveredGroupRow>): DiscoveredGroupRow => ({
  id: over.external_id ?? 'x',
  external_id: over.external_id ?? 'x',
  name: 'קבוצה',
  url: 'https://www.facebook.com/groups/x',
  image_url: '',
  members: 54_300,
  privacy: 'public',
  membership: 'none',
  queries: ['באר שבע'],
  first_seen_at: '2026-09-30T10:00:00Z',
  last_seen_at: '2026-09-30T10:00:00Z',
  target_id: null,
  hidden: false,
  ...over,
});

const cases: [string, DiscoveredGroupRow, boolean, boolean][] = [
  ['hebrew-not-member', row({ external_id: '1', name: 'באר שבע ביחד' }), false, false],
  ['cyrillic-member', row({ external_id: '2', name: 'Наша Беэр-Шева 24', members: 12_000, privacy: 'private', membership: 'member' }), false, false],
  ['long-hebrew-member-already', row({ external_id: '5', name: 'קבוצת תושבי שכונת נווה זאב ורמות באר שבע — קניה, מכירה, המלצות ועסקים מקומיים', members: 98_700, privacy: 'private', membership: 'member' }), true, true],
  ['member-can-add', row({ external_id: '7', name: 'עסקים בבאר שבע', membership: 'member' }), false, false],
  ['unknown', row({ external_id: '6', name: 'דרושים דרום', members: null, privacy: 'unknown', membership: 'unknown' }), false, false],
];

const rows = cases.map(([label, r, already, picked]) => `
  <p style="color:#9aa;font:12px sans-serif;margin:10px 0 2px">${label}</p>
  <div class="row-probe">${renderToStaticMarkup(GroupRow({ row: r, picked, already, busy: false, fallbackImage: null, onToggle: () => {}, onAdopt: () => {}, onHide: () => {} }) as never)}</div>`).join('');

/* COPIES of the page's markup, for geometry only. */
const searchCard = renderToStaticMarkup(
  Card({
    padded: false,
    className: 'px-3 py-3.5',
    children: (
      <div className="flex flex-col gap-2.5">
        <div className="relative flex-1">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-mist-500 start-3" />
          <input dir="auto" value="באר שבע" className={`${inputClass} h-14 rounded-tile pe-11 ps-11 text-base`} />
          <button type="button" data-probe="clear" aria-label="נקה את תיבת החיפוש" className="absolute top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-mist-500 end-1">
            <CloseIcon aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <Button size="lg" data-probe="searchbtn" className="h-14 w-full rounded-tile shadow-[0_4px_14px_-3px_rgba(124,58,237,0.5)]">
          <SearchIcon aria-hidden className="h-5 w-5" />
          חפש קבוצות
        </Button>
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1 text-xs font-bold text-mist-500">
            <ClockIcon aria-hidden className="h-3.5 w-3.5" />
            חיפושים אחרונים
          </p>
          <div className="flex flex-wrap gap-1.5">
            {['באר שבע', 'תל אביב', 'נדל"ן'].map((s) => (
              <button key={s} type="button" data-probe="chip" className="inline-flex min-h-11 items-center rounded-full border px-3.5 text-xs font-bold border-ink-700 bg-ink-900 text-mist-300">{s}</button>
            ))}
          </div>
        </div>
      </div>
    ),
  }) as never,
);

const figures = renderToStaticMarkup(
  <div className="mt-3 grid grid-cols-3 gap-2 [&>*]:min-w-0" data-probe="figures">
    {Figure({ tone: 'brand', value: 12, label: 'קבוצות חדשות' }) as never}
    {Figure({ tone: 'warn', value: 3, label: 'בקשות ממתינות' }) as never}
    {Figure({ tone: 'good', value: 9, label: 'כבר הצטרפת' }) as never}
  </div> as never,
);

const filtersAndSort = renderToStaticMarkup(
  <div className="-mx-1 space-y-2 px-1">
    <div className="-mx-1 min-w-0 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-probe="filterscroll">
      <div className="flex w-max gap-1.5">
        {['הכל', 'חדשות', 'אפשר להצטרף', 'כבר חבר', 'ממתין', 'ברשימה'].map((f, i) => (
          <button key={f} type="button" data-probe="pill" className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-3.5 text-xs font-bold ${i === 0 ? 'border-transparent bg-gradient-to-l from-brand-600 to-brand-500 text-on-brand shadow-[0_2px_8px_-2px_rgba(124,58,237,0.45)]' : 'border-ink-700 bg-ink-900 text-mist-300'}`}>{f}</button>
        ))}
      </div>
    </div>
    <div className="flex justify-center">
      <label data-probe="sortpill" className="relative inline-flex items-center gap-1 rounded-full border border-ink-700 bg-ink-900 ps-3 text-xs font-bold text-mist-300">
        <span className="text-mist-500">מיון:</span>
        <span className="text-brand-400">הכי רלוונטיות</span>
        <ChevronDownIcon aria-hidden className="pointer-events-none me-2.5 h-3.5 w-3.5 text-mist-500" />
        <select data-probe="sortselect" aria-label="סדר התוצאות" className="absolute inset-0 h-11 w-full cursor-pointer opacity-0">
          <option>הכי רלוונטיות</option>
        </select>
      </label>
    </div>
  </div> as never,
);

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px">
<div data-probe="searchcard">${searchCard}</div>
${figures}
${filtersAndSort}
<div data-probe="firstcard" style="margin-top:16px">${rows}</div>
</div></body></html>`);
