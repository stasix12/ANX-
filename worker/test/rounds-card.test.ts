/**
 * סבבים ביום (ריצות) — THE CARD, MEASURED IN A BROWSER.
 *
 * WHY THIS FILE EXISTS AT ALL, which is the part worth remembering: the card
 * was briefly measured NOWHERE while two suites were green.
 *
 * The campaigns LIST card cannot hold it — with the rounds on, the tallest
 * fixture went 901 → 1008px at 360px against a 910 ceiling — so it is on the
 * run screen, where the owner's own reference draws it. But the hero renders
 * CampaignSchedulePanel only behind `editingSchedule`, a useState that is
 * false on a server render, so render-hero.tsx never reaches it. A grep for
 * `data-schedule` in that fixture's output matches `data-schedule-board`, a
 * different component — which is how a card that rendered zero times produced
 * a green run of 170 assertions and looked like proof.
 *
 * So the panel is rendered on its own here, and every number below comes off
 * a real layout in a real browser at the three widths this product supports.
 *
 *   npm run build && npx tsx worker/test/rounds-card.test.ts
 */
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

/*
 * THE TWO CASES THIS FILE GAINED FOR HIS BUG, read by index as every case
 * above them is. They are APPENDED in render-rounds.tsx on purpose: the six
 * that came first are measured by probes that already pass, and none of their
 * indices moves.
 */
const HIS = 6;
const BELOW_FLOOR = 7;

