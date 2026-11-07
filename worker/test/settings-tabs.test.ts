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
/*
 * THE SAME STRIPPER admin-panel.test.ts uses, and it is here to settle an
 * argument this file lost three times in one day.
 *
 * Several pins below had to forbid a NAME — "nothing writes concurrentJobs"
 * — and the page's own comment names all six removed fields on purpose, so
 * every such pin either matched the explanation (and could never fail) or had
 * to be narrowed to one exact spelling of the JSX (and could be defeated by
 * `?? 1`, by `String(...)`, or by prettier moving the prop to its own line).
 * A reviewer put the three deleted inputs back in fully working form, in the
 * card that still exists, and the whole suite stayed green.
 *
 * With comments removed there is no conflict: forbid the name in the CODE and
 * let the prose say whatever it needs to.
 */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const settings = read('src/app/social/settings/page.tsx');
const code = stripComments(settings);
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
for (const key of ['concurrentJobs', 'maxPerCampaignPerDay']) {
  is(!code.includes(key), `${key} appears nowhere in the screen's CODE — no input, no writer, under any spelling`);
}
/* groupMinGapMinutes is the exception, and it is read-only: the sub-minute
   notice still prints the real floor with it. So it may be READ and must not
   be WRITTEN or bound to an input. */
/*
 * RE-POINTED 07.11.2026 — ONE OCCURRENCE NOW, AND THAT IS THE POINT.
 *
 * It was two: the notice only appeared while the stored seconds disagreed with
 * the whole minutes the deleted box could show, so one call decided whether to
 * draw it and the other printed the figure. "יש להסיר לחלוטין מהממשק את השדה
 * הישן: הפרש בין פרסומים" took the box, and with no box to contradict there is
 * nothing to condition on: the line is unconditional and states the enforced
 * gap as a fact, naming מצב פרסום חכם as the place it is changed.
 *
 * The rule this protected — the screen prints what the ENGINE enforces, not
 * what a column happens to hold — is unchanged and is pinned harder below: the
 * figure must come from accountGapSeconds (base + group surcharge), never from
 * either half on its own.
 */
eq((code.match(/accountGapSeconds\(limits, browser, true\)/g) ?? []).length, 1,
  'the screen states the enforced gap exactly once, now that there is no box for it to disagree with');
is(/accountGapLabel\(accountGapSeconds\(limits, browser, true\)\)/.test(code),
  'and it prints the floor the ENGINE enforces — the sum of the two halves, through the one function that adds them');
is(!/limits\.minGapMinutes \+|minGapMinutes \* 60/.test(code),
  'never by adding the minute columns up here, which is how this screen once showed 1 דק׳ over a thirty-second engine');
is(/מצב פרסום חכם/.test(code), 'and it names where that number IS changed, because a figure with no lever beside it is a dead end');
/* `setBrowser(br)` on the mount read is what makes the reading possible and
   must stay. What must not exist is an UPDATE of it — the object form
   `setBrowser({ ...browser, X: ... })` or the functional form
   `setBrowser((b) => ...)`, which is the spelling that defeated the previous
   version of this pin. Both are forbidden; the loader is not. */
