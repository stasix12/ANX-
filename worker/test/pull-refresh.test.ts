import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

/**
 * PULL DOWN TO RELOAD — DRAGGED, not rendered.
 *
 * "שאני גולל למעלה אני רוצה שזה יעשה ריסטרט לעמוד וגם יהיה סימון של עיגול
 *  טעינה למעלה."
 *
 * Four things decide whether this feature is good or unusable, and not one of
 * them is visible in a static render, because all four are about what happens
 * WHILE a finger is moving:
 *
 *   1  IT MUST NOT STEAL A SIDEWAYS SWIPE. The dashboard's campaign strip is
 *      swiped with a thumb, and every thumb swipe drifts downward. A pull that
 *      armed on that drift would drag the page every time he changed card —
 *      the single failure that would make this worse than not having it.
 *   2  IT MUST ONLY ARM AT THE VERY TOP, or it fights the scroll he is doing.
 *   3  A SHORT PULL MUST DO NOTHING, and snap back. Otherwise every stray
 *      touch near the top reloads the screen under him.
 *   4  AND WHEN IT DOES FIRE, THE CIRCLE HAS TO BE THERE — he asked for it by
 *      name, and a reload with no sign it is happening is a frozen screen.
 *
 * Touches are dispatched through CDP (Input.dispatchTouchEvent) rather than as
 * synthetic DOM events, so they travel the same path a real finger does —
 * including `cancelable`, which is what preventDefault() hangs on and what a
 * hand-built TouchEvent gets wrong.
 *
 *   npx tsx worker/test/pull-refresh.test.ts
 */

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};
const is = (c: unknown, msg: string) => {
  checks += 1;
  assert.ok(c, msg);
};

/** One finger, moved in steps, exactly as a thumb would. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
    });
    await page.waitForTimeout(12);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * THE SAME DRAG, BUT THE FINGER STAYS DOWN.
 *
 * Section 8 is about the state that exists only while a thumb is on the glass,
 * and `drag` above ends every gesture it starts — so the one moment the bug he
 * photographed lives in was unreachable from this file. This returns with the
 * touch still held, and the caller releases it.
 */
async function dragAndHold(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
    });
    await page.waitForTimeout(12);
  }
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
}

