'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronIcon } from '@/components/icons';
import { RUN_STATE_LABEL, openRows, percentPublished, unpublishedNote, type CampaignState } from '@/lib/social/campaign';
import { countdownTo } from '@/lib/social/countdown';
import { formatTimeHe } from '@/lib/social/time';
import type { Campaign, MediaItem, SocialTarget } from '@/lib/social/types';
import { PostCover } from './PostCover';
import { TargetAvatar } from './TargetAvatar';
import { Button, ButtonLink, CARD, TONE_TEXT, TONE_TINT } from './ui';

/**
 * What is going out right now — the one thing the owner opens this app to see.
 *
 * Deliberately the same card skin as everything else. An earlier version
 * painted this panel in a blue gradient to make it the subject of the screen;
 * it read as a demo banner. Prominence comes from position, from one extra
 * step of padding, and from the size of the figures — the published count and
 * the countdown are both 28px. Colour is kept for state: the status pill, the
 * progress fill, and nothing else.
 *
 * Every number is derived from real queue rows — the count, the percentage,
 * the next instant and the next group all come from campaignState() or from
 * the queue itself. When nothing is pending there is no countdown rather than
 * a placeholder clock.
 */

function HeroPanel({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }) {
  return (
    <section aria-label={ariaLabel} className={`${CARD} p-5`}>
      {children}
    </section>
  );
}

/** The status pill: a dot while something is genuinely in flight. */
function StatePill({ label, live }: { label: string; live: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        live ? `${TONE_TINT.good} ${TONE_TEXT.good}` : 'bg-ink-800 text-mist-300'
      }`}
    >
      {live && <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-success-400" />}
      {label}
    </span>
  );
}

/** "18 / 125" is digits around a neutral slash, which an RTL line reorders. */
function Ratio({ done, total, suffix }: { done: number; total: number; suffix: string }) {
  return (
    <p className="text-sm font-bold text-mist-500">
      <span dir="ltr" className="inline-block">
        <span className="text-[28px] font-extrabold leading-none tabular-nums text-mist-100">{done}</span>
        <span> / {total}</span>
      </span>
      <span> {suffix}</span>
    </p>
  );
}

/** The shape of the row shared by the button and the plain-div variants. */
const NEXT_UP_BOX = 'mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-ink-900 px-3 py-2.5';

/**
 * "The next publication, in 00:20 — <group>".
 *
 * The picture is the group's own, from the queue row the countdown was derived
 * from; when the worker has not copied one yet TargetAvatar draws its lettered
 * fallback rather than a broken image. Given `onOpen` the whole row becomes a
 * real button onto the queue tuner — hence the chevron, so it reads as tappable.
 */
function NextUp({
  at,
  targetName,
  now,
  target,
  onOpen,
}: {
  at: string;
  targetName: string | null;
  now: number;
  target?: Pick<SocialTarget, 'name' | 'image_url'> | null;
  onOpen?: () => void;
}) {
  const left = countdownTo(at, now);
  if (!left) return null;
  const name = target?.name ?? targetName;

  const body = (
    <>
      {/* shrink-0: the countdown is the subject here, so it is the group beside it that gives way. */}
      <div className="shrink-0 text-start">
        <p className="text-[11px] font-bold text-mist-500">{left.due ? 'הפרסום הבא — מתבצע כעת' : 'הפרסום הבא בעוד'}</p>
        {/* mm:ss around a neutral colon, which an RTL line reorders. */}
        <p className="text-[28px] font-extrabold leading-none text-mist-100">
          <span dir="ltr" className="inline-block tabular-nums">{left.due ? formatTimeHe(at) : left.label}</span>
        </p>
      </div>
      {name && (
        <div className="flex min-w-0 items-center gap-2">
          <TargetAvatar name={name} imageUrl={target?.image_url} size={32} />
          <p dir="auto" className="min-w-0 truncate text-sm font-bold text-mist-300">
            {name}
          </p>
        </div>
      )}
      {onOpen && <ChevronIcon aria-hidden className="h-4 w-4 shrink-0 text-mist-500 rtl:rotate-180" />}
    </>
  );

  if (!onOpen) return <div className={NEXT_UP_BOX}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${NEXT_UP_BOX} text-start transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-850`}
    >
      {body}
      <span className="sr-only">— שינוי המרווח בין הפרסומים והקבוצות בתור</span>
    </button>
  );
}


