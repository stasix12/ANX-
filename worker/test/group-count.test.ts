/*
 * ─── "478 / 730" OVER "252 קבוצות", AND WHICH OF THEM HE WAS READING ──────
 *
 * WHAT HE SENT, twice, three hours apart:
 *
 *   "סה״כ פורסמו 204 מה זה המספרים האלה 478/730"
 *   "מה עומד מאחורי המספרים האלה 478/730 למה הוא ספר ככה הוא פרסם ל 204
 *    קבוצות בסך הכל"
 *
 * and then what to do about it:
 *
 *   "שיספור רק את הקבוצות שאליהם אמור לצאת הפרסום וכמה פורסם מתוכם, לא צריך
 *    את המספר המנופח הזה זה מבלבל לקוחות."
 *
 * NOTHING ON THAT CARD WAS WRONG. 730 is publications and 252 is groups: a
 * round plans the same group more than once, so the row total is a multiple of
 * the group total. The fault is that the two sat one line apart, in two units,
 * with nothing saying so — and the pair a customer reads a card for ("to how
 * many of my groups did this actually go out?") was on neither line.
 *
 * The numerator did not exist anywhere. v27 put the group TOTAL in the
 * database because a distinct count cannot be derived from a capped preview;
 * it could not put the published-group count there, because a distinct count
 * cannot be summed out of per-status counts either — a group with one
 * published row and one waiting row would be counted twice. So it is v38's
 * own aggregate, and this file is what holds the whole path to it:
 *
 *   §1  the arithmetic and the Hebrew
 *   §2  the two clamps (a ceiling may not be printed as 100%, and the
 *       numerator may not exceed the denominator)
 *   §3  the FLOOR: a database without v38's columns says "לפחות" and says
 *       which file fixes it
 *   §4  absent is not zero — the one that would print "0 מתוך 252" over a
 *       round that published two hundred times
 *   §5  campaignState counts GROUPS off the rows, not rows
 *   §6  and knows when that count is a preview
 *   §7  the read: a missing column may not fail the whole request
 *   §8  the migration: the two columns, at the END of the select, and a
 *       rollback that exists
 *   §9  the two cards, and that they lead with the same pair
 *
 * The SQL in §8 is checked as text here. It was also RUN, in this session,
 * against a real PostgreSQL 16: v27 then v38 (4 groups, 3 published, 2 of
 * them today), v38 twice, the rollback, the rollback twice, v38 again — and
 * the five-column definition on top of v38 fails with "cannot drop columns
 * from view", which is why social-latest.sql carries the seven-column
 * definition in place rather than a block appended after it. Not one queue
 * row changed. worker/test/schema-columns.test.ts is where that runs in CI.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  campaignState,
  groupProgress,
  type CampaignQueueRow,
  type CampaignState,
} from '../../src/lib/social/campaign';
import { EMPTY_PROGRESS } from '../../src/lib/social/types';

let checks = 0;
const is = (cond: boolean, claim: string) => {
  checks += 1;
  assert.ok(cond, claim);
};
const eq = (actual: unknown, expected: unknown, claim: string) => {
  checks += 1;
  assert.deepEqual(actual, expected, `${claim}\n  expected: ${JSON.stringify(expected)}\n  got     : ${JSON.stringify(actual)}`);
};

/** A state carrying only what groupProgress reads. */
const st = (o: Partial<CampaignState>): CampaignState =>
  ({ progress: { ...EMPTY_PROGRESS }, truncated: false, todayOnly: false, targetCount: 0, ...o }) as CampaignState;

/* ─── §1 — the arithmetic and the Hebrew ─────────────────────────────────── */

