/*
 * THE 139 PARKED PUBLICATIONS, AND THE SIX WAYS THE FIRST FIX WOULD HAVE
 * PUBLISHED THEM TWICE.
 *
 * 03/11, from the owner's own database: worker@stas published 136 posts and
 * then stopped at 09:22. Everything after that reached the group, clicked
 * "פרסום", and the dialog never closed — 139 rows parked at needs_attention /
 * step 'submitted', which the worker refuses to retry because the post may be
 * live and a retry would post it twice in a real group under his own account.
 *
 * The first version of verify-submitted.ts had a third verdict, 'absent',
 * which put such a row back on the queue. An adversarial review found six
 * independent routes by which a plainly live post would reach it — and the
 * worst was not an edge case but a certainty: a campaign with חזרה יומית puts
 * the same words in a group every day, so matchPosts, which deliberately
 * refuses to choose between two posts that fit the same text, can never match
 * any of them. Every one of those rows would have been republished.
 *
 * So 'absent' is gone. This module now decides one thing — is our post
 * positively, textually ON the page — and writes nothing in every other case.
 * The suite below is mostly about that: the cases that USED to requeue and
 * now must not.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MIN_EVIDENCE_LETTERS,
  VERIFY_AFTER_MS,
  decideSubmitted,
  provableText,
  ripeForVerify,
  textAgrees,
  verdictTally,
  type SubmittedRow,
  type Verdict,
} from '../verify-submitted';
import type { GroupPostsRead } from '../facebook/postIndex';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.equal(a, b, msg); };

/* The owner's real post text, well over the evidence bar. */
const REAL = 'מחפשים אוכל טוב בבאר שבע? פתחנו משאית אוכל חדשה ליד הקניון, בואו לטעום ותגידו לנו מה דעתכם';
const OTHER = 'דירת 4 חדרים להשכרה בשכונה ו, משופצת, כניסה מיידית, לפרטים התקשרו בשעות הערב';
const SHORT = 'בואו 🔥';
const EMOJI = '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥';

const rows = (...texts: string[]): SubmittedRow[] => texts.map((text, i) => ({ id: `r${i}`, text }));
const url = (i: number) => `https://www.facebook.com/groups/1/posts/${i}/`;
const ok = (...texts: string[]): GroupPostsRead => ({
  ok: true,
  posts: texts.map((text, i) => ({ url: url(i), text })),
});
/* No verdict in the new design may ever requeue anything. */
const never = (out: Verdict[], msg: string) =>
  is(out.every((v) => v.outcome === 'live' || v.outcome === 'unknown'), msg);

// ══════════ 1. THE VERDICT THAT PUBLISHED TWICE NO LONGER EXISTS ═══════════
{
  const all: Verdict[] = [
    ...decideSubmitted(rows(REAL), { ok: false, why: 'blocked' }, {}),
    ...decideSubmitted(rows(REAL), { ok: true, posts: [] }, {}),
    ...decideSubmitted(rows(REAL), ok(OTHER), {}),
    ...decideSubmitted(rows(SHORT), ok(REAL), { r0: url(0) }),
  ];
  never(all, 'NOTHING this module can return puts a row back on the queue');
  is(!JSON.stringify(all).includes('absent'), "and the word 'absent' is not in any verdict");
}

// ══════════ 2. An unreadable page decides nothing ══════════════════════════
for (const why of ['no-author', 'navigation', 'blocked'] as const) {
  const out = decideSubmitted(rows(REAL, REAL), { ok: false, why }, {});
  eq(out.length, 2, `${why}: every row still gets a verdict`);
  is(out.every((v) => v.outcome === 'unknown' && v.why === 'unreadable'), `${why}: and it is "we do not know"`);
}

