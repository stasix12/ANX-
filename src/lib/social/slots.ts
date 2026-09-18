import { addDaysISO, zonedDateISO, zonedToUtc, zonedWeekday } from './time';
import type { Schedule } from './types';

/**
 * Pure slot arithmetic for the planner: which instants does a schedule
 * fire at inside [from, until]? Kept free of database code so it can be
 * unit-tested and reused by a future "upcoming" preview in the UI.
 */
export type SlotSchedule = Pick<Schedule, 'mode' | 'timezone' | 'run_at' | 'weekly' | 'interval_days' | 'interval_time'>;
export type DripSchedule = Pick<Schedule, 'timezone' | 'run_at' | 'drip_per_day' | 'drip_gap_minutes' | 'drip_window_start' | 'drip_window_end' | 'target_ids'>;

/**
 * One instant per target. Posts start at run_at (or the window start on
 * that day), every `gap` minutes, at most `perDay` a day (0 = unlimited),
 * never outside the daily window; leftovers roll over to the next day's
 * window start. Slots already in the past are pushed just ahead of `now`.
 */
export function dripSlots(schedule: DripSchedule, now = new Date()): Date[] {
  const tz = schedule.timezone || 'Asia/Jerusalem';
  const perDay = Math.max(0, schedule.drip_per_day ?? 0);
  const gap = Math.max(1, schedule.drip_gap_minutes ?? 20);
  const [sh, sm] = (schedule.drip_window_start || '09:00').split(':').map(Number);
  const [eh, em] = (schedule.drip_window_end || '20:00').split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = Math.max(startMin, eh * 60 + em);
  const first = schedule.run_at ? new Date(schedule.run_at) : now;
  let dayISO = zonedDateISO(first, tz);
  // Minute-of-day of the first post: run_at's local time, clamped into the window.
  const firstLocal = zonedToUtc(dayISO, '00:00', tz);
  let minute = Math.max(startMin, Math.round((first.getTime() - firstLocal.getTime()) / 60_000));
  if (minute > endMin) {
    dayISO = addDaysISO(dayISO, 1);
    minute = startMin;
  }
  let countToday = 0;
  const out: Date[] = [];
  /*
   * A running floor keeps the sequence honest. Slots that already passed are
   * pulled up to "soon", and every slot must then sit at least `gap` after the
   * one before it. Without the floor a start time in the past produced an
   * out-of-order plan — the first target bumped to now+gap while the second
   * kept its original (earlier, still-future) slot, so two posts went out four
   * minutes apart under a ten-minute setting.
   */
  let floor = now.getTime() + gap * 60_000;
  for (let i = 0; i < schedule.target_ids.length; i += 1) {
    if ((perDay > 0 && countToday >= perDay) || minute > endMin) {
      dayISO = addDaysISO(dayISO, 1);
      minute = startMin;
      countToday = 0;
    }
    const hm = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    const planned = zonedToUtc(dayISO, hm, tz);
    const at = new Date(Math.max(planned.getTime(), floor));
    floor = at.getTime() + gap * 60_000;
    out.push(at);
    countToday += 1;
    minute += gap;
  }
  return out;
}

export function slotsFor(schedule: SlotSchedule, from: Date, until: Date): Date[] {
  const tz = schedule.timezone || 'Asia/Jerusalem';
  const slots: Date[] = [];

  if (schedule.mode === 'once' || schedule.mode === 'now') {
    if (schedule.run_at) {
      const at = new Date(schedule.run_at);
      if (at <= until) slots.push(at);
    }
    return slots;
  }

  const startISO = zonedDateISO(from, tz);
  const days = Math.ceil((until.getTime() - from.getTime()) / 86_400_000) + 1;

  if (schedule.mode === 'weekly') {
    for (let i = 0; i <= days; i += 1) {
      const dayISO = addDaysISO(startISO, i);
      const weekday = zonedWeekday(zonedToUtc(dayISO, '12:00', tz), tz);
      for (const hm of schedule.weekly[String(weekday)] ?? []) {
        const at = zonedToUtc(dayISO, hm, tz);
        if (at >= from && at <= until) slots.push(at);
      }
    }
  }

  if (schedule.mode === 'interval' && schedule.run_at && schedule.interval_days && schedule.interval_time) {
    const firstISO = zonedDateISO(new Date(schedule.run_at), tz);
    for (let i = 0; i <= days + 1; i += 1) {
      const dayISO = addDaysISO(startISO, i);
      const daysSince = Math.round((Date.UTC(...isoParts(dayISO)) - Date.UTC(...isoParts(firstISO))) / 86_400_000);
      if (daysSince < 0 || daysSince % schedule.interval_days !== 0) continue;
      const at = zonedToUtc(dayISO, schedule.interval_time, tz);
      if (at >= from && at <= until) slots.push(at);
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}

function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}