{
  /* HIS OWN NUMBERS: 730 publications, 252 groups, 204 of them published. */
  const g = groupProgress(st({ targetCount: 252, publishedTargetCount: 204, publishedTargetCountIsWhole: true }));
  eq(g.total, 252, 'the denominator is the groups the round reaches');
  eq(g.published, 204, 'the numerator is the groups that got the post');
  eq(g.waiting, 48, 'and what is left is the difference, not an open-row count');
  eq(g.percent, 81, '204 of 252 is 81%');
  eq(g.label, 'פורסם ל-204 מתוך 252 קבוצות', 'the sentence names the unit, which is the whole point of it');
  eq(g.waitingLabel, '48 קבוצות עוד לא קיבלו פרסום', 'and so does the line under it');
  is(g.usable, 'a card with a real group count draws the group figures');
  is(!g.hedged, 'an exact count is not hedged');
  /* NOT "478" AND NOT "730" ANYWHERE IN IT. This is the assertion the owner
     asked for in so many words. */
  is(!g.label.includes('730') && !g.label.includes('478'), 'the inflated pair is not in the sentence');
  eq(g.ariaLabel, '81% — פורסם ל-204 מתוך 252 קבוצות', 'and a screen reader is told the same thing, not a bare percentage');
}

{
  /* ONE GROUP, AND THE GRAMMAR THAT GOES WITH IT. "פורסם ל-0 מתוך 1 קבוצות"
     is the "לפני 1 שעות" of this card. */
  const none = groupProgress(st({ targetCount: 1, publishedTargetCount: 0, publishedTargetCountIsWhole: true }));
  eq(none.label, 'פורסם ל-0 מתוך 1 קבוצה', 'one group is singular');
  eq(none.waitingLabel, 'קבוצה אחת עוד לא קיבלה פרסום', 'and the verb agrees with it');
  const two = groupProgress(st({ targetCount: 5, publishedTargetCount: 3, publishedTargetCountIsWhole: true }));
  eq(two.waitingLabel, 'שתי קבוצות עוד לא קיבלו פרסום', 'two is its own word in Hebrew');
}

{
  /* THE SCOPE TRAVELS WITH THE NUMBERS. A repeating round's figures are
     TODAY'S, and a true number under a sentence that does not say what it is
     about is the fault this module keeps being fixed for. */
  const today = groupProgress(st({ targetCount: 40, publishedTargetCount: 12, publishedTargetCountIsWhole: true, todayOnly: true }));
  is(today.label.endsWith(' היום'), `a repeating round says its figures are today's — got "${today.label}"`);
  const life = groupProgress(st({ targetCount: 40, publishedTargetCount: 12, publishedTargetCountIsWhole: true, todayOnly: false }));
  is(!life.label.includes('היום'), `and a one-off round does not — got "${life.label}"`);
}

/* ─── §2 — the two clamps ────────────────────────────────────────────────── */

{
  /* 251 of 252 IS NOT 100%. Rounding is a second way to print a number that is
     not true, and this card's percentage is read as "is it finished". */
  const almost = groupProgress(st({ targetCount: 252, publishedTargetCount: 251, publishedTargetCountIsWhole: true }));
  eq(almost.percent, 99, '251 of 252 rounds to 100 and must print 99');
  const all = groupProgress(st({ targetCount: 252, publishedTargetCount: 252, publishedTargetCountIsWhole: true }));
  eq(all.percent, 100, 'and 100 is reserved for the exact count');
  eq(all.waitingLabel, '', 'with nothing left, nothing is said about what is left');
}

{
  /*
   * THE NUMERATOR MAY NOT EXCEED THE DENOMINATOR, and this is not theoretical:
   * the hero is handed `targetCount` as a prop from the dashboard's own read
   * and the published count off the state, so two reads a few seconds apart
   * can disagree. "פורסם ל-260 מתוך 252 קבוצות" makes every other number on
   * the card suspect.
   */
  const over = groupProgress(st({ targetCount: 252, publishedTargetCount: 260, publishedTargetCountIsWhole: true }));
  eq(over.published, 252, 'a numerator larger than the denominator is clamped to it');
  /* AND NOT PRINTED AS A FACT. Clamping hides the disagreement; it does not
     resolve it, so the pair is hedged and stops at 99. See §6d. */
  eq(over.percent, 99, 'the percentage does not go past 100, and does not claim completion either');
  eq(over.waiting, 0, 'and nothing is reported as left over');
  const negative = groupProgress(st({ targetCount: 10, publishedTargetCount: -3, publishedTargetCountIsWhole: true }));
  eq(negative.published, 0, 'and a negative count cannot draw a backwards bar');
}

