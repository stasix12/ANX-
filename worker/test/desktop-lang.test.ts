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
    /* The age forms are abbreviated now — measured against the activity
       pill in the web app, and kept the same here so that one product does
       not speak two ways. worker/test/russian-clock carries the numbers. */
    eq(ru.live, '7 мин', 'and so does one built around a number, with the number kept');
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
     * ─── THE CLOCK THIS WINDOW BUILDS, DRIVEN BY THE WINDOW ──────────────
     *
     * "לפני 1 ימים" was on this screen for anything between 24 and 36 hours
     * old, and "לפני 1 דק׳" at one minute. Wrong in Hebrew before it is
     * anything to do with Russian — one day is "לפני יום" — and worse in
     * Russian, where the dictionary answers a SHAPE: 'לפני § ימים' could
     * only ever carry one form of the noun, so the window said "1 дней
     * назад" and "2 дней назад".
     *
     * ago() is a plain function declaration in a classic script, so it is a
     * global on this page and the real one can be driven here rather than
     * copied. Thirteen ages, each read back off the screen after the
     * translator has had it.
     */
    const AGES: [number, string, string][] = [
      [20 * 1000, 'עכשיו', 'Сейчас'],
      [60 * 1000, 'לפני דקה', '1 мин'],
      [7 * 60 * 1000, 'לפני 7 דק׳', '7 мин'],
      [59 * 60 * 1000, 'לפני 59 דק׳', '59 мин'],
      [60 * 60 * 1000, 'לפני שעה', '1 ч'],
      [5 * 3600 * 1000, 'לפני 5 שע׳', '5 ч'],
      [23 * 3600 * 1000, 'לפני 23 שע׳', '23 ч'],
      [25 * 3600 * 1000, 'לפני יום', 'день назад'],
      [36 * 3600 * 1000, 'לפני יומיים', 'два дня назад'],
      [3 * 86400 * 1000, 'לפני 3 ימים', '3 дня назад'],
      [5 * 86400 * 1000, 'לפני 5 ימים', '5 дней назад'],
      [11 * 86400 * 1000, 'לפני 11 ימים', '11 дней назад'],
      [21 * 86400 * 1000, 'לפני 21 ימים', '21 день назад'],
    ];
    const built = (await page.evaluate(
      `((offs) => offs.map((o) => ago(new Date(Date.now() - o).toISOString())))(${JSON.stringify(AGES.map((a) => a[0]))})`,
    )) as string[];
    eq(built, AGES.map((a) => a[1]), 'ago() spells every age the way Hebrew does — no "לפני 1 ימים" at any of them');
    const painted: string[] = [];
    for (const [, hebrew] of AGES) {
      await page.evaluate(`document.getElementById('live').textContent = ${JSON.stringify(hebrew)}`);
      await page.waitForTimeout(90);
      painted.push((await page.evaluate(() => document.getElementById('live')?.textContent)) as string);
    }
    eq(painted, AGES.map((a) => a[2]), 'and the window says each of them in Russian, with the form the number asks for');

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
      '8 мин',
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
