/*
 * THE 139 PARKED PUBLICATIONS, AS A TEST.
 *
 * 03/11, from the owner's own database: worker@stas published 136 posts and
 * then stopped at 09:22. Everything after that reached the group, clicked
 * "פרסום", and the dialog never closed — 139 rows parked at needs_attention /
 * step 'submitted', which the worker refuses to retry because the post may be
 * live and a retry would post it twice in a real group under his own account.
 *
 * verify-submitted.ts goes and looks instead. Every case below is about the
 * one thing that can go wrong with that: saying "it is not there" when it is.
 *
 *   wrong "live"    → one post silently never goes out.
 *   wrong "absent"  → the same post, twice, in a real group, forever.
 *
 * So the suite is weighted the way the damage is. Most of it is about the
 * ways 'absent' must NOT be reachable.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MIN_EVIDENCE_LETTERS,
  VERIFY_AFTER_MS,
  decideSubmitted,
  provableText,
  ripeForVerify,
  verdictTally,
  type SubmittedRow,
} from '../verify-submitted';
import type { GroupPostsRead } from '../facebook/postIndex';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.equal(a, b, msg); };

/* The owner's real post text, long enough to be evidence of its own absence. */
const REAL = 'מחפשים אוכל טוב בבאר שבע? פתחנו משאית אוכל חדשה ליד הקניון, בואו לטעום ותגידו לנו מה דעתכם';
const SHORT = 'בואו 🔥';
const EMOJI = '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥';

const rows = (...texts: string[]): SubmittedRow[] => texts.map((text, i) => ({ id: `r${i}`, text }));
const ok = (...texts: string[]): GroupPostsRead => ({
  ok: true,
  posts: texts.map((text, i) => ({ url: `https://www.facebook.com/groups/1/posts/${i}/`, text })),
});

// ─────────────── 1. An unreadable page can NEVER say "absent" ───────────────
/*
 * This is the single line the whole feature's safety rests on. postIndex's
 * ourPostsInGroup flattens "login wall" and "no posts here" into the same
 * empty list; a decision taken on that would retry a live post.
 */
for (const why of ['no-author', 'navigation', 'blocked'] as const) {
  const out = decideSubmitted(rows(REAL, REAL), { ok: false, why }, {});
  eq(out.length, 2, `${why}: every row gets a verdict`);
  is(out.every((v) => v.outcome === 'unknown'), `${why}: nothing is decided on a page that was not read`);
  is(out.every((v) => v.outcome === 'unknown' && v.why === 'unreadable'), `${why}: and it says why`);
  is(!out.some((v) => v.outcome === 'absent'), `${why}: ABSENT IS UNREACHABLE — this is the duplicate guard`);
}

// ─────────────────────── 2. Found means found ───────────────────────────────
{
  const out = decideSubmitted(rows(REAL), ok(REAL), { r0: 'https://www.facebook.com/groups/1/posts/0/' });
  eq(out[0].outcome, 'live', 'a matched row is a publication, not a failure');
  eq(out[0].outcome === 'live' && out[0].url, 'https://www.facebook.com/groups/1/posts/0/', 'and it carries the address');
}

// ───────────────── 3. Absent, only with real evidence ───────────────────────
{
  const out = decideSubmitted(rows(REAL), ok('משהו אחר לגמרי שפורסם בקבוצה הזאת לפני שבוע ואין לו שום קשר'), {});
  eq(out[0].outcome, 'absent', 'page read, text long, no match — the post is genuinely not there');
}
{
  /* The page read fine and holds nothing of ours. That is still an answer. */
  const out = decideSubmitted(rows(REAL), { ok: true, posts: [] }, {});
  eq(out[0].outcome, 'absent', 'an EMPTY page that was genuinely read is evidence; an unread one is not');
}

