import { nextAllowedAt, nextPublishAt, windowClosesAt, type CampaignSchedule } from './campaign-schedule';
import type { CampaignState } from './campaign';

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
  /** The round is over. Nothing is coming until he opens another one. */
  | { kind: 'ended'; stopped: boolean }
  /** Rows are waiting — on him, not on the clock. */
  | { kind: 'manual'; waiting: number }
  /** Nothing queued and the window is open: until when it would be allowed. */
  | { kind: 'window-open'; until: string }
  /** Nothing queued and the window is shut: when it next opens. */
  | { kind: 'window-next'; opens: string }
  /** Nothing queued and no schedule to describe. */
  | { kind: 'none' };

/**
 * The order below is the whole of this module, and each line is a state that
 * was previously served by a neighbour's words:
 *
 *   1  the round has ENDED           → no instant exists, whatever else is true
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
export function scheduleReadout(
  schedule: CampaignSchedule | null | undefined,
  state: Pick<CampaignState, 'state' | 'nextAt' | 'done' | 'progress'>,
  now: Date = new Date(),
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
  if (state.state === 'completed' || state.state === 'stopped') {
    return { kind: 'ended', stopped: state.state === 'stopped' };
  }

  if (state.nextAt) {
    if (!on || !schedule) return { kind: 'due', at: state.nextAt };
    const lastPublishedAt = state.done.find((r) => r.published_at)?.published_at ?? null;
    const from = new Date(Math.max(new Date(state.nextAt).getTime(), now.getTime()));
    const at = nextPublishAt(schedule, from, lastPublishedAt ? new Date(lastPublishedAt) : null, undefined);
    /* 2 — null here means one thing only: no day is selected, so the row is
           held indefinitely. The stored instant may NOT be printed over it. */
    return at ? { kind: 'due', at: at.toISOString() } : { kind: 'no-day' };
  }

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