/* ─── §3 — the floor, and the sentence that says which file fixes it ─────── */

{
  const floor = groupProgress(st({ targetCount: 252, publishedTargetCount: 61, publishedTargetCountIsWhole: false }));
  is(floor.hedged, 'a count taken off a preview is hedged');
  eq(floor.label, 'פורסם לפחות ל-61 מתוך 252 קבוצות', 'and the hedge goes between the verb and the preposition');
  is(!floor.label.includes('ל-לפחות'), '"פורסם ל-לפחות 61" is not a sentence');
  const ceiling = groupProgress(st({ targetCount: 252, publishedTargetCount: 252, publishedTargetCountIsWhole: false }));
  eq(ceiling.percent, 99, 'a floor may never be printed as 100% — that is a ceiling drawn as a total');
  /* AND `truncated` STILL HEDGES IT. The two reasons are independent: the rows
     were cut, or the column is missing. Either one makes the figure a floor. */
  const cut = groupProgress(st({ targetCount: 252, publishedTargetCount: 204, publishedTargetCountIsWhole: true, truncated: true }));
  is(cut.hedged, 'a cut read hedges the group figure too');
}

/* ─── §4 — absent is not zero ────────────────────────────────────────────── */

{
  /*
   * THE ONE THAT WOULD HAVE SHIPPED A WRONG CARD. A pre-v38 database answers
   * the column with nothing; a `?? 0` anywhere on that path prints "פורסם ל-0
   * מתוך 252 קבוצות" over a round that has published two hundred times — a
   * card that is worse than the one being replaced, and green in every test
   * that only checks the arithmetic.
   */
  const unknown = groupProgress(st({ targetCount: 252 }));
  is(!unknown.usable, 'with no published-group count there are no group figures to draw');
  is(unknown.hedged, 'and whatever a caller does with it, it is not exact');
  eq(unknown.label, 'פורסם לפחות ל-0 מתוך 252 קבוצות', 'the sentence it WOULD draw is exactly why `usable` exists — no card may render it');
  /* And a round with no groups at all draws nothing rather than "0 מתוך 0". */
  const empty = groupProgress(st({ targetCount: 0, publishedTargetCount: 0, publishedTargetCountIsWhole: true }));
  is(!empty.usable, 'a round with no groups counted has no group sentence');
  eq(empty.label, '', 'and says nothing rather than "0 מתוך 0"');
}

/* ─── §5 — campaignState counts GROUPS, not rows ─────────────────────────── */

const row = (target: string, status: string, published = false): CampaignQueueRow =>
  ({
    id: `${target}-${status}-${Math.random().toString(36).slice(2, 8)}`,
    status,
    scheduled_at: '2026-11-05T08:00:00.000Z',
    published_at: published ? '2026-11-05T08:01:00.000Z' : null,
    target_id: target,
    post_id: 'p1',
    round_at: null,
  }) as unknown as CampaignQueueRow;

