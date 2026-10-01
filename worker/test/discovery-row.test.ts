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
 * 174 → 144 → 127, EACH STEP MEASURED AND EACH ASKED FOR.
 *
 * The last step is the design specification: "כל Group Card יהיה בערך בגובה
 * 110-130px", with the picture moved to the far side, the action under the
 * checkbox and the ✕ replaced by a ⋮. Laid out that way the card stops being
 * one tall column of stacked lines: at 390 and 430 EVERY fixture measures 102,
 * and at 360 only the three with two-line names reach 123. The ceiling is the
 * measured maximum plus four, as it has always been.
 *
 * What follows is the history of the two steps before it, kept because each
 * number in it was paid for.
 *
 * THE REDESIGN TOOK IT TO 174 AND THEN "להוריד בכ-15-20%" BROUGHT IT TO 144.
 *
 * The redesign bought a 52px picture and a name on two lines instead of one
 * ellipsised line, and paid for it in height. The owner then asked for that
 * height back, and most of it came from ONE change rather than from squeezing
 * every padding: the ✕ left the row's flow for the card's corner, which gave
 * the content column back about 54px — so names that needed a second line now
 * fit on one, and a whole line left most cards. The rest came from a shorter
 * "במערכת", an 11px facts line, and tighter padding.
 *
 * Measured over the seven fixtures, before → after, at each width:
 *   360: 981 → 810 total (17.4% shorter), worst row 170 → 140
 *   390: 933 → 769 (17.6%)
 *   430: 873 → 702 (19.6%)
 *
 * The ceiling is the measured maximum plus four, as it has always been.
 */
const MAX_ROW = 127;

