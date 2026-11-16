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
 * SO THIS READS THE SCREEN. Forty-one screens are rendered in Russian in a
 * real browser and every text node and label is examined. Two things fail
 * it:
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
  /* and the twenty-one screens nothing read until now — see russian-layout
     for what each one prints and why that shape. */
  'render-post-editor',
  'render-media-uploader',
  'render-post-preview',
  'render-quick-publish-sheet',
  'render-queue-tuner-sheet',
  'render-schedule-picker',
  'render-pre-launch-review',
  'render-start-from-library',
  'render-activity-feed',
  'render-activity-detail-sheet',
  'render-timeline',
  'render-campaign-comment-sheet',
  'render-campaign-progress-bar',
  'render-campaign-reach',
  'render-queue-sections',
  'render-live-board',
  'render-pair-worker-card',
  'render-profile-upload-card',
  'render-setup-checklist',
  'render-content-card',
  'render-group-card',
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

/*
 * ─── A DICTIONARY WORD CAN ALSO BE A CUSTOMER'S OWN NAME ──────────────────
 *
 * The second pass below used to strip EVERY Hebrew literal any fixture holds,
 * dictionary word or not. That was safe while the fixtures were eleven mounts
 * and nine snapshots whose Hebrew was almost all data: 34 of their literals
 * were dictionary sentences. It stopped being safe the moment the fixtures
 * started printing whole screens. A fixture that draws the publish-now sheet
 * has to quote that sheet's own warnings to draw it, and twenty-one such
 * fixtures quote 309 dictionary sentences between them — 299 of them new,
 * and they are the longest and most important sentences in the product
 * ("המערכת לא שולחת את אותו פוסט פעמיים לאותה קבוצה…", the whole test-mode
 * notice, every ceiling warning). Strippable, every one of them would have
 * been: if any of those had stayed Hebrew on a Russian screen, this suite
 * would have called the line "the customer's own data" and passed it.
 *
 * SO POSITION DECIDES, NOT PRESENCE. The motivating case is a value that
 * happens to collide with a caption — a group really called "באר שבע ביחד",
 * a city "באר שבע" that is also a city filter's label — and a value arrives
 * in a fixture through a FIELD. These are the fields that carry the
 * customer's own words in this product, and a dictionary sentence sitting in
 * `title`, `label`, `hint` or plain JSX text is not reachable by any of them.
 * A long free-text field (base_text, skip_reason, a comment) is not here on
 * purpose: prose is never a dictionary key, and if one ever collides this
 * suite should fail loudly and let somebody look, not quietly allow it.
 */
const DATA_FIELDS = new Set([
  'name',
  'city',
  'cityLabel',
  'query',
  'normalized',
  'category',
  'categoryName',
  'campaignName',
  'nextTargetName',
  'targetName',
  'pageName',
  'postTitle',
]);

/** Hebrew literals the fixtures pass through one of those fields. */
const dataFieldWords = new Set<string>();

/**
 * The field a literal arrives through, or null when it arrives as text. The
 * walk stops at a call, a declaration or an element, because those are
 * contexts of their own: reading through them would let `h(Card, { title })`
 * borrow the name of whatever object happened to hold the call.
 */
function dataField(n: ts.Node): string | null {
  let p: ts.Node | undefined = n.parent;
  for (let i = 0; i < 4 && p; i += 1) {
    if (ts.isPropertyAssignment(p)) {
      const nm = p.name;
      return ts.isIdentifier(nm) || ts.isStringLiteral(nm) ? nm.text : null;
    }
    if (ts.isJsxAttribute(p)) return ts.isIdentifier(p.name) ? p.name.text : null;
    if (ts.isCallExpression(p) || ts.isVariableDeclaration(p) || ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) {
      return null;
    }
    p = p.parent;
  }
  return null;
}

/** Every sentence the dictionary answers — a caption, never data. */
const KEYS = new Set(translatedKeys());

/** Every Hebrew literal the fixtures feed in as data. */
function fixtureData(): Set<string> {
  const keys = KEYS;
  const out = new Set<string>();
  for (const name of readdirSync(path.resolve('worker/test'))) {
    if (!/^(mount|render)-.*\.tsx?$/.test(name)) continue;
    const file = path.resolve('worker/test', name);
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const keep = (node: ts.Node, text: string) => {
      const t = text.replace(/\s+/g, ' ').trim();
      if (!t || !HEBREW.test(t)) return;
      const field = ts.isJsxText(node) ? null : dataField(node);
      if (field && DATA_FIELDS.has(field)) dataFieldWords.add(t);
      /* A string the dictionary answers is UI text, not data — whichever file
         it appears in. This is what stops a fixture from laundering a caption
         into the allowlist. */
      if (!keys.has(t)) out.add(t);
    };
    const visit = (n: ts.Node): void => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) keep(n, n.text);
      else if (ts.isJsxText(n)) keep(n, n.text);
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

/*
 * ─── THE OPT-OUT IS PINNED, OR IT WOULD BECOME A WAY TO PASS ──────────────
 *
 * This suite skips everything inside [data-no-translate], which is correct —
 * it is the owner's own post text — and is also exactly how somebody would
 * silence a real miss: put the attribute on the caption and the suite stops
 * reading it. So the call sites are listed by file and line. A fourth one
 * fails this suite, and whoever added it has to say here why that element is
 * the customer's data rather than the app's words.
 */
/* file → how many elements in it carry the attribute. Counted rather than
   pinned by line, so moving a component's code does not fail this suite while
   a NEW opt-out anywhere still does. */
const NO_TRANSLATE_SITES = [
  'src/components/social/ContentCard.tsx:1',
  'src/components/social/PostPreview.tsx:2',
  'src/components/social/PreLaunchReview.tsx:1',
  'src/components/social/PublicationItem.tsx:1',
  'src/components/social/QuickPublishSheet.tsx:2',
];

function noTranslateSites(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.tsx')) continue;
      const text = readFileSync(full, 'utf8');
      if (!text.includes('data-no-translate')) continue;
      /* The ATTRIBUTE, through the parser — a paragraph of comment that
         explains the attribute is not a use of it, and the engine that reads
         it is not a use either (it is a .ts file and never written in JSX). */
      const src = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let count = 0;
      const visit = (n: ts.Node): void => {
        if (ts.isJsxAttribute(n) && n.name.getText(src) === 'data-no-translate') count += 1;
        ts.forEachChild(n, visit);
      };
      visit(src);
      if (count > 0) found.push(`${path.relative(process.cwd(), full)}:${count}`);
    }
  };
  walk(path.resolve('src'));
  return found.sort();
}

