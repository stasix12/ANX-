import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

/**
 * THE RUN STRIP — SWIPED, not just rendered.
 *
 * "עכשיו אם אני מריץ עוד קמפיין אני רוצה שיהיה ניתן לראות אותה גם בעמוד הזה
 *  בסגנון SWIPE גלילה שמאלה ימינה."
 *
 * Static HTML can show three cards side by side. It cannot show that a thumb
 * lands on a WHOLE card instead of halfway between two, that the dot under
 * them follows the finger, that tapping a dot brings its card over, or — the
 * one that would be reported as "the app jumps" — that moving the strip
 * sideways leaves the page exactly where it was vertically. Every one of those
 * is the feature, and none of them exists until something is dragged.
 *
 * SO THIS DRIVES THE REAL THING: the real CardSwiper holding three real
 * LiveCampaignHero cards, React running, the compiled stylesheet, in Chromium,
 * at the three phone widths the rest of this suite uses.
 *
 * WHAT IT GUARDS, IN ORDER OF HOW BADLY IT WOULD READ:
 *
 *   • the page never scrolls sideways — a strip that widens the document is
 *     the one fault that breaks every other screen too;
 *   • one card per view, exactly, at every width;
 *   • a swipe SNAPS: the strip comes to rest on a card edge, never between;
 *   • the dots count the cards and the lit one is the card in view;
 *   • a dot moves the strip and NOT the page;
 *   • with one run there is no strip furniture at all — the dashboard looks
 *     exactly as it did before this existed.
 *
 *   npx tsx worker/test/swiper.test.ts
 */

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

/* ───────────────────────────── source guards ───────────────────────────── */

/** Comments stripped, so a negative check cannot match the prose explaining it. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

const swiper = code('src/components/social/CardSwiper.tsx');
const page = code('src/app/social/page.tsx');

/* THE DASHBOARD SHOWS EVERY RUN, not the first one. The `[0]` this replaced is
   the whole bug: a second live campaign was not on the screen at all. */
is(/<CardSwiper/.test(page), 'the dashboard renders its runs in the strip');
is(/runs\.map\(\(run\)/.test(page), 'and it maps over all of them');
is(!/\.sort\([\s\S]{0,400}\}\)\[0\]/.test(page), 'the single-run `[0]` pick is gone');

/* ONE READ FOR EVERY COVER. N cards must not become N requests on the screen
   whose speed the owner complained about by name. */
