/*
 * ANX LIVE FLOW, MOUNTED SO ITS CLAIMS CAN BE TESTED.
 *
 * The card has one rule that matters more than every pixel in it: nothing on
 * it may say a publication happened unless the database says so. That is a
 * claim about a SEQUENCE — set a stage, nothing is ticked; put a finished row
 * in, a tick appears on THAT row — and a static render cannot see it. So this
 * is the real panel with React behind it, driven through the handles below.
 *
 * There is no standalone mount of the card any more: it is only ever drawn by
 * LiveQueueHero, and the panel is what decides which state it is in. A second
 * mount that was handed a state directly would be testing the drawing and not
 * the deciding, which is the half that has had the bugs.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { FlowRow } from '@/components/social/LiveFlow';
import type { SceneMode } from '@/components/social/sceneState';
import { Ratio, LiveQueueHero } from '@/components/social/LiveCampaignHero';
import type { SystemState } from '@/components/social/systemState';
import type { QueueStep } from '@/lib/social/types';

declare global {
  interface Window {
    /** Publications that really finished today — the stats and the headline. */
    __publish: (n: number) => void;
    /** Kept for the states the panel cannot be driven into from a row. */
    __mode: (m: SceneMode) => void;
    /** The panel's day: done and planned. */
    __plan: (done: number, total: number) => void;
    /*
     * THE STAGE THE WORKER SAYS IT IS ON, on the row the panel is holding.
     *
     * The control that matters most here: `preparing` and `sending` are not
     * two moods, they are two values of this column, and the percentage under
     * the current publication is read from it and from nothing else.
     */
    __step: (step: QueueStep) => void;
    /*
     * The dashboard's own verdict, so the stopped states can be driven
     * through the real panel. `blocked` is the third fact: whether the thing
     * that needs a person also STOPS the engine. A backlog does not.
     */
    __system: (state: SystemState, online: boolean, blocked: boolean) => void;
    /** Rows for the queue list, when a test needs a particular shape. */
    __rows: (rows: FlowRow[] | null) => void;
  }
}

function Harness() {
  const [mode, setMode] = useState<SceneMode>('sending');
  const [day, setDay] = useState<[number, number]>([0, 0]);
  const [step, setStep] = useState<QueueStep>('uploading_media');
  const [rows, setRows] = useState<FlowRow[] | null>(null);
  const [system, setSystem] = useState<{ state: SystemState; online: boolean; blocked: boolean } | null>(null);
  /* ONE SOURCE FOR THE DAY'S COUNT. It was two — a `published` state and
     day[0], read as `published || day[0]` — and that `||` quietly turned a
     deliberate zero back into 22, which is exactly the case the "nothing
     attempted, no share" assertion is about. */
  window.__publish = (n) => setDay(([, total]) => [n, total]);
  window.__mode = setMode;
  window.__plan = (done, total) => setDay([done, total]);
  window.__step = setStep;
  window.__rows = setRows;
  window.__system = (state, online, blocked) => setSystem({ state, online, blocked });

  const live = mode === 'sending' || mode === 'preparing';
  /*
   * A REAL PICTURE, SERVED FROM THE PAGE ITSELF.
   *
   * "להוסיף גם את התמונה של הקבוצות" — the square beside a group's name now
   * carries that group's picture. An inline SVG is a real decoded image to
   * the browser and needs no network, so the test can measure the box it
   * lands in. The THIRD row deliberately has none: a group Facebook never
   * gave us a picture for keeps the mark, and that half has to be measured
   * too.
   */
  const pic = (fill: string) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="${fill}"/></svg>`)}`;
  const queue: FlowRow[] = rows ?? [
    { id: 'r-done', name: 'באר שבע והסביבה', state: 'done', at: '20:15', image: pic('#2f7d32') },
    ...(live ? ([{ id: 'r-live', name: 'קבוצת באר שבע', state: 'live', note: 'מפרסם עכשיו', image: pic('#1557d6') }] as FlowRow[]) : []),
    { id: 'r-next', name: 'לוח באר שבע', state: 'next' },
  ];

  return (
    <div style={{ padding: 12 }}>
      {/* The real counter line, so "auto font" can be MEASURED rather than
          eyeballed. The widest shape the data can take — four digits on each
          side — is the one that decides whether it fits. */}
      <div data-ratio style={{ width: '100%' }}>
        <Ratio done={1180} total={2655} suffix="פורסמו מתוך המתוכננים להיום" />
      </div>
      {/*
        The real panel. Every prop the old chip read is still passed — a face,
        a name, a second profile, a refresh handler — because the claim is that
        the panel no longer DRAWS them, not that nobody hands them over.
      */}
      <div data-panel style={{ width: '100%', marginTop: 12 }}>
        <LiveQueueHero
          /* The panel decides its own state from these and the row below. */
          systemState={system ? system.state : mode === 'paused' ? 'paused' : 'active'}
          workerOnline={system ? system.online : true}
          publishingBlocked={system ? system.blocked : false}
          publishedToday={day[0]}
          dailyTarget={300}
          plannedToday={day[1]}
          pendingCancellable={120}
          nextAt={new Date(Date.now() + 600000).toISOString()}
          nextTargetName="קבוצה"
          /*
            TIED TO THE MODE, so the panel's own "today is finished" test can
            be driven without a fourth control: a row in a worker's hands is
            exactly what `sending` means, and a finished day is one where
            nobody is holding anything.
          */
          inFlight={live ? 1 : 0}
          /*
           * THE ROW ITSELF, so the card that says WHAT is going out is drawn
           * and therefore measured. A long Cyrillic group name on purpose:
           * that is the case the clipping guard exists for.
           *
           * `step_at` is twelve seconds back, so anything that prints an age
           * has something honest to print.
           */
          inFlightRows={
            live
              ? ([
                  {
                    id: 'q-live',
                    status: 'publishing',
                    step,
                    step_at: new Date(Date.now() - 12_000).toISOString(),
                    scheduled_at: new Date().toISOString(),
                    /* With a picture, and no post media: the square beside
                       the name is exactly the one he photographed empty. */
                    target: { name: 'Чистка диванов Беэр-Шева и окрестности — объявления', image_url: pic('#7a4bd0') },
                    post: { media: [] },
                  },
                ] as never)
              : []
          }
          flowRows={queue}
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
