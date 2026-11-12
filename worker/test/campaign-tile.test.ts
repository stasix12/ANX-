/**
 * THE COMPACT CAMPAIGN GRID, MEASURED.
 *
 * "השוואה חזותית לרפרנס ברוחב המסך הרלוונטי · בדיקה שכל הכפתורים עובדים ·
 *  בדיקת ארבעה קמפיינים במקביל · בדיקת תצוגה בטלפון ובמחשב."
 *
 * Rendered in Chromium against the REAL compiled stylesheet, at the three
 * phone widths this product is used on and one desktop width, with four
 * campaigns — the brief's own number, and the reference's.
 *
 * IT SKIPS LOUDLY WITHOUT A BUILD. Tailwind resolves at build time, so a run
 * with no .next/static/chunks/*.css would measure an unstyled page and pass
 * every assertion for the wrong reason — the trap campaign-card.test.ts
 * documents at its own head.
 *
 *   npm run build && npx tsx worker/test/campaign-tile.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/* ══════════ 1. WHAT THE TILE IS NOT ALLOWED TO DO ══════════════════════ */

{
  const tile = src('src/components/social/CampaignTile.tsx').replace(/\/\*[\s\S]*?\*\//g, '');

  /*
   * NO CLOCK, NO SCHEDULE ARITHMETIC, NO QUERY. The tile is handed what the
   * page read and prints it. The screen's other card is held to the same rule
   * by schedule-readout.test.ts, and for the same reason: a component that
   * works out its own publishing instant is a second opinion about when the
   * engine will publish.
   */
  is(!/nextPublishAt\(|nextAllowedAt\(|windowClosesAt\(|new Date\(\)/.test(tile), 'the tile computes no instant of its own');
  is(!/from '@\/lib\/social\/client'/.test(tile), 'and reads nothing — every number is handed in');

  /*
   * AND IT MAY NOT INVENT A SETTING. The reference draws a fourth speed
   * ("בטוח"); rules.ts has three. A control offering a mode nothing reads
   * would be a decorative button, which §9 forbids outright.
   */
  is(/PACE_PROFILES\.map/.test(tile), 'the speed list is built FROM rules.ts, so a card and the engine cannot disagree about a mode');
  is(!/בטוח/.test(tile), 'and the reference’s fourth mode is not invented here');

  /* The way back exists only where there is something to come back from. */
  is(/\{!running && onResume && \(/.test(tile), 'the way back is drawn only for a campaign that is actually held');
  is(/חזרה לפעילות/.test(tile), 'in the reference’s own words');
}

/* ══════════ 2. THE PAGE KEEPS BOTH VIEWS ══════════════════════════════ */

{
  const page = src('src/app/social/campaigns/page.tsx');
  is(/<CampaignTile/.test(page), 'the grid draws the compact tile');
  is(/<CampaignCard/.test(page), 'and the list still draws the card this screen already had — nothing was deleted');
  is(/grid grid-cols-2 gap-2\.5/.test(page), 'two to a row from the narrowest phone, not from a breakpoint');
  /* The same handlers, not a second way to pause a campaign. */
  is(
    (page.match(/act\(`pause-\$\{c\.id\}`/g) ?? []).length === 2 && (page.match(/act\(`resume-\$\{c\.id\}`/g) ?? []).length === 2,
    'the tile and the card start the SAME pause and resume writes — one mechanism, drawn twice',
  );
  is(/countPublishedSince\(startOfZonedDay/.test(page), "the summary strip's day count is a real query, not a sum of lifetime totals");
  is(/<StatStrip/.test(page), 'and the strip is the measured component, not a new band beside it');
}

/* ══════════ 3. THE GRID, IN A BROWSER ═════════════════════════════════ */

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
    console.log(`campaign tile OK — ${checks} assertions (the grid was SKIPPED — run \`npm run build\` first)`);
    return;
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'tile-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-tile.tsx')],
    outfile: path.join(dir, 'm.js'),
    bundle: true, format: 'iife', jsx: 'automatic', keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css"><body class="bg-ink-950"><div id="root"></div><script src="m.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  const shots: string[] = [];
  try {
    for (const width of [360, 390, 430, 1280]) {
      const w = `${width}px`;
      const page = await browser.newPage({ viewport: { width, height: 1100 }, deviceScaleFactor: 2 });
      const crashes: string[] = [];
      page.on('pageerror', (e) => crashes.push(String(e)));
      await page.goto(`file://${path.join(dir, 'index.html')}`);
      await page.waitForSelector('.anxt-tile');

      /*
       * NO NAMED ARROW INSIDE evaluate(). tsx transpiles this file with
       * esbuild's keepNames, which wraps a `const f = () => …` in a `__name`
       * helper — and the helper does not exist in the page the function is
       * serialised into. The first version used a `box` helper and died with
       * "__name is not defined"; everything here is inline for that reason.
       */
      const seen = await page.evaluate(() => {
        const tiles = Array.prototype.slice.call(document.querySelectorAll('.anxt-tile'));
        const controls = Array.prototype.slice.call(document.querySelectorAll('.anxt-tile a, .anxt-tile button, .anxt-tile select'));
        const tops: Record<string, number> = {};
        for (const t of tiles) {
          const key = String(Math.round(t.getBoundingClientRect().top));
          tops[key] = (tops[key] ?? 0) + 1;
        }
        let small = 0;
        for (const e of controls) {
          const b = e.getBoundingClientRect();
          if (b.width > 0 && (b.height < 40 || b.width < 40)) small += 1;
        }
        let clipped = 0;
        for (const e of Array.prototype.slice.call(
          document.querySelectorAll('.anxt-fig span, .anxt-fig b, .anxt-of, .anxt-pctchip, .anxt-pill, .anxt-no'),
        )) {
          if (e.scrollWidth > e.clientWidth + 1) clipped += 1;
        }
        let escaped = 0;
        const bars: { pct: number; chip: string }[] = [];
        const pills: string[] = [];
        const heights: number[] = [];
        for (const t of tiles) {
          const tb = t.getBoundingClientRect();
          heights.push(Math.round(tb.height));
          for (const e of Array.prototype.slice.call(t.querySelectorAll('a, button, select'))) {
            const b = e.getBoundingClientRect();
            if (b.width > 0 && (b.left < tb.left - 1 || b.right > tb.right + 1 || b.top < tb.top - 1 || b.bottom > tb.bottom + 1)) escaped += 1;
          }
          const track = t.querySelector('.anxt-track');
          const bar = t.querySelector('.anxt-bar');
          const chip = (t.querySelector('.anxt-pctchip') || { textContent: '' }).textContent || '';
          bars.push(
            track && bar
              ? { pct: Math.round((bar.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100), chip }
              : { pct: -1, chip },
          );
          pills.push(((t.querySelector('.anxt-pill') || { textContent: '' }).textContent || '').trim());
        }
        return {
          count: tiles.length,
          rows: Object.keys(tops).map((k) => tops[k]),
          over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          small,
          targets: controls.length,
          clipped,
          escaped,
          back: document.querySelectorAll('.anxt-back').length,
          bars,
          pills,
          rtl: getComputedStyle(tiles[0]).direction,
          tallest: Math.max.apply(null, heights),
        };
      });

      eq(seen.count, 4, `${w}: four campaigns are drawn at once — the brief's own number`);
      eq(seen.over, false, `${w}: the grid widened the page`);
      eq(seen.small, 0, `${w}: a control under the 40px floor`);
      is(seen.targets >= 20, `${w}: the measurement found the controls (${seen.targets})`);
      eq(seen.clipped, 0, `${w}: a figure or label is cut off`);
      eq(seen.escaped, 0, `${w}: a control left its own tile`);
      eq(seen.rtl, 'rtl', `${w}: the tile is not laid out right-to-left`);
      eq(seen.back, 1, `${w}: exactly the one held campaign offers the way back`);
      eq(crashes, [], `${w}: the grid threw`);

      if (width < 1280) {
        eq(seen.rows, [2, 2], `${w}: two tiles to a row, four in view — got rows of ${seen.rows.join('/')}`);
        is(seen.tallest <= 420, `${w}: the tallest tile is ${seen.tallest}px — a compact tile that tall is the card it replaced`);
      }

      /* 170/250 = 68%, 105/250 = 42%, 250/250 = 100%, 65/250 = 26% — the
         reference's own four, and the bar must be the number beside it. */
      for (const b of seen.bars) {
        const said = Number((b.chip || '').replace('%', ''));
        is(Number.isFinite(said) && Math.abs(b.pct - said) <= 2, `${w}: a bar is ${b.pct}% while its chip says ${b.chip}`);
      }
      eq(seen.bars.map((b) => b.chip), ['68%', '42%', '100%', '26%'], `${w}: the four percentages are the fixtures' own`);
      eq(seen.pills, ['פעיל', 'פעיל', 'מושהה', 'פעיל'], `${w}: three publishing and one held, as the reference draws`);

      const shot = path.join(dir, `grid-${width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      shots.push(shot);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`campaign tile OK — ${checks} assertions, four campaigns measured at 360/390/430/1280`);
  console.log(`shots: ${shots.join(' ')}`);
}

void main();
