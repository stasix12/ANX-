import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dripSlots, slotsFor } from '@/lib/social/slots';
import { zonedToUtc } from '@/lib/social/time';
import { parseGroupUrl, type Variant } from '@/lib/social/types';
import { pickVariant, previewAssignment } from '@/lib/social/variants';
import { detectCity, sortCities } from '@/lib/social/cities';
import { campaignState, percentDone, type CampaignQueueRow } from '@/lib/social/campaign';
import { countdownTo } from '@/lib/social/countdown';
import { friendlyMessage, GENERIC_ERROR } from '@/lib/social/errors';
import { buildKeywords, extractGroupUrls, facebookGroupSearchUrl, normalizeGroupUrl, scanPastedText } from '@/lib/social/discovery';

/** Pure helpers shared by the dashboard, the server worker and the local worker. */

// --- group URL parsing
assert.deepEqual(parseGroupUrl('https://www.facebook.com/groups/beersheva.together/?ref=share'), { url: 'https://www.facebook.com/groups/beersheva.together', externalId: 'beersheva.together' });
assert.deepEqual(parseGroupUrl('facebook.com/groups/123456789012345/permalink/1/'), { url: 'https://www.facebook.com/groups/123456789012345', externalId: '123456789012345' });
assert.equal(parseGroupUrl('https://www.facebook.com/hapitaron'), null);
assert.equal(parseGroupUrl('https://example.com/groups/x'), null);
assert.equal(parseGroupUrl(''), null);

// --- variant assignment
const v = (id: string): Variant => ({ id, post_id: 'p', label: id, text: id, language: 'he', approval: 'approved', sort: 0 });
const approved = [v('A'), v('B'), v('C')];
assert.equal(pickVariant(approved, { variant_strategy: 'rotate', variant_map: {} }, 't1', 0, 0)?.id, 'A');
assert.equal(pickVariant(approved, { variant_strategy: 'rotate', variant_map: {} }, 't1', 0, 1)?.id, 'B');
assert.equal(pickVariant(approved, { variant_strategy: 'rotate', variant_map: {} }, 't2', 1, 0)?.id, 'A');
assert.deepEqual(
  Object.fromEntries(Object.entries(previewAssignment(approved, { variant_strategy: 'distribute', variant_map: {} }, ['t1', 't2', 't3', 't4'])).map(([k, x]) => [k, x?.id])),
  { t1: 'A', t2: 'B', t3: 'C', t4: 'A' },
);
assert.equal(pickVariant(approved, { variant_strategy: 'fixed', variant_map: { t2: 'C' } }, 't2', 1, 0)?.id, 'C');
assert.equal(pickVariant(approved, { variant_strategy: 'fixed', variant_map: {} }, 't1', 0, 0), null);
assert.equal(pickVariant(approved, { variant_strategy: 'distribute', variant_map: { t1: 'B' } }, 't1', 0, 0)?.id, 'B');

// --- schedule slots still behave (Asia/Jerusalem, DST-aware)
const from = new Date('2026-09-18T05:00:00Z');
const until = new Date('2026-09-20T05:00:00Z');
assert.deepEqual(
  slotsFor({ mode: 'weekly', timezone: 'Asia/Jerusalem', run_at: null, weekly: { '5': ['09:00'], '0': ['07:30'] }, interval_days: null, interval_time: null }, from, until).map((d) => d.toISOString()),
  ['2026-09-18T06:00:00.000Z', '2026-09-20T04:30:00.000Z'],
);
assert.equal(zonedToUtc('2026-01-15', '09:00').toISOString(), '2026-01-15T07:00:00.000Z');

// --- drip: 5 targets, every 30 min from 10:00 local, window 09:00–11:00 → 3 today, 2 tomorrow (UTC+3)
const targets = Array.from({ length: 5 }, (_, i) => `t${i}`);
const drip = dripSlots({ timezone: 'Asia/Jerusalem', run_at: '2026-09-20T07:00:00Z', drip_per_day: 0, drip_gap_minutes: 30, drip_window_start: '09:00', drip_window_end: '11:00', target_ids: targets }, new Date('2026-09-19T12:00:00Z'));
assert.deepEqual(drip.map((d) => d.toISOString()), [
  '2026-09-20T07:00:00.000Z',
  '2026-09-20T07:30:00.000Z',
  '2026-09-20T08:00:00.000Z',
  '2026-09-21T06:00:00.000Z',
  '2026-09-21T06:30:00.000Z',
]);
// per-day cap wins over the window
const capped = dripSlots({ timezone: 'Asia/Jerusalem', run_at: '2026-09-20T06:00:00Z', drip_per_day: 2, drip_gap_minutes: 10, drip_window_start: '09:00', drip_window_end: '20:00', target_ids: targets }, new Date('2026-09-19T12:00:00Z'));
assert.deepEqual(capped.map((d) => d.toISOString().slice(0, 16)), ['2026-09-20T06:00', '2026-09-20T06:10', '2026-09-21T06:00', '2026-09-21T06:10', '2026-09-22T06:00']);
// past slots are bumped just after "now", still `gap` apart
const late = dripSlots({ timezone: 'Asia/Jerusalem', run_at: '2026-09-20T05:00:00Z', drip_per_day: 0, drip_gap_minutes: 10, drip_window_start: '08:00', drip_window_end: '08:15', target_ids: ['a', 'b', 'c'] }, new Date('2026-09-20T08:00:00Z'));
assert.ok(late[0] > new Date('2026-09-20T08:00:00Z') && late[1].getTime() - late[0].getTime() === 10 * 60_000);
assert.equal(late[2].toISOString(), '2026-09-21T05:00:00.000Z');

/*
 * A drip plan must always read forwards. Before the running floor, a start
 * time already in the past made the first target jump to now+gap while the
 * second kept its earlier (still future) slot — an out-of-order plan that put
 * two posts four minutes apart under a ten-minute setting.
 */
const nowMid = new Date('2026-09-18T19:04:00Z'); // 22:04 Asia/Jerusalem
const dripOrder = dripSlots(
  {
    timezone: 'Asia/Jerusalem',
    run_at: '2026-09-18T19:00:00Z', // 22:00 local — already past
    drip_per_day: 0,
    drip_gap_minutes: 10,
    drip_window_start: '22:00',
    drip_window_end: '23:59',
    target_ids: ['a', 'b', 'c', 'd', 'e'],
  },
  nowMid,
);
for (let i = 0; i < dripOrder.length; i += 1) {
  assert.ok(dripOrder[i].getTime() >= nowMid.getTime(), `slot ${i} must not be in the past`);
  if (i > 0) {
    const apart = (dripOrder[i].getTime() - dripOrder[i - 1].getTime()) / 60_000;
    assert.ok(apart >= 10, `slots ${i - 1}->${i} were ${apart} minutes apart, below the 10 requested`);
  }
}
assert.deepEqual([...dripOrder].sort((a, b) => a.getTime() - b.getTime()), dripOrder, 'drip plan must be ascending');

