/*
 * "stuck_rows_requeued × 12"
 *
 * The owner's own activity log, 03:37, over a thirty-minute window:
 *
 *     stuck_rows_requeued  × 12   (אחרון 03:37:00)
 *     campaign_repeat_on   ×  4
 *     queue_rescheduled    ×  3
 *     needs_attention      ×  2
 *
 * and in the same half hour, not one `published`, not one `publish_failed`,
 * not one `worker_holding`. Twelve lines each announcing that stuck
 * publications had been freed and returned to the queue — one per two-minute
 * sweep, on the same seventeen rows, which were still sitting in 'publishing'
 * when he queried them afterwards.
 *
 * sweepStranded() did this:
 *
 *     await db.from('social_queue').update({ status: 'scheduled', … }).in('id', decided.requeue);
 *     await logActivity('info', 'stuck_rows_requeued',
 *       `${decided.requeue.length} פרסומים … שוחררו וחזרו לתור`, { requeued: decided.requeue.length });
 *
 * The UPDATE's result was never looked at. supabase-js does not throw on a
 * failed write — it RESOLVES, with `{ data: null, error: {...} }`. And an
 * UPDATE whose filter matches nothing resolves with `error: null`. So that log
 * line was computed from `decided.requeue.length`: the number of rows the
 * sweep WANTED to free. It said "שוחררו 17" whether seventeen rows changed or
 * none did, and it said it again every two minutes, for hours.
 *
 * This is the fifth severity-1 incident in this project from one bug class:
 * the machine does nothing and the screen says it did. The others were an
 * `upsert(…, { ignoreDuplicates: true })` returning `data: [], error: null`
 * and shrinking a round in silence; a `planned_until` stamp written after
 * every insert in the pass had failed; a bulk cancel bounded by a status
 * filter that matched nothing; and a count on the dashboard derived from the
 * requested array rather than the returned one.
 *
 * The fix is `applied(write, asked, what)`: it makes the database RETURN the
 * rows it changed, logs an error event when the write failed, logs a warning
 * when it landed on fewer rows than it asked for, and hands back a measured
 * number for the caller to report. What this test defends is not the helper —
 * it is the rule that no success line in this file may ever again be written
 * from an intent.
 *
 * Source-level assertions, deliberately: reproducing it needs a live Supabase
 * project with a policy that silently rejects the write. What a test CAN do is
 * refuse to let the shape back in.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');

/*
 * The same file with every comment removed. This file explains at length the
 * exact lines it forbids, so a bare search finds its own prose and passes on
 * nothing — that has happened four times in this project already.
 */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

/** The body of a named function in the comment-stripped source. */
function body(name: string): string {
  const at = Math.max(code.indexOf(`function ${name}(`), code.indexOf(`function ${name}<`));
  assert.ok(at > -1, `${name} is gone — re-point this test rather than deleting it`);
  const next = code.indexOf('\nasync function ', at + 10);
  const next2 = code.indexOf('\nfunction ', at + 10);
  const end = [next, next2].filter((n) => n > -1).sort((a, b) => a - b)[0] ?? code.length;
  return code.slice(at, end);
}

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};

/* ───────────── one: the helper measures, rather than assumes ─────────────── */

const applied = body('applied');

