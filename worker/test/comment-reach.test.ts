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

/* ───────────────── THE THIRD RULE: WHICH ROWS GET ASKED AT ALL ──────────
 *
 * "שאני רוצה להוסיף תגובה מהירה הוא לא נותן להוסיף תגובה לא רק לפוסט שבחרתי
 *  אלא ל-224 פרסומים."
 *
 * REACH decides what the worker may look at and ADDRESS decides what it finds
 * there. Both were downstream of this one, which nobody had written down: the
 * write that marks rows `pending` matched `campaign_id = X and status =
 * 'published'` with no date bound and no round bound, so one press asked for a
 * comment under every post the round had published SINCE THE DAY IT WAS
 * CREATED — 224 of them on his account, the oldest weeks old, each one going
 * out under his own name into a real group.
 *
 * It was not a slip. The sheet's title said "לכל הפרסומים בסבב" and the number
 * beside it was the round's lifetime count, so the code, the title and the
 * number all agreed with each other and all three were wrong about what he
 * meant. The card he pressed it from said "132 קבוצות" — a third quantity
 * again, distinct groups — and nothing on screen named the set.
 *
 * So the rule now has a name and a shape: ONE RUN, resolved before the write,
 * shown as a number, and handed back to the write so the two cannot drift.
 */
const client = readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'social', 'client.ts'), 'utf8');
const queueFn = client.slice(client.indexOf('export async function queueCampaignComment'));
const queueBody = queueFn.slice(0, queueFn.indexOf('\n}'));

