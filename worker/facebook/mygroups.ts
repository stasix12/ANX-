import type { Page } from 'playwright-core';
import { fetchPictures, type CardPicture } from './discover';
import { dedupe, groupIdFromHref, groupUrl, parseMembers, withoutName, type DiscoveredGroup } from '../../src/lib/social/discovery';

/*
 * THE GROUPS THIS ACCOUNT IS ACTUALLY IN — read off Facebook's own list of
 * them, not inferred from a search result.
 *
 * "אני רוצה לאחר שאני מצטרף לקבוצות שיהיה אופציה לראות קבוצות שעדיין לא
 *  התווספו למערכת ולהוסיף אותם במכה."
 *
 * WHY THIS EXISTS BESIDE THE SEARCH. Reading membership off a search card is
 * guesswork about wording, and it has already been wrong twice on the owner's
 * own account — 0 of 92 groups recognised as his. This page needs no such
 * guess: every group Facebook lists under "הקבוצות שלך" is one he is in, by
 * construction. The question "which of my groups is not in the publishing
 * list yet" is answered by a set difference rather than by a regex.
 *
 * IT STILL DOES NOT JOIN ANYTHING, and it does not add anything either. It
 * reads a list. The screen shows him what it found and he presses a button.
 *
 * AND IT DOES NOT TRUST THE PAGE BLINDLY. Facebook mixes suggestions in
 * alongside the real memberships on some layouts, and a suggestion added to
 * the publishing list is a group that cannot be published to. So nothing here
 * is marked 'member' on the strength of the URL alone — see JOINED_HINT.
 */

/** The page that lists a person's own groups. */
const JOINED_URL = 'https://www.facebook.com/groups/joins/';

/** How far to scroll it. Somebody in two hundred groups is not unusual. */
const PASSES = 12;
const MAX_GROUPS = 400;

/*
 * Section headings that mean "these are NOT your groups". Facebook puts
 * suggestions on the same page, and a suggested group that reached the
 * publishing list would fail every publication with "you are not a member".
 * Anything found under one of these is dropped rather than reported.
 */
const NOT_MINE = /suggested|discover|recommend|קבוצות מומלצות|מומלצות בשבילך|הצעות|גלה|גילוי|рекомендаци|предложен/i;

export interface MyGroupsOutcome {
  groups: DiscoveredGroup[];
  /** Keyed by externalId. Only the ones the caller asked for. */
  pictures: Map<string, CardPicture>;
  /** A Hebrew sentence for the owner. Empty when the read worked. */
  problem: string;
  /**
   * True unless this read PROVED it reached the end of the list.
   *
   * Not "the ceiling was hit" — that is only one of the ways a read can stop
   * early, and it was the only one this flag used to catch. The caller uses it
   * to decide whether the list may be treated as Facebook's complete
   * enumeration of the account's groups (reconcileJoined), so anything less
   * than proof has to read as "incomplete".
   */
  truncated: boolean;
}

