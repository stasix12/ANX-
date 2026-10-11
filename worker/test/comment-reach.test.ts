/*
 * WHY NO COMMENT CAME OUT, AND THE TWO RULES THAT DECIDE IT.
 *
 * "למה לא מוסיף תגובות מהירות תסדר" — 879 queued, 0 delivered, and the card
 * above the queue promising the next one in about a minute.
 *
 * Nothing here opens Facebook or a database. These are the two pure rules the
 * feature actually turns on, and both were wrong in a way that no browser test
 * could have localised:
 *
 *   REACH    which rows the worker is even allowed to look at. It read the
 *            FIVE OLDEST pending rows of an 879-deep queue, so today's posts —
 *            the ones whose comment was asked for, and the only ones certain
 *            to still be on the page — were eight hundred rows behind the
 *            window and were never candidates at all.
 *
 *   ADDRESS  what gets stored as a post's address. permalinkOf kept the
 *            pathname and dropped the query string, and on a `story_fbid=`
 *            href the post id IS the query and the pathname is the GROUP. So
 *            the column that means "this post" held "this group", the row
 *            joined the 45-second cheap pass, and commentOnPost then launched
 *            its 240-second hunt inside that 45-second window — the slot-
 *            stealing regression the owner banned, arriving through the
 *            address column instead of through the gate.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalPostUrl } from '../facebook/composer';

let checks = 0;
const is = (actual: unknown, expected: unknown, what: string): void => {
  checks += 1;
  assert.deepStrictEqual(actual, expected, what);
};

/* ───────────────────────────── the address rule ───────────────────────── */

is(
  canonicalPostUrl('https://www.facebook.com/groups/123/posts/4567/?__cft__[0]=abc&__tn__=R'),
  'https://www.facebook.com/groups/123/posts/4567/',
  'tracking parameters are stripped and the post survives',
);
is(
  canonicalPostUrl('https://www.facebook.com/groups/123/permalink/4567/'),
  'https://www.facebook.com/groups/123/permalink/4567/',
  'a /permalink/ address is kept as it is',
);
/*
 * THE ONE THAT WAS WRONG. Before the fix this returned
 * 'https://www.facebook.com/groups/123' — the GROUP — into a column that
 * means "this post".
 */
is(
  canonicalPostUrl('https://www.facebook.com/groups/123/?story_fbid=4567'),
  'https://www.facebook.com/groups/123/posts/4567/',
  'a post id carried in the query is rebuilt into a real address, not dropped with the query string',
);
is(
  canonicalPostUrl('https://www.facebook.com/groups/123/?multi_permalinks=pfbid0xyz'),
  'https://www.facebook.com/groups/123/posts/pfbid0xyz/',
  'and the same for the multi_permalinks shape',
);
/*
 * EMPTY IS THE SAFE ANSWER. A row with no address stays `permalink IS NULL`,
 * which routes it to the hunt pass — and the hunt pass is the one actually
 * budgeted 240 seconds. A group URL in that column is strictly worse than no
 * URL at all, because it buys the row a 45-second budget for 240 seconds of
 * work.
 */
is(canonicalPostUrl('https://www.facebook.com/groups/123/'), '', 'a group address is never a post address');
is(canonicalPostUrl('https://www.facebook.com/groups/123'), '', 'with or without the trailing slash');
is(canonicalPostUrl('https://www.facebook.com/groups/123/posts/'), '', 'and neither is a /posts/ with nothing after it');
is(canonicalPostUrl('https://evil.example.com/groups/1/posts/2/'), '', 'the host check still holds');
is(canonicalPostUrl('not a url'), '', 'and nonsense answers nothing rather than throwing');
is(canonicalPostUrl(''), '', 'as does an empty href');

/*
 * AND THE COLUMN AGREES WITH THE TEST THAT READS IT. commentOnPost decides
 * whether it already has an address with /\/(posts|permalink)\//; every
 * non-empty answer above has to satisfy it, or a stored address would send the
 * browser hunting for a post it already has the address of.
 */
const AGREES = /\/(posts|permalink)\//;
for (const href of [
  'https://www.facebook.com/groups/123/posts/4567/?__cft__[0]=abc',
  'https://www.facebook.com/groups/123/permalink/4567/',
  'https://www.facebook.com/groups/123/?story_fbid=4567',
  'https://www.facebook.com/groups/123/?multi_permalinks=pfbid0xyz',
]) {
  const out = canonicalPostUrl(href);
  is(out !== '' && AGREES.test(out), true, `the stored address and the test that reads it agree on ${href}`);
}

/* ────────────────────────────── the reach rule ─────────────────────────── */

const worker = readFileSync(path.join(__dirname, '..', 'social-worker.ts'), 'utf8');

/*
 * THE LINE THAT PRODUCED "0 הגיבו היום · 879 בתור". It was
 * `.order('published_at')` — ascending, the default — with limit 5.
 */
is(
  /\.order\('published_at', \{ ascending: !newest, nullsFirst: false \}\)/.test(worker),
  true,
  'the candidate read can be taken from either end of the queue',
);
is(
  /const fresh = await pending\(true, true\);[\s\S]{0,240}?const oldest = fresh\.error \? fresh : await pending\(true, false\);/.test(worker),
  true,
  "and is taken from BOTH on every pass, newest first — today's posts are not eight hundred rows behind the window",
);
is(
  /dedupeById\(\[\.\.\.\(fresh\.data \?\? \[\]\), \.\.\.\(oldest\.data \?\? \[\]\)\]\)/.test(worker),
  true,
  'and no row is offered to the claim twice in one pass',
);
/*
 * THE CLAIM IS STILL A COMPARE-AND-SET, which is what actually makes a second
 * comment under one post impossible. Reordering a SELECT cannot defeat it, and
 * this pin says so out loud: if the `.eq('comment_status', 'pending')` ever
 * leaves that UPDATE, the read above stops being safe to widen.
 */
is(/\.eq\('comment_status', 'pending'\)\s*\n\s*\.select\('id'\)/.test(worker), true, 'the claim only matches a row that is still pending');

/*
 * AND THE DOOR WAS NOT WIDENED TO BUY THIS. The owner's words: "מאד חשוב לא
 * לגעת כלום חוץ מזה הפרסום של הפוסטים והתזמון סוף סוף מושלם". The throughput
 * fix must not have paid for itself with the publishing window.
 */
is(/\{ run: runCampaignComments, needs: CHORE_NEEDS_MS\.commentKnown \}/.test(worker), true, 'the comment chore still asks for the cheap budget, not a wider one');
const choreWindow = readFileSync(path.join(__dirname, '..', 'chore-window.ts'), 'utf8');
is(/commentKnown: 45_000,/.test(choreWindow), true, 'and the cheap budget itself did not move');
is(/commentHunt: 240_000,/.test(choreWindow), true, 'nor the expensive one');
is(
  /const holdingForGap = Boolean\(due\?\.length\) && !gate\.open && gate\.waitMs > PREP_LEAD_MS;/.test(worker),
  true,
  'and the condition that lets a chore run at all is byte-identical',
);

/* ─────────────────────── the de-dupe, as a rule ────────────────────────── */

const dedupe = <T extends { id: string }>(rows: T[]): T[] => {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
};
is(dedupe([{ id: 'a' }, { id: 'b' }, { id: 'a' }]).map((r) => r.id), ['a', 'b'], 'a row reachable from both ends is offered once, and keeps its place');

console.log(`comment reach + address tests OK — ${checks} assertions`);
