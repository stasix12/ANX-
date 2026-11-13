/**
 * HOW FAR THE OWNER HAS BEEN TOLD ABOUT PUBLICATIONS THAT WAIT ON A PERSON.
 *
 * "ברגע שיש התראה כזאת בכתום שרשום שיש פוסטים שמחכים לכם, אני רוצה אחרי
 *  שפעם אחת אני לוחץ על זה וזה נעלם אחר כך."
 *
 * The dashboard's orange bar says "N פרסומים ממתינים לכם" and links to the
 * list. Until the first version of this file it kept saying it: the rows it
 * counts are ones only a person can move, and a person who has looked at them
 * and decided to leave them there was told about them again every thirty
 * seconds, for ever. A warning that cannot be answered is one people learn to
 * read past — which is the opposite of what it is for.
 *
 * ─── WHY THIS IS NOW ONE INSTANT AND NOT A SET OF IDS ─────────────────────
 *
 * It was a set: the ids of the rows that had been shown, pruned on every read
 * against what was still waiting, so a row that was handled and later got
 * stuck again counted as unseen a second time. It had a cap — 200 ids — and a
 * rule that the bar may not be dismissed AT ALL while the cap is reached, so
 * that one tap could never hide rows nobody had seen.
 *
 * MEASURED ON HIS ACCOUNT, 13.11.2026: 347 rows in `needs_attention`, growing
 * by about four a day. Over the cap — so the safety rule had been holding the
 * bar open, un-dismissable, at 347, which is precisely the un-answerable
 * warning described above. He said what to do about it in the same breath as
 * the card: "מה שלא הצליח לפרסם לא להתעסב".
 *
 * So the watermark: ONE instant, "I have been told about everything that was
 * waiting as of here". Rows that arrive afterwards are newer than it and raise
 * the bar again with their own count — the half of the old mechanism that was
 * load-bearing — and it works at any number of rows, for ever, in one string.
 *
 * WHAT IT GIVES UP, SAID PLAINLY: the bar can now be answered while the list
 * it opens is longer than one screen, so "dismissed" means "I know about
 * these", not "I have read each one". That is the owner's own instruction, and
 * nothing is hidden by it that is not still in the queue, on the history
 * screen, and under the queue tile's own "N דורשים אתכם". NOTHING IS DELETED
 * AND NO ROW CHANGES STATUS — a row waiting on a person stays exactly where it
 * is, which is what keeps its (post, group) pair out of every future round.
 *
 * THE INSTANT IS THE DATABASE'S, NOT THE BROWSER'S. The caller stores the
 * `updated_at` of the newest row that was counted, so a PC with a fast clock
 * cannot dismiss rows that have not arrived yet.
 *
 * Per device, in localStorage, like the bell's unread marker beside it: this
 * is a convenience about one person's attention, not a fact about the
 * business, and it has no business in the database. If storage is blocked the
 * functions below degrade to "nothing has been seen" — the bar simply keeps
 * showing, which is exactly the behaviour it had before this file existed.
 */
const KEY = 'social:waiting:seen-until';

/**
 * The watermark, or null when nothing has been dismissed on this device.
 *
 * Anything at all can be under a localStorage key — an older shape of this
 * feature (this key held an ARRAY of ids until 13.11.2026), another tab
 * mid-write, a person with the console open. A stored value is never trusted
 * to be what it was written as, and anything that is not a usable instant
 * reads as "nothing dismissed", which is the safe direction.
 */
export function readSeenUntil(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'string') return null;
    return Number.isFinite(Date.parse(parsed)) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Stores the watermark — and never moves it backwards.
 *
 * Two tabs open on the dashboard poll independently, and the older one's
 * "newest waiting row" can be a minute behind the other's. A plain write would
 * let that tab un-dismiss what the first one answered.
 */
export function writeSeenUntil(at: string): void {
  try {
    if (!Number.isFinite(Date.parse(at))) return;
    const now = readSeenUntil();
    if (now && now >= at) return;
    localStorage.setItem(KEY, JSON.stringify(at));
  } catch {
    /* Private mode, a full quota, storage switched off. The bar keeps
       showing, which is the safe direction for a thing nobody has answered. */
  }
}
