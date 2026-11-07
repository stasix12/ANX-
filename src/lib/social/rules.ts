import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REPEAT_WHEN_UNKNOWN,
  repeatFloorFrom,
  isAllowedAt,
  nextAllowedAt,
  nextPublishAt,
  readRepeat,
  readSchedule,
  scheduleSummary,
  type CampaignRepeat,
  type CampaignSchedule,
  type ScheduleFields,
  gapLabel,
} from './campaign-schedule';
import { startOfZonedDay } from './time';
import type { BrowserSettings, Campaign, LimitsSettings, PaceId, Post, QueueItem, SocialTarget, Variant } from './types';

/**
 * Anti-spam decisions shared by the server worker (Pages, Graph API) and the
 * local browser worker (Groups, Playwright). Both hand in a claimed queue
 * row plus its target/post/variant and get back exactly one action:
 *
 *   publish  — go ahead
 *   skip     — drop with a reason the owner sees in the history
 *   defer    — put back in the queue for `until` (too soon after the last post)
 *   wait     — park until `until` (campaign paused / worker not ready)
 *
 * No network calls to Meta here; purely queue bookkeeping in Supabase.
 */

export type RuleDecision =
  /**
   * `notBefore` is the spacing gap's own instant, present when this row was
   * claimed while the gap was still closing. Everything up to the final click
   * may proceed; the click waits for it. See PREP_LEAD_MS.
   */
  | { action: 'publish'; notBefore?: string }
  | { action: 'skip'; reason: string }
  | { action: 'defer'; until: string; reason: string }
  /**
   * `attention` marks a wait that is the MACHINE'S fault rather than a
   * decision: a read that failed, where the engine has no answer and refuses
   * to guess. An ordinary wait ("הסבב מושהה") happens on every poll of every
   * paused campaign and must stay silent; this one must reach the activity
   * log, or a database that cannot be read becomes a queue that never moves
   * with nothing anywhere saying why — which is the shape of every bug in
   * this product the owner has had to discover for himself.
   */
  | { action: 'wait'; until: string; reason: string; attention?: boolean };

export interface RuleContext {
  item: QueueItem;
  target: SocialTarget | null;
  post: Post | null;
  variant: Variant | null;
  limits: LimitsSettings;
  browser?: BrowserSettings;
  now?: Date;
}

const MAX_DEFERRALS = 40;

/**
 * "That column does not exist" — a database that has not run
 * social-latest.sql — as opposed to every other reason a read can fail.
 *
 * Postgres reports an unknown column as 42703, and PostgREST passes the code
 * through. Everything else — a dropped connection, an expired token, a
 * refused row — means the columns are there and we did not reach them, which
 * is a different answer and must not be mistaken for "this campaign has no
 * schedule".
 */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? '');
}

/**
 * How far past the gap a deferred row is pushed.
 *
 * It was thirty seconds, and thirty seconds is not a rounding error when the
 * owner has set the gap to one minute: every publication came out 90 seconds
 * after the last one, so a setting that says "a minute" delivered forty
 * publications an hour instead of sixty and the owner had no way to see why.
 * The cushion exists only so the row is not due at the exact instant the gap
 * closes — a hair of clock skew there and it defers once more for nothing —
 * so it is one poll of the worker, which is the real granularity anyway.
 */
const DEFER_CUSHION_MS = 5_000;

/**
 * HOW EARLY A ROW MAY BE LET THROUGH BEFORE ITS GAP CLOSES.
 *
 * The gap used to be satisfied before the browser was opened, and the whole
 * preparation — the group page load, the typing, the upload — was then spent
 * on top of it. So the real interval between two publications was the gap
 * PLUS a publication, never the gap: an owner who asked for one a minute got
 * one every two, and a "נדחה" line for every row in between.
 *
 * Let through this early, the preparation happens INSIDE the remaining wait
 * and the composer holds the final click until the instant itself, so the
 * interval becomes the gap or the length of a publication, whichever is
 * larger. Seventy-five seconds is comfortably longer than a measured
 * publication and short enough that a prepared post is never left sitting.
 *
 * Exported because the worker uses the same number to decide when to claim,
 * and the two must not drift.
 */
/**
 * THE ACCOUNT-WIDE FLOOR, IN SECONDS, and the one place that decides it.
 *
 * Two gates pace this product and they compose: the campaign's own gap, and
 * this account-wide one. It is the LATER of the two instants that wins, so
 * this is the real ceiling — with the shipped defaults it is 45 + 20 = 65
 * MINUTES, and a campaign asking for thirty seconds is inert underneath it.
 *
 * Both halves are whole minutes in storage. The optional `*Seconds` fields
 * beside them are the canonical value when present, which is what lets the
 * floor follow a sub-minute campaign. Absent, the minutes decide exactly as
 * they always have — an account that has never touched this is unchanged.
 *
 * THE GROUP SURCHARGE IS ONLY FOR GROUPS. `withGroupExtra` is not a
 * convenience flag: rules.ts applies it per target channel and the worker's
 * own gate applies it to the whole account, and those are two different
 * questions about the same two numbers. Writing it once, here, is what stops
 * them drifting — they have drifted before.
 */
export function accountGapSeconds(
  limits: Pick<LimitsSettings, 'minGapMinutes' | 'minGapSeconds'>,
  browser: Pick<BrowserSettings, 'groupMinGapMinutes' | 'groupMinGapSeconds'> | null | undefined,
  withGroupExtra: boolean,
): number {
  const base = Number.isFinite(limits.minGapSeconds) && (limits.minGapSeconds as number) >= 0
    ? (limits.minGapSeconds as number)
    : Math.max(0, limits.minGapMinutes ?? 0) * 60;
  if (!withGroupExtra) return Math.max(0, Math.round(base));
  const extra = Number.isFinite(browser?.groupMinGapSeconds) && (browser?.groupMinGapSeconds as number) >= 0
    ? (browser?.groupMinGapSeconds as number)
    : Math.max(0, browser?.groupMinGapMinutes ?? 0) * 60;
  return Math.max(0, Math.round(base + extra));
}

