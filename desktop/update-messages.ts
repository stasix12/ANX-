/*
 * What a person is told when the updater fails, kept apart from the updater.
 *
 * This file imports nothing. That is its entire reason for existing: the
 * module that uses it imports electron, which means it can only run inside a
 * real Electron process, which means the mapping below could only ever be
 * tested by launching one — and the bug it now guards against was found on
 * the second-to-last attempt, by accident.
 *
 * worker/test/updates.test.ts is plain Node and exercises every branch.
 */
/* electron-updater's own errors are written for a developer. These are the
   four a person actually hits, in the language they read. */
export function readable(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  /* Checked before the network family, because a 404 can arrive wrapped in a
     net:: error and "אין חיבור" would be the wrong thing to tell somebody
     whose connection is fine. */
  if (/\b404\b/.test(raw)) return 'עוד לא פורסמה גרסה להורדה. הכל תקין — פשוט אין מה לעדכן.';
  /*
   * TWO FAMILIES, and the first attempt here only had one.
   *
   * Node reports ECONNREFUSED. Electron's network stack is Chromium's, and it
   * reports net::ERR_CONNECTION_REFUSED — a different string that the node
   * pattern does not match. The result was a machine with no internet being
   * told "לא הצלחנו לבדוק עדכונים (net::ERR_CONNECTION_REFUSED)", which is
   * both frightening and useless, and it took running the real module against
   * a dead port to find out. Both families are matched now.
   */
  if (/net::ERR_|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|ECONNREFUSED|ECONNRESET/i.test(raw)) {
    return 'אין חיבור לאינטרנט כרגע. נבדוק שוב מאוחר יותר.';
  }
  if (/dev-app-update|not packed|app-update\.yml/i.test(raw)) {
    return 'הגרסה הזו הורצה מתוך הקוד ולא מהתקנה, ולכן אין לה מאיפה להתעדכן.';
  }
  return `לא הצלחנו לבדוק עדכונים (${raw}).`;
}
