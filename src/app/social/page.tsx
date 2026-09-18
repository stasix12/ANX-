'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { ActivityFeed } from '@/components/social/ActivityFeed';
import { BrowserStatusCard } from '@/components/social/BrowserStatusCard';
import { LiveBoard } from '@/components/social/LiveBoard';
import { QuickActions } from '@/components/social/QuickActions';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Empty, Loading, Notice, StatusPill, Tile } from '@/components/social/ui';
import {
  callSocialApi,
  cancelAllScheduled,
  countByStatus,
  countPublishedBetween,
  countPublishedSince,
  listCampaigns,
  listPosts,
  getControl,
  getLimits,
  listActivity,
  listQueue,
  listTargets,
  nextScheduled,
  setPaused,
  type QueueRow,
} from '@/lib/social/client';
import { addDaysISO, formatDateTimeHe, formatTimeHe, relativeHe, startOfZonedDay, zonedDateISO, zonedToUtc } from '@/lib/social/time';
import type { ActivityEntry, ControlSettings, LimitsSettings, QueueStatus } from '@/lib/social/types';

interface DashboardData {
  counts: Record<QueueStatus, number>;
  today: number;
  week: number;
  activePosts: number;
  activeCampaigns: number;
  upcoming: QueueRow[];
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
      // The local week starts on Sunday, the Israeli work week.
      const now = new Date();
      const weekStartISO = addDaysISO(zonedDateISO(now), -new Date().getDay());
      const [counts, today, week, limits, control, targets, next, manual, recentFailed, log, posts, campaigns, upcoming] =
        await Promise.all([
          countByStatus(),
          countPublishedSince(startOfZonedDay(now).toISOString()),
          countPublishedBetween(zonedToUtc(weekStartISO, '00:00').toISOString()),
          getLimits(),
          getControl(),
          listTargets(),
          nextScheduled(),
          listQueue({ status: ['manual_pending'], limit: 20 }),
          listQueue({ status: ['failed'], limit: 5 }),
          listActivity(30),
          listPosts(),
          listCampaigns(),
          listQueue({ status: ['scheduled'], limit: 5 }),
        ]);
      setData({
        counts,
        today,
        week,
        activePosts: posts.filter((p) => p.status === 'ready').length,
        activeCampaigns: campaigns.filter((c) => c.status === 'active').length,
        // listQueue sorts newest-first; the soonest publication is last.
        upcoming: [...upcoming].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).slice(0, 5),
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

          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Tile label="פוסטים פעילים" value={data.activePosts} sub={`${data.activeCampaigns} קמפיינים פעילים`} />
            <Tile label="פורסמו היום" value={data.today} tone={data.today ? 'good' : 'default'} sub={`מתוך ${data.limits.maxPerDay} מותר`} />
            <Tile label="פורסמו השבוע" value={data.week} tone="good" sub="מיום ראשון" />
            <Tile label="קבוצות פעילות" value={data.activeTargets} sub={`${data.apiTargets} דפים · ${data.activeTargets - data.apiTargets} קבוצות`} />
            <Tile label="מתוזמנים" value={data.counts.scheduled} sub={data.next ? relativeHe(data.next.scheduled_at) : 'אין תזמון'} />
            <Tile label="פורסמו בהצלחה" value={data.counts.published} tone="good" sub="מאז ומתמיד" />
            <Tile label="נכשלו" value={data.counts.failed} tone={data.counts.failed ? 'bad' : 'default'} sub={`${data.counts.skipped} דולגו`} />
            <Tile
              label="דורשים פעולה ידנית"
              value={data.counts.manual_pending + data.counts.needs_attention}
              tone={data.counts.manual_pending + data.counts.needs_attention ? 'warn' : 'default'}
              sub={data.counts.needs_attention ? `${data.counts.needs_attention} תקועים` : 'הכל זורם'}
            />
          </div>

          <QuickActions onRunNow={runNow} running={busy === 'run'} />

          <div className="grid gap-5 lg:grid-cols-3">
            <BrowserStatusCard onChanged={load} />
            <div className="lg:col-span-2">
              <LiveBoard />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="הפרסומים הקרובים" className="lg:col-span-1">
              {data.upcoming.length === 0 ? (
                <Empty>אין פרסום מתוזמן. צרו פוסט ותזמנו אותו.</Empty>
              ) : (
                <ul className="divide-y divide-ink-700">
                  {data.upcoming.map((item) => (
                    <li key={item.id} className="flex items-center gap-2.5 py-2.5">
                      <TargetAvatar name={item.target?.name ?? '?'} imageUrl={item.target?.image_url} channel={item.target?.channel} size={32} />
                      <div className="min-w-0 grow">
                        <p className="truncate text-sm font-bold text-mist-100">{item.target?.name ?? 'יעד'}</p>
                        <p className="truncate text-xs text-mist-500">{item.post?.title || 'פוסט'}</p>
                      </div>
                      <div className="shrink-0 text-end">
                        <p className="text-sm font-extrabold tabular-nums text-brand-400">{formatTimeHe(item.scheduled_at)}</p>
                        <p className="text-[11px] text-mist-500">{relativeHe(item.scheduled_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
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

            <Card
              title={data.manual.length ? `ממתינים לפרסום ידני (${data.manual.length})` : 'סיכום'}
              className="lg:col-span-2"
              action={data.manual.length > 1 ? <Link href={`/social/manual/${data.manual[0].id}`} className="text-sm font-bold text-brand-400">עבור על כולם ←</Link> : undefined}
            >
              {data.manual.length === 0 ? (
                <p className="text-sm text-mist-300">
                  דפים מתפרסמים דרך Graph API מהשרת; קבוצות דרך ה-worker המקומי. הכל נכנס לאותו תור, עם אותן מכסות ואותו מרווח. בהיסטוריה תמצאו כל פרסום עם הסיבה לכל דילוג.
                </p>
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

          <Card title="יומן פעילות" action={<Link href="/social/history" className="text-sm font-bold text-brand-400">להיסטוריה המלאה</Link>}>
            <ActivityFeed entries={data.log} limit={12} />
          </Card>
        </div>
      )}
    </SocialShell>
  );
}
