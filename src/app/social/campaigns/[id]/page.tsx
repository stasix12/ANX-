'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CampaignProgressBar } from '@/components/social/CampaignProgressBar';
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
} from '@/components/social/ui';
import {
  campaignQueue,
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
import { RUN_STATE_LABEL, RUN_STATE_TONE, campaignState, percentDone, type CampaignState } from '@/lib/social/campaign';
import { formatDateTimeHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import type { Campaign, Post } from '@/lib/social/types';

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
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const [c, q, p] = await Promise.all([getCampaign(id), campaignQueue(id), listPosts()]);
      setCampaign(c);
      setRows(q);
      setPosts(p.filter((x) => x.campaign_id === id));
      setState(campaignState(q, c));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינה נכשלה.');
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
      toast(err instanceof Error ? err.message : 'הפעולה נכשלה.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onStop() {
    const pending = state ? state.progress.scheduled + state.progress.running + state.progress.manual : 0;
    const ok = await confirm.ask({
      title: 'לעצור את הקמפיין?',
      body: (
        <>
          <p>
            {pending > 0 ? `${pending} פרסומים שטרם התחילו יבוטלו.` : 'אין פרסומים ממתינים לביטול.'} פרסום שרץ ברגע זה יסתיים בבטחה, וכל מה
            שכבר פורסם נשאר בהיסטוריה.
          </p>
          <p className="mt-2 font-bold">אי אפשר לבטל את הפעולה הזו.</p>
        </>
      ),
      confirmLabel: 'עצור קמפיין',
      danger: true,
    });
    if (ok) await act('stop', () => stopCampaign(id), 'הקמפיין נעצר.');
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

  if (!campaign && !error) {
    return (
      <SocialShell title="קמפיין">
        <Loading />
      </SocialShell>
    );
  }

  if (!campaign) {
    return (
      <SocialShell title="קמפיין">
        <Notice tone="error">{error ?? 'הקמפיין לא נמצא.'}</Notice>
      </SocialShell>
    );
  }

  const paused = state?.state === 'paused';
  const closed = state?.state === 'completed' || state?.state === 'stopped';

  return (
    <SocialShell
      title={campaign.name}
      headerAction={
        <Link href={`/social/posts/new?campaign=${campaign.id}`} className="inline-flex min-h-10 items-center rounded-full bg-white px-3.5 text-sm font-bold text-blue-700 shadow-sm">
          + פוסט
        </Link>
      }
    >
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}

        {/* Status + progress + the four facts, all from the real queue. */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {state?.state === 'running' && <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
              <Badge tone={RUN_STATE_TONE[state?.state ?? 'not_started']}>{RUN_STATE_LABEL[state?.state ?? 'not_started']}</Badge>
              <span className="text-xs text-mist-500">
                {[campaign.service, campaign.city].filter(Boolean).join(' · ')}
              </span>
            </div>
            {state && <span className="text-2xl font-extrabold tabular-nums text-brand-400">{percentDone(state.progress)}%</span>}
          </div>

          <div className="mt-3">{state && <CampaignProgressBar progress={state.progress} />}</div>

          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact label="התחיל" value={state?.startedAt ? when(state.startedAt) : null} fallback="טרם התחיל" />
            <Fact label="סיום משוער" value={state?.estimatedCompletionAt ? when(state.estimatedCompletionAt) : null} fallback={closed ? 'הסתיים' : '—'} hint={state?.estimatedCompletionAt ? 'לפי התזמון שהוגדר' : undefined} />
            <Fact label="הפרסום הבא" value={state?.nextAt ? when(state.nextAt) : null} fallback={paused ? 'מושהה' : 'אין'} hint={state?.nextAt ? relativeHe(state.nextAt) : undefined} />
            <Fact label="הקבוצה הבאה" value={state?.nextTargetName ?? null} fallback="—" />
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {paused ? (
              <Button busy={busy === 'resume'} onClick={() => act('resume', () => pauseCampaign(id, false), 'הקמפיין ממשיך מהמקום שבו נעצר.')}>
                ▶ המשך קמפיין
              </Button>
            ) : (
              !closed && (
                <Button variant="secondary" busy={busy === 'pause'} onClick={() => act('pause', () => pauseCampaign(id, true), 'הקמפיין הושהה. התור נשמר.')}>
                  ⏸ השהה
                </Button>
              )
            )}
            {!closed && (
              <Button variant="danger" busy={busy === 'stop'} onClick={onStop}>
                ⏹ עצור
              </Button>
            )}
            <Link href="/social/campaigns" className="ms-auto inline-flex min-h-11 items-center text-sm font-bold text-brand-400">
              לכל הקמפיינים
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
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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
              icon="🗓️"
              title="לקמפיין הזה אין עדיין פרסומים"
              description="צרו פוסט בקמפיין, בחרו קבוצות ותזמנו — כל פרסום יופיע כאן עם השעה שלו."
              action={
                <Link href={`/social/posts/new?campaign=${campaign.id}`}>
                  <Button>צור פוסט לקמפיין</Button>
                </Link>
              }
            />
          )}
          {rows && rows.length > 0 && tab === 'queue' && <QueueSections rows={rows} actions={queueActions} />}
          {rows && rows.length > 0 && tab === 'timeline' && <Timeline rows={state?.upcoming ?? []} limit={12} />}
        </Card>

        <Card title={`פוסטים בקמפיין (${posts.length})`}>
          {posts.length === 0 ? (
            <EmptyState icon="📝" title="אין פוסטים" description="קמפיין הוא המסגרת; הפוסטים הם מה שמתפרסם בפועל." />
          ) : (
            <ul className="divide-y divide-ink-700">
              {posts.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/social/posts/${p.id}`)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-start"
                  >
                    <span className="min-w-0 truncate font-bold text-mist-100">{p.title || p.base_text.slice(0, 50) || 'ללא כותרת'}</span>
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
    <div className="min-w-0 rounded-xl border border-ink-600 px-3 py-2">
      <dt className="text-[11px] font-bold text-mist-500">{label}</dt>
      <dd dir="auto" className={`truncate text-sm font-bold tabular-nums ${value ? 'text-mist-100' : 'text-mist-500'}`}>
        {value ?? fallback}
      </dd>
      {hint && <p className="truncate text-[11px] text-mist-500">{hint}</p>}
    </div>
  );
}

function when(iso: string): string {
  return zonedDateISO(new Date(iso)) === zonedDateISO(new Date()) ? formatTimeHe(iso) : formatDateTimeHe(iso);
}
