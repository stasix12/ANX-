import {
  ALL_QUEUE_STATUSES,
  AUTOMATIC_WAITING_STATUSES,
  IN_FLIGHT_STATUSES,
  NEEDS_HUMAN_STATUSES,
  TERMINAL_STATUSES,
  isTerminal,
} from './status';
import { agree, counted } from './time';
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
/**
 * Why a round's numbers are not exact — one of four, and each gets its own
 * sentence on screen.
 *
 *   too-big          the read really was cut: more rows than one request holds
 *   db-outdated      the counting views are not in this database yet
 *   too-many-rounds  more campaigns than one counts request can carry
 *   read-failed      the counts request itself did not come back
 */
export type CountsNote = 'too-big' | 'db-outdated' | 'too-many-rounds' | 'read-failed';

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
  /**
   * WHY `truncated` is set — because "this round is larger than one request
   * can count" and "this database has not had social-latest.sql run on it"
   * are different sentences and only one of them is something the owner can
   * act on. The card used to print the first over the second.
   *
   * Optional so every existing fixture keeps compiling; null means the counts
   * are exact and nothing needs explaining.
   */
  countsNote?: CountsNote | null;
  /**
   * PUBLICATIONS THAT WENT OUT TODAY AND ARE NOT IN `progress`.
   *
   * "לא סופר לי את הפוסטים בקמפיין." The account header counts by when a row
   * PUBLISHED; this card counts by when a row was DUE. Both are right, and the
   * screen showed 31 beside 0 — because the number he watched go out had
   * nowhere on this card to be.
   *
   * It is NOT added to `progress`, and that is the whole design. `progress.total`
   * is today's PLAN — the groups he set up — and a denominator that grows
   * through the day with yesterday's tail is the "מה זה ה-497 הזה?" fault
   * pointing the other way. A fact that is missing gets a sentence, not a
   * bigger denominator.
   *
   * Zero for a lifetime-scoped card: there, those rows are already in its total.
   */
  publishedOutsidePlanToday?: number;
  /** False when the read above hit its ceiling — the figure is then a FLOOR. */
  outsidePlanIsWhole?: boolean;
  /**
   * These rows are TODAY'S, not the round's whole history.
   *
   * "מה זה ה-497 הזה?" — 219 groups and 497 rows, because a repeating round
   * plans the same groups again every day and the counter was the campaign's
   * lifetime. With the daily repeat on it grows by a round a day for ever, and
   * a percentage of a number that never ends is not a percentage of anything.
   *
   * So a repeating round is counted for today and resets by construction, like
   * the dashboard's daily bar. The flag travels WITH the numbers rather than
   * being re-derived by each card, because a card that printed "היום" over
   * lifetime figures — or lifetime figures with no "היום" — would be the same
   * fault as every other one in this module: a true number under a false
   * sentence.
   */
  todayOnly: boolean;
  /** First real publication. Null until something has actually gone out. */
  startedAt: string | null;
  /**
   * THE ROUND'S WHOLE LIFE, not today's slice — and the one pair of numbers
   * here that `todayOnly` does not touch.
   *
   * "לאן נעלם המשבצת של התגובות מהירות?" The quick-comments strip shows the
   * runs that have something to comment under, and it decided that from
   * `progress.published`. The moment the daily repeat was switched on, that
   * number became TODAY'S — so between midnight and the day's first
   * publication it is zero for every repeating round, and the strip vanished
   * from the dashboard. It came back by itself at noon, which is exactly how a
   * bug like this stays unreported for a week.
   *
   * Two readings of "has this round published anything" were always needed and
   * only one existed. The counter on the card is a question about today; the
   * comment strip is a question about ever. They are separate fields now so
   * neither can be answered with the other's number.
   */
  everPublished: number;
  /** The most recent publication of this round, whatever day it was. */
  lastPublishedAt: string | null;
  /** And its channel, for the strip's badge. */
  lastPublishedChannel: string | null;
  /**
   * HOW MANY DISTINCT GROUPS this round publishes to — not how many rows it
   * has.
   *
   * "בפועל המערכת מפרסמת בהרבה יותר קבוצות." A repeating round sends one post
   * to one group more than once, so "מפרסם ל-84 קבוצות" over 40 groups would
   * be a number that is in no table. Exact when the caller supplies it (the
   * v27 view's own aggregate); otherwise distinct over the rows it was given,
   * which is what the dashboard used to do for itself.
   */
  targetCount: number;
  /** Last scheduled_at still ahead of us — the plan's own end, not a guess. */
  estimatedCompletionAt: string | null;
  nextAt: string | null;
  nextTargetName: string | null;
  /**
   * The channel of that next row, because the account-wide spacing rule costs
   * a group more than a page.
   *
   * rules.ts adds browser.groupMinGapMinutes on top of limits.minGapMinutes
   * only when the target is a facebook_group, so a card that wants to print an
   * instant the engine will honour has to know which of the two this row is.
   */
  nextChannel: string | null;
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
  opts: {
    truncated?: boolean;
    /** Why `truncated` is set. See CountsNote. */
    countsNote?: CountsNote | null;
    /** See the field of the same name on CampaignState. */
    publishedOutsidePlanToday?: number;
    outsidePlanIsWhole?: boolean;
    todayOnly?: boolean;
    /**
     * Every row of the round, when `rows` is only a slice of it. Defaults to
     * `rows`, so a caller that scopes nothing gets the same answer either way
     * and nothing has to remember to pass it.
     */
    lifetime?: T[];
    /**
     * THE COUNTS, WHEN THE CALLER HAS EXACT ONES — the whole of the 28/28 fix.
     *
     * "28/28, 100%, הסתיים — ובפועל המערכת מפרסמת בהרבה יותר קבוצות."
     *
     * Every figure here used to be `rows.length` and a walk over `rows`, and
     * `rows` was a slice: client.ts read the 1,000 earliest queue rows of the
     * WHOLE ACCOUNT, ordered ascending, grouped them by campaign in JavaScript
     * and handed each group in here. What falls off the end of an ascending
     * read is the furthest-out rows — the ones still waiting — so a round that
     * lost its pending rows arrived here with published === total, resolved to
     * 'completed' and drew a green 100% over publications that had not gone
     * out. For a repeating round the slice was then filtered to today, after
     * the cut, which is how 28 crumbs of this morning became a whole sbav.
     *
     * `progress` is a per-status count from social_campaign_counts (v27), which
     * the database computes over every row with no ceiling anywhere near it.
     * `everPublished` is the round's lifetime publications, which is a
     * different question from today's and may not be answered with today's
     * number — see the field on CampaignState.
     *
     * ABSENT MEANS COUNT THE ROWS, exactly as this function always did. A
     * database that has not run v27 keeps working; its caller sets
     * `truncated`, and every surface that could claim completion checks it.
     */
    counts?: {
      progress: Record<string, number>;
      everPublished: number;
      /**
       * DISTINCT GROUPS this round reaches — "בפועל המערכת מפרסמת בהרבה יותר
       * קבוצות".
       *
       * The dashboard worked it out as `new Set([...upcoming, ...done]
       * .map(r => r.target_id)).size`, over the same arrays that produced the
       * 28/28 card. It is a distinct count, so it cannot be summed out of the
       * per-status counts either — a group with one published row and one
       * waiting row would be counted twice. Its own aggregate, from its own
       * view.
       */
      targetCount?: number;
      /**
       * The round's FIRST publication, over every row it has ever had.
       *
       * `startedAt` is otherwise the earliest published_at among the rows
       * handed in, and those rows are a newest-first PREVIEW — so the sentence
       * "התחיל לפני 6 שעות" would be the age of the oldest row that survived
       * the cut, drifting later whenever the account publishes anything.
       */
      startedAt?: string | null;
      lastPublishedAt?: string | null;
    };
  } = {},
): CampaignState<T> {
  const progress: CampaignProgress = { ...EMPTY_PROGRESS, total: rows.length };
  if (opts.counts) {
    /*
     * THE SAME CLASSIFICATION, OVER COUNTS INSTEAD OF ROWS. status.ts decides
     * what a status means for the rows below and it decides it here too — a
     * second opinion about which bucket 'awaiting_confirmation' belongs in is
     * how a tile and a card come to disagree, which is the fault this whole
     * module exists to prevent.
     */
    const n = (status: string) => opts.counts?.progress[status] ?? 0;
    progress.total = ALL_QUEUE_STATUSES.reduce((sum, st) => sum + n(st), 0);
    progress.published = n('published');
    progress.failed = n('failed');
    progress.skipped = n('skipped');
    progress.running = IN_FLIGHT_STATUSES.reduce((sum, st) => sum + n(st), 0);
    progress.manual = NEEDS_HUMAN_STATUSES.reduce((sum, st) => sum + n(st), 0);
    progress.scheduled = AUTOMATIC_WAITING_STATUSES.reduce((sum, st) => sum + n(st), 0);
  } else {
    for (const r of rows) {
      if (r.status === 'published') progress.published += 1;
      else if (r.status === 'failed') progress.failed += 1;
      else if (r.status === 'skipped') progress.skipped += 1;
      else if (IN_FLIGHT_STATUSES.includes(r.status)) progress.running += 1;
      else if (NEEDS_HUMAN_STATUSES.includes(r.status)) progress.manual += 1;
      else progress.scheduled += 1;
    }
  }
  progress.finished = progress.published + progress.failed + progress.skipped;

  const published = rows.filter((r) => r.published_at);
  /* Exact when the caller has it — see `counts.startedAt`. The row-derived
     value stays as the fallback, and is right whenever the rows are whole. */
  const startedAt =
    opts.counts?.startedAt !== undefined
      ? opts.counts.startedAt
      : published.length
        ? published.map((r) => r.published_at as string).sort()[0]
        : null;

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
  /* Computed off the UNSCOPED rows — see everPublished on the type. */
  const lifetime = opts.lifetime ?? rows;
  const everPublishedRows = lifetime
    .filter((r) => r.status === 'published' && r.published_at)
    .sort((a, b) => (b.published_at as string).localeCompare(a.published_at as string));
  /* The COUNT is exact when the caller has one; the ROW beside it is still the
     most recent one the preview carries, which is all the strip needs. The two
     answer different questions and only the count was ever wrong. */
  const everPublished = opts.counts ? opts.counts.everPublished : everPublishedRows.length;
  /*
   * DISTINCT GROUPS, and it lives on the state rather than being re-derived by
   * each card. The dashboard computed it from `upcoming ∪ done` — a comment
   * there said in so many words that it "belongs on CampaignState as a
   * targetCount field", and it was left outside because campaign.ts was not
   * that task's to edit. It is this task's: those two arrays are previews now,
   * so a set built from them is a count of what fitted.
   */
  const targetCount =
    opts.counts?.targetCount ?? new Set([...rows.filter((r) => !isTerminal(r.status)), ...rows.filter((r) => isTerminal(r.status))].map((r) => r.target_id)).size;

  const done = rows
    .filter((r) => TERMINAL_STATUSES.includes(r.status))
    .sort((a, b) => (b.published_at ?? b.scheduled_at).localeCompare(a.published_at ?? a.scheduled_at));

  return {
    progress,
    // `startedAt !== null` is handed in rather than re-derived: it is the very
    // fact the card prints under "התחיל", so the badge and that line are now
    // computed from one value and cannot disagree.
    /*
     * BOTH ARGUMENTS COME FROM THE COUNTS WHEN THE COUNTS ARE EXACT, and this
     * is not tidiness — each one was a way for the state to contradict the
     * numbers beside it.
     *
     * `progress.total` rather than `rows.length`: with v27's view the rows are
     * a PREVIEW (the open set, plus the most recent finished ones), so a round
     * whose every publication is older than that preview would arrive here
     * with an empty array and resolve to 'טרם התחיל' over a count of two
     * hundred.
     *
     * `published > 0` rather than a published_at in the preview: `startedAt`
     * is read off the same preview, so the same round would report "has never
     * published" while the exact count says it published two hundred times.
     */
    state: resolveState(progress, campaign?.status, progress.total, startedAt !== null || progress.published > 0),
    truncated: opts.truncated ?? false,
    countsNote: opts.countsNote ?? null,
    publishedOutsidePlanToday: opts.publishedOutsidePlanToday ?? 0,
    outsidePlanIsWhole: opts.outsidePlanIsWhole ?? true,
    todayOnly: opts.todayOnly ?? false,
    startedAt,
    everPublished,
    targetCount,
    /*
     * THE ROUND'S MOST RECENT PUBLICATION, exact when the caller has it.
     *
     * Derived from `lifetime` otherwise, and `lifetime` is a PREVIEW on the
     * dashboard (the 500 newest finished rows account-wide, then filtered to
     * today for a repeating round) and the campaign's own feed on the round
     * page. Two differently-scoped arrays, one expression — so the two
     * screens could read a different "last publication" for the same round,
     * and since this is what the campaign's own gap is measured from, they
     * could then promise two different NEXT instants for the same row.
     */
    lastPublishedAt: opts.counts?.lastPublishedAt !== undefined ? opts.counts.lastPublishedAt : everPublishedRows[0]?.published_at ?? null,
    lastPublishedChannel: everPublishedRows[0]?.target?.channel ?? null,
    // The plan already assigns every remaining row an instant; the last one
    // is when the campaign finishes, assuming nothing is deferred by the
    // anti-spam rules. Anything else would be a guess.
    estimatedCompletionAt: last?.scheduled_at ?? null,
    nextAt: next?.scheduled_at ?? null,
    nextTargetName: next?.target?.name ?? null,
    nextChannel: next?.target?.channel ?? null,
    upcoming: unfinished,
    done,
    now,
  };
}

