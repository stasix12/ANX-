import type { QueueStatus, SocialTarget } from './types';

/**
 * THE classification of queue statuses. One place, one answer.
 *
 * Before this module every screen and every read decided for itself what a
 * status meant, and they disagreed: campaign.ts called `skipped` "done",
 * library.ts did not fetch it at all, the dashboard's delete dialog counted a
 * set of statuses the delete itself did not act on, and `awaiting_confirmation`
 * was "running" on one tile and "waiting for you" in the list directly beneath
 * it. Two numbers about the same rows could therefore contradict each other
 * with both being computed correctly — which is the whole defect class the
 * owner reported.
 *
 * So: a status belongs to exactly one lifecycle, and every count in the module
 * derives from this table rather than from its own inline list.
 *
 *   terminal   — it will never change again by itself. Published, failed or
 *                skipped. Nothing re-arms it; no worker will claim it.
 *   in_flight  — a worker holds it right now.
 *   waiting    — it has not happened yet and is still meant to.
 *
 * `paused` is in the table because the CHECK constraint allows it and eight
 * read sites already branch on it. Nothing in this repository writes it (a
 * paused campaign leaves its rows 'scheduled'; see rules.ts), so it is a
 * legacy value — but if a row does hold it, it is waiting, and it is claimable
 * by nobody, which the invariant check reports rather than hides.
 *
 * `awaiting_confirmation` is WAITING, not in flight: the browser worker has
 * parked the job and nothing moves until a person taps confirm. Calling it
 * "running" is what let a run sit at "רץ" for ever with a bar that could never
 * reach the end.
 */
export type QueueLifecycle = 'terminal' | 'waiting' | 'in_flight';

export const QUEUE_LIFECYCLE: Record<QueueStatus, QueueLifecycle> = {
  published: 'terminal',
  failed: 'terminal',
  skipped: 'terminal',
  publishing: 'in_flight',
  scheduled: 'waiting',
  paused: 'waiting',
  awaiting_confirmation: 'waiting',
  manual_pending: 'waiting',
  needs_attention: 'waiting',
};

/** Every status the CHECK constraint allows, in a stable order. */
export const ALL_QUEUE_STATUSES: QueueStatus[] = [
  'scheduled',
  'publishing',
  'published',
  'failed',
  'skipped',
  'manual_pending',
  'needs_attention',
  'awaiting_confirmation',
  'paused',
];

function withLifecycle(kind: QueueLifecycle): QueueStatus[] {
  return ALL_QUEUE_STATUSES.filter((s) => QUEUE_LIFECYCLE[s] === kind);
}

/** Finished for good: published, failed, skipped. */
export const TERMINAL_STATUSES: QueueStatus[] = withLifecycle('terminal');
/** A worker is holding it right now. */
export const IN_FLIGHT_STATUSES: QueueStatus[] = withLifecycle('in_flight');
/** Has not happened yet and is still meant to. */
export const WAITING_STATUSES: QueueStatus[] = withLifecycle('waiting');

/**
 * ─── THE ROW WHOSE POST MAY ALREADY BE ON FACEBOOK ────────────────────────
 *
 *   "רשום דולג, אבל בפועל נכנסתי וראיתי שזה פרסם, זה חמור מאד"
 *
 * The composer's click sits between the steps 'publishing' and 'verifying'
 * (worker/facebook/composer.ts), so a publication that broke down at or past
 * the click MAY HAVE SUCCEEDED while nothing in the database says so. The
 * worker marks exactly that case: it parks the row as needs_attention and
 * writes this step, so one screen can act on it — a person checks the group
 * and decides, and no automatic path ever retries it.
 *
 * WHY IT HAS TO LIVE HERE. `needs_attention` is inside WAITING_STATUSES and
 * therefore inside CANCELLABLE_STATUSES, so EVERY bulk cancel in the product
 * matched these rows — and each one writes `step: ''`, erasing the only
 * record that the post might be live. Both duplicate guards then open at
 * once: rules.ts counts rows with `status = 'published'`, and
 * targetsAlreadyWaiting only holds a group while its row is OPEN. A cancel
 * that is meant to prevent publications could therefore cause a second post
 * to the same group.
 *
 * resumeNeedsAttention already excluded it (client.ts). The seven bulk
 * cancels did not, which is why the exclusion is a shared constant rather
 * than a literal in one function: a status list and a step list that live in
 * different files drift, and this one drifts towards double-posting.
 */
