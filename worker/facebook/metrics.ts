import type { Page } from 'playwright-core';
import { findPostArticle } from './composer';
import { patterns } from './selectors';
import { classifyPage } from './session';

/**
 * What a published group post did, read off the post's own page.
 *
 * WHAT IS NOT HERE IS THE POINT. There is no reach and no impressions figure,
 * because Facebook does not put one on a group post and Meta closed the Groups
 * API in April 2024. The only way to produce such a number would be to take
 * the group's member count and call it an audience, and that is exactly the
 * number somebody would make decisions on — so it is not invented here.
 *
 * Every field is NULL when the page did not state it. A post nobody reacted to
 * and a post whose counters could not be read are different facts, and a zero
 * would report the second as the first.
 */
export interface PostMetrics {
  /** Facebook's own "seen by" count. Often absent — then null, never 0. */
  seen: number | null;
  /**
   * Plays on a video post — a different claim from `seen`, kept apart.
   *
   * A play is somebody who watched; an impression is a post that crossed a
   * screen. Folding them into one figure would let a card label video plays
   * "seen by", which is the sort of small dishonesty nobody notices until a
   * customer asks what the number means.
   */
  views: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
}

const EMPTY: PostMetrics = { seen: null, views: null, reactions: null, comments: null, shares: null };

/**
 * Facebook writes counts the way people read them, not the way machines do:
 * "1,234", "1.2K", "3 אלף", "2 тыс". This turns any of those into a number,
 * and returns null rather than a guess when it cannot.
 *
 * The multiplier characters are matched by symbol rather than by word, which
 * is why this survives the account's language being set to something nobody
 * here anticipated.
 */
function toCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.replace(/[‎‏⁦-⁩]/g, '').trim();
  const m = text.match(/(\d[\d.,\s]*)\s*([KMkmאלףמיליוןтысмлн]*)/);
  if (!m) return null;
  const digits = m[1].replace(/[\s,]/g, '');
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  const unit = m[2] ?? '';
  if (/^[Kk]$/.test(unit) || /אלף/.test(unit) || /тыс/.test(unit)) return Math.round(n * 1000);
  if (/^[Mm]$/.test(unit) || /מיליון/.test(unit) || /млн/.test(unit)) return Math.round(n * 1_000_000);
  // "1.234" with no unit is a thousands separator in most locales Facebook
  // serves; "1.2K" already went through the branch above.
  if (/^\d{1,3}\.\d{3}$/.test(m[1].trim())) return Number(m[1].replace('.', ''));
  return Math.round(n);
}

/**
 * Read the counters from a post permalink.
 *
 * Read-only: it opens the page, takes what is written on it, and leaves. It
 * never fails the caller — an unreachable post, a login wall or a layout that
 * yields nothing all come back as nulls, because "we could not read it" must
 * not be recorded as "it did nothing".
 */
export async function readPostMetrics(page: Page, url: string, postText: string): Promise<PostMetrics | null> {
  if (!/^https:\/\/(www\.|web\.|m\.)?facebook\.com\//i.test(url)) return null;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500);
  const kind = await classifyPage(page).catch(() => 'ok' as const);
  // A login wall or a checkpoint means the numbers on screen are not this
  // post's. Returning null keeps the row unread rather than recording zeros.
  if (kind !== 'ok') return null;

  /*
   * SCOPED TO OUR POST, and this is a correction.
   *
   * It used to read document.body and match the first number it found. On a
   * permalink page that is nearly right; on a GROUP page — which is where
   * these actually have to be read, because publishing to a group yields no
   * permalink — it is the neighbour's post that happens to be rendered above
   * ours. The owner would have been shown somebody else's engagement as their
   * own, which is the same class of lie as an invented reach number and
   * harder to notice.
   */
  const article = await findPostArticle(page, postText);
  if (!article) return null;
  const text = await article.innerText().catch(() => '');
  if (!text) return EMPTY;

  const grab = (re: RegExp): number | null => {
    const m = text.match(re);
    if (!m) return null;
    // One alternative per language, and the number sits on a different side of
    // the word in each — so take whichever group actually matched.
    return toCount(m.slice(1).find((g) => g != null));
  };

  return {
    seen: grab(patterns.seenBy),
    views: grab(patterns.viewCount),
    comments: grab(patterns.commentCount),
    shares: grab(patterns.shareCount),
    /*
     * Reactions have no word beside them — Facebook prints the icons and then
     * the bare number. So it is read from the control's own label, which is
     * the only place the count exists as text, and left null when that is not
     * how this layout renders it.
     */
    reactions: await article
      .locator('[aria-label*="react" i], [aria-label*="תגוב" i], [aria-label*="реакц" i]')
      .first()
      .getAttribute('aria-label')
      .then((label) => toCount(label))
      .catch(() => null),
  };
}
