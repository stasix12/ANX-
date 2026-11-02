import { addDaysISO, counted, zonedDateISO, zonedToUtc, zonedWeekday } from './time';
import { TIMEZONE, type Campaign } from './types';

/**
 * WHEN A CAMPAIGN IS ALLOWED TO PUBLISH — days of the week, a daily window,
 * and a gap between one publication and the next.
 *
 * "המערכת רשאית לפרסם רק בימים שנבחרו, רק מ-08:00 ואילך, ובהפרש של 10 דקות
 *  בין פרסום לפרסום. הקמפיין צריך להמתין אוטומטית ליום הפעילות הבא ולהמשיך
 *  משעת ההתחלה שהוגדרה. אין לאפס את התור. אין להתחיל את הקמפיין מחדש."
 *
 * THERE IS NO CLOSING HOUR. "יש להסיר לחלוטין את אפשרות שעת הסיום מממשק
 * הכרטיס... להשאיר רק: שעת התחלת הפרסום, הפרש בין פרסום לפרסום, ימי הפרסום
 * שנבחרו." A chosen day opens at `start` and runs to midnight; the roll onto
 * the next chosen day is what the day boundary does, not what an hour the
 * owner can no longer see does. The `schedule_end` column keeps whatever it
 * holds — nothing here reads it and nothing here writes it.
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
  /**
   * 'HH:MM', 24-hour, local (Asia/Jerusalem) — the hour the day OPENS, and the
   * only hour this schedule has.
   *
   * THERE IS NO CLOSING HOUR ANY MORE. "יש להסיר לחלוטין את אפשרות שעת הסיום
   * מממשק הכרטיס... להשאיר רק: שעת התחלת הפרסום, הפרש בין פרסום לפרסום, ימי
   * הפרסום שנבחרו." A chosen day is open from this hour until midnight, and
   * the roll onto the next chosen day happens at the day boundary rather than
   * at an hour the owner can no longer see or change.
   *
   * The `schedule_end` COLUMN is untouched — readSchedule() simply stops
   * reading it and scheduleColumns() stops writing it, so every value already
   * in the database stays exactly where it is. "אסור למחוק מידע."
   */
  start: string;
  /**
   * SECONDS between one publication of THIS campaign and the next.
   *
   * IT WAS MINUTES, AND SECONDS IS THE WHOLE POINT OF THE CHANGE: "בהפרש
   * פרסום בין פוסט לפוסט תעשה אופציה של 30 40 50 שניות". A minute was the
   * floor the unit imposed, not a decision anybody made.
   *
   * The column it is written to is still `schedule_gap_minutes` as well, kept
   * in sync and rounded UP to a whole minute, so a dashboard or a worker that
   * has not been updated reads a value that is slower than asked for rather
   * than faster. Slower is the safe direction for the one number in this
   * product that paces how fast an account posts.
   */
  gapSeconds: number;
}

/** א׳ … ש׳, indexed by the weekday number above. */
export const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

/** Spelled out for a screen reader, where "א׳" is read as a letter. */
export const DAY_NAMES = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'] as const;

/**
 * The bare weekday, for the places a day is named inside a sentence that
 * already supplies the word "יום" — "מחר (חמישי)" on the dashboard card.
 *
 * KEPT SEPARATE FROM DAY_NAMES RATHER THAN DERIVED FROM IT. DAY_NAMES is what
 * a screen reader is handed, and שבת is not "יום שבת" there; stripping a "יום "
 * prefix off six of seven entries and special-casing the seventh is the kind
 * of cleverness that produces "(שבת)" in one place and "(יום שבת)" in another.
 * Two short lists, each saying exactly what it is for.
 */
export const WEEKDAY_SHORT = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

/**
 * "היום (רביעי)", "מחר (חמישי)", "מחרתיים (שישי)", or the plain day beyond
 * that — the second line under the next publication's date.
 *
 * WHY THE WEEKDAY IS THERE AT ALL, next to a date that already carries it:
 * "מחר" answers the question the owner actually has (is this today's problem
 * or tomorrow's), and the day name is what he recognises his own week by —
 * the schedule above it is a row of א׳…ש׳ chips, so a line that says only
 * "מחר" cannot be checked against them at a glance.
 *
 * CALENDAR DAYS IN THE ZONE, NOT A MILLISECOND SUBTRACTION. 23:50 today and
 * 00:10 tonight are twenty minutes apart and are not the same day; the two
 * Israeli clock changes a year also make "24 hours" and "tomorrow" different
 * questions. zonedDateISO + addDaysISO is the same discipline nextAllowedAt()
 * uses, for the same reason.
 */
export function dayRelativeHe(at: Date, now: Date = new Date(), tz = TIMEZONE): string {
  const day = zonedDateISO(at, tz);
  const today = zonedDateISO(now, tz);
  const weekday = WEEKDAY_SHORT[zonedWeekday(at, tz)];
  if (day === today) return `היום (${weekday})`;
  if (day === addDaysISO(today, 1)) return `מחר (${weekday})`;
  if (day === addDaysISO(today, 2)) return `מחרתיים (${weekday})`;
  /* Further out than that, "בעוד 5 ימים" is a count the owner would have to
     do arithmetic on. The day name alone is what the date beside it needs. */
  return DAY_NAMES[zonedWeekday(at, tz)];
}

/**
 * THE CHOICES, IN SECONDS.
 *
 * "בהפרש פרסום בין פוסט לפוסט תעשה אופציה של 30 40 50 שניות בין פוסט לפוסט."
 * Three sub-minute steps, then the whole minutes this has always offered —
 * one list, built rather than typed out, so the options and the clamp below
 * cannot disagree about where it starts or ends.
 *
 * THIRTY SECONDS IS THE FLOOR AND IT IS NOT ARBITRARY. It is the shortest
 * step offered because it is the shortest one the machine has any chance of
 * meeting: rules.ts lets a row through up to PREP_LEAD_MS early so the group
 * page, the typing and the upload all happen INSIDE the gap rather than on
 * top of it, and that lead is seventy-five seconds — chosen, in its own
 * words, as "comfortably longer than a measured publication". A gap shorter
 * than one publication cannot be kept by one browser however it is asked
 * for; what the owner gets then is "as fast as it can", not the number.
 */
