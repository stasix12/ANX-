import { nextAllowedAt, nextPublishAt, type CampaignSchedule } from './campaign-schedule';
import { accountGapSeconds } from './rules';
import type { BrowserSettings, LimitsSettings } from './types';

/**
 * WHEN EACH WAITING ROW WILL ACTUALLY GO OUT — one answer, for every surface
 * and for the writer that stamps the queue.
 *
 * "למה יש כל פעם את האיחור הזה" · "אני רוצה שמתי שאני משנה שם ימים / שעות שזה
 *  יתעדכן באותו הרגע" · "מקור אמת אחד לזמני הפרסום — הכרטיס והרשימה חייבים
 *  להסכים."
 *
 * ───────────── THE FAULT THIS FILE EXISTS TO END ─────────────
 *
 * A queue row carries ONE instant, `scheduled_at`, and that instant is not when
 * the row publishes. Four separate gates stand between the two, and rules.ts
 * applies every one of them at claim time:
 *
 *   1. the stored instant itself                     — not before this
 *   2. the ACCOUNT-wide floor                        — minGap + groupMinGap
 *      since the last publication of the whole account
 *   3. the CAMPAIGN's own gap                        — schedule.gapSeconds
 *      since the last publication of this campaign
 *   4. the CAMPAIGN's publishing window              — chosen days, start–end
 *
 * The campaign card already knew this: scheduleReadout() composes all four and
 * names the instant the engine will really use. The dashboard's
 * "הפרסומים הקרובים" list did not — Timeline.tsx rendered the RAW
 * `scheduled_at` through countdownTo() with no schedule, no window and no gap
 * in sight. So on the owner's screen, with 217 rows re-spaced at 06:25 under a
 * window that opens at 08:00:
 *
 *   • the card said   08:00         (correct: the engine defers to the window)
 *   • the list said   באיחור · לפני שעתיים   (for every one of the 217 rows)
 *
 * Neither number was an arithmetic mistake. There were simply two answers,
 * because there were two places computing them — the exact failure
 * campaign-schedule.ts's own header says it was written to prevent, re-created
 * one layer up by a component that read a column instead of asking a function.
 *
 * ───────────── AND THE OTHER HALF: THE STAMPS THEMSELVES ─────────────
 *
 * The read side alone would paper over it. The stamps were WRONG, and two
 * writers wrote them that way:
 *
 *   • respaceQueue() lays rows out as `start + i × gap` — a flat arithmetic
 *     sequence that has never heard of the window. Re-spaced at 06:24, which
 *     is what the owner did, it stamped 217 rows from 06:25 onwards: every one
 *     of them at an instant its own campaign forbids.
 *   • planQueue() stamps `staggerAt(slot, i, gap)` — the occasion's time plus
 *     the spacing — which walks straight through the night and out the far
 *     side of the window on any round bigger than a few dozen groups.
 *
 * The engine coped (it defers, it never drops), so nothing was lost — but every
 * screen, every countdown and every "הבא בתור" was reading a column that said
 * something the machine would not do. A row may only be stamped at an instant
 * the engine can actually use, and that is what windowedSlots() below is for.
 *
 * ───────────── WHAT IS SHARED, EXACTLY ─────────────
 *
 * projectOne() is the composition of the four gates. scheduleReadout() calls
 * it for the campaign card. projectQueue() walks it down an ordered queue for
 * the dashboard's list. windowedSlots() is the same roll, without a clock, for
 * the two writers. Nothing here renders, and nothing here writes.
 *
 * IT IS A FORECAST, AND IT SAYS SO. Every instant below assumes the PC is
 * there and that a publication is instantaneous; neither is true. The screens
 * that report whether the machine is running do that with a heartbeat
 * (WORKER_OFFLINE_AFTER_SECONDS) and not with a clock, and this file does not
 * second-guess them — see the note on the `now` floor at projectOne().
 */

