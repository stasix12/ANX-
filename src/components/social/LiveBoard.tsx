'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { cancelQueueItem, confirmQueueItem, listLiveQueue, pauseCampaign, retryQueueItem, screenshotUrl, stopCampaign, type QueueRow } from '@/lib/social/client';
import { formatTimeHe } from '@/lib/social/time';
import { QUEUE_STEP_LABEL, type QueueStatus, type QueueStep } from '@/lib/social/types';
import { Button, Card, Empty, Notice } from './ui';

/**
 * Real-time (4s polling) view of every publication in flight, grouped by
 * post: "באר שבע ביחד — ✅ Published / עסקים — ⏳ Publishing / …", with
 * pause / resume / stop per campaign and the confirmation gate for
 * test-mode runs.
 */

function lineFor(row: QueueRow): { icon: string; text: string; cls: string } {
  const step = (row.step ?? '') as QueueStep;
  switch (row.status as QueueStatus) {
    case 'published':
      return { icon: '✅', text: 'Published', cls: 'text-emerald-700' };
    case 'failed':
      return { icon: '❌', text: `Failed${row.error ? ` — ${row.error}` : ''}`, cls: 'text-rose-700' };
    case 'skipped':
      return { icon: '⏭️', text: `Skipped${row.skip_reason ? ` — ${row.skip_reason}` : ''}`, cls: 'text-slate-600' };
    case 'needs_attention':
      return { icon: '⚠️', text: `Needs attention — ${row.error ?? ''}`, cls: 'text-orange-700' };
    case 'awaiting_confirmation':
      return { icon: '🛑', text: 'מוכן — ממתין לאישור שלכם לפני הפרסום', cls: 'text-fuchsia-700' };
    case 'paused':
      return { icon: '⏸️', text: 'Paused', cls: 'text-slate-600' };
    case 'publishing':
      return { icon: '⏳', text: QUEUE_STEP_LABEL[step] || 'Publishing', cls: 'text-amber-700' };
    case 'manual_pending':
      return { icon: '✋', text: 'ממתין לפרסום ידני', cls: 'text-violet-700' };
    default:
      return { icon: '🕐', text: `Pending · ${formatTimeHe(row.scheduled_at)}`, cls: 'text-sky-700' };
  }
}

