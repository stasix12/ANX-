/*
 * THE ACTIVITY CLASSIFICATION, PINNED.
 *
 * The activity log is one table with a free-text `event` column written from
 * five places. Nothing in the database says whether a row is good news, so
 * every surface that groups the log has to decide — and this module's whole
 * history is two surfaces deciding the same thing differently and printing
 * both answers on one screen.
 *
 * So there is exactly one decider (src/lib/social/activity.ts) and this file
 * holds it to three promises:
 *   1. every event a writer in this repo actually emits is classified, and
 *      classified as the thing it is;
 *   2. the filter used by the chips is the same function that filters the
 *      list, so a chip's count and its list can never disagree;
 *   3. a retry is only offered where a retry can actually land.
 *
 * It also walks the source of the real writers, so adding a new logActivity()
 * call with an unrecognised event name is caught here rather than showing up
 * in front of the owner as a grey dot under "הכל".
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIVITY_FILTERS, activityKind, canRetry, filterActivity, queueIdOf, targetUrlOf } from '../../src/lib/social/activity';
import type { ActivityEntry } from '../../src/lib/social/types';

/*
 * The events that ARE the machine rather than a publication or a round, and
 * are therefore meant to land under 'system'. Listed here so the walk below
 * can tell "classified as system on purpose" from "nobody classified it".
 */
const SYSTEM_BY_DESIGN = new Set([
  'worker_started',
  'worker_stopped',
  'worker_error',
  'worker_run',
  'worker_update_blocked',
  'worker_self_update',
  'browser_start_failed',
  'browser_needs_auth',
  'login_challenge',
  'login_challenge_failed',
  'group_share_duplicate',
  'group_share_resolved',
  /* גילוי קבוצות could not read whether this account is in a group it found,
     and kept the labels that were on the card. About the machine's reading of
     a page, not about a publication — and the one line in this product whose
     audience is the owner reading it back to whoever maintains the patterns. */
  'discover_unread',
  'comment_columns_missing',
  /* The database refusing to let a comment be claimed. Same family as the
     missing column above: it is about the installation, not about a post. */
  'comment_claim_failed',
  /* A worker that has narrowed itself to no work. About the installation,
     not about a post — and the one notice that must never be missed. */
  'account_scope_narrowed',
  'metrics_columns_missing',
  'commands_payload_missing',
  'avatar_upload_blocked',
  'account_save_failed',
  /* Same shape as the line above it: the machine read which profiles this
     Facebook account holds and the database would not take the answer. About
     the installation, not about any one post. */
  'profiles_save_failed',
  /* About one group and one identity, not about a post that failed on its
     merits — and nothing was switched off, which is what separates it from
     target_left. */
  'page_not_allowed',
  /* The owner pressed "disconnect" and every Facebook token was deleted. It
     is filed as system news ON PURPOSE: he asked for it and it worked, so it
     is neither a success worth a green line nor a failure. The things that go
     WRONG around it — revoke_remote_failed, when the local delete worked and
     telling Facebook did not — are classified as failures and are deliberately
     not on this list. */
  'disconnected',
]);

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(a: T, b: T, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};

const row = (event: string, level: ActivityEntry['level'] = 'info', meta: Record<string, unknown> = {}): ActivityEntry => ({
  id: 1,
  at: '2026-09-25T09:00:00.000Z',
  level,
  event,
  message: 'הודעה',
  meta,
});

/* ---------------------------------------------------- 1. the vocabulary */

eq(activityKind(row('published')), 'success', 'a publication that went out is a success');
eq(activityKind(row('publish_failed', 'error')), 'failure', 'one that did not is a failure');
eq(activityKind(row('needs_attention', 'error')), 'failure', 'a row parked for a human is a failure');
eq(activityKind(row('planned')), 'round', 'planning a round is round news');
eq(activityKind(row('worker_run')), 'round', "a run's own report is round news");
eq(activityKind(row('campaign_paused')), 'round', 'pausing a round is round news');
eq(activityKind(row('skipped', 'warn')), 'schedule', 'a skipped row is the queue moving');
eq(activityKind(row('retry', 'warn')), 'schedule', 'so is an automatic retry');
eq(activityKind(row('deferred')), 'schedule', 'so is a postponement');
eq(activityKind(row('browser_needs_auth', 'warn')), 'system', 'the session is the machine, not a publication');

/*
 * The dynamic names. Two writers build their event at runtime — `worker_${cmd}`
 * on the local worker and `invariant_${code}` from the count checker — so
 * neither can ever be listed by hand.
 */
