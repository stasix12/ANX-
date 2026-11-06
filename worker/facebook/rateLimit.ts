import type { ElementHandle, Locator, Page } from 'playwright-core';
import { patterns } from './selectors';

/**
 * ─── DID FACEBOOK ITSELF SAY "TOO FAST"? ──────────────────────────────────
 *
 * WHY THIS FILE EXISTS, and it is an incident rather than a refactor.
 *
 * The first version of this check was one line in selectors.ts:
 *
 *     rateLimitText: (page) => page.getByText(patterns.rateLimited).first()
 *
 * `page` — the whole document. On 05/11 it fired while publishing to
 * "באר שבע ביחד עכשיו", raised state.attention and stopped every publication
 * in the account. The owner then posted to that same group BY HAND, from the
 * same browser profile, with no trouble at all: "פייסבוק לא הגביל אותי, זה
 * טעות של הרובוט בדקתי ידנית במחשב נותן לפרסם."
 *
 * Reproduced in Chromium afterwards against mock group pages, the page-wide
 * read fired on every one of them: the group's pinned rules, a moderation
 * note, an ordinary Russian comment, a Messenger pop-out, a member quoting
 * the notice back — and on the worker's OWN DRAFT, still sitting in the
 * composer, which is the self-reinforcing one: press "המשך סבב" and the same
 * row halts everything again.
 *
 * AND IT COULD MISS, from the same root. `.first()` takes the first match in
 * DOM order and then asks whether THAT element is visible. Facebook collapses
 * long group rules behind "ראה עוד", so a hidden rules paragraph carrying a
 * matching fragment wins `.first()`, answers false, and a real notice sitting
 * visible on screen is never seen. One mistake, both directions.
 *
 * ─── WHAT THIS ASKS INSTEAD ───────────────────────────────────────────────
 *
 * Only containers whose content Facebook controls:
 *
 *   1. THE DIALOG THE POST BUTTON WAS CLICKED IN — not a selector guess. The
 *      composer pins `dialogNode` before the click precisely because the
 *      locator can resolve to a Messenger pop-out (composer.ts). Our own
 *      draft is subtracted line by line, because the one thing certain about
 *      the draft is that Facebook did not write it.
 *   2. role="alert" and aria-live regions — where a product puts a message it
 *      wants read out. A feed post cannot be one without the page author
 *      saying so.
 *
 * The feed, the rules, the comments and the Messenger window are not asked,
 * which is what makes the residual wording overlap harmless: a moderation
 * note reading "הוסר כדי להגן על הקהילה מפני ספאם" still matches the pattern
 * and is still never read, because it does not live in either place.
 *
 * It returns the SENTENCE IT MATCHED, not a boolean. The branch beside this
 * one quotes what it found; this one threw a fixed sentence and quoted
 * nothing, so when it fired on 05/11 there was no way to tell from the row,
 * the log or the banner which words had been found or where. The next time
 * it fires it will say.
 */

/** How many alert / live regions are worth reading. A page with more than a
    handful is not a page with a notice on it. */
const MAX_REGIONS = 6;

/** The longest quote that may reach a row's error column. */
const QUOTE_MAX = 200;

/**
 * `text` with every line that also appears in `minus` struck out.
 *
 * Line by line and trimmed, not a substring subtraction: the draft reaches
 * the page through a contenteditable that may re-wrap it, and a blunt
 * `replace(draft, '')` would then subtract nothing at all.
 */
export function withoutLines(text: string, minus: string): string {
  const gone = new Set(
    minus
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !gone.has(l))
    .join('\n');
}

/**
 * The first line of `text` that reads like Facebook's own notice, or null.
 *
 * Per LINE rather than over the whole blob, so the quote that comes back is
 * the sentence and not the container — and so a pattern cannot be satisfied
 * by two halves that are three paragraphs apart.
 */
export function noticeIn(text: string): string | null {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    /* `patterns.rateLimited` carries no /g, so .test() holds no state and
       this loop cannot skip every other line. */
    if (trimmed && patterns.rateLimited.test(trimmed)) return trimmed.slice(0, QUOTE_MAX);
  }
  return null;
}

/** Reads a locator's text, never throwing: a node that went away mid-read is
    simply not a notice. */
async function textOf(el: Locator | ElementHandle<Element>): Promise<string> {
  return el.innerText().catch(() => '');
}

/**
 * IS OUR OWN DRAFT STILL IN THE BOX?
 *
 * The branch that raises the brake has always ASSERTED this — its comment
 * reads "the dialog is still holding the text it refused" — and nothing ever
 * checked it. That assertion is what lets the row be written as a plain
 * `failed` that the queue may try again, instead of being parked as
 * "might already be live". On a true rate limit the assertion is right: the
 * post was refused and the text stayed. On a FALSE one — which is what
 * happened on 05/11 — it is a guess, and the direction it guesses in is the
 * one that republishes a post that is already up. `MAYBE_LIVE_STEP` exists
 * for exactly that doubt and this branch never used it.
 *
 * So it is measured. The longest line of the draft is looked for in the
 * dialog, because a contenteditable re-wraps what it is given but does not
 * rewrite the words. A draft with nothing long enough to be distinctive — a
 * picture-only post, a two-word ad — answers FALSE, which routes the row to
 * the cautious side. Unknown is not the same as refused.
 */
