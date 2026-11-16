/*
 * ─── THE PROGRAM'S OWN WINDOW, SWITCHED TO RUSSIAN AND MEASURED ───────────
 *
 * desktop-window.test.ts reads the renderer's files and checks that every
 * Hebrew line has an entry. That is a coverage guard, and it cannot tell
 * whether the translator RUNS: it read the dictionary, not the window.
 *
 * It has to run, because this window is not React. app.js writes into it by
 * hand, line by line, for as long as the program is open — statuses, counts,
 * greetings, the activity log — and the translator's whole job is to catch
 * those as they land. Three things decide whether it does, and all three are
 * logic I changed rather than data I added:
 *
 *   · § patterns, so `לפני 7 דק׳` can be said in Russian at all
 *   · the whitespace around a line, so a word does not fuse to a number
 *   · re-reading a node app.js has rewritten, so 7 does not stay on screen
 *     after app.js has written 8
 *
 * So this opens the real window in a real browser, presses Русский, and then
 * writes into it the way app.js does.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';

const NAME = 'desktop language';
let checks = 0;
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));
    /*
     * The renderer talks to the main process through window.anx. Nothing it
     * asks for matters here; it only has to exist so the scripts run.
     *
     * PASSED AS SOURCE TEXT, not as a function: tsx compiles a named arrow
     * with a `__name` helper that exists in the test process and not in the
     * page, so a function handed to addInitScript throws on the first line
     * and leaves window.anx undefined — which then reads as app.js being
     * broken rather than as the harness being wrong.
     */
    await page.addInitScript({
      content: 'window.anx = new Proxy({}, { get: function () { return function () { return Promise.resolve({ ok: true }); }; } });',
    });
    await page.goto(`file://${path.resolve('desktop/renderer/index.html')}`);
    await page.waitForSelector('[data-lang="ru"]');

    /*
     * A line of each kind, written the way app.js writes them: into an
     * element that already exists, after the window has opened. Writing
     * them from here rather than driving app.js is deliberate — this is
     * measuring the translator, and the MutationObserver it depends on is
     * the same one either way.
     */
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'probe';
      box.innerHTML = '<p id="fixed"></p><p id="live"></p><p id="gap"></p>';
      document.body.appendChild(box);
      document.getElementById('fixed')!.textContent = 'הכול רץ לבד';
      document.getElementById('live')!.textContent = 'לפני 7 דק׳';
      /* exactly the shape app.js builds: one node, the value inside it */
      document.getElementById('gap')!.textContent = '3 משימות';
    });
    await page.waitForTimeout(120);

    const he = await page.evaluate(() => ({
      fixed: document.getElementById('fixed')?.textContent,
      live: document.getElementById('live')?.textContent,
      gap: document.getElementById('gap')?.textContent,
      version: document.getElementById('ver2')?.parentElement?.textContent,
      dir: document.documentElement.getAttribute('dir'),
    }));
    eq(he.fixed, 'הכול רץ לבד', 'the window starts in Hebrew');
    eq(he.live, 'לפני 7 דק׳', 'including a line built around a number');
    eq(he.version, 'גרסה מותקנת —', 'and the sentence that sits next to the version number');
    eq(he.dir, 'rtl', 'and reads right to left');

    await page.click('[data-lang="ru"]');
    await page.waitForTimeout(150);

    const ru = await page.evaluate(() => ({
      fixed: document.getElementById('fixed')?.textContent,
      live: document.getElementById('live')?.textContent,
      gap: document.getElementById('gap')?.textContent,
      dir: document.documentElement.getAttribute('dir'),
      pressed: document.querySelector('[data-lang="ru"]')?.getAttribute('aria-pressed'),
      switchLabel: document.querySelector('[data-lang="he"]')?.textContent?.trim(),
      version: document.getElementById('ver2')?.parentElement?.textContent,
    }));
    eq(crashes, [], 'no page error');
    eq(ru.fixed, 'Всё работает само', 'a line app.js wrote turns Russian');
    eq(ru.live, '7 мин назад', 'and so does one built around a number, with the number kept');
    eq(ru.gap, '3 задач', 'a count and its word, which app.js writes as one line');
    /*
     * THE REAL WHITESPACE CASE, already in this window: index.html holds the
     * text "גרסה מותקנת " and then a <span> with the number in it. That
     * trailing space is the only thing between the words and the version, so
     * translating the trimmed sentence and writing it back bare would render
     * "Установленная версия4.76.0".
     */
    eq(ru.version, 'Установленная версия —', 'and a sentence written next to a value keeps the space after it');
    eq(ru.dir, 'ltr', 'the window turns left to right');
    eq(ru.pressed, 'true', 'and the switch says which language is on');
    eq(ru.switchLabel, 'עברית', 'while the way back is still named in Hebrew');

    /*
     * ─── app.js WRITES AGAIN, AND THE SCREEN HAS TO FOLLOW ───────────────
     *
     * This is the one that would have gone wrong silently. The translator
     * remembers each node's Hebrew so it can switch back; remembering it
     * once would mean the minute counter froze at 7 in Russian for as long
     * as the program stayed open.
     */
    await page.evaluate(() => {
      document.getElementById('live')!.textContent = 'לפני 8 דק׳';
    });
    await page.waitForTimeout(120);
    eq(
      await page.evaluate(() => document.getElementById('live')?.textContent),
      '8 мин назад',
      'when app.js writes a new number, the screen shows the NEW one — not a cached translation of the old',
    );

    /* A status app.js writes fresh, after the switch, with no Hebrew ever
       having been painted into that node in this language. */
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.id = 'late';
      p.textContent = 'מפרסם עכשיו';
      document.getElementById('probe')!.appendChild(p);
    });
    await page.waitForTimeout(120);
    eq(
      await page.evaluate(() => document.getElementById('late')?.textContent),
      'Публикуем сейчас',
      'and a line written for the first time while Russian is on arrives in Russian',
    );

    /* And back, from whatever the window is showing now. */
    await page.click('[data-lang="he"]');
    await page.waitForTimeout(150);
    const back = await page.evaluate(() => ({
      fixed: document.getElementById('fixed')?.textContent,
      live: document.getElementById('live')?.textContent,
      gap: document.getElementById('gap')?.textContent,
      late: document.getElementById('late')?.textContent,
      version: document.getElementById('ver2')?.parentElement?.textContent,
      dir: document.documentElement.getAttribute('dir'),
    }));
    eq(back.fixed, 'הכול רץ לבד', 'Hebrew comes back');
    eq(back.live, 'לפני 8 דק׳', 'with the number app.js last wrote, not the one it started with');
    eq(back.gap, '3 משימות', 'with the count it was given');
    eq(back.version, 'גרסה מותקנת —', 'and the space after the sentence is still there');
    eq(back.late, 'מפרסם עכשיו', 'and the line that was born in Russian goes back to Hebrew');
    eq(back.dir, 'rtl', 'and the window reads right to left again');

    /*
     * THE CHOICE SURVIVES A RESTART, which is the whole point of storing it:
     * the program is reopened every morning and must not ask again.
     */
    await page.click('[data-lang="ru"]');
    await page.waitForTimeout(120);
    await page.reload();
    await page.waitForSelector('[data-lang="ru"]');
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({
      dir: document.documentElement.getAttribute('dir'),
      pressed: document.querySelector('[data-lang="ru"]')?.getAttribute('aria-pressed'),
    }));
    eq(after.dir, 'ltr', 'the window reopens in the language that was chosen');
    eq(after.pressed, 'true', 'and the switch agrees');

    await page.close();
  } finally {
    await browser.close();
  }
  console.log(`${NAME} OK — ${checks} assertions, the real window switched in a browser`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
