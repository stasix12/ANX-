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
}

const pad = (n: number) => String(n).padStart(2, '0');

export function countdownTo(iso: string | null | undefined, now: number = Date.now()): Countdown | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;

  const seconds = Math.max(0, Math.round((target - now) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return {
    seconds,
    label: h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`,
    due: seconds === 0,
  };
}
