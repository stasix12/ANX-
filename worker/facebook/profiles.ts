import type { ElementHandle, Locator, Page } from 'playwright-core';
import { patterns } from './selectors';

/**
 * THE OTHER PROFILES ON THIS FACEBOOK ACCOUNT, AND THE WAY OVER TO ONE.
 *
 * WHY. A customer opened the account menu on the machine that publishes and
 * showed two entries: his own name, and his business — "יש לו פרופיל נוסף,
 * אני רוצה שתיהיה לו אופציה לעבור". Until now this product had exactly one
 * identity, the account whose `c_user` cookie the browser profile holds, and
 * every group post went out under it. A person who runs their business under
 * a second profile had no way to say so.
 *
 * WHAT THIS IS NOT. It is not a way around anything. Switching profiles is
 * Facebook's own feature, offered in Facebook's own menu, and all this does is
 * open that menu and press what is in it. Nothing is forged, no session is
 * copied, no restriction is stepped around. If the menu is not there — because
 * the account has no second profile, or because Facebook redrew it — that is
 * reported as what it is.
 *
 * HOW A ROW IS RECOGNISED, which is the whole difficulty. Facebook's markup
 * carries no stable class, no id, and on these rows usually not even a link.
 * So the reader anchors on the one thing in that menu with a NAME rather than
 * a shape: "הצגת כל הפרופילים" / "See all profiles". The profiles are the rows
 * that sit above it inside the same container; everything below is the ordinary
 * menu — settings, help, report, display, log out — and those are excluded by
 * name as well, in all three languages this product meets.
 *
 * WHAT IT REFUSES TO GUESS. A row that yields no readable name is dropped
 * rather than listed as a blank. A menu that yields nothing at all returns an
 * empty list and a reason, and the caller says so on screen. The one thing
 * this must never do is offer a person a button that switches them to
 * something nobody identified — which is the profile-picker version of the
 * "wrong face on the dashboard" mistake account.ts documents at length.
 */

export type ProfileKind = 'profile' | 'page';

export interface FacebookProfile {
  /**
   * Facebook's numeric id, when the row gives one up — most do not, because
   * the switcher rows are buttons rather than links. Empty is normal and the
   * name is what a switch is performed by.
   */
  id: string;
  /** Exactly as Facebook rendered it. Never trimmed to a guess, never invented. */
  name: string;
  /*
   * A PAGE OR A PERSON, and the difference is not cosmetic.
   *
   * Facebook lets a Page post in a group only where the group's admin allowed
   * Pages in. So a group that refuses a Page has NOT been left — it is simply
   * closed to that identity, and the same group publishes perfectly the moment
   * the personal profile is back. Without this field the worker cannot tell
   * those two apart, and it treats "cannot post here" as "you left this
   * group" and switches the group off for good.
   *
   * Read from the word Facebook prints under the name ("דף" / "Page"), which
   * is the only thing in that menu that says so.
   */
  kind: ProfileKind;
  /*
   * THE ROW'S OWN PICTURE — a Page's logo, a person's face.
   *
   * "שזה ישר יעבור לשם שבחרתי יחד אם הלוגו שלו". The dashboard could show the
   * NAMES of the other profiles the moment they were read, but not their
   * pictures: the only face this product ever photographed was the signed-in
   * one, so every other row was an initial in a grey circle, and the header
   * could not show the chosen identity until the switch had finished and the
   * new avatar had been uploaded — half a minute later.
   *
   * Photographed from the element rather than taken as a URL, for the reason
   * account.ts gives at length: Facebook's CDN links are signed and expire, so
   * a stored link is a picture that works today and is a broken image next
   * week.
   *
   * Absent is normal and is not an error: a row Facebook drew without a
   * picture, or one we could not photograph, keeps whatever was stored for
   * that name before and falls back to the initial. A picture is never
   * invented and never borrowed from another row — a face beside the wrong
   * name is the mistake account.ts was rewritten to stop making.
   */
  image?: { bytes: Buffer; contentType: string } | null;
}

export interface ProfileRead {
  profiles: FacebookProfile[];
  /** Why the list is empty, for the worker's log. Never rendered to a customer. */
  note: 'ok' | 'no-menu' | 'no-anchor' | 'no-rows';
}

