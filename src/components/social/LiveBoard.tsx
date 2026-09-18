'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cancelQueueItem, confirmQueueItem, listLiveQueue, retryQueueItem, screenshotUrl, type QueueRow } from '@/lib/social/client';
import { QueueSections } from './QueueSections';
import { Button, Card, Notice, SkeletonList, useConfirm, useToast } from './ui';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * The live queue, polled every four seconds: what is publishing now, what is
 * next and what is done. Campaign-level controls live on the campaign's own
 * screen — this board is about the publications themselves.
 *
 * Every action here is guarded server-side (client.ts names the statuses each
 * write may touch), so a stale board can never move a row that has since
 * started publishing.
 */
export function LiveBoard({ postId, compact = false }: { postId?: string; compact?: boolean }) {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const all = await listLiveQueue();
      setRows(postId ? all.filter((r) => r.post_id === postId) : all);
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }, [postId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  /** Wraps a queue write: it reports whether it matched, so a no-op is explained. */
  async function run(fn: () => Promise<boolean>, ok: string, stale: string) {
    try {
      const changed = await fn();
      toast(changed ? ok : stale, changed ? 'success' : 'info');
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    }
    await load();
  }

  const actions = {
    onRetry: (row: QueueRow) => run(() => retryQueueItem(row.id), 'הפרסום הוחזר לתור.', 'הפריט כבר השתנה — רועננו את המסך.'),
    onRunNow: (row: QueueRow) => run(() => retryQueueItem(row.id), 'יפורסם בריצה הקרובה.', 'הפריט כבר השתנה.'),
    onCancel: async (row: QueueRow) => {
      const ok = await confirm.ask({
        title: 'לבטל את הפרסום?',
        body: `הפרסום ל-"${row.target?.name ?? 'היעד'}" יסומן כדילוג ולא יישלח. אפשר יהיה להחזיר אותו לתור מההיסטוריה.`,
        confirmLabel: 'בטל פרסום',
        danger: true,
      });
      if (ok) await run(() => cancelQueueItem(row.id), 'הפרסום בוטל.', 'הפריט כבר השתנה.');
    },
    onConfirm: (row: QueueRow) =>
      run(
        async () => {
          await confirmQueueItem(row.id);
          return true;
        },
        'אושר — ה-worker ימשיך לפרסום.',
        '',
      ),
    onScreenshot: (row: QueueRow) => {
      if (!row.screenshot_path) return;
      screenshotUrl(row.screenshot_path).then((u) => {
        if (u) window.open(u, '_blank', 'noreferrer');
        else toast('לא ניתן לפתוח את הצילום.', 'error');
      });
    },
  };

  const content = (
    <>
      {error && (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!rows && !error && <SkeletonList rows={3} />}
      {rows && (
        <QueueSections
          rows={rows}
          actions={actions}
          emptyAction={
            <Link href="/social/posts/new">
              <Button>צרו פוסט ראשון</Button>
            </Link>
          }
        />
      )}
      {confirm.dialog}
    </>
  );

  if (compact) return content;
  return (
    <Card
      title="פרסום בזמן אמת"
      subtitle="מתעדכן לבד כל 4 שניות"
      action={
        <Link href="/social/history" className="text-sm font-bold text-brand-400">
          היסטוריה
        </Link>
      }
    >
      {content}
    </Card>
  );
}
