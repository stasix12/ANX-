import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dedupe,
  groupIdFromHref,
  interpretCard,
  matchesFilter,
  mergeDiscovered,
  membersText,
  nameMatches,
  JOINED_QUERY,
  newSince,
  normalizeQuery,
  parseMembers,
  parseMembership,
  parsePrivacy,
  queryProblem,
  sortGroups,
  summarize,
  type ListedGroup,
  type StoredGroup,
} from '../../src/lib/social/discovery';

/**
 * גילוי קבוצות — READING A SEARCH RESULT IN THREE LANGUAGES.
 *
 * WHY THIS FILE IS MOSTLY ABOUT NUMBERS AND COMMAS.
 *
 * The owner's Facebook is in Hebrew. His groups are in Hebrew and Russian —
 * "באר שבע ביחד" and "Наша Беэр-Шева" turn up in the same search — and English
 * appears whenever a card has not finished localising. So one screen shows
 * three number formats, and two of them use the SAME character to mean
 * opposite things: English writes fifty-four thousand three hundred as
 * "54,300" and Russian writes fifty-four point three thousand as "54,3 тыс.".
 * Read the Russian one as a thousands separator and a 54,300-member group is
 * offered to him as having 543 — a number he would believe, because it is
 * plausible, and which would decide whether he bothers joining.
 *
 * The second half is about the three states of membership, where the failure
 * is not a wrong number but a wrong invitation: reading "the card did not say"
 * as "you are not a member" puts a join button on a group he has been
 * publishing to for a year.
 *
 *   npx tsx worker/test/discovery.test.ts
 */

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

/* --------------------------------------------------------------- the id */
{
  eq(groupIdFromHref('https://www.facebook.com/groups/123456789/'), '123456789', 'a numeric id');
  eq(groupIdFromHref('/groups/beersheva.together/'), 'beersheva.together', 'a vanity name');
  eq(groupIdFromHref('https://www.facebook.com/groups/123/posts/456/'), '123', 'the group, not the post inside it');
  eq(groupIdFromHref('https://www.facebook.com/groups/123?ref=search'), '123', 'query strings are not part of the id');
  eq(groupIdFromHref('https://m.facebook.com/groups/123#x'), '123', 'nor is a fragment');
  eq(groupIdFromHref('/groups/%D7%91%D7%90%D7%A8/'), 'באר', 'a Hebrew vanity name arrives percent-encoded and is decoded');
  eq(groupIdFromHref('/groups/%E7%A8/'), '%E7%A8', 'a half-escaped href keeps its raw segment rather than throwing the result away');

  /* Facebook's own pages live under /groups/ too. */
  for (const junk of ['/groups/feed/', '/groups/discover/', '/groups/create/', '/groups/your_groups/', '/groups/FEED/']) {
    eq(groupIdFromHref(junk), null, `${junk} is a page of Facebook's, not a group — and de-duplication by id would keep it for ever`);
  }
  eq(groupIdFromHref('/groups/---/'), null, 'an id with no letter or digit in it is not an id');
  eq(groupIdFromHref('https://www.facebook.com/marketplace/'), null, 'a link that is not to a group');
  eq(groupIdFromHref(''), null, 'and nothing at all');
}

/* ---------------------------------------------------------- the members */
{
  /* English, as Facebook writes it. */
  eq(parseMembers('Public group · 543 members'), 543, 'a plain count');
  eq(parseMembers('54.3K members'), 54_300, 'K, glued to the digits');
  eq(parseMembers('54,300 members'), 54_300, 'THE ENGLISH COMMA IS A THOUSANDS SEPARATOR');
  eq(parseMembers('1.2M members'), 1_200_000, 'M, glued');
  eq(parseMembers('1,234,567 members'), 1_234_567, 'several separators can only be grouping');
  eq(parseMembers('1 member'), 1, 'the singular');

  /* Hebrew. */
  eq(parseMembers('קבוצה ציבורית · 54.3 אלף חברים'), 54_300, 'אלף as its own word');
  eq(parseMembers('54,300 חברים'), 54_300, 'and the Hebrew card uses the English separator');
  eq(parseMembers('1.2 מיליון חברים'), 1_200_000, 'מיליון');
  eq(parseMembers('\u200f543 חברים'), 543, 'a bidi mark in front of the number does not hide it');
  eq(parseMembers('חברים: 54.3 אלף'), 54_300, 'and Hebrew sometimes puts the word first');

  /* Russian — the one that pays for this whole function. */
  eq(parseMembers('54,3 тыс. участников'), 54_300, 'THE RUSSIAN COMMA IS A DECIMAL POINT — 54,300 members, not 543');
  eq(parseMembers('1,2 млн участников'), 1_200_000, 'млн');
  eq(parseMembers('543 участника'), 543, 'a plain count in Russian');
  eq(parseMembers('Открытая группа · 12 тыс. участников'), 12_000, 'тыс. with no decimal');
  eq(parseMembers('54 300 участников'), 54_300, "Russian's other separator is a space, which is invisible and still a separator");
  eq(parseMembers('54\u00a0300 участников'), 54_300, 'including when it is a non-breaking one');
  eq(parseMembers('54\u202f300 участников'), 54_300, 'and a narrow no-break space, which is what Facebook actually emits');

  /* The refusals, which matter as much. */
  eq(parseMembers('Public group'), null, 'a card with no count reports NO COUNT — not zero, which would read as an empty group');
  eq(parseMembers(''), null, 'and neither does an empty card');
  eq(parseMembers('12 posts a day'), null, 'A NUMBER THAT IS ABOUT SOMETHING ELSE IS NOT A MEMBERSHIP COUNT');
  eq(parseMembers('5 posts today · 1.2K members'), 1_200, 'and the count is found even when another number came first');
  eq(parseMembers('999,999,999,999 members'), null, 'an absurd count was a misread, and a misread number printed confidently is worse than none');

  eq(membersText(543), '543', 'under a thousand is written out');
  eq(membersText(54_300), '54.3K', 'and above it, short');
  eq(membersText(54_000), '54K', 'with no pointless .0');
  eq(membersText(1_200_000), '1.2M', 'millions too');
  eq(membersText(123_400), '123K', 'and a three-digit thousand loses the decimal rather than reading 123.4K');
  eq(membersText(null), '', 'a count that was never read prints nothing at all');
}

/* ---------------------------------------------------------- the privacy */
{
  eq(parsePrivacy('Public group · 543 members'), 'public', 'English public');
  eq(parsePrivacy('Private group · 543 members'), 'private', 'English private');
  eq(parsePrivacy('קבוצה ציבורית · 543 חברים'), 'public', 'Hebrew public');
  eq(parsePrivacy('קבוצה פרטית · 543 חברים'), 'private', 'Hebrew private');
  eq(parsePrivacy('Открытая группа'), 'public', 'Russian public');
  eq(parsePrivacy('Закрытая группа'), 'private', 'Russian private');
  eq(parsePrivacy('543 members'), 'unknown', 'a card that did not say says so');
  eq(
    parsePrivacy('Public group · Private group'),
    'private',
    'THE SAFER READING WINS when a card somehow says both — calling a private group public invites him at a door that is shut',
  );
}

/* ------------------------------------------------------- the membership */
{
  eq(parseMembership('', ['Join']), 'none', 'a join button means not a member');
  eq(parseMembership('', ['הצטרפות']), 'none', 'in Hebrew');
  eq(parseMembership('', ['Вступить']), 'none', 'and in Russian');

  eq(parseMembership('', ['Requested']), 'requested', 'a pending request');
  eq(parseMembership('', ['נשלחה בקשה']), 'requested', 'in Hebrew');
  eq(parseMembership('', ['Запрос отправлен']), 'requested', 'and in Russian');
  eq(
    parseMembership('', ['Cancel join request']),
    'requested',
    'AND THE PENDING LABEL THAT CONTAINS THE WORD JOIN — read for "join" first, a group he has already asked to enter reads as one he has not',
  );

  eq(parseMembership('', ['Visit']), 'member', 'already in it');
  eq(parseMembership("You're a member", []), 'member', 'said in prose');
  eq(parseMembership('', ['מעבר לקבוצה']), 'member', 'in Hebrew');
  eq(parseMembership('', ['Перейти в группу']), 'member', 'and in Russian');
  eq(parseMembership('Joined · 543 members', []), 'member', '"joined" is the opposite of "join" and must not be read as it');

  /*
   * THE ORDER THE OWNER'S OWN LOG FORCED.
   *
   * The reader used to capture the title block instead of the whole card, so
   * it saw no buttons at all — three cards came back with an empty label list
   * and 0 of 92 groups were recognised as his. Now it captures the card, which
   * means it sees EVERY control on it, including an "open"/"view" verb sitting
   * beside a Join button on a group he is not in. A visible JOIN is the one
   * unambiguous thing Facebook says about membership, so it outranks the soft
   * words — the other order puts groups he cannot publish to into the list.
   */
  eq(parseMembership('', ['הצטרפות', 'הצגה']), 'none', 'A JOIN BUTTON OUTRANKS AN OPEN VERB on the same card');
  eq(parseMembership('', ['שיתוף', 'הצגה']), 'member', 'and with no join button, the open verb is what says he is in it');
  eq(parseMembership('', ['ביטול הבקשה', 'הצגה']), 'requested', 'a pending request still outranks both');

  /* The Hebrew labels that recognised nothing before. */
  for (const label of ['הצגה', 'פתיחה', 'מעבר לקבוצה', 'עבור לקבוצה', 'כניסה לקבוצה', 'הצגת הקבוצה']) {
    eq(parseMembership('', [label]), 'member', `"${label}" on its own means he is in the group`);
  }
  eq(parseMembership('', ['הצג עוד תגובות']), 'unknown', 'but a longer sentence that merely starts with those words is not a membership claim');

  eq(parseMembership('Public group · 543 members', []), 'unknown', 'A CARD THAT DID NOT SAY IS UNKNOWN — never "not a member"');
  eq(parseMembership('', []), 'unknown', 'and an empty card is not evidence of anything');

  /* The container sweeps up the next result's button on a narrow window. */
  eq(
    parseMembership('באר שבע ביחד · חבר בקבוצה · הצטרפות', ['ביקור']),
    'member',
    'THE BUTTON IS THE EVIDENCE, the prose only the fallback — a card that swept up its neighbour\'s join button is still his own group',
  );

  /*
   * AND THE ORDER, ON THE PROSE PATH, WHICH IS WHERE IT IS LOAD-BEARING.
   *
   * The button labels are anchored regexes, so "Cancel join request" cannot
   * match the join pattern however they are ordered — testing the order there
   * proves nothing. In prose the words are unanchored and all three sentences
   * really can appear on one card, so the first test to fire decides. These
   * three cases fail the moment the ladder is reordered.
   */
  eq(parseMembership('Cancel join request', []), 'requested', 'a pending request whose sentence contains the word JOIN is still pending');
  eq(parseMembership('You are a member · Join', []), 'member', 'and a member whose card swept up a neighbour\'s join is still a member');
  eq(parseMembership('Requested · You are a member', []), 'requested', 'requested outranks member, because the request is the newer fact about the same group');
}