/**
 * THE ACCOUNT FLOOR SPLIT BACK INTO THE TWO COLUMNS THAT STORE IT.
 *
 * `minGap` and `groupMinGap` are two settings and one rule: the engine only
 * ever compares against their SUM for a group. So lowering the floor to N
 * means choosing a pair that adds up to exactly N — and getting that wrong is
 * not a rounding error, it is a row deferred by the very setting that was
 * supposed to release it.
 *
 * THE SURCHARGE KEEPS ITS SHARE WHERE IT FITS and is absorbed where it does
 * not. An owner who deliberately asked for an extra twenty minutes between
 * two GROUP posts should still have it when the floor comes down to an hour;
 * at thirty seconds there is nothing left to give it, so the whole thirty
 * becomes the surcharge and the base goes to zero. Either way the two add up.
 *
 * Pure, exported and tested on its own, because this is the second copy of
 * this arithmetic in the product (applyGapSettings has the first) and the two
 * disagreeing about what a gap of N means is a bug nobody would see.
 */
export function splitAccountGap(wantSeconds: number, currentSurchargeSeconds: number): { baseSeconds: number; surchargeSeconds: number } {
  const want = Math.max(0, Math.round(wantSeconds));
  const surchargeSeconds = Math.min(want, Math.max(0, Math.round(currentSurchargeSeconds)));
  return { baseSeconds: want - surchargeSeconds, surchargeSeconds };
}

/** "65 דק׳" / "30 שניות" — the floor said in the unit it actually has, for
    the one sentence the owner reads when a row is deferred for it. */
