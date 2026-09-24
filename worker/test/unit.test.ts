import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { staggeredSlots } from '../../src/lib/social/slots';
import { dripSlots, slotsFor } from '@/lib/social/slots';
import { zonedToUtc } from '@/lib/social/time';
import { DEFAULT_BUSINESS, isPendingShare, parseGroupShareUrl, parseGroupUrl, type Variant } from '@/lib/social/types';
import { pickVariant, previewAssignment } from '@/lib/social/variants';
import { detectCity, sortCities } from '@/lib/social/cities';
import {
  campaignHeadline,
  campaignState,
  openRows,
  percentFinished,
  percentPublished,
  unpublishedNote,
  RUN_STATE_LABEL,
  type CampaignQueueRow,
  type CampaignState,
} from '@/lib/social/campaign';
import { checkCampaignInvariants, checkQueueInvariants, resetInvariantReports, takeUnreported } from '@/lib/social/invariants';
import {
  ALL_QUEUE_STATUSES,
  AUTOMATIC_WAITING_STATUSES,
  CANCELLABLE_STATUSES,
  IN_FLIGHT_STATUSES,
  NEEDS_HUMAN_STATUSES,
  OPEN_STATUSES,
  QUEUE_LIFECYCLE,
  TERMINAL_STATUSES,
  WAITING_STATUSES as WAITING_LIST,
  isOpen,
  isTerminal,
  summarizeQueue,
} from '@/lib/social/status';
import type { QueueStatus } from '@/lib/social/types';
import { countdownTo, OVERDUE_AFTER_SECONDS } from '@/lib/social/countdown';
import { friendlyMessage, GENERIC_ERROR, LATEST_SCHEMA_FILE } from '@/lib/social/errors';
import { renderPostText } from '@/lib/social/compose';
import { safeError } from '../db';
import { PublishError } from '../facebook/composer';

/** Pure helpers shared by the dashboard, the server worker and the local worker. */

// --- group URL parsing
assert.deepEqual(parseGroupUrl('https://www.facebook.com/groups/beersheva.together/?ref=share'), { url: 'https://www.facebook.com/groups/beersheva.together', externalId: 'beersheva.together' });

/*
 * A SHARE LINK IS ACCEPTED, BUT NEVER AS A GROUP.
 *
 * Facebook's app puts https://www.facebook.com/share/g/<token> on the
 * clipboard, so refusing it means refusing the link most people actually have
 * — which is what the owner hit: a pasted link and a dead button.
 *
 * parseGroupUrl still refuses it, and that is deliberate. It is the guard that
 * keeps an arbitrary facebook.com path away from a browser carrying a live
 * session, and a share link is exactly such a path until somebody follows it.
 * The share form goes through its own reader and is marked pending, so no code
 * and no query can mistake it for a group.
 */
