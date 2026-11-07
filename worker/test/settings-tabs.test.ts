/*
 * TWO SETTINGS PAGES DELETED, AND THE CONTROLS THAT WERE ON THEM KEPT.
 *
 * "תמחק את שתי העמודים האלה זה מבלבל את הלקוחות" — the tabs "פרסום בקבוצות"
 * and "פרטי העסק". The first was mostly a notice about Meta having no API,
 * about the terms of use and about CAPTCHA; the second, defaults that go into
 * a post. Neither is something a customer opens settings to do.
 *
 * But the first tab was not only that notice. It also carried the
 * BrowserStatusCard — the ONLY place in the product with "התחבר לפייסבוק",
 * "בדוק שוב" and "המשך סבב", the last of which is what clears a Facebook
 * rate-limit stop — plus the safety switches and the group pacing. Deleting
 * the page without those would have taken the owner's way out of a block away
 * on the evening he first needed it.
 *
 * So this file pins the deletion AND the rescue: the tabs are gone, the
 * connection is reachable from the header on every screen, the four links
 * that pointed at the old tab point at the panel, and the two cards that did
 * real work moved into the page that is actually about rate and limits.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.equal(a, b, msg); };

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const settings = read('src/app/social/settings/page.tsx');
const shell = read('src/components/social/SocialShell.tsx');
const dash = read('src/app/social/page.tsx');
const checklist = read('src/components/social/SetupChecklist.tsx');

// ───────────────── 1. The two pages are gone ───────────────────────────────
is(!settings.includes("tab === 'browser'"), 'the "פרסום בקבוצות" tab no longer exists');
is(!settings.includes("tab === 'business'"), 'the "פרטי העסק" tab no longer exists');
is(!/label: 'פרסום בקבוצות'/.test(settings), 'and it is not offered in the tab bar');
is(!/label: 'פרטי העסק'/.test(settings), 'nor is the other');
is(!settings.includes('איך זה עובד'), 'the Meta / terms-of-use / CAPTCHA notice is gone with it — that was the confusing part');
is(/type Tab = 'limits' \| 'admin';/.test(settings), 'and the type says so, so a stale branch cannot hide');

/* A customer must not be shown a segmented control with one option in it. */
is(/\{isAdmin && \(\s*<SegmentedControl/.test(settings), 'the tab bar shows only for an admin, who still has two');

// ───────────────── 2. The controls that did real work survived ─────────────
/*
 * "כל מה שקשור לבטיחות הרצה גם תמחק והחלון דפדפן שיהיה תמיד סגור כברירת מחדל
 *  לא צריך שזה יפתח לי חלונות במחשב וגם לא ללקוחות"
 *
 * So the safety card went too — and DELETING THE SWITCHES IS NOT TURNING THEM
 * OFF. Their values live in a saved row, every machine that has run this
 * product has `debugMode: true` in it, and a customer whose row also says
 * requireConfirmation would have waited for an approval with no switch left
 * to give it. Both halves are pinned: gone from the screen, forced in the
 * worker.
 */
is(!settings.includes('<Card title="בטיחות הריצה">'), 'the safety card is gone from the screen');
for (const key of ['testMode', 'requireConfirmation', 'debugMode']) {
  is(!new RegExp(`browser\\.${key}`).test(settings), `${key} is no longer editable anywhere in settings`);
}
/*
 * ───── AND THEN THE PACING CARD WENT TOO — 07.11.2026 ─────────────────
 *
 * "תמחק גם את האופציות האלה, סתם מיותר ומבלבל לקוחות."
 *
 * The line above read "but the group pacing, which does real work, stayed",
 * and it was true when it was written: the card had just been rescued from a
 * page that was deleted around it. The owner has now asked for the card
 * itself, with the trade put to him in writing first and confirmed.
 *
 * At his numbers none of the three bound anything: one browser window is what
 * the field's own hint recommended, a 1,000-a-day ceiling over a 231-a-day
 * round never fires, and an extra gap of zero adds zero.
 *
 * SO THE PIN MOVES TO WHAT IT WAS ALWAYS PROTECTING — not "the control is on
 * the screen" but "deleting the control did not change what publishes".
 * Exactly the shape the safety card's own pins above already take: gone from
 * the screen, still in force underneath.
 */
is(!settings.includes('<Card title="קצב הקבוצות">'), 'the pacing card is gone from the screen too');
/*
 * "no longer editable" is pinned on the BINDING, not on the key appearing
 * anywhere in the file: the page's own comment records the six removed values
 * by name on purpose, so that the next person to read it knows what the engine
 * still reads. A pin that forbade the name would have forbidden the
 * explanation. `value={browser.X}` is what an input is.
 */
for (const key of ['concurrentJobs', 'maxPerCampaignPerDay', 'groupMinGapMinutes']) {
  is(!settings.includes(`value={browser.${key}}`), `${key} has no input bound to it any more`);
  is(!settings.includes(`setBrowser({ ...browser, ${key}:`), `and nothing writes ${key} from this screen`);
}
/*
 * BUT THE SAVE STILL CARRIES THEM. The screen loads `browser` whole and
 * writes it whole, so a field with no input keeps the number already stored
 * — a save made from this screen must not quietly reset a customer's pacing
 * to the shipped defaults. groupMinGapMinutes is still read here for exactly
 * that reason, and the seconds column is still derived from it.
 */
is(/groupMinGapSeconds: keepOrDerive\(browser\.groupMinGapMinutes, curBrowser\.groupMinGapSeconds\)/.test(settings),
  'and a save still carries the stored pacing through untouched, so removing the inputs cannot reset it');

const worker = read('worker/social-worker.ts');
const types = read('src/lib/social/types.ts');
is(/async function browserSettings\(\)/.test(worker), 'the worker reads browser settings through one normaliser');
eq((worker.match(/getSetting<BrowserSettings>/g) ?? []).length, 1, 'and only the normaliser reads them raw — no second, unforced path');
is(/testMode: false, requireConfirmation: false/.test(worker), 'test mode and per-post confirmation are forced off whatever the saved row says');
is(/debugMode: env\.forceHeaded/.test(worker), 'and the browser window stays shut unless a developer sets SOCIAL_BROWSER_HEADED=1');
is(/debugMode: false,/.test(types) && /testMode: false,/.test(types) && /requireConfirmation: false,/.test(types),
  'the shipped defaults agree, so a brand-new machine never opens a window either');
/* Signing in must still show a window, or nobody can ever connect Facebook. */
const session = read('worker/facebook/session.ts');
is(/newPage\(false, 'התחברות ידנית'\)/.test(session), 'the login window is still visible — it opens regardless of debugMode');
/* They must be INSIDE the one remaining customer tab, not orphaned. */
const limitsAt = settings.indexOf("{tab === 'limits' && (");
const adminAt = settings.indexOf("{tab === 'admin'");
is(limitsAt > 0 && adminAt > limitsAt, 'found both blocks');
/*
 * THE ONE THING KEPT OUT OF THE SIX, and it is not a control: the Meta hold.
 * It renders only while Facebook is actually holding the account, and its
 * "נקה" is the only manual way out — the dashboard reports the hold but
 * offers no clear. Removing it would have left a state the system can enter
 * by itself with no way back.
 */
is(/\{control\.rateLimitedUntil && \(/.test(settings), 'the Meta hold still has a way out, and only shows while there is one');
is(/onClick=\{clearRateLimit\}/.test(settings), 'with the button that clears it');

// ───────────────── 3. The connection is still reachable ────────────────────
/*
 * THE LOAD-BEARING ONE. BrowserStatusCard is the only source of
 * "המשך סבב" — the button that clears a Facebook rate-limit stop. If the
 * header panel ever loses it, nothing else in the product has it.
 */
is(shell.includes('<BrowserStatusCard'), 'the header panel still mounts the connection card — the only "המשך סבב" in the product');
is(shell.includes("id=\"pc-panel\""), 'the panel is still there to be opened');
is(/window\.location\.hash !== '#pc'/.test(shell), 'and #pc opens it from anywhere');
is(/addEventListener\('hashchange'/.test(shell), 'including from a link on the page already showing');
is(/replaceState/.test(shell), 'the hash is cleared as it is read, so a refresh does not reopen it over something else');

// ───────────────── 4. Nothing still points at the deleted tab ──────────────
for (const [name, src] of [['settings', settings], ['dashboard', dash], ['checklist', checklist], ['shell', shell]] as const) {
  is(!src.includes('/social/settings#browser-status'), `${name} no longer links at a tab that does not exist`);
}
eq((dash.match(/'\/social#pc'/g) ?? []).length, 3, "the dashboard's three intervention cards open the panel instead");
eq((checklist.match(/'\/social#pc'/g) ?? []).length, 1, 'and so does the setup checklist');

console.log(`settings tabs OK — ${checks} checks`);
