/*
 * THE DASHBOARD'S RUN STRIP, MOUNTED FOR REAL — the entry point
 * worker/test/swiper.test.ts bundles and drives.
 *
 * A swipe is not geometry. Static HTML can say the three cards are side by
 * side; it cannot say that a thumb lands on a whole card instead of between
 * two, that the dot under them follows, that tapping a dot brings its card
 * over, or that scrolling the strip sideways leaves the PAGE where it was.
 * Those are the whole feature — "בסגנון SWIPE גלילה שמאלה ימינה" — so this
 * file is the strip with React actually running behind it.
 *
 * REAL CARDS INSIDE IT, not coloured boxes. The thing that makes this layout
 * hard is that a run card is 450px of links, buttons, selects and a
 * horizontally-tight schedule block; a strip measured around placeholders
 * would prove nothing about the one it has to hold.
 *
 * THE PAGE IS TALLER THAN THE VIEWPORT ON PURPOSE. A strip that scrolls the
 * page vertically when the dots are tapped, or that hands a sideways swipe to
 * the browser as a back gesture, can only be caught on a page that HAS
 * somewhere to scroll to.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CardSwiper } from '@/components/social/CardSwiper';
import { LiveCampaignHero } from '@/components/social/LiveCampaignHero';
import type { CampaignState } from '@/lib/social/campaign';
import { DEFAULT_CAMPAIGN_SCHEDULE, type CampaignSchedule } from '@/lib/social/campaign-schedule';

const prog = (o: Partial<Record<string, number>>) =>
  ({ total: 0, published: 0, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 0, ...o }) as never;

const st = (p: unknown, extra: Partial<CampaignState> = {}): CampaignState =>
  ({
    progress: p as never,
    state: 'running',
    truncated: false,
    startedAt: null,
    estimatedCompletionAt: null,
    nextAt: null,
    nextTargetName: null,
    upcoming: [],
    done: [],
    now: [],
    ...extra,
  }) as CampaignState;

const RUNS = [
  { id: 'r1', name: 'פרסומת לרוסים ספות', state: st(prog({ total: 50, published: 12, scheduled: 38, finished: 12 }), { state: 'running', startedAt: new Date(Date.now() - 2 * 3600e3).toISOString(), nextAt: new Date(Date.now() + 3600e3).toISOString() }) },
  { id: 'r2', name: 'ניקוי שטיחים בערד', state: st(prog({ total: 40, published: 40, finished: 40 }), { state: 'completed', startedAt: new Date(Date.now() - 9 * 3600e3).toISOString() }) },
  { id: 'r3', name: 'ניקוי ריפודי רכב ומושבים בבאר שבע', state: st(prog({ total: 28, published: 9, scheduled: 19, finished: 9 }), { state: 'paused', startedAt: new Date(Date.now() - 5 * 3600e3).toISOString(), nextAt: new Date(Date.now() + 2 * 3600e3).toISOString() }) },
];

function Harness() {
  /* One schedule per run, held exactly as the dashboard holds it: the page
     owns the value and hands it straight back down, so a switch flipped on
     card 3 cannot be written onto card 1. */
  const [schedules, setSchedules] = useState<Record<string, CampaignSchedule>>(
    Object.fromEntries(RUNS.map((r) => [r.id, { ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: true }])),
  );
  return (
    <div className="social-theme" style={{ padding: 16 }}>
      {/* Room ABOVE the strip as well as below it. The page has to be able to
          sit somewhere the strip is fully in view and the document is NOT at
          the top — otherwise "tapping a dot did not scroll the page" is true
          for a reason that has nothing to do with the dot, and the assertion
          can never fail. */}
      <div style={{ height: 300 }} />
      <CardSwiper label="הסבבים שלכם" itemLabel={(position, total) => `סבב ${position} מתוך ${total}`}>
        {RUNS.map((run) => (
          <LiveCampaignHero
            key={run.id}
            campaign={{ id: run.id, name: run.name, service: '', city: '', status: 'active' } as never}
            state={run.state}
            targetCount={run.state.progress.total}
            startedAt={run.state.startedAt}
            workerOnline
            onPause={() => {}}
            onResume={() => {}}
            onReset={() => {}}
            onTune={() => {}}
            schedule={schedules[run.id]}
            onScheduleChange={(next) => setSchedules((all) => ({ ...all, [run.id]: next }))}
          />
        ))}
      </CardSwiper>
      {/* Somewhere for the page to scroll to, so a strip that moves it can be
          caught moving it. */}
      <div style={{ height: 1200 }} />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
