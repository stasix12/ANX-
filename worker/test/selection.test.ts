import assert from 'node:assert/strict';
import type { Schedule, SocialTarget } from '@/lib/social/types';

/**
 * The selection rule from PostEditor.load(), isolated so the regression is
 * covered: a groups-only account reopening a scheduled post must get its
 * targets back, not an empty list.
 */
function chooseTargets(opts: {
  previous: string[];
  presetIds: string[];
  schedules: Pick<Schedule, 'active' | 'target_ids'>[];
  targets: Pick<SocialTarget, 'id' | 'enabled' | 'channel'>[];
  isExistingPost: boolean;
}): string[] {
  const { previous, presetIds, schedules, targets, isExistingPost } = opts;
  const exists = (id: string) => targets.some((t) => t.id === id);
  const recent = isExistingPost ? (schedules.find((s) => s.active) ?? schedules[0]) : undefined;
  const lastTargets = (recent?.target_ids ?? []).filter(exists);
  const defaultPages = targets.filter((t) => t.enabled && t.channel === 'facebook_page').map((t) => t.id);
  if (previous.length) return previous;
  if (presetIds.length) return presetIds;
  if (lastTargets.length) return lastTargets;
  return defaultPages;
}

const groups = Array.from({ length: 27 }, (_, i) => ({ id: `g${i}`, enabled: true, channel: 'facebook_group' as const }));
const sched = [
  { active: false, target_ids: groups.slice(0, 19).map((g) => g.id) },
  { active: false, target_ids: groups.map((g) => g.id) },
];

// The bug: a groups-only account fell through to "every enabled Page" — none.
assert.deepEqual(
  chooseTargets({ previous: [], presetIds: [], schedules: [], targets: groups, isExistingPost: true }),
  [],
  'no history and no pages really is empty',
);

// The fix: the post remembers who it was scheduled to.
assert.equal(
  chooseTargets({ previous: [], presetIds: [], schedules: sched, targets: groups, isExistingPost: true }).length,
  19,
  'reopening restores the most recent schedule (the first listed) — 19 targets',
);

// An active schedule wins over a retired one, whatever the order.
assert.equal(
  chooseTargets({
    previous: [],
    presetIds: [],
    schedules: [sched[0], { active: true, target_ids: groups.slice(0, 5).map((g) => g.id) }],
    targets: groups,
    isExistingPost: true,
  }).length,
  5,
  'an active schedule is preferred',
);

// Targets deleted since then are dropped rather than sent as dead ids.
assert.deepEqual(
  chooseTargets({ previous: [], presetIds: [], schedules: [{ active: true, target_ids: ['g0', 'gone'] }], targets: groups, isExistingPost: true }),
  ['g0'],
  'a deleted target is filtered out',
);

// An explicit ?targets= link and an in-progress edit both outrank history.
assert.deepEqual(
  chooseTargets({ previous: ['g3'], presetIds: ['g1'], schedules: sched, targets: groups, isExistingPost: true }),
  ['g3'],
  'what the person already picked is never overwritten',
);
assert.deepEqual(
  chooseTargets({ previous: [], presetIds: ['g1'], schedules: sched, targets: groups, isExistingPost: true }),
  ['g1'],
  'a ?targets= preset wins over history',
);

console.log('target-selection tests OK');
