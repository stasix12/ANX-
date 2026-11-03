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
 * ────────────────── WHY THIS FILE CANNOT SAY "IT IS NOT THERE" ─────────────
 *
 * The first version of this module had a third verdict — 'absent' — which put
 * the row back on the queue. An adversarial review of it found SIX separate
 * ways a post that was plainly live would be declared absent and published a
 * second time, and the worst of them was not an edge case:
 *
 *   • `ok: true` from readOurPostsInGroup means `page.goto` resolved and
 *     classifyPage saw no login form. It is NOT a statement that the author
 *     feed rendered. A cold profile, a slow response or an interstitial
 *     served after the classification yields `{ ok: true, posts: [] }`, and
 *     every parked row in that group would be republished.
 *   • matchPosts deliberately refuses to match when two of our posts fit the
 *     same text — "picking either is a coin toss". A campaign with חזרה
 *     יומית puts the same words in a group every day, so after a week the
 *     author page holds seven identical posts and NO row can ever match.
 *     That is not a race: it fires every single time.
 *   • A post waiting in the group's admin-approval queue is not on the author
 *     page at all — and admin approval is one of the likeliest reasons the
 *     publish dialog never closed in the first place.
 *   • Publishing as a Page lists nothing under /user/<personal id>/.
 *   • And while the underlying fault is still live, park → "absent" →
 *     republish → park is a loop with no end: one more live copy per cycle.
 *
 * The two mistakes were never the same size —
 *
 *   Saying "it is live" when it is not  →  one post silently never goes out.
 *   Saying "it is not live" when it is  →  the same post goes to the same
 *                                          group twice, publicly, forever.
 *
 * — and no amount of guarding made the second one rare enough to be worth its
 * price. So this module decides ONE thing: whether our post is positively,
 * textually ON the page. When it is, the row stops being a question. When it
 * is not, for ANY reason, nothing is written and the row stays parked exactly
 * as it is today.
 *
 * That is still worth having. A row the sweep confirms becomes a real
 * `published` row, which is the only form rules.ts's two duplicate guards can
 * see — so confirming a post is itself a defence against publishing it twice.
 */

/** A parked row, as the sweep reads it out of the queue. */
export interface SubmittedRow {
  id: string;
  /** The exact text the worker typed into the composer. */
  text: string;
}

export type Verdict =
  /** Found on the group's author page, by text, beyond doubt. The row is a
      publication after all, and saying so is what stops it being published
      again — rules.ts's two duplicate guards both count `status='published'`
      rows and cannot see a parked one. */
  | { id: string; outcome: 'live'; url: string }
  /** Everything else. NOTHING is written; the row stays parked for a human,
      exactly as it is today. */
  | { id: string; outcome: 'unknown'; why: VerdictDoubt };

export type VerdictDoubt =
  /** The author page did not load, or Facebook showed a wall instead. */
  | 'unreadable'
  /** Our own text is too short, or too much of it is emoji, to be matched at
      all. A dozen letters match half a feed; see matchPosts in postIndex.ts. */
  | 'no-evidence'
  /** The page was read and our post was not positively identified on it.
      THIS IS NOT "the post is not there" — see the header. */
  | 'not-found';

/*
 * HOW MUCH OF OUR OWN TEXT HAS TO SURVIVE THE TRIP.
 *
 * matchPosts refuses to match on fewer than 12 letters, because a dozen
 * letters match half a feed. Marking a row `published` is a heavier claim, so
 * the bar here is higher: below it the row is left alone. It also closes the
 * one route to a FALSE 'live' the review found — matchPosts' last rule pairs
 * a lone unmatched row with a lone unmatched post by position, which would
 * hand a two-word caption yesterday's unrelated permalink.
 */
export const MIN_EVIDENCE_LETTERS = 40;

/*
 * HOW LONG TO LET FACEBOOK CATCH UP BEFORE BELIEVING ITS OWN PAGE.
 *
 * The author page is not instantaneous. A post that went live thirty seconds
 * ago can be missing from it, so looking that early is simply a wasted page
 * load. Ten minutes is far longer than the page needs and costs nothing:
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

/** Is our own text substantial enough to identify a post by? */
export function provableText(text: string): boolean {
  return normalizeForMatch(text || '').length >= MIN_EVIDENCE_LETTERS;
}

/**
 * Does the post at this address really carry our words?
 *
 * matchPosts' final rule pairs one leftover row with one leftover post by
 * POSITION, with no text agreement at all — correct for its own job (saving an
 * address for a comment) and not nearly enough to declare a row published. So
 * the pairing is re-checked here against the page's own copy of the text, by
 * the same containment rule matchPosts uses when it does match on text.
 */
export function textAgrees(ours: string, theirs: string): boolean {
  const mine = normalizeForMatch(ours || '');
  const other = normalizeForMatch(theirs || '');
  if (mine.length < MIN_EVIDENCE_LETTERS || other.length < 12) return false;
  return other.includes(mine.slice(0, 60)) || mine.includes(other.slice(0, 60));
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
  const textAt = new Map(read.posts.map((p) => [p.url, p.text]));

  return rows.map((row): Verdict => {
    if (!provableText(row.text)) return { id: row.id, outcome: 'unknown', why: 'no-evidence' };
    const url = matched[row.id];
    /* Not matched, or matched only by matchPosts' positional fallback: either
       way we have not identified this post, and "not identified" is never
       "not there". The row stays exactly as it is. */
    if (!url || !textAgrees(row.text, textAt.get(url) ?? '')) {
      return { id: row.id, outcome: 'unknown', why: 'not-found' };
    }
    return { id: row.id, outcome: 'live', url };
  });
}

/** One line for the log, so a sweep that decided nothing still says so. */
export function verdictTally(verdicts: Verdict[]): { live: number; unknown: number } {
  return {
    live: verdicts.filter((v) => v.outcome === 'live').length,
    unknown: verdicts.filter((v) => v.outcome === 'unknown').length,
  };
}