ok(
  /\.select\('id'\)/.test(applied),
  "applied() asks the database to RETURN what it changed — without .select() a supabase update resolves with data: null and the count is unknowable",
);
ok(
  /\{\s*data,\s*error\s*\}\s*=\s*await write\.select\('id'\)/.test(applied),
  'and it destructures BOTH data and error: a write that failed and a write that matched nothing are different answers arriving in the same promise',
);
ok(
  /data\?\.length \?\? 0/.test(applied),
  'the number it returns comes from the returned rows, never from the caller\'s input array — that substitution is the whole bug',
);
ok(
  /if \(error\)[\s\S]{0,400}return 0;/.test(applied),
  'a failed write counts as zero rows, so the caller writes no success line at all',
);
ok(
  /logActivity\('error', 'write_failed'/.test(applied),
  "a failed write raises an 'error'-level write_failed event — the owner's NotificationBell shows anything that is not level 'info'",
);
ok(
  /landed < asked/.test(applied) && /'write_partial'/.test(applied),
  'a write that lands on fewer rows than it asked for is reported with BOTH numbers: row-level security, a check constraint and a concurrent claim all look exactly like this and are invisible otherwise',
);
ok(
  /catch \(err\)[\s\S]{0,200}safeError\(err\)/.test(applied),
  'and it never throws — a sweep that cannot free a row must not take the publishing loop down with it',
);

/* ─────────── two: the sweep reports what landed, not what it wanted ─────── */

const sweep = body('sweepStranded');

ok(
  /await applied\(/.test(sweep),
  'sweepStranded() routes its writes through applied() — this is the function whose log lied twelve times in thirty minutes',
);
ok(
  (sweep.match(/const landed = await applied\(/g) ?? []).length === 2,
  'both of its branches do — the park branch ("אולי כבר עלה") and the requeue branch, because either one lying is the same incident',
);

/*
 * THE SUBSTITUTION ITSELF, FORBIDDEN BY NAME.
 *
 * `decided.requeue.length` and `decided.park.length` are legitimate in the
 * `if (…)` guards and as the `asked` argument — that is what they are for.
 * What may never happen again is one of them reaching a logActivity message or
 * meta field, because that is a sentence to a person built from an intention.
 */
for (const branch of ['park', 'requeue']) {
  const at = sweep.indexOf(`if (decided.${branch}.length)`);
  ok(at > -1, `the ${branch} branch is still here — re-point this test rather than deleting it`);
  const rest = sweep.slice(at);
  const logAt = rest.indexOf('logActivity');
  ok(logAt > -1, `the ${branch} branch still tells the owner what happened`);
  const logLine = rest.slice(logAt, rest.indexOf('\n    }', logAt) + 1 || rest.length);
  ok(
    !new RegExp(`decided\\.${branch}\\.length`).test(logLine),
    `the ${branch} branch's log line must not be built from decided.${branch}.length — that is the number of rows it HOPED to change`,
  );
  ok(
    /\$\{landed\}/.test(logLine),
    `the ${branch} branch's message prints the measured count`,
  );
  ok(
    /: landed/.test(logLine),
    `and its meta carries the measured count too, so the feed and the query agree`,
  );
}

ok(
  (sweep.match(/if \(landed > 0\)/g) ?? []).length === 2,
  'and a write that changed nothing writes NO line: twelve cheerful lines about rows that never moved is worse than silence, because silence is at least true',
);

/* ─────────── three: asked is the intent, and still passed in ───────────── */

ok(
  /applied\(\s*db[\s\S]{0,700}decided\.park\.length,\s*'stuck_rows_released',/.test(sweep),
  'the park branch tells applied() how many it asked for, so a partial write can be detected at all',
);
ok(
  /applied\(\s*db[\s\S]{0,500}decided\.requeue\.length,\s*'stuck_rows_requeued',/.test(sweep),
  'and so does the requeue branch — with the event name, so write_partial says WHICH write was short',
);

/* ─────────── four: the sweep still cannot re-queue a live post ─────────── */

/*
 * Unrelated to the lie, and the one rule in this file that outranks recovery.
 * A honest count is no use if the thing being counted is a double post.
 */
ok(
  /MAYBE_LIVE_STEPS/.test(readFileSync(new URL('../stranded.ts', import.meta.url), 'utf8')),
  'a row whose post may already be on Facebook is still parked for a person, never re-queued',
);
ok(
  /status: 'needs_attention',\s*step: 'submitted',/.test(sweep),
  "and it is parked with step 'submitted', which resumeNeedsAttention() deliberately skips",
);

console.log(`✓ honest-write: ${checks} בדיקות עברו`);
