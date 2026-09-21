import type { ElementHandle, Page } from 'playwright-core';
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
  /** What the avatar search saw when it found nothing. Terminal only. */
  probe: AvatarProbe;
}

/**
 * Screenshot the signed-in user's picture off whatever page is open.
 *
 * TWO CORRECTIONS LIVE HERE, and the second one is the important one.
 *
 * The first: this used to look for an `<img>` whose computed `border-radius`
 * was `50%`. Modern Facebook draws avatars as an SVG `<image>` behind a mask,
 * so the element is not an `<img>` and the roundness is not on the picture —
 * two filters, both matching nothing, and the chip showed a real name beside
 * the blue initial circle.
 *
 * The second: fixing that left a "biggest square-ish picture on the page"
 * fallback, and on the real home feed it photographed a stranger's post and
 * put it on the dashboard as the owner's face. That is the worse failure of
 * the two. A wrong face is not a smaller version of a missing face; it is a
 * confident lie about whose account is publishing, which is the single fact
 * this whole feature exists to report.
 *
 * So there is no fallback any more. An element is taken ONLY when something
 * proves it belongs to the signed-in user:
 *
 *   - it sits inside a link carrying the id the `c_user` cookie just gave us
 *     (or /me, which resolves to the same person), or
 *   - its `alt` is EXACTLY the name we already read from the page's own data.
 *
 * Exactly, not "contains": Facebook labels an avatar with the person's bare
 * name, while a photo somebody posted of them is labelled with a sentence that
 * happens to include it. `includes` would have accepted that sentence, which
 * is how a feed photo becomes a profile picture.
 *
 * Neither test is linguistic, so neither breaks when the account is set to a
 * language nobody here anticipated: one compares ids, the other compares the
 * account's own name against itself. When neither holds there is no picture,
 * and the dashboard falls back to an initial — which is at least true.
 *
 * The capture goes through an element handle rather than
 * `page.screenshot({clip})` so Playwright scrolls the element into view and
 * measures its real box; a clip is silently wrong the moment anything above it
 * has grown.
 */
/**
 * What the search saw, for the terminal when it came back without a face.
 *
 * The first version of this only printed when it had candidates to describe,
 * so the one outcome it most needed to explain — "nothing on the page was even
 * the right shape" — came out as silent as the bug it was written to diagnose.
 * Every field here is reported unconditionally now.
 */
export interface AvatarProbe {
  /** Every <img>/<image> in the document, before any filtering. */
  nodes: number;
  /** How many of those were the right size and shape for a face. */
  shaped: number;
  /** The biggest few, described just enough to say why none qualified. */
  sample: string[];
  /** 'ok', or why the search could not run at all. */
  note: string;
  /** Which page it looked at, and the owner's profile path it was given. */
  where: string;
}

const EMPTY_PROBE: AvatarProbe = { nodes: 0, shaped: 0, sample: [], note: 'לא רצה', where: '' };

