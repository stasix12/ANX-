import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

/**
 * EVERY SCREEN OF THE DESKTOP APP HAS TO BE REACHABLE IN A SMALL WINDOW.
 *
 * "לא נותן לי לגלול למטה."
 *
 * The owner opened the settings screen on a laptop, in a window he had not
 * maximised, and the card holding "נתק את המחשב" and "נתק פייסבוק" was 182px
 * below the bottom edge with NO WAY TO SCROLL TO IT. Not a slow scroll, not a
 * hidden scrollbar — the scroll container was never shorter than the thing it
 * contained, so there was nothing to scroll.
 *
 * WHY IT WAS INVISIBLE UNTIL A PERSON HIT IT. `main` is a grid item and
 * `.page` is a flex item, and both default to `min-height: auto` — "never
 * shrink below your content". So `main` grew to 960px inside a 620px window
 * and `overflow-y: auto` on `.page` had nothing to do. The app looked correct
 * in any window tall enough for its tallest page, which every window the
 * developer used happened to be.
 *
 * This measures the real renderer in a real browser at the sizes a person
 * actually has, and asserts two things per page: that the shell is exactly as
 * tall as the window, and that anything below the fold can be scrolled to.
 *
 *   npx tsx worker/test/desktop-window.test.ts
 */

const PAGES = ['home', 'tasks', 'activity', 'settings', 'updates', 'help'];

/*
 * 1100x620 is the window the owner's screenshot shows — a 15" laptop with the
 * app not maximised, which is how it is used. 900x520 is smaller than anybody
 * is likely to make it, and is here because the failure mode is silent: a
 * window one pixel too short loses a control with no sign that it did.
 */
const WINDOWS = [
  { w: 1100, h: 620, why: "the owner's own window" },
  { w: 900, h: 520, why: 'smaller than anybody would choose' },
  { w: 1440, h: 900, why: 'maximised on a laptop' },
];

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

async function show(page: Page, which: string): Promise<void> {
  await page.evaluate((id) => {
    document.getElementById('shell')!.classList.add('on');
    (document.getElementById('login') as HTMLElement).style.display = 'none';
    /* The toggle rows are built by paintPrefs(); without them the settings
       card is empty and the page is short enough to fit — which is exactly
       why this bug survived every look at it. */
    (window as unknown as { paintPrefs?: (p: unknown) => void }).paintPrefs?.({});
    for (const s of document.querySelectorAll('.page')) (s as HTMLElement).hidden = s.id !== `page-${id}`;
  }, which);
  await page.waitForTimeout(120);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    for (const { w, h, why } of WINDOWS) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      /* The renderer talks to the main process through window.anx. Nothing it
         asks for matters here; it only has to exist so the script runs. */
      await page.addInitScript(() => {
        (window as unknown as { anx: unknown }).anx = new Proxy({}, { get: () => async () => ({ ok: true }) });
      });
      await page.goto(`file://${path.resolve('desktop/renderer/index.html')}`);

      for (const which of PAGES) {
        await show(page, which);
        const seen = await page.evaluate((id) => {
          const el = document.getElementById(`page-${id}`)!;
          const shell = document.getElementById('shell')!;
          return {
            client: el.clientHeight,
            scroll: el.scrollHeight,
            shellH: Math.round(shell.getBoundingClientRect().height),
            viewport: window.innerHeight,
            documentOverflows: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
          };
        }, which);

        const at = `${w}x${h} (${why}) · ${which}`;
        /*
         * THE SHELL IS THE WINDOW. The moment it is taller, some control is
         * outside the window and nothing inside can scroll to it.
         */
        is(
          Math.abs(seen.shellH - seen.viewport) <= 1,
          `${at}: the shell is ${seen.shellH}px in a ${seen.viewport}px window — it has grown past the window instead of scrolling inside it`,
        );
        is(!seen.documentOverflows, `${at}: the document itself overflows, so the app scrolls as a web page rather than as a window`);
        /* A page taller than its box must be able to scroll. A page that fits
           has nothing to prove. */
        if (seen.scroll > seen.client + 1) {
          const reached = await page.evaluate((id) => {
            const el = document.getElementById(`page-${id}`)!;
            el.scrollTop = el.scrollHeight;
            return el.scrollTop > 0;
          }, which);
          is(reached, `${at}: content sits below the fold and the page will not scroll to it`);
        }
      }

      /*
       * THE ONE THE OWNER COULD NOT REACH, by name. Scrolled to, and then
       * asserted to be inside the window — "the element exists" was already
       * true while it was 182px off the bottom of the screen.
       */
      await show(page, 'settings');
      const account = await page.evaluate(() => {
        const el = document.getElementById('page-settings')!;
        el.scrollTop = el.scrollHeight;
        const out: Record<string, { top: number; bottom: number }> = {};
        for (const id of ['signout', 'fbout', 'fbrecheck']) {
          const b = document.getElementById(id)?.getBoundingClientRect();
          if (b) out[id] = { top: Math.round(b.top), bottom: Math.round(b.bottom) };
        }
        return { out, viewport: window.innerHeight };
      });
      for (const id of ['signout', 'fbout', 'fbrecheck']) {
        const box = account.out[id];
        is(box, `${w}x${h}: #${id} is missing from the settings screen entirely`);
        is(
          box && box.top >= 0 && box.bottom <= account.viewport + 1,
          `${w}x${h}: after scrolling to the bottom, #${id} is still outside the window (${JSON.stringify(box)}) — this is the bug the owner hit`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`desktop window tests OK — ${checks} assertions across ${WINDOWS.length} window sizes`);
}

void main();
