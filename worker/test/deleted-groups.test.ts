/*
 * ─── A GROUP THAT WAS DELETED IS STILL IN THE ROUND ───────────────────────
 *
 * "לא מפרסם שוב תבדוק" → "יכול ליהיות בגלל שהסרתי 6 קבוצות?"
 *
 * He was right, and this file exists because I told him a story about it
 * twice before reading his database. What the live data then said, on
 * 05.11.2026 at 21:24 UTC:
 *
 *   plan_failed  "insert or update on table \"social_queue\"
 *                 violates foreign key constraint \"social_queue_target_id_fkey\""
 *   plan_retry   failed=14  schedule=d4a226ec   ← 7 deleted groups × 2 occasions
 *   plan_retry   failed=6   schedule=38dec06a   ← 3 deleted groups × 2 occasions
 *
 * once a minute, for ever. Ten group ids were listed in two active schedules
 * and existed in no table.
 *
 * WHY IT HAPPENS. `social_schedules.target_ids` is a plain uuid[] with no
 * foreign key of its own, so nothing removes an id from it when the group is
 * deleted. `social_queue.target_id` DOES have one, with ON DELETE CASCADE —
 * so the group's queued rows go, and every later attempt to write a new one
 * is refused by the database.
 *
 * AND THE SCREEN SAID THE WRONG THING, which is the half that cost the hour:
 * `plan_retry` claimed "לא הייתה גישה למסד הנתונים" for every failed write,
 * while the database was perfectly reachable — and `plan_failed` carried the
 * Postgres message in English, which ActivityFeed replaces with "תקלה טכנית"
 * for exactly that reason. The one line that knew was the one line nobody
 * could read.
 *
 * Three things are held here:
 *   §1  liveTargetIds — one read per pass, chunked, and FAIL-OPEN
 *   §2  planErrorText — the sentence an owner can act on
 *   §3  the planner skips what is gone, the deleter stops leaving it behind,
 *       and the counting line no longer names a cause it does not know
 *
 *   npx tsx worker/test/deleted-groups.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liveTargetIds, planErrorText } from '../../src/lib/social/plan';

let checks = 0;
const is = (cond: boolean, claim: string) => {
  checks += 1;
  assert.ok(cond, claim);
};
const eq = (actual: unknown, expected: unknown, claim: string) => {
  checks += 1;
  assert.deepEqual(actual, expected, `${claim}\n  expected: ${JSON.stringify(expected)}\n  got     : ${JSON.stringify(actual)}`);
};

/* A stand-in for the one call liveTargetIds makes, recording every chunk. */
function fakeDb(existing: string[], opts: { failOn?: number } = {}) {
  const calls: string[][] = [];
  return {
    calls,
    db: {
      from() {
        return {
          select() {
            return {
              in(_col: string, ids: string[]) {
                calls.push(ids);
                if (opts.failOn !== undefined && calls.length === opts.failOn) {
                  return Promise.resolve({ data: null, error: { message: 'boom' } });
                }
                return Promise.resolve({ data: ids.filter((i) => existing.includes(i)).map((id) => ({ id })), error: null });
              },
            };
          },
        };
      },
    } as never,
  };
}

