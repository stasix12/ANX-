'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { ActivityFeed } from '@/components/social/ActivityFeed';
import { BrowserStatusCard } from '@/components/social/BrowserStatusCard';
import { CampaignCard } from '@/components/social/CampaignCard';
import { LiveBoard } from '@/components/social/LiveBoard';
import { QuickActions } from '@/components/social/QuickActions';
import { SocialShell } from '@/components/social/SocialShell';
import { Timeline } from '@/components/social/Timeline';
import { Button, Card, EmptyState, Loading, Notice, SkeletonTiles, Tile, useConfirm, useToast } from '@/components/social/ui';
import {
  callSocialApi,
  campaignStates,
  cancelAllScheduled,
  countByStatus,
  countPublishedBetween,
  countPublishedSince,
  getControl,
  getLimits,
  listActivity,
  listCampaigns,
  listQueue,
  listTargets,
  pauseCampaign,
  setPaused,
  type QueueRow,
} from '@/lib/social/client';
import { percentDone, type CampaignState } from '@/lib/social/campaign';
import { addDaysISO, formatDateTimeHe, startOfZonedDay, zonedDateISO, zonedToUtc } from '@/lib/social/time';
import type { ActivityEntry, Campaign, ControlSettings, LimitsSettings, QueueStatus } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

interface DashboardData {
  counts: Record<QueueStatus, number>;
  today: number;
  week: number;
  upcoming: QueueRow[];
  limits: LimitsSettings;
  control: ControlSettings;
  activeTargets: number;
  manual: QueueRow[];
  log: ActivityEntry[];
  campaigns: Campaign[];
  states: Record<string, CampaignState>;
}

/**
 * The control centre. The order is the point: what is running right now,
 * then what is about to happen, and only then the numbers. A row of tiles
 * is a report; a campaign with a progress bar and a next-publication time is
 * something you can act on.
 */
