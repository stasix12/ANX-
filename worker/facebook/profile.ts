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

  const candidates: string[] = [];
  const og = await page.locator('meta[property="og:image"]').first().getAttribute('content').catch(() => null);
  if (og) candidates.push(og);
  // The group's own picture sits in the header, above the feed.
  for (const src of await page.locator('[role="main"] img[src*="scontent"], [role="main"] image[href*="scontent"], [role="banner"] ~ * img[src*="scontent"]').evaluateAll((els) => els.slice(0, 4).map((e) => (e as HTMLImageElement).src || e.getAttribute('href') || '')).catch(() => [])) {
    if (src) candidates.push(src);
  }

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
