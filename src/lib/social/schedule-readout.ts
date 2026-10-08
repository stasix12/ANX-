import {
  DEFAULT_CAMPAIGN_REPEAT,
  nextAllowedAt,
  nextPublishAt,
  windowClosesAt,
  type CampaignRepeat,
  type CampaignSchedule,
} from './campaign-schedule';
import type { CampaignState } from './campaign';
import { accountGapSeconds } from './rules';

/**
 * WHAT A SCREEN MAY SAY ABOUT WHEN THIS CAMPAIGN PUBLISHES NEXT — one answer,
 * for every card that asks.
 *
 * "הקמפיין פעיל, אמור לצאת כל יום מ-8 בבוקר עד 22 בלילה כל דקה. למה זה מראה לי
 *  שסבב פרסום מתחיל ב-22:00? מה זה כל הבאגים האלה של התזמונים! תעבור על הכל...
 *  ותסדר את הבעית שורש הזאת פעם אחת ולתמיד ובכל הקמפיינים שיש וגם בקמפיינים
 *  העתידים."
 *
 * THE ROOT PROBLEM, STATED PLAINLY. The schedule is a GATE, not a recurrence.
 * `enabled` can only ever PREVENT a publication — every function in
 * campaign-schedule.ts short-circuits to "unconstrained" when it is off, so on
 * is a strict subset of off. And nothing in this product re-queues a round that
 * has finished: queue rows are written only by planQueue(), which reads
 * social_schedules WHERE active = true, and the launch modes the owner uses set
 * active = false the moment they are planned. A completed round stays completed
 * until he opens the next one.
 *
 * Which means a schedule has NOTHING TO SAY about a campaign with an empty
 * queue, and the two cards that print "when next" were both asking it anyway —
 * the dashboard's run card printed the window's closing time in the place a
 * publication time goes ("חלון הפרסום פתוח עד: 22:00" over 219 of 219 handled),
 * and the campaigns list printed "אין פרסום ממתין" over rows that were waiting
 * for a person. Both were the same mistake made separately, which is why fixing
 * one never fixed the other.
 *
 * SO THE DECISION LIVES HERE AND THE CARDS ONLY DRAW IT. The rule it encodes is
 * one sentence: NAME AN INSTANT ONLY WHEN SOMETHING WILL HAPPEN AT IT.
 * Everything else is a state with words and no clock.
 *
 * It computes; it does not render and it does not write. The Hebrew belongs to
 * the cards, which have different room for it.
 */
export type ScheduleReadout =
  /** A publication is queued, and this is when it goes out. The only instant. */
  | { kind: 'due'; at: string }
  /** The switch is on, no day is lit: the queue is held, by design and forever. */
  | { kind: 'no-day' }
  /**
   * The round is over.
   *
   * `repeats` is whether another one is coming on its own — the CHZARA switch.
   * Without it the card would say "אין פרסום מתוזמן" over a round that is in
   * fact due again tomorrow morning, which is the same class of wrong answer
   * as the window edge it replaced, pointing the other way.
   */
  | { kind: 'ended'; stopped: boolean; repeats: boolean }
  /** Rows are waiting — on him, not on the clock. */
  | { kind: 'manual'; waiting: number }
  /** Held by the owner's own pause. No instant: the engine publishes none. */
  | { kind: 'paused' }
  /** Nothing queued and the window is open: until when it would be allowed. */
  | { kind: 'window-open'; until: string }
  /** Nothing queued and the window is shut: when it next opens. */
  | { kind: 'window-next'; opens: string }
  /** Nothing queued and no schedule to describe. */
  | { kind: 'none' }
  /**
   * THE READ WAS CAPPED, SO THE ANSWER IS NOT KNOWN — and saying so is the
   * only honest thing left.
   *
   * campaignStates() caps at CAMPAIGN_ROLLUP_LIMIT rows, ordered by
   * scheduled_at ascending, so what a capped read drops is the FURTHEST-OUT
   * rows — exactly the ones that have not happened yet. client.ts says it in
   * its own words: "a truncated read therefore makes a run look MORE finished
   * than it is". Every state below 'due' is derived from that count, so on a
   * big enough round they are all derived from a lie that leans one way: the
   * card would announce "הסבב הסתיים · אין פרסום מתוזמן" over a round still
   * publishing.
   *
   * A QUEUED ROW SURVIVES IT, which is why 'due' is checked first and this is
   * not: a row we can SEE is a fact, and nothing a cap drops can make it
   * false.
   */
  | { kind: 'partial' };

