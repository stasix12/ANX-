import type { Page } from 'playwright-core';
import { parseGroupUrl } from '@/lib/social/types';
import { fb, patterns } from './selectors';
import { classifyPage } from './session';

/**
 * Reads a group's display name and picture from its page, so the dashboard
 * can show the same avatar Facebook shows. Read-only: no clicks, no typing.
 */
export interface GroupProfile {
  name: string;
  /** Raw picture bytes (Facebook CDN links expire, so the caller stores a copy). */
  image: { bytes: Buffer; contentType: string } | null;
  /**
   * Whether this account can still post here — false when the page says so.
   *
   * THE POSITIVE SIGNAL, NOT THE MISSING ONE. "There is no composer box" is
   * what leaving a group looks like AND what a Facebook redesign looks like,
   * and a product that guesses between them either stops publishing to groups
   * the owner is still in or keeps queueing posts into groups they left. So
   * this reads the sentence Facebook actually prints — "אי אפשר לפרסם", "רק
   * חברי הקבוצה", "join group" (selectors.ts, patterns.cannotPost) — and says
   * nothing at all when that sentence is absent.
   *
   * `null` is therefore "we could not tell", which is a different answer from
   * "you are not a member" and must never be written down as one.
   */
  canPost: boolean | null;
}

/**
 * @param needPicture  Whether to do the cover work at all.
 *
 * IT IS THE WHOLE COST OF THIS FUNCTION. The membership question is answered
 * on line one of the loaded page; everything after it — waiting for the feed
 * to go quiet, scrolling to the top, measuring the images, cropping a
 * screenshot — exists to produce a picture, and the `networkidle` wait alone
 * is fifteen seconds that Facebook almost never satisfies early, so it is
 * usually spent in full. Measured across the two: about 27 seconds a group
 * with the picture, about 11 without it.
 *
 * So a sweep over a hundred groups that already have their pictures is an
 * hour with it and twenty minutes without, and the difference is entirely
 * re-fetching images the owner is already looking at.
 */
export async function readGroupProfile(page: Page, groupUrl: string, needPicture = true): Promise<GroupProfile | null> {
  // Same guard, same reason as publishToGroup(): this page holds a live
  // Facebook login and the address comes out of a database column.
  const group = parseGroupUrl(groupUrl);
  if (!group) throw new Error('כתובת הקבוצה אינה כתובת קבוצת פייסבוק תקינה.');
  await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);
  const kind = await classifyPage(page);
  if (kind !== 'ok') return null;

  const name = (await page.title().catch(() => '')).replace(/^\(\d+\)\s*/, '').replace(patterns.titleSuffix, '').trim();

  /*
   * ASKED WHILE THE PAGE IS ALREADY OPEN, which is the whole reason this lives
   * here rather than in a sweep of its own. The worker opens a group's page to
   * read its name and picture; asking one more question of a page that is
   * already loaded costs nothing and adds no traffic to the account — and a
   * separate "check every group" pass over a hundred-odd groups is exactly the
   * kind of burst that gets a Facebook account looked at.
   */
  const cannotPost = await fb.cannotPostText(page).isVisible({ timeout: 1200 }).catch(() => null);

  // The picture: a centred square screenshot of the rendered cover area.
  // Facebook draws a blurred copy behind the real cover and serves both as
  // images, so picking a file is unreliable — what the screen shows is the
  // real thing, and a centre crop is exactly how the Facebook app builds a
  // group's small icon.
  /* Everything below is the picture. Asked for, or skipped entirely. */
  if (!needPicture) return { name, image: null, canPost: cannotPost === null ? null : !cannotPost };

  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const box = await page
    .evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
      const boxes = imgs
        .map((img) => {
          const r = img.getBoundingClientRect();
          const style = getComputedStyle(img);
          return { x: r.left, y: r.top, w: r.width, h: r.height, round: /50%|9999/.test(style.borderRadius) };
        })
        .filter((b) => b.w >= 300 && b.h >= 120 && b.y >= 0 && b.y < 700 && !b.round)
        .sort((a, b) => b.w * b.h - a.w * a.h);
      return boxes[0] ?? null;
    })
    .catch(() => null);

  let image: GroupProfile['image'] = null;
  if (box) {
    const side = Math.min(box.h, box.w, 640);
    const clip = { x: Math.round(box.x + (box.w - side) / 2), y: Math.round(box.y + (box.h - side) / 2), width: Math.round(side), height: Math.round(side) };
    try {
      const bytes = await page.screenshot({ clip, type: 'png', timeout: 15_000 });
      image = { bytes, contentType: 'image/png' };
      console.log(`[worker]    תמונת קבוצה: צילום ${clip.width}×${clip.height} מהקאבר`);
    } catch {
      image = null;
    }
  }
  if (!image) {
    // Fallback: the page's own og:image.
    const og = await page.locator('meta[property="og:image"]').first().getAttribute('content').catch(() => null);
    if (og) {
      try {
        const res = await page.request.get(og, { timeout: 20_000 });
        if (res.ok()) image = { bytes: await res.body(), contentType: res.headers()['content-type'] ?? 'image/jpeg' };
      } catch {
        /* no picture */
      }
    }
  }
  /* cannotPost is `null` when the check itself failed, and that stays null
     here rather than collapsing into `true`: not knowing is not the same as
     knowing you can post, and only the caller can decide what to do with it. */
  return { name, image, canPost: cannotPost === null ? null : !cannotPost };
}
