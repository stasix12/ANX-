import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import type { SocialTarget } from '@/lib/social/types';
import { FacebookGroupBrowserAdapter } from '../adapters/facebookGroupBrowser';
import { PublishError, commentOnPost, publishToGroup } from '../facebook/composer';
import { matchPosts, ourPostsInGroup } from '../facebook/postIndex';
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

  /*
   * THE FIRST COMMENT LANDS ON OUR POST — and the decoy is how we know.
   *
   * The fixture's feed opens with somebody else's post, first in the DOM, with
   * its own comment box. Every failure mode of this feature ends there: a box
   * found by "the first one on the page", an article matched loosely, a click
   * that revealed the wrong composer. The owner's phone number under a
   * stranger's post, in a group they need to stay welcome in, is not a bug
   * anybody would notice from a green test — so the decoy makes it fail here.
   */
  const page3 = await context.newPage();
  await publishToGroup(page3, {
    groupUrl: fixture,
    /* WITH AN EMOJI IN THE FIRST LINE, because every one of the owner's posts
       has one and that is what broke this. Facebook renders it as an <img>,
       so the line as written is not a string the page contains. */
    text: 'ניקוי ספות בבאר שבע 🧽 מבצע לסוף השבוע',
    images: [],
    video: null,
    onStep: async () => undefined,
  });
  /* A separate action, taken later, exactly as the round screen takes it. */
  const left = await commentOnPost(page3, fixture, 'ניקוי ספות בבאר שבע 🧽 מבצע לסוף השבוע', 'לפרטים: 050-0000000', null);
  assert.equal(left.ok, true, `the comment must be left and verified, not merely attempted — got: ${left.reason}`);
  assert.equal(left.reason, '', 'a success carries no reason');
  /* No named helper inside the evaluate: tsx's esbuild rewrites one into a
     __name() call that does not exist in the page, and the read dies before
     its first statement. The same hazard the account reader was built around,
     and this test tripped it while being written. */
  const landed = await page3.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('[role="article"]'));
    const decoy = articles.find((a) => a.id === 'decoy');
    const ours = articles.find((a) => (a.textContent ?? '').includes('ניקוי ספות בבאר שבע'));
    return {
      onDecoy: Array.from(decoy?.querySelectorAll('.comment') ?? []).map((c) => c.textContent ?? ''),
      onOurs: Array.from(ours?.querySelectorAll('.comment') ?? []).map((c) => c.textContent ?? ''),
    };
  });
  assert.deepEqual(landed.onDecoy, [], "nothing may be commented on somebody else's post");
  assert.deepEqual(landed.onOurs, ['לפרטים: 050-0000000'], 'and the comment belongs to the post we just published');
  console.log('✓ the first comment lands on our post, never on the decoy beside it');

  /* Asked for and not achievable is its own outcome — the post is already live
     and cannot be taken back, so it is reported rather than thrown. */
  const page4 = await context.newPage();
  const missing = await commentOnPost(page4, fixture, 'פוסט שמעולם לא פורסם כאן', 'לפרטים: 050-0000000', null);
  assert.equal(missing.ok, false, 'a post that is not on the page fails — never a comment somewhere else');
  const strayComments = await page4.evaluate(() => document.querySelectorAll('.comment').length);
  assert.equal(strayComments, 0, 'and nothing is typed anywhere while failing');
  console.log('✓ a post that cannot be found is reported, never guessed at');

  /*
   * A FAILURE SAYS WHY, IN HEBREW, ON THE SCREEN.
   *
   * This feature spent two rounds answering "לא הצליח" and nothing else,
   * which is the answer that makes a person press the same button again. The
   * sentence is not decoration: it is the difference between a post the admin
   * deleted (nothing to retry) and a group that closed comments (nothing to
   * retry either, but for a different reason) and a security screen (fix it
   * and retry). So it is asserted, not merely produced.
   */
  assert.ok(missing.reason.length > 10, 'a failure carries a whole sentence, not a code');
  assert.ok(/[\u0590-\u05FF]/.test(missing.reason), 'and it is in Hebrew — it is shown to the owner');
  assert.ok(missing.tried.length > 0, 'and it records where it looked, for the terminal');
  console.log('✓ a failed comment reports a Hebrew reason and the addresses it tried');

  /*
   * THE ADDRESS BOOK, END TO END.
   *
   * The owner's instruction, and the correction to three rounds of guessing:
   * read each post's own address ONCE and keep it, instead of hunting the
   * group for the post's words every single time. This proves the reading —
   * the address comes off the page, the tracking parameters are stripped, and
   * the post we published is matched to the address it actually has.
   */
  const page5 = await context.newPage();
  await page5.goto(fixture, { waitUntil: 'domcontentloaded' });
  await page5.waitForTimeout(1000);
  /* The reader navigates the page it is given, so it gets its own — and
     file:// is not facebook.com, so it refuses every address there. That is
     the right answer and not what this is testing: the page below proves the
     SHAPE is on the page for the real reader to find. */
  const page6 = await context.newPage();
  const ours = await ourPostsInGroup(page6, fixture.replace(/\/mock-group\.html$/, ''), 'x');
  /* url and text read TOGETHER, in one pass. Read as two lists they come
     back misaligned the moment one post has no address — which the decoy does
     not — and the test then compares our post's text against somebody else's
     link. */
  const onPage = await page5.evaluate(() =>
    Array.from(document.querySelectorAll('[role="article"]')).map((a) => ({
      href: (a.querySelector('a[href*="/posts/"]') as HTMLAnchorElement | null)?.href ?? '',
      text: (a as HTMLElement).innerText ?? '',
    })),
  );
  const withLinks = onPage.filter((p) => p.href);
  assert.ok(withLinks.length > 0, 'every post carries its own address on the page');
  assert.ok(withLinks.every((p) => p.href.includes('/posts/')), 'and it is a permalink, not a profile link');
  assert.deepEqual(ours, [], 'while an address that is not facebook.com is refused outright');

  /* And the matching, over the real shape: our post's text against the page's
     rendering of it, with the tracking parameters already stripped. */
  const cleaned = withLinks.map((p) => ({ url: `https://www.facebook.com${new URL(p.href).pathname}`, text: p.text }));
  assert.ok(cleaned.every((p) => !p.url.includes('__cft__')), 'tracking parameters never reach what is stored');
  const mine = cleaned.find((p) => p.text.includes('ניקוי ספות בבאר שבע'));
  assert.ok(mine, 'our own post is on the page, with its address');
  assert.deepEqual(
    matchPosts([{ id: 'q1', text: 'ניקוי ספות בבאר שבע 🧽 מבצע לסוף השבוע' }], [mine]),
    { q1: mine.url },
    'and it is matched to its own address, emoji and all',
  );
  console.log('✓ each post carries an address the worker can read once and keep');

  /*
   * THE PICTURE, OR NOTHING.
   *
   * The owner asks for a comment with a picture. A comment with the words and
   * no picture is not a smaller version of that — it is a different comment,
   * under their name, on a post that is already live, and it cannot be taken
   * back. Every step of attaching it used to end in a swallowed error, so the
   * text went out alone and the screen said "הגיב".
   *
   * The fixture builds the comment form the way Facebook does: the file input
   * lives in the FORM, not in the article, it is created lazily by the camera,
   * and the upload takes a moment. All three are what broke this.
   */
  const page7 = await context.newPage();
  await publishToGroup(page7, {
    groupUrl: fixture,
    text: 'מבצע ניקוי מזרנים בבאר שבע 🛏️ החודש בלבד',
    images: [],
    video: null,
    onStep: async () => undefined,
  });
  const withPhoto = await commentOnPost(page7, fixture, 'מבצע ניקוי מזרנים בבאר שבע 🛏️ החודש בלבד', 'לפרטים: 050-0000000', img1);
  assert.equal(withPhoto.ok, true, `a comment with a picture must go out — got: ${withPhoto.reason}`);
  const landedPhoto = await page7.evaluate(() => {
    const art = Array.from(document.querySelectorAll('[role="article"]')).find((a) => (a.textContent ?? '').includes('ניקוי מזרנים'));
    return Array.from(art?.querySelectorAll('.comment') ?? []).map((c) => ({
      text: c.textContent ?? '',
      photo: (c as HTMLElement).dataset.photo === '1',
    }));
  });
  assert.deepEqual(
    landedPhoto,
    [{ text: 'לפרטים: 050-0000000', photo: true }],
    'and the picture must be ON it — text alone is a different comment, and it cannot be taken back',
  );
  console.log('✓ a comment with a picture carries the picture, or is not sent at all');

  /*
   * THE SAME THING ON THE POST'S OWN PAGE, WHERE IT ACTUALLY BROKE.
   *
   * The fixture above nests the comment form, its file input and its preview
   * all inside the [role=article], so every scope the attach tried contained
   * the thumbnail and the check could not be wrong. Facebook's permalink is a
   * modal and does not nest them that way: the preview is mounted beside the
   * form, not in it. Counting the form therefore saw nothing change, and a
   * picture that was plainly on the screen was reported as "לא הצלחנו לצרף
   * את התמונה" — the failure the owner sent a screenshot of.
   *
   * This fixture reproduces exactly that, plus the two smaller shapes that
   * came with it: a camera labelled "צירוף קובץ תמונה" (a word between the
   * verb and the noun, which the old pattern could not match) and a comment
   * box named through aria-labelledby (so aria-label is null).
   */
  const page8 = await context.newPage();
  const dialogFixture = `file://${path.resolve(__dirname, 'mock-post-dialog.html')}`;
  const inDialog = await commentOnPost(page8, dialogFixture, 'מבצע ניקוי ספות בבאר שבע 🛋️ החודש בלבד', 'לפרטים: 050-0000000', img1);
  assert.equal(inDialog.ok, true, `a preview mounted outside the comment form is still the picture — got: ${inDialog.reason}`);
  const dialogComments = await page8.evaluate(() =>
    Array.from(document.querySelectorAll('.comment')).map((c) => ({
      text: c.textContent ?? '',
      photo: (c as HTMLElement).dataset.photo === '1',
    })),
  );
  assert.deepEqual(
    dialogComments,
    [{ text: 'לפרטים: 050-0000000', photo: true }],
    'and it goes out once, with the picture on it',
  );
  console.log('✓ the picture is found where Facebook actually shows it, not only where the input is');

  await browser.close();
  console.log('composer tests OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