export function accountGapLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} שניות`;
  const m = seconds / 60;
  return `${Number.isInteger(m) ? m : m.toFixed(1)} דק׳`;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * מצב פרסום חכם — THE THREE PUBLISHING MODES, AND THE REST THAT DEFINES THEM
 *
 * "בוא נגדיר לו 3 דפוסי התנהגות אחד מהיר השני בינוני השלישי, ושיהיה הפסקות
 *  אחרי נגיד 10 פוסטים רצופים הפסקה" — the owner, 07.11.2026, followed by a
 *  binding reference image and an eleven-section specification.
 *
 * WHAT THIS IS NOT. It is not a way around anything Facebook does: there is
 * no detection to dodge here and nothing is disguised. Every mode publishes
 * LESS than the account publishes today and adds stretches of doing nothing
 * at all. It is a brake, and it is the owner braking his own account. The
 * specification is explicit that the modes must not be presented as a promise
 * that an account will not be restricted — "אין להציג את המצבים כהבטחה
 * למניעת חסימות בפייסבוק" — and no string in this product does.
 *
 *   מהיר    45 שניות  ·  10 ברצף  ·  הפסקה 7 דק׳    ≈ 44 פרסומים בשעה
 *   בינוני   2 דקות    ·  10 ברצף  ·  הפסקה 15 דק׳   ≈ 18 פרסומים בשעה
 *   איטי     5 דקות    ·  10 ברצף  ·  הפסקה 30 דק׳   ≈  8 פרסומים בשעה
 *
 * THE NUMBERS ARE THE SPECIFICATION'S, VERBATIM. They are not derived from
 * any published Meta figure, because there is none: this account has been
 * restricted exactly ONCE, on 07.11.2026 at 21:40:13 after 158 publications
 * at a sustained 69 an hour; the night of 02.11 ran 442 publications at 152
 * an hour and was not restricted. Rate alone does not explain it and nothing
 * here claims it does. What the three modes are is three CHOICES with their
 * consequences printed on them.
 *
 * THE RUN LENGTH IS TEN IN ALL THREE, which is what was asked for and is also
 * what keeps the three comparable: one row of the gap and the rest, and the
 * reader can rank them at a glance.
 *
 * ─── WHERE EACH HALF OF A MODE IS KEPT ───────────────────────────────────
 *
 * THE GAP IS NOT READ FROM HERE AT PUBLISH TIME. Picking a mode WRITES
 * `gapSeconds` into the pair the engine has always read — limits.minGapSeconds
 * and browser.groupMinGapSeconds, through applyGapFloor() — so the planner,
 * the projection, both spacing gates and every screen that prints a gap keep
 * reading it from the one place they read it from now. Nothing had to learn
 * about modes, and no screen can disagree with the engine about the gap.
 *
 * THE REST IS THE GENUINELY NEW RULE and lives in `limits.pace` plus this
 * table. paceRestRemainingMs() below is the whole of it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface PaceProfile {
  id: PaceId;
  /** The word on the card: מהיר / בינוני / איטי. */
  label: string;
  /**
   * The semantic colour the specification assigns this mode — orange for
   * fast, blue for medium, green for slow. A TOKEN NAME, not a hex and not a
   * class: the component maps it to the product's own palette, so a mode
   * cannot introduce a colour that is not already in the design system.
   */
  tone: 'warning' | 'brand' | 'success';
  /**
   * The ACCOUNT-WIDE gap this mode asks for. Not read by the gate — see the
   * note above: picking the mode writes it into the stored pair.
   */
  gapSeconds: number;
  /** How many SUCCESSFUL publications in a row before the engine rests. */
  burst: number;
  /** How long the rest lasts, measured from the last publication of the run. */
  restMinutes: number;
}

export const PACE_PROFILES: PaceProfile[] = [
  { id: 'fast', label: 'מהיר', tone: 'warning', gapSeconds: 45, burst: 10, restMinutes: 7 },
  { id: 'medium', label: 'בינוני', tone: 'brand', gapSeconds: 120, burst: 10, restMinutes: 15 },
  { id: 'slow', label: 'איטי', tone: 'success', gapSeconds: 300, burst: 10, restMinutes: 30 },
];

/** The mode a stored id names, or null — which is "no mode", the state every
    account is in until somebody picks one, and means no rest at all. */
export function paceProfile(id: PaceId | null | undefined): PaceProfile | null {
  return PACE_PROFILES.find((p) => p.id === id) ?? null;
}

/**
 * Publications per hour a mode SUSTAINS, rest included — which is the only
 * number worth putting on a card.
 *
 * A run's first publication comes straight after the rest, so the run itself
 * spans (burst − 1) gaps and the cycle is that plus the rest. Quoting
 * 3600/gap instead — 80 an hour for the fast mode — would describe a burst
 * that lasts seven minutes as if it lasted all day, which is exactly the
 * misreading these modes exist to correct.
 */
export function paceRatePerHour(p: PaceProfile): number {
  const cycleSeconds = (p.burst - 1) * p.gapSeconds + p.restMinutes * 60;
  return cycleSeconds > 0 ? (p.burst * 3600) / cycleSeconds : 0;
}

/**
 * ─── HOW LONG A REST IS STILL OWED, in milliseconds. 0 means none is. ──────
 *
 * ONE FUNCTION, ASKED BY EVERYBODY — the per-row rule below, the worker's own
 * pre-claim gate (worker/social-worker.ts) and the screen that has to show
 * "בהפסקה" with a countdown. Those gates have drifted before over the GAP,
 * which is why accountGapSeconds() exists; this is the same lesson applied
 * the first time rather than the second.
 *
 * `stampsDesc` is the published_at instants of the most recent SUCCESSFUL
 * publications, NEWEST FIRST, at least `burst` of them. Every caller reads
 * them with `status = 'published'`, so a failed or skipped attempt is not in
 * the list at all — "פרסום שנכשל אינו נחשב לפרסום מוצלח", structurally rather
 * than by a filter somebody has to remember to write.
 *
 * ─── WHY THERE IS NO COUNTER COLUMN, AND NO MIGRATION ─────────────────────
 *
 * "how many in a row" looks like state that has to be stored and reset, and
 * storing it would mean a schema change, a reset nobody can see, and a number
 * that goes wrong the first time a row is published from somewhere this code
 * does not run. It does not have to be stored, because THE REST ITSELF BREAKS
 * THE RUN: a stretch as long as the rest, between two publications, IS a
 * rest, whatever caused it. So the run is simply "how many of the newest
 * publications are each less than one rest apart", and after a real rest the
 * newest publication is more than one rest from the one before it, the count
 * falls back to 1, and the next run starts.
 *
 * THIS IS ALSO WHAT MAKES THE REST SURVIVE A REFRESH AND A RESTART, which the
 * specification requires by name: "יש לשמור את זמן סיום ההפסקה גם לאחר רענון
 * העמוד או הפעלה מחדש". There is nothing to persist — the rest is DERIVED, on
 * every call, from rows that were already in the database. A browser refresh,
 * a worker restart, a second agent on another machine and the server all
 * compute the same instant from the same rows.
 *
 * It also means a quiet night counts as a rest, which is right: an account
 * that published nothing for two hours has had its break.
 */
export function paceRestRemainingMs(
  pace: PaceProfile | null,
  stampsDesc: number[],
  nowMs: number,
): number {
  if (!pace || pace.burst <= 0 || pace.restMinutes <= 0) return 0;
  if (stampsDesc.length < pace.burst) return 0;
  const restMs = pace.restMinutes * 60_000;
  let run = 1;
  for (let i = 1; i < stampsDesc.length; i += 1) {
    if (stampsDesc[i - 1] - stampsDesc[i] >= restMs) break;
    run += 1;
  }
  if (run < pace.burst) return 0;
  return Math.max(0, stampsDesc[0] + restMs - nowMs);
}

/** "18 דק׳" — the wait a resting row reports, rounded UP so the sentence never
    promises an instant that has not arrived. */
export function paceRestLabel(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / 60_000))} דק׳`;
}

/**
 * "45 שניות" / "2 דקות" / "5 דקות" — a mode's gap SPELLED OUT, for the card.
 *
 * accountGapLabel() abbreviates to "דק׳" because it has to fit inside a
 * deferral sentence and a narrow readout box; the reference image writes the
 * word in full on the mode cards, which have the room. Same seconds, same
 * module, so the two spellings of one number cannot come from two different
 * ideas of what that number is — and anything that is not a whole number of
 * minutes falls back to the abbreviating one rather than inventing a third
 * format.
 */
export function paceGapWords(seconds: number): string {
  if (seconds < 60) return `${seconds} שניות`;
  const m = seconds / 60;
  return Number.isInteger(m) ? `${m} דקות` : accountGapLabel(seconds);
}

export const PREP_LEAD_MS = 75_000;

/**
 * How far ahead a parked row is pushed.
 *
 * 'wait' used to leave scheduled_at untouched, so a paused campaign's soonest
 * row was due again the instant it was written back — and the claim that
 * picked it up a poll later (5 s by default) had already incremented
 * `attempts`. The head row therefore burned ~12 attempts a minute for as long
 * as the pause lasted, and `attempts > MAX_DEFERRALS` turns a row into a
 * permanent skip with a reason about spacing that describes nothing that
 * happened. Pushing the instant forward makes waiting cost nothing.
 */
export const WAIT_MINUTES = 1;

/**
 * Midnight at the start of the next local day, as an instant.
 *
 * Where a row goes when a daily ceiling is full. Computed by asking what day
 * it is 24 hours from now rather than by adding a day to a date, so the clock
 * change in March and October cannot land it on the wrong side of midnight; if
 * that still resolves to an instant already past — the one hour a year it
 * could — it steps a further day rather than returning a moment in the past,
 * which would be a row due immediately and a cap that does nothing.
 */
