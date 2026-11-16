/*
 * THE SIGN-IN SCREEN, MEASURED — /social/login against the owner's reference.
 *
 * "התמונה המצורפת היא רפרנס עיצובי מחייב … יש לשחזר אותה ברמת Pixel Perfect,
 *  ככל שניתן במסגרת התאמה רספונסיבית."
 *
 * WHAT IS MEASURED IS THE REAL PAGE. worker/test/mount-auth.tsx imports
 * src/app/social/login/page.tsx itself and renders it against the app's own
 * built stylesheet. Only next/navigation and @/lib/social/auth are stood in
 * for, because neither runs outside the Next runtime — every colour, size and
 * rule under test comes from the shipped page and the shipped CSS. A
 * hand-written copy of the markup would stop failing the moment the page
 * changed, which is the trap dashboard-size.test.ts documents.
 *
 * THE COLOURS ARE THE REFERENCE'S OWN, sampled from the attached file with
 * ImageMagick rather than eyeballed, and asserted as COMPUTED values in a
 * real browser — not as text in the stylesheet, which proves only that
 * somebody typed them.
 *
 * SKIPS, LOUDLY, WITHOUT A BUILD: the measurements need real CSS, and
 * .next/static/chunks only exists after `npm run build`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NAME = 'sign-in screen';
let checks = 0;
const is = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/* ══════════════ 1. WHAT THE SCREEN MAY NOT PRETEND TO DO ═══════════════ */

/*
 * THE REFERENCE DRAWS TWO CONTROLS THIS PRODUCT DOES NOT HAVE, and the
 * owner's own rule decides what to do about them:
 *
 *   "יש להציג התחברות באמצעות Google רק אם מנגנון ההזדהות נתמך ומוגדר
 *    בפועל. אין ליצור כפתור שאינו עובד."
 *
 * So these assertions are not about taste. They fail the day somebody draws
 * either control without the mechanism behind it — which is the exact defect
 * the rule is written against.
 */
{
  const page = src('src/app/social/login/page.tsx');
  const body = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  is(!/Google/i.test(body), 'no Google button may be drawn while no Google identity exists in this codebase');
  is(!/שכחת סיסמה/.test(body), 'and no "forgot password" link while there is no reset mechanism to send it to');

  /* The claim above, checked against the codebase rather than trusted. If a
     Google provider is ever added, this assertion fails and the button can
     go in — which is the right way round. */
  const all = ['src/lib/social/auth.ts', 'src/lib/supabase.ts'].map(src).join('\n');
  is(
    !/signInWithOAuth|signInWithIdToken/.test(all),
    'if an OAuth call has appeared, the Google button is now owed — this assertion is the reminder',
  );
  is(
    !/resetPasswordForEmail/.test(all),
    'and if a reset call has appeared, the "forgot password" link is owed too',
  );
}

/* ══════════════ 2. THE AUTH PATH WAS NOT REBUILT ═══════════════════════ */

