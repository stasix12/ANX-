import type { Locator, Page } from 'playwright-core';
import { fb, firstAttached, firstVisible, patterns } from './selectors';
import { assertUsable, classifyPage } from './session';

/**
 * The actual "post to a group" choreography, written against the selector
 * catalogue only. Every stage reports progress through onStep so the
 * dashboard can show "🌐 opening → 📝 composer → 📤 uploading → ✅ ready →
 * ⏳ publishing → 🔎 verifying".
 */

export type ComposerStep = 'opening' | 'composer_opened' | 'uploading_media' | 'ready_to_publish' | 'publishing' | 'verifying';

export class PublishError extends Error {
  constructor(
    public kind: 'cannot_post' | 'composer' | 'upload' | 'rejected' | 'timeout',
    message: string,
    /** True once the Post button was clicked — a retry could double-post. */
    public afterSubmit = false,
  ) {
    super(message);
  }
}

export interface ComposeInput {
  groupUrl: string;
  text: string;
  images: string[];
  video: string | null;
  onStep: (step: ComposerStep) => Promise<void>;
  /** Called at "ready to publish" when the owner wants to approve the first runs by hand. */
  confirm?: (page: Page) => Promise<'confirmed' | 'cancelled' | 'timeout'>;
  /**
   * Text to leave as the FIRST COMMENT on the post that was just published.
   *
   * Empty or absent means none. It exists because contact details in the body
   * of a group post are what group admins delete and what readers scroll past,
   * while the same details one line down in a comment are neither.
   */
  firstComment?: string;
}

export interface ComposeResult {
  outcome: 'published' | 'cancelled';
  /** The feed showed the new post text after publishing. */
  verified: boolean;
  /** Group moderates posts — it exists but waits for an admin. */
  pendingApproval: boolean;
  groupTitle: string;
  /**
   * 'none'   — none was asked for
   * 'posted' — left on the post
   * 'failed' — asked for, and it did not happen
   *
   * Three states, not a boolean, because "we did not try" and "we tried and
   * could not" are different things to tell the owner about a post that is
   * already live and cannot be taken back.
   */
  comment: 'none' | 'posted' | 'failed';
}

const IMAGE_UPLOAD_TIMEOUT = 3 * 60_000;
const VIDEO_UPLOAD_TIMEOUT = 15 * 60_000;