const DISTINCTIVE = 12;

export function draftStillHeld(dialogText: string, draft: string): boolean {
  const longest = draft
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= DISTINCTIVE)
    .sort((a, b) => b.length - a.length)[0];
  if (!longest) return false;
  return dialogText.includes(longest);
}

/** What the page said, and whether our words are still in the box. */
export interface TooFast {
  /** The sentence that matched, for the owner to read in the error. */
  notice: string;
  /** True only when the draft is provably still in the dialog, i.e. Facebook
      visibly did NOT take it. False means "not proven", never "it went up". */
  draftHeld: boolean;
}

/** A sighting that has been put to the page a second time. */
export interface TooFastConfirmed extends TooFast {
  /**
   * BOTH READS SAW IT. Only this may freeze the account's publishing.
   */
  confirmed: boolean;
  /** What the second read found, for the log. Null when it found nothing. */
  secondNotice: string | null;
}

/**
 * HOW LONG TO WAIT BETWEEN THE TWO READS.
 *
 * Long enough that a banner which was on its way out has gone, short enough
 * that the dialog is still the dialog the post was clicked in — it is held
 * open by the caller for exactly this window. A real account-level limit does
 * not clear itself in a second; a transient toast does.
 */
export const CONFIRM_DELAY_MS = 1200;

/**
 * ─── ASK TWICE, AND ONLY THEN BELIEVE IT ──────────────────────────────────
 *
 * "אתה נכנס לפייסבוק מאמת פעמיים שרשום שפייסבוק הגבילה את הפרסום למניעת
 *  ספאם."
 *
 * The answer to a rate limit is now a THREE-HOUR FREEZE of the whole
 * account's publishing, which is a far bigger hammer than the single parked
 * row this check used to produce. A false positive used to cost one row and a
 * banner the owner could clear; it would now cost three hours of a working
 * day — and this check has had a false positive, on 05/11, in production, on
 * his account. The header of this file is that incident.
 *
 * So the sighting is put to the page a second time, after a beat, through the
 * same narrow reader. Both reads must find Facebook's own words before
 * anything is frozen. One read alone still parks the row and still tells the
 * owner what it saw — it simply may not stop the account.
 *
 * `pause` is injected rather than taken from the page so this can be driven
 * in a test without a real second of waiting, and so the caller keeps control
 * of the dialog it is holding open.
 */
export async function facebookSaidTooFastTwice(
  page: Page,
  composer: ElementHandle<Element> | null,
  draft: string,
  pause: (ms: number) => Promise<void>,
): Promise<TooFastConfirmed | null> {
  const first = await facebookSaidTooFast(page, composer, draft);
  if (!first) return null;
  await pause(CONFIRM_DELAY_MS).catch(() => undefined);
  /* The SAME question, not a cheaper one: a second read that looked in more
     places than the first could confirm a sighting the first would never have
     made. */
  const second = await facebookSaidTooFast(page, composer, draft).catch(() => null);
  return { ...first, confirmed: Boolean(second), secondNotice: second?.notice ?? null };
}

/**
 * Facebook's own "you are posting too often" notice, as the sentence it was
 * found in — or null, which is the answer for every ordinary page.
 *
 * `composer` is the dialog handle pinned BEFORE the Post click; `draft` is
 * the text this product typed into it. Both may be absent, and absence only
 * costs a place to look — and costs the `draftHeld` proof, which is the safe
 * direction.
 */
export async function facebookSaidTooFast(
  page: Page,
  composer: ElementHandle<Element> | null,
  draft: string,
): Promise<TooFast | null> {
  /* 1 — the dialog the post was actually submitted in, minus our own words.
         The same read answers both questions, so the draft is never looked
         for on a page that has already moved on. */
  let draftHeld = false;
  if (composer) {
    const dialogText = await textOf(composer);
    draftHeld = draftStillHeld(dialogText, draft);
    const hit = noticeIn(withoutLines(dialogText, draft));
    if (hit) return { notice: hit, draftHeld };
  }

  /* 2 — the regions a page uses to announce something. Visible only: an
     aria-live region that is not on screen is not being announced. */
  const regions: Locator[] = [
    page.getByRole('alert'),
    page.locator('[aria-live="assertive"]'),
    page.locator('[aria-live="polite"]'),
  ];
  for (const region of regions) {
    const n = await region.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, MAX_REGIONS); i += 1) {
      const el = region.nth(i);
      /* EVERY match is asked, not `.first()`. That is the miss direction of
         the old check: the first node in DOM order answering "not visible"
         used to hide a notice that was on screen. */
      if (!(await el.isVisible().catch(() => false))) continue;
      const hit = noticeIn(withoutLines(await textOf(el), draft));
      if (hit) return { notice: hit, draftHeld };
    }
  }
  return null;
}
