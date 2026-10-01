import type { Page } from 'playwright-core';
import { dedupe, interpretCard, nameMatches, type DiscoveredGroup, type RawCard } from '../../src/lib/social/discovery';

/*
 * גילוי קבוצות, the browser half: OPEN FACEBOOK'S OWN SEARCH AND READ IT.
 *
 * WHAT THIS DOES AND WHAT IT IS ALLOWED TO DO.
 *
 * It navigates to the group-search page that the account is already signed in
 * to, scrolls it a few times, and copies down what the cards say. That is the
 * whole of it. It presses nothing: not a join button, not a "see more", not a
 * request. The owner asked for that in so many words — "לא לשלוח באופן אגרסיבי
 * בקשות הצטרפות למספר רב של קבוצות ללא פעולה של המשתמש" — and it is also the
 * only version worth writing. Joining a hundred groups from a script is the
 * behaviour that gets an account restricted, and it is his account, with his
 * business on it. The screen gives him a link; he decides.
 *
 * NOTHING HERE INTERPRETS. Every card leaves this file as the strings that
 * were on it, and src/lib/social/discovery.ts decides what "54,3 тыс." means.
 * Facebook rewrites its markup every few weeks and almost never rewrites its
 * wording, so the fragile half is kept as small as it can be and the durable
 * half is somewhere it can be tested without a browser — which is the only way
 * the Russian number format was ever going to be covered, the owner's own
 * Facebook being in Hebrew.
 *
 * THE `__name` HAZARD, again. tsx/esbuild rewrite `const f = () => …` into
 * `__name(…)`, and a function handed to page.evaluate ships as SOURCE — so a
 * named inner arrow inside the callback below throws `__name is not defined`
 * inside the page, where the error is invisible from here. Everything inside
 * the evaluate is written inline for that reason. It has cost this project a
 * day twice.
 */

/**
 * How many of the results get their picture copied, per search.
 *
 * THE PICTURE CANNOT BE THE URL THE CARD CARRIES. Facebook's thumbnails are
 * signed scontent links that expire within hours and are not served to another
 * origin, so a row storing one shows a letter where a picture should be — which
 * is exactly what the first version of this did on the owner's phone. The bytes
 * are fetched here, through the browser's own session, and the caller stores a
 * copy. It is the same thing readGroupProfile already does for the groups he
 * publishes to, for the same reason.
 *
 * Capped because this costs storage on an account that is already over its
 * Supabase quota, and because a group only needs its picture fetched ONCE —
 * the caller skips every row it already has one for, so a repeated search
 * costs nothing.
 */
const PICTURE_LIMIT = 60;

/** How many unreadable cards to keep for the log. Three is enough to see a
    pattern and few enough that the line stays readable. */
const UNREAD_SAMPLES = 3;

/** How far to scroll. Each pass is roughly a screenful of new results. */
const PASSES = 6;
/** And the ceiling, because a phrase like "קבוצה" matches most of Facebook. */
const MAX_GROUPS = 120;

/** One group's picture, as bytes, for the caller to store somewhere durable. */
export interface CardPicture {
  bytes: Buffer;
  contentType: string;
}

/**
 * A card whose membership could not be read, kept exactly as it was.
 *
 * WHY THIS EXISTS. The words Facebook puts on a card for a group you are
 * already in were WRITTEN FROM REASONING rather than read off a real page, and
 * on the owner's own account the result was 0 of 92 groups recognised as his —
 * while he had just joined several. Guessing a second set of words would have
 * the same chance of being wrong and no way to tell.
 *
 * So when a search cannot read a membership, it keeps a few of the cards it
 * failed on and the worker writes their button labels to the activity log. One
 * search then answers the question for good, in the wording of the real
 * Facebook, in the browser the worker actually drives — which is not the same
 * page as the one on somebody's phone.
 *
 * Nothing private is in here: a group's public name and the labels on its own
 * buttons.
 */
export interface UnreadCard {
  name: string;
  buttons: string[];
}