// ─────────── 4. Text that cannot prove its own absence stays parked ─────────
for (const [label, text] of [['short', SHORT], ['emoji only', EMOJI], ['empty', '']] as const) {
  const out = decideSubmitted(rows(text), ok('משהו אחר'), {});
  eq(out[0].outcome, 'unknown', `${label}: never requeued — its absence proves nothing`);
  eq(out[0].outcome === 'unknown' && out[0].why, 'no-evidence', `${label}: and it says why`);
}
is(!provableText(SHORT), 'a two-word caption is not evidence');
is(!provableText(EMOJI), 'emoji vanish in normalisation, so an emoji wall is not evidence');
is(provableText(REAL), "the owner's real post text is");
is(MIN_EVIDENCE_LETTERS > 12, 'the bar to declare ABSENCE is higher than the bar matchPosts uses to MATCH');

// ───────────────────── 5. Facebook is allowed to lag ────────────────────────
{
  const now = Date.parse('2026-11-03T17:30:00.000Z');
  const minutes = (n: number) => new Date(now - n * 60_000).toISOString();
  is(!ripeForVerify(minutes(0), now), 'a row parked this second is not verified');
  is(!ripeForVerify(minutes(9), now), 'nor one parked nine minutes ago');
  is(ripeForVerify(minutes(11), now), 'eleven minutes is enough for the author page to catch up');
  is(ripeForVerify(minutes(600), now), 'and the real ones had been parked for hours');
  is(!ripeForVerify(null, now), 'a row with no timestamp is never verified');
  is(!ripeForVerify('not a date', now), 'and neither is one with a broken timestamp');
  eq(VERIFY_AFTER_MS, 10 * 60_000, 'ten minutes, and changing it is a decision not a typo');
}

// ─────────────────────────── 6. The tally ───────────────────────────────────
{
  const out = decideSubmitted(
    rows(REAL, REAL + ' שונה', SHORT),
    ok(REAL),
    { r0: 'https://www.facebook.com/groups/1/posts/0/' },
  );
  const t = verdictTally(out);
  eq(t.live, 1, 'one found');
  eq(t.absent, 1, 'one genuinely missing');
  eq(t.unknown, 1, 'one undecidable');
}

// ────────── 7. THE SOURCE PINS — the guards that silently vanish ────────────
const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
const sweep = worker.slice(worker.indexOf('async function verifySubmitted'));
const body = sweep.slice(0, sweep.indexOf('\nconst COMMENTS_PER_TICK'));
is(body.length > 500, 'found the sweep body to pin');

/*
 * The one that matters most. ourPostsInGroup returns [] for a login wall AND
 * for an empty group; swapping it back in here would compile, pass every
 * other test, and quietly start posting duplicates in production.
 */
is(body.includes('readOurPostsInGroup'), 'the sweep reads the page with the variant that reports failure');
is(!/[^d]ourPostsInGroup\(/.test(body), 'and never with the one that flattens a login wall into "no posts here"');

/* Both writes must re-state the state they were decided on: between the read
   and the write the owner may have pressed "נסה שוב" on that very row. */
const writes = body.split('.update({').slice(1);
eq(writes.length, 2, 'exactly two writes: mark published, and put back on the queue');
for (const [i, w] of writes.entries()) {
  const upTo = w.slice(0, w.indexOf('applied') >= 0 ? w.indexOf('applied') : 1200);
  is(upTo.includes(".eq('status', 'needs_attention')"), `write ${i + 1} only touches a row still parked`);
  is(upTo.includes(".eq('step', 'submitted')"), `write ${i + 1} only touches a row still at 'submitted'`);
}

/* Both go through applied(): a refused write must not be logged as a success.
   This is the lesson of AUDIT-silent-writes.md, and it cost a night. */
eq((body.match(/await applied\(/g) ?? []).length, 2, 'both writes are measured, never assumed');

/* published_at is the click, not the check: the spacing gate reads it. */
is(body.includes('row.published_at || row.updated_at'), 'a recovered publication is stamped when it went live, not when we looked');
is(!/published_at: new Date\(\)\.toISOString\(\),/.test(body.split('row.published_at')[0]), 'and "now" is only the last-resort fallback');

/* Ripeness is applied to the rows, not merely exported. */
is(body.includes('ripeForVerify'), 'the sweep filters by ripeness');

console.log(`verify-submitted OK — ${checks} checks`);
