import { EMPTY_PROGRESS, type Campaign, type CampaignProgress, type QueueItem, type QueueStatus } from './types';

/**
 * The campaign control centre's view model, derived entirely from the real
 * queue rows — nothing here is estimated from an average or invented to fill
 * a slot. When a number cannot be known (no publication has run yet, nothing
 * is left to schedule) the field is null and the screen says so.
 */

export type RunState = 'not_started' | 'running' | 'paused' | 'completed' | 'stopped' | 'needs_attention';

export const RUN_STATE_LABEL: Record<RunState, string> = {
  not_started: 'טרם התחיל',
  running: 'רץ',
  paused: 'מושהה',
  completed: 'הושלם',
  stopped: 'נעצר',
  needs_attention: 'דורש טיפול',
};

export const RUN_STATE_TONE: Record<RunState, 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'brand'> = {
  not_started: 'neutral',
  running: 'info',
  paused: 'warn',
  completed: 'good',
  stopped: 'neutral',
  needs_attention: 'bad',
};

/** Queue rows, with just the fields this module needs from the joined target. */
export interface CampaignQueueRow extends Pick<QueueItem, 'id' | 'status' | 'scheduled_at' | 'published_at' | 'target_id' | 'post_id'> {
  target?: { id: string; name: string; channel?: string; image_url?: string | null } | null;
}

/**
 * Generic over the row shape so a caller that fetched full rows (with the
 * post and variant joined) gets those back out of `upcoming`/`done`, while a
 * caller that fetched the narrow columns is not forced to pretend otherwise.
 */
export interface CampaignState<T extends CampaignQueueRow = CampaignQueueRow> {
  progress: CampaignProgress;
  state: RunState;
  /** First real publication. Null until something has actually gone out. */
  startedAt: string | null;
  /** Last scheduled_at still ahead of us — the plan's own end, not a guess. */
  estimatedCompletionAt: string | null;
  nextAt: string | null;
  nextTargetName: string | null;
  /** The soonest still-unfinished rows, ascending — feeds the timeline. */
  upcoming: T[];
  /** Everything finished, newest first. */
  done: T[];
  /** Publishing right now (at most a couple; the worker runs one at a time). */
  now: T[];
}

const FINISHED: QueueStatus[] = ['published', 'failed', 'skipped'];
const IN_FLIGHT: QueueStatus[] = ['publishing', 'awaiting_confirmation'];

export function campaignState<T extends CampaignQueueRow>(rows: T[], campaign?: Pick<Campaign, 'status'> | null): CampaignState<T> {
  const progress: CampaignProgress = { ...EMPTY_PROGRESS, total: rows.length };
  for (const r of rows) {
    if (r.status === 'published') progress.published += 1;
    else if (r.status === 'failed') progress.failed += 1;
    else if (r.status === 'skipped') progress.skipped += 1;
    else if (r.status === 'scheduled' || r.status === 'paused') progress.scheduled += 1;
    else if (IN_FLIGHT.includes(r.status)) progress.running += 1;
    else if (r.status === 'manual_pending' || r.status === 'needs_attention') progress.manual += 1;
  }
  progress.done = progress.published + progress.failed + progress.skipped;

  const published = rows.filter((r) => r.published_at);
  const startedAt = published.length ? published.map((r) => r.published_at as string).sort()[0] : null;

  const pending = rows
    .filter((r) => r.status === 'scheduled')
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const next = pending[0] ?? null;
  const last = pending[pending.length - 1] ?? null;

  const now = rows.filter((r) => IN_FLIGHT.includes(r.status));
  const unfinished = rows
    .filter((r) => !FINISHED.includes(r.status))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const done = rows
    .filter((r) => FINISHED.includes(r.status))
    .sort((a, b) => (b.published_at ?? b.scheduled_at).localeCompare(a.published_at ?? a.scheduled_at));

  return {
    progress,
    state: resolveState(progress, campaign?.status, rows.length),
    startedAt,
    // The plan already assigns every remaining row an instant; the last one
    // is when the campaign finishes, assuming nothing is deferred by the
    // anti-spam rules. Anything else would be a guess.
    estimatedCompletionAt: last?.scheduled_at ?? null,
    nextAt: next?.scheduled_at ?? null,
    nextTargetName: next?.target?.name ?? null,
    upcoming: unfinished,
    done,
    now,
  };
}

function resolveState(p: CampaignProgress, campaignStatus: Campaign['status'] | undefined, total: number): RunState {
  if (!total) return 'not_started';
  if (campaignStatus === 'archived') return 'stopped';
  if (p.manual > 0 && p.scheduled === 0 && p.running === 0) return 'needs_attention';
  if (campaignStatus === 'paused') return 'paused';
  if (p.done + p.manual >= total && p.running === 0) return 'completed';
  if (p.running > 0 || p.done > 0) return 'running';
  return 'not_started';
}

/** "רץ · 18 מתוך 125" — one line for a card header. */
export function campaignHeadline(state: CampaignState): string {
  const { progress } = state;
  if (!progress.total) return 'אין פרסומים מתוכננים';
  return `${progress.done} מתוך ${progress.total} הושלמו`;
}

export function percentDone(progress: CampaignProgress): number {
  if (!progress.total) return 0;
  return Math.round((progress.done / progress.total) * 100);
}