export const MAYBE_LIVE_STEP = 'submitted';
/** Everything that is not finished — waiting plus in flight. */
export const OPEN_STATUSES: QueueStatus[] = [...WAITING_STATUSES, ...IN_FLIGHT_STATUSES];

/**
 * Waiting rows that will move on their own when their time comes. Only
 * 'scheduled' is actually claimable by a worker (both claims filter on it);
 * 'paused' is here because every counter treats it as queued, and the
 * invariant check is what reports that nobody can claim it.
 */
export const AUTOMATIC_WAITING_STATUSES: QueueStatus[] = ['scheduled', 'paused'];

/** Waiting rows where nothing at all happens until a person acts. */
export const NEEDS_HUMAN_STATUSES: QueueStatus[] = ['awaiting_confirmation', 'manual_pending', 'needs_attention'];

/** The only status a worker's "due" query matches, in either runtime. */
export const CLAIMABLE_STATUSES: QueueStatus[] = ['scheduled'];

/**
 * What "cancel" may act on, for one row and for the whole queue alike.
 *
 * One list so the number in the question is the number the write delivers.
 * 'publishing' is deliberately absent: a job already running is not ours to
 * cancel, it is left to finish.
 */
export const CANCELLABLE_STATUSES: QueueStatus[] = [...WAITING_STATUSES];

export const isTerminal = (s: QueueStatus): boolean => QUEUE_LIFECYCLE[s] === 'terminal';
export const isWaiting = (s: QueueStatus): boolean => QUEUE_LIFECYCLE[s] === 'waiting';
export const isInFlight = (s: QueueStatus): boolean => QUEUE_LIFECYCLE[s] === 'in_flight';
/** Not finished: still waiting or in flight. */
export const isOpen = (s: QueueStatus): boolean => !isTerminal(s);
export const needsHuman = (s: QueueStatus): boolean => NEEDS_HUMAN_STATUSES.includes(s);

/** Hebrew for the three lifecycles, for anything the owner might read. */
export const QUEUE_LIFECYCLE_LABEL: Record<QueueLifecycle, string> = {
  terminal: 'הסתיים',
  waiting: 'ממתין',
  in_flight: 'מפרסם עכשיו',
};

/**
 * A whole-queue rollup, from the per-status counts.
 *
 * Every dashboard tile and every confirmation dialog reads its number from
 * here, so the tiles cover the queue exactly once and a dialog can never
 * promise a count the write will not deliver.
 */
export interface QueueSummary {
  total: number;
  published: number;
  failed: number;
  skipped: number;
  /** published + failed + skipped. Finished, whatever the outcome was. */
  terminal: number;
  /** Not finished and not held by a worker. */
  waiting: number;
  /** Held by a worker right now. */
  inFlight: number;
  /** Nothing moves on these until a person acts (a subset of `waiting`). */
  needsHuman: number;
  /**
   * Waiting on the clock only — exactly the rows a read filtered to
   * AUTOMATIC_WAITING_STATUSES returns, and therefore the only figure a list
   * built from such a read may print as its total. `queued` adds the in-flight
   * row on top, so the upcoming-publications card counted one more row than
   * its own list could ever hold and promised "ועוד 1 פרסומים אחריהם" about a
   * publication that was not waiting at all.
   */
  automaticWaiting: number;
  /** Open rows that will move on their own: automatic waiting plus in flight. */
  queued: number;
  /** Everything not finished — queued + needsHuman. */
  open: number;
  /** Exactly what a cancel-everything write will match. */
  cancellable: number;
}