/* ------------------------------------------------------------ the card */
{
  const card = interpretCard({
    href: 'https://www.facebook.com/groups/123456/?ref=search',
    name: '  באר שבע   ביחד ',
    image: 'https://scontent.fbcdn.net/x.jpg',
    text: 'קבוצה ציבורית · 54.3 אלף חברים',
    buttons: ['הצטרפות'],
  });
  eq(card?.externalId, '123456', 'the id');
  eq(card?.url, 'https://www.facebook.com/groups/123456', 'a canonical url, without the search referrer');
  eq(card?.name, 'באר שבע ביחד', 'the name, with its whitespace tidied');
  eq(card?.members, 54_300, 'the count');
  eq(card?.privacy, 'public', 'the privacy');
  eq(card?.membership, 'none', 'and the membership');

  const cyr = interpretCard({ href: '/groups/beer.sheva.ru/', name: 'Наша Беэр-Шева', text: 'Закрытая группа · 12 тыс. участников' });
  eq(cyr?.name, 'Наша Беэр-Шева', 'a Cyrillic name survives whole');
  eq(cyr?.members, 12_000, 'with its own number format');
  eq(cyr?.privacy, 'private', 'and its own privacy wording');
  eq(cyr?.membership, 'unknown', 'and no claim about membership, because the card made none');

  eq(interpretCard({ href: '/groups/1/', name: '   ', text: 'x' }), null, 'a nameless card is not shown — it is always a row that had not finished rendering');
  eq(interpretCard({ href: '/marketplace/', name: 'x', text: 'y' }), null, 'and neither is something that is not a group');

  /*
   * A GROUP WHOSE NAME CONTAINS THE WORDS THE READER IS LOOKING FOR.
   *
   * These three names are from the owner's own screenshot — the ninety-three he
   * was shown as his own groups. The leaked search is what put them in front of
   * the reader, and that is fixed four ways over; but what made them say "he is
   * a member" is separate and would have outlived the leak: the prose fallback
   * reads the card's whole text, the card's text contains the group's NAME, and
   * MEMBER matches the bare word "joined".
   *
   * So any group called "...Nobody Joined" was a group this account belonged
   * to, from its title alone. The pattern cannot be narrowed — "joined" on a
   * Facebook card really does mean you are in the group — so the name is taken
   * out of the text before the question is asked.
   */
  const named = (name: string, text = '', buttons: string[] = []) =>
    interpretCard({ href: '/groups/99/', name, text: `${name} · ${text}`, buttons })?.membership;

  eq(named('I Started a Facebook Group But Nobody Joined', '4 members'), 'unknown', 'a group named "...Joined" makes no claim about membership — its title is not evidence');
  eq(named('JAMS Joined Artists Musicians and Singers', '2 members'), 'unknown', 'nor does this one, which is how it reached a card saying "הקבוצות שלך"');
  eq(named('joined me', '1 member'), 'unknown', 'nor the shortest of them');

  /* Hebrew and Russian the same way — it was never an English problem. */
  eq(named('חבר בקבוצה שלנו', 'קבוצה ציבורית'), 'unknown', 'a Hebrew name carrying the membership words is still only a name');
  eq(named('Перейти в группу Беэр-Шева', 'Открытая группа'), 'unknown', 'and a Russian one');

  /* AND THE REAL SIGNALS STILL WORK, which is the half that makes it a fix
     rather than a mute: the same words OUTSIDE the name, and a button. */
  eq(named('באר שבע ביחד', 'אתה חבר בקבוצה'), 'member', 'the same words outside the name still mean what they mean');
  eq(named('I Started a Facebook Group But Nobody Joined', '', ['הצטרפות']), 'none', 'and a join button on such a card is read normally');
  eq(named('joined me', 'You are a member'), 'member', 'a card that really says it, about a group named for the word, is believed');

  /*
   * AND THE SAME THING FOR THE OTHER TWO FACTS ON THE CARD.
   *
   * Membership is the one that reached him, so it was the one I looked at —
   * and the first version of this fix applied only there, with a comment
   * claiming the count and the privacy word could not be imitated by a name.
   * They can. The group below is named for its own privacy, and the one after
   * it carries a number, and both are ordinary Hebrew group names.
   */
  const full = (name: string, text: string) => interpretCard({ href: '/groups/98/', name, text: `${name} · ${text}` });

  eq(full('קבוצה פרטית של באר שבע', 'קבוצה ציבורית · 500 חברים')?.privacy, 'public', 'a group NAMED private is read from its card, not from its title');
  eq(full('באר שבע', 'קבוצה פרטית · 500 חברים')?.privacy, 'private', 'and a card that says private still says private');
  /* A bare number in a name cannot reach the count — parseMembers wants the
     number AND the word beside it. A name that carries BOTH can, and group
     names are written this way all the time. The first version of this
     assertion used "דרושים 2 עובדים", which has no such word, so it passed
     with the fix removed and proved nothing. */
  eq(full('באר שבע — 10,000 חברים', '54.3 אלף חברים')?.members, 54_300, 'a count ADVERTISED IN THE NAME does not override the card — it is what the group calls itself, not what Facebook counted');
  eq(full('Беэр-Шева 5000 участников', '12 тыс. участников')?.members, 12_000, 'the same in Russian, where the pair is just as common in a name');
  eq(full('באר שבע ביחד', '54.3 אלף חברים')?.members, 54_300, 'while the real count is untouched');

  /*
   * AND THE COUNT THAT IS ABOUT HIM, NOT ABOUT THE GROUP.
   *
   * His screen said "דירות למכירה בבאר שבע · 7 חברים" and "באר שבע ביחד · 4
   * חברים" — city groups of tens of thousands. Facebook writes a second
   * members-count on the card, the one about YOU ("3 חברים שלך בקבוצה"), in
   * the same word and usually first, and this read the first pair it found.
   */
  eq(parseMembers('3 חברים שלך בקבוצה · 54.3 אלף חברים'), 54_300, "a friends-of-yours count is skipped and the group's own count is taken");
  eq(parseMembers('2 חברים משותפים · 12 אלף חברים'), 12_000, 'the same for "משותפים"');
  eq(parseMembers('5 общих участников · 12 тыс. участников'), 12_000, 'and in Russian');
  eq(parseMembers('54.3 אלף חברים · 3 חברים שלך'), 54_300, 'order does not matter — the unqualified count is the group');
  eq(parseMembers('7 חברים'), 7, 'a small group that really has seven members still reads as seven');
  eq(parseMembers('3 חברים שלך בקבוצה'), null, 'and a card that ONLY says how many of your friends are in it says nothing about its size');

  /*
   * AND A WORD THAT MERELY BEGINS WITH ONE OF THOSE IS NOT ONE OF THOSE.
   *
   * "שלי" is a prefix of "שליחת", so without a letter-aware boundary a card
   * reading "12 אלף חברים שליחת הודעה" has its REAL count thrown away and the
   * group reports nothing. `\b` cannot do this job: it is ASCII-only in
   * JavaScript, so between a Hebrew letter and a space there is no boundary at
   * all and the guard it anchors never fires.
   */
  eq(parseMembers('12 אלף חברים שליחת הודעה'), 12_000, 'a real count followed by a word that starts like a qualifier is still the count');
  eq(parseMembers('12 אלף חברים שלי'), null, 'while the qualifier itself is still recognised');

  /*
   * THE BUTTON LABELS, WHICH WERE THE HALF THAT ACTUALLY MATTERED.
   *
   * The first version of this fix stripped the name from the card's prose and
   * handed the labels over untouched — and parseMembership asks the LABELS
   * FIRST AND ALONE. So the fix cleaned the fallback and left the primary
   * evidence poisoned.
   *
   * The reader collects `[role="button"], button, [aria-label]`, and a card's
   * title link carries the group's name as its aria-label. The name arrived as
   * a label, MEMBER matched "Joined" inside it, and the answer came back
   * 'member' before any real button was looked at.
   */
  const labelled = (name: string, buttons: string[]) =>
    interpretCard({ href: '/groups/97/', name, text: `${name} · 4 members`, buttons })?.membership;

  eq(labelled('I Got Bored So I Joined a Bunch of Face Book Groups', ['I Got Bored So I Joined a Bunch of Face Book Groups']), 'unknown', 'the name as an aria-label is not a button that says you are a member');
  eq(labelled('group joined', ['group joined']), 'unknown', 'however short the name is');
  eq(labelled('group joined', ['group joined', 'הצטרפות']), 'none', 'and the REAL button beside it is still read');
  eq(labelled('באר שבע ביחד', ['אתה חבר בקבוצה']), 'member', 'while a genuine membership label still means what it means');

  /*
   * WHITESPACE, which is where the strip quietly did nothing at all.
   *
   * interpretCard collapses the name — trim + /\s+/g → ' ' — and then looked
   * for that collapsed string inside the card's raw innerText, which keeps its
   * double spaces, its non-breaking spaces and the newlines between a card's
   * own lines. A literal search finds none of those, so on exactly the cards
   * this was written for the name stayed in the text.
   */
  eq(
    interpretCard({ href: '/groups/96/', name: 'group  joined', text: 'group \u00a0joined\n4 members', buttons: [] })?.membership,
    'unknown',
    'a name whose copy in the card is spelled with other whitespace is still removed',
  );
  eq(
    interpretCard({ href: '/groups/95/', name: 'I Joined This Group', text: 'I Joined\nThis Group · 4 members', buttons: [] })?.membership,
    'unknown',
    'including a name the card broke across two lines, which is the common case',
  );
  /*
   * EVERY COPY OF IT, which is what the `g` flag is for and what nothing
   * tested: every input above held the name exactly once, so dropping the flag
   * passed. A real card says its name in the picture's alt text, in the link
   * and in the heading.
   */
  eq(
    interpretCard({ href: '/groups/94/', name: 'group joined', text: 'group joined\ngroup joined\n4 members', buttons: [] })?.membership,
    'unknown',
    'a card that repeats its own name is stripped of every copy — one left behind is the whole bug',
  );
}