export async function publishToGroup(page: Page, input: ComposeInput): Promise<ComposeResult> {
  // 1. Open the group ------------------------------------------------------
  /*
   * `groupUrl` must already have been through parseGroupUrl — the adapter does
   * it (worker/adapters/facebookGroupBrowser.ts), because the adapter is where
   * the address crosses over from the database into this browser. Do not accept
   * a raw social_targets.url here: this page carries the owner's live Facebook
   * session and the failure path screenshots whatever it landed on.
   *
   * The check lives one layer up rather than here so worker/test/composer.test.ts
   * can still drive this choreography against its local mock-group.html fixture,
   * which is the whole reason the composer takes a URL instead of a target.
   */
  await input.onStep('opening');
  await page.goto(input.groupUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3000);
  assertUsable(await classifyPage(page));
  const groupTitle = (await page.title().catch(() => '')).replace(patterns.titleSuffix, '').trim();

  if (await fb.cannotPostText(page).isVisible({ timeout: 800 }).catch(() => false)) {
    throw new PublishError('cannot_post', 'לפי פייסבוק אי אפשר לפרסם בקבוצה הזו מהחשבון הזה (לא חבר / אין הרשאה).');
  }

  // 2. Open the composer ---------------------------------------------------
  let dialog = await openComposer(page);
  if (!dialog) {
    // A second try after scrolling to the top — the box is above the feed.
    await page.mouse.wheel(0, -2000).catch(() => undefined);
    await page.waitForTimeout(1500);
    dialog = await openComposer(page);
  }
  if (!dialog) {
    assertUsable(await classifyPage(page));
    throw new PublishError('composer', 'לא מצאתי את תיבת "כתבו משהו…" בקבוצה. ייתכן שאין הרשאת פרסום או ש-Facebook שינתה את הממשק (facebook/selectors.ts).');
  }
  await input.onStep('composer_opened');

  // 3. Text ----------------------------------------------------------------
  const textbox = await firstVisible(fb.textbox(dialog), 15_000);
  if (!textbox) throw new PublishError('composer', 'חלון הפוסט נפתח אבל אין בו תיבת טקסט.');
  const dialogName = (await dialog.getAttribute('aria-label').catch(() => '')) ?? '';
  if (patterns.commentBox.test(dialogName)) {
    throw new PublishError('composer', `החלון שנפתח הוא חלון תגובות ("${dialogName}"), לא יצירת פוסט — עצרתי.`);
  }
  await typeIntoEditor(page, textbox, input.text);

  // 4. Media ---------------------------------------------------------------
  const files = input.video ? [input.video] : input.images;
  if (files.length) {
    await input.onStep('uploading_media');
    await attachFiles(page, dialog, files);
    await waitForUploads(dialog, files.length, input.video ? VIDEO_UPLOAD_TIMEOUT : IMAGE_UPLOAD_TIMEOUT);
  }

  // 5. Ready — optional human confirmation ---------------------------------
  const postButton = await enabledPostButton(dialog, 30_000);
  if (!postButton) throw new PublishError('composer', 'כפתור "פרסום" לא הפך לזמין — ייתכן שההעלאה לא הסתיימה.');
  await input.onStep('ready_to_publish');
  if (input.confirm) {
    const verdict = await input.confirm(page);
    if (verdict !== 'confirmed') {
      await discardComposer(page);
      return { outcome: 'cancelled', verified: false, pendingApproval: false, groupTitle, comment: 'none' };
    }
  }

  // 6. Publish -------------------------------------------------------------
  await input.onStep('publishing');
  assertUsable(await classifyPage(page));
  await postButton.click();
  let submitted = true;

  // 7. Verify --------------------------------------------------------------
  await input.onStep('verifying');
  try {
    await dialog.waitFor({ state: 'detached', timeout: input.video ? VIDEO_UPLOAD_TIMEOUT : 90_000 });
  } catch {
    // Still open: either an error banner or a slow upload.
    if (await fb.failureText(page).isVisible({ timeout: 1000 }).catch(() => false)) {
      submitted = false;
      throw new PublishError('rejected', `Facebook דחה את הפוסט: ${await fb.failureText(page).innerText().catch(() => '')}`.trim(), true);
    }
    throw new PublishError('timeout', 'חלון הפוסט לא נסגר אחרי הלחיצה על "פרסום". בדקו בקבוצה אם הפוסט עלה לפני ניסיון נוסף.', true);
  }
  await page.waitForTimeout(2500);
  if (await fb.failureText(page).isVisible({ timeout: 1500 }).catch(() => false)) {
    throw new PublishError('rejected', `Facebook הודיע על כישלון: ${await fb.failureText(page).innerText().catch(() => '')}`.trim(), true);
  }
  assertUsable(await classifyPage(page));
  const pendingApproval = await fb.pendingText(page).isVisible({ timeout: 1500 }).catch(() => false);
  const verified = submitted && (await verifyInFeed(page, input.groupUrl, input.text));

  /*
   * 8. The first comment ----------------------------------------------------
   *
   * ONLY ON A POST WE POSITIVELY FOUND. `verified` means our own text was
   * located in the feed; without it we do not know which post on this page is
   * ours, and the failure mode is not a missing comment — it is the owner's
   * phone number appearing under a stranger's post, in a group they need to
   * stay welcome in. So a comment is never a guess: no verification, no
   * comment, and the result says so.
   *
   * It also never fails the publication. The post is already live and cannot
   * be taken back, so a comment that did not happen is reported and left at
   * that rather than turned into an error that invites a retry — a retry here
   * would publish the post a second time.
   */
  let comment: ComposeResult['comment'] = 'none';
  if (input.firstComment?.trim()) {
    comment = verified && (await addFirstComment(page, input.text, input.firstComment.trim())) ? 'posted' : 'failed';
  }
  return { outcome: 'published', verified, pendingApproval, groupTitle, comment };
}