eq(activityKind(row('worker_connect')), 'system', 'a worker command lands under the machine');
eq(activityKind(row('invariant_queue_open_mismatch', 'warn')), 'system', 'a self-check warning lands under the machine');

/* An event nobody has taught this file about still lands somewhere honest. */
eq(activityKind(row('something_brand_new', 'error')), 'failure', 'an unknown error is a failure');
eq(activityKind(row('something_brand_new')), 'system', 'an unknown info line is not claimed as a success');

/* ------------------------------- 2. every real writer is accounted for */

/*
 * Walked, not listed: the point is to fail when someone adds a logActivity()
 * call with a new event name and forgets this file. Names built by template
 * (`worker_${…}`, `invariant_${…}`) are covered by the two cases above and
 * are skipped here.
 */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const WRITE = /log(?:Client)?Activity\(\s*(?:'[a-z]+'|[a-zA-Z.]+\s*\?\s*'[a-z]+'\s*:\s*'[a-z]+')\s*,\s*'([a-z0-9_]+)'/g;
/*
 * AND THE PLANNER, WHICH THIS WALK COULD NOT SEE.
 *
 * The regex above matches logActivity( and logClientActivity(. plan.ts writes
 * through a `note(level, event, …)` callback instead, so every event the
 * planner emits — planned, drip_planned, plan_failed, deferred, and whatever
 * is added next — was invisible here. Two new ones were added and the walk
 * reported "42 writers walked" and passed, which is the one thing it exists to
 * stop: the whole point of this file is that a new event cannot reach the
 * owner's screen without being classified on purpose.
 */
const NOTE = /\bnote\(\s*'[a-z]+'\s*,\s*'([a-z0-9_]+)'/g;
const emitted = new Set<string>();
for (const file of [...sources('src/lib/social'), ...sources('worker'), ...sources('src/app/social')]) {
  if (file.includes('/test/')) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(WRITE)) emitted.add(m[1]);
  for (const m of src.matchAll(NOTE)) emitted.add(m[1]);
}

ok(emitted.size > 15, `the walk found the writers (${emitted.size} events)`);
ok(emitted.has('published') && emitted.has('publish_failed'), 'the walk found the two events that matter most');
ok(
  emitted.has('plan_failed') && emitted.has('drip_planned'),
  "and the PLANNER's events too — it writes through note() rather than logActivity(), and was invisible to this walk until a round that never published went unclassified",
);

const unclassified = [...emitted].filter((event) => {
  // An unknown info-level row falls back to 'system'; that is the tell.
  const guessed = activityKind({ event, level: 'info' });
  return guessed === 'system' && !SYSTEM_BY_DESIGN.has(event);
});
eq(unclassified, [], 'every event a writer emits is classified on purpose — add it to KIND in activity.ts');

/* ------------------------------------------- 3. the filter is one thing */

const feed = [row('published'), row('publish_failed', 'error'), row('planned'), row('skipped', 'warn'), row('worker_stopped')];
eq(filterActivity(feed, '').length, 5, 'the empty filter is every row');
eq(filterActivity(feed, 'success').map((e) => e.event), ['published'], 'הצליחו');
eq(filterActivity(feed, 'failure').map((e) => e.event), ['publish_failed'], 'נכשלו');
eq(filterActivity(feed, 'round').map((e) => e.event), ['planned'], 'סבבים');
eq(filterActivity(feed, 'schedule').map((e) => e.event), ['skipped'], 'תזמונים');

/*
 * The chips and the list are the same call. This is the promise that a chip
 * reading "נכשלו 3" opens three rows — the counter/list split is the defect
 * class this repo has the most tests for.
 */
for (const f of ACTIVITY_FILTERS) {
  eq(filterActivity(feed, f.value).length, feed.filter((e) => !f.value || activityKind(e) === f.value).length, `chip "${f.label}" counts what it opens`);
}
eq(ACTIVITY_FILTERS[0].value, '', 'the first chip is "everything"');

/* --------------------------------------------------- 4. retry, honestly */

eq(queueIdOf(row('publish_failed', 'error', { queueId: 'abc' })), 'abc', 'the publication behind a row is read from meta');
eq(queueIdOf(row('publish_failed', 'error')), null, 'and is null when the writer did not stamp one');
eq(queueIdOf(row('publish_failed', 'error', { queueId: 42 })), null, 'a non-string id is not a row id');

ok(canRetry(row('publish_failed', 'error', { queueId: 'abc' })), 'a failed publication can be retried');
ok(canRetry(row('needs_attention', 'error', { queueId: 'abc' })), 'so can one parked for a human');
ok(canRetry(row('skipped', 'warn', { queueId: 'abc' })), 'so can a skipped one');
ok(!canRetry(row('publish_failed', 'error')), 'but not one with no row to act on');
ok(!canRetry(row('worker_error', 'error', { queueId: 'abc' })), 'and a worker crash is not a publication');
ok(!canRetry(row('published', 'info', { queueId: 'abc' })), 'and what went out is not retried');

/* ------------------------------------- 4b. the way into the group */
/*
 * "שיש שגיאה לא מצאתי כתוב משהו לצרף לינק קישור לקבוצה."
 *
 * Every answer the "לא מצאתי את תיבת כתבו משהו" failure has is inside the
 * group — membership, posting permission, a group that changed its rules — and
 * the owner was reading a name on a phone and then hunting for it by hand. The
 * worker stamps the address on the failures it writes about a group.
 *
 * THE REFUSALS ARE THE POINT OF THIS BLOCK. The value comes out of the
 * database and goes into an href, and an href is the one place where a string
 * nobody checked stops being text and starts being behaviour: `javascript:`
 * runs on a tap, `data:` renders a page of somebody else's choosing. So the
 * reader allows two schemes and refuses everything else, including the shapes
 * that look like a link and are not.
 */
eq(targetUrlOf(row('publish_failed', 'error', { targetUrl: 'https://facebook.com/groups/7' })), 'https://facebook.com/groups/7', 'a group address survives');
eq(targetUrlOf(row('publish_failed', 'error', { targetUrl: 'http://facebook.com/groups/7' })), 'http://facebook.com/groups/7', 'and so does plain http — old rows carry it');
eq(targetUrlOf(row('publish_failed', 'error')), null, 'a row written before the worker carried it gets no link, rather than a guessed one');
eq(targetUrlOf(row('publish_failed', 'error', { targetUrl: '' })), null, 'and neither does an empty one');
eq(targetUrlOf(row('publish_failed', 'error', { targetUrl: 7 })), null, 'a non-string is not an address');
eq(targetUrlOf(row('publish_failed', 'error', { targetUrl: 'javascript:alert(1)' })), null, 'JAVASCRIPT: IS REFUSED — this value becomes an href, and an href runs it');
eq(targetUrlOf(row('publish_failed', 'error', { targetUrl: 'data:text/html,<h1>hi' })), null, 'and so is data:, which would render a page of somebody else’s choosing');
eq(targetUrlOf(row('publish_failed', 'error', { targetUrl: 'facebook.com/groups/7' })), null, 'a bare host is not a URL — it would resolve against the dashboard’s own origin');
eq(targetUrlOf(row('publish_failed', 'error', { targetUrl: '//evil.example/x' })), null, 'and neither is a protocol-relative address');

/*
 * The guard is the database's, not this list's: retryQueueItem() matches on
 * status and returns false when the row has moved on. Pinned so the button
 * cannot quietly start re-arming a publication that is already out.
 */
const client = readFileSync('src/lib/social/client.ts', 'utf8');
ok(
  client.includes("const RETRYABLE: QueueItem['status'][] = ['failed', 'skipped', 'needs_attention', 'scheduled', 'paused'];"),
  'retryQueueItem is still guarded on status',
);

/*
 * AND THE WORKER REALLY STAMPS IT. targetUrlOf can only read what a writer
 * wrote; without this, every assertion above would keep passing against a
 * worker that had stopped stamping the address and a dashboard that therefore
 * never drew the button.
 */
const workerSrc = readFileSync('worker/social-worker.ts', 'utf8');
for (const event of ['publish_failed', 'needs_attention']) {
  const lines = workerSrc.split('\n').filter((l) => l.includes(`'${event}'`) && l.includes('logActivity'));
  ok(lines.length > 0, `the worker still writes ${event}`);
  for (const l of lines) {
    ok(l.includes('targetUrl: tt.url'), `${event} carries the group's own address: ${l.trim().slice(0, 90)}`);
  }
}

/*
 * The screen shows it on failures only. On a row that says a post went out, a
 * link to the GROUP is a second thing to tap beside the post itself, which is
 * the one that shows the result.
 */
const feedSrc = readFileSync('src/components/social/ActivityFeed.tsx', 'utf8');
ok(feedSrc.includes("const groupUrl = e.level === 'info' ? null : targetUrlOf(e);"), 'the feed asks for the address only on a row that went wrong');
ok(feedSrc.includes('rel="noopener noreferrer"'), 'and opens it without handing the new tab a reference back');

console.log(`activity-log classification tests OK — ${checks} assertions, ${emitted.size} writers walked`);
