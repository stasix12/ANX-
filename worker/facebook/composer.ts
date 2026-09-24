import type { Locator, Page } from 'playwright-core';
import { parseGroupUrl } from '@/lib/social/types';
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
  /**
   * The post's own address, read off the feed right after publishing.
   *
   * THE ROOT FIX for a problem that showed up much later: commenting on a post
   * and reading its counters both need to find it again, and a group post has
   * no address anywhere in the database — so both were reduced to scrolling a
   * group's feed looking for the text. Three hours of other people's posts
   * later that stops working, which is exactly what the owner saw.
   *
   * Captured here because this is the one moment the post is guaranteed to be
   * at the top of the feed. Empty when the feed did not yield one; nothing
   * downstream may assume it is there.
   */
  permalink: string;
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
      return { outcome: 'cancelled', verified: false, pendingApproval: false, groupTitle, permalink: '' };
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
  const permalink = verified ? await readPermalink(page, input.text) : '';
  return { outcome: 'published', verified, pendingApproval, groupTitle, permalink };
}

/**
 * The permalink of the post we just published, from the feed.
 *
 * Facebook hangs it on the timestamp above every post — a link to
 * /groups/<id>/posts/<id> or /permalink/. Read while the post is still at the
 * top of the feed, because that is the only moment it is cheap to find.
 *
 * Best-effort throughout: an empty string is a fine answer and every caller
 * has to work without one, since every post published before this existed has
 * none.
 */