async function main(): Promise<void> {

/* ─── §1 — which groups still exist ──────────────────────────────────────── */

{
  const { db, calls } = fakeDb(['a', 'b', 'd']);
  const live = await liveTargetIds(db, ['a', 'b', 'c', 'd', 'e']);
  eq([...live].sort(), ['a', 'b', 'd'], 'only the groups the database still has come back');
  is(!live.has('c') && !live.has('e'), 'and the deleted ones are absent, which is what the planner filters on');
  eq(calls.length, 1, 'five ids is one read');
}

{
  /* CHUNKED, because PostgREST puts the whole list in the URL and a round of
     three hundred groups builds a URL long enough to be refused by the proxy
     in front of it. */
  const ids = Array.from({ length: 252 }, (_, i) => `g${i}`);
  const { db, calls } = fakeDb(ids);
  const live = await liveTargetIds(db, ids);
  eq(live.size, 252, 'every group is accounted for across the chunks');
  eq(calls.length, 3, '252 ids is three reads of at most a hundred');
  is(calls.every((c) => c.length <= 100), 'and no chunk is larger than the limit');
}

{
  /* DUPLICATES ARE ASKED ABOUT ONCE. A schedule can list the same group twice
     and a round of 252 would otherwise pay for it on every pass. */
  const { db, calls } = fakeDb(['a']);
  await liveTargetIds(db, ['a', 'a', 'a', '', 'a']);
  eq(calls[0], ['a'], 'the same id is not asked about five times, and an empty one not at all');
}

{
  /*
   * ─── FAIL-OPEN, AND IT IS THE WHOLE SAFETY OF THIS CHANGE ──────────────
   *
   * If the read itself fails there is no way to tell a deleted group from a
   * database that did not answer. Treating "no answer" as "deleted" would
   * cancel an entire round the first time a mobile connection hiccupped —
   * strictly worse than the bug being fixed. Every id in a chunk that failed
   * is treated as live, which is exactly what the planner did before.
   */
  const { db } = fakeDb([], { failOn: 1 });
  const live = await liveTargetIds(db, ['a', 'b', 'c']);
  eq([...live].sort(), ['a', 'b', 'c'], 'a failed read may never report a group as deleted');
}

{
  /*
   * ─── AND A CHUNK THAT ANSWERS "NONE OF THESE" TEACHES NOTHING EITHER ───
   *
   * This is the rail the suite forced, and it is the more important of the
   * two. An error is the obvious way to learn nothing; the other is a clean
   * answer of zero rows — RLS that does not match the caller, a tenant column
   * the request did not carry, a stale schema cache. "None of these hundred
   * groups exist" is a far stronger claim than any of those.
   *
   * plan-noise.test.ts drives the real planner against a fake database whose
   * social_targets answers `[]`. With the first version of this function every
   * target was filtered out, the round planned nothing, and the line that is
   * supposed to say "not one group could be placed" never fired — a round
   * that publishes to nobody, silently. Exactly the shape this product keeps
   * being bitten by, introduced by the fix for a different one.
   */
  const { db } = fakeDb([]);
  const live = await liveTargetIds(db, ['a', 'b', 'c']);
  eq([...live].sort(), ['a', 'b', 'c'], 'an empty answer may never be read as "all of them were deleted"');
}

/* ─── §2 — the sentence the owner can act on ─────────────────────────────── */

{
  const fk = planErrorText('insert or update on table "social_queue" violates foreign key constraint "social_queue_target_id_fkey"');
  is(fk.includes('כבר לא קיימת'), `the foreign-key refusal says the group is gone — got "${fk}"`);
  is(!/[A-Za-z]{6,}/.test(fk), 'and says it in Hebrew, or ActivityFeed replaces it with "תקלה טכנית"');

  const net = planErrorText('TypeError: fetch failed');
  is(net.includes('גישה למסד הנתונים'), 'a transport failure is the ONE case that may say the database was unreachable');

  const auth = planErrorText('JWT expired');
  is(auth.includes('הרשאה'), 'an auth refusal says so, and names the likely cause');

  /* AND AN UNKNOWN ERROR IS PASSED THROUGH UNCHANGED. Describing it as
     something it is not is worse than showing it in English: that is the
     mistake this whole file is about. */
  const unknown = 'duplicate key value violates unique constraint "social_queue_dedupe"';
  eq(planErrorText(unknown), unknown, 'an error with no known shape is not rewritten into a guess');
}

/* ─── §3 — the planner, the deleter, and the counting line ───────────────── */

const plan = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
const pin = (claim: string, src: string, needle: string) => {
  checks += 1;
  assert.ok(src.includes(needle), `${claim}\n  missing: ${needle}`);
};

{
  /* ONE READ PER PASS, for every schedule at once. */
  pin('the planner asks once which groups still exist', plan, 'const live = await liveTargetIds(');
  pin('and plans only for those', plan, 'const presentTargets = listedTargets.filter((id) => live.has(id));');
  /* THE SLOT MATHS USES THE FILTERED LENGTH. Planning 252 slots and losing 7
     of them to an error is not the same as planning 245. */
  pin('the slots are counted off the groups that exist', plan, 'windowedStagger(slot, targetIds.length, stampGapSeconds, campaignSchedule)');
  pin('and the loop walks those', plan, 'for (const [targetIndex, targetId] of targetIds.entries())');
  is(
    !plan.includes('for (const [targetIndex, targetId] of schedule.target_ids.entries())'),
    'no path may still walk the raw list — that is the path that fails on every deleted group',
  );
  /* THE GRADUAL PATH TOO: it is a different function and it had the same bug. */
  pin('the drip path filters as well', plan, 'const dripPresent = dripListed.filter((id) => dripLive.has(id));');
  pin('and its loop walks the filtered list', plan, 'for (const [targetIndex, targetId] of dripTargets.entries())');
  /* ONE NEGATIVE FOR BOTH PATHS, IN EVERY SPELLING. Computing the filtered
     list and then looping over the raw one is the mutation that slipped past
     the first version of these pins. */
  is(
    !/for \(const \[targetIndex, targetId\] of \(?schedule\.target_ids/.test(plan),
    'no loop may walk the stored list — that is the loop that fails on every deleted group',
  );
  /* AND IT SAYS SO. A round that reaches 245 of 252 must not look identical
     to one that reached all of them. */
  pin('skipping a deleted group is reported', plan, "'plan_targets_gone',");

  /*
   * ─── THE CEILING: A FILTER MAY NOT SWALLOW A ROUND ─────────────────────
   *
   * The per-chunk rail is per chunk, so a partial read — one chunk answered,
   * the next refused — can still make a large share of a round look deleted.
   * The owner's real case was 7 of 252 and 3 of 56. A filter that wants to
   * remove half a round has not found deletions; it has found a read to
   * distrust, and the stored list is used unchanged. The foreign-key errors
   * come back, which is noisy, visible and recoverable — unlike a round that
   * quietly publishes to nobody.
   */
  pin('a filter that wants most of the round is refused', plan, 'const tooManyMissing = absentTargets > Math.max(1, Math.floor(listedTargets.length / 5));');
  pin('and the stored list is used instead', plan, 'const targetIds = tooManyMissing ? listedTargets : presentTargets;');
  pin('and it is never silent about that', plan, "'plan_targets_unverified',");
  pin('the gradual path carries the same ceiling', plan, 'dripListed.length - dripPresent.length > Math.max(1, Math.floor(dripListed.length / 5)) ? dripListed : dripPresent');

  /* ─── THE SENTENCE THAT SENT US HUNTING ──────────────────────────────── */
  is(
    !plan.includes('לא נכתבו לתור כי לא הייתה גישה למסד הנתונים'),
    'THE BUG: the counting line may not claim the database was unreachable for every failed write',
  );
  pin('it points at the line that does know', plan, 'הסיבה רשומה בשורה האדומה שלידה');
  pin('and the red line is written in words', plan, "await note('error', 'plan_failed', planErrorText(insErr.message)");
  pin('with the original kept beside it', plan, 'raw: insErr.message');

  /* ─── THE DELETER ────────────────────────────────────────────────────── */
  pin('deleting a group clears it from every round', client, 'async function forgetTargetsInSchedules(ids: string[])');
  pin('found by overlap rather than by reading every schedule', client, "overlaps('target_ids', ids)");
  pin('one group', client, 'await forgetTargetsInSchedules([id]);');
  pin('and a bulk delete', client, 'await forgetTargetsInSchedules(ids);');
  /* AFTER THE DELETE, NEVER BEFORE: cleaning first and then failing to delete
     would strip a group that still exists out of a live round. */
  const single = client.slice(client.indexOf('export async function deleteTarget('));
  is(
    single.indexOf(".delete().eq('id', id)") < single.indexOf('forgetTargetsInSchedules([id])'),
    'the clean-up runs after the delete succeeded, not before',
  );

  /* AND THE NEW EVENT HAS A HEBREW NAME, like every other one. */
  const text = readFileSync(new URL('../../src/lib/social/activity-text.ts', import.meta.url), 'utf8');
  pin('the new event is named on screen', text, "plan_targets_gone: 'קבוצות שנמחקו דולגו'");
}

console.log(`deleted groups OK — ${checks} assertions`);
}

void main();
