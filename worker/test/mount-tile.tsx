/*
 * THE COMPACT GRID, MOUNTED FOR REAL — the entry point campaign-tile.test.ts
 * bundles. Inside the repo, not a temp dir, so esbuild can resolve React.
 *
 * FOUR CAMPAIGNS, because that is the brief's own number — "ארבעה קמפיינים
 * מוצגים במקביל" — and because the reference draws four: three publishing and
 * one held, with the held one carrying the way back.
 */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { CampaignTile } from '@/components/social/CampaignTile';
import { CampaignHoursSheet } from '@/components/social/CampaignHoursSheet';
import type { CampaignState } from '@/lib/social/campaign';
import type { Campaign } from '@/lib/social/types';

const progress = (published: number, total: number, scheduled: number) => ({
  total,
  published,
  failed: 0,
  skipped: 0,
  scheduled,
  running: 0,
  manual: 0,
  finished: published,
});

const state = (s: CampaignState['state'], published: number, total: number, scheduled: number, targets: number): CampaignState =>
  ({
    progress: progress(published, total, scheduled),
    state: s,
    truncated: false,
    targetCount: targets,
    upcoming: [],
  }) as unknown as CampaignState;

const campaign = (id: string, name: string): Campaign => ({ id, name }) as unknown as Campaign;

const FIXTURES = [
  { c: campaign('a', 'ניקוי ספות - באר שבע'), ordinal: 24, st: state('running', 170, 250, 80, 12), days: [0, 1, 2, 3, 4, 5, 6] },
  { c: campaign('b', 'ניקוי מזרנים - דרום'), ordinal: 23, st: state('running', 105, 250, 145, 18), days: [0, 1, 2, 3, 4, 5, 6] },
  /* SCHEDULING NEVER TURNED ON, which is the DEFAULT a campaign is born
     with: readSchedule() returns enabled:false until the owner opens the
     sheet, and the chip then prints "לא נבחרו ימים" with "בכל שעה" beside it
     — the longest pair the control ever shows, and the one the other three
     fixtures never produced. The chip was measured empty at every phone
     width while all four of them said "כל יום". */
  { c: campaign('c', 'ניקוי מזגנים'), ordinal: 22, st: state('paused', 250, 250, 0, 15), days: [0, 1, 2, 3, 4, 5, 6], off: true },
  {
    /* A LONG NAME ON PURPOSE. Two tiles to a row on a 360px phone is the
       narrowest box on this screen, and a name is the one thing in it the
       owner writes himself. */
    c: campaign('d', 'ניקוי רכב ומושבים - באר שבע והסביבה'),
    ordinal: 21,
    st: state('running', 65, 250, 185, 9),
    /* SIX DAYS THAT ARE NOT A RUN, which is the reference's own set and the
       longest the chip ever prints: daysText() collapses א׳…ו׳ into the range
       "א׳-ו׳" (5 characters) and leaves א׳,ב׳,ג׳,ד׳,ה׳,ש׳ as the full list
       (17). The fixtures all used ranges or "כל יום", which is why a chip
       with no room to print them measured green. */
    days: [0, 1, 2, 3, 4, 6],
  },
];

/*
 * ?s=sheet DRIVES THE REAL SHEET, with a save that records what it was
 * handed and resolves — so the test can press the days, press a preset,
 * press "שמור שינויים" and read back exactly what would have gone to the
 * database, without a database.
 */
declare global {
  interface Window { __saved?: unknown; __closed?: boolean }
}

function SheetHarness() {
  const [open, setOpen] = useState(true);
  return (
    <CampaignHoursSheet
      open={open}
      onClose={() => {
        window.__closed = true;
        setOpen(false);
      }}
      campaignName="ניקוי ספות - באר שבע"
      schedule={{ enabled: true, days: [0, 1, 2], start: '08:00', gapSeconds: 90 } as never}
      onSave={async (next) => {
        window.__saved = next;
      }}
    />
  );
}

const root = createRoot(document.getElementById('root') as HTMLElement);

if (new URLSearchParams(location.search).get('s') === 'sheet') {
  root.render(
    <div className="social-theme">
      <SheetHarness />
    </div>,
  );
} else {
  root.render(
  <div className="social-theme" style={{ padding: 10 }}>
    {/* ONE CARD TO A ROW, the page's own grid — see the note on the compact
        view in campaigns/page.tsx. */}
    <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2 [&>*]:min-w-0">
      {FIXTURES.map((f) => (
        <CampaignTile
          key={f.c.id}
          campaign={f.c}
          ordinal={f.ordinal}
          state={f.st}
          media={null}
          groups={f.st.targetCount}
          schedule={{ enabled: !(f as { off?: boolean }).off, days: f.days, start: '08:00', gapSeconds: 90 } as never}
          pace="medium"
          onPaceChange={() => undefined}
          onPause={() => undefined}
          onResume={() => undefined}
          editHref="/social/posts/new"
          statsHref={`/social/campaigns/${f.c.id}`}
          onMenu={() => undefined}
          onHours={() => undefined}
        />
      ))}
    </div>
  </div>,
  );
}
