import { normalizeForMatch, type GroupPostsRead } from './facebook/postIndex';

/*
 * DID THE POST ACTUALLY GO UP? — the decision, kept away from the browser.
 *
 * THE SITUATION THIS EXISTS FOR, in the owner's words: "הפסיק לפרסם אחרי
 * השינוי האחרון". On 03/11 the machine published 136 posts and then, at 09:22,
 * stopped — not because anything was broken in it, but because every attempt
 * after that reached the group, clicked "פרסום", and the dialog never closed.
 * social-worker.ts:2847 does the only safe thing it can with that: it parks
 * the row at `needs_attention` / step `submitted` and NEVER retries, because
 * the post may well be live and a retry would post it twice under the owner's
 * own account, with no undo. By 17:30 there were 139 rows parked that way.
 *
 * Parking is right. Leaving them parked for a human to check one by one is
 * what this module replaces. The group's own author page —
 * /groups/<id>/user/<us>/ — lists ONLY our posts in that group, which is
 * exactly the question, and postIndex.ts already reads it for the comments.
 *
 * ────────────────────── THE ASYMMETRY THAT RULES THIS FILE ─────────────────
 *
 * The two mistakes are not the same size.
 *
 *   Saying "it is live" when it is not  →  one post silently never goes out.
 *   Saying "it is not live" when it is  →  the same post goes to the same
 *                                          group twice, publicly, forever.
 *
 * So "absent" — the verdict that puts a row back on the queue — is the one
 * that has to earn it, and three separate things must all be true before it
 * can be reached. Everything else resolves to `unknown`, which changes
 * nothing and leaves the row parked exactly as it is today. An unknown costs
 * the owner a manual check: the price of never being the second mistake.
 */

/** A parked row, as the sweep reads it out of the queue. */
export interface SubmittedRow {
  id: string;
  /** The exact text the worker typed into the composer. */
  text: string;
}

export type Verdict =
  /** Found on the group's author page. The row is a publication after all. */
  | { id: string; outcome: 'live'; url: string }
  /** Read the page, our text is long enough to be evidence, and it is not
      there. Safe to put back on the queue. */
  | { id: string; outcome: 'absent' }
  /** Anything else. Nothing is written; the row stays parked for a human. */
  | { id: string; outcome: 'unknown'; why: VerdictDoubt };

export type VerdictDoubt =
  /** The author page did not load, or Facebook showed a wall instead. */
  | 'unreadable'
  /** Our own text is too short, or too much of it is emoji, to prove absence.
      A dozen letters match half a feed; see matchPosts in postIndex.ts. */
  | 'no-evidence'
  /** Parked too recently — Facebook's own page has not caught up yet. */
  | 'too-soon';

/*
 * HOW MUCH OF OUR OWN TEXT HAS TO SURVIVE THE TRIP.
 *
 * matchPosts already refuses to MATCH on fewer than 12 letters, because a
 * dozen letters match half a feed. Declaring something ABSENT is the heavier
 * claim, so the bar is higher: a post whose normalised text is shorter than
 * this is one whose absence we cannot prove — it is an image, a line of
 * emoji, a two-word caption — and it stays parked rather than being retried.
 */
export const MIN_EVIDENCE_LETTERS = 40;

/*
 * HOW LONG TO LET FACEBOOK CATCH UP BEFORE BELIEVING ITS OWN PAGE.
 *
 * The author page is not instantaneous. A post that went live thirty seconds
 * ago can be missing from it, and believing that would be exactly the second
 * mistake. Ten minutes is far longer than the page needs and costs nothing:
 * these rows have been parked for hours.
 */
export const VERIFY_AFTER_MS = 10 * 60_000;

/** Has this row been parked long enough for the author page to be trusted? */
export function ripeForVerify(parkedAt: string | null | undefined, now: number): boolean {
  if (!parkedAt) return false;
  const at = Date.parse(parkedAt);
  if (!Number.isFinite(at)) return false;
  return now - at >= VERIFY_AFTER_MS;
}

/** Is our own text substantial enough for its absence to mean anything? */
export function provableText(text: string): boolean {
  return normalizeForMatch(text || '').length >= MIN_EVIDENCE_LETTERS;
}

/**
 * Turn one group's author page into one verdict per parked row.
 *
 * PURE — no page, no database — so every branch below is a test rather than
 * an argument. `matched` is whatever matchPosts() made of the same rows and
 * the same posts; this function never matches anything itself.
 */
export function decideSubmitted(
  rows: SubmittedRow[],
  read: GroupPostsRead,
  matched: Record<string, string>,
): Verdict[] {
  /*
   * THE WHOLE SAFETY OF THIS FEATURE IS THIS ONE LINE.
   *
   * An unread page is not an empty group. postIndex.ts's ourPostsInGroup
   * flattens both into [], which is why this module is handed the read itself
   * and not a list of posts: a login wall must never be able to say "absent".
   */
  if (!read.ok) return rows.map((r) => ({ id: r.id, outcome: 'unknown', why: 'unreadable' }));

  return rows.map((row): Verdict => {
    const url = matched[row.id];
    if (url) return { id: row.id, outcome: 'live', url };
    if (!provableText(row.text)) return { id: row.id, outcome: 'unknown', why: 'no-evidence' };
    return { id: row.id, outcome: 'absent' };
  });
}

/** One line for the log, so a sweep that decided nothing still says so. */
export function verdictTally(verdicts: Verdict[]): { live: number; absent: number; unknown: number } {
  return {
    live: verdicts.filter((v) => v.outcome === 'live').length,
    absent: verdicts.filter((v) => v.outcome === 'absent').length,
    unknown: verdicts.filter((v) => v.outcome === 'unknown').length,
  };
}