/*
 * THE MENU CONTAINER — and NOT role="navigation".
 *
 * It was in this list, and Facebook's left-hand navigation is a permanent,
 * always-visible `role="navigation"` landmark. So "is a menu already open?"
 * answered yes on every page load, the avatar was never clicked, the side bar
 * was read instead of the account menu, and the honest answer that came back
 * — "no profile list here" — was about the wrong element entirely. A selector
 * that matches furniture reports the furniture.
 */
const MENU_SELECTOR = 'div[role="menu"], div[role="dialog"]';

/**
 * Open the account menu, or say it could not be opened.
 *
 * Two ways in, most stable first: the button Facebook labels (in whichever
 * language the account runs in), and failing that the last control in the top
 * banner, which is where the avatar sits in every layout this has been seen
 * in. The second is a fallback and is treated as one — if the menu does not
 * appear after it, the read gives up rather than clicking on.
 */
async function openAccountMenu(page: Page): Promise<ElementHandle<Element> | null> {
  /*
   * IS THIS THE ACCOUNT MENU?
   *
   * Recognised by the items it ALWAYS has — settings, help, log out — and not
   * by the profile list, which is the thing being looked for. Using the list
   * as the identity test was the obvious shortcut and it destroyed the one
   * distinction that matters: an account with a single profile then looked
   * exactly like a menu that never opened, and the screen could no longer tell
   * "you have no second profile" from "we could not read your Facebook".
   */
  const isAccountMenu = async (el: ElementHandle<Element> | null): Promise<boolean> => {
    if (!el) return false;
    return await el
      .evaluate(
        (root, src) => {
          const text = (root as HTMLElement).innerText || '';
          return new RegExp(src.stuff, 'i').test(text) || new RegExp(src.all, 'i').test(text);
        },
        { stuff: patterns.menuStuff.source, all: patterns.allProfiles.source },
      )
      .catch(() => false);
  };

  /*
   * ALREADY OPEN? ONLY IF IT IS THE RIGHT ONE.
   *
   * Presence is not enough and neither is visibility: Facebook keeps dialogs
   * and menus around for all sorts of things.
   */
  for (const handle of await page.$$(MENU_SELECTOR)) {
    if (await handle.isVisible().catch(() => false) && (await isAccountMenu(handle))) return handle;
  }

  /*
   * THE AVATAR, tried from the end of the banner backwards.
   *
   * Facebook labels that button differently by locale and by week, and a
   * pattern loose enough to catch every wording is also loose enough to catch
   * the wrong control. So a click is not trusted on the strength of its label:
   * whatever opens is checked for the anchor, and if it is the wrong menu it
   * is closed and the next candidate tried. Three attempts, then it gives up
   * and says so, which is better than reading something and calling it a
   * profile list.
   */
  /*
   * WAIT FOR THE BAR TO HAVE CONTROLS IN IT — not merely to exist.
   *
   * THIS IS THE BUG THE OWNER HIT, AND IT WAS MINE. Facebook ships the banner
   * element early and fills it with buttons when its app renders. The caller
   * used to spend a blind two and a half seconds before ever reaching here, so
   * by this line there was always something to click; when that pause was
   * removed in the name of speed, this function started running against an
   * empty bar. The candidate list below was built ONCE, came back empty, and
   * both retry rounds then looped over nothing and returned "no menu" —
   * instantly, with a message asking him to try again in a moment. "לפני זה
   * היה מעביר משתמש לפחות, עכשיו כלום."
   *
   * Waiting for a control rather than for a clock is what the whole speed change
   * was supposed to be: it returns the moment the bar is usable, and it gives a
   * slow machine the time a fixed pause never could.
   */
  const bannerButtons = 'div[role="banner"] div[role="button"], div[role="banner"] [aria-label]';
  await page.waitForSelector(bannerButtons, { state: 'visible', timeout: 10_000 }).catch(() => undefined);

  /*
   * THE CANDIDATES ARE READ AGAIN EVERY ROUND, for the same reason.
   *
   * A list built once is a photograph of a bar that was still assembling
   * itself; a round that finds nothing has to be able to find something on the
   * next one, or the retry is not a retry at all.
   */
  const candidatesNow = async (): Promise<Locator[]> => {
    const banner = page.locator(bannerButtons);
    const named = page.getByRole('button', { name: patterns.accountMenu });
    const out: Locator[] = [];
    if (await named.count().then((n) => n > 0).catch(() => false)) out.push(named.first());
    const inBanner = await banner.count().catch(() => 0);
    for (let i = 0; i < Math.min(inBanner, 2); i += 1) out.push(banner.nth(inBanner - 1 - i));
    return out;
  };

  /*
   * THREE ROUNDS, WITH A PAUSE. The first version tried each candidate once and
   * gave up — and the one moment this is asked most is right after a switch,
   * when Facebook has just reloaded into another identity and the banner is
   * still assembling itself. The owner met exactly that: "לא הצלחנו לפתוח את
   * תפריט החשבון", on an account where the menu had been read perfectly a
   * minute earlier.
   *
   * Another pass costs a second on the rare failure and nothing at all on the
   * ordinary path, where the first candidate answers.
   */
  for (let round = 0; round < 3; round += 1) {
    if (round) await page.waitForTimeout(1_500);
    for (const candidate of await candidatesNow()) {
      await candidate.click({ timeout: 8_000 }).catch(() => undefined);
      const opened = await page.waitForSelector(MENU_SELECTOR, { state: 'visible', timeout: 6_000 }).catch(() => null);
      if (await isAccountMenu(opened)) return opened;
      await page.keyboard.press('Escape').catch(() => undefined);
      await page.waitForTimeout(400);
    }
  }
  return null;
}