/**
 * The order below is the whole of this module, and each line is a state that
 * was previously served by a neighbour's words:
 *
 *   0  the read was CAPPED           → nothing below is known (except a row
 *                                     we can see, which is checked above it)
 *   1  the round has ENDED           → no instant exists, whatever else is true
 *   1b the round is PAUSED           → the engine publishes at no instant
 *   2  something IS queued           → the instant the engine will use
 *   3  queued but no day is chosen   → the setting that holds it
 *   4  rows waiting for a person     → they are waiting, and not for the clock
 *   5  window open                   → until when, IF he starts a round
 *   6  window shut                   → when it next opens
 *   7  nothing                       → nothing
 *
 * 1 and 4 outrank 5 and 6 because a window is a constraint on publications that
 * exist. With none left to constrain it is not an answer to "when next" — it is
 * a true statement about an irrelevant thing, printed where the answer goes.
 * And 1 outranks everything, for the reason given at the check itself.
 */
/**
 * THE OTHER GAP — the one the card did not know about.
 *
 * "הפרש בין פוסטים: כל דקה" is the campaign's own setting, and it is not the
 * only floor the engine applies. rules.ts measures a SECOND interval against
 * the most recent publication of the WHOLE ACCOUNT —
 * `limits.minGapMinutes + (group ? browser.groupMinGapMinutes : 0)`, 45 + 20 by
 * default — and holds the row for whichever of the two is later. Nothing in
 * campaign-schedule.ts has ever heard of it.
 *
 * So a card reading "כל דקה · הבא בתור 10:13" could sit over an engine that
 * will not publish before 11:17, which is word for word the failure that
 * module's header says it exists to prevent. And it does not correct itself: a
 * worker whose spacing gate is shut claims nothing at all, so no deferral is
 * written and the wrong minute stays on screen for the whole gap.
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
   * accountGapSeconds() in rules.ts decides which half wins, and this card
   * calls that function rather than repeating the rule.
   */
  minGapSeconds?: number;
  groupMinGapSeconds?: number;
  /** The account's most recent publication. NOT this campaign's. */
  lastPublishedAt: string | null;
}

/**
 * Unknown by default, and unknown means "adds nothing".
 *
 * A caller that cannot supply the account's last publication gets exactly the
 * behaviour this module had before — the campaign's own gap and nothing else.
 * That is the wrong answer in the cases above, but it is the SAME wrong answer
 * every screen has always given, and a default that invented a floor out of
 * nothing would be worse: it would push every card's instant forward by an
 * hour on a database that has simply never published.
 */
const NO_SPACING: AccountSpacing = { minGapMinutes: 0, groupMinGapMinutes: 0, lastPublishedAt: null };

/** The instant the account-wide rule will not let anything publish before. */
function accountFloorMs(spacing: AccountSpacing, channel: string | null): number {
  if (!spacing.lastPublishedAt) return 0;
  /* The group surcharge is applied exactly where rules.ts applies it: on a
     facebook_group target and nowhere else. An unknown channel gets the plain
     floor rather than the larger one — guessing upwards would hold a page's
     publication behind a rule that does not govern it. */
  const seconds = accountGapSeconds(spacing, spacing, channel === 'facebook_group');
  if (!seconds) return 0;
  const last = new Date(spacing.lastPublishedAt).getTime();
  return Number.isNaN(last) ? 0 : last + seconds * 1000;
}

