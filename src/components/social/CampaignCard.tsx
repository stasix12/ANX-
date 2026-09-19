'use client';

import Link from 'next/link';
import { RUN_STATE_LABEL, RUN_STATE_TONE, type CampaignState } from '@/lib/social/campaign';
import { formatDateTimeHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import { ltr } from './DateTime';
import type { Campaign, MediaItem } from '@/lib/social/types';
import { PlusIcon } from '@/components/icons';
import { CampaignProgressBar } from './CampaignProgressBar';
import { PostCover } from './PostCover';
import { TargetAvatar } from './TargetAvatar';
import { Badge, Button } from './ui';

/**
 * The campaign as a control surface: who it is, how far it has got, and the
 * two facts that decide whether the owner needs to do anything — when the
 * next publication goes out and to which group.
 *
 * Both of those come straight from the queue's own rows. When there is no
 * next row (paused, finished, stopped) the card says that instead of showing
 * a filler time.
 */
export function CampaignCard({
  campaign,
  state,
  onPause,
  onResume,
  busy,
  href,
  compact = false,
  media = null,
  nextTargetImage = null,
  hasPost = false,
}: {
  campaign: Pick<Campaign, 'id' | 'name' | 'service' | 'city' | 'status'>;
  state: CampaignState;
  /** The media of the post this run publishes — cover picked as the library does. */
  media?: MediaItem[] | null;
  /** The next group's picture, when the queue has one waiting. */
  nextTargetImage?: string | null;
  /** Whether the run has a post at all — an empty run gets no media slot. */
  hasPost?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  busy?: boolean;
  href?: string;
  compact?: boolean;
}) {
  const link = href ?? `/social/campaigns/${campaign.id}`;
  /* Same rule as the library card: the first IMAGE, and failing that whatever
     media exists — picking media[0] blindly leaves a post whose first item is
     a video looking different here than it does in the library. */
  const cover = (media ?? []).find((m) => m.kind === 'image') ?? (media ?? [])[0] ?? null;
  const running = state.state === 'running';
  const paused = state.state === 'paused';

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
          <Link href={link} className="block shrink-0">
            <PostCover media={media} />
          </Link>
        )}
        <div className="min-w-0 grow">
          <Link href={link} dir="auto" className="block truncate py-1.5 text-lg font-extrabold text-mist-100 hover:text-brand-400">
            {campaign.name}
          </Link>
          <p className="mt-0.5 truncate text-xs text-mist-500">
            {[campaign.service, campaign.city].filter(Boolean).join(' · ') || 'סבב'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {running && <span aria-hidden className="pulse-dot h-2 w-2 rounded-full bg-success-400" />}
          <Badge tone={RUN_STATE_TONE[state.state]}>{RUN_STATE_LABEL[state.state]}</Badge>
        </div>
      </header>

      <div className="mt-3">
        <CampaignProgressBar progress={state.progress} />
      </div>

      {!compact && (
        <dl className="mt-3 grid grid-cols-2 gap-2 [&>*]:min-w-0">
          <Fact label="הפרסום הבא">
            {state.nextAt ? (
              <>
                <span className="tabular-nums">{whenLabel(state.nextAt)}</span>
                <span className="block text-[11px] font-semibold text-mist-500">{relativeHe(state.nextAt)}</span>
              </>
            ) : (
              <span className="text-mist-500">{paused ? 'מושהה' : 'אין פרסום ממתין'}</span>
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
          <Fact label="התחיל">{state.startedAt ? <span className="tabular-nums">{whenLabel(state.startedAt)}</span> : <span className="text-mist-500">טרם התחיל</span>}</Fact>
          <Fact label="סיום משוער">
            {state.estimatedCompletionAt ? (
              <span className="tabular-nums">{whenLabel(state.estimatedCompletionAt)}</span>
            ) : (
              <span className="text-mist-500">{state.state === 'completed' ? 'הסתיים' : '—'}</span>
            )}
          </Fact>
        </dl>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2">
        {paused && onResume && (
          <Button busy={busy} onClick={onResume}>
            המשך סבב
          </Button>
        )}
        {!paused && state.state !== 'completed' && state.state !== 'stopped' && onPause && (
          <Button variant="secondary" busy={busy} onClick={onPause}>
            השהה
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
