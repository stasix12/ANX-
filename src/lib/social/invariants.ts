import { openRows, type CampaignState } from './campaign';
import { CLAIMABLE_STATUSES, isTerminal, summarizeQueue, type QueueSummary } from './status';
import type { QueueStatus } from './types';

/**
 * The rules the counts must obey, checked against the real numbers rather than
 * assumed.
 *
 * Every contradiction the owner reported was two correct computations of two
 * different things, printed side by side as if they were comparable. Fixing
 * the classification (status.ts) removes the causes we found; these checks are
 * what catches the next one, in the owner's own data, instead of waiting for
 * him to notice a card disagreeing with a tile.
 *
 * A violation is never rendered as an error on screen — it goes to the
 * activity log in Hebrew, with the campaign id, the row ids and the statuses
 * involved, so the fault can be traced to actual rows.
 */
export interface InvariantViolation {
  code: string;
  /** Hebrew, safe to show the owner in the activity log. */
  message: string;
  meta: Record<string, unknown>;
}

/** How many row ids a violation carries — enough to find them, not a dump. */
const SAMPLE = 10;

/**
 * One campaign's state.
 *
 *  I1  a terminal row never appears in `upcoming`
 *  I2  the buckets partition `total` exactly once
 *  I3  a run with nothing waiting is not 'paused' (and not 'running')
 *  I4  'completed' means nothing is open
 *  I5  a waiting row that no worker can ever claim is reported, not counted
 *      silently as if it were going to go out
 */
export function checkCampaignInvariants(
  state: Pick<CampaignState, 'progress' | 'state' | 'upcoming'>,
  ctx: { campaignId?: string | null; campaignName?: string | null } = {},
): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const p = state.progress;
  const base = { campaignId: ctx.campaignId ?? null, campaignName: ctx.campaignName ?? null };

  const terminalUpcoming = state.upcoming.filter((r) => isTerminal(r.status));
  if (terminalUpcoming.length) {
    out.push({
      code: 'terminal_row_listed_as_upcoming',
      message: `${terminalUpcoming.length} פרסומים שכבר הסתיימו מופיעים ברשימת הפרסומים הקרובים`,
      meta: {
        ...base,
        rowIds: terminalUpcoming.slice(0, SAMPLE).map((r) => r.id),
        statuses: unique(terminalUpcoming.map((r) => r.status)),
      },
    });
  }

  const partition = p.published + p.failed + p.skipped + p.scheduled + p.running + p.manual;
  if (partition !== p.total) {
    out.push({
      code: 'counts_do_not_partition_total',
      message: `ספירת הפרסומים בסבב לא מסתדרת: ${partition} מתוך ${p.total} שויכו לקטגוריה`,
      meta: { ...base, counted: partition, total: p.total, progress: { ...p } },
    });
  }

  const open = openRows(p);
  if (state.state === 'paused' && open === 0) {
    out.push({
      code: 'paused_with_nothing_waiting',
      message: 'הסבב מסומן כמושהה אך לא נשאר בו פרסום אחד שממתין לצאת',
      meta: { ...base, progress: { ...p } },
    });
  }
  if (state.state === 'completed' && open > 0) {
    out.push({
      code: 'completed_with_open_rows',
      message: `הסבב מסומן כהושלם אך ${open} פרסומים עדיין לא יצאו`,
      meta: {
        ...base,
        open,
        rowIds: state.upcoming.slice(0, SAMPLE).map((r) => r.id),
        statuses: unique(state.upcoming.map((r) => r.status)),
      },
    });
  }

  const unclaimable = state.upcoming.filter((r) => r.status === 'paused');
  if (unclaimable.length) {
    out.push({
      code: 'unclaimable_waiting_rows',
      message: `${unclaimable.length} פרסומים נמצאים בסטטוס שאף worker לא יאסוף — הם לעולם לא יצאו בלי טיפול ידני`,
      meta: { ...base, rowIds: unclaimable.slice(0, SAMPLE).map((r) => r.id), claimable: CLAIMABLE_STATUSES },
    });
  }

  return out;
}

/**
 * The whole queue, from the per-status counts the dashboard tiles are built
 * from: the tiles must cover every row exactly once, and the number in a
 * confirmation dialog must be the number the write will deliver.
 */
export function checkQueueInvariants(
  counts: Record<QueueStatus, number>,
  summary: QueueSummary = summarizeQueue(counts),
): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const partition = summary.terminal + summary.waiting + summary.inFlight;
  if (partition !== summary.total) {
    out.push({
      code: 'queue_counts_do_not_partition',
      message: `ספירת התור לא מסתדרת: ${partition} מתוך ${summary.total} פרסומים שויכו לקטגוריה`,
      meta: { counted: partition, total: summary.total, counts: { ...counts } },
    });
  }
  if (summary.queued + summary.needsHuman !== summary.open) {
    out.push({
      code: 'queue_tiles_do_not_cover_open_rows',
      message: `${summary.open} פרסומים פתוחים, אך האריחים מציגים ${summary.queued + summary.needsHuman} מהם`,
      meta: { open: summary.open, queued: summary.queued, needsHuman: summary.needsHuman },
    });
  }
  if (counts.paused > 0) {
    out.push({
      code: 'unclaimable_waiting_rows',
      message: `${counts.paused} פרסומים נמצאים בסטטוס שאף worker לא יאסוף — הם לעולם לא יצאו בלי טיפול ידני`,
      meta: { paused: counts.paused, claimable: CLAIMABLE_STATUSES },
    });
  }
  return out;
}

function unique(list: QueueStatus[]): QueueStatus[] {
  return Array.from(new Set(list));
}

/**
 * A violation is written once per code per subject for as long as the tab
 * lives. The dashboard reloads every 30 seconds and the run page every 5; a
 * broken invariant would otherwise fill the activity log the owner reads.
 */
const reported = new Set<string>();

export function takeUnreported(violations: InvariantViolation[], subject = ''): InvariantViolation[] {
  return violations.filter((v) => {
    const key = `${subject}|${v.code}`;
    if (reported.has(key)) return false;
    reported.add(key);
    return true;
  });
}

/** Test seam: the dedupe memory is process-wide, so a suite can clear it. */
export function resetInvariantReports(): void {
  reported.clear();
}
