/*
 * "תגובות מהירות", MEASURED IN A REAL BROWSER — PHONE AND DESKTOP.
 *
 * The brief was explicit about the shape and about the things that go wrong:
 * "במובייל הכרטיסים יהיו קטנים יחסית ויוצגו בשורה אופקית שניתן לגלול לצדדים…
 * אני רוצה שהמשתמש יוכל לראות בערך 3–4 כרטיסים במבט אחד", and at the end,
 * "וודא שאין overflow, טקסטים חתוכים או בעיות RTL".
 *
 * Every one of those is a claim about pixels, which no source-drift guard can
 * check. So this renders the real component with the real compiled stylesheet,
 * inside the same .crm-theme /social runs under, and measures it.
 *
 * WHAT IT PINS, and why each one has been a real defect somewhere in this app:
 *
 *   - The PAGE must not scroll sideways. A strip that overflows its card
 *     takes the whole document with it, and on a phone that is the bug the
 *     owner sees first.
 *   - THE STRIP must scroll, not the page: scrollWidth greater than
 *     clientWidth on the list itself is the difference between "swipe for
 *     more" and "the layout is broken".
 *   - THREE TO FOUR CARDS IN VIEW at 390px, from the brief.
 *   - NO CLIPPED TEXT. A name that overflows its box instead of truncating.
 *   - NO TAP TARGET UNDER 40px — the accessibility floor this project already
 *     enforces on the campaign card, and the assertion that caught a 20px
 *     campaign name there.
 *   - A RUN THAT NEVER PUBLISHED IS ABSENT. The button under the strip offers
 *     to comment; a comment needs posts to land on.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

/* The compiled stylesheet, which only exists after a build. Skipping loudly
   rather than passing quietly: a measurement test that silently measures
   nothing is worse than no measurement test. */
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

/* Wrapped in a function, not top level: tsx loads this file as CommonJS and a
   top-level await there is ERR_REQUIRE_ASYNC_MODULE. */
async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    console.log('quick-comments measurement SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'quick-comments-'));
  copyFileSync(css, path.join(dir, 'app.css'));
  const html = execFileSync('npx', ['tsx', 'worker/test/render-quick-comments.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 });
  writeFileSync(path.join(dir, 'index.html'), html);

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    /* 360 is the narrowest Android still worth supporting, 390 the iPhone the
       owner uses, 430 the widest phone, 1280 the desktop the brief also asks
       about. */
    for (const width of [360, 390, 430, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`file://${path.join(dir, 'index.html')}`);
      await page.waitForTimeout(200);

      const seen = await page.evaluate(() => {
        const card = document.querySelector('.probe > section') as HTMLElement | null;
        const strip = card?.querySelector('ul') as HTMLElement | null;
        const items = [...(strip?.querySelectorAll(':scope > li') ?? [])] as HTMLElement[];
        const stripBox = strip?.getBoundingClientRect();
        return {
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          found: Boolean(card && strip),
          cards: items.length,
          /* The strip holds more than it shows — that is what makes it a
             swipe rather than a broken row. */
          scrolls: strip ? strip.scrollWidth > strip.clientWidth + 1 : false,
          /* How many fit fully inside the strip's own box, which is the
             "3–4 at a glance" the brief asked for. */
          inView: stripBox
            ? items.filter((li) => {
                const b = li.getBoundingClientRect();
                return b.left >= stripBox.left - 1 && b.right <= stripBox.right + 1;
              }).length
            : 0,
          /* Cards with ANY part of them on screen. "במבט אחד" includes the
             one showing its edge — which is also the thing that tells a thumb
             there is more to the right, so it is not a rounding allowance. */
          glanceable: stripBox
            ? items.filter((li) => {
                const b = li.getBoundingClientRect();
                return b.right > stripBox.left + 1 && b.left < stripBox.right - 1;
              }).length
            : 0,
          /* Text wider than its box, anywhere in the card, except the boxes
             that are explicitly allowed to truncate. */
          clipped: [...(card?.querySelectorAll('span,p,h2') ?? [])]
            .filter((e) => !String((e as HTMLElement).className).includes('truncate'))
            .filter((e) => e.scrollWidth > e.clientWidth + 1)
            .map((e) => (e.textContent ?? '').slice(0, 28)),
          smallTargets: [...(card?.querySelectorAll('button,a') ?? [])]
            .map((e) => ({ h: Math.round(e.getBoundingClientRect().height), cls: String(e.className).slice(0, 36) }))
            .filter((t) => t.h > 0 && t.h < 40),
          /*
           * Right-to-left really applied, not merely asked for: the newest
           * card must sit at the RIGHT edge of the strip's CONTENT box.
           *
           * Against the border box it is 4px short on desktop and exact on a
           * phone — the strip's own px-1, which a scrolled strip absorbs and
           * an unscrolled one does not. Measuring the padding instead of
           * widening the tolerance keeps this an RTL assertion rather than an
           * "about right" one.
           */
          firstAtRight:
            items.length && strip && stripBox
              ? items[0].getBoundingClientRect().right >= stripBox.right - parseFloat(getComputedStyle(strip).paddingRight) - 1
              : false,
          cardHeight: card ? Math.round(card.getBoundingClientRect().height) : 0,
          names: items.map((li) => (li.querySelector('span.truncate')?.textContent ?? '').slice(0, 24)),
        };
      });
      await page.close();

      assert.ok(seen.found, `${width}px: the fixture rendered no card`);
      assert.equal(seen.pageOverflow, false, `${width}px: the page scrolls sideways`);
      /*
       * SIX, NOT SEVEN. The fixture supplies a seventh round that never
       * published; it must not be offered, because the control attached to
       * each card writes a comment onto published posts.
       */
      assert.equal(seen.cards, 6, `${width}px: the strip drew ${seen.cards} cards — a run with nothing published must not appear`);
      assert.deepEqual(seen.clipped, [], `${width}px: text is cut off — ${JSON.stringify(seen.clipped)}`);
      assert.deepEqual(seen.smallTargets, [], `${width}px: tap target under 40px — ${JSON.stringify(seen.smallTargets)}`);
      assert.equal(seen.firstAtRight, true, `${width}px: the newest card must start at the RIGHT edge — the strip is not laying out RTL`);

      if (width <= 430) {
        assert.equal(seen.scrolls, true, `${width}px: the strip must scroll sideways rather than squeeze six cards in`);
        assert.ok(
          seen.inView >= 2,
          `${width}px: only ${seen.inView} cards fully in view — one huge card per screen is the shape the brief was written against`,
        );
        assert.ok(
          seen.glanceable >= 3 && seen.glanceable <= 5,
          `${width}px: ${seen.glanceable} cards visible at a glance — the brief asked for about three or four`,
        );
      }
      console.log(`  ✓ ${width}px — ${seen.inView} of ${seen.cards} cards in view, card ${seen.cardHeight}px, no overflow, no clipped text`);
    }
  } finally {
    await browser.close();
  }
  console.log('quick-comments layout tests OK');
}

void main();
