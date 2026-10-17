import {
  DEFAULT_CAMPAIGN_REPEAT,
  nextAllowedAt,
  windowClosesAt,
  type CampaignRepeat,
  type CampaignSchedule,
} from './campaign-schedule';
import type { CampaignState } from './campaign';
import { NO_SPACING, projectOne, type AccountSpacing } from './projection';

/**
 * THE ACCOUNT-WIDE GAP, RE-EXPORTED FROM WHERE IT NOW LIVES.
 *
 * It was declared here while the campaign card was its only reader. The
 * dashboard's queue list and respaceQueue() read it too now, so the type and
 * the arithmetic moved to ./projection — the module all of them share — and
 * this line keeps every existing `import { type AccountSpacing } from
 * '@/lib/social/schedule-readout'` working untouched.
 */
export type { AccountSpacing };

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
  | {
      kind: 'ended';
      stopped: boolean;
      repeats: boolean;
      /**
       * WHEN THE REPEAT WILL OPEN THE NEXT ROUND — the first instant this
       * schedule permits from now.
       *
       * "למה הוא לא מראה מתי אמור לצאת הפרסום הבא": a finished round with the
       * daily repeat armed was told only THAT another round was coming, never
       * when. The hour is not a promise about a queued row — there is none —
       * it is the first minute the window allows, which is the earliest the
       * repeat can act. The card labels it as the publishing day rather than
       * as a publication.
       *
       * Null when the repeat is off, when the round was stopped by hand, when
       * the window is off, or when no day is chosen — every state in which no
       * such minute exists.
       */
      opens: string | null;
    }
  /** Rows are waiting — on him, not on the clock. */
  | { kind: 'manual'; waiting: number }
  /**
   * Held by the owner's own pause.
   *
   * `at` is the minute the head row is PLANNED for, and it is not a promise:
   * rules.ts hands every row of a paused round straight back on each poll, so
   * that minute arrives and passes with the queue untouched. The card labels
   * it as planned and draws no countdown over it — "אם הקמפיין מושהה, יש
   * להציג את המועד המתוכנן לצד סטטוס מושהה, בלי להציג אותו כפרסום שעומד
   * להתבצע."
   *
   * Null when nothing is queued at all, which is a paused round with an empty
   * queue — there is no planned minute to name.
   */
  | { kind: 'paused'; at: string | null }
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
 * default — and holds the row for whichever of the two is later.
 *
 * So a card reading "כל דקה · הבא בתור 10:13" could sit over an engine that
 * will not publish before 11:17, which is word for word the failure
 * campaign-schedule.ts says it exists to prevent. And it does not correct
 * itself: a worker whose spacing gate is shut claims nothing at all, so no
 * deferral is written and the wrong minute stays on screen for the whole gap.
 *
 * The composition of that floor with the stored instant, the campaign's gap
 * and the window is projectOne() in ./projection — the one copy of it, shared
 * with the dashboard's queue list, which used to render the raw column and
 * therefore disagreed with this card about every row. See that file's header.
 */

