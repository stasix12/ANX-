'use client';

import { formatDateTimeHe, relativeHe } from '@/lib/social/time';
import type { ActivityEntry } from '@/lib/social/types';
import { Empty } from './ui';

/**
 * The activity log rendered as a feed a person can skim: one icon per event
 * kind, the sentence, and how long ago. The raw event name and metadata stay
 * in the database for debugging — they are not shown here.
 */
const EVENT_ICON: Record<string, string> = {
  published: '✅',
  publish_failed: '❌',
  needs_attention: '⚠️',
  skipped: '⏭️',
  deferred: '⏲️',
  planned: '🗓️',
  drip_planned: '🗓️',
  connected: '🔗',
  disconnected: '🔌',
  browser_needs_auth: '🔐',
  connect_failed: '🔐',
  rate_limit: '🐢',
  worker_started: '🟢',
  worker_stopped: '🔴',
  targets_synced: '🔄',
  manual_pending: '✋',
  retry: '🔁',
  cancelled: '🚫',
  cta_dropped: 'ℹ️',
};

export function ActivityFeed({ entries, limit = 12 }: { entries: ActivityEntry[]; limit?: number }) {
  if (!entries.length) return <Empty>עדיין אין פעילות. כשתתחילו לפרסם, כל פעולה תופיע כאן.</Empty>;
  return (
    <ul className="space-y-2.5">
      {entries.slice(0, limit).map((e) => (
        <li key={e.id} className="flex items-start gap-2.5">
          <span aria-hidden className="mt-0.5 text-base leading-none">
            {EVENT_ICON[e.event] ?? (e.level === 'error' ? '❌' : e.level === 'warn' ? '⚠️' : 'ℹ️')}
          </span>
          <div className="min-w-0 grow">
            <p className={`text-sm leading-snug ${e.level === 'error' ? 'text-rose-700' : 'text-mist-100'}`}>{e.message}</p>
            <p className="text-[11px] text-mist-500" title={formatDateTimeHe(e.at)}>
              {relativeHe(e.at)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
