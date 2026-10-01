import { addDaysISO, counted, zonedDateISO, zonedToUtc, zonedWeekday } from './time';
import { TIMEZONE, type Campaign } from './types';

/**
 * WHEN A CAMPAIGN IS ALLOWED TO PUBLISH — days of the week, a daily window,
 * and a gap between one publication and the next.
 *
 * "המערכת רשאית לפרסם רק בימים שנבחרו, רק בין 08:00 ל-22:00, ובהפרש של 10
 *  דקות בין פרסום לפרסום. אם מגיעים לשעת הסיום: לא לפרסם יותר באותו יום.
 *  הקמפיין צריך להמתין אוטומטית ליום הפעילות הבא ולהמשיך משעת ההתחלה
 *  שהוגדרה. אין לאפס את התור. אין להתחיל את הקמפיין מחדש."
 *
 * ONE FUNCTION, TWO READERS, AND THAT IS THE WHOLE POINT OF THIS FILE.
 *
 * nextPublishAt() is called by rules.ts, which decides whether a claimed row
 * may go out now, and by the campaign card, which prints "הבא בתור". Those are
 * a decision and a promise about the same instant, and the one way this
 * product has repeatedly got itself into trouble is by computing such a pair
 * twice. A card that says 08:10 over an engine that waits until 09:00 is not
 * a cosmetic fault: it is the screen lying about the machine.
 *
 * WHAT IT IS NOT. It does not move any row and it writes nothing. The queue
 * keeps its order and its places; this only answers "not before when", which
 * is exactly what "אין לאפס את התור" requires — a row held by the window is
 * the SAME row, deferred, and it publishes when the window opens.
 *
 * OFF BY DEFAULT, FOR EVERY CAMPAIGN THAT ALREADY EXISTS. readSchedule()
 * reads `enabled: false` out of a campaign row that has never heard of these
 * columns, and every function here short-circuits on that. A database that has
 * not run social-latest.sql yet reads exactly the same way. Nothing about a
 * campaign's behaviour changes until the owner turns the switch on.
 */

export interface CampaignSchedule {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday — the same numbering zonedWeekday() returns. */
  days: number[];
  /** 'HH:MM', 24-hour, local (Asia/Jerusalem). */
  start: string;
  end: string;
  /** Minutes between one publication of THIS campaign and the next, 1–30. */
  gapMinutes: number;
}

/** א׳ … ש׳, indexed by the weekday number above. */
export const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

/** Spelled out for a screen reader, where "א׳" is read as a letter. */
export const DAY_NAMES = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'] as const;

/**
 * "הפרש בין פוסטים חייב להיות ניתן לבחירה בטווח 1–30 דקות. כל מספר שלם בין 1
 * ל-30 צריך להיות אפשרי." Every one of them, built rather than listed, so the
 * list and the clamp below cannot disagree about where it ends.
 */
export const MIN_GAP_MINUTES = 1;
export const MAX_GAP_MINUTES = 30;
export const GAP_CHOICES: number[] = Array.from({ length: MAX_GAP_MINUTES - MIN_GAP_MINUTES + 1 }, (_, i) => i + MIN_GAP_MINUTES);

/** Every half hour of the clock, which is what the two time selects offer. */
export const TIME_CHOICES: string[] = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);

/**
 * What a campaign gets before anyone has touched the panel.
 *
 * The owner's own reference: Sunday to Thursday, 08:00–22:00, ten minutes.
 * Friday and Saturday are off because that is the working week here, and a
 * default that publishes into Shabbat is a default that gets noticed by the
 * wrong people. `enabled: false` regardless: these are the values the panel
 * opens on, not a behaviour that starts by itself.
 */
export const DEFAULT_CAMPAIGN_SCHEDULE: CampaignSchedule = {
  enabled: false,
  days: [0, 1, 2, 3, 4],
  start: '08:00',
  end: '22:00',
  gapMinutes: 10,
};

/** The campaign columns this module reads — nothing else about a campaign. */
export type ScheduleFields = Partial<
  Pick<Campaign, 'schedule_enabled' | 'schedule_days' | 'schedule_start' | 'schedule_end' | 'schedule_gap_minutes'>
>;

/** 'HH:MM' → minutes past local midnight, or null when it is not a time. */
function toMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function clampTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const mins = toMinutes(value);
  if (mins === null) return fallback;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * A campaign row → the schedule it describes, with every field made safe.
 *
 * EVERY FIELD IS OPTIONAL AND EVERY FIELD IS VALIDATED, which is not
 * defensiveness for its own sake. This object is read on a screen the owner
 * has open all day and by the engine that decides whether to publish, and the
 * values arrive from a jsonb-free Postgres row that three different versions
 * of this app may have written. A day index of 9, a start of '25:00' or a gap
 * of 0 would each turn into a campaign that never publishes again, silently.
 */
