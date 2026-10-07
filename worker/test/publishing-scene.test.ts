/*
 * "THE ROBOT IS CURRENTLY WORKING AND SENDING MY POSTS TO GROUPS."
 *
 * That sentence is the brief, and it is also the danger. A scene that looks
 * busy is trivial to build and worthless — worse than worthless on this
 * product, where the owner's whole question for weeks has been "is it actually
 * publishing?" A robot that throws cards at groups on an afternoon when the PC
 * is switched off answers that question wrongly, with confidence, forever.
 *
 * So the line is drawn inside the scene itself:
 *
 *   THE CARD IN FLIGHT asserts nothing. It means "a worker is holding a row",
 *   which is what `sending` is, and it may loop freely.
 *
 *   A GREEN TICK ASSERTS A PUBLICATION. It may appear only when the real
 *   count rises — and that count comes from the database.
 *
 * Section 1 is that line, driven in a real browser: three seconds of the
 * busiest state the scene has, with nothing published, must produce zero
 * ticks. Everything else here is layout and the reduced-motion contract.
 *
 *   npx tsx worker/test/publishing-scene.test.ts
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.deepEqual(a, b, msg); };
const is = (c: unknown, msg: string) => { checks += 1; assert.ok(c, msg); };

const ticks = (page: Page) => page.locator('svg path[stroke="#ffffff"]').count();
const flying = (page: Page) => page.locator('.anx-fly').count();

async function main(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), 'scene-'));
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
    console.log('publishing scene SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-scene.tsx')],
    outfile: path.join(dir, 'scene.js'),
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
<body class="bg-ink-950"><div class="social-theme"><div id="root"></div></div><script src="scene.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));
    await page.goto(`file://${path.join(dir, 'index.html')}`);
    await page.waitForSelector('svg');

    /* ── 1. IT CANNOT INVENT A PUBLICATION ──────────────────────────────── */
    {
      eq(await ticks(page), 0, 'nothing published, nothing ticked');
      is((await flying(page)) > 0, 'and yet the card IS flying — "busy" is allowed to be decorative, because it claims nothing');

      /* The busiest state the scene has, for longer than three full flights. */
      await page.waitForTimeout(3000);
      eq(
        await ticks(page),
        0,
        'THREE SECONDS OF A ROBOT THROWING CARDS AND NOT ONE TICK — the animation may never stand in for a publication that did not happen',
      );
    }

    /* ── 2. AND IT DOES MARK A REAL ONE ─────────────────────────────────── */
    {
      await page.evaluate(() => window.__publish(1));
      await page.waitForTimeout(120);
      eq(await ticks(page), 1, 'one real publication, one tick');

      await page.evaluate(() => window.__publish(2));
      await page.waitForTimeout(120);
      eq(await ticks(page), 2, 'and the next one lands on the next group');

      /* A re-render that does not move the number must not add a tick — the
         dashboard re-renders on a timer, and a scene that counted renders
         would fill itself in while the worker sat idle. */
      await page.evaluate(() => window.__mode('sending'));
      await page.waitForTimeout(400);
      eq(await ticks(page), 2, 'a re-render with the same count adds nothing');
    }

    /* ── 3. FOUR TILES, AND THE FIFTH STARTS THE ROW AGAIN ──────────────── */
    {
      await page.evaluate(() => window.__publish(4));
      await page.waitForTimeout(120);
      eq(await ticks(page), 4, 'four groups, four ticks');
      await page.evaluate(() => window.__publish(5));
      await page.waitForTimeout(120);
      eq(
        await ticks(page),
        1,
        'the fifth wraps rather than overflowing — four tiles cannot hold 279 groups, and pretending they can would be the progress bar lying in a second place',
      );
    }

    /* ── 4. STOPPED MEANS STOPPED ───────────────────────────────────────── */
    {
      for (const mode of ['paused', 'idle', 'waiting'] as const) {
        await page.evaluate((m) => window.__mode(m), mode);
        await page.waitForTimeout(120);
        eq(await flying(page), 0, `nothing travels while the system is "${mode}" — the card means a row is in flight`);
      }
      /* But the groups it already reached keep their ticks: the state is in the
         shapes, not in the motion. */
      is((await ticks(page)) > 0, 'and the ticks already earned stay, whatever the system is doing now');
      await page.evaluate(() => window.__mode('waiting'));
      eq(await page.locator('.anx-bot').count(), 1, 'a running system keeps the robot alive between publications');
      await page.evaluate(() => window.__mode('paused'));
      await page.waitForTimeout(80);
      eq(await page.locator('.anx-bot').count(), 0, 'a paused one does not');
    }

    /* ── 5. IT FITS, AT EVERY WIDTH ─────────────────────────────────────── */
    {
      await page.evaluate(() => window.__mode('sending'));
      for (const width of [320, 360, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(80);
        const seen = await page.evaluate(() => {
          const svg = document.querySelector('svg') as SVGSVGElement;
          const r = svg.getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            w: Math.round(r.width),
            h: Math.round(r.height),
            inner: document.documentElement.clientWidth,
          };
        });
        is(!seen.overflow, `${width}px: the scene must not push the page sideways`);
        is(seen.w <= seen.inner, `${width}px: the scene is ${seen.w}px inside a ${seen.inner}px screen`);
        /* One viewBox, so the ratio is the design's at every width — which is
           what makes the robot the same size relative to the groups on a phone
           and on a desktop, with no breakpoint anywhere. */
        is(
          Math.abs(seen.w / seen.h - 400 / 230) < 0.02,
          `${width}px: the scene keeps the reference's proportions (measured ${seen.w}×${seen.h})`,
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }

    /* ── 5b. THE ANIMATIONS EXIST IN THE FIRST PLACE ────────────────────── */
    /*
     * THIS ASSERTION IS HERE BECAUSE ITS ABSENCE ALREADY COST SOMETHING. A
     * stray `git checkout` deleted every keyframe in globals.css and this suite
     * stayed green: section 6 asks whether the animations are OFF under reduced
     * motion, and a stylesheet with no animations in it answers "off" perfectly.
     * A guard that cannot tell "correctly disabled" from "never existed" is not
     * a guard. So the normal page is asked the opposite question first.
     */
    {
      await page.evaluate(() => window.__mode('sending'));
      await page.waitForTimeout(120);
      const running = await page.evaluate(() =>
        ({
          bot: getComputedStyle(document.querySelector('.anx-bot')!).animationName,
          fly: getComputedStyle(document.querySelector('.anx-fly')!).animationName,
          trail: getComputedStyle(document.querySelector('.anx-trail')!).animationName,
          arm: getComputedStyle(document.querySelector('.anx-arm')!).animationName,
        }),
      );
      eq(running.bot, 'anx-bot-bob', 'the robot is actually animated — not merely rendered with a class nothing styles');
      eq(running.fly, 'anx-fly', 'the card in flight really moves');
      eq(running.trail, 'anx-trail', 'and the dotted trail runs towards the group');
      eq(running.arm, 'anx-arm', 'and the arm throws');
    }

    /* ── 6. AND IT STOPS FOR SOMEBODY WHO ASKED IT TO ───────────────────── */
    {
      const quiet = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      await quiet.goto(`file://${path.join(dir, 'index.html')}`);
      await quiet.waitForSelector('svg');
      await quiet.evaluate(() => window.__publish(3));
      await quiet.waitForTimeout(150);
      const names = await quiet.evaluate(() =>
        ['.anx-bot', '.anx-fly', '.anx-trail', '.anx-blip'].map((sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).animationName : 'absent';
        }),
      );
      for (const [i, n] of names.entries()) {
        is(n === 'none' || n === 'absent', `reduced motion: nothing animates (${['bot', 'fly', 'trail', 'blip'][i]} = ${n})`);
      }
      is((await ticks(quiet)) > 0, 'but the scene is still drawn, and every tick that was earned is still there — the state was never in the motion');
      await quiet.close();
    }

    /* ── 7. the source says what it may and may not do ──────────────────── */
    {
      const src = readFileSync(new URL('../../src/components/social/PublishingScene.tsx', import.meta.url), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      is(!/setInterval|setTimeout/.test(code), 'no timer drives the ticks — the publication count is the only thing that may move them');
      is(/seen\.current/.test(code) && /published <= seen\.current/.test(code), 'and it advances on a RISE in that count, not on a render');
      is(!/\.(gif|mp4|webm|png|jpg)/i.test(code), 'every mark is drawn, not fetched — the scene costs no egress on an account that has already been cut off for it');
    }

    eq(crashes, [], 'the scene threw');
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(`publishing scene OK — ${checks} assertions, driven in a real browser`);
}

void main();
