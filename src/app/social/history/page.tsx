'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { SocialShell } from '@/components/social/SocialShell';
import { Card, Empty, Loading, Notice, StatusPill, inputClass } from '@/components/social/ui';
import { cancelQueueItem, listQueue, retryQueueItem, screenshotUrl, type QueueRow } from '@/lib/social/client';
import { formatDateHe, formatTimeHe, zonedToUtc } from '@/lib/social/time';
import { QUEUE_STATUS_LABEL, QUEUE_STEP_LABEL, type QueueStatus } from '@/lib/social/types';

const STATUSES = Object.keys(QUEUE_STATUS_LABEL) as QueueStatus[];

export default function HistoryPage() {
  return (
    <Suspense fallback={<SocialShell title="היסטוריית פרסומים"><Loading /></SocialShell>}>
      <HistoryScreen />
    </Suspense>
  );
}

function HistoryScreen() {
  const params = useSearchParams();
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [status, setStatus] = useState<QueueStatus | ''>((params.get('status') as QueueStatus) || '');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(
        await listQueue({
          status: status ? [status] : undefined,
          since: since ? zonedToUtc(since, '00:00').toISOString() : undefined,
          until: until ? zonedToUtc(until, '23:59').toISOString() : undefined,
          limit: 300,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינה נכשלה.');
    }
  }, [status, since, until]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SocialShell title="היסטוריית פרסומים">
      {error && <Notice tone="error">{error}</Notice>}
      <Card>
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as QueueStatus | '')}>
            <option value="">כל הסטטוסים</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {QUEUE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <input type="date" className={inputClass} value={since} onChange={(e) => setSince(e.target.value)} />
          <input type="date" className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />
          <button type="button" onClick={load} className="rounded-xl bg-ink-800 px-4 py-2.5 text-sm font-bold text-mist-100">
            רענן
          </button>
        </div>
        {!rows && <Loading />}
        {rows && rows.length === 0 && <Empty>אין רשומות בסינון הזה.</Empty>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-mist-500">
                <tr>
                  <th className="py-2 text-start font-bold">תאריך</th>
                  <th className="py-2 text-start font-bold">שעה</th>
                  <th className="py-2 text-start font-bold">יעד</th>
                  <th className="py-2 text-start font-bold">פוסט</th>
                  <th className="py-2 text-start font-bold">סטטוס</th>
                  <th className="py-2 text-start font-bold">שגיאה / הערה</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {rows.map((r) => {
                  const when = r.published_at ?? r.scheduled_at;
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="py-2.5 pe-3 whitespace-nowrap tabular-nums text-mist-100">{formatDateHe(when)}</td>
                      <td className="py-2.5 pe-3 whitespace-nowrap tabular-nums text-mist-100">{formatTimeHe(when)}</td>
                      <td className="py-2.5 pe-3 font-bold text-mist-100">{r.target?.name ?? '—'}</td>
                      <td className="py-2.5 pe-3">
                        <Link href={`/social/posts/${r.post_id}`} className="text-brand-400">
                          {r.post?.title || 'פוסט'}
                        </Link>
                        {r.variant && <span className="text-xs text-mist-500"> · {r.variant.label}</span>}
                      </td>
                      <td className="py-2.5 pe-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="max-w-xs py-2.5 pe-3 text-xs text-mist-300">
                        {r.step && r.status === 'publishing' ? <span className="block text-amber-700">{QUEUE_STEP_LABEL[r.step]}</span> : null}
                        {r.error || r.skip_reason || ''}
                        {r.permalink && (
                          <a href={r.permalink} target="_blank" rel="noreferrer" className="block text-brand-400" dir="ltr">
                            {r.permalink}
                          </a>
                        )}
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-xs font-bold">
                        {r.status === 'manual_pending' && (
                          <Link href={`/social/manual/${r.id}`} className="text-violet-700">
                            ערכת פרסום
                          </Link>
                        )}
                        {r.screenshot_path && (
                          <button
                            type="button"
                            className="block text-violet-700"
                            onClick={() => screenshotUrl(r.screenshot_path as string).then((u) => u && window.open(u, '_blank'))}
                          >
                            צפה בצילום התקלה
                          </button>
                        )}
                        {(r.status === 'failed' || r.status === 'skipped' || r.status === 'needs_attention') && (
                          <button type="button" className="text-brand-400" onClick={() => retryQueueItem(r.id).then(load)}>
                            נסה שוב
                          </button>
                        )}
                        {(r.status === 'scheduled' || r.status === 'awaiting_confirmation' || r.status === 'paused') && (
                          <button type="button" className="block text-rose-600" onClick={() => cancelQueueItem(r.id).then(load)}>
                            בטל
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </SocialShell>
  );
}
