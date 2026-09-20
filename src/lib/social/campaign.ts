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
    // `startedAt !== null` is handed in rather than re-derived: it is the very
    // fact the card prints under "התחיל", so the badge and that line are now
    // computed from one value and cannot disagree.
    state: resolveState(progress, campaign?.status, rows.length, startedAt !== null),
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
function resolveState(
  p: CampaignProgress,
  campaignStatus: Campaign['status'] | undefined,
  total: number,
  started: boolean,
): RunState {
  // Archived is checked before the row count. It used to come second, so a run
  // the owner had stopped whose rows were gone (a deleted post, or a stop
  // before anything was planned) reported 'not_started': the campaigns list
  // counted it under "פעילים", printed "טרם התחיל" and offered "השהה" for a
  // run that had already been ended.
  if (campaignStatus === 'archived') return 'stopped';
  if (!total) return 'not_started';
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
  /*
   * "רץ" needs a fact, not an inference.
   *
   * This line used to read `if (p.finished > 0 || p.manual > 0) return
   * 'running'`, so a run whose only ended row had FAILED was called running —
   * and a failed or skipped row never gets a published_at, so `startedAt`
   * stayed null and the very same card printed "● רץ" above "התחיל: טרם
   * התחיל". A run with nothing but manual rows was called running too, with no
   * worker holding anything.
   *
   * A worker is holding a row (checked above), or something has actually gone
   * out. Otherwise the run is still waiting for its first slot, which is
   * exactly what "טרם התחיל" says.
   */
  if (started) return 'running';
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
 * Both percentages round, and rounding is a second way to print a number that
 * is not true: 249 of 250 is 99.6, which rounds to "100%" while a publication
 * is still waiting to go out. So 100 is reserved for the exact count — every
 * other ratio stops at 99, whatever it rounds to. 0 is left alone: a run that
 * has genuinely handled nothing is 0%.
 */
function ratio(part: number, total: number): number {
  if (!total) return 0;
  if (part >= total) return 100;
  return Math.min(99, Math.round((part / total) * 100));
}

/**
 * Publications over the whole run — the SUCCESS figure. The one number that
 * cannot say "complete" about a run that published nothing.
 */
export function percentPublished(progress: CampaignProgress): number {
  return ratio(progress.published, progress.total);
}

/**
 * How much of the run has ended, whatever the outcome — the PROGRESS figure.
 * This is what a bar or a ring is about; it is never rendered as "הושלמו",
 * which is the word reserved for publications.
 */
export function percentFinished(progress: CampaignProgress): number {
  return ratio(progress.finished, progress.total);
}

/**
 * TWO NUMBERS, AND THEY ARE NOT THE SAME NUMBER.
 *
 * A run has two truths and the owner reads both: how much of it has been
 * HANDLED (published + failed + skipped — how far along it is), and how much
 * of it SUCCEEDED (published — what he actually got). Every surface conflated
 * them in one direction or the other: the run card drew a bar over
 * publications alone, so a run with one of 29 rows already failed showed a
 * 0%-wide bar and printed "0%"; the shared bar drew its segments over handled
 * rows under a caption counting publications, so the same run looked full on
 * one screen and empty on the other, one tap apart.
 *
 * runProgress() builds both, once, with the Hebrew already written, so no
 * component has to decide for itself what a bar, a ring or an aria-label is
 * about. The rule it enforces: `percent`, `handled` and `handledLabel` are the
 * run's progress; `published` and `publishedLabel` are its successes, and are
 * never folded into the progress figure.
 */
export interface RunProgressView {
  total: number;
  /** published + failed + skipped — every row that will not change again. */
  handled: number;
  /** Successful publications only. */
  published: number;
  /** Still waiting: on the clock, on a worker, or on a person. */
  open: number;
  /**
   * 0–100 over HANDLED rows. This is the bar's width, the ring's fill and the
   * big figure beside them, so one handled row out of 29 is never drawn or
   * printed as 0%. 100 only ever means nothing is open.
   */
  percent: number;
  /** The same ratio over publications alone, for a screen that shows both. */
  percentPublished: number;
  /** "1 מתוך 29 טופלו" — the progress sentence. */
  handledLabel: string;
  /** "0 מתוך 29 פורסמו" — the success sentence, always a separate line. */
  publishedLabel: string;
  /** "12 דולגו · 3 נכשלו", or '' when every handled row published. */
  note: string;
  /**
   * What a progressbar or a role="img" must announce: the percentage together
   * with what it counts. A ring that announced a hard-coded "הושלמו" over this
   * figure is how the reserved word came back in the layer nobody looks at.
   */
  ariaLabel: string;
}

export function runProgress(progress: CampaignProgress): RunProgressView {
  const { total, published, finished } = progress;
  const percent = percentFinished(progress);
  const handledLabel = total ? `${finished} מתוך ${total} טופלו` : 'אין פרסומים מתוכננים';
  return {
    total,
    handled: finished,
    published,
    open: openRows(progress),
    percent,
    percentPublished: percentPublished(progress),
    handledLabel,
    publishedLabel: total ? `${published} מתוך ${total} פורסמו` : 'אין פרסומים מתוכננים',
    note: unpublishedNote(progress),
    ariaLabel: total ? `${percent}% — ${handledLabel}` : handledLabel,
  };
}

/** The tone vocabulary campaign.ts speaks; `info` is the screens' `brand`. */
export type RunTone = (typeof RUN_STATE_TONE)[RunState];

/**
 * THE state badge — label, colour, and whether a live dot may pulse.
 *
 * Three screens drew this badge and each decided for itself, so all three said
 * different things about one run: the dashboard hero knew about the global
 * pause and the list card did not (green "● רץ" under a header reading
 * "המשך הכול"); the hero required a real in-flight row before pulsing and the
 * list card pulsed on the state name alone (a run whose laptop had been asleep
 * since yesterday pulsed as if it were publishing right now).
 *
 * Both extra facts are OPTIONAL inputs and this stays a pure function: it
 * fetches nothing and knows nothing about a clock.
 *
 *   globalPaused — the control row's `paused`, which the screen already reads.
 *   workerOnline — listWorkers()'s heartbeat, the same boolean the browser
 *                  card uses. Pass it only for a run that depends on the local
 *                  browser worker (group publishing, i.e. all of it here); a
 *                  Page published through the Graph API does not need that PC
 *                  to be on, so claiming it is not running would be false.
 *                  Leave it undefined when it is not known — undefined never
 *                  changes the badge.
 */
export interface RunBadgeView {
  /** Hebrew, ready to render. */
  label: string;
  tone: RunTone;
  /** A pulsing "live" dot may be drawn only when this is true. */
  live: boolean;
}

export function runBadge(
  state: Pick<CampaignState, 'state' | 'progress'>,
  ctx: { globalPaused?: boolean; workerOnline?: boolean } = {},
): RunBadgeView {
  const p = state.progress;
  // Everything is held, so nothing is running whatever this run's own rows say.
  if (ctx.globalPaused) return { label: RUN_STATE_LABEL.paused, tone: RUN_STATE_TONE.paused, live: false };
  // The PC that does the publishing is not connected. The run has not stopped
  // and nothing has failed — it simply is not moving, and the badge says which.
  if (state.state === 'running' && ctx.workerOnline === false) {
    return { label: 'לא רץ — המחשב לא מחובר', tone: 'warn', live: false };
  }
  /*
   * A finished run is not automatically a good outcome, and green said it was:
   * a run whose 29 rows all failed, or one stopped so every waiting row became
   * 'skipped', wore the same green "הושלם" as a run that published everything.
   *
   * This is deliberately a LABEL, not a seventh RunState. The enum is matched
   * by string on four screens outside this module ('completed' gates the
   * "פעילים"/"הושלמו" filter, the pause button and the run screen's `closed`),
   * so a new member would quietly move an ended run back into the active list.
   * The information is right here on CampaignProgress, and the badge is the
   * only place it is rendered differently.
   */
  if (state.state === 'completed' && (p.failed > 0 || p.skipped > 0)) {
    const label =
      p.failed > 0 ? 'הסתיים עם כשלים' : p.published === 0 ? 'הסתיים בלי פרסומים' : 'הסתיים — חלק דולגו';
    return { label, tone: 'warn', live: false };
  }
  return {
    label: RUN_STATE_LABEL[state.state],
    tone: RUN_STATE_TONE[state.state],
    // The dot claims a publication is happening RIGHT NOW, so only a row a
    // worker is actually holding may light it.
    live: state.state === 'running' && p.running > 0,
  };
}

/**
 * Which of the two run buttons may be offered.
 *
 * Both were derived from the RunState name, one screen at a time, and both
 * were wrong in opposite directions. "השהה" was offered on a run with nothing
 * left to hold back, and toasted "הסבב הושהה" over a write that could not move
 * a single row. "המשך סבב" vanished on a genuinely paused run whose remaining
 * rows are all manual — that run resolves to 'needs_attention', so the record
 * said paused while no screen offered a way out of it.
 *
 * So: pause is about the ROWS (is anything left to hold back), resume is about
 * the RECORD (is it the pause flag that is holding them).
 */
export function canPauseRun(progress: CampaignProgress, campaignStatus?: Campaign['status']): boolean {
  return campaignStatus !== 'paused' && campaignStatus !== 'archived' && openRows(progress) > 0;
}

export function canResumeRun(progress: CampaignProgress, campaignStatus?: Campaign['status']): boolean {
  return campaignStatus === 'paused' && openRows(progress) > 0;
}