export default function SocialDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      // The local week starts on Sunday, the Israeli work week.
      const now = new Date();
      const weekStartISO = addDaysISO(zonedDateISO(now), -now.getDay());
      const campaigns = await listCampaigns();
      // Only a live campaign can be the one running right now, so the rollup
      // read stays proportional to what the hero can actually show.
      const liveIds = campaigns.filter((c) => c.status !== 'archived').map((c) => c.id);
      const [counts, today, week, limits, control, targets, manual, log, states, upcoming] = await Promise.all([
        countByStatus(),
        countPublishedSince(startOfZonedDay(now).toISOString()),
        countPublishedBetween(zonedToUtc(weekStartISO, '00:00').toISOString()),
        getLimits(),
        getControl(),
        listTargets(),
        listQueue({ status: ['manual_pending'], limit: 20 }),
        listActivity(30),
        campaignStates(liveIds),
        listQueue({ status: ['scheduled'], limit: 40 }),
      ]);
      setData({
        counts,
        today,
        week,
        // listQueue sorts newest-first; the soonest publication is last.
        upcoming: [...upcoming].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
        limits,
        control,
        activeTargets: targets.filter((t) => t.enabled).length,
        manual,
        log,
        campaigns,
        states,
      });
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast(done);
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function stopEverything() {
    const ok = await confirm.ask({
      title: 'לעצור את כל הפרסומים?',
      body: 'כל הפרסומים המתוזמנים — בכל הקמפיינים — יבוטלו, והמערכת תושהה. מה שכבר פורסם נשאר בהיסטוריה. אי אפשר לבטל את הפעולה.',
      confirmLabel: 'עצור הכל',
      danger: true,
    });
    if (!ok) return;
    await act(
      'stop',
      async () => {
        await setPaused(true);
        const n = await cancelAllScheduled();
        toast(`הושהה. ${n} פרסומים בוטלו.`, 'info');
      },
      'המערכת הושהתה.',
    );
  }

  async function runNow() {
    setBusy('run');
    try {
      const r = await callSocialApi<{ ran: boolean; reason?: string; published: number; manual: number; skipped: number; failed: number; deferred: number }>('/api/social/run');
      toast(
        r.ran ? `הריצה הסתיימה: ${r.published} פורסמו, ${r.skipped} דולגו, ${r.failed} נכשלו.` : `לא רץ: ${r.reason}`,
        r.ran ? 'success' : 'info',
      );
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'הריצה נכשלה.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  /** The campaign worth putting at the top: running first, then most recently active. */
  const featured = data
    ? (data.campaigns
        .map((c) => ({ campaign: c, state: data.states[c.id] }))
        .filter((x): x is { campaign: Campaign; state: CampaignState } => Boolean(x.state?.progress.total))
        .sort((a, b) => {
          const rank = (s: CampaignState) => (s.state === 'running' ? 0 : s.state === 'needs_attention' ? 1 : s.state === 'paused' ? 2 : s.state === 'not_started' ? 3 : 4);
          const d = rank(a.state) - rank(b.state);
          if (d) return d;
          return percentDone(a.state.progress) - percentDone(b.state.progress);
        })[0] ?? null)
    : null;

  return (
    <SocialShell
      title="לוח בקרה"
      headerAction={
        <Link href="/social/posts/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-bold text-blue-700 shadow-sm">
          <PlusIcon className="h-4 w-4" strokeWidth={2.4} /> פוסט
        </Link>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && (
        <div className="space-y-5">
          <SkeletonTiles count={6} />
          <Loading />
        </div>
      )}
      {data && (
        <div className="space-y-5">
          {data.control.paused && (
            <Notice tone="warn">
              <strong>כל הפרסומים מושהים.</strong> שום דבר לא יצא עד שתפעילו מחדש.{' '}
              <button type="button" className="font-extrabold underline" onClick={() => act('resume', () => setPaused(false), 'הפרסום חודש.')}>
                הפעל עכשיו
              </button>
            </Notice>
          )}
          {data.control.rateLimitedUntil && new Date(data.control.rateLimitedUntil) > new Date() && (
            <Notice tone="warn">Meta ביקשה להאט — הפרסום יתחדש אוטומטית ב-{formatDateTimeHe(data.control.rateLimitedUntil)}.</Notice>
          )}
          {data.counts.needs_attention > 0 && (
            <Notice tone="error">
              <strong>{data.counts.needs_attention} פרסומים תקועים</strong> וממתינים לכם. בדרך כלל פייסבוק ביקשה אימות בחלון של ה-worker.
            </Notice>
          )}

          {/* 1 — what is running right now. */}
          {featured ? (
            <CampaignCard
              campaign={featured.campaign}
              state={featured.state}
              busy={busy?.startsWith('camp')}
              onPause={() => act('camp-pause', () => pauseCampaign(featured.campaign.id, true), 'הקמפיין הושהה.')}
              onResume={() => act('camp-resume', () => pauseCampaign(featured.campaign.id, false), 'הקמפיין ממשיך.')}
            />
          ) : (
            <EmptyState
              icon="📣"
              title="אין קמפיין פעיל"
              description="צרו פוסט, בחרו קבוצות ותזמנו — ההתקדמות תופיע כאן, עם השעה של כל פרסום."
              action={
                <Link href="/social/posts/new">
                  <Button size="lg">התחל קמפיין</Button>
                </Link>
              }
            />
          )}

          {/* 2 — what happens next. */}
          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Card
              title="הפרסומים הקרובים"
              subtitle={data.upcoming.length ? `${data.upcoming.length} ממתינים בתור` : undefined}
              action={
                <Link href="/social/history" className="text-sm font-bold text-brand-400">
                  הכל
                </Link>
              }
            >
              <Timeline rows={data.upcoming} limit={6} />
            </Card>

            <div className="space-y-5">
              <QuickActions onRunNow={runNow} running={busy === 'run'} />
              <BrowserStatusCard onChanged={load} />
            </div>
          </div>

          {data.manual.length > 0 && (
            <Card
              title={`ממתינים לפרסום ידני (${data.manual.length})`}
              subtitle="יעדים שאין להם פרסום אוטומטי — הכול מוכן, נשאר להדביק"
              action={
                <Link href={`/social/manual/${data.manual[0].id}`} className="text-sm font-bold text-violet-700">
                  התחל ←
                </Link>
              }
            >
              <ul className="divide-y divide-ink-700">
                {data.manual.slice(0, 4).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p dir="auto" className="truncate font-bold text-mist-100">{item.target?.name}</p>
                      <p dir="auto" className="truncate text-xs text-mist-500">{item.post?.title || 'פוסט'}</p>
                    </div>
                    <Link href={`/social/manual/${item.id}`} className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-violet-600 px-3.5 text-sm font-bold text-white">
                      פתח
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* 3 — and only then, the numbers. */}
          <section>
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-mist-500">סטטיסטיקה</h2>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6 [&>*]:min-w-0">
              <Tile label="פורסמו היום" value={data.today} tone={data.today ? 'good' : 'default'} sub={`מתוך ${data.limits.maxPerDay} שהגדרתם`} />
              <Tile label="השבוע" value={data.week} tone="good" sub="מיום ראשון" />
              <Tile label="מתוזמנים" value={data.counts.scheduled} href="/social/history?status=scheduled" />
              <Tile label="הצליחו" value={data.counts.published} tone="good" sub="סך הכול" />
              <Tile label="נכשלו" value={data.counts.failed} tone={data.counts.failed ? 'bad' : 'default'} href="/social/history?status=failed" />
              <Tile
                label="דורשים פעולה"
                value={data.counts.manual_pending + data.counts.needs_attention}
                tone={data.counts.manual_pending + data.counts.needs_attention ? 'warn' : 'default'}
                sub={`${data.activeTargets} יעדים פעילים`}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-mist-500">
              המגבלה היומית ({data.limits.maxPerDay}) היא מספר שאתם קובעים בהגדרות — היא לא מכסה רשמית של פייסבוק.
            </p>
          </section>

          <LiveBoard />

          <Card
            title="יומן פעילות"
            action={
              <Link href="/social/history" className="text-sm font-bold text-brand-400">
                להיסטוריה
              </Link>
            }
          >
            <ActivityFeed entries={data.log} limit={10} />
          </Card>

          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="sm" busy={busy === 'stop'} onClick={stopEverything} className="text-rose-600">
              עצור את כל הפרסומים
            </Button>
          </div>
        </div>
      )}
      {confirm.dialog}
    </SocialShell>
  );
}
