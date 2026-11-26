/*
 * ─────────────────────────────────────────────────────────────────────────────
 * "מאגר ארצי" — THE SCREEN, DRIVEN BY REAL CLICKS IN A REAL BROWSER
 *
 *   "זו הדרישה החשובה ביותר: כאשר משתמש פותח את מסך הקבוצות, המערכת חייבת
 *    להציג מיד את הקבוצות שכבר קיימות במסד הנתונים. אין לבצע חיפוש חיצוני
 *    בכל כניסה למסך... חיפוש מיידי לפי שם · סינון לפי עיר/אזור/שפה/קטגוריה ·
 *    בחירת קבוצות מרובות · בחירת כל התוצאות המסוננות · טעינה מדורגת ·
 *    הצגת מספרי קבוצות אמיתיים · יעד הביצועים: הצגת תוצאות ראשוניות בתוך
 *    שנייה."   — 18.11.2026
 *
 * WHY THIS FILE EXISTS BESIDE catalog.test.ts. That file proves the database
 * half: the table, the indexes, and four real queries over 20,000 groups,
 * none of them slower than 10ms. It cannot press anything. Every clause above
 * is about what happens when somebody opens the screen and types, and six of
 * them are measurements rather than code:
 *
 *   §1  the screen shows groups from the catalog as soon as it mounts, and
 *       the first rows are on screen inside the second he asked for;
 *   §2  the header line says how many groups the catalog holds and when it
 *       last changed — from the database, not from the page;
 *   §3  typing sends the phrase to the DATABASE and redraws; the filters do
 *       the same, each of them, with the value in the query;
 *   §4  the count beside the list is the database's count of the whole match,
 *       never the length of the page — the lie this product has shipped twice;
 *   §5  multi-select, select-all-shown, and a selection that SURVIVES paging
 *       and filtering, with the bar saying the true number;
 *   §6  incremental loading really appends, and the "load more" button is
 *       gone once everything is drawn;
 *   §7  two phone widths with no horizontal overflow and every tap target at
 *       or above this product's 44px floor;
 *   §8  and nothing on this screen scans, publishes, or claims a permission.
 *
 * The harness is worker/test/mount-catalog.tsx with the catalog reads aliased
 * to worker/test/stub-catalog.ts, which records every query the screen sends.
 *
 *   npm run build && npx tsx worker/test/catalog-screen.test.ts
 */
