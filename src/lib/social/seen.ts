/**
 * WHICH PUBLICATIONS WAITING FOR A PERSON HAVE ALREADY BEEN SHOWN TO THEM.
 *
 * "ברגע שיש התראה כזאת בכתום שרשום שיש פוסטים שמחכים לכם, אני רוצה אחרי
 *  שפעם אחת אני לוחץ על זה וזה נעלם אחר כך."
 *
 * The dashboard's orange bar says "N פרסומים ממתינים לכם" and links to the
 * list. Until now it kept saying it: the rows it counts are ones only a person
 * can move, and a person who has looked at them and decided to leave them
 * there was told about them again every thirty seconds, for ever. A warning
 * that cannot be answered is one people learn to read past — which is the
 * opposite of what it is for.
 *
 * SO IT IS DISMISSED BY ROW, NOT BY A FLAG.
 *
 * A single "hide this bar" boolean would have been four lines, and it would
 * have hidden the NEXT publication that needed him too — silently, with the
 * only other place it appears being a filter on the history screen. The thing
 * being remembered here is therefore not "the bar was dismissed" but "these
 * exact rows were shown", so a row that arrives afterwards raises the bar
 * again with its own count.
 *
 * AND WHAT IS REMEMBERED IS PRUNED ON EVERY READ. `keep()` intersects the
 * stored set with what is actually waiting now, which is what makes the second
 * half work: a row that gets handled leaves the set, so if that same row ever
 * comes back — retried, then stuck again — it is unseen once more and says so.
 * It also means the key cannot grow without bound on a machine that publishes
 * every day for a year.
 *
 * Per device, in localStorage, like the bell's unread marker beside it: this
 * is a convenience about one person's attention, not a fact about the
 * business, and it has no business in the database. If storage is blocked the
 * functions below degrade to "nothing has been seen" — the bar simply keeps
 * showing, which is exactly the behaviour it had before this file existed.
 */
const KEY = 'social:waiting:seen';

/** Unique, in the order given. Stored sets are small; readability wins. */
const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/**
 * The rows waiting on a person that they have NOT been shown yet.
 *
 * The bar's count comes from here rather than from the queue summary, so the
 * number and the decision to show it can never disagree.
 */
export function unseen(waiting: readonly string[], seen: readonly string[]): string[] {
  const known = new Set(seen);
  return unique(waiting).filter((id) => !known.has(id));
}

/**
 * The stored set, narrowed to what is still waiting.
 *
 * Called on every load, and its result is what gets written back. See the
 * header: this is the half that lets a row raise the bar a second time.
 */
export function keep(seen: readonly string[], waiting: readonly string[]): string[] {
  const live = new Set(waiting);
  return unique(seen).filter((id) => live.has(id));
}

/**
 * Everything waiting right now, marked as shown. That is the whole of what
 * pressing "הצג" means — the screen it opens lists exactly these rows.
 */
export function markAll(waiting: readonly string[]): string[] {
  return unique(waiting);
}

/** Two sets holding the same ids, order aside. Saves a pointless write. */
export function same(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((id) => other.has(id));
}

export function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    /*
     * Anything at all can be under a localStorage key — an older shape of
     * this feature, another tab mid-write, a person with the console open.
     * A stored value is never trusted to be what it was written as.
     */
    return Array.isArray(parsed) ? unique(parsed.filter((v): v is string => typeof v === 'string')) : [];
  } catch {
    return [];
  }
}

export function writeSeen(ids: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(unique(ids)));
  } catch {
    /* Private mode, a full quota, storage switched off. The bar keeps
       showing, which is the safe direction for a thing nobody has answered. */
  }
}
