/**
 * ADDING A GROUP TO A RUNNING ROUND HAS TO REACH TOMORROW TOO.
 *
 * "פוסטים לא מתפרסמים בשעות שהגדרתי" — on groups the owner is certain he added.
 *
 * The two halves were never symmetric:
 *
 *   · REMOVING a group calls unplanTarget(), which takes it off the round's
 *     active schedules so the planner stops re-creating rows for it. Correct,
 *     and it has been there for a long time.
 *   · ADDING one inserted queue rows and stopped. setCampaignRepeat re-arms the
 *     weekly row with `{ mode, weekly, active: true }` and never touches
 *     `target_ids`.
 *
 * So the group publishes TODAY, out of the rows that were just inserted, and
 * from tomorrow the round silently reverts to the list it had before — because
 * tomorrow's rows come from the schedule, and the schedule never heard about
 * the group. The group is visibly in the round's list the whole time, so there
 * is nothing on any screen to notice.
 *
 * This file pins both halves together, because the defect was not a wrong line:
 * it was a missing mirror, and a missing mirror is invisible to any test that
 * only looks at the half that exists.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
const between = (from: string, to: string) => client.slice(client.indexOf(from), client.indexOf(to));

/* ─────────────────────── 1. both halves exist ───────────────────────────── */
{
  is(/async function unplanTarget\(targetId: string, scheduleIds: string\[\]\)/.test(client), 'the removal half is gone — this test pins the pair');
  is(/async function planTargets\(postId: string, targetIds: string\[\]\)/.test(client), 'the ADDING half is missing: groups added to a running round publish today and vanish from the round tomorrow, because the schedule they repeat from never heard about them');
}

/* ───────────────── 2. the adding half's own rules ───────────────────────── */
{
  const fn = between('async function planTargets(', "The browser's half of plan.ts's dedupe hash");
  is(fn.length > 400, 'planTargets is found');

  /* Active only — the same rule unplanTarget states, for the same reason: an
     inactive schedule is the record of what was SENT. */
  is(
    /\.eq\('post_id', postId\)\.eq\('active', true\)/.test(fn),
    "planTargets must touch only ACTIVE schedules — 'now', 'once' and 'drip' retire themselves when planned, and rewriting one is editing history rather than the plan",
  );
  is(/Pick<Schedule, 'id' \| 'target_ids'>/.test(fn), 'and it must read the list it is about to extend, not overwrite it blind');

  /* Appended, never duplicated: a target twice in target_ids is a second row
     per run for the same group. */
  is(
    /const next = \[\.\.\.had, \.\.\.targetIds\.filter\(\(id\) => !have\.has\(id\)\)\];/.test(fn),
    'planTargets must APPEND the ones that are missing — overwriting the list drops the groups already in the round, and adding blind puts a group in twice, which is two rows per run for one group',
  );
  is(/if \(next\.length === had\.length\) continue;/.test(fn), 'a schedule that already has every one of them must not be written at all');
  is(/let changed = 0;/.test(fn) && /return changed;/.test(fn), 'it must report how many schedules it reached, so the caller can say whether tomorrow is covered');
}

/* ─────────── 3. the queue path calls it, after the rows are in ──────────── */
{
  /* planTargets is declared ABOVE this function, so the slice runs forward
     from the declaration rather than between the two. */
  const start = client.indexOf('export async function addTargetsToQueue(');
  const fn = client.slice(start, start + 9000);
  is(fn.length > 2000, 'addTargetsToQueue is found');
  const insertAt = fn.indexOf("await db().from('social_queue').insert(rows).select('id')");
  const planAt = fn.indexOf('await planTargets(plan.postId as string, fresh)');
  is(insertAt >= 0, 'the insert is found');
  is(planAt > insertAt, 'the repeat must be updated AFTER the rows are in — doing it first would extend the round on a queue write that then failed');
  is(/await planTargets\(plan\.postId as string, fresh\)/.test(fn), 'and it must pass the groups that were actually inserted (`fresh`), not everything that was asked for — the ones already queued are already in the round');

  /*
   * REPORTED, NOT THROWN. The rows are already inserted when this runs, so
   * throwing would tell the owner the add failed when his groups are queued
   * and publishing today. What he needs to know is the narrower thing: that
   * tomorrow is not covered yet.
   */
  is(
    /try \{\s*repeated = await planTargets\([\s\S]{0,120}\} catch \(err\) \{/.test(fn),
    'a failure here must not throw — the queue rows are already in, and reporting the add as failed would be a lie in the other direction',
  );
  is(
    /אבל הן לא נוספו לחזרה של הסבב, ולכן מחר הוא יחזור לרשימה הקודמת/.test(fn),
    'and it must say exactly that, in words — "the groups are queued but tomorrow reverts" is the one sentence that tells him what to do next',
  );
  is(/repeatProblem \? 'warn' : 'info'/.test(fn), 'a half-done add must be a warning in the bell, not an info line nobody reads');
  is(/schedulesUpdated: repeated/.test(fn), 'and the activity row must carry how many schedules were reached, so it can be checked');
  is(
    /ונוספו גם לחזרה של הסבב/.test(fn),
    'and when it worked it must say so — the owner has no other way to tell that the round will keep publishing to them',
  );
}

/* ───────── 4. the re-arm is NOT where this gets fixed, on purpose ───────── */
{
  /*
   * setCampaignRepeat re-arms the weekly row's mode, hours and active flag. It
   * must NOT also rewrite target_ids: there is no canonical "the campaign's
   * groups" list anywhere else — the schedule IS that list — so a re-arm that
   * rebuilt it would be guessing, and the guess would be the list it already
   * holds. The fix belongs at the moment a group is added, which is where the
   * new information actually is.
   */
  is(
    /\.update\(\{ mode: 'weekly', weekly, active: true \}\)/.test(client),
    'the weekly re-arm changed shape — if it now writes target_ids, the comment above this assertion needs rereading before you trust it',
  );
}

console.log(`add-groups OK — ${checks} assertions`);
