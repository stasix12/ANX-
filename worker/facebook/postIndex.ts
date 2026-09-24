import type { Page } from 'playwright-core';
import { classifyPage } from './session';

/**
 * THE ADDRESS BOOK: find each of our posts' own address ONCE, and keep it.
 *
 * WHY THIS EXISTS, and why it replaces what came before.
 *
 * Every feature that touches a published post — leaving a comment on it,
 * reading how many people saw it — needs to open that post. A Facebook group
 * post has no address anywhere in what we store, so the worker used to find it
 * the only way it could: open the group and hunt for the post's own words.
 *
 * That hunt failed, over and over, for a different reason each time. It looked
 * for text containing an emoji, which Facebook renders as an image, so the
 * string was never on the page. It gave up after two scrolls, because it
 * measured progress in pixels on a feed that scrolls an inner container. It
 * searched a page whose own search misses recent posts. Each was a real bug
 * and each fix bought one round before the next one surfaced — because the
 * whole approach was wrong. Searching for a post by its words is a guess, and
 * a guess repeated a hundred and seventeen times fails a hundred and
 * seventeen ways.
 *
 * An address does not guess. This module opens ONE page — the group filtered
 * to our own posts — reads every address on it, and hands them back to be
 * stored. After that, nothing searches: the comment goes straight to the post,
 * a retry goes straight to the post, and the counters are read off the post.
 *
 * The page is `/groups/<id>/user/<our id>/`, and it is the right page for a
 * reason that matters: it contains ONLY our posts. Usually three or four.
 * That makes the matching problem small enough to be solved honestly, and it
 * makes the commonest case — one post of ours in that group — decidable with
 * no text matching at all.
 */

export interface GroupPost {
  /** The post's own address, cleaned of tracking parameters. */
  url: string;
  /** Its text, as Facebook rendered it — emoji already missing, as ever. */
  text: string;
}

/** How many times to scroll the author page before accepting what is there. */
const PASSES = 10;

/**
 * Every post WE made in this group, newest first, each with its own address.
 *
 * Returns an empty list when the page could not be read — a login wall, a
 * group that no longer loads. The caller must not treat that as "we have no
 * posts here", which is why nothing here throws it away silently.
 */
export async function ourPostsInGroup(page: Page, groupUrl: string, authorId: string): Promise<GroupPost[]> {
  if (!authorId) return [];
  const where = `${groupUrl.replace(/\/+$/, '')}/user/${authorId}/`;
  try {
    await page.goto(where, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch {
    return [];
  }
  await page.waitForTimeout(3000);
  if ((await classifyPage(page).catch(() => 'ok' as const)) !== 'ok') return [];

  const found = new Map<string, string>();
  let lastCount = -1;
  for (let pass = 0; pass < PASSES; pass += 1) {
    /*
     * Read inside the page in ONE evaluate, with no named helper declared in
     * it. tsx's esbuild rewrites `const f = () => …` into `__name(() => …)`,
     * and the callback travels to the browser as source while the helper does
     * not — so a named helper here dies on its first statement with
     * "__name is not defined". This has cost real rounds before.
     */
    const batch = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('[role="article"]')).map((art) => {
          const link = art.querySelector(
            'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="]',
          ) as HTMLAnchorElement | null;
          return { href: link?.href ?? '', text: (art as HTMLElement).innerText ?? '' };
        }),
      )
      .catch(() => [] as { href: string; text: string }[]);

    for (const { href, text } of batch) {
      if (!href) continue;
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        continue;
      }
      if (!/(^|\.)facebook\.com$/.test(url.hostname)) continue;
      /* Tracking parameters change on every render, so the same post would
         otherwise look like a different one each time it is read. */
      const clean = `https://www.facebook.com${url.pathname}`;
      if (!found.has(clean) && text.trim()) found.set(clean, text);
    }

    /* Progress is measured in posts, never in pixels: on a Facebook feed the
       window frequently does not scroll at all — an inner container does — and
       a rule based on scrollY gives up after two passes. */
    if (found.size === lastCount) break;
    lastCount = found.size;
    await page.mouse.move(400, 400).catch(() => undefined);
    await page.mouse.wheel(0, 2500).catch(() => undefined);
    await page.evaluate(() => window.scrollBy(0, 2500)).catch(() => undefined);
    await page.keyboard.press('End').catch(() => undefined);
    await page.waitForTimeout(1200);
  }

  return [...found].map(([url, text]) => ({ url, text }));
}

/**
 * Strip a piece of text down to what two renderings of it can agree on.
 *
 * Emoji go, because Facebook renders them as images and the page's copy of the
 * text has a hole where each one was. Punctuation and whitespace go, because a
 * line break in what we stored is a different element in the page and the text
 * of two elements together has no space between them. What is left is letters
 * and digits — the part that survives the trip.
 */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}️‍⃣]+/gu, ' ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .toLowerCase();
}

/**
 * Decide which of our posts is which of our rows.
 *
 * PURE, so it can be tested against the owner's real text rather than argued
 * about. Two rules, in order:
 *
 * 1. The text agrees. Both sides are normalised to letters and digits, and a
 *    row matches a post when one contains the other. Containment rather than
 *    equality because Facebook's copy is truncated at "עוד…" and ours is not.
 *
 * 2. What is left over, when only one of each is. If this group holds one post
 *    of ours and one row wants an address, there is nothing to decide — and
 *    that is the ordinary case, since a round publishes to each group once.
 *    This rule is what makes the feature work on posts whose text the page
 *    mangles beyond recognition.
 *
 * Never a guess beyond that: two unmatched rows and two unmatched posts are
 * left unresolved rather than paired by position. A comment under the wrong
 * post of ours is still the wrong post.
 */
export function matchPosts(
  rows: { id: string; text: string }[],
  posts: GroupPost[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const freePosts = posts.filter((p) => p.url);
  const takenUrls = new Set<string>();
  const freeRows: typeof rows = [];

  for (const row of rows) {
    const mine = normalizeForMatch(row.text);
    /* Short rows are not evidence: a dozen letters match half a feed. */
    const candidates =
      mine.length >= 12
        ? freePosts.filter((p) => {
            if (takenUrls.has(p.url)) return false;
            const theirs = normalizeForMatch(p.text);
            if (theirs.length < 12) return false;
            return theirs.includes(mine.slice(0, 60)) || mine.includes(theirs.slice(0, 60));
          })
        : [];
    /* Exactly one, or it is not an answer. Two posts of ours that both match
       means the text cannot tell them apart, and picking either is a coin
       toss with the owner's phone number on it. */
    if (candidates.length === 1) {
      out[row.id] = candidates[0].url;
      takenUrls.add(candidates[0].url);
    } else {
      freeRows.push(row);
    }
  }

  const leftover = freePosts.filter((p) => !takenUrls.has(p.url));
  if (freeRows.length === 1 && leftover.length === 1) out[freeRows[0].id] = leftover[0].url;
  return out;
}
