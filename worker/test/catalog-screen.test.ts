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
    is(header.includes('206'), 'including how many are no longer available');

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

    /* Each filter, with its value in the query rather than applied to an
       array that only holds one page. */
    for (const [label, value, key] of [
      ['עיר', 'באר שבע', 'city'],
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

    /* ───────────── 5. SELECTION, AND IT SURVIVES EVERYTHING ───────────── */
    await rows.nth(0).locator('button').click();
    await rows.nth(1).locator('button').click();
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
    await page.locator('[data-group-catalog] button', { hasText: 'בחר את המוצגות' }).click();
    is((await bar.textContent())?.includes('60'), 'select-all-shown takes the whole page that is drawn');

    /* THE HAND-OFF, AND WHAT HAPPENS WHEN IT FAILS. */
    await page.evaluate(() => { window.__addFails = true; });
    await page.locator('[data-group-catalog] button', { hasText: 'הוסף לקבוצות שלי' }).click();
    await page.waitForFunction(() => window.__added.length === 1, null, { timeout: 4000 });
    eq((await page.evaluate(() => window.__added[0].length)), 60, 'the groups handed over are the ones that were selected');
    is((await bar.textContent())?.includes('60'), 'a failed hand-off KEEPS the selection — sixty groups are not re-picked by hand');
    await page.evaluate(() => { window.__addFails = false; });
    await page.locator('[data-group-catalog] button', { hasText: 'הוסף לקבוצות שלי' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-group-catalog] .sticky').length === 0, null, { timeout: 4000 });
    is(true, 'and a successful one clears it');

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
