/*
 * WHEN THE NIGHTLY GROUP CHECK IS DUE.
 *
 * Split out of social-worker.ts and importing only the clock helpers, because
 * the decision below is three comparisons that are wrong in ways nobody sees
 * for a day at a time — and the file it came from cannot be loaded without a
 * database and a Facebook session. worker/test/nightly.test.ts walks every
 * case in plain Node.
 *
 * THE THREE THINGS IT HAS TO GET RIGHT:
 *
 *   ONCE A DAY. The worker ticks every five seconds and updates and restarts
 *   itself several times a day, so "already done" cannot live in memory and
 *   cannot mean "in the last 24 hours" either — it means "since this local
 *   day began", or a sweep at 23:10 and another at 00:10 are two nights'
 *   worth of Facebook traffic inside an hour.
 *
 *   AT THE END OF THE DAY. 23:00 on the owner's own clock, not the machine's:
 *   a worker running in a container is on UTC and would sweep at two in the
 *   afternoon.
 *
 *   BUT NOT NEVER. A PC that is shut at 18:00 and opened at 09:00 is never
 *   awake at 23:00, and a check that only ever fires in an hour that machine
 *   never sees is a feature that does nothing for the person who asked for it.
 *   So an overdue check runs at the first opportunity instead.
 */
import { startOfZonedDay, zonedHour } from '@/lib/social/time';

/** The hour the day is considered over, on the owner's own clock. */
export const NIGHTLY_HOUR = 23;

/**
 * After this long with no check, the hour stops mattering.
 *
 * 36 hours rather than 24: at exactly 24 a machine that is on from 09:00 to
 * 18:00 every day would drift an hour earlier each morning until it collided
 * with the working day. 36 lands it in the same part of the following day,
 * once, and then the 23:00 rule takes over again the first evening the
 * machine happens to be on.
 */
export const NIGHTLY_OVERDUE_MS = 36 * 3_600_000;

export type NightlyInput = {
  /** When the last sweep ran, as stored. Null or unparseable means never. */
  lastISO: string | null | undefined;
  now: Date;
};

export function nightlyDue({ lastISO, now }: NightlyInput): boolean {
  const last = lastISO ? Date.parse(lastISO) : NaN;
  /*
   * A stamp in the FUTURE is treated as never, not as done.
   *
   * It happens: a machine whose clock is wrong, or a row written by a PC in
   * another timezone. Read as "done", it would switch the check off until the
   * date caught up — silently, for however long that took.
   */
  const lastMs = Number.isFinite(last) && last <= now.getTime() ? last : 0;
  /* Zero also means NEVER, and zero is infinitely overdue — so a first-ever
     check runs at once rather than waiting for an evening that may be twelve
     hours away. There is no previous sweep to be spacing away from, and the
     looking is paced by the chore window either way. */

  /* Done since this local day began. */
  if (lastMs >= startOfZonedDay(now).getTime()) return false;

  if (zonedHour(now) >= NIGHTLY_HOUR) return true;
  return now.getTime() - lastMs >= NIGHTLY_OVERDUE_MS;
}
