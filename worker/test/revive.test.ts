/*
 * ─────────────────────────────────────────────────────────────────────────────
 * A FAILED PUBLICATION IS SKIPPED. IT DOES NOT GO BACK IN THE QUEUE.
 *
 * "פרסום שנכשל לדלג ולא להחזיר לתור" — 08.11.2026.
 *
 * This file used to test the opposite. A round that had finished every group
 * handed its failures back to the end of the queue for one more attempt
 * (worker/revive.ts, pickRevivable, reviveFailedRows). That was the owner's
 * own earlier instruction — "להחזיר אותם לתור אחרי שפרסם את כל הקבוצות בסבב
 * ולנסות שוב" — and it is now withdrawn, so the mechanism is DELETED rather
 * than switched off.
 *
 * WHAT IT COST AND WHAT IT BOUGHT, measured on this account's own history on
 * 08.11.2026 before removing it: 711 rows were tried a second time. 381 of
 * them published and 330 did not — a 53.6% success rate, so this was not dead
 * weight and the owner is giving something up. Of the 330 that still failed,
 * 239 were "לא מצאתי את תיבת כתבו משהו" — groups the account has no permission
 * to post in, which a second attempt can never fix.
 *
 * WHY THE WHOLE MECHANISM AND NOT A FLAG: a second pass that still existed
 * behind a setting would keep its reads, its two-minute timer, its ceiling and
 * its interaction with stopped runs — and every one of those was a bug at
 * least once (see the history in stopped-run.test.ts). A rule nobody runs is a
 * rule nobody maintains.
 *
 * THIS FILE IS NOW THE GUARD OVER ITS ABSENCE. A failed row stays failed. The
 * owner can still retry one by hand from the activity sheet; nothing retries
 * on its own.
 *
 *   npx tsx worker/test/revive.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

const here = new URL('.', import.meta.url);
const src = (rel: string) => readFileSync(new URL(rel, here), 'utf8');
/* Comments stripped: this repository explains at length what it no longer
   does, and a guard that matches its own prose guards nothing. */
const codeOnly = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');

/* ─────────────── 1. the module is gone, not orphaned ─────────────── */

ok(!existsSync(new URL('../revive.ts', here)), 'worker/revive.ts no longer exists');

/* ─────────────── 2. nothing imports or calls it ─────────────── */

const worker = codeOnly(src('../social-worker.ts'));
for (const gone of ['pickRevivable', 'reviveFailedRows', 'REVIVE_ATTEMPT_CEILING', 'REVIVE_WINDOW_MS', 'REVIVE_EVERY_MS', 'lastReviveAt']) {
  ok(!worker.includes(gone), `the worker carries no ${gone} — a half-removed mechanism is worse than either whole state`);
}
ok(!/from '\.\/revive'/.test(worker), 'and imports nothing from it');

/* ─────────────── 3. the sentence the owner saw is gone ─────────────── */

/*
 * "9 פרסומים שנכשלו הוחזרו לסוף התור — הסבב סיים את כל הקבוצות שלו, וננסה
 *  אותם עוד פעם אחת." — his dashboard, 08.11.2026 20:51. The line is what he
 * pointed at, so it is pinned by its own words: a mechanism can come back by
 * accident, but not silently.
 */
const workerRaw = src('../social-worker.ts');
ok(!workerRaw.includes('הוחזרו לסוף התור'), 'nothing announces that failures went back to the end of the queue');
ok(!workerRaw.includes('וננסה אותם עוד פעם אחת'), 'and nothing promises another attempt');

/* ─────────────── 4. a failed row is still FINISHED on the spot ─────────────── */

/*
 * The half that is NOT being removed, and the reason the removal is safe: a
 * failure has always ended the row immediately and freed the group the same
 * second. That is what stopped one bad group costing a round half an hour, and
 * it is untouched — what is gone is only the second pass that came later.
 */
ok(/status: 'failed', step: 'failed'/.test(worker), 'a failed publication is still written as failed, in the same tick');

/* ─────────────── 5. a human retry is still possible ─────────────── */

/*
 * "לדלג" is about the MACHINE. The owner pressing "נסה שוב" on a row in the
 * activity feed is his decision about one publication, and removing that would
 * be removing a control he uses, not a loop he asked to stop.
 */
const sheet = src('../../src/components/social/ActivityDetailSheet.tsx');
ok(/retryQueueItem\(queueId\)/.test(sheet), 'the manual "נסה שוב" button still exists — the loop is gone, the choice is not');

console.log(`✓ revive: ${checks} בדיקות עברו (המנגנון הוסר, וזו השמירה על כך)`);
