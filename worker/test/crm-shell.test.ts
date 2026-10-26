/**
 * THE CRM'S TOOLBAR, MEASURED — WHICH NOTHING HAD EVER DONE.
 *
 * "אני רוצה שתהיה התאמה גם לאייפון… תראה איך נראה לי סרגל הכלים."
 *
 * /social has had a measured suite for a year; the CRM had none. No test in
 * this directory rendered CrmShell, so its bottom bar still padded itself
 * with the raw `env(safe-area-inset-bottom)` — the thing /social was
 * explicitly taught to stop doing, with the reason written out in
 * globals.css: iOS keeps reporting the home indicator's 34px strip inside a
 * Safari TAB, where the browser's own toolbar is already covering it, so a
 * bar that reserves it floats about a centimetre above the bottom of the
 * screen.
 *
 * THE INSETS ARE DRIVEN RATHER THAN HOPED FOR. Chromium offers no way to set
 * env(safe-area-inset-*), so the three values a real device produces are
 * driven through `--safe-b`, the one token everything pinned to the bottom of
 * this product reads:
 *
 *     0      a phone with no inset, and a desktop browser
 *     10px   a Safari tab on a notched iPhone (the token clamps)
 *     34px   the same phone with the app installed to the home screen
 *
 * A shell that reads the token follows all three. One that reads env()
 * directly is frozen at whatever Chromium reports — which is exactly why
 * this was invisible until the owner photographed it.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

/* ───────────────────────────── the source guard ─────────────────────────── */
{
  const shell = readFileSync(new URL('../../src/components/crm/CrmShell.tsx', import.meta.url), 'utf8');
  const code = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  is(
    !/env\(safe-area-inset-bottom\)/.test(code),
    'the CRM pads its bottom bar with the raw inset again — in a Safari tab that is the strip the browser is already covering, and the bar floats off the bottom of the screen',
  );
  is(/pb-\[var\(--safe-b\)\]/.test(code), 'the bottom bar no longer reads the product’s one bottom-inset token');
  is(/pb-\[calc\(7\.5rem\+var\(--safe-b\)\)\]/.test(code), 'and the clearance the page reserves for it no longer tracks the same token');
  /* The top is the other half of the same request: on a Dynamic Island phone
     the inset is large and must win; on a phone with none, a hairline. */
  is(/pt-\[max\(env\(safe-area-inset-top\),2px\)\]/.test(code), 'the header no longer floors its top inset, so on a phone with none the title sits on the first pixel');

  /* And the token itself still means what this file assumes. */
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
  is(/--safe-b: min\(env\(safe-area-inset-bottom\), 0\.625rem\);/.test(css), 'the browser-tab clamp on --safe-b is gone');
  is(/display-mode: standalone[\s\S]{0,200}--safe-b: env\(safe-area-inset-bottom\);/.test(css), 'an installed app no longer gets the full inset');
}

