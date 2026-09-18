import assert from 'node:assert/strict';
import { dripSlots, slotsFor } from '@/lib/social/slots';
import { zonedToUtc } from '@/lib/social/time';
import { parseGroupUrl, type Variant } from '@/lib/social/types';
import { pickVariant, previewAssignment } from '@/lib/social/variants';
import { detectCity, sortCities } from '@/lib/social/cities';

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

console.log('unit tests OK');
