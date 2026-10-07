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

      /* The busiest state the scene has, for longer than a full flight. */
      await page.waitForTimeout(3200);
      eq(
        await ticks(page),
        0,
        'THREE SECONDS OF A ROBOT THROWING CARDS AND NOT ONE TICK — the animation may never stand in for a publication that did not happen',
      );
      eq(await page.locator('[data-active]').count(), 1, 'and exactly one group is the destination — never two, never none');
    }

    /* ── 2. A REAL ONE IS MARKED, AND THE MARK DOES NOT STAY FOR EVER ───── */
    {
      /*
       * "Do NOT permanently show green checkmarks on all group cards." The
       * first build seeded one per publication already finished today, so by
       * noon all four wore a tick and the mark meant nothing. A tick is an
       * EVENT: it appears on an arrival, it is held, and it goes.
       */
      const before = await page.locator('[data-active]').getAttribute('x');
      await page.evaluate(() => window.__publish(1));
      await page.waitForTimeout(150);
      eq(await ticks(page), 1, 'one real publication, one tick');
      eq(await page.locator('[data-tick]').count(), 1, 'on exactly one group — the one it was sent to');
      eq(await flying(page), 0, 'and nothing is still travelling, because it has arrived');

      /* Held, then gone — and the next group takes over. */
      await page.waitForTimeout(2600);
      eq(await ticks(page), 0, 'the tick is held for a beat and then goes: a mark that never leaves cannot report an arrival');
      const after = await page.locator('[data-active]').getAttribute('x');
      is(before !== after, 'and the active destination has moved on to the next group');
      eq(await page.locator('[data-active]').count(), 1, 'still exactly one');
      is((await flying(page)) > 0, 'with the card travelling again, towards it');
    }

    /* ── 3. THE NEXT DESTINATION IS BARE UNTIL SOMETHING LANDS ──────────── */
    {
      await page.waitForTimeout(400);
      eq(
        await ticks(page),
        0,
        'NO green tick on the active destination before the publication succeeds — the tick is the claim, and nothing has been claimed yet',
      );
      /* Three arrivals at once are presented one after another, not collapsed
         into one: the dashboard re-reads every thirty seconds and the worker
         can publish faster than that. */
      await page.evaluate(() => window.__publish(4));
      await page.waitForTimeout(150);
      eq(await ticks(page), 1, 'a burst shows its first arrival');
      await page.waitForTimeout(2600);
      eq(await ticks(page), 1, 'then the next, on the next group');
      await page.waitForTimeout(2600);
      eq(await ticks(page), 1, 'and the next — one at a time, rather than three collapsed into one');
    }

    /* ── 4. THE FOUR STATES ARE TOLD APART ──────────────────────────────── */
    {
      const seenIn = async (mode: 'sending' | 'waiting' | 'paused' | 'idle') => {
        await page.evaluate((m) => window.__mode(m), mode);
        await page.waitForTimeout(150);
        return page.evaluate(() => ({
          fly: document.querySelectorAll('.anx-fly').length,
          trail: document.querySelectorAll('.anx-trail').length,
          breathing: document.querySelectorAll('.anx-breathe').length,
          bot: document.querySelectorAll('.anx-bot').length,
          botMin: document.querySelectorAll('.anx-bot-min').length,
          active: document.querySelectorAll('[data-active]').length,
        }));
      };

      /* Let the burst above finish so `sending` is genuinely sending. */
      await page.waitForTimeout(2800);

      const sending = await seenIn('sending');
      is(sending.fly === 1 && sending.trail === 1, 'SENDING: the card travels and the trail flows towards the group it is going to');
      eq(sending.breathing, 1, 'and exactly one group breathes');
      eq(sending.bot, 1, 'with the robot hovering');

      const waiting = await seenIn('waiting');
      eq(waiting.fly, 0, 'WAITING: nothing travels — the gap between publications is not a publication');
      eq(waiting.trail, 0, 'and the trail is still');
      eq(waiting.breathing, 0, 'and no group pulses — nothing is on its way to one');
      eq(waiting.active, 1, 'but the next destination is still named');
      eq(waiting.bot, 1, 'the robot is alive');

      const paused = await seenIn('paused');
      eq(paused.fly, 0, 'PAUSED: nothing travels');
      eq(paused.trail, 0, 'nothing flows');
      eq(paused.breathing, 0, 'nothing pulses');
      eq(paused.active, 0, 'and no group is named as a destination — nothing is going anywhere');
      eq(paused.bot, 0, 'the full idle stops');
      eq(paused.botMin, 1, 'and a smaller, slower breath replaces it — switched off is not broken, and a frozen robot reads as broken');

      const idle = await seenIn('idle');
      eq(idle.bot + idle.botMin, 0, 'IDLE: with nothing scheduled at all, even that stops');
    }

    /* ── 4b. THE CARD IS BIGGER, AND VISIBLE THE WHOLE WAY ──────────────── */
    {
      await page.evaluate(() => window.__mode('sending'));
      await page.waitForTimeout(150);
      const card = await page.evaluate(() => {
        const r = document.querySelector('[data-card] rect') as SVGRectElement;
        return { w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')) };
      });
      /*
       * MEASURED OFF THE REFERENCE RECORDING, not chosen by eye. In the frame
       * where the card is landing on a group it is about 100×115 of a 1100×480
       * panel, which in this viewBox is 36×42. "Looks about right" is how a
       * card half the size of the design ships.
       */
      is(card.w >= 31 && card.w <= 38, `the travelling card is ${card.w} wide — the reference's is about 36`);
      is(card.h >= 36 && card.h <= 44, `and ${card.h} tall — the reference's is about 42`);
      const img = await page.evaluate(() => {
        const i = document.querySelector('svg image') as SVGImageElement;
        return { href: i?.getAttribute('href') ?? '', w: Number(i?.getAttribute('width')) };
      });
      /*
       * AND THE ROBOT IS HIS ROBOT. "אל תחליף אותו ברובוט מצויר, אייקון,
       * אימוג׳י או דמות דומה" — the first build drew one in SVG paths, which is
       * a drawing OF his robot and therefore exactly what was ruled out.
       */
      is(img.href.includes('robot'), 'the robot is the rendered asset, not paths pretending to be it');
      is(img.w > 150, `and it is drawn at ${img.w} of a 400-unit scene, the share it has in the reference`);
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
          Math.abs(seen.w / seen.h - 400 / 180) < 0.03,
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
          halo: getComputedStyle(document.querySelector('.anx-halo')!).animationName,
          send: getComputedStyle(document.querySelector('.anx-send')!).animationName,
          shadow: getComputedStyle(document.querySelector('.anx-shadow')!).animationName,
        }),
      );
      eq(running.bot, 'anx-bot-bob', 'the robot is actually animated — not merely rendered with a class nothing styles');
      eq(running.fly, 'anx-fly', 'the card in flight really moves');
      eq(running.trail, 'anx-trail', 'and the dotted trail runs towards the group');
      eq(running.halo, 'anx-halo', 'and the ring around the active destination breathes');
      /*
       * THE ROBOT'S OWN THREE. A raster robot has no limb to move, so all of it
       * is transforms — and two animations cannot share `transform` on one
       * element, which is why these are three nested elements and not one with
       * a cleverer keyframe. If they ever collapse onto one, two of these three
       * silently stop and the robot goes back to sliding.
       */
      eq(running.bot, 'anx-bot-bob', 'the robot floats');
      eq(running.send, 'anx-send', 'and throws, inside that float, on the card’s own clock');
      eq(running.shadow, 'anx-shadow', 'over a shadow that shrinks as it rises — the cue that makes it float rather than slide');
      const sep = await page.evaluate(() => {
        const bot = document.querySelector('.anx-bot');
        const send = document.querySelector('.anx-send');
        return { nested: Boolean(bot && send && bot.contains(send) && bot !== send) };
      });
      is(sep.nested, 'the throw really is nested inside the float, rather than both being asked of one element');
    }

    /* ── 5c. THE COUNT IS CENTRED, AND IT FITS ──────────────────────────── */
    /*
     * "רק את המספר של הפרסומים לשים באמצע אם אוטו פונט."
     *
     * "Auto font" is a claim about pixels at a width, so it is measured at the
     * widths a phone actually is, against the WIDEST shape the data can take —
     * 1180 / 2655, four digits on each side. A size chosen for "9 / 12" wraps
     * on that and nobody finds out until a busy day.
     */
    {
      for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(90);
        const line = await page.evaluate(() => {
          const p = document.querySelector('[data-ratio] p') as HTMLElement;
          const box = p.getBoundingClientRect();
          const host = (p.parentElement as HTMLElement).getBoundingClientRect();
          const cs = getComputedStyle(p);
          return {
            overflowed: p.scrollWidth > p.clientWidth + 1,
            lines: Math.round(box.height / parseFloat(cs.lineHeight || '18')),
            centred: Math.abs((box.left - host.left) - (host.right - box.right)) < 2,
            justify: cs.justifyContent,
            size: Math.round(parseFloat(cs.fontSize)),
            wider: Math.round(box.width) > Math.round(host.width) + 1,
          };
        });
        is(!line.overflowed && !line.wider, `${width}px: the count line fits — it must never be cut, a "118 / 26…" is a figure nobody can act on`);
        eq(line.justify, 'center', `${width}px: and it is centred`);
        is(line.centred, `${width}px: really centred, measured off both margins and not just asserted by a class`);
        is(line.size >= 11 && line.size <= 14, `${width}px: the shrink has a floor — ${line.size}px is still readable, and it never grows past the 14px this line has always been`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }

    /* ── 5d. THE HEADER IS THE TITLE AND NOTHING ELSE ───────────────────── */
    /*
     * "החלף את הכותרת … בכותרת המדויקת: רובוט בפעולה" … "הסר מהכרטיסייה את כל
     *  המשבצת הירוקה של בחירת המשתמש" … "הסר גם את אייקון שני החצים האפור".
     *
     * The panel is mounted with everything the chip used to read — a face, a
     * name, a second profile to switch to, a refresh handler — so what is
     * asserted is that it no longer DRAWS them, not that nobody hands them
     * over. A test that simply passed `null` would pass against a panel that
     * still had the chip in it.
     */
    {
      for (const width of [320, 360, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(90);
        const head = await page.evaluate(() => {
          const panel = document.querySelector('[data-panel]') as HTMLElement;
          const h2 = panel.querySelector('h2') as HTMLElement;
          const text = (panel.textContent || '').replace(/\s+/g, ' ');
          return {
            title: (h2.textContent || '').trim(),
            clipped: h2.scrollWidth > h2.clientWidth + 1,
            ellipsis: getComputedStyle(h2).textOverflow,
            align: getComputedStyle(h2).direction,
            hasName: text.includes('Stas Terehin'),
            images: panel.querySelectorAll('img').length,
            controls: panel.querySelectorAll('button, a').length,
          };
        });
        eq(head.title, 'רובוט בפעולה', `${width}px: the exact title, whole`);
        is(!head.clipped, `${width}px: and not cut — "רובוט בפ…" is the thing this change was made to stop`);
        is(head.ellipsis !== 'ellipsis', `${width}px: with no ellipsis waiting to appear`);
        is(!head.hasName, `${width}px: the account's name is gone from the card`);
        eq(head.images, 0, `${width}px: and its face with it — no <img> is left in the panel`);
        eq(head.controls, 0, `${width}px: and not one control is left in the header — no chip, no swap icon, no refresh button`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }

    /* ── 6. AND IT STOPS FOR SOMEBODY WHO ASKED IT TO ───────────────────── */
    {
      const quiet = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      await quiet.goto(`file://${path.join(dir, 'index.html')}`);
      await quiet.waitForSelector('svg');
      await quiet.evaluate(() => window.__publish(3));
      await quiet.waitForTimeout(150);
      const names = await quiet.evaluate(() =>
        ['.anx-bot', '.anx-fly', '.anx-trail', '.anx-shadow'].map((sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).animationName : 'absent';
        }),
      );
      for (const [i, n] of names.entries()) {
        is(n === 'none' || n === 'absent', `reduced motion: nothing animates (${['bot', 'fly', 'trail', 'shadow'][i]} = ${n})`);
      }
      is((await ticks(quiet)) > 0, 'but the scene is still drawn, and every tick that was earned is still there — the state was never in the motion');
      await quiet.close();
    }

    /* ── 7. the source says what it may and may not do ──────────────────── */
    {
      const src = readFileSync(new URL('../../src/components/social/PublishingScene.tsx', import.meta.url), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      /*
       * RE-POINTED, NOT DELETED. This used to read "no setTimeout anywhere",
       * which was true of the first build and is the wrong claim: holding an
       * arrival on screen for a beat NEEDS a timer. What must never be on a
       * timer is the COUNT of arrivals. So the claim is now stated where it
       * belongs — on `target`, the only number that may rise.
       */
      is(!/setInterval/.test(code), 'nothing polls');
      const rise = code.slice(code.indexOf('const gained'), code.indexOf('}, [published]);'));
      is(rise.length > 40 && rise.length < 700, 'the effect that watches the real count is still one effect, and this slice is it');
      eq(
        (code.match(/setTarget\(/g) ?? []).length,
        (rise.match(/setTarget\(/g) ?? []).length,
        'EVERY change to the arrival count happens inside the effect watching `published` — nowhere else in the file may touch it',
      );
      is(/const success = shown < target;/.test(code), 'and the presentation can never run ahead of it: a tick exists only while fewer have been shown than really happened');
      is(/setTimeout\(\(\) => setShown\(\(s\) => s \+ 1\), SUCCESS_HOLD_MS\)/.test(code), 'the one timer here advances the PRESENTATION, which can only ever catch up to the real count');
      is(/seen\.current/.test(code) && /published - seen\.current/.test(code), 'and it advances on a RISE in that count, not on a render');
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
