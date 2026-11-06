/*
 * ─── THE ANX ASSISTANT, AND THE ONE CLAIM IT IS ALLOWED TO MAKE ───────────
 *
 * "אם אין אירוע אמיתי שמאפשר לדעת מה קורה, אין להציג פעילות מדומה …
 *  אם הפרסום נכשל, אין להציג V ירוק."
 *
 * This replaces worker/test/publishing-scene.test.ts, which guarded the drawn
 * SVG scene the reference retired. Every rule in it that is still about
 * something on the screen was carried over; the ones whose feature is gone
 * are listed at the foot of this file with the reason, so nobody has to go
 * digging in the history to find out whether they were dropped or forgotten.
 *
 * THE LINE THE WHOLE FILE EXISTS FOR, unchanged:
 *
 *   A POSE asserts nothing. "The robot is at its desk with a post in its
 *   hand" is what `sending` means, and it may loop freely.
 *
 *   A GREEN TICK ASSERTS A PUBLICATION. It may appear only when the real
 *   count rises — and that count comes from the database.
 *
 *   npx tsx worker/test/publishing-stage.test.ts
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.deepEqual(a, b, msg); };
const is = (c: unknown, msg: string) => { checks += 1; assert.ok(c, msg); };

/** The drawn check marks, scoped to the tick itself: the rail carries a green
    ✓ of its own as a LEGEND, and counting that as an arrival would be the
    worst direction for this suite to be wrong in. */
const ticks = (page: Page) => page.locator('[data-tick]').count();