export function readSchedule(campaign: ScheduleFields | null | undefined): CampaignSchedule {
  const row = campaign ?? {};
  const rawDays = Array.isArray(row.schedule_days) ? row.schedule_days : DEFAULT_CAMPAIGN_SCHEDULE.days;
  const days = [...new Set(rawDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  const gap = Number(row.schedule_gap_minutes);
  const start = clampTime(row.schedule_start, DEFAULT_CAMPAIGN_SCHEDULE.start);
  const end = clampTime(row.schedule_end, DEFAULT_CAMPAIGN_SCHEDULE.end);
  return {
    enabled: row.schedule_enabled === true,
    days,
    start,
    /*
     * An end before its start is not a window, it is a campaign that can never
     * publish. dripSlots() in slots.ts has clamped the same pair the same way
     * since it was written; doing anything else here would mean two modules
     * disagreeing about what "22:00 to 08:00" means.
     */
    end: (toMinutes(end) ?? 0) < (toMinutes(start) ?? 0) ? start : end,
    gapMinutes: Number.isFinite(gap) ? Math.min(MAX_GAP_MINUTES, Math.max(MIN_GAP_MINUTES, Math.round(gap))) : DEFAULT_CAMPAIGN_SCHEDULE.gapMinutes,
  };
}

/** The schedule → the five columns, for saveCampaign(). */
export function scheduleColumns(s: CampaignSchedule): Required<ScheduleFields> {
  return {
    schedule_enabled: s.enabled,
    schedule_days: [...s.days].sort((a, b) => a - b),
    schedule_start: s.start,
    schedule_end: s.end,
    schedule_gap_minutes: s.gapMinutes,
  };
}

/** Whether `at` falls on a chosen day, inside the daily window. */
export function isAllowedAt(s: CampaignSchedule, at: Date, tz = TIMEZONE): boolean {
  if (!s.enabled) return true;
  if (!s.days.includes(zonedWeekday(at, tz))) return false;
  const dayISO = zonedDateISO(at, tz);
  return at >= zonedToUtc(dayISO, s.start, tz) && at <= zonedToUtc(dayISO, s.end, tz);
}

/**
 * The first instant at or after `from` that this schedule permits — or null
 * when it permits none, which happens only when no day is selected.
 *
 * EIGHT DAYS, NOT SEVEN. Today can be a chosen day whose window has already
 * closed, and if it is the ONLY chosen day the answer is the same weekday next
 * week — the eighth iteration. A seven-day loop returns null there, and null
 * is read downstream as "this campaign can never publish", which would be a
 * wrong answer rather than a missing one.
 *
 * Built out of calendar dates resolved in the zone (zonedToUtc), never by
 * adding 86,400,000ms, so the two Israeli clock changes a year cannot move a
 * window's edge by an hour — the same discipline startOfZonedWeek() uses.
 */
export function nextAllowedAt(s: CampaignSchedule, from: Date, tz = TIMEZONE): Date | null {
  if (!s.enabled) return from;
  if (!s.days.length) return null;
  const todayISO = zonedDateISO(from, tz);
  for (let i = 0; i < 8; i += 1) {
    const dayISO = addDaysISO(todayISO, i);
    /* Noon, so the instant used to ask "which weekday is this date" is never
       close enough to a boundary for a DST shift to answer with its neighbour. */
    if (!s.days.includes(zonedWeekday(zonedToUtc(dayISO, '12:00', tz), tz))) continue;
    const opens = zonedToUtc(dayISO, s.start, tz);
    const closes = zonedToUtc(dayISO, s.end, tz);
    if (from <= opens) return opens;
    if (from <= closes) return from;
  }
  return null;
}

/**
 * THE ONE ANSWER THE ENGINE AND THE CARD BOTH USE: the first instant this
 * campaign may publish at, given when it last published.
 *
 * Two constraints, applied in this order because they compose in only one
 * direction: the gap says "not before X", and the window then says "and the
 * first legal moment at or after X". Doing it the other way round — find the
 * window, then add the gap — can land past the window's close and claim an
 * instant outside it.
 *
 * Null means no day is selected. The caller decides what to do about that;
 * this does not guess, because the two callers want different things (the
 * engine holds the row, the card says so in words).
 */
export function nextPublishAt(
  s: CampaignSchedule,
  from: Date,
  lastPublishedAt: Date | null,
  tz = TIMEZONE,
): Date | null {
  if (!s.enabled) return from;
  let earliest = from;
  if (lastPublishedAt) {
    const due = new Date(lastPublishedAt.getTime() + s.gapMinutes * 60_000);
    if (due > earliest) earliest = due;
  }
  return nextAllowedAt(s, earliest, tz);
}

/**
 * "א׳, ב׳, ג׳, ה׳" — or the two sentences that are not a list of days.
 *
 * SORTED HERE AND NOT TAKEN ON TRUST. readSchedule() sorts, and so does the
 * panel's own toggle, so in practice this array always arrives in order — and
 * that is exactly the kind of "in practice" that produces "ה׳, א׳, ג׳, ב׳" on
 * the one caller that forgot. The summary line is read as a week; it is
 * printed as one.
 */
export function daysLabel(s: CampaignSchedule): string {
  if (!s.days.length) return 'לא נבחר אף יום';
  if (s.days.length === 7) return 'כל הימים';
  return [...s.days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(', ');
}

/** "כל 10 דקות", and the two counts Hebrew does not spell with a digit. */
export function gapLabel(s: CampaignSchedule): string {
  return `כל ${counted(s.gapMinutes, 'דקה', 'דקות', 'שתי דקות')}`;
}

/**
 * The live line under the controls: "סיכום תזמון: א׳, ב׳, ג׳, ה׳ · 08:00 –
 * 22:00 · כל 10 דקות".
 *
 * The WHOLE sentence is built here rather than assembled in JSX out of three
 * spans, so the test can read one string and so the two places that need it as
 * plain text — the toggle's accessible name, and the "not published today"
 * explanation — cannot drift from what is on screen.
 *
 * The hours are NOT wrapped in an LTR island here. This returns a string for
 * an element that sets dir="ltr" on the clock range itself; a bare LRI in a
 * value that also reaches an aria-label is read aloud by some screen readers.
 */
export function scheduleSummary(s: CampaignSchedule): string {
  return `${daysLabel(s)} · ${s.start} – ${s.end} · ${gapLabel(s)}`;
}
