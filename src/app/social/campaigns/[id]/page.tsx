'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CampaignProgressBar } from '@/components/social/CampaignProgressBar';
import { CampaignReach } from '@/components/social/CampaignReach';
import { ProgressRing } from '@/components/social/ProgressRing';
import { QueueSections } from '@/components/social/QueueSections';
import { SocialShell } from '@/components/social/SocialShell';
import { Timeline } from '@/components/social/Timeline';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Loading,
  Notice,
  SegmentedControl,
  Tile,
  TONE_FILL,
  useConfirm,
  useToast,
  ButtonLink,
  type Tone,
} from '@/components/social/ui';
import {
  campaignQueueWithStats,
  cancelQueueItem,
  confirmQueueItem,
  getCampaign,
  getControl,
  listPostsForCampaign,
  listWorkers,
  pauseCampaign,
  retryQueueItem,
  screenshotUrl,
  stopCampaign,
  type QueueRow,
} from '@/lib/social/client';
import {
  RUN_STATE_LABEL,
  campaignState,
  canPauseRun,
  canResumeRun,
  cancellableRows,
  runBadge,
  runProgress,
  type CampaignState,
} from '@/lib/social/campaign';
import { checkCampaignInvariants, takeUnreported } from '@/lib/social/invariants';
import { logClientActivity } from '@/lib/social/client';
import { formatDateTimeHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import { ltr } from '@/components/social/DateTime';
import type { Campaign, ControlSettings, Post } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { CalendarIcon, ClipboardListIcon, PauseIcon, SearchIcon } from '@/components/icons';

/**
 * The campaign control centre — the screen the owner keeps open while a
 * campaign runs. Everything on it is read from the campaign's own queue
 * rows every five seconds: progress, when it started, when the plan ends,
 * what goes out next and where.
 *
 * Pause / Resume / Stop are real operations, not display state:
 *   Pause  — the rules engine parks every row of a paused campaign, so the
 *            queue keeps its slots and nothing is lost.
 *   Resume — flips the campaign back; the same rows continue from where
 *            they stopped.
 *   Stop   — cancels everything that has not started (with a confirmation),
 *            lets a job already running finish, and keeps the history.
 */
export default function CampaignControlCenter() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [state, setState] = useState<CampaignState<QueueRow> | null>(null);
  /* The global pause. This screen never read it, so the run badge said "רץ"
     with a live dot directly under its own header's amber "מושהה" toggle. */
  const [control, setControl] = useState<ControlSettings | null>(null);
  /*
   * Whether the PC that publishes to groups is connected.
   *
   * runBadge() takes this and turns "רץ" into "לא רץ — המחשב לא מחובר", and
   * the dashboard and the runs list both hand it over. This screen did not, so
   * one run wore two different badges depending on which screen the owner
   * happened to be looking at — the exact class of contradiction the rest of
   * this module exists to prevent. `null` until the first read, so the badge
   * never claims the PC is off merely because nothing has answered yet.
   */
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'queue' | 'timeline'>('queue');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Distinct from `campaign`: a finished fetch that found nothing is not loading. */
  const [loaded, setLoaded] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const [c, q, p, ctrl, workers] = await Promise.all([
        getCampaign(id),
        campaignQueueWithStats(id),
        listPostsForCampaign(id),
        getControl(),
        listWorkers().catch(() => null),
      ]);
      setCampaign(c);
      setRows(q.rows);
      setPosts(p);
      setControl(ctrl);
      if (workers) setWorkerOnline(workers.some((w) => w.online));
      const next = campaignState(q.rows, c, { truncated: q.truncated });
      setState(next);
      // A count that disagrees with itself is reported in Hebrew through the
      // activity log the owner already reads — never as an error on screen.
      if (!q.truncated) {
        for (const v of takeUnreported(checkCampaignInvariants(next, { campaignId: id, campaignName: c?.name ?? null }), `campaign:${id}`)) {
          void logClientActivity('warn', `invariant_${v.code}`, `אי-התאמה בספירת הפרסומים — ${v.message}`, v.meta);
        }
      }
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    } finally {
      setLoaded(true);
    }
  }, [id]);

  /*
   * Five seconds, guarded.
   *
   * This is the screen an owner naturally leaves open to watch a run, and it
   * was the most expensive thing in the product: measured in a PRODUCTION
   * build against a 5 000-row queue, 83 requests and 12.81 MB of JSON in a
   * 63-second window — 0.94 MB every five seconds, re-reading up to
   * CAMPAIGN_QUEUE_LIMIT rows with three joins so that a handful of them
   * could change. An hour of watching is roughly 730 MB on a metered Israeli
   * mobile plan.
   *
   * The in-flight guard stops the reads stacking on a slow connection, and
   * pausing while the tab is hidden stops the whole thing entirely when
   * nobody is looking; returning to the tab reads immediately, so what the
   * owner sees on return is current. Making the read itself narrower is a
   * data-layer change and is flagged rather than attempted here.
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
    const t = setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  /**
   * A write, and an honest answer about whether it landed.
   *
   * The three queue writes below — retryQueueItem, cancelQueueItem and
   * confirmQueueItem — are all guarded in client.ts: each filters on the
   * statuses the action is valid from and returns FALSE when it matched no
   * row. This screen polls every five seconds, so a row on it can be that
   * stale, and the guard is what stops a tap on a stale row from stamping a
   * publication that has since gone out or been cancelled.
   *
   * This used to discard that boolean and toast `done` unconditionally, so a
   * write that deliberately changed nothing still reported "אושר לפרסום" —
   * automation presented as having happened. `false` now gets `stale` instead,
   * and the reload right after shows the owner the real state.
   */
  async function act(key: string, fn: () => Promise<unknown>, done: string, stale = 'הפרסום כבר השתנה — רועננו את המסך.') {
    setBusy(key);
    try {
      const result = await fn();
      // Only an explicit `false` is a no-op; every other write returns void.
      toast(result === false ? stale : done, result === false ? 'info' : 'success');
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onStop() {
    const pending = state ? cancellableRows(state.progress) : 0;
    const ok = await confirm.ask({
      title: 'לעצור את הסבב?',
      body: (
        <>
          <p>
            {pending > 0 ? `${pending} פרסומים שטרם התחילו יבוטלו.` : 'אין פרסומים ממתינים לביטול.'} פרסום שרץ ברגע זה יסתיים בבטחה, וכל מה
            שכבר פורסם נשאר בהיסטוריה.
          </p>
          <p className="mt-2 font-bold">אי אפשר לבטל את הפעולה הזו.</p>
        </>
      ),
      confirmLabel: 'עצור סבב',
      danger: true,
    });
    if (ok) await act('stop', () => stopCampaign(id), 'הסבב נעצר.');
  }

  const queueActions = {
    onRetry: (row: QueueRow) => act(`retry-${row.id}`, () => retryQueueItem(row.id), 'הוחזר לתור.'),
    onRunNow: (row: QueueRow) => act(`now-${row.id}`, () => retryQueueItem(row.id), 'יפורסם בריצה הקרובה.'),
    onConfirm: (row: QueueRow) => act(`ok-${row.id}`, () => confirmQueueItem(row.id), 'אושר לפרסום.'),
    onCancel: async (row: QueueRow) => {
      const ok = await confirm.ask({
        title: 'לבטל את הפרסום?',
        body: `הפרסום ל-"${row.target?.name ?? 'היעד'}" לא יישלח.`,
        confirmLabel: 'בטל',
        danger: true,
      });
      if (ok) await act(`cancel-${row.id}`, () => cancelQueueItem(row.id), 'הפרסום בוטל.');
    },
    onScreenshot: (row: QueueRow) =>
      row.screenshot_path && screenshotUrl(row.screenshot_path).then((u) => u && window.open(u, '_blank', 'noreferrer')),
  };

  if (!campaign && !error && !loaded) {
    return (
      <SocialShell title="סבב">
        <Loading />
      </SocialShell>
    );
  }

  if (!campaign) {
    /* A campaign that is simply gone is not an error the owner caused — say so
       plainly and offer the way back, rather than a red banner or a spinner
       that never resolves. */
    return (
      <SocialShell title="סבב">
        {error ? (
          <Notice tone="error">{error}</Notice>
        ) : (
          <EmptyState
            icon={<SearchIcon className="h-5 w-5" />}
            title="הסבב הזה לא קיים"
            description="ייתכן שהוא נמחק, או שהקישור ישן."
            action={
              <ButtonLink href="/social/campaigns" size="lg">לכל סבבי הפרסום</ButtonLink>
            }
          />
        )}
      </SocialShell>
    );
  }

  const closed = state?.state === 'completed' || state?.state === 'stopped';
  /* One opinion about the run, from campaign.ts: the badge's label, colour and
     whether its dot may pulse, and which of the two buttons can actually act.
     Pause is about the ROWS (is anything left to hold back); resume is about
     the RECORD (is it the pause flag that is holding them) — derived from the
     state NAME, resume vanished on a genuinely paused run whose remaining rows
     are all manual, which resolves to 'needs_attention'. */
  const badge = state ? runBadge(state, { globalPaused: control?.paused, workerOnline: workerOnline ?? undefined }) : null;
  const badgeTone: Tone | undefined = badge ? (badge.tone === 'info' ? 'brand' : badge.tone) : undefined;
  const showPause = Boolean(state) && canPauseRun(state!.progress, campaign.status);
  const showResume = Boolean(state) && canResumeRun(state!.progress, campaign.status);
  const view = state ? runProgress(state.progress) : null;

  return (
    <SocialShell
      title={campaign.name}
      headerAction={
        <ButtonLink href={`/social/posts/new?campaign=${campaign.id}`}>
          + פוסט
        </ButtonLink>
      }
      paused={control?.paused ?? null}
      onControlChanged={load}
    >
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}

        {/* Status + progress + the four facts, all from the real queue. */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {/* The dot used to be hard-coded green beside a badge the shared
                  tone map paints blue, and it pulsed on the state NAME alone —
                  so a run whose laptop had been asleep since yesterday pulsed
                  as if it were publishing right now. Both now come from
                  runBadge(), which requires a row a worker is actually holding. */}
              {badge?.live && badgeTone && <span aria-hidden className={`pulse-dot h-2 w-2 rounded-full ${TONE_FILL[badgeTone]}`} />}
              <Badge tone={badge?.tone ?? 'neutral'}>{badge?.label ?? RUN_STATE_LABEL.not_started}</Badge>
              <span className="text-xs text-mist-500">
                {[campaign.service, campaign.city].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>

          {/* The headline. The ring carries the percentage; the tile grid
              further down carries the figures behind it. Every number on this
              screen is a count of real queue rows. */}
          {state && view && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-5 sm:justify-start">
              {/*
                The ring is ROUND PROGRESS — handled rows over the total. It
                was publications, so a run where 13 of 28 rows had ended but
                none had published drew an empty ring and printed "0%".
                The publications figure is still on the screen twice, labelled
                as itself: in the bar's legend below and in the "פורסמו" tile.

                role="img" with the label on the WRAPPER, because ProgressRing
                hard-codes aria-label={`${pct}% הושלמו`} — and "הושלמו" is the
                word reserved for publications, so announcing it over the
                handled figure would re-introduce the contradiction in the one
                layer nobody looks at. A role="img" element's descendants are
                presentational, so this is the label that is read out.
                ProgressRing should take it as a prop; see the report.
              */}
              <div role="img" aria-label={view.ariaLabel}>
                <ProgressRing percent={view.percent} label={`${view.percent}%`} sub={`${view.handled} / ${view.total} טופלו`} />
              </div>
              {/*
                The four-figure <dl> that used to sit here is gone.
                
                This screen printed the same breakdown THREE times inside about
                700px: this row, the progress bar's legend below it, and the
                six-tile grid under that — three visual languages for one set
                of numbers, on a phone. Two of them disagreed with each other:
                this row called `skipped` "דילוגים" in grey while the tile
                called it "דולגו" in blue, because Counter took a raw class
                string (`tone: string`) and was the one place in /social that
                bypassed Tone/TONE_TEXT entirely — it even invented a fifth
                value, text-mist-500, which is not in TONE_TEXT at all.
                
                What is left is the ring (the headline percentage), the bar
                (the proportions) and the tile grid (the figures). Each says
                something the others do not.
              */}
            </div>
          )}

          {state?.truncated && (
            <Notice tone="warn">
              בסבב הזה יותר פרסומים ממה שאפשר להציג בבת אחת, והמספרים כאן הם של {state.progress.total} הפרסומים הראשונים בלבד — לא של הסבב כולו.
            </Notice>
          )}

          <div className="mt-4">{state && <CampaignProgressBar progress={state.progress} />}</div>

          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
            <Fact label="התחיל" value={state?.startedAt ? when(state.startedAt) : null} fallback="טרם התחיל" />
            <Fact label="סיום משוער" value={state?.estimatedCompletionAt ? when(state.estimatedCompletionAt) : null} fallback={closed ? 'הסתיים' : '—'} hint={state?.estimatedCompletionAt ? 'לפי התזמון שהוגדר' : undefined} />
            <Fact label="הפרסום הבא" value={state?.nextAt ? when(state.nextAt) : null} fallback={showResume ? 'מושהה' : 'אין'} hint={state?.nextAt ? relativeHe(state.nextAt) : undefined} />
            <Fact label="הקבוצה הבאה" value={state?.nextTargetName ?? null} fallback="—" />
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {showResume ? (
              <Button busy={busy === 'resume'} onClick={() => act('resume', () => pauseCampaign(id, false), 'הסבב ממשיך מהמקום שבו נעצר.')}>
                המשך סבב
              </Button>
            ) : (
              showPause && (
                /* "השהה סבב" — this pauses THIS round. The header's global
                   toggle, on this very screen, pauses EVERYTHING and carried
                   the identical word. */
                <Button variant="secondary" busy={busy === 'pause'} onClick={() => act('pause', () => pauseCampaign(id, true), 'הסבב הושהה. התור נשמר.')}>
                  השהה סבב
                </Button>
              )
            )}
            {/* No ⏹. This is the destructive control on the run screen and it
                wore a full-colour emoji beside three hairline-glyph buttons. */}
            {!closed && (
              <Button variant="danger" busy={busy === 'stop'} onClick={onStop}>
                <PauseIcon className="h-4 w-4" />
                עצור
              </Button>
            )}
            <Link href="/social/campaigns" className="ms-auto inline-flex min-h-11 items-center text-sm font-bold text-brand-400">
              לכל סבבי הפרסום
            </Link>
          </div>
          {showResume && (
            <p className="mt-2 text-xs text-mist-500">
              השהיה לא מוחקת דבר — כל הפרסומים שומרים על השעה שלהם וימשיכו ברגע שתלחצו "המשך".
            </p>
          )}
        </Card>

        {/* Counters. Six, compact, each one a real count. */}
        {state && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 [&>*]:min-w-0">
            <Tile label="פורסמו" value={state.progress.published} tone="good" />
            <Tile label="ממתינים" value={state.progress.scheduled} tone="brand" />
            {/* Blue, not amber. `progress.running` is exactly IN_FLIGHT_STATUSES,
                and STATUS_TONE.publishing is 'brand' with the comment "a
                publication going out on its own is not a warning" — the
                StatusPills for these very rows, lower on this same page,
                render blue. A healthy run was reading as a problem. */}
            <Tile label="רצים" value={state.progress.running} tone="brand" />
            {/* Zero failures is not an action: a 0 here used to render in the
                brand colour because `'default'` resolved to brand. */}
            <Tile label="נכשלו" value={state.progress.failed} tone={state.progress.failed ? 'bad' : 'neutral'} />
            {/* Skipped is neutral, the same as STATUS_TONE says and the same as
                the Counter above renders it. */}
            <Tile label="דולגו" value={state.progress.skipped} tone="neutral" />
            <Tile label="דורשים פעולה" value={state.progress.manual} tone={state.progress.manual ? 'warn' : 'neutral'} />
          </div>
        )}

        <Card
          title="תור הפרסום"
          subtitle="מתעדכן לבד כל 5 שניות"
          action={
            <SegmentedControl
              size="sm"
              label="תצוגה"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'queue', label: 'רשימה' },
                { value: 'timeline', label: 'ציר זמן' },
              ]}
            />
          }
        >
          {!rows && <Loading />}
          {rows && rows.length === 0 && (
            <EmptyState
              icon={<CalendarIcon className="h-5 w-5" />}
              title="לסבב הזה אין עדיין פרסומים"
              description="צרו פוסט בסבב, בחרו קבוצות ותזמנו — כל פרסום יופיע כאן עם השעה שלו."
              action={
                <ButtonLink href={`/social/posts/new?campaign=${campaign.id}`}>צור פוסט לסבב</ButtonLink>
              }
            />
          )}
          {rows && rows.length > 0 && tab === 'queue' && <QueueSections rows={rows} actions={queueActions} />}
          {rows && rows.length > 0 && tab === 'timeline' && <Timeline rows={state?.upcoming ?? []} limit={12} />}
        </Card>

        {/* Between the list of what went out and the posts themselves: the
            answer to "and did it do anything", which is the question the round
            was run to settle. */}
        {rows && <CampaignReach rows={rows} truncated={Boolean(state?.truncated)} />}

        <Card title={`פוסטים בסבב (${posts.length})`}>
          {posts.length === 0 ? (
            <EmptyState icon={<ClipboardListIcon className="h-5 w-5" />} title="אין פוסטים" description="סבב הוא המסגרת; הפוסטים הם מה שמתפרסם בפועל." />
          ) : (
            <ul className="divide-y divide-ink-700">
              {posts.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/social/posts/${p.id}`)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-start"
                  >
                    <span dir="auto" className="min-w-0 truncate font-bold text-mist-100">{p.title || p.base_text.slice(0, 50) || 'ללא כותרת'}</span>
                    <Badge tone={p.status === 'ready' ? 'good' : 'neutral'}>{p.status === 'ready' ? 'מוכן' : 'טיוטה'}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {confirm.dialog}
    </SocialShell>
  );
}

function Fact({ label, value, fallback, hint }: { label: string; value: string | null; fallback: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-700 px-3 py-2">
      <dt className="text-[11px] font-bold text-mist-500">{label}</dt>
      <dd dir="auto" className={`truncate text-sm font-bold tabular-nums ${value ? 'text-mist-100' : 'text-mist-500'}`}>
        {value ?? fallback}
      </dd>
      {hint && <p dir="auto" className="truncate text-[11px] text-mist-500">{hint}</p>}
    </div>
  );
}

function when(iso: string): string {
  // Isolated: both branches are digit runs that the RTL line around them
  // would otherwise reorder.
  return ltr(zonedDateISO(new Date(iso)) === zonedDateISO(new Date()) ? formatTimeHe(iso) : formatDateTimeHe(iso));
}
