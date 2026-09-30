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
      ['Dor Moyal', 'Air Master', 'הפתרון המבריק', 'FreshWave – ניקוי עמוק למזגנים'],
      'exactly the rows above "הצגת כל הפרופילים", in the order Facebook drew them — profiles AND pages',
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
    eq(out.pressed, 'clicked', 'a name the reader returned is pressed');
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
    eq(out.pressed, 'not-found', 'a menu item asked for by name is refused');
    eq(await picked(page), '', 'and nothing at all was clicked');
    await page.close();
  }

  {
    const page = await context.newPage();
    await page.goto(fixture);
    const out = await switchProfile(page, 'מישהו שלא קיים');
    eq(out.pressed, 'not-found', 'a name that is not in the menu is refused');
    eq(await picked(page), '', 'and nothing at all was clicked');
    await page.close();
  }

  /* ------- 3a. another dialog on the page is not the account menu ---------- */
  /*
   * THE ONE THE OWNER KEPT PHOTOGRAPHING.
   *
   * His Facebook always has something else open — notifications, chat,
   * whatever was last touched — and those are role="dialog" too, sitting
   * BEFORE the account menu in the document. The reader took the first match,
   * judged that, and reported "we could not open the account menu" while the
   * real one was open beside it. Three rounds of fixing other things never
   * touched it, because this fixture had exactly one menu in it.
   *
   * The decoy is in the fixture permanently now: every assertion in this file
   * is made on a page that has one, which is what his page looks like.
   */
  {
    const page = await context.newPage();
    await page.goto(fixture);
    eq(await page.locator('#decoy').isVisible(), true, 'the decoy dialog is really there and really visible');
    const read = await readProfiles(page);
    eq(read.note, 'ok', 'and the account menu is still found — among all the open menus, not just the first');
    eq(read.profiles.length, 4, 'with every identity in it');
    await page.close();
  }

  /* --------- 3a2. a menu that is visible before it is full ------------------ */
  {
    const page = await context.newPage();
    await page.goto(`${fixture}#slowmenu`);
    const read = await readProfiles(page);
    eq(read.note, 'ok', 'a menu that fills a moment after it opens is waited for, not thrown away');
    eq(read.profiles.length, 4, 'and read in full once it has');
    await page.close();
  }

  /* -------- 3a3. and when nothing opens, it says what WAS on the page ------- */
  {
    const page = await context.newPage();
    await page.goto(noAnchor);
    /* Take the avatar away: now nothing can open the account menu, and the only
       thing on the page is the decoy-shaped landmark. */
    await page.evaluate(() => document.getElementById('avatar')?.remove());
    const read = await readProfiles(page);
    eq(read.note, 'no-menu', 'with no way in, it says so');
    is(read.why && read.why.length > 0, 'and reports what the page was actually showing — nobody here can see his Facebook');
    await page.close();
  }

  /* ---------------- 3b. a top bar that is not there yet is waited for -------- */
  /*
   * THE REGRESSION THE OWNER FOUND, AND IT WAS MINE.
   *
   * Speeding the switch up meant dropping a blind 2.5-second pause before the
   * menu was opened — and that pause was the only thing that had ever guaranteed
   * Facebook's top bar had finished rendering. Without it this reader ran against
   * an empty bar, built its list of things to click ONCE, found nothing, and both
   * retry rounds then looped over an empty list and returned "no menu" in
   * milliseconds. On his phone: a switch that used to work, replaced by "לא
   * הצלחנו לפתוח את תפריט החשבון" and nothing happening at all.
   *
   * The fixture removes the bar's contents and puts them back after 1.2s, which
   * is exactly the shape of the thing. A reader that waits for a CONTROL rather
   * than for a clock passes it and is faster than the old pause on a bar that is
   * ready immediately.
   */
  {
    const page = await context.newPage();
    await page.goto(`${fixture}#late`);
    const read = await readProfiles(page);
    eq(read.note, 'ok', 'a bar that fills in a second later is waited for, not declared broken');
    eq(
      read.profiles.map((p) => p.name),
      ['Dor Moyal', 'Air Master', 'הפתרון המבריק', 'FreshWave – ניקוי עמוק למזגנים'],
      'and the same list comes back — the delay costs a second, not the feature',
    );
    await page.close();
  }

  {
    const page = await context.newPage();
    await page.goto(`${fixture}#late`);
    const out = await switchProfile(page, 'Air Master');
    eq(out.pressed, 'clicked', 'and the switch itself survives it too — this is the path that broke');
    eq(await picked(page), 'Air Master', 'pressing the row he asked for');
    await page.close();
  }

  /* ------- 3c. the switch collects the logos when they are missing --------- */
  /*
   * THE OTHER HALF OF WHAT HIS SCREEN SHOWED: three identities, three grey
   * initials. The pictures are taken when the profile LIST is read, and the
   * fast switch deliberately stopped re-reading that list afterwards — so on a
   * machine that had never been asked to refresh it since the pictures existed,
   * they would never have arrived at all.
   *
   * The menu is open during a switch regardless. Taking them THERE, and only
   * while any is missing, costs a few screenshots once.
   */
  {
    const page = await context.newPage();
    await page.goto(fixture);
    const out = await switchProfile(page, 'Air Master', { pictures: true });
    eq(out.pressed, 'clicked', 'the switch still happens');
    eq(out.profiles?.length, 4, 'and it brings back every identity in the menu');
    const logo = out.profiles?.find((p) => p.name === 'הפתרון המבריק')?.image?.bytes;
    is(logo && logo.readUInt32BE(16) >= 14, 'each with its own logo, photographed from its own row');
    /*
     * BEFORE THE CLICK, and that is not a detail: the click navigates, and a
     * picture taken afterwards would be of whatever Facebook drew next — or of
     * nothing at all, on a page that has already gone.
     */
    eq(await picked(page), 'Air Master', 'the row was still pressed after the photographs');
    await page.close();
  }

  {
    const page = await context.newPage();
    await page.goto(fixture);
    const out = await switchProfile(page, 'Air Master');
    eq(out.profiles, undefined, 'and a switch that was not asked for pictures takes none — the ordinary case pays nothing');
    await page.close();
  }

  /* ------------------------ 4b. the logo of each identity, off its own row ---- */
  /*
   * WHY PICTURES AT ALL: "שזה ישר יעבור לשם שבחרתי יחד אם הלוגו שלו". The app
   * could show the other identities' NAMES the moment they were read, but the
   * only face this product had ever photographed was the signed-in one — so the
   * bar could not show the chosen identity until the whole switch had finished
   * and a new avatar had been uploaded, half a minute later. With a picture
   * stored per name the app answers the tap immediately.
   *
   * WHAT CAN GO WRONG IS NOT "no picture". It is the WRONG picture: a camera
   * pointed at the first image in the row photographs a tracking pixel, and one
   * pointed at a stale marker photographs the row that used to be in that
   * position — a face beside somebody else's name, which is the exact mistake
   * account.ts was rewritten to stop making, one size smaller.
   */
  let firstShots = new Map<string, Buffer | undefined>();
  {
    const page = await context.newPage();
    await page.goto(fixture);
    const read = await readProfiles(page, { pictures: true });
    eq(
      read.profiles.map((p) => p.name),
      ['Dor Moyal', 'Air Master', 'הפתרון המבריק', 'FreshWave – ניקוי עמוק למזגנים'],
      'asking for the pictures does not change the reading — the same rows, in the same order',
    );
    firstShots = new Map(read.profiles.map((p) => [p.name, p.image?.bytes]));

    const dor = firstShots.get('Dor Moyal');
    const page1 = firstShots.get('הפתרון המבריק');
    is(dor && dor.length > 0, 'a row with an avatar comes back with one');
    is(dor?.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'and it is a real PNG, not a description of one');
    /*
     * THE ONE ASSERTION THAT PROVES THE CAMERA AIMED. Each row in the fixture
     * is a different colour, so identical bytes would mean every "logo" is a
     * photograph of the same element — which is what a reader that queries the
     * menu instead of the row produces, and it looks perfectly fine until two
     * names carry one face.
     */
    is(page1 && dor && !page1.equals(dor), 'each row is photographed from ITSELF — two rows never come back as the same picture');
    /* The 1px image sits FIRST inside Dor's row. A camera that takes whatever
       image it finds first would have uploaded that. */
    /* Read out of the PNG's own header (width lives at byte 16), because the
       point is the SIZE of what was photographed: a picture one pixel wide is
       the tracking pixel, whatever it weighs. */
    is(dor && dor.readUInt32BE(16) >= 14, 'a tracking pixel beside the avatar is skipped — the avatar is what is photographed');
    eq(
      firstShots.get('FreshWave – ניקוי עמוק למזגנים'),
      undefined,
      'and a row whose ONLY image is a tracking pixel comes back with no picture at all — an initial is honest, a smudge is not',
    );
    await page.close();
  }

  /* ---- 4c. the marks come off, so a reordered menu is still photographed right */
  /*
   * Facebook reorders this menu — the signed-in profile moves to the top after
   * a switch — and the rows carry no id, no class and usually no link, so the
   * only handle on one is a mark this reader writes onto it. A mark left from
   * the previous read points the camera at whatever now sits in that position,
   * and the picture then belongs to the wrong name.
   */
  {
    const page = await context.newPage();
    await page.goto(fixture);
    await readProfiles(page, { pictures: true });
    /* The page moves to the top, exactly as Facebook does it. */
    await page.evaluate(() => {
      const row = document.querySelector('[data-row="page1"]')?.parentElement;
      const first = document.querySelector('[data-row="dor"]')?.parentElement;
      if (row && first?.parentElement) first.parentElement.insertBefore(row, first);
    });
    const again = await readProfiles(page, { pictures: true });
    eq(
      again.profiles.map((p) => p.name),
      ['הפתרון המבריק', 'Dor Moyal', 'Air Master', 'FreshWave – ניקוי עמוק למזגנים'],
      'the reordered menu is read in its new order',
    );
    const moved = again.profiles.find((p) => p.name === 'הפתרון המבריק')?.image?.bytes;
    is(moved && moved.equals(firstShots.get('הפתרון המבריק')!), 'and the picture still belongs to the NAME, not to the position it used to hold');
    const dorAgain = again.profiles.find((p) => p.name === 'Dor Moyal')?.image?.bytes;
    is(dorAgain && dorAgain.equals(firstShots.get('Dor Moyal')!), 'both ways round — the row that was pushed down keeps its own face too');
    eq(await page.$$('[data-anx-row]').then((n) => n.length), 4, 'one mark per row, not one per read');

    /*
     * AND THE CASE THAT ACTUALLY BITES: a row that STOPS being a profile.
     *
     * Reordering alone forgives a reader that never clears its marks, because
     * the same rows get re-marked. But a row that drops out of the answer keeps
     * the mark it was given — and it still comes first in the page — so "row 0"
     * then matches two elements and the camera photographs the one that left.
     * The picture that comes back belongs to a name that is no longer there.
     */
    await page.evaluate(() => {
      const row = document.querySelector('[data-row="page1"] span');
      if (row) row.textContent = 'הגדרות ופרטיות';
    });
    const shorter = await readProfiles(page, { pictures: true });
    eq(
      shorter.profiles.map((p) => p.name),
      ['Dor Moyal', 'Air Master', 'FreshWave – ניקוי עמוק למזגנים'],
      'a row that stopped being a profile is gone from the answer',
    );
    const stillDor = shorter.profiles[0]?.image?.bytes;
    is(
      stillDor && stillDor.equals(firstShots.get('Dor Moyal')!),
      'and the row that took its place at the front is photographed from itself — not from the one that dropped out and kept its mark',
    );
    await page.close();
  }

  /* -------------- 4d. and a read that was not asked for pictures takes none --- */
  {
    const page = await context.newPage();
    await page.goto(fixture);
    await readProfiles(page, { pictures: true });
    const plain = await readProfiles(page);
    is(plain.profiles.every((p) => !p.image), 'a plain read returns no pictures — the switch itself has no use for them and should not pay for them');
    eq(await page.$$('[data-anx-row]').then((n) => n.length), 0, 'and it leaves nothing of ours behind in Facebook’s page');
    await page.close();
  }

  await browser.close();

  /* ------------------------------------ 5. the promises the code must keep */
  const src = readFileSync(new URL('../facebook/profiles.ts', import.meta.url), 'utf8');
  const profilesSrc = src;
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  is(
    /if \(!names\.some\(\(r\) => r\.name === name\)\)/.test(code),
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
    /const before = await this\.currentUserId\(\)/.test(body) && /await this\.awaitIdentity\(page, before, name\)/.test(body),
    'the identity before the click is captured and the switch is measured against it — pressing a row is not evidence that Facebook moved',
  );
  is(
    /if \(!account\) \{[\s\S]{0,200}?ok: false/.test(body),
    'and when it cannot be established, the command FAILS rather than reporting a switch nobody verified',
  );
  /*
   * THE WAIT IS A WATCH, NOT A SLEEP — which is the whole of "גג 5-7 שניות".
   *
   * A fixed pause is wrong in both directions: paid in full when Facebook
   * answered in half a second, and too short on a slow machine, where it turns
   * into a false "the switch did not happen". The loop below returns the instant
   * either proof lands.
   */
  /*
   * AND A BAR THAT NEVER RENDERED IS RETRIED BY THE MACHINE, not by the owner.
   * "נסו שוב בעוד רגע" is a fair thing to say once; saying it instead of doing
   * the one thing that fixes it — loading the page again — is making a person do
   * the computer's job.
   */
  is(
    /if \(pressed === 'no-menu'\) \{[\s\S]{0,600}?page\.reload\(/.test(body),
    'a menu that would not open is retried once on a fresh page before anything is reported',
  );
  is(
    (body.match(/page\.reload\(/g) ?? []).length === 1,
    'once, and only once — looping on somebody’s live Facebook account is not how to find out why',
  );

  /*
   * AND THE MENU IS GIVEN TIME TO FILL, not judged on the instant it appears.
   *
   * A source assertion rather than a browser one, deliberately: the retry rounds
   * are forgiving enough that a fixture cannot tell the two apart reliably, and
   * a test that passes either way is worse than none. What it fixes is real —
   * Facebook mounts the container before its contents — and the call is the
   * thing to protect.
   */
  is(
    /const opened = await waitForAccountMenu\(page, 4_000\);/.test(profilesSrc),
    'the menu is waited for after the click, not read on the instant it appears',
  );
  /* And an open notifications popover does not eat the first click. */
  is(
    /await page\.keyboard\.press\('Escape'\)[\s\S]{0,2500}?for \(let round = 0/.test(profilesSrc),
    'whatever was already open is closed before the avatar is reached for',
  );

  const watcher = session.slice(session.indexOf('private async awaitIdentity('));
  is(/who\.id && who\.id !== before/.test(watcher), 'the cookie moving is proof, and it ends the wait at once');
  is(
    /who\.name && who\.name === wanted/.test(watcher),
    'and so is the rendered name, because Facebook keeps one c_user across some profile pairs — a cookie that did not move is not evidence that nothing happened',
  );
  is(/return null/.test(watcher), 'and running out of time returns "could not establish", never a success');
  is(
    !/waitForTimeout\(4_000\)/.test(readFileSync(new URL('../facebook/profiles.ts', import.meta.url), 'utf8')),
    'the four-second pause after the click is gone — it was time spent whatever had happened',
  );
  {
    const branch = worker.slice(worker.indexOf("cmd.command === 'switch'"));
    is(
      /await recordAccount\(state, r\.account, logo\)/.test(branch),
      'and the account is written afterwards, so the chip and the group scope follow the identity that now publishes',
    );
    /*
     * WITH THE LOGO IT ALREADY HAS. The identity's picture was photographed out
     * of Facebook's own account menu when the list was read, so the switch does
     * not stop to take it again — that screenshot, plus the /me fallback behind
     * it, was most of the half-minute the owner was watching.
     *
     * And it must be PASSED, not left out: a light read carries no picture, and
     * without one handed over recordAccount would fall into its "nothing on the
     * page was provably theirs" branch and CLEAR the stored avatar — the
     * dashboard would lose the face on every switch.
     */
    is(
      /state\.profiles\?\.find\(\(p\) => p\.name === \(r\.account\?\.name \|\| wanted\)\)\?\.image/.test(branch),
      'the picture comes from the list the worker already read, not from a fresh screenshot',
    );
    /*
     * AND WHEN IT HAS NO SUCH LIST, IT COLLECTS ONE ON THE WAY PAST.
     *
     * Without this the owner's screen stays as he photographed it — three
     * identities, three grey initials — because the logos are taken when the
     * list is read and the fast switch stopped re-reading it. The menu is open
     * during the switch anyway; asking only while something is missing means the
     * cost is paid once and never again.
     */
    is(
      /const needLogos = !state\.profiles\?\.length \|\| state\.profiles\.some\(\(p\) => !p\.image\)/.test(branch),
      'a machine with no logos stored knows it',
    );
    is(
      /session\.switchTo\(headless, wanted, \{ pictures: needLogos \}\)/.test(branch),
      'and asks for them during the switch itself rather than never',
    );
    is(
      /if \(r\.profiles\?\.length\) await recordProfiles\(state, r\.profiles\);[\s\S]{0,200}?const logo =/.test(branch),
      'they are stored BEFORE the identity is written, so the face that goes up is the one just photographed',
    );
    const record = worker.slice(worker.indexOf('async function recordAccount('), worker.indexOf('async function recordProfiles('));
    is(
      /account\.imageNote === undefined/.test(record) && /if \(storedPicture\) patch\.fb_avatar_url = storedPicture;/.test(record),
      '"nobody looked for a picture" is a different fact from "we looked and found none", and only the second one clears the stored face',
    );
  }

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

  /*
   * EVERY COMMAND THE SCREEN CAN SEND, THE DATABASE WILL ACCEPT.
   *
   * social_worker_commands.command carries a CHECK that lists the commands by
   * name. Two were added to the app and not to that list, so the insert was
   * refused before the machine heard of it — the owner pressed "חפש
   * פרופילים", nothing happened, and every explanation pointed at the worker,
   * which had done nothing wrong and had not even been asked.
   *
   * Three files have to agree on this set and none of them can see the others,
   * so the agreement is checked rather than remembered.
   */
  {
    const types = readFileSync(new URL('../../src/lib/social/types.ts', import.meta.url), 'utf8');
    const union = types.match(/export type WorkerCommandName =([^;]+);/)?.[1] ?? '';
    const named = [...union.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    is(named.length >= 7, `the app names its commands (${named.join(', ')})`);

    const sql = readFileSync(new URL('../../supabase/social-latest.sql', import.meta.url), 'utf8');
    /* The LAST one wins when the file is run top to bottom, so that is the one
       that decides — an earlier, shorter list further up is harmless. */
    const checks_ = [...sql.matchAll(/check \(command in \(([^)]*)\)\)/g)];
    is(checks_.length > 0, 'the migration constrains which commands may be inserted');
    const allowed = [...(checks_.at(-1)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    for (const c of named) {
      is(allowed.includes(c), `the database accepts '${c}' — a command the app can send and the database refuses is a button that does nothing`);
    }
  }

  /* ------------- 6. a group that refuses a PAGE is never switched off ------- */
  /*
   * THE MOST EXPENSIVE MISTAKE THIS FEATURE COULD MAKE, and it was already
   * written and waiting before the feature existed.
   *
   * When Facebook answers "you cannot post here", the worker concludes the
   * account left the group and sets enabled = false — permanently, so no later
   * round even considers it. That inference is sound for a person and false
   * for a Page: Facebook refuses a Page in every group whose admin did not
   * allow Pages, which is most of them, and the same group publishes normally
   * the moment the personal profile is back.
   *
   * So one round published as a Page would have retired a working group list,
   * silently, with a reason that reads perfectly sensibly in the log — and it
   * would not have come back when the owner switched back. The owner publishes
   * to hundreds of groups a week; he would have found out by noticing the
   * number had fallen.
   */
  {
    const branch = worker.slice(worker.indexOf("err.kind === 'cannot_post'"), worker.indexOf("const afterSubmit ="));
    is(branch.length > 200, 'the cannot_post branch is where this is decided');
    is(
      /if \(state\.asPage\) \{/.test(branch),
      'the branch asks who is publishing before it acts — "cannot post here" means two different things',
    );
    const asPage = branch.slice(branch.indexOf('if (state.asPage)'), branch.indexOf('await finish({ status: \'skipped\', step: \'\', skip_reason: message'));
    is(
      !/enabled: false/.test(asPage),
      'and while a Page is publishing it NEVER switches the group off — the group has not been left, it is closed to that identity',
    );
    is(
      /enabled: false/.test(branch.replace(asPage, '')),
      'while for a person it still does, which is the behaviour that was there and is correct',
    );
    is(/page_not_allowed/.test(asPage), 'the skip is logged, so the refused groups are a list the owner can read');
    is(
      /מפרופיל אישי היא עובדת כרגיל/.test(asPage),
      'and the reason says the group is fine — otherwise it reads like a broken group and gets deleted by hand',
    );
  }

  /*
   * AND THE FLAG SURVIVES A RESTART. The profiles are read from Facebook only
   * on request, so after a restart — which the self-updater performs by itself
   * — the worker would run as "not a Page" until somebody asked again, which
   * might be never. That window is exactly when the branch above would do the
   * damage.
   */
  is(
    /fb_profiles, fb_user_name/.test(worker) && /markIdentity\(state\)/.test(worker),
    'the identity is restored from the worker\u2019s own row at startup, not left to be asked for',
  );

  /* ----------- 7. the logo is stored per NAME, and the bar never lies ------- */
  /*
   * WHERE THE PICTURES LAND. An index would be the obvious path — `…-p0.png` —
   * and it would be wrong for the same reason the marker above has to be
   * cleared: Facebook reorders that menu, so position 0 is the personal face one
   * minute and the business logo the next. Every screen that had already loaded
   * the first one would go on showing it beside the other name, and nothing
   * about that looks broken.
   */
  {
    const record = worker.slice(worker.indexOf('async function recordProfiles('), worker.indexOf('async function markIdentity('));
    is(record.length > 400, 'recordProfiles is where the pictures are stored');
    is(
      /createHash\('sha1'\)\.update\(p\.name\)/.test(record),
      'the stored path is derived from the NAME — an index would hand one identity the other one’s logo when Facebook reorders the menu',
    );
    is(
      /before\.get\(p\.name\)/.test(record),
      'and a row we could not photograph this time keeps the picture it had — the same rule the avatar has, so the list never flickers between logos and initials',
    );
  }

  /*
   * AND THE ONE RULE THE BAR AT THE TOP MUST NEVER BREAK.
   *
   * Showing the chosen name and logo the instant they are tapped is the point of
   * this — but the computer has not switched yet, and every post that goes out
   * is signed by whoever this chip names. So the chip may show the choice and
   * must not CLAIM it: the pulsing ring and "מעביר פרופיל…" say it is under way,
   * and "מפרסם" stays with the identity the machine confirmed.
   */
  {
    const shell = readFileSync(new URL('../../src/components/social/SocialShell.tsx', import.meta.url), 'utf8');
    is(/const \[pending, setPending\] = useState<Identity \| null>/.test(shell), 'the bar holds the chosen identity separately from the confirmed one');
    is(
      /label: 'מעביר פרופיל…'/.test(shell) && /border-t-brand-400 motion-safe:animate-spin/.test(shell),
      'and says out loud that it is mid-switch, rather than showing the new name as a fact',
    );
    is(
      /const active = Boolean\(confirmedWho\?\.name\) && p\.name === confirmedWho\?\.name;/.test(shell),
      '"מפרסם" is decided by the CONFIRMED identity — for the seconds those differ, the old one is the true one',
    );
    is(
      /waitForWorkerCommand\(queued\)/.test(shell),
      'the outcome is read from the command row rather than waited for on the minute clock — a failed switch used to look identical to one in progress for a full minute',
    );
    is(
      /cmd\?\.status === 'failed'/.test(shell) && /cmd\.result/.test(shell),
      'and a refused switch puts the computer’s own reason on screen, in the panel it was asked from',
    );
    /*
     * BOTH PICKERS, ONE ANSWER. The dashboard card has a picker of its own — the
     * same tap — and it used to send the command and never mention it again, so a
     * refused switch there was silent.
     */
    const dash = readFileSync(new URL('../../src/app/social/page.tsx', import.meta.url), 'utf8');
    is(/waitForWorkerCommand\(id\)/.test(dash), 'the card’s picker waits for the same answer as the bar’s');
    /*
     * AND NEITHER OF THEM IMPLEMENTS THE WAIT ITSELF: two clocks on one fact is
     * the defect class this module keeps removing, one layer up.
     */
    const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
    is(
      /export async function waitForWorkerCommand/.test(client) && /status === 'done' \|\| cmd\?\.status === 'failed'/.test(client),
      'the wait lives in one place, and "still running" is not reported as a failure',
    );
  }

  /* ------- 8. the wait in front of the loop may never end the process ------ */
  /*
   * THE CRASH THE OWNER SAW AS "כבוי".
   *
   * The idle wait grew a database read so that a tap on his phone would be
   * picked up in a second instead of five. It sits OUTSIDE the loop's
   * try/catch — it used to be a sleep, and a sleep cannot fail — and
   * workerDb() throws when a Supabase sign-in or token refresh fails, which is
   * an ordinary night on a home connection. One such failure ended the process:
   * the queue stopped, the switch he had asked for sat unread, and the only
   * sign of any of it was a monitor icon reading "off".
   *
   * The publishing loop survives everything it meets. The waiting in front of it
   * has to as well.
   */
  {
    const idle = worker.slice(worker.indexOf('async function idleWait('), worker.indexOf('async function nextAllowedAt('));
    is(idle.length > 200, 'the idle wait is where this is decided');
    is(
      /try \{[\s\S]*?await workerDb\(\)[\s\S]*?\} catch \{/.test(idle),
      'its database read is inside a try/catch — a failed read is one unanswered slice of waiting, never the end of the program',
    );
    is(
      /await idleWait\(state\.id\)\.catch\(\(\) => undefined\)/.test(worker),
      'and the call is guarded too, because "the wait cannot fail" is exactly what was believed last time',
    );
  }

  /* ---- 9. and the screen tells "working" apart from "nothing is running" --- */
  {
    const shell = readFileSync(new URL('../../src/components/social/SocialShell.tsx', import.meta.url), 'utf8');
    is(
      /pcOnline === false\n?\s*\? \{ label: 'המחשב כבוי — הבקשה ממתינה לו'/.test(shell),
      'a switch asked of a computer that is switched off says so, instead of turning a ring over a queue nobody is reading',
    );
    is(
      /התוכנה במחשב לא פועלת כרגע/.test(shell),
      'and it says it at the moment it is asked for, with what to do about it',
    );
  }

  console.log(`profile switcher tests OK — ${checks} assertions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