// ══════════ 3. THE FINDING THAT KILLED THE FIRST DESIGN ════════════════════
/*
 * ok:true means page.goto resolved and classifyPage saw no login form. It is
 * NOT a statement that the author feed rendered: a cold profile, a slow
 * response, or an interstitial served after the classification all produce
 * {ok:true, posts:[]}. The first version called that "absent" and would have
 * republished every parked row in the group.
 */
{
  const out = decideSubmitted(rows(REAL, REAL, REAL), { ok: true, posts: [] }, {});
  is(out.every((v) => v.outcome === 'unknown' && v.why === 'not-found'),
    'a page that came back empty is NOT evidence of absence — it may simply not have rendered');
  never(out, 'and above all it does not requeue three live posts');
}

// ══════════ 4. The repeat campaign — the certainty, not the race ═══════════
/*
 * חזרה יומית puts identical text in the group every day. matchPosts finds
 * seven candidates, refuses to choose ("picking either is a coin toss"), and
 * returns nothing for the row. The old code read that silence as absence.
 */
{
  const week = ok(REAL, REAL, REAL, REAL, REAL, REAL, REAL);
  const out = decideSubmitted(rows(REAL), week, {});
  eq(out[0].outcome, 'unknown', 'seven identical posts of ours: unmatched is not missing');
  eq(out[0].outcome === 'unknown' && out[0].why, 'not-found', 'and it says so plainly');
  never(out, 'the 8th copy is never published');
}

// ══════════ 5. A match must be a TEXT match, not a positional one ══════════
/*
 * matchPosts' last rule pairs one leftover row with one leftover post by
 * position, with no text agreement at all. Correct for saving an address;
 * nowhere near enough to call a row published.
 */
{
  const out = decideSubmitted(rows(REAL), ok(OTHER), { r0: url(0) });
  eq(out[0].outcome, 'unknown', "a positional pairing with somebody else's text is not our post");
  eq(out[0].outcome === 'unknown' && out[0].why, 'not-found', 'and it is not treated as proof of anything');
}
{
  const out = decideSubmitted(rows(SHORT), ok(REAL), { r0: url(0) });
  eq(out[0].outcome, 'unknown', 'a two-word caption paired by position never becomes a publication');
  eq(out[0].outcome === 'unknown' && out[0].why, 'no-evidence', 'the evidence bar is checked before the match');
}
is(!textAgrees(REAL, OTHER), 'two unrelated posts do not agree');
is(!textAgrees(SHORT, SHORT), 'and a short string agrees with nothing, including itself');
is(textAgrees(REAL, REAL + ' עוד…'), "Facebook's truncated copy still agrees with ours");
is(textAgrees(REAL, REAL.replace(/[,?]/g, '')), 'punctuation does not break the agreement');

// ══════════ 6. And when it really is there, say so ═════════════════════════
{
  const out = decideSubmitted(rows(REAL), ok(REAL), { r0: url(0) });
  eq(out[0].outcome, 'live', 'our words, on the page, at that address — that is a publication');
  eq(out[0].outcome === 'live' && out[0].url, url(0), 'and it carries the address');
}
{
  /* Two different posts of ours, each matched to its own. */
  const out = decideSubmitted(rows(REAL, OTHER), ok(REAL, OTHER), { r0: url(0), r1: url(1) });
  is(out.every((v) => v.outcome === 'live'), 'two distinct posts resolve independently');
}

// ══════════ 7. Text that cannot identify a post at all ═════════════════════
for (const [label, text] of [['short', SHORT], ['emoji only', EMOJI], ['empty', '']] as const) {
  const out = decideSubmitted(rows(text), ok(OTHER), {});
  eq(out[0].outcome === 'unknown' && out[0].why, 'no-evidence', `${label}: left alone`);
}
is(!provableText(SHORT), 'a two-word caption is not evidence');
is(!provableText(EMOJI), 'emoji vanish in normalisation, so an emoji wall is not evidence');
is(provableText(REAL), "the owner's real post text is");
is(MIN_EVIDENCE_LETTERS > 12, 'the bar here is higher than the one matchPosts matches on');