/**
 * HAS THIS ROUND NEVER GONE OUT — one definition, for the three screens that
 * were each deciding it from today's counter.
 *
 * "למה הוא לא מראה מתי אמור לצאת הפרסום הבא ורושם הסבב לא הושק" — over a card
 * that printed "התחיל לפני 12 ימים" two lines above it.
 *
 * THE QUESTION IS ABOUT THE ROUND'S WHOLE LIFE AND IT WAS BEING ASKED OF ONE
 * DAY. Every caller read `state === 'not_started' && progress.total === 0`,
 * and `progress` is TODAY'S for a repeating round (CampaignState.todayOnly).
 * So on any day with nothing scheduled — a Saturday on a Sunday-to-Thursday
 * schedule, or any day before the repeat has planned it — a round that had
 * published thousands of times reported that it had never been launched, and
 * the block that would otherwise have named the next publishing day printed
 * "הוסיפו פוסט, בחרו קבוצות ושלחו" instead.
 *
 * It is the same fault as everPublished's: a counter that resets at midnight
 * standing in for a history that does not. So this asks the history.
 *
 * `startedAt` and `everPublished` are both consulted because they come from
 * different places — the view's first publication and its lifetime published
 * count — and a round that has one of them has been launched whatever the
 * other says.
 */
export function neverLaunched(
  state: Pick<CampaignState, 'state' | 'progress' | 'startedAt' | 'everPublished'>,
): boolean {
  return (
    state.state === 'not_started' &&
    state.progress.total === 0 &&
    state.startedAt === null &&
    /* `?? 0` because the two measured fixtures hand-build a state and cast it:
       a missing lifetime count is "no history", which is what this branch is
       about, and not a reason to silently stop answering. */
    (state.everPublished ?? 0) === 0
  );
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
  /*
   * NO ROWS — AND THAT MEANS TWO DIFFERENT THINGS DEPENDING ON THE SCOPE.
   *
   * "למה הוא לא מראה מתי אמור לצאת הפרסום הבא ורושם הסבב לא הושק", over a card
   * whose next line read "התחיל לפני 12 ימים".
   *
   * For a lifetime-scoped round, no rows means no rows ever: nothing has been
   * launched and `started` is false, because nothing can have published out of
   * an empty queue. That is 'not_started', exactly as before.
   *
   * For a REPEATING round the counts are today's, and a day with nothing
   * scheduled is ordinary — a Saturday on a Sunday-to-Thursday schedule, or
   * any day before the repeat has planned it. Calling that 'טרם התחיל' put the
   * badge in direct contradiction with the sentence beside it, and from there
   * it reached every reader of the state: the card said the round had never
   * been launched and offered "הוסיפו פוסט, בחרו קבוצות ושלחו" to a round that
   * had published for twelve days.
   *
   * `started` is the lifetime fact (startedAt, or something published), so a
   * round that has one has finished today's work — there is none left — rather
   * than never having begun. The branch below says the same thing for a day
   * whose rows have all ended, and this is that day with zero rows in it.
   */
  if (!total) return started ? 'completed' : 'not_started';
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
  if (!progress.total) return state.todayOnly ? 'אין פרסומים מתוכננים להיום' : 'אין פרסומים מתוכננים';
  // "1 מתוך 84 פורסמו" — the verb has to follow the count, and the count is 1
  // exactly when the owner is watching hardest: the run's first success.
  const head = `${progress.published} מתוך ${progress.total} ${agree(progress.published, 'פורסם', 'פורסמו')}${state.todayOnly ? ' היום' : ''}`;
  const rest = unpublishedNote(progress);
  return rest ? `${head} · ${rest}` : head;
}

