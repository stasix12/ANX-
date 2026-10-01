import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

    const summary = () => page.locator('[data-schedule] p').last().innerText();
    const day = (name: string) => page.locator(`[data-schedule] [aria-label="${name}"]`);
    const changes = () => page.evaluate(() => window.__changes);

    /* The state the owner's screen opens in. */
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'סיכום תזמון: א׳, ב׳, ג׳, ד׳, ה׳ · 08:00 – 22:00 · כל 10 דקות',
      'the panel opens on the reference’s own setting',
    );

    /* ---------------------------------------------------------------- *
     * 1. MULTI SELECT — in both directions, and the summary with it.
     * ---------------------------------------------------------------- */
    await day('יום שישי').click();
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'סיכום תזמון: א׳, ב׳, ג׳, ד׳, ה׳, ו׳ · 08:00 – 22:00 · כל 10 דקות',
      'ADDING A SIXTH DAY KEEPS THE OTHER FIVE — a row that behaved like radio buttons would read "ו׳" alone here',
    );
    eq(await day('יום שישי').getAttribute('aria-pressed'), 'true', 'and the chip says it is chosen');

    await day('שבת').click();
    eq((await summary()).replace(/\s+/g, ' ').trim(), 'סיכום תזמון: כל הימים · 08:00 – 22:00 · כל 10 דקות', 'all seven is a sentence, not seven labels');

    /* And off again: "חובה לאפשר Multi Select" says nothing about a day being
       un-choosable, and a control that refuses its own last press is one the
       owner fights. */
    await day('יום רביעי').click();
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'סיכום תזמון: א׳, ב׳, ג׳, ה׳, ו׳, ש׳ · 08:00 – 22:00 · כל 10 דקות',
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
    is(sent.every((s) => s.start === '08:00' && s.end === '22:00' && s.gapMinutes === 10), 'and none of them quietly changed a field nobody touched');

    /* ---------------------------------------------------------------- *
     * 2. THE THREE FIELDS, each one live.
     * ---------------------------------------------------------------- */
    const fields = page.locator('[data-schedule] select');
    await fields.nth(0).selectOption('25');
    is((await summary()).includes('כל 25 דקות'), 'changing the interval updates the summary on the spot');
    await fields.nth(1).selectOption('06:30');
    is((await summary()).includes('06:30'), 'and so does the start time');
    await fields.nth(2).selectOption('23:30');
    is((await summary()).includes('23:30'), 'and the end time');
    eq(
      (await summary()).replace(/\s+/g, ' ').trim(),
      'סיכום תזמון: א׳, ב׳, ג׳, ה׳, ו׳, ש׳ · 06:30 – 23:30 · כל 25 דקות',
      'and all three at once, with the days from the taps above still in it',
    );

    /* "1–30 דקות... כל מספר שלם בין 1 ל-30 צריך להיות אפשרי" — offered, not
       merely accepted. */
    const gaps = await fields.nth(0).locator('option').allTextContents();
    eq(gaps.length, 30, 'the interval field offers thirty choices');
    eq(gaps[0], '1 דק׳', 'starting at one minute');
    eq(gaps[29], '30 דק׳', 'and ending at thirty');

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
      'סיכום תזמון: א׳, ב׳, ג׳, ה׳, ו׳, ש׳ · 06:30 – 23:30 · כל 25 דקות',
      'AND TURNING IT BACK ON FINDS EVERYTHING EXACTLY AS IT WAS — "ההגדרות נשמרות", down to the six days and both times',
    );
    const afterToggle = (await changes()).at(-1)!;
    eq(afterToggle.days, [0, 1, 2, 4, 5, 6], 'and the schedule handed to the page still carries them, so nothing is lost on the way to the database');
    eq(afterToggle.gapMinutes, 25, 'including the interval');

    /* ---------------------------------------------------------------- *
     * 4. NO DAY AT ALL, which is reachable in six taps and must not look
     *    like any other state.
     * ---------------------------------------------------------------- */
    for (const name of ['יום ראשון', 'יום שני', 'יום שלישי', 'יום חמישי', 'יום שישי', 'שבת']) await day(name).click();
    eq((await summary()).replace(/\s+/g, ' ').trim(), 'סיכום תזמון: לא נבחר אף יום', 'with nothing chosen the panel says so instead of printing an empty list');
    const stripe = await page.locator('[data-schedule] p').last().evaluate((e) => getComputedStyle(e).color);
    is(stripe !== 'rgb(109, 40, 217)', 'and it is not drawn in the ordinary purple — nothing will publish in this state');
    eq((await changes()).at(-1)!.days, [], 'and that is what would be written');

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
