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
 * THE BEFORE FIGURES, measured the same way on the first version of this card
 * (one tall column, a 112px cover, and the actions printed loose underneath):
 *
 *     a finished run, mostly skipped      341 + 44 = 385px
 *     a live run, Cyrillic group name     357 + 44 = 401px
 *     a long name, five-figure counts     341 + 44 = 385px
 *     an empty campaign                   235 + 44 = 279px
 *
 * AND THEN THE DESIGN SPECIFICATION, which turned the card on its side: a
 * portrait picture about a third of its width on the far side, everything
 * about the run stacked beside it, and three controls at its foot. Measured
 * here at 390px, in the theme /social actually paints:
 *
 *     the reference's own card (5 of 20, nothing skipped)   169px
 *     a run with a "12 דולגו · 3 נכשלו" line under the bar  187px
 *     a run that finished clean, with the ✅ line            189px
 *     an empty campaign, with "+ הוסף פוסט ראשון"           206px
 *
 * The ceiling is the measured maximum plus four, as everywhere in this suite.
 *
 * IT ALSO CATCHES WHAT THE EYE DID NOT. Compacting the title to 15px took the
 * primary way into a campaign — its name — from the 44px the old card gave it
 * down to TWENTY, and nothing in the suite would have said so. That is why the
 * name's target is hit-tested below rather than read off its box: it is drawn
 * at 20px and carries its 44 in an ::after.
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
          cards: cards.map((c) => {
            const box = c.getBoundingClientRect();
            const mid = (box.left + box.right) / 2;
            /*
             * THE PICTURE, found by the one thing that identifies it: it is the
             * link whose accessible name opens the campaign. Found by position
             * or by order, this check could never fail.
             */
            const pic = [...c.querySelectorAll('a')].find((a) => (a.getAttribute('aria-label') ?? '').startsWith('פתח את'));
            const pb = pic?.getBoundingClientRect();
            return {
              height: Math.round(box.height),
              width: Math.round(box.width),
              /* A picture at all, how wide a share of the card it takes, and
                 which side of the card it landed on. Source order decides the
                 last one and reads the same either way round, so it is
                 measured: "התמונות של הקבוצה... בצד שמאל של הכרטיס". */
              picture: pb ? Math.round(pb.width) : 0,
              pictureHeight: pb ? Math.round(pb.height) : 0,
              pictureShare: pb ? Math.round((pb.width / box.width) * 1000) / 10 : 0,
              pictureAtEnd: pb ? (pb.left + pb.right) / 2 < mid : false,
              /*
               * Whether a real cover was painted, not merely wired — INSIDE
               * the picture, not anywhere on the card. `c.querySelector('img')`
               * also matches TargetAvatar's own <img> on the "הבא בתור" line,
               * which the page passes a group picture to in production: the
               * day the fixture gains one, that form stops measuring covers
               * and nothing says so.
               */
              drewCover: !!pic?.querySelector('img, video'),
              /*
               * TEXT CUT OFF MID-NUMBER.
               *
               * The check this replaces measured the four status chips —
               * "the one thing on this card that must never be half-read" —
               * and went with them. The sentence that took their place reaches
               * "120 מתוך 248 פורסמו" in a column barely 200px wide, so the
               * rule is worth more now, not less.
               *
               * BY THE ATTRIBUTE, NOT BY `truncate`. A group's own name and
               * the campaign's own name are user text and are MEANT to end in
               * an ellipsis — "Город Арад , глазами жителей" does, at 360px,
               * and that is the layout working. What may never be cut is a
               * sentence this product wrote with a number in it, and
               * data-must-fit is the card saying which those are. Selected by
               * the attribute under test, a card that drops it reads as having
               * no such labels and this assertion stops asserting — which the
               * floor below is for.
               */
              mustFit: c.querySelectorAll('[data-must-fit]').length,
              /* "הקמפיין הסתיים בהצלחה" — the one claim on this card that is
                 about an OUTCOME rather than a count. See the assertion. */
              saysSuccess: (c.textContent || '').includes('הקמפיין הסתיים בהצלחה'),
              clipped: [...c.querySelectorAll('[data-must-fit]')]
                .filter((e) => e.scrollWidth > e.clientWidth + 1)
                .map((e) => (e.textContent || '').trim().slice(0, 28)),
              /*
               * ANY CONTROL SITTING ON THE PICTURE.
               *
               * The three controls at the foot of the card measure 218px and
               * cannot wrap, so a picture taking a flat 36% of a narrow phone
               * leaves them less room than they need and the row runs back
               * underneath it — 17px of the ⋯ on top of a picture that is
               * itself a link. Two boxes overlapping is not something a class
               * name can show, and the cost is a tap that opens a campaign
               * when it meant to open a menu.
               */
              onPicture: pb
                ? [...c.querySelectorAll('a,button')]
                    .filter((e) => e !== pic)
                    .map((e) => {
                      const b = e.getBoundingClientRect();
                      const w = Math.min(pb.right, b.right) - Math.max(pb.left, b.left);
                      const h = Math.min(pb.bottom, b.bottom) - Math.max(pb.top, b.top);
                      return w > 0 && h > 0 ? `${Math.round(w)}×${Math.round(h)} על "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 16)}"` : '';
                    })
                    .filter(Boolean)
                : [],
              /* Every control has to sit inside the card's own box. */
              escaped: [...c.querySelectorAll('a,button')].filter((e) => {
                const b = e.getBoundingClientRect();
                return b.width > 0 && (b.left < box.left - 1 || b.right > box.right + 1);
              }).length,
            };
          }),
        };
      });

      /*
       * THE TARGETS, MEASURED LAST AND IN A TALL WINDOW.
       *
       * elementFromPoint only answers for what is on screen, and seven cards
       * do not fit in 900px: every control on the lower ones read 1×1 — no
       * target at all — which would have passed as a failure for the wrong
       * reason. The WIDTH is the one under test and does not move, and nothing
       * on this card is measured against the viewport's height.
       */
      await page.setViewportSize({ width, height: 2800 });
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll('.card-probe > div')].map((c) =>
          [...c.querySelectorAll('a,button')].map((e) => {
            const b = e.getBoundingClientRect();
            const x = (b.left + b.right) / 2;
            const y = (b.top + b.bottom) / 2;
            /* Four directions through an anonymous arrow, and NOT a named
               `const reach = …`: esbuild keeps function names by wrapping them
               in `__name`, which does not exist in the page, and the whole
               evaluate throws. */
            const span = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => {
              let n = 0;
              for (let d = 1; d <= 24; d += 1) {
                const under = document.elementFromPoint(x + dx * d, y + dy * d);
                if (!under || (under !== e && !e.contains(under))) break;
                n = d;
              }
              return n;
            });
            return {
              text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24),
              w: span[0] + span[1] + 1,
              h: span[2] + span[3] + 1,
            };
          }),
        ),
      );
      await page.close();

      const say = (m: string) => `${width}px: ${m}`;
      assert.equal(seen.overflow, false, say('the page scrolls sideways'));
      assert.ok(seen.cards.length >= 6, say('the fixture lost its cards'));
      const shares = new Set(seen.cards.map((c) => c.pictureShare));
      assert.equal(shares.size, 1, say(`the cards reserve different picture widths — ${[...shares].join(', ')}%. A list whose edge moves row to row reads as broken.`));

      for (const [i, card] of seen.cards.entries()) {
        assert.ok(
          card.height <= 210,
          say(`card ${i} is ${card.height}px — the design specification's card measured 169 to 206 here, and this is the ceiling that holds it`),
        );
        /*
         * THE PICTURE IS THE POINT OF THIS CARD. "התמונה צריכה להיות אלמנט
         * ויזואלי מרכזי בכרטיס... לא Thumbnail קטן." The brief asks for 34%
         * of the card; the reference itself measures 31.6%, and at 360px the
         * three controls underneath leave room for 24. The floor is what the
         * narrowest phone can hold, and the share being EQUAL across the
         * cards is checked above.
         */
        assert.ok(card.picture > 0, say(`card ${i} drew no picture slot at all`));
        assert.ok(
          card.pictureShare >= 24,
          say(`card ${i}'s picture is ${card.pictureShare}% of it — the specification asks for about a third, and a thumbnail is what this pass replaced`),
        );
        assert.ok(
          card.pictureHeight >= card.height - 24,
          say(`card ${i}'s picture is ${card.pictureHeight}px tall inside a ${card.height}px card — it is meant to run the card's full height`),
        );
        assert.ok(card.pictureAtEnd, say(`card ${i}'s picture is not on its left — "תמונת פוסט גדולה בצד שמאל של הכרטיס"`));
        assert.deepEqual(card.onPicture, [], say(`card ${i}: a control sits on the picture — ${card.onPicture.join(', ')}`));
        assert.equal(card.escaped, 0, say(`card ${i} has ${card.escaped} controls outside its own border`));
        const targets = hits[i] ?? [];
        assert.ok(targets.length >= 4, say(`card ${i} offered ${targets.length} controls to hit-test — the floor below would pass on an empty card`));
        /* A card with publications promises one such label; an empty one
           promises none, and its own branch is checked by the height ceiling. */
        assert.ok(card.mustFit <= 1, say(`card ${i} marked ${card.mustFit} labels as must-fit — the check below would be measuring something else`));
        assert.deepEqual(
          card.clipped,
          [],
          say(`card ${i} cut a label that was meant to fit — ${card.clipped.join(' | ')}`),
        );
        assert.deepEqual(
          targets.filter((t) => t.w < 40 || t.h < 40),
          [],
          say(`card ${i} has a target under 40px to a thumb — ${JSON.stringify(targets.filter((t) => t.w < 40 || t.h < 40))}`),
        );
      }
      /*
       * "הקמפיין הסתיים בהצלחה" ON EXACTLY ONE OF THEM.
       *
       * The first version of this line read `published === total` alone, and
       * three of the fixtures below satisfy that while their badge says
       * otherwise: one from a read that was cut short (so publications are
       * still waiting), one with the whole product on hold from the header,
       * and the clean one. Only the last may say it.
       *
       * Counted rather than located, because the point is the two that must
       * NOT say it: a card is allowed to be anywhere in the list.
       */
      const success = seen.cards.filter((c) => c.saysSuccess).length;
      assert.equal(
        success,
        1,
        say(`${success} cards say "הקמפיין הסתיים בהצלחה" — exactly one fixture finished cleanly; the others are a truncated read and a global pause, and neither ended well`),
      );
      const withCover = seen.cards.filter((c) => c.drewCover).length;
      /* Seven of the nine fixtures carry media. The floor is all seven, not a
         majority: with a majority, a case that silently stopped painting its
         cover still passed, which is what happened when this read `>= 4`. */
      assert.ok(withCover >= 7, say(`only ${withCover} of the nine cards painted a real cover — seven of them carry media`));
      const tall = Math.max(...seen.cards.map((c) => c.height));
      console.log(`  ✓ ${width}px — tallest card ${tall}px, picture ${seen.cards[0].pictureShare}% and on the left, no overlap, no small target`);
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
