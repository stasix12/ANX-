'use client';

import { useMemo } from 'react';
import type { QueueRow } from '@/lib/social/client';
import { PublicationItem, type PublicationActions } from './PublicationItem';
import { EmptyState } from './ui';
import { AUTOMATIC_WAITING_STATUSES, IN_FLIGHT_STATUSES, NEEDS_HUMAN_STATUSES, TERMINAL_STATUSES } from '@/lib/social/status';
import { SendIcon } from '@/components/icons';

/**
 * The live queue in the three states a person actually asks about: what is
 * going out right now, what is next, and what is already done. Anything
 * waiting for a human (a confirmation, a checkpoint, a manual post) is
 * pulled to the top, because that is the only part of the list where nothing
 * moves until the owner acts.
 */

/* The one classification, so a section heading and a tile counting the same
   rows cannot disagree about what those rows are. */
const NEEDS_HUMAN: string[] = NEEDS_HUMAN_STATUSES;
const IN_FLIGHT: string[] = IN_FLIGHT_STATUSES;
const FINISHED: string[] = TERMINAL_STATUSES;
const NEXT_UP: string[] = AUTOMATIC_WAITING_STATUSES;

export function QueueSections({
  rows,
  actions,
  doneLimit = 10,
  nextLimit = 12,
  emptyTitle = 'אין פרסומים פעילים',
  emptyDescription = 'צרו פוסט, בחרו קבוצות ולחצו "התחל פרסום" — התור יופיע כאן בזמן אמת.',
  emptyAction,
}: {
  rows: QueueRow[];
  actions?: PublicationActions;
  doneLimit?: number;
  nextLimit?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  const { attention, now, next, done } = useMemo(() => {
    const byTime = [...rows].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return {
      attention: byTime.filter((r) => NEEDS_HUMAN.includes(r.status)),
      now: byTime.filter((r) => IN_FLIGHT.includes(r.status)),
      next: byTime.filter((r) => NEXT_UP.includes(r.status)),
      done: [...rows]
        .filter((r) => FINISHED.includes(r.status))
        .sort((a, b) => (b.published_at ?? b.scheduled_at).localeCompare(a.published_at ?? a.scheduled_at)),
    };
  }, [rows]);

  if (!rows.length) {
    return <EmptyState icon={<SendIcon className="h-5 w-5" />} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="space-y-4">
      <Group title="דורשים אתכם" tone="text-warning-400" items={attention} actions={actions} />
      <Group title="מפרסם עכשיו" tone="text-brand-400" items={now} actions={actions} pulse />
      <Group title="הבאים בתור" tone="text-brand-400" items={next.slice(0, nextLimit)} actions={actions} showDate more={next.length - nextLimit} />
      <Group title="הושלמו" tone="text-success-400" items={done.slice(0, doneLimit)} actions={actions} more={done.length - doneLimit} />
    </div>
  );
}

function Group({
  title,
  tone,
  items,
  actions,
  showDate,
  more = 0,
  pulse = false,
}: {
  title: string;
  tone: string;
  items: QueueRow[];
  actions?: PublicationActions;
  showDate?: boolean;
  more?: number;
  pulse?: boolean;
}) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className={`mb-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide ${tone}`}>
        {pulse && <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
        {title}
        <span className="text-mist-500">({items.length + Math.max(0, more)})</span>
      </h3>
      <ul className="divide-y divide-ink-700">
        {items.map((row) => (
          <PublicationItem key={row.id} row={row} actions={actions} showDate={showDate} />
        ))}
      </ul>
      {more > 0 && <p className="pt-1.5 text-xs text-mist-500">ועוד {more}</p>}
    </section>
  );
}