/*
 * "יש להשתמש במנגנוני ההתחברות הקיימים ולא לבנות אותם מחדש" — and
 * "אסור לשבור שום פונקציה קיימת".
 *
 * The redesign was allowed to move every pixel on this screen and nothing
 * behind it. These are the calls that were here before it.
 */
{
  const page = src('src/app/social/login/page.tsx');
  is(/signInToSocial\(email, password\)/.test(page), 'signing in still goes through signInToSocial');
  is(/signUpToSocial\(email, password, business\)/.test(page), 'and opening an account through signUpToSocial');
  is(/useSocialSession\(\)/.test(page), 'the session still comes from useSocialSession');
  is(/result\.needsEmailConfirm/.test(page), 'the confirm-your-email branch survived the redesign');
  is(/checkConnection\(/.test(page), 'and so did the connection check the owner needed one morning');
  is(
    /next && next\.startsWith\('\/social'\)/.test(page),
    'and the ?next= redirect is still bounded to /social — an open redirect is not a styling change',
  );
  /* The screen must not have grown a second way to reach Supabase. */
  is(!/createClient|supabase\.auth/.test(page), 'the screen never speaks to Supabase directly');
}

/* ══════════════ 3. "זכור אותי" DOES SOMETHING, OR IT MAY NOT BE DRAWN ══ */

/*
 * "יש לממש את הפונקציונליות בפועל ולא ליצור כפתורים דקורטיביים."
 *
 * The box cannot control whether the session survives — that is decided once
 * in src/lib/supabase.ts, which the CRM shares — so what it controls is the
 * remembered email. That is a real effect, and these assertions are what stop
 * it quietly becoming an ornament.
 */
{
  const page = src('src/app/social/login/page.tsx');
  is(/localStorage\.setItem\(REMEMBER_KEY/.test(page), 'ticking it writes the address');
  is(/localStorage\.removeItem\(REMEMBER_KEY/.test(page), 'clearing it removes the address');
  is(/localStorage\.getItem\(REMEMBER_KEY/.test(page), 'and the next visit reads it back');
  /* Written only after the credentials were accepted — remembering an address
     that was just refused hands the next visit a wrong one, pre-filled. */
  const submitAt = page.indexOf('async function submit');
  const submitBody = page.slice(submitAt, page.indexOf('async function runCheck'));
  is(
    submitBody.indexOf('if (!result.ok)') < submitBody.indexOf('rememberEmail('),
    'and it is written only after the sign-in actually succeeded',
  );
  /* Storage throws outright in a locked-down browser. A login screen that
     crashes on a privacy setting is worse than one that forgets an address. */
  is((page.match(/catch \{/g) ?? []).length >= 2, 'every storage access is guarded — it throws in a private window');
}

/* ══════════════ 4. SCOPED, SO NO OTHER SCREEN CAN CHANGE ═══════════════ */

/*
 * "אין לשנות רכיבים משותפים שעלולים להשפיע על מסכים אחרים" and
 * "כל השינויים מוגבלים למסך ההתחברות ולרכיבים הדרושים לו".
 *
 * The /social app runs dark. This screen is light. Every rule it adds is
 * under .anxa-, so the two cannot meet.
 */
{
  const css = src('src/app/globals.css');
  /*
   * BOUNDED AT BOTH ENDS. The first version sliced from `.anxa-page {` to the
   * end of the file and failed the moment this block stopped being last —
   * reporting `.anx-poses`, which belongs to the assistant and is none of
   * this screen's business. A guard that depends on being last is a guard
   * that breaks when somebody appends.
   */
  const from = css.indexOf('─── THE SIGN-IN SCREEN (/social/login)');
  const to = css.indexOf('THE ANX ASSISTANT — a character', from);
  is(from > -1 && to > from, 'the sign-in block is where this suite expects it, with a section after it');
  const block = css.slice(from, to);
  const selectors = block.match(/^\.[a-z-]+[^{]*\{/gm) ?? [];
  const stray = selectors.filter((s) => !/^\.anxa-/.test(s.trim()));
  eq(stray, [], 'every selector this screen adds is .anxa-scoped — a bare element rule here would reach the whole site');
  is(block.length > 2000, 'and the block is actually present');
}

/* ══════════════ 4b. THE DICTIONARY ITSELF ══════════════════════════════ */

/*
 * "תוסיף אופציה גם לרוסית."
 *
 * The dictionary is keyed by the Hebrew sentence, which makes one mistake
 * silent and cheap: an entry whose Russian IS the Hebrew looks translated in
 * the file and renders Hebrew on the screen. These catch that, and the empty
 * value, which renders nothing at all.
 */
{
  const dict = src('src/lib/social/i18n.ts');
  const body = dict.slice(dict.indexOf('const RU:'), dict.indexOf('export const LATIN_OK'));
  const entries = [...body.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',?$/gm)].map((m) => [m[1], m[2]]);
  is(entries.length >= 30, `the dictionary has entries — found ${entries.length}`);

  const empty = entries.filter(([, ru]) => ru.trim().length === 0).map(([he]) => he);
  eq(empty, [], 'no entry translates to nothing');

  const untouched = entries.filter(([he, ru]) => he.trim() === ru.trim()).map(([he]) => he);
  eq(untouched, [], 'no entry is its own translation — that renders Hebrew while looking done');

  /* Cyrillic, not Latin transliteration and not Hebrew left behind. */
  /* A brand name is the one honest reason to have no Cyrillic, and each is
     named in LATIN_OK rather than the rule being relaxed for everybody. */
  const latinOk = new Set(
    [...dict.matchAll(/export const LATIN_OK[^=]*=\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])),
  );
  is(latinOk.size > 0, 'the brand-name exception list is readable from the dictionary');
  const notRussian = entries
    .filter(([he, ru]) => !/[\u0400-\u04FF]/.test(ru) && !latinOk.has(he))
    .map(([he]) => he);
  eq(notRussian, [], 'every translation is in Cyrillic, unless it is a brand name listed in LATIN_OK');

  const dupes = entries.map(([he]) => he).filter((he, i, all) => all.indexOf(he) !== i);
  eq(dupes, [], 'no Hebrew sentence is listed twice — the second would silently win');

  /* ── THE PATTERNS, WHERE A VALUE SITS INSIDE THE SENTENCE ──────────────
   *
   * A pattern carries § where the value goes. Three ways it can be wrong and
   * still look right in the file:
   *
   *   · fewer § on the Russian side  → the value is dropped on the floor
   *   · more § on the Russian side   → an empty hole where a value should be
   *   · almost no literal text       → the shape matches sentences it should
   *                                    not, and translates them wrongly
   *
   * None of those shows up by reading the dictionary, so each is measured.
   */
  const pbody = dict.slice(dict.indexOf('const RU_PAT:'), dict.indexOf('type Compiled'));
  const pats = [...pbody.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',?$/gm)].map((m) => [m[1], m[2]]);
  is(pats.length >= 1, `the pattern table is readable — found ${pats.length}`);

  const count = (s: string) => (s.match(/§/g) ?? []).length;
  const mismatched = pats.filter(([he, ru]) => count(he) !== count(ru)).map(([he]) => he);
  eq(mismatched, [], 'every pattern has the same number of § on both sides — otherwise a value is lost or a hole is left');

  const noSlot = pats.filter(([he]) => count(he) === 0).map(([he]) => he);
  eq(noSlot, [], 'every pattern actually has a slot — one without belongs in the plain dictionary');

  const longestLiteral = (pattern: string) =>
    pattern.split('§').reduce((best, part) => (part.length > best.length ? part : best), '');
  /* The one shape that genuinely has less is named in the dictionary, the
     same way a brand name is, rather than the rule being loosened. */
  const thinOk = new Set(
    [...dict.matchAll(/export const PH_THIN_OK[^=]*=\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])),
  );
  is(thinOk.size > 0, 'the thin-pattern exception list is readable from the dictionary');
  const tooVague = pats
    .filter(([he]) => (longestLiteral(he).match(/[֐-׿]/g) ?? []).length < 2 && !thinOk.has(he))
    .map(([he]) => he);
  eq(tooVague, [], 'every pattern has at least two Hebrew letters in one run — less than that matches sentences it should not');

  const patEmpty = pats.filter(([, ru]) => ru.replace(/§/g, '').trim().length === 0).map(([he]) => he);
  eq(patEmpty, [], 'no pattern translates to nothing but slots');

  const patSame = pats.filter(([he, ru]) => he.trim() === ru.trim()).map(([he]) => he);
  eq(patSame, [], 'no pattern is its own translation');

  const patLatin = pats.filter(([, ru]) => !/[Ѐ-ӿ]/.test(ru)).map(([he]) => he);
  eq(patLatin, [], 'every pattern translation is in Cyrillic');

  const patDupes = pats.map(([he]) => he).filter((he, i, all) => all.indexOf(he) !== i);
  eq(patDupes, [], 'no pattern is listed twice');

  /* A pattern must not be reachable by the plain dictionary too — the exact
     entry would always win and the pattern would be dead code. */
  const shadowed = pats.filter(([he]) => entries.some(([k]) => k === he)).map(([he]) => he);
  eq(shadowed, [], 'no pattern is shadowed by an identical plain entry');
}

/* ══════════════ 4c. EVERY t() HAS A RUSSIAN ═══════════════════════════ */

/*
 * THE COVERAGE GUARD FOR THE WEBSITE, the twin of the one over the desktop
 * window in desktop-window.test.ts.
 *
 * The dictionary answers in Hebrew when it has no Russian, which is the right
 * fallback and also a silent one: wrap a new screen's sentences, forget the
 * translations, and the only symptom is one Hebrew paragraph in a Russian
 * app. Nobody would see it until a customer did. This fails instead, and
 * names the sentences.
 */
{
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const root = new URL('../../', import.meta.url).pathname;

  const used = new Set<string>();
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)) used.add(m[1]);
      }
    }
  };
  walk(path.join(root, 'src/app/social'));
  walk(path.join(root, 'src/components/social'));

  const dict = src('src/lib/social/i18n.ts');
  const body = dict.slice(dict.indexOf('const RU:'), dict.indexOf('export const LATIN_OK'));
  const keys = new Set([...body.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]));

  is(used.size > 300, `the app really does call t() — ${used.size} sentences`);
  const missing = [...used].filter((k) => !keys.has(k));
  eq(
    missing,
    [],
    `every sentence the app wraps has a Russian — ${missing.length} do not: ${missing.slice(0, 5).join(' | ')}`,
  );
}

/* ══════════════ 5. THE SCREEN, IN A REAL BROWSER ═══════════════════════ */

async function main(): Promise<void> {
  const { build } = await import('esbuild');
  const { mkdtempSync, mkdirSync, readdirSync, readFileSync: read, statSync, writeFileSync, copyFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  const { createServer } = await import('node:http');
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
    console.log(`${NAME} OK — ${checks} assertions (the browser half was SKIPPED — run \`npm run build\` first)`);
    return;
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'auth-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-auth.tsx')],
    outfile: path.join(dir, 'm.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: {
      'next/navigation': path.resolve('worker/test/stubs/next-navigation.ts'),
      '@/lib/social/auth': path.resolve('worker/test/stubs/social-auth.ts'),
      '@': path.resolve('src'),
    },
    logLevel: 'silent',
  });
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css"><body><div id="root"></div><script src="m.js"></script></body></html>`,
  );

  /*
   * SERVED OVER HTTP, NOT file://, FOR ONE REASON: the robot.
   *
   * The page asks for /social/auth-robot.webp — root-absolute, the way every
   * asset on this site is addressed. Under file:// that resolves to the disk
   * root and 404s, which the console-error assertion caught on the first run.
   * A server rooted at the bundle serves the real asset from public/, so what
   * is measured is the picture the customer gets.
   */
  mkdirSync(path.join(dir, 'social'), { recursive: true });
  copyFileSync(path.resolve('public/social/auth-robot.webp'), path.join(dir, 'social', 'auth-robot.webp'));

  const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
  const server = createServer((req, res) => {
    const rel = (req.url ?? '/').split('?')[0];
    /* The browser asks for this on its own. Answering it keeps the
       console-error assertion about the PAGE rather than about the harness. */
    if (rel === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const file = path.join(dir, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    /* Read BEFORE the headers go out: writeHead().end(read()) evaluates the
       head first, so a missing file threw with the 200 already sent and the
       404 branch died on ERR_HTTP_HEADERS_SENT. */
    let body: Buffer | null = null;
    try {
      body = read(file);
    } catch {
      body = null;
    }
    if (!body) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    for (const [width, height] of [[360, 780], [390, 844], [430, 932], [1280, 900]] as const) {
      const at = `at ${width}px`;
      const page = await browser.newPage({ viewport: { width, height } });
      const crashes: string[] = [];
      page.on('pageerror', (e) => crashes.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') crashes.push(m.text());
      });
      await page.goto(base);
      await page.waitForSelector('.anxa-card');

      const seen = await page.evaluate(() => {
        /*
         * NOT ONE NAMED ARROW IN HERE, and that is not a style choice: tsx
         * bundles this file with keepNames on, which rewrites `const box =
         * (s) => …` into a call to a `__name` helper that does not exist in
         * the browser. It threw on the first run of this suite, exactly as it
         * has in every other measured file here. Everything is inline.
         */
        const q = document.querySelector.bind(document);
        /* Every control's real hit area. A checkbox is tapped by its label,
           so the label is the control and the input inside it is not. */
        const small: string[] = [];
        for (const el of document.querySelectorAll('button, a, input, label.anxa-remember')) {
          if (el.matches('.anxa-check')) continue;
          const b = el.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          if (b.height < 40) small.push(`${el.tagName}.${String(el.className).split(' ')[0]} ${Math.round(b.width)}x${Math.round(b.height)}`);
        }
        const robot = q('.anxa-robot') ? q('.anxa-robot')!.getBoundingClientRect() : null;
        const label = q('.anxa-label') ? q('.anxa-label')!.getBoundingClientRect() : null;
        return {
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          dir: document.documentElement.getAttribute('dir'),
          title: (document.querySelector('.anxa-title') as HTMLElement | null)?.textContent ?? '',
          tag: (document.querySelector('.anxa-tag') as HTMLElement | null)?.textContent ?? '',
          h2: (document.querySelector('.anxa-h2') as HTMLElement | null)?.textContent ?? '',
          feats: [...document.querySelectorAll('.anxa-feat span')].map((e) => e.textContent ?? ''),
          featIcons: document.querySelectorAll('.anxa-feat svg').length,
          go: (document.querySelector('.anxa-go') as HTMLElement | null)?.textContent ?? '',
          foot: (document.querySelector('.anxa-foot') as HTMLElement | null)?.textContent ?? '',
          inputH: Math.round((q('.anxa-input') ? q('.anxa-input')!.getBoundingClientRect().height : 0)),
          goH: Math.round((q('.anxa-go') ? q('.anxa-go')!.getBoundingClientRect().height : 0)),
          cardR: (q('.anxa-card') ? getComputedStyle(q('.anxa-card')!).getPropertyValue('border-radius') : ''),
          inputBg: (q('.anxa-input') ? getComputedStyle(q('.anxa-input')!).getPropertyValue('background-color') : ''),
          inputBorder: (q('.anxa-input') ? getComputedStyle(q('.anxa-input')!).getPropertyValue('border-top-color') : ''),
          goBg: (q('.anxa-go') ? getComputedStyle(q('.anxa-go')!).getPropertyValue('background-image') : ''),
          pageBg: (q('.anxa-page') ? getComputedStyle(q('.anxa-page')!).getPropertyValue('background-image') : ''),
          titleColor: (q('.anxa-title') ? getComputedStyle(q('.anxa-title')!).getPropertyValue('color') : ''),
          labelColor: (q('.anxa-label') ? getComputedStyle(q('.anxa-label')!).getPropertyValue('color') : ''),
          cardBg: (q('.anxa-card') ? getComputedStyle(q('.anxa-card')!).getPropertyValue('background-color') : ''),
          small,
          /* The robot is decoration and may never cover a field —
             "אין לאפשר לרובוט או לגלים להסתיר תוכן". */
          robotPointer: (q('.anxa-robot') ? getComputedStyle(q('.anxa-robot')!).getPropertyValue('pointer-events') : ''),
          robotOverLabel: !!(robot && label && robot.bottom > label.top),
          wavePointer: (q('.anxa-wave-top') ? getComputedStyle(q('.anxa-wave-top')!).getPropertyValue('pointer-events') : ''),
          eyeType: (document.querySelector('#anxa-password') as HTMLInputElement | null)?.type ?? '',
        };
      });

      eq(seen.over, 0, `${at}: nothing pushes the page sideways`);
      eq(seen.dir, 'rtl', `${at}: the page is RTL`);
      eq(crashes, [], `${at}: the screen renders with no console error`);

      /* ── the reference's own words, in its own order ── */
      eq(seen.title.trim(), 'הפתרון המבריק', `${at}: the product's name`);
      eq(seen.tag.trim(), 'פרסום לקבוצות פייסבוק', `${at}: and its line`);
      eq(seen.h2.trim(), 'ברוכים הבאים', `${at}: the card's heading`);
      eq(
        seen.feats.map((f) => f.trim()),
        ['פרסום אוטומטי', 'ריבוי חשבונות', 'מהיר ויעיל'],
        `${at}: the three cards, in the reference's order (RTL: the calendar first, at the right)`,
      );
      eq(seen.featIcons, 3, `${at}: each benefit card carries its icon`);
      is(seen.go.includes('כניסה למערכת'), `${at}: the button says what the reference says — got "${seen.go}"`);
      is(seen.foot.includes('פתחו חשבון חדש'), `${at}: and the foot offers the account`);
      is(!/Google/i.test(seen.foot), `${at}: with no Google anywhere on it`);

      /* ── usable before it is pretty ── */
      is(seen.inputH >= 48, `${at}: the fields stay comfortable — ${seen.inputH}px`);
      is(seen.goH >= 52, `${at}: and so does the button — ${seen.goH}px`);
      eq(seen.small, [], `${at}: every control meets the 40px floor`);
      eq(seen.robotPointer, 'none', `${at}: the robot cannot take a tap meant for a field`);
      eq(seen.wavePointer, 'none', `${at}: and neither can the waves`);
      is(!seen.robotOverLabel, `${at}: the robot sits above the first label, never over it`);
      eq(seen.eyeType, 'password', `${at}: the password starts hidden`);

      /* ── the reference's palette, computed rather than typed ── */
      is(/rgb\(241, 246, 254\)/.test(seen.inputBg), `${at}: the field fill is the reference's #F1F6FE — got ${seen.inputBg}`);
      is(/rgb\(199, 215, 241\)/.test(seen.inputBorder), `${at}: and its border #C7D7F1 — got ${seen.inputBorder}`);
      is(/linear-gradient/.test(seen.goBg) && /18, 114, 244/.test(seen.goBg), `${at}: the button is the reference's blue gradient`);
      is(/linear-gradient/.test(seen.pageBg), `${at}: the page keeps its light blue wash`);
      is(/rgb\(10, 16, 32\)/.test(seen.titleColor), `${at}: the title ink`);
      is(/rgb\(43, 57, 83\)/.test(seen.labelColor), `${at}: and the label ink`);
      is(parseFloat(seen.cardR) >= 20, `${at}: the card is "מעוגל במיוחד" — radius ${seen.cardR}`);
      is(/255, 255, 255/.test(seen.cardBg), `${at}: on white, as the reference draws it`);

      /* ── the eye really reveals, which is on the owner's checklist ── */
      await page.click('.anxa-eye');
      eq(
        await page.evaluate(() => (document.querySelector('#anxa-password') as HTMLInputElement).type),
        'text',
        `${at}: pressing the eye reveals the password`,
      );
      await page.click('.anxa-eye');
      eq(
        await page.evaluate(() => (document.querySelector('#anxa-password') as HTMLInputElement).type),
        'password',
        `${at}: and pressing it again hides it`,
      );

      await page.close();
    }

    /* ── the other mode is still whole ── */
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      await page.goto(`${base}/?mode=up`);
      await page.waitForSelector('.anxa-card');
      const up = await page.evaluate(() => ({
        h2: (document.querySelector('.anxa-h2') as HTMLElement | null)?.textContent ?? '',
        business: !!document.querySelector('#anxa-business'),
        how: !!document.querySelector('.anxa-how'),
        go: (document.querySelector('.anxa-go') as HTMLElement | null)?.textContent ?? '',
      }));
      eq(up.h2.trim(), 'פתיחת חשבון', 'the sign-up mode still opens on its own heading');
      is(up.business, 'and still asks for the business name');
      /*
       * THE THIRD BLOCK SURVIVED THE REDESIGN, and it matters: this product is
       * a website plus a program on a PC, and somebody who opens an account
       * without knowing that builds a round, watches nothing happen, and
       * reports it broken. The reference draws the signed-in screen, which is
       * why it is not in the picture.
       */
      is(up.how, 'and still explains that the publishing happens on a PC');
      is(up.go.includes('פתחו חשבון'), 'and the button changes with the mode');
      await page.close();
    }

    /* ── a refused sign-in still explains itself ── */
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      await page.goto(`${base}/?fail=them`);
      await page.waitForSelector('.anxa-card');
      await page.fill('#anxa-email', 'someone@example.com');
      await page.fill('#anxa-password', 'whatever1');
      await page.click('.anxa-go');
      await page.waitForSelector('.anxa-err');
      const err = await page.evaluate(() => ({
        text: (document.querySelector('.anxa-err-t') as HTMLElement | null)?.textContent ?? '',
        role: document.querySelector('.anxa-err')?.getAttribute('role') ?? '',
        check: !!document.querySelector('.anxa-err-btn'),
        remembered: (() => {
          try {
            return window.localStorage.getItem('anx.social.email');
          } catch {
            return null;
          }
        })(),
      }));
      is(err.text.length > 0, 'a refusal is shown in words');
      eq(err.role, 'alert', 'and announced, not just drawn');
      is(err.check, 'with the connection check beside it, for the failures that are not the customer\'s');
      eq(err.remembered, null, 'and a refused address is NOT remembered — the next visit would pre-fill a wrong one');
      await page.close();
    }
    /* ── the switch actually switches, and the choice survives ── */
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      await page.goto(base);
      await page.waitForSelector('.anxa-card');

      eq(
        await page.evaluate(() => document.documentElement.getAttribute('dir')),
        'rtl',
        'the screen opens in Hebrew, right-to-left',
      );

      await page.click('.anxl-btn[lang="ru"]');
      await page.waitForTimeout(150);
      const ru = await page.evaluate(() => ({
        dir: document.documentElement.getAttribute('dir'),
        lang: document.documentElement.getAttribute('lang'),
        h2: document.querySelector('.anxa-h2')?.textContent ?? '',
        go: document.querySelector('.anxa-go')?.textContent ?? '',
        feats: [...document.querySelectorAll('.anxa-feat span')].map((e) => e.textContent ?? ''),
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        stored: (() => {
          try {
            return window.localStorage.getItem('anx.social.lang');
          } catch {
            return null;
          }
        })(),
      }));
      /* Russian reads left-to-right. A translation that left the page RTL
         would be the half of this feature nobody notices until a customer
         sends a screenshot of a sentence running the wrong way. */
      eq(ru.dir, 'ltr', 'choosing Russian turns the document left-to-right');
      eq(ru.lang, 'ru', 'and says so in lang, which is what a screen reader reads');
      eq(ru.h2.trim(), 'Добро пожаловать', 'the heading is Russian');
      is(ru.go.includes('Войти'), `and so is the button — got "${ru.go}"`);
      eq(
        ru.feats.map((f) => f.trim()),
        ['Автопубликация', 'Несколько аккаунтов', 'Быстро и эффективно'],
        'and the three benefit cards',
      );
      eq(ru.over, 0, 'and nothing overflows once the direction flips');
      eq(ru.stored, 'ru', 'the choice is written down');

      /* It has to still be Russian after a reload, or it is not a setting. */
      await page.reload();
      await page.waitForSelector('.anxa-card');
      await page.waitForTimeout(150);
      const back = await page.evaluate(() => ({
        dir: document.documentElement.getAttribute('dir'),
        h2: document.querySelector('.anxa-h2')?.textContent ?? '',
      }));
      eq(back.dir, 'ltr', 'and it is still Russian after a reload');
      eq(back.h2.trim(), 'Добро пожаловать', 'with the Russian heading still in place');

      /* And back again — a one-way switch is a trap for whoever presses it. */
      await page.click('.anxl-btn[lang="he"]');
      await page.waitForTimeout(150);
      const he = await page.evaluate(() => ({
        dir: document.documentElement.getAttribute('dir'),
        h2: document.querySelector('.anxa-h2')?.textContent ?? '',
      }));
      eq(he.dir, 'rtl', 'and Hebrew brings the direction back');
      eq(he.h2.trim(), 'ברוכים הבאים', 'and the Hebrew heading');
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`${NAME} OK — ${checks} assertions, the real page measured in a browser at 360/390/430/1280`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
