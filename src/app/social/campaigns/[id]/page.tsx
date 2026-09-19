'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CampaignProgressBar } from '@/components/social/CampaignProgressBar';
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
  useConfirm,
  useToast,
  ButtonLink,
} from '@/components/social/ui';
import {
  campaignQueueWithStats,
  cancelQueueItem,
  confirmQueueItem,
  getCampaign,
  listPosts,
  pauseCampaign,
  retryQueueItem,
  screenshotUrl,
  stopCampaign,
  type QueueRow,
} from '@/lib/social/client';
import {
  RUN_STATE_LABEL,
  RUN_STATE_TONE,
  campaignState,
  cancellableRows,
  openRows,
  percentPublished,
  type CampaignState,
} from '@/lib/social/campaign';
import { checkCampaignInvariants, takeUnreported } from '@/lib/social/invariants';
import { logClientActivity } from '@/lib/social/client';
import { formatDateTimeHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import { ltr } from '@/components/social/DateTime';
import type { Campaign, Post } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { CalendarIcon, ClipboardListIcon, SearchIcon } from '@/components/icons';

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
  const [tab, setTab] = useState<'queue' | 'timeline'>('queue');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Distinct from `campaign`: a finished fetch that found nothing is not loading. */
  const [loaded, setLoaded] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const [c, q, p] = await Promise.all([getCampaign(id), campaignQueueWithStats(id), listPosts()]);
      setCampaign(c);
      setRows(q.rows);
      setPosts(p.filter((x) => x.campaign_id === id));
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

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
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

  const paused = state?.state === 'paused';
  const closed = state?.state === 'completed' || state?.state === 'stopped';
  /* Pause can only hold back rows that have not gone out yet. */
  const canPause = Boolean(state) && openRows(state!.progress) > 0;

  return (
    <SocialShell
      title={campaign.name}
      headerAction={
        <ButtonLink href={`/social/posts/new?campaign=${campaign.id}`}>
          + פוסט
        </ButtonLink>
      }
    >
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}

        {/* Status + progress + the four facts, all from the real queue. */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {state?.state === 'running' && <span aria-hidden className="pulse-dot h-2 w-2 rounded-full bg-success-400" />}
              <Badge tone={RUN_STATE_TONE[state?.state ?? 'not_started']}>{RUN_STATE_LABEL[state?.state ?? 'not_started']}</Badge>
              <span className="text-xs text-mist-500">
                {[campaign.service, campaign.city].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>

          {/* The headline: the ring carries the percentage, and the counters
              beside it break that number down. Every figure is a count of real
              queue rows. */}
          {state && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-5 sm:justify-start">
              <ProgressRing
                percent={percentPublished(state.progress)}
                label={`${percentPublished(state.progress)}%`}
                sub={`${state.progress.published} / ${state.progress.total} פורסמו`}
              />
              <dl className="grid min-w-0 flex-1 grid-cols-2 gap-2 [&>*]:min-w-0">
                <Counter label="פורסמו" value={state.progress.published} tone="text-success-400" />
                <Counter label="ממתינים" value={state.progress.scheduled} tone="text-brand-400" />
                <Counter label="נכשלו" value={state.progress.failed} tone={state.progress.failed ? 'text-error-400' : 'text-mist-500'} />
                <Counter label="דילוגים" value={state.progress.skipped} tone="text-mist-500" />
              </dl>
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
            <Fact label="הפרסום הבא" value={state?.nextAt ? when(state.nextAt) : null} fallback={paused ? 'מושהה' : 'אין'} hint={state?.nextAt ? relativeHe(state.nextAt) : undefined} />
            <Fact label="הקבוצה הבאה" value={state?.nextTargetName ?? null} fallback="—" />
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {paused ? (
              <Button busy={busy === 'resume'} onClick={() => act('resume', () => pauseCampaign(id, false), 'הסבב ממשיך מהמקום שבו נעצר.')}>
                המשך סבב
              </Button>
            ) : (
              !closed &&
              canPause && (
                <Button variant="secondary" busy={busy === 'pause'} onClick={() => act('pause', () => pauseCampaign(id, true), 'הסבב הושהה. התור נשמר.')}>
                  השהה
                </Button>
              )
            )}
            {!closed && (
              <Button variant="danger" busy={busy === 'stop'} onClick={onStop}>
                ⏹ עצור
              </Button>
            )}
            <Link href="/social/campaigns" className="ms-auto inline-flex min-h-11 items-center text-sm font-bold text-brand-400">
              לכל סבבי הפרסום
            </Link>
          </div>
          {paused && (
            <p className="mt-2 text-xs text-mist-500">
              השהיה לא מוחקת דבר — כל הפרסומים שומרים על השעה שלהם וימשיכו ברגע שתלחצו "המשך".
            </p>
          )}
        </Card>

        {/* Counters. Six, compact, each one a real count. */}
        {state && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 [&>*]:min-w-0">
            <Tile label="פורסמו" value={state.progress.published} tone="good" />
            <Tile label="ממתינים" value={state.progress.scheduled} />
            <Tile label="רצים" value={state.progress.running} tone={state.progress.running ? 'warn' : 'default'} />
            <Tile label="נכשלו" value={state.progress.failed} tone={state.progress.failed ? 'bad' : 'default'} />
            <Tile label="דולגו" value={state.progress.skipped} />
            <Tile label="דורשים פעולה" value={state.progress.manual} tone={state.progress.manual ? 'warn' : 'default'} />
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

/** One breakdown figure beside the ring. */
function Counter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-ink-700 px-3 py-2">
      <dt className="text-[11px] font-bold text-mist-500">{label}</dt>
      <dd className={`text-xl font-extrabold tabular-nums ${tone}`}>{value}</dd>
    </div>
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