async function readPermalink(page: Page, postText: string): Promise<string> {
  try {
    const article = await findPostArticle(page, postText);
    if (!article) return '';
    const href = await article
      .locator('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="]')
      .first()
      .getAttribute('href')
      .catch(() => null);
    if (!href) return '';
    const url = new URL(href, 'https://www.facebook.com');
    if (!/(^|\.)facebook\.com$/.test(url.hostname)) return '';
    /* Tracking parameters change on every render and would make the same post
       look like a different one each time it is read. */
    return `https://www.facebook.com${url.pathname}`;
  } catch {
    return '';
  }
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
  const probe = pageProbe(postText);
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
 * What happened when we tried to comment — in Hebrew, for the owner's screen.
 *
 * "It did not work" is the answer this feature kept giving, twice in a row,
 * and it is the answer that makes a person press the same button again. Each
 * of these is a different thing to do next, so each of them says which.
 */
export interface CommentOutcome {
  ok: boolean;
  /** A whole Hebrew sentence, or '' when it worked. Shown on the screen. */
  reason: string;
  /** Where the post turned out to live, so nobody has to find it again. */
  permalink: string;
  /** For the terminal only: the addresses tried, in order. */
  tried: string[];
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
  authorId = '',
): Promise<CommentOutcome> {
  const tried: string[] = [];
  /*
   * FIND THE POST'S OWN PAGE FIRST, then comment there.
   *
   * The previous version commented wherever it found the post — including on
   * a search results page, where Facebook renders a post in a condensed form
   * whose comment control opens a dialog rather than an inline box. It found
   * the post and then could not comment on it, which is a failure that looks
   * exactly like not finding it.
   *
   * So search is used for what it is good at: turning words into an address.
   * The comment happens on the post's own page, where the box is reliably
   * there — and the group's feed stays as the fallback below, because a
   * markup change that hides the permalink must not take the whole feature
   * with it.
   */
  let permalink = /\/(posts|permalink)\//.test(url) ? url : '';
  const group = parseGroupUrl(url);
  if (!permalink && group) {
    for (const where of lookupPages(group.url, postText, authorId)) {
      tried.push(where);
      permalink = await findPermalinkAt(page, where, postText);
      if (permalink) break;
    }
  }

  if (permalink) {
    tried.push(permalink);
    const at = await commentAt(page, permalink, postText, comment, image);
    /* 'no-post' on the post's own page means the address is stale or the post
       is gone — worth one look at the feed. Any other stop happened WITH the
       post in front of us, and repeating it on the feed would risk a second
       comment on a post that already has one. */
    if (at !== 'no-post') {
      return at === 'ok'
        ? { ok: true, reason: '', permalink, tried }
        : { ok: false, reason: COMMENT_REASON[at], permalink, tried };
    }
  }

  /*
   * The feed, in place — where this worked before the permalink existed.
   *
   * A post published before this version has no address stored, and a group
   * whose markup we failed to read gives none either. Commenting here is less
   * reliable than on the post's own page, which is why it is second, but it is
   * far better than a feature that stops the day a link attribute changes.
   */
  const feed = group?.url ?? url;
  tried.push(feed);
  const inFeed = await commentAt(page, feed, postText, comment, image);
  if (inFeed === 'ok') return { ok: true, reason: '', permalink, tried };
  return { ok: false, reason: COMMENT_REASON[inFeed], permalink, tried };
}

/** Open a page and try to comment on our post there. */
async function commentAt(
  page: Page,
  where: string,
  postText: string,
  comment: string,
  image: string | null,
): Promise<CommentStep> {
  try {
    await page.goto(where, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch {
    return 'no-post';
  }
  await page.waitForTimeout(3000);
  if ((await classifyPage(page).catch(() => 'ok' as const)) !== 'ok') return 'blocked';
  return await addComment(page, postText, comment, image);
}

/** Each failure mode of addComment, as something the owner can act on. */
const COMMENT_REASON: Record<Exclude<CommentStep, 'ok'>, string> = {
  'no-post': 'לא מצאנו את הפוסט הזה בקבוצה — ייתכן שהוא נמחק, או שמנהל הקבוצה הסיר אותו.',
  'no-box': 'אין אפשרות להגיב על הפוסט הזה — ייתכן שמנהל הקבוצה סגר תגובות.',
  'not-sent': 'כתבנו את התגובה אבל פייסבוק לא אישרה שהיא נוספה.',
  blocked: 'פייסבוק ביקשה אימות באמצע — היכנסו למסך החשבון והשלימו אותו.',
};

/**
 * The post's own address, found on whatever page lists it.
 *
 * Search results and the feed both render a post with its timestamp linked to
 * the post itself, so one reader serves both.
 */
async function findPermalinkAt(page: Page, where: string, postText: string): Promise<string> {
  try {
    await page.goto(where, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);
    if ((await classifyPage(page).catch(() => 'ok' as const)) !== 'ok') return '';
    return await readPermalink(page, postText);
  } catch {
    return '';
  }
}

/**
 * Where to look for one of our own posts in a group, best first.
 *
 * 1. OUR OWN POSTS IN THIS GROUP — `/groups/<id>/user/<our id>/`. Facebook
 *    filters the group to one member's posts, so what loads is the three or
 *    four things WE put there rather than three hours of everybody else's.
 *    This is the page that actually answers the question, and it is first
 *    because the two below both failed on the owner's machine: the screen
 *    said "לא מצאנו את הפוסט הזה בקבוצה" about posts that were plainly there.
 * 2. THE GROUP'S SEARCH — words to an address, when we have no id to filter
 *    by. Facebook's group search misses recent posts often enough that it
 *    cannot be the only answer, but it costs one page load.
 * 3. THE FEED — last, and only really useful for a post from minutes ago.
 *    Twelve scrolls do not reach an afternoon's worth of other people's
 *    posts, which is the whole reason the first entry exists.
 */
export function lookupPages(groupUrl: string, postText: string, authorId: string): string[] {
  const out: string[] = [];
  if (authorId) out.push(`${groupUrl}/user/${authorId}/`);
  const words = searchWords(postText);
  if (words) out.push(`${groupUrl}/search/?q=${encodeURIComponent(words)}`);
  out.push(groupUrl);
  return out;
}

/**
 * Emoji, variation selectors and joiners — everything Facebook may render as a
 * picture instead of as text.
 */
const PICTURE_CHARS = /[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]+/gu;

/**
 * The words to look for a post by, IN A PAGE.
 *
 * NEVER CONTAINS AN EMOJI, and that is the whole point. Facebook swaps emoji in
 * post text for <img> elements, so a post written "ניקוי ספות 🧽" has a HOLE in
 * its text where the emoji is — the line as written is not a string the page
 * contains. Looking for it finds nothing, and "nothing" is indistinguishable
 * from a post that was deleted.
 *
 * That is not a hypothetical: every one of the owner's posts opens with an
 * emoji, so every lookup failed, and the screen reported 117 posts that were
 * exactly where they should be as missing.
 *
 * So the text is cut into runs at every emoji, LINE BY LINE — a run may never
 * cross a line break, because Facebook's markup puts each line in its own
 * element and the text of the two together has no space between them. The
 * first run long enough to be distinctive wins; the longest is the fallback.
 */
export function pageProbe(postText: string): string {
  const runs = postText
    .split('\n')
    .flatMap((line) => line.split(PICTURE_CHARS))
    .map((run) => run.replace(/\s+/g, ' ').trim())
    .filter((run) => run.length >= 12);
  if (!runs.length) return '';
  /* The headline first when it is substantial — it is what makes this post
     this post. The longest run only when no line is distinctive on its own,
     since boilerplate repeated across every post would match a neighbour. */
  const headline = runs.find((run) => run.length >= 20);
  const longest = runs.reduce((a, b) => (b.length > a.length ? b : a));
  return (headline ?? longest).slice(0, 40);
}

/**
 * The same words, as something a SEARCH BOX can use.
 *
 * Punctuation goes too: a search engine handed "ניקוי ספות — מבצע" treats the
 * dash as a token and finds less than the words alone would.
 */
export function searchWords(postText: string): string {
  return pageProbe(postText)
    .replace(/[^\p{Letter}\p{Number}\s'"-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/** Where the attempt stopped. Each one is a different thing to do next. */
export type CommentStep = 'ok' | 'no-post' | 'no-box' | 'not-sent' | 'blocked';

async function addComment(page: Page, postText: string, comment: string, image: string | null): Promise<CommentStep> {
  const article = await findPostArticle(page, postText);
  if (!article) return 'no-post';
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
    if (!(await box.isVisible({ timeout: 5_000 }).catch(() => false))) return 'no-box';

    /* The name must say "comment". A composer box inside the same article
       would take this text and publish it as a second post. */
    const label = (await box.getAttribute('aria-label').catch(() => '')) ?? '';
    if (!patterns.commentBox.test(label)) return 'no-box';

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
    /*
     * The proof is the box, not the text.
     *
     * Looking for the words on the page is the obvious check and it is wrong:
     * before the comment is sent, those exact words are sitting in the box, so
     * a comment that failed reads back as one that worked. Facebook empties
     * the box only once it has accepted the comment, so an empty box is the
     * one signal that cannot come from our own typing — and it works for a
     * picture with no words, which has nothing to read back at all.
     */
    const emptied = await box
      .innerText()
      .then((t) => t.trim() === '')
      .catch(() => false);
    if (emptied) return 'ok';

    /* The box can also be replaced outright rather than cleared, and a
       replaced box reads as an error above. Then — and only then, with our
       text no longer in any box — the words on the page mean what they say. */
    const stillThere = await box.isVisible({ timeout: 1_000 }).catch(() => false);
    const needle = lines.find((l) => l.trim().length >= 6)?.trim().slice(0, 30) ?? '';
    if (!stillThere && needle) {
      const shown = await page
        .getByText(needle, { exact: false })
        .first()
        .isVisible({ timeout: 8_000 })
        .catch(() => false);
      if (shown) return 'ok';
    }
    return 'not-sent';
  } catch {
    return 'not-sent';
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
  const probe = pageProbe(text);
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