async function main(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), 'stage-'));
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
    console.log('publishing stage SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-scene.tsx')],
    outfile: path.join(dir, 'scene.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
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
<body class="bg-ink-950"><div class="social-theme"><div id="root"></div></div><script src="scene.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));
    await page.goto(`file://${path.join(dir, 'index.html')}`);
    await page.waitForSelector('[data-stage]');

    /* ── 1. IT CANNOT INVENT A PUBLICATION ──────────────────────────────── */
    {
      eq(await ticks(page), 0, 'nothing published, nothing ticked');
      is(
        (await page.locator('.anx-beam.anx-lit').count()) > 0,
        'and yet the beam IS lit — "busy" is allowed to be decorative, because it claims nothing about an outcome',
      );
      /* Longer than every loop in the stage. */
      await page.waitForTimeout(3200);
      eq(
        await ticks(page),
        0,
        'THREE SECONDS OF THE BUSIEST POSE AND NOT ONE TICK — the animation may never stand in for a publication that did not happen',
      );
      eq(await page.locator('[data-active]').count(), 1, 'and exactly one group is the destination — never two, never none');
    }

    /* ── 2. A REAL ONE IS MARKED, AND THE MARK DOES NOT STAY FOR EVER ───── */
    {
      const beforeIndex = await page.evaluate(() => [...document.querySelectorAll('[data-card]')].findIndex((el) => el.hasAttribute('data-active')));
      await page.evaluate(() => window.__publish(1));
      await page.waitForTimeout(200);
      eq(await ticks(page), 1, 'one real publication, one tick');
      eq(
        await page.evaluate(() => (document.querySelector('[data-tick]')?.closest('[data-card]') ? 1 : 0)),
        1,
        'on a group card — the one it was sent to',
      );

      /* Held, then gone — and the next group takes over. */
      await page.waitForTimeout(2600);
      eq(await ticks(page), 0, 'the tick is held for a beat and then goes: a mark that never leaves cannot report an arrival');
      const afterIndex = await page.evaluate(() => [...document.querySelectorAll('[data-card]')].findIndex((el) => el.hasAttribute('data-active')));
      is(beforeIndex !== afterIndex, 'and the active destination has moved on to the next group');
      eq(await page.locator('[data-active]').count(), 1, 'still exactly one');
    }

    /* ── 3. A BURST IS PRESENTED ONE AT A TIME, A CATCH-UP IS NOT ───────── */
    {
      await page.waitForTimeout(400);
      eq(await ticks(page), 0, 'NO tick on the next destination before anything lands there');
      /* Three more: inside the ceiling, so each is presented in turn. */
      await page.evaluate(() => window.__publish(4));
      await page.waitForTimeout(200);
      eq(await ticks(page), 1, 'a burst shows its first arrival');
      await page.waitForTimeout(2600);
      eq(await ticks(page), 1, 'then the next, on the next group');
      await page.waitForTimeout(2600);
      eq(await ticks(page), 1, 'and the next — one at a time, rather than three collapsed into one');
      await page.waitForTimeout(2600);

      /*
       * AND A JUMP OF HUNDREDS IS A CATCH-UP, NOT A CELEBRATION.
       *
       * Each arrival is held for 2.4 seconds. A tab left open through lunch,
       * or a worker restarted, hands this card a rise of two hundred — which
       * queued would celebrate for ten minutes over publications that
       * finished hours ago, with the card stuck on "הפרסום הושלם בהצלחה"
       * while the queue moved on without it.
       */
      await page.evaluate(() => window.__publish(260));
      await page.waitForTimeout(300);
      eq(await ticks(page), 0, 'A CATCH-UP PRESENTS NOTHING: the figures under the bar carry those publications, which is where a count belongs');
      await page.waitForTimeout(1200);
      eq(await ticks(page), 0, 'and it stays presented-nothing a second later, rather than draining for minutes');
      await page.evaluate(() => window.__publish(0));
      await page.waitForTimeout(200);
    }

    /* ── 4. THE STATES ARE TOLD APART ───────────────────────────────────── */
    {
      const seenIn = async (mode: string) => {
        await page.evaluate((m) => window.__mode(m as never), mode);
        await page.waitForTimeout(250);
        return page.evaluate(() => {
          const stage = document.querySelector('[data-stage]') as HTMLElement;
          const on = stage.querySelector('.anx-scene img.anx-on') as HTMLImageElement | null;
          return {
            stage: stage.dataset.stage,
            frame: on ? Number(on.dataset.frame) : -1,
            beam: stage.querySelectorAll('.anx-beam.anx-lit').length,
            active: stage.querySelectorAll('[data-active]').length,
            ticks: stage.querySelectorAll('[data-tick]').length,
            rail: (stage.querySelector('[data-rail]') as HTMLElement).dataset.rail,
            live: (stage.querySelector('li.anx-live') as HTMLElement | null)?.dataset.step ?? '',
            title: (stage.querySelector('[data-stage-title]')?.textContent ?? '').trim(),
            beat: [...stage.querySelector('.anx-scene')!.classList].find((c) => c.startsWith('anx-beat-')),
            robots: stage.querySelectorAll('.anx-scene img').length,
          };
        });
      };

      const waiting = await seenIn('waiting');
      eq(waiting.frame, 0, 'WAITING: the reference’s first pose — at the laptop, eyes smiling');
      eq(waiting.beam, 0, 'and nothing travels — the gap between publications is not a publication');
      eq(waiting.ticks, 0, 'and nothing is marked');
      eq(waiting.rail, 'waiting', 'the rail says ממתין');
      eq(waiting.title, 'מחכה לעבודות', 'and so does the title, in his own words');

      const preparing = await seenIn('preparing');
      is([1, 2, 3].includes(preparing.frame), `PREPARING: one of the reference's poses 2-4 — got ${preparing.frame}`);
      eq(preparing.beam, 0, 'NOTHING CROSSES THE SCENE YET: before the final click nothing has been submitted to Facebook');
      eq(preparing.active, 1, 'but the group it is for is named, because the row has one');
      eq(preparing.rail, 'queued', 'and the rail says בתור');

      const sending = await seenIn('sending');
      eq(sending.frame, 4, 'PUBLISHING: the reference’s pose 5, the card leaving the hand');
      eq(sending.beam, 1, 'and the beam is lit, towards the group it is going to');
      eq(sending.rail, 'publishing', 'with the rail on מפרסם עכשיו');

      const done = await seenIn('done');
      is([5, 6].includes(done.frame), `DONE: one of the celebration poses — got ${done.frame}`);
      eq(done.beam, 0, 'nothing travels — the day has nothing left to send');
      eq(done.active, 0, 'and no group is named as the next destination, because there is no next one');
      eq(done.title, 'הרובוט סיים לפרסם', 'the exact sentence he asked for');

      const paused = await seenIn('paused');
      eq(paused.beam, 0, 'PAUSED: nothing travels');
      eq(paused.active, 0, 'and no group is named — nothing is going anywhere');
      eq(paused.beat, 'anx-beat-still', 'and the pose is still: he switched it off himself');

      const error = await seenIn('error');
      eq(error.beam + error.active + error.ticks, 0, 'ERROR: nothing in the air, nothing named, nothing marked');
      eq(error.title, 'נדרשת פעולה שלכם', 'and it says what it is');

      const offline = await seenIn('offline');
      eq(offline.beat, 'anx-beat-off', 'OFFLINE: the picture is greyed');
      eq(offline.beam + offline.active + offline.ticks, 0, 'and nothing claims to be moving on a machine that is not connected');
      eq(offline.title, 'המחשב לא מחובר', 'and it says so');

      /* ONE CHARACTER, NINE POSES — his instruction that the robot must look
         identical in every frame is kept by there being exactly one set of
         pictures and one visible at a time. */
      eq(offline.robots, 9, 'the nine reference frames are all in the DOM');
      for (const m of ['waiting', 'preparing', 'sending', 'done', 'paused', 'error', 'offline']) {
        const s = await seenIn(m);
        eq(
          await page.evaluate(() => document.querySelectorAll('[data-stage] .anx-scene img.anx-on').length),
          1,
          `${m.toUpperCase()}: exactly one pose is visible — a cross-fade, never two characters at once`,
        );
        is(s.frame >= 0 && s.frame < 9, `${m}: and it is one of his nine`);
      }
    }

    /* ── 5. IT IS HIS PICTURE, AND IT FITS ──────────────────────────────── */
    {
      await page.evaluate(() => window.__mode('sending'));
      await page.waitForTimeout(150);
      const img = await page.evaluate(() => {
        const i = document.querySelector('[data-stage] .anx-scene img.anx-on') as HTMLImageElement;
        return { src: i.getAttribute('src') ?? '', w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height };
      });
      is(img.src.includes('/social/anx/scene-'), `the character is the reference's own frame, not a drawing of it (${img.src})`);
      is(Math.abs(img.w / img.h - 380 / 237) < 0.06, `and it keeps the frame's proportions (${img.w.toFixed(0)}x${img.h.toFixed(0)})`);

      for (const width of [320, 360, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(120);
        const seen = await page.evaluate(() => {
          const st = document.querySelector('[data-stage]') as HTMLElement;
          const r = st.getBoundingClientRect();
          const pic = (st.querySelector('.anx-scene img.anx-on') as HTMLElement).getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            w: Math.round(r.width),
            inner: document.documentElement.clientWidth,
            ratio: pic.width / pic.height,
          };
        });
        is(!seen.overflow, `${width}px: the stage must not push the page sideways`);
        is(seen.w <= seen.inner, `${width}px: it is ${seen.w}px inside a ${seen.inner}px screen`);
        is(Math.abs(seen.ratio - 380 / 237) < 0.06, `${width}px: and the character is never squashed (${seen.ratio.toFixed(2)})`);
      }
      await page.setViewportSize({ width: 390, height: 900 });
    }

    /* ── 6. THE ANIMATIONS EXIST IN THE FIRST PLACE ─────────────────────── */
    /*
     * A NAME IS NOT AN ANIMATION. `animation-name` computes to whatever the
     * stylesheet says even when the matching @keyframes is not in the build —
     * the browser resolves the name, finds no keyframes and runs nothing. The
     * production minifier has already done that to this scene once.
     */
    {
      await page.evaluate(() => window.__mode('sending'));
      await page.waitForTimeout(200);
      const alive = await page.evaluate(() =>
        ['[data-stage] .anx-scene img.anx-on', '[data-stage] .anx-beam-core'].map((sel) => {
          const el = document.querySelector(sel);
          return { sel, name: el ? getComputedStyle(el).animationName : 'absent', n: el ? el.getAnimations().length : -1 };
        }),
      );
      for (const a of alive) {
        is(a.n >= 1, `${a.sel} has a name AND a running animation behind it (${a.name}, ${a.n})`);
      }
      await page.evaluate(() => window.__mode('waiting'));
      await page.waitForTimeout(200);
      const breath = await page.evaluate(() => {
        const el = document.querySelector('[data-stage] .anx-scene img.anx-on')!;
        return { name: getComputedStyle(el).animationName, n: el.getAnimations().length };
      });
      eq(breath.name, 'anx-stage-breathe', 'and a held pose still breathes, so nine stills do not read as a slideshow');
      is(breath.n >= 1, 'with a real animation behind that name');
    }

    /* ── 7. REDUCED MOTION: SWITCHED OFF, NOT HIDDEN ────────────────────── */
    {
      const quiet = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
      await quiet.goto(`file://${path.join(dir, 'index.html')}`);
      await quiet.waitForSelector('[data-stage]');
      await quiet.evaluate(() => { window.__publish(1); window.__mode('sending'); });
      await quiet.waitForTimeout(200);
      const moving = await quiet.evaluate(() =>
        [...document.querySelectorAll('[data-stage] *')].filter((el) => el.getAnimations().length > 0).length,
      );
      eq(moving, 0, 'reduced motion: NOTHING in the stage is running an animation — every element asked, not a list of class names');
      is((await quiet.locator('[data-stage] .anx-scene img.anx-on').count()) === 1, 'but the character is still on screen');
      is((await quiet.locator('[data-stage] [data-tick]').count()) > 0, 'and the tick that was earned is still there — the state was never in the motion');
      await quiet.close();
    }

    /* ── 8. AND THE PANEL STILL DECIDES, FROM THE ROW ───────────────────── */
    /*
     * The stage is handed a mode. Which mode is worked out in LiveQueueHero
     * from the worker's own reported step — see worker/test/scene-states.ts
     * for the exhaustive table. What is checked here is that the panel is
     * really wired to it.
     */
    {
      const show = () =>
        page.evaluate(() => {
          const p = document.querySelector('[data-panel]') as HTMLElement;
          const st = p.querySelector('[data-stage]') as HTMLElement | null;
          return {
            title: (p.querySelector('h2')?.textContent ?? '').trim(),
            stage: st?.dataset.stage ?? 'none',
            said: (st?.querySelector('[data-stage-title]')?.textContent ?? '').trim(),
            beam: p.querySelectorAll('.anx-beam.anx-lit').length,
          };
        });
      await page.evaluate(() => { window.__mode('sending'); window.__plan(170, 248); window.__system('active', true, false); });
      await page.waitForTimeout(250);

      await page.evaluate(() => window.__step('uploading_media'));
      await page.waitForTimeout(250);
      const held = await show();
      eq(held.stage, 'preparing', 'the row says "מעלה מדיה", so the stage is preparing');
      eq(held.beam, 0, 'and nothing crosses the scene, because nothing has been submitted');

      await page.evaluate(() => window.__step('publishing'));
      await page.waitForTimeout(250);
      const clicking = await show();
      eq(clicking.stage, 'sending', 'AT THE CLICK: the stage is sending');
      eq(clicking.beam, 1, 'and the beam is lit');
      eq(clicking.title, 'רובוט בפעולה', 'with the panel’s own headline untouched by any of this');

      /* A backlog waiting for a person stops nothing, so it may not stop the
         robot either — see worker/test/scene-states.test.ts. */
      await page.evaluate(() => window.__system('needs_intervention', true, false));
      await page.waitForTimeout(250);
      eq((await show()).stage, 'sending', 'A BACKLOG DOES NOT STOP THE ROBOT: it is still publishing, so it still says so');

      await page.evaluate(() => window.__system('needs_intervention', true, true));
      await page.waitForTimeout(250);
      eq((await show()).stage, 'error', 'but an intervention that really stops the engine does');

      await page.evaluate(() => window.__system('needs_intervention', false, true));
      await page.waitForTimeout(250);
      eq((await show()).stage, 'offline', 'and with no heartbeat it is the disconnected one');

      await page.evaluate(() => { window.__system('active', true, false); window.__mode('waiting'); window.__plan(248, 248); });
      await page.waitForTimeout(300);
      const over = await show();
      eq(over.title, 'הרובוט סיים לפרסם', 'FINISHED: the panel’s headline');
      is(
        over.stage === 'done' || over.said === 'הפרסום הושלם בהצלחה',
        `and the stage is celebrating or presenting the last arrival — got "${over.stage}" / "${over.said}"`,
      );
      await page.evaluate(() => { window.__mode('sending'); window.__plan(0, 0); });
      await page.waitForTimeout(150);
    }

    /* ── 9. the source says what it may and may not do ──────────────────── */
    {
      const src = readFileSync(new URL('../../src/components/social/PublishingStage.tsx', import.meta.url), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      is(!/setInterval\(\s*\(\)\s*=>\s*setTarget/.test(code), 'nothing polls the arrival count');
      const rise = code.slice(code.indexOf('const gained'), code.indexOf('}, [published]);'));
      is(rise.length > 40 && rise.length < 900, 'the effect that watches the real count is still one effect, and this slice is it');
      eq(
        (code.match(/setTarget\(/g) ?? []).length,
        (rise.match(/setTarget\(/g) ?? []).length,
        'EVERY change to the arrival count happens inside the effect watching `published` — nowhere else in the file may touch it',
      );
      is(/const landing = shown < target;/.test(code), 'and the presentation can never run ahead of it');
      is(/seen\.current/.test(code) && /published - seen\.current/.test(code), 'and it advances on a RISE in that count, not on a render');
      is(!/Math\.random/.test(code), 'nothing is rolled — a number drawn during render does not survive hydration');
      /*
       * RE-POINTED. The scene this replaces asserted that every mark was
       * DRAWN and nothing was fetched, because the account had been cut off
       * for egress once. The character is now a fetched picture by his own
       * instruction — "אל תנסה לצייר רובוט חלופי ב-CSS" — so the claim moved
       * to where the pictures come from: this product's own /public, never a
       * third party, and nothing heavier than the nine frames.
       */
      is(!/https?:\/\//.test(code), 'and every picture is served from this product, not fetched from somebody else');
      is(/\/social\/anx\/scene-\$\{i\}\.webp/.test(code), 'from the nine reference frames in public/social/anx');
      const assets = readdirSync(path.resolve('public/social/anx'));
      eq(assets.filter((f) => /^scene-\d\.webp$/.test(f)).length, 9, 'all nine are on disk');
      const bytes = assets.reduce((n, f) => n + statSync(path.resolve('public/social/anx', f)).size, 0);
      is(bytes < 400_000, `and they are ${(bytes / 1024).toFixed(0)} KB in all — a dashboard card, not a download`);
    }

    eq(crashes, [], 'the stage threw');
    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`publishing stage OK — ${checks} assertions, driven in a real browser`);
}

/*
 * ─── WHAT WAS RETIRED WITH THE OLD SCENE, AND WHY ─────────────────────────
 *
 * Listed rather than deleted silently, because a rule that disappears without
 * a reason is a rule somebody re-breaks.
 *
 *   THE BALL AND THE SIX TRICKS. "תעשה אותו שהוא מקפיץ כדור שאין כלום" was
 *   about a standing robot with nothing to do. The reference has it sitting
 *   at a desk with a laptop; there is no ball in any of the nine frames and
 *   no floor for one to bounce on.
 *
 *   THE DANCE AND THE CONFETTI. Retired by the brief itself: "אין קונפטי
 *   מוגזם או תנועות קופצניות". The finished day is poses 6-7 — thumbs up and
 *   both hands — and the sentence under them.
 *
 *   THE ROBOT'S MEASURED GEOMETRY (the hand, the antenna, the boot, the
 *   crown, BALL_DROP). Every one of those existed to aim something drawn at
 *   something painted. Nothing is drawn on the character any more.
 *
 *   THE CARD'S SIZE AGAINST THE RECORDING. The post card is in the
 *   reference's own pixels now; there is nothing of ours to measure.
 *
 * Kept and carried over: the tick rule and its whole section, the states
 * being told apart, the reduced-motion contract, the fit at every width, "a
 * name is not an animation", and the panel's own derivation from the row.
 */
void main();
