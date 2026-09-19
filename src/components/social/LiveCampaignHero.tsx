'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RUN_STATE_LABEL, percentDone, type CampaignState } from '@/lib/social/campaign';
import { countdownTo } from '@/lib/social/countdown';
import { formatTimeHe } from '@/lib/social/time';
import type { Campaign } from '@/lib/social/types';
import { Button } from './ui';

/**
 * The one thing the owner opens this app to see: what is going out right now.
 *
 * It leads the dashboard as a filled panel rather than another white card,
 * so the running campaign is unmistakably the subject of the screen and
 * everything below it is context.
 *
 * Every figure is derived from the campaign's own queue rows — the count, the
 * percentage, the next instant and the next group name all come from
 * campaignState(). When there is no next row (paused, finished, stopped) the
 * clock is not rendered at all rather than filled with a placeholder.
 */
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

  /*
   * Ticks only while something is actually pending. A finished or paused
   * campaign has no next instant, so there is no interval to run.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state.nextAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.nextAt]);
  const left = countdownTo(state.nextAt, now);

  return (
    <section
      aria-label="קמפיין פעיל עכשיו"
      className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white shadow-lg shadow-brand-500/25"
    >
      {/* A soft highlight so the panel reads as a surface rather than a flat fill. */}
      <div aria-hidden className="pointer-events-none absolute -top-16 -end-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

      <div className="relative">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">קמפיין פעיל עכשיו</p>
            <Link href={`/social/campaigns/${campaign.id}`} dir="auto" className="block truncate py-1.5 text-lg font-extrabold text-white">
              {campaign.name}
            </Link>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold ring-1 ring-inset ring-white/25">
            {running && <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />}
            {RUN_STATE_LABEL[state.state]}
          </span>
        </header>

        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold">
              {/* The count is its own LTR run: digits around a neutral slash
                  reorder to "125 / 18" inside an RTL line. The Hebrew word
                  stays outside it so the sentence still reads right-to-left. */}
              <span dir="ltr" className="inline-block">
                <span className="text-2xl font-extrabold tabular-nums">{state.progress.done}</span>
                <span className="text-white/70"> / {state.progress.total}</span>
              </span>
              <span className="text-white/70"> הושלמו</span>
            </p>
            <p className="text-lg font-extrabold tabular-nums text-white/90">{pct}%</p>
          </div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="התקדמות הקמפיין"
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/25"
          >
            <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* The next publication: only rendered when the queue really holds one. */}
        {left && state.nextAt && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-inset ring-white/15">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white/70">{left.due ? 'הפרסום הבא — מתבצע כעת' : 'הפרסום הבא בעוד'}</p>
              <p className="tabular-nums text-xl font-extrabold leading-tight">
                {left.due ? formatTimeHe(state.nextAt) : left.label}
              </p>
            </div>
            {state.nextTargetName && (
              <p dir="auto" className="min-w-0 max-w-[45%] truncate text-end text-sm font-bold text-white/90">
                {state.nextTargetName}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          {paused ? (
            <Button className="grow !bg-white !text-brand-700" busy={busy} onClick={onResume}>
              המשך קמפיין
            </Button>
          ) : (
            <Button className="grow !bg-white/15 !text-white ring-1 ring-inset ring-white/30" busy={busy} onClick={onPause}>
              השהה
            </Button>
          )}
          <Link href={`/social/campaigns/${campaign.id}`} className="grow">
            <Button className="w-full !bg-white !text-brand-700">צפה בקמפיין</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
