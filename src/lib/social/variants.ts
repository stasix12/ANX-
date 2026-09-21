import type { Schedule, Variant } from './types';

/**
 * Which approved variant goes to which target. Pure, so the post editor can
 * preview the assignment and the planner applies the identical rule.
 *
 *   rotate     — per target, cycle A→B→C over successive slots
 *   distribute — spread the approved variants across the selected targets
 *                (target 1 gets A, target 2 gets B, …), still cycling over time
 *   fixed      — only the explicit variant_map; targets without an entry get
 *                the base text
 */
export function pickVariant(
  approved: Variant[],
  schedule: Pick<Schedule, 'variant_strategy' | 'variant_map'>,
  targetId: string,
  targetIndex: number,
  rotation: number,
): Variant | null {
  const mapped = schedule.variant_map?.[targetId];
  if (mapped) return approved.find((v) => v.id === mapped) ?? null;
  const strategy = schedule.variant_strategy ?? 'rotate';
  if (strategy === 'fixed' || approved.length === 0) return null;
  const offset = strategy === 'distribute' ? targetIndex : 0;
  return approved[(offset + rotation) % approved.length];
}

/** Preview: the variant each target would get on its first slot. */
export function previewAssignment(approved: Variant[], schedule: Pick<Schedule, 'variant_strategy' | 'variant_map'>, targetIds: string[]): Record<string, Variant | null> {
  const out: Record<string, Variant | null> = {};
  targetIds.forEach((id, i) => {
    out[id] = pickVariant(approved, schedule, id, i, 0);
  });
  return out;
}
