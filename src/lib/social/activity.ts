import type { ActivityEntry } from './types';

/**
 * WHAT KIND OF THING HAPPENED — the one classification of the activity log.
 *
 * The log is a single table with a free-text `event` column (social_activity_log),
 * written from five places: the local browser worker, the hosted worker, the
 * planner, the API routes and the browser itself. Nothing in the database says
 * whether a row is good news; `level` only says how loud it is. Every surface
 * that wants to group the log therefore has to decide, and the module has been
 * burned before by two surfaces deciding differently — the NOTABLE set in the
 * notification bell and the icon map in the feed already disagree about six
 * events, all of which are dead keys no writer emits any more.
 *
 * So the decision lives here, once, as a pure function over rows the caller
 * already has. It adds no table, no column, no counter and no read: a kind is
 * derived from the row in front of you, the same way in the bell, in the
 * dashboard card and on the activity screen.
 *
 * The map is built from the WRITERS, not from what some icon map happens to
 * list. Every key below is emitted somewhere in this repo; an event that is
 * not here falls through to its level, which is why a new writer does not
 * need this file edited to show up correctly.
 */
export type ActivityKind = 'success' | 'failure' | 'round' | 'schedule' | 'system';

const KIND: Record<string, ActivityKind> = {
  // Something went out, or something came up.
  published: 'success',
  quick_published: 'success',
  group_share_resolved: 'success',
  run_adopted_queue: 'success',
  worker_started: 'success',
  worker_self_update: 'success',
  /* The nightly sweep queueing itself. 'success' rather than 'system': it is
     the app doing the thing the owner asked it to do, and the line that says
     how many groups are about to be looked at is the only evidence it ran. */
  nightly_group_check: 'success',

  // Something did not.
  /* The worker deciding it is looping and stopping its own background work.
     A warning and not a failure: nothing was lost and publishing is
     untouched — but it is the owner's machine opening browser windows, so it
     must never be filed where it can be scrolled past. */
  worker_window_storm: 'failure',
  publish_failed: 'failure',
  publish_unrecorded: 'failure',
  needs_attention: 'failure',
  worker_error: 'failure',
  browser_start_failed: 'failure',
  plan_failed: 'failure',
  account_save_failed: 'failure',
  /* The list of profiles could not be written. Filed with the account it
     belongs to: it means the same thing — the machine learned something about
     WHO publishes and the database would not take it. */
  profiles_save_failed: 'failure',
  /*
   * A group that will not take a Page. Filed beside target_left, because it is
   * its near-twin and the difference is the whole point: nothing was turned
   * off, and the same group publishes normally from the personal profile.
   */
  page_not_allowed: 'failure',
  avatar_upload_blocked: 'failure',
  /* Pictures that came down from Facebook and were refused by storage. A
     failure and not quiet system news: the rows go on showing letters, and
     this is the only line that says the bytes arrived and the bucket said no —
     which is a different problem from never fetching them. */
  picture_upload_failed: 'failure',
  login_challenge_failed: 'failure',
  /*
   * A group the account can no longer post in, switched off by the worker.
   *
   * 'failure' rather than 'system': nothing is broken — the owner left a group
   * and the app caught up — but a publication that was going to happen now is
   * not, and this is the one line that says which group and why. Filed as
   * quiet system news it would sit under a heading nobody opens, and the owner
   * would meet the change as a number that moved on its own.
   */
  target_left: 'failure',

  // A round's own life: started, paused, resumed, stopped, reported.
  planned: 'round',
  drip_planned: 'round',
  /* A round that a failure had switched off, put back on the list. Filed with
     the round's own life rather than as system news: it is the owner's round
     becoming real again, and it is the line that explains why publications he
     had given up on suddenly appear in the queue. */
  plan_revived: 'round',
  campaign_paused: 'round',
  campaign_resumed: 'round',
  campaign_stopped: 'round',
  campaign_deleted: 'round',
  stopped_campaign_swept: 'round',
  worker_run: 'round',

  // The queue moving: postponed, skipped, re-armed, re-spaced, handed to a human.
  deferred: 'schedule',
  /* The round's comments are waiting because the publishing queue is dense
     enough that no window between two posts can hold one. The same family as
     `deferred`, and for the same reason: it is a fact about timing, not a
     fault. It is said at all because silence here is indistinguishable from
     the feature being broken — which is how it was reported. */
  comments_waiting: 'schedule',
  skipped: 'schedule',
  retry: 'schedule',
  /* Slots that could not be written because the machine could not reach the
     database. Filed beside `retry` and not with the failures: nothing is lost,
     the schedule was deliberately left open, and the next pass writes them.
     The `plan_failed` row in the same pass is the red one. */
  plan_retry: 'schedule',
  cancelled: 'schedule',
  manual_pending: 'schedule',
  plan_targets_skipped: 'schedule',
  /* The feature that wrote this is gone ("לפרסם רק לאן שיש לקוחות"), and the
     entry stays because his history still holds rows that carry it. Deleting
     the label would not delete the rows — it would only make them unreadable. */
  plan_not_customers: 'schedule',
  queue_respaced: 'schedule',
  queue_target_removed: 'schedule',
  queue_targets_added: 'schedule',
  stuck_rows_released: 'schedule',

  // The machine and the session.
  worker_stopped: 'system',
  worker_update_blocked: 'system',
  browser_needs_auth: 'system',
  login_challenge: 'system',
  group_share_duplicate: 'system',
  comment_columns_missing: 'system',
  comment_claim_failed: 'system',

  /*
   * גילוי קבוצות could not tell whether this account is in a group it found,
   * and wrote down the labels that were on the card. It is a line the OWNER
   * is meant to read back to whoever maintains the patterns — Facebook's
   * wording is the one thing in this feature that cannot be learned from
   * here — so it belongs in the log rather than only in a terminal.
   */
  discover_unread: 'system',

  account_scope_narrowed: 'system',
  metrics_columns_missing: 'system',
  commands_payload_missing: 'system',
};