/**
 * Removes every piece of the customer's own data from a line, so that what is
 * left is the app's own words. Longest first, or a short name would be taken
 * out of the middle of a longer one and leave debris behind.
 */
const DATA_SORTED = [...DATA].sort((a, b) => b.length - a.length);
/* The second pass: the same data, plus the dictionary words the fixtures pass
   through a data field. Longest first, for the same reason. */
const EVERY_DATA_SORTED = [...new Set([...DATA, ...dataFieldWords])].sort((a, b) => b.length - a.length);
function stripData(line: string, alsoFieldWords = false): string {
  let out = line;
  for (const d of alsoFieldWords ? EVERY_DATA_SORTED : DATA_SORTED) {
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
/*
 * ─── THE TRANSLATOR REWRITES THE LINE AROUND THE DATA ─────────────────────
 *
 * Exact stripping only works while the line still holds the fixture's string
 * as it was written. Two things in this product break that, and both are
 * correct behaviour:
 *
 *   · A PATTERN TRANSLATES THE SENTENCE AND LEAVES THE VALUE. The row
 *     'היעד "§" כבוי.' is read from the database and comes out as
 *     'Цель "בעלי עסקים…" отключена.' — exactly as it should, because a group
 *     name is the customer's and the sentence around it is ours. The line no
 *     longer contains the fixture's literal, only part of it.
 *   · THE SCREEN TRUNCATES. ContentCard's aria-label is 'בחר את ' + the first
 *     sixty characters of the post, so what is on screen is a PREFIX of the
 *     fixture's text.
 *
 * So the Hebrew that is left is cut into runs — what sits between the Russian
 * words — and each run has to be found INSIDE one of the fixtures' own data
 * strings. A caption cannot slip through: a run that the dictionary answers is
 * rejected outright, and a run shorter than eight characters is never
 * accepted, because something that short is a word, not a name.
 */
const SPLIT_ON = /[A-Za-zА-Яа-яЁё0-9]+|·|\|/;
function hebrewRuns(line: string): string[] {
  return line
    .split(SPLIT_ON)
    .map((x) => x.trim())
    .filter((x) => HEBREW.test(x));
}

function isAllFixtureData(line: string): boolean {
  /*
   * First the same strip with the data-field words added, which answers the
   * line this rule was written for: "קבוצה 10 — באר שבע" is a group's name
   * and its city, and the city is also a filter's caption, so it is only
   * allowed out of a fixture's `city:` field.
   */
  if (!HEBREW.test(stripData(line, true))) return true;
  /*
   * The runs are cut from the LINE, not from what stripping left of it.
   * Stripping takes out every data string it can find, longest first, and a
   * short name in the middle of a long post ("ניקוי ספות" inside the body
   * that starts "מחפשים ניקוי ספות…") leaves the rest in pieces that belong
   * to no single literal any more. The line as it stands on screen still
   * holds the customer's text in one run, which is what has to be found.
   */
  for (const run of hebrewRuns(line)) {
    if (run.length < 8) return false;
    if (KEYS.has(run)) return false;
    if (!EVERY_DATA_SORTED.some((d) => d.includes(run))) return false;
  }
  return true;
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
  eq(
    noTranslateSites(),
    [...NO_TRANSLATE_SITES].sort(),
    'data-no-translate is still only on the owner’s own post text, in the three places that show it',
  );

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
    /* ANX_SPLIT_TEXT: the node boundaries the real app has — see
       worker/test/render-html.ts for why a merged text node would make this
       suite report a fault the app does not have. */
    const html = execFileSync('npx', ['tsx', `worker/test/${r}.tsx`], {
      encoding: 'utf8',
      maxBuffer: 32 << 20,
      env: { ...process.env, ANX_SPLIT_TEXT: '1' },
    });
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
      /* [data-no-translate] is the app saying "this is the customer's own
         words": the post that is about to go out to Facebook, in the three
         places that show it. It MUST still be Hebrew here, so reading it
         would report every post as an untranslated screen. The pinned list
         below is what stops that opt-out from spreading. */
      if (n.parentElement && n.parentElement.closest('[data-no-translate]')) continue;
      const t = (n.nodeValue || '').replace(/\\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    for (const el of document.querySelectorAll('[placeholder],[aria-label],[title]')) {
      if (el.closest('[data-no-translate]')) continue;
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
