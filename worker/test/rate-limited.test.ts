/*
 * "פייסבוק הגביל את הפרסום שלי" — THE SENTENCE THE PRODUCT COULD NOT READ.
 *
 * 03/11. The owner's round produced failure after failure, every one of them
 * 'חלון הפוסט לא נסגר אחרי הלחיצה על "פרסום"' — which sends him to check a
 * group for a post that is not there. The screenshot the worker itself saved
 * at the `verifying` step showed what was actually on his screen: the
 * composer still open, his text still in it, and underneath, from Facebook:
 *
 *   "אנו מגבילים את התדירות שבה אפשר לפרסם, להגיב או לעשות דברים אחרים
 *    בפרק זמן נתון כדי לסייע בהגנה על הקהילה מפני ספאם. אפשר לנסות שוב
 *    מאוחר יותר."
 *
 * Nothing in the selector catalogue matched it. patterns.postFailed carries
 * "נסו שוב מאוחר יותר"; Facebook writes "אפשר לנסות שוב מאוחר יותר". One
 * word, and an explicit account-level block became a generic timeout — while
 * every pacing rule in the product, measured from the last SUCCESS, quietly
 * stopped applying, so the queue ran at full speed into a wall for hours.
 *
 * "ברגע שיש דבר כזה לשלוח התראה חמורה למעלה ליד התמונה של השם משתמש שלי
 *  ולרשום שפייסבוק הגבילה את הפרסום שלי ! ולעצור הכל מיד"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { patterns } from '../facebook/selectors';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };

/* Verbatim from the owner's screenshot, 03/11 19:08. */
const REAL = 'אנו מגבילים את התדירות שבה אפשר לפרסם, להגיב או לעשות דברים אחרים בפרק זמן נתון כדי לסייע בהגנה על הקהילה מפני ספאם. אפשר לנסות שוב מאוחר יותר. מידע נוסף';

// ───────────── 1. The sentence itself, and the near-miss that hid it ───────
is(patterns.rateLimited.test(REAL), "Facebook's own Hebrew rate-limit notice is recognised, verbatim as photographed");
is(
  !patterns.postFailed.test(REAL),
  'and the catalogue that was SUPPOSED to catch it still does not — "נסו שוב" is not "אפשר לנסות שוב", which is exactly how this hid for a day',
);

for (const other of [
  'We limit how often you can post, comment or do other things in a given amount of time in order to protect our community from spam. You can try again later.',
  'Мы ограничиваем частоту публикаций, чтобы защитить сообщество от спама. Попробуйте снова позже.',
]) {
  is(patterns.rateLimited.test(other), `the same notice in another language is recognised: ${other.slice(0, 28)}…`);
}

/* It must not fire on an ordinary post, or every publication becomes a halt. */
for (const innocent of [
  'ניקוי ספות וריפודים בבאר שבע — מקצועי, מהיר ובאחריות. 053-5257250',
  'דירה 3 חדרים להשכרה בערד, משופצת, כניסה מיידית',
  'משהו השתבש, נסו שוב',
]) {
  is(!patterns.rateLimited.test(innocent), `an ordinary page does not trip the brake: ${innocent.slice(0, 24)}…`);
}

// ───────────── 2. The composer asks BEFORE it guesses ──────────────────────
const composer = readFileSync(new URL('../facebook/composer.ts', import.meta.url), 'utf8');
const atRate = composer.indexOf('rateLimitText(page)');
const atBanner = composer.indexOf('failureText(page).isVisible({ timeout: 1000 })');
/* The THROW, not the first mention: the same sentence appears earlier in a
   comment, and matching that would have compared the wrong two positions. */
const atTimeout = composer.indexOf("new PublishError('timeout', 'חלון הפוסט לא נסגר");
is(atRate > 0, 'the composer looks for the rate-limit notice');
is(atRate < atBanner, 'before the generic failure banner');
is(atRate < atTimeout, 'and before the timeout sentence that used to swallow it');

const branch = composer.slice(atRate, atTimeout);
is(/'rate_limited'/.test(branch), 'it throws its own kind, not a generic one');
is(
  /,\s*false,\s*\)/.test(branch),
  'with afterSubmit FALSE — Facebook said in writing it did not take the post, so this is not a "might be live, go and look" row',
);
is(/לא עלה לקבוצה/.test(branch), 'and the message says plainly that the post did not go up');

// ───────────── 3. The worker stops everything and says so at the top ───────
const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
const start = worker.indexOf("err.kind === 'rate_limited'");
is(start > 0, 'the worker has a branch for it');
const stop = worker.slice(start, worker.indexOf("err.kind === 'cannot_post'", start));
is(stop.length > 200, 'found the branch body');

is(/state\.attention\s*=\s*'/.test(stop), 'it raises attention — which is what stops the next tick AND lights the banner by his name');
is(/פייסבוק הגביל את קצב הפרסום/.test(stop), 'and the banner says who limited what, in his language');
is(/heartbeat\(state, 'needs_attention'/.test(stop), "it heartbeats 'needs_attention', which is what the header reads");
is(/status: 'failed'/.test(stop), 'the row is an honest failure, not a publication to go and check');
is(!/status: 'needs_attention'/.test(stop), 'and is NOT parked for a manual group check — there is nothing in the group to check');
is(/logActivity\('error', 'rate_limited'/.test(stop), 'and it is filed at error level under its own event');

/*
 * ORDER IS THE WHOLE THING. `mayAlreadyBePosted` is true here — the step is
 * 'verifying' — so without this branch sitting ABOVE the generic parking, a
 * rate limit is swallowed into "the window did not close" all over again.
 */
const atAfterSubmit = worker.indexOf('const afterSubmit =');
is(atAfterSubmit > start, 'the brake is tested BEFORE the generic "might already be live" parking, or it never runs');

console.log(`rate-limited OK — ${checks} checks`);
