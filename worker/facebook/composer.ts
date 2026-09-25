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
   * The earliest instant this post may be SUBMITTED — the spacing gap's own
   * moment, when the worker claimed this row before it had closed.
   *
   * Everything up to the final click happens regardless. Only the click
   * waits, and it waits with the post already written and the picture already
   * uploaded, so the gap and the preparation overlap instead of following one
   * another. Null means the gap is already open and nothing is held.
   */
  notBefore?: string | null;
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
  /**
   * The instant the post went live — the dialog detached and Facebook raised
   * no error — NOT the instant this function returned.
   *
   * The queue's spacing rule measures the gap between publications from the
   * previous one's published_at. Stamped by the caller after this returns, it
   * included every second spent looking for the post in the feed afterwards,
   * so verification was charged to the gap and the next row was held back by
   * it. On a queue set to one a minute that was most of the minute, and it
   * showed up as an endless run of "נדחה" in the log.
   */
  publishedAt: string;
}

/**
 * The longest the composer will sit on a prepared post waiting for the
 * spacing gap. A ceiling, not a target: the worker decides how early to claim
 * and never claims more than PREP_LEAD_MS early, so this only ever catches a
 * clock that moved or a setting that changed under a job in flight.
 */
const PREP_HOLD_CAP_MS = 3 * 60_000;

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
  /*
   * WAIT FOR THE PAGE, NOT FOR THE CLOCK.
   *
   * This was a flat three seconds, spent on every publication whether the
   * group had rendered in 400ms or was still coming. What the next two lines
   * actually need is for the page to have painted enough to be classified and
   * for the composer box to exist — so the wait ends the moment the box
   * appears, and only falls back to the old three seconds when it does not.
   * On a fast connection that is most of three seconds back, per group, with
   * nothing about the checks after it changed.
   */
  await firstVisible(fb.composerTrigger(page), 3000).catch(() => null);
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
      return { outcome: 'cancelled', verified: false, pendingApproval: false, groupTitle, permalink: '', publishedAt: '' };
    }
  }

  // 6. Publish -------------------------------------------------------------
  /*
   * THE GAP IS SERVED HERE, WITH EVERYTHING ALREADY PREPARED.
   *
   * The post is written, the picture is in and the button is live; all that
   * is left is the click. Holding it here is what turns "a minute between
   * publications" into a publication a minute: the queue used to satisfy the
   * gap BEFORE claiming the row, and then spend the whole preparation — page
   * load, typing, upload — on top of it, so the real interval was always the
   * gap plus a publication rather than the larger of the two.
   *
   * The wait is bounded by the caller: the worker only claims this early when
   * the remaining gap is short (PREP_LEAD_MS), so a composer is never left
   * open for long.
   */
  if (input.notBefore) {
    const left = new Date(input.notBefore).getTime() - Date.now();
    if (left > 0) await page.waitForTimeout(Math.min(left, PREP_HOLD_CAP_MS));
  }
  await input.onStep('publishing');
  assertUsable(await classifyPage(page));
  await postButton.click();

  // 7. Verify --------------------------------------------------------------
  await input.onStep('verifying');
  try {
    await dialog.waitFor({ state: 'detached', timeout: input.video ? VIDEO_UPLOAD_TIMEOUT : 90_000 });
  } catch {
    // Still open: either an error banner or a slow upload.
    if (await fb.failureText(page).isVisible({ timeout: 1000 }).catch(() => false)) {
      throw new PublishError('rejected', `Facebook דחה את הפוסט: ${await fb.failureText(page).innerText().catch(() => '')}`.trim(), true);
    }
    throw new PublishError('timeout', 'חלון הפוסט לא נסגר אחרי הלחיצה על "פרסום". בדקו בקבוצה אם הפוסט עלה לפני ניסיון נוסף.', true);
  }
  /* The dialog has already detached — that is the signal, and it was waited
     for properly on the line above. This is only a beat for the feed to start
     re-rendering before it is read; it was 2500ms. */
  await page.waitForTimeout(400);
  if (await fb.failureText(page).isVisible({ timeout: 1500 }).catch(() => false)) {
    throw new PublishError('rejected', `Facebook הודיע על כישלון: ${await fb.failureText(page).innerText().catch(() => '')}`.trim(), true);
  }
  assertUsable(await classifyPage(page));
  /*
   * THIS IS THE MOMENT THE POST EXISTS ON FACEBOOK.
   *
   * The dialog has detached and Facebook has not put up an error banner —
   * everything after this line is evidence-gathering about something that has
   * already happened. It is stamped HERE rather than left for the caller to
   * take after all of it, because the queue's spacing rule measures the gap
   * between publications from this instant: taken afterwards, the time spent
   * looking for the post in the feed was charged to the gap as well, so the
   * next row was held back by however long the verification took. The owner
   * saw that as "נדחה" on a queue set to one a minute, and they were right.
   */
  const publishedAt = new Date().toISOString();
  const pendingApproval = await fb.pendingText(page).isVisible({ timeout: 1500 }).catch(() => false);

  /*
   * ONE SEARCH, NOT TWO.
   *
   * Verification looked for the TEXT in the feed and then the permalink read
   * looked, separately, for the ARTICLE carrying that same text — two passes
   * over the same feed for the same post, each with its own wait and its own
   * reload. The article that carries our words IS the proof it published AND
   * the thing the address hangs on, so it is found once.
   */
  let article = await findPostArticle(page, input.text, 1, 6_000);
  if (!article) {
    try {
      await page.goto(input.groupUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(1200);
      article = await findPostArticle(page, input.text, 1, 6_000);
    } catch {
      /* Best effort throughout: an unverified post is reported as unverified,
         never as a failure — it is on Facebook either way. */
    }
  }

  /*
   * THE LATE REJECTION, CAUGHT WHERE THERE IS TIME TO CATCH IT.
   *
   * The banner is looked for twice: once straight after the dialog detaches,
   * and again HERE, seconds later, after the feed has been searched. The
   * first check alone was a ~1.9s window — a rejection Facebook renders later
   * than that was recorded as a successful publication, which is the one
   * outcome that must always reach a person. This second look costs nothing:
   * the time has already been spent looking for the post, and not finding it
   * is exactly when a rejection is most likely to be the reason.
   */
  if (!article && (await fb.failureText(page).isVisible({ timeout: 1000 }).catch(() => false))) {
    throw new PublishError('rejected', `Facebook הודיע על כישלון: ${await fb.failureText(page).innerText().catch(() => '')}`.trim(), true);
  }

  /*
   * VERIFIED IS A QUESTION ABOUT THE WORDS, NOT ABOUT THE MARKUP.
   *
   * The article search is strictly narrower than the text search it replaced:
   * it needs our words INSIDE a [role="article"] node. Facebook renders a
   * just-posted item in a transient wrapper often enough that the narrower
   * test reports "we could not verify the post" about a post that is plainly
   * on the page — a false alarm to the owner about the one thing they care
   * about. So the article is what the ADDRESS needs, and the words on the
   * page are what VERIFIED means; the fallback runs only when the article was
   * not found, which is the only case where the two can differ.
   */
  const probe = pageProbe(input.text);
  const verified = Boolean(article) || (Boolean(probe) && (await page.getByText(probe, { exact: false }).first().isVisible().catch(() => false)));
  const permalink = article ? await permalinkOf(article) : '';
  return { outcome: 'published', verified, pendingApproval, groupTitle, permalink, publishedAt };
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
async function permalinkOf(article: Locator): Promise<string> {
  try {
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
export async function findPostArticle(page: Page, postText: string, passes = 20, firstWaitMs = 8_000): Promise<Locator | null> {
  const probe = pageProbe(postText);
  if (!probe) return null;
  const article = page.locator('[role="article"]').filter({ hasText: probe }).first();
  const articles = page.locator('[role="article"]');
  let seen = -1;
  for (let pass = 0; pass < Math.max(1, passes); pass += 1) {
    /*
     * The first look WAITS; the rest only glance.
     *
     * `isVisible()` answers about the page as it is right now — its `timeout`
     * option bounds the call, it does not wait for anything to arrive. On a
     * feed that is still rendering, an instant glance is a "no" about a post
     * that was a second away. One real wait up front covers that; after it,
     * glancing is right, because each pass has just scrolled and it is the
     * scrolling that changes the answer.
     */
    if (pass === 0 ? await appears(article, firstWaitMs) : await article.isVisible().catch(() => false)) return article;
    /* One pass means one look. Scrolling and then sleeping 1200ms on the way
       out is a second and a half added to every publication whose post was
       not in the first screenful — in the caller that asked for one look
       precisely because it has nowhere to scroll to. */
    if (passes <= 1) return null;

    /*
     * Scrolled three ways, because no single one of them is reliable.
     *
     * A wheel event goes to whatever is under the pointer, and on a page
     * nobody has touched the pointer is at 0,0 — over the header, not the
     * feed. `window.scrollBy` moves the window, which is the right answer only
     * when the window is what scrolls. End moves whatever has focus. Together
     * they cost one extra moment per pass.
     */
    await page.mouse.move(400, 400).catch(() => undefined);
    await page.mouse.wheel(0, 2500).catch(() => undefined);
    await page.evaluate(() => window.scrollBy(0, 2500)).catch(() => undefined);
    await page.keyboard.press('End').catch(() => undefined);
    await page.waitForTimeout(1200);

    /*
     * PROGRESS IS MEASURED IN POSTS, NOT IN PIXELS — and that correction is
     * why this loop used to give up almost immediately.
     *
     * It stopped when window.scrollY stopped changing. On a Facebook feed the
     * window frequently does not scroll at all: an inner container does, and
     * scrollY sits at 0 forever. The first reading set the baseline, the
     * second matched it, and the loop broke after TWO passes — then reported
     * a post from this morning as missing.
     *
     * How many posts are on the page cannot lie about it: if scrolling loaded
     * more, we are getting somewhere, whatever it was that moved.
     */
    const count = await articles.count().catch(() => -1);
    if (count === seen) break;
    seen = count;
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
        : { ok: false, reason: explain(at, postText), permalink, tried };
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
  return { ok: false, reason: explain(inFeed, postText), permalink, tried };
}

/**
 * The failure, plus the words we actually looked for.
 *
 * "לא מצאנו את הפוסט" was true and useless: it could not tell the owner
 * whether the post was gone or whether we had been hunting for the wrong
 * string, and three rounds were spent guessing between those two. The words
 * are in the sentence now, so the answer is on the screen rather than in
 * somebody's reasoning — the owner can read the post, read the line, and see
 * in a second whether they match.
 */
function explain(step: Exclude<CommentStep, 'ok'>, postText: string): string {
  const reason = COMMENT_REASON[step];
  if (step !== 'no-post') return reason;
  const probe = pageProbe(postText);
  return probe ? `${reason} (חיפשנו את השורה: «${probe}»)` : `${reason} (אין בפוסט שורת טקסט להתבסס עליה.)`;
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
  /* Nothing was published. A comment with the words but without the picture
     is a different comment, and it cannot be taken back once it is up. */
  'no-photo': 'לא הצלחנו לצרף את התמונה לתגובה, ולכן לא פרסמנו אותה בלעדיה. נסו שוב.',
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
    /* The comment path is hunting a post from hours ago, so this one keeps
       the full scrolling search — see findPostArticle's own comment. */
    const article = await findPostArticle(page, postText);
    return article ? await permalinkOf(article) : '';
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
  const runsIn = (lines: string[]) =>
    lines
      .flatMap((line) => line.split(PICTURE_CHARS))
      .map((run) => run.replace(/\s+/g, ' ').trim())
      .filter((run) => run.length >= 12);

  const lines = postText.split('\n');
  /*
   * THE FIRST TWO LINES, because they are the only ones certainly on screen.
   *
   * Facebook shows about three lines of a post and hides the rest behind
   * "עוד…", and the hidden part is not always in the page at all. A probe
   * taken from the middle of a long post is a string the page does not
   * contain — the same failure as the emoji, reached from the other end.
   *
   * The longest of those two lines, because it is the most distinctive: the
   * boilerplate the owner repeats on every post would match the post beside
   * ours just as happily.
   */
  const opening = runsIn(lines.slice(0, 2));
  const pool = opening.length ? opening : runsIn(lines);
  if (!pool.length) return '';
  return pool.reduce((a, b) => (b.length > a.length ? b : a)).slice(0, 40);
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

/**
 * Wait for something to turn up, and say whether it did.
 *
 * EXISTS BECAUSE `isVisible({ timeout })` READS AS A WAIT AND IS NOT ONE.
 * It answers about the page as it is right now; the timeout bounds the call,
 * not the arrival. Every place that meant "give this a moment" and wrote
 * isVisible was asking a question one moment too early — the comment box that
 * was still opening, the picture still uploading, the comment Facebook had not
 * rendered yet. Each of those read as a failure.
 *
 * Where the current state IS the question — "is the box still there?" — a
 * glance is right, and those keep isVisible.
 */
async function appears(what: Locator, ms: number): Promise<boolean> {
  try {
    await what.waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    return false;
  }
}

/**
 * Put the owner's picture in the comment box, and say whether it is really there.
 *
 * SCOPED TO THE COMMENT FORM, not to the article. The file input Facebook uses
 * for a comment lives in the comment composer's own form, which is frequently
 * NOT inside the `[role="article"]` the post is wrapped in — so looking for it
 * there found nothing, the click fell through, and the comment went out as
 * text alone. The form is reached from the box itself, which makes it the
 * right form by construction rather than by guessing at the page's shape.
 *
 * Returns false rather than throwing, and returns false when the picture
 * cannot be CONFIRMED — an upload that is still in flight is not an
 * attachment, and a comment submitted over one goes out without it.
 */
async function attachPhoto(page: Page, box: Locator, article: Locator, image: string): Promise<boolean> {
  /*
   * WHERE TO LOOK FOR THE FILE INPUT, narrowest first.
   *
   * The comment's own form when there is one — Facebook does not always use a
   * <form> — then the article, then the page. The page is only safe because
   * this runs on the POST'S OWN PAGE, where the only composer is the comment
   * box; on a group feed it would just as happily find the input belonging to
   * "write a post", and the owner's picture would become a new POST.
   */
  const onPermalink = /\/(posts|permalink)\//.test(page.url());
  const form = box.locator('xpath=ancestor::form[1]');
  const scopes: Locator[] = [];
  if ((await form.count().catch(() => 0)) > 0) scopes.push(form);
  scopes.push(article);
  if (onPermalink) scopes.push(page.locator('body'));

  for (const scope of scopes) {
    if (await tryAttach(page, scope, image)) return true;
  }
  return false;
}

/** One attempt, within one part of the page. */
async function tryAttach(page: Page, scope: Locator, image: string): Promise<boolean> {
  const input = scope.locator('input[type="file"]').first();
  const before = await mediaCount(scope);

  if (!(await input.count().then((n) => n > 0).catch(() => false))) {
    /* No input yet: Facebook creates it when the camera is used, and on some
       builds opens a native file chooser instead. Both are handled. */
    const chooser = page.waitForEvent('filechooser', { timeout: 6_000 }).catch(() => null);
    await scope
      .getByRole('button', { name: patterns.commentPhoto })
      .first()
      .click({ timeout: 5_000 })
      .catch(() => undefined);
    const fc = await chooser;
    if (fc) {
      await fc.setFiles(image).catch(() => undefined);
      return await photoLanded(scope, before);
    }
    if (!(await input.count().then((n) => n > 0).catch(() => false))) return false;
  }

  try {
    await input.setInputFiles(image);
  } catch {
    return false;
  }
  /* The file is in the box as far as the browser is concerned. If Facebook
     then shows nothing at all, it did not take it. */
  const held = await input
    .evaluate((el) => (el as HTMLInputElement).files?.length ?? 0)
    .catch(() => 0);
  if (!held) return false;
  return await photoLanded(scope, before);
}

/**
 * How much media is showing in this part of the page right now.
 *
 * COUNTED, NOT MATCHED — and that correction is why this function exists.
 * The first version looked for `img[src^="blob:"]` and a handful of "remove"
 * labels, which is a guess about markup Facebook is free to change and did:
 * a preview can be a background-image, an SVG, a canvas, or an <img> with an
 * internal URL. The check said the picture had not arrived when it had, the
 * comment was refused, and the owner watched the worker open each post, do
 * nothing, and move on.
 *
 * Anything that was not there before and is there now is the attachment. That
 * cannot be wrong about markup, because it does not know any.
 */
async function mediaCount(scope: Locator): Promise<number> {
  return await scope
    .locator('img, svg, video, canvas, [role="img"], [style*="background-image"]')
    .count()
    .catch(() => 0);
}

/**
 * Wait until something new is showing where the comment is being written.
 *
 * Proof, not a timer: an upload still in flight is not an attachment, and a
 * comment submitted over one goes out without it.
 */
async function photoLanded(scope: Locator, before: number): Promise<boolean> {
  for (let waited = 0; waited < 30_000; waited += 500) {
    if ((await mediaCount(scope)) > before) return true;
    await scope.page().waitForTimeout(500);
  }
  return false;
}

/** Where the attempt stopped. Each one is a different thing to do next. */
export type CommentStep = 'ok' | 'no-post' | 'no-box' | 'not-sent' | 'blocked' | 'no-photo';

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
    /* A wait, not a glance: the box is being revealed as this runs. */
    if (!(await appears(box, 8_000))) return 'no-box';

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
    if (image && !(await attachPhoto(page, box, article, image))) {
      /*
       * NOTHING IS SENT. A comment with the words but without the picture is
       * not a smaller version of what the owner asked for — it is a different
       * comment, published under their name, on a post that is already live,
       * and it cannot be taken back. Every failure here used to be swallowed
       * by a .catch, so the text went out alone and the screen reported
       * success: "הגיב", with no picture under the post.
       *
       * Nothing has been typed yet — the picture goes first precisely so that
       * giving up costs nothing.
       */
      return 'no-photo';
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
      if (await appears(page.getByText(needle, { exact: false }).first(), 10_000)) return 'ok';
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
  /* A beat for the dialog to start animating in — not for it to finish. The
     line below waits up to fifteen seconds for a VISIBLE dialog, so the only
     job left here is to not read the page in the same tick as the click. This
     was 1500ms in front of that. */
  await page.waitForTimeout(400);
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
  await page.waitForTimeout(150);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const [i, line] of lines.entries()) {
    if (line) await page.keyboard.insertText(line);
    if (i < lines.length - 1) await page.keyboard.press('Shift+Enter');
  }
  /* Long enough for the editor to have committed the text before it is read
     back. If it has not, the check below simply takes the fallback path and
     types it again — which is what that path is for. */
  await page.waitForTimeout(250);
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
  /* Whether Facebook's own progress bar was ever seen. See the comment below:
     it is the difference between knowing the upload happened and inferring it
     from a preview the browser could have drawn from the local file. */
  let sawProgress = false;
  while (Date.now() < deadline) {
    const previews = await fb.mediaPreview(dialog).count().catch(() => 0);
    const busy = (await fb.uploadProgress(dialog).count().catch(() => 0)) > 0;
    // Several photos → Facebook collapses them into a collage with "Edit all";
    // that, with no progress bar, means every file is in.
    const collage = expected > 1 && (await fb.collageReady(dialog).isVisible({ timeout: 200 }).catch(() => false));
    /*
     * A PREVIEW IS NOT A COMPLETED UPLOAD.
     *
     * This is the correction to a fix that was nearly a disaster. The count of
     * previews reaching `expected` was briefly treated as certainty and
     * returned on the spot, to save the settling period below. But
     * selectors.ts counts `img[src^="blob:"]` as a preview, and a blob URL is
     * created by the BROWSER the instant setInputFiles lands — before a single
     * byte has left the machine. The only thing between that and an immediate
     * return was Facebook's progress bar having already mounted, which within
     * 250ms it frequently has not. The settling window was what made that race
     * unobservable. Without it the next steps can click "פרסום" on a photo
     * that is still uploading, and the post goes out with a broken image.
     *
     * So certainty needs EVIDENCE OF THE UPLOAD ITSELF, not of a preview: we
     * must have SEEN the progress bar and seen it go. That is instant when it
     * happens, which is the common case on a real connection and the whole of
     * the saving. A preview count with a progress bar that never appeared at
     * all is a guess like the others, and keeps their settling period.
     */
    if (busy) sawProgress = true;
    const counted = !busy && previews >= expected && sawProgress;
    if (counted) return;
    const done = !busy && (collage || (previews >= expected) || (expected > 1 && previews >= 1 && Date.now() - stableSince > 8000 && stableSince > 0));
    if (done) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince > 1500) return;
    } else if (previews >= 1 && !busy) {
      // At least one preview and no progress bar: start the patience clock.
      if (!stableSince) stableSince = Date.now();
    } else {
      stableSince = 0;
    }
    /* 250ms, not 500: the loop's own cost is two cheap counts, and on the
       common path this interval IS the latency of noticing the upload
       finished. */
    await new Promise((r) => setTimeout(r, 250));
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


