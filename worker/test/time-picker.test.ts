/*
 * ─── ONE WHEEL, ONE WRITE ─────────────────────────────────────────────────
 *
 * "במסך הראשי שאני בא לשנות את הזמן אני עוד לא מספיק לבחור וזה זורק אותי
 *  מהבחירה ומשנה את השעה איפה שעצרתי אם האצבע."
 *
 * WHAT WAS HAPPENING. The hour field is a controlled <input type="time">, and
 * on iOS the wheel fires `change` on every notch it passes. Each one went
 * straight to onScheduleChange — a write to Supabase and a round trip — so
 * while the wheel was still moving the `value` prop was whatever the server
 * had last confirmed. React wrote that stale hour back into the open picker,
 * and iOS closed it on whichever number the finger happened to be over. The
 * same code also wrote to the database once per notch scrolled.
 *
 * WHY IT NEEDS A BROWSER. Every fact here is about what happens BETWEEN the
 * first notch and the last: the value the field is holding mid-scroll, and
 * how many writes have left by then. A rendered string has neither, and a
 * source-text guard would pass on any arrangement of the same props.
 *
 * So the panel is mounted with React running, the parent is given the round
 * trip the real one has (worker/test/mount-timepick.tsx), and the wheel is
 * driven the way iOS drives it — a run of `change` events with no blur in
 * between, then the blur the picker fires when it closes.
 *
 *   npx tsx worker/test/time-picker.test.ts
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

let checks = 0;
const eq = (actual: unknown, expected: unknown, claim: string) => {
  checks += 1;
  assert.deepEqual(actual, expected, `${claim}\n  expected: ${JSON.stringify(expected)}\n  got     : ${JSON.stringify(actual)}`);
};
const is = (cond: boolean, claim: string) => {
  checks += 1;
  assert.ok(cond, claim);
};

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

async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    console.log('time picker SKIPPED — run `npm run build` first so the real stylesheet exists.');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'timepick-'));
  copyFileSync(css, path.join(dir, 'app.css'));

  await build({
    entryPoints: [path.resolve('worker/test/mount-timepick.tsx')],
    outfile: path.join(dir, 'timepick.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
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
<body class="bg-ink-950"><div id="root"></div><script src="timepick.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const view = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const crashes: string[] = [];
    view.on('pageerror', (e) => crashes.push(String(e)));
    await view.goto(`file://${path.join(dir, 'index.html')}`);
    await view.waitForSelector('input[type="time"]');

    const field = 'input[type="time"]';

    /*
     * ─── THE SCROLL ─────────────────────────────────────────────────────
     *
     * Eight notches, dispatched the way the native picker does: the value is
     * set and `change` is fired, with the field still focused throughout. No
     * blur, because the picker has not been closed yet.
     */
    const duringScroll = await view.evaluate(() => {
      const el = document.querySelector('input[type="time"]') as HTMLInputElement;
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      const seen: string[] = [];
      for (const v of ['08:10', '08:20', '08:30', '08:40', '08:50', '09:00', '09:10', '09:20']) {
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        seen.push(el.value);
      }
      return { seen, writes: window.writes.length, value: el.value };
    });

    /*
     * THE FIELD KEPT EVERY NUMBER THE FINGER PASSED. This is the assertion
     * the bug was: with the old code the stale prop snapped the field back
     * mid-run, which on iOS is the picker closing under the finger.
     */
    eq(
      duringScroll.seen,
      ['08:10', '08:20', '08:30', '08:40', '08:50', '09:00', '09:10', '09:20'],
      'the field followed the wheel instead of snapping back to the saved hour',
    );
    eq(duringScroll.value, '09:20', 'and ended on the hour the finger stopped at');

    /* AND NOTHING WAS WRITTEN YET. Eight notches used to be eight writes. */
    eq(duringScroll.writes, 0, 'scrolling the wheel must not write to the campaign');

    /*
     * ─── THE SUMMARY STILL MOVES WITH IT ────────────────────────────────
     *
     * "הסיכום חייב להתעדכן LIVE כאשר המשתמש משנה: ימים, שעת התחלה, הפרש בין
     *  פוסטים." The draft lives on the PANEL, not inside the field, so the
     * live sentence is kept without a single write leaving.
     */
    const summary = await view.textContent('[data-summary]');
    is(Boolean(summary?.includes('09:20')), `the summary follows the wheel live — got "${summary?.replace(/\s+/g, ' ').trim()}"`);

    /* ─── THE CLOSE ───────────────────────────────────────────────────── */
    await view.evaluate(() => (document.querySelector('input[type="time"]') as HTMLInputElement).blur());
    await view.waitForTimeout(250);

    const after = await view.evaluate(() => ({
      writes: window.writes.length,
      last: window.writes[window.writes.length - 1]?.start,
      value: (document.querySelector('input[type="time"]') as HTMLInputElement).value,
    }));
    eq(after.writes, 1, 'closing the picker writes exactly once');
    eq(after.last, '09:20', 'and writes the hour that was chosen, not the one it passed through');
    eq(after.value, '09:20', 'and the field keeps it once the campaign has it');

    /*
     * ─── AND A CLOSE THAT CHANGED NOTHING IS NOT A WRITE ────────────────
     *
     * Opening the picker and closing it again used to be a write and a
     * re-space of the queue. Tapping a field is not an edit.
     */
    await view.evaluate(() => {
      const el = document.querySelector('input[type="time"]') as HTMLInputElement;
      el.focus();
      el.blur();
    });
    await view.waitForTimeout(250);
    eq(await view.evaluate(() => window.writes.length), 1, 'opening and closing the field without moving it writes nothing');

    eq(crashes, [], 'the panel threw while the wheel was being driven');
  } finally {
    await browser.close();
  }

  console.log(`time picker OK — ${checks} assertions, driven in a real browser`);
}

void main();
