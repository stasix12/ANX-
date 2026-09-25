'use client';

import { useState } from 'react';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DotIcon,
  PauseIcon,
  RepeatIcon,
  SendIcon,
  ShieldIcon,
  TargetIcon,
  UsersIcon,
  XCircleIcon,
} from '@/components/icons';
import { canRetry, queueIdOf } from '@/lib/social/activity';
import { retryQueueItem } from '@/lib/social/client';
import { friendlyMessage } from '@/lib/social/errors';
import { relativeHe } from '@/lib/social/time';
import { stampText } from './DateTime';
import type { ActivityEntry } from '@/lib/social/types';
import { Empty, TONE_TEXT, useToast, type Tone } from './ui';

/**
 * The activity log rendered as a feed a person can skim: one mark per event
 * kind, the sentence, and how long ago. The raw event name and metadata stay
 * in the database for debugging — they are not shown here.
 *
 * The marks were twenty emoji — ✅ ❌ ⚠️ ⏭️ ⏲️ 🗓️ 🔗 🔌 🔐 🐢 🟢 🔴 🔄 ✋ 🔁 🚫 —
 * the single largest concentration of them in the product, on the dashboard,
 * in Apple's colours at Apple's optical weight beside 64 monochrome hairline
 * glyphs. They were correctly `aria-hidden`, so this was never an
 * accessibility defect; it was the fastest signal on the daily screen that
 * the thing was a prototype.
 *
 * Each entry now carries an icon AND a tone from the product's own scales, so
 * the colour of a log line means the same thing as the colour of a status
 * pill three cards above it.
 */
const EVENT_MARK: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: Tone }> = {
  published: { icon: CheckCircleIcon, tone: 'good' },
  publish_failed: { icon: XCircleIcon, tone: 'bad' },
  needs_attention: { icon: AlertTriangleIcon, tone: 'warn' },
  skipped: { icon: DotIcon, tone: 'neutral' },
  deferred: { icon: ClockIcon, tone: 'neutral' },
  planned: { icon: CalendarIcon, tone: 'brand' },
  drip_planned: { icon: CalendarIcon, tone: 'brand' },
  connected: { icon: CheckCircleIcon, tone: 'good' },
  disconnected: { icon: XCircleIcon, tone: 'bad' },
  browser_needs_auth: { icon: ShieldIcon, tone: 'warn' },
  connect_failed: { icon: ShieldIcon, tone: 'bad' },
  // Meta asking for a slower pace is not a failure and must not read as one.
  rate_limit: { icon: PauseIcon, tone: 'warn' },
  worker_started: { icon: SendIcon, tone: 'good' },
  worker_stopped: { icon: PauseIcon, tone: 'bad' },
  targets_synced: { icon: RepeatIcon, tone: 'brand' },
  manual_pending: { icon: UsersIcon, tone: 'warn' },
  retry: { icon: RepeatIcon, tone: 'brand' },
  cancelled: { icon: XCircleIcon, tone: 'neutral' },
  cta_dropped: { icon: TargetIcon, tone: 'neutral' },

  /*
   * The rest of the real writers.
   *
   * Six of the keys above (connected, disconnected, connect_failed,
   * rate_limit, targets_synced, cta_dropped) are left over from the Graph-API
   * era and no writer in the repo emits them any more, while a dozen events
   * that ARE written every day — a round being planned, a run's own report, a
   * publication that went out but could not be recorded — had no mark and fell
   * through to their level's grey dot. The map is now built from the writers.
   */
  plan_failed: { icon: XCircleIcon, tone: 'bad' },
  plan_targets_skipped: { icon: AlertTriangleIcon, tone: 'warn' },
  publish_unrecorded: { icon: AlertTriangleIcon, tone: 'warn' },
  quick_published: { icon: CheckCircleIcon, tone: 'good' },
  worker_run: { icon: RepeatIcon, tone: 'brand' },
  worker_error: { icon: XCircleIcon, tone: 'bad' },
  browser_start_failed: { icon: XCircleIcon, tone: 'bad' },
  login_challenge: { icon: ShieldIcon, tone: 'warn' },
  login_challenge_failed: { icon: ShieldIcon, tone: 'bad' },
  campaign_paused: { icon: PauseIcon, tone: 'warn' },
  campaign_resumed: { icon: SendIcon, tone: 'good' },
  campaign_stopped: { icon: XCircleIcon, tone: 'warn' },
  campaign_deleted: { icon: XCircleIcon, tone: 'neutral' },
  stopped_campaign_swept: { icon: XCircleIcon, tone: 'neutral' },
  run_adopted_queue: { icon: RepeatIcon, tone: 'brand' },
  queue_respaced: { icon: ClockIcon, tone: 'brand' },
  queue_targets_added: { icon: UsersIcon, tone: 'brand' },
  queue_target_removed: { icon: UsersIcon, tone: 'neutral' },
  stuck_rows_released: { icon: AlertTriangleIcon, tone: 'warn' },
  group_share_resolved: { icon: CheckCircleIcon, tone: 'good' },
  group_share_duplicate: { icon: DotIcon, tone: 'neutral' },
  worker_self_update: { icon: RepeatIcon, tone: 'brand' },
  worker_update_blocked: { icon: AlertTriangleIcon, tone: 'warn' },
};

/** The fallback when an event kind has no mark of its own: its severity. */
const LEVEL_MARK: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: Tone }> = {
  error: { icon: XCircleIcon, tone: 'bad' },
  warn: { icon: AlertTriangleIcon, tone: 'warn' },
  info: { icon: DotIcon, tone: 'neutral' },
};