/**
 * THE ACCOUNT-WIDE GAP — the one rules.ts measures against the last
 * publication of the WHOLE account, whatever campaign it belonged to.
 *
 * Lived in schedule-readout.ts while the campaign card was its only reader.
 * It is now read by the queue list and by respaceQueue() as well, so it sits
 * in the module all three of them share; schedule-readout.ts re-exports the
 * type so every existing importer is untouched.
 */
export interface AccountSpacing {
  /** limits.minGapMinutes — between any two publications, whatever the channel. */
  minGapMinutes: number;
  /** browser.groupMinGapMinutes — added on top of it for a facebook_group. */
  groupMinGapMinutes: number;
  /**
   * The same two numbers in SECONDS, when the account has them.
   *
   * The minutes above cannot say "thirty seconds" — the smallest thing they
   * can express is a minute, so a card drawn from them over an account whose
   * floor is genuinely 30s would print a minute and be wrong in the one
   * direction that matters: it would promise LATER than the engine will
   * publish, and the owner would watch a post go out before its own
   * countdown reached zero.
   *
   * Optional, and absent means exactly what it meant before they existed.
   * accountGapSeconds() in rules.ts decides which half wins, and this module
   * calls that function rather than repeating the rule.
   */
  minGapSeconds?: number;
  groupMinGapSeconds?: number;
  /** The account's most recent publication. NOT any one campaign's. */
  lastPublishedAt: string | null;
}

/**
 * Unknown by default, and unknown means "adds nothing".
 *
 * A caller that cannot supply the account's last publication gets the
 * campaign's own gap and nothing else. That is the wrong answer when an
 * account floor is in force, but it is the SAME wrong answer every screen gave
 * before this existed, and a default that invented a floor out of nothing would
 * be worse: it would push every instant forward by an hour on a database that
 * has simply never published.
 */
export const NO_SPACING: AccountSpacing = { minGapMinutes: 0, groupMinGapMinutes: 0, lastPublishedAt: null };

/** The account's two gap settings, as the dashboard already holds them. */
export function spacingFrom(
  limits: Pick<LimitsSettings, 'minGapMinutes' | 'minGapSeconds'>,
  browser: Pick<BrowserSettings, 'groupMinGapMinutes' | 'groupMinGapSeconds'> | null | undefined,
  lastPublishedAt: string | null,
): AccountSpacing {
  return {
    minGapMinutes: limits.minGapMinutes,
    minGapSeconds: limits.minGapSeconds,
    groupMinGapMinutes: browser?.groupMinGapMinutes ?? 0,
    groupMinGapSeconds: browser?.groupMinGapSeconds,
    lastPublishedAt,
  };
}

/**
 * The instant the account-wide rule will not let anything publish before, in
 * epoch ms, or 0 when the account has never published.
 *
 * `lastOverride` is how a cascade walks: projectQueue() hands in the instant it
 * has just projected for the row above rather than the stored one, because by
 * the time that row is reached the account's "last publication" is the row
 * before it.
 */
export function accountFloorMs(spacing: AccountSpacing, channel: string | null, lastOverride?: string | null): number {
  const last = lastOverride === undefined ? spacing.lastPublishedAt : lastOverride;
  if (!last) return 0;
  /* The group surcharge is applied exactly where rules.ts applies it: on a
     facebook_group target and nowhere else. An unknown channel gets the plain
     floor rather than the larger one — guessing upwards would hold a page's
     publication behind a rule that does not govern it. */
  const seconds = accountGapSeconds(spacing, spacing, channel === 'facebook_group');
  if (!seconds) return 0;
  const ms = new Date(last).getTime();
  return Number.isNaN(ms) ? 0 : ms + seconds * 1000;
}

/** A campaign's gate: the window and gap it is set to, and when IT last published. */
export interface CampaignGate {
  /** Null, absent, or `enabled: false` all mean "this campaign is ungated". */
  schedule?: CampaignSchedule | null;
  /** THIS campaign's most recent publication — what its own gap is measured from. */
  lastPublishedAt?: string | null;
}

