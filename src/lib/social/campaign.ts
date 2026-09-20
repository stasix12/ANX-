import {
  IN_FLIGHT_STATUSES,
  NEEDS_HUMAN_STATUSES,
  TERMINAL_STATUSES,
  isTerminal,
} from './status';
import { EMPTY_PROGRESS, type Campaign, type CampaignProgress, type QueueItem } from './types';

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
  // Amber, not red: the KPI tile for these very rows is "דורשים טיפול" in
  // amber, and the two sat 200px apart on the dashboard saying different
  // things about the same publications. Red is for what failed; this is what
  // is waiting for a person.
  needs_attention: 'warn',
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
  /**
   * The rows this state was built from were capped by the read, so every
   * number here is of that slice and not of the run. The card says so instead
   * of printing a ceiling as a fact — a capped number presented as a total is
   * how "100% הושלם" appeared beside rows the dashboard still counted as
   * waiting. Set by the caller that knows its own limit (client.ts).
   */
  truncated: boolean;
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

/**
 * The buckets come from status.ts. Nothing here decides for itself what a
 * status means, which is the only way a tile and a card can be made to agree.
 */
export function campaignState<T extends CampaignQueueRow>(
  rows: T[],
  campaign?: Pick<Campaign, 'status'> | null,
  opts: { truncated?: boolean } = {},
): CampaignState<T> {
  const progress: CampaignProgress = { ...EMPTY_PROGRESS, total: rows.length };
  for (const r of rows) {
    if (r.status === 'published') progress.published += 1;
    else if (r.status === 'failed') progress.failed += 1;
    else if (r.status === 'skipped') progress.skipped += 1;
    else if (IN_FLIGHT_STATUSES.includes(r.status)) progress.running += 1;
    else if (NEEDS_HUMAN_STATUSES.includes(r.status)) progress.manual += 1;
    else progress.scheduled += 1;
  }
  progress.finished = progress.published + progress.failed + progress.skipped;

  const published = rows.filter((r) => r.published_at);
  const startedAt = published.length ? published.map((r) => r.published_at as string).sort()[0] : null;

  const pending = rows
    .filter((r) => r.status === 'scheduled')
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const next = pending[0] ?? null;
  const last = pending[pending.length - 1] ?? null;

  const now = rows.filter((r) => IN_FLIGHT_STATUSES.includes(r.status));
  // "Upcoming" is every row that has not finished, and only those: a terminal
  // row drawn on the timeline is a publication that will never happen shown as
  // one that will. checkCampaignInvariants() re-checks this against the result.
  const unfinished = rows
    .filter((r) => !isTerminal(r.status))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const done = rows
    .filter((r) => TERMINAL_STATUSES.includes(r.status))
    .sort((a, b) => (b.published_at ?? b.scheduled_at).localeCompare(a.published_at ?? a.scheduled_at));

  return {
    progress,
    state: resolveState(progress, campaign?.status, rows.length),
    truncated: opts.truncated ?? false,
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

/** Rows that have not finished: waiting on the clock, on a worker, or on a person. */
export function openRows(p: CampaignProgress): number {
  return p.scheduled + p.running + p.manual;
}

/**
 * What a stop will actually cancel: every waiting row, and not the one a
 * worker is holding — that job is left to finish, by design.
 *
 * The confirmation dialogs used to quote openRows(), so a stop landing while a
 * publication was in flight promised to cancel one more than it could.
 */
export function cancellableRows(p: CampaignProgress): number {
  return p.scheduled + p.manual;
}

/**
 * What the run is doing, and therefore which button the card may offer.
 *
 * The terminal check comes FIRST, before the campaign record's own flag. It
 * used to come last, so a run whose every row had finished on a campaign still
 * marked 'paused' reported 'paused' — the card showed "מושהה" and a "המשך סבב"
 * button beside a full bar, and pressing it flipped a flag that could not move
 * anything, because no row was left to run.
 *
 * The rule now: if nothing is open, the run is over, whatever the record says.
 * 'paused' is only reachable while rows are actually waiting to go out, so the
 * resume button is never offered when it cannot act.
 */
function resolveState(p: CampaignProgress, campaignStatus: Campaign['status'] | undefined, total: number): RunState {
  if (!total) return 'not_started';
  if (campaignStatus === 'archived') return 'stopped';
  // Nothing left to do — the run has ended, however it ended.
  if (openRows(p) === 0) return 'completed';
  // Paused is only true while rows are actually being held back. A job already
  // in flight finishes either way, and a row waiting for a person is not
  // waiting for the pause — so neither of those makes "המשך סבב" a button that
  // can do anything, and neither may put the card in 'paused'.
  if (campaignStatus === 'paused' && p.scheduled > 0) return 'paused';
  if (p.running > 0) return 'running';
  // Only people can move what is left.
  if (p.manual > 0 && p.scheduled === 0) return 'needs_attention';
  if (p.finished > 0 || p.manual > 0) return 'running';
  return 'not_started';
}

/**
 * One line for a card header, and it says what actually happened.
 *
 * "הושלמו" used to sit on published + failed + skipped, so a run that
 * published nothing read "84 מתוך 84 הושלמו". Publications are what the owner
 * counts, so that is what the headline counts; when the rest of the run ended
 * some other way, the second clause says so rather than folding it in.
 */
export function campaignHeadline(state: CampaignState): string {
  const { progress } = state;
  if (!progress.total) return 'אין פרסומים מתוכננים';
  const head = `${progress.published} מתוך ${progress.total} פורסמו`;
  const rest = unpublishedNote(progress);
  return rest ? `${head} · ${rest}` : head;
}

/**
 * "12 דולגו · 3 נכשלו" — the finished rows that did not publish, or '' when
 * every finished row published. Never invents a zero.
 */
export function unpublishedNote(progress: CampaignProgress): string {
  const parts: string[] = [];
  if (progress.skipped > 0) parts.push(`${progress.skipped} דולגו`);
  if (progress.failed > 0) parts.push(`${progress.failed} נכשלו`);
  return parts.join(' · ');
}

/**
 * The bar. Publications over the whole run — the one number that cannot say
 * "complete" about a run that published nothing.
 */
export function percentPublished(progress: CampaignProgress): number {
  if (!progress.total) return 0;
  return Math.round((progress.published / progress.total) * 100);
}

/**
 * How much of the run has ended, whatever the outcome. Useful for ordering
 * runs by how far along they are; never rendered as "הושלמו".
 */
export function percentFinished(progress: CampaignProgress): number {
  if (!progress.total) return 0;
  return Math.round((progress.finished / progress.total) * 100);
}
