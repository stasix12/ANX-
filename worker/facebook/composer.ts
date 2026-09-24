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
}

export interface ComposeResult {
  outcome: 'published' | 'cancelled';
  /** The feed showed the new post text after publishing. */
  verified: boolean;
  /** Group moderates posts — it exists but waits for an admin. */
  pendingApproval: boolean;
  groupTitle: string;
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
      return { outcome: 'cancelled', verified: false, pendingApproval: false, groupTitle };
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
  return { outcome: 'published', verified, pendingApproval, groupTitle };
}

/**
 * The article on this page that holds OUR post, found by its own text.
 *
 * Exported because the comment writer and the metrics reader both need the
 * same answer to the same question, and getting it twice in two slightly
 * different ways is how one of them ends up reading a neighbour's post.
 *
 * ANCHORED TO THE TEXT, not to a position. A group publishes a permalink
 * nowhere the worker can see, so "our post" can only ever mean "the post
 * carrying the words we published" — and everything downstream depends on
 * that being exactly right: a comment under a stranger's post, or a stranger's
 * comment count reported as ours.
 *
 * Facebook renders every post AND every comment as role="article", so the
 * outermost one carrying the text is the post. It also loads the feed
 * lazily, so a post from a few hours ago may not be on screen yet — hence the
 * scrolling, which stops the moment the post appears.
 */
export async function findPostArticle(page: Page, postText: string): Promise<Locator | null> {
  const probe = postText
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length >= 12)
    ?.slice(0, 40);
  if (!probe) return null;
  const article = page.locator('[role="article"]').filter({ hasText: probe }).first();
  let lastY = -1;
  for (let pass = 0; pass < 12; pass += 1) {
    if (await article.isVisible({ timeout: pass === 0 ? 6_000 : 1_000 }).catch(() => false)) return article;
    /* Not there yet. A group's feed loads as it is scrolled, and the post we
       want may be an hour of other people's posts down. */
    await page.mouse.wheel(0, 2500).catch(() => undefined);
    await page.waitForTimeout(1000);
    /*
     * Stop when the page stops moving. A feed that has run out — or a page
     * that never scrolled at all — will not produce the post no matter how
     * many more times we ask, and eleven more rounds of asking is half a
     * minute spent per post to reach the same answer.
     */
    const y = await page.evaluate(() => window.scrollY).catch(() => -1);
    if (y === lastY) break;
    lastY = y;
  }
  return null;
}

/**
 * Leave a comment on one published post.
 *
 * SEPARATE FROM PUBLISHING ON PURPOSE. It used to run in the same breath as
 * the post, off a global setting, and both halves were wrong: WHEN to comment
 * is a decision — a price list is worth adding after a post has had a few
 * hours to be seen, not in the same second — and the text belongs to the round
 * it is about rather than to a setting that would put last month's offer under
 * this month's posts. So this is an action the owner triggers, over a round,
 * and this function does one post of it.
 *
 * Anchored to the post, never to the page. Facebook renders every post AND
 * every comment as role="article", so the container is the outermost article
 * carrying the post's own text — and the comment box is looked for inside it.
 * Typing into the first comment box on the page would put the owner's details
 * under whatever Facebook happened to render first.
 *
 * Enter submits, which is the exact opposite of the rule in the composer above
 * (where Enter must never be pressed, because it posts). Same key, opposite
 * meaning, in two boxes that look alike — which is why openComposer refuses a
 * comment box and this refuses everything that is not one.
 */
export async function commentOnPost(
  page: Page,
  url: string,
  postText: string,
  comment: string,
  image: string | null,
): Promise<boolean> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3000);
  /* A login wall or a checkpoint means whatever is on screen is not this
     post. Returning false leaves the row pending rather than marking a
     comment done that is not there. */
  if ((await classifyPage(page).catch(() => 'ok' as const)) !== 'ok') return false;
  return addComment(page, postText, comment, image);
}

async function addComment(page: Page, postText: string, comment: string, image: string | null): Promise<boolean> {
  const article = await findPostArticle(page, postText);
  if (!article) return false;
  try {
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

    /*
     * The picture first, then the words.
     *
     * Facebook uploads a comment attachment while the box stays editable, so
     * starting the upload before typing hides most of its latency behind the
     * keystrokes. It also avoids the reverse order's hazard: a stray Enter
     * while a file dialog is open goes nowhere useful.
     *
     * Everything here is scoped to `article`. A file input found anywhere on
     * the page would just as happily belong to the post composer at the top of
     * the group, and the picture would become a new POST.
     */
    if (image) {
      let fileInput = article.locator('input[type="file"]').first();
      if (!(await fileInput.count().then((n) => n > 0).catch(() => false))) {
        const chooser = page.waitForEvent('filechooser', { timeout: 8_000 }).catch(() => null);
        await article
          .getByRole('button', { name: patterns.commentPhoto })
          .first()
          .click({ timeout: 5_000 })
          .catch(() => undefined);
        const fc = await chooser;
        if (fc) await fc.setFiles(image);
        else fileInput = article.locator('input[type="file"]').first();
      }
      if (await fileInput.count().then((n) => n > 0).catch(() => false)) {
        await fileInput.setInputFiles(image).catch(() => undefined);
      }
      /* Give the attachment time to land. A comment submitted mid-upload goes
         out as text alone, which looks like the picture was never asked for. */
      await page.waitForTimeout(4000);
      await box.click({ timeout: 5_000 }).catch(() => undefined);
    }

    // Shift+Enter for line breaks, exactly as the composer does: a bare Enter
    // mid-text would submit half a comment and leave the rest orphaned.
    const lines = comment ? comment.split('\n') : [];
    for (let i = 0; i < lines.length; i += 1) {
      if (i) await page.keyboard.press('Shift+Enter');
      await page.keyboard.type(lines[i], { delay: 15 });
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);

    /* Verified the same way the post is: found on the page, or it did not
       happen. An unverified comment reported as posted would have the owner
       believing their phone number is under a post where it is not. */
    const needle = lines.find((l) => l.trim().length >= 6)?.trim().slice(0, 30) ?? '';
    if (needle) return await article.getByText(needle, { exact: false }).first().isVisible({ timeout: 8_000 }).catch(() => false);
    /* A picture with no words has nothing to read back, so the check is that
       the box emptied — Facebook clears it only once the comment is away. */
    return await box
      .innerText()
      .then((t) => t.trim() === '')
      .catch(() => false);
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