export interface ProjectInput {
  /** The row's stored instant. Absent is treated as "as soon as allowed". */
  scheduledAt?: string | null;
  /** The row's target channel — the group surcharge applies to groups only. */
  channel?: string | null;
  /** The campaign's window, gap, and own last publication. */
  gate?: CampaignGate | null;
  /** The account-wide floor's two numbers and the account's last publication. */
  spacing?: AccountSpacing;
  /**
   * The account's last publication for THIS step of a cascade, overriding the
   * one on `spacing`. See accountFloorMs.
   */
  accountLastPublishedAt?: string | null;
  /**
   * NOW — the floor below which no instant may be named.
   *
   * "NAME AN INSTANT ONLY WHEN SOMETHING WILL HAPPEN AT IT" is
   * schedule-readout.ts's own rule, and a past instant is the clearest case of
   * one at which nothing will happen: it already didn't. A row whose stamp has
   * gone publishes at the first legal moment from NOW, not from the moment it
   * missed — which is the behaviour scheduleReadout() has always had and is
   * tested for ("a row that is overdue is reported as due now").
   *
   * THAT THIS IS NOT A LATENESS REPORT IS DELIBERATE. "באיחור" over 217 rows
   * that are simply a queue being worked through is the false alarm the owner
   * reported by name. Whether the machine is actually there is a question only
   * a heartbeat can answer, and the system card answers it — with the worker's
   * own report and with the overdue banner, both of which read the raw stamp.
   * This file forecasts; that card diagnoses.
   *
   * OMITTED, THERE IS NO FLOOR, and that is what the writers need: a stamp has
   * to be reproducible from the schedule alone or the unique index on
   * (schedule_id, target_id, scheduled_at) stops doing its job the moment the
   * planner runs twice. See windowedSlots().
   */
  now?: Date;
}

/**
 * THE FOUR GATES, COMPOSED IN THE ONLY ORDER THEY COMPOSE IN.
 *
 * The stored instant and the account floor are both "not before X", so the
 * later of them wins. The campaign's gap is "not before Y" measured from its
 * own last publication, so it joins them. And the window is asked LAST, as
 * "the first legal moment at or after all of that" — the other way round (find
 * the window, then add the gap) can land past the window's close and name an
 * instant outside it, which is the bug nextPublishAt()'s own header describes.
 *
 * Null means ONE thing: the schedule is on and no day is lit, so the row is
 * held indefinitely — by design, since rules.ts defers and never drops. The
 * caller says so in words; it may not print the stored instant over it.
 */
export function projectOne(input: ProjectInput): Date | null {
  const spacing = input.spacing ?? NO_SPACING;
  const channel = input.channel ?? null;

  const stamped = input.scheduledAt ? new Date(input.scheduledAt).getTime() : Number.NaN;
  const floors = [
    Number.isNaN(stamped) ? 0 : stamped,
    accountFloorMs(spacing, channel, input.accountLastPublishedAt),
    input.now ? input.now.getTime() : 0,
  ];
  const from = new Date(Math.max(...floors));

  const schedule = input.gate?.schedule;
  if (!schedule?.enabled) {
    /* Ungated: the stored instant (raised to the account floor and to now) is
       exactly what the queue will do — off means the window is not enforced. */
    return from;
  }
  const last = input.gate?.lastPublishedAt ? new Date(input.gate.lastPublishedAt) : null;
  return nextPublishAt(schedule, from, Number.isNaN(last?.getTime() ?? Number.NaN) ? null : last);
}

/** A row as this module needs to see it — nothing else about a queue row. */
export interface ProjectableRow {
  id: string;
  scheduled_at: string;
  status: string;
  campaign_id?: string | null;
  target?: { channel?: string | null } | null;
}

/**
 * Which statuses this projection is ABOUT.
 *
 * Only a row the engine will pick up on its own has a forecast: a row waiting
 * for a person moves when the person moves it, and naming a minute over it
 * would be the same invented promise this module exists to remove. Those rows
 * keep their stored instant, and the list prints the sentence that says what
 * they are waiting for.
 */
const PROJECTED_STATUSES = new Set(['scheduled']);

