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

/*
 * ─── AND THE WORDS FACEBOOK USES WHEN IT IS BLOCKING US ───────────────────
 *
 * UNTESTED UNTIL NOW, WHICH IS HOW IT WAS DELETED. A tightening of this
 * pattern dropped "you're temporarily blocked" on the grounds that
 * `patterns.checkpoint` already carries it. It does — but the composer never
 * asks classifyPage in the branch that raises the brake, so the signal did
 * not move to another handler: it vanished. The row then fell to the generic
 * timeout, which parks ONE row and returns without setting state.attention,
 * so the gate stays open and the queue keeps running into the block. That is
 * the 03/11 failure, reintroduced by a cleanup, and the suite stayed green
 * through it because nothing here named these words.
 *
 * join.ts:81 calls them "Facebook's own words when it is us it is refusing…
 * Any of them stops the run."
 */
for (const blocked of [
  "You're temporarily blocked from posting",
  'חסימה זמנית מפרסום בקבוצות',
  'Вы временно заблокированы',
]) {
  is(patterns.rateLimited.test(blocked), `Facebook blocking the account stops the run too: ${blocked.slice(0, 30)}…`);
}

/* But only the words this file is sure of. join.ts also lists "מוגבל" and
   "יותר מדי" — ordinary Hebrew, and carrying them here would put the brake
   back on the hair trigger it has just come off. */
for (const ordinary of ['המקום מוגבל ל-20 משתתפים', 'יותר מדי אנשים נרשמו לאירוע']) {
  is(!patterns.rateLimited.test(ordinary), `and ordinary Hebrew is not a block: ${ordinary.slice(0, 26)}…`);
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
/*
 * ─── RE-POINTED, AND THE REQUIREMENT IS STRONGER THAN IT WAS ──────────────
 *
 * This used to demand `afterSubmit` be the literal `false`, on the reasoning
 * that Facebook had said in writing it did not take the post. That reasoning
 * is only as sound as the detection, and on 05/11 the detection was wrong —
 * which turned "safe to retry" into a route to publishing a post that was
 * already live a second time. Every guard against that reads
 * MAYBE_LIVE_STEP, and this was the one branch that never set it.
 *
 * So the flag must now be DERIVED from the one thing that tells a refusal
 * from a false alarm: our own text still sitting in the dialog.
 */
is(!/,\s*false,\s*\)/.test(branch), 'afterSubmit is a constant again — then a false positive can republish a post that is already up');
is(/!refused/.test(branch), 'it is derived from whether the draft is still in the box');
is(/tooFast\.draftHeld/.test(branch), 'and that proof comes from the detector, which reads it off the dialog');
is(/לא עלה לקבוצה/.test(branch), 'when the draft IS held the message still says plainly that the post did not go up');
is(
  /אי אפשר לדעת אם הפוסט עלה/.test(branch),
  'and when it is not, the message says so instead of promising something nobody checked',
);

// ───────────── 3. The worker stops everything and says so at the top ───────
const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
const start = worker.indexOf("err.kind === 'rate_limited'");
is(start > 0, 'the worker has a branch for it');
const stop = worker.slice(start, worker.indexOf("err.kind === 'cannot_post'", start));
is(stop.length > 200, 'found the branch body');

/*
 * RE-POINTED, NOT WEAKENED. The claim is unchanged — the banner by his name
 * is still raised, and it is still what stops the next tick. Two things about
 * it moved, and both are asserted here rather than dropped:
 *
 *   it is now a TEMPLATE, because the sentence carries the hour the freeze
 *   ends at ("ויחזור אוטומטית ב-18:47"), which a fixed string cannot;
 *
 *   and it is raised only on a sighting that survived a second read. A
 *   three-hour freeze of the whole account may not be earned by one glance —
 *   see worker/test/rate-freeze.test.ts, which owns that rule.
 */
is(/state\.attention\s*=\s*`/.test(stop), 'it raises attention — which is what stops the next tick AND lights the banner by his name');
is(/if \(confirmed\) \{/.test(stop), 'and only once the notice has been read twice on the page');
is(/state\.freezeHold = true/.test(stop), 'marked as the freeze’s own banner, so the thaw can take down this one and not somebody else’s');
is(/פייסבוק הגביל את קצב הפרסום/.test(stop), 'and the banner says who limited what, in his language');
is(/heartbeat\(state, 'needs_attention'/.test(stop), "it heartbeats 'needs_attention', which is what the header reads");
/*
 * Both fates, and the test that chooses between them. The old pair demanded
 * `failed` and forbade `needs_attention` outright; that is exactly the
 * unconditional claim that made a false positive dangerous.
 */
is(/const maybeLive = err\.afterSubmit \|\| mayAlreadyBePosted/.test(stop), 'the row\'s fate is decided by the proof, not by the detection alone');
is(/status: 'failed'/.test(stop), 'a proven refusal is an honest failure the queue may try again');
is(
  /status: 'needs_attention', step: 'submitted'/.test(stop),
  'and anything unproven is parked as MIGHT ALREADY BE LIVE — step \'submitted\' is what every duplicate guard in the product reads',
);
/* The call is written across several lines now that it carries the
   screenshot and what both reads saw, so the pin spans them. The claim —
   error level, its own event name — is unchanged. */
is(/logActivity\(\s*'error',\s*'rate_limited'/.test(stop), 'and it is filed at error level under its own event');
is(/screenshot: screenshot \?\? null/.test(stop), 'with the picture of the failure attached, so the feed can show it');

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
      (caught?.notice ?? '').includes('מגבילים את התדירות'),
      `and the sentence it matched comes back to be quoted — got "${(caught?.notice ?? '').slice(0, 40)}"`,
    );
    is(
      caught?.draftHeld === true,
      'and the draft is still in the box, which is the proof that Facebook refused the post rather than took it',
    );

    /* ── 2b. THE SAME NOTICE, WITH THE BOX EMPTY. Facebook limited the
           account — but our text is gone, so whether this post went up is
           not something anyone here knows. The row must be parked, not
           handed back to the queue. This is the case that republished a live
           post before the proof existed. */
    composer = await mount(`
      <div id="composer" role="dialog" aria-label="צור פוסט">
        <div contenteditable="true"></div>
        <div>${REAL}</div>
      </div>`);
    const unproven = await facebookSaidTooFast(page, composer, DRAFT);
    is(unproven !== null, 'the notice is still read when the box is empty');
    is(
      unproven?.draftHeld === false,
      'but nothing proves Facebook refused this post, so the row may not be marked retryable',
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
