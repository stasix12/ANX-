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
      const seenIn = async (mode: 'sending' | 'waiting' | 'paused' | 'idle' | 'done') => {
        await page.evaluate((m) => window.__mode(m), mode);
        await page.waitForTimeout(150);
        return page.evaluate(() => ({
          fly: document.querySelectorAll('.anx-fly').length,
          trail: document.querySelectorAll('.anx-trail').length,
          breathing: document.querySelectorAll('.anx-breathe').length,
          bot: document.querySelectorAll('.anx-bot').length,
          botMin: document.querySelectorAll('.anx-bot-min').length,
          active: document.querySelectorAll('[data-active]').length,
          dancing: document.querySelectorAll('.anx-dance').length,
          cheering: document.querySelectorAll('.anx-cheer').length,
          confetti: document.querySelectorAll('[data-confetti]').length,
          dribbling: document.querySelectorAll('.anx-dribble').length,
          ball: document.querySelectorAll('[data-ball]').length,
          bounce: document.querySelectorAll('.anx-bounce').length,
        }));
      };

      /* Let the burst above finish so `sending` is genuinely sending. */
      await page.waitForTimeout(2800);

      const sending = await seenIn('sending');
      is(sending.fly === 1 && sending.trail === 1, 'SENDING: the card travels and the trail flows towards the group it is going to');
      eq(sending.breathing, 1, 'and exactly one group breathes');
      eq(sending.bot, 1, 'with the robot hovering');

      /*
       * WAITING — most of the day, and the state this panel was worst at.
       *
       * "שהרובוט לא בפעולה תרשום מחכה לעבודות, והרובוט עצמו שוכב על ספה." It
       * drew the robot hovering exactly as it does while publishing, under a
       * headline that said "רובוט בפעולה", so the one screen whose job is to
       * answer "is it actually publishing?" said yes through every gap
       * between publications — which on his own screenshot was the whole
       * morning, with 0 of 268 out.
       *
       * RE-POINTED, NOT DELETED: `bot` used to be asserted at 1 here and is
       * now asserted at 0, because the hover is what it must no longer do.
       */
      const waiting = await seenIn('waiting');
      eq(waiting.fly, 0, 'WAITING: nothing travels — the gap between publications is not a publication');
      eq(waiting.trail, 0, 'and the trail is still');
      eq(waiting.breathing, 0, 'and no group pulses — nothing is on its way to one');
      eq(waiting.active, 1, 'but the next destination is still named');
      eq(waiting.bot, 0, 'the WORKING hover stops — it is the same movement the robot makes while publishing, and nothing is being published');
      eq(waiting.ball, 1, 'the robot is bouncing a ball instead — "תעשה אותו שהוא מקפיץ כדור שאין כלום ואין פרסום"');
      eq(waiting.bounce, 1, 'and the ball really bounces, on an element of its own: its floor mark runs the opposite way round the same clock, and one element cannot hold two animations on transform');
      eq(waiting.dribbling, 1, 'with the robot keeping the beat, standing on the floor rather than hovering over it');
      /* And all three really run — see 5b: a missing @keyframes leaves the
         name in place and animates nothing. */
      const beat = await page.evaluate(() =>
        ['.anx-bounce', '.anx-bounce-mark', '.anx-dribble'].map((sel) => {
          const el = document.querySelector(sel);
          return { sel, n: el ? el.getAnimations().length : -1 };
        }),
      );
      for (const a of beat) {
        is(a.n >= 1, `${a.sel} is really animating, not just named (${a.n})`);
      }

      /*
       * AND THE BALL LANDS ON THE FLOOR THE ROBOT STANDS ON.
       *
       * MEASURED, because the alternative is a number that agrees with the
       * geometry today. The drop is derived in the component from the gap
       * between the ball's rest height and the sole of the robot's own feet;
       * a literal in its place looks identical in review and leaves the ball
       * sinking through the floor or stopping in mid-air the first time
       * anything about the robot moves — silently, because an SVG does not
       * complain.
       *
       * Driven to the bottom of the bounce through the Web Animations API:
       * `animation-play-state: paused` freezes a CSS animation wherever it
       * happens to be, which by this point in the run is nowhere in
       * particular. 400ms of an 850ms loop is 47%, inside the window where
       * the ball is on the ground.
       */
      await page.evaluate(() => window.__mode('waiting'));
      await page.waitForTimeout(120);
      /*
       * PAUSE IN ONE TASK, MEASURE IN THE NEXT.
       *
       * The first version did both inside one page.evaluate and failed about
       * one run in three — always reporting the ball at the TOP of its
       * bounce, which is where it had been before the pause. Setting
       * `currentTime` updates the animation; whether the new value has
       * reached layout by the time getBoundingClientRect() runs in the same
       * JS task is not something to rely on. A frame in between removes the
       * question, and a flaky assertion is worse than none — it teaches
       * everybody to re-run the suite.
       */
      await page.evaluate(() => {
        document.querySelectorAll('.anx-bounce').forEach((el) => {
          el.getAnimations().forEach((a) => {
            a.pause();
            a.currentTime = 400;
          });
        });
      });
      await page.waitForTimeout(120);
      const landing = await page.evaluate(() => {
        const svg = document.querySelector('svg') as SVGSVGElement;
        const img = svg.querySelector('image') as SVGImageElement;
        const sole = new DOMPoint(0, Number(img.getAttribute('y')) + Number(img.getAttribute('height'))).matrixTransform(svg.getScreenCTM()!);
        const ball = (svg.querySelector('.anx-bounce') as SVGGElement).getBoundingClientRect();
        const m = svg.getScreenCTM()!;
        return { gap: (ball.bottom - sole.y) / (Math.hypot(m.a, m.b) || 1) };
      });
      is(
        Math.abs(landing.gap) < 2.5,
        `the ball lands on the floor the robot stands on (${landing.gap.toFixed(1)} scene units ${landing.gap > 0 ? 'through it' : 'above it'})`,
      );
      await page.evaluate(() => {
        document.querySelectorAll('.anx-bounce').forEach((el) => el.getAnimations().forEach((a) => a.play()));
      });

      const paused = await seenIn('paused');
      eq(paused.fly, 0, 'PAUSED: nothing travels');
      eq(paused.trail, 0, 'nothing flows');
      eq(paused.breathing, 0, 'nothing pulses');
      eq(paused.active, 0, 'and no group is named as a destination — nothing is going anywhere');
      eq(paused.bot, 0, 'the full idle stops');
      eq(paused.botMin, 1, 'and a smaller, slower breath replaces it — switched off is not broken, and a frozen robot reads as broken');
      eq(paused.ball, 0, 'and no ball: paused is the owner switching the system off, which is a different thing from the robot having nothing to do');

      const idle = await seenIn('idle');
      eq(idle.bot + idle.botMin, 0, 'IDLE: with nothing scheduled at all, even that stops');

      /*
       * DONE — the one state that congratulates, and therefore the one with
       * the most to get wrong. It must not look like work: no card in the
       * air, no trail flowing, no group named as a destination and no group
       * pulsing, because nothing is on its way to one. What it adds is the
       * dance and the confetti, and nothing else.
       */
      const done = await seenIn('done');
      eq(done.fly, 0, 'DONE: nothing travels — the day has nothing left to send');
      eq(done.trail, 0, 'nothing flows towards a group');
      eq(done.breathing, 0, 'and no group pulses');
      eq(done.active, 0, 'and none is named as the next destination, because there is no next one');
      eq(done.bot, 0, 'the working float stops');
      eq(done.botMin, 0, 'and so does the paused one — finished is neither of those');
      eq(done.dancing, 1, 'the robot dances instead');
      eq(done.cheering, 1, 'with the cheer nested inside the dance, for the same reason the throw is nested inside the float');
      eq(done.ball, 0, 'and it is not bouncing a ball — it finished the day, it did not sit it out');
      is(done.confetti >= 10, `and there is confetti in the air — ${done.confetti} pieces`);

      /* And every other state has NONE of it. A celebration that leaks into
         a working afternoon is worse than no celebration at all. */
      for (const m of ['sending', 'waiting', 'paused', 'idle'] as const) {
        const other = await seenIn(m);
        eq(other.confetti, 0, `${m.toUpperCase()}: not one piece of confetti — the day is not over`);
        eq(other.dancing, 0, `${m.toUpperCase()}: and the robot is not dancing`);
      }
      /* And the ball belongs to exactly one state. A robot killing time while
         a post is in a worker's hands would be this panel saying nothing is
         happening while something is — the same lie as the old headline, in
         the other direction. */
      for (const m of ['sending', 'paused', 'idle'] as const) {
        const other = await seenIn(m);
        eq(other.ball, 0, `${m.toUpperCase()}: no ball — it kills time only when its hands are empty`);
      }
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
        return { href: i?.getAttribute('href') ?? '', w: Number(i?.getAttribute('width')), h: Number(i?.getAttribute('height')) };
      });
      /*
       * AND THE ROBOT IS HIS ROBOT. "אל תחליף אותו ברובוט מצויר, אייקון,
       * אימוג׳י או דמות דומה" — the first build drew one in SVG paths, which is
       * a drawing OF his robot and therefore exactly what was ruled out.
       */
      is(img.href.includes('robot'), 'the robot is the rendered asset, not paths pretending to be it');
      /*
       * RE-POINTED, NOT DELETED. This used to read `width > 150`, and the
       * claim behind that number was never about width: it was that the robot
       * is a figure in the scene rather than a thumbnail beside it. The crop
       * it was written for is a body flying across the frame, 212 wide of 400
       * and 174 tall of 180. The full-body render that replaced it is the same
       * character STANDING, so it is narrower and the same claim has to be
       * made on its height. A test left at the old number would have failed
       * for the one reason that is not a fault.
       */
      is(img.h > 130, `the robot fills ${img.h} of the scene's 180 units — a figure in it, not an icon beside it`);
      is(img.w > 95, `and ${img.w} of its 400 across`);

      /*
       * AND IT LEAVES THE ROBOT'S HAND AND ARRIVES AT THE GROUP.
       *
       * THIS CAUGHT A REAL BUG, which is why it is measured rather than
       * assumed. The card carried both a `transform` attribute (where it
       * starts) and a CSS animation that also sets `transform`. They are the
       * same property and the animated one does not compose with the
       * attribute — it replaces it. So the card ignored the hand entirely and
       * flew out of the scene's own origin, the empty top-left corner of the
       * panel. Nobody noticed for as long as the robot drawn here was the
       * crop of his design, which is painted holding posts of its own: there
       * was always a card near its hand, just not the one that moves.
       *
       * Both ends are checked, because either alone passes something wrong: a
       * card that starts right and goes nowhere, or one that lands right from
       * the wrong place. The flight is PAUSED at a chosen moment rather than
       * sampled on a timer — 2.4 seconds is long enough that a timed read
       * lands wherever it likes.
       */
      {
        /*
          THE FLIGHT IS MOVED TO AN EXACT MOMENT, through the Web Animations
          API rather than through `animation-play-state` and a negative
          `animation-delay`. Pausing a CSS animation freezes it wherever it
          happens to be — which, by this point in the run, is an arbitrary
          moment several cycles in — and the delay only shifts that. The first
          version of this check did exactly that and read the card at 12% of
          its flight while believing it was at 2%. `currentTime` says which
          millisecond, and means it.
        */
        const at = async (ms: number) => {
          await page.evaluate((t) => {
            document.querySelectorAll('.anx-fly').forEach((el) => {
              el.getAnimations().forEach((a) => {
                a.pause();
                a.currentTime = t;
              });
            });
          }, ms);
          await page.waitForTimeout(80);
          return page.evaluate(() => {
            const boxes = ['[data-card]', '[data-active]'].map((sel) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
            });
            /*
              The hand, where the component puts it: 0.90 across the robot
              picture and 0.69 down it, measured off the asset.
              
              Pushed through the SVG ROOT's matrix and not the image's. The
              image carries the float and the throw, so its matrix is where
              the hand is at this instant — tilted up to six degrees about the
              feet, which swings it a dozen units. The card is a sibling of
              that group and leaves from the hand's RESTING place, so that is
              what this compares against. (Hanging the card inside the throw
              would track the lean, at the cost of a transform the flight
              would then have to undo.)
            */
            const svg = document.querySelector('svg') as SVGSVGElement;
            const img = svg.querySelector('image') as SVGImageElement;
            const hx = Number(img.getAttribute('x')) + 0.9 * Number(img.getAttribute('width'));
            const hy = Number(img.getAttribute('y')) + 0.69 * Number(img.getAttribute('height'));
            const m = svg.getScreenCTM()!;
            const hand = new DOMPoint(hx, hy).matrixTransform(m);
            const unit = Math.hypot(m.a, m.b) || 1;
            return { card: boxes[0], tile: boxes[1], hand: { x: hand.x, y: hand.y }, unit };
          });
        };

        /* 60ms in — 2.5% of the 2.4s flight: it has barely left the hand. */
        const leaving = await at(60);
        const c = leaving.card!;
        const off = Math.hypot(c.x - leaving.hand.x, c.y - leaving.hand.y) / leaving.unit;
        is(
          off < 12,
          `the post leaves the robot's hand (${off.toFixed(1)} scene units from it — it flew out of the panel's top-left corner before this was measured)`,
        );
        /* And near the end of the flight: on the group it was addressed to. */
        const arriving = await at(2150);
        const t = arriving.tile!;
        const c2 = arriving.card!;
        is(
          Math.hypot(c2.x - t.x, c2.y - t.y) < t.w,
          `and finishes on the group it was sent to (${Math.hypot(c2.x - t.x, c2.y - t.y).toFixed(0)}px from its centre, tile ${t.w.toFixed(0)}px wide)`,
        );
        /* Let it run again for everything after this. */
        await page.evaluate(() => {
          document.querySelectorAll('.anx-fly').forEach((el) => {
            el.getAnimations().forEach((a) => a.play());
          });
        });
        await page.waitForTimeout(120);
      }
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
       * A NAME IS NOT AN ANIMATION, and this cost an afternoon.
       *
       * `animation-name` computes to whatever the stylesheet says even when
       * the matching `@keyframes` is not in the build: the browser resolves
       * the name, finds no keyframes, and runs nothing. Every check above
       * reads the NAME, so all of them pass over that. It is not theoretical
       * — the production CSS minifier emitted one of this scene's keyframes
       * as `@keyframes anx-ball-DELETED`, and the element sat there with
       * `animation-name: anx-ball`, `transform: none` and no animation at
       * all. Renaming it fixed it; nothing warned.
       *
       * getAnimations() is the question that cannot be answered by a name.
       */
      const alive = await page.evaluate(() =>
        ['.anx-bot', '.anx-fly', '.anx-trail', '.anx-halo', '.anx-send', '.anx-shadow'].map((sel) => {
          const el = document.querySelector(sel);
          return { sel, n: el ? el.getAnimations().length : -1 };
        }),
      );
      for (const a of alive) {
        is(a.n >= 1, `${a.sel} has a name AND a running animation behind it (${a.n})`);
      }
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

    /* ── 5e. THE BAR LOOKS LIKE IT IS WORKING, AND ONLY WHEN IT IS ──────── */
    /*
     * "תוסיף לו אנימציה כאילו הוא נטען."
     *
     * The light is allowed to run while the round is running, because that is
     * true. It must stop when the day is finished and when the owner has
     * switched publishing off — a bar that still shimmers over a paused round
     * is the screen saying something is happening while nothing is, which is
     * the one thing nothing in this panel may do.
     *
     * Driven through the real panel rather than a copy of its markup: the
     * class is chosen in LiveCampaignHero from publishedToday and plannedToday,
     * and a test that hand-wrote the class would prove only that CSS works.
     */
    {
      const fill = () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-panel] [role="img"] span') as HTMLElement | null;
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { anim: cs.animationName, cls: el.className, width: el.getBoundingClientRect().width };
        });

      await page.evaluate(() => window.__plan(170, 248));
      await page.waitForTimeout(150);
      const mid = await fill();
      is(mid !== null, 'the bar is drawn once the day has publications in it');
      eq(mid!.anim, 'anx-bar-sheen', 'MID-ROUND: the light runs along the fill');
      is(mid!.width > 0, 'over a fill that has width');

      /* Finished: the colour stays, the light goes. */
      await page.evaluate(() => window.__plan(248, 248));
      await page.waitForTimeout(150);
      const done = await fill();
      eq(done!.anim, 'none', 'FINISHED: the light stops — nothing is still loading');
      is(/anx-bar\b/.test(done!.cls), 'but the fill keeps the gradient it had');

      /* Paused: grey, and certainly not shimmering. */
      await page.evaluate(() => { window.__plan(170, 248); window.__mode('paused'); });
      await page.waitForTimeout(150);
      const off = await fill();
      eq(off!.anim, 'none', 'PAUSED: no light over a round the owner switched off');
      is(!/anx-bar/.test(off!.cls), 'and not the brand gradient either — a paused round that wore it would look like it was running');

      await page.evaluate(() => { window.__mode('sending'); window.__plan(0, 0); });
      await page.waitForTimeout(120);
    }

    /* ── 5f. "הרובוט סיים לפרסם" — AND ONLY WHEN HE HAS ─────────────────── */
    /*
     * "מתי שזה מסיים את כל המטלות פרסום, תרשום הרובוט סיים לפרסם, ותעשה
     *  אנימציה שלו רוקד וקונפטי באוויר."
     *
     * Driven through the REAL panel, because the decision lives there: the
     * scene is handed a mode, and whether that mode is `done` is worked out in
     * LiveCampaignHero from publishedToday, plannedToday and inFlight. A test
     * that rendered <PublishingScene mode="done"> would prove the dance works
     * and nothing about when it is allowed to run — which is the only part
     * that can mislead him.
     *
     * The three ways it must stay silent are each a real afternoon:
     *   mid-round          — 170 of 248, the common case
     *   last row in hand   — the count has caught up but a worker is holding
     *                        the final post; the day is not over yet
     *   paused             — he switched it off; nothing finished
     */
    {
      const panel = () =>
        page.evaluate(() => {
          const p = document.querySelector('[data-panel]') as HTMLElement;
          const svg = p.querySelector('svg');
          return {
            title: (p.querySelector('h2')?.textContent ?? '').trim(),
            line: (p.querySelector('[data-done]')?.textContent ?? '').trim(),
            dancing: p.querySelectorAll('.anx-dance').length,
            cheering: p.querySelectorAll('.anx-cheer').length,
            confetti: p.querySelectorAll('[data-confetti]').length,
            ball: p.querySelectorAll('[data-ball]').length,
            fly: p.querySelectorAll('.anx-fly').length,
            active: p.querySelectorAll('[data-active]').length,
            label: svg?.getAttribute('aria-label') ?? '',
          };
        });

      /* MID-ROUND. */
      await page.evaluate(() => { window.__mode('sending'); window.__plan(170, 248); });
      await page.waitForTimeout(150);
      const mid = await panel();
      eq(mid.title, 'רובוט בפעולה', 'MID-ROUND: the working title');
      eq(mid.confetti, 0, 'and no confetti over 78 posts that have not gone out yet');
      eq(mid.dancing, 0, 'and no dance');
      eq(mid.line, '', 'and nothing claiming the queue is empty');

      /* THE LAST ROW IS IN A WORKER'S HANDS. The figures have caught up —
         248 of 248 — but the publication is still happening. This is the one
         the guard exists for, and the one a count-only check gets wrong. */
      await page.evaluate(() => { window.__mode('sending'); window.__plan(248, 248); });
      await page.waitForTimeout(150);
      const inHand = await panel();
      eq(inHand.confetti, 0, 'LAST ROW IN FLIGHT: still no confetti — a row a worker is holding is a row that has not landed');
      eq(inHand.dancing, 0, 'and still no dance');
      is(inHand.title !== 'הרובוט סיים לפרסם', `and the title does not say he finished (it says "${inHand.title}")`);

      /* NOW IT IS OVER: nothing waiting and nobody holding anything. */
      await page.evaluate(() => { window.__mode('waiting'); window.__plan(248, 248); });
      await page.waitForTimeout(200);
      const over = await panel();
      eq(over.title, 'הרובוט סיים לפרסם', 'FINISHED: the exact sentence he asked for');
      eq(over.line, 'אין עוד פרסומים שממתינים לצאת היום', 'and said in words under the scene — precisely, because posts that FAILED are not in this sum');
      eq(over.dancing, 1, 'the robot dances');
      eq(over.cheering, 1, 'and cheers inside the dance');
      is(over.confetti >= 10, `with confetti in the air — ${over.confetti} pieces`);
      eq(over.fly, 0, 'and nothing is being thrown at a group any more');
      eq(over.active, 0, 'and no group is named as the next destination');
      is(over.label.includes('הרובוט סיים לפרסם'), 'and a screen reader is told the same thing, not "מפרסם לקבוצות"');

      /*
       * AND IT IS THE ROBOT WITH LEGS, IN BOTH STATES.
       *
       * RE-POINTED, NOT DELETED. This used to assert that the two states drew
       * DIFFERENT pictures — the standing render for the dance, the crop of
       * his design for the working scene — because at the time they did. He
       * then asked for the whole body while it is publishing too ("עכשיו גם
       * שהוא שולח פוסטים … תעשה אותו אם כל הגוף שולח הודעות לקבוצות"), so the
       * claim is now the opposite one and is written out rather than dropped:
       * ONE picture, in every state, and it is the one with feet.
       *
       * What tells the two states apart is no longer the robot. It is the
       * post: in the working scene a card leaves its hand, and on a finished
       * day nothing does. That is asserted here as well, because "same robot
       * everywhere" on its own would pass against a scene that had quietly
       * stopped sending anything.
       */
      const shown = await page.evaluate(() => {
        const p = document.querySelector('[data-panel]') as HTMLElement;
        return {
          pictures: Array.from(p.querySelectorAll('svg image')).map((i) => i.getAttribute('href') ?? ''),
          cards: p.querySelectorAll('[data-card]').length,
        };
      });
      eq(shown.pictures.length, 1, 'FINISHED: one robot on the card');
      is(shown.pictures[0].includes('robot-full'), `and it is the full body, with feet to leave the ground (${shown.pictures[0]})`);
      eq(shown.cards, 0, 'and nothing is leaving its hand, because the day has nothing left to send');

      await page.evaluate(() => { window.__mode('sending'); window.__plan(170, 248); });
      await page.waitForTimeout(150);
      const mid2 = await page.evaluate(() => {
        const p = document.querySelector('[data-panel]') as HTMLElement;
        return {
          pictures: Array.from(p.querySelectorAll('svg image')).map((i) => i.getAttribute('href') ?? ''),
          cards: p.querySelectorAll('[data-card]').length,
          throwing: p.querySelectorAll('.anx-send').length,
        };
      });
      is(
        mid2.pictures.length === 1 && mid2.pictures[0].includes('robot-full'),
        `MID-ROUND: the same whole body is publishing (${mid2.pictures[0] ?? 'none'})`,
      );
      eq(mid2.cards, 1, 'with a post leaving its hand');
      eq(mid2.throwing, 1, 'and the body throwing it — a picture with its arms down has to put the gesture in the motion');
      await page.evaluate(() => { window.__mode('waiting'); window.__plan(248, 248); });
      await page.waitForTimeout(200);

      /* THE ANIMATIONS REALLY RUN — the same question section 5b asks of the
         working state, for the same reason: a stylesheet with no keyframes in
         it passes every "is it off under reduced motion" check perfectly. */
      const spin = await page.evaluate(() => {
        const p = document.querySelector('[data-panel]') as HTMLElement;
        const names = ['.anx-dance', '.anx-cheer', '.anx-shadow-dance', '[data-confetti]'].map((sel) => {
          const el = p.querySelector(sel);
          return el ? getComputedStyle(el).animationName : 'absent';
        });
        const bits = Array.from(p.querySelectorAll('[data-confetti]')).map((el) => ({
          delay: getComputedStyle(el).animationDelay,
          dur: getComputedStyle(el).animationDuration,
        }));
        return {
          dance: names[0],
          cheer: names[1],
          shadow: names[2],
          confetti: names[3],
          delays: new Set(bits.map((b) => b.delay)).size,
          durs: new Set(bits.map((b) => b.dur)).size,
        };
      });
      eq(spin.dance, 'anx-dance', 'the dance is a real animation and not a class nothing styles');
      eq(spin.cheer, 'anx-cheer', 'and so is the cheer');
      eq(spin.shadow, 'anx-shadow-dance', 'with the shadow swinging on the dance’s clock — without it the dance reads as a picture being rotated');
      eq(spin.confetti, 'anx-confetti', 'and the confetti really falls');
      is(spin.delays > 4, `the pieces start at different moments (${spin.delays} distinct delays) — fourteen in lockstep is a falling comb, not confetti`);
      is(spin.durs > 3, `and fall at different speeds (${spin.durs} distinct durations)`);

      /*
       * AND THE JUMP STAYS IN THE FRAME.
       *
       * "בריקוד שיראו גם את הרגלים שלו." The dance draws his full-body
       * render — a different picture from the flier, with feet to leave the
       * ground with — and a jump is the one movement in this scene that can
       * throw the antenna out of the top of the frame. An SVG clips to
       * its viewBox, so that failure is silent: the robot loses the tip of its
       * antenna for a fifth of a second, twice a second, and nothing errors.
       *
       * MEASURED AT THE ANTENNA ITSELF, through getScreenCTM(), not off the
       * element's bounding rectangle. A rotated element's bounding rectangle
       * is the box around the tilt, so it rises several pixels above anything
       * actually drawn — the first version of this check failed by a quarter
       * of a pixel on a robot that was comfortably inside the frame. The CTM
       * carries every transform on the way down (the dance's translate, the
       * cheer's squash, the viewBox's own scale), so transforming one point
       * through it gives where that point really is.
       *
       * The point is the asset's topmost pixel, measured off robot.webp:
       * (239, 22) of 470×374, which is the ball on the antenna.
       *
       * Sampled across two and a half cycles rather than at one instant,
       * because the apex is a fifth of the way through a 1.25s loop and a
       * single read lands on it roughly never.
       */
      {
        /* robot-dance.webp is trimmed to its content, so the antenna's ball
           is the top edge of the picture (fy = 0) and sits just off centre
           (199 of its 392 columns). Measured off the file, like the flier's
           was, rather than guessed. */
        const TIP = { fx: 199 / 392, fy: 0 };
        const seen: { gap: number; ty: number }[] = [];
        for (let i = 0; i < 26; i += 1) {
          seen.push(
            await page.evaluate((tip) => {
              const p = document.querySelector('[data-panel]') as HTMLElement;
              const img = p.querySelector('svg image') as SVGImageElement;
              const svg = p.querySelector('svg') as SVGSVGElement;
              const x = Number(img.getAttribute('x')) + tip.fx * Number(img.getAttribute('width'));
              const y = Number(img.getAttribute('y')) + tip.fy * Number(img.getAttribute('height'));
              const m = img.getScreenCTM()!;
              /* DOMPoint.matrixTransform, rather than doing the arithmetic
                 here: the CTM is a full 2D matrix and the dance rotates. */
              const at = new DOMPoint(x, y).matrixTransform(m);
              /* And the dance's OWN vertical travel, read off its matrix in
                 the scene's own units — see the assertion below for why this
                 is measured separately from the antenna. */
              const dance = new DOMMatrixReadOnly(getComputedStyle(p.querySelector('.anx-dance')!).transform);
              return { gap: at.y - svg.getBoundingClientRect().top, ty: dance.f };
            }, TIP),
          );
          await page.waitForTimeout(120);
        }
        const lowest = Math.min(...seen.map((f) => f.gap));
        is(lowest >= 0, `the jump never puts the antenna through the top of the scene (closest it came: ${lowest.toFixed(1)}px below the edge)`);
        /*
         * AND THE JUMP IS REALLY A JUMP, measured on the dance's own matrix
         * rather than on where the antenna ends up.
         *
         * The first version of this asked only that the antenna move, and a
         * mutation that emptied the dance keyframe entirely SURVIVED it: the
         * squash alone, anchored at the feet, moves the top of the robot
         * about ten pixels on its own. "Something moved" is not the claim.
         * The claim is that the body leaves the ground — the keyframe travels
         * from three units below the resting line to ten above it — so it is
         * the dance's own translate that is read here.
         */
        const travel = Math.max(...seen.map((f) => f.ty)) - Math.min(...seen.map((f) => f.ty));
        is(travel > 9, `and the body really leaves the ground — ${travel.toFixed(1)} scene units between the crouch and the apex, not a squash pretending to be a jump`);
      }

      /*
       * BETWEEN PUBLICATIONS — the state the panel described wrongly for
       * months, and the one it is in for most of a day.
       *
       * "שהרובוט לא בפעולה תרשום מחכה לעבודות." The headline used to be
       * decided by a heartbeat: the PC is awake, therefore "רובוט בפעולה".
       * His own screenshot is that bug — six in the morning, 0 of 268
       * published, and the panel reporting the robot in action.
       *
       * Driven with work still to do (170 of 248) so it cannot be confused
       * with the finished day above: nothing is in a worker's hands, and 78
       * posts are still owed.
       */
      await page.evaluate(() => { window.__mode('waiting'); window.__plan(170, 248); });
      await page.waitForTimeout(200);
      const idle = await panel();
      eq(idle.title, 'מחכה לעבודות', 'BETWEEN PUBLICATIONS: it says it is waiting, because it is');
      eq(idle.fly, 0, 'and nothing is leaving its hand');
      eq(idle.line, '', 'and it does NOT claim the day is clear — 78 posts are still owed');
      eq(idle.ball, 1, 'the robot is bouncing a ball');
      is(idle.confetti === 0, 'and there is nothing to celebrate yet');

      /* PAUSED, with the day's figures still complete: he switched it off, and
         switched off is not finished. */
      await page.evaluate(() => { window.__mode('paused'); window.__plan(248, 248); });
      await page.waitForTimeout(150);
      const off = await panel();
      eq(off.confetti, 0, 'PAUSED: no confetti — a round the owner stopped did not finish');
      eq(off.dancing, 0, 'and no dance');
      eq(off.line, '', 'and no line saying the queue is empty');

      /*
       * A DAY THAT PLANNED NOTHING FINISHED NOTHING. 0 of 0 satisfies
       * `published >= planned` perfectly, which is why this case is written
       * down: without the `plannedToday > 0` guard the panel would
       * congratulate him every morning before the first post was due, and
       * every day the PC stayed off.
       */
      await page.evaluate(() => { window.__mode('waiting'); window.__plan(0, 0); });
      await page.waitForTimeout(150);
      const empty = await panel();
      is(empty.title !== 'הרובוט סיים לפרסם', `EMPTY DAY: nothing was planned, so nothing finished (title: "${empty.title}")`);
      eq(empty.line, '', 'and no line claiming the day is clear');

      await page.evaluate(() => { window.__mode('sending'); window.__plan(0, 0); });
      await page.waitForTimeout(120);
    }

    /* ── 6. AND IT STOPS FOR SOMEBODY WHO ASKED IT TO ───────────────────── */
    {
      const quiet = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      await quiet.goto(`file://${path.join(dir, 'index.html')}`);
      await quiet.waitForSelector('svg');
      await quiet.evaluate(() => { window.__publish(3); window.__plan(170, 248); });
      await quiet.waitForTimeout(150);
      const names = await quiet.evaluate(() =>
        ['.anx-bot', '.anx-fly', '.anx-trail', '.anx-shadow', '.anx-bar-live'].map((sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).animationName : 'absent';
        }),
      );
      for (const [i, n] of names.entries()) {
        is(n === 'none' || n === 'absent', `reduced motion: nothing animates (${['bot', 'fly', 'trail', 'shadow', 'bar'][i]} = ${n})`);
      }
      is((await ticks(quiet)) > 0, 'but the scene is still drawn, and every tick that was earned is still there — the state was never in the motion');

      /*
       * AND THE CELEBRATION STOPS TOO. A dance and fourteen falling pieces
       * are the loudest thing in the panel, so they are the thing a reader who
       * asked their phone for less motion most needs switched off — and the
       * confetti is still DRAWN, scattered where it was placed, so the day
       * still reads as finished without anything moving.
       */
      await quiet.evaluate(() => window.__mode('waiting'));
      await quiet.waitForTimeout(150);
      const rest = await quiet.evaluate(() => {
        const names = ['.anx-dribble', '.anx-bounce', '.anx-bounce-mark'].map((sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).animationName : 'absent';
        });
        return { names, ball: document.querySelectorAll('[data-ball]').length };
      });
      for (const [i, n] of rest.names.entries()) {
        eq(n, 'none', `reduced motion: the idle game is still (${['beat', 'ball', 'floor mark'][i]} = ${n})`);
      }
      /* `>= 1` and not `=== 1`: this page has the panel mounted below the
         standalone scene and the panel's own day is mid-round, so both are
         waiting and both draw one. The claim is that the ball is still THERE
         with the motion off — switched off, not hidden. */
      is(rest.ball >= 1, 'and the ball is still on screen, at rest — switched off, not hidden');

      await quiet.evaluate(() => window.__mode('done'));
      await quiet.waitForTimeout(150);
      const party = await quiet.evaluate(() =>
        ['.anx-dance', '.anx-cheer', '.anx-shadow-dance', '[data-confetti]'].map((sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).animationName : 'absent';
        }),
      );
      for (const [i, n] of party.entries()) {
        eq(n, 'none', `reduced motion: the celebration is still (${['dance', 'cheer', 'shadow', 'confetti'][i]} = ${n})`);
      }
      is(
        (await quiet.locator('[data-confetti]').count()) >= 10,
        'and the confetti is still on the page — switched off, not hidden: the day is still finished',
      );
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
      /*
       * THE CELEBRATION CANNOT ROLL ITS OWN DICE. This component renders on
       * the server first; a number drawn during that render is a different
       * number in the browser, and React answers a hydration mismatch by
       * throwing the tree away — which on this panel means the robot
       * disappearing on first paint.
       */
      is(!/Math\.random/.test(code), 'the confetti scatter is a written table, not a roll — a random number picked during render does not survive hydration');
      is(/CONFETTI\.map/.test(code) && /celebrating &&/.test(code), 'and it is drawn only while the day is actually finished');
      /*
       * AND `done` IS NOT DECIDED HERE. The scene is handed a mode; the
       * question of whether the day is over is answered in the panel, from
       * the same two numbers it prints under the bar. If that ever moved into
       * this file it would be answered twice, and the two answers would drift.
       */
      is(!/plannedToday|inFlight/.test(code), 'the scene never works out for itself whether the day is over — it is told');
      /*
       * AND THE BOUNCE'S DISTANCE IS NOT IN THE STYLESHEET.
       *
       * The drop is the gap between the robot's hand and the floor it stands
       * on, and both come from the robot's own box. A number typed into
       * globals.css would be right until the first time anything about the
       * robot moved, and then the ball would bounce through the floor or stop
       * short of it — silently, because nothing errors.
       */
      is(/--anx-drop/.test(code), 'the stylesheet is told how far to fall rather than deciding it');
      is(
        /const BALL_DROP = BALL_FLOOR - BALL\.r - BALL\.y;/.test(code),
        'and the distance is DERIVED from the floor and the ball, not a literal that happens to agree with them today',
      );
      is(
        /const BALL_FLOOR = ROBOT\.y \+ ROBOT\.h/.test(code),
        'and the floor it lands on is the sole of the robot’s own feet, not a number that agrees with them today',
      );
    }

    eq(crashes, [], 'the scene threw');
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(`publishing scene OK — ${checks} assertions, driven in a real browser`);
}

void main();