export function LiveBoard({ postId, compact = false }: { postId?: string; compact?: boolean }) {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [shots, setShots] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const all = await listLiveQueue();
      setRows(postId ? all.filter((r) => r.post_id === postId) : all);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינה נכשלה.');
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // Signed URLs for confirmation / failure screenshots.
  useEffect(() => {
    (rows ?? [])
      .filter((r) => r.screenshot_path && (r.status === 'awaiting_confirmation' || r.status === 'needs_attention') && !shots[r.id])
      .forEach((r) => screenshotUrl(r.screenshot_path as string).then((u) => u && setShots((s) => ({ ...s, [r.id]: u }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const groups = useMemo(() => {
    const map = new Map<string, QueueRow[]>();
    for (const r of rows ?? []) {
      const key = r.post_id;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries());
  }, [rows]);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הפעולה נכשלה.');
    } finally {
      setBusy(null);
    }
  }

  const content = (
    <>
      {error && <div className="mb-2"><Notice tone="error">{error}</Notice></div>}
      {rows && rows.length === 0 && <Empty>אין פרסומים פעילים. צרו פוסט ולחצו "התחל פרסום".</Empty>}
      <div className="space-y-4">
        {groups.map(([pid, items]) => {
          const first = items[0];
          const campaignId = first.campaign_id ?? null;
          const done = items.filter((i) => ['published', 'failed', 'skipped'].includes(i.status)).length;
          const running = items.some((i) => ['publishing', 'awaiting_confirmation'].includes(i.status));
          const pending = items.filter((i) => i.status === 'scheduled').length;
          return (
            <div key={pid} className="rounded-xl border border-ink-600 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/social/posts/${pid}`} className="font-extrabold text-mist-100 hover:text-brand-400">
                    {first.post?.title || 'פוסט'}
                  </Link>
                  <p className="text-xs text-mist-500">
                    {done}/{items.length} הסתיימו · {pending} ממתינים{running ? ' · רץ עכשיו' : ''}
                  </p>
                </div>
                {campaignId && (
                  <div className="flex gap-1.5">
                    <Button variant="secondary" className="!px-2.5 !py-1.5 text-xs" busy={busy === `pause-${campaignId}`} onClick={() => act(`pause-${campaignId}`, () => pauseCampaign(campaignId, true))}>
                      ⏸ Pause
                    </Button>
                    <Button variant="secondary" className="!px-2.5 !py-1.5 text-xs" busy={busy === `resume-${campaignId}`} onClick={() => act(`resume-${campaignId}`, () => pauseCampaign(campaignId, false))}>
                      ▶ Resume
                    </Button>
                    <Button
                      variant="danger"
                      className="!px-2.5 !py-1.5 text-xs"
                      busy={busy === `stop-${campaignId}`}
                      onClick={() => {
                        if (window.confirm('לעצור את הקמפיין? פרסומים שטרם התחילו יבוטלו; פרסום שרץ עכשיו יסתיים בבטחה.')) act(`stop-${campaignId}`, () => stopCampaign(campaignId));
                      }}
                    >
                      ⏹ Stop
                    </Button>
                  </div>
                )}
              </div>
              <ul className="mt-2 divide-y divide-ink-700">
                {items.map((r) => {
                  const line = lineFor(r);
                  return (
                    <li key={r.id} className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 grow truncate text-sm font-bold text-mist-100">
                          {r.target?.name ?? 'יעד'}
                          {r.variant && <span className="ms-1 text-xs font-semibold text-mist-500">· {r.variant.label}</span>}
                        </span>
                        <span className={`text-sm ${line.cls}`}>
                          {line.icon} {line.text}
                        </span>
                        {r.status === 'awaiting_confirmation' && (
                          <>
                            <Button className="!px-3 !py-1.5 text-xs" busy={busy === `ok-${r.id}`} onClick={() => act(`ok-${r.id}`, () => confirmQueueItem(r.id))}>
                              אשר פרסום
                            </Button>
                            <Button variant="secondary" className="!px-3 !py-1.5 text-xs" busy={busy === `no-${r.id}`} onClick={() => act(`no-${r.id}`, () => cancelQueueItem(r.id))}>
                              בטל
                            </Button>
                          </>
                        )}
                        {(r.status === 'needs_attention' || r.status === 'failed') && (
                          <>
                            <Button variant="secondary" className="!px-3 !py-1.5 text-xs" busy={busy === `retry-${r.id}`} onClick={() => act(`retry-${r.id}`, () => retryQueueItem(r.id))}>
                              נסה שוב
                            </Button>
                            <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={() => act(`skip-${r.id}`, () => cancelQueueItem(r.id))}>
                              דלג
                            </Button>
                          </>
                        )}
                        {r.status === 'scheduled' && (
                          <>
                            {new Date(r.scheduled_at).getTime() > Date.now() + 60_000 && (
                              <Button variant="secondary" className="!px-3 !py-1.5 text-xs" busy={busy === `now-${r.id}`} onClick={() => act(`now-${r.id}`, () => retryQueueItem(r.id))}>
                                הרץ עכשיו
                              </Button>
                            )}
                            <Button variant="ghost" className="!px-2 !py-1.5 text-xs text-rose-600" onClick={() => act(`cancel-${r.id}`, () => cancelQueueItem(r.id))}>
                              בטל
                            </Button>
                          </>
                        )}
                      </div>
                      {shots[r.id] && (
                        <a href={shots[r.id]} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-lg border border-ink-600">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={shots[r.id]} alt="צילום מסך של הדפדפן" className="max-h-64 w-full object-cover object-top" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );

  if (compact) return content;
  return <Card title="פרסום בזמן אמת">{content}</Card>;
}