export interface SearchOutcome {
  groups: DiscoveredGroup[];
  /** Up to three cards whose membership could not be read. Diagnostic only. */
  unread: UnreadCard[];
  /** Keyed by externalId. Only the ones asked for; see PICTURE_LIMIT. */
  pictures: Map<string, CardPicture>;
  /** A Hebrew sentence for the owner. Empty when nothing went wrong. */
  problem: string;
  /** True when the scroll hit the ceiling rather than the end of the results. */
  truncated: boolean;
  /** Results Facebook returned whose NAME did not contain the phrase. Counted
      rather than hidden: a search that quietly drops most of what it found
      owes the person the number. */
  offTopic: number;
}

/**
 * Every group Facebook offers for a phrase, as the signed-in account sees it.
 *
 * The page is opened at `&f=groups` rather than the generic search because the
 * generic one mixes people, posts and pages into the same feed, and a reader
 * that had to tell them apart from the markup would be guessing at exactly the
 * moment it must not.
 */
export async function searchGroups(page: Page, query: string, opts: { havePictures?: string[] } = {}): Promise<SearchOutcome> {
  const url = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  /* Search results arrive after the shell does, so the wait is for a link to a
     group rather than for the page's own load event, which fires far too
     early. A search with no results never gets one, which is not a fault — the
     catch below lets the read continue and report nothing found. */
  await page.waitForSelector('a[href*="/groups/"]', { timeout: 20_000 }).catch(() => undefined);

  const collected: DiscoveredGroup[] = [];
  /* Keyed by id so the same card scrolling past twice is one sample. */
  const unread = new Map<string, UnreadCard>();
  let lastCount = -1;
  let truncated = false;

  for (let pass = 0; pass < PASSES; pass += 1) {
    const cards = await readCards(page);
    for (const raw of cards) {
      const group = interpretCard(raw);
      if (!group) continue;
      collected.push(group);
      if (group.membership === 'unknown' && unread.size < UNREAD_SAMPLES && !unread.has(group.externalId)) {
        unread.set(group.externalId, { name: group.name, buttons: (raw.buttons ?? []).slice(0, 6) });
      }
    }
    const unique = dedupe(collected).length;
    if (unique >= MAX_GROUPS) {
      truncated = true;
      break;
    }
    /*
     * STOP WHEN SCROLLING STOPS PRODUCING. Facebook's result list ends
     * silently — it simply loads nothing more — and a fixed six passes on a
     * phrase with eleven results is five needless scrolls on somebody's real
     * account. One barren pass is not enough to be sure (a slow fetch looks
     * identical), so it takes two in a row.
     */
    if (unique === lastCount && pass > 0) break;
    lastCount = unique;
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(1_400);
  }

  /*
   * ONLY THE ONES WHOSE NAME REALLY CARRIES THE PHRASE.
   *
   * Facebook's group search is associative — "ערד" comes back with three
   * different Dimona groups — and for a publishing list of one city that is
   * ninety rows to read past. See nameMatches.
   */
  const all = dedupe(collected);
  const onTopic = all.filter((g) => nameMatches(g.name, query));
  const groups = onTopic.slice(0, MAX_GROUPS);

  /*
   * WHICH PICTURES TO FETCH — AND THE ANSWER USED TO EXCLUDE EVERY NEW GROUP.
   *
   * `opts.pictures` was the list of ids the caller still needed a picture for,
   * and the caller built it by reading the rows it already had. A group found
   * for the FIRST time has no row yet, so it was never on that list and never
   * got a picture — only a re-run of the same search could give it one. The
   * owner searched "באר שבע", eighty of the results were new, and every one of
   * them drew a letter in a purple square.
   *
   * Inverted: the caller now says which groups it ALREADY HAS a stored picture
   * for, and everything else this search found is fetched. A re-run still
   * downloads nothing, which is what the old shape was protecting — it just no
   * longer protects it by skipping the groups that need it most.
   */
  const have = new Set(opts.havePictures ?? []);
  const pictures = await fetchPictures(page, groups.filter((g) => !have.has(g.externalId)));

  return { groups, pictures, unread: [...unread.values()], problem: '', truncated, offTopic: all.length - onTopic.length };
}

/**
 * The card thumbnails, through the browser's own session.
 *
 * `page.request` carries the context's cookies and origin, which is what makes
 * a signed scontent URL answer at all — the same call readGroupProfile uses for
 * a group's og:image. The images were already loaded once when the results
 * rendered, so these come back from cache and add no traffic of consequence.
 *
 * Four at a time, and every failure is silent by design: a row without a
 * picture shows its initial, which is what it did before and is not worth
 * failing a search over.
 */
