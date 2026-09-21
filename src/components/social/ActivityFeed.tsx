'use client';

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
import { relativeHe } from '@/lib/social/time';
import { stampText } from './DateTime';
import type { ActivityEntry } from '@/lib/social/types';
import { Empty, TONE_TEXT, type Tone } from './ui';

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

export function ActivityFeed({ entries, limit = 12 }: { entries: ActivityEntry[]; limit?: number }) {
  if (!entries.length) return <Empty>עדיין אין פעילות. כשתתחילו לפרסם, כל פעולה תופיע כאן.</Empty>;
  return (
    <ul className="space-y-2.5">
      {entries.slice(0, limit).map((e) => {
        const mark = EVENT_MARK[e.event] ?? LEVEL_MARK[e.level] ?? LEVEL_MARK.info;
        const Icon = mark.icon;
        return (
          <li key={e.id} className="flex items-start gap-2.5">
            <span aria-hidden className={`mt-0.5 shrink-0 ${TONE_TEXT[mark.tone]}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 grow">
              <p dir="auto" className={`text-sm leading-snug ${e.level === 'error' ? 'text-error-400' : 'text-mist-100'}`}>
                {HEBREW.test(e.message) ? e.message : TECHNICAL}
              </p>
              <p className="text-[11px] text-mist-500" title={stampText(e.at)}>
                {relativeHe(e.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