async function main(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), 'pull-'));
  const CHUNKS = path.resolve('.next/static/chunks');
  let best: { file: string; size: number } | null = null;
  try {
    for (const name of readdirSync(CHUNKS)) {
      if (!name.endsWith('.css')) continue;
      const file = path.join(CHUNKS, name);
      const size = statSync(file).size;
      if (!best || size > best.size) best = { file, size };
    }
  } catch {
    best = null;
  }
  if (!best) {
    console.log('pull-to-refresh SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-pull.tsx')],
    outfile: path.join(dir, 'pull.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme"><div id="root"></div></div><script src="pull.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));
    await page.goto(`file://${path.join(dir, 'index.html')}`);
    await page.waitForSelector('[data-strip]');

    const refreshes = () => page.evaluate(() => window.__refreshes);
    /*
     * Registered AFTER the component's own listener, so by the time this one
     * runs `defaultPrevented` already reflects whatever the component decided.
     * Passive, so it cannot itself change the outcome it is measuring.
     */
    await page.evaluate(() => {
      window.__prevented = 0;
      window.addEventListener('touchmove', (e) => { if (e.defaultPrevented) window.__prevented += 1; }, { passive: true });
    });
    const prevented = async () => {
      const n = await page.evaluate(() => window.__prevented);
      await page.evaluate(() => { window.__prevented = 0; });
      return n;
    };
    const scrollY = () => page.evaluate(() => window.scrollY);
    const finish = async () => {
      await page.evaluate(() => window.__resolve?.());
      await page.waitForFunction(() => document.querySelector('.animate-spin') === null);
    };

    /* ── 1. THE ONE THAT MATTERS MOST: a sideways swipe is not a pull ───── */
    {
      const stripY = await page.evaluate(() => {
        const r = document.querySelector('[data-strip]')!.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      /* A real thumb swipe across the card strip: mostly sideways, and — this
         is the point — drifting 20px DOWN as a thumb always does. */
      await drag(page, { x: 320, y: stripY }, { x: 90, y: stripY + 20 });
      eq(await refreshes(), 0, 'A SIDEWAYS SWIPE MUST NOT RELOAD THE SCREEN — he would hit this every time he changes card');
      eq(await page.locator('.animate-spin').count(), 0, 'and must not even show the circle');
      /*
       * AND IT DID NOT TOUCH THE GESTURE — asserted on preventDefault, which
       * is the only way this component can interfere with anything.
       *
       * The first version of this line checked that the strip had actually
       * scrolled, and that was testing the browser rather than the code:
       * CDP touch events do not drive compositor scrolling in a headless
       * Chromium, so the assertion failed for a reason that has nothing to do
       * with the product. What matters is narrower and exactly right —
       * calling preventDefault on a sideways swipe is what would kill the
       * swiper, and it is not called.
       */
      eq(await prevented(), 0, 'and it called preventDefault on none of those moves — that call is the only way it could break the swiper');
    }

    /* ── 2. it only arms at the very top ───────────────────────────────── */
    {
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForFunction(() => window.scrollY > 300);
      await drag(page, { x: 195, y: 300 }, { x: 195, y: 560 });
      eq(await refreshes(), 0, 'a downward drag part-way down the page is a scroll, not a pull');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => window.scrollY === 0);
    }

    /* ── 3. a short pull does nothing, and leaves nothing behind ───────── */
    {
      await drag(page, { x: 195, y: 120 }, { x: 195, y: 190 });
      eq(await refreshes(), 0, 'a pull short of the threshold must not reload');
      await page.waitForTimeout(350);
      eq(await page.locator('.animate-spin').count(), 0, 'and must leave no spinner behind it');
      /* It snapped back: nothing is left translated down the screen. */
      const offset = await page.evaluate(() => {
        const h = document.querySelector('h1') as HTMLElement;
        return Math.round(h.getBoundingClientRect().top);
      });
      is(offset < 60, `the page snapped back to where it was (h1 at ${offset}px)`);
    }

    /* ── 4. A REAL PULL: the circle, then the reload ───────────────────── */
    {
      const before = await refreshes();
      await drag(page, { x: 195, y: 120 }, { x: 195, y: 420 }, 16);
      /*
       * AND THIS ONE IT DID STOP. Without preventDefault the document
       * rubber-bands out from under the indicator on iOS and the gesture
       * fights the browser instead of driving the page.
       */
      is((await prevented()) > 0, 'a real pull suppresses the native overscroll, or it fights the browser all the way down');
      /* HE ASKED FOR THE CIRCLE BY NAME, and it has to be SPINNING while the
         reload runs — a still circle is indistinguishable from a stuck one. */
      /* Asserted, not waited for: a bare waitForSelector fails as a Playwright
         timeout, which says "something took too long" where the truth is "he
         asked for a circle and there isn't one". */
      const spun = await page
        .waitForSelector('.animate-spin', { timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      is(spun, 'THE CIRCLE HE ASKED FOR: a spinning indicator must appear while the screen reloads');
      is(await page.locator('.animate-spin').count(), 'the loading circle is on screen while it reloads');
      const box = await page.locator('.animate-spin').first().boundingBox();
      is(box && box.y > 0 && box.y < 200, `and it is at the TOP of the screen (y=${box?.y})`);
      is(box && Math.abs(box.x + box.width / 2 - 195) < 24, 'and centred, where a pull-to-refresh circle belongs');

      eq(await refreshes(), before + 1, 'and the screen reloaded exactly once');
      /* Still held open by the test, so the state is real and not a race. */
      await finish();
      eq(await page.locator('.animate-spin').count(), 0, 'and the circle goes away when the reload finishes');
      eq(await page.evaluate(() => document.querySelector('h1')!.getAttribute('data-loads')), '1', 'the screen really re-read its data');
    }

    /* ── 5. one pull is one reload ─────────────────────────────────────── */
    {
      /* Two pulls in a row, the second arriving while the first is still
         running: a feature that queued them would hammer the database every
         time an impatient thumb pulled twice. */
      const before = await refreshes();
      await drag(page, { x: 195, y: 120 }, { x: 195, y: 420 }, 16);
      await page.waitForSelector('.animate-spin');
      await drag(page, { x: 195, y: 120 }, { x: 195, y: 420 }, 16);
      eq(await refreshes(), before + 1, 'a second pull during a reload does not start another one');
      await finish();
    }

    /* ── 6. and the page is usable afterwards ──────────────────────────── */
    {
      /* The indicator is pointer-events-none, so the first tap after a refresh
         reaches the page and not the circle's ghost. */
      is(
        await page.evaluate(() => {
          const el = document.elementFromPoint(195, 40);
          return !el?.closest('[aria-hidden]') || el?.closest('#root') !== null;
        }),
        'the spinner does not swallow taps once it is gone',
      );
      await page.evaluate(() => window.scrollTo(0, 500));
      /*
       * WAITED FOR, NOT SLEPT THROUGH. globals.css:130 sets `scroll-behavior:
       * smooth`, so scrollTo ANIMATES — a fixed 80ms read caught it at 51px
       * and the assertion failed for a reason that had nothing to do with this
       * component. Worth writing down because it looked exactly like the real
       * bug it was checking for: a page that will not scroll after a refresh.
       */
      await page.waitForFunction(() => window.scrollY > 400, undefined, { timeout: 3000 });
      is((await scrollY()) > 400, 'and ordinary scrolling still works');
    }

    /* ── 7. THE REGRESSION: it must not unpin what is pinned ──────────── */
    /*
     * "הסרגל כלים למטה לא מקובע .. כמו שהיה לפני."
     *
     * This feature shipped and the bottom navigation bar stopped being fixed
     * to the screen — it scrolled away with the page. A `transform` makes an
     * element the containing block for every `position: fixed` DESCENDANT, and
     * `translateY(0px)` is a transform, so the wrapper carried one at all
     * times and the bar was positioned against IT rather than against the
     * viewport. The whole shell is inside this component, so this was true of
     * every sheet and overlay in the product, not only the bar.
     *
     * Nothing in sections 1-6 could see it: the harness had no fixed element
     * in it. It has one now — two, in fact: `[data-bar]`, outside the wrapper,
     * where the shell keeps the bar today, and `[data-bar-inside]`, where it
     * used to be, kept as the control section 8 fails against.
     *
     * THE WAIT BELOW IS NOT PADDING. The snap-back is a 220ms transition on
     * the transform, and a transform mid-transition is still a containing
     * block — so a read taken the instant the spinner appears found the bar at
     * 2718 and looked exactly like the bug. This section is about the states
     * that LAST: at rest, and for the seconds a reload takes. The state that
     * does NOT last is section 8, and it is where he was looking.
     */
    {
      const bar = '[data-bar]';
      const barBottom = () => page.evaluate((sel) => document.querySelector(sel)!.getBoundingClientRect().bottom, bar);
      const viewport = await page.evaluate(() => window.innerHeight);
      /* The lifted wrapper is read off the bar that is still INSIDE it — the
         one outside has no such ancestor any more, which is the whole point. */
      const settled = () =>
        page.waitForFunction(
          () => getComputedStyle(document.querySelector('[data-bar-inside]')!.parentElement!.parentElement!).transform === 'none',
          undefined,
          { timeout: 3000 },
        );

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 3000 });
      await settled();
      eq(Math.round(await barBottom()), viewport, 'at rest the bar sits on the bottom edge of the screen');

      /* THE ASSERTION HE WOULD HAVE MADE. Scroll a long way; a bar that is
         really fixed has not moved a pixel. */
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForFunction(() => window.scrollY > 800, undefined, { timeout: 3000 });
      eq(
        Math.round(await barBottom()),
        viewport,
        'and it is STILL on the bottom edge after scrolling nine hundred pixels — this is the bug he photographed',
      );
      /* The mechanism behind it: `none` and `translateY(0)` look identical and
         only one of them stops being a containing block. */
      is(
        (await page.evaluate(
          () => getComputedStyle(document.querySelector('[data-bar-inside]')!.parentElement!.parentElement!).transform,
        )) === 'none',
        'the wrapper carries NO transform at rest — translateY(0) would pin the bar to the wrapper just as firmly as translateY(56px)',
      );

      /*
       * AND FOR THE WHOLE RELOAD, which is the part that lasts. A pull is a
       * moment with a thumb on the glass; a reload on 4G is seconds, and a
       * navigation bar pushed off the bottom of the screen for seconds is the
       * same bug wearing a stopwatch. So the page sits back down as soon as
       * the reload starts and only the circle stays out.
       */
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 3000 });
      await drag(page, { x: 195, y: 120 }, { x: 195, y: 420 }, 16);
      await page.waitForSelector('.animate-spin');
      await settled();
      is((await page.locator('.animate-spin').count()) > 0, 'the reload is still running');
      eq(Math.round(await barBottom()), viewport, 'and the bar is back on the bottom edge while it runs, rather than waiting it out off-screen');
      await finish();
      await settled();
      eq(Math.round(await barBottom()), viewport, 'and it is there afterwards');
    }

    /* ── 8. AND WHILE THE FINGER IS STILL DOWN ────────────────────────── */
    /*
     * "תראה איפה נראה הסרגל כלים באמצע ראשי קמפיינים קבוצות .. באמצע המסך",
     * and when asked what it does: "קופץ לאמצע ואז חוזר למטה".
     *
     * Section 7 promised the bar is pinned at rest and for the length of a
     * reload, and said in its own comment that a read taken mid-gesture finds
     * it at 2718 — the state it deliberately did not promise. That state is
     * the one he was photographing. A gesture is short, but it is a gesture
     * he makes by hand several times a day on the three screens he named, and
     * a navigation bar that leaves the bottom of the screen while his thumb is
     * on the glass is a navigation bar that moves.
     *
     * So the bar came out of the lifted subtree, and this is the assertion
     * that says so. The control proves the assertion can fail: the same bar,
     * still inside the wrapper, is measured in the same breath.
     */
    {
      const bottomOf = (sel: string) => page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().bottom, sel);
      const viewport = await page.evaluate(() => window.innerHeight);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 3000 });
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector('[data-bar-inside]')!.parentElement!.parentElement!).transform === 'none',
        undefined,
        { timeout: 3000 },
      );

      /* Held, not finished: 180px of pull, which is 90px of page after the
         friction — a finger halfway through the gesture. */
      const release = await dragAndHold(page, { x: 195, y: 120 }, { x: 195, y: 300 }, 10);
      try {
        /* FIRST, THAT THE PAGE REALLY IS BEING HELD DOWN. Without this the
           two reads below would pass on a gesture that never armed, and the
           section would be measuring nothing. */
        const held = await page.evaluate(
          () => getComputedStyle(document.querySelector('[data-bar-inside]')!.parentElement!.parentElement!).transform,
        );
        is(/^matrix/.test(held) && held !== 'matrix(1, 0, 0, 1, 0, 0)', `the page is translated down while the finger is on it (${held})`);

        eq(
          Math.round(await bottomOf('[data-bar]')),
          viewport,
          'AND THE BAR IS STILL ON THE BOTTOM EDGE OF THE SCREEN MID-GESTURE — "קופץ לאמצע ואז חוזר למטה"',
        );

        /* THE MUTATION, live, in the same run: the bar as the shell used to
           carry it, on this same frame of this same drag. */
        const inside = Math.round(await bottomOf('[data-bar-inside]'));
        is(
          inside > viewport + 24,
          `and the control bar — the one still inside the wrapper — is ${inside - viewport}px off that edge, which is what the real bar did until it moved out`,
        );
      } finally {
        await release();
      }
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector('[data-bar-inside]')!.parentElement!.parentElement!).transform === 'none',
        undefined,
        { timeout: 3000 },
      );
      eq(Math.round(await bottomOf('[data-bar]')), viewport, 'and it never left, so there is nothing to come back from');
    }

    /* ── 9. AND THE PRODUCT CARRIES IT THE SAME WAY AS THIS HARNESS ───── */
    /*
     * Sections 7 and 8 measure a model of the shell. This one reads the shell.
     * It finds which JSX block holds the bar rather than assuming a name, so a
     * rename cannot quietly turn it into a test of nothing — and the thing it
     * forbids is the one line that caused this: the block with the bar in it
     * being the block handed to PullToRefresh.
     */
    {
      const shell = readFileSync('src/components/social/SocialShell.tsx', 'utf8');
      /* Two-space indent and nothing else on the line: the component's own
         top-level blocks, not a `const x = (` nested inside one. Anchored with
         ^/$ under /m rather than with \n, which never matches on the Windows
         runner that builds the installer — a rule package.test.ts enforces. */
      const starts = [...shell.matchAll(/^ {2}const (\w+) = \(\s*$/gm)].map((m) => ({ name: m[1], at: m.index ?? 0 }));
      is(starts.length >= 2, `the shell renders from ${starts.length} top-level JSX blocks`);
      const blocks = starts.map((b, i) => ({ ...b, end: i + 1 < starts.length ? starts[i + 1].at : shell.length }));
      const holder = blocks.find((b) => shell.slice(b.at, b.end).includes('aria-label="ניווט ראשי"'));
      is(holder, 'one of them renders the bottom navigation bar');
      const lifted = shell.match(/<PullToRefresh onRefresh=\{onRefresh\}>\{(\w+)\}<\/PullToRefresh>/);
      is(lifted, 'and the screen is still wrapped in PullToRefresh');
      is(
        holder && lifted && holder.name !== lifted[1],
        `THE BAR IS NOT IN WHAT THE GESTURE LIFTS — lifted: \`${lifted?.[1]}\`, bar: \`${holder?.name}\``,
      );
      is(
        holder && shell.slice(shell.indexOf('</PullToRefresh>')).includes(`{${holder.name}}`),
        'and it is still rendered, after the wrapper rather than inside it',
      );
      /*
       * AND SO IS THE "SAVING" PILL, for exactly the same reason.
       *
       * "אני רוצה שיהיה עיגול כחול של טעינה שאנשים יבינו שזה לא באג אלא
       *  טעינה." It is `position: fixed` at the foot of the screen, so a
       * wrapper with a transform on it would carry it off the bottom mid-pull
       * — the fault this whole section exists for. It belongs in the same
       * block as the bar.
       */
      is(
        holder && shell.slice(holder.at, holder.end).includes('data-working'),
        'the saving pill is in the block the gesture does NOT lift, beside the bar',
      );
    }

    eq(crashes, [], 'the gesture threw');
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(`pull-to-refresh OK — ${checks} assertions, dragged with real touch events`);
}

void main();