is(/runCovers\(ids\)/.test(page), 'the covers come from one bulk read');
is(!/runCoverMedia\(/.test(page), 'and not one request per card');

/* PER-CARD BUSY AND PER-CARD SAVE. A pause on one run may not grey out the two
   beside it, and a schedule write belongs to the card it came from. */
is(/camp-pause:\$\{run\.campaign\.id\}/.test(page), 'pausing is keyed to the run it acts on');
is(/busy=\{campBusy\(run\.campaign\.id\)\}/.test(page), 'and only that card shows busy');
is(/scheduleBusy && schedulePatch\?\.id === run\.campaign\.id/.test(page), 'a schedule write marks only the card that made it');

/* THE GESTURE IS THE BROWSER'S. A hand-rolled drag would have to reinvent
   friction, the rubber band and the trackpad, and would be the first thing
   here that does not feel like the phone. */
is(/overflow-x-auto/.test(swiper) && /snap-x snap-mandatory/.test(swiper), 'the strip is a native snap scroller');
is(/w-full shrink-0 snap-center/.test(swiper), 'and each slide is exactly one view wide');
is(/overscroll-x-contain/.test(swiper), 'a swipe past the end is not handed to the browser as a back gesture');
/* RTL: Chrome counts scrollLeft DOWN into negatives in a right-to-left
   scroller. Without the magnitude the dot would stay on the first card for
   the whole strip — on the one page in this product that is RTL throughout. */
is(/Math\.abs\(el\.scrollLeft\)/.test(swiper), 'the scroll position is read as a magnitude, which is what RTL needs');
/* `block: 'nearest'` — the default is 'start', which scrolls the PAGE. */
is(/block: 'nearest'/.test(swiper), 'jumping to a card moves the strip, not the page');

/* ───────────────────────────── the browser pass ─────────────────────────── */

async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    console.log(`swipe strip guards OK — ${checks} assertions (interaction SKIPPED, run \`npm run build\` first)`);
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'swiper-'));
  copyFileSync(css, path.join(dir, 'app.css'));

  await build({
    entryPoints: [path.resolve('worker/test/mount-swiper.tsx')],
    outfile: path.join(dir, 'swiper.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    /* Something in the React/Next graph still reads `process.env` as a whole
       after the define has replaced the one key, and a bare `process` in a
       file:// page is a ReferenceError before the first render. */
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });

  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div id="root"></div><script src="swiper.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    for (const width of [360, 390, 430]) {
      const view = await browser.newPage({ viewport: { width, height: 760 } });
      const crashes: string[] = [];
      view.on('pageerror', (e) => crashes.push(String(e)));
      await view.goto(`file://${path.join(dir, 'index.html')}`);
      await view.waitForSelector('[data-schedule-board]');

      const at = `${width}px`;

      /* THE ONE FAULT THAT BREAKS EVERY OTHER SCREEN. */
      eq(
        await view.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
        false,
        `${at}: the strip widened the page`,
      );

      /* ONE CARD PER VIEW, and the cards are the strip's own width. */
      const geometry = await view.evaluate(() => {
        const strip = document.querySelector('[role="group"]') as HTMLElement;
        const slides = [...strip.children] as HTMLElement[];
        const css = getComputedStyle(strip);
        /* The CONTENT box, not clientWidth: the strip carries `px-1` so the
           first and last card's focus ring has room, and a slide is correctly
           8px narrower than the box that holds it. Measuring against the
           padded width would demand a card that overflows its own container. */
        const content = strip.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
        return {
          strip: Math.round(content),
          slides: slides.map((s) => Math.round(s.getBoundingClientRect().width)),
          scrollable: strip.scrollWidth > strip.clientWidth + 1,
        };
      });
      eq(geometry.slides.length, 3, `${at}: expected three slides`);
      is(
        geometry.slides.every((w) => Math.abs(w - geometry.strip) <= 1),
        `${at}: a slide is ${geometry.slides.join('/')} against a ${geometry.strip} strip — not one card per view`,
      );
      is(geometry.scrollable, `${at}: the strip does not scroll, so there is nothing to swipe`);

      /* A SWIPE COMES TO REST ON A CARD, never between two. Driven by setting
         the scroll position to a deliberately BAD place — 40% of the way into
         the second card — and letting CSS snap decide where it lands. */
      const snapped = await view.evaluate(async () => {
        const strip = document.querySelector('[role="group"]') as HTMLElement;
        /* The PITCH — card plus gap — which is what a snap point actually
           steps by. The card's own width is 12px short of it, and that is the
           bug this measurement exists to catch. */
        const kids = strip.children as unknown as HTMLElement[];
        const step = Math.abs(kids[1].offsetLeft - kids[0].offsetLeft);
        const sign = strip.scrollLeft <= 0 ? -1 : 1; // RTL counts down, LTR up
        strip.scrollTo({ left: sign * step * 1.4, behavior: 'instant' as ScrollBehavior });
        await new Promise((r) => setTimeout(r, 400));
        return { rest: Math.abs(strip.scrollLeft), step };
      });
      const offBy = Math.abs(snapped.rest - Math.round(snapped.rest / snapped.step) * snapped.step);
      is(offBy <= 2, `${at}: the strip rested ${Math.round(offBy)}px from a card edge — it is not snapping`);

      /* THE DOT FOLLOWS. Three dots, and the lit one is the card in view. */
      const dots = view.locator('button[aria-label^="סבב "]');
      eq(await dots.count(), 3, `${at}: expected one dot per run`);
      eq(await dots.nth(1).getAttribute('aria-current'), 'true', `${at}: the dot did not follow the swipe`);

      /* A DOT MOVES THE STRIP AND NOT THE PAGE. The page is deliberately
         taller than the viewport, so a `scrollIntoView` that forgot
         `block: 'nearest'` would show up here as the document moving. */
      /*
       * THE PAGE IS PUT SOMEWHERE IT CAN MOVE FROM FIRST, and the strip is put
       * fully in view.
       *
       * Both halves are needed and both were learned the hard way. With the
       * document at the top a `block: 'start'` jump has nowhere to go, so the
       * assertion passed whether or not the bug was there. And with the strip
       * only half on screen, `block: 'nearest'` CORRECTLY scrolls the page to
       * reveal it — which is the behaviour we want and would read here as the
       * failure we are looking for. Centring the strip removes both.
       */
      await view.evaluate(() => {
        document.querySelector('[role="group"]')!.scrollIntoView({ block: 'center' });
      });
      await view.waitForTimeout(250);
      const beforeY = await view.evaluate(() => window.scrollY);
      is(beforeY > 0, `${at}: the page did not scroll, so a strip that moves it cannot be caught`);
      await dots.nth(2).click();
      await view.waitForTimeout(500);
      const after = await view.evaluate(() => {
        const strip = document.querySelector('[role="group"]') as HTMLElement;
        const kids = strip.children as unknown as HTMLElement[];
        const step = Math.abs(kids[1].offsetLeft - kids[0].offsetLeft);
        return { index: Math.round(Math.abs(strip.scrollLeft) / step), y: window.scrollY };
      });
      eq(after.index, 2, `${at}: tapping the third dot did not bring the third card over`);
      eq(after.y, beforeY, `${at}: tapping a dot scrolled the page`);
      eq(await dots.nth(2).getAttribute('aria-current'), 'true', `${at}: the third dot did not light up`);

      /* EACH CARD IS WHOLE AND SEPARATE — three schedule blocks, three sets of
         controls, and card 3's switch is not card 1's. A strip that reused one
         card's state across slides is the failure this cannot be allowed to
         have, because it would write the wrong campaign's schedule. */
      const switches = view.locator('[role="switch"]');
      eq(await switches.count(), 3, `${at}: expected one schedule switch per card`);
      await switches.nth(2).click();
      await view.waitForTimeout(100);
      eq(
        await view.evaluate(() => [...document.querySelectorAll('[role="switch"]')].map((s) => s.getAttribute('aria-checked'))),
        ['true', 'true', 'false'],
        `${at}: flipping the third card's switch changed another card's`,
      );

      eq(crashes, [], `${at}: the strip threw: ${crashes[0] ?? ''}`);
      await view.close();
      checks += 13;
    }

    /* ─── AND WITH ONE RUN, NO STRIP FURNITURE AT ALL ──────────────────── */
    {
      const solo = await browser.newPage({ viewport: { width: 390, height: 760 } });
      await solo.goto(`file://${path.join(dir, 'index.html')}`);
      await solo.waitForSelector('[data-schedule-board]');
      /* Re-rendered with a single child, which is what the dashboard passes on
         the ordinary day when exactly one campaign has rows. */
      await solo.evaluate(() => {
        document.querySelectorAll('[role="group"] > *')[2]?.remove();
        document.querySelectorAll('[role="group"] > *')[1]?.remove();
      });
      /* The dots belong to the component, not to the DOM surgery above, so
         this only proves the markup; the real guard is the source one. */
      is(/count > 1 &&/.test(swiper), 'the dots render only when there is more than one card');
      is(/count > 1 \? 'group' : undefined/.test(swiper), 'and a lone card is not announced as one of a set');
      await solo.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`swipe strip OK — ${checks} assertions, swiped at 360/390/430`);
}

void main();