function startOfNextZonedDay(now: Date): string {
  let next = startOfZonedDay(new Date(now.getTime() + 24 * 60 * 60_000));
  if (next.getTime() <= now.getTime()) next = startOfZonedDay(new Date(now.getTime() + 48 * 60 * 60_000));
  // A minute past midnight, so the count this row is waiting on is unambiguously
  // the new day's rather than a boundary instant belonging to either.
  return new Date(next.getTime() + 60_000).toISOString();
}

async function countPublished(db: SupabaseClient, filter: (q: any) => any): Promise<number> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const base: any = db.from('social_queue').select('id', { count: 'exact', head: true }).eq('status', 'published');
  const res = await filter(base);
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}

export async function evaluateQueueItem(db: SupabaseClient, ctx: RuleContext): Promise<RuleDecision> {
  const now = ctx.now ?? new Date();
  const { item, target, post, variant, limits } = ctx;

  /*
   * ───────── A DEFERRAL LANDS INSIDE THE WINDOW, LIKE EVERY OTHER STAMP ────
   *
   * "אסור שיופיע פרסום מתוכנן ל-08:00 באותו יום עבור הקמפיין הזה."
   *
   * Every writer of `scheduled_at` in this product was taught the campaign's
   * window — the planner, the respace, the re-time on a schedule change — and
   * this one was not. It is the busiest of them: rules.ts rewrites the column
   * on every deferral, and a deferral happens whenever a ceiling is full, a
   * gap is still closing or a repeat is too recent.
   *
   * The daily ceilings are the clearest case. They park a row at the next
   * local midnight plus a minute, which is an hour NO window the owner can
   * configure contains — and that is the "12.10 · 00:01" row in his
   * screenshot, sitting in a queue whose campaign publishes 10:00–23:30.
   *
   * Rolling the instant forward costs nothing when the schedule is off or the
   * instant is already legal (nextAllowedAt returns it unchanged), and it is
   * the same function the planner and the screens use, so a deferred row is
   * now stamped where everything else agrees it will go out.
   */
  const insideWindow = (schedule: CampaignSchedule | null, at: Date): Date =>
    schedule?.enabled ? nextAllowedAt(schedule, at) ?? at : at;
  /* Set once the campaign's schedule has been read, below. Null until then —
     and the reads that happen before it cannot produce a deferral instant. */
  let gate: CampaignSchedule | null = null;

  if (!target) return { action: 'skip', reason: 'היעד נמחק.' };
  if (!post || post.status === 'archived') return { action: 'skip', reason: 'הפוסט נמחק או הועבר לארכיון.' };
  if (!target.enabled) return { action: 'skip', reason: `היעד "${target.name}" כבוי.` };
  if (variant && variant.approval !== 'approved') return { action: 'skip', reason: `הגרסה ${variant.label} לא אושרה.` };
  if (!variant && !post.base_text.trim() && !post.media.length) return { action: 'skip', reason: 'הפוסט ריק.' };

  /*
   * NOT BEFORE THIS INSTANT — carried rather than returned.
   *
   * There are now two gates that can say "you may prepare, but do not click
   * yet": the campaign's own interval, and the account-wide spacing rule at
   * the foot of this function. Each used to be free to `return {action:
   * 'publish', notBefore}` on its own, which means whichever ran first
   * silently decided, and the other's instant was thrown away — a campaign
   * set to ten minutes would have had its gap erased by an account gap of one.
   *
   * So each gate RAISES this and falls through, and the single return at the
   * end hands over the latest of them. The worker holds the final click until
   * it; see PREP_LEAD_MS.
   */
  let holdUntil: Date | null = null;
  const holdFor = (at: Date) => {
    if (!holdUntil || at > holdUntil) holdUntil = at;
  };

  // Campaign pause/stop: leave the row alone until the owner resumes.
  /*
   * HOISTED, because the repeat guard that uses it is two hundred lines below
   * and outside this block, and because this value is the safe one: a row with
   * no campaign, or a campaign whose read failed, gets "never twice" — the
   * behaviour this engine has always had. A permission is not something to
   * fall back into.
   *
   * AND IT IS DELIBERATELY NOT DEFAULT_CAMPAIGN_REPEAT. That constant is what
   * a NEW campaign starts as, and the owner has just asked for it to be ON. If
   * this line still read it, flipping his default would have turned every
   * failed campaign read in this engine into a permission to publish the same
   * post to the same group again. Two questions, two constants.
   */
  let repeat: CampaignRepeat = REPEAT_WHEN_UNKNOWN;
  const campaignId = item.campaign_id ?? post.campaign_id;
  if (campaignId) {
    /*
     * The five schedule columns come back with the status in the one read this
     * function already did. They may not exist — a database that has not run
     * social-latest.sql — so the select names them and the failure is handled
     * by falling back to the status alone rather than by refusing to publish.
     * An engine that stops working because a column is missing is a worse
     * outcome than an engine that ignores a window nobody has set yet.
     */
    let campaign: (Pick<Campaign, 'status'> & ScheduleFields & Pick<Campaign, 'repeat_enabled' | 'repeat_min_hours'>) | null = null;
    const full = await db
      .from('social_campaigns')
      /*
       * BOTH GAP COLUMNS, and leaving the seconds out of this list is the
       * exact shape of bug this product has shipped before: readSchedule()
       * falls back to the minutes when the seconds are absent, and a column
       * that is in the table but not in the SELECT is indistinguishable from
       * one that does not exist. The owner would pick thirty seconds, the
       * panel would show thirty seconds, and the engine deciding whether to
       * publish would quietly enforce sixty — with nothing anywhere saying so.
       */
      .select(
        'status, schedule_enabled, schedule_days, schedule_start, schedule_end, schedule_gap_minutes, schedule_gap_seconds, repeat_enabled, repeat_min_hours',
      )
      .eq('id', campaignId)
      .maybeSingle();
    if (full.error) {
      /*
       * A MISSING COLUMN AND A FAILED READ ARE NOT THE SAME ANSWER, and
       * treating them alike is the one path in this engine that can publish
       * outside the owner's hours.
       *
       * The fallback below selects `status` alone, so `readSchedule` sees no
       * columns and reports `enabled: false` — and every gate under it (the
       * days, the window, the campaign's own interval) is skipped. For a
       * database that predates these columns that is right, and deliberate:
       * an engine that stops working because a column is missing is worse
       * than one that ignores a window nobody has set.
       *
       * For a DROPPED CONNECTION it is wrong in the worst possible direction.
       * One transient PostgREST error and the row publishes at any hour of
       * any day, with nothing on any screen saying why. So the two are told
       * apart: a missing column falls through as before; anything else waits
       * a minute and tries again, which costs one poll and cannot publish by
       * a schedule it could not read.
       */
      if (!isMissingColumn(full.error)) {
        return {
          action: 'wait',
          until: new Date(now.getTime() + WAIT_MINUTES * 60_000).toISOString(),
          reason: 'לא הצלחנו לקרוא את הגדרות התזמון של הסבב — ננסה שוב בעוד רגע.',
          attention: true,
        };
      }
      /*
       * AND THE FALLBACK READ IS A READ TOO.
       *
       * This is the one query left that decides whether the campaign is
       * paused or stopped, and it used to throw its error away. A dropped
       * connection here leaves `campaign` null, `campaign?.status === 'paused'`
       * false, `=== 'archived'` false — and a campaign the owner PAUSED
       * publishes. He has pressed pause and watched posts go out; this is one
       * of the paths that can do it.
       */
      const bare = await db.from('social_campaigns').select('status').eq('id', campaignId).maybeSingle();
      if (bare.error) {
        return {
          action: 'wait',
          until: new Date(now.getTime() + WAIT_MINUTES * 60_000).toISOString(),
          reason: 'לא הצלחנו לקרוא אם הסבב פעיל — ננסה שוב בעוד רגע.',
          attention: true,
        };
      }
      campaign = (bare.data as Pick<Campaign, 'status'> | null) ?? null;
      /*
       * AND THIS ROW MAY NOT RAISE THE REPEAT. It carries `status` and nothing
       * else, so readRepeat() would see no repeat_enabled at all — and since
       * the owner's default became "on unless the switch was pressed", an
       * absent column now reads ON. On a database that has never run v25 that
       * would turn a missing column into a permission to publish the same post
       * to the same group again, which is the opposite of what a fallback is
       * for. `repeat` stays REPEAT_WHEN_UNKNOWN here, which is "never twice".
       * repeat-rules.test.ts proves it with columnsMissing.
       */
    } else {
      campaign = (full.data as (Pick<Campaign, 'status'> & ScheduleFields & Pick<Campaign, 'repeat_enabled' | 'repeat_min_hours'>) | null) ?? null;
      /*
       * ONLY A ROW THAT ACTUALLY CARRIES THE TWO COLUMNS DECIDES THE REPEAT.
       * PostgREST refuses a whole read when a named column is absent, so this
       * branch succeeding is itself the proof that both columns exist — which
       * is what makes reading them here, and only here, correct.
       */
      /*
       * CLAMPED TO THE ACCOUNT'S FLOOR, NOT TO THE CONSTANT.
       *
       * readRepeat() raises anything below the floor up to it. With the floor
       * hard-coded at twelve, a campaign the owner deliberately set to three
       * hours — which the database now accepts, and which Settings now offers
       * — would have been read back here as twelve and refused anyway. The
       * setting would have existed on one screen and governed nothing.
       */
      if (campaign) repeat = readRepeat(campaign, repeatFloorFrom(limits));
    }
    if (campaign?.status === 'paused') {
      return { action: 'wait', until: new Date(now.getTime() + WAIT_MINUTES * 60_000).toISOString(), reason: 'הסבב מושהה.' };
    }
    if (campaign?.status === 'archived') {
      /*
       * ─── WHICH ROUND WAS STOPPED, BECAUSE IT MAY NOT BE THE ONE HE SEES ──
       *
       * `campaignId` above is `item.campaign_id ?? post.campaign_id` — THE
       * ROW'S label wins. That is correct for counting (a row belongs to the
       * run that queued it) and it means this skip can fire on a run the owner
       * is no longer looking at: he resets a round, launches it again, the card
       * reads פעיל because the POST now belongs to a fresh run, and the rows
       * left on the old one are skipped one at a time with a sentence naming no
       * round at all.
       *
       *   "הוא מדלג ורושם הסבב נעצר למרות שלא עשיתי כלום"
       *
       * He was right twice: he had stopped nothing recently, and the round that
       * was stopped is not the round that was running. The two fixes that stop
       * it happening are elsewhere — client.ts ensureRunForPost brings a
       * stopped run's WAITING rows across on relaunch, and worker/revive.ts no
       * longer hands them back for another attempt. This sentence is the third,
       * and the only one that would have let him tell me in one message instead
       * of a day: when the row and the post disagree, SAY SO.
       *
       * No extra read and no extra column: both ids are already in hand.
       */
      const movedOn = Boolean(item.campaign_id && post.campaign_id && item.campaign_id !== post.campaign_id);
      return {
        action: 'skip',
        reason: movedOn
          ? 'הפרסום הזה נשאר משויך לסבב קודם שנעצר — הסבב שרץ עכשיו הוא אחר. השיקו את הפוסט מחדש כדי לצרף אליו את מה שממתין.'
          : 'הסבב נעצר.',
      };
    }

    /*
     * ─── "תזמון פרסום": THE DAYS, THE HOURS AND THE INTERVAL ───────────────
     *
     * "המערכת רשאית לפרסם רק בימים שנבחרו, רק בין 08:00 ל-22:00, ובהפרש של 10
     *  דקות בין פרסום לפרסום."
     *
     * DEFER, NEVER SKIP, and this is the rule the whole feature rests on:
     * "אין לאפס את התור. אין להתחיל את הקמפיין מחדש. יש להמשיך מאותו מקום."
     * A row outside the window keeps its identity, its post, its group and its
     * place; only its instant moves, to the first moment the owner's own
     * settings allow. That is the same shape as the daily-quota branch below,
     * and for the same reason: a window is a RATE, not a verdict on a
     * particular publication.
     *
     * AND IT COSTS NOTHING WHEN IT IS OFF. readSchedule() reports
     * `enabled: false` for every campaign that predates this feature and for
     * every row on a database without the columns, and the branch is not
     * entered at all — no extra query, no change in behaviour.
     */
    const schedule = readSchedule(campaign);
    gate = schedule;
    if (schedule.enabled) {
      /*
       * The campaign's OWN last publication, not the account's. limits.
       * minGapMinutes at the foot of this function is about the Facebook
       * account and looks at every campaign at once; this is about this round,
       * and the two are enforced together — a row waits for whichever is
       * later, which is what holdFor() above is for.
       */
      const own = await db
        .from('social_queue')
        .select('published_at')
        .eq('campaign_id', campaignId)
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      /*
       * A FAILED READ IS NOT "NOTHING HAS PUBLISHED YET".
       *
       * Those two answers arrive in the same variable and mean opposite
       * things. `null` tells nextPublishAt() there is no previous publication,
       * so the campaign's own interval — the "כל X דקות" the owner set — has
       * nothing to measure from and every row is allowed through at once. One
       * dropped connection and a round that was spaced a minute apart goes out
       * in a burst, which is exactly what gets a Facebook account restricted.
       */
      if (own.error) {
        return {
          action: 'wait',
          until: new Date(now.getTime() + WAIT_MINUTES * 60_000).toISOString(),
          reason: 'לא הצלחנו לקרוא מתי הסבב פרסם לאחרונה — ננסה שוב בעוד רגע.',
          attention: true,
        };
      }
      const lastAt = own.data?.published_at ? new Date(own.data.published_at) : null;
      const allowed = nextPublishAt(schedule, now, lastAt);
      if (!allowed) {
        /*
         * No day is selected. Nothing can ever satisfy that, so the row is
         * held a day at a time rather than parked on a far-future instant the
         * owner would have to discover: he changes the setting, and the next
         * poll after that publishes.
         */
        return {
          action: 'defer',
          until: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
          reason: 'לא נבחר אף יום פרסום בתזמון של הקמפיין — הפרסום ממתין',
        };
      }
      const wait = allowed.getTime() - now.getTime();
      if (wait > PREP_LEAD_MS) {
        /*
         * WHICH of the two moved it, in the owner's own words. "נדחה" with no
         * reason is the line this product keeps having to explain; the window
         * and the interval fail in completely different ways and the fix for
         * each is a different control on the panel.
         */
        const byWindow = !isAllowedAt(schedule, now);
        return {
          action: 'defer',
          until: new Date(allowed.getTime() + DEFER_CUSHION_MS).toISOString(),
          reason: byWindow
            ? `מחוץ לשעות הפרסום של הקמפיין (${scheduleSummary(schedule)}) — הפרסום ימתין`
            /* gapLabel rather than a number and a unit: the gap can now be
               thirty seconds, and "נדחה כדי לשמור מרווח של 0.5 דק׳" is a
               sentence nobody should have to read. */
            : `נדחה כדי לשמור מרווח של ${gapLabel(schedule).replace('כל ', '')} בין הפרסומים של הקמפיין`,
        };
      }
      /* Close enough to start: prepare now, click at the instant itself. */
      if (wait > 0) holdFor(allowed);
    }
  }

  /*
   * A FULL DAILY QUOTA IS "NOT TODAY". IT WAS "NEVER", AND THAT WAS WRONG.
   *
   * All three ceilings below used to return {action:'skip'}, which finishes
   * the row: the publication is destroyed, not postponed. Seen on the owner's
   * machine as six identical lines in the activity log inside sixteen minutes
   * — six publications of a 28-group round deleted, one per poll, while the
   * screen said the system was running.
   *
   * It also contradicted the product's own promise: the scheduling screen has
   * always said "מה שלא נכנס היום ממשיך מחר". It did not.
   *
   * A cap the owner sets is a rate, not a verdict on a particular post. So a
   * row that meets one now waits for the day that has room. Nothing else about
   * it changes, it keeps its place, and the ceiling still does its job — it
   * just stops eating the queue to do it.
   */
  const dayStart = startOfZonedDay(now).toISOString();
  /* The next local midnight, rolled to the first minute the campaign may
     actually publish — see insideWindow(). Unrolled, this is the one instant
     in the product that no configurable window contains. */
  const tomorrow = insideWindow(gate, new Date(startOfNextZonedDay(now))).toISOString();

  const todayAll = await countPublished(db, (q) => q.gte('published_at', dayStart));
  if (todayAll >= limits.maxPerDay)
    return { action: 'defer', until: tomorrow, reason: `מכסת הפרסומים להיום (${limits.maxPerDay}) מלאה — הפרסום ימתין למחר` };

  const todayTarget = await countPublished(db, (q) => q.eq('target_id', target.id).gte('published_at', dayStart));
  if (todayTarget >= limits.maxPerTargetPerDay)
    return {
      action: 'defer',
      until: tomorrow,
      reason: `"${target.name}" קיבלה היום את המכסה שלה (${limits.maxPerTargetPerDay}) — הפרסום ימתין למחר`,
    };

  if (campaignId && ctx.browser?.maxPerCampaignPerDay) {
    const todayCampaign = await countPublished(db, (q) => q.eq('campaign_id', campaignId).gte('published_at', dayStart));
    if (todayCampaign >= ctx.browser.maxPerCampaignPerDay)
      return {
        action: 'defer',
        until: tomorrow,
        reason: `הסבב מילא את המכסה היומית שלו (${ctx.browser.maxPerCampaignPerDay}) — הפרסום ימתין למחר`,
      };
  }

  /*
   * Same post already went to this target (any variant) → never twice, unless
   * this round is one the owner has explicitly set to repeat.
   *
   * THE "EVER" RULE IS THE DEFAULT AND STAYS THE DEFAULT. Group publishing runs
   * through the owner's own browser session, so repeating identical content to
   * one group risks THEIR account, not a service's. `!== false` rather than a
   * truthy test, so a settings row written before that key existed keeps the
   * old behaviour instead of silently losing it.
   *
   * CHZARA GIVES THE RULE A CLOCK; IT DOES NOT REMOVE IT.
   *
   * "אמור לצאת כל יום מ-8 בבוקר עד 22 בלילה." A round set to repeat asks for
   * exactly what this line refuses, so the refusal becomes "not again within
   * repeat_min_hours" instead of "not again". That is weaker, and it is still a
   * rule with real work to do: a plan that ran twice, a retry after a failure,
   * two schedules pointed at one post — all of those double-post without it,
   * and all of them have happened.
   *
   * THE RECENCY IS MEASURED, NOT ASSUMED. The count becomes a read of the most
   * recent publication's instant, because "has it ever" and "how long ago" are
   * different questions and only the second one can answer this.
   */
  if (limits.blockRepeatToSameTarget !== false) {
    const seen = await db
      .from('social_queue')
      .select('published_at')
      .eq('status', 'published')
      .eq('post_id', post.id)
      .eq('target_id', target.id)
      .neq('id', item.id)
      .order('published_at', { ascending: false })
      .limit(1);
    /*
     * THE READ THAT STOPS A POST GOING OUT TWICE TO ONE GROUP.
     *
     * It discarded its error, and the row below reads an undefined list as an
     * empty one — "this post has never reached this group". So a single
     * PostgREST hiccup turned the whole no-double-publish rule off for that
     * row, and the post published again to a group that already had it. That
     * is the complaint this engine exists to make impossible, and it was one
     * failed request away the entire time.
     *
     * The unique index social_queue_one_open_per_target_idx does not cover
     * this: it constrains OPEN rows per target, not a second publication of
     * the same post hours later.
     */
    if (seen.error) {
      return {
        action: 'wait',
        until: new Date(now.getTime() + WAIT_MINUTES * 60_000).toISOString(),
        reason: 'לא הצלחנו לבדוק אם הפוסט הזה כבר פורסם לקבוצה — ננסה שוב בעוד רגע.',
        attention: true,
      };
    }
    const previous = seen.data;
    const last = previous?.[0]?.published_at ?? null;
    if (previous && previous.length > 0) {
      if (!repeat.enabled) return { action: 'skip', reason: `הפוסט הזה כבר פורסם ל-"${target.name}".` };
      /*
       * A published row with no instant cannot be dated, and an undatable
       * publication must count as "just now" rather than as "long ago" — the
       * safe reading of a missing value is the one that holds the post back.
       */
      const since = last ? now.getTime() - new Date(last).getTime() : 0;
      const needed = repeat.minHours * 3_600_000;
      if (since < needed) {
        const hours = Math.max(1, Math.ceil((needed - since) / 3_600_000));
        return {
          action: 'defer',
          until: insideWindow(gate, new Date(now.getTime() + needed - since + DEFER_CUSHION_MS)).toISOString(),
          /*
           * DEFERRED, NOT SKIPPED. The round repeats, so this group's turn is
           * coming — dropping the row would quietly shrink every round after
           * the first, and the owner would see a campaign that reached 219
           * groups on Monday and 180 on Tuesday with no reason on any screen.
           */
          reason: `פורסם לקבוצה הזו לאחרונה — החזרה הבאה בעוד כ-${hours} שעות.`,
        };
      }
    }
  }

  /*
   * Same content hash to this target inside the dedupe window (catches copies).
   *
   * AND IT IS THE SAME WINDOW THE REPEAT USES, on a round that repeats.
   *
   * This guard is per-target too — the hash is built from the target, the text
   * and the media — so on a repeating round it asks the question above a second
   * time, with a window of days instead of hours. Left alone it would refuse
   * every repeat for a week and the switch would appear to do nothing at all:
   * the owner turns on "חזרה יומית", tomorrow's round runs, and every single
   * row skips with a sentence about content he deliberately chose to repeat.
   *
   * So on a repeating round the window IS the repeat interval. That is not a
   * loosening beyond what the switch already granted — the rule above has
   * already allowed exactly this publication at exactly this distance — and
   * everything the hash catches that the rule above does not, namely the SAME
   * TEXT sent under a different post, is still caught, just inside hours rather
   * than days.
   */
  if (item.dedupe_hash) {
    const windowMs = repeat.enabled ? repeat.minHours * 3_600_000 : limits.dedupeDays * 86_400_000;
    const since = new Date(now.getTime() - windowMs).toISOString();
    const dupes = await countPublished(db, (q) => q.eq('dedupe_hash', item.dedupe_hash).neq('id', item.id).gte('published_at', since));
    if (dupes > 0) {
      return repeat.enabled
        ? {
            /* Deferred for the same reason the repeat guard defers: this
               group's turn is coming, and a skip would shrink the round. */
            action: 'defer',
            until: insideWindow(gate, new Date(now.getTime() + windowMs + DEFER_CUSHION_MS)).toISOString(),
            reason: `אותו תוכן כבר פורסם ליעד הזה לאחרונה — החזרה הבאה בעוד כ-${repeat.minHours} שעות.`,
          }
        : { action: 'skip', reason: `אותו תוכן כבר פורסם ליעד הזה ב-${limits.dedupeDays} הימים האחרונים.` };
    }
  }

  /*
   * Minimum spacing between any two publications (groups get extra spacing),
   * and — when a pacing pattern is in force — the rest after a run of them.
   *
   * ONE READ SERVES BOTH, and the limit is the only thing the pattern changes
   * about it. The rest needs the newest `burst` instants to tell a run from a
   * stretch that has already been broken; the gap needs the newest of them,
   * which is the same row this read has always returned. With no pattern the
   * limit is 1 and this is byte-for-byte the query it was.
   */
  const pace = paceProfile(limits.pace);
  const recent = await db
    .from('social_queue')
    .select('published_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(pace ? Math.max(1, pace.burst) : 1);
  /*
   * AND THE LAST OF THE FOUR. A failed read leaves `stamps` empty, both
   * blocks below are skipped, and the minimum gap between any two
   * publications — the single setting standing between this product and a
   * restricted Facebook account — is not enforced at all, nor is the rest. No
   * screen would show anything: the post publishes, successfully, too soon.
   */
  if (recent.error) {
    return {
      action: 'wait',
      until: new Date(now.getTime() + WAIT_MINUTES * 60_000).toISOString(),
      reason: 'לא הצלחנו לקרוא מתי בוצע הפרסום האחרון — ננסה שוב בעוד רגע.',
      attention: true,
    };
  }
  /* Newest first, as the order above asks. Parsed once, because both gates
     below want numbers and `new Date(...)` on a string PostgREST has already
     promised is a timestamp is not free when it happens per row per claim. */
  const stamps = (recent.data ?? [])
    .map((r) => Date.parse(String((r as { published_at?: string | null }).published_at ?? '')))
    .filter((t) => Number.isFinite(t));

  /*
   * ─── THE REST AFTER A RUN ────────────────────────────────────────────────
   *
   * Checked BEFORE the gap, and that ordering is the only reason the owner
   * ever sees the right sentence. A rest is longer than the gap in all three
   * patterns, so when both are owed the rest is the later instant and the one
   * that decides; the gap's branch below `return`s on its own, so leaving this
   * second would have deferred the row for the gap, let it come back, and
   * defer it again for the rest — two round trips and a reason about spacing
   * for a row that is resting.
   *
   * paceRestRemainingMs() is the whole rule and it is pure; everything here is
   * the same shape the gap uses underneath — hold if it is close enough to
   * prepare inside, defer if it is not.
   */
  const restMs = paceRestRemainingMs(pace, stamps, now.getTime());
  if (pace && restMs > 0) {
    if (item.attempts > MAX_DEFERRALS) return { action: 'skip', reason: 'הפרסום נכשל שוב ושוב ולכן הופסק.' };
    if (restMs <= PREP_LEAD_MS) {
      /* Raised, not returned — the gap below and the campaign's own interval
         may each want a later instant, and the single return hands over the
         latest of the three. */
      holdFor(new Date(now.getTime() + restMs));
    } else {
      return {
        action: 'defer',
        until: insideWindow(gate, new Date(now.getTime() + restMs + DEFER_CUSHION_MS)).toISOString(),
        reason: `הפסקה אחרי ${pace.burst} פרסומים רצופים — ממשיכים בעוד ${paceRestLabel(restMs)}.`,
      };
    }
  }

  if (stamps.length) {
    const lastAt = stamps[0];
    const gapSeconds = accountGapSeconds(limits, ctx.browser, target.channel === 'facebook_group');
    const gapMs = gapSeconds * 1000;
    const sinceLast = now.getTime() - lastAt;
    if (sinceLast < gapMs) {
      /*
       * The belt, and it is only a belt now.
       *
       * Waiting for the gap no longer spends an attempt — both workers hand
       * it back, exactly as they already did for a parked row — so a row can
       * queue behind a hundred others without being thrown away for its
       * patience. That was the previous behaviour and it was silently
       * destroying publications: with the gap set to a minute and a queue
       * denser than a minute, a row burned forty deferrals in under an hour
       * and became a permanent "דולג" whose stated reason described nothing
       * that had gone wrong. What can still reach this line is a row that is
       * genuinely failing on every claim, which is worth stopping.
       */
      if (item.attempts > MAX_DEFERRALS) return { action: 'skip', reason: 'הפרסום נכשל שוב ושוב ולכן הופסק.' };
      /*
       * Close enough to start: let it through with the instant attached. The
       * caller prepares the post and holds the click — see PREP_LEAD_MS. This
       * is the branch that makes a one-minute gap mean a publication a
       * minute rather than a publication every minute-and-a-publication.
       */
      const wait = gapMs - sinceLast;
      if (wait <= PREP_LEAD_MS) {
        /* Raised rather than returned: the campaign's own interval may already
           have asked for a LATER instant, and the one return below hands over
           whichever of the two is further out. */
        holdFor(new Date(lastAt + gapMs));
      } else {
        const until = insideWindow(gate, new Date(lastAt + gapMs + DEFER_CUSHION_MS)).toISOString();
        return { action: 'defer', until, reason: `נדחה כדי לשמור מרווח של ${accountGapLabel(gapSeconds)} בין פרסומים` };
      }
    }
  }

  return holdUntil ? { action: 'publish', notBefore: (holdUntil as Date).toISOString() } : { action: 'publish' };
}