/**
 * "12 דולגו · 3 נכשלו" — the finished rows that did not publish, or '' when
 * every finished row published. Never invents a zero.
 */
export function unpublishedNote(progress: CampaignProgress): string {
  const parts: string[] = [];
  if (progress.skipped > 0) parts.push(counted(progress.skipped, 'פרסום אחד דולג', 'דולגו'));
  if (progress.failed > 0) parts.push(counted(progress.failed, 'פרסום אחד נכשל', 'נכשלו'));
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

export function runProgress(progress: CampaignProgress, todayOnly = false, truncated = false): RunProgressView {
  const { total, published, finished } = progress;
  /*
   * A CEILING MAY NOT BE PRINTED AS A TOTAL, and 100% is the loudest way to
   * print one. ratio() returns 100 exactly when part >= total — which is
   * precisely what a capped read produces, because the rows it drops are the
   * unfinished ones. So on a count that is not the round's, the figure stops
   * at 99 and the sentence says the numbers are of what could be counted.
   *
   * `truncated` is false for every caller that has exact counts (v27's view),
   * so this is the fallback path's guard and not a permanent ceiling.
   */
  const percent = truncated ? Math.min(99, percentFinished(progress)) : percentFinished(progress);
  const atLeast = truncated ? 'לפחות ' : '';
  /*
   * "היום" IS PART OF THE SENTENCE, NOT AN EXTRA LINE BESIDE IT.
   *
   * A repeating round's figures are today's (see CampaignState.todayOnly), and
   * "185 מתוך 219 טופלו" with no "היום" over a campaign that has published
   * three thousand times is the same class of fault as every other one this
   * module has been fixed for: a true number under a sentence that does not
   * say what it is about. The default is false, so every existing caller reads
   * exactly as it did.
   */
  const scope = todayOnly ? ' היום' : '';
  /*
   * AND THE EMPTY LABEL CARRIES THE SCOPE TOO.
   *
   * "אין פרסומים מתוכננים" beside "209 קבוצות" is a card contradicting itself:
   * the rows exist, they are stamped for tomorrow, and this counter is TODAY'S.
   * campaignHeadline() has said "להיום" in this position since it was written;
   * these two labels are the ones the dashboard and the campaigns card draw,
   * and they were the pair that still did not.
   */
  const nothing = todayOnly ? 'אין פרסומים מתוכננים להיום' : 'אין פרסומים מתוכננים';
  const handledLabel = total ? `${atLeast}${finished} מתוך ${total} ${agree(finished, 'טופל', 'טופלו')}${scope}` : nothing;
  return {
    total,
    handled: finished,
    published,
    open: openRows(progress),
    percent,
    percentPublished: truncated ? Math.min(99, percentPublished(progress)) : percentPublished(progress),
    handledLabel,
    publishedLabel: total ? `${atLeast}${published} מתוך ${total} ${agree(published, 'פורסם', 'פורסמו')}` : nothing,
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
  /* `truncated` is part of the slice this reads BECAUSE of the fault below:
     a badge that may announce a round has ended has to know whether the
     numbers it is reading are the round's. Optional so the two test harnesses
     that build a bare {state, progress} keep compiling; absent reads as "the
     counts are exact", which is what every caller with real data now has. */
  state: Pick<CampaignState, 'state' | 'progress'> & { truncated?: boolean },
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
  /*
   * "טרם התחיל" beside "5 / 28 טופלו · 18%".
   *
   * resolveState() is right to withhold 'running': nothing has published, so
   * there is no startedAt and no worker holding a row. But five rows HAVE been
   * decided — skipped on arrival, which is what a re-run of a post its groups
   * already have looks like — and a badge reading "not started" over a bar
   * reading 18% is the contradiction this module exists to prevent. The label
   * says the true thing instead: it began, and nothing has gone out.
   */
  if (state.state === 'not_started' && p.finished > 0) {
    return { label: 'התחיל — טרם פורסם', tone: 'warn', live: false };
  }
  /*
   * A COUNT THAT IS NOT THE ROUND'S MAY NOT END THE ROUND.
   *
   * "28/28, 100%, הסתיים — ובפועל המערכת מפרסמת בהרבה יותר קבוצות."
   *
   * This is the badge that said so. resolveState() calls a run 'completed'
   * when openRows(progress) is zero, and when the progress came from a capped
   * slice that is zero for a reason that has nothing to do with the round:
   * the rows still waiting were the ones the read dropped. The card below it
   * printed the honest note — "הסבב גדול מדי לספור אותו כאן במלואו" — and this
   * badge contradicted it in larger type, one line up.
   *
   * CampaignCard's `finishedClean` and scheduleReadout's 'ended' branch have
   * both carried `!truncated` for exactly this reason. The badge never did.
   *
   * It is a LABEL and not a seventh RunState, like the two beside it: four
   * screens outside this module match 'completed' by string to decide the
   * "פעילים"/"הושלמו" filter, the pause button and the run screen's `closed`,
   * and a new enum member would quietly move rounds between those lists.
   */
  if (state.truncated && state.state === 'completed') {
    return { label: 'ספירה חלקית', tone: 'warn', live: false };
  }
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