async function captureAvatar(
  page: Page,
  id: string,
  name: string,
  profilePath: string,
): Promise<{ image: AccountProfile['image']; reason: AccountProfile['imageNote']; probe: AvatarProbe }> {
  /*
   * WAIT FOR THERE TO BE PICTURES AT ALL.
   *
   * The name is read out of the raw HTML, which arrives long before Facebook's
   * app draws anything — so "a real name beside an empty search" is exactly
   * what an unrendered page produces, and that is what the owner's machine
   * reported. Same class of race as the profile title, and the same fix: wait
   * for the condition instead of for a number of seconds.
   */
  await page
    .waitForFunction(() => document.querySelectorAll('img, image').length > 0, undefined, { timeout: 15_000 })
    .catch(() => undefined);

  const picked = await page
    .evaluateHandle(
      ({ userId, fullName, path }: { userId: string; fullName: string; path: string }) => {
        /*
         * No named helper here, deliberately. esbuild rewrites every
         * `const f = () => …` into `__name(() => …, 'f')`, and a function
         * handed to evaluate is shipped to the browser as source — so the call
         * travels and the helper does not. The context now defines `__name` in
         * the page (see session.ts), and this file also simply avoids needing
         * it: two independent reasons for the same code to run.
         */
        const wanted = fullName.replace(/\s+/g, ' ').trim().toLowerCase();
        // `image` here is the SVG element, not a typo for `img`. Both are asked
        // for because either one may be carrying the face on any given layout.
        const nodes = Array.from(document.querySelectorAll('img, image'));
        const described = nodes.map((el) => {
          const r = el.getBoundingClientRect();
          const href = el.closest('a[href]')?.getAttribute('href') ?? '';
          const alt = (el.getAttribute('alt') ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
          const label = (el.closest('[aria-label]')?.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
          // An SVG <image> carries its source on href/xlink:href, an <img> on src.
          const src =
            el.getAttribute('src') ||
            el.getAttribute('href') ||
            el.getAttribute('xlink:href') ||
            (el as HTMLImageElement).currentSrc ||
            '';
          return {
            el,
            w: r.width,
            h: r.height,
            tag: el.tagName.toLowerCase(),
            href,
            alt,
            label,
            src,
            /*
             * THE PICTURE'S OWN ADDRESS. Facebook's profile-photo files carry
             * the account's numeric id inside the filename, so a CDN link that
             * contains it is about this account and no other — the one proof
             * that survives a layout with no link and no alt at all.
             */
            byUrl: userId !== '' && src.includes(userId),
            /* A link to the signed-in user's own profile: by numeric id, or by
               the vanity path Facebook itself resolved /me to. The vanity form
               exists because a profile link is usually /name, not /id — which
               is why matching the id alone found nothing. */
            byLink:
              (userId !== '' && href.includes(userId)) ||
              /\/me\/?($|\?)/.test(href) ||
              (path !== '' &&
                (() => {
                  // Same link written four ways: /name, /name/, /name?x=1 and
                  // the absolute form. The owner's machine reported the
                  // absolute one, which an equality check would have missed.
                  const bare = href.replace(/^https?:\/\/(?:www\.|web\.|m\.)?facebook\.com/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
                  return bare !== '' && bare === path;
                })()),
            /* The account's own name, compared against itself — not a label in
               any particular language. Exactly, never "contains": an avatar is
               labelled with the bare name, while a photo somebody posted OF the
               owner is labelled with a sentence that happens to include it. */
            byAlt: wanted !== '' && (alt === wanted || label === wanted),
          };
        });
        const shaped = described.filter(
          (c) => c.w >= 20 && c.w <= 500 && c.h > 0 && c.w / c.h > 0.7 && c.w / c.h < 1.45,
        );
        const proven = shaped
          .filter((c) => c.byUrl || c.byLink || c.byAlt)
          // Best-proven first, then the biggest — the photo rather than a
          // thumbnail of it.
          .sort(
            (a, b) =>
              Number(b.byUrl) + Number(b.byLink) + Number(b.byAlt) - (Number(a.byUrl) + Number(a.byLink) + Number(a.byAlt)) ||
              b.w - a.w,
          );
        /*
         * WHEN NOTHING QUALIFIES, SAY WHAT WAS THERE — and when nothing was
         * even the right shape, describe the page's pictures anyway. That case
         * is the most informative one and the last version printed nothing for
         * it, which is how a diagnostic becomes as silent as the bug.
         */
        const sample = (shaped.length ? shaped : described)
          .slice()
          .sort((a, b) => b.w - a.w)
          .slice(0, 8)
          .map(
            (c) =>
              `${c.tag} ${Math.round(c.w)}x${Math.round(c.h)} alt="${(c.alt || c.label).slice(0, 30)}" href="${c.href.slice(0, 40)}" src="${c.src.slice(-55)}"`,
          );
        return { el: proven[0]?.el ?? null, src: proven[0]?.src ?? '', nodes: nodes.length, shaped: shaped.length, sample };
      },
      { userId: id, fullName: name, path: profilePath },
    )
    .catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

  if (typeof picked === 'string') {
    // The search itself could not run. That is a third outcome, and lumping it
    // in with "found nothing" would hide a broken read behind a true-sounding
    // "no picture on this page".
    return { image: null, reason: 'no-element', probe: { ...EMPTY_PROBE, note: picked.slice(0, 160), where: `${page.url().slice(0, 60)} ← "${profilePath}"` } };
  }

  const probe: AvatarProbe = await picked
    .evaluate((v: { nodes: number; shaped: number; sample: string[] }) => ({ nodes: v.nodes, shaped: v.shaped, sample: v.sample, note: 'ok', where: '' }))
    .then((v) => ({ ...v, where: `${page.url().slice(0, 60)} ← "${profilePath}"` }))
    .catch(() => ({ ...EMPTY_PROBE, note: 'הדוח לא נקרא' }));
  const el = (await picked
    .getProperty('el')
    .then((h) => h.asElement())
    .catch(() => null)) as ElementHandle<Node> | null;
  const src = await picked
    .getProperty('src')
    .then((h) => h.jsonValue() as Promise<string>)
    .catch(() => '');
  await picked.dispose().catch(() => undefined);
  if (!el) return { image: null, reason: 'no-element', probe };

  /*
   * ASK FOR THE FILE, DON'T PHOTOGRAPH THE SCREEN.
   *
   * The owner's machine reached this point with a proven avatar and came back
   * "found it but could not photograph it". Screenshotting an element on
   * facebook.com is the fragile half of this: Playwright scrolls it into view,
   * waits for it to hold still, and requires it to still be attached — and
   * React re-renders that top bar continuously, so the node the search chose
   * can be gone a moment later. None of which has anything to do with reading
   * one picture.
   *
   * The element has already told us its address, so fetch that instead. The
   * request goes out of Node with the browser context's own cookies, which
   * means no CORS, no layout, no animation, no staleness — and a full-size
   * file rather than a 40px photograph of one. The screenshots stay as
   * fallbacks for a blob: source, which only the page itself can resolve.
   */
  try {
    if (/^https?:/i.test(src)) {
      const res = await page.context().request.get(src, { timeout: 15_000 }).catch(() => null);
      const type = res?.headers()['content-type'] ?? '';
      if (res?.ok() && /^image\//i.test(type)) {
        const bytes = await res.body();
        // A sane avatar is kilobytes. Anything past this is not one, and is
        // not worth pushing into Storage to find out.
        if (bytes.length > 0 && bytes.length < 8_000_000) {
          return { image: { bytes, contentType: type.split(';')[0].trim() }, reason: 'ok', probe: { ...probe, where: `${probe.where} · קובץ` } };
        }
      }
    }
    const inline = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(src);
    if (inline) {
      return { image: { bytes: Buffer.from(inline[2], 'base64'), contentType: inline[1] }, reason: 'ok', probe: { ...probe, where: `${probe.where} · מוטבע` } };
    }
    const bytes = await el.screenshot({ type: 'png', timeout: 10_000 });
    return { image: { bytes, contentType: 'image/png' }, reason: 'ok', probe: { ...probe, where: `${probe.where} · צילום` } };
  } catch {
    /*
     * Last resort: photograph the page clipped to where the element was. It is
     * the weakest of the three — the numbers were measured a moment ago and
     * the layout may have moved since — but it needs neither the node to still
     * exist nor the picture to be fetchable, so it is the one that works when
     * the others have not.
     */
    try {
      const box = await el.boundingBox();
      if (!box || box.width < 1 || box.height < 1) return { image: null, reason: 'screenshot-failed', probe };
      const bytes = await page.screenshot({
        clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
        type: 'png',
        timeout: 10_000,
      });
      return { image: { bytes, contentType: 'image/png' }, reason: 'ok', probe: { ...probe, where: `${probe.where} · חיתוך` } };
    } catch {
      return { image: null, reason: 'screenshot-failed', probe };
    }
  } finally {
    await el.dispose().catch(() => undefined);
  }
}

/**
 * The path part of a facebook.com address, or '' when there is nothing useful
 * in it. `/me` and `/` are rejected on purpose: they are where we asked to go,
 * not where Facebook took us, and treating the question as the answer is what
 * made the owner's own profile links fail to match.
 */
function profilePathOf(raw: string): string {
  try {
    const u = new URL(raw);
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return '';
    const path = u.pathname.replace(/\/$/, '');
    if (path === '' || path === '/me') return '';
    return path;
  } catch {
    return '';
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
  let shot = await captureAvatar(page, id, fromBlob, '');

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
  if (nameHere && shot.image) return { id, name: nameHere, image: shot.image, imageNote: shot.reason, probe: shot.probe };

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
    const landing = await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    /* /me is a redirect, and the address bar can still be showing the question
       rather than the answer when domcontentloaded fires. Wait for it to stop
       saying /me before reading the owner's real profile path out of it. */
    await page
      .waitForFunction(() => !/^\/me\/?$/i.test(location.pathname), undefined, { timeout: 10_000 })
      .catch(() => undefined);
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
    /*
     * THE PROFILE'S REAL ADDRESS, resolved by Facebook rather than guessed.
     *
     * A profile link is usually /the.persons.name, not /<numeric id> — which
     * is exactly why matching the cookie's id against hrefs found nothing on
     * the owner's machine. /me redirects to the signed-in user's profile, so
     * the address we land on IS their vanity path, stated by Facebook itself.
     * Matching that is still identity, not markup.
     */
    const profilePath = profilePathOf(page.url()) || profilePathOf(landing?.url() ?? '');
    if (!shot.image) shot = await captureAvatar(page, id, name || nameHere, profilePath);
    /*
     * AND ONE LAST LOOK AT THE PAGE THE LINKS ARE ON.
     *
     * The owner's terminal settled this: their home page carries two 40x40
     * avatars whose enclosing link is https://www.facebook.com/<their name> —
     * proof, and sitting there the whole time. It went unmatched because the
     * only place the profile path is learned is /me, and by the time we knew
     * it we had already left the page that used it. So once Facebook has told
     * us the address, go back and use it.
     */
    if (!shot.image && profilePath) {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
      shot = await captureAvatar(page, id, name || nameHere, profilePath);
    }
    return { id, name, image: shot.image, imageNote: shot.reason, probe: shot.probe };
  } catch {
    return { id, name: nameHere, image: shot.image, imageNote: shot.reason, probe: shot.probe };
  }
}