// ══════════ 8. Facebook is allowed to lag ══════════════════════════════════
{
  const now = Date.parse('2026-11-03T17:30:00.000Z');
  const minutes = (n: number) => new Date(now - n * 60_000).toISOString();
  is(!ripeForVerify(minutes(0), now), 'a row parked this second is not looked at');
  is(!ripeForVerify(minutes(9), now), 'nor one parked nine minutes ago');
  is(ripeForVerify(minutes(11), now), 'eleven minutes is enough for the author page to catch up');
  is(!ripeForVerify(null, now), 'a row with no timestamp is never looked at');
  is(!ripeForVerify('not a date', now), 'and neither is one with a broken timestamp');
  eq(VERIFY_AFTER_MS, 10 * 60_000, 'ten minutes, and changing it is a decision not a typo');
}

// ══════════ 9. The tally ═══════════════════════════════════════════════════
{
  const out = decideSubmitted(rows(REAL, OTHER, SHORT), ok(REAL), { r0: url(0) });
  const t = verdictTally(out);
  eq(t.live, 1, 'one identified');
  eq(t.unknown, 2, 'two left for a human');
  is(!('absent' in t), 'the tally has no requeue column, because there is no requeue');
}

// ══════ 10. THE SOURCE PINS — the guards that vanish without a sound ═══════
const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
const sweep = worker.slice(worker.indexOf('async function verifySubmitted'));
const body = sweep.slice(0, sweep.indexOf('\nconst COMMENTS_PER_TICK'));
is(body.length > 500, 'found the sweep body to pin');

/* THE ONE THAT MATTERS MOST. Re-introducing a requeue here is the whole of
   the duplicate risk, and it would compile and pass everything else. */
is(!body.includes("status: 'scheduled'"), 'THE SWEEP NEVER PUTS A ROW BACK ON THE QUEUE — six duplicate routes live behind this line');
is(!body.includes("step: 'pending'"), 'nor resets a row to pending');
is(!body.includes('scheduled_at:'), 'nor touches scheduled_at, which is queue order');
eq((body.match(/\.update\(\{/g) ?? []).length, 1, 'exactly ONE write, and it marks a row published');

/* ourPostsInGroup flattens a login wall and an empty group into the same []. */
is(body.includes('readOurPostsInGroup'), 'the sweep reads the page with the variant that reports failure');
is(!/[^d]ourPostsInGroup\(/.test(body), 'and never with the one that cannot tell a wall from an empty group');

/* The read is scoped like every other queue read in the worker. */
is(body.includes('queueScope(state)'), 'the parked rows are read under this account only');
is(body.includes('account_id.eq.'), 'with the same filter the due query uses');
is(body.includes("social_targets!inner"), 'and an inner join, so the filter can bite');

/* The write re-states the state it was decided on, and is measured. */
is(body.includes(".eq('status', 'needs_attention')"), 'the write only touches a row still parked');
is(body.includes(".eq('step', 'submitted')"), "and still at 'submitted' — the owner may have pressed נסה שוב meanwhile");
eq((body.match(/await applied\(/g) ?? []).length, 1, 'the write is measured, never assumed');

/* published_at is the click, and claimed_at is the only column that holds it:
   a trigger moves updated_at on every write, including other sweeps'. */
is(body.includes('row.published_at || row.claimed_at'), 'a recovered publication is stamped from claimed_at, not from the last write to the row');
is(!/published_at: row\.updated_at/.test(body), 'updated_at alone is never the publication time');

/* A success must not arrive wearing a red error sentence. */
is(body.includes('error: null'), 'a verified row carries no error text — ErrorDetail prints that column verbatim');

/* The group latch re-arms, or a blocked group is dead for the process. */
is(body.includes('VERIFY_GROUP_AGAIN_MS'), 'a group that could not be read comes back round');
is(body.includes('ripeForVerify'), 'and rows are only looked at once Facebook has had time');

console.log(`verify-submitted OK — ${checks} checks`);
