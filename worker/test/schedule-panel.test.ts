import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

/**
 * "תזמון פרסום" — PRESSED, not just rendered.
 *
 * worker/test/campaign-card.test.ts measures where this panel is and how big
 * everything in it comes out; it renders static HTML, so nothing in it has
 * ever been clicked. Three of the lines in the owner's acceptance list only
 * exist once something is:
 *
 *   "חובה לאפשר Multi Select"
 *   "הסיכום חייב להתעדכן LIVE כאשר המשתמש משנה: ימים, שעת התחלה, שעת סיום,
 *    הפרש בין פוסטים"
 *   "כאשר כבוי: התזמון מושבת אך ההגדרות נשמרות"
 *
 * AND ONE THAT IS NOT ON HIS LIST AND MATTERS MORE. Every change here becomes
 * a write to the campaign row. A panel that emitted a schedule built from a
 * stale closure — the classic bug in a control that sends a whole object
 * rather than a field — would look perfect on screen and save the wrong thing:
 * tapping Sunday then Monday would store "Monday only", because the second
 * emission was built from the schedule as it was before the first. The screen
 * and the database would then disagree until the next refresh, when the
 * database would win. So this file does not read the chips; it reads what the
 * panel HANDED BACK, which is what the page writes.
 *
 *   npx tsx worker/test/schedule-panel.test.ts
 */

