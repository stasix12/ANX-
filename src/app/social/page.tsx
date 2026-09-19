'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CalendarIcon, ClockIcon, MegaphoneIcon, PlusIcon, SendIcon, XCircleIcon } from '@/components/icons';
import { ActivityFeed } from '@/components/social/ActivityFeed';
import { BrowserStatusCard } from '@/components/social/BrowserStatusCard';
import { LiveCampaignHero, LiveQueueHero } from '@/components/social/LiveCampaignHero';
import { LiveBoard } from '@/components/social/LiveBoard';
import { QueueTunerSheet } from '@/components/social/QueueTunerSheet';
import { QuickActions } from '@/components/social/QuickActions';
import { SocialShell } from '@/components/social/SocialShell';
import { Timeline } from '@/components/social/Timeline';
import { AlertBar, Button, Card, EmptyState, Loading, Notice, SectionHeader, SkeletonTiles, StatCard, useConfirm, useToast, ButtonLink} from '@/components/social/ui';
import {
  callSocialApi,
  campaignStates,
  cancelAllScheduled,
  countPublishedBetween,
  countPublishedSince,
  getControl,
  getLimits,
  listActivity,
  listCampaigns,
  listQueue,
  listTargets,
  pauseCampaign,
  queueSummary,
  setPaused,
  stopCampaign,
  type QueueRow,
} from '@/lib/social/client';
import { cancellableRows, percentFinished, type CampaignState } from '@/lib/social/campaign';
import { AUTOMATIC_WAITING_STATUSES, EMPTY_QUEUE_SUMMARY, type QueueSummary } from '@/lib/social/status';
import { addDaysISO, startOfZonedDay, zonedDateISO, zonedToUtc } from '@/lib/social/time';
import { stampText } from '@/components/social/DateTime';
import type { ActivityEntry, Campaign, ControlSettings, LimitsSettings, QueueStatus } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * How many upcoming rows the timeline reads. The card's subtitle prints the
 * EXACT queue count beside it rather than this array's length, so a ceiling is
 * never shown as a total.
 */
const UPCOMING_LIMIT = 40;

