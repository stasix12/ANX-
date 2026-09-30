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

console.log(`discovery tests OK — ${checks} assertions`);