const CHUNKS = path.resolve('.next/static/chunks');
function builtCss(): string | null {
  let best: { file: string; size: number } | null = null;
  try {
    for (const name of readdirSync(CHUNKS)) {
      if (!name.endsWith('.css')) continue;
      const file = path.join(CHUNKS, name);
      const size = statSync(file).size;
      if (!best || size > best.size) best = { file, size };
    }
  } catch {
    return null;
  }
  return best?.file ?? null;
}

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    console.log('schedule panel interaction SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'schedule-panel-'));
  copyFileSync(css, path.join(dir, 'app.css'));

  /*
   * BUNDLED, NOT SERVER-RENDERED. React has to be running in the page for a
   * click to do anything, so the harness is compiled to one browser script.
   *
   * `keepNames: false` on purpose — scripts/build-app.mjs sets it true for the
   * worker and that is what produces the `__name` wrapper this suite has been
   * bitten by twice. Nothing here needs function names.
   */
  await build({
    entryPoints: [path.resolve('worker/test/mount-schedule-panel.tsx')],
    outfile: path.join(dir, 'panel.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    /* Something in the React/Next graph still reads `process.env` as a whole
       after the define has replaced the one key, and a bare `process` in a
       file:// page is a ReferenceError before the first render. One line of
       banner is less fragile than defining the whole object away. */
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });

  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div id="root"></div><script src="panel.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));
    await page.goto(`file://${path.join(dir, 'index.html')}`);
    await page.waitForSelector('[data-schedule]');

    /* BY ITS OWN ATTRIBUTE. "the last <p>" happened to be the summary while
       the panel was four elements; it carries a next-publication block and a
       repeat row now, and a locator that finds the wrong element cannot fail
       for the right reason.

       THE EXPECTED STRINGS CARRY "|" NOW. The summary was two stacked lines;
       the campaign-compaction brief asks for "שורה קומפקטית ובהירה" and the
       reference draws one line with a vertical rule between its three fields
       — "ימי פרסום: … | משעה 15:10 | כל 40 שניות". Same three values, same
       order, one separator spelled the way the image spells it.

       innerText rather than textContent is kept: the line still WRAPS on a
       narrow screen rather than truncating the days, and the collapse below
       turns that break back into a space. */
    const summary = () => page.locator('[data-schedule] [data-summary]').innerText();
    const day = (name: string) => page.locator(`[data-schedule] [aria-label="${name}"]`);
    const changes = () => page.evaluate(() => window.__changes);

    /* The state the owner's screen opens in. */
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'ימי פרסום: א׳, ב׳, ג׳, ד׳, ה׳ | משעה 08:00',
      'the panel opens on the reference’s own setting',
    );

    /* ---------------------------------------------------------------- *
     * 1. MULTI SELECT — in both directions, and the summary with it.
     * ---------------------------------------------------------------- */
    await day('יום שישי').click();
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'ימי פרסום: א׳, ב׳, ג׳, ד׳, ה׳, ו׳ | משעה 08:00',
      'ADDING A SIXTH DAY KEEPS THE OTHER FIVE — a row that behaved like radio buttons would read "ו׳" alone here',
    );
    eq(await day('יום שישי').getAttribute('aria-pressed'), 'true', 'and the chip says it is chosen');

    await day('שבת').click();
    eq((await summary()).replace(/\s+/g, ' ').trim(), 'ימי פרסום: כל הימים | משעה 08:00', 'all seven is a sentence, not seven labels');

    /* And off again: "חובה לאפשר Multi Select" says nothing about a day being
       un-choosable, and a control that refuses its own last press is one the
       owner fights. */
    await day('יום רביעי').click();
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'ימי פרסום: א׳, ב׳, ג׳, ה׳, ו׳, ש׳ | משעה 08:00',
      'a chosen day un-chooses, and the list closes over the gap in week order rather than in tap order',
    );
    eq(await day('יום רביעי').getAttribute('aria-pressed'), 'false', 'and the chip says so');

    /*
     * THE ONE THAT WOULD HAVE SAVED THE WRONG THING. Four taps, four
     * emissions, each one built on the last. A stale closure here gives four
     * schedules that each differ from the opening one by a single day, and the
     * screen would still look right.
     */
    const sent = await changes();
    eq(sent.length, 3, 'three taps, three schedules handed to the page');
    eq(sent[0].days, [0, 1, 2, 3, 4, 5], 'the first carries Friday added to the five that were there');
    eq(sent[1].days, [0, 1, 2, 3, 4, 5, 6], 'the second carries Saturday added to those SIX — not to the original five');
    eq(sent[2].days, [0, 1, 2, 4, 5, 6], 'and the third carries Wednesday removed from those seven');
    is(sent.every((s) => s.start === '08:00' && s.gapSeconds === 600), 'and none of them quietly changed a field nobody touched');

    /* ---------------------------------------------------------------- *
     * 2. THE TWO FIELDS, each one live — and there are TWO.
     *
     * "יש להסיר לחלוטין את אפשרות שעת הסיום מממשק הכרטיס... להשאיר רק: שעת
     *  התחלת הפרסום, הפרש בין פרסום לפרסום, ימי הפרסום שנבחרו."
     * ---------------------------------------------------------------- */
    /*
     * ONE FIELD NOW, AND THE COUNT IS STILL THE PIN.
     *
     * It was two: the start hour and "הפרש בין פרסומים". On 07.11.2026 the
     * second was deleted outright — "יש להסיר לחלוטין מהממשק את השדה הישן:
     * הפרש בין פרסומים. אין להשאיר אותו במקום אחר ואין ליצור הגדרה כפולה" —
     * and מצב פרסום חכם, a three-card picker, took its place.
     *
     * The claim this assertion makes is unchanged: this card offers EXACTLY
     * the controls the brief leaves it, and no more. A third field appearing
     * here is still a failure; so is the gap dropdown coming back, which the
     * select count now forbids outright.
     */
    const fields = page.locator('[data-schedule] select, [data-schedule] input[type="time"]');
    eq(await fields.count(), 1, 'ONE FIELD — the start hour. The closing hour and the interval both have no control here any more');
    eq(await page.locator('[data-schedule] input[type="time"]').count(), 1, 'and it is a clock, not a list');
    eq(await page.locator('[data-schedule] select').count(), 0, 'there is no dropdown on this card at all — the gap list is gone and must not return');
    /* And the mechanism that replaced it is present, live, and a radio group. */
    eq(await page.locator('[data-schedule] [data-smart-pace] [role="radio"]').count(), 3, 'מצב פרסום חכם draws exactly three modes');

    /* The reference's own order: the start time first, the modes under it. */
    const start = page.locator('[data-schedule] input[type="time"]');
    /*
     * FILLING THE HOUR IS NOT FINISHING WITH IT, and that is the product's
     * behaviour now rather than a quirk of this harness.
     *
     * The field holds the hour being picked and writes once, when the picker
     * closes — because writing every notch of the iOS wheel through was a
     * round trip that put the saved hour back into the open picker and closed
     * it under the owner's finger ("אני עוד לא מספיק לבחור וזה זורק אותי
     * מהבחירה"). Playwright's fill() types and fires `change`; it does not
     * blur, so on its own it leaves a draft exactly as a half-finished scroll
     * does. setStart() is fill-then-close, which is what a person does.
     */
    const setStart = async (hhmm: string) => {
      await start.fill(hhmm);
      await start.evaluate((el) => (el as HTMLInputElement).blur());
    };
    await setStart('06:30');
    is((await summary()).includes('06:30'), 'changing the start time updates the summary on the spot');

    /*
     * ─── AND IT NEVER COMMITS HALF AN HOUR ───────────────────────────────
     *
     * fill() writes a whole value, so it cannot reach this at all — which is
     * why the guard went unmeasured until a mutation proved it. Typed one
     * segment at a time, a time input reports `''` while the minutes are
     * still missing, and some browsers report the hour alone. Either one,
     * written through, ARMS a real hour on the campaign: the rounds editor in
     * this same panel carries the scar — "typing 18:30 saved 01:30 on the
     * way" — and that one went as far as the database.
     *
     * So: type ONLY the hour, and demand that nothing was handed to the page.
     */
    /*
     * ─── AND IT NEVER COMMITS HALF AN HOUR ───────────────────────────────
     *
     * PINNED IN THE SOURCE, AND THAT IS A STATEMENT ABOUT THE BROWSER, NOT A
     * SHORTCUT. I tried to drive it: click the field, type the segments one
     * at a time, read what reached the page. Chromium fires NOTHING until
     * both segments are filled — `pressSequentially` produced zero change
     * events — so the partial commit this guard exists to stop cannot be
     * reproduced here however it is typed, and a mutation that deleted the
     * guard left every behavioural assertion above green.
     *
     * The hazard is real even so, and this file's own neighbour is the
     * evidence: the rounds editor a few hundred lines down carries the scar
     * "typing 18:30 saved 01:30 on the way" — a partial hour that reached
     * the DATABASE and armed a round. A browser that reports a lone hour
     * meets the guard; this assertion is what keeps the guard there.
     */
    const panelSrc = readFileSync(new URL('../../src/components/social/CampaignSchedulePanel.tsx', import.meta.url), 'utf8');
    /* Anchored on the COMPONENT, not on `type="time"`: that string also
       appears in the prose above the field, and a window that opens on a
       comment is a guard that reads its own explanation. */
    const at = panelSrc.indexOf('function TimePick(');
    is(at > -1, 'TimePick is still the control behind the start hour — re-point this rather than deleting it');
    const end = panelSrc.indexOf('/** Re-exported', at);
    is(end > at, 'the component still ends before the re-export — re-point this rather than widening it');
    const commit = panelSrc.slice(at, end);
    /* A plain substring, not a regex: the thing being matched IS a regex
       literal, and escaping one inside another is how a guard ends up
       matching nothing and passing on its own emptiness. */
    /* RE-POINTED, NOT WEAKENED. The callback is `onDraft` now — the hour is
       held on the panel while the wheel moves and written once when the
       picker closes, because writing every notch through was a round trip
       that snapped the open picker shut under the finger. The rule this
       assertion exists for is untouched and is now enforced TWICE: a partial
       value may not become a draft here, and commitStart() re-tests the
       complete form before it writes. worker/test/time-picker.test.ts drives
       both in a browser. */
    is(
      commit.includes('if (/^\\d{2}:\\d{2}$/.test(v)) onDraft(v);'),
      'only a complete HH:MM is passed on; a partial value is left as the draft it is',
    );
    is(
      commit.includes('onBlur={onCommit}'),
      'and the picker closing is what writes it — not every notch of the wheel',
    );
    await setStart('06:30');

    /*
     * AND AN HOUR THE OLD GRID COULD NOT EXPRESS. 06:47 is not on any
     * half-hour, so this one line is the whole request: if the field ever
     * goes back to a list of 48, it cannot be filled and this fails.
     */
    await setStart('06:47');
    is((await summary()).includes('06:47'), 'any minute, not every half hour — the grid of 48 is gone');
    eq(await start.getAttribute('step'), '60', 'and no seconds wheel: the engine stores minutes');
    eq(await start.getAttribute('dir'), 'ltr', 'the clock reads left to right inside the RTL card, like every other hour in this product');
    await setStart('06:30');
    /*
     * ─── AND THE INTERVAL, WHICH IS A MODE NOW ───────────────────────────
     *
     * This selected 1500 seconds from the gap dropdown and read the summary
     * back. The dropdown is gone; the pace is chosen by tapping one of three
     * cards, and the card's OWN summary line is what states the consequence.
     * Driven through the real control rather than through props, which is the
     * point of this file.
     */
    const mode = (label: string) => page.locator(`[data-schedule] [data-smart-pace] [role="radio"]`).filter({ hasText: label });
    await mode('איטי').first().click();
    eq(await mode('איטי').first().getAttribute('aria-checked'), 'true', 'tapping a mode selects it');
    const paceLine = () => page.locator('[data-schedule] [data-pace-summary]').innerText();
    is((await paceLine()).includes('איטי'), 'and the summary line under the row names the mode that was chosen');
    is((await paceLine()).includes('5 דקות'), 'with its interval');
    /* "30 דק׳" — the summary abbreviates where the cards above it spell the
       word out, because it has four facts to fit on one line and they have
       two each. Both spellings come from the same seconds; see paceGapWords
       and accountGapLabel in rules.ts. */
    is(/30 דק/.test(await paceLine()), 'and the length of its rest');
    is((await paceLine()).includes('על כל החשבון'), 'and that the mode is account-wide, which is the one consequence that reaches outside this campaign');
    is((await paceLine()).includes('10 פרסומים'), 'and how many publications in a row trigger it');
    /*
     * THE SCHEDULE SUMMARY NO LONGER CARRIES THE INTERVAL, deliberately: two
     * places stating one number is the "הגדרה כפולה" the brief forbids, and
     * the mode's own line is the one that can state the rest as well.
     */
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'ימי פרסום: א׳, ב׳, ג׳, ה׳, ו׳, ש׳ | משעה 06:30',
      'the days and the hour, with the days from the taps above still in it',
    );
    /* AND NOWHERE IN IT IS A SECOND HOUR. A range is written with a dash; its
       absence is the cheapest statement of the requirement that cannot be
       satisfied by accident. */
    is(!(await summary()).includes('–'), 'the summary prints no hour RANGE — "אין להציג שעת סיום גם בשורת הסיכום"');
    is(
      !(await page.locator('[data-schedule]').innerText()).includes('שעת סיום'),
      'and the words "שעת סיום" appear nowhere in the panel at all',
    );

    /*
     * RE-POINTED 07.11.2026 — THE LIST OF 33 INTERVALS IS NOW THREE MODES.
     *
     * This read the <option> elements off the gap dropdown and demanded 33 of
     * them, starting at "30 שניות". The dropdown is gone: "יש להסיר לחלוטין
     * מהממשק את השדה הישן: הפרש בין פרסומים… במקומו יש להשתמש במנגנון החדש של
     * שלושת מצבי הפרסום."
     *
     * The claim survives the change of control: what is OFFERED is read off
     * the real elements, not off the constant, so a mode that exists in
     * PACE_PROFILES and never reaches the card still fails here — which is
     * exactly what the 33-option version was for.
     */
    const cards = page.locator('[data-schedule] [data-smart-pace] [role="radio"]');
    const labels = await cards.evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    eq(labels.length, 3, 'three modes are offered, no more and no fewer');
    is(labels[0].startsWith('מהיר'), 'מהיר first — fastest at the start of the row, which in RTL draws it rightmost as the reference does');
    is(labels[1].startsWith('בינוני'), 'בינוני second');
    is(labels[2].startsWith('איטי'), 'איטי third');
    /* And each card carries BOTH of its numbers, which is the whole reason a
       mode replaced a bare interval: a gap alone cannot express a rest. */
    is(labels[0].includes('45 שניות') && labels[0].includes('7 דקות'), 'מהיר: every 45 seconds, a 7-minute rest');
    is(labels[1].includes('2 דקות') && labels[1].includes('15 דקות'), 'בינוני: every 2 minutes, a 15-minute rest');
    is(labels[2].includes('5 דקות') && labels[2].includes('30 דקות'), 'איטי: every 5 minutes, a 30-minute rest');
    /* The run length is stated once, under the row, because all three share it. */
    is(
      (await page.locator('[data-schedule] [data-smart-pace]').innerText()).includes('10 פרסומים'),
      'and the row says a rest follows every ten publications',
    );

    /* ---------------------------------------------------------------- *
     * 3. THERE IS NO SWITCH ANY MORE — THE DAYS DECIDE.
     *
     * RE-POINTED, NOT DELETED. This section used to turn the schedule's own
     * switch off and on and prove that "ההגדרות נשמרות" across it. The owner
     * removed that switch — "הכפתור של התזמון פרסום מבלבל למה צריך אותו" —
     * and chose "the days decide" instead, so the requirement it was guarding
     * changed shape rather than going away:
     *
     *   • the panel offers no schedule switch at all;
     *   • every day lit with the hour at midnight is stored the way this
     *     product has always stored "no limit": with `enabled` down. That
     *     matters beyond tidiness — client.ts refuses to re-stamp a queue
     *     while the flag is down, so a UI that raised it on a campaign that
     *     limits nothing would re-space rows nobody asked to re-space;
     *   • and narrowing it again raises the flag, with the days intact.
     * ---------------------------------------------------------------- */
    eq(
      await page.locator('[data-schedule] [role="switch"][aria-label*="תזמון פרסום"]').count(),
      0,
      'the schedule has no switch of its own any more — the days are the control',
    );

    /* ד׳ is the one day not chosen above, so this tap is what makes it a full
       week. The hour then goes to midnight, and the pair of them is a
       schedule that permits everything. */
    await day('יום רביעי').click();
    await setStart('00:00');
    const unlimited = (await changes()).at(-1)!;
    eq(unlimited.days, [0, 1, 2, 3, 4, 5, 6], 'all seven days are what was written');
    eq(unlimited.start, '00:00', 'from midnight');
    eq(
      unlimited.enabled,
      false,
      'AND THE STORED FLAG GOES DOWN: "every day from midnight" and "no window" are the same schedule, and the engine already has one way of saying it',
    );
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'מפרסם בכל יום, בכל שעה',
      'and the summary says the consequence in one sentence instead of naming a switch position',
    );

    /* Narrow it again by one day and the flag comes straight back up. */
    await day('שבת').click();
    const narrowed = (await changes()).at(-1)!;
    eq(narrowed.days, [0, 1, 2, 3, 4, 5], 'six days is a limit');
    eq(narrowed.enabled, true, 'so the flag is raised — the engine must enforce the week again');
    is(
      (await summary()).includes('ימי פרסום:'),
      'and the summary goes back to listing the days it will publish on',
    );

    /* Back to the state the sections below expect: the six days and 06:30
       this file has been building since the top. */
    await day('שבת').click();
    await day('יום רביעי').click();
    await setStart('06:30');
    const restored = (await changes()).at(-1)!;
    eq(restored.days, [0, 1, 2, 4, 5, 6], 'the six days are back');
    /* The campaign's own gapSeconds is untouched by anything on this card
       now: the pace writes the ACCOUNT's gap through applyGapFloor, and this
       panel emits only what it still edits. Unchanged from the opening value
       is exactly the assertion — a card that quietly rewrote a field nobody
       touched is the defect the three taps above are about. */
    eq(restored.gapSeconds, 600, 'and nothing was lost on the way — the campaign\u2019s own stored interval is untouched by this card');

    /* ---------------------------------------------------------------- *
     * 4. NO DAY AT ALL, which is reachable in six taps and must not look
     *    like any other state.
     * ---------------------------------------------------------------- */
    for (const name of ['יום ראשון', 'יום שני', 'יום שלישי', 'יום חמישי', 'יום שישי', 'שבת']) await day(name).click();
    eq((await summary()).replace(/\s+/g, ' ').trim(), 'ימי פרסום: לא נבחר אף יום', 'with nothing chosen the panel says so instead of printing an empty list');
    const stripe = await page.locator('[data-schedule] [data-summary]').evaluate((e) => getComputedStyle(e).color);
    is(stripe !== 'rgb(109, 40, 217)', 'and it is not drawn in the ordinary purple — nothing will publish in this state');
    eq((await changes()).at(-1)!.days, [], 'and that is what would be written');

    /* ---------------------------------------------------------------- *
     * 5. "הפרסום הבא" — AND ITS COUNTDOWN, TICKING.
     *
     * "להציג ספירה לאחור שמתעדכנת בזמן אמת, בלי לבצע קריאות מיותרות לשרת."
     *
     * Both halves are checked here and nowhere else can check them: every
     * other fixture in this suite is server-rendered HTML, where useEffect
     * never runs and the block freezes on its first second. A frozen clock is
     * indistinguishable from a live one in a screenshot.
     * ---------------------------------------------------------------- */
    const block = page.locator('[data-schedule] [data-next-publication]');
    eq(await block.count(), 1, 'the panel draws the "הפרסום הבא" block when it is given a readout');
    const blockText = await block.innerText();
    is(blockText.startsWith('הפרסום הבא'), `the block leads with its own name — "${blockText.slice(0, 30)}"`);
    is(/ בשעה \d{2}:\d{2}/.test(blockText), 'and names the hour the publication goes out');
    is(/\d{2}\.\d{2}/.test(blockText), 'with the date beside it');
    is(blockText.includes('באר שבע מדברת'), 'and the group it goes to');

    const tick = () => page.locator('[data-schedule] [data-next-publication] p').nth(2).innerText();
    const first = await tick();
    is(/בעוד/.test(first), `the countdown is drawn — "${first}"`);
    /* 1.2s, not 1.0: the interval fires on a 1000ms boundary and the read has
       to land after one of them, not on it. */
    await page.waitForTimeout(1200);
    const second = await tick();
    is(first !== second, `THE COUNTDOWN IS LIVE — it read "${first}" and still reads "${second}" a second later`);
    /* AND IT COSTS NOTHING. The tick re-renders from an instant the component
       was already handed; a block that re-fetched would be a request a second,
       per card, on a screen the owner leaves open all day. */
    is(
      !/fetch\(|XMLHttpRequest/.test(readFileSync(new URL('../../src/components/social/NextPublication.tsx', import.meta.url), 'utf8')),
      'and it reaches the network for none of it',
    );

    /* ── WHILE IT SAVES, IT SAYS SO ──────────────────────────────────── */
    /*
     * "שאני משנה מצב לוחץ על כפתור או משנה שעה במסך קופא (ממתין) במקום זה אני
     *  רוצה שיהיה עיגול כחול של טעינה שאנשים יבינו שזה לא באג אלא טעינה."
     *
     * Changing the hour here re-times every waiting row of the round — 53 of
     * them on the screen he photographed — and for those seconds the panel
     * went `disabled` and nothing else. Grey controls that do not respond are
     * indistinguishable from a broken screen, which is exactly how he read
     * them.
     *
     * FOUR THINGS, because three of them are the ways this could be faked:
     * the circle is THERE, it is BLUE, it is actually TURNING (an icon that
     * merely carries a spin class is not a spinner — see live-flow §8 on
     * `animation-name`), and the controls underneath are still switched off,
     * because saying "saving" over live controls would be the other lie.
     */
    {
      await page.evaluate(() => window.__busy(true));
      await page.waitForTimeout(150);
      const saving = await page.evaluate(() => {
        const note = document.querySelector('[data-schedule] [data-saving]') as HTMLElement | null;
        if (!note) return null;
        const circle = note.querySelector('svg') as SVGElement | null;
        const box = note.getBoundingClientRect();
        return {
          text: (note.textContent ?? '').trim(),
          shown: box.width > 0 && box.height > 0 && getComputedStyle(note).visibility !== 'hidden',
          colour: circle ? getComputedStyle(circle).color : '',
          /* A real animation, running, on the circle itself. */
          turning: circle ? (circle as unknown as Element).getAnimations({ subtree: true }).length : 0,
          /* And the panel still says it is busy to anything listening. */
          aria: (document.querySelector('[data-schedule]') as HTMLElement).getAttribute('aria-busy'),
          /* The controls under it: a day chip and the hour. */
          dayOff: (document.querySelector('[data-schedule] [role="group"] button') as HTMLButtonElement | null)?.disabled ?? null,
          hourOff: (document.querySelector('[data-schedule] input[type="time"]') as HTMLInputElement | null)?.disabled ?? null,
        };
      });
      is(saving, 'the panel shows something while it saves');
      is(saving!.shown, 'and it is on screen, with a box of its own');
      is(saving!.text.includes('שומר'), `and it says what is happening — "${saving!.text}"`);
      is(saving!.turning > 0, 'THE CIRCLE IS ACTUALLY TURNING — a spin class with no animation behind it is a still picture');
      eq(saving!.colour, 'rgb(21, 80, 196)', 'and it is the product\'s own blue, as he asked');
      eq(saving!.aria, 'true', 'the panel announces itself busy to a screen reader too');
      eq(saving!.dayOff, true, 'the days stay switched off while the write runs — the old behaviour, which was right');
      eq(saving!.hourOff, true, 'and so does the hour');

      /* AND IT GOES AWAY. A spinner that outlives its write is the same bug
         wearing the opposite costume. */
      await page.evaluate(() => window.__busy(false));
      await page.waitForTimeout(150);
      eq(
        await page.evaluate(() => document.querySelectorAll('[data-schedule] [data-saving]').length),
        0,
        'and the moment the write lands it is gone',
      );
      eq(
        await page.evaluate(() => (document.querySelector('[data-schedule] [role="group"] button') as HTMLButtonElement).disabled),
        false,
        'with every control usable again',
      );
    }

    eq(crashes, [], `the panel threw in the browser: ${crashes.join(' | ')}`);
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(`schedule panel interaction OK — ${checks} assertions, driven by real clicks`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