/**
 * Leave a comment on the post whose text we just published.
 *
 * Anchored to the post, never to the page. Facebook renders every post AND
 * every comment as role="article", so the container is the outermost article
 * carrying our own text — and the comment box is looked for inside it. Typing
 * into the first comment box on the page would put the owner's details under
 * whatever Facebook happened to render first.
 *
 * Enter submits, which is the exact opposite of the rule in the composer above
 * (where Enter must never be pressed, because it posts). Same key, opposite
 * meaning, in two boxes that look alike — which is why openComposer refuses a
 * comment box and this refuses everything that is not one.
 */
async function addFirstComment(page: Page, postText: string, comment: string): Promise<boolean> {
  const probe = postText
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length >= 12)
    ?.slice(0, 40);
  if (!probe) return false;
  try {
    const article = page.locator('[role="article"]').filter({ hasText: probe }).first();
    if (!(await article.isVisible({ timeout: 8_000 }).catch(() => false))) return false;
    await article.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);

    // The box is sometimes behind the "comment" control rather than on screen.
    let box = article.getByRole('textbox', { name: patterns.commentBox }).first();
    if (!(await box.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await article
        .getByRole('button', { name: patterns.commentBox })
        .first()
        .click({ timeout: 5_000 })
        .catch(() => undefined);
      await page.waitForTimeout(1200);
      box = article.getByRole('textbox', { name: patterns.commentBox }).first();
    }
    if (!(await box.isVisible({ timeout: 5_000 }).catch(() => false))) return false;

    /* The name must say "comment". A composer box inside the same article
       would take this text and publish it as a second post. */
    const label = (await box.getAttribute('aria-label').catch(() => '')) ?? '';
    if (!patterns.commentBox.test(label)) return false;

    await box.click({ timeout: 5_000 });
    // Shift+Enter for line breaks, exactly as the composer does: a bare Enter
    // mid-text would submit half a comment and leave the rest orphaned.
    const lines = comment.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (i) await page.keyboard.press('Shift+Enter');
      await page.keyboard.type(lines[i], { delay: 15 });
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);

    /* Verified the same way the post is: found on the page, or it did not
       happen. An unverified comment reported as posted would have the owner
       believing their phone number is under a post where it is not. */
    const needle = lines.find((l) => l.trim().length >= 6)?.trim().slice(0, 30) ?? comment.slice(0, 30);
    return await article.getByText(needle, { exact: false }).first().isVisible({ timeout: 8_000 }).catch(() => false);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- stages */

async function openComposer(page: Page): Promise<Locator | null> {
  const trigger = await firstVisible(fb.composerTrigger(page), 20_000);
  if (!trigger) return null;
  await trigger.scrollIntoViewIfNeeded().catch(() => undefined);
  await trigger.click({ timeout: 10_000 }).catch(() => undefined);
  // Let the dialog animate in before looking for it.
  await page.waitForTimeout(1500);
  // Only a real dialog counts. A feed comment box also has an editable
  // field, and typing there would post comments — never fall back to it.
  return firstVisible(fb.composerDialog(page), 15_000);
}

/**
 * Types into the composer. Guards first: the field must not be a comment
 * box (its accessible name says "comment"/"תגובה"), because there Enter
 * submits. Newlines are always Shift+Enter, which is a line break in every
 * Facebook editor and never a submit.
 */
