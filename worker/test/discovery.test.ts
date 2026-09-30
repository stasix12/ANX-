import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dedupe,
  groupIdFromHref,
  interpretCard,
  matchesFilter,
  mergeDiscovered,
  membersText,
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
  is(/bytes\.length < 500/.test(browser), 'a tracking pixel or an error page is not a picture, and would replace an initial with a blank square');

  /* The count reaches the owner, so "still letters" can be told apart from
     "the upload was refused" — he is on a storage account over its quota. */
  is(/pictures: stored\.size/.test(worker), 'how many pictures were really stored is returned, not assumed');
  is(/wrote\.pictures\} תמונות/.test(worker), 'and printed in the sentence he reads');
  is(/need\.length \? ` \$\{wrote\.pictures\}/.test(worker), 'but only when pictures were asked for — a re-search needing none would otherwise report zero and look broken');

  /* Fetched once in the life of a row, on an account already over its storage
     quota — so a re-search must cost nothing. */
  is(/opts\.pictures \?\? \[\]/.test(browser), 'only the ids the caller still needs are fetched');
  is(/wanted\.size \? await fetchPictures/.test(browser), 'and a search that needs none downloads nothing at all');
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
  const block = page.slice(page.indexOf('const joinedNotListed'), page.indexOf('const hiddenCount'));

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
  is(/joinedNotListed\.length\} הקבוצות שאתה כבר חבר בהן/.test(page), "and the label names the count, so the promise and the set are the same thing");
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
  is(/!r\.target_id && !inSystem\.has\(r\.external_id\)/.test(diff), 'the list is exactly what the publishing list does not have');
  is(/!r\.hidden/.test(diff), 'minus anything he dismissed');
  is(/joinedMissing\.slice\(0, 8\)/.test(page), 'and the names are on screen before the button is pressed — a blind bulk add is not a bulk add');
}

console.log(`discovery tests OK — ${checks} assertions`);
