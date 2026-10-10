/*
 * THE FIXTURE campaign-card.test.ts MEASURES.
 *
 * A .tsx of its own rather than a string inside the test, because the point is
 * to measure the REAL component with the real Tailwind classes: anything
 * hand-written here would be measuring a copy, and a copy is exactly what
 * stops failing when the component changes.
 *
 * THE WRONG THEME, FOR AS LONG AS THIS FILE HAS EXISTED. The page it printed
 * had no `social-theme` on it, so every measurement taken here was taken
 * against the site's default palette — a dark page with orange buttons —
 * while /social is a white-and-violet app. Sibling fixtures
 * (render-discovery.tsx, render-quick-comments.tsx) all wrap their body in it.
 * Geometry mostly survived that, because the two themes share their type
 * scale; the radii and every colour did not, and a card measured on the wrong
 * background is not the card.
 *
 * MEDIA IS NOT OPTIONAL HERE ANY MORE. Every case passed `media: null`, so
 * the fixture never drew a single real picture — and the picture is the whole
 * subject of the design specification this card was rebuilt to. Two cases
 * carry an inline SVG now (an image and a video poster), which needs no
 * network and renders in Chromium exactly as a real cover does.
 *
 * Five campaigns, each one a shape that has broken a card before: a run that
 * finished by skipping almost everything (122/122 handled, 1 published — the
 * case that makes "טופלו" and "פורסמו" two different sentences), a live run
 * whose next group is named in Cyrillic inside an RTL card, a long Hebrew name
 * with three-figure counts in every chip, and a campaign with nothing in it at
 * all.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { CampaignCard } from '@/components/social/CampaignCard';
import type { CampaignState } from '@/lib/social/campaign';
import { DEFAULT_CAMPAIGN_SCHEDULE, type CampaignSchedule } from '@/lib/social/campaign-schedule';

/* Inline so the fixture never reaches the network: a flat tile the size of a
   real cover, which is all `object-fit: cover` needs to be measured. */
const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160"><rect width="120" height="160" fill="${fill}"/></svg>`)}`;
const img = [{ url: pic('#c4b5fd'), kind: 'image' }] as never;
const vid = [{ url: pic('#a78bfa'), kind: 'video' }] as never;

const prog = (o: Partial<Record<string, number>>) => ({
  total: 0, published: 0, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 0, ...o,
}) as never;

const st = (p: unknown, extra: Partial<CampaignState> = {}): CampaignState => ({
  progress: p as never, state: 'running', truncated: false, startedAt: null,
  estimatedCompletionAt: null, nextAt: null, nextTargetName: null,
  upcoming: [], done: [], now: [], ...extra,
} as CampaignState);

/*
 * THE SCHEDULING PANEL, in the three shapes that have different geometry.
 *
 * The reference's own setting (Sun–Thu, 08:00–22:00, every 10 minutes) is the
 * common one; `all` is the widest the summary line can get with seven day
 * labels in it, and `none` is the state the owner can reach in one tap from
 * `all` — no day chosen, which the panel has to say out loud rather than
 * leaving a card promising a publication that cannot happen.
 */
const sched: Record<string, CampaignSchedule> = {
  reference: { ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: true },
  /* Every day lit, a gap of one (so "כל דקה", the singular branch), and a
     window that runs the whole clock — the longest summary this can print. */
  all: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:30', gapSeconds: 60 },
  none: { ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: true, days: [] },
  off: { ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: false },
};