{
  /*
   * HIS SHAPE IN MINIATURE: three groups, nine rows. Group A published twice,
   * group B published once and failed once, group C only ever failed.
   *
   *   rows published : 3        ← what the card used to count
   *   groups reached : 3
   *   groups with it : 2        ← what he asked for
   */
  const rows = [
    row('a', 'published', true),
    row('a', 'published', true),
    row('a', 'scheduled'),
    row('b', 'published', true),
    row('b', 'failed'),
    row('c', 'failed'),
    row('c', 'skipped'),
    row('c', 'scheduled'),
    row('c', 'scheduled'),
  ];
  const s = campaignState(rows);
  eq(s.progress.published, 3, 'three rows published');
  eq(s.targetCount, 3, 'across three groups');
  eq(s.publishedTargetCount, 2, 'but only two groups have the post — a group is counted once however many rows it holds');
  is(s.publishedTargetCountIsWhole === true, 'rows that are all there give an exact group count');
  const g = groupProgress(s);
  eq(g.label, 'פורסם ל-2 מתוך 3 קבוצות', 'and that is what the card says');

  /* A ROW WITH A TIMESTAMP THAT ENDED SOME OTHER WAY IS NOT A PUBLICATION.
     status is what every other figure in the app counts success by, and
     maybe-live rows carry a published_at without having published. */
  const lying = campaignState([row('a', 'skipped', true), row('b', 'published', true)]);
  eq(lying.publishedTargetCount, 1, 'a skipped row with a published_at is not a group that got the post');
}

/* ─── §6 — and knows when that count came off a preview ──────────────────── */

{
  const rows = [row('a', 'published', true), row('b', 'published', true)];
  /*
   * ─── THE ONE THAT SHIPPED, AND WHAT IT PRINTED ──────────────────────────
   *
   * The first version of campaignState() read
   *
   *     opts.counts?.publishedTargetCount ?? <distinct over rows>
   *
   * With the counting views present and v38's column absent — every database
   * until social-latest.sql is run again — `rows` is a PREVIEW, and for a
   * round whose publications are all older than that preview it is EMPTY.
   * Run against the real function with the owner's own numbers, the hero
   * rendered:
   *
   *     "פורסם לפחות ל-0 מתוך 252 קבוצות היום · 252 קבוצות עוד לא קיבלו פרסום"
   *
   * for a round that had reached 204 groups. "לפחות" does not make a floor of
   * zero honest, and understating by two hundred is worse than the row ratio
   * it replaced. An adversarial review of the change found it; this is the
   * reproduction, and it runs on every suite from now on.
   */
  const noColumn = campaignState([] as CampaignQueueRow[], null, {
    truncated: false,
    todayOnly: true,
    counts: {
      progress: { published: 204, scheduled: 48, skipped: 274, failed: 3 },
      everPublished: 204,
      targetCount: 252,
      publishedTargetCount: null,
    },
  });
  eq(noColumn.publishedTargetCount, undefined, 'a database that cannot answer produces NO figure, not a zero');
  eq(noColumn.publishedTargetCountIsWhole, false, 'and it is certainly not whole');
  const g = groupProgress(noColumn);
  is(!g.usable, 'so the card does not lead with it');
  /*
   * `label` is still COMPUTED — groupProgress writes the sentence for any
   * total — and that is the point of `usable` rather than of an empty string:
   * the guard is at the one place that renders, and §9 pins every card to it.
   * This records what would be on screen without that guard.
   */
  eq(g.label, 'פורסם לפחות ל-0 מתוך 252 קבוצות היום', 'the sentence the guard exists to keep off the screen');
  is(!g.usable, 'and the guard is the only thing standing between it and the card');

  /* THE SAME WITH A PREVIEW THAT HAPPENS TO CARRY A FEW ROWS — a floor of 2
     out of 252 is the same wrong number, just harder to notice. */
  const fewRows = campaignState(rows, null, {
    truncated: false,
    counts: { progress: { published: 204, scheduled: 252, skipped: 271, failed: 3 }, everPublished: 204, targetCount: 252 },
  });
  eq(fewRows.truncated, false, 'exact per-status counts are not truncated');
  eq(fewRows.publishedTargetCount, undefined, 'and a handful of preview rows is still not an answer');
  is(!groupProgress(fewRows).usable, 'the card falls back rather than printing 2 of 252');

  /* WITH v38's COLUMN IT IS THE DATABASE'S OWN ANSWER. */
  const exact = campaignState(rows, null, {
    counts: { progress: { published: 204 }, everPublished: 204, targetCount: 252, publishedTargetCount: 204 },
  });
  eq(exact.publishedTargetCount, 204, "the view's aggregate wins over a preview");
  eq(exact.publishedTargetCountIsWhole, true, 'and it is exact');

  /* AND WHERE THE ROWS REALLY ARE THE WHOLE SET — no counts passed — they
     are counted, because there a set built from them is the answer. */
  const fromRows = campaignState(rows);
  eq(fromRows.publishedTargetCount, 2, 'with no counts the rows are the whole set');
  eq(fromRows.publishedTargetCountIsWhole, true, 'and whole');
  const cut = campaignState(rows, null, { truncated: true });
  eq(cut.publishedTargetCountIsWhole, false, 'unless the read was cut');
}

