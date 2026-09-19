'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RUN_STATE_LABEL, percentDone, type CampaignState } from '@/lib/social/campaign';
import { countdownTo } from '@/lib/social/countdown';
import { formatTimeHe } from '@/lib/social/time';
import type { Campaign } from '@/lib/social/types';
import { Button, ButtonLink, CARD } from './ui';

/**
 * What is going out right now — the one thing the owner opens this app to see.
 *
 * Deliberately a white card like everything else. An earlier version painted
 * this panel in a blue gradient to make it the subject of the screen; it read
 * as a demo banner. Prominence comes from position and from the size of the
 * figures, and colour is kept for state: the status pill, the progress fill,
 * and nothing else.
 *
 * Every number is derived from real queue rows — the count, the percentage,
 * the next instant and the next group all come from campaignState() or from
 * the queue itself. When nothing is pending there is no countdown rather than
 * a placeholder clock.
 */

function HeroPanel({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }) {
  return (
    <section aria-label={ariaLabel} className={`${CARD} p-4`}>
      {children}
    </section>
  );
}

/** The status pill: a dot while something is genuinely in flight. */
function StatePill({ label, live }: { label: string; live: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
        live ? 'bg-emerald-500/10 text-emerald-700' : 'bg-ink-800 text-mist-500'
      }`}
    >
      {live && <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
      {label}
    </span>
  );
}

/** "18 / 125" is digits around a neutral slash, which an RTL line reorders. */
function Ratio({ done, total, suffix }: { done: number; total: number; suffix: string }) {
  return (
    <p className="text-sm font-bold text-mist-500">
      <span dir="ltr" className="inline-block">
        <span className="text-2xl font-extrabold tabular-nums text-mist-100">{done}</span>
        <span> / {total}</span>
      </span>
      <span> {suffix}</span>
    </p>
  );
}

function NextUp({ at, targetName, now }: { at: string; targetName: string | null; now: number }) {
  const left = countdownTo(at, now);
  if (!left) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-ink-900 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-mist-500">{left.due ? 'הפרסום הבא — מתבצע כעת' : 'הפרסום הבא בעוד'}</p>
        <p className="tabular-nums text-xl font-extrabold leading-tight text-mist-100">{left.due ? formatTimeHe(at) : left.label}</p>
      </div>
      {targetName && (
        <p dir="auto" className="min-w-0 max-w-[45%] truncate text-end text-sm font-bold text-mist-300">
          {targetName}
        </p>
      )}
    </div>
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
}: {
  campaign: Pick<Campaign, 'id' | 'name' | 'service' | 'city'>;
  state: CampaignState;
  onPause?: () => void;
  onResume?: () => void;
  busy?: boolean;
}) {
  const running = state.state === 'running';
  const paused = state.state === 'paused';
  const pct = percentDone(state.progress);
  const now = useTick(Boolean(state.nextAt));

  return (
    <HeroPanel ariaLabel="הקמפיין הפעיל">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/social/campaigns/${campaign.id}`} dir="auto" className="block truncate py-0.5 text-lg font-extrabold text-mist-100">
            {campaign.name}
          </Link>
          <p dir="auto" className="truncate text-xs text-mist-500">
            {[campaign.service, campaign.city].filter(Boolean).join(' · ') || 'קמפיין'}
          </p>
        </div>
        <StatePill label={RUN_STATE_LABEL[state.state]} live={running} />
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <Ratio done={state.progress.done} total={state.progress.total} suffix="הושלמו" />
          <p className="text-lg font-extrabold tabular-nums text-brand-500">{pct}%</p>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="התקדמות הקמפיין"
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800"
        >
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {state.nextAt && <NextUp at={state.nextAt} targetName={state.nextTargetName} now={now} />}

      <div className="mt-3 flex gap-2">
        {paused ? (
          <Button className="grow" busy={busy} onClick={onResume}>
            המשך קמפיין
          </Button>
        ) : (
          <Button variant="secondary" className="grow" busy={busy} onClick={onPause}>
            השהה
          </Button>
        )}
        <ButtonLink href={`/social/campaigns/${campaign.id}`} className="grow">צפה בקמפיין</ButtonLink>
      </div>
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
}: {
  scheduled: number;
  publishedToday: number;
  dailyTarget: number;
  paused: boolean;
  nextAt: string | null;
  nextTargetName: string | null;
  onRunNow?: () => void;
  busy?: boolean;
}) {
  const now = useTick(Boolean(nextAt) && !paused);
  const live = !paused && scheduled > 0;

  return (
    <HeroPanel ariaLabel="מצב התור">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold text-mist-100">
            {scheduled > 0 ? `${scheduled} פרסומים בתור` : 'אין פרסומים בתור'}
          </p>
          <p className="truncate text-xs text-mist-500">התור הפעיל — לא משויך לקמפיין</p>
        </div>
        <StatePill label={paused ? 'מושהה' : scheduled > 0 ? 'פעיל' : 'ממתין'} live={live} />
      </div>

      <div className="mt-3">
        <Ratio done={publishedToday} total={dailyTarget} suffix="פורסמו היום, מתוך התקרה שהגדרתם" />
      </div>

      {nextAt && !paused && <NextUp at={nextAt} targetName={nextTargetName} now={now} />}

      <div className="mt-3 flex gap-2">
        {onRunNow && (
          <Button variant="secondary" className="grow" busy={busy} onClick={onRunNow}>
            פרסם עכשיו
          </Button>
        )}
        <ButtonLink href="/social/history?status=scheduled" className="grow">צפה בתור</ButtonLink>
      </div>
    </HeroPanel>
  );
}
