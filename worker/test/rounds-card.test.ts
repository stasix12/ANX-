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
      eq(seen.panels.length, 6, `${at}: the fixture drew ${seen.panels.length} panels, not six`);
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
            const box = d.querySelector('div')!.getBoundingClientRect();
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
