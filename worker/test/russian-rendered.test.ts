/*
 * ─── WHAT IS ACTUALLY PAINTED, AFTER THE SWITCH ───────────────────────────
 *
 * "התוכנה לא עוברת לרוסית מלאה שמשנים עדיין יש כפתורים והרבה דברים בעברית."
 *
 * He has now said a version of this three times, and each time I had a guard
 * that passed. The guards were measuring the SOURCE: every Hebrew literal and
 * every `${}` shape in the files has a Russian answer, and
 * russian-coverage.test.ts proves it. That is true and it was not enough,
 * because the screens build sentences at RUNTIME out of pieces:
 *
 *     `${counted(n, 'טופל', 'טופלו')}${todayOnly ? ' היום' : ''}`
 *     [`פורסם ל-${a} מתוך ${b} קבוצות`, `${c} דולגו`].join(' · ')
 *
 * Neither "טופלו היום" nor the joined line exists anywhere in the source, so
 * no source guard can see them — and on screen they were Hebrew. Worse, one
 * thin pattern matched a joined line and printed Hebrew and Russian
 * interleaved inside one sentence.
 *
 * SO THIS READS THE SCREEN. Twenty screens are rendered in Russian in a real
 * browser and every text node and label is examined. Two things fail it:
 *
 *   · a node with Hebrew left in it that is not the customer's own data
 *   · a node holding Hebrew AND Russian at once, which is always a bug —
 *     either a stolen sentence or a half-translated one
 *
 * WHAT COUNTS AS THE CUSTOMER'S OWN DATA is not a hand-written list that
 * could quietly grow to cover a real miss. It is read out of the fixtures:
 * a group called "קבוצה 12" and a campaign called "ניקוי ספות באר שבע" are
 * Hebrew literals in worker/test/mount-*.tsx and render-*.tsx, and they are
 * meant to stay Hebrew exactly as a real group name would. A string that is
 * also a dictionary key is NOT data, however it got there, so a fixture
 * cannot launder a UI caption into the allowlist.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { translatedKeys } from '../../src/lib/social/i18n';

const NAME = 'russian rendered';
let checks = 0;
const is = (c: unknown, what: string) => {
  checks += 1;
  assert.ok(c, what);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};

const HEBREW = /[֐-׿]/;
const CYRILLIC = /[Ѐ-ӿ]/;

const FIXTURES = ['auth', 'cycle', 'frozen', 'picker', 'pull', 'scene', 'schedule', 'swiper', 'tile', 'timepick', 'toggle'];
const SNAPSHOTS = [
  'render-dash',
  'render-hero',
  'render-stats',
  'render-card',
  'render-discovery',
  'render-discover-top',
  'render-comment-timeline',
  'render-quick-comments',
  'render-rounds',
];

/*
 * A single Hebrew letter is an avatar initial, drawn from a name. A name is
 * data, so its first letter is data too, and there is nothing to translate.
 */
const isInitial = (s: string) => /^[֐-׿]$/.test(s);

/*
 * Two strings that must never be translated and are not fixture data: the
 * product's name, and the word "עברית" on the language switch — a language is
 * named in its own language, which is how somebody who cannot read Russian
 * finds the way back.
 */
const NEVER_TRANSLATED = new Set(['הפתרון המבריק', 'עברית']);

/** The shapes of names the fixtures build around a value. */
const shapes: RegExp[] = [];

/** Every Hebrew literal in the fixtures, dictionary word or not. */
const everyFixtureString = new Set<string>();

