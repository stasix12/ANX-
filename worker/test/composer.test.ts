import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import type { SocialTarget } from '@/lib/social/types';
import { FacebookGroupBrowserAdapter } from '../adapters/facebookGroupBrowser';
import { PublishError, publishToGroup } from '../facebook/composer';
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

/**
 * playwright-core only looks for the exact build it shipped with, so a host
 * that has a different (perfectly usable) Chromium in PLAYWRIGHT_BROWSERS_PATH
 * fails to launch. Find one rather than make the suite unrunnable.
 */
function findChromium(): string | undefined {
  if (process.env.SOCIAL_BROWSER_EXECUTABLE) return process.env.SOCIAL_BROWSER_EXECUTABLE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium')).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const candidate = path.join(root, dir, rel);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * The adapter refuses an address that is not a Facebook group, BEFORE a page
 * carrying the owner's live Facebook session exists.
 *
 * social_targets.url is a column, and every RLS policy in
 * supabase/social-schema.sql is `to authenticated using (true)`, so it can be
 * written over PostgREST with no screen involved. Nothing used to re-check it:
 * the worker navigated straight to whatever it said — file:// included — and
 * the failure path screenshots the page it landed on and uploads it.
 *
 * The stub session fails loudly if it is ever asked for a page, which is how
 * this proves the order rather than only the outcome.
 */
async function adapterRefusesNonGroupUrls() {
  let pagesOpened = 0;
  const session = {
    newPage: async () => {
      pagesOpened += 1;
      throw new Error('the adapter opened a browser page for an address it should have refused');
    },
  };
  const adapter = new FacebookGroupBrowserAdapter(session as never);

  for (const url of ['file:///C:/Users/owner/.env.local', 'https://notfacebook.com/groups/1', 'https://evil.example/pretend', '']) {
    const target = { id: 't1', name: 'קבוצה', channel: 'facebook_group', url, external_id: '1' } as unknown as SocialTarget;
    await assert.rejects(
      () =>
        adapter.publish({
          queueId: 'q1',
          target,
          text: 'טקסט',
          media: [],
          campaignId: null,
          variantId: null,
          headless: true,
          onStep: async () => undefined,
        }),
      (err: unknown) => err instanceof PublishError && err.kind === 'cannot_post' && /קבוצת פייסבוק/.test(err.message),
      `${url || '(empty)'} must be refused with a Hebrew reason, not opened`,
    );
  }
  assert.equal(pagesOpened, 0, 'no browser page may be created for a refused address');
  console.log('✓ adapter refuses any address that is not a Facebook group, before opening a page');
}

async function main() {
  await adapterRefusesNonGroupUrls();
  const executablePath = findChromium();
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

  // 4. A page with only a comment box (no post composer) must be refused before any typing.
  const commentsOnly = path.join(tmpdir(), 'hapitaron-comments.html');
  writeFileSync(
    commentsOnly,
    `<html lang="he"><body><div role="main"><div>פוסט של מישהו</div>
     <form><div role="textbox" contenteditable="true" aria-label="כתבו תגובה…" id="c"></div><button type="button">שיתוף</button></form></div>
     <script>document.getElementById('c').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ window.__commented=(window.__commented||0)+1; } });</script></body></html>`,
  );
  await assert.rejects(
    publishToGroup(page, { groupUrl: `file://${commentsOnly}`, text: 'שורה 1\nשורה 2', images: [], video: null, onStep: async () => undefined }),
    (err: unknown) => err instanceof PublishError && err.kind === 'composer',
  );
  const commented = await page.evaluate(() => (window as unknown as { __commented?: number }).__commented ?? 0);
  assert.equal(commented, 0, 'nothing may be typed into a comment box');
  console.log('✓ comment-box-only page is refused, nothing typed');

  // 5. Newlines never submit: count bare Enter presses across the whole flow (survives navigation).
  const page2 = await context.newPage();
  await page2.addInitScript(() => {
    (window as unknown as { __enterPresses: number }).__enterPresses = 0;
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' && !e.shiftKey) (window as unknown as { __enterPresses: number }).__enterPresses += 1;
      },
      true,
    );
  });
  await publishToGroup(page2, { groupUrl: fixture, text: 'שורה א\nשורה ב\nשורה ג', images: [], video: null, onStep: async () => undefined, confirm: async () => 'cancelled' });
  const enters = await page2.evaluate(() => (window as unknown as { __enterPresses: number }).__enterPresses);
  assert.equal(enters, 0, 'no bare Enter may be pressed while typing');
  const typed = await page2.evaluate(() => localStorage.getItem('mockFeed'));
  assert.ok(!(typed ?? '').includes('שורה א'), 'cancelled run must not publish');
  console.log('✓ line breaks use Shift+Enter only');

  await browser.close();
  console.log('composer tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