interface DashboardData {
  counts: Record<QueueStatus, number>;
  /** The same counts rolled up through the one classification (status.ts). */
  summary: QueueSummary;
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
  /* The queue tuner, opened from the "next publication" box of either hero. */
  const [tunerOpen, setTunerOpen] = useState(false);
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
      const [queue, today, week, limits, control, targets, manual, log, states, upcoming] = await Promise.all([
        queueSummary(),
        countPublishedSince(startOfZonedDay(now).toISOString()),
        countPublishedBetween(zonedToUtc(weekStartISO, '00:00').toISOString()),
        getLimits(),
        getControl(),
        listTargets(),
        listQueue({ status: ['manual_pending'], limit: 20 }),
        listActivity(30),
        campaignStates(liveIds),
        // Ascending, because the limit is applied after the sort: read
        // newest-first, these 40 would be the FURTHEST-OUT rows in the queue
        // and "הפרסומים הקרובים" would be showing the last publications while
        // calling the first of them the next one.
        listQueue({ status: AUTOMATIC_WAITING_STATUSES, limit: UPCOMING_LIMIT, order: 'asc' }),
      ]);
      setData({
        counts: queue.counts,
        summary: queue.summary,
        today,
        week,
        upcoming,
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

  /**
   * Exactly what "delete everything waiting" will cancel, across every
   * campaign — the same list cancelAllScheduled() matches on (status.ts), so
   * the number in the question is the number the write delivers. It used to be
   * a third list that was neither a subset nor a superset of either.
   */
  const summary = data?.summary ?? EMPTY_QUEUE_SUMMARY;
  const pending = summary.cancellable;

  /**
   * Clears the queue. One implementation behind two entry points: beside
   * "resume" once publishing is paused, and as the panic button at the foot of
   * the screen, which pauses on the way so nothing restarts behind it.
   *
   * The count in the question is the real one, because "delete everything
   * waiting" means nothing without knowing how much that is.
   */
  async function discardQueue(alsoPause: boolean) {
    const ok = await confirm.ask({
      title: pending ? `למחוק ${pending} פרסומים מהתור?` : 'למחוק את התור?',
      body: `הפרסומים שממתינים — בכל סבבי הפרסום — יבוטלו ולא יצאו.${
        alsoPause ? ' המערכת גם תושהה.' : ''
      } מה שכבר פורסם נשאר בהיסטוריה. אי אפשר לבטל את הפעולה.`,
      confirmLabel: 'מחק',
      danger: true,
    });
    if (!ok) return;
    setBusy(alsoPause ? 'stop' : 'discard');
    try {
      if (alsoPause) await setPaused(true);
      const n = await cancelAllScheduled();
      toast(n ? `${n} פרסומים בוטלו.` : 'לא היו פרסומים בתור.', 'info');
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'המחיקה נכשלה.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Ends the featured run and clears its counter.
   *
   * The card's "84 / 84" is every publication this run ever had, and a run is
   * reused by every launch of its post - so stopping one and launching again
   * kept adding to a number the owner could not explain. Closing the run is
   * the honest reset: what already published stays in the history, and the
   * next launch of that post opens a new run whose count starts at zero
   * (library.ts quickPublish).
   */
  async function resetRun(id: string, name: string, state: CampaignState) {
    // Exactly what stopCampaign() will cancel — a publication already in
    // flight is left to finish, so it is not part of the promise.
    const waiting = cancellableRows(state.progress);
    const ok = await confirm.ask({
      title: 'לסיים את הסבב?',
      body:
        waiting > 0
          ? `${waiting === 1 ? 'פרסום אחד שטרם יצא יבוטל' : `${waiting} פרסומים שטרם יצאו יבוטלו`}. מה שכבר פורסם נשאר בהיסטוריה, והמונה יתחיל מאפס בפעם הבאה שתפרסמו את הפוסט הזה.`
          : 'שום דבר לא ממתין לצאת. מה שכבר פורסם נשאר בהיסטוריה, והמונה יתחיל מאפס בפעם הבאה שתפרסמו את הפוסט הזה.',
      confirmLabel: 'סיים ואפס',
      danger: true,
    });
    if (ok) await act('reset-run', () => stopCampaign(id), `הסבב "${name}" הסתיים. המונה יתחיל מאפס.`);
  }

  async function runNow() {
    setBusy('run');
    try {
      const r = await callSocialApi<{ ran: boolean; planned: number; reason?: string; published: number; manual: number; skipped: number; failed: number; deferred: number }>('/api/social/run');
      // Planning happens even when publishing is held, so a run that published
      // nothing may still have filled the queue — say so rather than "לא רץ".
      const queued = r.planned ? `${r.planned} פרסומים נכנסו לתור. ` : '';
      toast(
        r.ran ? `${queued}הריצה הסתיימה: ${r.published} פורסמו, ${r.skipped} דולגו, ${r.failed} נכשלו.` : `${queued}הפרסום מושהה: ${r.reason}`,
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
          return percentFinished(a.state.progress) - percentFinished(b.state.progress);
        })[0] ?? null)
    : null;

  /*
   * The group the campaign countdown belongs to. `state.upcoming` also holds
   * rows that are publishing or awaiting confirmation, while `nextAt` comes
   * from rows that are exactly 'scheduled' — so pairing it with upcoming[0]
   * would show the wrong picture whenever something is mid-publish.
   */
  const featuredNext = featured?.state.upcoming.find((r) => r.status === 'scheduled')?.target ?? null;

  /* Work in flight that belongs to no campaign — still the subject of the screen. */
  const liveQueue = Boolean(data && (summary.queued > 0 || data.upcoming.length > 0));

  /*
   * Greeting by time of day, in the app's own timezone. Cosmetic, but it is
   * what makes the header read as a product rather than an admin panel.
   */
  const greeting = (() => {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jerusalem' }).format(new Date()));
    if (hour < 5) return 'לילה טוב 🌙';
    if (hour < 12) return 'בוקר טוב ☀️';
    if (hour < 17) return 'צהריים טובים';
    return 'ערב טוב 🌆';
  })();

  return (
    <SocialShell
      title="לוח בקרה"
      subtitle={greeting}
      lede="סקירת הפעילות שלך היום"
      headerAction={
        <ButtonLink href="/social/posts/new">
            <PlusIcon className="h-4 w-4" strokeWidth={2.4} /> פוסט חדש
          </ButtonLink>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && (
        <div className="space-y-5">
          <SkeletonTiles count={4} />
          <Loading />
        </div>
      )}
      {data && (
        <div className="space-y-5">
          {/* Compact alerts, ordered by how much they block the queue. */}
          {data.control.paused && (
            <AlertBar
              tone="warn"
              title="כל הפרסומים מושהים"
              body={pending ? `${pending} פרסומים ממתינים בתור.` : 'שום דבר לא יוצא עד שתפעילו מחדש.'}
              actionLabel="הפעל"
              onAction={() => act('resume', () => setPaused(false), 'הפרסום חודש.')}
              dangerLabel={pending ? 'מחק' : undefined}
              onDanger={() => discardQueue(false)}
              busy={busy === 'discard'}
            />
          )}
          {data.control.rateLimitedUntil && new Date(data.control.rateLimitedUntil) > new Date() && (
            <AlertBar tone="warn" title="Meta ביקשה להאט" body={`הפרסום יתחדש אוטומטית ב-${stampText(data.control.rateLimitedUntil)}.`} />
          )}
          {/* The number and the list behind the link are the same set — the
              alert used to count needs_attention alone and open a list that
              also held the manual and confirmation rows. */}
          {summary.needsHuman > 0 && (
            <AlertBar
              tone="bad"
              title={`${summary.needsHuman} פרסומים ממתינים לכם`}
              body="בדרך כלל פייסבוק ביקשה אימות בחלון של ה-worker, או שהפרסום מחכה לאישור שלכם."
              actionLabel="הצג"
              href="/social/history?status=needs_attention"
            />
          )}

          {/* 1 — where the day stands. One flat card surface; colour marks the
              status, not the card. A tile whose value is 0 goes neutral — a red
              zero is noise, not a warning. */}
          <section>
            <div className="grid grid-cols-2 gap-3 sm:gap-3.5 md:grid-cols-4 [&>*]:min-w-0">
              <StatCard
                icon={<SendIcon className="h-4.5 w-4.5" />}
                tone={data.today ? 'good' : 'neutral'}
                label="פורסמו היום"
                value={data.today}
                sub={`מתוך ${data.limits.maxPerDay} שהגדרתם`}
                href="/social/history"
              />
              {/* Tiles 2 and 3 together are every row that has not finished,
                  each counted once (status.ts): what moves on its own, and
                  what will not move until the owner acts. They used to leave
                  publishing, awaiting_confirmation and paused out of both. */}
              <StatCard
                icon={<CalendarIcon className="h-4.5 w-4.5" />}
                tone={summary.queued ? 'brand' : 'neutral'}
                label="ממתינים בתור"
                value={summary.queued}
                sub="יוצאים לבד בזמנם"
                href="/social/history?status=scheduled"
              />
              <StatCard
                icon={<XCircleIcon className="h-4.5 w-4.5" />}
                tone={summary.failed ? 'bad' : 'neutral'}
                label="נכשלו"
                value={summary.failed}
                sub={summary.skipped ? `ועוד ${summary.skipped} דולגו` : 'סך הכול'}
                href="/social/history?status=failed"
              />
              <StatCard
                icon={<ClockIcon className="h-4.5 w-4.5" />}
                tone={summary.needsHuman ? 'warn' : 'neutral'}
                label="דורשים אתכם"
                value={summary.needsHuman}
                sub={`${data.activeTargets} יעדים פעילים`}
                href="/social/history?status=needs_attention"
              />
            </div>
            <p className="mt-2 text-[11px] text-mist-500">
              המגבלה היומית ({data.limits.maxPerDay}) היא מספר שאתם קובעים בהגדרות — היא לא מכסה רשמית של פייסבוק.
            </p>
          </section>

          {/* 2 — what is running right now, as the subject of the screen. */}
          {featured ? (
            <LiveCampaignHero
              campaign={featured.campaign}
              state={featured.state}
              busy={busy?.startsWith('camp')}
              onPause={() => act('camp-pause', () => pauseCampaign(featured.campaign.id, true), 'הסבב הושהה.')}
              onResume={() => act('camp-resume', () => pauseCampaign(featured.campaign.id, false), 'הסבב ממשיך.')}
              nextTarget={featuredNext ? { name: featuredNext.name, image_url: featuredNext.image_url ?? undefined } : null}
              onTune={() => setTunerOpen(true)}
              onReset={() => resetRun(featured.campaign.id, featured.campaign.name, featured.state)}
            />
          ) : liveQueue ? (
            /* No campaign, but publications are queued: a post scheduled
               straight from the editor carries no campaign_id, and saying
               "no active campaign" while two dozen of them are going out
               hides the very thing this screen is for. */
            <LiveQueueHero
              scheduled={summary.queued}
              publishedToday={data.today}
              dailyTarget={data.limits.maxPerDay}
              paused={data.control.paused}
              nextAt={data.upcoming[0]?.scheduled_at ?? null}
              nextTargetName={data.upcoming[0]?.target?.name ?? null}
              onRunNow={runNow}
              busy={busy === 'run'}
              nextTarget={data.upcoming[0]?.target ?? null}
              onTune={() => setTunerOpen(true)}
            />
          ) : (
            <EmptyState
              icon={<MegaphoneIcon className="h-5 w-5" />}
              title="אין סבב פעיל"
              description="צרו פוסט, בחרו קבוצות ותזמנו — ההתקדמות תופיע כאן, עם השעה של כל פרסום."
              action={
                <ButtonLink href="/social/posts/new" size="lg">התחל סבב</ButtonLink>
              }
            />
          )}

          {/* 3 — what happens next. */}
          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Card
              title="הפרסומים הקרובים"
              /* The exact queue count, not this array's length: the array is
                 capped at UPCOMING_LIMIT and printing its length as a total
                 was a ceiling presented as a fact. */
              subtitle={summary.queued ? `${summary.queued} ממתינים בתור` : undefined}
              action={
                <Link href="/social/history" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-400">
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
                <Link href={`/social/manual/${data.manual[0].id}`} className="inline-flex min-h-11 items-center text-sm font-bold text-warning-400">
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
                    <Link href={`/social/manual/${item.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-warning-400 px-3.5 text-sm font-bold text-ink-950">
                      פתח
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}


          <LiveBoard />

          <Card
            title="יומן פעילות"
            action={
              <Link href="/social/history" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-400">
                להיסטוריה
              </Link>
            }
          >
            <ActivityFeed entries={data.log} limit={10} />
          </Card>

          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="sm" busy={busy === 'stop'} onClick={() => discardQueue(true)} className="text-error-400">
              עצור ומחק את כל הפרסומים
            </Button>
          </div>
        </div>
      )}
      <QueueTunerSheet
        open={tunerOpen}
        onClose={() => setTunerOpen(false)}
        campaignId={featured ? featured.campaign.id : undefined}
        onChanged={load}
      />
      {confirm.dialog}
    </SocialShell>
  );
}
