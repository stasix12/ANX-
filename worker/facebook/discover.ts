import type { Page } from 'playwright-core';
import {
  dedupe,
  interpretCard,
  nameMatches,
  parseMembers,
  parsePrivacy,
  withoutName,
  type DiscoveredGroup,
  type RawCard,
} from '../../src/lib/social/discovery';

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
const MAX_GROUPS = 120;
/*
 * ONE SEARCH FINISHES THE JOB. It was 60 against a MAX_GROUPS of 120, so a
 * broad phrase could picture at most half of what it found and the other half
 * stayed purple letters — with the result sentence reporting the 60 it did and
 * saying nothing about the 60 it skipped. On screen that is indistinguishable
 * from the bug the owner already reported, so he reports it again.
 *
 * These are thumbnails the page has already rendered, fetched through the
 * session in four lanes, so the extra sixty are cache-warm requests to a CDN
 * rather than anything Facebook reads as traffic.
 */
const PICTURE_LIMIT = MAX_GROUPS;

/** How many unreadable cards to keep for the log. Three is enough to see a
    pattern and few enough that the line stays readable. */
const UNREAD_SAMPLES = 3;

/** How far to scroll. Each pass is roughly a screenful of new results. */
const PASSES = 6;
/** And the ceiling, because a phrase like "קבוצה" matches most of Facebook. */

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
  /**
   * Groups this search wanted a picture for and could not find an address for
   * — AFTER the picture pass. Counted because the two ways a row ends up
   * drawing a letter look identical on screen and need opposite fixes: no URL
   * on the card at all, or a URL that downloaded and then failed to store. The
   * worker logs both numbers.
   */
  pictureless: number;
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

  /*
   * AND NOW THE PICTURES, WHICH THE COLLECTING PASS CANNOT GET ON ITS OWN.
   *
   * This is the second time the owner has reported the same thing — "קבוצות
   * שאני לא חבר בהם עדיין לא מראה תמונה" — and the first fix was aimed at the
   * wrong half of the problem. It taught readCards to look in currentSrc, in
   * srcset, in an <svg><image> and in a CSS background, which was all true and
   * all useless, because on the cards that matter there is nothing in ANY of
   * those places at the moment they are read.
   *
   * Facebook loads a card's thumbnail when the card reaches the viewport. The
   * collecting loop above scrolls TWO screenfuls at a time for speed, so a
   * card in the skipped middle screen is in the DOM — its name, its member
   * count and its buttons all read correctly — and never once rests where the
   * browser would decide to load its picture. The groups he is not a member of
   * sit further down a long list of results, which is exactly why it was those
   * rows, and only those rows, that drew a letter.
   *
   * So the picture is a pass of its own: walk back through the results, stop
   * ON the cards that still have no address, and let the browser do what it
   * was always going to do when they came into view. No extra request to
   * Facebook — these are the same images the page loads for anyone scrolling
   * it — and nothing is opened that the search did not already open.
   */
  /*
   * ─── AND THE SAME PASS HAS TO RECOVER THE FACTS, NOT ONLY THE PICTURES ──
   *
   * "עדיין יש קבוצות שלא מראה את המספר חברים, וגם לא תמונות."
   *
   * The two symptoms are one bug, and the picture half of it was fixed alone.
   * A card's "25 אלפי חברים · ציבורית" line is filled in by Facebook at the
   * same moment as its avatar — when the card nears the viewport — so a card
   * the collecting loop walked past before it rendered has neither.
   *
   * AND THE LOOP CANNOT NOTICE, because its stop condition counts GROUPS
   * FOUND, not facts learned: a card's LINK is in the DOM from the first
   * paint, so once every result has been seen once the loop breaks, with most
   * of them still half-read. Measured against a lazy-rendering fixture
   * (worker/test/discover-scan.test.ts): four of eight groups came back with
   * no member count at all, and three rounds of fixes to parseMembers could
   * never have reached a single one of them — the parser was never handed the
   * text.
   *
   * So the second pass asks for both. Same scroll, same stops, same budget:
   * the card is brought into view for its picture and its own line is read
   * back while it is there.
   */
  const wanted = new Set(
    groups
      .filter(
        (g) =>
          (!have.has(g.externalId) && !/^https?:\/\//i.test(g.image)) ||
          g.members === null ||
          g.privacy === 'unknown',
      )
      .map((g) => g.externalId),
  );
  await fillPictures(page, groups, wanted);

  const pictures = await fetchPictures(page, groups.filter((g) => !have.has(g.externalId)));

  return {
    groups,
    pictures,
    unread: [...unread.values()],
    problem: '',
    truncated,
    offTopic: all.length - onTopic.length,
    pictureless: wanted.size,
  };
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
/**
 * Whether these bytes begin like an image file.
 *
 * The four formats Facebook serves thumbnails in, by their own signatures —
 * which is a stronger statement than any byte count, and the reason the size
 * floor could be dropped to a sanity check.
 */
function looksLikeImage(b: Buffer): boolean {
  if (b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8) return true; // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true; // GIF
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return true;
  return false;
}

/**
 * THE PICTURE PASS: stop ON the cards that still have no address.
 *
 * Each stop also brings the cards either side of it into view, so this rescues
 * several rows per stop and the ceiling below is far larger than the number of
 * stops it usually takes. Bounded by both a count and a clock, because a page
 * that has stopped answering must not hold a search open.
 *
 * NO NAMED FUNCTION EXPRESSION INSIDE THE evaluate. session.ts defines
 * `__name` on every worker context precisely because esbuild keeps names and
 * a function handed to evaluate ships as source — but a page built without
 * that line dies before its first statement, which is what the first run of
 * worker/test/discover-pictures.test.ts did. Avoiding the construct is the
 * second of the two independent reasons this code runs.
 */
/*
 * ENOUGH STOPS TO VISIT EVERY CARD MORE THAN ONCE.
 *
 * Sixty stops for a hundred and twenty results meant the pass could not even
 * see them all, let alone come back — and coming back is the whole job, since
 * a card's details are FETCHED when it nears the viewport and do not always
 * arrive inside one settle. The real ceiling is the budget below; this only
 * has to be large enough not to be the thing that stops it first.
 */
const MAX_VISITS = 3;
const PICTURE_STOPS = MAX_GROUPS * MAX_VISITS;
/*
 * How long to linger on a card before reading it, and how many times to come
 * back. Measured: with the card's counts line arriving a second after it comes
 * into view — an ordinary fetch on a phone — one 450ms look left five of nine
 * groups with no count at all. The fix is not a longer wait (which would be
 * paid on every card, including the ones that were ready) but another look,
 * after the rest of the list has had its turn.
 */
const PICTURE_SETTLE_MS = 450;
/* ONE SEARCH FINISHES THE JOB, the same rule PICTURE_LIMIT is written to.
   A run that gives up halfway leaves rows drawing letters, which is
   indistinguishable on screen from the bug this pass exists to fix — so the
   budget is generous and the number still unfilled is reported either way.

   RAISED FROM 45s WITH THE PASS'S JOB: it now stops on cards that are missing
   a member count as well as ones missing a picture, and on a results page
   where Facebook had cached the avatars that is a set this pass never used to
   visit at all. A search is something the owner asks for and waits for once;
   coming back with nine groups and four of their counts is the thing he has
   reported three times. */
const PICTURE_BUDGET_MS = 120_000;

async function fillPictures(page: Page, groups: DiscoveredGroup[], want: Set<string>): Promise<void> {
  if (!want.size) return;
  const byId = new Map(groups.map((g) => [g.externalId, g]));
  const deadline = Date.now() + PICTURE_BUDGET_MS;
  /* How many times each card has been stopped on. A card is given up only
     after MAX_VISITS of them — see the drop rule at the foot of the loop. */
  const visits = new Map<string, number>();
  for (let stop = 0; stop < PICTURE_STOPS && want.size; stop += 1) {
    if (Date.now() > deadline) return;
    const next = want.values().next().value as string | undefined;
    if (next === undefined) return;
    const found = await page
      .evaluate((id) => {
        for (const a of Array.from(document.querySelectorAll('a[href*="/groups/"]'))) {
          const hit = (a.getAttribute('href') || '').match(/\/groups\/([^/?#]+)/i);
          if (!hit || hit[1] !== id) continue;
          a.scrollIntoView({ block: 'center' });
          return true;
        }
        return false;
      }, next)
      .catch(() => false);
    /* Gone from the page entirely — a result that scrolled out of a virtual
       list. Nothing more to try for it, and leaving it in the set would spend
       every remaining stop on it. */
    if (!found) {
      want.delete(next);
      continue;
    }
    await page.waitForTimeout(PICTURE_SETTLE_MS);
    /*
     * A CHEAP READ, NOT readCards. readCards climbs every card, reads its
     * text, its buttons and getComputedStyle on up to sixty nodes apiece — a
     * quarter of a second on a page of a hundred results, which spent on every
     * one of sixty stops is the whole budget on work already done. This asks
     * one question of the cards that are still missing an address.
     */
    const seen = await page
      .evaluate((wanted: string[]) => {
        const want = new Set(wanted);
        const found: Record<string, { image: string; text: string }> = {};
        for (const a of Array.from(document.querySelectorAll('a[href*="/groups/"]'))) {
          const hit = (a.getAttribute('href') || '').match(/\/groups\/([^/?#]+)/i);
          if (!hit || !want.has(hit[1]) || found[hit[1]]) continue;
          /*
           * THE CARD'S BOX, BY THE SAME RULE readCards USES: climb while the
           * subtree is still about ONE group, and stop at the parent that
           * reaches a second one.
           *
           * A fixed number of levels does not work and the first version of
           * this proved it: four parents up from a link in a short card is the
           * results CONTAINER, whose innerText is every card on the page — so
           * all four of the groups that were missing a count were given the
           * FIRST card's count instead. Reading the wrong group's number is
           * worse than reading none.
           */
          let box: Element = a;
          let node: Element | null = a.parentElement;
          for (let up = 0; up < 8 && node; up += 1) {
            const ids = new Set<string>();
            for (const link of Array.from(node.querySelectorAll('a[href*="/groups/"]'))) {
              const other = (link.getAttribute('href') || '').match(/\/groups\/([^/?#]+)/i);
              if (other) ids.add(other[1]);
            }
            if (ids.size > 1) break;
            box = node;
            node = node.parentElement;
          }

          let image = '';
          for (const img of Array.from(box.querySelectorAll('img'))) {
            const r = img.getBoundingClientRect();
            /* A group's own thumbnail, never the little mark on a button. */
            if (r.width < 24 || r.height < 24) continue;
            const url = img.currentSrc || img.getAttribute('src') || '';
            if (!/^https?:\/\//i.test(url)) continue;
            image = url;
            break;
          }
          /* innerText and not textContent: only innerText reflects what is
             actually RENDERED, which is the one thing this pass is about. */
          const text = ((box as HTMLElement).innerText || '').trim();
          found[hit[1]] = { image, text };
        }
        return found;
      }, [...want])
      .catch(() => ({}) as Record<string, { image: string; text: string }>);

    for (const [id, card] of Object.entries(seen)) {
      const g = byId.get(id);
      if (!g) {
        want.delete(id);
        continue;
      }
      if (card.image) g.image = card.image;
      /*
       * A KNOWN VALUE IS NEVER REPLACED BY AN UNKNOWN ONE — the same rule
       * dedupe() applies to two sightings of one card, for the same reason:
       * this read can catch a card mid-render too, and a second half-read
       * must not undo the first good one.
       */
      if (card.text) {
        const without = withoutName(card.text, g.name);
        if (g.members === null) {
          const members = parseMembers(without);
          if (members !== null) g.members = members;
        }
        if (g.privacy === 'unknown') {
          const privacy = parsePrivacy(without);
          if (privacy !== 'unknown') g.privacy = privacy;
        }
      }
      /*
       * WHO LEAVES THE SET — the one rule that decides whether this pass
       * terminates AND whether it finishes its job. It has now been wrong
       * twice, in opposite directions.
       *
       * Too sticky: the first version dropped any card that came back with a
       * picture and any text at all, and a card's text holds its NAME from the
       * first paint — so a group whose avatar was cached and whose counts line
       * had not arrived was dropped before it was ever brought into view.
       *
       * Too eager: the second version dropped the card this stop had scrolled
       * to, on the grounds that it had had its turn. But a turn is 450ms, and
       * a card's details are FETCHED — at a one-second fetch, five of nine
       * groups were still written down with no count. One look is not a turn.
       *
       * So: nothing left to learn → gone. Otherwise it goes to the BACK of the
       * set and is tried again after every other card has had a stop, up to
       * MAX_VISITS of them. A Set keeps its insertion order, so deleting and
       * re-adding is what moves it to the end — and that is what turns this
       * from a loop that spins on one card into a round-robin.
       */
      const stillWants =
        !/^https?:\/\//i.test(g.image) || g.members === null || g.privacy === 'unknown';
      if (!stillWants) {
        want.delete(id);
        continue;
      }
      if (id !== next) continue;
      const been = (visits.get(id) ?? 0) + 1;
      visits.set(id, been);
      want.delete(id);
      /* Given up only after real looks, spread out. A card whose group simply
         does not state a member count must not hold the budget for ever. */
      if (been < MAX_VISITS) want.add(id);
    }
  }
}

export async function fetchPictures(page: Page, groups: DiscoveredGroup[]): Promise<Map<string, CardPicture>> {
  const out = new Map<string, CardPicture>();
  const todo = groups.filter((g) => /^https?:\/\//i.test(g.image));
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
          const type = res.headers()['content-type'] ?? '';
          /*
           * AN HTML PAGE WITH A 200 ON IT IS NOT A PICTURE. A redirect to a
           * login wall or an error page answers 200 and is several kilobytes,
           * so it sailed past a byte floor and was stored for ever — and a row
           * that holds a picture is never fetched again.
           */
          if (type && !/^image\//i.test(type)) continue;
          const bytes = await res.body();
          /*
           * JUDGED BY WHAT THE BYTES ARE, not by how many there are.
           *
           * The floor was 500 bytes, which throws away a real thumbnail that
           * happens to compress well — permanently, because the row then never
           * asks again. A file's first bytes say what it is: JPEG, PNG, GIF
           * and WebP each have a signature, and a tracking pixel fails it or
           * is a GIF of a few dozen bytes.
           */
          if (!looksLikeImage(bytes)) continue;
          if (bytes.length < 120) continue;
          out.set(g.externalId, { bytes, contentType: type || 'image/jpeg' });
          /* Capped on what SUCCEEDED, not on what was attempted: a prefix of
             cards whose picture cannot be fetched used to spend the whole
             allowance and leave the rest as letters. */
          if (out.size >= PICTURE_LIMIT) return;
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
async function readCards(page: Page): Promise<(RawCard & { key: string })[]> {
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

      /*
       * THE BIGGEST REAL PICTURE ON THE CARD, not the first <img> element.
       *
       * This took `box.querySelector('img')` and read its `src` attribute.
       * Facebook lazy-loads: until a card has scrolled into view its `src` is
       * often a 1x1 placeholder or a data: URI, with the real address sitting
       * in `currentSrc` or in `srcset` — and some cards draw the thumbnail as a
       * CSS background or an <svg><image>, which have no <img> at all. The
       * groups the owner is NOT in are the ones furthest down a scrolled list,
       * so they are exactly the cards whose first <img> is a placeholder.
       *
       * So every candidate on the card is considered and the largest one as
       * RENDERED wins — which on a group card is the group's own thumbnail,
       * and never the little badge on a button.
       */
      let picture: string = '';
      {
        /*
         * COLLECTED INTO AN ARRAY AND THEN JUDGED, rather than through a named
         * helper. This was `const consider = (url, w, h) => …`, and esbuild
         * keeps function names: it compiles to `__name(() => …, 'consider')`,
         * the call travels into the page with the function source and the
         * helper does not. session.ts defines `__name` on every worker context
         * for exactly this reason, so it ran — but it ran because of a line in
         * another file, and the first browser test written against this one
         * died on its first statement. An array is not a function.
         */
        const found: { url: string; area: number }[] = [];
        for (const img of Array.from(box.querySelectorAll('img'))) {
          const r = img.getBoundingClientRect();
          const area = (r.width || 1) * (r.height || 1);
          /* currentSrc is what the browser actually chose; src is the fallback
             for an image that has not loaded yet. */
          found.push({ url: img.currentSrc || img.getAttribute('src') || '', area });
          const set = img.getAttribute('srcset') || '';
          for (const part of set.split(',')) found.push({ url: part.trim().split(/\s+/)[0] || '', area });
        }
        for (const node of Array.from(box.querySelectorAll('svg image'))) {
          const r = (node as unknown as Element).getBoundingClientRect();
          found.push({
            url: node.getAttribute('href') || node.getAttribute('xlink:href') || '',
            area: (r.width || 1) * (r.height || 1),
          });
        }
        for (const node of Array.from(box.querySelectorAll('*')).slice(0, 60)) {
          const bg = getComputedStyle(node as Element).backgroundImage;
          const hit = /url\(["']?(https?:[^"')]+)/i.exec(bg || '');
          if (!hit) continue;
          const r = (node as Element).getBoundingClientRect();
          found.push({ url: hit[1], area: (r.width || 1) * (r.height || 1) });
        }
        let bestArea = -1;
        for (const candidate of found) {
          if (!/^https?:\/\//i.test(candidate.url)) continue;
          if (candidate.area <= bestArea) continue;
          bestArea = candidate.area;
          picture = candidate.url;
        }
      }
      const buttons = [];
      for (const b of Array.from(box.querySelectorAll<HTMLElement>('[role="button"], button, [aria-label]'))) {
        const label = (b.getAttribute('aria-label') || b.textContent || '').trim();
        if (label && label.length < 60) buttons.push(label);
      }

      out.push({
        key,
        href,
        name,
        image: picture,
        text: (box.innerText || '').trim(),
        buttons: buttons.slice(0, 8),
      });
    }
    return out;
  });
}