/* ------------------------------------------------------------ de-duping */
{
  const rows = dedupe([
    { externalId: 'a', url: 'u', name: 'א', image: '', members: null, privacy: 'unknown', membership: 'unknown' },
    { externalId: 'a', url: 'u', name: 'א', image: 'pic', members: 54_300, privacy: 'public', membership: 'none' },
    { externalId: 'b', url: 'u', name: 'ב', image: '', members: 1, privacy: 'public', membership: 'member' },
  ]);
  eq(rows.length, 2, 'the same group found twice is one row');
  eq(rows[0].members, 54_300, 'A LATER SIGHTING FILLS IN WHAT THE FIRST DID NOT KNOW — the card had not finished rendering');
  eq(rows[0].privacy, 'public', 'for every unknown field');
  eq(rows[0].image, 'pic', 'the picture too');

  const keep = dedupe([
    { externalId: 'a', url: 'u', name: 'א', image: '', members: 54_300, privacy: 'public', membership: 'member' },
    { externalId: 'a', url: 'u', name: 'א', image: '', members: null, privacy: 'unknown', membership: 'unknown' },
  ]);
  eq(keep[0].members, 54_300, 'but a KNOWN value is never replaced by an unknown one');
  eq(keep[0].membership, 'member', 'and neither is a membership');
}

/* --------------------------------------------- a group found a second time */
{
  const found = {
    externalId: 'a',
    url: 'https://www.facebook.com/groups/a',
    name: 'באר שבע ביחד',
    image: 'pic2',
    members: 60_000,
    privacy: 'public' as const,
    membership: 'member' as const,
  };
  const stored: StoredGroup = {
    external_id: 'a',
    name: 'באר שבע ביחד',
    image_url: 'pic1',
    members: 54_300,
    privacy: 'public',
    membership: 'none',
    queries: ['באר שבע'],
    first_seen_at: '2026-09-01T00:00:00Z',
  };
  const NOW = '2026-09-30T12:00:00Z';

  const m = mergeDiscovered(found, stored, 'דרום', NOW);
  eq(
    m.queries,
    ['באר שבע', 'דרום'],
    'A GROUP FOUND BY A SECOND PHRASE BELONGS TO BOTH — replaced, it would vanish from a screen the owner had already filled',
  );
  eq(mergeDiscovered(found, stored, 'באר שבע', NOW).queries, ['באר שבע'], 'and the same phrase twice is one entry, not two');
  eq(
    m.first_seen_at,
    '2026-09-01T00:00:00Z',
    'THE FIRST SIGHTING IS NOT RE-STAMPED — with now() on every re-search, every group is "new" for ever and the badge means nothing',
  );
  eq(m.last_seen_at, NOW, 'but the last one is');
  eq(m.members, 60_000, 'a fresh count replaces the old one');
  eq(m.membership, 'member', 'and so does a fresh membership: he joined it since');
  eq(m.image_url, 'pic2', 'and a fresh picture');

  /* The other direction: a card that had not finished rendering. */
  const blank = { ...found, name: '', image: '', members: null, privacy: 'unknown' as const, membership: 'unknown' as const };
  const kept = mergeDiscovered(blank, stored, 'באר שבע', NOW);
  eq(kept.members, 54_300, 'A CARD THAT DID NOT SAY IS NOT EVIDENCE THAT HE LEFT — the known count stays');
  eq(kept.membership, 'none', 'and so does the known membership');
  eq(kept.privacy, 'public', 'and the privacy');
  eq(kept.name, 'באר שבע ביחד', 'and the name');
  eq(kept.image_url, 'pic1', 'and the picture');

  /* A group really can have nobody in it. */
  eq(mergeDiscovered({ ...found, members: 0 }, stored, 'x', NOW).members, 0, 'zero members is a count, not a missing one — `||` here would throw it away');

  const first = mergeDiscovered(found, undefined, 'באר שבע', NOW);
  eq(first.first_seen_at, NOW, 'a group nobody has seen before is first seen now');
  eq(first.queries, ['באר שבע'], 'and belongs to the search that found it');

  /*
   * THE STRONGEST FORM OF "A SEARCH MAY NOT UNDO A DECISION A PERSON MADE":
   * there is no field to write them with. `target_id` says this group is
   * already in the publishing list and `hidden` says he does not want to see
   * it again — both his, neither the search's.
   */
  is(!('target_id' in m), 'a merge cannot touch target_id — "כבר במערכת" is his decision, not a search result');
  is(!('hidden' in m), 'nor hidden — a group he dismissed must not come back because he searched again');
}

/* ------------------------------ only the ones whose NAME carries the phrase */
{
  /*
   * "למה שאני רושם ערד זה מוצא לי גם קבוצות אחרות — שימצא קבוצות שמכילות את
   *  השם ערד בלבד."
   *
   * Facebook's group search is associative. His search for "ערד" came back
   * with "דימונה שלנו", "דימונאים גאים בדימונה" and "שכונת השחר-דימונה" —
   * none of which carry the word. For a publishing list of one city that is
   * ninety rows to read past.
   */
  is(nameMatches('ערד ביחד', 'ערד'), 'the word is in the name');
  is(nameMatches('קבוצת עסקים בערד והסביבה', 'ערד'), 'and inside a longer word of the same place');
  is(!nameMatches('דימונה שלנו', 'ערד'), 'A GROUP THAT DOES NOT CARRY THE WORD IS NOT A RESULT — this is the whole complaint');
  is(!nameMatches('דימונאים גאים בדימונה', 'ערד'), 'however related Facebook thinks it is');
  is(!nameMatches('שכונת השחר-דימונה', 'ערד'), 'and however it is punctuated');

  /*
   * PUNCTUATION IS FLATTENED ON BOTH SIDES. "באר-שבע" and "באר שבע" are one
   * place written two ways, and a plain substring test calls one a miss.
   */
  is(nameMatches('באר-שבע ביחד', 'באר שבע'), 'a hyphen between the words is not a different city');
  is(nameMatches('דרושים | באר שבע | דרום', 'באר שבע'), 'nor are pipes around it');
  is(nameMatches('באר   שבע', 'באר שבע'), 'nor is doubled whitespace');
  is(nameMatches('\u200fערד\u200e ביחד', 'ערד'), 'nor are the bidi marks a Hebrew page carries invisibly');

  /*
   * THE PHRASE, NOT ITS WORDS IN ANY ORDER — because "words in any order" is
   * exactly what Facebook is already doing to him.
   */
  is(!nameMatches('שבע מעיינות באר אורה', 'באר שבע'), 'the words in another order are another place');
  is(nameMatches('Наша Беэр-Шева', 'беэр шева'), 'and the same rule reads Cyrillic, where case does matter');
  is(nameMatches('Beer Sheva Board', 'BEER sheva'), 'and Latin');

  eq(nameMatches('anything at all', ''), true, 'an empty phrase filters nothing, rather than everything');
}