async function typeIntoEditor(page: Page, textbox: Locator, text: string): Promise<void> {
  const label = [
    await textbox.getAttribute('aria-label').catch(() => ''),
    await textbox.getAttribute('aria-placeholder').catch(() => ''),
    await textbox.getAttribute('placeholder').catch(() => ''),
  ]
    .filter(Boolean)
    .join(' ');
  if (patterns.commentBox.test(label)) {
    throw new PublishError('composer', `זוהתה תיבת תגובה ("${label}") במקום חלון פוסט — עצרתי כדי לא לפרסם תגובות.`);
  }
  await textbox.click({ timeout: 10_000 });
  await page.waitForTimeout(300);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const [i, line] of lines.entries()) {
    if (line) await page.keyboard.insertText(line);
    if (i < lines.length - 1) await page.keyboard.press('Shift+Enter');
  }
  await page.waitForTimeout(500);
  const probe = lines.find((l) => l.trim().length > 0)?.slice(0, 20) ?? '';
  const current = (await textbox.innerText().catch(() => '')) ?? '';
  if (probe && !current.includes(probe)) {
    // Fallback: real key presses, still never a bare Enter.
    await textbox.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    for (const [i, line] of lines.entries()) {
      if (line) await textbox.pressSequentially(line, { delay: 8 });
      if (i < lines.length - 1) await page.keyboard.press('Shift+Enter');
    }
  }
}

async function attachFiles(page: Page, dialog: Locator, files: string[]): Promise<void> {
  // Path A: the hidden input already exists (most common once the composer is open).
  let input = await firstAttached(fb.fileInput(page, dialog), 3000);
  if (!input) {
    // Path B: reveal it via the Photo/video button, catching the native chooser if one opens.
    const chooser = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    const button = await firstVisible(fb.photoVideo(dialog), 8000);
    if (button) await button.click().catch(() => undefined);
    const fc = await chooser;
    if (fc) {
      await fc.setFiles(files);
      return;
    }
    input = await firstAttached(fb.fileInput(page, dialog), 8000);
  }
  if (!input) throw new PublishError('upload', 'לא מצאתי את שדה העלאת הקבצים בחלון הפוסט.');
  await input.setInputFiles(files);
}

async function waitForUploads(dialog: Locator, expected: number, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  let stableSince = 0;
  while (Date.now() < deadline) {
    const previews = await fb.mediaPreview(dialog).count().catch(() => 0);
    const busy = (await fb.uploadProgress(dialog).count().catch(() => 0)) > 0;
    // Several photos → Facebook collapses them into a collage with "Edit all";
    // that, with no progress bar, means every file is in.
    const collage = expected > 1 && (await fb.collageReady(dialog).isVisible({ timeout: 200 }).catch(() => false));
    const done = !busy && (previews >= expected || collage || (expected > 1 && previews >= 1 && Date.now() - stableSince > 8000 && stableSince > 0));
    if (done) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince > 1500) return;
    } else if (previews >= 1 && !busy) {
      // At least one preview and no progress bar: start the patience clock.
      if (!stableSince) stableSince = Date.now();
    } else {
      stableSince = 0;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new PublishError('upload', `ההעלאה לא הסתיימה בזמן (${expected} קבצים).`);
}

async function enabledPostButton(dialog: Locator, timeout: number): Promise<Locator | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const button = await firstVisible(fb.postButton(dialog), 1000);
    if (button) {
      const disabled = (await button.getAttribute('aria-disabled').catch(() => null)) === 'true';
      if (!disabled) return button;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function discardComposer(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(800);
  const discard = page.getByRole('button', { name: /^(discard|leave|delete post|מחיקה|ביטול|יציאה|השלכה|удалить|не сохранять)$/i }).first();
  if (await discard.isVisible({ timeout: 1500 }).catch(() => false)) await discard.click().catch(() => undefined);
}

/** Look for the first line of the post in the feed — first as-is (Facebook inserts it at the top), then after a reload. Best effort. */
async function verifyInFeed(page: Page, groupUrl: string, text: string): Promise<boolean> {
  const probe = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length >= 12)
    ?.slice(0, 40);
  if (!probe) return false;
  const visible = () => page.getByText(probe, { exact: false }).first().isVisible({ timeout: 8_000 }).catch(() => false);
  if (await visible()) return true;
  try {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2500);
    return await visible();
  } catch {
    return false;
  }
}
