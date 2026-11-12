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

  /*
   * ─── ימים ושעות ────────────────────────────────────────────────────────
   * The schedule line IS the button — one control, not a label beside a
   * control — and without a handler it falls back to the line it was, so a
   * tile drawn somewhere with no sheet behind it loses nothing.
   */
  is(/onHours\?: \(\) => void;/.test(tile), 'the tile offers a days-and-hours handler');
  is(/\{onHours \? \(/.test(tile), 'and falls back to a plain line when there is no sheet to open');
  is(/aria-label=\{`ימים ושעות לקמפיין/.test(tile), 'the button says what it opens, and for which campaign');

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

/* ══════════ 2b. THE SHEET: ONE HOUR, AND IT SAVES BEFORE IT SAYS SO ════ */

{
  const sheet = src('src/components/social/CampaignHoursSheet.tsx');

  /*
   * NO CLOSING HOUR ANYWHERE. "אין להציג או להגדיר שעת סיום" — and this is
   * the same rule the product already follows, since readSchedule() stopped
   * reading schedule_end. A second time field here would be a setting the
   * engine cannot act on.
   */
  eq((sheet.match(/type="time"/g) ?? []).length, 1, 'exactly one hour field — there is no closing hour to set');
  /*
   * AND IT SETS NO END — which is a different claim from "never says the
   * words". The first version of this banned the PHRASE and failed on the
   * sentence that exists to tell him there isn't one ("אין שעת סיום — היום
   * פתוח עד חצות"). What may not appear is an end-hour VALUE: a second time
   * input above, and nothing writing the column readSchedule() stopped
   * reading.
   */
  const code = sheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  is(!/schedule_end|\bend:\s/.test(code), 'and it sets no end hour — the column readSchedule() stopped reading stays unwritten');
  is(/אין שעת סיום/.test(code), 'it says so in as many words, where he will read it');

  /* His four, in his words. */
  for (const [label, at] of [['בוקר', '08:00'], ['צהריים', '12:00'], ['ערב', '16:00'], ['לילה', '20:00']] as const) {
    is(new RegExp(`label: '${label}', at: '${at}'`).test(sheet), `the ${label} preset is ${at}`);
  }

  /*
   * A SAVE BUTTON MAY NOT CONFIRM A WRITE IT DID NOT WAIT FOR. The draft is
   * local, the write is awaited, the sheet closes only after it resolved, and
   * a failure is shown instead of swallowed.
   */
  is(/await onSave\(/.test(sheet), 'the write is awaited');
  is(/await onSave\([\s\S]{0,120}onClose\(\);/.test(sheet), 'and the sheet closes only after it landed');
  /* And it is said in Hebrew he can act on, not in Postgres. layout.test.ts
     caught the first version handing him err.message straight through. */
  is(/catch \(err\)[\s\S]{0,600}setProblem\(friendlyMessage\(err,/.test(sheet), 'a failed save is said out loud, through friendlyMessage, not swallowed and not raw');
  is(/if \(days\.length === 0\)/.test(sheet), 'and a round with no day is refused before it is saved');

  /* Seeded on every open — four campaigns share one sheet. */
  is(/useEffect\(\(\) => \{\s*if \(!open\) return;/.test(sheet), "the draft is re-seeded on every open, so one campaign's edit cannot open on another");

  /*
   * AND THE PAGE SAVES THROUGH THE WRITE IT ALREADY HAD. Not a second copy
   * of the saveCampaign → syncWeeklyHours → rescheduleCampaignQueue order.
   */
  const page = src('src/app/social/campaigns/page.tsx');
  is(/const saveScheduleNow = useCallback\(/.test(page), 'the page has one awaited save for the sheet');
  is(/saveScheduleNow[\s\S]{0,400}changeSchedule\(campaign, next\);/.test(page), 'and it runs the SAME changeSchedule the panel runs');
  is(/saveScheduleNow[\s\S]{0,600}const run = schedulePending\.current\[campaign\.id\];[\s\S]{0,80}await run\(\);/.test(page), 'collapsing its debounce and awaiting the write it parked');
  is(/<CampaignHoursSheet/.test(page), 'and the sheet is rendered for whichever tile was tapped');
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
        /*
         * 460, RAISED FROM 420 WHEN "ימים ושעות" BECAME A BUTTON — a 40px tap
         * target where a text line used to be, plus its gap. The number is
         * here to stop the tile drifting back into the card it replaced, and
         * that card is 915 with its panel: a tile at 442 is still less than
         * half of it. Raised deliberately and with the reason, rather than
         * deleted the moment it caught something.
         */
        is(seen.tallest <= 460, `${w}: the tallest tile is ${seen.tallest}px — a compact tile that tall is the card it replaced`);
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

    /* ─── THE SHEET, DRIVEN ───────────────────────────────────────────────
     *
     * "פתיחה וסגירה תקינה של החלון · בחירת ימים ושעת הפעלה · שמירה וטעינה
     *  חוזרת."
     *
     * Opened on a campaign publishing Sunday-Tuesday at 08:00. The test adds
     * Thursday, presses "ערב", saves, and reads back exactly what would have
     * gone to the database. Nothing is mocked but the write itself.
     */
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      const crashes: string[] = [];
      page.on('pageerror', (e) => crashes.push(String(e)));
      await page.goto(`file://${path.join(dir, 'index.html')}?s=sheet`);
      await page.waitForSelector('[role="group"][aria-label^="ימי פרסום"]');

      eq(await page.locator('input[type="time"]').count(), 1, 'the sheet offers exactly one hour field');
      eq(await page.locator('input[type="time"]').inputValue(), '08:00', 'seeded from the campaign, not from a default');
      eq(await page.locator('[role="group"][aria-label^="ימי פרסום"] [aria-pressed="true"]').count(), 3, 'and with the three days it really publishes on');

      /* Add Thursday. */
      await page.locator('button[aria-label="יום חמישי"]').click();
      eq(await page.locator('[role="group"][aria-label^="ימי פרסום"] [aria-pressed="true"]').count(), 4, 'pressing a day adds it');

      /* And move the hour with a preset. */
      await page.getByRole('button', { name: /ערב/ }).click();
      eq(await page.locator('input[type="time"]').inputValue(), '16:00', '"ערב" sets the hour to 16:00');

      /* NOTHING IS SAVED YET — the whole point of a save button. */
      eq(await page.evaluate(() => window.__saved ?? null), null, 'and not one of those presses wrote anything');

      await page.getByRole('button', { name: 'שמור שינויים' }).click();
      await page.waitForFunction(() => Boolean(window.__saved));
      const saved = (await page.evaluate(() => window.__saved)) as { days: number[]; start: string; enabled: boolean };
      eq(saved.days, [0, 1, 2, 4], 'the save carries the four days, in order');
      eq(saved.start, '16:00', 'and the hour the preset set');
      eq(saved.enabled, true, 'with the schedule switched on');
      is(!('end' in saved), 'and no end hour — there is none to send');
      is(await page.evaluate(() => window.__closed === true), 'the sheet closed, and only after the write resolved');
      eq(crashes, [], 'the sheet threw');
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`campaign tile OK — ${checks} assertions, four campaigns measured at 360/390/430/1280, and the sheet driven end to end`);
  console.log(`shots: ${shots.join(' ')}`);
}

void main();
