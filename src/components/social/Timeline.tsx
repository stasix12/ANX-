'use client';

import { useEffect, useState } from 'react';
import type { QueueRow } from '@/lib/social/client';
import { countdownTo } from '@/lib/social/countdown';
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

/* A finished stop's dot: the card's own surface with the outcome's colour as
   its edge. Hollow reads as "behind us" without a second shape or a second
   size — the filled dots below it are what is still coming. */
const RING_DONE: Record<Tone, string> = {
  brand: 'ring-brand-300',
  good: 'ring-success-400',
  bad: 'ring-error-400',
  warn: 'ring-warning-400',
  neutral: 'ring-ink-600',
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
/**
 * One second, for the countdowns below.
 *
 * The strip used to print a static `relativeHe`, so the only live clock on the
 * dashboard was the system card's one box. That box is gone — this list shows
 * every waiting row, so the countdown belongs beside the row it is about, and
 * there is no longer any way for two clocks on one screen to disagree.
 */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const STATUS_LINE: Partial<Record<QueueStatus, string>> = {
  publishing: 'מפרסם עכשיו',
  awaiting_confirmation: 'מוכן — ממתין לאישור שלכם',
  manual_pending: 'ממתין לפרסום ידני',
  needs_attention: 'דורש טיפול שלכם',
};

/**
 * What a stop says once it is behind us.
 *
 * A row used to leave this list the moment it finished — it was here with a
 * countdown at 17:49 and simply gone at 17:50, so the one place that shows
 * the run in order never showed a single thing it had actually done. These
 * are the same three words the status pills use everywhere else in the
 * product; the outcome is not given a second vocabulary here.
 */
const DONE_LINE: Partial<Record<QueueStatus, string>> = {
  published: 'פורסם',
  failed: 'נכשל',
  skipped: 'דולג',
};

/**
 * A waiting row's own clock, and the three things it can honestly say.
 *
 * This is the logic the system card's "הפרסום הבא" box used to carry, moved to
 * where the rows are. `overdue` reads ONLY this row's instant: a publication
 * hours behind because the PC is asleep must not be described as imminent
 * merely because the page is still polling. The two minutes between `due` and
 * `overdue` say "אמור לצאת עכשיו", because a slot that has just passed is not
 * yet a problem — it is the worker's next tick.
 */
function Countdown({ at, now }: { at: string; now: number }) {
  const left = countdownTo(at, now);
  if (!left) return null;
  if (left.overdue) {
    return (
      <p className="text-[11px] font-bold leading-[14px] text-warning-400">
        באיחור · {relativeHe(at)}
      </p>
    );
  }
  if (left.due) return <p className="text-[11px] font-bold leading-[14px] text-mist-300">אמור לצאת עכשיו</p>;
  return (
    <p className="text-[11px] leading-[14px] text-mist-500">
      {/* mm:ss around a neutral colon reorders inside an RTL line. */}
      בעוד <span dir="ltr" className="inline-block tabular-nums">{left.label}</span>
    </p>
  );
}

export function Timeline({
  rows,
  limit = 8,
  total,
  scrollable = false,
  done = [],
  onOpen,
}: {
  rows: QueueRow[];
  limit?: number;
  /**
   * What already happened today, oldest first, above the rows still waiting.
   *
   * A SEPARATE list, and it has to be: `rows` is read with
   * AUTOMATIC_WAITING_STATUSES and the card's subtitle and footer both count
   * that same set. Mixing finished rows into it would make the list and every
   * number about it disagree — which is the defect this screen has the most
   * tests for. So the two are read separately, counted separately, and drawn
   * as one rail, because on the rail they are one afternoon.
   */
  done?: QueueRow[];
  /**
   * Opens a stop. Absent = the rows are not clickable, which is the honest
   * state on a caller that has nowhere to send them.
   */
  onOpen?: (row: QueueRow) => void;
  /**
   * Put the stops in a box of their own that scrolls, instead of cutting the
   * list off at `limit` and counting the rest in a footer.
   *
   * The dashboard drew six of twenty-six and said "ועוד 20 פרסומים אחריהם",
   * so the only way to see the seventh was to leave the screen. The card is
   * the right size — the list inside it was simply not reachable. With this
   * on, every row that was READ is rendered and the box holds about six and a
   * half of them: the half is the affordance, since a row clipped mid-height
   * says "there is more below" better than any hint could.
   *
   * The footer stays OUTSIDE the box, because it is about rows that were
   * never read and therefore can never be scrolled to.
   */
  scrollable?: boolean;
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
  const waiting = rows.slice(0, limit);
  /*
   * One rail, two reads. `done` arrives newest-first (the caller asks the
   * database for the most recent finished rows) and is turned round here so
   * the column runs forwards in time from top to bottom: what went out, then
   * what is next. Ordering, not counting — no number on this screen is
   * derived from it.
   */
  const items = [...done].reverse().concat(waiting);
  /* Before the early return: a hook may not sit behind a condition. Ticking
     only while something is actually waiting keeps an idle screen idle. */
  const now = useTick(items.some((r) => r.status === 'scheduled'));
  if (!items.length) {
    return <EmptyState icon={<CalendarIcon className="h-5 w-5" />} title="אין פרסום מתוכנן" description="כשתתזמנו סבב, סדר הפרסומים יופיע כאן לפי שעות." />;
  }

  const today = zonedDateISO(new Date());
  /* The footer counts the WAITING window only — `done` is its own small read
     with no remainder to promise. */
  const rest = (total ?? rows.length) - waiting.length;
  const list = (
    <ol className="relative space-y-0.5">
      {items.map((row, i) => {
        const doneLine = DONE_LINE[row.status];
        /* A finished stop is placed at the moment it actually happened, not
           at the slot it was given: a row that went out four minutes late
           sitting above one that went out on time would be the list telling
           the afternoon out of order. */
        const at = doneLine ? (row.published_at ?? row.scheduled_at) : row.scheduled_at;
        const day = zonedDateISO(new Date(at));
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
        const body = (
          <>
            {/* The finished stops' hour is dimmed, the waiting ones' is the
                accent: same column, and which half of the afternoon you are
                looking at is readable without reading a word of it. */}
            <span className={`w-12 shrink-0 text-sm font-extrabold tabular-nums ${doneLine ? 'text-mist-500' : 'text-brand-400'}`}>
              {formatTimeHe(at)}
            </span>
            <TargetAvatar name={row.target?.name ?? '?'} imageUrl={row.target?.image_url} channel={row.target?.channel} size={30} />
            <div className="min-w-0 grow">
              <p dir="auto" className="truncate text-sm font-bold text-mist-100">{row.target?.name ?? 'יעד'}</p>
              {row.status === 'scheduled' && <Countdown at={row.scheduled_at} now={now} />}
              {line && <p className={`text-[11px] font-bold ${TONE_TEXT[tone]}`}>{line}</p>}
              {doneLine && <p className={`text-[11px] font-bold ${TONE_TEXT[tone]}`}>{doneLine}</p>}
            </div>
          </>
        );
        const inner = `flex min-w-0 grow items-center gap-2.5 rounded-xl px-2 py-2 text-start ${standing ? TONE_TINT[tone] : ''}`;
        return (
          <li key={row.id}>
            {showDay && <p className="mb-1 mt-3 text-[11px] font-extrabold uppercase tracking-wide text-mist-500">{formatDateHe(at)}</p>}
            <div className="flex items-stretch gap-3">
              {/* The rail: a dot per stop, a line between them. A finished
                  stop's dot is hollow — it is behind us, and the filled ones
                  are what is still coming. */}
              <div className="flex w-3 shrink-0 flex-col items-center pt-3.5">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    doneLine ? `bg-ink-850 ring-2 ${RING_DONE[tone]}` : TONE_FILL[tone]
                  } ${standing ? `ring-4 ${RING[tone]}` : ''}`}
                />
                {i < items.length - 1 && <span aria-hidden className="w-px grow bg-ink-700" />}
              </div>
              {onOpen ? (
                <button type="button" onClick={() => onOpen(row)} className={inner}>
                  {body}
                </button>
              ) : (
                <div className={inner}>{body}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );

  /* The trailing word agrees too: "ועוד פרסום אחד אחריו", never
     "ועוד 1 פרסומים אחריהם". */
  const footer =
    rest > 0 ? (
      <p className="ps-6 pt-1.5 text-xs text-mist-500">
        ועוד {counted(rest, 'פרסום אחד', 'פרסומים', 'שני פרסומים')} {agree(rest, 'אחריו', 'אחריהם')}
      </p>
    ) : null;

  if (!scrollable) {
    return (
      <>
        {list}
        {footer}
      </>
    );
  }

  return (
    <>
      {/*
        21rem is about six and a half stops (a stop is ~52px: a 30px avatar or
        two text lines inside py-2, plus the 2px the list puts between them).
        The half is deliberate — a row cut through the middle is what tells a
        thumb there is more below.

        No `overscroll-contain`: when the list reaches its end the gesture
        should carry on scrolling the page, which is what a reader expects and
        what stops the box feeling like a trap.

        tabIndex/role/aria-label: a scrollable region that is not focusable is
        unreachable with a keyboard, and the rows themselves are not links.
      */}
      <div
        tabIndex={0}
        role="group"
        aria-label="הפרסומים הקרובים — רשימה נגללת"
        className="max-h-[21rem] overflow-y-auto rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
      >
        {list}
      </div>
      {footer}
    </>
  );
}
