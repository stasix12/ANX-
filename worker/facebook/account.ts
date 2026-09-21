import type { Page } from 'playwright-core';
import { patterns } from './selectors';

/**
 * WHO is signed in, read from the browser the worker actually publishes with.
 *
 * The dashboard's "מחובר" chip has always been about the PC — a heartbeat from
 * the worker process. It said nothing about which Facebook account that
 * browser profile holds, and on a machine the owner shares, or after somebody
 * logs in as the wrong person, that is the one fact worth showing: every group
 * publication goes out under this name.
 *
 * Read-only, and best-effort by design. The ID comes from the `c_user` cookie,
 * which is authoritative and locale-independent; the name and picture come
 * from the DOM and may not be found on a layout change, in which case they are
 * simply absent. Nothing here may fail the login check it rides along with.
 */
export interface AccountProfile {
  /** Facebook's own numeric id for the signed-in user. Empty if unreadable. */
  id: string;
  /** Display name as the page shows it. Empty when the markup did not yield one. */
  name: string;
  /** Avatar bytes, screenshotted from the rendered element — CDN links expire. */
  image: { bytes: Buffer; contentType: string } | null;
  /**
   * Why there is no picture, for the worker's terminal only.
   *
   * "The avatar did not arrive" used to be one indistinguishable outcome
   * covering two very different faults — nothing on the page matched, or the
   * match could not be photographed — and telling them apart from the outside
   * was impossible. Never rendered: the dashboard shows a face or an initial,
   * not an explanation.
   */
  imageNote: 'ok' | 'no-element' | 'screenshot-failed';
}

/**
 * Screenshot the signed-in user's picture off whatever page is open.
 *
 * THIS IS A CORRECTION, and the bug it fixes was visible on the dashboard: the
 * name read fine and the avatar never did, so the chip kept showing the blue
 * initial circle the app falls back to. The first version looked for an `<img>`
 * whose computed `border-radius` was `50%`, and modern Facebook satisfies
 * neither half of that — avatars are drawn as an SVG `<image>` clipped by a
 * mask, so the element is not an `<img>` at all and the roundness lives on the
 * mask rather than on the picture. Two filters, both matching nothing.
 *
 * What replaced them is shape and ownership, which are properties of the thing
 * itself rather than of this month's CSS: a square-ish box, and preferably one
 * sitting inside a link that carries the id the cookie already gave us. The
 * capture goes through an element handle instead of `page.screenshot({clip})`
 * so Playwright scrolls the element into view and reads its real box — a clip
 * is silently wrong the moment anything above it has grown.
 */
async function captureAvatar(page: Page, id: string): Promise<{ image: AccountProfile['image']; reason: AccountProfile['imageNote'] }> {
  const handle = await page
    .evaluateHandle((userId: string) => {
      // `image` here is the SVG element, not a typo for `img`. Both are asked
      // for because either one may be carrying the face on any given layout.
      const nodes = Array.from(document.querySelectorAll('img, image'));
      const candidates = nodes
        .map((el) => {
          const r = el.getBoundingClientRect();
          const href = el.closest('a[href]')?.getAttribute('href') ?? '';
          return {
            el,
            w: r.width,
            h: r.height,
            y: r.top,
            // A link to the signed-in user's own profile is proof, not a hint:
            // it is the same id the cookie named a moment ago.
            mine: (userId !== '' && href.includes(userId)) || /\/me\/?($|\?)/.test(href),
          };
        })
        .filter(
          (c) =>
            c.w >= 24 &&
            c.w <= 400 &&
            c.h > 0 &&
            // Square-ish. A banner, a photo in the feed and a logo strip are
            // all ruled out by this without naming any of them.
            c.w / c.h > 0.8 &&
            c.w / c.h < 1.25 &&
            c.y > -200 &&
            c.y < 1400,
        )
        // Proven-ours first; among equals the biggest, which is the profile
        // photo rather than a reaction icon or a story ring.
        .sort((a, b) => Number(b.mine) - Number(a.mine) || b.w - a.w);
      return candidates[0]?.el ?? null;
    }, id)
    .catch(() => null);

  const el = handle?.asElement() ?? null;
  if (!el) {
    await handle?.dispose().catch(() => undefined);
    return { image: null, reason: 'no-element' };
  }
  try {
    const bytes = await el.screenshot({ type: 'png', timeout: 10_000 });
    return { image: { bytes, contentType: 'image/png' }, reason: 'ok' };
  } catch {
    return { image: null, reason: 'screenshot-failed' };
  } finally {
    await el.dispose().catch(() => undefined);
  }
}

