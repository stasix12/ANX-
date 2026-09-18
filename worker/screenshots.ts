import type { Page } from 'playwright-core';
import { workerDb } from './db';

/**
 * Failure / confirmation screenshots go to the PRIVATE social-debug bucket;
 * the dashboard opens them through short-lived signed URLs. The image shows
 * the Facebook page as the owner would see it — never cookies or tokens.
 */
export async function captureScreenshot(page: Page | null, queueId: string, step: string): Promise<string | null> {
  if (!page || page.isClosed()) return null;
  try {
    const buffer = await page.screenshot({ type: 'png', fullPage: false, timeout: 15_000 });
    const db = await workerDb();
    const objectPath = `${queueId}/${Date.now()}-${step}.png`;
    const { error } = await db.storage.from('social-debug').upload(objectPath, buffer, { contentType: 'image/png', upsert: false });
    if (error) {
      console.error('[worker] screenshot upload failed:', error.message);
      return null;
    }
    return objectPath;
  } catch (err) {
    console.error('[worker] screenshot failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
