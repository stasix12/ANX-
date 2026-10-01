import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

/**
 * גילוי קבוצות, MEASURED IN A REAL BROWSER AT PHONE WIDTH — IN THREE SCRIPTS.
 *
 * "בסוף תבדוק שהפיצ'ר עובד טוב גם בעברית RTL וגם בשמות קבוצות ברוסית."
 *
 * That is a claim about pixels, and pixels are the one thing a source-drift
 * guard cannot check. A search for "באר שבע" really does come back with
 * "באר שבע ביחד" and "Наша Беэр-Шева" in the same list, and the second one is
 * a LEFT-to-right name inside a RIGHT-to-left row: without dir="auto" on it,
 * its trailing digits and punctuation are thrown to the wrong end and
 * "Наша Беэр-Шева 24" renders as "24 Наша Беэр-Шева". Which looks like a
 * typo rather than a bug, so nobody reports it.
 *
 * The other half is the thing the owner says about every screen: it is used on
 * a phone. A row that pushes its buttons off a 360px screen, or clips a group's
 * name to nothing, or hands a thumb a 30px target, is a row that fails on the
 * device it was built for.
 *
 *   npm run build && npx tsx worker/test/discovery-row.test.ts
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

/*
 * The row is compact on purpose — "לא לבזבז יותר מדי גובה לכל קבוצה".
 *
 * MEASURED, and the number is not a preference. With three controls on the
 * action line the worst row here measured 208px at 360 — four rows to a
 * screen. Moving "לא רלוונטי" up to the ✕ beside the name and shortening the
 * add button put every row at 132 or under, which is six. The ceiling is the
 * measured maximum plus four pixels: enough that a font metric changing by a
 * hair is not a failure, not enough for a fourth line of anything.
 *
 * THE REDESIGN RAISED IT FROM 136 TO 174, and that is a trade, not a drift.
 * The brief asked for a 52px picture and a name on up to two lines rather than
 * one ellipsised line — and at 360px, where the content column is narrowest, a
 * long Hebrew name really does take the second line. Measured across the seven
 * fixtures at three widths after the redesign: 88 to 170, with the two-line
 * names at 146-170 and every single-line row at 88-133. So the typical row got
 * SHORTER and the longest names got taller, which is the trade the brief asked
 * for: his town names are how he picks a group, and "קבוצת תושבי שכונת נווה
 * זאב ורמו…" is not something to pick from.
 */
const MAX_ROW = 174;

