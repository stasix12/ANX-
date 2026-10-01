/*
 * גילוי קבוצות — READING FACEBOOK'S OWN SEARCH RESULTS, AND NOTHING MORE.
 *
 * "לאפשר למשתמש להקליד מילת חיפוש, לדוגמה 'באר שבע', והמערכת תחפש קבוצות
 *  Facebook רלוונטיות."
 *
 * WHAT THIS FILE IS. The whole of the interpretation: given the raw text of a
 * search-result card, how many members does it claim, is the group public or
 * private, and is this account already in it. The browser half — worker/
 * facebook/discover.ts — opens the page, scrolls it, and hands each card over
 * as strings. It decides nothing.
 *
 * That split is not tidiness. Facebook's markup changes every few weeks and
 * its wording almost never does, so the fragile half is fifty lines of DOM
 * walking and the durable half is here, where it can be tested against the
 * real sentences in the three languages this product meets without opening a
 * browser at all — which is the only way the Russian cases were ever going to
 * be covered, since the owner's own Facebook is in Hebrew.
 *
 * WHAT IT REFUSES TO DO. Guess. Every field here has an "I could not tell"
 * value and returns it rather than the likeliest answer, for the reason v22's
 * audience column has three states: a product that reads "the card did not
 * say" as "you are not a member" offers a join button for groups the owner
 * has been publishing to for a year, and one that reads it as "public" invites
 * him to walk into a private group.
 *
 * AND IT DOES NOT JOIN ANYTHING. There is no code here, or anywhere this
 * feature reaches, that presses Facebook's join button. The owner asked for
 * that ("לא לשלוח באופן אגרסיבי בקשות הצטרפות") and it is also the only
 * version of this feature worth shipping: a link is opened, a person decides.
 */

/** Already in it, asked and waiting, not in it, or the card did not say. */
export type Membership = 'member' | 'requested' | 'none' | 'unknown';
export type Privacy = 'public' | 'private' | 'unknown';

export interface DiscoveredGroup {
  /** Facebook's own id or vanity name, out of /groups/<this>/. */
  externalId: string;
  url: string;
  name: string;
  image: string;
  /** Null when the card did not say — never zero, which is a different fact. */
  members: number | null;
  privacy: Privacy;
  membership: Membership;
}

/** One search-result card, exactly as the page gave it up. */
export interface RawCard {
  href: string;
  name: string;
  image?: string;
  /** Everything the card said, newlines and all. */
  text: string;
  /** The accessible names of the card's own buttons, which is where
      "הצטרפות" / "נשלחה בקשה" / "ביקור" live. */
  buttons?: string[];
}

/* ------------------------------------------------------------------ id */

/*
 * Facebook's own paths that are not groups, even though they live under
 * /groups/. Left out, every result page would "find" a group called `feed`
 * and one called `discover` — and because de-duplication is by this id, they
 * would be found once and then sit in the list for ever.
 */
const NOT_A_GROUP = new Set([
  'feed', 'discover', 'create', 'search', 'joins', 'your_groups', 'browse', 'category', 'invites', 'notifications',
]);

