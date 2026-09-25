'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cancelQueueItem, getQueueItem, retryQueueItem, type QueueRow } from '@/lib/social/client';
import { friendlyMessage } from '@/lib/social/errors';
import { explainFailure } from './ErrorDetail';
import { Stamp } from './DateTime';
import { TargetAvatar } from './TargetAvatar';
import { Button, Sheet, SkeletonList, StatusPill, useToast } from './ui';

/**
 * What one line of the activity log was actually about.
 *
 * The log stores a sentence and a `meta.queueId`; the publication itself — the
 * group, the status, the error, the permalink — lives in social_queue. Rather
 * than widen the log with copies of those fields (a second source of truth for
 * every one of them), this reads the row on demand, when the owner taps the
 * line. One read per tap, no poll, nothing cached: the sheet cannot show a
 * status that has drifted from the table, because it has just come from it.
 *
 * The actions are the existing guarded writes, the same two the history screen
 * and the group profile use. Both return false rather than throwing when the
 * row has already moved on, and that is reported as what it is — a stale
 * screen, not a failure.
 */
export function ActivityDetailSheet({
  queueId,
  onClose,
  onChanged,
}: {
  /** The row to show. null closes the sheet. */
  queueId: string | null;
  onClose: () => void;
  /** Told after a write, so the screen that owns the data re-reads it. */
  onChanged?: () => void;
}) {
  const [row, setRow] = useState<QueueRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'retry' | 'cancel'>('');
  const toast = useToast();

  useEffect(() => {
    if (!queueId) return;
    let stopped = false;
    setRow(null);
    setError(null);
    getQueueItem(queueId)
      .then((r) => {
        if (!stopped) setRow(r);
      })
      .catch((err) => {
        if (!stopped) setError(friendlyMessage(err, 'לא הצלחנו לטעון את פרטי הפרסום.'));
      });
    return () => {
      stopped = true;
    };
  }, [queueId]);

  async function act(kind: 'retry' | 'cancel') {
    if (!queueId) return;
    setBusy(kind);
    try {
      const moved = kind === 'retry' ? await retryQueueItem(queueId) : await cancelQueueItem(queueId);
      if (!moved) {
        toast('הפרסום כבר התקדם בינתיים — רענַנּו את המסך.', 'info');
      } else {
        toast(kind === 'retry' ? 'הפרסום הוחזר לתור.' : 'הפרסום בוטל.', kind === 'retry' ? 'success' : 'info');
      }
      onChanged?.();
      onClose();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusy('');
    }
  }

  const failure = row ? explainFailure(row) : null;

  return (
    <Sheet open={Boolean(queueId)} onClose={onClose} title="פרטי הפרסום">
      <div className="pb-2">
        {!row && !error && <SkeletonList rows={2} />}
        {error && <p className="py-4 text-sm text-error-400">{error}</p>}
        {row && (
          <>
            <div className="flex min-w-0 items-center gap-3 pb-3">
              <TargetAvatar
                name={row.target?.name ?? 'קבוצה'}
                imageUrl={row.target?.image_url}
                channel={row.target?.channel}
                size={44}
              />
              <div className="min-w-0 grow">
                <p dir="auto" className="truncate text-sm font-extrabold text-mist-100">
                  {row.target?.name ?? 'הקבוצה נמחקה מהרשימה'}
                </p>
                <p className="text-[11px] text-mist-500">
                  <Stamp iso={row.published_at ?? row.scheduled_at} />
                </p>
              </div>
              <StatusPill status={row.status} long />
            </div>

            {failure && (failure.headline || failure.advice) && (row.error || row.skip_reason) && (
              <div className="rounded-tile border border-ink-700 bg-ink-800 p-3">
                <p className={`text-xs font-bold ${failure.needsOwner ? 'text-warning-400' : 'text-error-400'}`}>{failure.headline}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-mist-300">{failure.advice}</p>
              </div>
            )}

            {row.permalink && (
              <a
                href={row.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-11 items-center px-1 text-sm font-bold text-brand-400"
              >
                פתח את הפוסט בפייסבוק
              </a>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {failure?.canRetry && (
                <Button size="sm" busy={busy === 'retry'} onClick={() => act('retry')}>
                  נסה שוב
                </Button>
              )}
              {row.status !== 'published' && (
                <Button size="sm" variant="secondary" busy={busy === 'cancel'} onClick={() => act('cancel')}>
                  בטל פרסום
                </Button>
              )}
              {row.target && (
                <Link
                  href={`/social/groups/${row.target.id}`}
                  onClick={onClose}
                  className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-brand-400"
                >
                  לקבוצה
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