/**
 * A row that is GOING OUT RIGHT NOW — no forecast, but it still moves the
 * clock the rows behind it are measured against.
 *
 * It has no forecast because it is not waiting for anything: the worker is
 * holding it, and "מפרסם עכשיו" is what the list says over it. But it is about
 * to become the account's most recent publication, so leaving it out of the
 * cascade projects the row behind it a whole account gap too early — 65
 * minutes, with the shipped defaults, which is not a rounding error on a card
 * the owner reads as a countdown.
 *
 * `awaiting_confirmation` and `manual_pending` are deliberately NOT here: they
 * move when a person moves them and may never publish at all, so assuming
 * they will is exactly the invented promise this module exists to remove.
 */
const IN_FLIGHT_STATUSES = new Set(['publishing']);

/**
 * EVERY WAITING ROW'S INSTANT, in queue order, with the gaps cascading.
 *
 * One row's projection is the next row's floor, which is the whole reason a
 * per-row call would not do: under a one-minute campaign gap the first row goes
 * out at 08:00 and the two-hundredth at 11:20, and a list that asked about each
 * row independently would print 08:00 two hundred times. The cascade is also
 * what makes the answer honest in the other direction — it is why a deep queue
 * reads as "בעוד 3:20:00" rather than as two hundred rows all "באיחור".
 *
 * `rows` must arrive in the order the engine will take them, which for every
 * caller in this product means ordered by `scheduled_at` ascending.
 *
 * Returns ISO strings, and `null` for a row held by a schedule with no day.
 * A row whose status is not forecastable is absent from the map entirely, so a
 * caller can tell "no forecast" from "held".
 */
export function projectQueue(
  rows: ProjectableRow[],
  opts: { now: Date; gates?: Record<string, CampaignGate>; spacing?: AccountSpacing },
): Map<string, string | null> {
  const spacing = opts.spacing ?? NO_SPACING;
  const out = new Map<string, string | null>();
  /* The account's rolling "last publication": the stored one to begin with,
     then each instant this walk projects. */
  let accountLast = spacing.lastPublishedAt;
  /* And one per campaign, because the campaign gap is measured per campaign. */
  const campaignLast = new Map<string, string | null>();

  for (const row of rows) {
    if (IN_FLIGHT_STATUSES.has(row.status)) {
      /* No entry in the map — see IN_FLIGHT_STATUSES — but the clocks move:
         this publication is happening, so the rows behind it wait for it. */
      const going = new Date(Math.max(opts.now.getTime(), new Date(row.scheduled_at).getTime() || 0)).toISOString();
      accountLast = going;
      campaignLast.set(row.campaign_id ?? '', going);
      continue;
    }
    if (!PROJECTED_STATUSES.has(row.status)) continue;
    const key = row.campaign_id ?? '';
    const gate = (row.campaign_id && opts.gates?.[row.campaign_id]) || null;
    const seeded = campaignLast.has(key) ? campaignLast.get(key) ?? null : gate?.lastPublishedAt ?? null;
    const at = projectOne({
      scheduledAt: row.scheduled_at,
      channel: row.target?.channel ?? null,
      gate: gate ? { schedule: gate.schedule, lastPublishedAt: seeded } : { lastPublishedAt: seeded },
      spacing,
      accountLastPublishedAt: accountLast,
      now: opts.now,
    });
    const iso = at ? at.toISOString() : null;
    out.set(row.id, iso);
    /*
     * A HELD ROW DOES NOT ADVANCE EITHER CLOCK. Nothing publishes at an
     * instant that does not exist, so the row behind it is not pushed by it —
     * it is held by the same setting and will say so for itself.
     */
    if (iso) {
      accountLast = iso;
      campaignLast.set(key, iso);
    }
  }
  return out;
}