export async function readAccountProfile(page: Page): Promise<AccountProfile | null> {
  const cookies = await page.context().cookies('https://www.facebook.com').catch(() => []);
  const id = cookies.find((c) => c.name === 'c_user')?.value ?? '';
  if (!id) return null;

  /*
   * FIRST, THE PAGE'S OWN DATA — no DOM guessing and no second page load.
   *
   * facebook.com embeds a `CurrentUserInitialData` blob in its bootstrap
   * script holding the signed-in user's ACCOUNT_ID and NAME. Measured on the
   * owner's machine, both DOM attempts below came back empty on the real home
   * layout while this blob was sitting in the HTML the whole time.
   *
   * It is matched next to the id we already have from the cookie, so a blob
   * belonging to anything else cannot be mistaken for the signed-in user, and
   * the value is unescaped through JSON.parse because Hebrew and Cyrillic
   * arrive as \uXXXX. Structural, not linguistic: nothing here depends on the
   * account's language.
   */
  const fromBlob = await page
    .content()
    .then((html) => {
      const at = html.indexOf('"CurrentUserInitialData"');
      if (at === -1) return '';
      const window = html.slice(at, at + 4000);
      // The blob must be about the account the COOKIE named. Without this the
      // match is "some NAME near some key", which is a guess wearing the
      // clothes of a fact.
      if (!window.includes(id)) return '';
      const named = window.match(/"NAME":"((?:[^"\\]|\\.)*)"/);
      if (!named) return '';
      try {
        return (JSON.parse(`"${named[1]}"`) as string).trim().slice(0, 80);
      } catch {
        return '';
      }
    })
    .catch(() => '');

  /*
   * The picture is taken HERE, on the page that is already open.
   *
   * It used to be attempted only on the profile page, behind a navigation that
   * only happened when the rail link was missing — so on the layout where the
   * rail link WAS found, no picture was ever looked for at all. The home page
   * carries the owner's avatar in its top bar on every layout Facebook has
   * shipped; asking for it here costs one evaluate and no page load.
   */
  let shot = await captureAvatar(page, id);

  /*
   * The profile link is found BY THE ID, never by a label.
   *
   * Facebook renders this app in whatever language the account is set to, so
   * matching "Your profile" or "הפרופיל שלך" breaks for half the owners who
   * would use it. The left rail's first row links to the signed-in user, and
   * that href carries the same id the cookie just gave us — which is a fact
   * about identity rather than a guess about markup.
   */
  const found = await page
    .evaluate((userId: string) => {
      const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      for (const a of links) {
        const href = a.getAttribute('href') ?? '';
        if (!href.includes(userId) && !/\/me\/?($|\?)/.test(href)) continue;
        const text = (a.textContent ?? '').trim();
        if (!text) continue;
        return { name: text.slice(0, 80) };
      }
      return null;
    }, id)
    .catch(() => null);

  const nameHere = fromBlob || found?.name || '';
  if (nameHere && shot.image) return { id, name: nameHere, image: shot.image, imageNote: shot.reason };

  /*
   * FALLBACK: the profile page itself, visited only for what is still missing.
   *
   * The reads above are the cheap ones — the page is already open. But the home
   * layout is not guaranteed to carry either the name or the face, and when it
   * does not, the first version of this returned an id with nothing attached
   * and the dashboard had nothing to show: a feature that worked or silently
   * did not, with no way to tell which. /me redirects to the signed-in user's
   * profile, whose <title> is their name and whose header holds their picture
   * at full size — both as locale-independent as the cookie was.
   */
  try {
    await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    /*
     * WAIT FOR THE TITLE TO STOP SAYING "Facebook".
     *
     * Measured on the owner's machine: this read came back with the name
     * "Facebook" and wrote it to the dashboard. The profile page ships with a
     * placeholder title and swaps in the person's name once it has rendered,
     * so a fixed two-second pause was a race — and losing it produced a name
     * that is worse than none, because it looks like a real answer.
     */
    await page
      .waitForFunction(() => document.title && !/^\(?\d*\)?\s*facebook\s*$/i.test(document.title), undefined, { timeout: 15_000 })
      .catch(() => undefined);
    /*
     * The <h1> first. On a profile page it is the person's name and nothing
     * else; the title is the same string with decoration around it, and is
     * the thing that carries the placeholder.
     */
    const heading = await page
      .evaluate(() => (document.querySelector('h1')?.textContent ?? '').trim())
      .catch(() => '');
    const title = (await page.title().catch(() => '')).replace(/^\(\d+\)\s*/, '').replace(patterns.titleSuffix, '').trim();
    /*
     * "Facebook" is not a name. Neither is an empty string. Writing either
     * would put a wrong answer on the dashboard, and this module's whole
     * contract is that an unreadable name stays absent rather than guessed —
     * the chip falls back to the machine state, which is at least true.
     */
    const candidate = (nameHere || heading || title).slice(0, 80);
    const name = /^facebook$/i.test(candidate) ? '' : candidate;
    if (!shot.image) shot = await captureAvatar(page, id);
    return { id, name, image: shot.image, imageNote: shot.reason };
  } catch {
    return { id, name: nameHere, image: shot.image, imageNote: shot.reason };
  }
}
