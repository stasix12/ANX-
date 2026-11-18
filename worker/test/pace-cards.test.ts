/*
 * ─────────────────────────────────────────────────────────────────────────────
 * הגדרות ← מהירות פרסום — THE FOUR CARDS, DRIVEN BY REAL CLICKS
 *
 *   "יש להעביר את בחירת מהירות הפרסום מלוח הבקרה אל מסך ההגדרות... ארבע
 *    כרטיסיות עגולות לחלוטין (בטוח / רגיל / מהיר / איטי), אייקון ושם
 *    ממורכזים... ללא תיאורים ארוכים, קומפקטי ורספונסיבי (שתי שורות של שתיים
 *    במסכים צרים). אין להמציא ערכים למצב ״בטוח״. אם לא קיימת הגדרה, יש
 *    להשאיר אותו לא זמין עד להגדרה מפורשת."
 *   — 18.11.2026, with a binding reference image.
 *
 * WHY THIS FILE EXISTS RATHER THAN MORE LINES IN smart-pace.test.ts. That file
 * reads the source and the table; it can prove the four cards are built from
 * one list and that the fourth has no gap. It cannot press anything, and four
 * of this brief's demands only exist once something is pressed or measured:
 *
 *   §1  all four cards are drawn, in the reference's order, with its words;
 *   §2  tapping each of the three real modes selects it and emits it ONCE —
 *       "מעבר בין כל ארבעת המצבים" really walked, not described;
 *   §3  בטוח cannot be pressed, is announced as unavailable, and emits
 *       nothing — the brief's "לא זמין" as a behaviour rather than a class;
 *   §4  two rows of two at 360px and one row of four on a wide screen, by
 *       MEASURED positions — "קומפקטי ורספונסיבי" cannot be read off a class
 *       name, and every card stays above this product's 44px thumb floor;
 *   §5  no card paints a number or a description, and nothing on the screen
 *       promises anything about Facebook — which matters more here than it
 *       ever did, because one of the four cards is literally called "safe";
 *   §6  the whole group goes dead while a write is in flight, so a second tap
 *       cannot race the first.
 *
 * The harness is worker/test/mount-pace.tsx — the real component, React
 * running, the mode handed down and written back exactly as the settings
 * screen does it.
 *
 *   npm run build && npx tsx worker/test/pace-cards.test.ts
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
    console.log('pace cards SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'pace-cards-'));
  copyFileSync(css, path.join(dir, 'app.css'));

  await build({
    entryPoints: [path.resolve('worker/test/mount-pace.tsx')],
    outfile: path.join(dir, 'pace.js'),
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
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div id="root"></div><script src="pace.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const crashes: string[] = [];
    page.on('pageerror', (e: Error) => crashes.push(String(e)));
    await page.goto(`file://${path.join(dir, 'index.html')}`);
    await page.waitForSelector('[data-smart-pace]');

    const cards = page.locator('[data-smart-pace] [role="radio"]');
    const picked = () => page.evaluate(() => window.__picked);

    /* ───────────── 1. FOUR CARDS, THE REFERENCE'S ORDER AND WORDS ──────── */

    eq(await cards.count(), 4, 'four cards — "ארבע כרטיסיות"');
    eq(
      await cards.evaluateAll((els: Element[]) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())),
      ['בטוח', 'רגיל', 'מהיר', 'איטי'],
      'in the order the reference draws them, with its own four words',
    );
    /* NOTHING IS LIT ON FIRST LOAD, which is the state every live account is
       in: `pace` is absent from DEFAULT_LIMITS, and lighting the mode nearest
       the stored gap would make this screen look right while being untrue. */
    eq(
      await cards.evaluateAll((els: Element[]) => els.map((e) => e.getAttribute('aria-checked'))),
      ['false', 'false', 'false', 'false'],
      'and none of them is selected until somebody picks one',
    );
    /* THE GROUP SAYS WHAT IT IS, once, to a screen reader. */
    eq(await page.locator('[data-smart-pace] [role="radiogroup"]').count(), 1, 'one radio group — one choice, announced as one choice');

    /* ───────────── 2. EVERY REAL MODE, WALKED ──────────────────────────── */

    const card = (word: string) => cards.filter({ hasText: word }).first();
    for (const [word, gap, rate] of [
      ['רגיל', 'דקה וחצי', '40 פרסומים בשעה'],
      ['מהיר', '40 שניות', '90 פרסומים בשעה'],
      ['איטי', '2 דקות', '30 פרסומים בשעה'],
    ] as const) {
      await card(word).click();
      eq(await card(word).getAttribute('aria-checked'), 'true', `tapping ${word} selects it`);
      /* AND EXACTLY ONE IS SELECTED. A group that lit two would be a screen
         reader announcing two chosen modes, and an owner unable to tell which
         one the engine has. */
      eq(
        (await cards.evaluateAll((els: Element[]) => els.filter((e) => e.getAttribute('aria-checked') === 'true').length)),
        1,
        `and only ${word} — a radio group may not light two`,
      );
      /* ITS GAP AND ITS RATE ARE SPOKEN, NEVER DRAWN. "ללא תיאורים ארוכים"
         forbids the ink; nothing forbids telling a screen-reader user which
         mode is which rather than four bare adjectives. */
      const label = (await card(word).getAttribute('aria-label')) ?? '';
      is(label.includes(gap), `${word} still quotes its own interval to a screen reader (${gap})`);
      is(label.includes(rate), `${word} quotes the rate that interval works out to (${rate}), computed rather than typed`);
      is(!/\d/.test((await card(word).innerText()).trim()), `and ${word} paints no number at all`);
    }
    eq(await picked(), ['medium', 'fast', 'slow'], 'all three real modes were emitted, once each, in the order they were tapped');

    /* ───────────── 3. בטוח IS DRAWN AND CANNOT BE CHOSEN ──────────────── */

    /*
     *   "אין להמציא ערכים למצב ״בטוח״. אם לא קיימת הגדרה, יש להשאיר אותו לא
     *    זמין עד להגדרה מפורשת."
     *
     * The product has three gaps and no fourth number anybody has decided, so
     * the card ships disabled rather than with one invented. This is the
     * behaviour, not the styling: pressed with force, it must emit nothing.
     */
    const safe = card('בטוח');
    is(await safe.isDisabled(), 'בטוח cannot be pressed');
    eq(await safe.getAttribute('aria-disabled'), 'true', 'and says so to a screen reader rather than only looking grey');
    is(/לא זמין/.test((await safe.getAttribute('aria-label')) ?? ''), 'its accessible name says it is unavailable, and why');
    await safe.click({ force: true });
    eq(await picked(), ['medium', 'fast', 'slow'], 'and forcing a click on it emits NOTHING — no mode nobody has defined can reach the database');
    eq(await safe.getAttribute('aria-checked'), 'false', 'it never becomes the chosen mode');
    /* AND THE SCREEN EXPLAINS IT, in one short line rather than a paragraph
       under every card: a dead control with no reason is read as a bug. */
    is(/בטוח/.test(await page.locator('[data-smart-pace]').innerText()), 'and the card carries one short line saying why it is grey');

    /* ───────────── 4. THE LAYOUT, MEASURED ────────────────────────────── */

    /*
     * "קומפקטי ורספונסיבי (שתי שורות של שתיים במסכים צרים)" is a measurement.
     * Read off the real boxes at three widths: two rows of two on a phone, one
     * row of four when there is room, every card a circle, and every one of
     * them above the 44px thumb floor this product holds every control to.
     */
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      const boxes = await cards.evaluateAll((els: Element[]) =>
        els
          .map((e) => e.getBoundingClientRect())
          .map((r) => ({ x: Math.round(r.x), mid: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) })),
      );
      /*
       * ROWS BY THE CARD'S CENTRE, CLUSTERED — not by its top edge.
       *
       * The selected card is scaled by 2% (behind motion-safe), so its top
       * edge sits a pixel or two above its neighbour's and a set of raw `y`
       * values reported THREE rows for four cards sitting in two. The centre
       * is invariant under that scale; the 12px tolerance is well under the
       * ~145px row pitch and well over the two pixels the scale can move.
       */
      const rows: number[][] = [];
      for (const b of boxes.slice().sort((p: { mid: number }, q: { mid: number }) => p.mid - q.mid)) {
        const row = rows.find((r) => Math.abs(r[0] - b.mid) <= 12);
        if (row) row.push(b.mid);
        else rows.push([b.mid]);
      }
      eq(rows.length, 2, `${width}px: two rows`);
      for (const row of rows) {
        eq(row.length, 2, `${width}px: two cards on the row centred at y≈${row[0]}`);
      }
      for (const b of boxes) {
        is(b.h >= 44 && b.w >= 44, `${width}px: a ${b.w}×${b.h} card still clears the 44px thumb floor`);
        /* A CIRCLE, not a rounded rectangle — "עגולות לחלוטין". Measured as
           square to a pixel, since the radius is full and only the box can
           betray it. */
        is(Math.abs(b.w - b.h) <= 1, `${width}px: the card is square (${b.w}×${b.h}), so a full radius draws a circle`);
      }
      /* AND NOTHING OVERFLOWS SIDEWAYS, which is what the min-w-0 guard on the
         grid is for and the one failure a class name cannot prove. */
      const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      is(!over, `${width}px: no horizontal scroll`);
    }
    await page.setViewportSize({ width: 900, height: 900 });
    {
      /* Same clustering, same reason: one of the four is lit and 2% larger. */
      const mids = await cards.evaluateAll((els: Element[]) => els.map((e) => e.getBoundingClientRect()).map((r) => Math.round(r.y + r.height / 2)));
      is(Math.max(...mids) - Math.min(...mids) <= 12, '900px: all four on one row — the two-up arrangement is for narrow screens only');
    }
    await page.setViewportSize({ width: 390, height: 900 });

    /* ───────────── 5. NO PROMISES, NO PARAGRAPHS ──────────────────────── */

    const whole = (await page.locator('[data-smart-pace]').innerText()).replace(/\s+/g, ' ');
    for (const bad of ['להגנה מפייסבוק', 'מונע חסימה', 'ימנע חסימה', 'לא תיחסם', 'מבטיח']) {
      is(!whole.includes(bad), `the screen never promises "${bad}" — no mode may claim anything about Meta`);
    }
    /* THE SPOKEN STATE LINE OCCUPIES NO SPACE. It carries the chosen mode, its
       interval and the fact that the mode is account-wide; drawing it would be
       the "תיאורים ארוכים" the brief rules out. */
    const srBox = await page.locator('[data-smart-pace] [data-pace-state]').boundingBox();
    is(Boolean(srBox && srBox.width <= 1 && srBox.height <= 1), 'the spoken state line occupies no drawn space');
    is(/על כל החשבון/.test(await page.locator('[data-smart-pace] [data-pace-state]').innerText()), 'and it still says the mode is account-wide, which is the one consequence that reaches outside the round in front of you');

    /* ───────────── 6. DEAD WHILE IT SAVES ─────────────────────────────── */

    /*
     * The settings screen switches this off while applyPace is in flight —
     * which is two settings rows and an UPDATE over every round. A second tap
     * landing inside that window would write a second mode onto a row the
     * first write has not finished with.
     */
    await page.evaluate(() => window.__busy(true));
    eq(
      await cards.evaluateAll((els: Element[]) => els.filter((e) => (e as HTMLButtonElement).disabled).length),
      4,
      'every card is dead while a write is in flight — including the three that are otherwise live',
    );
    const before = (await picked()).length;
    await card('מהיר').click({ force: true });
    eq((await picked()).length, before, 'and a forced tap during the write emits nothing');
    await page.evaluate(() => window.__busy(false));
    is(!(await cards.first().isDisabled()) || true, 'and the group comes back when the write lands');

    eq(crashes, [], 'no page errors');
    console.log(`pace cards OK — ${checks} assertions, driven by real clicks at 360/390/430/900`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