let checks = 0;
const is = (c: unknown, msg: string) => {
  checks += 1;
  assert.ok(c, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

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

async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    const message = 'rounds card measurement CANNOT RUN — no built CSS. Run `npm run build` first, or set ALLOW_UNMEASURED=1 to skip it deliberately.';
    if (process.env.ALLOW_UNMEASURED === '1') {
      console.log(`rounds card measurement SKIPPED ON PURPOSE — ${message}`);
      return;
    }
    throw new Error(message);
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'rounds-card-'));
  copyFileSync(css, path.join(dir, 'app.css'));
  const html = execFileSync('npx', ['tsx', 'worker/test/render-rounds.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 });
  writeFileSync(path.join(dir, 'index.html'), html);

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    for (const width of [360, 390, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 1400 } });
      await page.goto(`file://${path.join(dir, 'index.html')}`);

      const seen = await page.evaluate(() => {
        const probes = [...document.querySelectorAll('.panel-probe')];
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          panels: probes.map((p) => {
            const card = [...p.querySelectorAll('div')].find((d) => d.textContent?.startsWith('סבבים ביום (ריצות)'));
            const rows = [...p.querySelectorAll('li')];
            /*
             * Everything a finger has to hit inside the rounds card AT REST —
             * which deliberately excludes the inside of a closed ⋮ menu.
             *
             * A closed <details> IS NOT LAID OUT. In current Chromium its
             * content sits in ::details-content with content-visibility:
             * hidden, so getBoundingClientRect on a descendant returns a box
             * that describes nothing on screen: this file once failed on a
             * time field it measured as 26×40, which is in fact 109px wide the
             * moment the menu is open. Measuring a hidden control is not a
             * stricter test, it is a false one — so the menus are measured in
             * their own pass below, open, one at a time.
             */
            /*
             * AND THE PREDICATE IS WRITTEN OUT TWICE ON PURPOSE. esbuild
             * annotates any named function inside an evaluated callback —
             * including `const f = () => …` — with a call to `__name`, which
             * does not exist in the page: "ReferenceError: __name is not
             * defined". It is a documented trap in this repo (see the
             * addInitScript note in unit.test.ts) and it cost two runs here.
             * So the filter is repeated at both sites rather than factored.
             */
            const hits = card
              ? [...card.querySelectorAll('button, summary, input, [role="switch"]')]
                  .filter((e) => e.tagName === 'SUMMARY' || !e.closest('details') || e.closest('details')!.hasAttribute('open'))
                  .map((e) => {
                  const r = e.getBoundingClientRect();
                  return { w: Math.round(r.width), h: Math.round(r.height), what: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 40) };
                })
              : [];
            /*
             * ─── THE CONTROL THAT LOWERS THE WINDOW, FOUND BY WHAT IT IS ───
             *
             * NOT BY THE STRING IT CONTAINS, and that distinction is the whole
             * reason this probe is in a browser. Two guards in this suite once
             * passed over a feature that had been DELETED, because wrapping
             * JSX in {false && …} leaves every word of it behind for a grep to
             * find. A <p> reading "הורידו את החזרה ל-2 שעות" and a <button>
             * that writes it are the same text and two different products;
             * only a render tells them apart. So this asks for `button`
             * elements and matches the label on the element it got back.
             *
             * AND IT MATCHES THE PREFIX, NOT THE WHOLE SHAPE. Requiring
             * `ל-\d+ שעות$` looked stricter and was the exact opposite: a
             * button reading "הורידו את החזרה ל-null שעות" would not have
             * matched it, this probe would have reported NO BUTTON, and every
             * assertion below about there being no button would have passed
             * over a broken one. A mutation found that hole. The prefix finds
             * the control; its numbers are then checked ON it, so a missing
             * number fails instead of vanishing.
             */
            const fixBtn = card
              ? [...card.querySelectorAll('button')].find((b) => /^הורידו את החזרה /.test((b.textContent ?? '').replace(/\s+/g, ' ').trim()))
              : undefined;
            const fixBox = fixBtn ? fixBtn.getBoundingClientRect() : null;
            const cardBox = card ? card.getBoundingClientRect() : null;
            /* The sentence it sits under — the card's first warning, which is
               the one the verdict wrote. */
            const warnP = card ? [...card.querySelectorAll('p')].find((e) => /לא יפרסם/.test(e.textContent ?? '')) : undefined;
            return {
              drawn: !!card,
              height: card ? Math.round(card.getBoundingClientRect().height) : 0,
              rows: rows.length,
              rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
              hits,
              /* The menu is a <details>; only extra rounds have one. */
              menus: card ? card.querySelectorAll('details').length : 0,
              /* AT REST, EVERY MENU IS SHUT. The numbers above describe the
                 card the owner looks at; the menus get their own pass. */
              menusShut: card ? [...card.querySelectorAll('details')].every((d) => !d.hasAttribute('open')) : true,
              addButton: !!card && /הוסף סבב נוסף/.test(card.textContent ?? ''),
              /* The state word on each row, and the "x מתוך y" line under a
                 round that is running. Read as TEXT, because that is what the
                 owner reads. */
              pills: rows.map((r) => (r.textContent ?? '').match(/ממתין|מתחיל|מפרסם|הושלם|נכשל|בוטל|מתוזמן|קבוע/)?.[0] ?? ''),
              counts: (card?.textContent ?? '').match(/\d+ מתוך \d+ קבוצות/g) ?? [],
              bars: card ? card.querySelectorAll('[style*="width"]').length : 0,
              warns: !!card && /לא יפרסם/.test(card.textContent ?? ''),
              /* Null when there is no button at all — which for three of these
                 cases is the right answer and is asserted as such below. */
              fix:
                fixBtn && fixBox && cardBox
                  ? {
                      text: (fixBtn.textContent ?? '').replace(/\s+/g, ' ').trim(),
                      aria: (fixBtn.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim(),
                      off: fixBtn.disabled,
                      w: Math.round(fixBox.width),
                      h: Math.round(fixBox.height),
                      inside: fixBox.left >= cardBox.left - 1 && fixBox.right <= cardBox.right + 1,
                      where: `${Math.round(fixBox.left)}→${Math.round(fixBox.right)} in ${Math.round(cardBox.left)}→${Math.round(cardBox.right)}`,
                      /* A `w-full` box always measures perfectly; a label that
                         does not fit inside it is clipped and unreadable, and
                         no box measurement would ever notice. */
                      clipped: fixBtn.scrollWidth > fixBtn.clientWidth + 1,
                    }
                  : null,
              warn: warnP ? (warnP.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
              /* No control may stick out of the card sideways. */
              wide: card
                ? [...card.querySelectorAll('*')]
                    .filter((e) => e.tagName === 'SUMMARY' || !e.closest('details') || e.closest('details')!.hasAttribute('open'))
                    .some((e) => e.getBoundingClientRect().right > card.getBoundingClientRect().right + 1)
                : false,
            };
          }),
        };
      });

      const at = `${width}px`;
      is(!seen.overflow, `${at}: the page scrolls sideways with the rounds card on it`);
      eq(seen.panels.length, 8, `${at}: the fixture drew ${seen.panels.length} panels, not eight — the original six, plus his own layout and the shape no window can fix`);
      for (const [i, p] of seen.panels.entries()) {
        is(p.drawn, `${at}: panel ${i} did not draw the card at all — which is the exact failure this file was written after`);
        is(p.menusShut, `${at}: panel ${i} drew a round menu already OPEN — the resting card is what the heights below describe`);
        is(!p.wide, `${at}: panel ${i} has something sticking out of the card sideways`);
        for (const h of p.hits) {
          is(h.w >= 40 && h.h >= 40, `${at}: panel ${i}'s "${h.what}" is ${h.w}×${h.h} — a finger needs 40 in both directions`);
        }
      }

      /* ── case 0: off. The card is there, the list is not. ─────────────── */
      eq(seen.panels[0].rows, 0, `${at}: the card with no extra rounds must not draw a list — it is every campaign today`);
      is(!seen.panels[0].addButton, `${at}: and no add button, because the list it would add to is not shown`);

      /* ── case 1: his reference, repeat off ────────────────────────────── */
      eq(seen.panels[1].rows, 2, `${at}: his reference draws two rounds — 03:30 from the window and 15:30 from the column`);
      eq(seen.panels[1].menus, 1, `${at}: only the SECOND round has a menu. Round one's hour is the field above, and a second place to change it is the bug`);
      is(seen.panels[1].warns, `${at}: with the repeat off, the card must say the second round will publish nothing — rules.ts refuses it for ever`);

      /* ── case 2: the tallest shape ────────────────────────────────────── */
      is(seen.panels[2].warns, `${at}: twelve hours apart against a twenty-hour repeat window must be called out`);
      is(
        seen.panels[2].height < 320,
        `${at}: the tallest shape of this card is ${seen.panels[2].height}px — over 320 it pushes the daily repeat off a phone screen`,
      );

      /* ── case 4: REAL FIGURES, which is what the owner asked for ──────── */
      {
        const p = seen.panels[4];
        eq(p.rows, 2, `${at}: two rounds`);
        /*
         * "סבב 2 — מפרסם: 12 מתוך 50." Round one is mid-flight, so it says
         * מפרסם; round two has not begun, so it says ממתין. The word on each
         * row comes off that round's OWN rows, never off the clock.
         */
        eq(p.pills, ['מפרסם', 'ממתין'], `${at}: the two rounds must report their own states, got ${JSON.stringify(p.pills)}`);
        /*
         * 12 OF 50, NOT 10 OF 30. Round one owns its own thirty rows AND the
         * twenty written before social_queue.round_at existed — key '' — and
         * HANDLED is counted, not published: a group that failed or was
         * skipped is done with, and a bar counting only successes would sit
         * at 40% over a round that had finished.
         */
        eq(p.counts, ['12 מתוך 50 קבוצות'], `${at}: the running round must count handled-of-total across its own rows and the unrecorded ones, got ${JSON.stringify(p.counts)}`);
        is(p.bars >= 1, `${at}: a round that is publishing must draw a bar, not only a number`);
      }

      /* ── case 5: one over, one not started ────────────────────────────── */
      {
        const p = seen.panels[5];
        eq(p.pills, ['הושלם', 'ממתין'], `${at}: a round whose rows are all finished says הושלם — and two failures out of fifty is still a round that ran`);
        eq(p.counts, [], `${at}: a finished round draws no progress bar — the bar is for what is happening now`);
      }

      /* ── case 3: the cap ──────────────────────────────────────────────── */
      eq(seen.panels[3].rows, 4, `${at}: three armed rounds plus the window's own hour is four rows; a switched-off round is not planned and not listed`);
      is(!seen.panels[3].addButton, `${at}: at the cap the add button must be gone rather than present and refusing`);

      /*
       * ─── case 6: HIS OWN LAYOUT, AND THE BUTTON THAT WAS NOT THERE ──────
       *
       * "שיניתי לפחות מ-12 שעות ועדין לא נותן לפרסם."
       *
       * He lowered the account's protection to two hours in Settings. This
       * card re-measured his 01:30 and 23:30 against two — correctly, they are
       * two hours apart around the clock — and then named his fix in a
       * sentence: "הורידו את החזרה ל-2 שעות", a number with no control
       * anywhere that set it. The campaign's own window had lost its editor
       * when the advanced queue controls came out at his request, so the card
       * was a dead end that printed its own answer.
       *
       * Every number below comes off a real <button> in a real layout. A grep
       * of the fixture's output cannot do this: it would match the sentence.
       */
      {
        const his = seen.panels[HIS];
        is(his.drawn, `${at}: his own layout did not draw the rounds card at all`);
        is(
          !!his.fix,
          `${at}: his own layout draws NO button to lower the window — the card says "${his.warn}" and leaves him nothing to press, which is the bug`,
        );
        const fix = his.fix!;
        eq(
          fix.text,
          'הורידו את החזרה ל-2 שעות',
          `${at}: the button must read exactly the window repeatFitFor() would write — got "${fix.text}"`,
        );
        is(
          fix.aria.includes('ניקוי ספות באר שבע'),
          `${at}: the button's accessible name must name the campaign — a list of twenty cards has twenty of these — got "${fix.aria}"`,
        );
        is(!fix.off, `${at}: the button is disabled on a card nothing else is writing`);
        is(fix.h >= 40 && fix.w >= 40, `${at}: the button is ${fix.w}×${fix.h} — a finger needs 40 in both directions`);
        is(fix.inside, `${at}: the button sticks out of the card sideways — ${fix.where}`);
        is(!fix.clipped, `${at}: the button's label does not fit inside it and is clipped — ${fix.w}px of box, ${fix.text}`);
      }

      /*
       * ─── AND THE TWO LAWS THAT HOLD FOR EVERY CARD ON THE PAGE ──────────
       *
       * ONE NUMBER, NOT TWO. The sentence and the button used to be two copies
       * of one arithmetic — the card named a fix while the writer clamped
       * something else — and now both go through repeatFitFor(). So what the
       * button offers has to be the gap the sentence above it just measured,
       * and it has to be less than the window that sentence says is armed:
       * otherwise the card is telling him two things at once, or offering to
       * change nothing.
       *
       * AND NO BUTTON WHERE A WINDOW CANNOT HELP. Rounds closer together than
       * the account's floor, or a repeat switched off, cannot be fixed by any
       * window — repeatColumns() clamps the write straight back up. A button
       * there would do nothing and still look like the answer, which is the
       * decorative control the owner forbade by name.
       */
      for (const [i, p] of seen.panels.entries()) {
        const cannotFix = !!p.warn && (/בפחות מ-\d+ שעות/.test(p.warn) || /הפעילו את/.test(p.warn));
        if (cannotFix) {
          is(!p.fix, `${at}: panel ${i} offers "${p.fix?.text}" for a verdict no window can fix — "${p.warn}"`);
          continue;
        }
        if (!p.fix) continue;
        const offered = Number(p.fix.text.match(/ל-(\d+) שעות/)?.[1]);
        const named = Number(p.fix.aria.match(/ל-(\d+) שעות/)?.[1]);
        const gapHours = Number(p.warn?.match(/הסבבים מרוחקים ([\d.]+) שעות/)?.[1]);
        const armedHours = Number(p.warn?.match(/מוגדרת ל-(\d+) שעות/)?.[1]);
        is(
          Number.isFinite(offered) && Number.isFinite(named),
          `${at}: panel ${i}'s button names no number — "${p.fix.text}" / "${p.fix.aria}"`,
        );
        is(
          Number.isFinite(gapHours) && Number.isFinite(armedHours),
          `${at}: panel ${i} draws the button but the sentence above it states no gap and no window — "${p.warn}"`,
        );
        eq(offered, named, `${at}: panel ${i}'s button reads ל-${offered} and its accessible name reads ל-${named} — one control, two numbers`);
        eq(
          offered,
          Math.floor(gapHours),
          `${at}: panel ${i} measures the rounds ${gapHours} hours apart and offers to lower the window to ${offered} — the card is naming two different numbers`,
        );
        is(
          offered < armedHours,
          `${at}: panel ${i} offers to lower the window to ${offered} when the sentence says it is already ${armedHours} — the button would change nothing`,
        );
      }

      /* ── the two shapes a window cannot fix, by name ───────────────────── */
      is(seen.panels[1].warns, `${at}: the repeat-off case must still state the problem`);
      eq(seen.panels[1].fix, null, `${at}: with the repeat OFF no window helps — a button here would write a number and publish nothing`);
      is(seen.panels[BELOW_FLOOR].warns, `${at}: six hours against the floor of twelve must still state the problem`);
      eq(
        seen.panels[BELOW_FLOOR].fix,
        null,
        `${at}: below the account's floor no window helps — repeatColumns() clamps the write straight back to the floor`,
      );
      is(
        /בפחות מ-12 שעות/.test(seen.panels[BELOW_FLOOR].warn ?? ''),
        `${at}: the below-the-floor sentence must name the floor it is measuring against — got "${seen.panels[BELOW_FLOOR].warn}"`,
      );

      /*
       * ─── SECOND PASS: EACH ⋮ MENU, OPEN, ONE AT A TIME ──────────────────
       *
       * THE RESTING PASS ABOVE CANNOT MEASURE THESE AND MUST NOT TRY. A
       * closed <details> is not laid out — its content sits in
       * ::details-content under content-visibility: hidden — so every box
       * inside one is a number about nothing. This file once failed on a time
       * field it measured as 26×40; open, that field is 109px wide.
       *
       * AND THEY ARE OPENED ONE AT A TIME, not all at once. The menu is in
       * flow, so opening it grows its row; opening every menu on the tallest
       * fixture at once pushed the card to 455px against the 320px ceiling
       * asserted above — a shape no owner will ever see, since a <details>
       * closes the one beside it only if it has a name, and these are opened
       * by tapping one ⋮.
       *
       * WHAT THIS CATCHES, AND IT CAUGHT IT: the menu used to be
       * `absolute end-0`, and on the run card at 360px — where the row wraps
       * and the ⋮ lands at the row's right end — the open menu measured
       * 269→392 against a card ending at 329. Sixty-three pixels of a delete
       * button off the side of his phone, invisible to every suite because the
       * only two that render this card were measuring it shut.
       */
      {
        const menus = await page.$$('[data-rounds-card] details');
        is(menus.length >= 11, `${at}: expected at least eleven round menus across the fixtures, found ${menus.length} — the two narrow probes carry three each and they are the only ones whose row WRAPS`);
        /* AND THE NARROW PROBES ARE THERE. They are the shape the run card
           gives this panel, and the only one in which the old floating menu
           overflowed; without them this pass passes on a layout that cannot
           reproduce the defect it exists to catch. */
        eq((await page.$$('.narrow-probe [data-rounds-card]')).length, 2, `${at}: the two narrow probes must draw the rounds card`);
        for (const [mi, menu] of menus.entries()) {
          await menu.evaluate((d) => d.setAttribute('open', ''));
          await page.waitForTimeout(30);
          const seenMenu = await menu.evaluate((d) => {
            const card = d.closest('[data-rounds-card]')!.getBoundingClientRect();
            /* The menu's own box. It is a <form> now, not a <div>: the time
               field writes on submit rather than on every keystroke, which is
               the save button the owner asked for. `:scope > *` takes whatever
               element the menu is, so this probe does not break again the next
               time it changes. */
            const panel = [...d.children].find((e) => e.tagName !== 'SUMMARY') as HTMLElement;
            const box = panel.getBoundingClientRect();
            return {
              open: d.hasAttribute('open'),
              inside: box.left >= card.left - 1 && box.right <= card.right + 1,
              where: `${Math.round(box.left)}→${Math.round(box.right)} in ${Math.round(card.left)}→${Math.round(card.right)}`,
              /* Every control in the open menu, including the time field the
                 closed measurement called 26 pixels wide. */
              small: [...d.querySelectorAll('button, input')]
                .map((e) => ({ w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), what: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 32) }))
                .filter((r) => r.w < 40 || r.h < 40),
              controls: d.querySelectorAll('button, input').length,
            };
          });
          is(seenMenu.open, `${at}: menu ${mi} refused to open, so nothing below it was measured`);
          is(seenMenu.controls >= 3, `${at}: menu ${mi} draws ${seenMenu.controls} controls — the hour, the pause and the delete are all meant to be there`);
          is(seenMenu.inside, `${at}: menu ${mi} opens OUTSIDE the card — ${seenMenu.where}`);
          eq(seenMenu.small, [], `${at}: menu ${mi} has a control under the 40px floor once it is actually open`);
          /* Shut again, so the next menu is measured on its own row heights
             and the page never carries two open at once. */
          await menu.evaluate((d) => d.removeAttribute('open'));
        }
      }

      /*
       * ─── AND HIS BUTTON AT THE RUN CARD'S OWN WIDTHS ────────────────────
       *
       * 298px and 260px — what the dashboard's run card leaves this panel once
       * its own padding is taken out, narrower than any viewport above.
       *
       * THE BUTTON IS `w-full`, SO ITS BOX CAN NEVER MEASURE AS OVERFLOWING.
       * What goes wrong at 260 is the LABEL: clipped inside a box whose
       * numbers are perfect, a 40px control the owner cannot read, and no
       * bounding box would ever catch it. So scrollWidth is read against
       * clientWidth here, which is the only measurement that can.
       */
      {
        const fits = await page.evaluate(() =>
          [...document.querySelectorAll('.fit-probe')].map((p) => {
            const card = p.querySelector('[data-rounds-card]');
            const btn = card
              ? [...card.querySelectorAll('button')].find((b) => /^הורידו את החזרה /.test((b.textContent ?? '').replace(/\s+/g, ' ').trim()))
              : undefined;
            if (!card || !btn) return null;
            const box = btn.getBoundingClientRect();
            const cardBox = card.getBoundingClientRect();
            return {
              text: (btn.textContent ?? '').replace(/\s+/g, ' ').trim(),
              w: Math.round(box.width),
              h: Math.round(box.height),
              inside: box.left >= cardBox.left - 1 && box.right <= cardBox.right + 1,
              where: `${Math.round(box.left)}→${Math.round(box.right)} in ${Math.round(cardBox.left)}→${Math.round(cardBox.right)}`,
              clipped: btn.scrollWidth > btn.clientWidth + 1,
              cardWidth: Math.round(cardBox.width),
            };
          }),
        );
        eq(fits.length, 2, `${at}: the two run-card-width probes must be on the page, found ${fits.length}`);
        for (const [i, f] of fits.entries()) {
          is(!!f, `${at}: run-card-width probe ${i} draws no button to lower the window`);
          const g = f!;
          eq(g.text, 'הורידו את החזרה ל-2 שעות', `${at}: probe ${i} must offer the same two hours at ${g.cardWidth}px — got "${g.text}"`);
          is(g.h >= 40 && g.w >= 40, `${at}: probe ${i}'s button is ${g.w}×${g.h} at ${g.cardWidth}px — a finger needs 40 in both directions`);
          is(g.inside, `${at}: probe ${i}'s button sticks out of the card — ${g.where}`);
          is(!g.clipped, `${at}: probe ${i}'s button label is clipped at ${g.cardWidth}px — the box measures right and the words do not fit inside it`);
        }
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`rounds card OK — ${checks} assertions, measured at 360/390/430 in a real browser`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
