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
import { noticeIn, withoutLines, facebookSaidTooFast } from '../facebook/rateLimit';
import { chromium } from 'playwright-core';

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
/*
 * ─── THE 05/11 FALSE POSITIVE, ONE STRING PER WAY IT FIRED ────────────────
 *
 * "פייסבוק לא הגביל אותי, זה טעות של הרובוט בדקתי ידנית במחשב נותן לפרסם."
 *
 * The brake halted every publication in the account while publishing to
 * "באר שבע ביחד עכשיו". The owner posted to that same group by hand, from
 * the same profile, minutes later. Six of the nine alternatives in the first
 * version of the pattern were fragments an ordinary group page carries all
 * day; these are the ones that were caught firing, each kept as its own case
 * so a future widening cannot bring one back quietly.
 */
for (const innocent of [
  'ניקוי ספות וריפודים בבאר שבע — מקצועי, מהיר ובאחריות. 053-5257250',
  'דירה 3 חדרים להשכרה בערד, משופצת, כניסה מיידית',
  'משהו השתבש, נסו שוב',
  /* The group's own rules. Israeli admins write exactly this. */
  'הקבוצה מוגנת מפני ספאם — פוסט אחד ליממה',
  'אין ספאם, אין קללות, אין פוליטיקה',
  /* Facebook's GENERIC closer. postFailed owns it; carrying it here turned
     one retryable row into a halt — and only for a Hebrew or Russian UI. */
  'משהו השתבש. אפשר לנסות שוב מאוחר יותר.',
  'Что-то пошло не так. Попробуйте позже.',
  /* An ordinary Russian comment, in a city with a large Russian-speaking
     membership. Two of the nine alternatives were this short. */
  'Группа защищена от спама, пишите в личку',
  /* A rental ad that happens to end the way Facebook ends its errors. */
  'להשכרה בשכונה ג׳, אפשר לנסות שוב מאוחר יותר אם לא עניתי',
  /* And the worker's own draft, which is the self-reinforcing one: the
     composer still holds it when this check runs, so a post about spam
     protection halted everything and halted it again on every retry. */
  'מציעים שירות הגנה מפני ספאם לעסקים — התקשרו עכשיו',
]) {
  is(!patterns.rateLimited.test(innocent), `an ordinary page does not trip the brake: ${innocent.slice(0, 24)}…`);
}

// ───────────── 2. The composer asks BEFORE it guesses ──────────────────────
const composer = readFileSync(new URL('../facebook/composer.ts', import.meta.url), 'utf8');
const atRate = composer.indexOf('if (tooFast) {');
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

/* ══════════════════════════════════════════════════════════════════════════
   3. THE SCOPE, MEASURED IN A REAL BROWSER.

   Wording is half the fix. The other half is WHERE the words are read, and
   no amount of tightening covers it: a group admin may paste Facebook's own
   sentence into the rules, and a moderation note legitimately says "הוסר כדי
   להגן על הקהילה מפני ספאם". The old check read the whole document, so each
   of those halted the business; it also read the worker's own draft, which
   made the halt survive every "המשך סבב".

   These cases are the DOM as it stands at the moment of the decision: the
   Post button clicked, the composer still open, the draft still in it. Each
   one is a page that fired the old check.
   ══════════════════════════════════════════════════════════════════════════ */