/* ───────────────────────────── the browser pass ─────────────────────────── */

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
    console.log(`crm shell guards OK — ${checks} assertions (measurement SKIPPED, run \`npm run build\` first)`);
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'crm-shell-'));
  copyFileSync(css, path.join(dir, 'app.css'));
  writeFileSync(
    path.join(dir, 'index.html'),
    execFileSync('npx', ['tsx', 'worker/test/render-crm.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 }),
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    /* 390 is the iPhone the owner used to be on, 430 the one he is on now,
       and 360 the narrowest Android still worth supporting. */
    for (const width of [360, 390, 430]) {
      const view = await browser.newPage({ viewport: { width, height: 844 } });
      await view.goto(`file://${path.join(dir, 'index.html')}`);
      /* LET THE SLIDE-IN FINISH FIRST. The geometry below is the settled
         screen; the animation's own first frame is measured on purpose
         further down, and measuring it here by accident would just be a
         race with the 300ms. */
      const settle = () => view.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));
      await settle();

      for (const inset of [0, 10, 34]) {
        await view.evaluate((px) => {
          document.documentElement.style.setProperty('--safe-b', `${px}px`);
        }, inset);
        await view.waitForTimeout(30);

        const seen = await view.evaluate(() => {
          const nav = document.querySelector('nav[aria-label="ניווט ראשי"]')!;
          const navBox = nav.getBoundingClientRect();
          const page = document.querySelector('#probe > div')!;
          const header = document.querySelector('header')!;
          const title = header.querySelector('h1')!;
          const links = [...nav.querySelectorAll('a')].map((a) => a.getBoundingClientRect());
          return {
            navBottom: Math.round(navBox.bottom),
            navHeight: Math.round(navBox.height),
            viewportH: window.innerHeight,
            viewportW: window.innerWidth,
            reserved: Math.round(parseFloat(getComputedStyle(page).paddingBottom)),
            headerPadTop: Math.round(parseFloat(getComputedStyle(header).paddingTop)),
            titleTop: Math.round(title.getBoundingClientRect().top),
            smallest: Math.min(...links.map((r) => Math.min(r.width, r.height))),
            links: links.length,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            /* EVERY LABEL AND EVERY FIELD, WHOLE, INSIDE THE SCREEN. This is
               the owner's photograph stated as a number: "שם הלקוח",
               "כתובת מלאה", "ליד חדש" were all cut off at the right edge. */
            spilled: [...document.querySelectorAll('#probe label, #probe input, #probe select, #probe textarea, #probe button, #probe h1')]
              .map((el) => ({ el, r: el.getBoundingClientRect() }))
              .filter(({ r }) => r.width > 0 && (r.left < -0.5 || r.right > window.innerWidth + 0.5))
              .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 18)}" at ${Math.round(r.left)}…${Math.round(r.right)}`),
            fields: document.querySelectorAll('#probe label').length,
          };
        });
        const at = `${width}px, --safe-b ${inset}px`;

        /* THE BAR ENDS AT THE BOTTOM OF THE SCREEN. It is `fixed bottom-0`,
           so this is really a check that nothing has given it a margin or a
           transform — the shape the owner photographed. */
        is(seen.navBottom === seen.viewportH, `${at}: the bar ends ${seen.viewportH - seen.navBottom}px above the bottom of the screen`);

        /* AND IT GROWS BY EXACTLY THE INSET, which is the whole mechanism:
           a shell reading env() directly would not move at all here. */
        is(seen.navHeight > 0, `${at}: the bar has no height`);

        /* THE PAGE RESERVES AT LEAST THE BAR'S HEIGHT, or the last field of
           a form sits under it — on the "ליד חדש" screen that is the save
           button. */
        is(
          seen.reserved >= seen.navHeight,
          `${at}: the page reserves ${seen.reserved}px under a ${seen.navHeight}px bar — the last control is behind it`,
        );

        /* Every tab is a thumb target. The product's floor is 40px. */
        is(seen.links === 6, `${at}: expected six controls in the bar, got ${seen.links}`);
        is(seen.smallest >= 40, `${at}: a tab measures ${seen.smallest}px — under the 40px floor`);

        /* Nothing runs off the side at any width. */
        is(!seen.overflow, `${at}: the page scrolls sideways`);
        is(seen.fields > 6, `${at}: only ${seen.fields} labelled fields rendered — the form did not mount, so nothing below was measured`);
        is(seen.spilled.length === 0, `${at}: ${seen.spilled.length} elements hang off the side of the screen — ${seen.spilled.join('; ')}`);

        /* The header's own inset has a floor, so the title never sits on the
           very first pixel. */
        is(seen.headerPadTop >= 2, `${at}: the header reserves ${seen.headerPadTop}px above its title`);
        is(seen.titleTop >= 2, `${at}: the title starts at y=${seen.titleTop}`);
      }

      /*
       * ─── AND THE PUSH ANIMATION'S FIRST FRAME ────────────────────────────
       *
       * `.crm-page-push` enters every detail screen — /crm/leads/new among
       * them — from `translateX(-30px)`. A translated child still counts
       * towards the document's scroll width, so for those 300ms the page is
       * 30px wider than the screen, and a phone does not treat that as a
       * rounding detail: iOS lets the whole page be dragged sideways, and in
       * an RTL layout the start of every line goes off the right edge. That
       * is the photograph.
       *
       * Measured by RESTARTING the animation and reading the first frame,
       * rather than by racing the 300ms after load — so this says the same
       * thing on a fast machine and a slow one.
       */
      await view.evaluate(() => document.documentElement.style.setProperty('--safe-b', '10px'));
      const mid = await view.evaluate(async () => {
        const page = document.querySelector('.crm-page') as HTMLElement;
        page.classList.remove('crm-page-push');
        void page.offsetWidth; // force a reflow, or re-adding the class is a no-op
        page.classList.add('crm-page-push');
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const root = document.documentElement;
        const shifted = page.getBoundingClientRect();
        return {
          sideways: root.scrollWidth - root.clientWidth,
          translated: Math.abs(Math.round(shifted.left)) > 1 || Math.abs(Math.round(shifted.right - root.clientWidth)) > 1,
        };
      });
      is(mid.translated, `${width}px: the push animation is not running, so its first frame proves nothing`);
      await settle();
      is(
        mid.sideways === 0,
        `${width}px: while a detail screen slides in, the page is ${mid.sideways}px wider than the screen — on a phone that lets the whole screen be dragged sideways and the right edge of every line goes off it`,
      );

      /* AND THE BAR RESPONDS TO THE TOKEN AT ALL — measured as a difference,
         because that is the single thing the owner's screenshot is about. */
      const heights: number[] = [];
      for (const inset of [0, 34]) {
        await view.evaluate((px) => document.documentElement.style.setProperty('--safe-b', `${px}px`), inset);
        await view.waitForTimeout(20);
        heights.push(await view.evaluate(() => Math.round(document.querySelector('nav[aria-label="ניווט ראשי"]')!.getBoundingClientRect().height)));
      }
      is(
        heights[1] - heights[0] === 34,
        `${width}px: the bar grew by ${heights[1] - heights[0]}px for a 34px inset — it is not reading --safe-b`,
      );

      await view.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`crm shell OK — ${checks} assertions, measured at 360/390/430 across three safe-area insets`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