export function activityKind(entry: Pick<ActivityEntry, 'event' | 'level'>): ActivityKind {
  const known = KIND[entry.event];
  if (known) return known;
  /*
   * Two writers build their event name at runtime: `worker_${command}` on the
   * local worker and `invariant_${code}` from the count checker. Neither can be
   * listed, and both are about the machine rather than about a publication.
   */
  if (entry.event.startsWith('worker_') || entry.event.startsWith('invariant_')) return 'system';
  // A writer this file has never heard of still lands somewhere honest.
  return entry.level === 'error' ? 'failure' : 'system';
}

/**
 * The publication a log row is about, when it is about one.
 *
 * `meta` is jsonb and typed `Record<string, unknown>`, so this is the one
 * place that narrows it. Every publish-path writer stamps `queueId` — see the
 * logActivity calls in worker/social-worker.ts and src/lib/social/server/worker.ts —
 * and the machine-level events (worker_error, plan_failed, browser_start_failed)
 * deliberately do not, because they are not about one row.
 */
export function queueIdOf(entry: ActivityEntry): string | null {
  const id = (entry.meta as { queueId?: unknown } | null | undefined)?.queueId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Which failures a "נסה שוב" can actually act on.
 *
 * retryQueueItem() re-arms a row only from failed / skipped / needs_attention /
 * scheduled / paused (RETRYABLE, client.ts) — these are the events that leave a
 * row in one of those states. The list is deliberately narrower than "anything
 * that went wrong": a worker crash or a planning failure has no row to re-arm,
 * and a button that cannot do anything is worse than no button.
 *
 * The guard is still the database's: retryQueueItem() matches on status and
 * returns false when the row has moved on, so a stale screen cannot re-arm a
 * publication that is already out.
 */
const RETRY_EVENTS = new Set(['publish_failed', 'needs_attention', 'skipped', 'cancelled']);

export function canRetry(entry: ActivityEntry): boolean {
  return RETRY_EVENTS.has(entry.event) && queueIdOf(entry) !== null;
}

/** '' is every row; the rest are the kinds a person actually asks for. */
export type ActivityFilter = '' | 'success' | 'failure' | 'round' | 'schedule';

export const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: '', label: 'הכל' },
  { value: 'success', label: 'הצליחו' },
  { value: 'failure', label: 'נכשלו' },
  { value: 'round', label: 'סבבים' },
  { value: 'schedule', label: 'תזמונים' },
];

/**
 * Pure, and shared by the list and by the chip counts above it — so a chip can
 * never promise more rows than tapping it shows. Same discipline as
 * filterLibrary() in library.ts.
 */
export function filterActivity(entries: ActivityEntry[], filter: ActivityFilter): ActivityEntry[] {
  if (!filter) return entries;
  return entries.filter((e) => activityKind(e) === filter);
}