/* ─── §6b — a deleted group may not become a phantom one ─────────────────── */

{
  /*
   * The view counts `count(distinct q.target_id)`, which SKIPS nulls. The row
   * fallback used a JS Set, where every null collapses to one member — so a
   * round whose groups were later deleted reported one extra group on a
   * pre-v38 database and the right number after the migration. Two answers to
   * one question, decided by which file had been run.
   */
  const withNull = campaignState([
    row('a', 'published', true),
    { ...row('b', 'published', true), target_id: null } as unknown as CampaignQueueRow,
  ]);
  eq(withNull.publishedTargetCount, 1, 'a published row whose group is gone is not a group');
}

/* ─── §6c — 100% is reserved, and open publications are not nothing ──────── */

{
  /*
   * Two occasions a day over 252 groups: by midday every group has the post
   * and round two's 252 rows are waiting for 18:00. The pair is true and
   * "100%" over it is not — the same false completion ratio() already refuses
   * for a capped read.
   */
  const midday = st({
    targetCount: 252,
    publishedTargetCount: 252,
    publishedTargetCountIsWhole: true,
    todayOnly: true,
    progress: { ...EMPTY_PROGRESS, total: 504, published: 252, finished: 252, scheduled: 252 },
  });
  eq(groupProgress(midday).percent, 99, 'a round with 252 rows still queued is not 100% done');
  /* And with nothing open it may. */
  const done = st({
    targetCount: 252,
    publishedTargetCount: 252,
    publishedTargetCountIsWhole: true,
    progress: { ...EMPTY_PROGRESS, total: 252, published: 252, finished: 252 },
  });
  eq(groupProgress(done).percent, 100, 'and a round with nothing left may say so');
}

/* ─── §6d — clamping is not agreeing ─────────────────────────────────────── */

{
  /* The hero takes `totalGroups` from the dashboard's read and the numerator
     off the state; two reads seconds apart can disagree. Clamped so the card
     cannot say 260 of 252 — and hedged, so it cannot say 252 of 252 as a fact
     either. */
  const over = groupProgress(st({ targetCount: 252, publishedTargetCount: 260, publishedTargetCountIsWhole: true }), 252);
  eq(over.published, 252, 'clamped');
  is(over.hedged, 'and hedged, because the two reads disagreed');
  eq(over.percent, 99, 'so it may not print 100%');
}

/* ─── §7 — the read: a missing column may not fail the whole request ─────── */

const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
const pin = (claim: string, src: string, needle: string) => {
  checks += 1;
  assert.ok(src.includes(needle), `${claim}\n  missing: ${needle}`);
};

