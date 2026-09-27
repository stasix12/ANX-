/*
 * WHEN AN IDLE CHORE IS ALLOWED TO TAKE THE BROWSER.
 *
 * Split out of social-worker.ts and importing nothing, because the arithmetic
 * below is the part that was wrong and the file it came from cannot be loaded
 * without a database and a Facebook session. worker/test/chore-window.test.ts
 * runs every case of it in plain Node.
 *
 * THE BUG THIS EXISTS TO PREVENT. The worker has one browser. Publishing a
 * post uses it, and so do the background chores — leaving a round's comment,
 * looking up a post's address, reading view counts. The guard deciding whether
 * a chore could start asked "is a row due at this instant". A post scheduled
 * ten seconds from now is not due at this instant, so the chore started, and
 * the chores are not quick: a comment on a post whose address is unknown hunts
 * three pages of a group for the post's own words. Minutes, with the browser
 * held. The post's turn came and went, and the next one's.
 *
 * With a queue set to one post a minute — which is what the owner runs — that
 * is every slot, and what it looks like from the outside is a machine that
 * answers a freshly launched round of posts by publishing comments on last
 * week's.
 *
 * So the question is "how long until the next publication", and a chore has to
 * fit inside the answer.
 */

/**
 * What each chore needs before it may pick up the browser, in milliseconds.
 *
 * Pessimistic on purpose. Finishing early costs a few idle seconds; finishing
 * late costs a publication its slot.
 */
export const CHORE_NEEDS_MS = {
  /** A comment on a post whose address we have: open, find the box, type, send. */
  commentKnown: 45_000,
  /** A comment on a post whose address we do not: up to three lookup pages,
      each a load and a scrolling search. This is the one that ate rounds. */
  commentHunt: 240_000,
  /** Opens a group page and scrolls it ten times. */
  addresses: 45_000,
  shareLinks: 45_000,
  profiles: 60_000,
  /** Scrolls a feed twenty times. */
  metrics: 90_000,
  /** Stopping and restarting the whole program. Never near a publication. */
  restart: 120_000,
} as const;

export type GateView = {
  /** Whether the spacing gap since the last publication has elapsed. */
  open: boolean;
  /** When it will elapse. Null when it is open, or when the read that decides
      it failed — the two are told apart by `open`. */
  nextAt: string | null;
};

export type WindowInput = {
  /** The earliest still-scheduled row, due or not. Null when the queue is empty. */
  nextScheduledAt: string | null;
  gate: GateView;
  /** True when the queue read itself failed. */
  unknown?: boolean;
  now: number;
};

/**
 * Milliseconds of browser time before the next publication can begin.
 *
 * `Infinity` when nothing is queued — the case the comments feature was built
 * for, an owner pressing "הוסף תגובה לכל הפרסומים" on a finished round.
 *
 * Zero, meaning "take nothing", whenever the answer is not knowable: a failed
 * queue read, or a gate that closed because ITS read failed and so cannot say
 * when it reopens. Same reasoning as the spacing gate itself — not knowing
 * when the next post goes out is a reason to leave the browser alone, never a
 * reason to take it for four minutes.
 *
 * TWO CLOCKS, AND THE LATER ONE WINS. A row cannot publish before its own
 * scheduled_at and cannot publish before the gap has elapsed. Taking the later
 * is also what lets a chore use a genuinely empty four-minute gap instead of
 * sitting out a window nothing was ever going to use — which was the other
 * half of what the owner saw: comments that never move while the worker waits
 * between posts.
 */
export function roomBeforeNextPublish({ nextScheduledAt, gate, unknown, now }: WindowInput): number {
  if (unknown) return 0;
  if (!nextScheduledAt) return Number.POSITIVE_INFINITY;
  if (!gate.open && !gate.nextAt) return 0;

  const scheduled = Date.parse(nextScheduledAt);
  const gateAt = gate.nextAt ? Date.parse(gate.nextAt) : 0;
  /* An unparseable timestamp is a corrupt row, not permission. Treated as
     "now", so the row looks imminent and the chores stand down. */
  const starts = Math.max(Number.isFinite(scheduled) ? scheduled : now, Number.isFinite(gateAt) ? gateAt : 0);
  return starts - now;
}

/** Whether a chore of this cost fits. Separate so the rule reads the same in
    the loop and in the test, and so `Infinity` needs no special case. */
export function choreFits(roomMs: number, needsMs: number): boolean {
  return roomMs >= needsMs;
}