async function browserPass(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage();
    const DRAFT = 'מציעים שירות הגנה מפני ספאם לעסקים — התקשרו עכשיו';

    /* The group behind the modal, exactly as "באר שבע ביחד עכשיו" renders:
       rules quoting Facebook, a moderation note, a Russian comment. */
    const FEED = `
      <div id="feed">
        <div>חוקי הקבוצה: אנו מגבילים את התדירות שבה אפשר לפרסם כדי לסייע בהגנה על הקהילה מפני ספאם.</div>
        <div>הפוסט הוסר על ידי מנהל כדי להגן על הקהילה מפני ספאם</div>
        <div>Группа защищена от спама, пишите в личку</div>
        <div style="display:none">כללים נוספים — אנו מגבילים את התדירות שבה אפשר לפרסם</div>
      </div>`;

    const mount = async (html: string) => {
      await page.setContent(`<!doctype html><html lang="he" dir="rtl"><body>${html}</body></html>`);
      return page.$('#composer');
    };

    /* ── 1. THE INCIDENT. Everything matching is in the group's own content;
           the composer holds only our draft. The answer must be silence. */
    let composer = await mount(`${FEED}
      <div id="composer" role="dialog" aria-label="צור פוסט">
        <div contenteditable="true">${DRAFT}</div>
        <button>פרסום</button>
      </div>`);
    is(
      (await facebookSaidTooFast(page, composer, DRAFT)) === null,
      'THE 05/11 INCIDENT: a group whose rules, moderation note and comments all match must not halt the account',
    );

    /* ── 2. AND IT STILL CATCHES THE REAL THING, in the composer where the
           owner's own screenshot put it. */
    composer = await mount(`${FEED}
      <div id="composer" role="dialog" aria-label="צור פוסט">
        <div contenteditable="true">${DRAFT}</div>
        <div>${REAL}</div>
      </div>`);
    const caught = await facebookSaidTooFast(page, composer, DRAFT);
    is(caught !== null, "Facebook's own notice, in the dialog the post was submitted in, still stops everything");
    is(
      (caught ?? '').includes('מגבילים את התדירות'),
      `and the sentence it matched comes back to be quoted — got "${(caught ?? '').slice(0, 40)}"`,
    );

    /* ── 3. OUR OWN WORDS ARE NEVER FACEBOOK SPEAKING. A post about spam
           protection used to halt the queue and halt it again on every retry. */
    composer = await mount(`
      <div id="composer" role="dialog" aria-label="צור פוסט">
        <div contenteditable="true">${REAL}</div>
      </div>`);
    is(
      (await facebookSaidTooFast(page, composer, REAL)) === null,
      'the draft this product typed is subtracted — a post quoting the notice must not brake on itself',
    );

    /* ── 4. THE MISS DIRECTION, which is the same root cause. A hidden match
           earlier in the DOM used to win .first() and answer "not visible",
           hiding a notice that was on screen. */
    composer = await mount(`
      <div style="display:none">אנו מגבילים את התדירות שבה אפשר לפרסם</div>
      <div id="composer" role="dialog" aria-label="צור פוסט">
        <div contenteditable="true">${DRAFT}</div>
      </div>
      <div role="alert">${REAL}</div>`);
    is(
      (await facebookSaidTooFast(page, composer, DRAFT)) !== null,
      'a hidden earlier match may NOT hide a real notice that is on screen — that is the direction that let the account get limited',
    );

    /* ── 5. A MESSENGER POP-OUT IS NOT THE COMPOSER. It is a dialog and it
           does contain a textbox, which is why the composer pins its own node
           before the click rather than trusting a selector. */
    composer = await mount(`
      <div id="composer" role="dialog" aria-label="צור פוסט">
        <div contenteditable="true">${DRAFT}</div>
      </div>
      <div role="dialog" aria-label="צ׳אט">
        <div contenteditable="true"></div>
        <div>${REAL}</div>
      </div>`);
    is(
      (await facebookSaidTooFast(page, composer, DRAFT)) === null,
      'a message someone sent in a chat window is not Facebook limiting the account',
    );

    await page.close();
  } finally {
    await browser.close();
  }
}

/* ── and the two pure helpers, which the cases above exercise through the DOM
      but which are worth pinning on their own. */
is(withoutLines('א\nב\nג', 'ב') === 'א\nג', 'withoutLines strikes a line out whole');
is(withoutLines('  א  \n ב ', 'א') === 'ב', 'and compares trimmed, because a contenteditable re-wraps what it is given');
is(noticeIn(`שלום\n${REAL}\nעוד`) !== null, 'noticeIn finds the notice on its own line');
is(noticeIn('מגבילים\nאת התדירות') === null, 'and will not assemble one from two separate lines');

browserPass()
  .then(() => {
    console.log(`rate-limited OK — ${checks} checks`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