{
  /*
   * NAMING THE COLUMNS WOULD HAVE BEEN THE BUG. PostgREST fails the WHOLE
   * request for one unknown column, so adding v38's two to the list would
   * have taken `targets`, `targets_today` and `first_published_at` down with
   * them on every database that has not run the migration — and the group
   * TOTAL would then be re-derived from a capped preview with nothing saying
   * so, which is the 28/28 fault this view was added to end.
   *
   * `*` is safe here and nowhere else in this file: it is an aggregate view,
   * one row per campaign, no text column.
   */
  pin('the targets view is read with *', client, "db().from('social_campaign_targets').select('*')");
  is(
    !client.includes("select('campaign_id, targets, targets_today"),
    'the narrow select is gone — it is what a missing column would have failed on',
  );
  pin('a missing column reads as "cannot answer", not as zero', client, 'e.publishedTargets = row.targets_published ?? null;');
  pin('and so does today’s', client, 'e.publishedTargetsToday = row.targets_published_today ?? null;');
  /* THE SAME SCOPE AS THE DENOMINATOR BESIDE IT, or the card reads "today's
     published groups out of the round's whole life". */
  pin(
    'the numerator is scoped exactly like the denominator',
    client,
    'publishedTargetCount: todayOnly ? exact.publishedTargetsToday : exact.publishedTargets,',
  );
  pin('the exact-counts shape carries both', client, 'publishedTargets: number | null;');
  /*
   * AND A FAILED GROUPS READ IS NOT AN EXACT ANSWER. `if (!targetRes.error)`
   * swallowed a 401 after a token-refresh race, an RLS refusal and a dropped
   * connection alike: the counts request beside it succeeds, so the result
   * came back kind 'exact' with targets 0 — and `truncated` is false on an
   * exact answer, so the card dropped the group pair AND the pill without one
   * word saying a read had failed. Only a MISSING VIEW may fall through.
   */
  pin('a groups read that failed for any other reason is not exact', client, "if (targetRes.error && !isMissingRelation(targetRes.error)) return { kind: 'read-failed' };");
}

/* ─── §8 — the migration ─────────────────────────────────────────────────── */

const latest = readFileSync(new URL('../../supabase/social-latest.sql', import.meta.url), 'utf8');
const v38 = readFileSync(new URL('../../supabase/social-schema-v38.sql', import.meta.url), 'utf8');
const v38back = readFileSync(new URL('../../supabase/social-schema-v38-rollback.sql', import.meta.url), 'utf8');

