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
       for the right reason. innerText rather than textContent, so the two
       lines the reference draws come back with a break between them instead of
       "…ה׳משעה 08:00". */
    const summary = () => page.locator('[data-schedule] [data-summary]').innerText();
    const day = (name: string) => page.locator(`[data-schedule] [aria-label="${name}"]`);
    const changes = () => page.evaluate(() => window.__changes);

    /* The state the owner's screen opens in. */
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'ימי פרסום: א׳, ב׳, ג׳, ד׳, ה׳ משעה 08:00 · כל 10 דקות',
      'the panel opens on the reference’s own setting',
    );

    /* ---------------------------------------------------------------- *
     * 1. MULTI SELECT — in both directions, and the summary with it.
     * ---------------------------------------------------------------- */
    await day('יום שישי').click();
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'ימי פרסום: א׳, ב׳, ג׳, ד׳, ה׳, ו׳ משעה 08:00 · כל 10 דקות',
      'ADDING A SIXTH DAY KEEPS THE OTHER FIVE — a row that behaved like radio buttons would read "ו׳" alone here',
    );
    eq(await day('יום שישי').getAttribute('aria-pressed'), 'true', 'and the chip says it is chosen');

    await day('שבת').click();
    eq((await summary()).replace(/\s+/g, ' ').trim(), 'ימי פרסום: כל הימים משעה 08:00 · כל 10 דקות', 'all seven is a sentence, not seven labels');

    /* And off again: "חובה לאפשר Multi Select" says nothing about a day being
       un-choosable, and a control that refuses its own last press is one the
       owner fights. */
    await day('יום רביעי').click();
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'ימי פרסום: א׳, ב׳, ג׳, ה׳, ו׳, ש׳ משעה 08:00 · כל 10 דקות',
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
    const fields = page.locator('[data-schedule] select');
    eq(await fields.count(), 2, 'TWO FIELDS, not three — the closing hour has no control any more');
    /* The reference's own order: the start time first, the interval second. */
    await fields.nth(0).selectOption('06:30');
    is((await summary()).includes('06:30'), 'changing the start time updates the summary on the spot');
    /* The select's values are SECONDS now — "תעשה אופציה של 30 40 50 שניות" —
       so twenty-five minutes is 1500. Driven through the real control rather
       than through the component's props, which is the point of this file. */
    await fields.nth(1).selectOption('1500');
    is((await summary()).includes('כל 25 דקות'), 'and so does the interval');
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'ימי פרסום: א׳, ב׳, ג׳, ה׳, ו׳, ש׳ משעה 06:30 · כל 25 דקות',
      'and both at once, with the days from the taps above still in it',
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
     * RE-POINTED, NOT DELETED. This used to read "thirty choices, 1 דק׳ to 30
     * דק׳" — offered, not merely accepted. The claim is the same; the list
     * grew three sub-minute steps at the front, because a minute used to be
     * the floor the UNIT imposed rather than a decision anyone made:
     * "בהפרש פרסום בין פוסט לפוסט תעשה אופציה של 30 40 50 שניות".
     *
     * Read off the real <option> elements, so a choice that exists in the
     * constant and never reaches the control still fails here.
     */
    const gaps = await fields.nth(1).locator('option').allTextContents();
    eq(gaps.length, 33, 'the interval field offers three sub-minute steps and the thirty minutes');
    eq(gaps.slice(0, 4).join(' | '), '30 שניות | 40 שניות | 50 שניות | דקה', 'starting at thirty seconds');
    eq(gaps[32], '30 דק׳', 'and still ending at thirty minutes');
    const gapValues = await fields.nth(1).locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    eq(gapValues.slice(0, 4).join(','), '30,40,50,60', 'and the VALUES are seconds — the label alone could say anything');

    /* ---------------------------------------------------------------- *
     * 3. THE SWITCH — "התזמון מושבת אך ההגדרות נשמרות".
     * ---------------------------------------------------------------- */
    const toggle = page.locator('[data-schedule] [role="switch"]');
    await toggle.click();
    eq(await toggle.getAttribute('aria-checked'), 'false', 'the switch turns the window off');
    is(
      (await summary()).includes('התזמון כבוי'),
      'and the summary says what that MEANS rather than the word "כבוי" on its own — the campaign publishes without a window again',
    );

    await toggle.click();
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'ימי פרסום: א׳, ב׳, ג׳, ה׳, ו׳, ש׳ משעה 06:30 · כל 25 דקות',
      'AND TURNING IT BACK ON FINDS EVERYTHING EXACTLY AS IT WAS — "ההגדרות נשמרות", down to the six days, the hour and the interval',
    );
    const afterToggle = (await changes()).at(-1)!;
    eq(afterToggle.days, [0, 1, 2, 4, 5, 6], 'and the schedule handed to the page still carries them, so nothing is lost on the way to the database');
    eq(afterToggle.gapSeconds, 1500, 'including the interval');

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