is(/export async function queueCampaignComment\(\s*scope: LastRunScope,/.test(client), true, 'the write takes the RESOLVED run, not a bare campaign id — a caller cannot forget to narrow it');
/*
 * THE BLAST RADIUS IS A LIST OF IDS, and that is not a detail of style.
 *
 * The first version of this fix filtered the UPDATE by a scheduled_at window
 * plus `.eq('round_at', …)`, and worker/test/performance.test.ts refused it:
 * PostgREST rejects a whole statement that names a column the database does
 * not have, so on any database that has not run social-latest.sql the button
 * would have died. A read can be run again without the column; an update
 * cannot be run again without its own predicate.
 *
 * Ids avoid that, and they buy the stronger property as well — the rows
 * counted for the sheet and the rows written are the SAME rows, not two
 * queries that happen to agree.
 */
is(/\.in\('id', scope\.ids\.slice\(at, at \+ 100\)\)/.test(queueBody), true, 'the write touches the ids the scope resolved, in batches of a hundred');
is(/if \(!scope\.ids\.length\) return 0;/.test(queueBody), true, 'and an empty run writes nothing rather than falling through to a filterless update');
is(/\.eq\('status', 'published'\)/.test(queueBody), true, 'still only rows that actually went out');
is(/\.neq\('comment_status', 'commenting'\)/.test(queueBody), true, "and still never the row the worker is holding — that guard is older than this one and outranks it");
/* The FILTERS, not the prose: the note above this write explains what naming
   the column would cost, and a test a comment can break is a test that gets
   deleted. */
is(
  /\.(eq|neq|gt|gte|lt|lte|in|is|order)\(\s*'round_at'/.test(queueBody),
  false,
  'the write filters on round_at: a statement naming a column an old database lacks is refused whole, with nothing to fall back to',
);

const scopeFn = client.slice(client.indexOf('export async function lastRunScope'));
const scopeBody = scopeFn.slice(0, scopeFn.indexOf('\n}\n'));
is(/\.order\('published_at', \{ ascending: false, nullsFirst: false \}\)/.test(scopeBody), true, 'the run is found from the NEWEST publication — ordering by scheduled_at would pick a row due later today that has not published at all');
/*
 * THE DAY COMES FROM `published_at`, AND THE FIRST VERSION HAD IT WRONG.
 *
 * It keyed the run on the local day of `scheduled_at`, so that a run starting
 * at 23:50 and ending after midnight stayed one run. The reasoning was fine
 * and the column is not: the worker rewrites `scheduled_at` on every deferral
 * and rules.ts parks a row at the next day when a daily cap is hit, so a
 * deferred row of this run had moved OUT of its own run's window and a row
 * deferred in from yesterday had moved IN. campaign.ts says the same of
 * guessing a round from the clock — "a deferred row has moved".
 *
 * `published_at` is written once and never again, and it is the unit the card
 * he presses already uses.
 */
is(/zonedDateISO\(new Date\(row\.published_at\)\)/.test(scopeBody), true, "the run's day is the day it PUBLISHED, read off a column nothing rewrites");
/* The USES, not the prose: the note above says at length why the column was
   abandoned, and a test a comment can break is a test that gets deleted. */
is(
  /row\.scheduled_at|\.(gte|gt|lt|lte|eq|order)\(\s*'scheduled_at'/.test(scopeBody),
  false,
  'scheduled_at is still used to identify a run — four writers move it after planning, so a deferred row leaves its own run',
);
is(/zonedToUtc\(dayISO, '00:00'\)/.test(scopeBody) && /zonedToUtc\(addDaysISO\(dayISO, 1\), '00:00'\)/.test(scopeBody), true, 'both edges through time.ts, so the two days a year that are not 24 hours long cannot move them');
is(/count: ids\.length/.test(scopeBody), true, 'the number the sheet shows IS the length of the list the write will touch — one source, so they cannot disagree');
/*
 * AND IT IS PAGED AT THE SERVER'S CEILING, NOT ABOVE IT. The first version
 * asked for 5000 rows; PostgREST's db-max-rows is 1000 on Supabase, so it
 * would have been handed 1000, counted them, and printed a ceiling as a fact
 * while commenting on a run's first thousand posts only. The same trap this
 * file's CAMPAIGN_ROLLUP_LIMIT note describes in full.
 */
is(/const RUN_PAGE = 1000;/.test(client), true, 'the run is read a page at a time, at the server ceiling and not above it');
is(/\.range\(at, at \+ RUN_PAGE - 1\)/.test(scopeBody), true, 'by range, so a run longer than one page is still read whole');
is(/if \(rows\.length < RUN_PAGE\) break;/.test(scopeBody), true, 'and it stops on the first short page rather than guessing the end');
is(/truncated = true;/.test(scopeBody), true, 'a run past even the page ceiling marks itself truncated rather than reporting a floor as a total');
/*
 * AND IT SURVIVES A DATABASE THAT HAS NOT RUN social-latest.sql. Both reads
 * name round_at and both are allowed to fail back to a select without it,
 * where every row has no round and the whole day folds into one run — the
 * right answer on exactly those rows, and the fold progressByRound() already
 * performs under the '' key.
 */
is((scopeBody.match(/ROUND_COLUMN_MISSING\.test\(/g) ?? []).length >= 2, true, 'both reads fall back when the column is absent');
is(
  /if \(\(typeof r\.round_at === 'string' \? r\.round_at : ''\) === roundAt\) ids\.push\(r\.id\);/.test(scopeBody),
  true,
  'the run is picked out of the day in JS, where a missing column is undefined rather than an error',
);

/*
 * AND EVERY SCREEN ASKS THE SAME QUESTION. Three open this sheet, and before
 * this each computed its own number — everPublished, everPublished again, and
 * `published.length`. Three answers to one question is how a sheet comes to
 * promise one set of posts and write to another.
 */
for (const screen of [
  ['src/app/social/page.tsx', 'the dashboard'],
  ['src/app/social/campaigns/page.tsx', 'the rounds list'],
  ['src/app/social/campaigns/[id]/page.tsx', "the round's own screen"],
] as const) {
  const src = readFileSync(path.join(__dirname, '..', '..', ...screen[0].split('/')), 'utf8');
  is(/const \{ scope: commentScope, failed: commentFailed \} = useLastRunScope\(/.test(src), true, `${screen[1]} reads the run through the one hook`);
  is(/queueCampaignComment\(commentScope,/.test(src), true, `${screen[1]} writes to the run it showed`);
  is(/if \(!commentScope\) return/.test(src), true, `${screen[1]} cannot submit before the run is known — a bare id would widen the write back to the whole round`);
  is(
    /publishedCount=\{commentScope === undefined \? null : \(commentScope\?\.count \?\? 0\)\}/.test(src),
    true,
    `${screen[1]} shows the run's own count, and tells "still reading" apart from "nothing published"`,
  );
  /* A REFUSAL IS NOT AN EMPTINESS. Both used to land on null, and the sheet
     then said "בסבב הזה עוד לא יצא אף פרסום" over a round that had published
     all morning, on any RLS refusal or offline phone. */
  is(/failed=\{commentFailed\}/.test(src), true, `${screen[1]} tells the sheet when the read FAILED, rather than drawing it as "nothing published"`);
  is(/atLeast=\{!!commentScope\?\.truncated\}/.test(src), true, `${screen[1]} passes the truncation flag, so a floor is never printed as a total`);
  is(/runLabel=\{runLabelOf\(commentScope\)\}/.test(src), true, `${screen[1]} names the run beside the number, so it can be checked against the card it was pressed from`);
  /* The PROP, not the file: two of these screens explain in a comment what
     `everPublished` used to be doing here, and a test a comment can break is
     a test that gets deleted. */
  is(/publishedCount=\{[^}]*everPublished/.test(src), false, `${screen[1]} no longer feeds the sheet a lifetime count`);
}

console.log(`comment reach + address + scope tests OK — ${checks} assertions`);