/**
 * THE LAST LINE OF DEFENCE AGAINST A RAW EXCEPTION ON SCREEN.
 *
 * Every sentence in this log is written in Hebrew at its source — except three
 * sites on the browser worker (social-worker.ts: the startup check, the main
 * loop and the command result) and two on the server worker, which log
 * `err.message` directly. Those land here verbatim, so the feed on the Hebrew
 * dashboard can read "browserType.launchPersistentContext: Executable doesn't
 * exist at /root/.cache/ms-playwright/…". The real fix is at those five log
 * calls (worker/db.ts already exports `safeError` for exactly this, and the
 * job path uses it); this stops the leak reaching an owner in the meantime.
 *
 * Deliberately a script test and NOT friendlyMessage(): friendlyMessage maps
 * by keyword, and a Playwright "Timeout 30000ms exceeded" would come back as
 * "השרת לא הגיב בזמן" — a sentence about the server, about a failure in a
 * browser on the owner's own PC. A message with no Hebrew in it is not
 * rewritten into a guess; it is replaced by what is actually known.
 */
const HEBREW = /[֐-׿]/;
const TECHNICAL = 'תקלה טכנית. הפרטים המלאים נשמרו ביומן במערכת.';

export function ActivityFeed({
  entries,
  limit = 12,
  onChanged,
  onOpen,
  emptyText = 'עדיין אין פעילות. כשתתחילו לפרסם, כל פעולה תופיע כאן.',
}: {
  entries: ActivityEntry[];
  limit?: number;
  /**
   * Told once a retry has landed, so the screen that OWNS these rows re-reads
   * them. The feed never re-reads on its own: it is handed `entries` and it
   * stays handed them, which is the only way its rows and the counters above
   * it can agree. Without this prop no retry button is offered at all — a
   * button whose result nothing would show is worse than none.
   */
  onChanged?: () => void;
  /**
   * Opens the publication a row is about. Absent = the rows are not clickable,
   * which is the honest state on a surface that has nowhere to go.
   */
  onOpen?: (queueId: string, entry: ActivityEntry) => void;
  emptyText?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (!entries.length) return <Empty>{emptyText}</Empty>;

  async function retry(queueId: string) {
    setBusy(queueId);
    try {
      /*
       * The existing write, not a new one. retryQueueItem() puts the row back
       * at the front of the queue with attempts and the confirmation stamp
       * cleared, and it is guarded on status — so a row that has since started
       * publishing matches nothing and comes back false. That is not an
       * error, it is a stale screen, and it is said as such.
       */
      const moved = await retryQueueItem(queueId);
      toast(moved ? 'הפרסום הוחזר לתור.' : 'הפרסום כבר התקדם בינתיים — רענַנּו את המסך.', moved ? 'success' : 'info');
      onChanged?.();
    } catch (err) {
      toast(friendlyMessage(err, 'לא הצלחנו להחזיר את הפרסום לתור.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="space-y-2.5">
      {entries.slice(0, limit).map((e) => {
        const mark = EVENT_MARK[e.event] ?? LEVEL_MARK[e.level] ?? LEVEL_MARK.info;
        const Icon = mark.icon;
        const queueId = queueIdOf(e);
        const openable = Boolean(onOpen && queueId);
        const retryable = Boolean(onChanged && canRetry(e));
        const text = HEBREW.test(e.message) ? e.message : TECHNICAL;
        const line = (
          <p dir="auto" className={`text-sm leading-snug ${e.level === 'error' ? 'text-error-400' : 'text-mist-100'}`}>
            {text}
          </p>
        );
        return (
          <li key={e.id} className="log-in flex items-start gap-2.5">
            <span aria-hidden className={`mt-0.5 shrink-0 ${TONE_TEXT[mark.tone]}`}>
              <Icon className="h-4 w-4" />
            </span>
            {/*
              THE SENTENCE GETS THE WHOLE WIDTH.

              The retry button sits on the line BELOW, beside the timestamp,
              rather than beside the text. Measured at 375px: as a shrink-0
              sibling of the message it left the sentence 187px of the 283 it
              otherwise has — a third of the row gone from the only part of it
              that says what happened, on rows that are failures and therefore
              the ones worth reading. The same trade is recorded on the run
              card, where a countdown sharing a line with a group name left the
              name 18% of the row: one box each, not a tighter squeeze.

              The sentence wraps rather than truncates. It is the point of the
              row, and a group name inside it is already isolated by whoever
              wrote the line.
            */}
            <div className="min-w-0 grow">
              {openable ? (
                <button
                  type="button"
                  onClick={() => onOpen?.(queueId as string, e)}
                  className="block min-h-11 w-full min-w-0 py-1 text-start"
                >
                  {line}
                </button>
              ) : (
                line
              )}
              <div className="flex min-w-0 flex-wrap items-center gap-x-3">
                <p className="text-[11px] text-mist-500" title={stampText(e.at)}>
                  {relativeHe(e.at)}
                </p>
                {retryable && (
                  <button
                    type="button"
                    disabled={busy === queueId}
                    onClick={() => retry(queueId as string)}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-1 text-xs font-bold text-brand-400 transition-colors hover:bg-ink-800 disabled:text-ink-600"
                  >
                    <RepeatIcon aria-hidden className="h-4 w-4" />
                    {busy === queueId ? 'מחזיר…' : 'נסה שוב'}
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
