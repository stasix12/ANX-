'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Empty, Loading, Notice, StatusPill, Tile } from '@/components/social/ui';
import {
  callSocialApi,
  cancelAllScheduled,
  countByStatus,
  countPublishedSince,
  getControl,
  getLimits,
  listActivity,
  listQueue,
  listTargets,
  nextScheduled,
  setPaused,
  type QueueRow,
} from '@/lib/social/client';
import { formatDateTimeHe, formatTimeHe, relativeHe, startOfZonedDay } from '@/lib/social/time';
import type { ActivityEntry, ControlSettings, LimitsSettings, QueueStatus } from '@/lib/social/types';

interface DashboardData {
  counts: Record<QueueStatus, number>;
  today: number;
  limits: LimitsSettings;
  control: ControlSettings;
  activeTargets: number;
  apiTargets: number;
  next: QueueRow | null;
  manual: QueueRow[];
  recentFailed: QueueRow[];
  log: ActivityEntry[];
}

export default function SocialDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [runReport, setRunReport] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [counts, today, limits, control, targets, next, manual, recentFailed, log] = await Promise.all([
        countByStatus(),
        countPublishedSince(startOfZonedDay(new Date()).toISOString()),
        getLimits(),
        getControl(),
        listTargets(),
        nextScheduled(),
        listQueue({ status: ['manual_pending'], limit: 20 }),
        listQueue({ status: ['failed'], limit: 5 }),
        listActivity(30),
      ]);
      setData({
        counts,
        today,
        limits,
        control,
        activeTargets: targets.filter((t) => t.enabled).length,
        apiTargets: targets.filter((t) => t.enabled && t.can_api_publish).length,
        next,
        manual,
        recentFailed,
        log,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינה נכשלה.');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  async function togglePause() {
    if (!data) return;
    setBusy('pause');
    try {
      await setPaused(!data.control.paused);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function stopEverything() {
    if (!window.confirm('לעצור את כל התורים? כל הפרסומים המתוזמנים יבוטלו והמערכת תושהה.')) return;
    setBusy('stop');
    try {
      await setPaused(true);
      const n = await cancelAllScheduled();
      setRunReport(`הושהה. ${n} פרסומים מתוזמנים בוטלו.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setBusy('run');
    try {
      const r = await callSocialApi<{ ran: boolean; reason?: string; published: number; manual: number; skipped: number; failed: number; deferred: number }>('/api/social/run');
      setRunReport(
        r.ran
          ? `הריצה הסתיימה: ${r.published} פורסמו, ${r.manual} ידניים, ${r.skipped} דולגו, ${r.deferred} נדחו, ${r.failed} נכשלו.`
          : `לא רץ: ${r.reason}`,
      );
      await load();
    } catch (err) {
      setRunReport(err instanceof Error ? err.message : 'הריצה נכשלה.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SocialShell
      title="לוח בקרה"
      headerAction={
        <Link href="/social/posts/new" className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-bold text-blue-700 shadow-sm">
          <PlusIcon className="h-4 w-4" strokeWidth={2.4} /> פוסט חדש
        </Link>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Loading />}
      {data && (
        <div className="space-y-5">
          {data.control.paused && (
            <Notice tone="warn">
              <strong>כל התורים מושהים.</strong> שום דבר לא יתפרסם עד שתפעילו מחדש.
            </Notice>
          )}
          {data.control.rateLimitedUntil && new Date(data.control.rateLimitedUntil) > new Date() && (
            <Notice tone="warn">Meta ביקשה להאט — הפרסום יתחדש אוטומטית ב-{formatDateTimeHe(data.control.rateLimitedUntil)}.</Notice>
          )}
          {runReport && <Notice tone="info">{runReport}</Notice>}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="ממתינים לפרסום" value={data.counts.scheduled} sub={data.next ? `הבא: ${relativeHe(data.next.scheduled_at)}` : 'אין תזמון'} />
            <Tile label="פורסמו" value={data.counts.published} tone="good" sub={`${data.today} היום מתוך ${data.limits.maxPerDay}`} />
            <Tile label="נכשלו" value={data.counts.failed} tone={data.counts.failed ? 'bad' : 'default'} sub={`${data.counts.skipped} דולגו`} />
            <Tile label="יעדים פעילים" value={data.activeTargets} sub={`${data.apiTargets} דרך API · ${data.activeTargets - data.apiTargets} ידניים`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="הפרסום הבא" className="lg:col-span-1">
              {data.next ? (
                <div className="space-y-1.5">
                  <p className="text-2xl font-extrabold text-brand-400">{formatTimeHe(data.next.scheduled_at)}</p>
                  <p className="text-sm text-mist-300">{formatDateTimeHe(data.next.scheduled_at)}</p>
                  <p className="font-bold text-mist-100">{data.next.target?.name ?? 'יעד'}</p>
                  <p className="text-sm text-mist-300">
                    {data.next.post?.title || 'פוסט'} {data.next.variant ? `· גרסה ${data.next.variant.label}` : ''}
                  </p>
                </div>
              ) : (
                <Empty>אין פרסום מתוזמן. צרו פוסט ותזמנו אותו.</Empty>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" busy={busy === 'run'} onClick={runNow}>
                  הרץ תור עכשיו
                </Button>
                <Button variant={data.control.paused ? 'primary' : 'secondary'} busy={busy === 'pause'} onClick={togglePause}>
                  {data.control.paused ? 'הפעל תורים' : 'השהה תורים'}
                </Button>
                <Button variant="danger" busy={busy === 'stop'} onClick={stopEverything}>
                  עצור הכל
                </Button>
              </div>
            </Card>

            <Card title={`ממתינים לפרסום ידני (${data.manual.length})`} className="lg:col-span-2">
              {data.manual.length === 0 ? (
                <Empty>אין פוסטים שממתינים לפרסום ידני. קבוצות פייסבוק מגיעות לכאן כשמגיע זמנן.</Empty>
              ) : (
                <ul className="divide-y divide-ink-700">
                  {data.manual.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-mist-100">{item.target?.name}</p>
                        <p className="truncate text-xs text-mist-500">
                          {item.post?.title || 'פוסט'} · {formatDateTimeHe(item.scheduled_at)}
                        </p>
                      </div>
                      <Link href={`/social/manual/${item.id}`} className="shrink-0 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-bold text-white">
                        פתח ערכת פרסום
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {data.recentFailed.length > 0 && (
            <Card title="כשלונות אחרונים" action={<Link href="/social/history?status=failed" className="text-sm font-bold text-brand-400">להיסטוריה</Link>}>
              <ul className="divide-y divide-ink-700">
                {data.recentFailed.map((item) => (
                  <li key={item.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-mist-100">{item.target?.name}</p>
                      <StatusPill status={item.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-rose-700">{item.error}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="יומן פעילות">
            {data.log.length === 0 ? (
              <Empty>עדיין אין פעילות.</Empty>
            ) : (
              <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
                {data.log.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="shrink-0 tabular-nums text-xs text-mist-500">{formatDateTimeHe(e.at)}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 text-[11px] font-bold ${
                        e.level === 'error' ? 'bg-rose-100 text-rose-700' : e.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                      }`}
                    >
                      {e.event}
                    </span>
                    <span className="min-w-0 break-words text-mist-100">{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </SocialShell>
  );
}
