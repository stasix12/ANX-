import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ─── THE PUBLISHING CYCLE: 100 PUBLICATIONS, THEN EIGHT HOURS OFF ─────────
 *
 * "כל 100 פרסומים מוצלחים בקבוצות פייסבוק תתחיל הפסקה של 8 שעות."
 * "ביממה של 24 שעות אפשר עד שתי סבבים (200) קבוצות ככה אנחנו בסדר."
 *
 * ALL OF THE ARITHMETIC IS IN THE DATABASE, in social_publish_cycle_tick()
 * (supabase/social-latest.sql, v41). This file is the one door to it, shared
 * by the worker and the dashboard so a number on screen and a number in the
 * engine can never be computed two different ways.
 *
 * WHY THE DATABASE AND NOT HERE. The brief asks for "נעילה אטומית … כדי למנוע
 * מעבר של מכסת 100 הפרסומים עקב עבודה מקבילה", and the function takes a real
 * row lock: the second caller BLOCKS on the first caller's transaction and
 * then reads the number it wrote. Proven in worker/test/cycle-db.test.ts by
 * racing eight sessions, fifty calls each — all four hundred increments
 * survive, and removing the lock makes that assertion fail.
 *
 * WHY NOT A WINDOW QUERY. "count the rows published since the cycle began"
 * is the obvious shape and it is wrong here: the confirmation sweep
 * (worker/social-worker.ts:4610) writes `published_at: row.published_at ||
 * row.claimed_at || …`, BACKDATING a late confirmation into a window that has
 * already closed, so the same window read twice returns different numbers.
 * The count is a cursor that only moves forward, advanced once by the
 * publication that earned it.
 *
 * WHAT COUNTS, decided by the owner on 11.11:
 *   · a post held in a group admin's approval queue — YES. Facebook saw the
 *     action, and the whole point of the ceiling is what Facebook saw.
 *   · a publication he marked by hand — YES, same account, same quota.
 *   · failed, skipped, cancelled, or parked as "may already be live" — NO.
 *     Only a row the engine really wrote as published advances the cursor.
 */

/** The owner's numbers. Changing one of these changes the engine and the card together. */
export const CYCLE_LIMIT = 100;
/*
 * ─── SIX HOURS, AMENDED BY THE OWNER ON 12.11 ─────────────────────────────
 *
 * The brief quoted above asked for eight. He watched the mechanism complete
 * its first real round that afternoon — exactly 100 publications between
 * 11:14 and 12:46, then nothing — and asked for the pause to come down.
 *
 * WHAT THIS NUMBER DOES AND DOES NOT DO, measured on his own account rather
 * than assumed: it changes the SPACING of the day's publishing, not its
 * total. The ceiling that decides the total is CYCLE_ROUNDS_PER_WINDOW — two
 * rounds in twenty-four hours — and when those are spent the hold runs to the
 * end of the window whatever this number says. His 100 publications took one
 * hour and thirty-one minutes, so at eight hours his two rounds spread over
 * about eleven hours; at six, about nine. Two hundred either way.
 *
 * SO A SHORTER PAUSE IS NOT MORE VOLUME, IT IS MORE PRESSURE PER HOUR, and
 * that is the only reason this is a number worth arguing about: every rate
 * limit either account has hit landed between 210 and 265 publications in a
 * day. Six keeps the day's total under that and keeps the two rounds apart.
 */
export const CYCLE_REST_HOURS = 6;
export const CYCLE_ROUNDS_PER_WINDOW = 2;
export const CYCLE_WINDOW_HOURS = 24;

export interface PublishCycle {
  /** False only when the database could not resolve a single business. */
  ok: boolean;
  /** The switch on the card. Off: nothing is counted and nothing is held. */
  enabled: boolean;
  /** True on the ONE call that completed a round — never on the others that merely see its hold. */
  crossed: boolean;
  count: number;
  limit: number;
  /** The instant publishing may resume, or null when nothing is holding. */
  restUntil: string | null;
  /**
   * THE DATABASE'S OWN ANSWER to "are you holding right now", decided against
   * the SERVER's clock inside the same lock that wrote the instant.
   *
   * It exists because of one line in the brief — "שינוי שעה במערכת (Clock
   * change) לא משבש את ההפסקה" — and because the engine runs on a Windows PC
   * in a living room whose clock nobody audits. Comparing `restUntil` to that
   * machine's own clock would mean a PC three hours fast resumes publishing
   * three hours early, straight into the limit this mechanism exists to
   * avoid. The gate reads this field; only the countdown's digits are drawn
   * from the local clock, because digits have to move.
   */
  resting: boolean;
  roundsInWindow: number;
  roundsPerWindow: number;
  windowStartedAt: string | null;
  cycleStartedAt: string | null;
}