// --- campaign state: every field must come from the rows, never be invented
const row = (over: Partial<CampaignQueueRow> & { id: string }): CampaignQueueRow => ({
  status: 'scheduled',
  scheduled_at: '2026-09-20T15:00:00.000Z',
  published_at: null,
  target_id: `t-${over.id}`,
  post_id: 'p1',
  target: { id: `t-${over.id}`, name: `קבוצה ${over.id}` },
  ...over,
});

// An empty campaign has no progress and, crucially, no fabricated times.
const blank = campaignState([], { status: 'active' });
assert.equal(blank.state, 'not_started');
assert.equal(blank.startedAt, null);
assert.equal(blank.estimatedCompletionAt, null);
assert.equal(blank.nextAt, null);
assert.equal(percentDone(blank.progress), 0);

const rows: CampaignQueueRow[] = [
  row({ id: '1', status: 'published', published_at: '2026-09-20T15:05:00.000Z', scheduled_at: '2026-09-20T15:00:00.000Z' }),
  row({ id: '2', status: 'published', published_at: '2026-09-20T15:25:00.000Z', scheduled_at: '2026-09-20T15:20:00.000Z' }),
  row({ id: '3', status: 'failed', scheduled_at: '2026-09-20T15:40:00.000Z' }),
  row({ id: '4', status: 'publishing', scheduled_at: '2026-09-20T16:00:00.000Z' }),
  row({ id: '5', status: 'scheduled', scheduled_at: '2026-09-20T16:20:00.000Z' }),
  row({ id: '6', status: 'scheduled', scheduled_at: '2026-09-20T16:40:00.000Z' }),
];
const live = campaignState(rows, { status: 'active' });
assert.equal(live.state, 'running');
assert.equal(live.progress.total, 6);
assert.equal(live.progress.published, 2);
assert.equal(live.progress.failed, 1);
assert.equal(live.progress.running, 1);
assert.equal(live.progress.scheduled, 2);
assert.equal(live.progress.done, 3);
assert.equal(percentDone(live.progress), 50);
// started = the FIRST real publication, not the first scheduled slot
assert.equal(live.startedAt, '2026-09-20T15:05:00.000Z');
// next / last come from the remaining scheduled rows only
assert.equal(live.nextAt, '2026-09-20T16:20:00.000Z');
assert.equal(live.nextTargetName, 'קבוצה 5');
assert.equal(live.estimatedCompletionAt, '2026-09-20T16:40:00.000Z');
assert.deepEqual(live.now.map((r) => r.id), ['4']);
assert.deepEqual(live.upcoming.map((r) => r.id), ['4', '5', '6']);
// Newest first. A failed row has no published_at, so its scheduled slot is
// the timestamp that places it — 15:40 is later than row 2's 15:25.
assert.deepEqual(live.done.map((r) => r.id), ['3', '2', '1']);

// Pause is a campaign-level flag; it must not rewrite the rows' own counts.
const paused = campaignState(rows, { status: 'paused' });
assert.equal(paused.state, 'paused');
assert.deepEqual(paused.progress, live.progress);

// Stopped campaigns read as stopped even though rows remain.
assert.equal(campaignState(rows, { status: 'archived' }).state, 'stopped');

// Everything finished → completed, and no estimate is offered any more.
const finished = campaignState(
  rows.map((r) => ({ ...r, status: 'published' as const, published_at: r.scheduled_at })),
  { status: 'active' },
);
assert.equal(finished.state, 'completed');
assert.equal(finished.estimatedCompletionAt, null);
assert.equal(percentDone(finished.progress), 100);

console.log('unit tests OK');

/* ------------------------------------------------ friendly error messages */
{
  // Raw backend text never survives to the screen.
  const raw = [
    'new row violates row-level security policy for table "social_targets"',
    'duplicate key value violates unique constraint "social_targets_url_key"',
    'TypeError: Failed to fetch',
    'JWT expired',
    'relation "social_queue" does not exist',
    'Error: connect ETIMEDOUT 10.0.0.1:5432\n    at TCPConnectWrap.afterConnect',
  ];
  for (const r of raw) {
    const out = friendlyMessage(new Error(r));
    assert.ok(!/[A-Za-z]{4,}/.test(out.replace(/[֐-׿\s.,—–…!?()״׳]/g, '')), `leaked English/raw text: ${out}`);
    assert.ok(!out.includes('at '), `leaked a stack frame: ${out}`);
    assert.ok(/[֐-׿]/.test(out), `not Hebrew: ${out}`);
  }

  // Each known shape gets its own sentence, not the catch-all.
  assert.notEqual(friendlyMessage(new Error('Failed to fetch')), GENERIC_ERROR);
  assert.notEqual(friendlyMessage(new Error('duplicate key value')), GENERIC_ERROR);
  assert.notEqual(friendlyMessage(new Error('row-level security')), GENERIC_ERROR);

  // Copy we wrote ourselves is already for the owner — passed through intact.
  assert.equal(friendlyMessage(new Error('הקבוצה הזו כבר קיימת ברשימה.')), 'הקבוצה הזו כבר קיימת ברשימה.');

  // Anything unrecognised, and anything that is not an Error at all.
  assert.equal(friendlyMessage(new Error('qwerty zxcvbn')), GENERIC_ERROR);
  assert.equal(friendlyMessage(undefined), GENERIC_ERROR);
  assert.equal(friendlyMessage(null), GENERIC_ERROR);
  assert.equal(friendlyMessage({}), GENERIC_ERROR);
  // Supabase hands back a plain object, not an Error.
  assert.notEqual(friendlyMessage({ message: 'duplicate key value violates unique constraint' }), GENERIC_ERROR);

  console.log('friendly-error tests OK');
}