for (const [name, sql] of [['social-latest.sql', latest], ['social-schema-v38.sql', v38]] as const) {
  pin(`${name} defines targets_published`, sql, 'as targets_published');
  pin(`${name} defines targets_published_today`, sql, 'as targets_published_today');
  pin(`${name} counts DISTINCT groups, not rows`, sql, "count(distinct q.target_id) filter (where q.status = 'published')::int as targets_published");
  /*
   * AT THE END OF THE SELECT, AND IT IS NOT A STYLE RULE.
   *
   * `create or replace view` may append columns and may not reorder or remove
   * any. Putting these two before `first_published_at` makes the one file
   * anyone is ever told to run fail on its second run with "cannot drop
   * columns from view" — which is what happens to the v27 definition itself
   * once v38 has been applied, measured against a real Postgres 16 in the
   * session that wrote this.
   */
  checks += 1;
  assert.ok(
    sql.indexOf('as targets_published') > sql.indexOf('as last_published_at'),
    `${name}: the v38 columns must come AFTER last_published_at or create-or-replace cannot run twice`,
  );
  /* TODAY IS scheduled_at ON BOTH SIDES OF THE RATIO. By published_at, a group
     whose post went out this morning but was due yesterday would be inside the
     numerator and outside the denominator. */
  checks += 1;
  assert.ok(
    /targets_published_today/.test(sql) && !/filter \(\s*where q\.status = 'published'\s*and \(q\.published_at/.test(sql),
    `${name}: today's published groups must be scoped by scheduled_at, like targets_today`,
  );
}

{
  /* NOTHING IS DELETED, NOTHING IS DROPPED, NO TABLE CHANGES. A view reads. */
  for (const [name, sql] of [['v38', v38], ['v38-rollback', v38back]] as const) {
    checks += 1;
    assert.ok(!/\bdelete\s+from\b/i.test(sql), `${name} must not delete a row`);
    checks += 1;
    assert.ok(!/\bdrop\s+table\b/i.test(sql), `${name} must not drop a table`);
    checks += 1;
    assert.ok(!/\balter\s+table\b/i.test(sql), `${name} must not change a table`);
    checks += 1;
    assert.ok(!/\bupdate\s+public\./i.test(sql), `${name} must not write a value`);
  }
  /* AND THERE IS A WAY BACK, which is the house rule for any schema change. */
  pin('the rollback drops the view rather than pretending it can shed a column', v38back, 'drop view if exists public.social_campaign_targets');
  pin('and puts v27 back exactly', v38back, 'as last_published_at');
  is(!v38back.includes('as targets_published'), 'the rollback leaves no v38 column behind');
  /* The grants are re-issued after the drop, or the app loses the view. */
  pin('the rollback restores the read grant', v38back, "grant select on public.social_campaign_targets to authenticated");
}

/* ─── §9 — the two cards, and that they lead with the same pair ──────────── */

const hero = readFileSync(new URL('../../src/components/social/LiveCampaignHero.tsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('../../src/components/social/CampaignCard.tsx', import.meta.url), 'utf8');

{
  pin('the hero builds the group view', hero, 'const groups = groupProgress(state, targetCount ?? undefined);');
  pin('the hero ratio counts groups that got the post', hero, 'done={groups.published}');
  pin('out of the groups the round reaches', hero, 'total={groups.total}');
  pin('the ring is the same fraction', hero, 'percent={groups.usable ? groups.percent : view.percent}');
  pin('and the bar is drawn over the same pair', hero, 'segments={[{ value: groups.published, className: TONE_FILL.good }]}');
  pin('the sentence under it is the group one', hero, 'groups.label,');
  pin('with what is left in groups beside it', hero, 'groups.waitingLabel,');
  /*
   * THE PUBLICATIONS THAT DID NOT MAKE IT KEEP THEIR OWN WORDS. There is no
   * group-wise "failed" — one group can hold a published row and a failed row
   * at once — so they stay a count of publications and say so in every one of
   * them. A round losing 274 of them is not something to learn from a badge.
   */
  pin('skipped publications say they are publications', hero, "'פרסום אחד דולג', 'פרסומים דולגו'");
  pin('and so do failed ones', hero, "'פרסום אחד נכשל', 'פרסומים נכשלו'");
  /* THE FALLBACK IS STILL THERE, and it is the card exactly as it was. */
  pin('with no group count the hero draws what it always drew', hero, 'done={view.handled}');
  /* THE NOTE FIRES WHERE THE PAIR IS MISSING, not where it is hedged — the
     corrected gate. A card that cannot count published groups draws the
     publications ratio it always drew, plus one line naming the one file. */
  pin('and tells the owner which file supplies the missing figure', hero, '{!groups.usable && (targetCount ?? 0) > 0 && !state.truncated && (');
  pin('open publications stay visible beside a group ratio', hero, "open > 0 ? counted(open, 'פרסום אחד עוד לא יצא'");
  /* ONE SCREEN MAY NOT ANSWER THIS IN A DIFFERENT UNIT FROM THE OTHER — the
     desync he has already reported twice between these two screens. */
  pin('the campaigns card carries the same pair', card, 'const groups = groupProgress(state);');
  pin('and prints the same sentence', card, '{groups.label}');
  pin('and draws nothing when there is no count', card, 'groups.usable &&');
  /*
   * AND THE THIRD SCREEN. "לא מסונכרן בין מסך פרסום קמפיינים לבין המסך
   * הראשי" has been reported twice about these screens; a headline in a
   * different unit from the other two is the same complaint waiting to be
   * made again. The round screen keeps its row figures — it is the
   * per-publication feed, where the skipped and failed rows are listed and
   * acted on — and only its RING, the one ratio on it, follows the pair.
   */
  /*
   * ─── AND THE THIRD SCREEN DELIBERATELY DOES NOT ─────────────────────────
   *
   * It did for one commit, and the review caught it. The round screen builds
   * its state from its OWN feed — one campaign, up to CAMPAIGN_QUEUE_LIMIT
   * rows, over the round's whole life, with no counts passed in — so its
   * group pair is a different scope from the aggregate the other two screens
   * read. Measured on one fixture: dashboard "1 / 3" at 33%, round screen
   * "3 / 3" at 99%, same round, same minute, one tap apart. That is the fault
   * the pair was introduced to END.
   *
   * Groups may return to this screen once it reads the same aggregate. Until
   * then its ring is what it always was, and these pins hold it there.
   */
  const runPage = readFileSync(new URL('../../src/app/social/campaigns/[id]/page.tsx', import.meta.url), 'utf8');
  is(!runPage.includes('groupProgress'), 'the round screen must not draw a group figure from its own feed');
  pin('the round screen keeps its publication figures', runPage, 'runProgress(state.progress, state.todayOnly, state.truncated)');
  pin('and its ring is the handled ratio', runPage, 'sub={`${view.handled} / ${view.total} טופלו`}');
}

/* ─── §10 — the hour is not written on every notch of the wheel ──────────── */

{
  /*
   * "במסך הראשי שאני בא לשנות את הזמן אני עוד לא מספיק לבחור וזה זורק אותי
   *  מהבחירה ומשנה את השעה איפה שעצרתי אם האצבע."
   *
   * <input type="time"> is controlled, and the iOS wheel fires `change` on
   * every notch it passes. Each one went to onScheduleChange — a write and a
   * round trip — so mid-scroll React wrote the server's last confirmed value
   * back into the open picker and iOS closed it on whatever the finger was
   * over. It was also one database write per notch.
   *
   * The draft lives on the PANEL, so the summary line still moves with the
   * wheel ("הסיכום חייב להתעדכן LIVE"), and exactly one write happens when
   * the field is done.
   */
  const panel = readFileSync(new URL('../../src/components/social/CampaignSchedulePanel.tsx', import.meta.url), 'utf8');
  pin('the panel holds the hour while it is being picked', panel, 'const [startDraft, setStartDraft] = useState<string | null>(null);');
  pin('and the summary reads the draft, so it still moves live', panel, 'const shown = startDraft ? { ...stored, start: startDraft } : stored;');
  pin('the wheel writes nothing', panel, 'onDraft={setStartDraft}');
  pin('the close writes once', panel, 'onCommit={commitStart}');
  pin('and only when the hour actually moved', panel, "if (next && /^\\d{2}:\\d{2}$/.test(next) && next !== stored.start) set({ start: next });");
  pin('closing the picker commits on every platform', panel, 'onBlur={onCommit}');
  is(
    !/onChange=\{\(v\) => set\(\{ start: v \}\)\}/.test(panel),
    'THE BUG: the time field may not write straight through on every change',
  );
}

/* ─── §11 — v38 cannot fail on the servers its own guard protects ────────── */

{
  /*
   * The guard returns early on Postgres below 15, but the `comment on view`
   * and the closing `select` sat OUTSIDE it — so the file printed its skip
   * notice and then errored on a view it had just decided not to create.
   * Every statement that touches the view is inside a guarded block now.
   */
  const afterGuard = v38.split("if current_setting('server_version_num')::int < 150000 then");
  is(afterGuard.length >= 3, 'v38 guards every block that touches the view, not just the first');
  const tail = v38.slice(v38.lastIndexOf('end $$;'));
  is(
    !/social_campaign_targets/.test(tail),
    'no statement may touch the view after the last guarded block closes',
  );
}

console.log(`group count OK — ${checks} assertions, and the SQL was run against a real Postgres 16`);
