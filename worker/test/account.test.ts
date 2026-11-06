import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { readAccountProfile } from '../facebook/account';

/**
 * Reads the signed-in account against a real browser and a fake Facebook.
 *
 * The source guards in unit.test.ts can say what the code LOOKS like. They
 * cannot catch the bug that cost four rounds on the owner's machine: the whole
 * search died in the page with "ReferenceError: __name is not defined" before
 * its first statement, because tsx's esbuild rewrites `const f = () => …` into
 * `__name(() => …, 'f')` and a function handed to page.evaluate is shipped to
 * the browser as source — the call travels, the helper does not. Every caller
 * wraps its evaluate in `.catch(() => null)`, correctly, since none of them may
 * fail a login check — so a read that never ran was indistinguishable from a
 * page that did not have the answer.
 *
 * Only a real page can tell those apart, so this test uses one.
 *
 *   npx tsx worker/test/account.test.ts
 */
function findChromium(): string | undefined {
  if (process.env.SOCIAL_BROWSER_EXECUTABLE) return process.env.SOCIAL_BROWSER_EXECUTABLE;
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

const ID = '100012345678901';

/** A real 1x1 PNG, served over real HTTP so the fetch path is the real one. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A page shaped like the two things that actually matter: the owner's own
 * avatar, small and linked by their vanity path with their bare name on it;
 * and a big square photo somebody posted OF them, labelled with a sentence
 * that contains their name. An earlier version took the second one and put a
 * stranger's picture on the dashboard as the owner's face.
 */
const HOME =
  '<html><head><title>Facebook</title></head><body>' +
  `<script>requireLazy(["CurrentUserInitialData"],function(a){a.setup({"ACCOUNT_ID":"${ID}","NAME":"Stas Terehin"})})</script>` +
  `<a href="/stas.terehin"><img alt="Stas Terehin" width="40" height="40" src="https://scontent.test/v/t39/1_${ID}_2_n.jpg"></a>` +
  '<img alt="May be an image of Stas Terehin" width="300" height="300" src="https://scontent.test/someone-elses-post.jpg">' +
  '</body></html>';


/**
 * THE OWNER'S ACTUAL PAGE, from the probe their terminal printed.
 *
 * Their home page carries two 40x40 SVG <image> avatars whose enclosing link
 * is the ABSOLUTE form, https://www.facebook.com/<their name>, with a signed
 * CDN src that does not contain their numeric id and a label that mentions
 * their name inside a sentence rather than being it. So every proof failed:
 * the id is not in the href, not in the src, and the alt is not the name.
 *
 * What was missing is that the profile path is only learned from /me, and by
 * the time it was known the page holding those links had already been left.
 */
async function ownersLayout(browser: import('playwright-core').Browser) {
  /*
   * The avatar is served over real HTTP on purpose. Playwright's request API
   * does not go through page routes, and a fake host would quietly exercise
   * the screenshot fallback instead of the path this test is about.
   */
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(PNG);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  const avatarUrl = `http://127.0.0.1:${port}/avatar.png`;

  const context = await browser.newContext({ locale: 'he-IL' });
  await context.addCookies([{ name: 'c_user', value: ID, domain: '.facebook.com', path: '/' }]);
  const page = await context.newPage();
  const home =
    '<html><head><title>Facebook</title></head><body>' +
    `<script>requireLazy(["CurrentUserInitialData"],function(a){a.setup({"ACCOUNT_ID":"${ID}","NAME":"Stas Terehin"})})</script>` +
    '<a href="https://www.facebook.com/stas.terehin"><svg width="40" height="40">' +
    `<image alt="תמונת הפרופיל של Stas Terehin" width="40" height="40" href="${avatarUrl}"></image>` +
    '</svg></a>' +
    '</body></html>';
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    /* /me hands the browser onward to the real profile. Written as a client
       redirect rather than a 302 because a fulfilled 302 escapes routing in
       this sandbox — and it is the harder case anyway: page.goto resolves
       while the address bar still says /me, which is exactly the race that
       left the owner's profile path unread. */
    if (u.pathname === '/me')
      return r.fulfill({
        contentType: 'text/html',
        body: "<html><head><title>Facebook</title></head><body><script>setTimeout(function(){location.replace('/stas.terehin')},50)</script></body></html>",
      });
    /* The profile page deliberately carries NO provable avatar: its big photo
       is unlinked and labelled with an action, exactly as the owner's probe
       showed. So the only way to a face is back on the page whose links /me
       just named — which is the point of this test. */
    if (u.pathname === '/stas.terehin')
      return r.fulfill({
        contentType: 'text/html; charset=utf-8',
        body:
          '<html><head><title>Stas Terehin</title></head><body>' +
          '<svg width="168" height="168"><image alt="פעולות תמונת הפרופיל" width="168" height="168" href="https://scontent.test/v/t1/big?oe=6AB6ECC4"></image></svg>' +
          '</body></html>',
      });
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body: home });
  });
  await page.goto('https://www.facebook.com/');

  const profile = await readAccountProfile(page);
  assert.ok(profile, 'a signed-in session');
  assert.equal(profile.name, 'Stas Terehin', 'the name still comes from the page data');
  assert.ok(
    profile.image && profile.image.bytes.length > 0,
    'the avatar behind an absolute vanity link must be found by going back to the page that holds it',
  );
  assert.equal(profile.imageNote, 'ok');
  await context.close();
  /* And it really did have to come back for it. */
  assert.match(profile.probe.where, /facebook\.com\/ ← "\/stas\.terehin"/, 'the last look is at the home page, with the learned path in hand');
  /*
   * AND IT ASKED FOR THE FILE. The owner's run reached this point with a
   * proven avatar and came back "could not photograph it" — Facebook's top bar
   * re-renders under Playwright's feet. The element's own address needs no
   * layout, no stillness and no node that still exists.
   */
  assert.match(profile.probe.where, /· קובץ$/, 'the avatar is fetched by its own address, not photographed');
  assert.deepEqual(profile.image.bytes, PNG, 'and the bytes are the file itself');
  console.log('  ✓ absolute vanity link + signed CDN src + name-in-a-sentence label, captured on the return trip');
}

