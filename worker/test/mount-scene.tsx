/*
 * THE PUBLISHING SCENE, MOUNTED SO ITS CLAIMS CAN BE TESTED.
 *
 * The scene has one rule that matters more than every pixel in it: a green
 * tick means a post landed in a group, so a tick may appear only when the real
 * publication count rises. That is a claim about a SEQUENCE — run it, wait,
 * nothing appears; raise the number, one appears — and a static render cannot
 * see it. So this is the real component with React behind it, and the test
 * drives it through `window.__publish` and `window.__mode`.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PublishingScene, type SceneMode } from '@/components/social/PublishingScene';
import { Ratio, LiveQueueHero } from '@/components/social/LiveCampaignHero';

declare global {
  interface Window {
    __publish: (n: number) => void;
    __mode: (m: SceneMode) => void;
    /* The panel's day. 0 draws no bar and no second scene, which is how the
       scene assertions keep counting one robot; the bar test raises it. */
    __plan: (done: number, total: number) => void;
  }
}

function Harness() {
  const [published, setPublished] = useState(0);
  const [mode, setMode] = useState<SceneMode>('sending');
  const [day, setDay] = useState<[number, number]>([0, 0]);
  window.__publish = setPublished;
  window.__mode = setMode;
  window.__plan = (done, total) => setDay([done, total]);
  return (
    <div style={{ padding: 12 }}>
      <PublishingScene mode={mode} published={published} total={279} />
      {/* The real counter line, so "auto font" can be MEASURED rather than
          eyeballed. The widest shape the data can take — four digits on each
          side — is the one that decides whether it fits. */}
      <div data-ratio style={{ width: '100%' }}>
        <Ratio done={1180} total={2655} suffix="פורסמו מתוך המתוכננים להיום" />
      </div>
      {/*
        The real panel, so "the title is never cut on a phone" can be MEASURED.
        Every prop the chip used to read is still passed — a face, a name, a
        second profile, a refresh handler — because the claim is that the panel
        no longer DRAWS them, not that nobody hands them over.
      */}
      <div data-panel style={{ width: '100%', marginTop: 12 }}>
        <LiveQueueHero
          systemState={mode === 'paused' ? 'paused' : 'active'}
          publishedToday={day[0]}
          dailyTarget={300}
          /* Zero on purpose: the panel then draws no scene of its own, so the
             scene assertions above keep counting ONE robot and one active
             destination. The header is what this mount is for. */
          plannedToday={day[1]}
          pendingCancellable={120}
          nextAt={new Date(Date.now() + 600000).toISOString()}
          nextTargetName="קבוצה"
          workerOnline
          inFlight={1}
          fbAccount={{ name: 'Stas Terehin', avatar: 'https://example.invalid/a.jpg' }}
          profiles={[
            { name: 'Stas Terehin', kind: 'profile', image: 'https://example.invalid/a.jpg' },
            { name: 'דף עסקי', kind: 'page', image: 'https://example.invalid/b.jpg' },
          ]}
          onSwitchProfile={() => {}}
          onRefresh={() => {}}
          updatedAt={new Date()}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
