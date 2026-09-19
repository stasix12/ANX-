'use client';

import type { QueueRow } from '@/lib/social/client';
import { formatDateHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import { TargetAvatar } from './TargetAvatar';
import { EmptyState } from './ui';
import { CalendarIcon } from '@/components/icons';

/**
 * What is about to happen, as a vertical strip you can read in a second:
 * time, group, and a rail connecting them in order. Vertical on every width —
 * on a phone a horizontal timeline is a scroll container nobody scrolls, and
 * on a desktop the same column sits comfortably beside the campaign's stats.
 *
 * Times come from the queue rows themselves; nothing here is interpolated.
 */

const DOT: Record<string, string> = {
  publishing: 'bg-amber-500 ring-4 ring-amber-500/20',
  awaiting_confirmation: 'bg-fuchsia-500 ring-4 ring-fuchsia-500/20',
  published: 'bg-emerald-500',
  failed: 'bg-rose-500',
  skipped: 'bg-slate-400',
  needs_attention: 'bg-orange-500 ring-4 ring-orange-500/20',
  manual_pending: 'bg-violet-500',
  paused: 'bg-slate-400',
  scheduled: 'bg-sky-500',
};

export function Timeline({ rows, limit = 8 }: { rows: QueueRow[]; limit?: number }) {
  const items = rows.slice(0, limit);
  if (!items.length) {
    return <EmptyState icon={<CalendarIcon className="h-5 w-5" />} title="אין פרסום מתוכנן" description="כשתתזמנו קמפיין, סדר הפרסומים יופיע כאן לפי שעות." />;
  }

  const today = zonedDateISO(new Date());
  return (
    <ol className="relative space-y-0.5">
      {items.map((row, i) => {
        const day = zonedDateISO(new Date(row.scheduled_at));
        const showDay = day !== today && (i === 0 || zonedDateISO(new Date(items[i - 1].scheduled_at)) !== day);
        const active = row.status === 'publishing' || row.status === 'awaiting_confirmation';
        return (
          <li key={row.id}>
            {showDay && <p className="mb-1 mt-3 text-[11px] font-extrabold uppercase tracking-wide text-mist-500">{formatDateHe(row.scheduled_at)}</p>}
            <div className="flex items-stretch gap-3">
              {/* The rail: a dot per stop, a line between them. */}
              <div className="flex w-3 shrink-0 flex-col items-center pt-3.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[row.status] ?? 'bg-ink-600'}`} />
                {i < items.length - 1 && <span aria-hidden className="w-px grow bg-ink-600" />}
              </div>
              <div className={`flex min-w-0 grow items-center gap-2.5 rounded-xl px-2 py-2 ${active ? 'bg-amber-500/5' : ''}`}>
                <span className="w-12 shrink-0 text-sm font-extrabold tabular-nums text-brand-400">{formatTimeHe(row.scheduled_at)}</span>
                <TargetAvatar name={row.target?.name ?? '?'} imageUrl={row.target?.image_url} channel={row.target?.channel} size={30} />
                <div className="min-w-0 grow">
                  <p dir="auto" className="truncate text-sm font-bold text-mist-100">{row.target?.name ?? 'יעד'}</p>
                  {row.status === 'scheduled' && <p className="text-[11px] text-mist-500">{relativeHe(row.scheduled_at)}</p>}
                  {active && <p className="text-[11px] font-bold text-amber-700">מפרסם עכשיו</p>}
                </div>
              </div>
            </div>
          </li>
        );
      })}
      {rows.length > items.length && (
        <li className="ps-6 pt-1.5 text-xs text-mist-500">ועוד {rows.length - items.length} פרסומים אחריהם</li>
      )}
    </ol>
  );
}
