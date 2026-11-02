import type { Page } from 'playwright-core';
import { fb, firstVisible, patterns } from './selectors';
import { classifyPage } from './session';

/**
 * ONE QUESTION, ASKED PROPERLY: can this account still post in this group?
 *
 * It exists because of the single commonest publication failure in this
 * product — "לא מצאתי את תיבת 'כתבו משהו…' בקבוצה" — and because that
 * sentence has always covered two completely different situations:
 *
 *   · The owner is no longer a member, or the group's admin has stopped
 *     members posting. Nothing will ever publish here again, and every future
 *     round queues another row into it, fails, and holds the group for the
 *     length of that attempt. This is what "שזה לא יעקב אותנו פעם הבאה" is
 *     about.
 *   · Facebook rendered the page a beat late, served a variant we do not have
 *     a selector for, or changed the interface. Posting is fine; the group
 *     must stay exactly where it is.
 *
 * The publication path cannot tell them apart and must not try: it has a
 * budget to keep (the next group's click is waiting on it) and it looked at a
 * page that had barely finished loading. So it reports the miss, and this runs
 * afterwards — once, slowly, on a fresh page, with the time to be sure.
 *
 * THE ANSWER IS ONLY EVER A POSITIVE SIGNAL. 'cannot-post' is returned when
 * Facebook's own page SAYS so, in its own words, and never because something
 * was absent. A missing selector is 'unknown', which is the verdict a Facebook
 * redesign produces — and 'unknown' changes nothing about the group. That is
 * the whole safety property of this file: a redesign may cost a round, it may
 * never cost the owner their list of groups.
 */
export type PostingVerdict =
  /** Facebook printed a refusal where the composer should be. Certain. */
  | 'cannot-post'
  /** The composer is there on a second look. The miss was the interface. */
  | 'can-post'
  /** Could not be established — a login wall, a checkpoint, a redesign, a dead line. */
  | 'unknown';

export interface PostingCheck {
  verdict: PostingVerdict;
  /**
   * The sentence Facebook printed, trimmed to one short line, when there was
   * one. It goes into what the owner reads, so it is evidence rather than our
   * description of the evidence — and it is capped because `getByText` can
   * match a container rather than the label inside it.
   */
  said: string;
}

/** The page has to have settled; the publication path could not afford this. */
const SETTLE_MS = 3_500;
/** How long the refusal is given to paint. The publication path allowed 800ms. */
const REFUSAL_MS = 2_500;
/** And how long the box gets to appear before "it is not there" is believed. */
const COMPOSER_MS = 6_000;
/** Longer than this is not an answer; the queue is waiting. */
const SAID_MAX = 120;

/**
 * @param groupUrl MUST already be parseGroupUrl output — the caller owns that
 *                 check, exactly as it does for publishToGroup (see the note
 *                 at the top of composer.ts). This page carries the owner's
 *                 live Facebook session; a raw social_targets.url is not an
 *                 address.
 */
export async function verifyCanPost(page: Page, groupUrl: string): Promise<PostingCheck> {
  try {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch {
    /* The page never opened. That is this computer's line or Facebook's mood,
       and neither is a fact about the group. */
    return { verdict: 'unknown', said: '' };
  }
  await page.waitForTimeout(SETTLE_MS);
  /* A login wall and a security check answer every address identically, and
     both would otherwise read as "this group refuses you". Never acted on. */
  if ((await classifyPage(page).catch(() => 'login' as const)) !== 'ok') return { verdict: 'unknown', said: '' };

  const said = await refusal(page);
  if (said) return { verdict: 'cannot-post', said };

  /* No refusal. Is the box simply there this time? That answer is worth having
     on the record: it is what tells the owner the group is fine and the miss
     was ours. */
  const box = await firstVisible(fb.composerTrigger(page), COMPOSER_MS).catch(() => null);
  return { verdict: box ? 'can-post' : 'unknown', said: '' };
}

/**
 * Facebook's refusal, READ INSIDE THE GROUP'S OWN COLUMN.
 *
 * `patterns.cannotPost` matches "הצטרפות לקבוצה" / "join group" as well as
 * "אי אפשר לפרסם", because all three mean the same thing where the composer
 * belongs. But Facebook also puts a rail of SUGGESTED groups on the page, and
 * every card in it carries a "הצטרפות לקבוצה" button. Read from the whole
 * document, that rail is an accusation against a group the owner is a perfectly
 * good member of — and the caller switches groups off on this answer.
 *
 * So the refusal is only believed inside `[role="main"]`, and the whole-page
 * read is kept ONLY for a page that has no main region at all (which is also
 * what the local test fixtures are). One region, one meaning.
 */
async function refusal(page: Page): Promise<string> {
  const main = page.locator('[role="main"]');
  const scoped = (await main.count().catch(() => 0)) > 0 ? main.first().getByText(patterns.cannotPost).first() : page.getByText(patterns.cannotPost).first();
  if (!(await scoped.isVisible({ timeout: REFUSAL_MS }).catch(() => false))) return '';
  const text = ((await scoped.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  /* A container, not a label. The verdict stands — something matched, visibly,
     in the group's own column — but there is nothing short enough to quote. */
  if (text.length > SAID_MAX) return '';
  return text;
}
