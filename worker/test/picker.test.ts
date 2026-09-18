import assert from 'node:assert/strict';
import type { SocialTarget } from '@/lib/social/types';

/**
 * The TargetPicker's set operations, isolated. The bug these cover: a post
 * reopened with Arad still selected, then "all of Be'er Sheva" tapped —
 * the quick set merged instead of replacing, so Arad came along, and with
 * the filter on Be'er Sheva those rows were off-screen and unremovable.
 */
const mk = (id: string, city: string): Pick<SocialTarget, 'id' | 'city' | 'enabled' | 'channel'> => ({
  id,
  city,
  enabled: true,
  channel: 'facebook_group',
});
const all = [...['b1', 'b2', 'b3'].map((id) => mk(id, 'באר שבע')), ...['a1', 'a2'].map((id) => mk(id, 'ערד'))];
const visibleIn = (city: string) => all.filter((t) => t.city === city);

const enabledIds = (items: typeof all) => items.filter((t) => t.enabled).map((t) => t.id);
const only = (items: typeof all) => enabledIds(items);
const also = (selected: string[], items: typeof all) => Array.from(new Set([...selected, ...enabledIds(items)]));
const hidden = (selected: string[], visible: typeof all) => selected.filter((id) => !visible.some((t) => t.id === id));

// "Only Be'er Sheva" replaces — Arad does not survive it.
assert.deepEqual(only(visibleIn('באר שבע')), ['b1', 'b2', 'b3'], 'replace drops the previous selection');

// The explicit "+" still merges, for someone who wants both cities.
assert.deepEqual(also(['a1', 'a2'], visibleIn('באר שבע')), ['a1', 'a2', 'b1', 'b2', 'b3'], 'the + button merges');
assert.deepEqual(also(['b1'], visibleIn('באר שבע')), ['b1', 'b2', 'b3'], 'merging is idempotent');

// Anything selected but filtered out is detected, so it can be shown or removed.
assert.deepEqual(hidden(['a1', 'a2', 'b1'], visibleIn('באר שבע')), ['a1', 'a2'], 'off-screen selections are found');
assert.deepEqual(hidden(['b1', 'b2'], visibleIn('באר שבע')), [], 'nothing hidden when the filter covers the selection');

// Removing them keeps exactly what is on screen.
const afterRemove = ['a1', 'a2', 'b1'].filter((id) => visibleIn('באר שבע').some((t) => t.id === id));
assert.deepEqual(afterRemove, ['b1'], 'remove strips only the hidden ones');

console.log('target-picker tests OK');
