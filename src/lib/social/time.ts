import { TIMEZONE } from './types';

/**
 * Timezone helpers built on Intl only — the module runs in Asia/Jerusalem no
 * matter where the server lives (Vercel is UTC), and Israel switches DST on
 * dates that no fixed offset captures.
 */

function partsInZone(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(map.weekday);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday,
  };
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function offsetAt(date: Date, tz: string): number {
  const p = partsInZone(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Local wall-clock (YYYY-MM-DD + HH:MM) in `tz` → UTC instant. */
export function zonedToUtc(dateISO: string, timeHM: string, tz = TIMEZONE): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = timeHM.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  // Two passes handle the DST transition days.
  let guess = naive - offsetAt(new Date(naive), tz);
  guess = naive - offsetAt(new Date(guess), tz);
  return new Date(guess);
}

/** The local calendar date (YYYY-MM-DD) of an instant in `tz`. */
export function zonedDateISO(date: Date, tz = TIMEZONE): string {
  const p = partsInZone(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function zonedWeekday(date: Date, tz = TIMEZONE): number {
  return partsInZone(date, tz).weekday;
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Start of the local day containing `date`, as a UTC instant. */
export function startOfZonedDay(date: Date, tz = TIMEZONE): Date {
  return zonedToUtc(zonedDateISO(date, tz), '00:00', tz);
}

export function formatDateTimeHe(iso: string | Date | null | undefined, tz = TIMEZONE): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDateHe(iso: string | Date, tz = TIMEZONE): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('he-IL', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatTimeHe(iso: string | Date, tz = TIMEZONE): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('he-IL', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/**
 * Compact date for dense rows: "18.09" inside the current year, "18.09.25"
 * outside it. A full dd.mm.yyyy next to a time and a relative phrase does not
 * fit a 390px row, and the year is noise 99% of the time.
 */
export function formatDayMonthHe(iso: string | Date, tz = TIMEZONE): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const sameYear = zonedDateISO(d, tz).slice(0, 4) === zonedDateISO(new Date(), tz).slice(0, 4);
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    ...(sameYear ? {} : { year: '2-digit' }),
  }).format(d);
}

/** Relative wording for the dashboard's "next publication" tile. */
export function relativeHe(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const hours = Math.round(min / 60);
  const days = Math.round(min / 1440);
  // Hebrew counts one differently, and "לפני 1 שעות" is the kind of line that
  // tells a customer nobody read the screen.
  const label =
    min < 1
      ? 'פחות מדקה'
      : min < 60
        ? min === 1
          ? 'דקה'
          : min === 2
            ? 'שתי דקות'
            : `${min} דק׳`
        : min < 60 * 48
          ? hours === 1
            ? 'שעה'
            : hours === 2
              ? 'שעתיים'
              : `${hours} שעות`
          : days === 1
            ? 'יום'
            // Hebrew has a dual: two days is יומיים, never "2 ימים".
            : days === 2
              ? 'יומיים'
              : `${days} ימים`;
  return diff >= 0 ? `בעוד ${label}` : `לפני ${label}`;
}