/** Every Hebrew literal the fixtures feed in as data. */
function fixtureData(): Set<string> {
  const keys = new Set(translatedKeys());
  const out = new Set<string>();
  for (const name of readdirSync(path.resolve('worker/test'))) {
    if (!/^(mount|render)-.*\.tsx?$/.test(name)) continue;
    const file = path.resolve('worker/test', name);
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const keep = (text: string) => {
      const t = text.replace(/\s+/g, ' ').trim();
      if (!t || !HEBREW.test(t)) return;
      everyFixtureString.add(t);
      /* A string the dictionary answers is UI text, not data — whichever file
         it appears in. This is what stops a fixture from laundering a caption
         into the allowlist. */
      if (!keys.has(t)) out.add(t);
    };
    const visit = (n: ts.Node): void => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) keep(n.text);
      else if (ts.isJsxText(n)) keep(n.text);
      /*
       * `קבוצה ${i}` — a name a fixture builds out of a stem and a number.
       * The stem on its own cannot go in the literal list: "קבוצה" is also a
       * dictionary word, and striking every occurrence of it would hide a
       * real untranslated caption. So the SHAPE is kept instead, and only a
       * stem followed by a value is treated as a name.
       */
      else if (ts.isTemplateExpression(n)) {
        const parts = [n.head.text, ...n.templateSpans.map((sp) => sp.literal.text)];
        if (parts.some((x) => HEBREW.test(x))) {
          const body = parts
            .map((x) => x.replace(/\s+/g, ' ').trim())
            .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .filter(Boolean)
            .join('\\s*[^·|]{1,40}?\\s*');
          if (body) shapes.push(new RegExp(body));
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return out;
}

const DATA = fixtureData();

/**
 * Removes every piece of the customer's own data from a line, so that what is
 * left is the app's own words. Longest first, or a short name would be taken
 * out of the middle of a longer one and leave debris behind.
 */
const DATA_SORTED = [...DATA].sort((a, b) => b.length - a.length);
function stripData(line: string, everything = false): string {
  let out = line;
  const list = everything ? [...everyFixtureString].sort((a, b) => b.length - a.length) : DATA_SORTED;
  for (const d of list) {
    if (d.length < 2) continue;
    while (out.includes(d)) out = out.replace(d, ' ');
  }
  for (const n of NEVER_TRANSLATED) {
    while (out.includes(n)) out = out.replace(n, ' ');
  }
  for (const shape of shapes) {
    for (let i = 0; i < 40 && shape.test(out); i += 1) out = out.replace(shape, ' ');
  }
  return out;
}

/*
 * ─── A LINE MADE ONLY OF THE CUSTOMER'S OWN STRINGS ───────────────────────
 *
 * "קבוצה 10 — באר שבע" is a group's name and its city, joined for a screen
 * reader. Both halves are the fixture's own data — in production both would
 * be whatever the customer's group is really called — so there is nothing in
 * that line for the app to say. It is reported anyway by the rule above,
 * because "באר שבע" is ALSO a dictionary word: it labels a city filter, and a
 * dictionary word cannot be allowlisted or a real caption could hide behind
 * it.
 *
 * So the first pass keeps that rule, and a line that still looks untranslated
 * gets a second pass that strips every fixture string, dictionary word or
 * not. If nothing of the app's own is left, the line was data end to end.
 */
function isAllFixtureData(line: string): boolean {
  return !HEBREW.test(stripData(line, true));
}

type Seen = { text: string; screens: Set<string> };

async function main(): Promise<void> {
  const { build } = await import('esbuild');
  const { mkdtempSync, statSync, writeFileSync, copyFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { chromium } = await import('playwright-core');

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
    console.log(`${NAME} OK — ${checks} assertions (SKIPPED — run \`npm run build\` first)`);
    return;
  }

  is(DATA.size > 20, `the fixtures' own data was read — ${DATA.size} strings that are allowed to stay Hebrew`);

  const dir = mkdtempSync(path.join(tmpdir(), 'rurender-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  const common = {
    bundle: true as const,
    format: 'iife' as const,
    keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: {
      'next/navigation': path.resolve('worker/test/stubs/next-navigation.ts'),
      '@/lib/social/auth': path.resolve('worker/test/stubs/social-auth.ts'),
      '@': path.resolve('src'),
    },
    logLevel: 'silent' as const,
  };
  await build({
    entryPoints: [path.resolve('worker/test/mount-lang-shim.tsx')],
    outfile: path.join(dir, 'm.js'),
    jsx: 'automatic',
    ...common,
  });
  await build({
    entryPoints: [path.resolve('worker/test/mount-lang-static.ts')],
    outfile: path.join(dir, 'lang.js'),
    ...common,
  });
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<link rel="stylesheet" href="app.css"><body class="social-theme"><div id="root"></div><script src="m.js"></script></body></html>`,
  );
  for (const r of SNAPSHOTS) {
    const html = execFileSync('npx', ['tsx', `worker/test/${r}.tsx`], { encoding: 'utf8', maxBuffer: 32 << 20 });
    writeFileSync(
      path.join(dir, `${r}.html`),
      html.includes('</body>')
        ? html.replace('</body>', '<script src="lang.js"></script></body>')
        : `${html}<script src="lang.js"></script>`,
    );
  }

  /* Every text node, and the three attributes a person can actually read. */
  const PROBE = `(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const tag = n.parentNode && n.parentNode.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      const t = (n.nodeValue || '').replace(/\\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    for (const el of document.querySelectorAll('[placeholder],[aria-label],[title]')) {
      for (const a of ['placeholder', 'aria-label', 'title']) {
        const v = (el.getAttribute(a) || '').replace(/\\s+/g, ' ').trim();
        if (v) out.push(v);
      }
    }
    return out;
  })()`;

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
  });
  const leftInHebrew = new Map<string, Seen>();
  const halfTranslated = new Map<string, Seen>();
  const crashed: string[] = [];
  let screens = 0;

  try {
    /* One tall window: this suite is about words, not boxes — russian-layout
       covers the boxes at six widths. */
    const page = await browser.newPage({ viewport: { width: 430, height: 1400 } });
    page.on('pageerror', (e) => crashed.push(String(e).slice(0, 140)));

    const note = (map: Map<string, Seen>, text: string, screen: string) => {
      if (!map.has(text)) map.set(text, { text, screens: new Set() });
      map.get(text)!.screens.add(screen);
    };

    const examine = (lines: string[], screen: string) => {
      for (const line of lines) {
        if (!HEBREW.test(line)) continue;
        const rest = stripData(line);
        if (!HEBREW.test(rest)) continue;
        if (isInitial(line)) continue;
        if (isAllFixtureData(line)) continue;
        if (CYRILLIC.test(line)) note(halfTranslated, line, screen);
        else note(leftInHebrew, line, screen);
      }
    };

    for (const m of FIXTURES) {
      await page.goto(`file://${path.join(dir, 'index.html')}?m=${m}&lang=ru`);
      await page.waitForFunction('window.__langReady === true', null, { timeout: 20000 });
      await page.waitForTimeout(250);
      examine((await page.evaluate(PROBE)) as string[], m);
      screens += 1;
    }
    for (const r of SNAPSHOTS) {
      await page.goto(`file://${path.join(dir, `${r}.html`)}?lang=ru`);
      await page.waitForFunction('window.__langReady === true', null, { timeout: 20000 });
      await page.waitForTimeout(150);
      examine((await page.evaluate(PROBE)) as string[], r);
      screens += 1;
    }
    await page.close();
  } finally {
    await browser.close();
  }

  is(screens === FIXTURES.length + SNAPSHOTS.length, `every screen was read — ${screens}`);
  eq(crashed, [], 'no screen throws with the translator over it');

  const show = (map: Map<string, Seen>) =>
    [...map.values()]
      .sort((a, b) => b.text.length - a.text.length)
      .map((s) => `${JSON.stringify(s.text.slice(0, 110))}  ←  ${[...s.screens].join(', ')}`);

  /* The interleaved kind first: it is the one a person reads as broken. */
  eq(show(halfTranslated), [], 'no line holds Hebrew and Russian at once — that is a stolen or half-translated sentence');
  eq(show(leftInHebrew), [], 'no line of the app’s own words is still in Hebrew after the switch');

  console.log(`${NAME} OK — ${checks} assertions over ${screens} screens read in Russian`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
