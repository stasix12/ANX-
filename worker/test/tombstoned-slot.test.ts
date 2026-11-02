/*
 * "עדיין לא מפרסם כלום"  ·  "הוא מדלג ורושם הסבב נעצר למרות שלא עשיתי כלום"
 *
 * One press of "סיים ואפס", and a campaign that could never queue another
 * publication — reporting nothing, once a minute, for ever.
 *
 * THE CONTRADICTION, which is the whole bug and is invisible in a diff:
 *
 *   · social_queue_slot_idx is unique on (schedule_id, target_id,
 *     scheduled_at) and is DELIBERATELY NOT PARTIAL. The schema says so three
 *     times (social-schema.sql:216, social-schema-v2.sql:48,
 *     social-fix-queue-index.sql:1): PostgREST cannot infer a partial index as
 *     an ON CONFLICT target, and the planner's idempotence rests on that
 *     inference. So the index counts a 'skipped' row like any other.
 *   · occupiedSlots() reads `.in('status', ['published', ...OPEN_STATUSES])`
 *     under a docstring that states the opposite outright: "Terminal rows are
 *     deliberately excluded: something already skipped or failed should be
 *     allowed to be planned again."
 *
 * So the planner targets a slot the database will refuse, and the refusal is
 * SILENT: `upsert(..., { ignoreDuplicates: true })` is ON CONFLICT DO NOTHING,
 * which returns `data = []` and `error = null`. Every counter is gated on
 * `data.length` and every log line in the pass is gated on `made > 0`.
 *
 * Put together: "סיים ואפס" cancels every not-yet-started row in one UPDATE,
 * the horizon is 48 hours, the instants are clock-free and the daily re-arm
 * reuses the SAME schedule row — so the relaunch recomputed the identical
 * minutes for the identical groups and every insert was refused without a
 * word. Relaunching could not have worked, and nothing on any screen said so.
 *
 * These are source-level assertions because reproducing it needs a Postgres
 * with that unique index; worker/test/plan-noise.test.ts drives the real
 * planQueue against a database that remembers, and is the behavioural half.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8');
/* Comment-stripped: this file explains at length the lines it requires, and a
   check that cannot tell code from prose is not a check. Five times now. */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

/* ───────────── one: the silent refusal has a branch at all ──────────────── */

/*
 * BOTH planner branches. The weekly one is the owner's case; the drip one is
 * "פרסם עכשיו" with several targets. A fix in one of two identical writes is
 * how this product has shipped half-fixes before — see noteOccupied, which
 * had to be added to both in 4.31.0.
 */
