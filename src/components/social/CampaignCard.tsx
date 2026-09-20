'use client';

import Link from 'next/link';
import { canPauseRun, canResumeRun, runBadge, type CampaignState } from '@/lib/social/campaign';
import { formatDateTimeHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import { ltr } from './DateTime';
import type { Campaign, MediaItem } from '@/lib/social/types';
import { PlusIcon } from '@/components/icons';
import { CampaignProgressBar } from './CampaignProgressBar';
import { PostCover } from './PostCover';
import { TargetAvatar } from './TargetAvatar';
import { Badge, Button, TONE_FILL, type Tone } from './ui';

/**
 * The campaign as a control surface, in the order the owner reads it: what is
 * going out, what it is called, what state it is in, how far it has got, what
 * became of the rest, and the two facts that decide whether he needs to do
 * anything — when the next publication goes out and to which group.
 *
 * Both of those come straight from the queue's own rows. When there is no
 * next row (paused, finished, stopped) the card says that instead of showing
 * a filler time.
 *
 * WHAT IS NOT HERE ANY MORE. "התחיל" and "סיום משוער" were a second full row
 * of boxes that pushed the two buttons below the fold on a 375px phone, for
 * two facts nobody acts on from a list; they are on the run's own screen
 * (campaigns/[id]/page.tsx renders both, with "לפי התזמון שהוגדר" on the
 * estimate), so nothing was lost, only moved. The service·city subtitle went
 * the same way, and is at the top of that screen. The `compact` prop went
 * with them: no caller ever passed it, and all it did was hide the two Facts
 * that are still here.
 */
export function CampaignCard({
  campaign,
  state,
  onPause,
  onResume,
  busy,
  href,
  media = null,
  nextTargetImage = null,
  hasPost = false,
  globalPaused = false,
  workerOnline,
}: {
  campaign: Pick<Campaign, 'id' | 'name' | 'service' | 'city' | 'status'>;
  state: CampaignState;
  /** The media of the post this run publishes — cover picked as the library does. */
  media?: MediaItem[] | null;
  /** The next group's picture, when the queue has one waiting. */
  nextTargetImage?: string | null;
  /** Whether the run has a post at all — an empty run gets no media slot. */
  hasPost?: boolean;
  /**
   * Whether ALL publishing is held from the header toggle, and whether the PC
   * that does the publishing has sent a heartbeat. Both are read by the page
   * and handed over; runBadge() decides what they mean. Without them this card
   * showed a green pulsing "רץ" under a header reading "המשך הכול", and kept
   * pulsing for a run whose laptop had been asleep since yesterday.
   */
  globalPaused?: boolean;
  workerOnline?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  busy?: boolean;
  href?: string;
}) {
  const link = href ?? `/social/campaigns/${campaign.id}`;
  /* Same rule as the library card: the first IMAGE, and failing that whatever
     media exists — picking media[0] blindly leaves a post whose first item is
     a video looking different here than it does in the library. */
  const cover = (media ?? []).find((m) => m.kind === 'image') ?? (media ?? [])[0] ?? null;
  /* One opinion about the run's state, from campaign.ts, for the label, the
     colour AND the dot. This card used to compute its own: `state.state ===
     'running'` lit a hard-coded green dot beside a badge the shared tone map
     painted blue — two colours for one fact, on the element whose whole job is
     to be read at a glance. */
  const badge = runBadge(state, { globalPaused, workerOnline });
  const badgeTone: Tone = badge.tone === 'info' ? 'brand' : badge.tone;
  /* A button is offered only when it can act. "השהה" used to be gated on the
     state NAME, so a run with nothing to hold back still offered it and
     toasted "הסבב הושהה." over a write that could not move a row. */
  const showPause = canPauseRun(state.progress, campaign.status);
  const showResume = canResumeRun(state.progress, campaign.status);

  return (
    <div className="surface rounded-card border border-ink-700 p-4">
      <header className="flex items-start justify-between gap-3">
        {/* What is going out, not just its name. A run card without the picture
            makes the owner open the post to remember which one this is. */}
        {!cover && hasPost && (
          /* The post has nothing attached. An empty corner reads as a picture
             that failed to load, so say what is missing — and make it the way
             to fix it, since the answer is always "open the post and add one". */
          <Link
            href={link}
            aria-label="לפוסט אין תמונה או סרטון — הוספת מדיה"
            className="flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-600 bg-ink-900 text-ink-500 transition-colors hover:border-brand-500 hover:text-brand-400"
          >
            <PlusIcon aria-hidden className="h-5 w-5" />
            <span className="text-[11px] font-bold leading-none">מדיה</span>
          </Link>
        )}
        {cover && (
          /* aria-hidden + tabIndex -1: the title link beside it goes to the
             same place and carries the name. Without this the card offered
             assistive technology two links to one destination, the second of
             them nameless (PostCover's img is alt=""). */
          <Link href={link} aria-hidden tabIndex={-1} className="block shrink-0">
            <PostCover media={media} />
          </Link>
        )}
        <div className="min-w-0 grow">
          {/* min-h-11: this is the primary way into a run from the list, and it
              measured 40px against the product's 44px floor — the identical
              control on the dashboard hero was given the floor for this reason. */}
          <Link href={link} dir="auto" className="block min-h-11 truncate py-1.5 text-lg font-extrabold text-mist-100 hover:text-brand-400">
            {campaign.name}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {badge.live && <span aria-hidden className={`pulse-dot h-2 w-2 rounded-full ${TONE_FILL[badgeTone]}`} />}
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      </header>

      <div className="mt-3">
        <CampaignProgressBar progress={state.progress} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 [&>*]:min-w-0">
        <Fact label="הפרסום הבא">
          {state.nextAt ? (
            <>
              <span className="tabular-nums">{whenLabel(state.nextAt)}</span>
              <span className="block text-[11px] font-semibold text-mist-500">{relativeHe(state.nextAt)}</span>
            </>
          ) : (
            <span className="text-mist-500">{showResume ? 'מושהה' : 'אין פרסום ממתין'}</span>
          )}
        </Fact>
        <Fact label="הקבוצה הבאה">
          {state.nextTargetName ? (
            <span className="flex items-center gap-1.5">
              <TargetAvatar name={state.nextTargetName} imageUrl={nextTargetImage} size={20} />
              <span dir="auto" className="min-w-0 truncate">
                {state.nextTargetName}
              </span>
            </span>
          ) : (
            <span className="text-mist-500">—</span>
          )}
        </Fact>
      </dl>

      <div className="mt-3.5 flex flex-wrap gap-2">
        {showResume && onResume && (
          <Button busy={busy} onClick={onResume}>
            המשך סבב
          </Button>
        )}
        {/* "השהה סבב" — this pauses THIS round. The header's global toggle,
            visible on the same screen, pauses EVERYTHING and carried the
            identical word. */}
        {showPause && onPause && (
          <Button variant="secondary" busy={busy} onClick={onPause}>
            השהה סבב
          </Button>
        )}
        <Link href={link} className="ms-auto inline-flex min-h-11 items-center rounded-xl bg-ink-800 px-4 text-sm font-bold text-mist-100">
          פתח סבב
        </Link>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-700 px-3 py-2">
      <dt className="text-[11px] font-bold text-mist-500">{label}</dt>
      <dd dir="auto" className="truncate text-sm font-bold text-mist-100">{children}</dd>
    </div>
  );
}

/** Today shows a bare time; another day needs its date to mean anything. */
function whenLabel(iso: string): string {
  return ltr(zonedDateISO(new Date(iso)) === zonedDateISO(new Date()) ? formatTimeHe(iso) : formatDateTimeHe(iso));
}
