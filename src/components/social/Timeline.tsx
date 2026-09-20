'use client';

import type { QueueRow } from '@/lib/social/client';
import { isInFlight, needsHuman } from '@/lib/social/status';
import { agree, counted, formatDateHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import type { QueueStatus } from '@/lib/social/types';
import { TargetAvatar } from './TargetAvatar';
import { EmptyState, STATUS_TONE, TONE_FILL, TONE_TEXT, TONE_TINT, type Tone } from './ui';
import { CalendarIcon } from '@/components/icons';

/**
 * What is about to happen, as a vertical strip you can read in a second:
 * time, group, and a rail connecting them in order. Vertical on every width —
 * on a phone a horizontal timeline is a scroll container nobody scrolls, and
 * on a desktop the same column sits comfortably beside the campaign's stats.
 *
 * Times come from the queue rows themselves; nothing here is interpolated.
 */

/**
 * The rail's dot was a tenth hand-written status map — nine keys, a loose
 * Record<string,…> the compiler could not police, and five hues (fuchsia,
 * orange, violet, sky, slate) that appear nowhere else in the product. It now
 * reads STATUS_TONE like every other status surface, so a dot can no longer
 * disagree with the pill beside it.
 *
 * The halo is the one thing the tone maps do not supply: it is the same hue as
 * the dot at 20%, and it marks the stop the run is standing on right now.
 */
const RING: Record<Tone, string> = {
  brand: 'ring-brand-300/20',
  good: 'ring-success-400/20',
  bad: 'ring-error-300/20',
  warn: 'ring-warning-400/20',
  neutral: 'ring-mist-500/20',
};

/**
 * The one sentence a stop may carry beyond its time.
 *
 * status.ts is the classification, and by it `publishing` is the ONLY status a
 * worker is actually holding; `awaiting_confirmation` is WAITING — parked until
 * a person taps confirm. This strip used to lump the two together and print
 * "מפרסם עכשיו" on both, while PublicationItem called that very same row
 * "מוכן — ממתין לאישור שלכם" one card away. One row cannot be publishing on one
 * screen and waiting for you on the next, so only `publishing` says it is
 * happening now, and the human-waiting statuses say what they are waiting for —
 * in the same words the queue list uses.
 *
 * A status that is absent here (scheduled, paused, and anything terminal) has
 * nothing to add: its time and its countdown already say everything.
 */
const STATUS_LINE: Partial<Record<QueueStatus, string>> = {
  publishing: 'מפרסם עכשיו',
  awaiting_confirmation: 'מוכן — ממתין לאישור שלכם',
  manual_pending: 'ממתין לפרסום ידני',
  needs_attention: 'דורש טיפול שלכם',
};

export function Timeline({
  rows,
  limit = 8,
  total,
}: {
  rows: QueueRow[];
  limit?: number;
  /**
   * The TRUE number of rows this list is a window onto, when the caller knows
   * it exactly.
   *
   * Without it the footer printed `rows.length - shown`, and `rows` is a
   * capped read: measured on the dashboard with 61 rows queued, the card said
   * "6 shown, ועוד 34 פרסומים אחריהם" — 6 + 34 = 40 = UPCOMING_LIMIT, while
   * the real remainder was 55. A read ceiling presented as a total is the
   * exact defect this screen exists not to commit. Given `total` the remainder
   * is real; the array's own length is only used as a fallback for callers
   * that have no exact count.
   *
   * It must count the SAME SET the rows were read with, not merely a number
   * about the queue. The dashboard reads AUTOMATIC_WAITING_STATUSES and passed
   * summary.queued, which adds the in-flight row on top — so the footer
   * promised one publication this list could never reach. status.ts keeps
   * `automaticWaiting` for exactly this.
   */
  total?: number;
}) {
  const items = rows.slice(0, limit);
  if (!items.length) {
    return <EmptyState icon={<CalendarIcon className="h-5 w-5" />} title="אין פרסום מתוכנן" description="כשתתזמנו סבב, סדר הפרסומים יופיע כאן לפי שעות." />;
  }

  const today = zonedDateISO(new Date());
  return (
    <ol className="relative space-y-0.5">
      {items.map((row, i) => {
        const day = zonedDateISO(new Date(row.scheduled_at));
        const showDay = day !== today && (i === 0 || zonedDateISO(new Date(items[i - 1].scheduled_at)) !== day);
        /*
         * The halo and the tint mark the stop the run is standing on: the row a
         * worker holds right now, and the row that has stopped the run by
         * waiting for a person. Both mean "nothing moves past here" — which is
         * why they share the emphasis, and exactly why they may not share the
         * sentence below.
         */
        const standing = isInFlight(row.status) || needsHuman(row.status);
        const line = STATUS_LINE[row.status];
        const tone = STATUS_TONE[row.status];
        return (
          <li key={row.id}>
            {showDay && <p className="mb-1 mt-3 text-[11px] font-extrabold uppercase tracking-wide text-mist-500">{formatDateHe(row.scheduled_at)}</p>}
            <div className="flex items-stretch gap-3">
              {/* The rail: a dot per stop, a line between them. */}
              <div className="flex w-3 shrink-0 flex-col items-center pt-3.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_FILL[tone]} ${standing ? 'ring-4' : ''} ${standing ? RING[tone] : ''}`} />
                {i < items.length - 1 && <span aria-hidden className="w-px grow bg-ink-700" />}
              </div>
              <div className={`flex min-w-0 grow items-center gap-2.5 rounded-xl px-2 py-2 ${standing ? TONE_TINT[tone] : ''}`}>
                <span className="w-12 shrink-0 text-sm font-extrabold tabular-nums text-brand-400">{formatTimeHe(row.scheduled_at)}</span>
                <TargetAvatar name={row.target?.name ?? '?'} imageUrl={row.target?.image_url} channel={row.target?.channel} size={30} />
                <div className="min-w-0 grow">
                  <p dir="auto" className="truncate text-sm font-bold text-mist-100">{row.target?.name ?? 'יעד'}</p>
                  {row.status === 'scheduled' && <p className="text-[11px] text-mist-500">{relativeHe(row.scheduled_at)}</p>}
                  {line && <p className={`text-[11px] font-bold ${TONE_TEXT[tone]}`}>{line}</p>}
                </div>
              </div>
            </div>
          </li>
        );
      })}
      {(total ?? rows.length) > items.length && (
        /* The trailing word agrees too: "ועוד פרסום אחד אחריו", never
           "ועוד 1 פרסומים אחריהם". At a window of six this line reads 1 as
           soon as a seventh row is waiting, which on the dashboard is the
           common case rather than the edge one. */
        <li className="ps-6 pt-1.5 text-xs text-mist-500">
          ועוד {counted((total ?? rows.length) - items.length, 'פרסום אחד', 'פרסומים', 'שני פרסומים')}{' '}
          {agree((total ?? rows.length) - items.length, 'אחריו', 'אחריהם')}
        </li>
      )}
    </ol>
  );
}
