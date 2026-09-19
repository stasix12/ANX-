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