async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    /*
     * A SKIPPED CHECK IS NOT A CHECK — my own words, two files over, while
     * this one skipped and exited 0.
     *
     * Everything measured here is measured nowhere else: that every control
     * in a row gives a thumb 40px in BOTH directions and the ⋮ 44, that the
     * dismiss on the card is 40px and inside the card at 360px, that a
     * Cyrillic name resolves left-to-right, that the picture is on the row's
     * right and the button on its left, that no row pushes the page
     * sideways. On a tree where
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
              /* Every control has to sit inside the row's own box, or it is
                 off the screen on a phone. */
              escaped: [...r.querySelectorAll('button,a')].filter((e) => {
                const b = e.getBoundingClientRect();
                return b.width > 0 && (b.right > rowBox.right + 1 || b.left < rowBox.left - 1);
              }).length,
              /* The picture slot, which every row reserves whether or not it
                 has a picture — otherwise the list's edge moves row to row. */
              avatar: Math.round((r.querySelector('img, span.grid.shrink-0') as HTMLElement | null)?.getBoundingClientRect().width ?? 0),
              /* Whether a real <img> was drawn, or the letter tile. */
              hasPicture: !!r.querySelector('img'),
              /*
               * ANY CONTROL THE DISMISS SITS ON TOP OF.
               *
               * The ✕ left the row's flow to buy height, and landed on the
               * row's own button: 36×23px of overlap on "פתח להצטרפות" at all
               * three widths, so a thumb aiming at the button would HIDE the
               * group instead. Reserving the space on the name alone left
               * every line below it free to run underneath.
               *
               * Two boxes overlapping is not something a class name can show,
               * and it is the kind of mistake that costs the owner a group.
               */
              covered: (() => {
                const x = r.querySelector('button[aria-label^="הסתר"]');
                if (!x) return [];
                const xb = x.getBoundingClientRect();
                return [...r.querySelectorAll('a,button')]
                  .filter((el) => el !== x)
                  .map((el) => {
                    const b = el.getBoundingClientRect();
                    const w = Math.min(xb.right, b.right) - Math.max(xb.left, b.left);
                    const h = Math.min(xb.bottom, b.bottom) - Math.max(xb.top, b.top);
                    return w > 0 && h > 0 ? `${Math.round(w)}×${Math.round(h)} על "${(el.textContent || '').trim().slice(0, 20)}"` : '';
                  })
                  .filter(Boolean);
              })(),
              /*
               * WHICH SIDE OF THE ROW EACH THING IS ON.
               *
               * "ואת הכרטיסים למטה תשנה כיוון שהתמונות של הקבוצה יהיה בצד ימין
               *  וכפתורים בצד שמאל." Source order decides this and reads the
               * same either way round, so it is measured: the picture's middle
               * has to be past the row's middle toward the start (right, in
               * RTL) and the action's toward the end (left). `apart` is the
               * clear space between them, which also catches the two of them
               * sitting on top of each other.
               */
              sides: (() => {
                const mid = rowBox.left + rowBox.width / 2;
                const pic = (r.querySelector('img, span.grid.shrink-0') as HTMLElement | null)?.getBoundingClientRect();
                /* The stacked column, found by its own width class rather than
                   by position — by position this check could never fail. */
                const column = [...r.querySelectorAll('div')].find((d) => d.className.includes('w-[94px]'));
                const act = ([...(column?.querySelectorAll('a,button') ?? [])] as HTMLElement[])
                  .find((e) => e.getAttribute('role') !== 'checkbox')
                  ?.getBoundingClientRect();
                const box = (column?.querySelector('[role=checkbox]') as HTMLElement | null)?.getBoundingClientRect();
                return {
                  found: !!pic && !!act,
                  pictureAtStart: pic ? (pic.left + pic.right) / 2 > mid : false,
                  actionAtEnd: act ? (act.left + act.right) / 2 < mid : false,
                  apart: pic && act ? Math.round(pic.left - act.right) : -1,
                  /* The checkbox's 40px tap box and the action below it share
                     an outer edge. A negative inline margin here — the mirror
                     of the one this layout used to carry on the other side —
                     pulls that box to within 4px of the ⋮, and the two mean
                     opposite things. */
                  flush: box && act ? Math.round(box.left - act.left) : 99,
                };
              })(),
              /*
               * WHAT THE ACTION ACTUALLY PAINTS, not which classes it carries.
               *
               * The brief asked for two button skins and the diff appeared to
               * deliver both — and neither reached the screen. `border-ink-700`
               * from the secondary variant and the added `border-brand-400/35`
               * are both one-class border-colour utilities in the same layer,
               * so the one emitted later wins, and that is the pale hairline;
               * the member button's computed style was byte-identical to having
               * no override at all. A class-name assertion cannot see that. A
               * browser can.
               */
              action: (() => {
                const el = [...r.querySelectorAll('a,button')].find((e) => /פתח קבוצה|פתח להצטרפות|הוסף לרשימה/.test(e.textContent || ''));
                if (!el) return null;
                const cs = getComputedStyle(el);
                return { label: (el.textContent || '').trim(), border: cs.borderTopColor, bg: cs.backgroundColor, image: cs.backgroundImage };
              })(),
            };
          }),
        };
      });

      /*
       * THE TARGET A THUMB ACTUALLY HAS, measured separately and last.
       *
       * What stood here read the HEIGHT of the drawn box and nothing else. So
       * when the ✕ became a ⋮ and went from 44×44 to 28×40, the suite had
       * nothing to say: 40 is not under 40, and the width was never looked at
       * — while this same file checks both dimensions on the "my groups"
       * card. A review agent found it by rendering the row and measuring it,
       * which is exactly what this check claimed to be doing.
       *
       * It is a hit test now, not a box measurement. Walking out from the
       * middle until elementFromPoint stops answering with the control gives
       * what a finger gets, including the area an ::after carries past the
       * glyph — and that difference is the whole fix, because the ⋮ cannot be
       * drawn wider without taking the room the name wraps in.
       *
       * Its own pass, after everything above, because elementFromPoint only
       * answers for what is on screen: the window is made tall enough to hold
       * the whole fixture first. The WIDTH is the one under test and does not
       * move, and nothing in these components is measured against the
       * viewport's height. Scrolling each row into view instead left every
       * control in the lower rows reading 1×1 — nothing at the point at all.
       */
      await page.setViewportSize({ width, height: 2400 });
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll('.row-probe > div')].map((r) =>
          [...r.querySelectorAll('button,a')].map((e) => {
            const b = e.getBoundingClientRect();
            const x = (b.left + b.right) / 2;
            const y = (b.top + b.bottom) / 2;
            /* Four directions through an anonymous arrow, and NOT a named
               `const reach = …`: esbuild keeps function names by wrapping them
               in `__name`, which does not exist in the page, and the whole
               evaluate throws. The same hazard is reproduced on purpose in
               worker/test/account.test.ts. */
            const span = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => {
              let n = 0;
              /* 24 each way is 49 across, which is all a 44px floor needs. */
              for (let d = 1; d <= 24; d += 1) {
                const under = document.elementFromPoint(x + dx * d, y + dy * d);
                if (!under || (under !== e && !e.contains(under))) break;
                n = d;
              }
              return n;
            });
            return {
              text: (e.textContent || e.getAttribute('aria-label') || '').slice(0, 24),
              w: span[0] + span[1] + 1,
              h: span[2] + span[3] + 1,
            };
          }),
        ),
      );
      await page.close();

      const say = (m: string) => `${width}px: ${m}`;
      checks += 1;
      assert.equal(seen.overflow, false, say('the page scrolls sideways — a row pushed something past the screen'));
      checks += 1;
      assert.equal(seen.rows.length, 8, say('the fixture lost rows'));

      for (const [i, r] of seen.rows.entries()) {
        checks += 4;
        assert.ok(r.height <= MAX_ROW, say(`row ${i} ("${r.name.slice(0, 20)}") is ${r.height}px, over the ${MAX_ROW}px a compact row may take`));
        assert.ok(r.nameVisible, say(`row ${i} rendered no readable name — "${r.name}"`));
        assert.ok(r.nameInside, say(`row ${i}'s name is outside its own card`));
        assert.equal(r.escaped, 0, say(`row ${i} has ${r.escaped} controls outside the card`));
        checks += 3;
        const targets = hits[i] ?? [];
        assert.ok(targets.length >= 3, say(`row ${i} offered ${targets.length} controls to hit-test — the floors below would pass on an empty row`));
        assert.deepEqual(
          targets.filter((t) => t.w < 40 || t.h < 40),
          [],
          say(`row ${i} has a target under 40px to a thumb — ${JSON.stringify(targets.filter((t) => t.w < 40 || t.h < 40))}`),
        );
        /* The one control in the row that removes a group, and the one the
           redesign shrank. 44 is the floor src/components/social/ui.tsx
           states twice, and what it had as a ✕. */
        const hide = targets.find((t) => t.text.startsWith('הסתר'));
        assert.ok(
          hide !== undefined && hide.w >= 44 && hide.h >= 44,
          say(`row ${i}: the ⋮ is ${hide ? `${hide.w}×${hide.h}` : 'not there'} to a thumb, and it is what removes a group`),
        );
        checks += 1;
        assert.deepEqual(r.covered, [], say(`row ${i}: the ✕ sits on top of a control — ${r.covered.join(', ')}. A tap meant for it would hide the group.`));
        checks += 5;
        assert.ok(r.sides.found, say(`row ${i}: no picture or no action to measure — the selectors below would pass on an empty row`));
        assert.ok(r.sides.pictureAtStart, say(`row ${i}'s picture is not on the right — "התמונות של הקבוצה יהיה בצד ימין"`));
        assert.ok(r.sides.actionAtEnd, say(`row ${i}'s button is not on the left — "וכפתורים בצד שמאל"`));
        assert.ok(r.sides.apart > 0, say(`row ${i}: ${r.sides.apart}px between the button and the picture — they overlap, or they have traded sides`));
        assert.ok(Math.abs(r.sides.flush) <= 2, say(`row ${i}: the checkbox's tap box is ${r.sides.flush}px off the action's edge below it, which moves it toward the ⋮`));
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

      /*
       * THE TWO SKINS, MEASURED. "פתח קבוצה" is the quiet one: white, with a
       * PURPLE edge — not the pale #e7e2f3 hairline every other card uses.
       * "פתח להצטרפות" is the loud one and must actually be filled.
       */
      for (const r of seen.rows) {
        if (!r.action) continue;
        checks += 1;
        if (/פתח קבוצה/.test(r.action.label)) {
          assert.ok(
            !/231,\s*226,\s*243/.test(r.action.border),
            say(`"פתח קבוצה" still paints the pale hairline (${r.action.border}) — the purple edge lost the cascade again`),
          );
        } else {
          assert.ok(
            r.action.image !== 'none' || !/rgba\(0,\s*0,\s*0,\s*0\)/.test(r.action.bg),
            say(`"${r.action.label}" paints no fill at all (${r.action.bg} / ${r.action.image})`),
          );
        }
      }

      /*
       * THE BORROWED PICTURE IS ACTUALLY DRAWN.
       *
       * Row 7 has no picture of its own and is given the one the publishing
       * list holds; every other row has neither. A prop that is threaded but
       * never read renders the very letter it was meant to replace — which is
       * exactly how two button skins were written and never painted — so this
       * looks for the <img> rather than for the prop.
       */
      checks += 2;
      assert.equal(seen.rows[7].hasPicture, true, say('the row with a borrowed picture still drew a letter — the fallback is not being read'));
      assert.equal(seen.rows[0].hasPicture, false, say('a row with no picture anywhere should draw its letter tile'));

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
          height: Math.round(box.height),
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
      /*
       * AND ITS HEIGHT, because "החלק העליון... גבוה מדי ותופס יותר מדי מהמסך"
       * was the whole of the last pass and nothing was stopping it growing
       * back. With five missing groups on it the card measured 448px; tighter
       * padding, a 40px dismiss per line and a shorter bulk button brought it
       * to 382 — 14.7%, measured here rather than reasoned about. The ceiling
       * is that plus four, as everywhere else in this file.
       */
      checks += 1;
      assert.ok(
        cardSeen.height <= 386,
        say(`the "my groups" card is ${cardSeen.height}px, over the 386 a five-row card may take`),
      );
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