/* ------------------------------------------------------------ the phrase */
{
  eq(normalizeQuery('  באר   שבע '), 'באר שבע', 'spaces collapse');
  eq(normalizeQuery('\u200fבאר שבע\u200e'), 'באר שבע', 'AND BIDI MARKS GO — a phrase copied out of a Hebrew page carries them invisibly, and two identical-looking chips would sit side by side');
  eq(normalizeQuery('Беэр-Шева'), normalizeQuery('беэр-шева'), 'Hebrew has no case, but the same screen searches in Russian, where it decides whether this is one saved search or two');
  eq(normalizeQuery('BEER Sheva'), 'beer sheva', 'and in English');

  eq(queryProblem(''), 'צריך להקליד מה לחפש — עיר, אזור או נושא.', 'nothing typed');
  eq(queryProblem('  '), 'צריך להקליד מה לחפש — עיר, אזור או נושא.', 'nor spaces');
  is(queryProblem('א').includes('קצרה מדי'), 'one character would search the whole of Facebook');
  eq(queryProblem('באר שבע'), '', 'a real phrase is fine');
  eq(queryProblem('Беэр-Шева'), '', 'in any script');
  is(queryProblem('א'.repeat(200)).includes('ארוכה מדי'), 'and a pasted paragraph is refused');
}

/* ------------------------------------------------- filters, sorts, counts */
{
  const rows: ListedGroup[] = [
    { external_id: 'a', name: 'באר שבע ביחד', members: 54_300, privacy: 'public', membership: 'none', first_seen_at: '2026-09-30T10:00:00Z' },
    { external_id: 'b', name: 'Наша Беэр-Шева', members: 12_000, privacy: 'private', membership: 'member', first_seen_at: '2026-09-29T10:00:00Z' },
    { external_id: 'c', name: 'תושבי באר שבע', members: null, privacy: 'public', membership: 'requested', first_seen_at: '2026-09-30T11:00:00Z' },
  ];

  eq(rows.filter((r) => matchesFilter(r, 'all')).length, 3, 'הכל');
  eq(rows.filter((r) => matchesFilter(r, 'none')).map((r) => r.external_id), ['a'], 'לא הצטרפתי');
  eq(rows.filter((r) => matchesFilter(r, 'member')).map((r) => r.external_id), ['b'], 'כבר חבר');
  eq(rows.filter((r) => matchesFilter(r, 'requested')).map((r) => r.external_id), ['c'], 'בקשה ממתינה');
  eq(rows.filter((r) => matchesFilter(r, 'private')).map((r) => r.external_id), ['b'], 'פרטיות');

  eq(sortGroups(rows, 'relevance').map((r) => r.external_id), ['a', 'b', 'c'], "relevance is the order the search returned — the one thing here entitled to the word");
  eq(sortGroups(rows, 'members').map((r) => r.external_id), ['a', 'b', 'c'], 'by size');
  /*
   * The distinction that makes "sinks" mean anything: a group that really has
   * nobody in it against one whose count could not be read. Sorted as zero
   * they are interchangeable, and the second — which may have fifty thousand
   * members — lands at the bottom beside a genuinely empty one.
   */
  const empty: ListedGroup = { external_id: 'zero', name: 'ריקה', members: 0, privacy: 'public', membership: 'none' };
  eq(
    sortGroups([rows[2], empty, rows[0]], 'members').map((r) => r.external_id),
    ['a', 'zero', 'c'],
    'AND A GROUP WHOSE COUNT COULD NOT BE READ SINKS BELOW ONE THAT REALLY HAS NOBODY IN IT — sorted as zero the two are interchangeable',
  );
  is(sortGroups(rows, 'name').map((r) => r.name).join('|').length > 0, 'Hebrew, Russian and English sort in one list without throwing');
  eq(sortGroups(rows, 'relevance') !== rows, true, 'and none of them mutate the array they were given');

  const s = summarize(rows);
  eq([s.total, s.member, s.requested, s.fresh], [3, 1, 1, 1], 'the summary card counts each row exactly once');
  eq(summarize([]).total, 0, 'and an empty search is zero, not a blank');

  eq(newSince(rows, '2026-09-30T09:00:00Z'), 2, 'two of these were first seen after the last search');
  eq(newSince(rows, null), 0, 'a search that has never run has nothing to compare against — and says 0 rather than "all of them are new"');
  eq(newSince(rows, 'not a date'), 0, 'and neither does a stamp that will not parse');
}

