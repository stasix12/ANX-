/**
 * ─── THE PC'S PULSE IS A CLOCK, NOT A STEP ───────────────────────────────────
 *
 * "המערכת מציגה לפעמים שהמחשב מנותק למרות שהוא מחובר."
 *
 * The dashboard decides the computer is connected from one column:
 * social_workers.last_seen_at, against a 90-second cutoff. That column was
 * written by heartbeat(), and heartbeat() was A STEP IN THE PUBLISHING LOOP —
 * one `await` among the others. Which means every slow thing the worker does
 * pushes the next pulse out by exactly as long as it takes:
 *
 *   · discovering groups runs 2-6 minutes with no pulse at all, and that is
 *     the screen the owner is actively looking at while it runs;
 *   · a Facebook login challenge waits up to SIX MINUTES for the code — so the
 *     light says "the computer is off" on the one screen where a customer is
 *     typing the code into their phone, which is the flow this product is sold
 *     on;
 *   · on an idle worker with an empty queue, all four background chores plus
 *     the update check run back to back in a single tick with at most one
 *     pulse between them. That is the version that happens overnight, with no
 *     command sent and nothing on screen to explain it.
 *
 * None of those is a connection fault. The machine is up, the program is
 * running, the queue is fine — the only thing that is broken is the clock that
 * was supposed to say so.
 *
 * SO THE PULSE GETS ITS OWN TIMER, and the rule that makes it a clock is one
 * line: THE TIMER IS RE-ARMED BEFORE THE WRITE, NEVER AFTER. A pulse that
 * re-arms in the write's `finally` is still a step — a slow write still delays
 * the next one, just one level down. Re-arming first means the interval is the
 * interval, whatever the database is doing.
 *
 * WHICH LEAVES ONE WAY TO STILL GO SILENT, and it is why worker/timed-fetch.ts
 * ships in the same change: a write that never settles holds `inFlight` for
 * ever, and every later tick is skipped. supabase-js sets no timeout on
 * anything, so that is not hypothetical — it is the same fault that was fixed
 * for the browser ("טוען בלי סוף") arriving on the machine that publishes. The
 * ceiling turns a dead socket into an ordinary error, which is what `onError`
 * is for.
 *
 * The explicit heartbeat() calls all stay. They carry the STATUS TRANSITIONS —
 * needs_attention, offline, a browser that lost its login — and those must
 * land at the instant they happen rather than up to five seconds later. This
 * timer only guarantees that the column keeps being written in between, and it
 * re-sends whatever status the last transition set, so it can never quietly
 * promote a worker that is asking for help back to "online".
 */

/** Twice a tick, so a single missed write never reaches the 90-second cutoff. */
export const PULSE_EVERY_MS = 5_000;

/** Injectable so the test runs on a fake clock instead of in real seconds. */
export interface PulseTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PulseStats {
  /** Writes that settled successfully. */
  writes: number;
  /** Ticks that found the previous write still in flight and stood down. */
  skipped: number;
  errors: number;
  inFlight: boolean;
  running: boolean;
}

export interface Pulse {
  start(): void;
  stop(): void;
  stats(): PulseStats;
}

export function createPulse(opts: {
  /** The one write. Kept out of here so this file needs no database. */
  write: () => Promise<void>;
  everyMs?: number;
  onError?: (err: unknown) => void;
  timers?: PulseTimers;
}): Pulse {
  const everyMs = Math.max(250, Math.floor(opts.everyMs ?? PULSE_EVERY_MS) || PULSE_EVERY_MS);
  const timers: PulseTimers =
    opts.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };

  let handle: unknown = null;
  let running = false;
  let inFlight = false;
  let writes = 0;
  let skipped = 0;
  let errors = 0;

  function arm(): void {
    handle = timers.setTimeout(fire, everyMs);
  }

  function fire(): void {
    if (!running) return;
    /*
     * FIRST. This is the whole fix: the next tick is scheduled before anything
     * is awaited, so the pulse's interval does not depend on the database's
     * mood, on a six-minute login challenge, or on a chore holding the
     * browser.
     */
    arm();
    /*
     * ONE WRITE AT A TIME. Not a lock for correctness — the same row, the same
     * values — but a slow network would otherwise stack a new UPDATE every
     * five seconds on top of one that has not answered.
     */
    if (inFlight) {
      skipped += 1;
      return;
    }
    inFlight = true;
    void (async () => {
      try {
        await opts.write();
        writes += 1;
      } catch (err) {
        /*
         * NEVER OUT OF HERE. This runs on a bare timer callback, where a
         * rejection is an unhandled rejection and ends the process — which
         * would turn "the dashboard thinks the PC is off" into the PC actually
         * being off.
         */
        errors += 1;
        try {
          opts.onError?.(err);
        } catch {
          /* a reporter that throws is not allowed to take the worker down either */
        }
      } finally {
        inFlight = false;
      }
    })();
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      arm();
    },
    stop(): void {
      running = false;
      if (handle !== null) {
        timers.clearTimeout(handle);
        handle = null;
      }
    },
    stats(): PulseStats {
      return { writes, skipped, errors, inFlight, running };
    },
  };
}
