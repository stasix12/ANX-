import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { searchGroups } from '../facebook/discover';

/**
 * THE GROUP SEARCH, DRIVEN AGAINST A FAKE FACEBOOK THAT LAZY-LOADS ITS
 * PICTURES — because that is the only thing the real failure depends on.
 *
 * The owner has reported the same sentence twice: "קבוצות שאני לא חבר בהם
 * עדיין לא מראה תמונה". The first fix taught the card reader to look in
 * `currentSrc`, in `srcset`, in an `<svg><image>` and in a CSS background. All
 * of that was true, none of it helped, and the reason is not in the reader at
 * all: on the cards that matter there is nothing in any of those places AT THE
 * MOMENT THEY ARE READ.
 *
 * Facebook loads a card's thumbnail when the card reaches the viewport. The
 * collecting loop scrolls two screenfuls at a time for speed, so a card in the
 * skipped middle screen is in the DOM — name, member count and buttons all
 * read correctly — and never rests where the browser would decide to load its
 * picture. The groups he is NOT in sit further down a long list of results,
 * which is exactly why it was those rows, and only those rows, that drew a
 * letter.
 *
 * None of that can be seen from the source. It needs a page that behaves like
 * the real one: an IntersectionObserver that swaps a placeholder for the real
 * address, the same way Facebook's own does. This file builds one, and the
 * pictures are served over real HTTP because `page.request` does not go
 * through Playwright's page routes — a fake host would quietly exercise a
 * different path from the one the worker uses.
 *
 *   npx tsx worker/test/discover-pictures.test.ts
 */
