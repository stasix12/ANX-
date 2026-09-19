import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dripSlots, slotsFor } from '@/lib/social/slots';
import { zonedToUtc } from '@/lib/social/time';
import { parseGroupUrl, type Variant } from '@/lib/social/types';
import { pickVariant, previewAssignment } from '@/lib/social/variants';
import { detectCity, sortCities } from '@/lib/social/cities';
import { campaignState, percentDone, type CampaignQueueRow } from '@/lib/social/campaign';
import { countdownTo } from '@/lib/social/countdown';
import { friendlyMessage, GENERIC_ERROR } from '@/lib/social/errors';

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
  const planner = readFileSync(new URL('../../src/lib/social/server/planner.ts', import.meta.url), 'utf8');
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
