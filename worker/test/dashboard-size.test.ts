/*
 * THE DASHBOARD, MEASURED — the bar the reference draws, and the height brief.
 *
 * "מצורפת תמונת רפרנס המציגה את העיצוב החדש של לוח הבקרה … יש לצמצם את השטח
 *  האנכי של לוח הבקרה בכ־20%–30% ככל שניתן, בלי לפגוע בקריאות או בנוחות
 *  השימוש."
 *
 * Two claims, and neither could be checked before this file existed: nothing
 * in worker/test/ rendered SocialShell's header (it needs a Supabase session
 * and an app router) and nothing measured the dashboard's column at all.
 *
 * WHAT IS MEASURED HERE is worker/test/render-dash.tsx: the real IdentityBar,
 * the real action buttons, the real StatStrip and the real LiveQueueHero, in
 * the order src/app/social/page.tsx renders them, inside the same <main> the
 * shell wraps them in. Fixture DATA, shipped COMPONENTS — a hand-written copy
 * of the markup would stop failing the moment the components changed.
 *
 * THE HEIGHT NUMBER IS A CEILING, NOT A TARGET. It is the one shape of
 * assertion that can survive content changing: the column may hold more rows
 * tomorrow, and a test that demanded an exact height would be rewritten every
 * time instead of catching the padding creeping back. The ceiling below was
 * set from the measurement taken when the compaction landed, with the head
 * room named in the comment beside it.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

let checks = 0;
const is = (ok: boolean, claim: string) => {
  checks += 1;
  assert.ok(ok, claim);
};
const eq = <T>(got: T, want: T, claim: string) => {
  checks += 1;
  assert.deepStrictEqual(got, want, claim);
};

/* ── 1. the fixture may not drift from the screen it stands in for ───────── */
const page = readFileSync('src/app/social/page.tsx', 'utf8');
const shell = readFileSync('src/components/social/SocialShell.tsx', 'utf8');
const fixture = readFileSync('worker/test/render-dash.tsx', 'utf8');

{
  /*
   * The fixture hard-codes three class strings that belong to the page and the
   * shell — the column's stack gap, the action buttons' padding override and
   * <main>'s own padding. Each is pinned to its source here, so a compaction
   * undone in the product cannot keep passing in the harness.
   */
  const column = /const COLUMN = '([^']+)'/.exec(fixture)?.[1];
  const btn = /const BTN = '([^']+)'/.exec(fixture)?.[1];
  const main = /const MAIN = '([^']+)'/.exec(fixture)?.[1];
  is(Boolean(column && btn && main), 'the fixture declares the three classes it borrows');
  is(page.includes(`<div className="${column}">`), `the dashboard column is still "${column}" in page.tsx`);
  is(page.includes(`className="${btn}"`), `the action buttons still carry "${btn}" in page.tsx`);
  is(shell.includes(main!.replace('crm-page mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 ', '').trim()), 'and <main> still carries the dashboard padding the fixture renders');
}