const cases = [
  ['a finished run, mostly skipped', { id:'1', name:'ניקוי שטיחים', service:'', city:'', status:'active' as const, created_at:'2026-09-18T09:00:00Z' },
    st(prog({ total:122, published:1, skipped:121, finished:122 }), { state:'completed' }), 3, img],
  ['a live run with a Cyrillic next group', { id:'2', name:'ניקוי ספות – ערד', service:'', city:'', status:'active' as const, created_at:'2026-09-20T09:00:00Z' },
    st(prog({ total:15, published:5, skipped:10, finished:15 }), { state:'running', nextAt:new Date(Date.now()+3*3600e3).toISOString(), nextTargetName:'Город Арад , глазами жителей' }), 2, vid],
  ['a long name with big numbers', { id:'3', name:'ניקוי ריפודי רכב ומושבים בבאר שבע והסביבה', service:'', city:'', status:'paused' as const, created_at:'2026-09-22T09:00:00Z' },
    st(prog({ total:248, published:120, scheduled:100, skipped:16, failed:12, finished:148 }), { state:'paused' }), 1, img],
  ['an empty campaign', { id:'4', name:'קמפיין חדש', service:'', city:'', status:'active' as const, created_at:'2026-09-29T09:00:00Z' },
    st(prog({}), { state:'draft' as never }), 0, null],
  /* The owner's own screenshot: campaigns that published fifteen times with no
     post findable for them, so the picture slot rendered nothing at all and
     their names sat 58px to the side of every neighbour's. */
  ['published, but no post found for it', { id:'5', name:'סבב פרסום', service:'', city:'', status:'active' as const, created_at:'2026-09-25T09:00:00Z' },
    st(prog({ total:15, published:5, skipped:10, finished:15 }), { state:'stopped' }), 0, null],
  /* THE REFERENCE'S OWN CARD: "5 מתוך 20 פרסומים פורסמו · 25%", nothing
     skipped, nothing failed, something due today. Every other case here has a
     skip in it, so without this one nothing measured the card the owner
     actually sees most of the time — the one with no "דולגו" tail under the
     bar. */
  ['the reference card: 5 of 20, nothing skipped', { id:'6', name:'ניקוי ספות באר שבע', service:'', city:'', status:'active' as const, created_at:'2026-10-01T09:00:00Z' },
    st(prog({ total:20, published:5, scheduled:15, finished:5 }), { state:'running', nextAt:new Date(Date.now()+2*3600e3).toISOString(), nextTargetName:'תושבי באר שבע' }), 1, img],
  /* And the one case allowed to say "בהצלחה": every row published. */
  ['a run that finished clean', { id:'7', name:'ניקוי ריפודי רכב', service:'', city:'', status:'active' as const, created_at:'2026-09-28T09:00:00Z' },
    st(prog({ total:20, published:20, finished:20 }), { state:'completed' }), 1, vid],
  /*
   * THE SAME NUMBERS, FROM A READ THAT WAS CUT SHORT — and it must NOT say
   * "בהצלחה".
   *
   * campaignStates() caps at 5000 rows across every campaign and drops the
   * furthest-out scheduled ones first, so a run whose pending rows fell off
   * the end reports published === total with publications still waiting.
   * client.ts names this exact failure. There is nothing here to tell it apart
   * from the case above except `truncated`.
   */
  ['the same, from a truncated read', { id:'8', name:'ניקוי חלונות', service:'', city:'', status:'active' as const, created_at:'2026-09-27T09:00:00Z' },
    st(prog({ total:20, published:20, finished:20 }), { state:'completed', truncated:true }), 1, img],
  /* Every row published, and the whole product is on hold from the header.
     runBadge says "מושהה"; this card may not say it ended well. */
  ['every row published, publishing globally paused', { id:'9', name:'ניקוי מרפסות', service:'', city:'', status:'active' as const, created_at:'2026-09-26T09:00:00Z' },
    st(prog({ total:20, published:20, finished:20 }), { state:'completed' }), 1, img, true],
  /*
   * ─── THE THREE THE SCHEDULING PANEL ADDS ───────────────────────────────
   *
   * Every card above now carries the reference's own window (see schedules
   * below), so the panel is measured on all of them. These three are the
   * shapes that are only reachable through it:
   *
   *  10  seven days lit, a one-minute gap and a round-the-clock window — the
   *      longest "סיכום תזמון" line this can print, on the narrowest column.
   *  11  no day chosen. "הבא בתור" may not print the stored instant here: the
   *      engine will not publish at it.
   *  12  the switch off, which is every campaign that existed before this
   *      feature and must look and behave exactly as it did.
   */
  ['every day, every hour, a one-minute gap', { id:'10', name:'ניקוי ספות', service:'', city:'', status:'active' as const, created_at:'2026-10-01T08:00:00Z' },
    st(prog({ total:40, published:12, scheduled:28, finished:12 }), { state:'running', nextAt:new Date(Date.now()+90*60e3).toISOString(), nextTargetName:'באר שבע מדברת' }), 1, img],
  ['no day chosen — nothing can go out', { id:'11', name:'ניקוי שטיחים בערד', service:'', city:'', status:'active' as const, created_at:'2026-10-01T08:00:00Z' },
    st(prog({ total:40, published:12, scheduled:28, finished:12 }), { state:'running', nextAt:new Date(Date.now()+90*60e3).toISOString(), nextTargetName:'ערד ביחד' }), 1, vid],
  ['the switch off — the card as it was before this feature', { id:'12', name:'ניקוי חלונות ערד', service:'', city:'', status:'active' as const, created_at:'2026-10-01T08:00:00Z' },
    st(prog({ total:40, published:12, scheduled:28, finished:12 }), { state:'running', nextAt:new Date(Date.now()+90*60e3).toISOString(), nextTargetName:'לוח ערד' }), 1, img],
] as const;

/*
 * WHICH CARD GETS WHICH WINDOW. Keyed by campaign id rather than threaded
 * through the tuples above, so adding a case needs no change here and a case
 * with no entry renders the card with no panel at all — which is the shape
 * every OTHER screen in the product renders it in, and is worth measuring too.
 */
const schedules: Record<string, CampaignSchedule> = {
  '1': sched.reference, '2': sched.reference, '3': sched.reference, '4': sched.reference,
  '6': sched.reference, '7': sched.reference, '8': sched.reference, '9': sched.reference,
  '10': sched.all, '11': sched.none, '12': sched.off,
  /* '5' is left out on purpose: a card with no panel, the way the dashboard
     and the campaign screen render this component. */
};

const body = cases.map(([label, c, s, posts, media, paused]) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="card-probe">${renderToStaticMarkup(
    CampaignCard({ campaign: c as never, state: s as never, postCount: posts as number,
      hasPost: (posts as number) > 0, media: media as never, globalPaused: paused === true, workerOnline: true,
      onPause: () => {}, onResume: () => {}, editHref: '/social/posts/p1', onDuplicate: () => {},
      onDelete: () => {}, addPostHref: '/x', busy: false,
      /* The queue tuner's button. Passed so the measurement below actually
         covers it: without a handler the card draws nothing, and a hit-test
         that never sees a control cannot find it too small. */
      onTune: () => {},
      schedule: schedules[(c as { id: string }).id] ?? null,
      onScheduleChange: schedules[(c as { id: string }).id] ? () => {} : undefined }) as never,
  )}</div>`).join('');

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px">${body}</div></body></html>`);
