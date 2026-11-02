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
      await page.waitForTimeout(150);

      const seen = await page.evaluate(() => {
        const probes = [...document.querySelectorAll('.panel-probe')];
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          panels: probes.map((p) => {
            const card = [...p.querySelectorAll('div')].find((d) => d.textContent?.startsWith('סבבים ביום (ריצות)'));
            const rows = [...p.querySelectorAll('li')];
            /* Everything a finger has to hit inside the rounds card. */
            const hits = card
              ? [...card.querySelectorAll('button, summary, input, [role="switch"]')].map((e) => {
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
              addButton: !!card && /הוסף סבב נוסף/.test(card.textContent ?? ''),
              warns: !!card && /לא יפרסם/.test(card.textContent ?? ''),
              /* No control may stick out of the card sideways. */
              wide: card
                ? [...card.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > card.getBoundingClientRect().right + 1)
                : false,
            };
          }),
        };
      });

      const at = `${width}px`;
      is(!seen.overflow, `${at}: the page scrolls sideways with the rounds card on it`);
      eq(seen.panels.length, 4, `${at}: the fixture drew ${seen.panels.length} panels, not four`);
      for (const [i, p] of seen.panels.entries()) {
        is(p.drawn, `${at}: panel ${i} did not draw the card at all — which is the exact failure this file was written after`);
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

      /* ── case 3: the cap ──────────────────────────────────────────────── */
      eq(seen.panels[3].rows, 4, `${at}: three armed rounds plus the window's own hour is four rows; a switched-off round is not planned and not listed`);
      is(!seen.panels[3].addButton, `${at}: at the cap the add button must be gone rather than present and refusing`);

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
