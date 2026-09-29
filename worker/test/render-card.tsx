/*
 * THE FIXTURE campaign-card.test.ts MEASURES.
 *
 * A .tsx of its own rather than a string inside the test, because the point is
 * to measure the REAL component with the real Tailwind classes: anything
 * hand-written here would be measuring a copy, and a copy is exactly what
 * stops failing when the component changes.
 *
 * Four campaigns, each one a shape that has broken a card before: a run that
 * finished by skipping almost everything (122/122 handled, 1 published — the
 * case that makes "טופלו" and "פורסמו" two different sentences), a live run
 * whose next group is named in Cyrillic inside an RTL card, a long Hebrew name
 * with three-figure counts in every chip, and a campaign with nothing in it at
 * all.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { CampaignCard } from '@/components/social/CampaignCard';
import type { CampaignState } from '@/lib/social/campaign';

const prog = (o: Partial<Record<string, number>>) => ({
  total: 0, published: 0, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 0, ...o,
}) as never;

const st = (p: unknown, extra: Partial<CampaignState> = {}): CampaignState => ({
  progress: p as never, state: 'running', truncated: false, startedAt: null,
  estimatedCompletionAt: null, nextAt: null, nextTargetName: null,
  upcoming: [], done: [], now: [], ...extra,
} as CampaignState);

const cases = [
  ['a finished run, mostly skipped', { id:'1', name:'ניקוי שטיחים', service:'', city:'', status:'active' as const, created_at:'2026-09-18T09:00:00Z' },
    st(prog({ total:122, published:1, skipped:121, finished:122 }), { state:'completed' }), 3],
  ['a live run with a Cyrillic next group', { id:'2', name:'ניקוי ספות – ערד', service:'', city:'', status:'active' as const, created_at:'2026-09-20T09:00:00Z' },
    st(prog({ total:15, published:5, skipped:10, finished:15 }), { state:'running', nextAt:new Date(Date.now()+3*3600e3).toISOString(), nextTargetName:'Город Арад , глазами жителей' }), 2],
  ['a long name with big numbers', { id:'3', name:'ניקוי ריפודי רכב ומושבים בבאר שבע והסביבה', service:'', city:'', status:'paused' as const, created_at:'2026-09-22T09:00:00Z' },
    st(prog({ total:248, published:120, scheduled:100, skipped:16, failed:12, finished:148 }), { state:'paused' }), 1],
  ['an empty campaign', { id:'4', name:'קמפיין חדש', service:'', city:'', status:'active' as const, created_at:'2026-09-29T09:00:00Z' },
    st(prog({}), { state:'draft' as never }), 0],
  /* The owner's own screenshot: campaigns that published fifteen times with no
     post findable for them, so the picture slot rendered nothing at all and
     their names sat 58px to the side of every neighbour's. */
  ['published, but no post found for it', { id:'5', name:'סבב פרסום', service:'', city:'', status:'active' as const, created_at:'2026-09-25T09:00:00Z' },
    st(prog({ total:15, published:5, skipped:10, finished:15 }), { state:'stopped' }), 0],
] as const;

const body = cases.map(([label, c, s, posts]) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="card-probe">${renderToStaticMarkup(
    CampaignCard({ campaign: c as never, state: s as never, postCount: posts as number,
      hasPost: (posts as number) > 0, media: null, globalPaused: false, workerOnline: true,
      onPause: () => {}, onResume: () => {}, onEdit: () => {}, onDuplicate: () => {},
      onDelete: () => {}, addPostHref: '/x', busy: false }) as never,
  )}</div>`).join('');

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div style="padding:16px">${body}</div></body></html>`);
