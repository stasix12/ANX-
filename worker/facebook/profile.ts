import type { Page } from 'playwright-core';
import { parseGroupUrl } from '@/lib/social/types';
import { patterns } from './selectors';
import { classifyPage } from './session';

/**
 * Reads a group's display name and picture from its page, so the dashboard
 * can show the same avatar Facebook shows. Read-only: no clicks, no typing.
 */
export interface GroupProfile {
  name: string;
  /** Raw picture bytes (Facebook CDN links expire, so the caller stores a copy). */
  image: { bytes: Buffer; contentType: string } | null;
}

export async function readGroupProfile(page: Page, groupUrl: string): Promise<GroupProfile | null> {
  // Same guard, same reason as publishToGroup(): this page holds a live
  // Facebook login and the address comes out of a database column.
  const group = parseGroupUrl(groupUrl);
  if (!group) throw new Error('כתובת הקבוצה אינה כתובת קבוצת פייסבוק תקינה.');
  await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);
  const kind = await classifyPage(page);
  if (kind !== 'ok') return null;

  const name = (await page.title().catch(() => '')).replace(/^\(\d+\)\s*/, '').replace(patterns.titleSuffix, '').trim();

  // The picture: a centred square screenshot of the rendered cover area.
  // Facebook draws a blurred copy behind the real cover and serves both as
  // images, so picking a file is unreliable — what the screen shows is the
  // real thing, and a centre crop is exactly how the Facebook app builds a
  // group's small icon.
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
  return { name, image };
}
