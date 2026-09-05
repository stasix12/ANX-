import type { AgentSettings, Booking, Worker, WorkingHours } from './types';
import { addMinutes, fromDateTimeKeys, startOfDay, toDateKey } from './util';

/**
 * Scheduling engine — the only source of appointment slots. The AI offers
 * slots from `availableSlots()`, and `createBookingSafely()` re-checks the
 * slot right before writing so two customers can never take the same time.
 */

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  0: { enabled: true, start: '08:00', end: '18:00' },
  1: { enabled: true, start: '08:00', end: '18:00' },
  2: { enabled: true, start: '08:00', end: '18:00' },
  3: { enabled: true, start: '08:00', end: '18:00' },
  4: { enabled: true, start: '08:00', end: '18:00' },
  5: { enabled: true, start: '08:00', end: '13:00' },
  6: { enabled: false, start: '09:00', end: '13:00' },
};

export interface SlotQuery {
  from: Date;
  days: number;
  durationMin: number;
  settings: Pick<AgentSettings, 'workingHours' | 'slotMinutes' | 'travelBufferMin' | 'blockedTimes'>;
  bookings: Booking[];
  workers: Worker[];
  workerId?: string | null;
  now?: Date;
}

export interface Slot {
  start: Date;
  end: Date;
  workerId: string | null;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function dayWindow(hours: WorkingHours, day: Date): { start: Date; end: Date } | null {
  const wd = hours[day.getDay()];
  if (!wd?.enabled) return null;
  const key = toDateKey(day);
  return { start: fromDateTimeKeys(key, wd.start), end: fromDateTimeKeys(key, wd.end) };
}

function isBlocked(settings: SlotQuery['settings'], start: Date, end: Date): boolean {
  const key = toDateKey(start);
  return settings.blockedTimes.some((b) => {
    if (b.date !== key) return false;
    return overlaps(start, end, fromDateTimeKeys(b.date, b.start), fromDateTimeKeys(b.date, b.end));
  });
}

/** Capacity = number of active workers (or 1 when none are defined). */
export function capacityAt(workers: Worker[], start: Date): number {
  const active = workers.filter((w) => w.active);
  if (active.length === 0) return 1;
  return active.filter((w) => {
    const wd = w.workingHours[start.getDay()];
    if (!wd?.enabled) return false;
    const key = toDateKey(start);
    return start >= fromDateTimeKeys(key, wd.start) && start < fromDateTimeKeys(key, wd.end);
  }).length;
}

export function availableSlots(q: SlotQuery): Slot[] {
  const now = q.now ?? new Date();
  const slots: Slot[] = [];
  const step = Math.max(15, q.settings.slotMinutes || 60);
  const need = q.durationMin + q.settings.travelBufferMin;
  const active = q.bookings.filter((b) => b.status === 'active');

  for (let i = 0; i < q.days; i++) {
    const day = startOfDay(new Date(q.from));
    day.setDate(day.getDate() + i);
    const win = dayWindow(q.settings.workingHours, day);
    if (!win) continue;

    for (let t = win.start; addMinutes(t, q.durationMin) <= win.end; t = addMinutes(t, step)) {
      const end = addMinutes(t, need);
      if (t <= addMinutes(now, 60)) continue; // never offer something in the next hour
      if (isBlocked(q.settings, t, end)) continue;

      const relevant = q.workerId ? active.filter((b) => b.workerId === q.workerId || b.workerId === null) : active;
      const busy = relevant.filter((b) => overlaps(t, end, new Date(b.startAt), addMinutes(b.endAt, q.settings.travelBufferMin))).length;
      const capacity = q.workerId ? 1 : capacityAt(q.workers, t);
      if (busy >= capacity) continue;

      slots.push({ start: t, end: addMinutes(t, q.durationMin), workerId: q.workerId ?? null });
    }
  }
  return slots;
}

/** Picks N well-spread slots for the agent to offer (morning + afternoon, across days). */
export function suggestSlots(all: Slot[], count = 2, preferredDate?: string, preferredTime?: string): Slot[] {
  if (all.length === 0) return [];
  let pool = all;
  if (preferredDate) {
    const same = all.filter((s) => toDateKey(s.start) === preferredDate);
    if (same.length) pool = same;
  }
  if (preferredTime) {
    const [hh] = preferredTime.split(':').map(Number);
    pool = [...pool].sort((a, b) => Math.abs(a.start.getHours() - hh) - Math.abs(b.start.getHours() - hh));
    return pool.slice(0, count);
  }
  const out: Slot[] = [];
  const seenDays = new Set<string>();
  // First pass: one per day, alternating morning/afternoon.
  for (const s of pool) {
    const k = toDateKey(s.start);
    if (seenDays.has(k)) continue;
    seenDays.add(k);
    out.push(s);
    if (out.length >= count) return out;
  }
  for (const s of pool) {
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= count) break;
  }
  return out;
}

/** Re-validates a slot against current bookings; returns a reason when taken. */
export function slotConflict(start: Date, durationMin: number, bookings: Booking[], workers: Worker[], bufferMin: number, workerId?: string | null): string | null {
  const end = addMinutes(start, durationMin + bufferMin);
  const active = bookings.filter((b) => b.status === 'active');
  const relevant = workerId ? active.filter((b) => b.workerId === workerId) : active;
  const busy = relevant.filter((b) => overlaps(start, end, new Date(b.startAt), addMinutes(b.endAt, bufferMin))).length;
  const capacity = workerId ? 1 : capacityAt(workers, start);
  return busy >= capacity ? 'slot_taken' : null;
}

/** First active worker who is free at that time and covers the city (if areas are defined). */
export function pickWorker(start: Date, durationMin: number, city: string, bookings: Booking[], workers: Worker[], bufferMin: number): Worker | null {
  const candidates = workers.filter((w) => w.active && (w.serviceAreas.length === 0 || w.serviceAreas.some((a) => a.trim().toLowerCase() === city.trim().toLowerCase())));
  for (const w of candidates) {
    if (!slotConflict(start, durationMin, bookings, workers, bufferMin, w.id)) {
      const wd = w.workingHours[start.getDay()];
      if (wd?.enabled) return w;
    }
  }
  return candidates[0] ?? null;
}