async function main() {
  const executablePath = findChromium();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : { channel: process.env.SOCIAL_BROWSER_CHANNEL as 'chrome' | undefined }),
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ locale: 'he-IL' });
  await context.addCookies([{ name: 'c_user', value: ID, domain: '.facebook.com', path: '/' }]);
  const page = await context.newPage();
  await page.route('**/*', (r) => r.fulfill({ contentType: 'text/html', body: HOME }));
  await page.goto('https://www.facebook.com/');

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * A JAR TIMELINE, because the only machine that can answer is CI.
   *
   * The assertion at the end of this file has never passed in CI and passes
   * here every time. CI's answer, asked for in the last run and given on
   * 06/11: `cookies now: []` — that build ends this file with the facebook.com
   * jar EMPTY, while the FIRST read in the same run found `c_user` and
   * returned a profile. So something between the two empties it, and a single
   * reading at the end cannot say which step.
   *
   * This marks the jar after every step between them. It reads cookies and
   * nothing else — no product behaviour depends on it — and it costs one
   * line of output only when something really is missing.
   */
  const marks: string[] = [];
  const mark = async (label: string): Promise<void> => {
    const jar = await page
      .context()
      .cookies('https://www.facebook.com')
      .catch((e: unknown) => `threw: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    marks.push(`${label}=${typeof jar === 'string' ? jar : jar.map((c) => c.name).join('+') || 'EMPTY'}`);
  };
  await mark('after-setup');

  /*
   * THE REGRESSION GUARD. A named helper inside an evaluate is exactly the
   * shape that esbuild rewrites, and this context deliberately does NOT get
   * session.ts's init script — so if account.ts ever grows one back, this
   * fails here rather than silently on the owner's machine six weeks later.
   */
  const ran = await page
    .evaluate(() => {
      const shout = (s: string) => s.toUpperCase();
      return shout('ok');
    })
    .catch((e: unknown) => `threw: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  assert.match(
    String(ran),
    /^(OK|threw: .*__name is not defined)$/,
    'unexpected failure shape — read this test before changing it',
  );
  if (ran !== 'OK') console.log('  (this browser reproduces the __name hazard, which is the point)');

  const profile = await readAccountProfile(page);
  await mark('after-first-read');
  assert.ok(profile, 'a page with a c_user cookie must yield a profile');
  assert.equal(profile.id, ID, 'the id comes from the cookie');
  assert.equal(profile.name, 'Stas Terehin', 'and the name from the page, not the "Facebook" placeholder');

  /* The search ran. Before the fix this was `no-element` with an empty probe,
     which read exactly like "the page had no avatar" and was not that. */
  assert.equal(profile.imageNote, 'ok', 'the avatar search must actually run in the page');
  assert.ok(profile.image && profile.image.bytes.length > 0, 'and come back with bytes');
  assert.equal(profile.probe.note, 'ok', 'the probe reports a search that ran');
  assert.equal(profile.probe.nodes, 2, 'it saw both pictures');

  /*
   * AND IT TOOK THE RIGHT ONE. The decoy is bigger, square, and carries the
   * owner's name inside its label — everything the old heuristics rewarded.
   * What disqualifies it is that nothing proves it is theirs.
   */
  const decoy = await page.evaluate(() => {
    const el = document.querySelector('img[width="300"]') as HTMLImageElement;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  await mark('after-decoy-evaluate');
  assert.equal(decoy.w, 300, 'the decoy really is the bigger picture');
  assert.ok(profile.image.bytes.length < 40_000, 'yet the captured face is the small proven avatar, not the 300px post');
  /* This fixture's src cannot be fetched, so the element screenshot is what
     produced it — the fallback, still working. */
  assert.match(profile.probe.where, /· צילום$/, 'an unfetchable source falls back to photographing the element');

  /* A name mentioned inside a sentence is not a label. */
  await page.route('**/*', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body:
        '<html><head><title>Facebook</title></head><body>' +
        `<script>requireLazy(["CurrentUserInitialData"],function(a){a.setup({"ACCOUNT_ID":"${ID}","NAME":"Stas Terehin"})})</script>` +
        '<img alt="May be an image of Stas Terehin" width="300" height="300" src="https://scontent.test/someone-elses-post.jpg">' +
        '</body></html>',
    }),
  );
  await mark('after-second-route');
  await page.goto('https://www.facebook.com/');
  await mark('after-second-goto');
  const unproven = await readAccountProfile(page);
  /*
   * THIS LINE CARRIES ITS OWN POST-MORTEM, and here is why.
   *
   * It is green on the Chromium this machine has (141) and red on the one CI
   * installs with playwright 1.49 (131) — the only failure in the whole
   * suite that tells the two apart. readAccountProfile has exactly one path
   * that returns null: no `c_user` cookie. The cookie is added to the
   * CONTEXT at the top of this file and nothing here removes it, so either
   * that browser drops it somewhere in between or the read of it fails —
   * and a bare "still a signed-in session" cannot say which.
   *
   * The 131 build cannot be run here to find out: its download is refused by
   * this environment's network policy (tried, 2026-11-06). So the assertion
   * asks the question itself and CI answers it on the next run.
   *
   * IT ANSWERED: `cookies now: []`. The jar is empty by the time this line
   * runs, and the first read in the same run had `c_user` — so one of the
   * steps in between takes it away, and the guard in account.ts that puts it
   * back is not putting it back. The timeline above (`mark(...)`) narrows it
   * to a step; this message carries it, so the next run names the culprit
   * instead of repeating what is already known.
   */
  const jar = await page.context().cookies('https://www.facebook.com').catch((e) => `read failed: ${e}`);
  await mark('at-the-end');
  if (marks.some((m) => m.endsWith('EMPTY') || m.includes('threw'))) console.log(`  (jar timeline: ${marks.join(' | ')})`);
  assert.ok(
    unproven,
    'still a signed-in session — ' +
      (typeof jar === 'string' ? jar : `cookies now: ${JSON.stringify(jar.map((c) => `${c.name}@${c.domain}${c.path}`))}`) +
      `, url ${page.url()} — jar timeline: ${marks.join(' | ')}`,
  );
  assert.equal(unproven.image, null, 'nothing provable means no face, however well it fits');
  assert.equal(unproven.imageNote, 'no-element', 'and it says so');
  assert.ok(unproven.probe.sample.length > 0, 'while describing what it rejected, so the next attempt is reading');

  await ownersLayout(browser);

  await browser.close();
  console.log('signed-in-account browser tests OK');
  /* The fixture's HTTP server keeps the loop alive past its own close(), and a
     suite that passes but never returns reads exactly like one that hung. */
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