/** A zero summary, for a screen that has not loaded yet. Never rendered as a fact. */
export const EMPTY_QUEUE_SUMMARY: QueueSummary = {
  total: 0,
  published: 0,
  failed: 0,
  skipped: 0,
  terminal: 0,
  waiting: 0,
  inFlight: 0,
  needsHuman: 0,
  automaticWaiting: 0,
  queued: 0,
  open: 0,
  cancellable: 0,
};

export function summarizeQueue(counts: Record<QueueStatus, number>): QueueSummary {
  const sum = (list: QueueStatus[]) => list.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const waiting = sum(WAITING_STATUSES);
  const inFlight = sum(IN_FLIGHT_STATUSES);
  const needs = sum(NEEDS_HUMAN_STATUSES);
  const automaticWaiting = sum(AUTOMATIC_WAITING_STATUSES);
  return {
    total: sum(ALL_QUEUE_STATUSES),
    published: counts.published ?? 0,
    failed: counts.failed ?? 0,
    skipped: counts.skipped ?? 0,
    terminal: sum(TERMINAL_STATUSES),
    waiting,
    inFlight,
    needsHuman: needs,
    automaticWaiting,
    queued: automaticWaiting + inFlight,
    open: waiting + inFlight,
    cancellable: sum(CANCELLABLE_STATUSES),
  };
}

/* =======================================================================
 * AND ONE CLASSIFICATION THAT IS NOT ABOUT social_queue.status — it is about
 * social_targets.last_status, which is a different column with a different
 * meaning (a high-water mark since each group’s last success, cleared only by
 * a publication). It lives here because this file is where "what does this
 * status mean" is answered once, and because the screen is not its only
 * caller for long: the quarantine the worker will grow needs the same rule,
 * and two copies of it would drift towards deleting a working group.
 * ===================================================================== */

/**
 * ───── A GROUP THERE IS NO POINT PUBLISHING TO, AND HOW WE KNOW ───────
 *
 * "תוסיף קטגוריה חדשה בקבוצות של הקבוצות שלא ניתן לפרסם בהם ותציע לי
 *  בתוך הקטגוריה הזאת גם למחוק אותם" — 07.11.2026, after he checked them
 * himself: "באמת לא ניתן לפרסם בקבוצות האלה זה קבוצות של מכירת פריטים".
 *
 * THE MEASUREMENT THIS CAME FROM, over his own database: 2,446 of the
 * product's 2,480 failures ever — 98.6% — are one sentence, "לא מצאתי את
 * תיבת כתבו משהו… בקבוצה", and they sit on 143 groups. Split by whether
 * the group has EVER published: 53 never have (1,424 failures), 47 published
 * once and stopped (929), and 43 published within three days and merely fail
 * sometimes (93). The last group is the one that matters most here — they are
 * fine, the box is simply slow to render, and a filter that swept them up
 * would offer to delete 43 working groups to solve 4% of the problem.
 *
 * SO THE RULE IS THE NARROW ONE: never published, and the last attempt
 * FAILED. Not 'needs_attention', which status.ts reserves for "a person must
 * act" — an expired login is not the group's fault and comes back by itself.
 * Checked against the 53 he verified: this catches 52 of them and admits
 * nothing that is not one of them.
 *
 * WHY THE SCREEN HAS TO ANSWER THIS AND NOT THE NIGHTLY SWEEP. The worker
 * already disables a group when Facebook says it cannot be posted to
 * (social-worker.ts:2016), and that check runs — 590 of his 596 groups were
 * swept the same day. It has fired three times in the product's life, because
 * it asks whether a restriction BANNER is on screen within 1.2 seconds, and a
 * selling group shows no banner at all: it replaces the composer with a "list
 * an item" flow. `isVisible()` returns false on timeout, so "no banner" is
 * read as proof that posting works — and the line below it then CLEARS
 * last_error. That is why 222 of his 223 failing groups carry no reason: it
 * is not missing, it is erased nightly. Until the worker asks the right
 * question (the presence of the composer, which is the thing publishing
 * actually needs), the queue's own history is the only honest witness, and
 * last_status + last_published_at are what reach this screen.
 */
export function cannotPublishTo(g: SocialTarget): boolean {
  return !g.last_published_at && g.last_status === 'failed';
}