export async function readMyGroups(page: Page, opts: { pictures?: string[] } = {}): Promise<MyGroupsOutcome> {
  await page.goto(JOINED_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('a[href*="/groups/"]', { timeout: 20_000 }).catch(() => undefined);

  const collected: DiscoveredGroup[] = [];
  let last = -1;
  /*
   * "DID WE REACH THE END OF THE LIST" — AND NOTHING ELSE MAY SAY YES.
   *
   * This flag used to mean "the ceiling was hit", and it was the ONLY thing
   * standing between a partial read and reconcileJoined withdrawing the
   * membership of every group past the cut-off. It was set in one place, and
   * the loop had two other ways out: one barren pass ended the read, and
   * running out of passes ended it too — both reporting a partial list as the
   * complete enumeration of somebody's groups.
   *
   * So completeness is now PROVEN rather than assumed: two consecutive passes
   * that add nothing, with the page actually scrolled to the bottom. Anything
   * else — the ceiling, the passes running out, a layout where scrolling does
   * nothing — leaves this true, and the caller does not reconcile.
   */
  let truncated = true;
  let barren = 0;

  for (let pass = 0; pass < PASSES; pass += 1) {
    for (const raw of await readRows(page)) {
      const externalId = groupIdFromHref(raw.href);
      if (!externalId) continue;
      const name = raw.name.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      collected.push({
        externalId,
        url: groupUrl(externalId),
        name,
        image: raw.image,
        /* Without the name, for the reason interpretCard gives: the row's text
           begins with the group's own name, and a group that advertises
           "10,000 חברים" in its title would report that instead of what
           Facebook counted. */
        members: parseMembers(withoutName(raw.text, name)),
        /* The page says nothing about public or private, and inventing it
           would be worse than leaving the row honest. */
        privacy: 'unknown',
        /* THE WHOLE POINT: this list IS the membership. Nothing was parsed. */
        membership: 'member',
      });
    }
    const unique = dedupe(collected).length;
    if (unique >= MAX_GROUPS) break;
    if (unique === last && pass > 0) barren += 1;
    else barren = 0;
    last = unique;

    /*
     * AT THE BOTTOM, AS THE PAGE ITSELF REPORTS IT — not as the row count
     * implies. A pass that adds nothing means the end of the list only if
     * there is nothing below; on a layout where scrollBy does nothing, or
     * while Facebook is still fetching the next page, it means the opposite.
     * The two have to agree before this read calls itself complete.
     */
    const atBottom = await page
      .evaluate(() => window.innerHeight + window.scrollY >= document.body.scrollHeight - 200)
      .catch(() => false);
    if (barren >= 2 && atBottom) {
      truncated = false;
      break;
    }
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(1_200);
  }

  const groups = dedupe(collected).slice(0, MAX_GROUPS);
  /* Fetched here, while the page is still open and its session still applies —
     the same reason the search reader does it rather than the caller. */
  const wanted = new Set(opts.pictures ?? []);
  const pictures = wanted.size ? await fetchPictures(page, groups.filter((g) => wanted.has(g.externalId))) : new Map<string, CardPicture>();
  return { groups, pictures, problem: '', truncated };
}

/**
 * Each row of the list, as strings.
 *
 * Same climb as the search reader — the card is the largest box that still
 * holds one group — and the same reason: a box that stops early loses the
 * member count, the picture, and here the section heading that says whether
 * this is a group of his at all.
 *
 * THE `__name` HAZARD applies to everything inside page.evaluate: tsx rewrites
 * a named arrow into `__name(…)` and the function ships as source, so it
 * throws inside the page where nothing here can see it. All inline.
 */
async function readRows(page: Page): Promise<{ href: string; name: string; image: string; text: string }[]> {
  return page.evaluate((notMineSource) => {
    const notMine = new RegExp(notMineSource, 'i');
    const out: { href: string; name: string; image: string; text: string; key: string }[] = [];
    for (const anchor of Array.from(document.querySelectorAll<HTMLElement>('a[href*="/groups/"]'))) {
      const href = anchor.getAttribute('href') || '';
      const match = href.match(/\/groups\/([^/?#]+)/i);
      if (!match) continue;
      const key = match[1];

      let box: HTMLElement = anchor;
      for (let up = 0; up < 10 && box.parentElement; up += 1) {
        const parent = box.parentElement;
        const ids = new Set();
        for (const link of Array.from(parent.querySelectorAll('a[href*="/groups/"]'))) {
          const hit = (link.getAttribute('href') || '').match(/\/groups\/([^/?#]+)/i);
          if (hit) ids.add(hit[1]);
        }
        if (ids.size > 1) break;
        box = parent;
      }

      /*
       * WHICH SECTION THIS ROW IS IN. Walk up from the card looking for a
       * heading; if the nearest one says "suggested", this is not a group of
       * his and must not be reported as one.
       */
      let suggested = false;
      let scope: HTMLElement | null = box;
      for (let up = 0; up < 6 && scope; up += 1) {
        const heads = scope.querySelectorAll('h1, h2, h3, [role="heading"]');
        if (heads.length) {
          const text = Array.from(heads).map((h) => h.textContent || '').join(' ');
          if (notMine.test(text)) suggested = true;
          break;
        }
        scope = scope.parentElement;
      }
      if (suggested) continue;

      let name = (anchor.innerText || '').trim().split('\n')[0] || '';
      const had = out.find((r) => r.key === key);
      if (had) {
        if (name && name.length > had.name.length) had.name = name;
        continue;
      }
      if (!name) {
        const lines = (box.innerText || '').split('\n').map((l: string) => l.trim()).filter(Boolean);
        name = lines[0] || '';
      }
      const picture = box.querySelector('img');
      out.push({
        key,
        href,
        name,
        image: picture ? picture.getAttribute('src') || '' : '',
        text: (box.innerText || '').trim(),
      });
    }
    return out.map((r) => ({ href: r.href, name: r.name, image: r.image, text: r.text }));
  }, NOT_MINE.source);
}