/**
 * The names above "הצגת כל הפרופילים", and nothing else.
 *
 * Runs inside the page because the decision is a document-order one — which
 * rows come BEFORE the anchor — and doing that from outside would mean a
 * round trip per candidate on a menu that Facebook may close underneath us.
 */
async function rowsInMenu(
  menu: ElementHandle<Element>,
  mark: boolean,
): Promise<{ names: { name: string; kind: ProfileKind }[]; note: ProfileRead['note'] }> {
  return await menu.evaluate((root, source) => {
    const allProfiles = new RegExp(source.allProfiles, 'i');
    const noise = new RegExp(source.menuStuff, 'i');

    /*
     * LAST TIME'S MARKS COME OFF FIRST.
     *
     * The rows are marked so that the picture in each one can be photographed
     * from outside the page — an index is the only handle these rows give us,
     * since they carry no id, no class and usually no link. This menu is read
     * more than once on the same page (a switch reads it, presses a row, and
     * reads it again afterwards), and a mark left from the previous read would
     * point the camera at the row that used to be in that position.
     */
    for (const stale of Array.from(root.querySelectorAll('[data-anx-row]'))) stale.removeAttribute('data-anx-row');

    const candidates = Array.from(
      root.querySelectorAll('div[role="button"], div[role="menuitem"], a[role="link"], a[role="menuitem"], a'),
    ) as HTMLElement[];

    /*
     * NO NAMED HELPER IN HERE, and that is not a style choice.
     *
     * tsx's esbuild rewrites `const f = () => …` into `__name(() => …, 'f')`,
     * and a function handed to page.evaluate ships as source — so the __name
     * call travels into the page and the helper does not. The result is
     * "ReferenceError: __name is not defined" from inside a browser, which
     * this codebase has paid for more than once (session.ts:190,
     * account.ts:126, postIndex.ts:69). The real session installs a __name
     * shim; a bare context has none, and this reader must work in both.
     */
    const texts = candidates.map((el) => (el.innerText || el.textContent || '').trim());

    const anchorIndex = texts.findIndex((t) => allProfiles.test(t));
    const anchor = anchorIndex === -1 ? undefined : candidates[anchorIndex];
    if (!anchor) return { names: [] as { name: string; kind: ProfileKind }[], note: 'no-anchor' as const };

    /*
     * A row is a candidate that comes before the anchor and is not itself an
     * ancestor of it — the menu is nested, so the anchor's own wrappers also
     * "come before" it in document order and would otherwise be read as
     * profiles whose text is the entire menu.
     */
    const names: { name: string; kind: ProfileKind }[] = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const el = candidates[i];
      if (el === anchor) break;
      if (el.contains(anchor)) continue;
      const text = texts[i];
      if (!text || noise.test(text)) continue;
      /*
       * A ROW MAY BE TWO LINES, AND THE SECOND IS NOT PART OF THE NAME.
       *
       * A Page is drawn as its name with the word "דף" ("Page") beneath it.
       * This used to reject any text containing a newline — a guard against a
       * container that had swallowed its children — and that guard quietly
       * threw away every Page. The protection is kept by bounding how MANY
       * lines and how long the whole thing is, rather than by forbidding the
       * second line: a wrapper holding the menu is long and has many lines, a
       * Page row has two short ones.
       */
      const lines = text.split('\n').map((t) => t.trim()).filter(Boolean);
      if (!lines.length || lines.length > 3 || text.length > 80) continue;
      /*
       * AND THE LABEL MAY BE ON THE SAME LINE.
       *
       * Whether "דף" lands on its own line or beside the name is a matter of
       * one CSS display value, which is not ours and changes without notice.
       * Both shapes are handled: the second line is dropped above, and a
       * trailing label word is trimmed here. Only these exact words, anchored
       * at the end — a Page genuinely called "הדף שלי" keeps its name.
       */
      const name = lines[0].replace(/[\s·|-]+(דף|page|страница)$/i, '').trim();
      if (!name || name.length > 60) continue;
      if (names.some((r) => r.name === name)) continue;
      /* The label says which it is, whether it sits on its own line or ran
         into the name above. Anything without it is a person. */
      const labelled = /(^|[\s·|-])(דף|page|страница)$/i.test(lines[1] ?? '') || /[\s·|-](דף|page|страница)$/i.test(lines[0]);
      /* The row's position in the answer, written onto the row itself, so the
         camera outside can find exactly this one. Only when pictures were
         asked for: nothing touches Facebook's DOM for a read that has no use
         for it. */
      if (source.mark) el.setAttribute('data-anx-row', String(names.length));
      names.push({ name, kind: labelled ? 'page' : 'profile' });
    }
    return { names, note: names.length ? ('ok' as const) : ('no-rows' as const) };
  }, { allProfiles: patterns.allProfiles.source, menuStuff: patterns.menuStuff.source, mark });
}

