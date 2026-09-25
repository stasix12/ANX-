/**
 * What a comment's state MEANS, and what it looks like — in one place.
 *
 * The round screen and the dashboard card each wrote their own version of
 * this: two label maps, two hand-rolled dots, two sort orders, already
 * visibly apart (one carried a group picture and a link, the other did not).
 * A third state would have had to be added to both, and the one that was
 * forgotten would have rendered a blank label beside a neutral dot — which is
 * exactly what an unknown value already did.
 *
 * Presentation and vocabulary only. Nothing here decides which rows the
 * worker picks up or what a retry touches; client.ts and the worker own that.
 */
import type { Tone } from '@/components/social/ui';

/**
 * The five states a queued comment can be in.
 *
 * '' is the sixth and it means "not asked for" — no comment was ever queued
 * for this publication, so it is absent from every list rather than shown as
 * a state.
 */
export type CommentStatus = 'pending' | 'commenting' | 'done' | 'failed' | 'unverified';

export const COMMENT_LABEL: Record<CommentStatus, string> = {
  pending: 'ממתין',
  commenting: 'כותב עכשיו',
  done: 'הגיב',
  failed: 'לא הצליח',
  /*
   * NOT "failed", and the distinction is the whole reason this state exists.
   *
   * Enter was pressed and Facebook never confirmed, so the comment may be
   * under the post right now. Calling that "לא הצליח" put it in the bulk
   * retry, and the bulk retry would have put a SECOND comment under a post
   * that already had one — under the owner's own name, permanently. The row
   * asks them to look instead, and "נסה שוב את N שלא הצליחו" leaves it alone.
   */
  unverified: 'צריך לבדוק',
};

export const COMMENT_TONE: Record<CommentStatus, Tone> = {
  pending: 'neutral',
  commenting: 'brand',
  done: 'good',
  failed: 'warn',
  unverified: 'warn',
};

/**
 * Worst first: what needs a person, then what is moving, then what is done.
 *
 * A list of a hundred and seventeen comments is read from the top, and the
 * four that need looking at are the only reason to open it.
 */
export const COMMENT_ORDER: CommentStatus[] = ['unverified', 'failed', 'commenting', 'pending', 'done'];

export function commentRank(status: string | null | undefined): number {
  const at = COMMENT_ORDER.indexOf((status ?? '') as CommentStatus);
  return at < 0 ? COMMENT_ORDER.length : at;
}

/** True for a state a person has to do something about. */
export function commentNeedsHuman(status: string | null | undefined): boolean {
  return status === 'failed' || status === 'unverified';
}

/**
 * The word for a state, and the state itself when there is no word for it.
 *
 * A value this file has not heard of used to render as a blank label beside a
 * grey dot — a row that said nothing at all, which is the failure this module
 * exists to end. Showing the raw value is ugly and it is honest: somebody can
 * read it out and it can be looked up.
 */
export function commentLabel(status: string | null | undefined): string {
  if (!status) return '';
  return COMMENT_LABEL[status as CommentStatus] ?? status;
}
