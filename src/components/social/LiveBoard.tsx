'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cancelQueueItem, confirmQueueItem, listLiveQueue, retryQueueItem, screenshotUrl, type QueueRow } from '@/lib/social/client';
import { QueueSections } from './QueueSections';
import { Button, Card, Notice, SkeletonList, useConfirm, useToast, ButtonLink} from './ui';
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
  /*
   * Which row is mid-write. "אשר" was the one control in this flow with
   * neither `busy` nor `disabled`, and it is the control that releases a
   * publication to Facebook: measured at 1 200ms write latency and 120ms
   * between taps, two taps produced two PATCHes. The row is also up to four
   * seconds stale, so the button can still be on screen for a row that has
   * already moved on — `run()` reports that honestly, but it should not be
   * possible to ask twice while the first answer is still coming.
   */
  const [rowBusy, setRowBusy] = useState<string | null>(null);
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

  /*
   * Four seconds, with an in-flight guard and a pause while the tab is
   * hidden. Measured with each response held 7s and no guard: four concurrent
   * live-queue requests, two still outstanding at the end of the window, and
   * the trace climbing +1 +2 +2 +3 +4 — on a bad cell that compounds, because
   * more in flight means slower responses means more stacking. Out-of-order
   * landings could also redraw the board with state older than it already had.
   */
  useEffect(() => {
    let alive = true;
    let running = false;
    const tick = async () => {
      if (!alive || running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        await load();
      } finally {
        running = false;
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  /** Wraps a queue write: it reports whether it matched, so a no-op is explained. */
  async function run(fn: () => Promise<boolean>, ok: string, stale: string, rowId?: string) {
    if (rowId) {
      if (rowBusy) return;
      setRowBusy(rowId);
    }
    try {
      const changed = await fn();
      toast(changed ? ok : stale, changed ? 'success' : 'info');
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      if (rowId) setRowBusy(null);
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
    /*
     * The boolean comes straight through, like every other write on this
     * board.
     *
     * confirmQueueItem() is guarded (client.ts): it only stamps a row that is
     * still 'awaiting_confirmation', and returns false when it matched
     * nothing. This wrapper used to swallow that and `return true`, so a tap
     * on a row that had already moved on — and this list is up to four seconds
     * stale, which is exactly why the guard exists — answered "אושר" for an
     * approval that approved nothing. That is the house rule about never
     * presenting automation that did not happen, on the one button that
     * releases a post to a real group.
     */
    onConfirm: (row: QueueRow) =>
      run(
        () => confirmQueueItem(row.id),
        'אושר — התוכנה במחשב תמשיך לפרסום.',
        'הפרסום הזה כבר לא ממתין לאישור — רועננו את המסך.',
        row.id,
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
          busyRowId={rowBusy}
          emptyAction={
            <ButtonLink href="/social/posts/new">צרו פוסט ראשון</ButtonLink>
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
        <Link href="/social/history" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-400">
          היסטוריה
        </Link>
      }
    >
      {content}
    </Card>
  );
}