/**
 * Photograph the picture inside one marked row.
 *
 * `img` OR `svg`, because Facebook draws these both ways, and only a node that
 * is actually the size of an avatar: a 1px tracking pixel and a 10px badge are
 * both `img` elements inside these rows, and either one photographed would put
 * a smudge on the dashboard beside somebody's name.
 *
 * Every failure returns null. This rides on a read that must not fail because
 * a picture did — the names are the feature, the pictures make it pleasant.
 */
async function rowPicture(menu: ElementHandle<Element>, index: number): Promise<FacebookProfile['image']> {
  const nodes = await menu.$$(`[data-anx-row="${index}"] img, [data-anx-row="${index}"] svg`).catch(() => []);
  for (const node of nodes) {
    const box = await node.boundingBox().catch(() => null);
    if (!box || box.width < 14 || box.height < 14) continue;
    const bytes = await node.screenshot({ type: 'png', timeout: 5_000 }).catch(() => null);
    /* A sane avatar is kilobytes; the bound is account.ts's, for the same
       reason — a "picture" measured in megabytes is not one. */
    if (bytes?.length && bytes.length < 8_000_000) return { bytes, contentType: 'image/png' };
  }
  return null;
}

/**
 * How many rows we are willing to photograph.
 *
 * The menu holds a handful of profiles; this is a bound against a read that
 * went wrong, not a product limit. Each picture is one screenshot on somebody
 * else's real account, and a loop with no ceiling on markup we do not own is
 * how a two-second read becomes a two-minute one.
 */
const PICTURE_LIMIT = 12;

