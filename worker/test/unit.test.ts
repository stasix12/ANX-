import assert from 'node:assert/strict';
import { dripSlots, slotsFor } from '@/lib/social/slots';
import { zonedToUtc } from '@/lib/social/time';
import { parseGroupUrl, type Variant } from '@/lib/social/types';
import { pickVariant, previewAssignment } from '@/lib/social/variants';

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

// --- drip: 10 targets, 4 per day, 09:00–18:00 → 3 days, evenly spaced (Israel summer = UTC+3)
const targets = Array.from({ length: 10 }, (_, i) => `t${i}`);
const drip = dripSlots({ timezone: 'Asia/Jerusalem', run_at: '2026-09-20T05:00:00Z', drip_per_day: 4, drip_window_start: '09:00', drip_window_end: '18:00', target_ids: targets }, new Date('2026-09-19T12:00:00Z'));
assert.equal(drip.length, 10);
assert.deepEqual(drip.slice(0, 4).map((d) => d.toISOString()), ['2026-09-20T06:00:00.000Z', '2026-09-20T09:00:00.000Z', '2026-09-20T12:00:00.000Z', '2026-09-20T15:00:00.000Z']);
assert.equal(drip[4].toISOString(), '2026-09-21T06:00:00.000Z');
assert.equal(drip[9].toISOString(), '2026-09-22T09:00:00.000Z');
// past slots are bumped just after "now" instead of being dropped
const late = dripSlots({ timezone: 'Asia/Jerusalem', run_at: '2026-09-20T05:00:00Z', drip_per_day: 2, drip_window_start: '09:00', drip_window_end: '10:00', target_ids: ['a', 'b', 'c'] }, new Date('2026-09-20T08:00:00Z'));
assert.ok(late[0] > new Date('2026-09-20T08:00:00Z') && late[1] > late[0]);
assert.equal(late[2].toISOString(), '2026-09-21T06:00:00.000Z');

console.log('unit tests OK');