async function main(): Promise<void> {
  /* ── 2. the bar the reference draws, in a browser ────────────────────────── */
  const CH = path.resolve('.next/static/chunks');
  if (!existsSync(CH)) {
    console.log('dashboard size SKIPPED — no .next build to take the stylesheet from (run `npm run build`)');
    return;
  }
  let best: { file: string; size: number } | null = null;
  for (const n of readdirSync(CH)) {
    if (!n.endsWith('.css')) continue;
    const f = path.join(CH, n);
    const size = statSync(f).size;
    if (!best || size > best.size) best = { file: f, size };
  }
  assert.ok(best, 'the build must contain a stylesheet');

  const dir = mkdtempSync(path.join(tmpdir(), 'dash-'));
  copyFileSync(best!.file, path.join(dir, 'app.css'));
  writeFileSync(path.join(dir, 'index.html'), execFileSync('npx', ['tsx', 'worker/test/render-dash.tsx'], { encoding: 'utf8', maxBuffer: 16 << 20 }));

  const TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    /* The robot's nine poses are real files in public/ — the banner's height
       depends on them, so they are served rather than 404ed. */
    const file = url.startsWith('/social/') ? path.resolve('public' + url) : path.join(dir, path.basename(url) || 'index.html');
    if (!existsSync(file)) return res.writeHead(404).end('no');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /*
   * THE CEILING, PER WIDTH.
   *
   * Measured when this landed: 737 / 725 / 749 at 390 / 360 / 430, against
   * 843 / 831 / 855 before it. The allowance below is ~4% of head room — enough
   * that a line of Hebrew rewrapping does not fail the suite, tight enough that
   * a padding class put back does.
   */
  const CEILING: Record<number, number> = { 360: 756, 390: 768, 430: 781 };

  for (const width of [360, 390, 430]) {
    const view = await browser.newPage({ viewport: { width, height: 1800 }, deviceScaleFactor: 1 });
    await view.goto(`http://127.0.0.1:${port}/index.html`);
    await view.waitForSelector('header');
    await view.waitForTimeout(250);

    /*
     * NOT ONE NAMED ARROW IN HERE, and that is not a style choice.
     *
     * esbuild bundles this file with keepNames on, which instruments every
     * named function expression — `const box = (el) => …` becomes
     * `__name(box, 'box')` — and __name does not exist inside the page. The
     * whole evaluate throws "ReferenceError: __name is not defined" before a
     * single assertion runs. Everything below is inline or an anonymous arrow
     * passed straight to .map, which esbuild leaves alone.
     */
    const read = await view.evaluate(() => {
      const header = document.querySelector('header') as HTMLElement;
      const card = header.querySelector(':scope > div') as HTMLElement;
      const main = document.querySelector('[data-main]') as HTMLElement;
      const title = header.querySelector('[data-bar-title]');
      const pill = header.querySelector('[data-state-pill]');
      /* Every control in the bar, so the touch floor is hit-tested rather than
         trusted to a class name. */
      const controls = [...header.querySelectorAll(':scope > div > a, :scope > div > button, :scope > div > div > button')].map((el) => ({
        tag: el.tagName.toLowerCase(),
        h: Math.round(el.getBoundingClientRect().height),
        w: Math.round(el.getBoundingClientRect().width),
      }));
      return {
        header: Math.round(header.getBoundingClientRect().height),
        card: Math.round(card.getBoundingClientRect().height),
        total: Math.round(header.getBoundingClientRect().height) + Math.round(main.getBoundingClientRect().height),
        title: (title?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        pill: (pill?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        pillClass: pill?.className ?? '',
        rules: header.querySelectorAll(':scope > div > span[aria-hidden]').length,
        controls,
        /* The one defect that makes a phone screen unusable, and the brief
           names it: "ודא התאמה מלאה למובייל ו־RTL". */
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dir: document.documentElement.getAttribute('dir'),
        /* The bar must be white on the page's own ground, not a full-bleed strip. */
        headerBg: getComputedStyle(header).backgroundColor,
        cardBg: getComputedStyle(card).backgroundColor,
        cardRadius: getComputedStyle(card).borderTopRightRadius,
      };
    });

    const at = `at ${width}px`;

    /* ── the reference's own arrangement ─────────────────────────────────── */
    eq(read.title, 'לוח בקרה', `${at}: the bar prints the screen's name where the greeting was`);
    eq(read.pill, 'המערכת פעילה', `${at}: and the system state under it, as the reference draws it`);
    is(read.rules === 3, `${at}: three hairlines separate the four groups — found ${read.rules}`);
    is(read.cardBg === 'rgb(255, 255, 255)' || read.cardBg.startsWith('rgb(255, 255, 255'), `${at}: the card is white — got ${read.cardBg}`);
    is(read.headerBg !== read.cardBg, `${at}: and the strip behind it is the page, not a second white bar`);
    is(parseFloat(read.cardRadius) >= 14, `${at}: the card is a rounded card, not a square bar — radius ${read.cardRadius}`);

    /* ── the state pill is the tone map, not a painted-on green ──────────── */
    is(/text-success-400/.test(read.pillClass), `${at}: an active system gets the success tone`);
    is(/bg-success-400\/12/.test(read.pillClass), `${at}: on this module's own tint for it`);

    /* ── usability, which the brief puts ahead of the pixels ─────────────── */
    eq(read.dir, 'rtl', `${at}: the page is RTL`);
    eq(read.overflow, 0, `${at}: nothing pushes the page sideways`);
    for (const c of read.controls) {
      is(c.h >= 40 && c.w >= 40, `${at}: every control in the bar meets the 40px floor — ${c.tag} is ${c.w}×${c.h}`);
    }

    /* ── and the height the brief is about ───────────────────────────────── */
    is(
      read.total <= CEILING[width],
      `${at}: the dashboard's bar + column is ${read.total}px, over the ${CEILING[width]}px ceiling the compaction set`,
    );
    is(read.card <= 56, `${at}: the bar's card is ${read.card}px — the reference's is about 50`);

    await view.close();
  }

  await browser.close();
  server.close();

  console.log(`dashboard size OK — ${checks} assertions, measured in a real browser at 360/390/430`);
}

void main();