/**
 * Every profile this account can switch to, the signed-in one included.
 *
 * Best-effort and read-only, in the same spirit as readAccountProfile: it
 * rides on a page that is already open, and a failure here must never fail the
 * thing that opened it.
 */
export async function readProfiles(page: Page, opts?: { pictures?: boolean }): Promise<ProfileRead> {
  const menu = await openAccountMenu(page);
  if (!menu) return { profiles: [], note: 'no-menu' };
  try {
    const wantPictures = Boolean(opts?.pictures);
    const { names, note } = await rowsInMenu(menu, wantPictures);
    const profiles: FacebookProfile[] = [];
    for (let i = 0; i < names.length; i += 1) {
      profiles.push({
        id: '',
        name: names[i].name,
        kind: names[i].kind,
        image: wantPictures && i < PICTURE_LIMIT ? await rowPicture(menu, i) : null,
      });
    }
    return { profiles, note };
  } finally {
    /* Put the menu back the way it was found. Escape rather than a click
       somewhere neutral, which on Facebook is never reliably neutral. */
    await page.keyboard.press('Escape').catch(() => undefined);
  }
}

/**
 * Press the row with this name, and wait for Facebook to become it.
 *
 * The caller confirms the outcome by re-reading the account — this returns
 * only what it was able to DO, never what it hopes happened. A switch that
 * Facebook refused, or answered with a security check, looks from in here
 * exactly like one that worked, and the c_user cookie is the only witness.
 */
export async function switchProfile(
  page: Page,
  name: string,
  opts?: {
    /*
     * PHOTOGRAPH THE ROWS WHILE WE ARE IN HERE.
     *
     * The menu is open anyway — it has to be, to find the row to press — so a
     * caller that is missing the identities' logos can have them for the price
     * of a few element screenshots instead of a second visit. Asked for only
     * when they are actually missing: once they are stored, every later switch
     * pays nothing.
     */
    pictures?: boolean;
  },
): Promise<{ pressed: 'clicked' | 'no-menu' | 'not-found'; profiles?: FacebookProfile[] }> {
  const menu = await openAccountMenu(page);
  if (!menu) return { pressed: 'no-menu' };

  const wantPictures = Boolean(opts?.pictures);
  const { names } = await rowsInMenu(menu, wantPictures);
  /* Only a row this reader itself returned may be pressed. Without this the
     locator below could match the same words anywhere inside the menu. */
  if (!names.some((r) => r.name === name)) {
    await page.keyboard.press('Escape').catch(() => undefined);
    return { pressed: 'not-found' };
  }

  /* Taken BEFORE the click, because the click navigates and the menu — with
     every picture in it — is gone the moment Facebook reloads. */
  const profiles: FacebookProfile[] = [];
  if (wantPictures) {
    for (let i = 0; i < names.length; i += 1) {
      profiles.push({ id: '', name: names[i].name, kind: names[i].kind, image: i < PICTURE_LIMIT ? await rowPicture(menu, i) : null });
    }
  }

  const row = page.locator(MENU_SELECTOR).locator(`text="${name.replace(/"/g, '\\"')}"`).first();
  await row.click({ timeout: 10_000 });

  /*
   * Facebook reloads into the other profile, and sometimes asks to confirm
   * first. Both are waited for the same way: a settle, then the confirm if one
   * appeared, then a settle again. No fixed assumption about which happened.
   */
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);
  const confirm = page.getByRole('button', { name: patterns.switchConfirm }).first();
  if (await confirm.count().then((n) => n > 0).catch(() => false)) {
    await confirm.click({ timeout: 8_000 }).catch(() => undefined);
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);
  }
  /*
   * AND THEN NOTHING — THE FIXED FOUR-SECOND WAIT IS GONE.
   *
   * It used to sit here, and it was four seconds spent whatever had happened:
   * paid in full when Facebook had already switched, and not nearly enough when
   * it had not. The caller now WATCHES for the identity to change (see
   * BrowserSession.awaitIdentity) and continues the instant it does, which is
   * both faster on the ordinary path and more patient on a slow one — the
   * difference between "מיידי, גג 5-7 שניות" and half a minute of clock.
   */
  return { pressed: 'clicked', profiles: wantPictures ? profiles : undefined };
}
