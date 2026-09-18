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

  // Candidate pictures, best first. Facebook draws a blurred copy of the
  // cover behind the real one, so blurred/tiny images are skipped and the
  // sharpest, largest one wins.
  const candidates: string[] = [];
  const cover = await page.locator('img[data-imgperflogname="profileCoverPhoto"]').first().getAttribute('src').catch(() => null);
  if (cover) candidates.push(cover);
  const ranked = await page
    .locator('[role="main"] img[src*="scontent"], [role="main"] img[src*="fbcdn"]')
    .evaluateAll((els) =>
      els
        .map((el) => {
          const img = el as HTMLImageElement;
          const style = getComputedStyle(img);
          const rect = img.getBoundingClientRect();
          return {
            src: img.currentSrc || img.src,
            area: (img.naturalWidth || rect.width) * (img.naturalHeight || rect.height),
            blurred: /blur/.test(style.filter) || /blur/.test(getComputedStyle(img.parentElement ?? img).filter),
            round: /50%|9999/.test(style.borderRadius),
            top: rect.top,
          };
        })
        .filter((i) => i.src && !i.blurred && i.area > 40_000 && !i.round && i.top < 900)
        .sort((a, b) => b.area - a.area)
        .slice(0, 3)
        .map((i) => i.src),
    )
    .catch(() => [] as string[]);
  candidates.push(...ranked);
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
