import type { Page } from 'playwright-core';
import { dedupe, interpretCard, type DiscoveredGroup, type RawCard } from '../../src/lib/social/discovery';

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

/** How far to scroll. Each pass is roughly a screenful of new results. */
const PASSES = 6;
/** And the ceiling, because a phrase like "קבוצה" matches most of Facebook. */
const MAX_GROUPS = 120;

/** One group's picture, as bytes, for the caller to store somewhere durable. */
export interface CardPicture {
  bytes: Buffer;
  contentType: string;
}

export interface SearchOutcome {
  groups: DiscoveredGroup[];
  /** Keyed by externalId. Only the ones asked for; see PICTURE_LIMIT. */
  pictures: Map<string, CardPicture>;
  /** A Hebrew sentence for the owner. Empty when nothing went wrong. */
  problem: string;
  /** True when the scroll hit the ceiling rather than the end of the results. */
  truncated: boolean;
}

/**
 * Every group Facebook offers for a phrase, as the signed-in account sees it.
 *
 * The page is opened at `&f=groups` rather than the generic search because the
 * generic one mixes people, posts and pages into the same feed, and a reader
 * that had to tell them apart from the markup would be guessing at exactly the
 * moment it must not.
 */
export async function searchGroups(page: Page, query: string, opts: { pictures?: string[] } = {}): Promise<SearchOutcome> {
  const url = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  /* Search results arrive after the shell does, so the wait is for a link to a
     group rather than for the page's own load event, which fires far too
     early. A search with no results never gets one, which is not a fault — the
     catch below lets the read continue and report nothing found. */
  await page.waitForSelector('a[href*="/groups/"]', { timeout: 20_000 }).catch(() => undefined);

  const collected: DiscoveredGroup[] = [];
  let lastCount = -1;
  let truncated = false;

  for (let pass = 0; pass < PASSES; pass += 1) {
    const cards = await readCards(page);
    for (const raw of cards) {
      const group = interpretCard(raw);
      if (group) collected.push(group);
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

  const groups = dedupe(collected).slice(0, MAX_GROUPS);

  /*
   * `opts.pictures` is the list of ids the CALLER still needs a picture for —
   * it knows which rows already have one and this function does not. Absent,
   * nothing is fetched: a search re-run for its membership counts should not
   * re-download sixty images.
   */
  const wanted = new Set(opts.pictures ?? []);
  const pictures = wanted.size ? await fetchPictures(page, groups.filter((g) => wanted.has(g.externalId))) : new Map<string, CardPicture>();

  return { groups, pictures, problem: '', truncated };
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
async function fetchPictures(page: Page, groups: DiscoveredGroup[]): Promise<Map<string, CardPicture>> {
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
    const out = [];
    const seen = new Set();
    const anchors = Array.from(document.querySelectorAll<HTMLElement>('a[href*="/groups/"]'));
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href') || '';
      const match = href.match(/\/groups\/([^/?#]+)/i);
      if (!match) continue;
      const key = match[1];
      if (seen.has(key)) continue;

      /* The card: the first ancestor that holds a picture AND more than one
         line, which is what a result looks like and what a bare link in a
         sidebar does not. */
      let box: HTMLElement = anchor;
      for (let up = 0; up < 6 && box.parentElement; up += 1) {
        box = box.parentElement;
        const lines = (box.innerText || '').split('\n').filter((l: string) => l.trim()).length;
        if (box.querySelector('img') && lines >= 2) break;
      }

      /*
       * THE NAME COMES FROM THE LINK ITSELF, not from the card's first line.
       * A card's text begins with whatever rendered first, which on a slow
       * connection is the member count. The anchor's own text is the group's
       * name by construction — and when the anchor wraps only the picture it
       * has none, in which case the card's first non-empty line is the
       * fallback rather than the first guess.
       */
      let name = (anchor.innerText || '').trim().split('\n')[0] || '';
      const lines = (box.innerText || '').split('\n').map((l: string) => l.trim()).filter(Boolean);
      if (!name) name = lines[0] || '';

      const picture = box.querySelector('img');
      const buttons = [];
      for (const b of Array.from(box.querySelectorAll<HTMLElement>('[role="button"], button, [aria-label]'))) {
        const label = (b.getAttribute('aria-label') || b.textContent || '').trim();
        if (label && label.length < 60) buttons.push(label);
      }

      seen.add(key);
      out.push({
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
