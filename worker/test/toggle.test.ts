/*
 * THE SWITCH, PRESSED — not read.
 *
 * "המתג צריך להגיב מיד מבחינה חזותית, אבל אין להציג פעולה כאילו נשמרה בשרת
 *  לפני שהתקבל אישור."
 *
 * Those two sentences pull in opposite directions, and a source-level test
 * cannot tell whether the component honours both. So this one compiles the
 * real Toggle into a page, clicks it with a real mouse, and watches what the
 * knob says at each moment — against a parent whose save is slow, a parent
 * whose save fails, and a parent that "succeeds" and then quietly does not
 * change its mind, which is what a caller that swallows its own error looks
 * like from in here.
 *
 * No CSS is loaded on purpose: everything asserted below is aria state and
 * call counts, so this runs whether or not the app has been built.
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

let checks = 0;
const is = (c: unknown, m: string) => { checks += 1; assert.ok(c, m); };
const eq = (a: unknown, b: unknown, m: string) => { checks += 1; assert.deepEqual(a, b, m); };

async function main(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), 'toggle-'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-toggle.tsx')],
    outfile: path.join(dir, 'toggle.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });
  /*
   * The one rule Tailwind emits for `motion-reduce:transition-none`, written
   * out by hand so this file does not need the app built to assert the thing
   * that matters about it. Everything else here is aria state.
   */
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<style>@media (prefers-reduced-motion: reduce){.motion-reduce\\:transition-none{transition-property:none}}</style>
<body><div id="root"></div><script src="toggle.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));
    await page.goto(`file://${path.join(dir, 'index.html')}`);
    await page.waitForSelector('[data-toggles]');

    const sw = (id: string) => page.locator(`[aria-label="${id}"]`);
    const state = (id: string) => sw(id).getAttribute('aria-checked');
    const calls = () => page.evaluate(() => window.__calls);

    /* ─── 1. IT MOVES ON THE TAP, not on the answer ──────────────────── */
    eq(await state('slow'), 'false', 'it starts off');
    await sw('slow').click();
    /*
     * The parent's save takes 400ms. Read it at 60: if the knob waited for
     * the save — which is what it used to do — this is still 'false', and
     * that delay is the whole complaint.
     */
    await page.waitForTimeout(60);
    eq(await state('slow'), 'true', 'THE KNOB IS ALREADY ACROSS while the save is still in flight');
    is((await calls()).includes('slow:true'), 'and the save was asked for');

    /* ─── 2. ONE TAP AT A TIME ───────────────────────────────────────── */
    await sw('slow').click({ force: true });
    await sw('slow').click({ force: true });
    eq(
      (await calls()).filter((c) => c.startsWith('slow:')).length,
      1,
      'TAPS DURING A SAVE ARE IGNORED, NOT QUEUED — two writes racing on one row is how a switch ends up lying',
    );
    eq(await sw('slow').getAttribute('aria-busy'), 'true', 'and it says it is busy while that is true');

    /* ─── 3. CONFIRMED MEANS IT STAYS ────────────────────────────────── */
    await page.waitForTimeout(500);
    eq(await state('slow'), 'true', 'once the parent adopted it, it stays');
    eq(await sw('slow').getAttribute('aria-busy'), 'false', 'and it is no longer busy');

    /* ─── 4. A FAILED SAVE PUTS IT BACK ──────────────────────────────── */
    await sw('fails').click();
    await page.waitForTimeout(40);
    eq(await state('fails'), 'true', 'it still moves immediately — the person is told nothing yet');
    await page.waitForTimeout(400);
    eq(await state('fails'), 'false', 'AND IT RETURNS when the save rejects, rather than showing a state nobody saved');

    /* ─── 5. THE SERVER IS THE TRUTH, even when nobody threw ─────────── */
    /*
     * The 'silent' parent resolves and never changes its value — a caller
     * that caught its own error and toasted it. The switch cannot see that,
     * so it must reconcile with the prop regardless. This is the case that
     * makes "what is shown equals what is stored" true rather than hoped.
     */
    await sw('silent').click();
    await page.waitForTimeout(80);
    eq(await state('silent'), 'true', 'it moves on the tap here too');
    await page.waitForTimeout(1300);
    eq(await state('silent'), 'false', 'AND IT GOES BACK, because the value it was given never became the new one');

    /* ─── 6. Off again, the ordinary way ─────────────────────────────── */
    await sw('fast').click();
    await page.waitForTimeout(60);
    eq(await state('fast'), 'true', 'on');
    await sw('fast').click();
    await page.waitForTimeout(60);
    eq(await state('fast'), 'false', 'and off again');
    eq(await calls(), ['slow:true', 'fails:true', 'silent:true', 'fast:true', 'fast:false'], 'every call is accounted for, and there are no extras');

    /* ─── 7. Nothing moved around it ─────────────────────────────────── */
    const box = await sw('fast').boundingBox();
    await sw('fast').click();
    await page.waitForTimeout(220);
    const after = await sw('fast').boundingBox();
    eq(
      { w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0) },
      { w: Math.round(after?.width ?? 0), h: Math.round(after?.height ?? 0) },
      'the switch does not change size when pressed, so nothing under it is pushed anywhere',
    );

    /* ─── 8. 180ms, and nothing at all under reduced motion ──────────── */
    /*
     * The duration is set as an inline style and the opt-out is a class, and
     * an inline style beats a class — so the obvious reading is that reduced
     * motion is ignored here. It is not, and the reason is worth pinning:
     * they set DIFFERENT properties. The style sets transition-duration; the
     * class sets transition-property: none, which removes the transition
     * whatever its duration says. Measured, not argued.
     */
    const knob = page.locator('[aria-label="fast"] span').nth(1);
    const moving = await knob.evaluate((el) => {
      const s = getComputedStyle(el);
      return { prop: s.transitionProperty, dur: s.transitionDuration };
    });
    eq(moving.dur, '0.18s', 'the knob crosses in 180ms, the number the brief asked for by name');
    is(moving.prop !== 'none', 'and it does transition at all when the device has no objection');

    const calm = await browser.newPage({ viewport: { width: 390, height: 700 }, reducedMotion: 'reduce' });
    await calm.goto(`file://${path.join(dir, 'index.html')}`);
    await calm.waitForSelector('[data-toggles]');
    const still = await calm
      .locator('[aria-label="fast"] span')
      .nth(1)
      .evaluate((el) => getComputedStyle(el).transitionProperty);
    eq(still, 'none', 'A DEVICE THAT ASKED FOR LESS MOTION GETS NONE — the inline duration does not override it, because it is a different property');
    /* And it still works as a switch there, which is the point of honouring
       the preference rather than obeying it. */
    await calm.locator('[aria-label="fast"]').click();
    await calm.waitForTimeout(60);
    eq(await calm.locator('[aria-label="fast"]').getAttribute('aria-checked'), 'true', 'and it still toggles, instantly, with no animation at all');
    await calm.close();

    eq(crashes, [], 'and the page raised nothing');
    console.log(`toggle interaction OK — ${checks} assertions, clicked with a real mouse`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