/** Ticks once a second, and only while there is something to count down to. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function LiveCampaignHero({
  campaign,
  state,
  onPause,
  onResume,
  busy,
  nextTarget,
  onTune,
  onReset,
  media = null,
}: {
  campaign: Pick<Campaign, 'id' | 'name' | 'service' | 'city'>;
  state: CampaignState;
  onPause?: () => void;
  onResume?: () => void;
  onReset?: () => void;
  busy?: boolean;
  /** The media of the post this run publishes — same tile as the run card. */
  media?: MediaItem[] | null;
  nextTarget?: Pick<SocialTarget, 'name' | 'image_url'> | null;
  onTune?: () => void;
}) {
  const running = state.state === 'running';
  const paused = state.state === 'paused';
  const { progress } = state;
  // The bar is publications over the whole run. It used to be
  // published + failed + skipped, so a run that published nothing filled the
  // bar to 100% and called it "הושלמו" — the owner lost an evening to a run
  // that read 80% complete having published zero.
  const pct = percentPublished(progress);
  const open = openRows(progress);
  const unpublished = unpublishedNote(progress);
  // A button is offered only when it can act: nothing is left to pause once
  // every row has finished, and nothing is left to resume either.
  const canPause = open > 0 && state.state !== 'stopped';
  const now = useTick(Boolean(state.nextAt));

  return (
    <HeroPanel ariaLabel="הסבב הפעיל">
      <div className="flex items-start justify-between gap-3">
        <PostCover media={media} />
        <div className="min-w-0 grow">
          {/* py-1.5, the same as CampaignCard's title link: this is the same
              control on a different screen and it was measuring 32px tall here
              against 40px there. */}
          <Link href={`/social/campaigns/${campaign.id}`} dir="auto" className="block truncate py-1.5 text-lg font-extrabold text-mist-100">
            {campaign.name}
          </Link>
          {[campaign.service, campaign.city].filter(Boolean).length > 0 && (
            <p dir="auto" className="truncate text-xs text-mist-500">
              {[campaign.service, campaign.city].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <StatePill label={RUN_STATE_LABEL[state.state]} live={running} />
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <Ratio done={progress.published} total={progress.total} suffix="פורסמו" />
          <p className="text-lg font-extrabold tabular-nums text-brand-400">{pct}%</p>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progress.published} מתוך ${progress.total} פורסמו`}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink-700"
        >
          <div className="h-full rounded-full bg-success-400 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
        {/* What became of the rest, in the same breath as the bar — one word
            per outcome instead of one word covering three. Nothing is printed
            when there is nothing to print; a zero here would be noise. */}
        {(unpublished || open > 0) && (
          <p className="mt-1.5 text-xs text-mist-500">
            {[unpublished, open > 0 ? `${open} עוד ממתינים` : ''].filter(Boolean).join(' · ')}
          </p>
        )}
        {state.truncated && (
          <p className="mt-1.5 text-xs text-warning-400">
            הסבב גדול מכדי לספור אותו כאן במלואו — המספרים למעלה הם של הפרסומים הראשונים בלבד. הרשימה המלאה בעמוד הסבב.
          </p>
        )}
      </div>

      {state.nextAt && <NextUp at={state.nextAt} targetName={state.nextTargetName} now={now} target={nextTarget} onOpen={onTune} />}

      <div className="mt-3 flex gap-2">
        {paused ? (
          <Button size="lg" className="grow" busy={busy} onClick={onResume}>
            המשך סבב
          </Button>
        ) : (
          canPause && (
            <Button variant="secondary" size="lg" className="grow" busy={busy} onClick={onPause}>
              השהה
            </Button>
          )
        )}
        <ButtonLink href={`/social/campaigns/${campaign.id}`} size="lg" className="grow">צפה בסבב</ButtonLink>
      </div>

      {/* The counter belongs to this run, and this run is what the card is
          about. Closing it is how the owner says "that round is done" - the
          next launch of the post opens a fresh run counting from zero, instead
          of adding to a total that only ever grows. */}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="mt-2 min-h-11 w-full rounded-xl text-sm font-bold text-mist-500 transition-colors hover:bg-ink-900 hover:text-mist-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-850 disabled:text-ink-600"
        >
          סיים את הסבב ואפס את המונה
        </button>
      )}
    </HeroPanel>
  );
}

/**
 * The same panel when the queued work belongs to no campaign.
 *
 * A post scheduled straight from the editor carries no campaign_id, so the
 * dashboard would otherwise say "no active campaign" while two dozen
 * publications were queued and going out.
 */
export function LiveQueueHero({
  scheduled,
  publishedToday,
  dailyTarget,
  paused,
  nextAt,
  nextTargetName,
  onRunNow,
  busy,
  nextTarget,
  onTune,
  media = null,
}: {
  scheduled: number;
  publishedToday: number;
  dailyTarget: number;
  paused: boolean;
  nextAt: string | null;
  nextTargetName: string | null;
  onRunNow?: () => void;
  busy?: boolean;
  nextTarget?: Pick<SocialTarget, 'name' | 'image_url'> | null;
  onTune?: () => void;
  media?: MediaItem[] | null;
}) {
  const now = useTick(Boolean(nextAt) && !paused);
  const live = !paused && scheduled > 0;

  return (
    <HeroPanel ariaLabel="מצב התור">
      <div className="flex items-start justify-between gap-3">
        <PostCover media={media} />
        <div className="min-w-0 grow">
          <p className="truncate text-lg font-extrabold text-mist-100">
            {scheduled > 0 ? `${scheduled} פרסומים בתור` : 'אין פרסומים בתור'}
          </p>
          <p className="truncate text-xs text-mist-500">התור הפעיל — לא משויך לסבב</p>
        </div>
        <StatePill label={paused ? 'מושהה' : scheduled > 0 ? 'פעיל' : 'ממתין'} live={live} />
      </div>

      <div className="mt-3">
        <Ratio done={publishedToday} total={dailyTarget} suffix="פורסמו היום, מתוך התקרה שהגדרתם" />
      </div>

      {nextAt && !paused && <NextUp at={nextAt} targetName={nextTargetName} now={now} target={nextTarget} onOpen={onTune} />}

      <div className="mt-3 flex gap-2">
        {onRunNow && (
          <Button variant="secondary" size="lg" className="grow" busy={busy} onClick={onRunNow}>
            פרסם עכשיו
          </Button>
        )}
        <ButtonLink href="/social/history?status=scheduled" size="lg" className="grow">צפה בתור</ButtonLink>
      </div>
    </HeroPanel>
  );
}