assert.equal(parseGroupUrl('https://www.facebook.com/share/g/1CJvFd2bF'), null, 'a share link is not a group address');
assert.deepEqual(parseGroupShareUrl('https://www.facebook.com/share/g/1CJvFd2bF'), {
  url: 'https://www.facebook.com/share/g/1CJvFd2bF',
  externalId: 'share:1CJvFd2bF',
});
assert.equal(parseGroupShareUrl('https://www.facebook.com/groups/beersheva.together'), null, 'and a real group is not a share link');
assert.equal(parseGroupShareUrl('https://evil.example/share/g/1'), null, 'and neither is anything off facebook.com');
assert.ok(isPendingShare('share:1CJvFd2bF') && !isPendingShare('beersheva.together'), 'pending is readable straight off the id');
{
  /* The worker follows it, and only a resolved /groups/ address is written
     back. Anything else leaves the row pending rather than publishable. */
  const w = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  assert.ok(/async function resolveShareLinks/.test(w), 'the worker is what follows a share link');
  assert.ok(/const resolved = parseGroupUrl\(page\.url\(\)\);/.test(w), 'and writes back only what parseGroupUrl accepts');
  assert.ok(/if \(!resolved\) \{[\s\S]{0,160}continue;/.test(w), 'a link that did not resolve stays pending, never half-written');
  /* Two rows for one group would publish to it twice. */
  assert.ok(/\.eq\('external_id', resolved\.externalId\)[\s\S]{0,120}\.neq\('id', target\.id\)/.test(w), 'and a group already on the list is not added a second time');
}
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
assert.equal(percentPublished(blank.progress), 0);
assert.equal(percentFinished(blank.progress), 0);

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
// `finished` is what will not change again; `published` is what succeeded.
// They are two numbers and the screens print two different sentences.
assert.equal(live.progress.finished, 3);
assert.equal(percentFinished(live.progress), 50);
assert.equal(percentPublished(live.progress), 33);
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
assert.equal(percentPublished(finished.progress), 100);
assert.equal(percentFinished(finished.progress), 100);

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
  /*
   * The ONE piece of Latin text a classified message may carry, and it is not
   * backend text: the name of the migration file the owner has to run, plus
   * where to run it. Seven of the eight screens used to say "the database
   * update file" with fourteen .sql files in supabase/ and no way to tell
   * which, so errors.ts now names it — from a constant, which is what this
   * allowlist is pinned to, so the exception cannot be widened into a licence
   * for arbitrary English.
   */
  const ALLOWED_LATIN = [LATEST_SCHEMA_FILE, 'SQL Editor', 'Supabase'];
  const withoutAllowed = (text: string) => ALLOWED_LATIN.reduce((acc, allowed) => acc.split(allowed).join(''), text);
  for (const r of raw) {
    const out = friendlyMessage(new Error(r));
    assert.ok(
      !/[A-Za-z]{4,}/.test(withoutAllowed(out).replace(/[֐-׿\s.,—–…!?()״׳]/g, '')),
      `leaked English/raw text: ${out}`,
    );
    assert.ok(!out.includes('at '), `leaked a stack frame: ${out}`);
    assert.ok(/[֐-׿]/.test(out), `not Hebrew: ${out}`);
  }

  // ...and the schema message really does name the file, on every screen that
  // shows it, not only the content library.
  const schemaMessage = friendlyMessage(new Error('relation "social_queue" does not exist'));
  assert.ok(schemaMessage.includes(LATEST_SCHEMA_FILE), `the schema error must name the file to run: ${schemaMessage}`);

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

  /*
   * ...but "its moment has just come" and "its moment was six hours ago" are
   * not the same fact, and Math.max(0, …) flattened them into one. A dashboard
   * reading `due` as "publishing right now" therefore said exactly that about a
   * queue whose PC had been off all weekend — automation presented as happening
   * that was not happening. `late` is the real distance; `overdue` is it being
   * far enough past that nothing is plausibly mid-flight.
   */
  assert.equal(past?.late, 90, 'a passed instant knows how far past it is');
  assert.equal(past?.overdue, false, `90s late is inside the ${OVERDUE_AFTER_SECONDS}s grace — polls and rules.ts's one-minute park live in there`);

  const ahead = countdownTo(new Date(t0 + 60_000).toISOString(), t0);
  assert.equal(ahead?.late, 0, 'an instant still ahead is not late at all');
  assert.equal(ahead?.overdue, false);

  const stale = countdownTo(new Date(t0 - 6 * 3600_000).toISOString(), t0);
  assert.equal(stale?.due, true);
  assert.equal(stale?.late, 6 * 3600, 'six hours late is six hours late');
  assert.equal(stale?.overdue, true, 'the PC-is-switched-off state must be distinguishable from "publishing now"');

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

  /*
   * Terminal rows are excluded on purpose: a skipped or failed row may replan.
   * The planner now names the shared lists instead of repeating a literal
   * array, so the assertion is on the lists themselves — which is the stronger
   * test, because it is what the query actually sends.
   */
  const occ = planner.slice(planner.indexOf('async function occupiedSlots'), planner.indexOf('const slotKey'));
  assert.ok(occ.includes("'published', ...OPEN_STATUSES"), 'occupancy must be built from the shared classification');
  for (const status of ['scheduled', 'publishing', 'awaiting_confirmation'] as QueueStatus[]) {
    assert.ok(OPEN_STATUSES.includes(status), `occupancy must count ${status}`);
  }
  assert.ok(!OPEN_STATUSES.includes('skipped'), 'a skipped row must not block replanning');
  assert.ok(!OPEN_STATUSES.includes('failed'), 'a failed row must not block replanning');

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

/* ------------------------------- a weekly occasion is spread, not stacked */
{
  const planSrc = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8');
  const pickerSrc = readFileSync(new URL('../../src/components/social/SchedulePicker.tsx', import.meta.url), 'utf8');

  /*
   * slotsFor() returns OCCASIONS — "Sunday 09:00" — and the planner used to
   * stamp every target with that one instant. rules.ts then held each group
   * publication until minGap + groupMinGap had passed, so of 28 rows one went
   * out and 27 were deferred until MAX_DEFERRALS skipped them. A weekly
   * campaign was built to lose almost everything it scheduled.
   */
  assert.ok(planSrc.includes('staggerAt(rawSlot, targetIndex, spacingMinutes)'), 'the planner must give each target its own instant inside an occasion');
  assert.ok(planSrc.includes('async function enforcedSpacing'), 'the spacing must be read from the settings rules.ts enforces, not invented');
  assert.ok(/minGapMinutes[\s\S]{0,120}groupMinGapMinutes/.test(planSrc), 'spacing must be the sum rules.ts compares against');

  // And the preview must do the same arithmetic, or it shows a schedule the
  // planner will not write — the lie this codebase keeps having to re-close.
  assert.ok(pickerSrc.includes('staggeredSlots(slots, count, spacingMinutes)'), 'the schedule preview must stagger the way the planner does');
  assert.ok(pickerSrc.includes('spacingMinutes?: number'), 'the picker must be told the real spacing');

  // The arithmetic itself, executed.
  const base = new Date('2026-09-20T06:00:00Z');
  const spread = staggeredSlots([base], 28, 65);
  assert.equal(spread.length, 28, '28 targets produce 28 publications');
  assert.equal(spread[0].getTime(), base.getTime(), 'the first keeps the chosen time');
  for (let i = 1; i < spread.length; i += 1) {
    assert.equal(spread[i].getTime() - spread[i - 1].getTime(), 65 * 60_000, `row ${i} must sit exactly one gap after the one before it`);
  }
  // Zero spacing must stay stacked rather than silently inventing a gap.
  assert.equal(staggeredSlots([base], 3, 0).every((d) => d.getTime() === base.getTime()), true, 'no spacing means no stagger');

  // And the preview the owner confirms on must carry the same spacing. The
  // pre-launch sheet renders the SAME SchedulePlanPreview as the picker, so a
  // plan built without it shows 28 publications at 09:00 for a schedule the
  // planner spreads across a day and a half — the lie at the last moment
  // before they commit.
  const editorSrc = readFileSync(new URL('../../src/components/social/PostEditor.tsx', import.meta.url), 'utf8');
  assert.ok(/planFor\(schedule, selectedObjects\.length, new Date\(\), spacingMinutes\)/.test(editorSrc),
    'the pre-launch plan must be built with the real spacing');
  assert.ok(editorSrc.includes('spacingMinutes={spacingMinutes}'), 'the picker and the review must share one spacing value');

  console.log('weekly-stagger tests OK');
}

/* ------------------------------ every launch belongs to a run */
{
  const clientSrc = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  const editorSrc = readFileSync(new URL('../../src/components/social/PostEditor.tsx', import.meta.url), 'utf8');
  const librarySrc = readFileSync(new URL('../../src/lib/social/library.ts', import.meta.url), 'utf8');

  /*
   * A run is what "pause this" and "stop this" act on and what the dashboard's
   * progress card is scoped by. Quick publish opened one; scheduling from the
   * editor did not, so a weekly schedule set up there queued rows with
   * campaign_id null and the owner found "סבבי פרסום" empty while the
   * publications were real. Both paths go through one helper now.
   */
  assert.ok(clientSrc.includes('export async function ensureRunForPost'), 'there must be one place a run is opened');
  assert.ok(editorSrc.includes('await ensureRunForPost('), 'scheduling from the editor must attach its launch to a run');
  assert.ok(librarySrc.includes('await ensureRunForPost('), 'quick publish must use the same helper, not its own copy');

  // A stopped run is finished: the next launch opens a fresh one, so the
  // counter starts at zero instead of carrying a closed round's totals.
  const helper = clientSrc.slice(clientSrc.indexOf('export async function ensureRunForPost'), clientSrc.indexOf('export async function deleteCampaign'));
  assert.ok(helper.includes("status !== 'archived'"), 'a stopped run must not be reused');
  assert.ok(helper.includes("update({ campaign_id:"), 'the post must be attached to the run it just opened');

  /*
   * plan.ts stamps campaign_id from the post when a row is CREATED, so rows
   * queued before the post had a run keep null for ever — they publish on time
   * and stay invisible on the screen built to watch them. Opening a run adopts
   * them. Only orphans, and only unfinished ones: a row from an earlier run is
   * that run's history.
   */
  assert.ok(helper.includes("is('campaign_id', null)"), 'only orphaned rows may be adopted, never another run\'s');
  assert.ok(helper.includes('OPEN_STATUSES'), 'only unfinished rows may be adopted — published history does not move');
  assert.ok(!/\.in\('status', TERMINAL/.test(helper), 'a terminal row is never re-homed');

  console.log('run-attachment tests OK');
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
   * "HOW MANY PEOPLE SAW IT" — AND THE NUMBER THAT MUST NOT BE INVENTED.
   *
   * This is the question a round is run to answer and the easiest place in the
   * product to state something untrue. Facebook publishes no reach figure for
   * a GROUP post and Meta closed the Groups API in April 2024, so the only way
   * to produce one is to add up the member counts of the groups posted to and
   * call that an audience — wrong by an order of magnitude, and precisely the
   * number a paying customer would act on.
   *
   * So the rule is: only what Facebook itself wrote on the post.
   */
  const reachCard = readFileSync(new URL('../../src/components/social/CampaignReach.tsx', import.meta.url), 'utf8');
  const metricsSrc = readFileSync(new URL('../facebook/metrics.ts', import.meta.url), 'utf8');
  const workerSrc = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const selectorsSrc = readFileSync(new URL('../facebook/selectors.ts', import.meta.url), 'utf8');
  const reachCode = reachCard.replace(/\/\*[\s\S]*?\*\//g, '');
  const metricsCode = metricsSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(
    !/member|members|חברים|memberCount/i.test(reachCode) && !/member|חברים/i.test(metricsCode),
    'a group\'s size is not an audience and may never be presented as one',
  );
  /* The component's own name is not a claim; a figure would be. */
  assert.ok(
    !/reach|impressions|חשיפה משוערת|חשיפה פוטנציאלית/i.test(reachCode.replace(/CampaignReach/g, '')),
    'and no reach or impressions figure may appear, because none exists',
  );
  assert.ok(/פייסבוק לא מפרסמת מספר חשיפה/.test(reachCard), 'the screen says so itself, rather than leaving the gap unexplained');

  /*
   * NULL IS NOT ZERO, and this is the half that decides whether the card lies.
   * A post not read yet, a post Facebook showed no "seen by" on, and a post
   * nobody engaged with are three different facts; a 0 reports the first two
   * as the third. Sums therefore run only over rows carrying a number, and the
   * card states how many posts each total covers.
   */
  assert.ok(/typeof v === 'number'/.test(reachCard), 'a total counts only the posts that actually carry a number');
  assert.ok(/value === null \? <span/.test(reachCard), 'and an unread figure shows a dash, never a zero');
  assert.ok(/מתוך \$\{posts\}/.test(reachCard), 'saying how many publications the total is over');
  assert.ok(/seen: number \| null/.test(metricsSrc), 'the reader returns null where Facebook stated nothing');
  /*
   * A VIDEO SAYS "צפיות", NOT "נצפה על ידי" — found on the owner's own post.
   * Everything they publish is video, so matching "seen by" alone would have
   * collected nothing from their entire library while looking like it worked.
   * Kept as its own count because a play is somebody who watched and an
   * impression is a post that crossed a screen; one column for both would let
   * the card label the first as the second.
   */
  assert.ok(/viewCount:/.test(selectorsSrc) && /צפיות/.test(selectorsSrc), 'a video post reports plays, and they are read too');
  assert.ok(/views: number \| null/.test(metricsSrc), 'and kept apart from the impressions figure');
  assert.ok(/label="צפיות בסרטון"/.test(reachCard), 'so the tile can say which of the two it is showing');
  assert.ok(
    /if \(kind !== 'ok'\) return null;/.test(metricsSrc),
    'and a login wall returns nothing at all rather than recording zeros for somebody else\'s page',
  );
  /* The worker leaves a row untouched when the read failed, for the same
     reason: "we could not read it" is not "it did nothing". */
  assert.ok(/if \(!m\) \{/.test(workerSrc), 'an unreadable post leaves its row unread');
  /* Collection is the least urgent thing the worker does and must never sit in
     front of a publication. */
  const dueAt = workerSrc.indexOf('if (!due?.length) {');
  const metricsAt = workerSrc.indexOf('await syncPostMetrics(state, headless);');
  assert.ok(dueAt > 0 && metricsAt > dueAt, 'metrics are collected only when there is nothing to publish');

  /*
   * A FULL DAILY QUOTA IS "NOT TODAY". IT USED TO BE "NEVER".
   *
   * All three daily ceilings returned {action:'skip'}, and a skip FINISHES the
   * row — the publication is destroyed, not postponed. Seen on the owner's
   * machine as six identical lines in the activity log inside sixteen minutes:
   * six publications of a 28-group round deleted, one per poll, while the
   * screen said the system was running and the daily tile showed room.
   *
   * It also contradicted the product's own promise. The scheduling screen has
   * always said "מה שלא נכנס היום ממשיך מחר", so the rule was changed to match
   * the promise rather than the promise softened to match the rule.
   */
  assert.ok(
    /todayAll >= limits\.maxPerDay\)\s*\n\s*return \{ action: 'defer'/.test(rules),
    'a full global quota postpones the publication, it does not destroy it',
  );
  assert.ok(
    /todayTarget >= limits\.maxPerTargetPerDay\)\s*\n\s*return \{\s*\n?\s*action: 'defer'/.test(rules),
    'and so does a group that has had its share today',
  );
  assert.ok(
    /todayCampaign >= ctx\.browser\.maxPerCampaignPerDay\)\s*\n\s*return \{\s*\n?\s*action: 'defer'/.test(rules),
    "and so does a round that has filled its own — the one the owner's queue was dying on",
  );
  /* Tomorrow is asked for as "what day is it in 24 hours", so the clock change
     in March and October cannot land it on the wrong side of midnight, and a
     result already past steps a further day rather than being due at once. */
  assert.ok(/function startOfNextZonedDay/.test(rules), 'the day it waits for is computed, not assumed');
  assert.ok(/48 \* 60 \* 60_000/.test(rules), 'and a DST hour cannot make it due in the past');
  /*
   * And no screen may still promise the old behaviour. Four of them did, in
   * the owner's own words on the button they press.
   */
  for (const [name, src] of [
    ['QueueTunerSheet', sheet],
    ['LiveCampaignHero', hero],
    ['PostEditor', readFileSync(new URL('../../src/components/social/PostEditor.tsx', import.meta.url), 'utf8')],
    ['QuickPublishSheet', readFileSync(new URL('../../src/components/social/QuickPublishSheet.tsx', import.meta.url), 'utf8')],
    ['PreLaunchReview', readFileSync(new URL('../../src/components/social/PreLaunchReview.tsx', import.meta.url), 'utf8')],
  ] as const) {
    const visible = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(
      !/לא נדחה למחר|לא יידחו למחר|לא נדחית למחר/.test(visible),
      `${name} must not tell the owner a capped publication is lost`,
    );
  }

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
  /*
   * The slice starts at GapSplit, not at respaceQueue: the settings write is now
   * applyGapSettings(), extracted so that quick publish (src/lib/social/library.ts)
   * reuses the split instead of owning a second copy of it that can drift. Both
   * functions are in the window, so every assertion below still asks the same
   * question — does the spacing the owner chose actually reach the engine.
   */
  const respace = client.slice(
    client.indexOf('export interface GapSplit'),
    client.indexOf('export async function removeTargetFromQueue'),
  );
  assert.ok(respace.length > 500, 'respaceQueue must exist in client.ts');
  assert.ok(
    /export async function respaceQueue[\s\S]*?await applyGapSettings\(/.test(respace),
    'respaceQueue must still go through applyGapSettings — moving the rows without moving the settings is the queue that quietly dies',
  );
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
  /*
   * Updated with the fix that made the skip audible: the shape this pinned was
   * a bare `if (waiting.has(targetId)) continue;`, which was correct and
   * completely silent. Relaunching a post to 28 groups while one of them still
   * sat in needs_attention from the previous round produced 27 rows, never a
   * 28th, and nothing anywhere named the group that had been left out — and for
   * a 'now'/'once' schedule the schedule then retired itself, so it never would.
   * The skip itself is unchanged and still pinned; what is pinned in addition is
   * that the group is collected and reported.
   */
  assert.equal(
    (planner.match(/if \(waiting\.has\(targetId\)\) \{\s*dropped\.push\(targetId\);\s*continue;\s*\}/g) ?? []).length,
    2,
    'both branches must skip a group already waiting — and remember which one',
  );
  assert.equal((planner.match(/await noteDropped\(/g) ?? []).length, 2, 'both branches must report the groups they left out');
  const dropNote = planner.slice(planner.indexOf('async function noteDropped'), planner.indexOf('async function stoppedCampaigns'));
  assert.ok(dropNote.includes("from('social_targets')"), 'the report must name the groups, not count them');
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
   * Reachability. If nothing calls onTune, everything above is code nobody can
   * run.
   *
   * This used to also require an sr-only name, because the only entry was the
   * countdown box: a button whose entire content was "00:14:32" announces a
   * number and no purpose. The entry is now a button that SAYS what it does,
   * so its visible text is its accessible name and a hidden duplicate would be
   * announced twice. The rule — the way in must be named — is unchanged; what
   * changed is that the name is now on screen, which is strictly better.
   */
  assert.ok(hero.includes('onClick={onTune}'), 'the tuner must be reachable from this card');
  assert.ok(/onClick=\{onTune\}[\s\S]{0,400}ערוך מועד/.test(hero), 'and that control must carry a Hebrew name, not just an icon or a countdown');
  /* The rule — a waiting publication names its group with that group's own
     picture, never a placeholder — moved with the countdown. "הפרסומים
     הקרובים" now shows every waiting row, each with its avatar, so the guard
     follows it there rather than being dropped. */
  const timelineSrc = readFileSync(new URL('../../src/components/social/Timeline.tsx', import.meta.url), 'utf8');
  assert.ok(timelineSrc.includes('<TargetAvatar'), 'each upcoming publication must be shown with its own group picture');
  assert.ok(hero.includes('min-h-11'), 'the run card\'s title link is tapped with a thumb — 44px floor');
  /*
   * ONE countdown, ONE tuner entry point — and this count going from 2 to 1 is
   * the assertion carrying a change of truth rather than being weakened.
   *
   * The two heroes used to be mutually exclusive branches of a ternary, so
   * each could own a countdown and each needed the action passed down. The
   * dashboard now renders the system card AND the run card together, and their
   * "next publication" comes from different rows: the system card from
   * data.upcoming[0] (the whole queue, any campaign or none), the run card
   * from that run's first 'scheduled' row. Two countdowns 200px apart showing
   * two different instants is the contradiction class this module exists to
   * prevent, so the run card no longer has one. The tuner is reachable from
   * the one box that remains.
   *
   * The MECHANISM below changed with this commit, not the rule. It used to
   * count onClick={onTune}, which conflated "one countdown" with "one way into
   * the tuner" — and those are different things. The run card now carries an
   * explicit "ערוך מועד ומרווח" button, because the countdown box is not drawn
   * before a run has started, which is exactly when the owner wants to bring it
   * forward: the only entry point vanished at the moment it was needed. So the
   * assertion counts COUNTDOWN BOXES, which is what the rule was always about.
   */
  /*
   * ZERO countdown boxes on this screen now, and that is the rule holding
   * rather than loosening.
   *
   * The rule was never "there must be a countdown" — it was "two countdowns
   * 200px apart, derived from different rows, may not disagree". The system
   * card's box came from data.upcoming[0] (any run, or none) and the run
   * card's would have come from that run's first scheduled row.
   *
   * "הפרסומים הקרובים" below now lists EVERY waiting row with its own live
   * countdown beside the group it belongs to, which is the same fact told
   * once, in full, and in the place that can show which row it is about. So
   * the box is gone from both cards, and the guard checks that neither grew
   * one back.
   */
  assert.equal((hero.match(/<NextUpBoxes\b/g) ?? []).length, 0, 'neither card may carry a countdown — the upcoming list owns that now, row by row');
  assert.ok(hero.includes('ערוך מועד'), 'the run card needs a tuner entry that does not depend on a countdown being drawn');
  assert.ok(page.includes('<QueueTunerSheet'), 'the dashboard must render the tuner');
  /*
   * TWO doorways, ONE sheet — and each doorway must name its own queue.
   *
   * For one commit the run card was the only way in, and the run card renders
   * only when a run is featured: a queue with no featured run had no way at
   * all to change its interval or bring it forward. A control the owner can
   * use must never depend on another card being on screen.
   *
   * And the scope has to travel with the tap. The sheet used to compute
   * `campaignId` itself from data.upcoming[0], which is the system panel's
   * subject — so opening it from the RUN CARD tuned whatever queue happened
   * to hold the soonest row, which need not be that run at all.
   */
  assert.equal(
    (page.match(/onTune=\{\(\) => setTuner\(\{/g) ?? []).length,
    2,
    'both the system panel and the run card must open the tuner — the run card alone disappears with the run',
  );
  assert.ok(
    page.includes('onTune={() => setTuner({ campaignId: featured.campaign.id })}'),
    'the run card tunes ITS OWN run',
  );
  assert.ok(
    page.includes("onTune={() => setTuner({ campaignId: data.upcoming[0]?.campaign_id ?? undefined })}"),
    'and the system panel tunes the queue it is actually about',
  );
  assert.ok(
    page.includes('campaignId={tuner?.campaignId}'),
    'the sheet takes the scope it was opened with and never re-derives one',
  );
  assert.equal((page.match(/<QueueTunerSheet/g) ?? []).length, 1, 'and there is only ever one tuner to open');
  /*
   * The rule this line used to hold — "the tuner opens on the queue the tap
   * was about" — is now asserted three times just above, once per doorway
   * plus one for the sheet not re-deriving a scope of its own.
   *
   * What it pinned was the IMPLEMENTATION of that rule from when there was a
   * single doorway: the sheet reading data.upcoming[0] for itself. With two
   * doorways that spelling became the bug — tapping the run card tuned
   * whatever queue held the soonest row. So the assertion is replaced by ones
   * that state the rule directly, not relaxed.
   */
  assert.ok(
    !page.includes('campaignId={data?.upcoming[0]?.campaign_id ?? undefined}'),
    'the sheet must not compute its own scope — it belongs to whichever card was tapped',
  );

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

  /*
   * EVERY MINUTE MUST BE REACHABLE.
   *
   * The stepper moved in fives and the presets jump 20 → 30 → 45, so 7 or 23
   * were not reachable by any control on the sheet. The figure is the input
   * now, and the stepper is the fine adjustment.
   */
  const tuner = readFileSync(new URL('../../src/components/social/QueueTunerSheet.tsx', import.meta.url), 'utf8');
  assert.ok(/const STEP = 1;/.test(tuner), 'the stepper must move one minute at a time');
  assert.ok(/inputMode="numeric"[\s\S]{0,1400}דקות בין פרסום לפרסום/.test(tuner), 'the gap figure itself must be typable');
  /*
   * And it must be typable in practice. A controlled input clamped on every
   * keystroke cannot be cleared — emptying it yields NaN, the clamp makes that
   * MIN_GAP, and "1" reappears under the cursor. The raw text is held while
   * editing and committed on blur; an empty entry keeps the previous value
   * rather than silently choosing one minute for a 28-group queue.
   */
  assert.ok(tuner.includes('value={draft ?? String(gap)}'), 'the field shows the raw text while it is being edited');
  assert.ok(tuner.includes('onBlur={commitDraft}'), 'and commits on blur');
  assert.ok(
    /const commitDraft[\s\S]{0,300}draft !== ''[\s\S]{0,120}setGapTo/.test(tuner),
    'an empty or nonsense entry must leave the gap untouched',
  );

  console.log('queue-tuner tests OK');
}

/* ------------------------------ the content library reuses, it does not rebuild */
{
  const library = readFileSync(new URL('../../src/lib/social/library.ts', import.meta.url), 'utf8');
  const sheet = readFileSync(new URL('../../src/components/social/QuickPublishSheet.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../../src/components/social/SocialShell.tsx', import.meta.url), 'utf8');
  const v8 = readFileSync(new URL('../../supabase/social-schema-v8.sql', import.meta.url), 'utf8');

  /*
   * THE PUBLISH PATH. The library adds a second way to reach the queue, and the
   * only reason that is safe is that it is not a second implementation: it walks
   * PostEditor.onSchedule()'s steps, in its order, through its functions. Each
   * one of these is a bug this deployment has already paid for once.
   */
  const quick = library.slice(
    library.indexOf('export async function quickPublish('),
    library.indexOf('export function seedTargetsFromSchedules'),
  );
  assert.ok(quick.length > 1000, 'quickPublish must exist in library.ts');

  assert.ok(quick.includes('await createSchedule('), 'quick publish must go through createSchedule() — there is one scheduler');
  assert.ok(
    !/\.from\('social_schedules'\)|\.from\('social_queue'\)\s*\.\s*(insert|upsert)/.test(quick),
    'quick publish must never write social_schedules or insert queue rows itself — that is the planner\'s job',
  );
  assert.ok(quick.includes("status: 'ready'"), 'quick publish must flip the post to ready, or the library keeps calling it a draft while it goes out');
  assert.ok(quick.includes('hasPendingQueue('), 'quick publish must run the double-launch guard — two taps on a slow phone otherwise queue every group twice');
  assert.ok(quick.includes("callSocialApi"), 'quick publish must release the queue: the GitHub cron never ticks on this deployment (plan.ts)');
  assert.ok(quick.includes("'/api/social/run'"), 'quick publish must call the run route by name');
  assert.ok(
    /require_confirmation:\s*ctx\.browser\.requireConfirmation \|\| ctx\.browser\.testMode/.test(quick),
    'quick publish must carry the editor\'s OR — dropping it makes TEST MODE stop forcing a confirmation',
  );

  /*
   * ...and the settings BEFORE the rows. rules.ts re-times a "too soon" row off
   * the last publication and skips it after 40 attempts, so writing rows 12
   * minutes apart while the engine still wants 65 is the 112-skipped campaign
   * again, with a nicer preview on top of it.
   */
  assert.ok(quick.includes('applyGapSettings('), 'quick publish must write the gap settings, not only the schedule');
  assert.ok(
    quick.indexOf('applyGapSettings(') < quick.indexOf('await createSchedule('),
    'the gap settings must be written before the schedule, so rows planned from it are measured against the number the owner chose',
  );
  assert.ok(
    !/\brespaceQueue\(/.test(library),
    'quick publish creates a queue; respaceQueue moves an existing one, and calling it before the rows exist logs a misleading "0 פרסומים תוזמנו מחדש"',
  );

  /*
   * THE PREVIEW IS THE TRUTH. It must come out of slots.ts — the planner's own
   * arithmetic — and out of the SAME draft the write is built from. Two
   * implementations of "every N minutes" is a preview with a countdown on it.
   */
  assert.ok(/import \{ dripSlots, slotsFor \} from '\.\/slots'/.test(library), 'the preview must import the planner\'s slot functions');
  assert.ok(/function slotsForDraft\(draft: QuickPublishDraft/.test(library), 'the preview must be computed from the draft');
  assert.ok(/function scheduleInputFor\(draft: QuickPublishDraft/.test(library), 'the write must be built from the same draft');
  const slotsFn = library.slice(library.indexOf('function slotsForDraft('), library.indexOf('function scheduleInputFor('));
  assert.ok(slotsFn.includes('dripSlots('), 'the staggered preview must come from dripSlots() — slotsFor() fires every target at once and cannot stagger');
  assert.ok(
    /drip_gap_minutes: draft\.gapMinutes/.test(slotsFn),
    'the preview must read the gap off the draft, not off a second number',
  );
  const writeFn = library.slice(library.indexOf('function scheduleInputFor('), library.indexOf('export function planQuickPublish'));
  for (const field of ['drip_per_day: draft.perDay', 'drip_gap_minutes: draft.gapMinutes', 'drip_window_start: draft.windowStart', 'drip_window_end: draft.windowEnd']) {
    assert.ok(writeFn.includes(field), `the schedule written must take ${field.split(':')[0]} from the same draft the preview used`);
    assert.ok(slotsFn.includes(field), `the preview must take ${field.split(':')[0]} from the same draft too`);
  }

  /*
   * ONE POST MODEL. The library is a layer over social_posts. A ContentPost
   * table beside it would give the owner two places their posts live, which is
   * the exact confusion this module was built to remove.
   */
  const createdTables = [...v8.matchAll(/create table (?:if not exists )?([\w.]+)/gi)].map((m) => m[1]);
  assert.deepEqual(
    createdTables,
    ['public.social_content_categories'],
    'v8 may add the categories table and nothing else — a second posts table is the defect this architecture exists to prevent',
  );
  assert.ok(
    /alter table public\.social_posts add column if not exists category_id uuid/.test(v8),
    'the category must live as a column on social_posts',
  );
  assert.ok(/on delete set null/.test(v8), 'deleting a category must never delete the owner\'s posts');
  /*
   * ...and no denormalised counter. campaignProgress() and hasPendingQueue() are
   * derived for the same reason: a stored count is wrong the first time a row is
   * cancelled, retried or swept by a stopped campaign — and wrong quietly.
   */
  assert.ok(
    !/alter table public\.social_posts add column[^;]*(publish|count)/i.test(v8),
    'usage stats are aggregated from social_queue, never counted into a column that drifts',
  );
  assert.ok(library.includes("from('social_queue')"), 'the library must read its counts from the queue');

  /*
   * ONE NAV ENTRY. "Two screens for one idea is exactly what confuses them" —
   * so the library REPLACES פוסטים rather than sitting beside it.
   */
  const navBlock = shell.slice(shell.indexOf('const nav = ['), shell.indexOf('];', shell.indexOf('const nav = [')));
  assert.equal(
    (navBlock.match(/\/social\/library/g) ?? []).length,
    1,
    'the library must have exactly one nav entry',
  );
  assert.ok(
    !/href: '\/social\/posts'/.test(navBlock),
    'the old פוסטים entry must be gone — the library replaces it, it does not sit beside it',
  );

  /*
   * HONESTY. The interval is the owner's own setting. Nothing here may present
   * it as protection, and no count may be shown that was not read.
   */
  for (const at of [...sheet.matchAll(/בטוח|מבטיח/g)].map((m) => m.index ?? 0)) {
    assert.ok(
      sheet.slice(Math.max(0, at - 60), at).includes('אין '),
      'every claim about an interval and Facebook must be a denial — there is no number that guarantees anything',
    );
  }
  assert.ok(
    sheet.includes('המרווח הוא הגדרה שלכם בלבד'),
    'the quick-publish sheet must carry the scheduler\'s own disclaimer, word for word',
  );
  assert.ok(
    sheet.includes('חלה על כל החשבון'),
    'the sheet must say the gap is an account-wide setting, not a per-publication one',
  );
  assert.ok(
    library.includes('truncated'),
    'the usage read has a ceiling, and a ceiling presented as a total is a made-up number',
  );

  console.log('content-library tests OK');
}

/* ==================================================================== */
/* ONE CLASSIFICATION, AND THE COUNTS THAT COME OUT OF IT               */
/*                                                                      */
/* Everything below runs in this process against the real modules. It   */
/* is a SIMULATION: there is no Supabase credential in this checkout,   */
/* so no test here touches a database and no campaign was run. The      */
/* queue is an in-memory table whose claim and status writes mirror the */
/* two workers' (pinned to their source at the end of this file), and   */
/* the view model is computed by the real campaignState().              */
/* ==================================================================== */
{
  // --- every status belongs to exactly one lifecycle, and the sublists agree
  assert.equal(ALL_QUEUE_STATUSES.length, 9, 'the CHECK constraint allows nine statuses');
  assert.equal(new Set(ALL_QUEUE_STATUSES).size, 9, 'no status listed twice');
  for (const s of ALL_QUEUE_STATUSES) {
    const lifecycles = [TERMINAL_STATUSES, WAITING_LIST, IN_FLIGHT_STATUSES].filter((l) => l.includes(s));
    assert.equal(lifecycles.length, 1, `${s} must belong to exactly one lifecycle, not ${lifecycles.length}`);
    assert.ok(QUEUE_LIFECYCLE[s], `${s} must have a lifecycle`);
  }
  assert.deepEqual(TERMINAL_STATUSES, ['published', 'failed', 'skipped']);
  assert.deepEqual(IN_FLIGHT_STATUSES, ['publishing']);
  // A row a person must touch is waiting, not running: calling it "running"
  // is what let a run read "רץ" for ever with a bar that could never fill.
  for (const s of NEEDS_HUMAN_STATUSES) assert.ok(isOpen(s) && !isTerminal(s), `${s} is not finished`);
  assert.ok(!IN_FLIGHT_STATUSES.includes('awaiting_confirmation'), 'awaiting_confirmation waits for a person');
  // Cancel acts on exactly what "waiting" means, so a dialog cannot promise a
  // number the write will not deliver.
  assert.deepEqual([...CANCELLABLE_STATUSES].sort(), [...WAITING_LIST].sort());
  assert.ok(!CANCELLABLE_STATUSES.includes('publishing'), 'a job already running is left to finish');
  for (const s of ['scheduled', 'paused', 'manual_pending', 'needs_attention', 'awaiting_confirmation'] as QueueStatus[]) {
    assert.ok(CANCELLABLE_STATUSES.includes(s), `${s} must be cancellable — manual_pending used to survive every cancel path`);
  }
  assert.deepEqual([...OPEN_STATUSES].sort(), [...WAITING_LIST, ...IN_FLIGHT_STATUSES].sort());

  // --- summarizeQueue partitions the table exactly once
  const counts = Object.fromEntries(ALL_QUEUE_STATUSES.map((s, i) => [s, i + 1])) as Record<QueueStatus, number>;
  const sum = summarizeQueue(counts);
  assert.equal(sum.total, 45);
  assert.equal(sum.terminal + sum.waiting + sum.inFlight, sum.total, 'the three lifecycles must cover every row');
  assert.equal(sum.queued + sum.needsHuman, sum.open, 'the two open tiles must cover every unfinished row');
  assert.equal(sum.cancellable, sum.waiting);
  assert.deepEqual(checkQueueInvariants(counts, sum).map((v) => v.code), ['unclaimable_waiting_rows']);
  const clean = { ...counts, paused: 0 };
  assert.deepEqual(checkQueueInvariants(clean), [], 'a queue with no phantom rows raises nothing');

  console.log('classification tests OK');
}

/* ------------------------------------------------ "הושלמו" vs "פורסמו" */
{
  const at = (m: number) => new Date(Date.UTC(2026, 8, 20, 12, m)).toISOString();
  const make = (statuses: QueueStatus[]): CampaignQueueRow[] =>
    statuses.map((status, i) => ({
      id: `r${i}`,
      status,
      scheduled_at: at(i),
      published_at: status === 'published' ? at(i) : null,
      target_id: `t${i}`,
      post_id: 'p1',
      target: { id: `t${i}`, name: `קבוצה ${i}` },
    }));

  // The owner's evening: 112 claimed, nothing published, everything skipped.
  const skippedOnly = campaignState(make(Array(112).fill('skipped')), { status: 'active' });
  assert.equal(skippedOnly.progress.published, 0);
  assert.equal(skippedOnly.progress.finished, 112);
  assert.equal(percentPublished(skippedOnly.progress), 0, 'a run that published nothing is not 100% anything');
  assert.equal(percentFinished(skippedOnly.progress), 100, 'but it HAS ended — that is a different number');
  assert.equal(campaignHeadline(skippedOnly), '0 מתוך 112 פורסמו · 112 דולגו');
  assert.ok(!campaignHeadline(skippedOnly).includes('הושלמו'), '"הושלמו" must not stand for "skipped"');
  assert.equal(skippedOnly.state, 'completed', 'the run did end — it just published nothing');

  const failedOnly = campaignState(make(Array(40).fill('failed')), { status: 'active' });
  assert.equal(percentPublished(failedOnly.progress), 0);
  assert.equal(campaignHeadline(failedOnly), '0 מתוך 40 פורסמו · 40 נכשלו');

  // Mixed, which is the case every string has to stay true for.
  const mixed = campaignState(
    make([...Array(6).fill('published'), ...Array(3).fill('skipped'), 'failed']),
    { status: 'active' },
  );
  /*
   * RE-POINTED, not weakened. These two pinned "1 נכשלו" — Hebrew puts one in
   * the singular, so that string was the defect ("לפני 1 שעות" is the same
   * bug, and it is the one the owner reported). The assertions still pin the
   * exact sentence, at the grammar campaign.ts now produces; three and above
   * are unchanged, so the plural branch is still covered on the same line.
   */
  assert.equal(campaignHeadline(mixed), '6 מתוך 10 פורסמו · 3 דולגו · פרסום אחד נכשל');
  assert.equal(percentPublished(mixed.progress), 60);
  assert.equal(percentFinished(mixed.progress), 100);
  assert.equal(unpublishedNote(mixed.progress), '3 דולגו · פרסום אחד נכשל');
  // All published: nothing to add, and no invented zero.
  const allGood = campaignState(make(Array(5).fill('published')), { status: 'active' });
  assert.equal(unpublishedNote(allGood.progress), '');
  assert.equal(campaignHeadline(allGood), '5 מתוך 5 פורסמו');

  console.log('headline tests OK');
}

/* --------------------------------------------- resolveState, exhaustively */
{
  const at = (m: number) => new Date(Date.UTC(2026, 8, 20, 12, m)).toISOString();
  const state = (statuses: QueueStatus[], campaign: 'active' | 'paused' | 'archived') =>
    campaignState(
      statuses.map((status, i) => ({
        id: `r${i}`,
        status,
        scheduled_at: at(i),
        published_at: status === 'published' ? at(i) : null,
        target_id: `t${i}`,
        post_id: 'p1',
        target: { id: `t${i}`, name: `קבוצה ${i}` },
      })),
      { status: campaign },
    );

  // Defect (B): every row terminal on a campaign record still marked paused.
  for (const rows of [['published', 'published'], ['skipped', 'skipped'], ['published', 'skipped', 'failed']] as QueueStatus[][]) {
    const s = state(rows, 'paused');
    assert.equal(s.state, 'completed', `nothing is being held back — ${rows.join('+')} must not read "מושהה"`);
    assert.equal(RUN_STATE_LABEL[s.state], 'הושלם');
    assert.equal(openRows(s.progress), 0);
    assert.deepEqual(checkCampaignInvariants(s, { campaignId: 'c1' }), [], 'and the invariants agree');
  }
  // Paused is still paused while rows are genuinely waiting — this is the one
  // honest paused case and the resume button really can act on it.
  const heldBack = state(['published', 'scheduled', 'scheduled'], 'paused');
  assert.equal(heldBack.state, 'paused');
  assert.equal(heldBack.progress.scheduled, 2);
  // A pause cannot hold back a job already in flight, nor a row waiting for a
  // person, so neither puts the card in 'paused' with a dead resume button.
  assert.equal(state(['published', 'publishing'], 'paused').state, 'running');
  assert.equal(state(['published', 'manual_pending'], 'paused').state, 'needs_attention');
  assert.equal(state(['published', 'awaiting_confirmation'], 'paused').state, 'needs_attention');
  // Archived always wins; an empty run has not started.
  assert.equal(state(['scheduled'], 'archived').state, 'stopped');
  assert.equal(campaignState([], { status: 'paused' }).state, 'not_started');
  // In flight is in flight, not finished.
  assert.equal(state(['published', 'publishing'], 'active').state, 'running');
  assert.equal(state(['scheduled', 'scheduled'], 'active').state, 'not_started');

  console.log('run-state tests OK');
}

/* ------------------------------------------------------ invariant checks */
{
  resetInvariantReports();
  const row = (id: string, status: QueueStatus): CampaignQueueRow => ({
    id,
    status,
    scheduled_at: '2026-09-20T12:00:00.000Z',
    published_at: null,
    target_id: `t-${id}`,
    post_id: 'p1',
    target: { id: `t-${id}`, name: id },
  });

  // I1 — a terminal row listed as upcoming.
  const broken = {
    progress: { total: 2, published: 1, failed: 0, skipped: 0, scheduled: 1, running: 0, manual: 0, finished: 1 },
    state: 'running' as const,
    upcoming: [row('q9', 'published')],
  };
  const v1 = checkCampaignInvariants(broken, { campaignId: 'c1' });
  assert.deepEqual(v1.map((v) => v.code), ['terminal_row_listed_as_upcoming']);
  assert.deepEqual(v1[0].meta.rowIds, ['q9'], 'the violation names the row');
  assert.deepEqual(v1[0].meta.statuses, ['published'], 'and the statuses involved');
  assert.equal(v1[0].meta.campaignId, 'c1', 'and the campaign');
  assert.ok(/[֐-׿]/.test(v1[0].message) && !/[A-Za-z]{4,}/.test(v1[0].message), 'Hebrew, never a raw error');

  // I2 — the buckets must add up to the total.
  const notPartitioned = {
    progress: { total: 10, published: 1, failed: 0, skipped: 0, scheduled: 1, running: 0, manual: 0, finished: 1 },
    state: 'running' as const,
    upcoming: [row('q1', 'scheduled')],
  };
  assert.ok(checkCampaignInvariants(notPartitioned).some((v) => v.code === 'counts_do_not_partition_total'));

  // I3 — paused with nothing waiting. I4 — completed with rows still open.
  const pausedEmpty = {
    progress: { total: 3, published: 3, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 3 },
    state: 'paused' as const,
    upcoming: [],
  };
  assert.deepEqual(checkCampaignInvariants(pausedEmpty).map((v) => v.code), ['paused_with_nothing_waiting']);
  const doneButOpen = {
    progress: { total: 3, published: 2, failed: 0, skipped: 0, scheduled: 1, running: 0, manual: 0, finished: 2 },
    state: 'completed' as const,
    upcoming: [row('q3', 'scheduled')],
  };
  const v4 = checkCampaignInvariants(doneButOpen, { campaignId: 'c9' });
  assert.deepEqual(v4.map((v) => v.code), ['completed_with_open_rows']);
  assert.deepEqual(v4[0].meta.rowIds, ['q3']);

  // I5 — a waiting row no worker can ever claim is named, not counted silently.
  const phantom = {
    progress: { total: 1, published: 0, failed: 0, skipped: 0, scheduled: 1, running: 0, manual: 0, finished: 0 },
    state: 'not_started' as const,
    upcoming: [row('q7', 'paused')],
  };
  assert.deepEqual(checkCampaignInvariants(phantom).map((v) => v.code), ['unclaimable_waiting_rows']);

  // Reported once per subject, so a 5-second poll cannot flood the owner's log.
  resetInvariantReports();
  assert.equal(takeUnreported(checkCampaignInvariants(pausedEmpty), 'campaign:c1').length, 1);
  assert.equal(takeUnreported(checkCampaignInvariants(pausedEmpty), 'campaign:c1').length, 0);
  assert.equal(takeUnreported(checkCampaignInvariants(pausedEmpty), 'campaign:c2').length, 1, 'a different run is a different subject');

  console.log('invariant tests OK');
}

/* ==================================================================== */
/* A 28-PUBLICATION RUN, END TO END                                     */
/*                                                                      */
/* Deterministic and in-process. The queue below is an in-memory table;  */
/* its claim is the same compare-and-set both workers issue             */
/* (UPDATE … SET status='publishing' WHERE id=? AND status='scheduled'),*/
/* and every outcome write is one the real workers make. NOTHING HERE   */
/* TALKS TO A DATABASE — there is no Supabase credential in this        */
/* checkout, so this reproduces the bookkeeping, not a real run. The    */
/* view model on top is the real campaignState(); the tiles are the     */
/* real summarizeQueue().                                               */
/* ==================================================================== */

interface SimRow {
  id: string;
  status: QueueStatus;
  scheduled_at: string;
  published_at: string | null;
  target_id: string;
  post_id: string;
  attempts: number;
  worker_id: string | null;
}

class SimQueue {
  rows: SimRow[] = [];

  constructor(n: number) {
    for (let i = 0; i < n; i += 1) {
      this.rows.push({
        id: `q${String(i + 1).padStart(2, '0')}`,
        status: 'scheduled',
        scheduled_at: new Date(Date.UTC(2026, 8, 20, 9, i * 20)).toISOString(),
        published_at: null,
        target_id: `t${i + 1}`,
        post_id: 'p1',
        attempts: 0,
        worker_id: null,
      });
    }
  }

  get(id: string): SimRow {
    const row = this.rows.find((r) => r.id === id);
    assert.ok(row, `no such row ${id}`);
    return row;
  }

  /** The workers' atomic claim: it moves the row only if it is still scheduled. */
  claim(id: string, workerId: string | null): boolean {
    const row = this.get(id);
    if (row.status !== 'scheduled') return false;
    row.status = 'publishing';
    row.attempts += 1;
    row.worker_id = workerId;
    return true;
  }

  patch(id: string, p: Partial<SimRow>): void {
    Object.assign(this.get(id), p);
  }

  /** worker/social-worker.ts recovers the rows IT left behind, on startup. */
  recover(workerId: string): string[] {
    const hit = this.rows.filter((r) => r.worker_id === workerId && (r.status === 'publishing' || r.status === 'awaiting_confirmation'));
    for (const r of hit) r.status = 'needs_attention';
    return hit.map((r) => r.id);
  }

  /** client.ts retryQueueItem: guarded, and it clears the worker that held it. */
  retry(id: string): boolean {
    const row = this.get(id);
    if (!['failed', 'skipped', 'needs_attention', 'scheduled', 'paused'].includes(row.status)) return false;
    row.status = 'scheduled';
    row.worker_id = null;
    return true;
  }

  /** What campaignStates()/campaignQueue() hand the card. `order` is the read's. */
  read(order: 'asc' | 'desc' = 'asc'): CampaignQueueRow[] {
    const copy = this.rows.map((r) => ({
      id: r.id,
      status: r.status,
      scheduled_at: r.scheduled_at,
      published_at: r.published_at,
      target_id: r.target_id,
      post_id: r.post_id,
      target: { id: r.target_id, name: `קבוצה ${r.target_id}` },
    }));
    copy.sort((a, b) => (order === 'asc' ? 1 : -1) * a.scheduled_at.localeCompare(b.scheduled_at));
    return copy;
  }

  /** countByStatus(), exactly: one number per status, over the whole table. */
  counts(): Record<QueueStatus, number> {
    const out = Object.fromEntries(ALL_QUEUE_STATUSES.map((s) => [s, 0])) as Record<QueueStatus, number>;
    for (const r of this.rows) out[r.status] += 1;
    return out;
  }
}

/** One publication, as the workers write it. */
function simPublish(q: SimQueue, id: string, minute: number): void {
  assert.ok(q.claim(id, 'worker-pc'), `${id} must be claimable`);
  q.patch(id, { status: 'published', published_at: new Date(Date.UTC(2026, 8, 20, 10, minute)).toISOString(), worker_id: null });
}

/** What the run card and the dashboard both say, from one set of rows. */
function screen(q: SimQueue, campaign: 'active' | 'paused' | 'archived' = 'active') {
  const state = campaignState(q.read('asc'), { status: campaign });
  const summary = summarizeQueue(q.counts());
  return {
    headline: campaignHeadline(state),
    percentPublished: percentPublished(state.progress),
    percentFinished: percentFinished(state.progress),
    runState: RUN_STATE_LABEL[state.state],
    cardPublished: state.progress.published,
    cardOpen: openRows(state.progress),
    cardUpcoming: state.upcoming.length,
    tileQueued: summary.queued,
    tileNeedsYou: summary.needsHuman,
    tileFailed: summary.failed,
    state,
    summary,
  };
}

const scenario: { step: string; line: string }[] = [];
{
  resetInvariantReports();
  const q = new SimQueue(28);
  const note = (step: string, s: ReturnType<typeof screen>) => {
    scenario.push({
      step,
      line: `${s.runState.padEnd(10)} | ${s.headline.padEnd(42)} | פורסמו ${String(s.cardPublished).padStart(2)} | ${String(s.percentPublished).padStart(3)}% פורסמו | ${String(s.percentFinished).padStart(3)}% הסתיימו | פתוחים ${String(s.cardOpen).padStart(2)} | קרובים ${String(s.cardUpcoming).padStart(2)} | אריח-בתור ${String(s.tileQueued).padStart(2)} | אריח-דורשים ${s.tileNeedsYou}`,
    });
  };
  /** After every step: the card and the tiles must be describing one queue. */
  const agree = (s: ReturnType<typeof screen>, where: string) => {
    assert.deepEqual(checkCampaignInvariants(s.state, { campaignId: 'c-28' }), [], `${where}: campaign invariants`);
    assert.deepEqual(checkQueueInvariants(q.counts()), [], `${where}: queue invariants`);
    // The card's open rows and the dashboard's two open tiles are the same rows.
    assert.equal(s.cardOpen, s.tileQueued + s.tileNeedsYou, `${where}: the card and the tiles must count the same unfinished rows`);
    assert.equal(s.cardUpcoming, s.cardOpen, `${where}: "upcoming" is exactly what has not finished`);
    // A terminal row is never in a pending or upcoming result.
    for (const r of s.state.upcoming) assert.ok(!isTerminal(r.status), `${where}: ${r.id} is finished and must not be listed as upcoming`);
    // The buckets partition the total, once.
    const p = s.state.progress;
    assert.equal(p.published + p.failed + p.skipped + p.scheduled + p.running + p.manual, p.total, `${where}: partition`);
  };

  // --- 1. before anything runs
  let s = screen(q);
  assert.equal(s.runState, 'טרם התחיל');
  assert.equal(s.percentPublished, 0);
  assert.equal(s.cardOpen, 28);
  assert.equal(s.tileQueued, 28);
  agree(s, 'step 1');
  note('1. לפני ההפעלה', s);

  // --- 2. ten publications go out
  for (let i = 1; i <= 10; i += 1) simPublish(q, `q${String(i).padStart(2, '0')}`, i);
  s = screen(q);
  assert.equal(s.cardPublished, 10);
  assert.equal(s.runState, 'רץ');
  assert.equal(s.percentPublished, 36);
  agree(s, 'step 2');
  note('2. עשרה פורסמו', s);

  // --- 3. three are skipped by the rules engine (already published there)
  for (const id of ['q11', 'q12', 'q13']) {
    assert.ok(q.claim(id, 'worker-pc'));
    q.patch(id, { status: 'skipped', worker_id: null });
  }
  s = screen(q);
  assert.equal(s.state.progress.finished, 13, 'thirteen rows have ended');
  assert.equal(s.cardPublished, 10, 'but only ten published');
  assert.ok(s.headline.startsWith('10 מתוך 28 פורסמו'), `headline must not call a skip a publication: ${s.headline}`);
  assert.ok(s.headline.includes('3 דולגו'));
  assert.equal(s.percentPublished, 36);
  assert.equal(s.percentFinished, 46);
  agree(s, 'step 3');
  note('3. שלושה דולגו', s);

  // --- 4. the PC worker claims a row and dies mid-publication
  assert.ok(q.claim('q14', 'worker-pc'));
  s = screen(q);
  assert.equal(s.state.progress.running, 1, 'the claimed row is in flight');
  assert.equal(s.runState, 'רץ');
  assert.notEqual(s.runState, 'הושלם');
  assert.ok(s.state.upcoming.some((r) => r.id === 'q14'), 'an in-flight row has not finished');
  agree(s, 'step 4 (worker died mid-row)');
  note('4. ה-worker נפל באמצע', s);

  // --- 4b. a second worker cannot take the same row — no double publication
  assert.equal(q.claim('q14', 'worker-vercel'), false, 'a claimed row is not claimable again');
  assert.equal(q.get('q14').status, 'publishing');
  assert.equal(q.get('q14').attempts, 1, 'a refused claim spends no attempt');

  // --- 5. the worker restarts and recovers what IT left behind
  assert.deepEqual(q.recover('worker-pc'), ['q14']);
  s = screen(q);
  assert.equal(q.get('q14').status, 'needs_attention');
  assert.equal(s.state.progress.running, 0);
  assert.equal(s.state.progress.manual, 1);
  assert.equal(s.tileNeedsYou, 1, 'the dashboard shows the recovered row as needing a person');
  assert.notEqual(s.runState, 'הושלם');
  agree(s, 'step 5 (worker restarted)');
  note('5. ה-worker עלה מחדש', s);

  // --- 6. the same rows re-read in the opposite database order: same screen
  const asc = campaignState(q.read('asc'), { status: 'active' });
  const desc = campaignState(q.read('desc'), { status: 'active' });
  assert.deepEqual(desc.progress, asc.progress, 'a page refresh must not change a single number');
  assert.equal(desc.state, asc.state);
  assert.deepEqual(desc.upcoming.map((r) => r.id), asc.upcoming.map((r) => r.id), 'and upcoming stays soonest-first whatever order the read returned');
  assert.equal(desc.nextAt, asc.nextAt);
  note('6. רענון הדף (אותן שורות)', screen(q));

  // --- 7. the owner retries the recovered row; it publishes exactly once
  assert.ok(q.retry('q14'));
  assert.equal(q.get('q14').status, 'scheduled');
  simPublish(q, 'q14', 14);
  assert.equal(q.get('q14').status, 'published');
  assert.equal(q.claim('q14', 'worker-pc'), false, 'a published row can never be claimed again');
  assert.equal(q.rows.filter((r) => r.id === 'q14' && r.status === 'published').length, 1, 'one row, one publication');
  s = screen(q);
  assert.equal(s.cardPublished, 11);
  agree(s, 'step 7 (retry after a crash)');
  note('7. ניסיון חוזר אחרי נפילה', s);

  // --- 8. one row fails for good; one fails and is retried into a publication
  for (const id of ['q15', 'q16']) {
    assert.ok(q.claim(id, 'worker-pc'));
    q.patch(id, { status: 'failed', worker_id: null });
  }
  s = screen(q);
  assert.equal(s.tileFailed, 2);
  assert.ok(s.headline.includes('2 נכשלו'));
  agree(s, 'step 8 (two failures)');
  note('8. שניים נכשלו', s);

  assert.ok(q.retry('q16'));
  simPublish(q, 'q16', 16);
  s = screen(q);
  assert.equal(s.tileFailed, 1, 'a retried failure stops being a failure');
  assert.equal(s.cardPublished, 12);
  agree(s, 'step 9 (retry after failure)');
  note('9. ניסיון חוזר אחרי כישלון', s);

  // --- 9. the rest go out
  for (let i = 17; i <= 28; i += 1) simPublish(q, `q${i}`, i);
  s = screen(q);

  // --- 10. the finished run: nothing may read as pending, anywhere
  assert.equal(s.state.progress.total, 28);
  assert.equal(s.state.progress.published, 24);
  assert.equal(s.state.progress.skipped, 3);
  assert.equal(s.state.progress.failed, 1);
  assert.equal(s.state.progress.finished, 28);
  assert.equal(openRows(s.state.progress), 0);
  assert.equal(s.cardUpcoming, 0, 'a completed run lists nothing as upcoming');
  assert.equal(s.tileQueued, 0, 'and the dashboard counts nothing as queued');
  assert.equal(s.tileNeedsYou, 0);
  assert.equal(s.summary.cancellable, 0, 'and "delete everything waiting" would delete nothing');
  assert.equal(s.runState, 'הושלם');
  assert.equal(s.percentFinished, 100);
  assert.equal(s.percentPublished, 86, 'the bar shows publications, and 4 of 28 never published');
  // RE-POINTED with the two above: one failure is "פרסום אחד נכשל" now.
  assert.equal(s.headline, '24 מתוך 28 פורסמו · 3 דולגו · פרסום אחד נכשל');
  agree(s, 'step 10 (finished)');
  note('10. אחרי השורה האחרונה', s);

  // The same finished run on a campaign record still marked paused — defect (B).
  const stale = screen(q, 'paused');
  assert.equal(stale.runState, 'הושלם', 'a run with nothing waiting is never "מושהה"');
  assert.deepEqual(checkCampaignInvariants(stale.state, { campaignId: 'c-28' }), []);
  // And re-reading it, in either order, says the same thing.
  assert.deepEqual(campaignState(q.read('desc'), { status: 'paused' }).progress, stale.state.progress);

  console.log('28-publication campaign tests OK');
}

/* --------------------------------------------------- truncated reads */
{
  // campaignStates() caps its read and orders by scheduled_at ASC, so what is
  // dropped is the still-scheduled future — a capped read makes a run look
  // MORE finished than it is. It must not be presented as a total.
  const rows: CampaignQueueRow[] = Array.from({ length: 14 }, (_, i) => ({
    id: `q${i}`,
    status: 'published' as QueueStatus,
    scheduled_at: new Date(Date.UTC(2026, 8, 20, 9, i)).toISOString(),
    published_at: new Date(Date.UTC(2026, 8, 20, 9, i)).toISOString(),
    target_id: `t${i}`,
    post_id: 'p1',
    target: { id: `t${i}`, name: `קבוצה ${i}` },
  }));
  const capped = campaignState(rows, { status: 'active' }, { truncated: true });
  assert.equal(capped.truncated, true, 'the state carries the flag the screen renders');
  assert.equal(percentPublished(capped.progress), 100, 'of the rows it read — which is why the screen must say so');
  const whole = campaignState(rows, { status: 'active' });
  assert.equal(whole.truncated, false, 'an untruncated read is not flagged');

  // The screens that draw it must disclose it rather than print a bare total.
  const hero = readFileSync('src/components/social/LiveCampaignHero.tsx', 'utf8');
  assert.ok(hero.includes('state.truncated'), 'the hero must disclose a capped read');
  const runPage = readFileSync('src/app/social/campaigns/[id]/page.tsx', 'utf8');
  assert.ok(runPage.includes('state?.truncated'), 'the run page must disclose a capped read');
  const client = readFileSync('src/lib/social/client.ts', 'utf8');
  assert.ok(client.includes('const truncated = rows.length >= CAMPAIGN_ROLLUP_LIMIT;'), 'campaignStates must detect its own ceiling');
  assert.ok(client.includes('truncated: rows.length >= CAMPAIGN_QUEUE_LIMIT'), 'campaignQueue must report its ceiling');
  // countByStatus stopped being truncatable at all: exact head counts, no rows.
  assert.ok(client.includes("select('id', { count: 'exact', head: true }).eq('status', status)"), 'the tiles must use exact counts');
  assert.ok(!/from\('social_queue'\)\.select\('status'\)/.test(client), 'the old unbounded select(status) must be gone');

  console.log('truncation tests OK');
}

/* ------------------------- the app still reads the one classification */
{
  const pin = (what: string, src: string, needle: string) =>
    assert.ok(src.includes(needle), `${what} drifted from the single classification: ${needle}`);

  const dash = readFileSync('src/app/social/page.tsx', 'utf8');
  // The "next publications" list is read ascending: the limit is applied after
  // the sort, so descending returned the FURTHEST-OUT rows.
  pin('dashboard upcoming', dash, "listQueue({ status: AUTOMATIC_WAITING_STATUSES, limit: UPCOMING_LIMIT, order: 'asc' })");
  pin('dashboard tiles', dash, 'value={summary.queued}');
  pin('dashboard tiles', dash, 'value={summary.needsHuman}');
  // The cap is never printed as a total.
  pin('upcoming subtitle', dash, 'subtitle={summary.queued ? `${summary.queued} ממתינים בתור` : undefined}');
  assert.ok(!dash.includes('data.upcoming.length} ממתינים'), 'a capped array length must not be printed as the queue');

  const client = readFileSync('src/lib/social/client.ts', 'utf8');
  pin('cancel lists', client, "const CANCELLABLE: QueueItem['status'][] = CANCELLABLE_STATUSES;");
  pin('bulk cancel', client, ".update({ status: 'skipped', step: '', skip_reason: 'בוטל — עצירת כל התורים' })\n      .in('status', CANCELLABLE)");

  const campaign = readFileSync('src/lib/social/campaign.ts', 'utf8');
  pin('progress buckets', campaign, 'progress.finished = progress.published + progress.failed + progress.skipped;');
  pin('terminal before paused', campaign, "if (openRows(p) === 0) return 'completed';");
  assert.ok(!campaign.includes('progress.done'), '"done" meant two things and must not come back');

  const lib = readFileSync('src/lib/social/library.ts', 'utf8');
  pin('library pending', lib, "const USAGE_PENDING: QueueItem['status'][] = OPEN_STATUSES;");
  pin('library counts every row', lib, ".in('status', ALL_QUEUE_STATUSES)");

  // Both workers park a waiting row on a new instant instead of re-reading it
  // every poll with the attempt already spent.
  const pcWorker = readFileSync('worker/social-worker.ts', 'utf8');
  pin('local worker wait', pcWorker, "scheduled_at: decision.until, attempts: item.attempts");
  const srvWorker = readFileSync('src/lib/social/server/worker.ts', 'utf8');
  pin('server worker wait', srvWorker, "scheduled_at: decision.until, attempts: Math.max(0, item.attempts - 1)");

  console.log('source-alignment tests OK');
}

/* ============================================================================
 * Regression guards for the audit fixes. Every one of these is a behaviour a
 * customer could see going wrong, pinned so it cannot come back quietly.
 * ==========================================================================*/
{
  const client = readFileSync('src/lib/social/client.ts', 'utf8');
  const pcWorker = readFileSync('worker/social-worker.ts', 'utf8');
  const server = readFileSync('src/lib/social/server/worker.ts', 'utf8');
  const adapter = readFileSync('worker/adapters/facebookGroupBrowser.ts', 'utf8');
  const types = readFileSync('src/lib/social/types.ts', 'utf8');
  const slice = (src: string, from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to));

  /* --- no business's contact details are invented for another business ----- */
  assert.equal(DEFAULT_BUSINESS.phone, '', 'the fallback phone must be empty — it is appended to every published post');
  assert.equal(DEFAULT_BUSINESS.whatsapp, '', 'the fallback WhatsApp must be empty for the same reason');
  assert.ok(!/05\d-?\d{7}|9725\d{8}/.test(types), 'no real phone number may sit in the shared library as a default');
  const seed = readFileSync('supabase/social-schema.sql', 'utf8');
  assert.ok(!/05\d-?\d{7}|9725\d{8}/.test(seed), 'a fresh install must not be seeded with somebody else\u2019s phone number');
  // ...and an empty one is simply left off the post rather than printed blank.
  assert.equal(renderPostText({ base_text: 'טקסט', phone: '', whatsapp_url: '' }), 'טקסט');
  assert.equal(
    renderPostText({ base_text: 'טקסט', phone: '050-1112222', whatsapp_url: '' }),
    'טקסט\n\n📞 050-1112222',
    'only the fields that were actually filled in go out',
  );

  /* --- cancel means the same set of statuses everywhere ------------------- */
  const archive = slice(client, 'export async function archivePost', 'export async function listVariants');
  assert.ok(archive.includes(".in('status', CANCELLABLE)"), 'archiving a post must cancel every row that has not gone out, not only the scheduled ones');
  assert.ok(!archive.includes("eq('status', 'scheduled')"), 'the inline status list must not come back');
  const deactivate = slice(client, 'export async function setScheduleActive', '/* ---------------------------------------------------------------- queue */');
  assert.ok(deactivate.includes(".in('status', CANCELLABLE)"), 'switching a schedule off must cancel the same set');
  assert.ok(!deactivate.includes("eq('status', 'scheduled')"), 'the inline status list must not come back');

  /* --- deleting a run stops it first -------------------------------------- */
  const del = slice(client, 'export async function deleteCampaign', '/* ---------------------------------------------------------------- posts */');
  assert.ok(del.includes(".in('status', CANCELLABLE)"), 'deleting a run must cancel what it still holds');
  assert.ok(
    del.indexOf(".in('status', CANCELLABLE)") < del.indexOf("from('social_campaigns').delete()"),
    'the rows must be cancelled BEFORE the campaign row goes — campaign_id is ON DELETE SET NULL, and rules.ts only honours pause/stop for a row that still has a campaign',
  );
  assert.ok(del.includes("update({ active: false })"), 'its schedules must stop too, or the planner re-creates the rows');

  /* --- the launch guard sees every unfinished row -------------------------- */
  const guard2 = slice(client, 'export async function hasPendingQueue', 'export async function listSchedules');
  assert.ok(guard2.includes("in('status', OPEN_STATUSES)"), 'the duplicate-launch guard must use the single classification');
  for (const status of ['manual_pending', 'needs_attention', 'paused'] as QueueStatus[]) {
    assert.ok(OPEN_STATUSES.includes(status), `${status} is unfinished and must block a second launch`);
  }

  /* --- "ask me before every Post click" must ask EVERY time ---------------- */
  // confirmed_at is per-attempt state. Every path that puts a row back in the
  // queue clears it, and the gate itself clears it as it parks the row — so a
  // stamp from a previous round can never answer the next question.
  const retry = slice(client, 'export async function retryQueueItem', 'export async function cancelQueueItem');
  assert.ok(retry.includes('confirmed_at: null'), 'retry must clear the confirmation stamp');
  assert.ok(retry.includes('attempts: 0'), 'retry must clear the attempt counter, or rules.ts skips the row again instantly');
  const resume = slice(client, 'export async function resumeNeedsAttention', '/** Live view');
  assert.ok(resume.includes('confirmed_at: null') && resume.includes('attempts: 0'), 'resuming a parked row is a fresh attempt');
  const gate = slice(pcWorker, 'async function waitForConfirmation', '/* ------------------------------------------------------------ helpers */');
  assert.ok(gate.includes('confirmed_at: null'), 'the confirmation gate must clear the stamp when it parks the row');
  assert.ok(
    gate.indexOf('confirmed_at: null') < gate.indexOf('if (data.confirmed_at)'),
    'the stamp has to be cleared before the first poll reads it',
  );
  assert.ok(pcWorker.includes("status: 'scheduled', step: 'pending', scheduled_at: retryAt, error: message, screenshot_path: screenshot, confirmed_at: null"), "the worker's own retry must clear it too");

  /* --- confirm is a guarded write, like retry and cancel ------------------- */
  const confirm = slice(client, 'export async function confirmQueueItem', '/** Rows a browser worker parked');
  assert.ok(confirm.includes("guardedUpdate(id, ['awaiting_confirmation']"), 'confirming must only touch a row that is actually waiting to be confirmed');
  assert.ok(!confirm.includes('updateQueueItem('), 'the unguarded write must not come back');

  /* --- one publication at a time ------------------------------------------ */
  assert.ok(!/Promise\.all\([^)]*runJob/.test(pcWorker), 'jobs must not run concurrently: every limit in rules.ts is a count taken before the batch writes its outcome');
  assert.ok(/for \(const item of jobs\.slice\(0, concurrency\)\) \{/.test(pcWorker), 'the batch is claimed together and published one after another');

  /* --- a publication is never recorded twice, and never published twice ---- */
  const job = slice(pcWorker, 'async function runJob', '/** Three tries with a short backoff');
  const publishTry = job.slice(job.indexOf('  try {\n    result = await adapter.publish('), job.indexOf('  } catch (err) {'));
  assert.ok(publishTry.includes('adapter.publish('), 'sanity: found the publish try block');
  assert.ok(
    !publishTry.includes("status: 'published'"),
    'the outcome write must sit OUTSIDE the try — inside it, a dropped Supabase write after Facebook accepted the post is caught as a failure, rescheduled, and published a second time',
  );
  assert.ok(job.includes('await persist(() =>') && job.includes('finishChecked({ status: \'published\''), 'the published write is retried, and it can tell that it failed');
  assert.ok(job.includes('if (!recorded)'), 'a publish that could not be recorded leaves the row alone for a person to resolve');

  /* --- nothing raw reaches a column the dashboard prints ------------------- */
  assert.ok(!/last_error: err\.message|error: err\.message/.test(pcWorker), 'a caught exception must not be written to the database unscrubbed');
  assert.ok(job.includes('const message = safeError(err);'), 'failures are stored scrubbed and in Hebrew');
  assert.equal(
    safeError(new Error('TimeoutError: page.waitForSelector: Timeout 30000ms exceeded')),
    'השרת לא הגיב בזמן. נסו שוב בעוד רגע.',
    'a Playwright timeout must not land in English inside an RTL sentence',
  );
  assert.ok(!safeError(new Error('failed for c_user=100001234567890')).includes('100001234567890'), 'a session cookie must never survive into a stored error');
  assert.equal(safeError(new PublishError('composer', 'לא מצאתי את תיבת הכתיבה.')), 'לא מצאתי את תיבת הכתיבה.', 'our own Hebrew is passed through untouched');

  /* --- the browser is never pointed anywhere but a Facebook group --------- */
  assert.ok(adapter.includes('const group = parseGroupUrl(input.target.url);'), 'the address from the database is re-parsed at the boundary');
  assert.ok(adapter.includes('groupUrl: group.url'), 'and the normalised one is what gets opened');
  assert.ok(
    adapter.indexOf('parseGroupUrl(input.target.url)') < adapter.indexOf('this.session.newPage'),
    'the check has to happen before a page carrying the live Facebook session exists',
  );
  for (const hostile of ['file:///C:/Users/x/.env.local', 'https://notfacebook.com/groups/1', 'javascript:alert(1)', 'https://evil.example/groups/1']) {
    assert.equal(parseGroupUrl(hostile), null, `${hostile} must not resolve to a group`);
  }

  /* --- a row nobody is coming back for is released ------------------------ */
  assert.ok(server.includes('await sweepStuck(db);'), 'the stuck-row sweep must run');
  assert.ok(
    server.indexOf('await sweepStuck(db);') < server.indexOf("report.reason = 'התורים מושהים';"),
    'and it must run before the pause check — pausing is what an owner does BECAUSE something looks stuck',
  );
  const sweep = slice(server, 'async function sweepStuck', "type Outcome =");
  assert.ok(sweep.includes("status: 'needs_attention'"), 'an orphan of an offline worker goes to a person, never straight back to the queue: the Post button may already have been clicked');
  assert.ok(sweep.includes("in('worker_id', gone)"), "rows of a worker that stopped reporting are the ones nothing else was ever sweeping");

  /* --- a public bucket only ever serves media ----------------------------- */
  const upload = slice(client, 'const MEDIA_TYPES', 'export async function removeMedia');
  assert.ok(!upload.includes('svg'), 'SVG is a scriptable document and this bucket is world-readable');
  assert.ok(!upload.includes('contentType: file.type'), 'the caller must not choose what *.supabase.co serves');
  assert.ok(upload.includes('MEDIA_TYPES[declared]'), 'the stored type comes from the allowlist');

  /* --- a captive portal is not a successful response ---------------------- */
  const api = slice(client, 'export async function callSocialApi', "/* ------------------------------------------------------------- settings */");
  assert.ok(!/const body = await res\.json\(\)/.test(api), 'a 200 that is not JSON must not become an empty object the caller then dereferences');
  assert.ok(api.includes('JSON.parse(raw)'), 'the body is parsed deliberately, so an unparseable one is visible');
  assert.ok(api.includes('if (!parsed) throw'), 'it fails like any other failure, in one Hebrew sentence');

  console.log('audit-fix regression tests OK');
}

/* ============================================================================
 * THE DASHBOARD'S CROSS-SCOPE INVARIANT
 *
 * The rebuilt screen puts three rollups of DIFFERENT scopes within 400px of
 * each other, and that adjacency is the new contradiction risk:
 *
 *   system card  data.today / limits.maxPerDay   — the whole product, TODAY
 *   KPI row      summary.*                       — the whole queue, ALL TIME
 *   run card     state.progress.*                — ONE run, all time
 *
 * They are not parts of one ratio and must never be rendered as if they were.
 * What DOES hold between them is containment, and that is what is asserted
 * here — against the real pure functions, from an in-memory queue, with no
 * database and no React.
 * ==========================================================================*/
{
  const DAY_START = Date.UTC(2026, 8, 20, 21, 0, 0); // Asia/Jerusalem midnight
  type Row = CampaignQueueRow & { campaign_id: string | null };

  /** A queue spanning two days, three campaigns and every lifecycle. */
  const rows: Row[] = [];
  const push = (status: QueueStatus, campaign_id: string | null, publishedToday: boolean) =>
    rows.push({
      id: `q${rows.length}`,
      status,
      scheduled_at: new Date(DAY_START + rows.length * 60_000).toISOString(),
      published_at: status === 'published' ? new Date(publishedToday ? DAY_START + 3600_000 : DAY_START - 86_400_000).toISOString() : null,
      target_id: `t${rows.length % 7}`,
      post_id: 'p1',
      campaign_id,
    });
  for (let i = 0; i < 9; i += 1) push('published', 'c1', true);
  for (let i = 0; i < 12; i += 1) push('published', 'c1', false); // yesterday's
  for (let i = 0; i < 4; i += 1) push('published', 'c2', true);
  for (let i = 0; i < 5; i += 1) push('scheduled', 'c1', false);
  for (let i = 0; i < 3; i += 1) push('awaiting_confirmation', 'c1', false);
  for (let i = 0; i < 2; i += 1) push('manual_pending', null, false);
  push('needs_attention', 'c2', false);
  push('publishing', 'c1', false);
  push('failed', 'c1', false);
  push('skipped', 'c3', false);
  push('paused', null, false); // the status no worker can claim

  const counts = Object.fromEntries(ALL_QUEUE_STATUSES.map((st) => [st, rows.filter((r) => r.status === st).length])) as Record<QueueStatus, number>;
  const summary = summarizeQueue(counts);
  // The same filter countPublishedSince() applies: status published AND
  // published_at at or after the local day's start.
  const today = rows.filter((r) => r.status === 'published' && r.published_at && new Date(r.published_at).getTime() >= DAY_START).length;
  const run = campaignState(rows.filter((r) => r.campaign_id === 'c1'), { status: 'active' });

  /* --- I-1/I-2: the KPI row covers every open row exactly once ------------ */
  assert.deepEqual(checkQueueInvariants(counts, summary).map((v) => v.code), ['unclaimable_waiting_rows'], 'the only violation in this fixture is the deliberate unclaimable row');
  assert.equal(summary.queued + summary.needsHuman, summary.open, 'tile 2 + tile 3 are every open row, each counted once');
  assert.equal(summary.terminal + summary.waiting + summary.inFlight, summary.total, 'and the three lifecycles partition the queue');
  // The tile is LABELLED "דורשים טיפול", which invites narrowing it to
  // counts.needs_attention. That would hide awaiting_confirmation and
  // manual_pending from the control centre and break the line above.
  assert.equal(summary.needsHuman, counts.awaiting_confirmation + counts.manual_pending + counts.needs_attention);
  assert.notEqual(summary.needsHuman, counts.needs_attention, 'the fixture proves the narrowing would change the number');

  /* --- I-6: containment across the three scopes --------------------------- */
  assert.ok(today <= summary.published, `the day's count is a subset of the queue's publications (${today} <= ${summary.published})`);
  assert.ok(run.progress.published <= summary.published, `one run's publications are a subset of the queue's (${run.progress.published} <= ${summary.published})`);
  assert.ok(run.progress.total <= summary.total, 'one run is a subset of the queue');
  // ...and they are genuinely different numbers here, so a screen that divided
  // one by the other would be caught rather than accidentally agreeing.
  assert.equal(today, 13);
  assert.equal(summary.published, 25);
  assert.equal(run.progress.published, 21);

  /* --- I-3: the bar can never say "complete" beside waiting rows ---------- */
  assert.ok(percentPublished(run.progress) < 100, 'the run has open rows, so its bar cannot be full');
  assert.ok(openRows(run.progress) > 0);
  assert.ok(
    percentPublished(run.progress) !== 100 || openRows(run.progress) === 0,
    'THE REPORTED CONTRADICTION: 100% published implies nothing is open — it follows from the partition',
  );
  /*
   * The bar now draws the HANDLED figure, so the same invariant is asserted
   * over it. It still follows from the I-2 partition (finished === total means
   * scheduled + running + manual === 0), and campaign.ts's ratio() clamp is
   * what keeps rounding from breaking it: 249 of 250 is 99, not 100.
   */
  assert.ok(
    percentFinished(run.progress) !== 100 || openRows(run.progress) === 0,
    '...and 100% handled likewise implies nothing is open',
  );

  /* --- I-7: the daily bar clamps its WIDTH and never its NUMBER ----------- */
  // Exactly what the system card computes: ProgressBar divides by
  // Math.max(1, total), and the card passes Math.min(today, cap) as the fill.
  const barPct = (todayN: number, cap: number) => (Math.min(todayN, cap) / Math.max(1, cap)) * 100;
  assert.equal(barPct(24, 100), 24);
  // Reachable in real data: markManualPublished() and publishNow() go round the
  // rules engine, and the owner can lower maxPerDay in settings after publishing.
  assert.equal(barPct(30, 24), 100, 'the fill is bounded');
  assert.equal(barPct(0, 0), 0, 'a ceiling of 0 must not divide');
  assert.equal(barPct(5, 0), 0);

  /* --- source drift: the screen still reads these fields ------------------ */
  const dash = readFileSync('src/app/social/page.tsx', 'utf8');
  const cards = readFileSync('src/components/social/LiveCampaignHero.tsx', 'utf8');
  const pin = (what: string, src: string, needle: string) => assert.ok(src.includes(needle), `${what} drifted: ${needle}`);

  pin('the day figure', dash, 'publishedToday={data.today}');
  pin('the ceiling is the owner\'s setting', dash, 'dailyTarget={data.limits.maxPerDay}');
  pin('and the screen says so, beside the bar', cards, 'היא לא מכסה רשמית של פייסבוק');
  pin('the bar clamps its width only', cards, 'Math.min(publishedToday, dailyTarget)');
  pin('the run card counts open rows through campaign.ts', cards, 'openRows(progress)');
  /*
   * RE-POINTED, not weakened. This pinned `percentPublished(progress)` — "the
   * run card bar counts publications" — and that is the rule the owner
   * reported as the defect: a run with one of 29 rows already FAILED drew a
   * 0%-wide bar and printed "0%", because nothing had succeeded although
   * something had certainly happened. The bar is the round's PROGRESS now,
   * through campaign.ts's runProgress(), and the publications figure is still
   * on the card as its own labelled line — which the second pin holds it to,
   * so "the bar moved to handled" cannot become "the successes disappeared".
   * The invariant the old pin protected is unchanged and is asserted above,
   * over both figures.
   */
  pin('the run card bar counts handled rows through campaign.ts', cards, 'runProgress(progress)');
  pin('...and publications stay a separate, labelled figure on the same card', cards, 'view.publishedLabel');
  pin('the system state is decided once, by the page', dash, 'const systemState: SystemState =');
  pin('...and the card only renders it', cards, 'SYSTEM_STATE_LABEL[systemState]');

  /*
   * NO COMPONENT MAY RE-DECLARE A STATUS LIST. An inline list is how the same
   * rows got counted two ways and "100% complete" appeared beside 28 waiting
   * publications. The cards read summarizeQueue()/campaignState() fields and
   * nothing else.
   */
  for (const status of ['scheduled', 'publishing', 'awaiting_confirmation', 'manual_pending', 'needs_attention'] as QueueStatus[]) {
    assert.ok(!cards.includes(`'${status}'`), `the dashboard cards must not name the queue status '${status}' — read status.ts instead`);
  }

  /*
   * A failed row is TERMINAL and its count has no date filter, so it must not
   * decide the system state: one failure last March would pin the dot for ever.
   */
  assert.ok(!/systemState[\s\S]{0,400}summary\.failed/.test(dash), 'summary.failed must not appear in the system-state ladder');
  assert.ok(dash.includes("tone={summary.failed ? 'bad' : 'neutral'}"), 'it is reported by its own tile');

  console.log('dashboard cross-scope invariant tests OK');
}

/* ----------------------------------------- which Facebook account is signed in */
{
  const account = readFileSync(new URL('../facebook/account.ts', import.meta.url), 'utf8');
  const hero = readFileSync(new URL('../../src/components/social/LiveCampaignHero.tsx', import.meta.url), 'utf8');
  const localWorker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');

  /*
   * THE ID COMES FROM THE COOKIE, THE LABEL FROM THE PAGE.
   *
   * c_user is authoritative and the same in every language; matching "Your
   * profile" or "הפרופיל שלך" would break for any owner whose Facebook is set
   * to a language nobody here anticipated. The profile link is therefore found
   * by that id, never by a label.
   */
  assert.ok(account.includes("c.name === 'c_user'"), 'the signed-in id must come from the cookie, not the markup');
  assert.ok(/href\.includes\(userId\)/.test(account), 'the profile link is matched by that id');
  /* Comments stripped first: the note above the code explains WHY those
     labels are not matched, and a whole-file search found that explanation
     and failed on it — the same way the overscroll guard did. */
  const accountCode = account.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(
    !/Your profile|הפרופיל שלך|aria-label="Account"/.test(accountCode),
    'no English or Hebrew label matching — the account picks the language, not us',
  );

  /* Best-effort, and it may never fail the login check it rides along with:
     knowing the session works matters more than knowing whose it is. */
  assert.ok(/readAccountProfile\(page\)\.catch\(\(\) => null\)/.test(
    readFileSync(new URL('../facebook/session.ts', import.meta.url), 'utf8'),
  ), 'reading the account must never fail the login check');

  /*
   * A field is written only when it was READ. A layout change that hides the
   * name must leave the last known name standing rather than blanking it —
   * "unreadable this minute" is not "nobody is signed in", and browser_state
   * already carries the second one.
   */
  /* This used to assert the opposite — that the name is written only when
     non-empty — and that rule is exactly what made a wrong value permanent.
     The new rule is asserted a few lines below, where it belongs. */
  assert.ok(/upsert: true/.test(localWorker) && /fb_avatar_url.*publicUrl.*\?v=/.test(localWorker), 'the avatar is copied and cache-busted, never hotlinked');

  /*
   * ON SCREEN: the colour is the MACHINE, the face is the ACCOUNT. With no
   * account reported the chip must say exactly what it always said, and must
   * not invent a face or a name to fill the space.
   */
  assert.ok(/fbAccount \?/.test(hero), 'the chip renders the account only when there is one');
  assert.ok(/'מחובר' : 'לא מחובר'/.test(hero), 'and falls back to the machine state when there is not');

  /*
   * AND THE CONSEQUENCE OF REMOVING PAGES.
   *
   * `stalledSince` only fires once a publication is actually past due, which
   * was right while Pages existed: the server published those through the
   * Graph API with no PC involved, so a sleeping machine slowed the queue
   * rather than stopping it. Every publication now goes out through that
   * machine's browser, so an offline worker with rows waiting is an
   * intervention on its own — the screen must not read "המערכת פעילה" over a
   * queue that cannot advance.
   */
  const dashSrc = readFileSync(new URL('../../src/app/social/page.tsx', import.meta.url), 'utf8');
  assert.ok(
    /\(!data\.workerOnline && summary\.queued > 0\) \|\|[\s\S]{0,80}stalledSince/.test(dashSrc),
    'an offline PC with rows waiting must be needs_intervention before anything is late',
  );
  assert.ok(dashSrc.includes("title: 'התוכנה במחשב לא פועלת'"), 'and it must say which thing is not running');
  assert.ok(/start-worker\.cmd/.test(dashSrc), 'naming the one action that fixes it');

  /*
   * NO SILENT FAILURE. Three things can stop the name reaching the dashboard —
   * the page not yielding one, the upload failing, and the v9 columns not
   * existing — and from the outside all three looked identical: a chip saying
   * "מחובר" with no name. supabase-js returns errors rather than throwing, so
   * ignoring an update's result is a decision not to know.
   */
  assert.ok(
    /const \{ error \} = await db\.from\('social_workers'\)\.update\(patch\)/.test(localWorker),
    'the account write must check its own result',
  );
  assert.ok(/'account_save_failed'/.test(localWorker), 'and a failed write must reach the activity log, not only a terminal');
  assert.ok(/social-schema-v9\.sql/.test(localWorker), 'naming the fix, since that is the likely cause');

  /* The fallback: /me's title is the signed-in user's name, and it is as
     locale-independent as the cookie. Without it an unreadable home layout
     left the feature silently doing nothing. */
  assert.ok(/facebook\.com\/me/.test(account), 'a name unreadable on the home layout falls back to the profile page');
  /*
   * "Facebook" IS NOT A NAME. The profile page ships a placeholder title and
   * swaps in the person's name once rendered; a fixed pause raced it and this
   * stored the owner's name as "Facebook" on their real machine. A wrong
   * stored answer is worse than none — it is shown with the same confidence.
   */
  /*
   * THE PAGE'S OWN DATA FIRST. Measured on the owner's machine: both DOM reads
   * came back empty on the real home layout while CurrentUserInitialData was
   * sitting in the HTML the whole time. It is structural, not linguistic, so
   * it does not care what language the account is set to — and it must be
   * checked against the cookie's id, or the match is "some NAME near some
   * key", which is a guess wearing the clothes of a fact.
   */
  assert.ok(/CurrentUserInitialData/.test(account), 'the name is read from the page data before any DOM guessing');
  assert.ok(/window\.includes\(id\)/.test(account), 'and only when that blob is about the account the cookie named');
  assert.ok(/JSON\.parse\(`"\$\{named\[1\]\}"`\)/.test(account), 'unescaped properly — Hebrew and Cyrillic arrive as \\uXXXX');
  assert.ok(/waitForFunction/.test(account), 'the fallback waits for the placeholder title to be replaced');
  assert.ok(/\/\^facebook\$\/i\.test\(candidate\)/.test(account), 'and refuses "Facebook" as a name outright');
  assert.ok(
    /patch\.fb_user_name = account\.name;/.test(localWorker),
    'the name is written even when empty, or a wrong value from a past version can never be cleared',
  );

  /*
   * THE FACE, AND WHY THE FIRST VERSION NEVER FOUND ONE.
   *
   * It looked for an `<img>` whose computed border-radius was 50%. Modern
   * Facebook draws avatars as an SVG `<image>` behind a mask, so the element is
   * not an `<img>` and the roundness is not on the picture — two filters, both
   * matching nothing, which is exactly what the dashboard showed: a real name
   * beside the blue initial circle. Shape and ownership replaced them because
   * they belong to the thing itself rather than to this month's CSS.
   */
  assert.ok(/querySelectorAll\('img, image'\)/.test(account), 'the avatar search must include the SVG <image> Facebook masks faces with');
  assert.ok(!/borderRadius/.test(accountCode), 'and must not depend on border-radius, which the mask carries rather than the picture');
  /*
   * AND NO FALLBACK. Fixing the search left a "biggest square-ish picture on
   * the page" last resort, and on the real home feed it photographed a
   * stranger's post and put it on the dashboard as the owner's face. That is
   * the worse failure of the two: a wrong face is a confident lie about whose
   * account is publishing, which is the one fact this feature exists to
   * report. An element is taken only when something PROVES it is theirs.
   */
  assert.ok(/\.filter\(\(c\) => c\.byUrl \|\| c\.byLink \|\| c\.byAlt\)/.test(account), 'an unproven picture must never be taken, however well it fits');
  /*
   * Three proofs, all about identity rather than markup — and the first is the
   * one that survives a layout with no link and no alt at all: Facebook's
   * profile-photo files carry the account's numeric id in the filename.
   */
  assert.ok(/byUrl: userId !== '' && src\.includes\(userId\)/.test(account), "the picture's own address naming the account is a proof");
  assert.ok(/href\.includes\(userId\)/.test(account), 'a link carrying that id is another');
  assert.ok(/byAlt: wanted !== '' && \(alt === wanted \|\| label === wanted\)/.test(account), 'and a label that is exactly the name we already read');
  /* A profile link is usually /the.persons.name, not /<id> — which is why
     matching the id alone found nothing on the owner's machine. /me redirects
     to that address, so Facebook states it rather than us guessing it. */
  assert.ok(
    /const profilePath = profilePathOf\(page\.url\(\)\) \|\| profilePathOf\(landing\?\.url\(\) \?\? ''\)/.test(account),
    'the vanity profile path is learned from where /me lands',
  );
  /* /me and / are rejected: they are where we asked to go, not where Facebook
     took us, and treating the question as the answer is what left the owner's
     own profile links unmatched. */
  assert.ok(/if \(path === '' \|\| path === '\/me'\) return '';/.test(account), 'and the address we asked for is never mistaken for the answer');
  /* Their links were the absolute form, which an equality check misses. */
  assert.ok(/replace\(\/\^https\?:/.test(account), 'a profile link matches whether it is written relative or absolute');
  assert.ok(/captureAvatar\(page, id, name \|\| nameHere, profilePath\)/.test(account), 'and is then accepted as proof of ownership');
  /* Exactly, not "contains": Facebook labels an avatar with the bare name,
     while a photo somebody posted OF them is labelled with a sentence that
     happens to include it — which is how a feed photo becomes a face. */
  assert.ok(!/alt\.includes\(wanted\)/.test(accountCode), 'a name merely mentioned in an alt sentence is not proof');

  /* And a wrong face already stored must be clearable, or the fixed version —
     which correctly finds nothing — leaves the stranger's photo up forever.
     The same correction the name got, for the same reason. */
  assert.ok(/patch\.fb_avatar_url = '';/.test(localWorker), 'a picture that cannot be proven clears the stored one');
  assert.ok(
    /imageNote === 'screenshot-failed'[\s\S]{0,2600}patch\.fb_avatar_url = '';/.test(localWorker),
    'but a failed screenshot keeps it — that is transient, not an answer',
  );

  /*
   * CAPTURED THROUGH THE ELEMENT, NOT A CLIP. page.screenshot({clip}) photographs
   * coordinates measured earlier; anything that grew above them since makes it
   * silently photograph the wrong rectangle. An element handle scrolls the thing
   * into view and reads its real box at the moment of capture.
   */
  /*
   * HOW IT IS CAPTURED — and this rule REPLACES "never off a clip rectangle",
   * which was written when the clip was the only way and is now the last of
   * three. What it was protecting against is still true and still asserted:
   * a clip photographs coordinates measured earlier, so it may not go first.
   *
   * It may not be the ONLY way either. The owner's machine reached this point
   * with a proven avatar and came back "found it but could not photograph it":
   * an element screenshot needs the node to still be attached, to hold still
   * and to scroll into view, and Facebook's top bar re-renders underneath all
   * three. Asking the CDN for the file the element already names needs none of
   * them, so that goes first; the photographs stay as fallbacks for a blob:
   * source, which only the page can resolve.
   */
  const byFile = accountCode.indexOf('request.get(src');
  const byElement = accountCode.indexOf('el.screenshot(');
  const byClip = accountCode.indexOf('page.screenshot({');
  assert.ok(byFile > 0, "the avatar is fetched by the element's own address");
  assert.ok(byElement > byFile, 'photographing the element is the fallback, not the first move');
  assert.ok(byClip > byElement, 'and a clip rectangle is the last resort of all');
  assert.ok(/asElement\(\)/.test(account), 'the chosen element is still carried as a handle for those fallbacks');

  /*
   * And the face is looked for on the page that is ALREADY OPEN. It used to be
   * attempted only behind the /me navigation, which only happened when the rail
   * link was missing — so on the layout where the rail link was found, no
   * picture was ever looked for at all.
   */
  assert.ok(/let shot = await captureAvatar\(page, id, fromBlob, ''\);/.test(account), 'the home page is tried first, before any second page load');

  /* Two faults, one symptom: nothing matched, or the match could not be
     photographed. The terminal must tell them apart — the screen must not,
     it shows a face or an initial, never an explanation. */
  assert.ok(/imageNote === 'screenshot-failed'/.test(localWorker), 'a missing face must say which of the two faults it was');
  assert.ok(!/imageNote/.test(hero), 'and that reason never reaches the screen');

  /*
   * AND IT MUST REPORT WHAT IT REJECTED. Two guesses at this markup have been
   * wrong and each cost a trip to the owner's machine to discover. A search
   * that comes back empty and describes what it saw turns the next attempt
   * into reading rather than guessing — in the terminal, never on screen.
   */
  /* Unconditionally: the first version printed only when it had candidates,
     so "nothing on the page was even the right shape" — the most informative
     outcome of all — came out as silent as the bug it was written to find. */
  assert.ok(/account\.probe\.nodes/.test(localWorker) && /account\.probe\.shaped/.test(localWorker), 'an empty avatar search must report what was on the page');
  assert.ok(!/if \(account\.probe\.sample\.length\)/.test(localWorker), 'and must not fall silent when it has nothing to list');
  /* The name is read from raw HTML, which arrives long before Facebook draws
     anything — so a real name beside an empty search is what an unrendered
     page produces. Wait for the condition, not for a number of seconds. */
  assert.ok(
    /waitForFunction\(\(\) => document\.querySelectorAll\('img, image'\)\.length > 0/.test(account),
    'the avatar search waits for the page to have drawn pictures at all',
  );
  assert.ok(!/probe/.test(hero), 'and that description never reaches the screen');

  /*
   * THE BUG UNDER ALL OF THEM, and the reason this block kept passing while
   * the feature did not: tsx's esbuild rewrites every `const f = () => …` into
   * `__name(() => …, 'f')`, and a function handed to page.evaluate is shipped
   * to the browser as SOURCE — so the call travels and the helper does not.
   * The search died with "ReferenceError: __name is not defined" before its
   * first statement, and every caller's `.catch(() => null)` — correct, since
   * none may fail a login check — made that identical to "the page did not
   * have it".
   *
   * Two independent defences, because this one cost four rounds: the context
   * defines the helper in the page, and account.ts declares no named function
   * inside an evaluate. worker/test/account.test.ts proves the second against
   * a real browser with the first deliberately absent.
   */
  const sessionSrc = readFileSync(new URL('../facebook/session.ts', import.meta.url), 'utf8');
  assert.ok(/addInitScript\(\{[\s\S]{0,120}globalThis\.__name/.test(sessionSrc), 'the page must define the helper esbuild compiles into evaluated code');
  assert.ok(/content: 'globalThis\.__name/.test(sessionSrc), 'passed as a string — a function here would carry the same undefined call in');
  /* The second defence is not checkable by reading source — whether a helper
     is inside an evaluated callback or beside it is a scope question, and a
     regex answering it would fail on the Node-side code it cannot tell apart.
     account.test.ts answers it by running the real thing in a real page. */
  assert.ok(existsSync(new URL('./account.test.ts', import.meta.url)), 'and a real-browser test must exist to prove the second defence');

  /*
   * AND THE LAST WALL: STORAGE COULD CREATE BUT NOT REPLACE.
   *
   * social-schema.sql gave the social-media bucket read, insert and delete —
   * no update. Supabase's upsert becomes an UPDATE once the object exists, and
   * the avatar is written to a STABLE path on purpose, so the dashboard cannot
   * keep showing the previous owner's face. The second write is the normal
   * case here, and it was the one the policies forbade. Group pictures sat
   * behind the same wall, silently: a group that changed its photo could never
   * show the new one.
   */
  const v10 = readFileSync(new URL('../../supabase/social-schema-v10.sql', import.meta.url), 'utf8');
  assert.ok(/for update/.test(v10) && /bucket_id = 'social-media'/.test(v10), 'replacing a stored picture needs an update policy');
  assert.ok(/to authenticated/.test(v10), 'and it stays limited to a signed-in user, like insert and delete');
  assert.ok(/with check \(bucket_id = 'social-media'\)/.test(v10), 'with check as well as using, or the new row is refused');
  assert.ok(/'avatar_upload_blocked'/.test(localWorker), 'a blocked avatar upload must reach the owner, not only the terminal');
  assert.ok(/social-schema-v10\.sql/.test(localWorker), 'naming the fix, since that is the likely cause');
  assert.ok(
    /העלאת תמונת הקבוצה[\s\S]{0,60}error\.message/.test(localWorker),
    'and a group picture that cannot be replaced must stop failing silently',
  );

  /*
   * SWITCHING ACCOUNTS — and the one rule that screen exists under.
   *
   * The owner asked to tap the face and land somewhere they can leave this
   * Facebook account and sign in to another "with its username and password".
   * They get exactly that, with the typing done on Facebook's own login page
   * in a Chrome window on the PC — never in a field here. Two reasons, and
   * both are load-bearing: this product holds no Facebook password anywhere,
   * so there is nothing to store or leak; and Facebook answers a login with
   * two-factor codes and device checks that a form on a phone cannot satisfy,
   * so it would collect a password and then fail anyway.
   *
   * A password field is the easiest thing in the world to add back later, in
   * good faith, by somebody who does not know that. So it is asserted.
   */
  const accountPage = readFileSync(new URL('../../src/app/social/account/page.tsx', import.meta.url), 'utf8');
  const clientSrc = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  assert.ok(/href="\/social\/account"/.test(hero), 'the account chip must lead somewhere, not to an anchor on the same screen');

  /*
   * THIS RULE REPLACES "no password may be typed into this product", and the
   * replacement is the owner's decision, made twice and for a reason: the
   * product is to be sold, and a customer who has to walk to the machine to
   * sign in is a customer who cannot buy it.
   *
   * What the old rule was protecting is unchanged and asserted below — this
   * must never become a password store. The sign-in details travel as a
   * ONE-TIME command payload and nothing may keep them:
   */
  assert.ok(
    /update\(\{ \.\.\.patch, worker_id: workerId, \.\.\.\(withPayload \? \{ payload: \{\} \} : \{\}\) \}\)/.test(localWorker),
    'claiming a command empties its payload, in the same statement',
  );
  const claimAt = localWorker.indexOf('const claimed = await claimCommand(cmd.id');
  const loginAt = localWorker.indexOf('session.interactiveLogin(');
  assert.ok(claimAt > 0 && loginAt > claimAt, 'wiped BEFORE the browser opens, so a crash mid-login leaves nothing behind');
  assert.ok(!/select\('\*'\)[\s\S]{0,120}social_worker_commands|from\('social_worker_commands'\)\.select\('\*'\)/.test(clientSrc), 'the command list must name its columns, never ask for all of them');
  assert.ok(/const COMMAND_COLUMNS = /.test(clientSrc) && !/COMMAND_COLUMNS = '[^']*payload/.test(clientSrc), 'and that list must not include the payload');
  /* Comments stripped first. The note above that code explains WHY nothing is
     persisted, and a whole-file search found the explanation and failed on it
     — the third time this file has caught itself that way. */
  const accountCodeOnly = accountPage.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/localStorage|sessionStorage/.test(accountCodeOnly), 'nothing typed on this screen may be persisted in the browser');
  assert.ok(/autoComplete="off"/.test(accountPage), 'nor offered to the browser password manager as this site\'s own credential');
  /* Typed into Facebook's own form, by attribute rather than by any word in
     any language — the same discipline the rest of the module keeps. */
  assert.ok(
    /input\[name="email"\]/.test(sessionSrc) && /input\[name="pass"\]/.test(sessionSrc),
    "the worker fills Facebook's own login form, it does not forge a session",
  );
  /*
   * And the screen must say the two things somebody paying for this deserves
   * to hear from it rather than from Facebook: that automated sign-in is
   * against Facebook's terms and can lock an account, and that a code or
   * device approval is normal and is answered on the machine. Without the
   * second, a half-finished login reads as a broken product.
   */
  assert.ok(/תנאי השימוש של פייסבוק/.test(accountPage), 'the screen states that automated sign-in is against Facebook terms');
  assert.ok(/נעיל/.test(accountPage), 'and that an account can be locked over it');
  assert.ok(/קוד אימות/.test(accountPage), 'and that Facebook will often ask for a code');
  /*
   * AND FACEBOOK'S QUESTION IS ANSWERED FROM THE SCREEN.
   *
   * This is the line between a tool its author can use and a product somebody
   * can buy. A login stops dead when Facebook asks for a code, and the old
   * answer — "go to the computer and type it into the window" — is not an
   * instruction a customer can follow when the browser runs on a machine they
   * will never see. The page is photographed as-is, so a challenge in any
   * language of any kind reaches the person who can answer it, and nothing
   * here has to understand a word of it.
   */
  assert.ok(/onChallenge/.test(sessionSrc) && /page\.screenshot/.test(sessionSrc), 'a challenge mid-login is photographed, not interpreted');
  assert.ok(/async function askOnScreen/.test(localWorker), 'and carried to the screen');
  assert.ok(/from\('social-debug'\)/.test(localWorker), 'into the private bucket — it is a photograph of somebody mid-login');
  assert.ok(/screenshotUrl\(shotPath\)/.test(accountPage), 'and read back through a signed URL, never a public one');
  /* Answered once, then taken down: a picture of a question already answered
     is worse than none, because the screen goes on asking it. */
  assert.ok(/async function clearChallenge/.test(localWorker), 'a resolved challenge is taken off the screen');
  assert.ok(
    /interactiveLogin\([\s\S]{0,120}\);\s*await clearChallenge\(state\);/.test(localWorker),
    'on every exit from a login, whatever its outcome',
  );
  /* The answer travels like the password: one-time, wiped as it is claimed. */
  assert.ok(/'verify'/.test(accountPage) && /\{ code: code\.trim\(\) \}/.test(accountPage), 'what was typed goes back as a one-time verify payload');
  assert.ok(
    /const claimed = await claimCommand\(row\.id, state\.id, \{[\s\S]{0,140}status: 'done'/.test(localWorker),
    'and is emptied by the same claim that every other command goes through',
  );
  assert.ok(!/בחלון שעל המחשב|החלון על המחשב נשאר פתוח/.test(accountPage), 'and the screen no longer tells anyone to walk to the machine');

  /*
   * A MISSING MIGRATION MUST NOT MAKE THE WORKER IGNORE EVERYTHING.
   *
   * Emptying the payload as the command is claimed is right, and on a database
   * where v11 has not been run that column does not exist — so the update
   * failed, the row was never claimed, and supabase-js returned the error
   * rather than throwing it. Discarded, that turned one un-run migration into a
   * command stuck at "pending" forever with nothing written anywhere to say
   * why. Observed on the owner's machine.
   */
  assert.ok(/async function claimCommand/.test(localWorker), 'claiming a command is one place that checks its own result');
  assert.ok(/social-schema-v11\.sql/.test(localWorker), 'and names the migration when that is the cause');
  assert.ok(/'commands_payload_missing'/.test(localWorker), 'where the owner reads, not only in a terminal');
  assert.ok(/attempt\(false\)/.test(localWorker), 'then claims it anyway — a missing column stops tidiness, never the product');
  /* And "pending" is not a word on a phone screen. The one state that needs
     explaining was the one the English hid. */
  assert.ok(/function commandLine/.test(accountPage), 'the last command is a Hebrew sentence, not a column value');
  assert.ok(/ממתינה/.test(accountPage) && /לא פועלת/.test(accountPage), 'and a command nobody picked up says which thing is not running');

  /* Signing in wipes the old session first: typed onto a live session, the new
     details land on a page that is not asking for them. */
  assert.ok(
    /sendWorkerCommand\([^;]*'logout'\);[\s\S]{0,200}sendWorkerCommand\([^;]*'login'/.test(accountPage),
    'signing in disconnects before it connects',
  );
  /*
   * And disconnecting must FORGET. The profile is wiped from the machine, but
   * the name and face live in the database — left there, somebody switching
   * accounts would go on seeing the account they just left, beside a chip
   * saying nothing is connected.
   */
  assert.ok(/async function forgetAccount/.test(localWorker), 'logout clears the stored account');
  assert.ok(
    /fb_user_id: '', fb_user_name: '', fb_avatar_url: ''/.test(localWorker),
    'all three fields, or the dashboard keeps showing the previous person',
  );
  assert.ok(
    /await session\.logout\(\);[\s\S]{0,900}await forgetAccount\(state\);/.test(localWorker),
    'and it happens on the logout command, not somewhere hopeful',
  );

  console.log('signed-in-account tests OK');
}

/* ----------------------------------------- assigning a group to a city */
{
  const groupsPage = readFileSync(new URL('../../src/app/social/groups/page.tsx', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../../src/components/social/GroupCard.tsx', import.meta.url), 'utf8');

  /*
   * detectCity() reads the group's NAME, so a group named something it cannot
   * read lands in "אחר" — 57 of them did — and nothing on the screen could
   * move it out. The sheet is that way out, and it must be reachable BOTH for
   * one group and for a selection, or sorting 57 of them is 57 trips.
   */
  assert.ok(/'שייך לעיר'[\s\S]{0,120}setCityFor\(\[g\.id\]\)/.test(groupsPage), 'a single group must be assignable from its own menu');
  assert.ok(/'שייך לעיר'[\s\S]{0,200}setCityFor\(selected\)/.test(groupsPage), 'and a whole selection at once');
  assert.equal((groupsPage.match(/open=\{cityFor !== null\}/g) ?? []).length, 1, 'one sheet serves both doorways');

  /*
   * It must write `city`, the field cityOf() prefers over the guess — writing
   * anything else would leave the group in "אחר" with a chip claiming
   * otherwise.
   */
  assert.ok(groupsPage.includes("bulkUpdateTargets(ids, { city: c })"), 'the sheet writes the city field itself');
  assert.ok(
    groupsPage.includes("const cityOf = useCallback((g: SocialTarget) => g.city || detectCity(g.name), [])"),
    'and a set city still outranks the guess',
  );
  assert.ok(groupsPage.includes('cityLabel={cityOf(g)}'), 'the card is told the city by the page, so the grid and the chip cannot disagree');

  /*
   * A guess and a fact must not look the same. The chip is brand-coloured
   * when the owner set the city and neutral with a "?" when it was inferred
   * — otherwise the card asserts something the product does not know.
   */
  /* The RULE is unchanged; the mechanism is not. A Badge on an 80px card is
     mostly its own padding, so the chip became a line of text and the
     brand/muted distinction moved from `tone` to the text colour. */
  assert.ok(/group\.city \? 'text-brand-400' : 'text-mist-500'/.test(card), 'a set city and a guessed one must be told apart');
  assert.ok(card.includes('`${cityLabel}?`'), 'and the guess must say it is one');

  /*
   * FOUR ACROSS IS AN ARITHMETIC CONSTRAINT, not a style.
   *
   * ~80px of card at 375px cannot hold two 44px hit boxes pushed into
   * opposite corners — they overlap in the middle and one silently eats the
   * other's taps. So exactly one interactive control may sit on the card
   * face, and the favourite toggle is the one that moved into the menu it was
   * already in. The star that remains is a MARK: aria-hidden and
   * pointer-events-none, so it cannot take a tap from the menu beside it.
   */
  assert.ok(/grid-cols-4 gap-2/.test(groupsPage), 'the phone grid is four across');
  assert.ok(!/<button[\s\S]{0,400}onToggleFavorite/.test(card), 'the favourite toggle must not sit on the card face at this width');
  assert.ok(/'הוסף למועדפות'/.test(groupsPage), 'the capability stays, one tap deeper, in the overflow menu');
  assert.ok(/pointer-events-none[\s\S]{0,160}StarIcon/.test(card), 'the favourite star that remains is a mark, not a target');
  assert.equal(
    (card.match(/grid h-11 w-11|h-11 w-11 place-items-center/g) ?? []).length,
    0,
    'no second 44px corner box on the card face',
  );

  console.log('city-assignment tests OK');
}

/* ----------------------------------------- the upcoming list scrolls */
{
  const timeline = readFileSync(new URL('../../src/components/social/Timeline.tsx', import.meta.url), 'utf8');
  const dash = readFileSync(new URL('../../src/app/social/page.tsx', import.meta.url), 'utf8');

  // The dashboard must hand the strip every row it READ, not a window onto it.
  assert.ok(
    /<Timeline rows=\{data\.upcoming\} limit=\{UPCOMING_LIMIT\} scrollable/.test(dash),
    'the dashboard timeline must render the whole read and scroll, not cut off at six with the rest in a footer',
  );

  /*
   * The footer counts rows that were NEVER READ — past UPCOMING_LIMIT — so it
   * can never be scrolled to. Inside the scrolling box it would be a line the
   * owner has to scroll down to in order to be told that scrolling will not
   * reach what it names.
   */
  const scrollBox = timeline.slice(timeline.indexOf('max-h-[21rem]'));
  assert.ok(scrollBox.includes('{list}'), 'the scroll box wraps the list');
  assert.ok(
    scrollBox.indexOf('</div>') < scrollBox.indexOf('{footer}'),
    'the "ועוד N" footer must sit OUTSIDE the scroll box — it counts rows the scroll can never reach',
  );
  /* On the classNames, not on the file: the comment above the box explains
     why overscroll-contain is absent, and a whole-file search matched that
     explanation and failed on it. */
  assert.ok(
    !/className="[^"]*overscroll-contain/.test(timeline),
    'no overscroll-contain: at the end of the list the gesture should carry on scrolling the page, not stop dead',
  );
  assert.ok(
    /tabIndex=\{0\}[\s\S]{0,200}aria-label="הפרסומים הקרובים/.test(timeline),
    'a scrollable region must be focusable and named, or it is unreachable with a keyboard',
  );

  console.log('upcoming-list scroll tests OK');
}

/* ----------------------------------------- the repeat-to-same-group switch */
{
  const rules = readFileSync(new URL('../../src/lib/social/rules.ts', import.meta.url), 'utf8');
  const types = readFileSync(new URL('../../src/lib/social/types.ts', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../../src/app/social/settings/page.tsx', import.meta.url), 'utf8');
  const sheet = readFileSync(new URL('../../src/components/social/QuickPublishSheet.tsx', import.meta.url), 'utf8');
  const campaignSrc = readFileSync(new URL('../../src/lib/social/campaign.ts', import.meta.url), 'utf8');

  /*
   * "Never twice to the same group" is the only publishing rule with no time
   * window, and it is now the owner's to switch off. Three things have to stay
   * true together, or the switch is worse than not having one.
   */

  // 1. ON by default, and a settings row written before the key existed keeps
  //    the old behaviour. `!== false` is what makes `undefined` mean "on".
  assert.ok(
    /blockRepeatToSameTarget:\s*true/.test(types),
    'DEFAULT_LIMITS must default blockRepeatToSameTarget to true — the protection is opt-out, never opt-in',
  );
  assert.ok(
    rules.includes('if (limits.blockRepeatToSameTarget !== false) {'),
    'rules.ts must gate the same-post check on `!== false`, so an older settings row without the key still blocks',
  );

  // 2. The rule itself is unchanged inside the gate: same statuses, same
  //    columns. A gate that also loosened the query would be a second change
  //    hiding inside the first.
  const gated = rules.slice(rules.indexOf('if (limits.blockRepeatToSameTarget !== false) {'));
  for (const needle of ["eq('status', 'published')", "eq('post_id', post.id)", "eq('target_id', target.id)"]) {
    assert.ok(gated.includes(needle), `the gated check must still match on ${needle}`);
  }

  // 3. The owner is told what switching it off costs, on the screen that
  //    switches it off — and the quick-publish warning stops promising a skip
  //    that will no longer happen.
  assert.ok(settings.includes('blockRepeatToSameTarget'), 'the settings screen must expose the switch');
  assert.ok(
    /blockRepeatToSameTarget === false[\s\S]{0,600}Notice tone="warn"/.test(settings),
    'turning it off must raise a warning on the settings screen, not switch silently',
  );
  assert.ok(
    sheet.includes('ctx.limits.blockRepeatToSameTarget === false'),
    'the quick-publish overlap notice must read the switch — with the rule off, "ידולגו" is a promise it cannot keep',
  );

  /*
   * And the badge this switch makes reachable: a run whose every attempted row
   * was skipped has finished > 0 with nothing published, which resolveState
   * correctly refuses to call 'running'. "טרם התחיל" over a bar reading 18% is
   * the contradiction, so the label carries the truth instead.
   */
  assert.ok(
    /state\.state === 'not_started' && p\.finished > 0/.test(campaignSrc),
    'runBadge must not print "טרם התחיל" for a run that has already handled rows',
  );
  assert.ok(campaignSrc.includes("label: 'התחיל — טרם פורסם'"), 'and the replacement must say what actually happened');

  /*
   * The switch is enforced in rules.ts, and rules.ts runs on the owner's PC
   * too. A copy there that predates the key ignores it and goes on skipping,
   * so the switch must announce that rather than appear to have worked —
   * groups are nearly everything this owner publishes.
   */
  assert.ok(
    /workerVersion !== WORKER_VERSION/.test(settings),
    'the settings screen must compare the PC worker version, or turning the switch off silently does nothing for groups',
  );
  assert.ok(
    /blockRepeatToSameTarget === false && workerVersion[\s\S]{0,400}Notice tone="error"/.test(settings),
    'and it must say so loudly — a warn tone is for the risk of the setting, an error tone for the setting not being in force',
  );
  const workerVersionSrc = readFileSync(new URL('../../src/lib/social/worker-version.ts', import.meta.url), 'utf8');
  assert.ok(
    !workerVersionSrc.includes("'2.6.0'"),
    'WORKER_VERSION must be bumped past 2.6.0: rules.ts changed, and that change only reaches groups when the PC copy updates',
  );

  console.log('repeat-to-same-group switch tests OK');
}

/* ----------------------------------------- the 28-publication scenario */
console.log('');
console.log('=== 28-publication run, step by step (simulation — no database) ===');
for (const { step, line } of scenario) console.log(`${step.padEnd(26)} ${line}`);
console.log('');
