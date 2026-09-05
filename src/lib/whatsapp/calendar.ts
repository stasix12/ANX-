import { supabaseAdmin } from './supabaseAdmin';
import type { BotSettings } from './settings';

/**
 * Real availability against the CRM calendar (public.leads). The bot's rule
 * is "never invent availability" — every slot it offers comes from here, and
 * booking re-checks the slot so two customers can't grab the same hour.
 */

interface BusyRange {
  /** Minutes since midnight. */
  start: number;
  end: number;
}

const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
};

const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today in Israel as YYYY-MM-DD, whatever timezone the server runs in. */
export function todayIsraelISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Current Israel wall-clock time in minutes since midnight. */
function nowIsraelMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return toMinutes(parts);
}

async function busyByDate(from: string, to: string): Promise<Map<string, BusyRange[]>> {
  const { data, error } = await supabaseAdmin()
    .from('leads')
    .select('job_date, job_time, job_time_end, status')
    .gte('job_date', from)
    .lte('job_date', to)
    .not('job_time', 'is', null)
    .neq('status', 'canceled');
  if (error) throw new Error(error.message);

  const busy = new Map<string, BusyRange[]>();
  for (const row of data ?? []) {
    const start = toMinutes(String(row.job_time));
    // Jobs without an explicit end block a default 2h window.
    const end = row.job_time_end ? toMinutes(String(row.job_time_end)) : start + 120;
    const list = busy.get(row.job_date as string) ?? [];
    list.push({ start, end });
    busy.set(row.job_date as string, list);
  }
  return busy;
}

export interface DayAvailability {
  date: string;
  /** Hebrew weekday name, so the model can quote it without date math. */
  weekday: string;
  freeSlots: string[];
}

/**
 * Free start times for the next `days` days beginning at `fromDate`.
 * A slot is free when a full `slotMinutes` window fits without touching an
 * existing job, inside working hours, on a working day.
 */
export async function checkAvailability(
  settings: BotSettings,
  fromDate: string,
  days: number,
): Promise<DayAvailability[]> {
  const cappedDays = Math.min(Math.max(days, 1), 14);
  const toDate = addDays(fromDate, cappedDays - 1);
  const busy = await busyByDate(fromDate, toDate);
  const today = todayIsraelISO();

  const result: DayAvailability[] = [];
  for (let i = 0; i < cappedDays; i++) {
    const date = addDays(fromDate, i);
    if (date < today) continue;
    const jsDate = new Date(`${date}T12:00:00`);
    if (!settings.workDays.includes(jsDate.getDay())) continue;

    const dayBusy = busy.get(date) ?? [];
    const freeSlots: string[] = [];
    const open = settings.workStartHour * 60;
    const close = settings.workEndHour * 60;
    // Today, only offer slots the crew can still realistically reach.
    const earliest = date === today ? nowIsraelMinutes() + 60 : 0;
    for (let start = open; start + settings.slotMinutes <= close; start += settings.slotMinutes) {
      if (start < earliest) continue;
      const end = start + settings.slotMinutes;
      const clash = dayBusy.some((b) => start < b.end && end > b.start);
      if (!clash) freeSlots.push(toTime(start));
    }

    result.push({
      date,
      weekday: jsDate.toLocaleDateString('he-IL', { weekday: 'long' }),
      freeSlots,
    });
  }
  return result;
}

/** True when the requested start time is (still) free on that date. */
export async function isSlotFree(
  settings: BotSettings,
  date: string,
  time: string,
): Promise<boolean> {
  const daysAvailable = await checkAvailability(settings, date, 1);
  return daysAvailable.some((d) => d.date === date && d.freeSlots.includes(time));
}