function findChromium(): string | undefined {
  if (process.env.SOCIAL_BROWSER_EXECUTABLE) return process.env.SOCIAL_BROWSER_EXECUTABLE;
  if (process.env.PLAYWRIGHT_CHROMIUM && existsSync(process.env.PLAYWRIGHT_CHROMIUM)) return process.env.PLAYWRIGHT_CHROMIUM;
  if (existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium')).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const candidate = path.join(root, dir, rel);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * A real PNG, built here and served over real HTTP so the fetch path is the
 * real one — and 64x64 rather than a few pixels on purpose. fetchPictures
 * refuses anything under 120 bytes as a sanity check, and a one-pixel fixture
 * fails that floor rather than the thing under test: the first run of this
 * file downloaded all twelve and reported none, for that reason alone.
 */
function png(): Buffer {
  const size = 64;
  const chunk = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const at = row + 1 + x * 3;
      /* Not flat: a solid colour compresses to almost nothing and would walk
         straight back into the size floor this comment is about. */
      raw[at] = (x * 7 + y * 13) & 0xff;
      raw[at + 1] = (x * 29) & 0xff;
      raw[at + 2] = (y * 31) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

const PNG = png();

/** What a card's <img> holds until the browser decides to load it. */
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const COUNT = 12;
/** Tall enough that two cards fill the window, so a two-screen scroll skips a
    whole screenful of them — which is the bug. */
const CARD_PX = 400;

function searchPage(origin: string): string {
  const cards = Array.from({ length: COUNT }, (_, i) => {
    const id = `10000000000000${i + 10}`;
    return (
      `<div class="card" style="height:${CARD_PX}px;border-bottom:1px solid #ccc" data-real="${origin}/img/${i}.png">` +
      `<a href="/groups/${id}/"><img class="pic" width="60" height="60" src="${PLACEHOLDER}"></a>` +
      `<a href="/groups/${id}/"><span>באר שבע — קבוצה ${i + 1}</span></a>` +
      `<div>${(i + 1) * 7} חברים · קבוצה ציבורית</div>` +
      `<div role="button">הצטרפות</div>` +
      '</div>'
    );
  }).join('');
  return (
    '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>Facebook</title>' +
    '<style>body{margin:0;font:16px sans-serif}</style></head><body>' +
    cards +
    /*
     * FACEBOOK'S OWN BEHAVIOUR, in six lines: the address is on the card and
     * only reaches the <img> once the card has been in the viewport. Nothing
     * else in this page is lazy — the names, the member counts and the buttons
     * are all present from the first byte, which is precisely why the search
     * read everything about these groups EXCEPT their pictures.
     */
    '<script>' +
    'var io=new IntersectionObserver(function(es){es.forEach(function(e){' +
    'if(!e.isIntersecting)return;' +
    'var img=e.target.querySelector("img.pic");' +
    'if(img&&img.getAttribute("src").indexOf("data:")===0)img.setAttribute("src",e.target.getAttribute("data-real"));' +
    'io.unobserve(e.target);});});' +
    'document.querySelectorAll(".card").forEach(function(c){io.observe(c)});' +
    '</script></body></html>'
  );
}

async function main(): Promise<void> {
  const executablePath = findChromium();
  if (!executablePath) {
    console.log('discover picture test SKIPPED — no Chromium found');
    return;
  }

  const server = createServer((req, res) => {
    if ((req.url ?? '').startsWith('/img/')) {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(PNG);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  const html = searchPage(origin);

  const browser = await chromium.launch({ executablePath });
  let checks = 0;
  try {
    /* 800 tall and 400px cards: two per screen, and the collecting loop's
       two-screen jump leaves a whole screenful never resting in view. */
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    /*
     * THE SAME ONE LINE session.ts PUTS ON EVERY WORKER CONTEXT, and the test
     * is wrong without it rather than stricter. esbuild keeps function names,
     * so a `const f = () => …` inside page.evaluate ships to the browser
     * carrying a call to a helper that stayed in Node; the worker defines the
     * helper in the page instead. A context built without it fails every
     * evaluate in this file for a reason that has nothing to do with pictures
     * — which is exactly what it did on the first run of this test, and is why
     * the line is here with its name on it.
     */
    await context.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' });
    await context.route('https://www.facebook.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
    );
    const page = await context.newPage();

    const out = await searchGroups(page, 'באר שבע');

    /*
     * THE FLOOR FIRST. Every assertion below is about pictures, and all of
     * them pass trivially on a search that returned nothing — which is how a
     * page.evaluate that throws (the __name hazard this suite has met before)
     * would look.
     */
    checks += 1;
    assert.equal(out.groups.length, COUNT, `the search read ${out.groups.length} of ${COUNT} cards — nothing below is measuring pictures`);
    checks += 1;
    assert.equal(out.problem, '', `the search reported a problem: ${out.problem}`);

    /*
     * AND THE THING THE OWNER IS LOOKING AT. Not "most of them", not "the ones
     * near the top": every card on this page has a picture and the search is
     * on a page where nothing is hidden from it.
     */
    const letters = out.groups.filter((g) => !/^https?:\/\//i.test(g.image));
    checks += 1;
    assert.deepEqual(
      letters.map((g) => g.name),
      [],
      `${letters.length} of ${COUNT} groups came back with no picture address — these are the rows that draw a purple letter`,
    );
    checks += 1;
    assert.equal(out.pictureless, 0, `the search itself reports ${out.pictureless} groups it could not find a picture for`);

    /* Downloaded, not merely addressed: the bytes have to arrive and be an
       image, which is what the caller stores. */
    checks += 1;
    assert.equal(
      out.pictures.size,
      COUNT,
      `${out.pictures.size} of ${COUNT} pictures actually downloaded — an address that cannot be fetched is still a letter on screen`,
    );
    for (const g of out.groups) {
      checks += 1;
      const pic = out.pictures.get(g.externalId);
      assert.ok(pic && pic.bytes.length > 0 && /^image\//.test(pic.contentType), `no bytes for "${g.name}"`);
    }

    await page.close();
    await context.close();
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  console.log(`discover picture tests OK — ${checks} assertions over ${COUNT} lazy-loaded cards`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
