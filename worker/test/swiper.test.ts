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
/*
 * The busy flag was `scheduleBusy && schedulePatch?.id === run.campaign.id` —
 * correct about WHICH card, but derived from two pieces of state that each
 * held only one campaign. The strip made that a bug rather than a limitation:
 * a second card's edit replaced the first's patch, so the first card's
 * spinner vanished while its write was still in flight. Both are keyed now.
 */
is(/scheduleBusy=\{Boolean\(scheduleBusy\[run\.campaign\.id\]\)\}/.test(page), 'a schedule write marks only the card that made it');
is(/const \[scheduleBusy, setScheduleBusy\] = useState<Record<string, boolean>>\(\{\}\);/.test(page), 'and the flag can hold more than one card at a time');
is(/scheduleTimers\.current\[campaign\.id\]/.test(page), 'and so can the debounce, so one card\u2019s edit cannot cancel another\u2019s save');

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

/* ═══════════════════════════════════════════════════════════════════════ *
 *  STAY ON THE CARD — and it was inert, which is a stop on the wrong round
 * ═══════════════════════════════════════════════════════════════════════ */
/*
 * `held` remembers WHICH CAMPAIGN is under the thumb, so a poll that
 * re-sorts the list can put the strip back on it. It was written by
 * `useEffect(..., [keys, index])` — and `keys` is rebuilt on every render,
 * so that effect ran on every render, including the one straight after a
 * re-sort. `index` was still the old slot and `keys` already the new order,
 * so it stored the campaign that had just moved INTO that slot. The restore
 * then found it in place and did nothing. The mechanism never worked.
 *
 * The dashboard's run card carries "סיים ואפס", which archives a round and
 * cancels every publication still waiting in it. A card that silently
 * becomes a different campaign between the look and the tap is a stop
 * applied to the wrong round, and there is no undo for the cancelled rows.
 */
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const code = strip(swiper);
  is(
    !/useEffect\(\(\) => \{\s*if \(!keys\) return;\s*held\.current = keys\[index\][\s\S]{0,40}\}, \[keys, index\]\)/.test(code),
    'held is written from a render again — it will be overwritten by the re-sort it exists to survive',
  );
  /* Written where the position changes DELIBERATELY: a scroll, and a tap. */
  is(/held\.current = keysRef\.current\?\.\[clamped\]/.test(code), 'a scroll no longer records which card the owner landed on');
  is(/held\.current = keysRef\.current\?\.\[at\]/.test(code), 'a tap on a dot no longer records which card it went to');
  /* And adopted once on mount, so a re-sort before the first touch still
     has something to hold onto. */
  is(/if \(held\.current === null\) \{/.test(code), 'nothing adopts the card in view on the first render — a re-sort before the owner touches anything still swaps it');
  /* The restore itself is unchanged and still keyed on the joined list. */
  is(/const to = keys\.indexOf\(held\.current\);/.test(code), 'the restore no longer looks the held card up in the new order');
}

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

      /*
       * AND THE POSITION AS A NUMBER — "תוסיף אינדיקטור מיקום (1/2)."
       *
       * The dots carried the position only to a screen reader: `itemLabel` is
       * an aria-label and `aria-current` paints a slightly wider pill. On the
       * screen that is readable at three cards and guesswork at eight, and it
       * never answered "how many are there". The figure is the answer, and it
       * has to FOLLOW — a static "1 / 3" over the second card would be worse
       * than nothing.
       */
      const position = view.locator('[data-swiper-position]');
      eq(await position.count(), 1, `${at}: there is no position indicator`);
      eq((await position.innerText()).replace(/\s+/g, ' ').trim(), '2 / 3', `${at}: the position indicator did not follow the swipe`);
      /* VISIBLE, not merely present: a counter inside a collapsed or
         zero-height box is the same as no counter at all. */
      const box = await position.boundingBox();
      is((box?.width ?? 0) >= 18 && (box?.height ?? 0) >= 10, `${at}: the position indicator is not drawn (${JSON.stringify(box)})`);
      /* LTR, because "2 / 3" is digits around a neutral slash and an RTL line
         reorders it into "3 / 2" — the one way a counter can be wrong while
         being right. */
      eq(await position.getAttribute('dir'), 'ltr', `${at}: the position indicator is not an LTR island`);

      /* A DOT MOVES THE STRIP AND NOT THE PAGE. The page is deliberately
         taller than the viewport, so a `scrollIntoView` that forgot
         `block: 'nearest'` would show up here as the document moving. */
      /*
       * ─── THE "A DOT MOVES THE STRIP, NOT THE PAGE" RULE MOVED HOUSE ─────
       *
       * It used to be asserted here: centre the strip in this 760px viewport,
       * tap a dot, demand the document not move by a single pixel. That was a
       * sharp test while a card was about five hundred pixels tall.
       *
       * IT CANNOT DISCRIMINATE ANY MORE, AND I MEASURED THAT RATHER THAN
       * ASSUMING IT. The owner asked for the scheduling block to be open on
       * the main page, so a card is 699px at 390 and 761px at 360 against a
       * 760px viewport. CardSwiper calls
       * `card.scrollIntoView({ block: 'nearest', inline: 'center' })`, and
       * with a card that nearly fills the screen the browser nudges the page
       * by 48px to sit the card against the bottom edge — measured: y 303→255,
       * card top 13→61, bottom flush at 760. Meanwhile the BUG this rule
       * exists to catch, `block: 'start'`, would have moved the page by 13px,
       * because the card's top was already 13px below the fold. The correct
       * behaviour moves it FURTHER than the defect. No threshold separates
       * them at this height.
       *
       * So the rule is asserted in the tall-viewport block after this loop,
       * where a whole card and its dots fit on screen and `nearest` is a
       * genuine no-op while `start` still jumps. That version is mutation-
       * checked: flipping line 189 of CardSwiper.tsx to `block: 'start'` turns
       * it red. What stays here is everything this geometry CAN answer — that
       * the dot brings the right card over, lights up, and moves the counter.
       */
      await dots.nth(2).click();
      await view.waitForTimeout(500);
      const after = await view.evaluate(() => {
        const strip = document.querySelector('[role="group"]') as HTMLElement;
        const kids = strip.children as unknown as HTMLElement[];
        const step = Math.abs(kids[1].offsetLeft - kids[0].offsetLeft);
        return { index: Math.round(Math.abs(strip.scrollLeft) / step) };
      });
      eq(after.index, 2, `${at}: tapping the third dot did not bring the third card over`);
      eq(await dots.nth(2).getAttribute('aria-current'), 'true', `${at}: the third dot did not light up`);
      eq((await position.innerText()).replace(/\s+/g, ' ').trim(), '3 / 3', `${at}: the position indicator did not follow the dot tap`);

      /*
       * ───────── AND A WAY THROUGH THAT IS NOT A SWIPE ─────────
       *
       * "שקיימים חצים או מנגנון מעבר חלופי."
       *
       * The dots were the only non-gesture control and they are 10px marks
       * whose meaning has to be inferred. These are buttons with words behind
       * them, and the test drives them the way a thumb would.
       */
      const back = view.locator('button[aria-label="הסבב הקודם"]');
      const fwd = view.locator('button[aria-label="הסבב הבא"]');
      eq(await back.count(), 1, `${at}: there is no previous arrow`);
      eq(await fwd.count(), 1, `${at}: there is no next arrow`);
      /* At the last card: forward is disabled, back is not. Disabled and not
         hidden, or the dots beside them shift every time an end is reached. */
      eq(await fwd.isDisabled(), true, `${at}: the next arrow is live on the last card`);
      eq(await back.isDisabled(), false, `${at}: the previous arrow is dead where it should work`);
      const yBefore = await view.evaluate(() => window.scrollY);
      await back.click();
      await view.waitForTimeout(500);
      const afterBack = await view.evaluate(() => {
        const strip = document.querySelector('[role="group"]') as HTMLElement;
        const kids = strip.children as unknown as HTMLElement[];
        const stepPx = Math.abs(kids[1].offsetLeft - kids[0].offsetLeft);
        return { index: Math.round(Math.abs(strip.scrollLeft) / stepPx), y: window.scrollY };
      });
      eq(afterBack.index, 1, `${at}: the previous arrow did not move the strip`);
      eq(afterBack.y, yBefore, `${at}: the previous arrow scrolled the page`);
      eq((await position.innerText()).replace(/\s+/g, ' ').trim(), '2 / 3', `${at}: the counter did not follow the arrow`);
      /* A 44px target, which is this product's measured floor for anything a
         thumb presses. */
      const arrowBox = await back.boundingBox();
      is((arrowBox?.width ?? 0) >= 40 && (arrowBox?.height ?? 0) >= 40, `${at}: the arrow is not a tap target (${JSON.stringify(arrowBox)})`);

      /*
       * EACH CARD IS WHOLE AND SEPARATE — three schedule blocks, three equal
       * sets of controls, and card 3's switch is not card 1's. A strip that
       * reused one card's state across slides is the failure this cannot be
       * allowed to have, because it would write the wrong campaign's schedule.
       *
       * PER CARD, NOT A TOTAL OF THREE. This used to assert the total was 3,
       * which said "one switch per card" only as long as a card had exactly
       * one. The scheduling block is now open on the main page, by the owner's
       * request, so each card also carries חזרה יומית — six in total, and the
       * literal 3 went red on a strip that was perfectly separate. The number
       * is now derived from the cards: however many switches a card grows, all
       * three must carry the SAME number, and the first card's must be the
       * window switch it has always been.
       */
      const shape = await view.evaluate(() => {
        /* THE STRIP IS THE FIRST [role="group"], and the scoping matters: the
           scheduling block inside each card carries role="group" as well, so
           a bare `[role="group"] > *` matched twenty-seven elements. The rest
           of this file has always addressed the strip as querySelector's first
           hit; these do the same. */
        const strip = document.querySelector('[role="group"]') as HTMLElement;
        const cards = [...strip.children];
        return {
          cards: cards.length,
          per: cards.map((c) => c.querySelectorAll('[role="switch"]').length),
          total: strip.querySelectorAll('[role="switch"]').length,
        };
      });
      eq(shape.cards, 3, `${at}: the strip drew ${shape.cards} cards, not three`);
      is(shape.per[0] >= 1, `${at}: a card drew no schedule switch at all`);
      eq(shape.per, [shape.per[0], shape.per[0], shape.per[0]], `${at}: the three cards drew ${JSON.stringify(shape.per)} switches — an unequal set means a card is missing a control or sharing one`);
      eq(shape.total, shape.per[0] * 3, `${at}: ${shape.total} switches over three cards of ${shape.per[0]} — something outside the cards is drawing one`);

      /*
       * AND FLIPPING THE LAST CARD'S CHANGES ONLY ITS OWN. Addressed as "the
       * first switch of the third card" rather than by a global index, because
       * a global index silently means a different control the moment a card
       * grows one — which is exactly what happened to the count above.
       */
      const own = (n: number) => view.locator('[role="group"]').first().locator('> *').nth(n).locator('[role="switch"]').first();
      const before = await view.evaluate(() =>
        [...(document.querySelector('[role="group"]') as HTMLElement).children].map((c) => c.querySelector('[role="switch"]')?.getAttribute('aria-checked') ?? ''),
      );
      eq(before, ['true', 'true', 'true'], `${at}: the three window switches did not start on`);
      await own(2).click();
      await view.waitForTimeout(100);
      eq(
        await view.evaluate(() =>
          [...(document.querySelector('[role="group"]') as HTMLElement).children].map((c) => c.querySelector('[role="switch"]')?.getAttribute('aria-checked') ?? ''),
        ),
        ['true', 'true', 'false'],
        `${at}: flipping the third card's switch changed another card's`,
      );

      eq(crashes, [], `${at}: the strip threw: ${crashes[0] ?? ''}`);
      await view.close();
      checks += 26;
    }

    /*
     * ─── AND THE STRICT VERSION, WHERE THE CARD FITS ──────────────────────
     *
     * The bounded check above is as sharp as a 760px viewport allows now that
     * a card is ~760px tall: a legitimate `block: 'nearest'` reveal and a
     * `block: 'start'` jump can be a few pixels apart. So the original rule —
     * a dot moves the strip and NOT the document, by zero pixels — is kept, on
     * a viewport tall enough to hold a whole card with its dots.
     *
     * Not a real phone, and that is the point: it is the one geometry in which
     * the assertion is unambiguous, and it is the one that would catch a
     * `scrollIntoView` with the block argument dropped.
     */
    {
      const tall = await browser.newPage({ viewport: { width: 390, height: 1400 } });
      tall.on('pageerror', (e) => { throw e; });
      await tall.goto(`file://${path.join(dir, 'index.html')}`);
      await tall.waitForSelector('[data-schedule-board]');
      /*
       * SOMETHING ABOVE THE STRIP, or this assertion is the toothless one it
       * used to be. The strip sits near the top of this fixture, so "fully in
       * view" and "scrollY is 0" are the same position — and from the top of
       * the document a `block: 'start'` jump has nowhere to go and passes.
       * 600px of nothing above it means the strip can be fully on screen with
       * the page scrolled, which is the only state that tells the two apart:
       * `nearest` does nothing, `start` pulls the card's top to the fold.
       */
      await tall.evaluate(() => {
        document.body.insertAdjacentHTML('afterbegin', '<div data-spacer style="height:600px"></div>');
        const strip = document.querySelector('[role="group"]') as HTMLElement;
        const b = strip.getBoundingClientRect();
        window.scrollTo({ top: Math.max(0, b.top + window.scrollY - (window.innerHeight - b.height) / 2) });
      });
      await tall.waitForTimeout(250);
      const fits = await tall.evaluate(() => {
        const b = (document.querySelector('[role="group"]') as HTMLElement).getBoundingClientRect();
        return { covered: b.top >= 0 && b.bottom <= window.innerHeight, y: Math.round(window.scrollY), h: Math.round(b.height) };
      });
      is(fits.covered, `a 1400px viewport must hold the whole strip (it is ${fits.h}px) or this check is the ambiguous one again`);

      /* `button[...]`, like the loop above: the CARD carries the same
         aria-label as its dot, so the bare attribute selector matches two
         elements and waits for a card that is never a button. */
      const dot3 = tall.locator('button[aria-label^="סבב "]').nth(2);
      await dot3.scrollIntoViewIfNeeded();
      await tall.waitForTimeout(150);
      const settled = await tall.evaluate(() => Math.round(window.scrollY));
      is(settled > 0, `the page must have somewhere to jump from after the dot was brought into view (y=${settled})`);
      await dot3.click();
      await tall.waitForTimeout(400);
      eq(
        await tall.evaluate(() => Math.round(window.scrollY)),
        settled,
        'tapping a dot moved the document, with the whole strip already on screen — that is a scrollIntoView without block: nearest',
      );
      await tall.close();
      checks += 3;
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
      is(/count > 1 &&/.test(swiper), 'the dots and the counter render only when there is more than one card');
      /* AND THE COUNTER IS INSIDE THAT SAME BLOCK. A lone card labelled
         "1 / 1" reads as a strip with a card missing, so the figure has to be
         governed by the same condition the dots are — checked in the source,
         because the DOM surgery above cannot re-run React's condition. */
      const gated = swiper.split('count > 1 &&')[1] ?? '';
      is(gated.includes('data-swiper-position'), 'the position indicator is inside the more-than-one-card block');
      is(!swiper.slice(0, swiper.indexOf('count > 1 &&')).includes('data-swiper-position'), 'and nowhere outside it');
      is(/count > 1 \? 'group' : undefined/.test(swiper), 'and a lone card is not announced as one of a set');
      await solo.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`swipe strip OK — ${checks} assertions, swiped at 360/390/430`);
}

void main();
