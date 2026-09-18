import { addDaysISO, zonedDateISO, zonedToUtc, zonedWeekday } from './time';
import type { Schedule } from './types';

/**
 * Pure slot arithmetic for the planner: which instants does a schedule
 * fire at inside [from, until]? Kept free of database code so it can be
 * unit-tested and reused by a future "upcoming" preview in the UI.
 */
export type SlotSchedule = Pick<Schedule, 'mode' | 'timezone' | 'run_at' | 'weekly' | 'interval_days' | 'interval_time'>;
export type DripSchedule = Pick<Schedule, 'timezone' | 'run_at' | 'drip_per_day' | 'drip_window_start' | 'drip_window_end' | 'target_ids'>;

/**
 * One instant per target: `perDay` targets a day, evenly spread inside the
 * local window, starting on the run_at day (or today). Slots already in the
 * past are pushed a few minutes ahead of `now` so nothing is dropped.
 */
export function dripSlots(schedule: DripSchedule, now = new Date()): Date[] {
  const tz = schedule.timezone || 'Asia/Jerusalem';
  const perDay = Math.max(1, schedule.drip_per_day ?? 8);
  const [sh, sm] = (schedule.drip_window_start || '09:00').split(':').map(Number);
  const [eh, em] = (schedule.drip_window_end || '20:00').split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = Math.max(startMin, eh * 60 + em);
  const spacing = perDay > 1 ? (endMin - startMin) / (perDay - 1) : 0;
  const firstDay = zonedDateISO(schedule.run_at ? new Date(schedule.run_at) : now, tz);
  const out: Date[] = [];
  let bumped = 0;
  for (let i = 0; i < schedule.target_ids.length; i += 1) {
    const day = Math.floor(i / perDay);
    const k = i % perDay;
    const minutes = Math.round(startMin + k * spacing);
    const hm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    let at = zonedToUtc(addDaysISO(firstDay, day), hm, tz);
    if (at.getTime() < now.getTime()) {
      bumped += 1;
      at = new Date(now.getTime() + bumped * 3 * 60_000);
    }
    out.push(at);
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