export function scheduleReadout(
  schedule: CampaignSchedule | null | undefined,
  state: Pick<CampaignState, 'state' | 'nextAt' | 'done' | 'progress'> & {
    truncated?: boolean;
    nextChannel?: string | null;
    /** The round's own most recent publication — see projectedAt. */
    lastPublishedAt?: string | null;
  },
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
   * THE ENDED CHECK COMES FIRST, AHEAD OF THE QUEUE — EXCEPT OVER A ROW WE
   * CAN SEE.
   *
   * campaign.ts called a run 'completed' exactly when no row was open, so a
   * finished round with a queued publication was not a state this product
   * could build, and the order of these two branches only ever decided what
   * happened if that claim was wrong. It is wrong now, and deliberately: a
   * REPEATING round is counted for today (CampaignState.todayOnly), so a
   * Saturday with nothing scheduled gives it an empty today — 'completed' for
   * today — while 209 rows sit in the queue for Sunday morning. `nextAt` reads
   * the open ROWS, which carry no date filter, so it is the one value here
   * that can see them.
   *
   * A ROW WE CAN SEE IS A FACT, and the same sentence already decides the
   * truncation branch below. "הסבב הסתיים" over a queue with rows in it is not
   * the safe under-promise it was when the state could not occur — it is the
   * card telling him the round is over on the evening before it publishes two
   * hundred times.
   *
   * 'stopped' KEEPS THE OLD ORDER AND MUST. Stopping is him saying "not this",
   * and rules.ts hands every row of a stopped round straight back — so its
   * queued rows are real rows that will not go out, which is exactly the case
   * where naming their instant would be a promise the engine will not keep.
   */
  /*
   * `!state.truncated` IS PART OF THIS CONDITION, not a separate check above
   * it, and the difference matters: a capped read must disable the ENDED claim
   * without also disabling the ones that are still true. Written as an early
   * return it also swallowed 'due' and 'paused', which survive a cap — a row
   * we can see is a fact, and so is the owner's own pause.
   */
  if (!state.truncated && (state.state === 'stopped' || (state.state === 'completed' && !state.nextAt))) {
    /*
     * A ROUND HE STOPPED DOES NOT REPEAT, whatever the switch says. Stopping is
     * the owner saying "not this", and a card that answered "it will run again
     * tomorrow" would be the screen overruling him — the one thing worse than
     * the window edge this module was written to remove.
     */
    const stopped = state.state === 'stopped';
    const repeats = repeat.enabled && !stopped;
    return {
      kind: 'ended',
      stopped,
      repeats,
      /* nextAllowedAt(), the same call the engine makes — never a second rule.
         Only for a round that is actually coming back: naming an hour for a
         round nothing will reopen is the window-edge fault this module exists
         to prevent, one state along. */
      opens: repeats && on && schedule ? nextAllowedAt(schedule, now)?.toISOString() ?? null : null,
    };
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
  if (state.state === 'paused') {
    /*
     * THE PLANNED MINUTE, RESOLVED THE SAME WAY A LIVE ONE IS.
     *
     * Through projectOne, not off the raw column: the brief asks for "המועד
     * המתוכנן", and the stored stamp is not it — it is the stamp before the
     * window, the campaign's gap and the account floor have had their say. A
     * paused card showing 23:40 beside a resumed card showing 08:00 for the
     * same row would be the two states of one screen disagreeing.
     */
    return { kind: 'paused', at: (state.nextAt ? projectedAt(state, schedule, on, spacing, now) : null)?.toISOString() ?? null };
  }

  if (state.nextAt) {
    const at = projectedAt(state, schedule, on, spacing, now);
    return at ? { kind: 'due', at: at.toISOString() } : { kind: 'no-day' };
  }


  /*
   * AND HERE IS WHERE A CAPPED READ RUNS OUT OF THINGS IT KNOWS. Everything
   * below rests on the row count — how many are waiting, whether any are — and
   * a cap drops the furthest-out rows, so that count always errs towards
   * "finished". The card is told it cannot answer rather than handed an answer
   * that leans one way.
   */
  /*
   * A ROW WAITING ON A PERSON SURVIVES A CAP, exactly as a queued row does,
   * and for the same reason: p.manual is a count of rows we can SEE. A cap can
   * only ever make it SMALLER, and "at least one publication is waiting for
   * you" is safe to under-promise — whereas 'partial' here printed "לא ניתן
   * לחשב כאן" over a round whose one actionable fact was known, which is the
   * disclaimer eating the answer instead of qualifying it.
   */
  if (state.progress.manual > 0) return { kind: 'manual', waiting: state.progress.manual };

  if (state.truncated) return { kind: 'partial' };

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

/**
 * THE QUEUED INSTANT, RESOLVED THE WAY THE ENGINE WILL RESOLVE IT — the one
 * copy of that call, now that two branches above need it.
 *
 * ALL FOUR GATES, FROM THE ONE PLACE THAT COMPOSES THEM. This card and the
 * dashboard's "הפרסומים הקרובים" list are two readers of the same queue, and
 * they disagreed about every row in it: this one asked the schedule and the
 * list rendered `scheduled_at` straight out of the column. projectOne() is the
 * only copy of the composition — stored instant, account floor, campaign gap,
 * then the window — so the two cannot drift again. See ./projection.
 *
 * NULL MEANS ONE THING ONLY: no day is selected, so the row is held
 * indefinitely and the stored instant may NOT be printed over it.
 */
function projectedAt(
  state: Pick<CampaignState, 'nextAt' | 'done'> & { nextChannel?: string | null; lastPublishedAt?: string | null },
  schedule: CampaignSchedule | null | undefined,
  on: boolean,
  spacing: AccountSpacing,
  now: Date,
): Date | null {
  return projectOne({
    scheduledAt: state.nextAt as string,
    channel: state.nextChannel ?? null,
    gate: {
      schedule: on ? schedule : null,
      /*
       * THIS campaign's own last publication — what its own gap is measured
       * from. `spacing.lastPublishedAt` is the ACCOUNT's and is a different
       * number; handing one where the other belongs is how a card ends up
       * waiting out another campaign's interval.
       *
       * `state.lastPublishedAt` FIRST, AND `done` ONLY AS A FALLBACK. The
       * dashboard builds the queue list's gates from `state.lastPublishedAt`
       * — the v27 view's own lifetime max() — while this read `done`, which
       * is a capped, TODAY-SCOPED preview. For a row stamped yesterday and
       * published today the two disagree, and then the card and the
       * "ממתינים" list promise two different minutes for one row: exactly
       * the fault "אסור שהתקלה הזאת תחזור" names. `done` survives as the
       * answer for a caller whose state predates the view (the two test
       * harnesses, and a database that has not run social-latest.sql).
       */
      lastPublishedAt: state.lastPublishedAt ?? state.done.find((r) => r.published_at)?.published_at ?? null,
    },
    spacing,
    now,
  });
}