export async function fetchPictures(page: Page, groups: DiscoveredGroup[]): Promise<Map<string, CardPicture>> {
  const out = new Map<string, CardPicture>();
  const todo = groups.filter((g) => /^https?:\/\//i.test(g.image)).slice(0, PICTURE_LIMIT);
  const lanes = 4;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(lanes, todo.length) }, async () => {
      for (;;) {
        const i = next;
        next += 1;
        if (i >= todo.length) return;
        const g = todo[i];
        try {
          const res = await page.request.get(g.image, { timeout: 15_000 });
          if (!res.ok()) continue;
          const bytes = await res.body();
          /* A one-pixel tracking gif or an error page is not a picture, and
             storing it would replace an initial with a blank square. */
          if (bytes.length < 500) continue;
          out.set(g.externalId, { bytes, contentType: res.headers()['content-type'] ?? 'image/jpeg' });
        } catch {
          /* no picture for this one */
        }
      }
    }),
  );
  return out;
}

/**
 * Every result card on the page right now, as strings.
 *
 * THE CARD IS FOUND BY CLIMBING FROM THE LINK, not by a container selector.
 * Facebook's own class names are generated and change between sessions, so the
 * only stable landmark on a result is the anchor to /groups/<id> — and the
 * card is whatever ancestor of it first holds a picture and more than one line
 * of text. Climbing too far would swallow the next result; the loop stops at
 * the first ancestor that looks like a card, and at six levels regardless.
 */
async function readCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const out: (RawCard & { key: string })[] = [];
    const anchors = Array.from(document.querySelectorAll<HTMLElement>('a[href*="/groups/"]'));
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href') || '';
      const match = href.match(/\/groups\/([^/?#]+)/i);
      if (!match) continue;
      const key = match[1];

      /*
       * THE CARD IS THE LARGEST BOX THAT STILL HOLDS ONLY THIS GROUP.
       *
       * It used to be "the first ancestor with a picture and two lines", and
       * that stopped too early: on the owner's own results the box was the
       * title block, the Join button lived OUTSIDE it, and the log came back
       * with three cards whose button list was literally empty — one of them
       * carrying the group's own name as its only label. Membership cannot be
       * read from a box that does not contain the control that states it, and
       * 0 of 92 groups were recognised as his.
       *
       * So the climb is bounded by MEANING rather than by shape: go up while
       * the ancestor still contains exactly one group, and stop the moment it
       * would swallow a second. What is left is one result, whole — with its
       * buttons, its member count and its picture inside it.
       *
       * Counted by distinct id, not by anchor: a card links to the same group
       * twice, once from the picture and once from the name.
       */
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
       * THE NAME COMES FROM THE LINK ITSELF, and the BEST link of the several
       * a card has.
       *
       * A card links to its group twice — once from the picture, once from the
       * name — and the picture's anchor has no text. Taking the first anchor
       * and skipping the rest meant taking the picture's, falling through to
       * the card's first line, and once the card grew to its real size that
       * line was Facebook's unread badge: the owner's list came back full of
       * "לא נקראובקבוצה דרושים ער…". A regression of mine, visible in one
       * screenshot.
       *
       * So every anchor for a group is considered and the longest real text
       * wins. The card's first line survives only as the last resort, for a
       * card whose every link is a picture.
       */
      let name = (anchor.innerText || '').trim().split('\n')[0] || '';
      const lines = (box.innerText || '').split('\n').map((l: string) => l.trim()).filter(Boolean);
      if (!name) name = lines[0] || '';

      const had = out.find((c) => c.key === key);
      if (had) {
        /* A better name for a group already collected, and nothing else: the
           first sighting's card is the one that was measured. */
        if (name && name.length > had.name.length) had.name = name;
        continue;
      }

      const picture = box.querySelector('img');
      const buttons = [];
      for (const b of Array.from(box.querySelectorAll<HTMLElement>('[role="button"], button, [aria-label]'))) {
        const label = (b.getAttribute('aria-label') || b.textContent || '').trim();
        if (label && label.length < 60) buttons.push(label);
      }

      out.push({
        key,
        href,
        name,
        image: picture ? picture.getAttribute('src') || '' : '',
        text: (box.innerText || '').trim(),
        buttons: buttons.slice(0, 8),
      });
    }
    return out;
  });
}
