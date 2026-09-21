import assert from 'node:assert/strict';
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
  assert.equal(decoy.w, 300, 'the decoy really is the bigger picture');
  assert.ok(profile.image.bytes.length < 40_000, 'yet the captured face is the small proven avatar, not the 300px post');

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
  await page.goto('https://www.facebook.com/');
  const unproven = await readAccountProfile(page);
  assert.ok(unproven, 'still a signed-in session');
  assert.equal(unproven.image, null, 'nothing provable means no face, however well it fits');
  assert.equal(unproven.imageNote, 'no-element', 'and it says so');
  assert.ok(unproven.probe.sample.length > 0, 'while describing what it rejected, so the next attempt is reading');

  await browser.close();
  console.log('signed-in-account browser tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