async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    /*
     * A SKIPPED CHECK IS NOT A CHECK — my own words, two files over, while
     * this one skipped and exited 0.
     *
     * Everything measured here is measured nowhere else: that the ✕ on the
     * card is 44px and inside the card at 360px, that a Cyrillic name resolves
     * left-to-right, that no row pushes the page sideways. On a tree where
     * `npm run build` has not run, all of it passed while asserting nothing —
     * and `npm run test:social` went green.
     *
     * So it fails instead, and says exactly how to fix it. ALLOW_UNMEASURED=1
     * is there for someone who deliberately wants the rest of the suite
     * without a build; it has to be typed, which is the whole point.
     */
    const message = 'discovery row measurement CANNOT RUN — no built CSS. Run `npm run build` first, or set ALLOW_UNMEASURED=1 to skip it deliberately.';
    if (process.env.ALLOW_UNMEASURED === '1') {
      console.log(`discovery row measurement SKIPPED ON PURPOSE — ${message}`);
      return;
    }
    throw new Error(message);
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'discovery-row-'));
  copyFileSync(css, path.join(dir, 'app.css'));
  const html = execFileSync('npx', ['tsx', 'worker/test/render-discovery.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 });
  writeFileSync(path.join(dir, 'index.html'), html);

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  let checks = 0;
  try {
    /* 360 is the narrowest Android still worth supporting, 390 the iPhone the
       owner uses, 430 the widest phone. */
    for (const width of [360, 390, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`file://${path.join(dir, 'index.html')}`);
      await page.waitForTimeout(200);

      const seen = await page.evaluate(() => {
        const probes = [...document.querySelectorAll('.row-probe > div')];
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          rows: probes.map((r) => {
            /* By its own hook, NOT by dir="auto" — see the comment beside it
               in Discovery.tsx. Selected by the attribute under test, a
               deleted attribute reads as a missing element and the direction
               assertions below never run at all. */
            const name = r.querySelector('[data-group-name]') as HTMLElement | null;
            const nameBox = name?.getBoundingClientRect();
            const rowBox = r.getBoundingClientRect();
            return {
              height: Math.round(rowBox.height),
              /* Present, non-empty, and actually inside the row. */
              name: name?.textContent?.trim() ?? '',
              nameDir: name?.getAttribute('dir') ?? '',
              /* The direction the BROWSER resolved for it, which is what
                 dir="auto" is for and the only thing that proves it worked. */
              resolved: name ? getComputedStyle(name).direction : '',
              nameVisible: !!nameBox && nameBox.width > 20 && nameBox.height > 8,
              nameInside: !!nameBox && nameBox.left >= rowBox.left - 1 && nameBox.right <= rowBox.right + 1,
              /* Anything a thumb is meant to hit. */
              /* `h > 0` used to be here, which let a COLLAPSED control — the
                 worst case, not an acceptable one — out of the check. */
              smallTargets: [...r.querySelectorAll('button,a')]
                .map((e) => ({ h: Math.round(e.getBoundingClientRect().height), text: (e.textContent || e.getAttribute('aria-label') || '').slice(0, 24) }))
                .filter((t) => t.h < 40),
              /* Every control has to sit inside the row's own box, or it is
                 off the screen on a phone. */
              escaped: [...r.querySelectorAll('button,a')].filter((e) => {
                const b = e.getBoundingClientRect();
                return b.width > 0 && (b.right > rowBox.right + 1 || b.left < rowBox.left - 1);
              }).length,
              /* The picture slot, which every row reserves whether or not it
                 has a picture — otherwise the list's edge moves row to row. */
              avatar: Math.round((r.querySelector('img, span.grid.shrink-0') as HTMLElement | null)?.getBoundingClientRect().width ?? 0),
            };
          }),
        };
      });
      await page.close();

      const say = (m: string) => `${width}px: ${m}`;
      checks += 1;
      assert.equal(seen.overflow, false, say('the page scrolls sideways — a row pushed something past the screen'));
      checks += 1;
      assert.equal(seen.rows.length, 7, say('the fixture lost rows'));

      for (const [i, r] of seen.rows.entries()) {
        checks += 5;
        assert.ok(r.height <= MAX_ROW, say(`row ${i} ("${r.name.slice(0, 20)}") is ${r.height}px, over the ${MAX_ROW}px a compact row may take`));
        assert.ok(r.nameVisible, say(`row ${i} rendered no readable name — "${r.name}"`));
        assert.ok(r.nameInside, say(`row ${i}'s name is outside its own card`));
        assert.deepEqual(r.smallTargets, [], say(`row ${i} has a tap target under 40px — ${JSON.stringify(r.smallTargets)}`));
        assert.equal(r.escaped, 0, say(`row ${i} has ${r.escaped} controls outside the card`));
      }

      /*
       * THE RTL/CYRILLIC ASSERTION ITSELF.
       *
       * dir="auto" is declared on every name and RESOLVED per name by the
       * browser: Hebrew to rtl, Cyrillic and Latin to ltr, and a name that
       * starts with Cyrillic and continues in Hebrew to ltr. Asserting the
       * resolved direction rather than the attribute is the whole point — the
       * attribute being present proves nothing about what the browser did
       * with it, and an ancestor forcing rtl would override it silently.
       */
      const [hebrew, cyrillic, mixed, latin] = seen.rows;
      checks += 8;
      for (const r of seen.rows) assert.equal(r.nameDir, 'auto', say(`a name without dir="auto" — "${r.name}"`));
      assert.equal(hebrew.resolved, 'rtl', say('the Hebrew name did not resolve right-to-left'));
      assert.equal(cyrillic.resolved, 'ltr', say('A CYRILLIC NAME MUST RESOLVE LEFT-TO-RIGHT — otherwise "Наша Беэр-Шева 24" renders as "24 Наша Беэр-Шева"'));
      assert.equal(mixed.resolved, 'ltr', say('a name that STARTS in Cyrillic and continues in Hebrew follows its first strong character'));
      assert.equal(latin.resolved, 'ltr', say('and so does a Latin one'));

      /* The names came through whole, in the script they were written in. */
      checks += 3;
      assert.ok(cyrillic.name.includes('Наша Беэр-Шева'), say('the Cyrillic name was mangled'));
      assert.ok(mixed.name.includes('Беэр-Шева') && mixed.name.includes('באר שבע'), say('the mixed-script name lost one of its halves'));
      assert.ok(hebrew.name.includes('באר שבע ביחד'), say('the Hebrew name was mangled'));

      /* Every row reserves the same picture slot, with a picture or without. */
      const slots = new Set(seen.rows.map((r) => r.avatar));
      checks += 1;
      assert.equal(slots.size, 1, say(`the picture slot differs between rows (${[...slots].join(', ')}) — the list's edge would move row to row`));

      /*
       * THE "הקבוצות שלך בפייסבוק" CARD, WHICH NOW HAS A ✕ ON EVERY LINE.
       *
       * The card listed ninety-three groups he had never joined and offered to
       * add all of them at once. Four locks stop that from being written now,
       * and every one of them is a rule I wrote — the same kind of rule that
       * was already in place when it happened. So the card also got the thing a
       * rule cannot give it: a dismiss beside each name, for the person who can
       * see the name is wrong.
       *
       * It is a 44px control pushed into a line whose middle item truncates, in
       * an RTL page, beside Hebrew, Cyrillic and mixed-script names and one
       * name long enough to fill the card. That shape has already pushed a
       * control off a 360px screen once in this feature, so it is measured and
       * not reasoned about: every ✕ reachable by a thumb, every name still
       * readable beside it, nothing past the card's own edge.
       */
      const cardPage = await browser.newPage({ viewport: { width, height: 1200 } });
      await cardPage.goto(`file://${path.join(dir, 'index.html')}`);
      await cardPage.waitForTimeout(200);
      const cardSeen = await cardPage.evaluate(() => {
        /* The card's own root, whatever element Card renders — a tag name here
           is a selector that stops matching when the primitive changes and
           reads as "the card is gone". */
        const probe = document.querySelector('.card-probe > *') as HTMLElement | null;
        if (!probe) return null;
        const box = probe.getBoundingClientRect();
        const lines = [...probe.querySelectorAll('li')];
        return {
          /* The dismiss on each line, found by the label a screen reader
             reads — so deleting the button is a missing line, not a silent
             pass. */
          dismisses: lines.map((li) => {
            const b = li.querySelector('button[aria-label^="זאת לא קבוצה שלי"]') as HTMLElement | null;
            const bb = b?.getBoundingClientRect();
            const name = li.querySelector('span[dir="auto"]') as HTMLElement | null;
            const nb = name?.getBoundingClientRect();
            return {
              /* Square and thumb-sized, both dimensions. */
              h: bb ? Math.round(bb.height) : 0,
              w: bb ? Math.round(bb.width) : 0,
              /* Inside the card, which on a phone is the whole question. */
              inside: !!bb && bb.left >= box.left - 1 && bb.right <= box.right + 1,
              /* And the name it belongs to is still worth reading. */
              nameWidth: nb ? Math.round(nb.width) : 0,
              nameInside: !!nb && nb.left >= box.left - 1 && nb.right <= box.right + 1,
            };
          }),
          headline: (probe.querySelector('p.mt-0\\.5') as HTMLElement | null)?.textContent ?? '',
          /* The bulk button names the count; it must not be clipped either. */
          adoptInside: [...probe.querySelectorAll('button')].every((b) => {
            const bb = b.getBoundingClientRect();
            return bb.width === 0 || (bb.left >= box.left - 1 && bb.right <= box.right + 1);
          }),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      await cardPage.close();

      checks += 2;
      assert.ok(cardSeen, say('the "my groups" card did not render at all'));
      assert.equal(cardSeen.dismisses.length, 5, say('the card lost lines — the fixture and the card disagree'));
      /* The fixture gives 6 joined and 5 missing, so the headline proves the
         card reads the right one of the two. Identical sets made rendering
         `joined` where `missing` belongs pixel-identical. */
      checks += 1;
      assert.ok(
        cardSeen.headline.includes('6') && cardSeen.headline.includes('5'),
        say(`the headline does not name both sets — "${cardSeen.headline}"`),
      );
      checks += 1;
      assert.equal(cardSeen.overflow, false, say('the card pushed the page sideways'));
      checks += 1;
      assert.equal(cardSeen.adoptInside, true, say("a control in the card is outside the card's own box"));
      for (const [i, d] of cardSeen.dismisses.entries()) {
        checks += 5;
        assert.ok(d.h >= 40, say(`the dismiss on card line ${i} is ${d.h}px tall — under a thumb's 40px`));
        /* 0px passed `inside` and `adoptInside`, both of which excuse a
           zero-width box. A control nobody can press is not a control. */
        assert.ok(d.w >= 40, say(`the dismiss on card line ${i} is ${d.w}px wide — under a thumb's 40px`));
        assert.ok(d.inside, say(`the dismiss on card line ${i} is outside the card — off the screen on a phone`));
        assert.ok(d.nameWidth > 60, say(`card line ${i} squeezed its name to ${d.nameWidth}px — the ✕ ate the name it is for`));
        assert.ok(d.nameInside, say(`card line ${i}'s name is outside the card`));
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`discovery row tests OK — ${checks} assertions across 3 widths`);
}

void main();
