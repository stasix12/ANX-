import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

/**
 * EVERY SCREEN OF THE DESKTOP APP HAS TO BE REACHABLE IN A SMALL WINDOW.
 *
 * "לא נותן לי לגלול למטה."
 *
 * The owner opened the settings screen on a laptop, in a window he had not
 * maximised, and the card holding "נתק את המחשב" and "נתק פייסבוק" was 182px
 * below the bottom edge with NO WAY TO SCROLL TO IT. Not a slow scroll, not a
 * hidden scrollbar — the scroll container was never shorter than the thing it
 * contained, so there was nothing to scroll.
 *
 * WHY IT WAS INVISIBLE UNTIL A PERSON HIT IT. `main` is a grid item and
 * `.page` is a flex item, and both default to `min-height: auto` — "never
 * shrink below your content". So `main` grew to 960px inside a 620px window
 * and `overflow-y: auto` on `.page` had nothing to do. The app looked correct
 * in any window tall enough for its tallest page, which every window the
 * developer used happened to be.
 *
 * This measures the real renderer in a real browser at the sizes a person
 * actually has, and asserts two things per page: that the shell is exactly as
 * tall as the window, and that anything below the fold can be scrolled to.
 *
 *   npx tsx worker/test/desktop-window.test.ts
 */

const PAGES = ['home', 'tasks', 'activity', 'settings', 'updates', 'help'];

/*
 * 1100x620 is the window the owner's screenshot shows — a 15" laptop with the
 * app not maximised, which is how it is used. 900x520 is smaller than anybody
 * is likely to make it, and is here because the failure mode is silent: a
 * window one pixel too short loses a control with no sign that it did.
 */
const WINDOWS = [
  { w: 1100, h: 620, why: "the owner's own window" },
  { w: 900, h: 520, why: 'smaller than anybody would choose' },
  { w: 1440, h: 900, why: 'maximised on a laptop' },
];

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