is(!/setBrowser\(\s*[{(]/.test(code), 'nothing on the screen UPDATES the browser state — it is loaded once and read, never edited');
is(/setBrowser\(br\)/.test(code), 'while the mount read stays, because the notice below needs the stored numbers');
is(!/value=\{browser\./.test(code), 'and no input is bound to any browser field, under any spelling');
/*
 * ───── AND THE SAVE NO LONGER TOUCHES THE ROW AT ALL ──────────────────
 *
 * THIS PIN USED TO BE WRONG, and the way it was wrong is the lesson.
 *
 * It said "the screen loads `browser` whole and writes it whole, so a field
 * with no input keeps the number already stored", and asserted
 * `groupMinGapSeconds: keepOrDerive(browser.groupMinGapMinutes, ...)`. That
 * line is in the gapFields object, NOT in the write — so the pin was green
 * while the write itself said `{ ...DEFAULT_BROWSER }`. It was tested: the
 * whole suite passed on a save that resets every customer's pacing to the
 * shipped defaults.
 *
 * Worse, the sentence it was defending had stopped being true. `...browser`
 * was safe only while an input wrote that state. With the inputs deleted it
 * is a mount-time snapshot, and spreading it over the freshly re-read row
 * REVERTS anything written there while the screen sat open — a campaign panel
 * set to "30 שניות" came back as 20 minutes on the next שמור. The save's own
 * docblock in the page was written to prevent exactly that, and removing the
 * inputs re-created it underneath the docblock.
 *
 * So the invariant changed from "writes it whole" to "does not write it",
 * which is the one a pin can actually hold: a screen with no input for a row
 * has no business writing that row.
 */
is(!/saveSetting\('browser'/.test(settings),
  'the settings screen does not write the browser row at all — nothing on it edits one field of it');
is(!/saveSetting\('business'/.test(settings),
  'nor the business row, whose tab went the same way');
/* And the one row it does write, it writes BY NAME — one field per box on
   this screen. A spread of the whole form state is what carried the stale
   snapshot, so its absence is the pin. */
is(!/saveSetting\('limits', \{ \.\.\.curLimits, \.\.\.limits/.test(settings),
  'and the limits save no longer spreads the whole form over the stored row');
/*
 * THREE, NOT FOUR, SINCE 07.11.2026. `minGapMinutes` left this list with its
 * box: "יש להסיר לחלוטין מהממשק את השדה הישן: הפרש בין פרסומים… אין ליצור
 * הגדרה כפולה." מצב פרסום חכם writes that pair now, through applyGapFloor().
 *
 * AND ITS REMOVAL FROM THE SAVE IS THE SAME RULE AS ITS REMOVAL FROM THE
 * FORM, not an afterthought: a field with no box is a mount-time snapshot,
 * and writing one back over a fresh re-read reverts whatever another screen
 * changed while this one sat open. That is the defect this whole block exists
 * for, and leaving `minGapMinutes` in the save would have re-created it on
 * the one number that paces the account. The two keys it governs are pinned
 * as ABSENT from the save below.
 */
for (const key of ['maxPerDay', 'maxPerTargetPerDay', 'dedupeDays']) {
  is(new RegExp(`${key}: limits\\.${key},`).test(settings), `${key} is still saved, by name`);
}
/* Every key whose input was deleted must NOT be named in the save — if it
   were, the screen would be writing a value nobody can see or change. */
for (const key of ['blockRepeatToSameTarget', 'repeatFloorHours', 'minGapMinutes', 'minGapSeconds']) {
  is(!new RegExp(`${key}: `).test(settings.slice(settings.indexOf("await saveSetting('limits'"), settings.indexOf("toast('ההגדרות נשמרו.')"))),
    `${key} is not written from this screen either`);
}
/*
 * ─── AND THE RATCHET THE SECONDS HALF EXISTED TO STOP, STOPPED STRUCTURALLY ─
 *
 * `keepOrDerive` was the guard: the gap box held whole minutes, the engine
 * prefers the `*Seconds` half, and a save that recomputed minutes × 60 turned
 * a 30-second floor into 60 — a one-way ratchet upwards through the one screen
 * whose job is the truth about these numbers.
 *
 * The box is gone (07.11.2026), so there is nothing left to derive FROM and
 * the helper went with it. The ratchet is now impossible rather than guarded
 * against, which is the stronger form: this screen cannot write either half of
 * the gap at all, as the loop above pins, and מצב פרסום חכם writes both
 * through applyGapFloor() — the one writer that keeps the two units agreeing.
 */
is(!/keepOrDerive/.test(settings), 'the minutes→seconds derivation is gone with the box it protected — nothing here can round a sub-minute floor up any more');
is(/applyGapFloor/.test(read('src/lib/social/client.ts')), 'and the one writer that still sets both units lives in client.ts, where every screen reaches it');

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
/*
 * THE ONE THING KEPT OUT OF THE SIX, and it is not a control: the Meta hold.
 * Its "נקה" is the only manual way out — the dashboard reports the hold but
 * offers no clear. Removing it would have left a state the system can enter
 * by itself with no way back.
 *
 * AND IT MUST BE INSIDE THE CUSTOMER'S TAB. This window used to bound a
 * containment check on the pacing card; when that card was deleted the
 * assertion went with it and the two offsets were left behind, bounding
 * nothing — "found both blocks" over an empty window. It has a subject
 * again, and it is the right one: an edit that moves this block past
 * `{tab === 'admin'` would hide the only way out of a Facebook hold behind a
 * tab a customer is never shown (see the isAdmin pin above), and every other
 * assertion here is a whole-file search that would not notice.
 */
const limitsAt = settings.indexOf("{tab === 'limits' && (");
const adminAt = settings.indexOf("{tab === 'admin'");
is(limitsAt > 0 && adminAt > limitsAt, 'found both tab blocks, in that order');
const holdAt = settings.indexOf('control.rateLimitedUntil &&');
is(holdAt > limitsAt && holdAt < adminAt, 'the Meta hold renders inside the tab a customer actually sees');
is(settings.indexOf('onClick={clearRateLimit}') > limitsAt && settings.indexOf('onClick={clearRateLimit}') < adminAt,
  'and so does the button that clears it — a way out on a screen nobody opens is no way out');
/*
 * AND IT ONLY SHOWS WHILE THE HOLD IS STILL RUNNING — which this file
 * asserted in its MESSAGE long before the code did it.
 *
 * The pin was `/\{control\.rateLimitedUntil && \(/`, i.e. bare truthiness,
 * under the words "only shows while there is one". But the field OUTLIVES the
 * hold: the server clears it lazily and the clear sits after the paused check
 * (server/worker.ts), so an owner who pauses before an expiry keeps the stale
 * instant for as long as they stay paused, and this screen printed a hold
 * Facebook was not applying. The dashboard has compared against the clock all
 * along (page.tsx:1751) — two screens, one row, opposite answers.
 */
is(/\{control\.rateLimitedUntil && new Date\(control\.rateLimitedUntil\) > new Date\(\) && \(/.test(settings),
  'the Meta hold is compared against the clock, not merely tested for being set');
is(/data\.control\.rateLimitedUntil && new Date\(data\.control\.rateLimitedUntil\) > new Date\(\)/.test(dash),
  'the same guard the dashboard uses, so the two screens cannot disagree about one row');

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
