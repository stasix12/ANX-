/**
 * The owner's rotating shift schedule at their other workplace: 4 mornings,
 * 4 afternoons, 4 nights, 4 days off — a fixed 16-day cycle, so every date's
 * shift is pure arithmetic from one anchor day. The calendar prints it above
 * each date so cleaning jobs get booked around the day job.
 *
 * Anchor: 2026-08-24 was the SECOND afternoon day. To re-sync the cycle if
 * the rotation ever changes, update these two constants only.
 */

export type ShiftKey = 'morning' | 'afternoon' | 'night' | 'off';

const ANCHOR_ISO = '2026-08-24';
/** 0-based position of the anchor day inside the 16-day cycle below. */
const ANCHOR_INDEX = 5; // morning 0-3, afternoon 4-7 → second afternoon day = 5

const CYCLE: ShiftKey[] = [
  ...Array<ShiftKey>(4).fill('morning'),
  ...Array<ShiftKey>(4).fill('afternoon'),
  ...Array<ShiftKey>(4).fill('night'),
  ...Array<ShiftKey>(4).fill('off'),
];

export const SHIFT_META: Record<ShiftKey, { label: string; textClass: string }> = {
  morning: { label: 'בוקר', textClass: 'text-amber-300' },
  afternoon: { label: 'צהריים', textClass: 'text-sky-300' },
  night: { label: 'לילה', textClass: 'text-violet-300' },
  off: { label: 'חופש', textClass: 'text-emerald-400' },
};

export function shiftFor(iso: string): { key: ShiftKey; label: string; textClass: string } {
  // Noon-anchored dates keep the day count exact across DST changes.
  const days = Math.round(
    (Date.parse(`${iso}T12:00:00`) - Date.parse(`${ANCHOR_ISO}T12:00:00`)) / 86_400_000,
  );
  const index = (((ANCHOR_INDEX + days) % CYCLE.length) + CYCLE.length) % CYCLE.length;
  const key = CYCLE[index];
  return { key, ...SHIFT_META[key] };
}
