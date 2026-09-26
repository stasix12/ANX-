/**
 * Whose groups a worker may take — the one decision, in one pure function.
 *
 * It lives here rather than in the worker because the worker starts itself on
 * import, so nothing can test it there. This is the piece where being wrong
 * costs the most and is hardest to see: too wide and one business publishes
 * another's groups under its own name; too narrow and the queue quietly stops
 * and the dashboard stays green.
 */

/**
 * A uuid no row can have, meaning "match nothing".
 *
 * PostgREST has no way to say that, and leaving the filter off means "match
 * everything" — the exact opposite of what is wanted when a worker cannot
 * tell which account it is.
 */
export const NO_ACCOUNT = '00000000-0000-0000-0000-000000000000';

export interface AccountScope {
  /** How many Facebook accounts the whole system has. */
  accountsTotal?: number;
  /** The social_accounts row this worker publishes as, if it knows. */
  accountRow?: string;
}

/**
 * The account every group must belong to for this worker to touch it, or null
 * meaning "take everything, as always".
 *
 * THE FILTER TURNS ITSELF ON. While there is one account — which is every day
 * of this product's life so far — the queue is read exactly as it always has
 * been. A filter that were always on would have to be right on the first tick
 * after an update, on a live machine, against rows that may not have been
 * linked yet; and if it were wrong the symptom is not an error message, it is
 * a business that stops publishing. Inert until a second account exists, it
 * cannot do that: today it is provably a no-op, and by the time it is not,
 * somebody has deliberately added an account and is watching.
 */
export function queueScope(state: AccountScope): string | null {
  if ((state.accountsTotal ?? 0) <= 1) return null;
  /*
   * More than one account and we do not know which we are. Taking anything
   * here could publish another account's group from this browser, under the
   * wrong name, into a group this account may not even be in. Take nothing —
   * and say so out loud, which the caller does.
   */
  return state.accountRow ?? NO_ACCOUNT;
}
