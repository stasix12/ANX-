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
}

export async function readAccountProfile(page: Page): Promise<AccountProfile | null> {
  const cookies = await page.context().cookies('https://www.facebook.com').catch(() => []);
  const id = cookies.find((c) => c.name === 'c_user')?.value ?? '';
  if (!id) return null;

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
        const img = a.querySelector('img');
        if (!img) continue;
        const r = img.getBoundingClientRect();
        if (r.width < 16 || r.width > 80) continue;
        const text = (a.textContent ?? '').trim();
        return { name: text.slice(0, 80), box: { x: r.left, y: r.top, w: r.width, h: r.height } };
      }
      return null;
    }, id)
    .catch(() => null);

  /*
   * FALLBACK: the profile page's own title.
   *
   * The rail link above is the cheap read — it is already on screen. But the
   * home layout is not guaranteed to carry it, and when it does not, the first
   * version of this returned an id with no name and the dashboard had nothing
   * to show: a feature that worked or silently did not, with no way to tell
   * which. /me redirects to the signed-in user's profile and its <title> is
   * their name, which is as locale-independent as the cookie was.
   */
  if (!found) {
    try {
      await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(2000);
      const title = (await page.title().catch(() => '')).replace(/^\(\d+\)\s*/, '').replace(patterns.titleSuffix, '').trim();
      const name = title.slice(0, 80);
      const box = await page
        .evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
          const round = imgs
            .map((img) => {
              const r = img.getBoundingClientRect();
              return { x: r.left, y: r.top, w: r.width, h: r.height, round: /50%|9999/.test(getComputedStyle(img).borderRadius) };
            })
            .filter((b) => b.round && b.w >= 60 && b.w <= 200 && b.y >= 0 && b.y < 900)
            .sort((a, b) => b.w - a.w);
          return round[0] ?? null;
        })
        .catch(() => null);
      let image: AccountProfile['image'] = null;
      if (box) {
        try {
          image = {
            bytes: await page.screenshot({
              clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) },
              type: 'png',
              timeout: 10_000,
            }),
            contentType: 'image/png',
          };
        } catch {
          image = null;
        }
      }
      return { id, name, image };
    } catch {
      return { id, name: '', image: null };
    }
  }

  let image: AccountProfile['image'] = null;
  if (found.box.w >= 16 && found.box.y >= 0) {
    const clip = {
      x: Math.round(found.box.x),
      y: Math.round(found.box.y),
      width: Math.round(found.box.w),
      height: Math.round(found.box.h),
    };
    try {
      image = { bytes: await page.screenshot({ clip, type: 'png', timeout: 10_000 }), contentType: 'image/png' };
    } catch {
      image = null;
    }
  }
  return { id, name: found.name, image };
}
