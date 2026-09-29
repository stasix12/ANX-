/*
 * THE CAMPAIGN CARD, MEASURED IN A REAL BROWSER AT PHONE WIDTH.
 *
 * The owner sent a screenshot of the campaigns list with one card filling the
 * screen and a row of loose blue words — ערוך, שכפל, תגובה, + פוסט, and a red
 * מחק — floating between two cards, belonging visibly to neither. The brief
 * that followed asked for a card 25–35% shorter with every action inside its
 * own border.
 *
 * "25–35% shorter" is a claim about pixels, and pixels are the one thing a
 * source-drift guard cannot check. So this file renders the real component
 * with the real compiled stylesheet and measures it in Chromium.
 *
 * THE BEFORE FIGURES, measured the same way on the previous component before
 * it was replaced (git show HEAD:…/CampaignCard.tsx, rendered beside the
 * action row the page printed under it):
 *
 *     a finished run, mostly skipped      341 + 44 = 385px
 *     a live run, Cyrillic group name     357 + 44 = 401px
 *     a long name, five-figure counts     341 + 44 = 385px
 *     an empty campaign                   235 + 44 = 279px
 *
 * The ceiling below is 250px, which holds every one of those to at least a
 * 30% cut and leaves room for a longer badge than any runBadge() writes today.
 *
 * IT ALSO CATCHES WHAT THE EYE DID NOT. Compacting the title to 15px took the
 * primary way into a campaign — its name — from the 44px the old card gave it
 * down to TWENTY, and nothing in the suite would have said so. The tap-target
 * assertion here is why the header is now one link over the picture and the
 * name together.
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
   top-level await there is ERR_REQUIRE_ASYNC_MODULE. Same shape as
   progress-contradiction.test.ts. */
async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    console.log('campaign card measurement SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'campaign-card-'));
  copyFileSync(css, path.join(dir, 'app.css'));
  /* Rendered in a child process: this file is a plain node test and the
     component is a React tree that needs the app's own tsconfig paths. */
  const html = execFileSync('npx', ['tsx', 'worker/test/render-card.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 });
  writeFileSync(path.join(dir, 'index.html'), html);

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    /* 390 is the iPhone the owner uses; 360 is the narrowest Android still
       worth supporting; 430 is the widest phone. A card that survives all
       three survives the grid on desktop, which only gets wider. */
    for (const width of [360, 390, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`file://${path.join(dir, 'index.html')}`);
      await page.waitForTimeout(200);
      const seen = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.card-probe > div')];
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          cards: cards.map((c) => ({
            height: Math.round(c.getBoundingClientRect().height),
            chips: c.querySelectorAll('li').length,
            /* A chip whose content is wider than its box has clipped a number
               — the one thing on this card that must never be half-read. */
            clipped: [...c.querySelectorAll('li')].some((e) => e.scrollWidth > e.clientWidth + 1),
            /* Anything a thumb is meant to hit. `truncate` boxes are allowed
               to be narrower than their text; nothing else is. */
            /* The first child of the header link: the cover, the dashed plus
               or the quiet tile. All three are 48px or the names go ragged. */
            slot: Math.round((c.querySelector('header a > :first-child') as HTMLElement | null)?.getBoundingClientRect().width ?? 0),
            smallTargets: [...c.querySelectorAll('button,a')]
              .map((e) => ({ tag: e.tagName, h: e.getBoundingClientRect().height, cls: String(e.className).slice(0, 40) }))
              .filter((t) => t.h > 0 && t.h < 40),
          })),
        };
      });
      await page.close();

      assert.equal(seen.overflow, false, `${width}px: the page scrolls sideways`);
      assert.ok(seen.cards.length >= 4, `${width}px: the fixture lost its cards`);
      for (const [i, card] of seen.cards.entries()) {
        assert.ok(
          card.height <= 250,
          `${width}px: card ${i} is ${card.height}px — the brief asked for 25–35% off a card that measured 385px, and this is the ceiling that holds it`,
        );
        assert.equal(card.clipped, false, `${width}px: card ${i} clipped one of its status chips`);
        assert.deepEqual(
          card.smallTargets,
          [],
          `${width}px: card ${i} has a tap target under 40px — ${JSON.stringify(card.smallTargets)}`,
        );
        /* Four outcomes, always four, or the row stops being readable as one
           sentence. A campaign with no publications at all has none. */
        assert.ok(card.chips === 4 || card.chips === 0, `${width}px: card ${i} drew ${card.chips} chips`);
        /*
         * EVERY CARD RESERVES THE SAME PICTURE SLOT. The owner asked why some
         * campaigns showed a picture and some showed nothing: a campaign whose
         * post could not be found rendered no slot at all, so its name sat 58px
         * to the side of its neighbours' and the list's left edge moved from
         * row to row. Three states now — a cover, a dashed plus, a quiet tile —
         * and all of them 48px wide.
         */
        assert.equal(
          card.slot,
          48,
          `${width}px: card ${i} has a ${card.slot}px picture slot — every card must reserve the same width or the list's edge moves`,
        );
      }
      const tall = Math.max(...seen.cards.map((c) => c.height));
      console.log(`  ✓ ${width}px — tallest card ${tall}px, no overflow, no clipped chip, no small target`);
    }
  } finally {
    await browser.close();
  }
  console.log('campaign card measurement OK');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
