import { counted } from './time';

/**
 * Time left until an instant, as the dashboard shows it: a live "בעוד 06:42".
 *
 * Purely derived from the real scheduled_at of the next queue row — there is
 * no invented duration here. When nothing is scheduled the caller gets null
 * and says so, rather than showing a placeholder clock.
 */
export interface Countdown {
  /** Whole seconds remaining, never negative. */
  seconds: number;
  /** mm:ss, or h:mm:ss once an hour or more remains. */
  label: string;
  /** The instant has arrived or passed — the worker should be picking it up. */
  due: boolean;
  /**
   * How far the instant is in the PAST, in whole seconds. 0 while it is still
   * ahead.
   *
   * `due` cannot tell "its moment has just come" from "its moment was six
   * hours ago", because Math.max(0, …) flattens every past instant to zero. So
   * a dashboard that reads `due` as "publishing right now" says exactly that
   * about a queue whose PC has been switched off since the weekend — the most
   * common real state this product has — and shows a bare clock time beside it
   * that reads like today. There is no automation happening to describe.
   *
   * These two fields are the missing half: `late` is the real distance, and
   * `overdue` is it being far enough past that nothing is plausibly mid-flight.
   */
  late: number;
  /**
   * The instant passed more than OVERDUE_AFTER_SECONDS ago.
   *
   * Still not proof that a worker is running — only a heartbeat can say that
   * (WORKER_OFFLINE_AFTER_SECONDS in types.ts), and a caller that has one
   * should use it. This is the honest floor without one: past this, "מתבצע
   * כעת" is a claim about automation that is not happening.
   */
  overdue: boolean;
}

/**
 * The grace between "due" and "overdue".
 *
 * Both workers poll every few seconds and the rules engine parks a row for a
 * minute at a time (WAIT_MINUTES in rules.ts), so a row a minute or two past
 * its slot is ordinary. Two minutes is comfortably outside that and far
 * inside the six hours an owner's laptop spends asleep.
 */
export const OVERDUE_AFTER_SECONDS = 120;

const pad = (n: number) => String(n).padStart(2, '0');

export function countdownTo(iso: string | null | undefined, now: number = Date.now()): Countdown | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;

  const remaining = Math.round((target - now) / 1000);
  const seconds = Math.max(0, remaining);
  const late = Math.max(0, -remaining);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return {
    seconds,
    label: h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`,
    due: seconds === 0,
    late,
    overdue: late > OVERDUE_AFTER_SECONDS,
  };
}

/**
 * "8 שעות ו-2 דקות" — the wait in words, for the one place that has room for
 * them: the campaign card's "הפרסום הבא" block.
 *
 * "ומתחתיו: בעוד 8 שעות ו־2 דקות." A mm:ss clock is the right reading for a
 * wait of minutes — it is what the queue list prints beside every row — and
 * the wrong one for a wait of hours: "8:02:00" is three numbers the owner has
 * to parse, and at a glance it reads as a time of day.
 *
 * NULL UNDER AN HOUR, deliberately, and that is the whole interface: the
 * caller prints `label` (mm:ss, live to the second) when this returns null, so
 * the short wait keeps its seconds and the long one loses digits nobody reads.
 * A single function returning both would have to decide how to render the LTR
 * island around the digits, which is the caller's job and not this file's.
 */
export function longWaitHe(c: Countdown): string | null {
  const hours = Math.floor(c.seconds / 3600);
  if (hours < 1) return null;
  /*
   * AND DAYS PAST TWO OF THEM. "בעוד 430 שעות" is arithmetic the owner has to
   * do; a round planned for next week is "בעוד 17 ימים ו-22 שעות", which he
   * can check against the date on the line above it. 48 hours is the
   * changeover because "בעוד 36 שעות" is still a number anyone reads at a
   * glance, and relativeHe() in time.ts draws the same line in the same place.
   */
  if (hours >= 48) {
    const days = Math.floor(c.seconds / 86_400);
    const rest = Math.floor((c.seconds % 86_400) / 3600);
    return and(counted(days, 'יום', 'ימים', 'יומיים'), rest ? counted(rest, 'שעה', 'שעות', 'שעתיים') : '');
  }
  const minutes = Math.floor((c.seconds % 3600) / 60);
  /* "8 שעות ו-0 דקות" is a number printed for the sake of the sentence's
     shape. On the hour the hours are the whole answer. */
  return and(counted(hours, 'שעה', 'שעות', 'שעתיים'), minutes ? counted(minutes, 'דקה', 'דקות', 'שתי דקות') : '');
}

/**
 * "8 שעות ו-2 דקות", but also "שעה ודקה" and "שעתיים ושתי דקות".
 *
 * THE HYPHEN BELONGS TO THE DIGIT, NOT TO THE CONJUNCTION. Hebrew joins two
 * words with a prefixed ו and no hyphen — "שעה ודקה". The hyphen appears only
 * to separate the letter from a NUMERAL, as in "ו-2". counted() returns a bare
 * word for one and for two ("דקה", "שתי דקות") and a digit-led phrase for
 * everything else, so a fixed `ו-` produced "שעה ו-דקה" and "שעתיים ו-שתי
 * דקות" — which is how a sentence tells a customer that nobody read the
 * screen. The form is decided by what actually follows it.
 */
function and(first: string, second: string): string {
  if (!second) return first;
  return `${first} ${/^\d/.test(second) ? 'ו-' : 'ו'}${second}`;
}