/**
 * THE WRITERS' CASCADE — the same roll, with no clock in it.
 *
 * planQueue() stamps one instant per (occasion, target) and respaceQueue()
 * stamps one per waiting row; both laid them out as plain arithmetic and both
 * therefore wrote instants their own campaign forbids. This is the correction,
 * and it has three properties the writers need and the read side does not:
 *
 *   • NO `now`. A stamp must be reproducible from the schedule alone, because
 *     the queue's unique index is (schedule_id, target_id, scheduled_at) and
 *     a planner that runs twice has to land on the same instants the second
 *     time or it writes the round again.
 *   • STRICTLY INCREASING. Rolling a block of rows into a window would
 *     otherwise collapse them all onto its opening minute — 100 rows stamped
 *     08:00, the unique index rejecting 99 of them, and the one survivor's
 *     round silently a hundredth of its size. Each instant is therefore at
 *     least `gapSeconds` past the one before it, so the roll produces 08:00,
 *     08:01, 08:02 … exactly as the engine would.
 *   • UNCHANGED WHEN THE SCHEDULE IS OFF. nextAllowedAt() returns `from`
 *     untouched for a campaign that is not gated, so the flat sequence these
 *     writers have always produced is what they still produce. Nothing moves
 *     for an owner who has never opened the panel.
 *
 * `base` is the arithmetic instant the caller wanted (the occasion plus the
 * stagger, or `start + i × gap`); the return value is the first instant at or
 * after it that the campaign actually permits.
 */
export function windowedCascade(
  bases: Date[],
  gapSeconds: number,
  schedule: CampaignSchedule | null | undefined,
): Date[] {
  const gap = Math.max(0, Math.round(gapSeconds)) * 1000;
  const out: Date[] = [];
  let floor = Number.NEGATIVE_INFINITY;
  for (const base of bases) {
    const want = new Date(Math.max(base.getTime(), floor));
    /* Null only when no day is chosen, and a stamp still has to be written
       somewhere: the arithmetic instant stands and the engine holds the row
       with the sentence that names the setting. Inventing a date out of an
       impossible schedule would be worse than leaving it where it was. */
    const at = schedule?.enabled ? nextAllowedAt(schedule, want) ?? want : want;
    out.push(at);
    floor = at.getTime() + gap;
  }
  return out;
}

/**
 * One occasion's targets, rolled into the campaign's window — what planQueue()
 * stamps instead of `staggerAt(slot, i, gap)` alone.
 *
 * The stagger is still the owner's own interval read back (see staggerAt in
 * ./slots); this only moves the result off the hours he has told the campaign
 * not to publish in.
 */
export function windowedStagger(
  slot: Date,
  targetCount: number,
  gapSeconds: number,
  schedule: CampaignSchedule | null | undefined,
): Date[] {
  const gap = Math.max(0, Math.round(gapSeconds));
  const bases = Array.from({ length: Math.max(0, targetCount) }, (_, i) => new Date(slot.getTime() + i * gap * 1000));
  return windowedCascade(bases, gap, schedule);
}

/**
 * EVERY INSTANT AN OCCASION LIST PRODUCES, rolled into the window — the
 * window-aware twin of staggeredSlots() in ./slots, for the launch preview.
 *
 * THE PREVIEW HAS TO MATCH THE PLANNER EXACTLY, and this is the second time
 * that has had to be said in this product: "a plan built without it shows 28
 * publications at 09:00 for a schedule the planner spreads across a day and a
 * half — the lie at the last moment before they commit". Teaching planQueue()
 * about the window without teaching the preview would re-open precisely that,
 * one layer along: the sheet would promise 19:00–20:49 for a Saturday round
 * whose rows the planner lands on Sunday morning.
 *
 * Sorted, like staggeredSlots(), because a preview reads the launch as one
 * list of times and two occasions can interleave once each is rolled.
 */
export function windowedSlots(
  slots: Date[],
  targetCount: number,
  gapSeconds: number,
  schedule: CampaignSchedule | null | undefined,
): Date[] {
  const out: Date[] = [];
  for (const slot of slots) out.push(...windowedStagger(slot, targetCount, gapSeconds, schedule));
  return out.sort((a, b) => a.getTime() - b.getTime());
}
