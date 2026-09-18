import type { Page } from 'playwright-core';
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
  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);
  const kind = await classifyPage(page);
  if (kind !== 'ok') return null;

  const name = (await page.title().catch(() => '')).replace(/^\(\d+\)\s*/, '').replace(patterns.titleSuffix, '').trim();

  // Candidate pictures, best first. Facebook draws a small, pre-blurred
  // copy of the cover stretched behind the real one; the real one has a far
  // larger native resolution. So: wait for images to load, measure native
  // size only, and take the largest sharp one.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page
    .waitForFunction(() => Array.from(document.querySelectorAll('[role="main"] img')).some((i) => (i as HTMLImageElement).naturalWidth > 600), null, { timeout: 10_000 })
    .catch(() => undefined);
  const ranked = await page
    .locator('img[src*="scontent"], img[src*="fbcdn"]')
    .evaluateAll((els) =>
      els
        .map((el) => {
          const img = el as HTMLImageElement;
          const style = getComputedStyle(img);
          const rect = img.getBoundingClientRect();
          return {
            src: img.currentSrc || img.src,
            w: img.naturalWidth,
            h: img.naturalHeight,
            blurred: /blur/.test(style.filter) || /blur/.test(getComputedStyle(img.parentElement ?? img).filter),
            round: /50%|9999/.test(style.borderRadius),
            top: rect.top + window.scrollY,
            visible: rect.width > 0 && rect.height > 0,
          };
        })
        .filter((i) => i.src && i.visible && !i.blurred && !i.round && i.w >= 400 && i.top < 1200)
        .sort((a, b) => b.w * b.h - a.w * a.h)
        .slice(0, 3),
    )
    .catch(() => [] as { src: string; w: number; h: number }[]);
  const candidates: string[] = ranked.map((i) => i.src);
  if (ranked[0]) console.log(`[worker]    תמונת קבוצה: ${ranked[0].w}×${ranked[0].h}`);
  const cover = await page.locator('img[data-imgperflogname="profileCoverPhoto"]').first().getAttribute('src').catch(() => null);
  if (cover) candidates.push(cover);
  const og = await page.locator('meta[property="og:image"]').first().getAttribute('content').catch(() => null);
  if (og) candidates.push(og);

  let image: GroupProfile['image'] = null;
  for (const url of candidates) {
    try {
      const res = await page.request.get(url, { timeout: 20_000 });
      if (!res.ok()) continue;
      const contentType = res.headers()['content-type'] ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) continue;
      const bytes = await res.body();
      if (bytes.length < 1000) continue; // tracking pixels / empty
      image = { bytes, contentType };
      break;
    } catch {
      /* next candidate */
    }
  }
  return { name, image };
}