export function groupIdFromHref(href: string): string | null {
  if (!href) return null;
  const m = href.match(/\/groups\/([^/?#]+)/i);
  if (!m) return null;
  let id: string;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    /* A half-escaped href — %E7 on its own — throws rather than decoding. The
       raw segment is still a usable key and is what Facebook will accept back
       in a URL, so it is kept rather than throwing the result away. */
    id = m[1];
  }
  id = id.trim();
  if (!id || NOT_A_GROUP.has(id.toLowerCase())) return null;
  /* `permalink`, `posts`, `user` and friends appear as the SECOND segment;
     an id that is purely punctuation is not an id at all. */
  if (!/[\p{L}\p{N}]/u.test(id)) return null;
  return id;
}

export const groupUrl = (externalId: string): string => `https://www.facebook.com/groups/${externalId}`;

/* -------------------------------------------------------------- members */

/*
 * "54.3K members" · "54.3 אלף חברים" · "54,3 тыс. участников" · "54,300 חברים"
 *
 * THE COMMA IS THE WHOLE PROBLEM. English writes fifty-four thousand three
 * hundred as "54,300" and Russian writes fifty-four point three thousand as
 * "54,3 тыс." — the same character, a factor of a thousand apart. Read the
 * Russian one as a thousands separator and a 54,300-member group is reported
 * as having 543. So the rule is about what FOLLOWS the comma: three digits and
 * it is a separator, one or two and it is a decimal point.
 */
const THOUSAND = /^(k|אלף|אלפים|тыс\.?|тысяч[аи]?)$/i;
const MILLION = /^(m|mln|מיליון|מליון|млн\.?|миллион[аов]*)$/i;

/** The word for members, in the three languages, so a number that is about
    something else — "12 posts a day" — is not read as a membership count. */
const MEMBER_WORD = /members?|חברים|חברות|משתתפים|участник|участников|участника/i;

export function parseMembers(text: string): number | null {
  if (!text) return null;
  /*
   * Only a number that is ACCOMPANIED by the word for members counts. Facebook
   * puts several numbers on a card — posts this month, posts today — and the
   * first one is not reliably the membership. This is also why the search is
   * for the pair rather than for a number anywhere on the card.
   */
  const re = /([\d][\d.,\u00a0\u202f\s]*)\s*([^\s\d]*)\s*(members?|חברים|חברות|משתתפים|участник\w*)/giu;
  for (const m of text.matchAll(re)) {
    const value = readNumber(m[1], m[2]);
    if (value !== null) return value;
  }
  /* Hebrew and Russian also put the word FIRST: "חברים: 54.3 אלף". */
  const re2 = new RegExp(`(?:${MEMBER_WORD.source})\\s*[:：]?\\s*([\\d][\\d.,\\u00a0\\u202f\\s]*)\\s*([^\\s\\d]*)`, 'giu');
  for (const m of text.matchAll(re2)) {
    const value = readNumber(m[1], m[2]);
    if (value !== null) return value;
  }
  return null;
}

function readNumber(digits: string, suffix: string): number | null {
  const unit = suffix.trim();
  const multiplier = THOUSAND.test(unit) ? 1_000 : MILLION.test(unit) ? 1_000_000 : 1;
  /* Thin and non-breaking spaces are Russian's thousands separator and are
     invisible in every editor, so they are stripped before anything else. */
  let raw = digits.replace(/[\s\u00a0\u202f]/g, '').replace(/[.,]$/, '');
  if (!raw) return null;

  /*
   * A trailing K or M glued to the digits — "54.3K" — which is how English
   * Facebook writes it when the unit is not its own word.
   */
  let glued = 1;
  const tail = raw.match(/([km])$/i);
  if (tail) {
    glued = tail[1].toLowerCase() === 'k' ? 1_000 : 1_000_000;
    raw = raw.slice(0, -1);
  }

  const seps = raw.match(/[.,]/g) ?? [];
  let value: number;
  if (seps.length === 0) {
    value = Number(raw);
  } else if (seps.length === 1) {
    const at = raw.search(/[.,]/);
    const after = raw.length - at - 1;
    /* Three digits after a single separator is a thousands separator in every
       one of these languages — "54,300" and "54.300" alike. Anything else is
       a decimal point, and the multiplier is what makes it mean anything. */
    value = after === 3 ? Number(raw.replace(/[.,]/, '')) : Number(raw.replace(',', '.'));
  } else {
    /* Several separators can only be grouping: "1,234,567". */
    value = Number(raw.replace(/[.,]/g, ''));
  }
  if (!Number.isFinite(value)) return null;
  const total = Math.round(value * multiplier * glued);
  /* A card that claims a negative or absurd membership was misread, and a
     misread number printed with confidence is worse than no number. */
  if (total < 0 || total > 500_000_000) return null;
  return total;
}

/** "54.3K" for a card, in the owner's own digits. */
export function membersText(n: number | null): string {
  if (n === null) return '';
  if (n < 1_000) return `${n}`;
  /* One decimal up to a hundred and none above it, which is what Facebook
     itself prints: "54.3K" is worth reading and "123.4K" is noise. */
  if (n < 1_000_000) {
    const k = n / 1_000;
    return `${k < 100 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`;
  }
  const m = n / 1_000_000;
  return `${m < 100 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`;
}

/* -------------------------------------------------------------- privacy */

const PUBLIC_GROUP = /public group|public\s*·|קבוצה ציבורית|ציבורית|открытая группа|открытая|публичная/i;
const PRIVATE_GROUP = /private group|private\s*·|קבוצה פרטית|פרטית|закрытая группа|закрытая|приватная/i;

export function parsePrivacy(text: string): Privacy {
  if (!text) return 'unknown';
  /* Private first. "Private group" contains neither word of "public group", but
     a card that somehow said both is one where the safer reading wins: telling
     somebody a private group is public invites them to walk into a door that is
     shut. */
  if (PRIVATE_GROUP.test(text)) return 'private';
  if (PUBLIC_GROUP.test(text)) return 'public';
  return 'unknown';
}

/* ----------------------------------------------------------- membership */

/*
 * THE ORDER OF THESE THREE IS THE WHOLE CORRECTNESS OF THE FIELD.
 *
 * "Requested" is looked for first because Facebook's pending state is often
 * rendered as a button still labelled with the word JOIN somewhere near it
 * ("Cancel join request"), and a card read for "join" first would report a
 * group he has already asked to enter as one he has not.
 *
 * "Member" is looked for before "none" for the same reason from the other end:
 * a card for a group he is in shows "Visit" or "You're a member" AND, further
 * down, "Join" on a suggested group beside it when the containers overlap.
 */
const REQUESTED = /requested|request sent|cancel (join )?request|pending|נשלחה בקשה|בקשה נשלחה|ממתין לאישור|ביטול הבקשה|בקשה ממתינה|запрос отправлен|отменить запрос|заявка отправлена|ожидает/i;
/*
 * The words a card carries when the account is already in the group.
 *
 * The Hebrew half is wider than it was because the first version recognised
 * NONE of the owner's own groups. Hebrew Facebook labels the primary action on
 * a group you belong to as some form of "open"/"view" rather than with a
 * sentence about membership, and only "ביקור" and "הצג קבוצה" were listed.
 * These are safe to be generous with now that a JOIN button outranks them: a
 * card carrying both is read as not-a-member, which is the direction that
 * cannot put an unpublishable group into the list.
 */
const MEMBER = /you'?re a member|you are a member|joined|visit|view group|open group|go to group|חבר בקבוצה|חברה בקבוצה|את[הם]? חבר|כבר חבר|ביקור|הצג קבוצה|הצגת הקבוצה|^\s*(הצגה|פתיחה|לצפייה)\s*$|מעבר לקבוצה|עבור לקבוצה|כניסה לקבוצה|вы участник|вы состоите|перейти в группу|открыть группу|посетить/i;
const NOT_MEMBER = /^\s*(join( group)?|join now)\s*$|הצטרפות|הצטרף|להצטרף|вступить|присоединиться/i;

export function parseMembership(text: string, buttons: string[] = []): Membership {
  /*
   * THE BUTTONS ARE THE EVIDENCE; the card's prose is the fallback.
   *
   * A card's text sweeps up whatever else rendered inside the same container —
   * on a narrow window that has included the NEXT result's join button. An
   * accessible name belongs to one control, so it is asked first and alone.
   */
  const labels = buttons.map((b) => b.trim()).filter(Boolean);
  /*
   * REQUESTED, THEN JOIN, THEN MEMBER — and the middle one moved here on
   * purpose.
   *
   * It used to ask MEMBER before NOT_MEMBER, which was safe only while the
   * "you are in this one" words were rare. Now that the reader captures the
   * whole card, it sees every control on it — and a card for a group he is NOT
   * in can easily carry some "open"/"view" verb beside its Join button. Read
   * in the old order, that card becomes 'member', the row offers "הוסף
   * לרשימה", and a group he cannot publish to enters the publishing list to
   * fail once a day.
   *
   * A visible JOIN button is the one unambiguous statement Facebook makes
   * about membership, so it wins over anything softer. "Cancel join request"
   * still cannot reach it: REQUESTED is asked first and matches that whole
   * family.
   */
  for (const label of labels) if (REQUESTED.test(label)) return 'requested';
  for (const label of labels) if (NOT_MEMBER.test(label)) return 'none';
  for (const label of labels) if (MEMBER.test(label)) return 'member';

  if (!text) return 'unknown';
  if (REQUESTED.test(text)) return 'requested';
  if (MEMBER.test(text)) return 'member';
  /*
   * In prose the word "join" is matched WITHOUT the anchors the button test
   * uses, because here it is a sentence and not a label — but only as a whole
   * word, so "joined" (which means the opposite) cannot match it.
   */
  if (/\bjoin\b(?!ed)|הצטרפות|להצטרף|вступить|присоединиться/i.test(text)) return 'none';
  return 'unknown';
}

/* --------------------------------------------------------- the whole card */

export function interpretCard(raw: RawCard): DiscoveredGroup | null {
  const externalId = groupIdFromHref(raw.href);
  if (!externalId) return null;
  const name = raw.name.trim().replace(/\s+/g, ' ');
  /*
   * A card with no name is not shown. It is always a rendering that had not
   * finished — the row would read as a blank line with a join button, which
   * is an invitation to open something nobody can identify.
   */
  if (!name) return null;
  const text = raw.text ?? '';
  return {
    externalId,
    url: groupUrl(externalId),
    name,
    image: raw.image ?? '',
    /*
     * EVERY FACT IS READ FROM THE CARD WITH THE GROUP'S OWN NAME TAKEN OUT.
     *
     * A card's text contains its name, so until now the name was evidence
     * about the group it names. A group called "I Started a Facebook Group But
     * Nobody Joined" matched MEMBER on the word in its title and was written
     * down as a group this account belongs to — not a hypothetical: it is one
     * of the ninety-three the owner was shown as his own, and the reason some
     * of them carry `member` in his database today.
     *
     * The patterns cannot be narrowed to fix it. "joined", "חבר בקבוצה" and
     * "перейти в группу" really are what Facebook writes on a card about a
     * group you are in; the name is simply the wrong place to look for them.
     *
     * And it was never only membership — that was the one that reached him, so
     * it was the one I looked at. A group named "קבוצה פרטית של באר שבע" reads
     * as private from its title, and a number in a name can be picked up as a
     * member count. All three questions are about the group, and the name is
     * the answer to none of them, so all three are asked of the text without
     * it rather than of whichever ones I can think of an example for.
     */
    members: parseMembers(withoutName(text, name)),
    privacy: parsePrivacy(withoutName(text, name)),
    /*
     * THE LABELS GET THE NAME TAKEN OUT TOO — and they are the half that
     * mattered. parseMembership asks the BUTTONS FIRST AND ALONE, so stripping
     * the name from the prose and handing the labels over untouched fixed the
     * fallback and left the primary evidence poisoned.
     *
     * The reader collects `[role="button"], button, [aria-label]` — and a
     * card's title link carries the group's name as its aria-label. So "I Got
     * Bored So I Joined a Bunch of Face Book Groups" arrived as a label, and
     * MEMBER matched the word in it before any real button was read.
     *
     * A label that was ONLY the name is dropped rather than kept empty: an
     * empty string is not evidence of anything, and filtering it here keeps
     * parseMembership's own "no labels at all" path honest.
     */
    membership: parseMembership(
      withoutName(text, name),
      (raw.buttons ?? []).map((label) => withoutName(label, name).trim()).filter(Boolean),
    ),
  };
}

/**
 * The card's text with the group's own name removed.
 *
 * Every occurrence, not the first: a card commonly repeats its name — in the
 * picture's alt text, in the link, in the heading — and one copy left behind is
 * the whole bug. Replaced by a space rather than deleted, so two phrases the
 * name sat between do not become one word.
 */
export function withoutName(text: string, name: string): string {
  if (!text || !name) return text;
  /*
   * MATCHED ACROSS WHITESPACE, because the two sides do not agree about it.
   *
   * interpretCard collapses the name — `raw.name.trim().replace(/\s+/g, ' ')` —
   * and then looks for it inside `raw.text`, which is the element's innerText
   * exactly as the browser produced it: double spaces, non-breaking spaces,
   * and the newlines a card puts between its own lines. A literal search for
   * the collapsed name finds nothing in any of those, and the strip silently
   * does nothing on the very cards it was written for. So each run of
   * whitespace in the needle matches any run of whitespace in the text.
   */
  const escaped = name
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  if (!escaped) return text;
  return text.replace(new RegExp(escaped, 'gi'), ' ');
}

/**
 * One entry per group, first sighting wins — the search results repeat a group
 * across pages of scrolling, and the same group is found by five different
 * phrases.
 */
export function dedupe(groups: DiscoveredGroup[]): DiscoveredGroup[] {
  const byId = new Map<string, DiscoveredGroup>();
  for (const g of groups) {
    const had = byId.get(g.externalId);
    if (!had) {
      byId.set(g.externalId, g);
      continue;
    }
    /*
     * A LATER SIGHTING MAY STILL KNOW MORE. The same group scrolls past twice
     * and only the second card had finished rendering its member count, so
     * the fields are filled in rather than the row being thrown away — but a
     * known value is never replaced by an unknown one.
     */
    byId.set(g.externalId, {
      ...had,
      name: had.name || g.name,
      image: had.image || g.image,
      members: had.members ?? g.members,
      privacy: had.privacy === 'unknown' ? g.privacy : had.privacy,
      membership: had.membership === 'unknown' ? g.membership : had.membership,
    });
  }
  return [...byId.values()];
}

/* ------------------------------------------------------- merging a re-search */

/** The columns a stored row contributes to a merge. */
export interface StoredGroup {
  external_id: string;
  name?: string;
  image_url?: string;
  members?: number | null;
  privacy?: Privacy;
  membership?: Membership;
  queries?: string[];
  first_seen_at?: string;
}

/** What gets written back for one group after a search found it again. */
export interface MergedGroup {
  external_id: string;
  name: string;
  url: string;
  image_url: string;
  members: number | null;
  privacy: Privacy;
  membership: Membership;
  queries: string[];
  first_seen_at: string;
  last_seen_at: string;
}

/**
 * WHAT A RE-SEARCH MAY OVERWRITE, AND WHAT IT MAY NOT.
 *
 * "אם אותה קבוצה נמצאה בחיפוש קודם, לא ליצור אותה שוב." De-duplication is the
 * database's job — one row per (business, Facebook id). This is the other half
 * of it: what happens to the row that is already there. A plain overwrite
 * would quietly destroy three things the search does not know about:
 *
 *   • `queries` — every phrase that has ever turned this group up. Replaced
 *     with just this search's phrase, a group found by "באר שבע" and then by
 *     "דרום" stops belonging to the first search, and vanishes from a screen
 *     the owner had already filled.
 *   • `first_seen_at` — the whole of "נמצאו 7 קבוצות חדשות מאז החיפוש האחרון".
 *     Stamped with now() on every re-search, EVERY group is new for ever and
 *     the badge means nothing.
 *   • the membership and the count, WHEN THE FRESH READ COULD NOT TELL. A card
 *     that had not finished rendering is not evidence that he left the group.
 *
 * `target_id` and `hidden` are not in the returned shape at all, which is the
 * strongest form of "a search may not undo a decision a person made": there is
 * no field here to write them with.
 */
export function mergeDiscovered(
  found: DiscoveredGroup,
  stored: StoredGroup | undefined,
  normalizedQuery: string,
  now: string,
): MergedGroup {
  return {
    external_id: found.externalId,
    name: found.name || stored?.name || '',
    url: found.url,
    image_url: found.image || stored?.image_url || '',
    /* `??` and not `||`: a group really can have zero members, and `||` would
       throw that away and re-read it as never counted. */
    members: found.members ?? stored?.members ?? null,
    privacy: found.privacy === 'unknown' ? (stored?.privacy ?? 'unknown') : found.privacy,
    membership: found.membership === 'unknown' ? (stored?.membership ?? 'unknown') : found.membership,
    queries: [...new Set([...(stored?.queries ?? []), normalizedQuery])],
    first_seen_at: stored?.first_seen_at ?? now,
    last_seen_at: now,
  };
}

/* ------------------------------------------------------------ the phrase */

/**
 * Does this group's NAME actually contain what he typed?
 *
 * "למה שאני רושם ערד זה מוצא לי גם קבוצות אחרות — שימצא קבוצות שמכילות את
 *  השם ערד בלבד."
 *
 * Facebook's group search is associative: "ערד" comes back with "דימונה
 * שלנו", "דימונאים גאים בדימונה" and "שכונת השחר-דימונה", none of which
 * carry the word. For finding people to talk to that is a feature; for
 * building a publishing list of ONE city it is ninety rows to read past.
 *
 * PUNCTUATION IS FLATTENED ON BOTH SIDES, and that is the whole subtlety.
 * "באר-שבע" and "באר שבע" are the same place written two ways, and a plain
 * substring test calls one of them a miss. Hyphens, slashes, commas and the
 * rest become spaces first, so the phrase matches the name a person would
 * read, not the bytes Facebook happened to store.
 *
 * The phrase and not its words: "באר שבע" must not match a group called
 * "שבע מעיינות באר אורה". He asked for exact, and the words-in-any-order
 * reading is what Facebook is already doing to him.
 */
const FLATTEN = /[-–—_,.:;/\\|()[\]{}'"״׳`~!?*+=&]+/g;

export function nameMatches(name: string, query: string): boolean {
  const flat = (t: string) => normalizeQuery(t).replace(FLATTEN, ' ').replace(/\s+/g, ' ').trim();
  const needle = flat(query);
  if (!needle) return true;
  return flat(name).includes(needle);
}

/**
 * The form two searches are compared by.
 *
 * Hebrew has no case, which is exactly why this cannot simply be skipped: the
 * same screen searches in Russian and English, where "Беэр-Шева" typed twice
 * with different capitals is one saved search and not two. Bidi marks are
 * stripped because a phrase copied out of a Hebrew page carries them
 * invisibly, and two chips that look identical would sit side by side.
 */
export function normalizeQuery(q: string): string {
  return q
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * The phrase the "my own groups" scan files its results under.
 *
 * Not a phrase anybody types: normalizeQuery lower-cases and collapses spaces,
 * and no search box produces a leading '@'. It behaves as an ordinary saved
 * search everywhere else — same table, same de-duplication, same "new since
 * last time" — which is why it is a reserved STRING rather than a column.
 */
export const JOINED_QUERY = '@joined';

/** Long enough to mean something. One character finds the whole of Facebook. */
export const MIN_QUERY = 2;
export const MAX_QUERY = 80;

export function queryProblem(q: string): string {
  const clean = normalizeQuery(q);
  if (!clean) return 'צריך להקליד מה לחפש — עיר, אזור או נושא.';
  /*
   * THE RESERVED PHRASE IS NOT SEARCHABLE, and this is the third lock on one
   * mistake. It leaked into the saved-search chips, the screen loaded it into
   * the box by itself, and Facebook searched "@joined" literally — filling the
   * owner's "my groups" card with "joined me" and "I Started a Facebook Group
   * But Nobody Joined". The chips no longer carry it and the card checks
   * membership, but a phrase that would poison the bucket must also simply be
   * refused, however it got into the box.
   */
  if (clean === JOINED_QUERY) return 'זה ביטוי פנימי של המערכת ולא מילת חיפוש. השתמשו בכפתור "בדוק את הקבוצות שלי".';
  if (clean.length < MIN_QUERY) return 'מילת חיפוש קצרה מדי — לפחות שתי אותיות.';
  if (clean.length > MAX_QUERY) return `מילת חיפוש ארוכה מדי — עד ${MAX_QUERY} תווים.`;
  return '';
}

/* -------------------------------------------------------------- for the UI */

export const MEMBERSHIP_LABEL: Record<Membership, string> = {
  member: 'חבר בקבוצה',
  requested: 'בקשת הצטרפות ממתינה',
  none: 'עדיין לא הצטרפת',
  unknown: 'לא ידוע',
};

/** The short form, for a chip on a card where the row is already narrow. */
export const MEMBERSHIP_SHORT: Record<Membership, string> = {
  member: 'חבר',
  requested: 'ממתין לאישור',
  none: 'לא הצטרפת',
  unknown: 'לא ידוע',
};

export const PRIVACY_LABEL: Record<Privacy, string> = {
  public: 'ציבורית',
  private: 'פרטית',
  unknown: '',
};

export type DiscoveryFilter = 'all' | 'none' | 'member' | 'requested' | 'public' | 'private';
export type DiscoverySort = 'members' | 'relevance' | 'name';

export const FILTER_LABEL: Record<DiscoveryFilter, string> = {
  all: 'הכל',
  none: 'לא הצטרפתי',
  member: 'כבר חבר',
  requested: 'בקשה ממתינה',
  public: 'ציבוריות',
  private: 'פרטיות',
};

export const SORT_LABEL: Record<DiscoverySort, string> = {
  relevance: 'הכי רלוונטיות',
  members: 'הכי הרבה חברים',
  name: 'שם א־ב',
};

/** What a row has to look like for the filters and sorts below. */
export interface ListedGroup {
  external_id: string;
  name: string;
  members: number | null;
  privacy: Privacy;
  membership: Membership;
  hidden?: boolean;
  first_seen_at?: string;
}

export function matchesFilter(g: ListedGroup, filter: DiscoveryFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'none':
    case 'member':
    case 'requested':
      return g.membership === filter;
    case 'public':
    case 'private':
      return g.privacy === filter;
  }
}

/**
 * `order` is the order the search returned them in, which IS Facebook's own
 * relevance and the only thing here entitled to that word. It is carried as
 * the array's order rather than as a column: a group found by two searches has
 * two different relevances and one row.
 */
export function sortGroups<T extends ListedGroup>(rows: T[], sort: DiscoverySort): T[] {
  const out = [...rows];
  if (sort === 'relevance') return out;
  if (sort === 'members') {
    /* A group whose count could not be read sinks rather than sorting as zero
       beside groups that really are empty. */
    return out.sort((a, b) => (b.members ?? -1) - (a.members ?? -1));
  }
  /* Hebrew, Russian and English in one list: Intl knows the order, and
     `undefined` means the browser's own locale rather than a hard-coded one. */
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** How many of these a given search had never turned up before. */
export function newSince(rows: ListedGroup[], since: string | null): number {
  if (!since) return 0;
  const cut = Date.parse(since);
  if (!Number.isFinite(cut)) return 0;
  return rows.filter((r) => {
    const at = Date.parse(r.first_seen_at ?? '');
    return Number.isFinite(at) && at > cut;
  }).length;
}

/** The three numbers under "נמצאו N קבוצות". */
export function summarize(rows: ListedGroup[]): { total: number; member: number; requested: number; fresh: number; unknown: number } {
  let member = 0;
  let requested = 0;
  let fresh = 0;
  let unknown = 0;
  for (const r of rows) {
    if (r.membership === 'member') member += 1;
    else if (r.membership === 'requested') requested += 1;
    else if (r.membership === 'none') fresh += 1;
    else unknown += 1;
  }
  return { total: rows.length, member, requested, fresh, unknown };
}