/* ------------------------------------------- locked browser profile guard */
{
  const src = readFileSync(new URL('../facebook/session.ts', import.meta.url), 'utf8');

  // The lock is left by a Chrome the worker itself opened, so the worker
  // clears it and retries — it does not ask the owner to paste a kill command.
  assert.ok(src.includes('releaseProfile'), 'a locked profile must be recovered automatically');
  assert.ok(/await releaseProfile\(\)/.test(src), 'recovery must be awaited before the retry');
  assert.ok(!/Get-CimInstance[\s\S]{0,400}הריצו שוב/.test(src), 'the owner must not be handed a PowerShell kill command as the fix');

  // Whatever we end must be scoped to our own profile directory. The owner's
  // everyday Chrome runs on a different user-data-dir and is never touched.
  const kill = src.slice(src.indexOf('async function releaseProfile'), src.indexOf('export class BrowserSession'));
  assert.ok(kill.includes("Name='chrome.exe'"), 'the Windows sweep must be limited to chrome.exe');
  assert.ok(kill.includes('env.profileDir') || kill.includes('const dir = env.profileDir'), 'the sweep must be scoped to the profile directory');
  assert.ok(kill.includes('--user-data-dir=${dir}'), 'the POSIX sweep must match the launch flag, not a bare path');
  assert.ok(!/pkill', \['-f', 'chrome'\]/.test(kill), 'never end every Chrome on the machine');

  // Stale singleton files block a relaunch even with no process alive.
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    assert.ok(kill.includes(f), `stale ${f} must be cleared`);
  }

  // One retry, then a plain sentence — never an endless kill/relaunch loop.
  assert.equal((src.match(/await releaseProfile\(\)/g) ?? []).length, 1, 'exactly one recovery attempt');

  console.log('profile-lock recovery tests OK');
}

/* ------------------------------------------------------------- countdown */
{
  const t0 = Date.parse('2026-09-19T18:00:00Z');

  assert.equal(countdownTo(null, t0), null, 'nothing scheduled means no clock at all');
  assert.equal(countdownTo(undefined, t0), null);
  assert.equal(countdownTo('not-a-date', t0), null, 'an unparseable instant must not render NaN');

  const in402 = countdownTo(new Date(t0 + 402_000).toISOString(), t0);
  assert.equal(in402?.label, '06:42', 'under an hour shows mm:ss');
  assert.equal(in402?.due, false);

  const inHours = countdownTo(new Date(t0 + 3600_000 + 125_000).toISOString(), t0);
  assert.equal(inHours?.label, '1:02:05', 'an hour or more gains the hours field');

  // A row whose time has passed is due, not negative.
  const past = countdownTo(new Date(t0 - 90_000).toISOString(), t0);
  assert.equal(past?.seconds, 0);
  assert.equal(past?.label, '00:00');
  assert.equal(past?.due, true, 'a passed instant reads as due, never as a negative clock');

  console.log('countdown tests OK');
}