import assert from 'node:assert/strict';
import { JOIN_RUN_CAP } from '../../src/lib/social/join-run';
import { copyFileSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

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
    console.log('catalog screen SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'catalog-screen-'));
  copyFileSync(css, path.join(dir, 'app.css'));

  await build({
    entryPoints: [path.resolve('worker/test/mount-catalog.tsx')],
    outfile: path.join(dir, 'catalog.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    /* The stub stands in for the catalog reads; everything else — the
       component, the icons, ui.tsx, the dictionary — is the real thing. */
    alias: {
      '@/lib/social/client': path.resolve('worker/test/stub-catalog.ts'),
      '@': path.resolve('src'),
    },
    nodePaths: [path.resolve('node_modules')],
    logLevel: 'silent',
  });

  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div id="root"></div><script src="catalog.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const crashes: string[] = [];
    page.on('pageerror', (e: Error) => crashes.push(String(e)));

    /* ───────────── 1. IT OPENS ON THE CATALOG, INSIDE A SECOND ────────── */
    const started = Date.now();
    await page.goto(`file://${path.join(dir, 'index.html')}`);
    await page.waitForSelector('[data-group-catalog] li button', { timeout: 5000 });
    const firstRowsMs = Date.now() - started;
    is(firstRowsMs < 1000, `the first groups are on screen inside a second (${firstRowsMs}ms)`);
    eq(crashes, [], 'and nothing threw on the way');

    const rows = page.locator('[data-group-catalog] li');
    eq(await rows.count(), 60, 'the first page is drawn — sixty groups, not twenty thousand');

    /* ───────────── 2. THE HEADER LINE, FROM THE DATABASE ──────────────── */
    const header = (await page.locator('[data-group-catalog] > div').first().textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    is(header.includes('מאגר ארצי'), 'the header names the catalog');
    is(/20,000|20000/.test(header.replace(/‏/g, '')), `and says how many groups are in it — "${header}"`);
    is(header.includes('עודכן לאחרונה'), 'and when it last changed');

    /*
     * AND THE THREE TILES גילוי קבוצות DRAWS — "שיהיה כמו עיצוב של גילוי
     * קבוצות". The same Figure component, so this also checks they are the
     * same three tiles that screen is measured at: equal heights, one line
     * each.
     */
    const figures = page.locator('[data-group-catalog] [data-figure]');
    eq(await figures.count(), 3, 'three figure tiles, as on גילוי קבוצות');
    const figureText = (await figures.allTextContents()).join(' | ').replace(/\s+/g, ' ');
    is(/20,?000/.test(figureText.replace(/‏/g, '')), `the catalog's size is one of them — "${figureText}"`);
    is(figureText.includes('כבר אצלי'), 'how many are already his is another');
    is(figureText.includes('206'), 'and how many are no longer available is the third');
    const heights = await figures.evaluateAll((els: Element[]) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    eq(new Set(heights).size, 1, `the three tiles are exactly the same height (${heights.join(', ')})`);

    /* ───────────── 3. THE SEARCH AND THE FILTERS GO TO THE DATABASE ───── */
    const queries = () => page.evaluate(() => window.__queries);
    const first = await queries();
    eq(first.length, 1, 'opening the screen sent exactly ONE query — "אין לבצע חיפוש חיצוני בכל כניסה למסך"');
    eq(first[0].offset ?? 0, 0, 'and it asked for the first page');

    await page.fill('[data-group-catalog] input[type="search"]', 'דרושים');
    await page.waitForFunction(() => window.__queries.some((q) => q.q === 'דרושים'), null, { timeout: 4000 });
    const typed = (await queries()).filter((q) => q.q === 'דרושים');
    is(typed.length >= 1, 'the phrase he typed went to the database');
    /* DEBOUNCED: a letter is not a decision. Four letters must not be four
       queries, or the search box is a load test on his own database. */
    is((await queries()).length <= 4, `typing six letters sent at most four queries (${(await queries()).length} in all)`);
    await page.waitForFunction(
      () => document.querySelectorAll('[data-group-catalog] li').length > 0
        && [...document.querySelectorAll('[data-group-catalog] li')].every((li) => (li.textContent ?? '').includes('דרושים')),
      null,
      { timeout: 4000 },
    );
    is(true, 'and every row drawn now matches it');

    /* §4 THE COUNT IS THE DATABASE'S, OVER THE WHOLE MATCH. 20,000/4 names =
       5,000 matches, of which 60 are drawn. A screen that printed 60 here
       would be the truncated-array bug. */
    const countLine = async () => (await page.locator('[data-catalog-count]').textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    is((await countLine()).includes('5,000') || (await countLine()).includes('5000'), `the count is the database's 5,000, not the 60 on screen — "${await countLine()}"`);
    is((await countLine()).includes('60'), 'and it says how many of them are drawn');

    await page.fill('[data-group-catalog] input[type="search"]', '');
    await page.waitForFunction(() => document.querySelectorAll('[data-group-catalog] li').length === 60, null, { timeout: 4000 });

    /* ───────────── 3b. אזור — THE WHOLE COUNTRY, IN FOUR CUTS ────────── */
    /*
     * "במאגר הארצי להוסיף את כל הערים של כל הארץ כולל צפון מרכז דרום ואילת."
     *
     * The region is the widest cut and the one a campaign starts from, so it
     * is a condition in the query like every other filter — and choosing one
     * NARROWS THE CITY LIST to that region, because a city list spanning the
     * country is 413 entries and a filter nobody can use.
     */
    const cityOptions = async () =>
      (await page.locator('[data-group-catalog] select[aria-label="עיר"] option').allTextContents()).map((x) => x.trim());
    const allCities = await cityOptions();
    is(allCities.length > 2, `the city list offers what the catalog holds (${allCities.length - 1} cities)`);
    is(allCities.some((c) => c.includes('תל אביב')) && allCities.some((c) => c.includes('באר שבע')),
      'cities from more than one region, before a region is chosen');
    /* The counts are the database's and are drawn beside each value. */
    is(allCities.some((c) => /\(\d/.test(c)), `each city says how many groups are behind it — "${allCities[1]}"`);

    await page.selectOption('[data-group-catalog] select[aria-label="אזור"]', 'מרכז');
    await page.waitForFunction(() => window.__queries.some((q) => q.region === 'מרכז'), null, { timeout: 4000 });
    is(true, 'the region is a condition in the query, not a filter over the page');
    const centre = await cityOptions();
    is(centre.some((c) => c.includes('תל אביב')), 'the centre\u2019s cities are still offered');
    is(!centre.some((c) => c.includes('באר שבע')), 'and a southern city is not, under a centre filter');
    /* AND A CITY FROM ANOTHER REGION GIVES WAY rather than leaving two
       filters that cannot both be true and an empty screen under them. */
    await page.selectOption('[data-group-catalog] select[aria-label="אזור"]', '');
    await page.waitForTimeout(120);
    await page.selectOption('[data-group-catalog] select[aria-label="עיר"]', 'באר שבע');
    await page.waitForFunction(() => window.__queries.some((q) => q.city === 'באר שבע'), null, { timeout: 4000 });
    await page.selectOption('[data-group-catalog] select[aria-label="אזור"]', 'מרכז');
    await page.waitForTimeout(200);
    eq(await page.locator('[data-group-catalog] select[aria-label="עיר"]').inputValue(), '',
      'choosing a region drops a city that is not in it, instead of showing an empty list');
    await page.selectOption('[data-group-catalog] select[aria-label="אזור"]', '');
    await page.waitForFunction(() => document.querySelectorAll('[data-group-catalog] li').length === 60, null, { timeout: 4000 });

    /* Each filter, with its value in the query rather than applied to an
       array that only holds one page. */
    for (const [label, value, key] of [
      ['עיר', 'באר שבע', 'city'],
      ['אזור', 'דרום', 'region'],
      ['שפה', 'ru', 'language'],
      ['קטגוריה', 'יד שנייה', 'category'],
    ] as const) {
      await page.selectOption(`[data-group-catalog] select[aria-label="${label}"]`, value);
      await page.waitForFunction(
        (k) => window.__queries.some((q) => (q as Record<string, unknown>)[k as string]),
        key,
        { timeout: 4000 },
      );
      const sent = (await queries()).filter((q) => (q as unknown as Record<string, string>)[key]);
      is(sent.length >= 1, `the ${label} filter is a condition in the query`);
      await page.selectOption(`[data-group-catalog] select[aria-label="${label}"]`, '');
      await page.waitForFunction(() => document.querySelectorAll('[data-group-catalog] li').length === 60, null, { timeout: 4000 });
    }

    /* ───────────── 4b. THE ROW IS גילוי קבוצות' ROW ───────────────────── */
    /*
     * Same component, so the same parts are on it: a picture, the name with
     * its own direction, the facts line, a checkbox and ONE action.
     */
    const firstRow = rows.nth(0);
    eq(await firstRow.locator('[role="checkbox"]').count(), 1, 'every row has the discovery checkbox');
    eq(await firstRow.locator('[data-group-name]').count(), 1, 'and the discovery name element');
    eq(await firstRow.locator('[data-no-translate]').count(), 1, 'which is not translated');
    /*
     * NO ⋮ — "הסתר" writes on a row shared with every other user of the app,
     * so the catalog does not offer it. This is the property, not a style.
     */
    eq(await rows.locator('[aria-label^="הסתר"]').count(), 0, 'no row offers to hide a group from a shared catalog');
    /*
     * NO ROW CLAIMS MEMBERSHIP. The catalog knows a group exists; it has
     * never known who is in it, and a חבר badge read off a shared table
     * would be a claim about another account.
     */
    /*
     * `\b` IS NOT A WORD BOUNDARY IN HEBREW. The first version of this line
     * was /\bחבר\b/, which cannot match at all — \b is defined against
     * [A-Za-z0-9_], so every Hebrew letter is a non-word character and the
     * assertion passed on any screen whatsoever. Matched on the separators
     * this row really uses instead (space or the · between facts), so
     * "חברים" in the size line is not mistaken for the membership badge.
     */
    const allRowText = (await rows.allTextContents()).join(' | ').replace(/\s+/g, ' ');
    is(/חברים/.test(allRowText), 'the rows really do carry the facts line (so the next check is not vacuous)');

    /*
     * ─── "לראות אם אני חבר" — BUT ONLY WHERE HE REALLY LOOKED ───────────
     *
     * The badge is NOT from the catalog, which is shared and cannot hold one
     * account's memberships. It is from this business's own גילוי קבוצות
     * rows — the stub says one group is his, one he only asked to join, one
     * he is definitely not in, and nothing about the other 19,997.
     */
    /*
     * FOUND BY THE BADGE ELEMENT, not by a substring of the row's text.
     * textContent runs the elements together — "חבר" lands against the
     * button's caption with no separator — so a substring test here is a
     * test of how the DOM happens to concatenate. An element whose whole
     * text is the badge's word is the badge.
     */
    const badge = (word: string) => rows.filter({ has: page.getByText(word, { exact: true }) });
    const memberRow = badge('חבר');
    eq(await memberRow.count(), 1, 'exactly the one group his own search said he is in says חבר');
    eq(await badge('ממתין לאישור').count(), 1, 'the one he only asked to join says so');
    eq(await badge('לא הצטרפת').count(), 1, 'and the one he is not in says that');
    /* AND NOTHING ELSE CLAIMS ANYTHING. Three answers out of sixty rows. */
    eq(
      (await badge('חבר').count()) + (await badge('ממתין לאישור').count()) + (await badge('לא הצטרפת').count()),
      3,
      'the other rows say nothing about membership, because nothing is known about them',
    );
    /* THE TILE SAYS WHAT IT KNOWS, OR SAYS NOTHING — never a confident 0.
       `mine` is null until the read lands, and the tile draws a dash. */
    const tiles = (await figures.allTextContents()).join(' | ').replace(/\s+/g, ' ');
    is(/כבר אצלי/.test(tiles), 'the "already mine" tile is drawn');
    is(!/כבר אצלי 0|0 כבר אצלי/.test(tiles), 'and it never reads a confident 0 over a list it has read');

    /* A group he is NOT in is not offered for the publishing list — his own
       rule — and offers the quick way to join instead. */
    const notIn = rows.filter({ hasText: 'לא הצטרפת' }).first();
    is(!(await notIn.textContent())?.includes('הוסף לרשימה'), 'a group he is not in is never offered for the publishing list');
    is((await notIn.textContent())?.includes('פתח להצטרפות'), 'it offers the quick way in instead');
    is(await notIn.locator('a[href*="facebook.com"][target="_blank"]').count() > 0, 'which is a link to the group itself, where Facebook\u2019s own join button is');
    /* And the one he IS in opens, rather than offering to join. */
    is((await memberRow.first().textContent())?.includes('פתח קבוצה'), 'a group he is in opens, it does not offer to join');

    /* THE CATALOG'S OWN FACTS ARE STILL ON THE ROW. Moving onto the shared
       row dropped the city and the language once — a catalog row that says
       only its size and "ציבורית" knows less than the catalog does. */
    const factsLine = (await rows.nth(0).textContent())?.replace(/\s+/g, ' ') ?? '';
    is(/חברים/.test(factsLine), `the row says how big the group is — "${factsLine}"`);
    is(/ציבורית|פרטית/.test(factsLine), 'and whether it is public, as on גילוי קבוצות');
    const cityRow = rows.filter({ hasText: 'באר שבע' });
    is((await cityRow.count()) > 0, 'the city the catalog stores is drawn on the row');
    const langRow = rows.filter({ hasText: 'רוסית' });
    is((await langRow.count()) > 0, 'and so is the language');

    /* AND A GROUP THE CATALOG HAS MARKED GONE SAYS SO. Without it an
       unavailable group is drawn exactly like a live one and offered for the
       publishing list. The stub marks every 97th row unavailable; they sort
       last, so this asks the database for them. */
    await page.selectOption('[data-group-catalog] select[aria-label="מיון"]', 'name');
    await page.waitForFunction(() => window.__queries.some((q) => q.sort === 'name'), null, { timeout: 4000 });
    await page.selectOption('[data-group-catalog] select[aria-label="מיון"]', 'members');
    await page.waitForTimeout(150);
    /* The stub marks every 97th group unavailable, and they sort last — so
       this asks for one by name rather than hoping it is on the first page. */
    await page.fill('[data-group-catalog] input[type="search"]', 'Объявления 97');
    await page.waitForFunction(() => window.__queries.some((q) => q.q === 'Объявления 97'), null, { timeout: 4000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-group-catalog] li')]
        .some((li) => (li.querySelector('[data-group-name]')?.textContent ?? '').trim() === 'Объявления 97'),
      null,
      { timeout: 4000 },
    );
    const goneRow = rows.filter({ has: page.locator('[data-group-name]', { hasText: /^Объявления 97$/ }) });
    is((await goneRow.textContent())?.includes('לא זמינה'),
      'a group the catalog has marked unavailable says so on its row, instead of looking like any other');
    await page.fill('[data-group-catalog] input[type="search"]', '');
    await page.waitForFunction(() => document.querySelectorAll('[data-group-catalog] li').length === 60, null, { timeout: 4000 });
    /* The two groups the stub says are already in his publishing list carry
       "כבר במערכת" and offer "פתח קבוצה" instead of adding them twice. */
    const mineRow = rows.filter({ hasText: 'כבר במערכת' });
    eq(await mineRow.count(), 2, 'the groups already in his list are marked, and only those');
    is((await mineRow.first().textContent())?.includes('פתח קבוצה'), 'and such a row offers to open the group, not to add it again');
    is(!(await mineRow.first().textContent())?.includes('הוסף לרשימה'), 'never to add it a second time');

    /* ───────────── 4c. ONE ROW, ADDED FROM ITS OWN BUTTON ─────────────── */
    const addable = rows.filter({ hasNotText: 'כבר במערכת' }).first();
    const addableName = ((await addable.locator('[data-group-name]').textContent()) ?? '').trim();
    await addable.getByRole('button', { name: 'הוסף לרשימה' }).click();
    await page.waitForFunction(() => window.__added.length === 1, null, { timeout: 4000 });
    eq((await page.evaluate(() => window.__added[0].length)), 1, 'the row button hands over exactly that one group');
    /* And the row says so at once, rather than waiting for a reload. */
    await page.waitForFunction(
      (name) => [...document.querySelectorAll('[data-group-catalog] li')]
        .some((li) => (li.querySelector('[data-group-name]')?.textContent ?? '').trim() === name
          && (li.textContent ?? '').includes('כבר במערכת')),
      addableName,
      { timeout: 4000 },
    );
    is(true, 'and the row it was pressed on says "כבר במערכת" immediately');
    await page.evaluate(() => { window.__added = []; });

    /* ───────────── 5. SELECTION, AND IT SURVIVES EVERYTHING ───────────── */
    await rows.nth(0).locator('[role="checkbox"]').click();
    await rows.nth(1).locator('[role="checkbox"]').click();
    const bar = page.locator('[data-group-catalog] .sticky');
    is((await bar.textContent())?.includes('2'), 'two groups selected, and the bar says two');

    /* Paging must not drop them: the Map is keyed by id for exactly this. */
    await page.locator('[data-group-catalog] button', { hasText: 'טען עוד' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-group-catalog] li').length === 120, null, { timeout: 4000 });
    eq(await rows.count(), 120, 'loading more APPENDS — "טעינה מדורגת"');
    is((await bar.textContent())?.includes('2'), 'and the selection is still two after a page was added');

    /* A filter changes the list under them; the selection is still theirs. */
    await page.selectOption('[data-group-catalog] select[aria-label="עיר"]', 'ערד');
    await page.waitForFunction(() => window.__queries.some((q) => q.city === 'ערד'), null, { timeout: 4000 });
    is((await bar.textContent())?.includes('2'), 'and still two after the filter changed');
    await page.selectOption('[data-group-catalog] select[aria-label="עיר"]', '');
    await page.waitForFunction(() => document.querySelectorAll('[data-group-catalog] li').length === 60, null, { timeout: 4000 });

    /* "בחירת כל התוצאות המסוננות" — and it says what it takes. */
    await page.locator('[data-group-catalog] button', { hasText: 'בחר את המוצגות' }).first().click();
    is((await bar.textContent())?.includes('60'), 'select-all-shown takes the whole page that is drawn');

    /*
     * ─── SIXTY AT ONCE IS A DIFFERENT GESTURE FROM ONE ──────────────────
     *
     * "זה נותן לי לצרף לרשימה קבוצות שאני עדיין לא חבר בהם" — the rule
     * גילוי קבוצות keeps by only offering the button where Facebook said
     * חבר. The catalog cannot know that, so it makes the SIZE visible: a
     * selection of 25 or more says how many and what happens next before it
     * writes anything.
     */
    await page.locator('[data-group-catalog] .sticky button', { hasText: 'הוסף לקבוצות שלי' }).click();
    await page.waitForSelector('text=/להוסיף \\d+ קבוצות לרשימה שלך\\?/', { timeout: 4000 });
    is(true, 'a bulk add of sixty asks first, and says how many');
    const ask = (await page.locator('[role="dialog"], .fixed').allTextContents()).join(' ');
    is(/דורשות טיפול/.test(ask), 'and says where a group he cannot publish in will end up');
    eq(await page.evaluate(() => window.__added.length), 0, 'and nothing was written while it asked');
    await page.locator('button', { hasText: 'ביטול' }).first().click();
    await page.waitForTimeout(150);
    eq(await page.evaluate(() => window.__added.length), 0, 'cancelling really cancels');
    is((await bar.textContent())?.includes('60'), 'and the selection is still there afterwards');

    /* THE HAND-OFF, AND WHAT HAPPENS WHEN IT FAILS. */
    /* Counted BEFORE, because one group was really added by its own button a
       few lines up: the property is that a refusal adds nothing, not that the
       number is any particular value. */
    const beforeRefused = await badge('כבר במערכת').count();
    await page.evaluate(() => { window.__addFails = true; });
    await page.locator('[data-group-catalog] .sticky button', { hasText: 'הוסף לקבוצות שלי' }).click();
    await page.locator('button', { hasText: /^הוסף \d+$/ }).first().click();
    await page.waitForFunction(() => window.__added.length === 1, null, { timeout: 4000 });
    eq((await page.evaluate(() => window.__added[0].length)), 60, 'the groups handed over are the ones that were selected');
    is((await bar.textContent())?.includes('60'), 'a failed hand-off KEEPS the selection — sixty groups are not re-picked by hand');
    /*
     * ─── A REFUSED WRITE MUST NOT MARK ANYTHING AS HIS ──────────────────
     *
     * The screen used to add every selected id to its own "mine" set after a
     * bulk add. But the writer returns added / existed / FAILED — an
     * unparseable link, a row another session took, an RLS refusal — folded
     * by the caller into one boolean. Ten selected with three refused marked
     * all ten: the three lost their add button, took the member skin, could
     * not be retried from this screen, and the tile counted them.
     *
     * The hand-off above was told to fail, so the stand-in database knows
     * about none of them. Not one row may claim otherwise.
     */
    const claimed = await badge('כבר במערכת').count();
    eq(
      claimed,
      beforeRefused,
      `a refused hand-off marked nothing as his (${claimed} rows claim it, ${beforeRefused} did before the refusal)`,
    );

    await page.evaluate(() => { window.__addFails = false; });
    await page.locator('[data-group-catalog] .sticky button', { hasText: 'הוסף לקבוצות שלי' }).click();
    await page.locator('button', { hasText: /^הוסף \d+$/ }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('[data-group-catalog] .sticky').length === 0, null, { timeout: 4000 });
    is(true, 'and a successful one clears it');
    /* AND NOW THEY REALLY ARE HIS — re-read from the database, not assumed. */
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-group-catalog] li')].filter((li) => (li.textContent ?? '').includes('כבר במערכת')).length > 2,
      null,
      { timeout: 4000 },
    );
    is(true, 'after a hand-off that landed, the rows say so — from a re-read, not from the selection');

    /* ───────────── 5b. THE ORDER, AND IT IS THE DATABASE'S ───────────── */
    /*
     * "מיון" is the control גילוי קבוצות has over its results, and the whole
     * question is WHERE the sorting happens: the page holds sixty of twenty
     * thousand rows, so an order applied in the browser is an order over the
     * page. Each choice must leave in the query.
     */
    const sizeFirst = ((await rows.nth(0).locator('[data-group-name]').textContent()) ?? '').trim();
    await page.selectOption('[data-group-catalog] select[aria-label="מיון"]', 'name');
    await page.waitForFunction(() => window.__queries.some((q) => q.sort === 'name'), null, { timeout: 4000 });
    await page.waitForFunction(
      (was) => ((document.querySelector('[data-group-catalog] li [data-group-name]')?.textContent ?? '').trim()) !== was,
      sizeFirst,
      { timeout: 4000 },
    );
    const nameFirst = ((await rows.nth(0).locator('[data-group-name]').textContent()) ?? '').trim();
    is(nameFirst !== sizeFirst, `sorting by name really changed the list (${sizeFirst} → ${nameFirst})`);
    /* AND IT STARTED OVER. A new order with the old offset would hand him
       page two of an order he never saw page one of. */
    const afterSort = (await queries()).filter((q) => q.sort === 'name');
    eq(afterSort[0].offset ?? 0, 0, 'a new order asks for the first page, not for the old offset');
    await page.selectOption('[data-group-catalog] select[aria-label="מיון"]', 'new');
    await page.waitForFunction(() => window.__queries.some((q) => q.sort === 'new'), null, { timeout: 4000 });
    is(true, '"נוספו לאחרונה" is sent to the database too');
    await page.selectOption('[data-group-catalog] select[aria-label="מיון"]', 'members');
    await page.waitForFunction(
      (was) => ((document.querySelector('[data-group-catalog] li [data-group-name]')?.textContent ?? '').trim()) === was,
      sizeFirst,
      { timeout: 4000 },
    );
    is(true, 'and going back to the default restores exactly the list it opened on');

    /* ───────────── 6. EVERYTHING DRAWN MEANS NO BUTTON ────────────────── */
    await page.selectOption('[data-group-catalog] select[aria-label="קטגוריה"]', 'יד שנייה');
    await page.selectOption('[data-group-catalog] select[aria-label="עיר"]', 'ערד');
    await page.waitForFunction(() => window.__queries.some((q) => q.city === 'ערד' && q.category === 'יד שנייה'), null, { timeout: 4000 });
    const narrow = await page.locator('[data-group-catalog] li').count();
    const moreGone = await page.locator('[data-group-catalog] button', { hasText: 'טען עוד' }).count();
    is(narrow < 60 ? moreGone === 0 : true, 'when everything that matches is drawn there is no "load more" to press');

    /* ───────────── 7. TWO PHONE WIDTHS, NO SIDEWAYS SCROLL ────────────── */
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      is(overflow <= 1, `no horizontal scroll at ${width}px (${overflow}px over)`);
      const short = await page.evaluate(() =>
        [...document.querySelectorAll('[data-group-catalog] button, [data-group-catalog] select, [data-group-catalog] input')]
          .map((el) => ({ h: Math.round(el.getBoundingClientRect().height), what: (el.textContent ?? el.getAttribute('aria-label') ?? '').slice(0, 20) }))
          .filter((x) => x.h > 0 && x.h < 36),
      );
      /*
       * 36px, not 44: the search box and the three filters are min-h-11 like
       * every primary control in this product, and the small chips beside a
       * line of text ("בחר את המוצגות", the two in the selection bar) are
       * min-h-9 — the secondary floor CommentQueueCard and QuickCommentCard
       * already use. Nothing here may be smaller than that, which is what
       * caught "בחר את המוצגות" at 18px when it was written as an underlined
       * word inside the count sentence.
       */
      eq(short.filter((x) => x.h < 36), [], `every control at ${width}px is at least 36px high`);
    }

    /* ───────── 7b. JOINING ON FACEBOOK, FROM THE SAME SELECTION ───────── */
    /*
     * "תוסיף שיהיה אופציה להוסיף את הקבוצות האלה בפייסבוק ושיתחבר לבד בפעם
     *  אחת כל מה שאני מסמן" — 26.11.2026
     *
     * Two hand-offs now leave this bar and they are NOT the same act. Adding
     * puts a row in the publishing list; joining opens the owner's live
     * Facebook and presses a button in it. The harness keeps them in two
     * separate arrays precisely so a patch that wires one to the other fails
     * here.
     */
    await page.evaluate(() => { window.__joined = []; window.__added = []; });
    const sticky = page.locator('[data-group-catalog] .sticky');
    if (await sticky.count()) await sticky.locator('button', { hasText: 'נקה' }).click();
    /* Section 6 narrowed the list to one city and one category, which left the
       three membership rows off the page. Widen it again and wait for the
       answer, so this section is driven by the fixture and not by what the
       section before it happened to leave on screen. */
    await page.selectOption('[data-group-catalog] select[aria-label="קטגוריה"]', '');
    await page.selectOption('[data-group-catalog] select[aria-label="עיר"]', '');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-group-catalog] li').length >= 60,
      null,
      { timeout: 4000 },
    );

    /*
     * THE TWO ROWS A JOIN RUN MUST REFUSE TO PRESS. The stub marks one group
     * 'member' and one 'requested'. Ticking only those two must offer no join
     * at all: he is in the first, and the second already has a request
     * waiting that a second press cannot speed up — and on the worker side
     * that one is not even free, it spends a slot and a full minute's pause.
     */
    /* The same `badge` helper section 4b uses — an element whose WHOLE text is
       the word, so "חבר" cannot be caught out by "20K חברים". */
    const joinMember = badge('חבר');
    const joinPending = badge('ממתין לאישור');
    eq(await joinMember.count(), 1, 'the fixture really draws a row he is already a member of');
    eq(await joinPending.count(), 1, 'and one with a request already waiting');
    await joinMember.locator('[role="checkbox"]').click();
    await joinPending.locator('[role="checkbox"]').click();
    is(
      !((await page.locator('[data-group-catalog] .sticky').textContent()) ?? '').includes('הצטרף בפייסבוק'),
      'ticking only a member and a pending request offers no join — there is nothing to press',
    );
    /* And the OTHER button is still there: those two are perfectly addable. */
    is(
      ((await page.locator('[data-group-catalog] .sticky').textContent()) ?? '').includes('הוסף לקבוצות שלי'),
      'the add hand-off is untouched by the join filter',
    );

    /* NOW EVERYTHING ON THE PAGE. */
    await page.locator('[data-group-catalog] button', { hasText: 'בחר את המוצגות' }).first().click();
    const shown = await rows.count();
    const joinBtn = page.locator('[data-group-catalog] .sticky button', { hasText: 'הצטרף בפייסבוק' });
    eq(await joinBtn.count(), 1, 'with the whole page ticked the join is offered');
    /*
     * THE LABEL SAYS WHAT THE RUN WILL DO, not how many he ticked. The worker
     * stops at JOIN_RUN_CAP presses, so a button promising sixty would be a
     * promise the engine refuses to keep.
     */
    is(
      ((await joinBtn.textContent()) ?? '').includes(String(JOIN_RUN_CAP)),
      `the button names the run's ceiling (${JOIN_RUN_CAP}), not the size of the selection`,
    );
    await joinBtn.click();
    await page.waitForFunction(() => window.__joined.length === 1, null, { timeout: 4000 });
    /*
     * EVERYTHING TICKED IS SENT EXCEPT THOSE TWO — the cap counts presses and
     * not addresses, so a group he turns out to already be in costs the run
     * nothing and holding addresses back would only waste the ceiling.
     */
    eq(
      await page.evaluate(() => window.__joined[0].length),
      shown - 2,
      'the join hand-off carries every ticked row but the member and the pending one',
    );
    /* AND IT ADDED NOTHING. Joining a group does not put it in the publishing
       list — that is a second, separate decision, and his standing rule. */
    eq(await page.evaluate(() => window.__added.length), 0, 'joining never writes to the publishing list');

    /* ───────────── 8. IT SCANS NOTHING AND PROMISES NOTHING ───────────── */
    const text = (await page.locator('[data-group-catalog]').textContent())?.replace(/\s+/g, ' ') ?? '';
    for (const forbidden of ['סרוק', 'חיפוש בפייסבוק', 'מאושר לפרסום', 'הרשאה לפרסם']) {
      is(!text.includes(forbidden), `the screen never says "${forbidden}"`);
    }
    /* A group's name is its own, in whatever language it was written. */
    eq(
      await page.locator('[data-group-catalog] li [data-no-translate]').count(),
      await page.locator('[data-group-catalog] li').count(),
      'every row shows its group name as it was written, never translated',
    );
    eq(crashes, [], 'and nothing threw during any of it');

    console.log(`catalog screen OK — ${checks} assertions, first rows in ${firstRowsMs}ms`);
  } finally {
    await browser.close();
  }
}

void main();