/**
 * One call, and the only one there is.
 *
 * `count: true` is a publication that just landed; `count: false` is a screen
 * asking what the state is. The read path matters as much as the write one:
 * a reader that advanced the cursor would make the number climb while nothing
 * publishes, which looks exactly like an engine that is running when it is not.
 *
 * RETURNS null WHEN THE MECHANISM IS NOT THERE, and that is the deploy order
 * this feature needs. The dashboard ships before the SQL is run by hand, so
 * for a while the function does not exist — a missing relation, a missing
 * function, a permission the migration has not granted yet. Every one of those
 * is "there is no cycle", and the engine must then behave exactly as it did
 * before v41 rather than stop publishing over a feature nobody has turned on.
 */
export async function cycleTick(db: SupabaseClient, count: boolean): Promise<PublishCycle | null> {
  try {
    const { data, error } = await db.rpc('social_publish_cycle_tick', {
      p_limit: CYCLE_LIMIT,
      p_rest_hours: CYCLE_REST_HOURS,
      p_rounds_per_window: CYCLE_ROUNDS_PER_WINDOW,
      p_count: count,
    });
    if (error || !data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    if (d.ok !== true) return null;
    return {
      ok: true,
      enabled: d.enabled === true,
      crossed: d.crossed === true,
      count: Number(d.count ?? 0),
      limit: Number(d.limit ?? CYCLE_LIMIT),
      restUntil: typeof d.restUntil === 'string' ? d.restUntil : null,
      resting: d.resting === true,
      roundsInWindow: Number(d.roundsInWindow ?? 0),
      roundsPerWindow: Number(d.roundsPerWindow ?? CYCLE_ROUNDS_PER_WINDOW),
      windowStartedAt: typeof d.windowStartedAt === 'string' ? d.windowStartedAt : null,
      cycleStartedAt: typeof d.cycleStartedAt === 'string' ? d.cycleStartedAt : null,
    };
  } catch {
    return null;
  }
}

/**
 * Is this state holding publishing back right now?
 *
 * THE CLOCK IS COMPARED HERE AND NOWHERE ELSE, against the instant the
 * database wrote. The brief is explicit — "זמן ההפסקה חייב להישמר בצד השרת
 * ובמסד הנתונים, ולא להסתמך על טיימר מקומי בדפדפן" — and a stored instant
 * compared on read is what makes a refresh, a restart and a changed system
 * clock all give the same answer: the hold is a fact in a row, not a timer
 * anybody is running.
 */
export function cycleResting(state: PublishCycle | null, now = Date.now()): boolean {
  if (!state || !state.enabled) return false;
  /*
   * THE SERVER'S VERDICT WINS, and it can only ever ADD a hold, never cut one
   * short. Both directions of a wrong local clock end up safe:
   *
   *   · the PC runs fast and thinks the eight hours are up — the database
   *     says otherwise and the hold stands;
   *   · the PC runs slow and thinks the hold is still on — it keeps resting a
   *     little longer than it had to, which costs time and never costs an
   *     account.
   *
   * A mechanism whose whole purpose is to stay under Facebook's ceiling must
   * fail in the direction of publishing LESS.
   */
  if (state.resting) return true;
  if (!state.restUntil) return false;
  const until = Date.parse(state.restUntil);
  return Number.isFinite(until) && until > now;
}

/** How long is left, in milliseconds, or 0 when nothing is holding. */
export function cycleRestLeftMs(state: PublishCycle | null, now = Date.now()): number {
  if (!state?.restUntil || !cycleResting(state, now)) return 0;
  return Math.max(0, Date.parse(state.restUntil) - now);
}

/**
 * HH:MM:SS, which is what the card counts down in.
 *
 * Built from the server's instant minus the browser's clock, so the digits
 * move once a second without any of them being the source of truth; when the
 * two clocks disagree the countdown is wrong by that much and the RESUMPTION
 * is still exactly on time, because the engine compares the same stored
 * instant on its own machine.
 */
export function cycleCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