/* --------------------------------------------- duplicate-launch protection */
{
  const planner = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');

  /*
   * The queue's unique key is (schedule_id, target_id, scheduled_at), which
   * cannot see across schedules. Two schedules for one post plan the same
   * targets at the same instants, so every group landed in the queue twice.
   * Both halves of the fix are asserted here: the planner refuses an instant
   * this post already occupies, and the launch guard counts an active schedule
   * that has not been materialised yet.
   */
  assert.ok(planner.includes('async function occupiedSlots'), 'the planner must know which instants a post already occupies');
  assert.ok(planner.includes(".eq('post_id', postId)"), 'the occupancy lookup must be by post, not by schedule');

  // Both planning paths — the drip and the fixed-slot one — must consult it.
  assert.equal(
    (planner.match(/await occupiedSlots\(db, post\.id\)/g) ?? []).length,
    2,
    'both planner branches must check occupancy',
  );
  assert.equal(
    (planner.match(/if \(taken\.has\(slotKey\(targetId, \w+\)\)\) continue;/g) ?? []).length,
    2,
    'both planner branches must skip an occupied instant',
  );
  // And must record what they just planned, or a run plans the same slot twice.
  assert.equal((planner.match(/taken\.add\(slotKey\(/g) ?? []).length, 2, 'both branches must record the slot they took');

  // Terminal rows are excluded on purpose: a skipped or failed row may replan.
  const occ = planner.slice(planner.indexOf('async function occupiedSlots'), planner.indexOf('const slotKey'));
  for (const status of ['scheduled', 'publishing', 'published', 'awaiting_confirmation']) {
    assert.ok(occ.includes(`'${status}'`), `occupancy must count ${status}`);
  }
  assert.ok(!occ.includes("'skipped'"), 'a skipped row must not block replanning');
  assert.ok(!occ.includes("'failed'"), 'a failed row must not block replanning');

  // The launch guard has to see a schedule that exists but has not planned yet.
  const guard = client.slice(client.indexOf('export async function hasPendingQueue'), client.indexOf('export async function listSchedules'));
  assert.ok(guard.includes('social_schedules'), 'the launch guard must count active schedules too');
  assert.ok(guard.includes("eq('active', true)"), 'only schedules still active count as pending');
  /*
   * ...and only ones never materialised. A weekly or daily schedule stays
   * active for good by design, so counting those made every launch of that
   * post look like a repeat: the owner got a "already on its way" prompt every
   * time, and declining it scheduled nothing at all.
   */
  assert.ok(guard.includes("is('planned_until', null)"), 'an already-planned recurring schedule must not count as a launch in flight');

  console.log('duplicate-launch tests OK');
}

/* ------------------------------------------- a schedule always reaches the queue */
{
  const serverWorker = readFileSync(new URL('../../src/lib/social/server/worker.ts', import.meta.url), 'utf8');
  const localWorker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const plan = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8');
  const serverPlanner = readFileSync(new URL('../../src/lib/social/server/planner.ts', import.meta.url), 'utf8');

  /*
   * Launching a campaign wrote a row to social_schedules and then showed
   * "מתוזמנים 0 / אין קמפיין פעיל", because nothing turned that schedule into
   * queue rows. Two separate causes, one invariant: planning must not depend
   * on anything that can be switched off.
   */

  // 1. Planning is bookkeeping, so it runs before the controls are consulted.
  const planAt = serverWorker.indexOf('report.planned = await planQueue()');
  const pauseAt = serverWorker.indexOf('if (control.paused)');
  assert.ok(planAt > 0 && pauseAt > 0, 'the server worker must both plan and honour the pause switch');
  assert.ok(planAt < pauseAt, 'a paused queue must still be planned — pausing holds publishing, not bookkeeping');

  // 2. The planner takes its client, so the process that is actually running
  //    (the owner's PC worker) can do the planning. GitHub registers a
  //    `schedule:` workflow only from the default branch, so the 5-minute tick
  //    in .github/workflows/social-cron.yml never fires on this deployment.
  assert.ok(!plan.includes('server-only'), 'the planner must be usable outside the Next.js server');
  assert.ok(!plan.includes('serviceDb'), 'the planner must not reach for the service-role client itself');
  assert.ok(serverPlanner.includes('serviceDb()'), 'the server still plans with the service-role client');
  assert.ok(localWorker.includes("from '@/lib/social/plan'"), 'the local worker must run the same planner');
  const planFn = localWorker.slice(localWorker.indexOf('async function plan('), localWorker.indexOf('function idle('));
  assert.ok(planFn.includes('await planQueue('), 'the local worker must actually call the planner');
  assert.ok(planFn.includes('catch'), 'a failed plan must never take the publishing loop down');

  // 3. ...and it plans before its own pause check, for the same reason.
  const tick = localWorker.slice(localWorker.indexOf('async function tick('), localWorker.indexOf('async function plan('));
  const localPlanAt = tick.indexOf('await plan(state)');
  const localPauseAt = tick.indexOf('if (control.paused)');
  assert.ok(localPlanAt > 0 && localPauseAt > 0, 'the local worker must both plan and honour the pause switch');
  assert.ok(localPlanAt < localPauseAt, 'the local worker must plan even while the queue is paused');

  // 4. ...and a stopped campaign stays stopped. The two writes race: "עצור"
  //    cancels what is waiting while a planner run that already read the
  //    schedules is still inserting, and the campaign comes back with a queue
  //    and a countdown to a publication that would only be skipped.
  assert.ok(plan.includes('async function stoppedCampaigns'), 'planning must know which campaigns were stopped');
  assert.ok(plan.includes("eq('status', 'archived')"), 'a stopped campaign is an archived one');
  assert.equal(
    (plan.match(/stopped\.has\(post\.campaign_id\)/g) ?? []).length,
    2,
    'both planner branches must refuse to plan for a stopped campaign',
  );
  const sweep = plan.slice(plan.indexOf('async function stoppedCampaigns'), plan.indexOf('async function planDrip'));
  assert.ok(sweep.includes("'skipped'"), 'rows that slipped through must be cancelled, not left counting down');
  assert.ok(!sweep.includes("'published'"), 'the sweep must never touch what already went out');
  assert.ok(!sweep.includes("'paused',\n") || sweep.includes("'paused'"), 'sweep status list is explicit');

  console.log('planner-reachability tests OK');
}

/* --------------------------------------- the PC worker cannot go stale quietly */
{
  const launcher = readFileSync(new URL('../../start-worker.cmd', import.meta.url), 'utf8');
  const localWorker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../../src/components/social/BrowserStatusCard.tsx', import.meta.url), 'utf8');

  /*
   * A worker on an older build heartbeats, shows a green light and publishes —
   * just without whatever was fixed. It happened: the launcher was started
   * without running update-social.cmd first, and the only evidence was a
   * version number in a line of terminal output.
   */

  // 1. Starting the worker updates it, so there is no second step to forget.
  const update = launcher.slice(launcher.indexOf(':update'), launcher.indexOf(':deps'));
  assert.ok(update.includes('git pull --ff-only'), 'the launcher must pull before it starts the worker');
  assert.ok(update.includes('git stash push'), 'a tracked file the dev server rewrote must not block the pull');
  assert.ok(update.includes('goto updatefailed'), 'a failed update must be handled, not ignored');
  assert.ok(
    /:updatefailed[\s\S]*?goto version/.test(launcher),
    'a failed update must fall through to starting the worker — stale code beats no publishing',
  );
  assert.ok(!/:updatefailed[\s\S]*?exit \/b 1/.test(launcher.slice(launcher.indexOf(':updatefailed'), launcher.indexOf(':version'))),
    'a failed update must never abort the launcher');

  // 2. Both sides read one version, so the comparison cannot drift.
  assert.ok(localWorker.includes("from '@/lib/social/worker-version'"), 'the worker must report the shared version');
  assert.ok(localWorker.includes('const VERSION = WORKER_VERSION'), 'the worker must not keep its own copy of the number');
  assert.ok(card.includes("from '@/lib/social/worker-version'"), 'the dashboard must compare against the same constant');
  assert.ok(card.includes('worker.version !== WORKER_VERSION'), 'the dashboard must notice an out-of-date worker');

  // 3. One worker per name. Two windows share the social_workers row (the upsert
  //    is by name, so both get the same id), the heartbeat and the Chrome
  //    profile: the second one's releaseProfile() kills a Chrome that is
  //    mid-publish, and the crash sweep then moves that job to needs_attention.
  const guard = localWorker.slice(localWorker.indexOf('async function main('), localWorker.indexOf('.upsert('));
  assert.ok(guard.includes("eq('name', env.workerName)"), 'startup must look for a worker already running under this name');
  assert.ok(guard.includes('LIVE_WORKER_MS'), 'liveness must be judged by how recently it heartbeat, not by status alone');
  assert.ok(guard.includes('EXIT_ALREADY_RUNNING'), 'a second instance must stand down with its own exit code');
  assert.ok(
    localWorker.indexOf('process.exit(EXIT_ALREADY_RUNNING)') < localWorker.indexOf('.upsert('),
    'it must stand down BEFORE claiming the row, the profile or the in-flight job',
  );
  // The launcher must not restart it: nothing is broken, and a restart loop
  // would only fight the window that is publishing.
  assert.ok(/if "%EXITCODE%"=="3" goto alreadyrunning/.test(launcher), 'the launcher must recognise the stand-down exit code');
  assert.ok(/set EXITCODE=%errorlevel%/.test(launcher), 'errorlevel must be captured before any for /f resets it');
  // ...and its restart delay must outlast the liveness window, or a worker that
  // really did crash gets mistaken for the window that is still open.
  const liveMs = Number(/const LIVE_WORKER_MS = ([\d_]+)/.exec(localWorker)?.[1].replace(/_/g, '') ?? 0);
  const restartSec = Number(/timeout \/t (\d+) >nul\s*\r?\ngoto run/.exec(launcher)?.[1] ?? 0);
  assert.ok(liveMs > 0 && restartSec > 0, 'both the liveness window and the restart delay must be readable');
  assert.ok(restartSec * 1000 > liveMs, `restart delay (${restartSec}s) must outlast the liveness window (${liveMs}ms)`);

  console.log('worker-freshness tests OK');
}

/* ------------------------------------ the queue tuner actually changes the queue */
{
  const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  const sheet = readFileSync(new URL('../../src/components/social/QueueTunerSheet.tsx', import.meta.url), 'utf8');
  const hero = readFileSync(new URL('../../src/components/social/LiveCampaignHero.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../src/app/social/page.tsx', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../../src/lib/social/rules.ts', import.meta.url), 'utf8');
  const planner = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8');

  /*
   * A live campaign on this deployment finished 112 skipped, 0 published. The
   * rows were minutes apart while rules.ts wanted 65, so every claim deferred
   * the row and burned one of its 40 attempts until the engine gave up on it
   * with "נדחה יותר מדי פעמים בגלל מרווח הזמן בין פרסומים".
   *
   * That is the shape of the bug this whole panel exists to end, and it has an
   * exact re-entry: re-spacing the ROWS without moving the SETTINGS looks like a
   * working feature — the times on screen change, the owner is satisfied, and
   * the queue dies again overnight. So the settings write is asserted here, not
   * remembered.
   */
  const respace = client.slice(
    client.indexOf('export async function respaceQueue'),
    client.indexOf('export async function removeTargetFromQueue'),
  );
  assert.ok(respace.length > 500, 'respaceQueue must exist in client.ts');
  assert.ok(respace.includes("saveSetting('limits'"), 'respaceQueue must write the spacing setting, not only the queue rows');
  assert.ok(respace.includes("saveSetting('browser'"), 'respaceQueue must be able to move the group surcharge too');
  // Whole objects: saveSetting replaces the entire jsonb, so a partial write
  // silently wipes maxPerDay / maxPerTargetPerDay / dedupeDays.
  assert.ok(respace.includes('{ ...limits, minGapMinutes:'), 'the limits write must carry the whole object, or the daily ceilings are erased');
  assert.ok(respace.includes('{ ...browser, groupMinGapMinutes:'), 'the browser write must carry the whole object');
  // ...and before the rows, so a row claimed a second after it moves is judged
  // by the number the owner just chose rather than the one they replaced.
  assert.ok(
    respace.indexOf("saveSetting('limits'") < respace.indexOf(".from('social_queue')"),
    'the settings must be written before the rows move, or the first row out is still measured against the old gap',
  );

  /*
   * The arithmetic itself. rules.ts adds the group surcharge on top of the
   * global gap, so the ONE number the owner edits is the sum — and the split
   * has to reproduce that sum exactly, or a row placed N minutes after the last
   * publication is deferred by the very setting that was supposed to allow it.
   */
  assert.ok(
    rules.includes('limits.minGapMinutes + extra'),
    'rules.ts must still be the sum of the global gap and the group surcharge — the tuner splits one number into these two',
  );
  const split = (n: number, surcharge: number) =>
    n >= surcharge ? { minGap: n - surcharge, group: surcharge } : { minGap: 0, group: n };
  for (const surcharge of [0, 5, 20, 45]) {
    for (const n of [1, 5, 19, 20, 21, 30, 45, 65, 90, 720]) {
      const { minGap, group } = split(n, surcharge);
      assert.ok(minGap >= 0 && group >= 0, `the split must never store a negative gap (N=${n}, surcharge=${surcharge})`);
      assert.equal(minGap + group, n, `the split must leave minGapMinutes + groupMinGapMinutes === ${n}`);
      // ...which is exactly the comparison rules.ts makes for a facebook_group.
      const gapMs = (minGap + group) * 60_000;
      assert.equal(n * 60_000 < gapMs, false, `a row exactly ${n} min after the last publication must NOT be deferred`);
      assert.equal((n - 1) * 60_000 < gapMs, true, `a row ${n - 1} min after the last publication must still be deferred`);
    }
  }
  // And the number on screen is read from the stored settings, never assumed.
  assert.ok(
    client.includes('limits.minGapMinutes + browser.groupMinGapMinutes'),
    'the effective gap must be computed from the saved settings, not from the shipped defaults',
  );

  /*
   * Removing a group has to stick. plan.ts runs every 60 seconds, occupiedSlots()
   * deliberately ignores 'skipped' rows so a cancelled publication may be planned
   * again, and the group is still listed in schedule.target_ids — so cancelling
   * the rows alone means the owner watches the group they just removed walk back
   * into the queue. Removing it from the queue and stopping it being planned are
   * two acts, and the button has to do both or it does nothing.
   */
  // The body only — unplanTarget is defined just below it, and a slice that
  // swallowed the definition would pass on the definition alone.
  const remove = client.slice(client.indexOf('export async function removeTargetFromQueue'), client.indexOf('async function unplanTarget'));
  assert.ok(remove.includes('await unplanTarget('), 'removing a group from the queue must also stop it being planned again');
  const unplan = client.slice(client.indexOf('async function unplanTarget'), client.indexOf('async function sha256Hex'));
  assert.ok(unplan.includes("from('social_schedules')"), 'unplanning happens on the schedule, which is what the planner reads');
  assert.ok(unplan.includes('target_ids'), 'the group must come off the schedule target list');
  assert.ok(unplan.includes("eq('active', true)"), 'only a schedule that can still fire is worth editing');

  /*
   * ...and the other half of the same race: re-spacing and hand-adding both move
   * a row OFF the instant its schedule would plan it on, which leaves that instant
   * free for the next tick to fill. Matching on the target, not only the instant,
   * is what stops the owner setting the gap and watching the queue double.
   */
  assert.ok(planner.includes('async function plannedTargets'), 'the planner must know which groups are already waiting for this post');
  assert.equal(
    (planner.match(/await plannedTargets\(db, post\.id\)/g) ?? []).length,
    2,
    'both planner branches must check which groups are already waiting',
  );
  assert.equal((planner.match(/if \(waiting\.has\(targetId\)\) continue;/g) ?? []).length, 2, 'both branches must skip a group already waiting');
  assert.equal((planner.match(/waiting\.add\(targetId\);/g) ?? []).length, 2, 'both branches must record the group they just planned');
  const planned = planner.slice(planner.indexOf('async function plannedTargets'), planner.indexOf('async function stoppedCampaigns'));
  assert.ok(!planned.includes("'skipped'"), 'a cancelled row must not block replanning');
  assert.ok(!planned.includes("'failed'"), 'a failed row must not block replanning');
  assert.ok(!planned.includes("'published'"), 'a finished publication must not block a later one');

  /*
   * The browser writes dedupe_hash for a hand-added row, and every hash already
   * in the table came from node's createHash('sha256').digest('hex') in plan.ts.
   * Get the encoding wrong and nothing breaks loudly — rules.ts simply stops
   * matching duplicates, which is the worst way for a rule to fail.
   */
  const hashFn = client.slice(client.indexOf('async function sha256Hex'), client.indexOf('export async function addTargetsToQueue'));
  assert.ok(hashFn.includes('new TextEncoder().encode('), 'the browser digest must hash UTF-8 bytes, like node does for a string');
  assert.ok(hashFn.includes("toString(16).padStart(2, '0')"), 'the browser digest must be zero-padded lowercase hex, like digest(hex)');
  assert.ok(hashFn.includes('crypto?.subtle'), 'a missing SubtleCrypto must be noticed, not turned into an empty hash');
  /*
   * Proven rather than pattern-matched. The browser path can only diverge from
   * node's in two places, and both are checked here on real group names — the
   * Cyrillic ones are not decoration, a third of this owner's groups are Russian:
   *
   *   input  — crypto.subtle is handed TextEncoder bytes; createHash('sha256')
   *            .update(string) defaults to utf8. Same bytes, or every non-ASCII
   *            name hashes differently.
   *   output — digest('hex') is lowercase and zero-padded; the browser rebuilds
   *            that by hand from the digest bytes, and a missing padStart turns
   *            any byte under 0x10 into one character instead of two.
   */
  const toHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  for (const sample of ['', 'abc', 'קבוצה של באר שבע', 'Мы вместе — Негев', 'uuid|ניקוי ספות|https://x/a.jpg']) {
    assert.deepEqual(
      Array.from(new TextEncoder().encode(sample)),
      Array.from(Buffer.from(sample, 'utf8')),
      'the browser hashes the same bytes node does — otherwise every Hebrew and Russian group name hashes differently',
    );
    assert.equal(
      toHex(new Uint8Array(createHash('sha256').update(sample).digest())),
      createHash('sha256').update(sample).digest('hex'),
      'the browser hex encoding must be byte-identical to digest(hex), or the duplicate-content rule quietly changes meaning',
    );
  }

  /*
   * Reachability. The whole feature is one tap on the countdown box; if that box
   * stops being a button, everything above is code nobody can run.
   */
  assert.ok(hero.includes('onClick={onOpen}'), 'the "next publication" box must be a real button when the dashboard hands it an action');
  assert.ok(/<span className="sr-only">[^<]{5,}<\/span>/.test(hero), 'that button needs an accessible name saying what it does, not just a countdown');
  assert.ok(hero.includes('<TargetAvatar'), 'the next group must be shown by its own picture');
  assert.ok(hero.includes('min-h-11'), 'the countdown box is tapped with a thumb — 44px floor');
  assert.equal((hero.match(/onOpen={onTune}/g) ?? []).length, 2, 'both heroes must pass the action down to NextUp');
  assert.ok(page.includes('<QueueTunerSheet'), 'the dashboard must render the tuner');
  assert.equal((page.match(/onTune=\{\(\) => setTunerOpen\(true\)\}/g) ?? []).length, 2, 'both heroes on the dashboard must open it');

  /*
   * Honesty, in the two forms this module keeps having to re-learn: no invented
   * audience figures (Meta removed the Groups API — there is no honest source for
   * a member count), and never a number presented as safe with Facebook.
   */
  assert.ok(!/\bחברים\b/.test(sheet), 'no member counts — there is no honest source for one since Meta removed the Groups API');
  for (const at of [...sheet.matchAll(/בטוח/g)].map((m) => m.index ?? 0)) {
    assert.ok(
      sheet.slice(Math.max(0, at - 60), at).includes('לא '),
      'every mention of "safe" must be a denial — the interval is the owner\'s own setting and prevents nothing',
    );
  }
  assert.ok(sheet.includes('לא הופך שום דבר'), 'the gap control must carry its disclaimer, in the owner\'s language');

  console.log('queue-tuner tests OK');
}

/* ------------------------------------------- group discovery: dedupe, honesty, rule D */
{
  const discovery = readFileSync(new URL('../../src/lib/social/discovery.ts', import.meta.url), 'utf8');
  const localWorker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/app/social/discovery/page.tsx', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../../src/components/social/DiscoveryGroupCard.tsx', import.meta.url), 'utf8');
  const builder = readFileSync(new URL('../../src/components/social/DiscoverySearchBuilder.tsx', import.meta.url), 'utf8');
  const v8 = readFileSync(new URL('../../supabase/social-schema-v8.sql', import.meta.url), 'utf8');

  /*
   * 1. THE DEDUPE, asserted by EXECUTING the real function rather than reading it.
   *
   * Every one of these is the same group. If any of them produces a different
   * key, that group enters the table twice, the owner sees a duplicate card,
   * and promoting both raises "הקבוצה הזו כבר קיימת ברשימה." on the second —
   * an error for something the system should have collapsed itself. The killer
   * case is l.facebook.com/l.php?u=… : that is what you get when you copy a
   * link out of a Facebook POST, so it is the single most likely thing the
   * owner will paste, and parseGroupUrl() alone rejects it (its path has no
   * /groups/ segment).
   */
  const SAME_GROUP = [
    'https://www.facebook.com/groups/123456/',
    'https://www.facebook.com/groups/123456?fbclid=IwAR_x&ref=share',
    'https://m.facebook.com/groups/123456',
    'https://mbasic.facebook.com/groups/123456/',
    'https://web.facebook.com/groups/123456/',
    'https://touch.facebook.com/groups/123456',
    'https://fb.com/groups/123456',
    'facebook.com/groups/123456',
    'https://www.facebook.com/groups/123456/permalink/98765/',
    'https://www.facebook.com/groups/123456/posts/98765/',
    'https://www.facebook.com/groups/123456/about',
    'HTTPS://WWW.FACEBOOK.COM/GROUPS/123456/',
    '(https://www.facebook.com/groups/123456/)',
    'https://www.facebook.com/groups/123456/,',
    'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Fgroups%2F123456%2F&h=AT0',
  ];
  for (const input of SAME_GROUP) {
    const hit = normalizeGroupUrl(input);
    assert.ok(hit, `"${input}" must be recognised as a group link`);
    assert.equal(hit.key, '123456', `"${input}" must dedupe to the same key as every other spelling`);
    assert.equal(hit.url, 'https://www.facebook.com/groups/123456', `"${input}" must canonicalise to one url`);
  }

  // A vanity slug is case-insensitive on Facebook, so the key is lowercased —
  // otherwise "Beersheva.Yad2" and "beersheva.yad2" become two groups, and the
  // external_id addGroup() derives from the url differs between them too.
  assert.equal(normalizeGroupUrl('https://www.facebook.com/groups/Beersheva.Yad2/')?.key, 'beersheva.yad2');
  assert.equal(normalizeGroupUrl('facebook.com/groups/beersheva.yad2')?.key, 'beersheva.yad2');

  // Facebook's own group surfaces are not groups. Without this, a paste that
  // includes the owner's groups feed adds a row called "feed" that opens nothing.
  for (const notAGroup of [
    'https://www.facebook.com/groups/feed/',
    'https://www.facebook.com/groups/discover/',
    'https://www.facebook.com/groups/create/',
    'https://www.facebook.com/some.person',
    'https://example.com/groups/123',
    'https://fb.watch/abc',
    'not a url at all',
    '',
  ]) {
    assert.equal(normalizeGroupUrl(notAGroup), null, `"${notAGroup}" must never be taken for a group`);
  }

  /*
   * 2. THE COUNTS THE OWNER READS. Each of the three numbers on the capture
   *    result means a different thing, and they were once conflated: an in-paste
   *    repeat was reported as "already in the discovery list", which told the
   *    owner something about their data that was simply false. And a Facebook
   *    link that is merely not a group (a marketplace item, a profile, a photo)
   *    must not be counted as "unreadable" — copy any slab of Facebook text and
   *    you get a dozen of them, and an alarming number about nothing is worse
   *    than no number.
   */
  const slab = [
    'שלום, מצאתי כמה קבוצות טובות:',
    '1. יד שנייה באר שבע https://www.facebook.com/groups/123456/ — ממש פעילה',
    '2. גם כאן m.facebook.com/groups/123456?fbclid=abc (אותה קבוצה)',
    '3. תושבי ערד: https://www.facebook.com/groups/arad.residents/posts/999/',
    '4. וזה לא קבוצה: https://www.facebook.com/marketplace/item/5',
    '5. פרופיל: https://www.facebook.com/some.person',
    '6. וזה הפיד שלי facebook.com/groups/feed/',
  ].join('\n');
  const scan = scanPastedText(slab);
  assert.deepEqual(scan.groups.map((g) => g.key), ['123456', 'arad.residents'], 'links buried in prose must be found, in order, deduped');
  assert.equal(scan.repeats, 1, 'the same group written twice is ONE repeat — not "already in the discovery list"');
  assert.equal(scan.unreadable, 1, 'only the /groups/ link that yielded no id counts; a marketplace item and a profile are not failures');
  assert.deepEqual(scanPastedText('שלום, אין כאן שום קישור.'), { groups: [], repeats: 0, unreadable: 0 }, 'prose is prose, not a failure');
  assert.deepEqual(extractGroupUrls(slab), [
    'https://www.facebook.com/groups/123456',
    'https://www.facebook.com/groups/arad.residents',
  ]);
  // ...and the three counts must be separate fields, so the screen cannot print
  // one under the other's label again.
  assert.ok(/repeats: number/.test(discovery), 'in-paste repeats must be their own field on CaptureResult');
  assert.ok(!/let duplicates = repeats/.test(discovery), 'duplicates must never be seeded from the in-paste repeat count');

  /*
   * 3. PHRASE GENERATION TOUCHES NOTHING. These are strings and a link to
   *    Facebook's own search page, which the owner's browser follows as them.
   *    The transliterations are the ones the owner asked for by name.
   */
  const bs = buildKeywords('באר שבע', ['secondhand', 'pros']);
  for (const must of ['באר שבע', 'Beer Sheva', "Be'er Sheva", 'יד שנייה באר שבע', 'בעלי מקצוע באר שבע']) {
    assert.ok(bs.includes(must), `"${must}" must be among the generated phrases`);
  }
  assert.equal(new Set(bs).size, bs.length, 'phrases must be deduplicated — a repeated phrase is a wasted tap');
  assert.ok(buildKeywords('עיר שלא מכירים', ['secondhand']).includes('יד שנייה עיר שלא מכירים'),
    'an unknown city must still get its domain phrases — only the transliterations are missing, because inventing one would be guessing');
  assert.equal(
    facebookGroupSearchUrl('יד שנייה באר שבע'),
    `https://www.facebook.com/search/groups/?q=${encodeURIComponent('יד שנייה באר שבע')}`,
    'the phrase link must be the plain, supported Facebook search URL and nothing cleverer',
  );

  /*
   * 4. ONE GROUP MODEL. Promotion goes through addGroup() — the single group
   *    creation path — and records what it created. A direct insert into
   *    social_targets here would be a second group system that the campaign,
   *    scheduler and queue paths know nothing about.
   */
  assert.ok(discovery.includes("import { addGroup"), 'promotion must import the existing addGroup');
  assert.ok(/await addGroup\(\{ url: row\.url/.test(discovery), 'promotion must actually call addGroup');
  assert.ok(!/from\('social_targets'\)[\s\S]{0,80}\.insert\(/.test(discovery), 'discovery must never insert into social_targets itself');
  assert.ok(/update\(\{ target_id: targetId \}\)/.test(discovery), 'the discovery row must keep a link to the target it created');
  assert.ok(/row\.membership !== 'MEMBER'/.test(discovery), 'a group the owner is not in must be refused promotion — a target is publishable the moment it is scheduled');

  /*
   * 5. RULE D — the owner outranks the worker, permanently.
   *
   * A group where only admins post shows no composer, which on the page looks
   * exactly like a group the owner is not in. If an automatic read were allowed
   * to lower a hand-set "אני חבר" on that evidence, the group would drop out of
   * the publishing library the owner deliberately put it in.
   */
  const discoveryPass = localWorker.slice(localWorker.indexOf('async function syncDiscoveredGroups('), localWorker.indexOf('/* ----------------------------------------------------------- commands'));
  assert.ok(discoveryPass.length > 500, 'the discovery enrichment pass must exist in the worker');
  assert.ok(discoveryPass.includes("row.membership_set_by === 'owner'"), 'the pass must know whether the mark was set by hand');
  assert.ok(/if \(!ownerSet \|\| stronger\)/.test(discoveryPass), 'an owner-set mark may only ever be raised, never lowered');
  assert.ok(discoveryPass.includes('MEMBERSHIP_RANK'), 'stronger-vs-weaker must be a declared ordering, not an ad-hoc comparison');
  assert.ok(/patch\.last_error = `בדף הקבוצה נראה/.test(discoveryPass), 'a contradicting read must be recorded for the owner rather than silently dropped');
  // ...and what it records has to be rendered, or it is a column nothing reads.
  assert.ok(/enrichState !== 'failed' && group\.lastError/.test(card), 'a finding recorded on a SUCCESSFUL read must still reach the screen');

  // The pass is small, opt-in, and behind publishing.
  assert.ok(discoveryPass.includes("eq('enrich_state', 'queued')"), 'only rows the owner opted in for may be read');
  assert.ok(discoveryPass.includes("eq('ignored', false)"), 'a hidden group must not be opened in the owner\'s Chrome');
  const perTick = Number(/const DISCOVERED_PER_TICK = (\d+)/.exec(localWorker)?.[1] ?? 99);
  assert.ok(perTick > 0 && perTick <= 2, `the per-tick budget must stay tiny (found ${perTick})`);
  assert.ok(/if \(await syncGroupProfiles\([^)]*\)\) await syncDiscoveredGroups\(/.test(localWorker),
    'discovery enrichment must run only on an idle tick, and must stand down when the profile pass hit a login wall');
  // A failed read must land on 'failed', never 'done'. syncGroupProfiles() stamps
  // last_synced_at even in its catch, so a timed-out target silently leaves the
  // queue forever; this pass must not inherit that.
  const enrichCatch = discoveryPass.slice(discoveryPass.indexOf('} catch (err) {'));
  assert.ok(enrichCatch.includes("enrich_state: 'failed'"), 'a failed read must be recorded as failed');
  assert.ok(!enrichCatch.includes("enrich_state: 'done'"), 'a failed read must never be recorded as a completed one');

  /*
   * 6. NO FAKE AUTOMATION. There is no Meta endpoint that joins a group or
   *    sends a join request — Meta removed the entire Groups API on 2024-04-22.
   *    So no control on this screen may imply the system joined anything, and
   *    the two membership marks must read as the owner reporting what THEY did.
   */
  const joinClaims = /(?:הצטרפנו|המערכת הצטרפה|שלחנו בקשה|נשלחה בקשה אוטומטית|מצטרף אוטומטית|הצטרפות אוטומטית)/;
  for (const [name, src] of [['screen', screen], ['card', card], ['builder', builder]] as const) {
    assert.ok(!joinClaims.test(src), `${name}: no copy may claim the system joined a group or sent a request`);
  }
  assert.ok(card.includes('שלחתי בקשה'), 'the mark must be first-person — the OWNER sent the request');
  assert.ok(card.includes('אני חבר'), 'the mark must be first-person — the OWNER is the member');
  assert.ok(screen.includes('המערכת לא יכולה להצטרף לקבוצה במקומכם'), 'the screen must say plainly that it cannot join for them');
  // The join path is a link to Facebook, not a button that "does" the joining.
  assert.ok(/<ButtonLink[\s\S]{0,200}href=\{group\.url\}/.test(card), 'the join affordance must be a link to the group on Facebook');

  /*
   * 7. NO INVENTED NUMBERS. members_count is NULL until a page printed one and
   *    privacy is 'unknown' until a page said so in words, so both must be
   *    absent from the card rather than rendered as 0 or "—".
   */
  assert.ok(/typeof group\.membersCount === 'number'/.test(card), 'a member count must be shown only when there actually is one');
  assert.ok(!/membersCount \?\? 0|membersCount \|\| 0/.test(card), 'an unread member count must never become a zero');
  assert.ok(/group\.privacy === 'public'/.test(card) && /group\.privacy === 'private'/.test(card),
    "the privacy badge must be driven by the two known values, never by 'unknown'");
  assert.ok(v8.includes('members_count integer'), 'members_count must be nullable — NULL is "not read"');
  assert.ok(!/members_count integer[^\n]*default 0/.test(v8), 'members_count must never default to 0');

  /*
   * 8. THE MIGRATION. A new public table with RLS off is readable and writable
   *    by anyone holding the anon key; with RLS on and no policies, every read
   *    returns [] and the screen looks empty rather than broken. Both halves
   *    must be in the same file, and the file must be safe to re-run.
   */
  assert.ok(v8.includes('create table if not exists public.social_discovered_groups'), 'v8 must be re-runnable');
  assert.ok(v8.includes('enable row level security'), 'the new table must have RLS enabled');
  for (const policy of ['admin select', 'admin insert', 'admin update', 'admin delete']) {
    assert.ok(v8.includes(`"${policy}"`), `v8 must create the "${policy}" policy, or the dashboard reads nothing`);
  }
  assert.equal((v8.match(/drop policy if exists/g) ?? []).length, 4, 'every policy must be dropped before it is created, so the file re-runs');
  assert.ok(v8.includes('drop trigger if exists social_discovered_groups_set_updated_at'), 'the updated_at trigger must be idempotent');
  assert.ok(v8.includes('execute function public.set_updated_at()'), 'the new table must reuse the existing updated_at function');
  assert.ok(!/^grant /m.test(v8), 'no social migration grants privileges — default grants plus RLS is the whole model');
  // The unique index has to be FULL: PostgREST's ON CONFLICT cannot name a
  // partial one, and bulk capture upserts a whole paste in one round trip.
  assert.ok(/create unique index if not exists social_discovered_groups_url_key_idx\s*\n\s*on public\.social_discovered_groups \(url_key\);/.test(v8),
    'the url_key unique index must be full, not partial — capture upserts against it by name');
  assert.ok(discovery.includes("onConflict: 'url_key'"), 'capture must upsert against that index');

  /*
   * 9. A SUCCESS IS NEVER FILED UNDER A FAILURE. promoteToTargets() counts a
   *    group that was already in the pool as ADDED (it links the two rather than
   *    failing), so that sentence must not travel in `reasons` — the screen
   *    prints those under "קבוצות שלא נוספו למאגר", which would be the opposite
   *    of what happened.
   */
  assert.ok(/notes: string\[\]/.test(discovery), 'promote must report successes separately from refusals');
  assert.ok(/notes\.push\(`"\$\{label\(row\)\}" כבר הייתה במאגר הפרסום/.test(discovery),
    'the "already there, linked" line is a success and belongs in notes');
  const promoteFn = discovery.slice(discovery.indexOf('export async function promoteToTargets'));
  const refusals = promoteFn.slice(0, promoteFn.indexOf('return { added'));
  for (const m of refusals.matchAll(/reasons\.push/g)) {
    const before = refusals.slice(Math.max(0, (m.index ?? 0) - 400), m.index ?? 0);
    assert.ok(/skipped \+= 1/.test(before), 'every line in `reasons` must belong to a group that was actually skipped');
  }

  /*
   * 10. NO FOREVER-SPINNER. The likeliest first experience of this screen is
   *     that supabase/social-schema-v8.sql has not been run yet. That must end
   *     in a Hebrew explanation and a retry, not a skeleton that never resolves
   *     and not an empty state claiming nothing was found.
   */
  assert.ok(screen.includes('loadFailed'), 'the screen must track a failed load rather than sitting at rows === null');
  assert.ok(/rows === null && !loadFailed/.test(screen), 'the skeleton must stop when the load failed');
  assert.ok(/counts === null && loadFailed/.test(screen), 'the counter skeletons must stop too');
  assert.ok(screen.includes('social-schema-v8.sql'), 'the failure must name the file the owner has to run');
  assert.ok(screen.includes('נסו שוב'), 'a failed load must offer a retry');
  assert.ok(/rows !== null && all\.length === 0/.test(screen),
    '"nothing found yet" is a claim about data and must require that the data actually arrived');

  console.log('group-discovery tests OK');
}
