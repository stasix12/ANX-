import type { ElementHandle, Page } from 'playwright-core';
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

export interface FacebookProfile {
  /**
   * Facebook's numeric id, when the row gives one up — most do not, because
   * the switcher rows are buttons rather than links. Empty is normal and the
   * name is what a switch is performed by.
   */
  id: string;
  /** Exactly as Facebook rendered it. Never trimmed to a guess, never invented. */
  name: string;
}

export interface ProfileRead {
  profiles: FacebookProfile[];
  /** Why the list is empty, for the worker's log. Never rendered to a customer. */
  note: 'ok' | 'no-menu' | 'no-anchor' | 'no-rows';
}

/** The menu container Facebook opens under the top-right avatar. */
const MENU_SELECTOR = 'div[role="menu"], div[role="dialog"], div[role="navigation"]';

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
   * VISIBLE, NOT MERELY PRESENT — and the test is what taught this.
   *
   * The first version returned whatever `div[role="menu"]` the document held,
   * and a menu that exists but is closed satisfies that. It reads almost
   * correctly, which is the dangerous part: `innerText` is empty for anything
   * not laid out, so the rows come back through the `textContent` fallback
   * with the whitespace and the hidden text that innerText exists to strip,
   * and on a page where the closed menu holds different rows than the open one
   * it would report the wrong names entirely — with no error anywhere.
   */
  const open = page.locator(MENU_SELECTOR).first();
  if (await open.isVisible({ timeout: 500 }).catch(() => false)) return await open.elementHandle();

  const byName = page.getByRole('button', { name: patterns.accountMenu }).first();
  if (await byName.count().then((n) => n > 0).catch(() => false)) {
    await byName.click({ timeout: 8_000 }).catch(() => undefined);
    const menu = await page.waitForSelector(MENU_SELECTOR, { state: 'visible', timeout: 8_000 }).catch(() => null);
    if (menu) return menu;
  }

  /* The banner's own last button. Scoped to role=banner so this can never
     reach into the feed and press somebody's post. */
  const inBanner = page.locator('div[role="banner"] div[role="button"], div[role="banner"] [aria-label]').last();
  if (await inBanner.count().then((n) => n > 0).catch(() => false)) {
    await inBanner.click({ timeout: 8_000 }).catch(() => undefined);
    return await page.waitForSelector(MENU_SELECTOR, { state: 'visible', timeout: 8_000 }).catch(() => null);
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
async function rowsInMenu(menu: ElementHandle<Element>): Promise<{ names: string[]; note: ProfileRead['note'] }> {
  return await menu.evaluate((root, source) => {
    const allProfiles = new RegExp(source.allProfiles, 'i');
    const noise = new RegExp(source.menuStuff, 'i');

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
    if (!anchor) return { names: [] as string[], note: 'no-anchor' as const };

    /*
     * A row is a candidate that comes before the anchor and is not itself an
     * ancestor of it — the menu is nested, so the anchor's own wrappers also
     * "come before" it in document order and would otherwise be read as
     * profiles whose text is the entire menu.
     */
    const names: string[] = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const el = candidates[i];
      if (el === anchor) break;
      if (el.contains(anchor)) continue;
      const text = texts[i];
      /* One line, a plausible length, and not one of the menu's own items.
         A name with a newline in it is a container that swallowed its
         siblings, not a person. */
      if (!text || text.includes('\n') || text.length > 60) continue;
      if (noise.test(text)) continue;
      if (names.includes(text)) continue;
      names.push(text);
    }
    return { names, note: names.length ? ('ok' as const) : ('no-rows' as const) };
  }, { allProfiles: patterns.allProfiles.source, menuStuff: patterns.menuStuff.source });
}

/**
 * Every profile this account can switch to, the signed-in one included.
 *
 * Best-effort and read-only, in the same spirit as readAccountProfile: it
 * rides on a page that is already open, and a failure here must never fail the
 * thing that opened it.
 */
export async function readProfiles(page: Page): Promise<ProfileRead> {
  const menu = await openAccountMenu(page);
  if (!menu) return { profiles: [], note: 'no-menu' };
  try {
    const { names, note } = await rowsInMenu(menu);
    return { profiles: names.map((name) => ({ id: '', name })), note };
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
export async function switchProfile(page: Page, name: string): Promise<'clicked' | 'no-menu' | 'not-found'> {
  const menu = await openAccountMenu(page);
  if (!menu) return 'no-menu';

  const { names } = await rowsInMenu(menu);
  /* Only a row this reader itself returned may be pressed. Without this the
     locator below could match the same words anywhere inside the menu. */
  if (!names.includes(name)) {
    await page.keyboard.press('Escape').catch(() => undefined);
    return 'not-found';
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
  await page.waitForTimeout(4_000);
  return 'clicked';
}