export function scheduleReadout(
  schedule: CampaignSchedule | null | undefined,
  state: Pick<CampaignState, 'state' | 'nextAt' | 'done' | 'progress'> & { truncated?: boolean; nextChannel?: string | null },
  now: Date = new Date(),
  repeat: CampaignRepeat = DEFAULT_CAMPAIGN_REPEAT,
  spacing: AccountSpacing = NO_SPACING,
): ScheduleReadout {
  const on = Boolean(schedule?.enabled);

  /*
   * 1 — THE QUEUED INSTANT, RESOLVED THE WAY THE ENGINE WILL RESOLVE IT.
   *
   * nextPublishAt() is the same call rules.ts makes before it releases a row,
   * so the card and the engine cannot disagree about the hour: gap first, then
   * the window, then the next chosen day. A row whose stored instant has
   * already passed publishes at the next legal moment from NOW, not from the
   * moment it missed — hence the max().
   *
   * WITH THE SWITCH OFF THIS IS THE STORED INSTANT, UNCHANGED, which is what
   * the queue will genuinely do: off means the window is not enforced at all.
   */
  /*
   * THE ENDED CHECK COMES FIRST, AHEAD OF THE QUEUE.
   *
   * campaign.ts calls a run 'completed' exactly when no row is open, so a
   * finished round with a queued publication is not a state this product can
   * build — but "cannot happen" is a claim about today's code, and the order of
   * two branches is a decision about what happens when it is wrong. Only one of
   * the two answers is safe to be wrong with: a card that says "הסבב הסתיים"
   * while a row is in fact pending under-promises, and the row still goes out;
   * a card that promises 10:20 over a spent queue is the fault this module was
   * written to end. So the rule that cannot be bent — never promise a
   * publication that will not happen — decides the order.
   */
  /*
   * `!state.truncated` IS PART OF THIS CONDITION, not a separate check above
   * it, and the difference matters: a capped read must disable the ENDED claim
   * without also disabling the ones that are still true. Written as an early
   * return it also swallowed 'due' and 'paused', which survive a cap — a row
   * we can see is a fact, and so is the owner's own pause.
   */
  if (!state.truncated && (state.state === 'completed' || state.state === 'stopped')) {
    /*
     * A ROUND HE STOPPED DOES NOT REPEAT, whatever the switch says. Stopping is
     * the owner saying "not this", and a card that answered "it will run again
     * tomorrow" would be the screen overruling him — the one thing worse than
     * the window edge this module was written to remove.
     */
    return { kind: 'ended', stopped: state.state === 'stopped', repeats: repeat.enabled && state.state === 'completed' };
  }

  /*
   * A PAUSED ROUND PUBLISHES AT NO INSTANT AT ALL, and the row's own stamp is
   * the most convincing wrong answer on this card.
   *
   * rules.ts:185 returns `wait` for every row of a paused campaign and pushes
   * it forward again on each poll, so the stored instant is not when it goes
   * out — nothing goes out until he presses resume. The strip printing it was
   * a countdown to a moment that would arrive and pass with the queue
   * untouched, which is the same fault as the 22:00 and harder to notice,
   * because the time it shows is real and merely never happens.
   */
  if (state.state === 'paused') return { kind: 'paused' };

  if (state.nextAt) {
    /*
     * BOTH FLOORS, COMPOSED THE WAY THE ENGINE COMPOSES THEM: the account-wide
     * rule says "not before X", the stored instant says "not before Y", and the
     * window then answers "the first legal moment at or after the later of the
     * two". Folding the account floor into `from` rather than taking a max
     * afterwards is what makes the window apply to it — an instant pushed past
     * 22:00 by the account gap has to roll to the next chosen day, exactly as
     * it would for any other reason.
     */
    const base = Math.max(new Date(state.nextAt).getTime(), accountFloorMs(spacing, state.nextChannel ?? null));
    if (!on || !schedule) return { kind: 'due', at: new Date(base).toISOString() };
    const lastPublishedAt = state.done.find((r) => r.published_at)?.published_at ?? null;
    const from = new Date(Math.max(base, now.getTime()));
    const at = nextPublishAt(schedule, from, lastPublishedAt ? new Date(lastPublishedAt) : null, undefined);
    /* 2 — null here means one thing only: no day is selected, so the row is
           held indefinitely. The stored instant may NOT be printed over it. */
    return at ? { kind: 'due', at: at.toISOString() } : { kind: 'no-day' };
  }

  /*
   * AND HERE IS WHERE A CAPPED READ RUNS OUT OF THINGS IT KNOWS. Everything
   * below rests on the row count — how many are waiting, whether any are — and
   * a cap drops the furthest-out rows, so that count always errs towards
   * "finished". The card is told it cannot answer rather than handed an answer
   * that leans one way.
   */
  if (state.truncated) return { kind: 'partial' };

  if (state.progress.manual > 0) return { kind: 'manual', waiting: state.progress.manual };

  if (on && schedule) {
    /* 5 — inside the window, the useful edge is the one still ahead of him. */
    const until = windowClosesAt(schedule, now);
    if (until) return { kind: 'window-open', until: until.toISOString() };
    /* 6 — outside it, when it next opens. Null only when no day is chosen. */
    const opens = nextAllowedAt(schedule, now);
    if (opens) return { kind: 'window-next', opens: opens.toISOString() };
  }
  return { kind: 'none' };
}