async function show(page: Page, which: string): Promise<void> {
  await page.evaluate((id) => {
    document.getElementById('shell')!.classList.add('on');
    (document.getElementById('login') as HTMLElement).style.display = 'none';
    /* The toggle rows are built by paintPrefs(); without them the settings
       card is empty and the page is short enough to fit — which is exactly
       why this bug survived every look at it. */
    (window as unknown as { paintPrefs?: (p: unknown) => void }).paintPrefs?.({});
    for (const s of document.querySelectorAll('.page')) (s as HTMLElement).hidden = s.id !== `page-${id}`;
  }, which);
  await page.waitForTimeout(120);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    for (const { w, h, why } of WINDOWS) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      /* The renderer talks to the main process through window.anx. Nothing it
         asks for matters here; it only has to exist so the script runs. */
      await page.addInitScript(() => {
        (window as unknown as { anx: unknown }).anx = new Proxy({}, { get: () => async () => ({ ok: true }) });
      });
      await page.goto(`file://${path.resolve('desktop/renderer/index.html')}`);

      for (const which of PAGES) {
        await show(page, which);
        const seen = await page.evaluate((id) => {
          const el = document.getElementById(`page-${id}`)!;
          const shell = document.getElementById('shell')!;
          return {
            client: el.clientHeight,
            scroll: el.scrollHeight,
            shellH: Math.round(shell.getBoundingClientRect().height),
            viewport: window.innerHeight,
            documentOverflows: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
          };
        }, which);

        const at = `${w}x${h} (${why}) · ${which}`;
        /*
         * THE SHELL IS THE WINDOW. The moment it is taller, some control is
         * outside the window and nothing inside can scroll to it.
         */
        is(
          Math.abs(seen.shellH - seen.viewport) <= 1,
          `${at}: the shell is ${seen.shellH}px in a ${seen.viewport}px window — it has grown past the window instead of scrolling inside it`,
        );
        is(!seen.documentOverflows, `${at}: the document itself overflows, so the app scrolls as a web page rather than as a window`);
        /* A page taller than its box must be able to scroll. A page that fits
           has nothing to prove. */
        if (seen.scroll > seen.client + 1) {
          const reached = await page.evaluate((id) => {
            const el = document.getElementById(`page-${id}`)!;
            el.scrollTop = el.scrollHeight;
            return el.scrollTop > 0;
          }, which);
          is(reached, `${at}: content sits below the fold and the page will not scroll to it`);
        }
      }

      /*
       * THE ONE THE OWNER COULD NOT REACH, by name. Scrolled to, and then
       * asserted to be inside the window — "the element exists" was already
       * true while it was 182px off the bottom of the screen.
       */
      await show(page, 'settings');
      const account = await page.evaluate(() => {
        const el = document.getElementById('page-settings')!;
        el.scrollTop = el.scrollHeight;
        const out: Record<string, { top: number; bottom: number }> = {};
        for (const id of ['signout', 'fbout', 'fbrecheck']) {
          const b = document.getElementById(id)?.getBoundingClientRect();
          if (b) out[id] = { top: Math.round(b.top), bottom: Math.round(b.bottom) };
        }
        return { out, viewport: window.innerHeight };
      });
      for (const id of ['signout', 'fbout', 'fbrecheck']) {
        const box = account.out[id];
        is(box, `${w}x${h}: #${id} is missing from the settings screen entirely`);
        is(
          box && box.top >= 0 && box.bottom <= account.viewport + 1,
          `${w}x${h}: after scrolling to the bottom, #${id} is still outside the window (${JSON.stringify(box)}) — this is the bug the owner hit`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`desktop window tests OK — ${checks} assertions across ${WINDOWS.length} window sizes`);
}

/* ══════════ THE PROGRAM SPEAKS RUSSIAN TOO, OR SAYS SO OUT LOUD ══════════ */

/*
 * "תוסיף אופציה גם לרוסית באפליקציה גם בחיבור וגם בתוכנה עצמה."
 *
 * THIS IS A COVERAGE GUARD, and it is the point of the whole section. The
 * window's translator is keyed by the Hebrew sentence, so a sentence with no
 * entry renders in Hebrew — safe, but silent. Add a line of Hebrew UI to
 * index.html and nothing anywhere would tell you it is now the one Hebrew
 * line in a Russian window. This fails instead, and names it.
 */
{
  const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
  const html = read('desktop/renderer/index.html');
  const js = read('desktop/renderer/i18n.js');

  /* The dictionary's keys. */
  const body = js.slice(js.indexOf('var RU = {'), js.indexOf('var ATTRS'));
  const keys = new Set([...body.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]));
  is(keys.size >= 80, `the program's dictionary is populated — ${keys.size} entries`);

  /* Every Hebrew sentence the window shows, the way the translator sees it. */
  /*
   * THE SWITCH'S OWN LABELS ARE NOT TRANSLATED, and must not be: a language
   * is named in its own language. "עברית" stays "עברית" in a Russian window,
   * which is exactly how somebody who cannot read Russian finds the way back.
   * Caught by this guard on its first run, which is the guard working.
   */
  const visible = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '')
    .replace(/<div class="anxl-wrap"[\s\S]*?<\/div>/g, '');
  const tidy = (x: string) => x.replace(/\s+/g, ' ').trim();
  const found = new Set<string>();
  for (const m of visible.matchAll(/>([^<>]*[\u0590-\u05FF][^<>]*)</g)) found.add(tidy(m[1]));
  for (const m of visible.matchAll(/(?:placeholder|aria-label|title)="([^"]*[\u0590-\u05FF][^"]*)"/g)) found.add(tidy(m[1]));

  const untranslated = [...found].filter((x) => x && !keys.has(x));
  is(
    untranslated.length === 0,
    `every Hebrew line in the program's window has a Russian entry — these do not: ${untranslated.join(' | ')}`,
  );

  /*
   * ─── AND app.js, WHICH IS WHERE MOST OF THE WINDOW'S WORDS LIVE ────────
   *
   * This guard read index.html and stopped there, and index.html is the
   * static frame. Every status, every empty state, every greeting and every
   * line of the activity log is written by app.js while the program runs —
   * about eighty sentences, none of which this was looking at. The window
   * passed its coverage guard with most of its words still in Hebrew, which
   * is exactly what he was telling me: "עדיין יש כפתורים והרבה דברים
   * בעברית."
   *
   * So app.js is read too, with the TypeScript parser rather than a regex,
   * because a regex over source code cannot tell a sentence from a selector.
   * Both kinds of string it holds are counted: the fixed ones, and the ones
   * built around a value (`לפני ${m} דק׳`), which need a § pattern.
   */
  const appSrc = read('desktop/renderer/app.js');
  const app = ts.createSourceFile('app.js', appSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const patBody = js.slice(js.indexOf('var RU_PAT = {'), js.indexOf("var ATTRS"));
  const patKeys = new Set([...patBody.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]));
  is(patKeys.size > 0, `the program has patterns for its live lines — ${patKeys.size}`);

  const appPlain = new Set<string>();
  const appPat = new Set<string>();
  const walk = (n: ts.Node): void => {
    if (ts.isTemplateExpression(n)) {
      let shape = n.head.text;
      for (const span of n.templateSpans) shape += '§' + span.literal.text;
      shape = tidy(shape);
      if (/[\u0590-\u05FF]/.test(shape)) appPat.add(shape);
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const text = tidy(n.text);
      if (/[\u0590-\u05FF]/.test(text)) appPlain.add(text);
    }
    ts.forEachChild(n, walk);
  };
  walk(app);
  is(appPlain.size > 40, `the parser read the program's own lines — ${appPlain.size}`);

  /* A language is named in its own language, here as on the website. */
  const SELF_NAMED = new Set(['עברית']);
  const appMissing = [...appPlain].filter(
    (x) => !keys.has(x) && !SELF_NAMED.has(x) && (x.match(/[\u0590-\u05FF]/g) ?? []).length >= 2,
  );
  is(
    appMissing.length === 0,
    `every line app.js writes has a Russian entry — these do not: ${appMissing.join(' | ')}`,
  );
  const appPatMissing = [...appPat].filter((x) => !patKeys.has(x));
  is(
    appPatMissing.length === 0,
    `and every line it builds around a value has a pattern — these do not: ${appPatMissing.join(' | ')}`,
  );

  /* The § count has to agree, or the value is dropped or a hole is left. */
  const patEntries = [...patBody.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',?$/gm)].map(
    (m) => [m[1], m[2]] as [string, string],
  );
  const slots = (x: string) => (x.match(/§/g) ?? []).length;
  const lopsided = patEntries.filter(([he, ru]) => slots(he) !== slots(ru)).map(([he]) => he);
  is(lopsided.length === 0, `every pattern keeps its value slots — ${lopsided.join(' | ')}`);
  const patLatin = patEntries.filter(([, ru]) => !/[\u0400-\u04FF]/.test(ru)).map(([he]) => he);
  is(patLatin.length === 0, `every pattern translation is in Cyrillic — ${patLatin.join(' | ')}`);

  /* The same three traps the website's dictionary is held to. */
  const entries = [...body.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*$|^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',?$/gm)]
    .filter((m) => m[2] !== undefined)
    .map((m) => [m[2], m[3]] as [string, string]);
  const selfy = entries.filter(([he, ru]) => he.trim() === ru.trim()).map(([he]) => he);
  is(selfy.length === 0, `no entry is its own translation — ${selfy.join(' | ')}`);
  const latin = entries.filter(([, ru]) => !/[\u0400-\u04FF]/.test(ru)).map(([he]) => he);
  is(latin.length === 0, `every translation is in Cyrillic, not transliterated — ${latin.join(' | ')}`);

  /* The translator has to be loaded, and BEFORE app.js, or the first paint is
     Hebrew and then flickers. */
  is(/<script src="i18n\.js"><\/script>/.test(html), 'the translator is loaded');
  /* The SCRIPT TAGS, not any mention: a comment above talks about app.js and
     would otherwise decide this comparison. */
  is(
    html.indexOf('<script src="i18n.js">') < html.indexOf('<script src="app.js">'),
    'and before app.js, so the window opens already in the chosen language',
  );
  /*
   * ─── ONE PRODUCT, ONE WORD FOR THE SAME THING ───────────────────────────
   *
   * Two dictionaries, written months apart: this window's and the website's.
   * Thirty-five Hebrew sentences are in BOTH, and eight of them had drifted
   * into two different Russian words for the same status —
   *
   *     נכשל   the window: "Не удалось"      the site: "Сбой"
   *     נעצר   the window: "Остановлено"     the site: "Стоп"
   *
   * — which the customer reads as two programs. Nothing could have caught it:
   * each dictionary is self-consistent and each suite only ever read one.
   * They are aligned now, and this is what keeps them aligned: a shared
   * sentence must have the same Russian on both sides, or say here why not.
   */
  const web = readFileSync(new URL('../../src/lib/social/i18n.ts', import.meta.url), 'utf8');
  const pairs = (text: string) =>
    new Map([...text.matchAll(/^\s+'((?:[^'\\]|\\.)*)': '((?:[^'\\]|\\.)*)',$/gm)].map((m) => [m[1], m[2]]));
  const here = pairs(body);
  const there = pairs(web);
  const shared = [...here.keys()].filter((k) => there.has(k));
  is(shared.length >= 30, `the two dictionaries share sentences — ${shared.length} of them`);
  const drifted = shared
    .filter((k) => here.get(k) !== there.get(k))
    .map((k) => `${k}  window: ${here.get(k)}  site: ${there.get(k)}`);
  is(
    drifted.length === 0,
    `and every shared sentence reads the same in both — the window and the site speak one language${drifted.length ? `\n      ${drifted.join('\n      ')}` : ''}`,
  );

  /* It must ship. scripts/build-app.mjs copies the whole renderer folder, and
     this is the assertion that notices if that ever becomes a file list. */
  const build = read('scripts/build-app.mjs');
  is(
    /renderer'\), path\.join\(out, 'renderer'\), \{ recursive: true \}/.test(build),
    'and the whole renderer folder ships, so the translator goes with it',
  );
}

void main();
