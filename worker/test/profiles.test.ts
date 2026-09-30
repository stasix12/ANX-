import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { readProfiles, switchProfile } from '../facebook/profiles';

/**
 * WHO PUBLISHES — read out of Facebook's own account menu, and never guessed.
 *
 * A customer showed two entries in that menu: his own name and his business.
 * One Facebook account, two profiles, and this product knew only the one whose
 * cookie it happened to hold. The feature is a list and a button; the risk is
 * entirely in the list.
 *
 * WHAT MAKES THIS WORTH A BROWSER AND A FIXTURE. Every failure mode here ends
 * with a post going out under the wrong name, or with a button that offers to
 * "switch to" one of Facebook's menu items. Both look completely normal on
 * screen — a name, a row, a tap — right up until something is published. So
 * this drives the real reader against a page with the real shapes: rows with
 * no id and no link, menu items indistinguishable from profiles except by
 * their words, two levels of nesting, and an anchor with wrappers of its own.
 *
 *   npx tsx worker/test/profiles.test.ts
 */

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

const fixture = `file://${path.resolve(__dirname, 'mock-switcher.html')}`;
const noAnchor = `file://${path.resolve(__dirname, 'mock-switcher-noanchor.html')}`;

/** Same finder composer.test.ts uses — playwright-core only knows its own build. */
function findChromium(): string | undefined {
  if (process.env.SOCIAL_BROWSER_EXECUTABLE) return process.env.SOCIAL_BROWSER_EXECUTABLE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium')).sort().reverse()) {
    for (const rel of [
      'chrome-linux/chrome',
      'chrome-linux/headless_shell',
      'chrome-win/chrome.exe',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    ]) {
      const candidate = path.join(root, dir, rel);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const picked = (page: Page) => page.evaluate(() => (window as unknown as { __picked?: string }).__picked ?? '');

async function main() {
  const executablePath = findChromium();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : { channel: process.env.SOCIAL_BROWSER_CHANNEL as 'chrome' | undefined }),
  });
  const context = await browser.newContext();

  /* ------------------------------------------------ 1. the two, and only the two */
  {
    const page = await context.newPage();
    await page.goto(fixture);
    const read = await readProfiles(page);
    eq(read.note, 'ok', 'a menu that holds profiles is reported as read, not as a fault');
    eq(
      read.profiles.map((p) => p.name),
      ['Dor Moyal', 'Air Master'],
      'exactly the rows above "הצגת כל הפרופילים", in the order Facebook drew them',
    );
    /*
     * THE ROW ABOVE THE ANCHOR IS THE ONE THAT PROVES ANYTHING.
     *
     * "יצירת פרופיל חדש" sits between the profiles and "הצגת כל הפרופילים", so
     * position cannot exclude it — only the word list in selectors.ts can. The
     * five below the anchor are excluded by position and would pass with no
     * filter at all: deleting the filter left this suite green until this row
     * was added, and a green suite over a deleted guard is worse than no suite.
     */
    is(
      !read.profiles.some((p) => /יצירת פרופיל חדש/.test(p.name)),
      'a row above the anchor that is not a profile is excluded by its WORDS — the only thing that can exclude it',
    );
    /* And the ordinary menu below it, which position already handles. */
    for (const item of ['הגדרות ופרטיות', 'עזרה ותמיכה', 'דיווח על בעיה', 'תצוגה ונגישות', 'התנתקות']) {
      is(!read.profiles.some((p) => p.name === item), `"${item}" is a menu item, never a profile`);
    }
    is(!read.profiles.some((p) => /הצגת כל הפרופילים/.test(p.name)), 'and the anchor itself is not one of them either');
    /* A container that swallowed its children would come back as a "profile"
       whose name is the whole menu. */
    is(read.profiles.every((p) => p.name.length <= 60 && !p.name.includes('\n')), 'no row is a wrapper wearing its children’s text');
    /* Opening it left it open on the customer's real Facebook once. */
    eq(await page.locator('#menu').isHidden(), false, 'the menu was opened to read it');
    await page.close();
  }

  /* ------------------------------------- 2. no anchor is no answer, not a guess */
  {
    const page = await context.newPage();
    await page.goto(noAnchor);
    const read = await readProfiles(page);
    eq(read.profiles, [], 'an account with one profile yields NO profiles rather than the menu’s own items');
    eq(read.note, 'no-anchor', 'and it says which of the three ways of finding nothing happened');
    await page.close();
  }

  /* --------------------------------------------- 3. the switch presses that row */
  {
    const page = await context.newPage();
    await page.goto(fixture);
    const out = await switchProfile(page, 'Air Master');
    eq(out, 'clicked', 'a name the reader returned is pressed');
    eq(await picked(page), 'Air Master', 'and it is THAT row — not the first one, not the anchor');
    await page.close();
  }

  /* ------------------------------- 4. a name from a screen is not a permission */
  {
    const page = await context.newPage();
    await page.goto(fixture);
    /*
     * The name travels from a phone, so it is checked against what the worker
     * itself read before anything is clicked. Without that check the locator
     * below would happily match "הגדרות ופרטיות" — the dashboard would become
     * a way to press arbitrary rows of the owner's Facebook menu.
     */
    const out = await switchProfile(page, 'הגדרות ופרטיות');
    eq(out, 'not-found', 'a menu item asked for by name is refused');
    eq(await picked(page), '', 'and nothing at all was clicked');
    await page.close();
  }

  {
    const page = await context.newPage();
    await page.goto(fixture);
    const out = await switchProfile(page, 'מישהו שלא קיים');
    eq(out, 'not-found', 'a name that is not in the menu is refused');
    eq(await picked(page), '', 'and nothing at all was clicked');
    await page.close();
  }

  await browser.close();

  /* ------------------------------------ 5. the promises the code must keep */
  const src = readFileSync(new URL('../facebook/profiles.ts', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  is(
    /if \(!names\.includes\(name\)\)/.test(code),
    'the guard in section 4 is the code’s own, not this test’s — a switch may only press a row the reader returned',
  );
  const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  is(
    /cmd\.command === 'switch'/.test(worker) && /session\.switchTo\(/.test(worker),
    'the dashboard reaches this through a command, like every other thing it asks of the machine',
  );
  const session = readFileSync(new URL('../facebook/session.ts', import.meta.url), 'utf8');
  const body = session.slice(session.indexOf('async switchTo('));
  is(
    /const before = await this\.currentUserId\(\)/.test(body) && /after === before/.test(body),
    'a switch is confirmed against the c_user cookie — pressing a row is not evidence that Facebook moved',
  );
  is(
    /await recordAccount\(state, r\.account\)/.test(worker.slice(worker.indexOf("cmd.command === 'switch'"))),
    'and the account is re-read afterwards, so the chip and the group scope follow the identity that now publishes',
  );

  /*
   * AND A MACHINE THAT HAS NEVER HEARD OF THIS COMMAND SAYS SO.
   *
   * The dashboard deploys the instant it is written; the program on somebody's
   * PC is whatever they last installed. So this button reached a phone while
   * every machine in the world still ran a version with no branch for it — and
   * the command loop's if/else had no final else, so the command was claimed,
   * marked done, and left an empty result. A button that reports success and
   * changes nothing is the worst answer a control can give, and it is the
   * failure this whole session kept finding in other clothes.
   */
  is(
    /\} else \{[\s\S]{0,1200}?לא קיימת בגרסה שמותקנת במחשב/.test(worker),
    'an unknown command is refused with a sentence naming the installed version — never claimed, done, and silent',
  );
  is(
    /ok = false;[\s\S]{0,200}?לא קיימת בגרסה/.test(worker),
    'and it is recorded as a FAILURE, so the dashboard shows it in red rather than as a completed instruction',
  );

  console.log(`profile switcher tests OK — ${checks} assertions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
