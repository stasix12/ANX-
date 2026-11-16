/*
 * THE DOM TRANSLATOR, MEASURED.
 *
 * "התוכנה לא עוברת לרוסית מלאה … עדיין יש כפתורים והרבה דברים בעברית."
 *
 * t() reaches the sentences a codemod may safely wrap. This covers the rest:
 * label maps, options arrays, strings returned from helpers, attributes — the
 * shapes that hold most of this app's Hebrew and that cannot be wrapped,
 * because some of those literals are DATA (`status === 'דולג'`) and wrapping
 * them would break publishing rather than translate a screen.
 *
 * So the fixture holds bare Hebrew in exactly those shapes, and this suite
 * asserts it turns Russian — and that two things never do: what the customer
 * typed, and anything marked [data-no-translate].
 */
import assert from 'node:assert/strict';

const NAME = 'dom language';
let checks = 0;
const is = (c: unknown, what: string) => {
  checks += 1;
  assert.ok(c, what);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};

async function main(): Promise<void> {
  const { build } = await import('esbuild');
  const { mkdtempSync, readdirSync, statSync, writeFileSync, copyFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  const { chromium } = await import('playwright-core');

  const CHUNKS = path.resolve('.next/static/chunks');
  let best: { file: string; size: number } | null = null;
  try {
    for (const name of readdirSync(CHUNKS)) {
      if (!name.endsWith('.css')) continue;
      const file = path.join(CHUNKS, name);
      const size = statSync(file).size;
      if (!best || size > best.size) best = { file, size };
    }
  } catch {
    best = null;
  }
  if (!best) {
    console.log(`${NAME} OK — ${checks} assertions (SKIPPED — run \`npm run build\` first)`);
    return;
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'domlang-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-domlang.tsx')],
    outfile: path.join(dir, 'm.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<link rel="stylesheet" href="app.css"><body><div id="root"></div><script src="m.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));
    await page.goto(`file://${path.join(dir, 'index.html')}`);
    await page.waitForSelector('#map');

    const before = await page.evaluate(() => ({
      map: document.querySelector('#map')?.textContent,
      fn: document.querySelector('#fn')?.textContent,
    }));
    eq(before.map, 'ארכיון', 'it starts in Hebrew');
    eq(before.fn, 'אין עדיין קבוצות', 'including the helper-built sentence');

    await page.click('.anxl-btn[lang="ru"]');
    await page.waitForTimeout(250);

    const after = await page.evaluate(() => ({
      map: document.querySelector('#map')?.textContent,
      map2: document.querySelector('#map2')?.textContent,
      fn: document.querySelector('#fn')?.textContent,
      opts: [...document.querySelectorAll('.opt')].map((e) => e.textContent),
      btn: document.querySelector('#btn')?.textContent?.trim(),
      btnLabel: document.querySelector('#btn')?.getAttribute('aria-label'),
      btnTitle: document.querySelector('#btn')?.getAttribute('title'),
      typed: (document.querySelector('#typed') as HTMLInputElement | null)?.value,
      kept: document.querySelector('#kept')?.textContent?.trim(),
      dir: document.documentElement.getAttribute('dir'),
    }));

    eq(crashes, [], 'no page error');
    /* The shapes a codemod cannot reach — this is the whole claim. */
    eq(after.map, 'Архив', 'a label map in a module is translated');
    eq(after.map2, 'Настройки', 'and the next entry in it');
    eq(after.fn, 'Групп пока нет', 'a sentence returned from a helper is translated');
    eq(after.opts, ['Группы', 'Кампании', 'История'], 'and every item of an options array');
    eq(after.btn, 'Сохранить', 'a button caption is translated');
    eq(after.btnLabel, 'Закрыть', 'and its aria-label, which a screen reader reads');
    eq(after.btnTitle, 'Сохранить', 'and its title');
    eq(after.dir, 'ltr', 'and the document turns left-to-right');

    /* The two things it must never touch. */
    eq(after.typed, 'ארכיון', "what the customer typed is NEVER rewritten, even when it matches the dictionary");
    eq(after.kept, 'הגדרות', 'and nothing inside [data-no-translate] is touched');

    /* And back. */
    await page.click('.anxl-btn[lang="he"]');
    await page.waitForTimeout(250);
    const back = await page.evaluate(() => ({
      map: document.querySelector('#map')?.textContent,
      opts: [...document.querySelectorAll('.opt')].map((e) => e.textContent),
    }));
    eq(back.map, 'ארכיון', 'Hebrew comes back');
    eq(back.opts, ['קבוצות', 'קמפיינים', 'היסטוריה'], 'all of it');

    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`${NAME} OK — ${checks} assertions, bare Hebrew translated in a real browser`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
