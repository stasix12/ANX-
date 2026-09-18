'use client';

import Link from 'next/link';
import { RUN_STATE_LABEL, RUN_STATE_TONE, type CampaignState } from '@/lib/social/campaign';
import { formatDateTimeHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import type { Campaign } from '@/lib/social/types';
import { CampaignProgressBar } from './CampaignProgressBar';
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
}: {
  campaign: Pick<Campaign, 'id' | 'name' | 'service' | 'city' | 'status'>;
  state: CampaignState;
  onPause?: () => void;
  onResume?: () => void;
  busy?: boolean;
  href?: string;
  compact?: boolean;
}) {
  const link = href ?? `/social/campaigns/${campaign.id}`;
  const running = state.state === 'running';
  const paused = state.state === 'paused';

  return (
    <div className="surface rounded-card border border-ink-700 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={link} className="block truncate text-lg font-extrabold text-mist-100 hover:text-brand-400">
            {campaign.name}
          </Link>
          <p className="mt-0.5 truncate text-xs text-mist-500">
            {[campaign.service, campaign.city].filter(Boolean).join(' · ') || 'קמפיין'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {running && <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
          <Badge tone={RUN_STATE_TONE[state.state]}>{RUN_STATE_LABEL[state.state]}</Badge>
        </div>
      </header>

      <div className="mt-3">
        <CampaignProgressBar progress={state.progress} />
      </div>

      {!compact && (
        <dl className="mt-3 grid grid-cols-2 gap-2">
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
            {state.nextTargetName ? <span className="truncate">{state.nextTargetName}</span> : <span className="text-mist-500">—</span>}
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
            ▶ המשך קמפיין
          </Button>
        )}
        {!paused && state.state !== 'completed' && state.state !== 'stopped' && onPause && (
          <Button variant="secondary" busy={busy} onClick={onPause}>
            ⏸ השהה
          </Button>
        )}
        <Link href={link} className="ms-auto inline-flex min-h-11 items-center rounded-xl bg-ink-800 px-4 text-sm font-bold text-mist-100">
          פתח קמפיין
        </Link>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-600 px-3 py-2">
      <dt className="text-[11px] font-bold text-mist-500">{label}</dt>
      <dd className="truncate text-sm font-bold text-mist-100">{children}</dd>
    </div>
  );
}

/** Today shows a bare time; another day needs its date to mean anything. */
function whenLabel(iso: string): string {
  return zonedDateISO(new Date(iso)) === zonedDateISO(new Date()) ? formatTimeHe(iso) : formatDateTimeHe(iso);
}
