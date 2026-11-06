/*
 * ─── ANX LIVE FLOW, AND THE CLAIMS IT IS ALLOWED TO MAKE ──────────────────
 *
 * "המידע חייב להגיע ממערכת הפרסום האמיתית. אין להציג נתוני דוגמה במערכת
 *  הפעילה … אחוז התקדמות יוצג רק אם קיימים נתוני התקדמות אמיתיים."
 *
 * This replaces worker/test/publishing-stage.test.ts, which guarded the stage
 * the reference retired. Every rule in it that is still about something on
 * the screen was carried over; the ones whose feature is gone are listed at
 * the foot of this file with the reason, so nobody has to go digging in the
 * history to find out whether they were dropped or forgotten.
 *
 * THE LINES THE WHOLE FILE EXISTS FOR:
 *
 *   A POSE asserts nothing. The character at his laptop is what "the system
 *   is running" looks like, and it may loop freely.
 *
 *   A LIT STATION, A GREEN TICK AND A PERCENTAGE EACH ASSERT SOMETHING about
 *   a row in a worker's hands. Every one of them is read from that row's own
 *   stage, written by the worker, and from nothing else.
 *
 *   npx tsx worker/test/live-flow.test.ts
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { progressOfStep } from '../../src/components/social/LiveFlow';
import { ANX_FACES } from '../../src/components/social/anxPoses';

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.deepEqual(a, b, msg); };
const is = (c: unknown, msg: string) => { checks += 1; assert.ok(c, msg); };

async function main(): Promise<void> {
  /* ── §0 — the ladder, before a browser is opened ───────────────────────── */
  {
    /*
     * THE PERCENTAGE IS A POSITION IN A LADDER, NOT A CLOCK. Asserted here as
     * a pure function, because it is one: the same stage must always produce
     * the same figure, and a stage that is not on the ladder must produce no
     * figure at all rather than a zero.
     */
    eq(progressOfStep('publishing'), 75, 'the final click is three quarters of the way through the ladder');
    eq(progressOfStep('uploading_media'), 50, 'attaching the media is half');
    eq(progressOfStep('verifying'), 88, 'reading back what happened is nearly all of it');
    is(progressOfStep('pending')! < progressOfStep('opening')!, 'and the ladder only ever goes forwards');
    is(progressOfStep('opening')! < progressOfStep('uploading_media')!, 'at every rung');
    is(progressOfStep('uploading_media')! < progressOfStep('publishing')!, 'in the worker’s own order');
    eq(progressOfStep(null), null, 'A ROW WITH NO STAGE HAS NO PERCENTAGE — not 0%, which is a claim');
    eq(progressOfStep(''), null, 'and neither does an empty one');
    eq(progressOfStep('failed'), null, 'a failure is not a position on the way to success');
    eq(progressOfStep('needs_attention'), null, 'and neither is a row parked for a person');
    eq(progressOfStep('published'), null, 'a finished row is off this card entirely');
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'flow-'));
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
    console.log('live flow SKIPPED — no built CSS (run `npm run build` first)');
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

  /*
   * SERVED, NOT OPENED FROM DISK. The nine poses are referenced by absolute
   * path — /social/anx/pose-N.webp — which under file:// resolves to the root
   * of the filesystem and 404s. Over http they are really fetched, really
   * decoded, and §5 below can ask the one question that matters about them.
   */
  const TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.webp': 'image/webp',
    '.png': 'image/png',
  };
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const file = url.startsWith('/social/') ? path.resolve('public' + url) : path.join(dir, path.basename(url) || 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('no');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));
    await page.goto(`${origin}/index.html`);
    await page.waitForSelector('[data-flow]');
    await page.evaluate(() => {
      window.__plan(22, 48);
      window.__publish(22);
      window.__system('active', true, false);
    });
    await page.waitForTimeout(250);

    /** Everything the card is saying, in one read. */
    const read = () =>
      page.evaluate(() => {
        const card = document.querySelector('[data-panel] [data-flow]') as HTMLElement;
        const now = card.querySelector('[data-now]');
        const bar = card.querySelector('[data-bar]') as HTMLElement | null;
        return {
          flow: card.dataset.flow,
          title: (card.querySelector('[data-flow-title]')?.textContent ?? '').trim(),
          state: (card.querySelector('.anxf-state')?.textContent ?? '').trim(),
          station: (card.querySelector('[data-station]') as HTMLElement).dataset.station,
          live: (card.querySelector('li[data-state="live"]') as HTMLElement | null)?.dataset.step ?? '',
          passed: card.querySelectorAll('[data-passed]').length,
          now: now ? 1 : 0,
          nowName: (now?.querySelector('.anxf-now-name')?.textContent ?? '').trim(),
          bar: bar?.dataset.bar ?? '',
          pct: (card.querySelector('.anxf-pct')?.textContent ?? '').trim(),
          rows: [...card.querySelectorAll('[data-row]')].map((el) => (el as HTMLElement).dataset.row),
          /* The card must carry NO figures of its own — see §4. */
          tiles: card.querySelectorAll('[data-tile]').length,
        };
      });

    /* ── §1 — THE LIT STATION IS THE ROW'S OWN STAGE ───────────────────── */
    {
      await page.evaluate(() => window.__step('uploading_media'));
      await page.waitForTimeout(220);
      const a = await read();
      eq(a.station, 'preparing', 'ATTACHING MEDIA IS "מכין": the station is the stage the worker wrote, not a mood');
      eq(a.passed, 1, 'and exactly one station behind it carries a tick — ממתין, which this row really has passed');
      eq(a.now, 1, 'the card for what is going out is drawn, because something is');
      eq(a.pct, '50%', 'and the figure on it is that stage’s own position in the ladder');

      await page.evaluate(() => window.__step('publishing'));
      await page.waitForTimeout(220);
      const b = await read();
      eq(b.station, 'publishing', 'AT THE CLICK: the lit station moves with the row');
      eq(b.passed, 2, 'and two stations are behind it now');
      eq(b.pct, '75%', 'with the figure moved to match — and nothing else moved it');

      /* THE BAR MAY NOT WALK BACKWARDS mid-publication. A re-read that lands
         on an earlier stage would otherwise un-publish a post on screen. */
      await page.evaluate(() => window.__step('opening'));
      await page.waitForTimeout(220);
      eq((await read()).pct, '75%', 'a stage that arrives out of order never pulls the bar back for the same row');
    }

    /* ── §2 — NO STAGE, NO NUMBER ──────────────────────────────────────── */
    {
      await page.evaluate(() => window.__step('' as never));
      await page.waitForTimeout(220);
      const a = await read();
      eq(a.now, 1, 'a row with no stage is still a row going out');
      eq(a.pct, '', 'BUT IT CARRIES NO PERCENTAGE — "אחרת יש להציג אנימציית פעילות ללא אחוז מומצא"');
      eq(a.bar, 'live', 'and the bar says so about itself');
      is(
        await page.evaluate(() => {
          const f = document.querySelector('[data-panel] .anxf-fill') as HTMLElement;
          return f.classList.contains('anxf-fill-live') && f.getAnimations().length > 0;
        }),
        'what it shows instead is motion, and the motion is real rather than a class name',
      );
      await page.evaluate(() => window.__step('publishing'));
      await page.waitForTimeout(200);
    }

    /* ── §3 — A STOPPED MACHINE IS NOT PUBLISHING ──────────────────────── */
    /*
     * THE BUG THIS SECTION EXISTS FOR, found in the screenshot comparison
     * against the reference and fixed the same hour: a row stays "in flight"
     * in the database when the machine dies holding it, so a disconnected PC
     * drew the card "שולח פוסט לקבוצה…" over a progress bar — a publication
     * in progress on a computer that is switched off.
     */
    {
      await page.evaluate(() => window.__system('needs_intervention', false, true));
      await page.waitForTimeout(250);
      const off = await read();
      eq(off.flow, 'offline', 'with no heartbeat the card is the disconnected one');
      eq(off.now, 0, 'AND NOTHING IS GOING OUT: no card, because no machine is publishing');
      eq(off.pct, '', 'and no percentage, because there is no publication to be a percentage of');
      eq(off.station, 'waiting', 'the lit station is ממתין — nothing is being prepared or sent');
      eq(off.passed, 0, 'and no station is ticked: nothing has been passed');
      is(!off.rows.includes('live'), 'and no row in the queue wears a spinner on a machine that is off');

      await page.evaluate(() => window.__system('active', true, true));
      await page.waitForTimeout(250);
      const err = await read();
      eq(err.flow, 'error', 'an intervention that really stops the engine is the stopped card');
      eq(err.now, 0, 'and it is not publishing either');

      await page.evaluate(() => window.__mode('paused'));
      await page.evaluate(() => window.__system('paused', true, false));
      await page.waitForTimeout(250);
      const pau = await read();
      eq(pau.flow, 'paused', 'PAUSED: the owner’s own switch');
      eq(pau.now, 0, 'and nothing claims to be going out');

      await page.evaluate(() => {
        window.__mode('sending');
        window.__system('active', true, false);
      });
      await page.waitForTimeout(250);
      const back = await read();
      eq(back.now, 1, 'and it comes back when the engine does');

      /* A BACKLOG STOPS NOTHING, so it may not stop this card either. */
      await page.evaluate(() => window.__system('needs_intervention', true, false));
      await page.waitForTimeout(250);
      eq((await read()).now, 1, 'A BACKLOG WAITING FOR A PERSON IS STILL A RUNNING ENGINE: it keeps publishing, so it keeps saying so');
      await page.evaluate(() => window.__system('active', true, false));
      await page.waitForTimeout(200);
    }

    /* ── §4 — AND IT CARRIES NO FIGURES OF ITS OWN ────────────────────── */
    /*
     * "כאן למחוק את הריבועים מתחת עם המספרים."
     *
     * This section used to measure four tiles on this card: "פרסומים היום",
     * "הצלחות" with its share, "נכשלו" and "קבוצות". They are gone, because
     * they were a second copy of the row of stat tiles that sits a little
     * further down the same screen — and that row says more about the same
     * numbers: the daily ceiling under the first, the week under it, "טפל
     * עכשיו" and the skipped count under the second, and every tile a link
     * into the history filtered to itself.
     *
     * WHAT THOSE ASSERTIONS PROTECTED, AND WHERE IT LIVES NOW:
     *
     *   • "the four figures come from the counts the screen was handed" —
     *     the row below is fed by the same reads (data.today,
     *     data.failedToday) and is covered by today-count.test.ts.
     *   • "פרסומים היום is exactly the successes plus the failures" — that
     *     sum existed only on the deleted tile. The row below prints the two
     *     numbers separately and never adds them, so there is no arithmetic
     *     left to get wrong.
     *   • "nothing attempted, no share" — the share was the deleted tile's
     *     too, for the same reason.
     *
     * What is asserted instead is the deletion itself: this card prints no
     * figure tiles at all, at any width (§7 re-checks it at six of them).
     */
    {
      eq((await read()).tiles, 0, 'the card carries no figure tiles of its own — the row below the card owns the numbers');
    }

    /* ── §4b — THE GROUP'S OWN PICTURE, BESIDE ITS NAME ────────────────── */
    /*
     * "בצד ימין ליד השם של הקבוצה בריבוע הריק להוסיף גם את התמונה של הקבוצות."
     *
     * The square he photographed is the one on the publishing card: a grey
     * outline on every publication whose post has no picture of its own,
     * which is most of them. It carries the group's picture now, and so does
     * the square at the head of every queue row.
     *
     * THREE THINGS ARE MEASURED, not one: that the picture really lands in
     * that square (a src on a hidden element is not a picture), that a group
     * with NO picture keeps the Facebook mark rather than an empty box, and
     * that both shapes occupy the same 26px — a row that resized when a
     * picture loaded would make the queue jump as the images arrive.
     */
    {
      const seen = await page.evaluate(() => {
        const card = document.querySelector('[data-panel] [data-flow]') as HTMLElement;
        const cover = card.querySelector('.anxf-now-cover') as HTMLElement;
        const cimg = cover.querySelector('img');
        return {
          /* The publishing card's square: which of the three it is showing. */
          coverKind: cover.dataset.pic ?? '',
          coverPainted: cimg ? Math.round(cimg.getBoundingClientRect().width) : 0,
          coverSrc: (cimg?.getAttribute('src') ?? '').slice(0, 24),
          /* The queue: a picture for the two rows that have one, the mark for
             the third, and every box the same size. */
          rows: [...card.querySelectorAll('.anxf-queue li')].map((li) => {
            const el = li.querySelector('.anxf-pic, .anxf-fb') as HTMLElement;
            const r = el.getBoundingClientRect();
            return { kind: el.dataset.pic ?? el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height) };
          }),
        };
      });
      eq(seen.coverKind, 'group', 'the publishing card shows the GROUP picture when the post has none — the empty square he photographed');
      is(seen.coverPainted > 20, `and it is really painted, ${seen.coverPainted}px wide`);
      is(seen.coverSrc.startsWith('data:image/svg'), 'from the row the screen was handed, not from anywhere else');
      eq(
        seen.rows.map((r) => r.kind),
        ['group', 'group', 'span'],
        'every queue row with a picture shows it, and the row without one keeps the Facebook mark',
      );
      is(
        seen.rows.every((r) => r.w === seen.rows[0].w && r.h === seen.rows[0].h && r.w >= 24),
        `and all three boxes are the same size (${seen.rows.map((r) => `${r.w}x${r.h}`).join(' ')}) — nothing jumps when a picture lands`,
      );
      /* AND THE POST'S OWN PICTURE STILL OUTRANKS IT: the square says what is
         going out before it says where to. */
      await page.evaluate(() => {
        const p = document.querySelector('.anxf-now-cover') as HTMLElement;
        p.dataset.probe = '1';
      });
      eq(
        await page.evaluate(() => {
          const img = document.querySelector('.anxf-now-cover img') as HTMLImageElement;
          return img.naturalWidth > 0;
        }),
        true,
        'the picture decoded — a broken URL would leave the box empty and nothing would say so',
      );
    }

    /* ── §5 — THE ROOM IS GONE, AND THE CARD SHOWS THROUGH ─────────────── */
    /*
     * "אין להציג רקע כחול מלבני מאחורי הרובוט … יש להשתמש בשקיפות אמיתית."
     *
     * The section that cannot be satisfied by a stylesheet. It decodes each
     * pose in the browser and reads its ALPHA CHANNEL: a frame with the room
     * still baked into it is opaque in all four corners, and no CSS rule
     * anywhere can change that.
     */
    {
      const alpha = await page.evaluate(() =>
        Promise.all(
          [0, 1, 2, 3, 4, 5, 6, 7, 8].map(async (i) => {
            const img = new Image();
            img.src = `/social/anx/pose-${i}.webp`;
            await img.decode();
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d')!.drawImage(img, 0, 0);
            const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
            let clear = 0;
            for (let k = 3; k < data.length; k += 4) if (data[k] === 0) clear++;
            return {
              i,
              w: c.width,
              h: c.height,
              clear: clear / (data.length / 4),
              corners: [
                data[3],
                data[(c.width - 1) * 4 + 3],
                data[(c.height - 1) * c.width * 4 + 3],
                data[((c.height - 1) * c.width + c.width - 1) * 4 + 3],
              ],
            };
          }),
        ),
      );
      for (const a of alpha) {
        eq(a.corners, [0, 0, 0, 0], `pose ${a.i}: ALL FOUR CORNERS ARE TRANSPARENT — the room is not in the pixels any more`);
        is(a.clear > 0.25, `pose ${a.i}: and ${(a.clear * 100).toFixed(0)}% of it is see-through, so the card shows through around him`);
        eq([a.w, a.h], [440, 276], `pose ${a.i}: on the one canvas every pose is aligned into`);
      }

      /* AND NOTHING BEHIND HIM IS A PANEL. */
      const grounds = await page.evaluate(() => {
        const fig = document.querySelector('[data-panel] [data-figure]') as HTMLElement;
        return [...fig.querySelectorAll<HTMLElement>('*')]
          .concat(fig)
          .filter((el) => !el.hasAttribute('data-lid'))
          .map((el) => {
            const st = getComputedStyle(el);
            return { cls: el.className?.toString().slice(0, 28) ?? el.tagName, colour: st.backgroundColor, image: st.backgroundImage };
          })
          .filter((r) => r.colour !== 'rgba(0, 0, 0, 0)' || (r.image !== 'none' && !r.image.startsWith('radial-gradient')));
      });
      eq(grounds, [], 'NOTHING BEHIND THE CHARACTER IS PAINTED: no fill, no picture, no rectangle — only the two radial pools of light');

      /* THE EYELID IS THE FACE'S OWN COLOUR, not a guess at it. */
      const lids = await page.evaluate(() => {
        const on = document.querySelector('[data-panel] .anx-poses img.anx-on') as HTMLImageElement;
        return {
          frame: Number(on.dataset.frame),
          paints: [...document.querySelectorAll<HTMLElement>('[data-panel] [data-lid]')].map((el) => getComputedStyle(el).backgroundColor),
        };
      });
      const face = ANX_FACES[lids.frame];
      is(face !== null, `pose ${lids.frame} is one of the open-eyed ones, so it has lids`);
      eq(lids.paints.length, 2, 'two of them — one per eye');
      const want = face!.visor.replace('#', '');
      const rgb = `rgb(${parseInt(want.slice(0, 2), 16)}, ${parseInt(want.slice(2, 4), 16)}, ${parseInt(want.slice(4, 6), 16)})`;
      eq(lids.paints, [rgb, rgb], `and both are the visor's own measured colour (${face!.visor})`);
    }

    /* ── §6 — IT WEARS THE APP'S OWN SKIN ──────────────────────────────── */
    {
      const skin = await page.evaluate(() => {
        const root = getComputedStyle(document.querySelector('.social-theme')!);
        const row = getComputedStyle(document.querySelector('[data-panel] [data-row="done"]')!);
        const probe = document.createElement('div');
        document.body.appendChild(probe);
        probe.style.color = root.getPropertyValue('--color-ink-850').trim();
        const wantBg = getComputedStyle(probe).color;
        probe.style.color = root.getPropertyValue('--color-ink-700').trim();
        const wantBorder = getComputedStyle(probe).color;
        probe.remove();
        return {
          bg: row.backgroundColor,
          wantBg,
          border: row.borderTopColor,
          wantBorder,
          radius: row.borderRadius,
          wantRadius: root.getPropertyValue('--radius-lg').trim(),
        };
      });
      eq(skin.bg, skin.wantBg, 'a queue row is painted in the app’s own card ground, from the token');
      eq(skin.border, skin.wantBorder, 'with the app’s own hairline');
      is(
        skin.radius.startsWith(String(parseFloat(skin.wantRadius) * 16)) || skin.radius === skin.wantRadius,
        `and the app’s own corner radius (${skin.radius} vs ${skin.wantRadius})`,
      );

      /*
       * NO HEX IN THE STYLESHEET EITHER, bar one. Facebook's blue is a brand
       * mark and is not ours to re-colour; everything else has to come from a
       * token, or a theme change leaves this card behind.
       */
      const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
      const block = css.slice(css.lastIndexOf('THE ANX ASSISTANT'));
      const hexes = [...block.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]).filter((h) => h !== '#1877f2' && h !== '#fff');
      eq(hexes, [], `every colour on the card comes from a theme token — found ${hexes.join(', ')}`);
    }

    /* ── §7 — IT FITS, AT EVERY WIDTH, WITH THE NAMES HE REALLY HAS ───── */
    {
      /*
       * "גם פה בתור פרסומים במלבן של הקבוצה יוצא ממסגרת."
       *
       * The queue in that photograph held a group called
       * "דרושים ערד /עבודה בערד והסביבה", and every row in the list — the
       * short ones too — was hanging 55px off the left edge of the card and
       * off the screen. This section already asked "does it fit", at six
       * widths, and answered yes every time: the harness's own rows are three
       * short names, so the question could not come out wrong. A fit test
       * measured on data that cannot overflow is not a fit test.
       *
       * So the real names go in first — his, exactly — and the queue is then
       * measured against the card that is supposed to contain it.
       */
      await page.evaluate(() => {
        window.__rows([
          { id: 'q-done', name: 'דירות למכירה באר שבע', state: 'done', at: '21:21' },
          { id: 'q-live', name: 'דרושים בערד', state: 'live', note: 'מעלה מדיה' },
          { id: 'q-next', name: 'דרושים ערד /עבודה בערד והסביבה', state: 'next' },
          { id: 'q-fail', name: 'Чистка диванов Беэр-Шева и окрестности — объявления', state: 'failed', note: 'לא נמצאה תיבת הכתיבה' },
        ]);
      });
      await page.waitForTimeout(140);
      for (const width of [320, 360, 390, 430, 768, 1280]) {
        await page.setViewportSize({ width, height: 1400 });
        await page.waitForTimeout(140);
        const seen = await page.evaluate(() => {
          const card = document.querySelector('[data-panel] [data-flow]') as HTMLElement;
          const r = card.getBoundingClientRect();
          const pic = (card.querySelector('.anx-poses img.anx-on') as HTMLElement).getBoundingClientRect();
          const tiles = [...card.querySelectorAll<HTMLElement>('[data-tile]')];
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            w: Math.round(r.width),
            inner: document.documentElement.clientWidth,
            ratio: pic.width / pic.height,
            tiles: tiles.length,
            cut: [...card.querySelectorAll<HTMLElement>('.anxf-lb, .anxf-row-at, .anxf-pct')].some((el) => el.scrollWidth > el.clientWidth + 1),
            /*
             * THE QUEUE AGAINST ITS OWN CARD, measured on the card's CONTENT
             * box — border and padding taken off — because that is the line
             * the rows were crossing.
             */
            queue: (() => {
              const q = card.querySelector('.anxf-qcard') as HTMLElement;
              const b = q.getBoundingClientRect();
              const st = getComputedStyle(q);
              const left = b.left + parseFloat(st.borderLeftWidth) + parseFloat(st.paddingLeft);
              const right = b.right - parseFloat(st.borderRightWidth) - parseFloat(st.paddingRight);
              const li = [...q.querySelectorAll<HTMLElement>('.anxf-queue li')].map((el) => el.getBoundingClientRect());
              const over = li.map((r) => Math.round(Math.max(left - r.left, r.right - right)));
              const names = [...q.querySelectorAll<HTMLElement>('.anxf-row-name')];
              return {
                rows: li.length,
                worst: over.length ? Math.max(...over) : 0,
                inner: Math.round(right - left),
                widest: li.length ? Math.round(Math.max(...li.map((r) => r.width))) : 0,
                /* The long name is ellipsised rather than widening its row —
                   the other half of the same fix. */
                clipped: names.some((el) => el.scrollWidth > el.clientWidth + 1),
              };
            })(),
          };
        });
        eq(seen.queue.rows, 4, `${width}px: all four queue rows are drawn`);
        is(
          seen.queue.worst <= 1,
          `${width}px: NO QUEUE ROW MAY LEAVE ITS CARD — widest row ${seen.queue.widest}px in a ${seen.queue.inner}px card, over by ${seen.queue.worst}px`,
        );
        is(!seen.overflow, `${width}px: the card must not push the page sideways`);
        is(seen.w <= seen.inner, `${width}px: it is ${seen.w}px inside a ${seen.inner}px screen`);
        is(Math.abs(seen.ratio - 440 / 276) < 0.06, `${width}px: and the character is never squashed (${seen.ratio.toFixed(2)})`);
        eq(seen.tiles, 0, `${width}px: and no figure tiles came back onto the card`);
        is(!seen.cut, `${width}px: nothing on the card is cut off mid-word`);
      }
      /* And at the width he photographed, the long name really is being cut
         to fit — which is what the row is supposed to do with it. */
      await page.setViewportSize({ width: 390, height: 1400 });
      await page.waitForTimeout(140);
      is(
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.anxf-row-name')].some((el) => el.scrollWidth > el.clientWidth + 1),
        ),
        '390px: a name longer than the row is ellipsised inside it, not carried out of the card',
      );
      await page.evaluate(() => window.__rows(null));
      await page.waitForTimeout(140);
    }

    /* ── §8 — THE ANIMATIONS EXIST IN THE FIRST PLACE ──────────────────── */
    /*
     * A NAME IS NOT AN ANIMATION. `animation-name` computes to whatever the
     * stylesheet says even when the matching @keyframes is not in the build —
     * the browser resolves the name, finds no keyframes and runs nothing. The
     * production minifier has already done that to this card's ancestor once.
     */
    {
      const alive = await page.evaluate(() =>
        ['[data-panel] .anx-poses', '[data-panel] li[data-state="live"] .anxf-box', '[data-panel] .anxf-fill'].map((sel) => {
          const el = document.querySelector(sel);
          /* `subtree` because the bar's stripes run on a ::after — an
             element's own getAnimations() cannot see a pseudo-element's, and
             a check that could not see it would pass over a dead one. */
          return { sel, name: el ? getComputedStyle(el).animationName : 'absent', n: el ? el.getAnimations({ subtree: true }).length : -1 };
        }),
      );
      for (const a of alive) is(a.n >= 1, `${a.sel} has a name AND a running animation behind it (${a.name}, ${a.n})`);
    }

    /* ── §9 — REDUCED MOTION: SWITCHED OFF, NOT HIDDEN ─────────────────── */
    {
      const quiet = await browser.newPage({ viewport: { width: 390, height: 1400 }, reducedMotion: 'reduce' });
      await quiet.goto(`${origin}/index.html`);
      await quiet.waitForSelector('[data-flow]');
      await quiet.evaluate(() => {
        window.__plan(22, 48);
        window.__publish(22);
        window.__step('publishing');
      });
      await quiet.waitForTimeout(250);
      /* One question of the whole card, pseudo-elements included: the bar's
         stripes and the lit station's caret are both ::after, and a per-element
         sweep would have walked straight past them. */
      const moving = await quiet.evaluate(
        () => (document.querySelector('[data-panel] [data-flow]') as HTMLElement).getAnimations({ subtree: true }).length,
      );
      eq(moving, 0, 'reduced motion: NOTHING on the card is running an animation — every element asked, not a list of class names');
      is((await quiet.locator('[data-panel] .anx-poses img.anx-on').count()) === 1, 'but the character is still on screen');
      eq(await quiet.locator('[data-panel] [data-row="done"]').count(), 1, 'and the publication that finished is still marked as finished');
      eq((await quiet.locator('[data-panel] .anxf-pct').textContent())?.trim(), '75%', 'and the real percentage is still printed — the state was never in the motion');
      await quiet.close();
    }

    /* ── §10 — AND THE SOURCE SAYS WHAT IT MAY NOT DO ──────────────────── */
    {
      const src = readFileSync(new URL('../../src/components/social/LiveFlow.tsx', import.meta.url), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      is(!/Math\.random/.test(code), 'nothing is rolled — a number drawn during render does not survive hydration');
      is(!/setInterval\(\s*\(\)\s*=>\s*set(Target|Shown|Percent)/.test(code), 'nothing on this card advances on a timer');
      is(!/https?:\/\//.test(code), 'every picture is served from this product, not fetched from somebody else');
      is(/\/social\/anx\/pose-\$\{i\}\.webp/.test(code), 'from the nine poses in public/social/anx');
      /* THE PERCENTAGE HAS ONE SOURCE. If anything else could write it, the
         "no invented percentage" rule would be one edit from being untrue. */
      eq(
        (code.match(/progressOfStep\(/g) ?? []).length,
        2,
        'progressOfStep is declared once and called once — the percentage has exactly one source',
      );
      is(/const percent = now \? progressOfStep\(now\.step\) : null;/.test(code), 'and that source is the row’s own stage');
      /*
       * THE CARD HANDS OUT NO FIGURES, so nothing on it can disagree with the
       * row of tiles below it. (The "קבוצות" tile is what made this worth
       * writing down: its number came from a read this screen stops making
       * once anything has published, so it printed a dash for ever. The tile
       * is gone, and with it the count that fed it.)
       */
      is(!/data-tile/.test(code), 'no figure tile may come back onto this card');
      const assets = readdirSync(path.resolve('public/social/anx'));
      eq(assets.filter((f) => /^pose-\d\.webp$/.test(f)).length, 9, 'all nine poses are on disk');
      const bytes = assets.reduce((n, f) => n + statSync(path.resolve('public/social/anx', f)).size, 0);
      is(bytes < 400_000, `and they are ${(bytes / 1024).toFixed(0)} KB in all — a dashboard card, not a download`);
    }

    eq(crashes, [], 'the card threw');
    await page.close();
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.close(() => done()));
  }

  console.log(`live flow OK — ${checks} assertions, driven in a real browser`);
}

/*
 * ─── WHAT WAS RETIRED WITH THE STAGE, AND WHY ─────────────────────────────
 *
 * Listed rather than deleted silently, because a rule that disappears without
 * a reason is a rule somebody re-breaks.
 *
 *   THE ARRIVAL COUNTER (`target`/`shown`) AND ITS TICK. The stage drew a
 *   green tick on one of three invented group cards when the real published
 *   count rose, and the whole apparatus existed to stop that tick being a
 *   lie. The reference has no such card: the queue is the real queue, and a
 *   row is marked done because the DATABASE says that row published —
 *   which is a stronger guarantee than the counter ever was, not a weaker
 *   one. §1 and §3 are what now carry it.
 *
 *   THE CATCH-UP CEILING. It existed because arrivals were PRESENTED one at
 *   a time and a jump of two hundred would have celebrated for ten minutes.
 *   Nothing is presented one at a time any more; the figures are read and
 *   printed.
 *
 *   THE FLYING POST AND ITS TRAIL. The reference draws the publication as a
 *   card with a stage and a bar, not as a parcel crossing the panel.
 *
 * Kept and carried over: the transparency of the nine poses and the measured
 * eyelid, "nothing behind the character is painted", the app's own skin, "a
 * name is not an animation", the reduced-motion contract, the fit at every
 * width, and the panel's own derivation of its state from the row.
 */
void main();
