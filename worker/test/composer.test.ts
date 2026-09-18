import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { publishToGroup } from '../facebook/composer';
import { SessionError } from '../facebook/session';

/**
 * Drives the composer against worker/test/mock-group.html — a tiny page that
 * mimics Facebook's roles and labels (trigger → dialog → contenteditable →
 * hidden file input → progress bar → Post). It proves the choreography and
 * the selector catalogue without touching Facebook.
 *
 *   npx tsx worker/test/composer.test.ts
 */
const fixture = `file://${path.resolve(__dirname, 'mock-group.html')}`;
const executablePath = process.env.SOCIAL_BROWSER_EXECUTABLE;

async function main() {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: process.env.SOCIAL_BROWSER_CHANNEL as 'chrome' | undefined }) });
  const context = await browser.newContext({ locale: 'he-IL' });
  const page = await context.newPage();

  // A 1x1 PNG so the file input gets a real image.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const img1 = path.join(tmpdir(), 'hapitaron-test-1.png');
  const img2 = path.join(tmpdir(), 'hapitaron-test-2.png');
  writeFileSync(img1, png);
  writeFileSync(img2, png);

  const steps: string[] = [];
  const text = 'ניקוי ספות וריפודים בבאר שבע 🧽\nמקצועי, מהיר ובאחריות.\n\n📞 053-5257250';

  // 1. Text + two images, with a confirmation gate that approves.
  const result = await publishToGroup(page, {
    groupUrl: fixture,
    text,
    images: [img1, img2],
    video: null,
    onStep: async (s) => {
      steps.push(s);
    },
    confirm: async () => 'confirmed',
  });
  assert.equal(result.outcome, 'published');
  assert.deepEqual(steps, ['opening', 'composer_opened', 'uploading_media', 'ready_to_publish', 'publishing', 'verifying']);
  assert.equal(result.groupTitle, 'באר שבע ביחד');
  assert.equal(result.verified, true, 'post text should be visible in the feed after publishing');
  const published = await page.evaluate(() => (window as unknown as { __published: { text: string; images: number } }).__published);
  assert.equal(published.images, 2);
  assert.ok(published.text.includes('ניקוי ספות וריפודים בבאר שבע'));
  assert.ok(published.text.includes('053-5257250'));
  console.log('✓ text + 2 images published through the mock composer');

  // 2. Confirmation declined → nothing published, composer discarded.
  steps.length = 0;
  const cancelled = await publishToGroup(page, {
    groupUrl: fixture,
    text: 'פוסט שלא יאושר',
    images: [],
    video: null,
    onStep: async (s) => {
      steps.push(s);
    },
    confirm: async () => 'cancelled',
  });
  assert.equal(cancelled.outcome, 'cancelled');
  assert.ok(!steps.includes('publishing'));
  console.log('✓ declined confirmation never reaches the Post button');

  // 3. A checkpoint page stops everything with a SessionError.
  const checkpoint = path.join(tmpdir(), 'hapitaron-checkpoint.html');
  writeFileSync(checkpoint, '<html><body><h1>Confirm your identity</h1><p>Enter the security code we sent.</p></body></html>');
  await assert.rejects(
    publishToGroup(page, { groupUrl: `file://${checkpoint}`, text: 'x', images: [], video: null, onStep: async () => undefined }),
    (err: unknown) => err instanceof SessionError && err.kind === 'checkpoint',
  );
  console.log('✓ security interstitial → SessionError(checkpoint), no bypass attempted');

  await browser.close();
  console.log('composer tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