/* ------------------------------------------------------------- the wiring */
{
  const lib = readFileSync(new URL('../../src/lib/social/discovery.ts', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../facebook/discover.ts', import.meta.url), 'utf8');

  /*
   * THE ONE RULE THE OWNER STATED AND THE ONE THIS PRODUCT WOULD NOT SHIP
   * WITHOUT: nothing here presses Facebook's join button. A search that joins
   * on his behalf is the behaviour that gets an account restricted, and it is
   * his account.
   */
  for (const [what, src] of [['the library', lib], ['the browser half', worker]] as const) {
    is(!/\.click\(\)/.test(src) || what === 'the browser half', `${what} does not click anything`);
  }
  is(
    !/getByRole\('button',\s*\{\s*name:\s*[^}]*(?:join|הצטרפות|вступить)/i.test(worker),
    'THE BROWSER HALF NEVER LOOKS FOR A JOIN BUTTON, let alone presses one',
  );
  is(/scroll/i.test(worker), 'it scrolls the results, because one screenful is not a search');
  /*
   * THE CARD, NOT THE TITLE BLOCK. The owner's log came back with three cards
   * whose button list was empty — the climb stopped before the Join button.
   * Membership cannot be read from a box that does not contain the control
   * that states it.
   */
  is(/if \(ids\.size > 1\) break;/.test(worker), 'the climb stops the moment it would swallow a second group — that boundary IS the card');
  is(/up < 10/.test(worker), 'and is bounded, so a page with no such boundary cannot climb to the document');
  is(!/lines >= 2/.test(worker), 'the old shape test is gone: it stopped at the title block and left every button outside');

  /*
   * AND THE NAME SURVIVED THE BIGGER BOX.
   *
   * A card links to its group twice, from the picture and from the name, and
   * the picture's anchor has no text. Taking the first anchor and skipping the
   * rest meant falling through to the card's first line — which, once the card
   * was its real size, was Facebook's unread badge. The owner's list came back
   * reading "לא נקראובקבוצה דרושים ער…". My regression, in one screenshot.
   */
  is(
    /if \(name && name\.length > had\.name\.length\) had\.name = name;/.test(worker),
    'the LONGEST text among a card\'s links wins — the picture\'s anchor has none, and taking it first put an unread badge in every name',
  );
  is(!/seen\.add\(key\)/.test(worker), 'and no anchor is skipped before it has been considered for the name');
  is(/search\/groups/.test(worker), "and it reads Facebook's own group search, signed in as the account that is already signed in");
  is(/onTopic = all\.filter\(\(g\) => nameMatches\(g\.name, query\)\)/.test(worker), 'and keeps only the results whose NAME carries the phrase');
  is(/offTopic: all\.length - onTopic\.length/.test(worker), 'counting what it dropped rather than hiding it — "why so few" has to have an answer');

  const sql = readFileSync(new URL('../../supabase/social-latest.sql', import.meta.url), 'utf8');
  const check = sql.match(/check \(membership in \(([^)]*)\)\)/);
  is(check, 'the database constrains the membership column');
  for (const value of ['member', 'requested', 'none', 'unknown']) {
    is(check?.[1].includes(`'${value}'`), `the database accepts '${value}' — a state the app writes and the database refuses is a row that vanishes`);
  }
  is(/check \(command in \([^)]*'discover'/.test(sql), "and it accepts the 'discover' command, which v21 forgot for 'switch' and made the button do nothing");
  is(/social_discovery_groups_tenant_external_idx/.test(sql), 'one row per group per business — "אם אותה קבוצה נמצאה בחיפוש קודם, לא ליצור אותה שוב"');
}

/* ------------------------------------------- the picture, and where it lives */
{
  const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const browser = readFileSync(new URL('../facebook/discover.ts', import.meta.url), 'utf8');

  /*
   * THE BUG THE OWNER SAW: every row showed a letter instead of the group's
   * picture. The card's thumbnail is a SIGNED scontent URL — it expires within
   * hours and is not served to another origin — so storing it is storing
   * something that renders for a little while and then does not.
   */
  is(
    /image: stored\.get\(g\.externalId\) \?\? ''/.test(worker),
    "THE SIGNED FACEBOOK URL NEVER REACHES THE DATABASE — it is replaced by our own copy, or by nothing",
  );
  is(/storage\.from\('social-media'\)\.upload\(objectPath/.test(worker), 'the bytes are stored in the same bucket the groups screen already uses');
  is(/createHash\('sha1'\)\.update\(externalId\)/.test(worker), "and a group's own id is hashed rather than pasted into a storage path");
  is(/page\.request\.get\(g\.image/.test(browser), "the bytes are fetched through the browser's own session, which is what makes a signed URL answer at all");
  /* Was `bytes.length < 500`. A byte count is a guess about what a file IS,
     and it threw away real thumbnails that compress well — permanently, since
     a row holding a picture is never fetched again. The signature check below
     says the same thing and says it correctly. */
  is(/looksLikeImage\(bytes\)/.test(browser), 'a tracking pixel or an error page is not a picture, and would replace an initial with a blank square');

  /* The count reaches the owner, so "still letters" can be told apart from
     "the upload was refused" — he is on a storage account over its quota. */
  is(/pictures: stored\.size/.test(worker), 'how many pictures were really stored is returned, not assumed');
  is(/wrote\.pictures\} תמונות/.test(worker), 'and printed in the sentence he reads');
  is(/wrote\.pictures \? ` \$\{wrote\.pictures\}/.test(worker), 'and only when something really was stored — a re-search that needed none would otherwise report zero and look broken');

  /*
   * AND THE SET THAT DECIDES WHO GETS ONE WAS THE WRONG WAY ROUND.
   *
   * The caller used to list the rows it already HELD that were missing a
   * picture, and the reader fetched exactly those. A group found for the FIRST
   * time has no row, so it was on no list and got no picture — only a re-run of
   * the same search could give it one. The owner searched his city, eighty of
   * the results were new, and every one of them drew a letter in a purple
   * square.
   *
   * Inverted, the new groups are the default and a re-run still downloads
   * nothing, which is what the old shape was really protecting.
   */
  is(/async function groupsWithPictures/.test(worker), 'the caller now names the groups it ALREADY has a picture of');
  is(
    /\.filter\(\(r\) => \/\\\/storage\\\/v1\\\/object\\\/public\\\/\/\.test\(r\.image_url \?\? ''\)\)/.test(worker),
    'and counts only OUR copies — a signed Facebook URL renders for an hour and then shows a letter for ever',
  );
  is(/havePictures: await groupsWithPictures\(\)/.test(worker), 'both reads are given that set');
  is(
    (worker.match(/havePictures: /g) ?? []).length === 2,
    'the search and the "my groups" scan alike — neither is the exception',
  );
  is(
    /groups\.filter\(\(g\) => !have\.has\(g\.externalId\)\)/.test(browser),
    'THE INVERSION: everything the read found that we do not already hold gets a picture, which is what makes a first sighting get one',
  );

  /* Fetched once in the life of a row, on an account already over its storage
     quota — so a re-search must still cost nothing. The set is the inverse of
     what it was, and that is the point: see the inversion assertions above. */
  is(/opts\.havePictures \?\? \[\]/.test(browser), 'the caller names what it already holds, and only the rest is fetched');
  /* A re-search where every group is already held passes an empty list, and an
     empty list opens no lanes — so it still downloads nothing. The old shape
     said this with a `wanted.size ?` in front of the call; this says it where
     the work actually happens, which is the half that cannot be bypassed. */
  is(/Math\.min\(lanes, todo\.length\)/.test(browser), 'and a read that needs none opens no lanes, so it downloads nothing at all');
  is(
    /\/storage\\\/v1\\\/object\\\/public\\\//.test(worker) || /storage.{0,4}v1.{0,4}object.{0,4}public/.test(worker),
    'A LINK WE DID NOT STORE OURSELVES COUNTS AS MISSING — otherwise every row the first version wrote keeps its dead URL for ever',
  );

  /* The merge already refuses to downgrade a known value to an unknown one,
     which is what lets an empty `image` keep the copy stored last time. */
  const kept = mergeDiscovered(
    { externalId: 'a', url: 'u', name: 'א', image: '', members: 1, privacy: 'public', membership: 'member' },
    { external_id: 'a', image_url: 'https://x.supabase.co/storage/v1/object/public/social-media/discovery/ab.jpg' },
    'q',
    '2026-09-30T00:00:00Z',
  );
  eq(
    kept.image_url,
    'https://x.supabase.co/storage/v1/object/public/social-media/discovery/ab.jpg',
    'a search that fetched no picture keeps the one already stored rather than blanking the row',
  );
}

/* ----------------------------------------- "הוסף את כל מה שאני חבר בהן" */
{
  const page = readFileSync(new URL('../../src/app/social/discover/page.tsx', import.meta.url), 'utf8');
  /* Stops at the NEXT memo, not at a marker two memos away: reaching past
     joinedMissing let ITS filters satisfy these assertions, so deleting them
     from joinedNotListed changed nothing the suite could see. */
  const block = page.slice(page.indexOf('const joinedNotListed'), page.indexOf('const joinedMissing'));

  is(/r\.membership === 'member'/.test(block), 'the bulk button counts only groups the search said he is a MEMBER of');

  /*
   * AND THE PER-ROW BUTTON AGREES WITH IT.
   *
   * It did not. It offered itself whenever membership was not 'none' or
   * 'requested', so a row the card said nothing about got "הוסף לרשימה" —
   * "זה נותן לי לצרף לרשימה קבוצות שאני עדיין לא חבר בהם". Every one of those
   * becomes a publishing target that fails once a day with a sensible-looking
   * reason. Two controls that add groups may not disagree about which groups
   * they mean.
   */
  const rowSrc = readFileSync(new URL('../../src/components/social/Discovery.tsx', import.meta.url), 'utf8');
  is(
    /const canAdd = !already && row\.membership === 'member';/.test(rowSrc),
    "A ROW ONLY OFFERS \"הוסף לרשימה\" WHERE THE SEARCH SAID HE IS A MEMBER — not where it merely failed to say otherwise",
  );
  is(
    !/'unknown'/.test(block),
    "AND NOT THE UNKNOWN ONES — the per-row button may offer itself for those because he is looking at one group and knows; a bulk press cannot borrow that, and would put groups he never joined into the publishing list",
  );
  is(/!r\.target_id && !inSystem\.has\(r\.external_id\)/.test(block), 'and skips anything already in the list, by either of the two ways of knowing');
  is(/!r\.hidden/.test(block), 'and anything he dismissed');

  const handler = page.slice(page.indexOf('async function adoptAll'), page.indexOf('/** Everything hidden for this phrase'));
  is(/for \(const row of joinedNotListed\)/.test(handler), 'the inserts are sequential — thirty at once race each other onto the unique index');
  is(/כבר קיימת/.test(handler), 'a group that was already there counts as a success: the sentence is about what is true afterwards');
  /*
   * THE LABEL NAMES THE COUNT — in two halves now, because the results panel
   * became a component so that a browser could measure its height. The card
   * prints the number it was handed; the page hands it the length of the very
   * list adoptAll walks. Both halves are pinned: either one alone passes while
   * the other points somewhere else.
   */
  is(
    /\{joinedNotListed\} הקבוצות שאתה כבר חבר בהן/.test(rowSrc),
    'and the label names the count the card was handed',
  );
  is(
    /joinedNotListed=\{joinedNotListed\.length\}/.test(page),
    'and what it is handed is the length of the list the handler walks, so the promise and the set are the same thing',
  );
}

/* ------------------------- the cards it could not read, kept for reading */
{
  const browser = readFileSync(new URL('../facebook/discover.ts', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');

  /*
   * 0 OF 92 GROUPS RECOGNISED AS HIS, on an account that had just joined
   * several. The words on a card for a group you are already in were written
   * from reasoning and never read off a real page. A second guess is worth
   * what the first was; a sample of the real cards ends it.
   */
  is(/group\.membership === 'unknown' && unread\.size < UNREAD_SAMPLES/.test(browser), 'a card whose membership could not be read is kept');
  is(/!unread\.has\(group\.externalId\)/.test(browser), 'once each — the same card scrolls past twice');
  is(/UNREAD_SAMPLES = 3/.test(browser), 'a few, not all: the log line has to stay readable');
  is(/buttons: \(raw\.buttons \?\? \[\]\)\.slice\(0, 6\)/.test(browser), 'with the labels that were on it, which is the whole point');
  is(/discover_unread/.test(worker), 'and the worker writes them where the owner can read them back to me');

  /* A group's public name and its own button labels. Nothing else goes in,
     and nothing else is available to go in. */
  const line = worker.slice(worker.indexOf('const sample = found.unread'), worker.indexOf('const shots'));
  is(/c\.name/.test(line) && /c\.buttons/.test(line), 'the line carries the name and the labels');
  is(!/text|payload|cookie|token/i.test(line), "and nothing else — a diagnostic that logs a page's whole text is a diagnostic nobody should ship");
}

/* ------------------- the reserved phrase, and the day it reached Facebook */
{
  /*
   * "מה זה הקבוצות האלה??? אני לא הוספתי אותם."
   *
   * His "my groups" card filled with "JAMS Joined Artists Musicians and
   * Singers", "joined me" and "I Started a Facebook Group But Nobody Joined" —
   * ninety-three of them, offered as groups he belongs to, one button press
   * from the publishing list.
   *
   * ONE MISTAKE, THREE DOORS IT WALKED THROUGH. The scan files its results
   * under JOINED_QUERY so they share the table. That row came back from
   * listSearches as an ordinary saved search; the screen loads the newest
   * search into the box on arrival, so it typed "@joined" into the box; the
   * machine searched it literally and Facebook returned every group with
   * "joined" in its name; and because those landed in the same bucket, they
   * became the "my groups" list.
   *
   * He never typed it. So all three doors are shut, and each is tested: it is
   * not a chip, it is not loadable, it is not searchable — and the card no
   * longer trusts the bucket alone.
   */
  const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../src/app/social/discover/page.tsx', import.meta.url), 'utf8');

  is(/\.neq\('normalized', JOINED_QUERY\)/.test(client), 'DOOR 1: the reserved phrase is not a saved search, so it is never a chip');
  is(/s\.normalized !== JOINED_QUERY/.test(page), 'DOOR 2: and the screen will not load it into the box by itself');
  is(
    queryProblem(JOINED_QUERY).includes('ביטוי פנימי'),
    'DOOR 3: and it is refused as a search however it got into the box',
  );
  is(queryProblem('@JOINED  ') === queryProblem(JOINED_QUERY), 'in any spelling the normaliser folds to the same thing');
  eq(queryProblem('באר שבע'), '', 'while a real phrase is untouched');

  /*
   * READ OUT OF listJoined ITSELF, not out of the file.
   *
   * A whole-file regex for the filter was satisfied by a listJoined that
   * computed `his` and then returned `rows` — the lock written down and not
   * applied. This is the one door between the reserved bucket and the card.
   */
  const joinedFn = client.slice(client.indexOf('export async function listJoined'));
  const joinedBody = joinedFn.slice(0, joinedFn.indexOf('\n}'));
  is(
    /return rows\.filter\(\(r\) => r\.membership === 'member'/.test(joinedBody),
    "THE SECOND LOCK: listJoined RETURNS the filtered rows — a group is his only if the read CONFIRMED membership, which only Facebook's own list of his groups does",
  );
  /*
   * AND THE DISMISSED ONES GO OUT HERE, so the card's two numbers count the
   * same set. They did not: the headline counted every row while the list
   * under it skipped the dismissed ones, so dismissing the last missing group
   * turned "מתוך 164 … 1 עוד לא ברשימת הפרסום" into "כל 164 הקבוצות … כבר
   * ברשימת הפרסום" — a sentence about 164 that was true of 163.
   */
  is(/r\.membership === 'member' && !r\.hidden/.test(joinedBody), 'and a dismissed row is not counted as one of his groups either');

  /*
   * AND NEITHER OF THE TWO LOCKS ABOVE IS ON THE MACHINE THAT DOES THE WORK.
   *
   * Doors 1-3 are in the dashboard, which is deployed the moment it is written;
   * the program that opens the browser is whatever was last installed on
   * somebody's PC, and the phrase travels between them as a row in a table. A
   * refusal that only exists in the newest build of the screen is not a
   * refusal — the owner's machine would still search it, and an old build, a
   * stale tab or a hand-written row would still ask.
   *
   * So the worker refuses the phrase itself, and the single function that
   * writes the table refuses to file a row under it without a confirmed
   * membership. That last one is the floor: with it, the junk the card showed
   * him could not have been written at all, by any caller.
   */
  const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const door4 = worker.slice(worker.indexOf("} else if (normalizeQuery(phrase) === JOINED_QUERY) {"));
  is(
    /normalizeQuery\(phrase\) === JOINED_QUERY/.test(worker),
    'DOOR 4: the machine that would open the browser refuses the reserved phrase on its own, not because the screen said so',
  );
  is(
    /* From AFTER the branch's own `} else if` to the next one — searching from
       index 0 finds the opening token itself and slices to nothing, which is a
       guard that reads an empty string and always passes. */
    /ok = false;/.test(door4.slice(0, door4.indexOf('} else if', 10))),
    'and it REFUSES — pinning the condition alone let the branch report a refused scan as a success with a green toast',
  );
  const writer = worker.slice(worker.indexOf('async function recordDiscovered'));
  is(
    /normalized === JOINED_QUERY && groups\.some\(\(g\) => g\.membership !== 'member'\)/.test(
      writer.slice(0, writer.indexOf('const { error }')),
    ),
    'THE FLOOR: the one writer of the table will not file anything in the reserved bucket that does not carry a confirmed membership',
  );
  is(
    /throw new Error/.test(
      writer.slice(writer.indexOf('normalized === JOINED_QUERY'), writer.indexOf('const ids =')),
    ),
    'and it throws rather than skipping quietly — a bucket silently half-written is the bug that cannot be reported',
  );
}

/* ------------------------ the groups he is in, read off his own list */
{
  const mine = readFileSync(new URL('../facebook/mygroups.ts', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../src/app/social/discover/page.tsx', import.meta.url), 'utf8');

  /*
   * "אני רוצה לאחר שאני מצטרף לקבוצות שיהיה אופציה לראות קבוצות שעדיין לא
   *  התווספו למערכת ולהוסיף אותם במכה."
   *
   * The value is that it is NOT a search: every group on Facebook's own list
   * of a person's groups is one they are in, by construction. Reading
   * membership off a search card has been wrong twice on this owner's account
   * — 0 of 92 — and a set difference cannot be wrong the same way.
   */
  is(/groups\/joins/.test(mine), "it reads Facebook's own list of this account's groups");
  is(/membership: 'member'/.test(mine), 'and every row from it is a membership, not a guess');
  is(!/parseMembership/.test(mine), 'nothing on this path parses a membership out of words at all');

  /*
   * EXCEPT THAT THE PAGE IS NOT PURE. Facebook mixes suggestions into some
   * layouts, and a suggested group in the publishing list is one that fails
   * every publication with "you are not a member".
   */
  is(/NOT_MINE/.test(mine) && /suggested/i.test(mine), 'suggestions on the same page are recognised');
  is(/if \(suggested\) continue;/.test(mine), 'and dropped rather than reported as his');
  is(/role="heading"/.test(mine), 'by the section they sit under, which is the only thing that distinguishes them');

  /* No migration for the owner: the CHECK lists commands by name. */
  /* The screen calls startJoinedScan; the payload lives in client.ts, which is
     where the one place that builds the command is. */
  const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  is(/startJoinedScan/.test(page), 'the screen asks for the scan');
  is(/sendWorkerCommand\(workerId, 'discover', \{ source: 'joined' \}\)/.test(client), 'as a source of the command it already has — no new command name, no migration for the owner');
  is(/cmd\.payload\?\.source === 'joined'/.test(worker), 'and the worker branches on that rather than on a new command name');

  /* It must not read as a search, or "new since last search" counts it. */
  is(/JOINED_QUERY/.test(worker), 'its results are filed under a reserved phrase');
  is(/JOINED_QUERY = '@joined'/.test(readFileSync(new URL('../../src/lib/social/discovery.ts', import.meta.url), 'utf8')), "which no search box can produce");

  /* The press is over a set difference, and it is shown before it is made. */
  const diff = page.slice(page.indexOf('const joinedMissing'), page.indexOf('const hiddenCount'));
  is(diff.length > 0 && diff.length < 600, 'and that slice is the memo itself, not a span of the file that another memo could satisfy');
  is(/!r\.target_id && !inSystem\.has\(r\.external_id\)/.test(diff), 'the list is exactly what the publishing list does not have');
  is(/!r\.hidden/.test(diff), 'minus anything he dismissed');
  /* The card itself is a component now, so the fixture can put the real one
     in a browser. The assertion follows it. */
  const card = readFileSync(new URL('../../src/components/social/Discovery.tsx', import.meta.url), 'utf8');
  const block = card.slice(card.indexOf('export function MyGroupsCard'));
  is(/missing\.slice\(0, 8\)/.test(block), 'and the names are on screen before the button is pressed — a blind bulk add is not a bulk add');
  is(/הוסף את \{missing\.length\} הקבוצות/.test(block), 'the label names the count, so the promise and the set are the same thing');

  /*
   * AND A WAY OUT THAT IS NOT A RELEASE.
   *
   * Everything above is a rule of mine, and a rule of mine is what let
   * ninety-three groups he had never joined onto this card. The dismiss beside
   * each name is the only part of it that works when I am wrong again — so it
   * is guarded here as well as measured in a browser, because the measurement
   * SKIPS without a built stylesheet and a skipped check is not a check.
   */
  is(/aria-label=\{`זאת לא קבוצה שלי/.test(block), 'every name on the card can be dismissed by the person reading it');
  is(/onHide\(row\)/.test(block), 'and the dismiss acts on that row, not on the list');
  /*
   * A SQUARE, NOT A LITERAL.
   *
   * This read `h-11 w-11` until the card was compacted to a 40px dismiss, and
   * it was the wrong thing to pin: the block it searches also holds the card's
   * own 40px header tile, so the same regex passes with the dismiss's size
   * class deleted. It is pinned to the ✕'s own tag now, and to a square of at
   * least 40px rather than one exact number — the real floor is measured on the
   * painted box in discovery-row.test.ts.
   */
  const dismissTag = block.slice(
    block.indexOf('aria-label={`זאת לא קבוצה שלי'),
    block.indexOf('</button>', block.indexOf('aria-label={`זאת לא קבוצה שלי')),
  );
  is(
    /h-(1[0-2]) w-\1(?!\d)/.test(dismissTag),
    'with a square target a thumb can hit — 40px at the smallest, on this card read on a phone',
  );

  /*
   * THE PICTURE THIS APP ALREADY HAS.
   *
   * "בקוביה הסגולה איפה שהאות תכניס לשם את התמונה של הקבוצה (כמו שאתה מושך
   *  מקבוצות שאני מכניס ידני)." Every row marked "במערכת" is a group whose
   * page this app already opened once and whose cover it already stored — and
   * the row was drawing a letter beside it. One small read, no Facebook
   * traffic, no storage upload, and no waiting for the next search.
   */
  is(/export async function listTargetPictures/.test(client), 'the publishing list can be asked for the pictures it holds');
  is(/\.neq\('image_url', ''\)/.test(client), 'and only the rows that really have one come back');
  is(/fallbackImage=\{targetPics\.get\(row\.external_id\) \?\? null\}/.test(page), 'each result row is given the one for its own group');
  is(
    /imageUrl=\{row\.image_url \|\| fallbackImage \|\| null\}/.test(card),
    "BEHIND the row's own picture, never in front of it — what discovery stored is the newer of the two",
  );
  is(/pictures\?\.get\(row\.external_id\)/.test(card), 'and the card and the walk-through use the same fallback, so one list cannot show a picture the next hides');

  /* A refused upload has to be visible, or "still letters" cannot be told from
     "never fetched" — and those need completely different fixes. */
  is(/picture_upload_failed/.test(worker), 'storage refusing a picture reaches the activity log');
  is(/if \(!refused\) refused = error\.message;/.test(worker), 'with the reason the bucket gave, which is the part that names the quota');

  /*
   * AND THE READ THAT EVERYTHING ELSE IS WRITTEN FROM.
   *
   * recordDiscovered reads the stored rows and then rebuilds each one from
   * what it read. That read had no error check at all — so one failed request
   * made `was` undefined for every group, and the upsert twelve lines down
   * committed a rewrite from nothing: image_url back to '', first_seen_at back
   * to now, queries reset to this one phrase, and the reserved-bucket guard
   * (keyed on `was`) silently off. Every picture he was looking at would have
   * gone back to a purple letter in one run.
   */
  const record = worker.slice(worker.indexOf('async function recordDiscovered'));
  const rebuild = record.slice(0, record.indexOf('const { error }'));
  is(/const \{ data: existing, error: read \}/.test(rebuild), 'the read that feeds the rebuild is checked');
  is(/if \(read\) throw read;/.test(rebuild), 'and a failed read fails the command rather than rewriting every row from nothing');

  /* One search finishes the pictures. 60 against a MAX_GROUPS of 120 meant a
     broad phrase could only ever picture half of what it found, while the
     sentence reported the half it did and said nothing of the half it skipped —
     which on screen is the same purple letters he already reported once. */
  const reader = readFileSync(new URL('../facebook/discover.ts', import.meta.url), 'utf8');
  is(/const PICTURE_LIMIT = MAX_GROUPS;/.test(reader), 'the picture cap matches how many groups a search may return, so one run finishes the job');

  /*
   * "שיראה תמונות של קבוצות שאני עוד לא שם."
   *
   * The groups he is NOT in are the ones furthest down a scrolled list — and
   * those are exactly the cards Facebook has not finished loading. The reader
   * took `box.querySelector('img')` and read its `src` ATTRIBUTE, which on a
   * lazy card is a placeholder or a data: URI while the real address sits in
   * currentSrc or srcset; some cards draw the thumbnail as a CSS background or
   * an <svg><image> and have no <img> at all.
   */
  is(/img\.currentSrc \|\| img\.getAttribute\('src'\)/.test(reader), 'the picture is what the browser actually chose, not the attribute it started with');
  is(/getAttribute\('srcset'\)/.test(reader), 'a srcset is read too, because a lazy card often has only that');
  is(/querySelectorAll\('svg image'\)/.test(reader), 'and an <svg><image>, which has no <img> to find');
  is(/backgroundImage/.test(reader), 'and a CSS background, same reason');
  is(/if \(candidate\.area <= bestArea\) continue;/.test(reader), "and the LARGEST as rendered wins — the group's own thumbnail, never a badge on a button");
  /*
   * AND NONE OF IT HAPPENS THROUGH A NAMED HELPER.
   *
   * The candidates used to be weighed by `const consider = (url, w, h) => …`
   * inside the evaluate. esbuild keeps function names, so that compiles to
   * `__name(() => …, 'consider')`, the call ships to the browser with the
   * function source and the helper stays in Node. It ran only because
   * session.ts defines `__name` on every worker context — a line in another
   * file — and the first browser test written against this one died on its
   * first statement. An array of candidates needs no such line.
   */
  /* The typed form, not the words: the comment beside the code in discover.ts
     quotes the construct it is warning about, and a bare search for it matches
     the warning. */
  is(!/const consider = \(url: string/.test(reader), 'and the weighing is an array, not a named function that ships a call to a helper that stays behind');
  /*
   * THE PICTURE IS A PASS OF ITS OWN, and this is the second time the owner
   * has reported the same sentence. Everything above is about WHERE to look on
   * a card; none of it helps when the card has never been in the viewport, and
   * Facebook does not load a thumbnail until it has. What this pins is that
   * the search goes back for them; worker/test/discover-pictures.test.ts is
   * what proves it works, against a page that lazy-loads exactly as the real
   * one does.
   */
  is(/await fillPictures\(page, groups, wanted\);/.test(reader), 'a search that found no address for a card goes back and brings the card into view');
  is(/scrollIntoView\(\{ block: 'center' \}\)/.test(reader), 'by scrolling it into view, which is the only thing that makes the browser load it');
  is(/pictureless: wanted\.size/.test(reader), 'and the ones it still could not find an address for are counted, so "0 תמונות" names which half failed');

  /* What comes back has to be an image, judged by the bytes. A row that holds
     a picture is never fetched again, so one wrong answer is permanent. */
  is(/if \(type && !\/\^image\\\/\/i\.test\(type\)\) continue;/.test(reader), 'a 200 that is not an image is refused — a login wall answers 200 and is kilobytes long');
  is(/function looksLikeImage/.test(reader), 'and the bytes themselves are checked against the four formats Facebook serves');
  is(!/bytes\.length < 500/.test(reader), 'the 500-byte floor is gone — it threw away real thumbnails that compress well, permanently');
  is(/if \(out\.size >= PICTURE_LIMIT\) return;/.test(reader), 'the cap counts what SUCCEEDED, so a run of unfetchable cards cannot spend the whole allowance');

  /*
   * AND NO WHITE LABEL MAY SIT ON brand-300.
   *
   * The selected filter pill was given a gradient ending at brand-300, and its
   * 12px white label measured 4.40:1 — under the 4.5 AA asks for. globals.css
   * says it in as many words: brand-300 is the indicator step, "using the
   * bright accent as text is exactly the mistake the split exists to prevent".
   *
   * contrast.test.ts could not catch it: it compares solid tokens from a fixed
   * list, and a gradient stop is in neither. So the rule is kept where the
   * gradient is written — both ends of anything carrying `text-on-brand` must
   * be fills a white label is allowed on, which is brand-500 (5.70:1) and
   * darker.
   */
  /* The rule is about TEXT. A white glyph on brand-300 measures 4.23:1, which
     clears the 3:1 WCAG 1.4.11 asks of a graphic — so the decorative tiles on
     this screen may reach it, and the pill, which carries a 12px label, may
     not. Pinned on the pill itself rather than by sweeping every gradient,
     because only the pill's contrast is a text contrast. */
  /* The pill moved to FilterRow in Discovery.tsx so a browser could measure
     the row it sits in. Both ends of the slice are checked before it is cut:
     a missing anchor gives indexOf -1, slice returns the wrong half of the
     file, and the two assertions below would then be about somewhere else. */
  const filterSrc = readFileSync(new URL('../../src/components/social/Discovery.tsx', import.meta.url), 'utf8');
  const pillFrom = filterSrc.indexOf('{filters.map((f) => (');
  const pillTo = filterSrc.indexOf('{filterLabel[f]}', pillFrom);
  is(pillFrom >= 0 && pillTo > pillFrom, 'the filter pill is where this check cuts the file');
  const pill = filterSrc.slice(pillFrom, pillTo);
  is(/from-brand-600 to-brand-500 text-on-brand/.test(pill), 'the selected filter pill runs brand-600 → brand-500 — both fills a white LABEL is allowed on');
  is(
    !/to-brand-300|from-brand-300/.test(pill),
    'and never reaches brand-300, where a 12px white label measured 4.40:1 — under the 4.5 AA asks of text',
  );
  is(/onHide=\{hideJoined\}/.test(page), 'the screen wires it to its own handler');
  const joinedHide = page.slice(page.indexOf('async function hideJoined'), page.indexOf('async function hide('));
  is(/hideDiscovered\(row\.id, true\)/.test(joinedHide), 'which hides the row rather than deleting it — nothing he taught the app is thrown away');
  is(/setJoined\(/.test(joinedHide) && /setRows\(/.test(joinedHide), 'and updates BOTH lists, because the same row can be in the card and in the search results');

  /*
   * AND THE ROWS THAT ARE ALREADY WRONG IN HIS DATABASE.
   *
   * This is the half I missed, and he found it: "למה זה עדיין מראה לי את זה?"
   *
   * Every junk name on his card carries the word "joined" — "group joined",
   * "I Got Bored So I Joined a Bunch of Face Book Groups" — and the old reader
   * took the card's prose, which CONTAINS the name, as evidence. So each one
   * was written down as membership = member. Shutting the leak stops new ones;
   * stripping the name fixes future reads; the filter on the card asks for
   * `member` and these all SAY member. None of the three touches a row that is
   * already stored, so the card would have looked identical after the fix.
   *
   * What fixes it is that the scan reads Facebook's own COMPLETE list of his
   * groups. A row in this bucket that the list does not mention is not his —
   * by that bug, or because he left. So the scan reconciles, and the guard
   * below is the one that matters: never on a truncated read.
   */
  const recon = worker.slice(worker.indexOf('async function reconcileJoined'));
  const body = recon.slice(0, recon.indexOf('\n}'));

  is(/reconcileJoined\(mine\.groups, mine\.truncated\)/.test(worker), 'the scan reconciles the bucket against the list it just read');
  is(
    /if \(truncated \|\| !found\.length\) return 0;/.test(body),
    'THE GUARD: a partial read reconciles NOTHING — a truncated list used this way withdraws the membership of every group past the cut-off',
  );
  is(/לא הסרנו הפעם כלום/.test(worker), 'and the owner is told that nothing was removed, rather than left to find out');
  is(
    /membership === 'member' && !onTheList\.has/.test(body),
    'only a row that CLAIMS a membership is touched — one that already says nothing is left alone',
  );
  is(/update\(\{ membership: 'none' \}\)/.test(body), "the claim is withdrawn, not the row: nothing is deleted");
  is(!/\.delete\(\)/.test(body), 'and nothing on this path deletes anything at all');
  is(!/hidden/.test(body), "nor sets `hidden` — that word means the OWNER dismissed it, and only he may say so");
  /* Anchored at both ends: /at \+= 100/ alone also matches `at += 100000`,
     which is the batching removed. It passed that mutation. */
  is(/at \+= 100\b(?!\d)/.test(body), 'in batches, because this is an in(...) list in a URL and his bucket already holds 164');
  is(/slice\(at, at \+ 100\)/.test(body), 'and each batch is the slice that batch size describes');

  /*
   * THE THREE LINES THAT DECIDE HOW FAR THIS REACHES, each pinned on its own.
   *
   * A reviewer mutated them and the suite stayed green, which is worse than
   * having no test: the block asserted the guard, the predicate, the write
   * shape and the batching, and left unpinned the only line that says WHICH
   * ROWS are in range.
   */
  is(
    /\.contains\('queries', \[JOINED_QUERY\]\)/.test(body),
    "THE BLAST RADIUS: only the reserved bucket is read — without this one line a single scan lowers the membership of every group ever found by any search",
  );
  is(
    /new Set\(found\.map\(\(g\) => g\.externalId\)\)/.test(body),
    'the set is built from the group IDS of what Facebook just listed',
  );
  is(
    /!onTheList\.has\(\(row as StoredGroup\)\.external_id\)/.test(body),
    'and compared against the stored row\u2019s ID — comparing names instead would miss every row and withdraw all 164 of his memberships',
  );
  is(
    /\.in\('id', stale\.slice/.test(body),
    "and the update finds its rows by the id `stale` holds — by external_id it would match nothing, write nothing, and still report a count",
  );

  /*
   * AND THE FLAG THE WHOLE THING RESTS ON HAS TO MEAN WHAT IT SAYS.
   *
   * Three independent reviewers found the same hole, and they were right:
   * `truncated` was set in ONE place — the MAX_GROUPS ceiling — while the
   * scroll loop had two other ways out. One barren pass ended the read, and
   * running out of passes ended it too, both reporting a PARTIAL list as
   * Facebook's complete enumeration. Reconciliation would then have withdrawn
   * the membership of every group past the cut-off: his real groups, off his
   * own card, by the fix meant to clean it.
   *
   * So completeness is proven, not assumed. The flag starts true and only two
   * consecutive barren passes AT THE BOTTOM OF THE PAGE can clear it — which
   * also covers a layout where scrollBy moves nothing, because then the page
   * never reports itself at the bottom.
   */
  const mineSrc = readFileSync(new URL('../facebook/mygroups.ts', import.meta.url), 'utf8');
  is(/let truncated = true;/.test(mineSrc), 'THE DEFAULT IS "we did not finish" — every exit that proves nothing leaves it saying so');
  is(/barren >= 2 && atBottom/.test(mineSrc), 'and only two barren passes AT THE BOTTOM clear it');
  is(/truncated = false;/.test(mineSrc) && mineSrc.split('truncated = false;').length === 2, 'from exactly one place, so no other exit can claim completeness');
  is(
    !/if \(unique >= MAX_GROUPS\) \{\s*truncated = true;/.test(mineSrc),
    'the ceiling no longer needs to SET it — it simply breaks, and the default already says the read did not finish',
  );
  is(
    /document\.body\.scrollHeight/.test(mineSrc),
    "and 'at the bottom' is what the page reports about itself, not what the row count implies",
  );

  /*
   * AND A SEARCH MAY NOT PUT BACK WHAT THE SCAN TOOK OFF.
   *
   * mergeDiscovered never lowers a known value, so an ordinary search that
   * read a card as 'member' would RAISE a row the scan had just reconciled to
   * 'none' — and put it straight back on the card. That is reconciliation
   * undone by exactly the kind of guess it exists to overrule.
   */
  const writer2 = worker.slice(worker.indexOf('async function recordDiscovered'));
  const merge = writer2.slice(0, writer2.indexOf('const { error }'));
  is(
    /normalized !== JOINED_QUERY && was\?\.membership && \(was\.queries \?\? \[\]\)\.includes\(JOINED_QUERY\)/.test(merge),
    "THE BUCKET'S MEMBERSHIP COLUMN IS THE SCAN'S ALONE: a search may not raise a row that is in it",
  );
  is(/row\.membership = was\.membership;/.test(merge), 'the stored answer is kept rather than the search\u2019s guess');

  /* …while everything else a search learns about that row is still written. */
  is(/const row = mergeDiscovered\(/.test(merge), 'the rest of the merge is untouched — name, picture, count and queries still update');

  /* The screen re-reads what the scan wrote, including the search list. */
  is(/active \? listDiscovered\(active\) : Promise\.resolve\(null\)/.test(page), 'after a scan the search rows are re-read too, because the scan now writes to them');

  /* And the card cannot be left claiming it is still loading. */
  is(/setJoined\(\(was\) => was \?\? \[\]\)/.test(page), "a failed first load leaves the card out of 'טוען…', which is the one state with no way out");

  /* Hebrew counts to one. */
  is(/dropped === 1 \? 'קבוצה אחת/.test(worker), 'one group removed is said in the singular, not "1 קבוצות"');

  /* A read that found nothing is a failed read, not an account with no groups. */
  is(/if \(!mine\.groups\.length\) ok = false;/.test(worker), 'and a scan that came back empty is not reported as a success under a tick');

  /*
   * REMOVING A GROUP IS A DECISION, AND THE CARD HAS TO REMEMBER IT.
   *
   * "ברגע שאני מסיר קבוצה באפליקציה שלי שלא תקפוץ לי בתור אופציה להוספה
   *  לקבוצות שאני כבר חבר בהם."
   *
   * The card offers every group he is IN that the publishing list does NOT
   * have. So removing one made it exactly that — a group he is in, missing
   * from the list — and the card offered it straight back. The only escape was
   * to remove it and then dismiss it, every time, for ever.
   */
  const dismiss = client.slice(client.indexOf('async function dismissDiscoveredFor'), client.indexOf('export async function bulkDeleteTargets'));

  is(/dismissDiscoveredFor/.test(client), 'a removal tells גילוי קבוצות about itself');
  is(
    /await dismissDiscoveredFor\(ids\);\s*unwrap\(await db\(\)\.from\('social_targets'\)\.delete\(\)/.test(client),
    'BEFORE the delete, because target_id is ON DELETE SET NULL and the link is gone the instant the row is',
  );
  is(
    /await dismissDiscoveredFor\(\[id\]\);\s*unwrap\(await db\(\)\.from\('social_targets'\)\.delete\(\)/.test(client),
    'on both ways out — one group and many — so neither screen is the exception',
  );
  is(/\.in\('target_id', ids\)/.test(dismiss), 'matched by the link the adoption wrote');
  is(/\.in\('external_id', externalIds\)/.test(dismiss), 'AND by the groupitself, because a group added by hand has no link but can still have been found by a search');
  is(/update\(\{ hidden: true \}\)/.test(dismiss), 'and it is a dismissal — the same word the ✕ writes, reversible from "הצג קבוצות שהוסתרו"');
  is(!/\.delete\(\)/.test(dismiss), 'nothing in the discovery table is deleted by it');
  is(
    /\.then\(undefined, \(\) => undefined\)/.test(dismiss),
    'and a dismissal that fails never fails the removal — he asked for the group to go, and it goes',
  );
}

console.log(`discovery tests OK — ${checks} assertions`);
