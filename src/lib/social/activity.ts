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
  /*
   * A row the worker had parked at "I clicked פרסום and then lost the window"
   * — resolved by going back to the group and looking. 'success' and not
   * 'system' for the reason group_join is: it is the machine doing the thing
   * the owner would otherwise have done by hand, on his own account, and this
   * line is the only record that a publication he was told to check turned
   * out to be fine. Both outcomes are filed here: a post that WAS live is a
   * publication recovered, and one that was not is a publication rescued from
   * the parking lot and put back on the queue. Neither is a failure.
   */
  submitted_verified_live: 'success',
  run_adopted_queue: 'success',
  worker_started: 'success',
  worker_self_update: 'success',
  /* The nightly sweep queueing itself. 'success' rather than 'system': it is
     the app doing the thing the owner asked it to do, and the line that says
     how many groups are about to be looked at is the only evidence it ran. */
  nightly_group_check: 'success',
  /* The Page list coming down from Facebook. 'success' for the reason
     nightly_group_check is: it is the app doing what the owner pressed, and
     the line naming how many Pages arrived is the only evidence it ran. */
  targets_synced: 'success',
  /*
   * הצטרפות אוטומטית לקבוצה. 'success' and not 'system': it is the machine
   * doing the thing the owner pressed, on his own account, and the line naming
   * which group is the only record that it happened. A join that did NOT
   * succeed carries its own words in the message — the kind is about the
   * writer, and this writer only runs because he asked it to.
   */
  group_join: 'success',

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
  /*
   * ─── A WRITE THE DATABASE DID NOT TAKE ─────────────────────────────────
   *
   * "stuck_rows_requeued × 12" — twelve lines in thirty minutes, each saying
   * stuck publications had been freed, on rows that never moved. The sweep
   * wrote its UPDATE and never looked at the answer: supabase-js resolves on
   * a failed write rather than throwing, and an UPDATE matching nothing
   * resolves with no error at all. The count came from what the code wanted.
   *
   * applied() in worker/social-worker.ts now measures what landed, and these
   * are the two events it raises when the measurement disagrees with the
   * intention. BOTH are failures, and write_partial especially: "I asked for
   * 17 and changed 11" means six rows are still wedged, still holding six
   * groups out of every future round, and nothing else in the product will
   * ever mention them. Filed as quiet system news it would sit under a
   * heading nobody opens — which is how this cost a full night.
   */
  /* The worker could not TAKE a row out of the queue. Filed with the
     failures and not as system news for the reason write_failed carries: a
     queue that cannot be claimed looks exactly like a queue with nothing
     due, and this line is the only thing that tells them apart. */
  claim_failed: 'failure',
  write_failed: 'failure',
  write_partial: 'failure',
  /* The read that feeds the verification sweep. A failure and not quiet
     system news: while it cannot read, every parked publication stays parked
     and nothing else in the product will say why. */
  verify_read_failed: 'failure',
  /* The backlog outgrew one pass's window. A warning and not quiet system
     news: while it holds, publications parked today may not be looked at. */
  verify_window_full: 'failure',
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
  /*
   * ─── the Pages work merged in from the cloud-worker branch ─────────────
   *
   * Three events whose writers landed without an entry here, so they were
   * falling through to their level — which files a `warn` as quiet system
   * news, under a heading nobody opens.
   *
   * cta_dropped: the post went out and its call-to-action button did not.
   * Filed with the failures and not the successes, for the reason
   * `target_left` carries: nothing is broken, but something the owner asked
   * for did not happen and this is the only line that says so.
   */
  cta_dropped: 'failure',
  /* Facebook throttling us. The publication did not go out. */
  rate_limit: 'failure',
  /* Disconnecting locally worked and telling Facebook about it did not, so a
     token this product no longer holds may still be live at their end. That is
     exactly the kind of thing that must not be quiet. */
  revoke_remote_failed: 'failure',

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
  /* CHZARA — arming or disarming a round's daily repeat is a fact about the
     ROUND, and the one activity line that says his account is about to publish
     the same post again tomorrow. */
  campaign_repeat_on: 'round',
  /* The switch was pressed on a round that has finished, and nothing was
     armed. A failure and not quiet round news: the owner asked for something
     and it did not happen, and this is the only line that says why. */
  campaign_repeat_refused: 'failure',
  campaign_repeat_off: 'round',
  /* The window between two publications to one group, lowered BY THE APP so
     that every round the owner added can actually publish. He did not press
     this, so it is the one repeat line he has no memory of choosing — which
     is exactly why it has to be in his history under its own name. */
  campaign_repeat_window: 'round',
  /*
   * The daily repeat could not be armed, because the round has never gone out
   * and there is no group list to repeat. 'failure' and not 'round': nothing
   * is broken, but the owner pressed a switch and it did nothing, and a line
   * he can scroll past is how he lost an evening waiting for a publication
   * that was never going to come.
   */
  campaign_repeat_needs_launch: 'failure',
  /*
   * A SCREEN THAT STOPPED DRAWING, and the fault behind it.
   *
   * "המסך הזה נתקע" arrived as a screenshot with no route, no line and no
   * code, because `error.digest` exists only for a SERVER error and that one
   * was a client render. These two lines are what make the next one
   * answerable: `screen_crashed` is written by the route boundary
   * (src/app/social/error.tsx), `client_error` by CrashLogger for the faults
   * a boundary never sees — a throw inside a click handler, a rejected
   * promise nobody awaited. Both carry a six-character code that is stable
   * for one fault, and both are redacted by crash.ts before they are stored.
   *
   * 'failure' rather than 'system': nothing published, and a screen the owner
   * could not use is his problem before it is the machine's.
   */
  screen_crashed: 'failure',
  client_error: 'failure',
  /* A launch that went out on the slower path because the database has not
     run supabase/social-schema-v28.sql. Nothing was lost — the drip falls
     back to whole minutes — but it is a sentence that tells him to run the
     update, so it may not be filed where it can be scrolled past. */
  schedule_column_missing: 'failure',
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
  /* The instant was already taken by a row of this post — see noteOccupied().
     Same family as the line above: both are "a group the planner did not give
     a row to this pass", and the owner reads them together. */
  plan_slots_occupied: 'schedule',
  /*
   * A launch where NOT ONE group got through, because every one of them
   * already had a row waiting from another round. 'failure' and not
   * 'schedule': a few groups left out is a note, a round that produced
   * nothing and then closed itself is the owner's evening.
   */
  plan_all_blocked: 'failure',
  /*
   * A SLOT HELD BY A ROW THAT CANNOT PUBLISH. 'failure' and not 'schedule',
   * which is where its two siblings above sit, and the difference is the
   * point: plan_slots_occupied means "the system is working — this instant
   * already has a row of this post that WILL go out", while this means the
   * opposite — the instant is held by a row that will never go out, so the
   * publication the owner is expecting is not going to happen. Filed as quiet
   * schedule news it would sit under a heading nobody opens, which is exactly
   * the silence it was written to end.
   */
  plan_slots_tombstoned: 'failure',
  /* The planner freeing one of those and queueing the publication after all.
     'round' beside plan_revived, for the same reason that one carries: it is
     the owner's round becoming real again, and it is the line that explains
     why publications he had given up on suddenly appear in the queue. */
  plan_slots_recycled: 'round',
  /* מסד נתונים שלא הריץ v25 אינו מכיר את repeat_enabled, והסבב נפתח בלעדיו —
     כלומר אותו פוסט לא יחזור לקבוצה שהוא כבר פורסם אליה. 'failure' ולא
     'system', מאותה סיבה שתיעד target_left: שום דבר לא שבור, אבל פרסום
     שהבעלים מצפה לו לא יֵצא, וזאת השורה היחידה שאומרת את זה. */
  campaign_column_missing: 'failure',
  /* The feature that wrote this is gone ("לפרסם רק לאן שיש לקוחות"), and the
     entry stays because his history still holds rows that carry it. Deleting
     the label would not delete the rows — it would only make them unreadable. */
  plan_not_customers: 'schedule',
  queue_respaced: 'schedule',
  /* The hours of a campaign changed and its waiting rows moved with them —
     the same kind of fact as a respace, and for the same reader: a queue that
     moved on its own needs a line saying who moved it. */
  queue_rescheduled: 'schedule',
  /*
   * The account-wide floor coming down to meet a campaign's chosen gap
   * (matchAccountGapTo in client.ts). 'schedule' and not 'system': nothing is
   * broken and no machine did anything — the owner chose a smaller interval
   * and this is the line that says the OTHER gate moved with it, which is the
   * one consequence of that choice reaching outside the campaign he edited.
   * It belongs beside queue_respaced, which is the same kind of fact.
   */
  limits_changed: 'schedule',
  queue_target_removed: 'schedule',
  queue_targets_added: 'schedule',
  stuck_rows_released: 'schedule',
  stuck_rows_requeued: 'schedule',
  queued_text_refreshed: 'schedule',
  weekly_hours_synced: 'schedule',
  step_write_lost: 'failure',

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
  /*
   * ─── THE QUEUE IS NOT MOVING, AND THIS IS THE LINE THAT SAYS WHY ───────
   *
   * 'failure' and not 'system', for the reason target_left and
   * worker_window_storm both carry in their own notes: nothing is broken and
   * nothing was lost, but a publication that was going to happen now is not,
   * and this is the only line naming the cause. Filed as quiet system news it
   * would sit under a heading nobody opens — which is precisely the failure
   * this event was created to end. It was written to a terminal before, once,
   * and cost an evening of screenshots.
   *
   * The one awkward member is the deliberate pause, which is also filed here
   * while being nobody's fault. It is written at level 'info' for that reason
   * (see idle() in worker/social-worker.ts), so it is not announced; and the
   * dashboard says "המערכת מושהית" in its own right. A heading that is
   * slightly wrong for the one state he caused himself is a much smaller
   * error than a heading nobody opens for the two he did not.
   */
  worker_holding: 'failure',
  /*
   * A missing settings row, running on the first-run defaults — which are
   * testMode + requireConfirmation, i.e. the worker stops before every click
   * and waits for an approval. Same filing, same reason: the consequence is a
   * queue that does not move, whatever the cause is called.
   */
  settings_defaulted: 'failure',
  /* The owner disconnected Facebook and every token was deleted. System news
     and not a failure: he asked for it, and it succeeded. */
  disconnected: 'system',
  metrics_columns_missing: 'system',
  /*
   * 'system' AND NOT 'failure', deliberately. Nothing failed to publish: a
   * read failed, the engine refused to guess, and the row is still in the
   * queue with its attempt unspent. Calling it a failure would put it in the
   * count the owner reads as "posts that did not go out", which would be a
   * lie in the other direction. `level` is 'warn', so it is still loud.
   */
  rule_read_failed: 'system',
  /* The planner queued a round without being able to record which round it
     was, because the database has not run social-latest.sql. The publishing
     is unaffected; it is the installation that needs a minute. */
  rounds_column_missing: 'system',
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
 * THE GROUP'S OWN ADDRESS ON FACEBOOK, when the row carries one.
 *
 * "שיש שגיאה לא מצאתי כתוב משהו לצרף לינק קישור לקבוצה." Every answer the
 * "לא מצאתי את תיבת כתבו משהו" failure has is inside the group — membership,
 * posting permission, a group that changed its rules — so the one thing the
 * owner needs at that moment is a way in. The worker stamps `targetUrl` on the
 * failures it writes about a group (social-worker.ts).
 *
 * NARROW ON PURPOSE. Only http(s), because this becomes an href and anything
 * else in an href is a hole rather than a link: `javascript:` runs, `data:`
 * renders a page of someone else's choosing. The value travels from the
 * database, so it is treated as input and not as something this app wrote.
 *
 * A row written before the worker carried this returns null and the screen
 * shows no button. A guessed link is worse than none — the group page inside
 * the app still reaches the real one.
 */
export function targetUrlOf(entry: ActivityEntry): string | null {
  const raw = (entry.meta as { targetUrl?: unknown } | null | undefined)?.targetUrl;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
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