eq(
  (code.match(/recycleTombstonedSlot\(db, \{ scheduleId: schedule\.id, targetId, at: /g) ?? []).length,
  2,
  'both planner branches recycle a tombstoned slot — the weekly one AND the drip one',
);
eq(
  (code.match(/tombstoned\.push\(targetId\);/g) ?? []).length,
  2,
  'and both record the slots they could NOT free',
);
eq((code.match(/noteTombstoned\(db, note, schedule\.id/g) ?? []).length, 2, 'and both report');

/* ───────────── two: the recycle cannot republish or defeat a ceiling ────── */

const helper = code.slice(code.indexOf('async function recycleTombstonedSlot'), code.indexOf('async function noteTombstoned'));
ok(helper.length > 100, 'the helper is present');

ok(/\.eq\('status', 'skipped'\)/.test(helper), "ONLY a cancelled row is recycled");
ok(
  !/'failed'/.test(helper),
  "NEVER a failed row: that is an attempt that happened, with its own ceiling (REVIVE_ATTEMPT_CEILING), and recycling it here would hand a permanently failing group unlimited attempts",
);
ok(
  /\.is\('published_at', null\)/.test(helper),
  'and never a row that already went out — the one outcome this must not be able to produce is a second post to the same group',
);
/* Scoped to the exact slot, by all three key columns. A recycle that matched
   loosely would resurrect a different occasion's cancelled row. */
for (const col of ["\\.eq\\('schedule_id', slot\\.scheduleId\\)", "\\.eq\\('target_id', slot\\.targetId\\)", "\\.eq\\('scheduled_at', slot\\.at\\)"]) {
  ok(new RegExp(col).test(helper), `the recycle is pinned to the slot by ${col.replace(/\\/g, '')}`);
}
ok(/skip_reason: null, error: null/.test(helper), 'and the stale cancellation reason is cleared, or the row would publish still carrying "הסבב נעצר"');

/* It reports its own failure rather than swallowing it. */
ok(/if \(error\) return \{ recycled: false, error: error\.message \};/.test(helper), 'a failed recycle is returned, not discarded');

/* ───────────── three: the report is NOT gated on `made` ─────────────────── */

const note = code.slice(code.indexOf('async function noteTombstoned'), code.indexOf('async function noteAllBlocked'));
ok(note.length > 100, 'the reporter is present');
ok(
  !/made/.test(note),
  'noteTombstoned takes no `made` guard: that guard is right for noteDropped and noteOccupied and exactly wrong here, because the case it reports IS the pass that made nothing',
);
ok(/if \(!recycled && !unique\.length\) return;/.test(note), 'and it is silent only when there is genuinely nothing to say');
ok(/'plan_slots_tombstoned'/.test(note) && /'plan_slots_recycled'/.test(note), 'both outcomes have their own event');
ok(/ערוך מועד/.test(note), 'and the refusal names the way out, because the owner cannot be expected to know that a cancelled row holds the minute');

/* The two events must be classified, or activityKind files them by level and
   a 'failure' lands under a heading nobody opens. The suite caught exactly
   this for worker_holding an hour before this file was written. */
const kinds = readFileSync(new URL('../../src/lib/social/activity.ts', import.meta.url), 'utf8');
ok(/plan_slots_tombstoned: 'failure'/.test(kinds), "the refusal is a failure — a publication the owner expects is not going out");
ok(/plan_slots_recycled: 'round'/.test(kinds), 'the repair is part of the round\'s life');
const texts = readFileSync(new URL('../../src/lib/social/activity-text.ts', import.meta.url), 'utf8');
ok(/plan_slots_tombstoned: '/.test(texts) && /plan_slots_recycled: '/.test(texts), 'and both have a Hebrew headline');

/* ───────────── four: the row's shape is not duplicated ─────────────────── */

ok(/const dripRow: Record<string, unknown> = \{/.test(code), 'the drip branch builds its row once and reuses it for the recycle — two copies of a row shape is how they drift apart');
ok(/\.upsert\(dripRow, \{ onConflict: 'schedule_id,target_id,scheduled_at', ignoreDuplicates: true \}\)/.test(code), 'and the upsert still names the same conflict target');
/* The key columns are stripped before the plan is used as an UPDATE payload:
   they are already matched by the .eq() filters, and writing them back would
   be a no-op at best and a silent slot move at worst. */
eq(
  (code.match(/const \{ schedule_id: _si, target_id: _ti, scheduled_at: _sa, \.\.\.plan \} =/g) ?? []).length,
  2,
  'both branches strip the three key columns out of the UPDATE payload',
);

/* ───────────── five: the fail-open that disarmed the stop-guard ─────────── */

const stopped = code.slice(code.indexOf('async function stoppedCampaigns'), code.indexOf('async function stoppedCampaigns') + 900);
ok(
  /const \{ data, error \} = await db\.from\('social_campaigns'\)\.select\('id'\)\.eq\('status', 'archived'\);/.test(stopped),
  'the archived-campaign read keeps its error',
);
ok(/if \(error\) throw new Error\(error\.message\);/.test(stopped), 'and FAILS CLOSED: an empty set does not mean "nothing is stopped", it disarms both the sweep AND the stop-guard for the whole pass');
ok(
  stopped.indexOf('if (error) throw') < stopped.indexOf('.update({ status: \'skipped\''),
  'the throw stands in front of the sweep, so a pass that cannot tell which rounds are stopped cancels nothing',
);

/* ───────────── six: the index really is what forces all of this ─────────── */

const schema = readFileSync(new URL('../../supabase/social-schema.sql', import.meta.url), 'utf8');
ok(
  /create unique index if not exists social_queue_slot_idx\s*\n\s*on public\.social_queue \(schedule_id, target_id, scheduled_at\);/.test(schema),
  'the slot index is still full and unique on the three columns — if it is ever made partial the upsert above must stop using onConflict inference, and this check is where that conversation starts',
);
const latest = readFileSync(new URL('../../supabase/social-latest.sql', import.meta.url), 'utf8');
ok(!/drop index if exists public\.social_queue_slot_idx/.test(latest) || /create unique index if not exists social_queue_slot_idx/.test(latest), 'and social-latest.sql does not drop it without re-creating it');

console.log(`✓ tombstoned-slot: ${checks} בדיקות עברו`);