export const MIN_GAP_SECONDS = 30;
export const MAX_GAP_SECONDS = 30 * 60;
export const GAP_CHOICES: number[] = [
  30,
  40,
  50,
  ...Array.from({ length: 30 }, (_, i) => (i + 1) * 60),
];

/** "30 שניות" / "דקה" / "10 דק׳" — one spelling, used by the select and the
    summary line so the two cannot drift. */
export function gapChoiceLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} שניות`;
  const m = Math.round(seconds / 60);
  return m === 1 ? 'דקה' : `${m} דק׳`;
}

/** What goes in the legacy `schedule_gap_minutes` column beside the seconds:
    rounded UP, never below one. A stale reader is then slower than asked for,
    which is the safe direction for a number that paces an account. */
export const gapMinutesFor = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60));

/** Every half hour of the clock, which is what the two time selects offer. */
export const TIME_CHOICES: string[] = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);

/**
 * What a campaign gets before anyone has touched the panel.
 *
 * The owner's own reference: Sunday to Thursday, from 08:00, ten minutes.
 * Friday and Saturday are off because that is the working week here, and a
 * default that publishes into Shabbat is a default that gets noticed by the
 * wrong people. `enabled: false` regardless: these are the values the panel
 * opens on, not a behaviour that starts by itself.
 */
export const DEFAULT_CAMPAIGN_SCHEDULE: CampaignSchedule = {
  enabled: false,
  days: [0, 1, 2, 3, 4],
  start: '08:00',
  gapSeconds: 600,
};

/** The campaign columns this module reads — nothing else about a campaign. */
export type ScheduleFields = Partial<
  Pick<
    Campaign,
    'schedule_enabled' | 'schedule_days' | 'schedule_start' | 'schedule_gap_minutes' | 'schedule_gap_seconds'
  >
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
  /*
   * SECONDS IF THE COLUMN IS THERE, MINUTES IF IT IS NOT.
   *
   * schedule_gap_seconds arrives only once social-schema-v26.sql has been run
   * in Supabase. Until then every campaign still has its minutes, and reading
   * them is what keeps a dashboard that is ahead of its database working
   * exactly as it did — rather than silently resetting every campaign in the
   * account to the ten-minute default, which is what a plain
   * `Number(undefined)` would do here.
   */
  const rawSeconds = Number(row.schedule_gap_seconds);
  const rawMinutes = Number(row.schedule_gap_minutes);
  const gap = Number.isFinite(rawSeconds) && rawSeconds > 0 ? rawSeconds : rawMinutes * 60;
  const start = clampTime(row.schedule_start, DEFAULT_CAMPAIGN_SCHEDULE.start);
  return {
    enabled: row.schedule_enabled === true,
    days,
    start,
    /*
     * `schedule_end` IS READ BY NOTHING HERE ANY MORE, and that is the change.
     *
     * It used to be a second wall clock with a clamp in front of it: an end at
     * or before its start was rewritten to 23:59, because the natural way to
     * ask for an overnight window ("22:00 to 08:00") otherwise produced a
     * window exactly one instant wide and a campaign that never published a
     * single post. That clamp is gone with the field it guarded — a day now
     * runs from `start` to midnight, which is the only reading the two
     * remaining controls can produce.
     *
     * The COLUMN still holds whatever it held. Nothing above touches it, so a
     * rollback reads the old hours straight back out.
     */
    gapSeconds: Number.isFinite(gap) && gap > 0
      ? Math.min(MAX_GAP_SECONDS, Math.max(MIN_GAP_SECONDS, Math.round(gap)))
      : DEFAULT_CAMPAIGN_SCHEDULE.gapSeconds,
  };
}

/** The schedule → the four columns it still owns, for saveCampaign(). */
export function scheduleColumns(s: CampaignSchedule): Required<ScheduleFields> {
  return {
    schedule_enabled: s.enabled,
    schedule_days: [...s.days].sort((a, b) => a - b),
    schedule_start: s.start,
    /* `schedule_end` IS DELIBERATELY ABSENT. The window has no closing hour
       any more, so writing one would be this module inventing a value the
       owner cannot see; leaving the column out of the update keeps whatever
       is stored there exactly as it is. "אסור למחוק מידע." */
    schedule_gap_seconds: s.gapSeconds,
    /* Written beside it, rounded up — see gapMinutesFor. Dropping this column
       would leave an un-updated worker reading nothing and falling back to a
       default, which is a change to how fast the account posts made by a
       deployment rather than by the owner. */
    schedule_gap_minutes: gapMinutesFor(s.gapSeconds),
  };
}

/**
 * CHZARA — "לפרסם את אותו פוסט שוב, בכל יום פרסום."
 *
 * A SEPARATE OBJECT FROM THE WINDOW ABOVE, deliberately. They sit in the same
 * row and the same panel edits both, but they are opposite in kind: the window
 * can only ever PREVENT a publication, and this can only ever PERMIT one. The
 * one time this product has reliably hurt itself is by folding two meanings
 * into one value, and the owner's whole misunderstanding — "פעיל" read as "the
 * campaign is running" — is what that costs.
 */
export interface CampaignRepeat {
  /** Off: the same post never reaches the same group twice. The default. */
  enabled: boolean;
  /**
   * Hours that must pass between one publication of this post to a group and
   * the next to that same group.
   *
   * THE GUARD IS NOT REMOVED, IT IS GIVEN A CLOCK. Off, rules.ts refuses a
   * repeat for ever; on, it refuses one inside this many hours. A round that
   * ran twice by accident, or a retry after a failure, still cannot double-post
   * — which is the half of the old rule worth keeping.
   */
  minHours: number;
}

/**
 * 12 AT THE BOTTOM, so "daily" cannot be set to something that publishes the
 * same advertisement into the same group twice in one morning.
 *
 * AND 20 AS THE DEFAULT, NOT 24. The owner publishes inside a daily window; a
 * round that opens at 08:00 and takes four hours ends at noon, and a 24-hour
 * rule would then hold tomorrow's 08:00 row until 12:00, and the day after
 * until 16:00, walking the round later every day until it fell out of the
 * window and stopped. 20 is the longest value that keeps a daily round at the
 * hour the owner chose.
 */
/* ─────────── סבבים ביום (ריצות) — MORE THAN ONE OCCASION A DAY ──────────── */

/**
 * A SECOND PUBLICATION ROUND IN THE SAME DAY, FOR ONE CAMPAIGN.
 *
 * "הפעלת מספר סבבי פרסום לאותו קמפיין באותו היום." Round 1 at 03:30, round 2
 * at 15:30, same campaign, same content, same groups — without duplicating the
 * campaign.
 *
 * AND THE ENGINE HAS ALWAYS BEEN ABLE TO RUN THEM. social_schedules.weekly is
 * Record<weekday, 'HH:MM'[]> and slots.ts already loops that array, converting
 * every entry through zonedToUtc — so several occasions a day, in the right
 * zone, across a daylight-saving change, is existing and tested behaviour.
 * What never existed is a way to SAY there is more than one: both writers of
 * `weekly` build exactly `[schedule.start]`, one entry per chosen day.
 *
 * So this is NOT A SECOND SCHEDULER — the product has a standing rule against
 * one and has been bitten by it once — it is the list those two writers build.
 *
 * THE FIRST ROUND IS NOT IN THIS LIST. Round 1 is `schedule.start`, the hour
 * already on the card. A round whose hour lived in two places is exactly the
 * defect this product has been bitten by twice, and the owner reported it
 * again this week ("הוא משאיר את אותה השעה שהיה רשום בקמפיין").
 */
export interface CampaignRound {
  /** 'HH:MM', 24-hour, local — one of TIME_CHOICES. */
  at: string;
  /**
   * Off KEEPS the row and its hour and plans nothing for it, so switching a
   * round off and on again does not cost the owner the time he chose.
   * "אסור למחוק מידע."
   */
  enabled: boolean;
}

/**
 * FOUR EXTRA, AND THE NUMBER IS NOT A GUESS ABOUT TASTE.
 *
 * With the repeat armed, rules.ts refuses a second publication of one post to
 * one group inside repeat_min_hours, whose floor is MIN_REPEAT_HOURS = 12 — so
 * at most TWO rounds a day can ever reach the same groups, whatever is
 * configured. limits.maxPerTargetPerDay (default 2) says the same thing from
 * the other side. The cap is four rather than one because a round may be
 * switched off, and because the owner is entitled to lay out his day; what the
 * product must not do is let him believe round five will publish. The card
 * states the arithmetic instead — see roundsVsRepeat().
 */
export const MAX_EXTRA_ROUNDS = 4;

export type RoundFields = Partial<Pick<Campaign, 'schedule_rounds'>>;

/**
 * The stored rounds, defended against the column being absent, null, the wrong
 * shape, or carrying an hour that is not an hour — all four of which a jsonb
 * column can hand back, and the first of which is every database that has not
 * run the migration yet.
 */
export function readRounds(campaign: RoundFields | null | undefined): CampaignRound[] {
  const raw = campaign?.schedule_rounds;
  if (!Array.isArray(raw)) return [];
  const out: CampaignRound[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const at = String((item as { at?: unknown }).at ?? '');
    if (toMinutes(at) === null) continue;
    /* Absent reads as ON: a row that exists was added on purpose, and the one
       way to have no round is to not have the row. */
    const enabled = (item as { enabled?: unknown }).enabled !== false;
    out.push({ at: normaliseTime(at), enabled });
    if (out.length >= MAX_EXTRA_ROUNDS) break;
  }
  return out;
}

/** 'H:MM' and '3:5' both arrive from hand-written jsonb; store one spelling. */
function normaliseTime(hm: string): string {
  const mins = toMinutes(hm) ?? 0;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** What goes in the column. Sorted, so two equal lists compare equal. */
export function roundsColumn(rounds: CampaignRound[]): { schedule_rounds: CampaignRound[] } {
  const seen = new Set<string>();
  const out: CampaignRound[] = [];
  for (const r of rounds) {
    if (toMinutes(r.at) === null) continue;
    const at = normaliseTime(r.at);
    if (seen.has(at)) continue;
    seen.add(at);
    out.push({ at, enabled: r.enabled !== false });
  }
  out.sort((a, b) => (toMinutes(a.at) ?? 0) - (toMinutes(b.at) ?? 0));
  return { schedule_rounds: out.slice(0, MAX_EXTRA_ROUNDS) };
}

/**
 * EVERY HOUR THIS CAMPAIGN OPENS AT ON A CHOSEN DAY — round 1 first.
 *
 * This is the one list the weekly plan is built from, and the one list the
 * card counts. A disabled round contributes nothing; a round set to the same
 * hour as the window's opening is round 1 and not a second occasion.
 */
export function roundStarts(schedule: CampaignSchedule, rounds: CampaignRound[]): string[] {
  const seen = new Set<string>([schedule.start]);
  const out = [schedule.start];
  for (const r of rounds) {
    if (!r.enabled) continue;
    const at = normaliseTime(r.at);
    if (seen.has(at)) continue;
    seen.add(at);
    out.push(at);
  }
  return out.sort((a, b) => (toMinutes(a) ?? 0) - (toMinutes(b) ?? 0));
}

/**
 * THE SMALLEST GAP BETWEEN TWO OCCASIONS, IN HOURS, AROUND THE CLOCK.
 *
 * Cyclic, because the campaign repeats daily: a round at 23:00 and one at
 * 01:00 are two hours apart, not twenty-two. With a single occasion the answer
 * is 24 — the same hour tomorrow — which is exactly what today's behaviour is
 * and is why a one-round campaign measures as unchanged here.
 */
export function smallestRoundGapHours(starts: string[]): number {
  const mins = starts.map((s) => toMinutes(s) ?? 0).sort((a, b) => a - b);
  if (mins.length < 2) return 24;
  let smallest = 24 * 60 - (mins[mins.length - 1] - mins[0]);
  for (let i = 1; i < mins.length; i += 1) smallest = Math.min(smallest, mins[i] - mins[i - 1]);
  return smallest / 60;
}

/**
 * ─── WILL THE SECOND ROUND ACTUALLY PUBLISH? ──────────────────────────────
 *
 * The question the card has to answer out loud, because getting it wrong is
 * silent: a second round whose groups are all refused still opens, still shows
 * a queue, and publishes nothing.
 *
 * rules.ts refuses a second publication of one post to one group for ever when
 * the repeat is off, and inside repeat_min_hours when it is on. So two rounds
 * over the SAME groups need the repeat armed AND a window no longer than the
 * gap between them. The owner's own example — 03:30 and 15:30 — is exactly 12
 * hours, which is exactly MIN_REPEAT_HOURS: the closest two rounds the engine
 * will ever allow, and it works only if the repeat window is lowered to match.
 */
export interface RoundsVerdict {
  /** Every round will be allowed to publish to the campaign's groups. */
  ok: boolean;
  /** Hours between the two closest occasions, around the clock. */
  smallestGapHours: number;
  /** What repeat_min_hours would have to be for that gap to be allowed. */
  neededHours: number;
  /** Nothing to say: one round, or no conflict. */
  reason: 'ok' | 'repeat-off' | 'window-too-long' | 'closer-than-the-floor';
}

export function roundsVsRepeat(starts: string[], repeat: CampaignRepeat, floorHours: number = MIN_REPEAT_HOURS): RoundsVerdict {
  const smallestGapHours = smallestRoundGapHours(starts);
  const neededHours = Math.floor(smallestGapHours);
  if (starts.length < 2) return { ok: true, smallestGapHours, neededHours, reason: 'ok' };
  /* Below the floor nothing a campaign can set will help — but the floor
     itself is now the account's (repeatFloorFrom), not a constant, because
     the owner asked to be able to move it. It defaults to MIN_REPEAT_HOURS,
     so a caller that does not pass one behaves exactly as it always has. */
  if (smallestGapHours < floorHours) {
    return { ok: false, smallestGapHours, neededHours, reason: 'closer-than-the-floor' };
  }
  if (!repeat.enabled) return { ok: false, smallestGapHours, neededHours, reason: 'repeat-off' };
  if (repeat.minHours > smallestGapHours) {
    return { ok: false, smallestGapHours, neededHours, reason: 'window-too-long' };
  }
  return { ok: true, smallestGapHours, neededHours, reason: 'ok' };
}

/**
 * ─── THE WEEKLY PLAN, BUILT IN ONE PLACE ──────────────────────────────────
 *
 * `Record<weekday, 'HH:MM'[]>`, which is what social_schedules.weekly is and
 * what slots.ts loops over.
 *
 * TWO WRITERS BUILD THIS AND THEY MUST NOT DRIFT. syncWeeklyHours() and
 * setCampaignRepeat() both wrote `[schedule.start]` inline, four lines apart,
 * with a comment on one of them saying "the same arithmetic setCampaignRepeat
 * uses, so the two cannot drift". Two copies of an arithmetic are not one
 * arithmetic; the moment rounds exist, whichever writer ran last decided how
 * many occasions a day the campaign had. So both now call this.
 *
 * An empty day list produces an empty plan rather than a plan for no days —
 * the callers refuse that case before reaching here, and this returning `{}`
 * is what makes their refusal visible rather than silently arming nothing.
 */
export function weeklyPlanFor(schedule: CampaignSchedule, rounds: CampaignRound[]): Record<string, string[]> {
  const starts = roundStarts(schedule, rounds);
  const weekly: Record<string, string[]> = {};
  for (const day of schedule.days) weekly[String(day)] = [...starts];
  return weekly;
}

/**
 * 'HH:MM' plus N hours, wrapping at midnight.
 *
 * Used for the hour a NEW round opens at: twelve hours after the last one,
 * because twelve is the closest two occasions the engine will ever let reach
 * the same groups (MIN_REPEAT_HOURS). So the default the owner is offered is
 * also the only one that works, which is the point — a default that cannot
 * publish is a trap with a friendly face.
 */
export function plusHours(hm: string, hours: number): string {
  const base = toMinutes(hm) ?? 0;
  const mins = (((base + Math.round(hours * 60)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * ─── THE WINDOW THAT WOULD LET THESE ROUNDS PUBLISH ───────────────────────
 *
 * "שיניתי לפחות מ-12 שעות ועדין לא נותן לפרסם." — the owner, 02.11.2026.
 *
 * He lowered the account's protection to two hours, the card correctly
 * re-measured his rounds against two, and then told him to "הורידו את החזרה
 * ל-2 שעות" — a sentence naming a number with NO CONTROL ANYWHERE THAT SETS
 * IT. The campaign's own repeat window had been left with no editor at all
 * when the advanced queue controls came out at his request, so the only thing
 * in the product that could lower it was saveCampaignRounds(), and only while
 * the rounds were being changed. A card that states the fix and cannot apply
 * it is the decorative button this product is not allowed to have.
 *
 * So the arithmetic lives here, ONE copy, and both callers ask it: the writer
 * (roundsWindowFix, when rounds are saved) and the card's own button. They
 * cannot drift into naming one number and writing another.
 *
 * Null for every other verdict, including 'closer-than-the-floor' — rounds
 * closer together than the account's floor cannot be fixed by a window at
 * all, and offering a button that silently did nothing would be the same
 * failure one layer down.
 */
export function repeatFitFor(verdict: RoundsVerdict, floorHours: number = MIN_REPEAT_HOURS): number | null {
  return verdict.reason === 'window-too-long' ? Math.max(floorHours, verdict.neededHours) : null;
}

/**
 * ─── WHAT SAVING ROUNDS HAS TO CHANGE BESIDES THE ROUNDS ──────────────────
 *
 * "יש לממש את הפונקציונליות בפועל ולא ליצור כפתורים דקורטיביים."
 *
 * One subtraction, and it is the line between a feature and a decoration.
 * rules.ts refuses a second publication of one post to one group inside
 * repeat_min_hours, whose default is 20. The owner's own example is 03:30 and
 * 15:30 — twelve hours apart. With the default left alone, round two opens,
 * builds a queue of two hundred rows, shows a progress bar, and DEFERS every
 * one of them to 23:30, outside his publishing window, where they defer again
 * until MAX_DEFERRALS throws them away. A round with a queue, a bar and a
 * status that publishes nothing is exactly what he forbade.
 *
 * SO THE WINDOW COMES DOWN TO THE GAP HE PICKED, and never below
 * MIN_REPEAT_HOURS — that twelve is a database CHECK and a deliberate refusal
 * to put one advertisement into one group twice in a morning. Two rounds
 * closer than that get `lowerTo: null` and the card's own refusal instead.
 *
 * AND THE SWITCH IS NOT PRESSED FOR HIM. With חזרה יומית off, no window
 * arithmetic lets round two reach a group round one already reached; turning
 * it on would be the screen overruling a choice he made. It is REPORTED, as
 * repeatOff, and the toast and the card say so with the switch beside them.
 *
 * Pure on purpose: saveCampaignRounds() does the writing, this decides what.
 */
export function roundsWindowFix(
  schedule: CampaignSchedule,
  rounds: CampaignRound[],
  repeat: CampaignRepeat,
  floorHours: number = MIN_REPEAT_HOURS,
): { lowerTo: number | null; repeatOff: boolean; reason: RoundsVerdict['reason']; smallestGapHours: number; floorHours: number } {
  const starts = roundStarts(schedule, rounds);
  const verdict = roundsVsRepeat(starts, repeat, floorHours);
  return {
    lowerTo: repeatFitFor(verdict, floorHours),
    repeatOff: starts.length > 1 && !repeat.enabled,
    /*
     * THE VERDICT TRAVELS WITH THE FIX, and it did not before.
     *
     * 'closer-than-the-floor' was the one answer nothing acted on: lowerTo
     * stayed null, repeatOff stayed false, and the caller had no way to tell
     * that apart from "everything is fine". So saving rounds three hours
     * apart produced the flat success toast "יפרסם 3 סבבים בכל יום פרסום"
     * over a layout that publishes two, at an hour he never chose, and
     * silently drops the third. Measured, not supposed.
     */
    reason: verdict.reason,
    smallestGapHours: verdict.smallestGapHours,
    floorHours,
  };
}

/**
 * ─── WHAT THE OWNER IS TOLD WHEN ROUNDS ARE SAVED ─────────────────────────
 *
 * ONE BUILDER, BECAUSE THERE ARE TWO SCREENS. The dashboard and the campaigns
 * list both save rounds, and both wrote this sentence inline — which is how
 * `weekly` ended up with two copies of one arithmetic and why both now call
 * weeklyPlanFor(). A toast is not arithmetic, but it carries two facts the
 * owner cannot see anywhere else, and a screen that forgets one of them is a
 * setting that changed without being mentioned:
 *
 *   · the repeat window came DOWN, by the app, so his rounds can publish;
 *   · or more than one round is armed while חזרה יומית is OFF, in which case
 *     the extra rounds will reach only groups the first one did not.
 *
 * The second is the honest half of refusing to press his switch for him.
 */
export function roundsSavedMessage(
  name: string,
  armedExtraRounds: number,
  result: {
    skippedNoDay: boolean;
    windowLoweredTo?: number | null;
    repeatOff?: boolean;
    /* The verdict, so this can stop claiming success over a layout that
       cannot publish — see the 'closer-than-the-floor' branch below. */
    reason?: RoundsVerdict['reason'];
    smallestGapHours?: number;
    floorHours?: number;
  },
): { text: string; tone: 'info' | 'success' } {
  if (result.skippedNoDay) {
    return { text: 'הסבבים נשמרו, אבל לא נבחר אף יום פרסום — עד שתבחרו יום, לא ייכנסו פרסומים לתור.', tone: 'info' };
  }
  if (armedExtraRounds === 0) {
    return { text: `הסבבים הנוספים של "${name}" כובו — השעות נשמרו ואפשר להחזיר אותם בכל רגע`, tone: 'success' };
  }
  const total = armedExtraRounds + 1;

  /*
   * ─── THE ROUNDS ARE TOO CLOSE TOGETHER, AND THIS USED TO SAY "SAVED" ────
   *
   * THE WORST THING THIS FUNCTION HAS DONE. With rounds three hours apart it
   * returned the flat success line "יפרסם 3 סבבים בכל יום פרסום" — and the
   * measurement of what actually happens is: the engine defers round two from
   * 06:30 to 23:30, that parked row is the single open row the group is
   * allowed, so it blocks round three's occasion entirely, and the owner gets
   * TWO publications a day at an hour he never chose instead of the three he
   * was just promised. Nothing else on the screen corrected it.
   *
   * 'closer-than-the-floor' is also the only verdict no campaign setting can
   * fix — lowering the window cannot go under the floor — so this sentence
   * names the two things that CAN: move the rounds apart, or raise the floor
   * in Settings, which is the control the owner asked for by name.
   */
  if (result.reason === 'closer-than-the-floor') {
    const gap = result.smallestGapHours ?? 0;
    const floor = result.floorHours ?? MIN_REPEAT_HOURS;
    const gapText = Number.isInteger(gap) ? String(gap) : gap.toFixed(1);
    return {
      text: `השעות נשמרו, אבל הסבבים מרוחקים רק ${gapText} שעות זה מזה והמערכת לא מפרסמת את אותו פוסט לאותה קבוצה פעמיים בפחות מ-${floor} שעות — ולכן סבב נוסף יידחה ויפרסם בשעה אחרת, או לא יפרסם בכלל. הרחיקו את הסבבים, או שנו את ההגנה בהגדרות.`,
      tone: 'info',
    };
  }

  /* OFF FIRST, because it is the one that stops a publication. A window that
     was lowered is a detail; a repeat that is off means the extra rounds reach
     only the groups the first round did not. */
  if (result.repeatOff) {
    return {
      text: `"${name}" יפרסם ${total} סבבים בכל יום פרסום — אבל "חזרה יומית" כבויה, ולכן סבב נוסף יפרסם רק לקבוצות שהסבב הראשון לא הגיע אליהן. הפעילו אותה כדי שכל הסבבים יגיעו לכל הקבוצות.`,
      tone: 'info',
    };
  }
  if (typeof result.windowLoweredTo === 'number') {
    return {
      text: `"${name}" יפרסם ${total} סבבים בכל יום פרסום. חלון החזרה הותאם ל-${result.windowLoweredTo} שעות כדי שכל הסבבים יפרסמו לאותן קבוצות.`,
      tone: 'success',
    };
  }
  return { text: `"${name}" יפרסם ${total} סבבים בכל יום פרסום`, tone: 'success' };
}

/**
 * ─── THE FLOOR, AND IT IS NOW A DEFAULT RATHER THAN A LAW ─────────────────
 *
 * Twelve hours between two publications of one post to one group. This
 * product's own judgement — "not twice in one working day" — and never a rule
 * of Facebook's.
 *
 * "תוסיף אופציה בהגדרות לשחק עם זה." The owner asked for it to be adjustable
 * after it silently cost him a layout he had chosen: rounds at 03:30, 06:30
 * and 18:30 were saved and armed, and the engine answered by deferring round
 * two to 23:30 and losing round three. So this is what an account gets when
 * it has never said otherwise, and LimitsSettings.repeatFloorHours overrides
 * it. Every function below takes the floor as a parameter defaulting to this,
 * so a caller that does not know about the setting behaves exactly as before.
 *
 * ABSOLUTE_MIN_REPEAT_HOURS IS NOW ZERO, AND THAT IS THE OWNER'S DECISION.
 *
 * "לא הסרת את המגבלה של ה-20 שעות! תמחק את זה כבר." — 02.11.2026, his third
 * and plainest telling, after "לפתוח הכל, גם אותו פוסט". It was one hour, for
 * the dull reason that repeat_min_hours is stored in whole hours and one is the
 * smallest thing the column could say. Zero is what the column says now (v34
 * widens the CHECK), and zero means there is no window at all: rules.ts
 * computes `repeat.minHours * 3_600_000` and a window of nought milliseconds
 * excludes nothing, so the same post may reach the same group again on the
 * very next round.
 *
 * It is still a number HE sets, per account, and it still defaults to
 * MIN_REPEAT_HOURS for an account that has never said otherwise. Nobody gets
 * zero by accident.
 */
/**
 * ─── THE HOUR A NEW ROUND SHOULD OPEN AT ──────────────────────────────────
 *
 * "+ הוסף סבב נוסף" used to propose `plusHours(lastStart, 12)` and nothing
 * else, and from a 03:30 campaign the SECOND press proposes 03:30 again:
 * 03:30 + 12 = 15:30, 15:30 + 12 = 27:30, which wraps to 03:30 — round one's
 * own hour. roundStarts() de-duplicates, so the card drew a row the engine
 * never received and the column carried a round that did not exist. A button
 * that adds nothing while looking like it worked is the decorative control
 * the owner forbade.
 *
 * So the hour is SEARCHED for rather than computed: walk the half-hours of
 * the clock and take the first one at least `floorHours` from every occasion
 * already there, counting around midnight. Returns null when the day is full,
 * which is the honest answer and is what hides the button.
 *
 * Half-hours because that is the grid the rest of this card offers (TIME_CHOICES)
 * and the owner's own reference draws.
 */
export function nextFreeRoundStart(starts: string[], floorHours: number = MIN_REPEAT_HOURS): string | null {
  const taken = starts.map((s) => toMinutes(s) ?? 0);
  const floor = Math.max(1, Math.round(floorHours * 60));
  let best: { at: string; worst: number } | null = null;
  for (let m = 0; m < 1440; m += 30) {
    if (taken.includes(m)) continue;
    /* The closest existing occasion, around the clock. */
    let worst = 24 * 60;
    for (const t of taken) {
      const d = Math.abs(m - t);
      worst = Math.min(worst, Math.min(d, 1440 - d));
    }
    if (worst < floor) continue;
    /* The roomiest free slot, so three rounds land spread out rather than
       bunched at the first hour that happens to clear the floor. */
    if (!best || worst > best.worst) best = { at: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, worst };
  }
  return best?.at ?? null;
}

/**
 * ─── MOVING ONE ROUND TO ANOTHER HOUR ─────────────────────────────────────
 *
 * A pure decision, because the panel that calls it may hold no state and
 * because a check written inline there cannot be driven by a test: wrapping
 * the guard in `if (false && …)` left every string a source regex looks for
 * exactly where it was, and the suite stayed green over a card that had lost
 * the protection.
 *
 * 'taken' IS THE ONE THAT COST A ROUND. Measured on the shipped card: with
 * rounds at 03:30, 06:30 and 18:30, setting the third to 06:30 produced two
 * identical entries — and roundsColumn() and roundStarts() both de-duplicate,
 * so the round disappeared from the screen AND from the database with nothing
 * said. While the duplicate existed, one edit rewrote BOTH entries, because
 * rounds are matched by their time.
 */
export type RoundEdit =
  | { ok: true; rounds: CampaignRound[] }
  | { ok: false; reason: 'invalid' | 'unchanged' | 'taken' };

export function editRoundTime(rounds: CampaignRound[], starts: string[], from: string, to: string): RoundEdit {
  if (!/^\d{2}:\d{2}$/.test(to)) return { ok: false, reason: 'invalid' };
  if (to === from) return { ok: false, reason: 'unchanged' };
  if (starts.includes(to)) return { ok: false, reason: 'taken' };
  return { ok: true, rounds: rounds.map((r) => (r.at === from ? { ...r, at: to } : r)) };
}

/**
 * ─── אין חלון חזרה כברירת מחדל. NO REPEAT WINDOW, BY DEFAULT. ────────────
 *
 * "תוריד לגמרי את כל החסימות הקיימות כולל ה-20 שעות הכל אני לוקח אחריות על
 *  המשתמש שלי." — הבעלים, 02.11.2026. הפעם הרביעית שהוא אומר את זה.
 *
 * This was 12: the product's own judgement that the same post should not
 * reach the same group twice in a working day. It is not a rule of
 * Facebook's, it was never his, and it is the number every default in this
 * file is built from — a campaign with no stored window reads it, the writer
 * clamps UP to it, and the card prints it back at him. Three times I removed
 * a twenty from somewhere and it returned from the next place that held one.
 *
 * Zero means: nothing in the code holds a publication back for having been
 * there before. A campaign that WANTS a window still sets one on its own
 * card, and that number is respected exactly as before — this is the floor
 * under it, not a ceiling over it.
 *
 * WHAT IT COSTS, kept here rather than quietly dropped with the number:
 * republishing the same post to the same group is the single clearest spam
 * signal a group admin or Meta looks for, and group publishing runs through
 * the owner's OWN browser and his own account. He has been told, in these
 * words, four times, and has taken responsibility in writing.
 *
 * THE STORED ROWS ARE NOT REACHED FROM HERE. readRepeat returns what the
 * campaign's own column says, and his existing campaigns carry 20 from the
 * database's column default — supabase/social-schema-v35.sql is the other
 * half of this and must be run.
 */
export const MIN_REPEAT_HOURS = 0;
export const ABSOLUTE_MIN_REPEAT_HOURS = 0;

/** The account's floor, clamped into what the column and the engine accept. */
export function repeatFloorFrom(limits?: { repeatFloorHours?: number } | null): number {
  const raw = Number(limits?.repeatFloorHours);
  if (!Number.isFinite(raw)) return MIN_REPEAT_HOURS;
  return Math.min(MAX_REPEAT_HOURS, Math.max(ABSOLUTE_MIN_REPEAT_HOURS, Math.round(raw)));
}
export const MAX_REPEAT_HOURS = 168;

/**
 * ─── HOW THE WINDOW READS ON A SCREEN, INCLUDING WHEN THERE ISN'T ONE ──────
 *
 * Two places print this clause — the campaign panel and the activity log — and
 * both interpolated the number straight in. With the floor now able to be
 * zero, that produced "לא יותר מפעם ב-0 שעות לאותה קבוצה", which is not a
 * limit, is not Hebrew, and reads like a bug in a product whose whole
 * discipline is that a screen never says something the engine will not do.
 *
 * One builder, so the two cannot drift, and the zero case says what zero
 * actually means rather than printing it.
 */
export function repeatWindowSentence(minHours: number): string {
  return minHours > 0
    ? `לא יותר מפעם ב-${minHours} שעות לאותה קבוצה`
    : 'בלי מרווח מינימלי — אותו פוסט יכול לצאת שוב לאותה קבוצה בכל סבב';
}

/**
 * ─── WHAT A NEW CAMPAIGN STARTS AS ────────────────────────────────────────
 *
 * "חזרה יומית תשאיר כברירת מחדל תמיד עובדת." — the owner, 02.11.2026. So a
 * campaign he creates repeats daily until he presses the switch, and v31 sets
 * the same default in the database so the two cannot disagree.
 *
 * THIS IS NOT THE ENGINE'S FALLBACK. See REPEAT_WHEN_UNKNOWN below: "what a
 * new campaign starts as" and "what to assume when we could not find out" are
 * two different questions, and they were one constant for about an hour,
 * during which flipping this one would have turned a failed campaign read into
 * a permission to publish the same post to the same group twice.
 *
 * ─── THE 20 THAT WOULD NOT DIE ────────────────────────────────────────────
 *
 * minHours was a hard-coded 20 here, and that is the number he kept seeing:
 * "לא הסרת את המגבלה של ה-20 שעות! תמחק את זה כבר." He was right and I had
 * missed it twice. Making the floor adjustable (Settings) and dropping the
 * queue constraint (v33) did nothing to this line — every campaign he created
 * was still stamped with twenty hours, from a constant, and the account's own
 * floor could only ever raise a stored number toward itself, never lower this
 * one.
 *
 * It is MIN_REPEAT_HOURS now, so the product's default is the documented
 * twelve rather than an undocumented twenty — and readRepeat() falls back to
 * the ACCOUNT'S floor rather than to this constant, so an account that has set
 * its own number gets its own number for a row that has never stored one.
 */
export const DEFAULT_CAMPAIGN_REPEAT: CampaignRepeat = { enabled: true, minHours: MIN_REPEAT_HOURS };

/**
 * ─── AND WHAT TO ASSUME WHEN THE ROW COULD NOT BE READ ────────────────────
 *
 * OFF. Always off, whatever the default for a new campaign becomes.
 *
 * rules.ts holds this before it reads the campaign, two hundred lines above
 * the guard that uses it, and raises it only from a row it actually got back.
 * A queue row with no campaign_id, a campaign whose read errored, a database
 * that has never run v25 — each lands here, and each must get the behaviour
 * this engine has always had: never the same post to the same group twice.
 *
 * A PERMISSION IS NOT SOMETHING TO FALL BACK INTO. Four reads in that file
 * were fail-open this session and every one of them could double-publish; the
 * fix was to make not-knowing mean wait. This constant is the same rule for
 * the repeat, written down so that changing the owner's default cannot quietly
 * change the engine's fallback. repeat-rules.test.ts pins both.
 */
export const REPEAT_WHEN_UNKNOWN: CampaignRepeat = { enabled: false, minHours: DEFAULT_CAMPAIGN_REPEAT.minHours };

/** The two columns → the object, for a row written by any version of this app. */
export function readRepeat(c: Partial<Campaign> | null | undefined, floorHours: number = MIN_REPEAT_HOURS): CampaignRepeat {
  /* THE ACCOUNT'S FLOOR, NOT THE PRODUCT'S CONSTANT. A row that has never
     stored a window reads as whatever this account's floor says — so the owner
     who set 2 (or 0) sees 2 (or 0), and an account that never said anything
     still sees MIN_REPEAT_HOURS, which is what repeatFloorFrom() returns for
     settings it cannot read. See DEFAULT_CAMPAIGN_REPEAT's note. */
  const hours = Number(c?.repeat_min_hours ?? floorHours);
  return {
    /*
     * ONLY `true` IS ON, AND THAT IS NOT A CONTRADICTION OF THE OWNER'S
     * "חזרה יומית תשאיר כברירת מחדל תמיד עובדת".
     *
     * I tried `!== false` here first, and it is wrong in two places at once:
     * rules.ts's fallback read selects `status` alone, so a database missing
     * the columns would have read ON and republished to the same group; and a
     * dashboard on that same database would have drawn "חוזר כל יום" over an
     * engine that never repeats. A loose read buys the default by lying about
     * what the row says.
     *
     * AND IT CANNOT TELL THE TWO FALSES APART ANYWAY. Before v31 the column
     * defaulted to `false`, so a stored `false` means EITHER "he pressed the
     * switch" OR "nobody ever chose" — the same value, two opposite
     * intentions. No reader can resolve that; only the data can. So v31 does
     * it once, in the database: the default becomes true, every ACTIVE
     * campaign still on the old false is switched on, and paused or archived
     * ones keep what they had. After it runs, every campaign he is running
     * carries a real `true` and this strict read returns exactly that.
     *
     * So the owner's default lives in DEFAULT_CAMPAIGN_REPEAT (what a new
     * campaign starts as, and what gets written) and in v31 (what the existing
     * ones became). This function only reports what the row actually says.
     */
    enabled: c?.repeat_enabled === true,
    /* CLAMPED TO THE ACCOUNT'S FLOOR, not to the constant. A row storing 3
       on an account whose floor is 3 must read back as 3; clamping it to 12
       here would silently overrule the setting the owner just changed. */
    minHours: Number.isFinite(hours) ? Math.min(MAX_REPEAT_HOURS, Math.max(floorHours, Math.round(hours))) : floorHours,
  };
}

/** The object → the two columns, for saveCampaign(). */
export function repeatColumns(r: CampaignRepeat, floorHours: number = MIN_REPEAT_HOURS): { repeat_enabled: boolean; repeat_min_hours: number } {
  return { repeat_enabled: r.enabled, repeat_min_hours: Math.min(MAX_REPEAT_HOURS, Math.max(floorHours, Math.round(r.minHours))) };
}

/**
 * Whether `at` falls on a chosen day, at or after that day's opening hour.
 *
 * ONE EDGE, NOT TWO. The upper edge used to be `s.end` and is now the day
 * itself: `dayISO` is derived from `at`, so an instant on a chosen day is
 * before that day's midnight by construction and there is nothing left to
 * compare it against. What this answers is therefore exactly what the two
 * remaining controls can express — "is this a publishing day, and has it
 * opened yet".
 */
export function isAllowedAt(s: CampaignSchedule, at: Date, tz = TIMEZONE): boolean {
  if (!s.enabled) return true;
  if (!s.days.includes(zonedWeekday(at, tz))) return false;
  return at >= zonedToUtc(zonedDateISO(at, tz), s.start, tz);
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
    /*
     * MIDNIGHT, AND EXCLUSIVE. The day closes where the next one begins, built
     * as the next calendar date's 00:00 in the zone rather than as 23:59 or as
     * a day of milliseconds — the first is a minute short and the second moves
     * by an hour twice a year. Exclusive because 00:00 belongs to the day
     * after, which the next iteration decides about on its own merits: it may
     * not be a publishing day at all.
     */
    const closes = zonedToUtc(addDaysISO(dayISO, 1), '00:00', tz);
    if (from <= opens) return opens;
    if (from < closes) return from;
  }
  return null;
}

/**
 * IS THE WINDOW OPEN RIGHT NOW, AND UNTIL WHEN — the close of the window
 * `from` falls inside, or null when it falls inside none.
 *
 * "למה זה 17:12 הפרסום יסתיים כבר" — because nextAllowedAt() answers "the
 * first instant permitted at or after `from`", and when `from` is itself
 * permitted that answer IS `from`. Correct, and useless to print: a screen
 * that reads 17:13 showing "חלון הפרסום הבא: 17:12" is naming the moment the
 * owner is standing in as if it were an appointment, and the only thing he can
 * conclude from it is that the screen is wrong.
 *
 * So the strip needs the other half of the same fact, and it is a question
 * nextAllowedAt() cannot be asked: not when the window opens, but when the one
 * already open closes. WHICH IS NOW MIDNIGHT — the day's own end, since the
 * closing hour was removed — and a caller still cannot derive it safely,
 * because "the end of the day this instant falls in" means resolving a
 * calendar date in the zone across two clock changes a year, which is
 * precisely the arithmetic that lives in this file and nowhere else.
 *
 * NULL IS NOT "NEVER", IT IS "NOT NOW". Outside the window — before it opens,
 * after it closes, or on a day that is not chosen — the honest reading is
 * nextAllowedAt()'s, and the caller falls back to it.
 */
export function windowClosesAt(s: CampaignSchedule, from: Date, tz = TIMEZONE): Date | null {
  if (!s.enabled) return null;
  if (!isAllowedAt(s, from, tz)) return null;
  return zonedToUtc(addDaysISO(zonedDateISO(from, tz), 1), '00:00', tz);
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
    const due = new Date(lastPublishedAt.getTime() + s.gapSeconds * 1000);
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

/** "כל 10 דקות" / "כל 30 שניות", and the counts Hebrew does not spell with a
    digit. */
export function gapLabel(s: CampaignSchedule): string {
  if (s.gapSeconds < 60) return `כל ${counted(s.gapSeconds, 'שנייה', 'שניות', 'שתי שניות')}`;
  return `כל ${counted(Math.round(s.gapSeconds / 60), 'דקה', 'דקות', 'שתי דקות')}`;
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
  return `${daysLabel(s)} · משעה ${s.start} · ${gapLabel(s)}`;
}
