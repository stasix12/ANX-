import type { SystemState } from './systemState';
import type { QueueStep } from '@/lib/social/types';

/**
 * ─── WHAT THE ROBOT IS ALLOWED TO BE DOING ────────────────────────────────
 *
 * "האנימציה חייבת להיות מחוברת למצבים האמיתיים של מנוע הפרסום …
 *  אסור להציג פרסום מוצלח לפני שהמערכת אישרה הצלחה. אין ליצור נתוני פרסום
 *  מדומים."
 *
 * So every one of these is the name of a fact that is already in the database
 * or already decided by the dashboard. Not one of them is a timer, a phase of
 * an animation, or a guess:
 *
 *   offline    the PC has not sent a heartbeat and the queue cannot move.
 *   error      the dashboard raised `needs_intervention`: a person is needed
 *              before anything else happens, and the headline above the scene
 *              already says which thing.
 *   paused     the owner switched publishing off.
 *   idle       nothing is queued and nothing is upcoming (`empty`).
 *   waiting    the system is running and no worker is holding a row — which
 *              is most of a day.
 *   preparing  a worker IS holding a row and has reported a stage BEFORE the
 *              final click: opening the group, waiting for the composer,
 *              uploading the media. Nothing has been submitted to Facebook.
 *   sending    that same row has reached the click, or the worker has not
 *              said which stage it is on. Something is being submitted.
 *   done       today's queue has nothing left and nobody is holding anything.
 *
 * THE SIXTH STATE HE NAMED — SUCCESS — IS DELIBERATELY NOT HERE. A success is
 * an EVENT, not a state: it is one publication arriving in one group, and the
 * scene presents it from a rise in the real published count (PublishingStage's
 * `target`/`shown`). A mode called `success` would be a state the scene could
 * sit in, and sitting in it is exactly the invented publication the rule above
 * forbids. See the header of PublishingStage.tsx.
 */
export type SceneMode =
  | 'offline'
  | 'error'
  | 'paused'
  | 'idle'
  | 'waiting'
  | 'preparing'
  | 'sending'
  | 'done';

/**
 * THE STAGES BEFORE THE FINAL CLICK, and the reason the line is drawn exactly
 * here rather than one stage later.
 *
 * `publishing` is the worker pressing Facebook's own publish button and
 * `verifying` is it reading back what happened — from that moment the post may
 * already be live, which is the same line `MAYBE_LIVE_STEP` draws in the
 * engine for deciding what may never be retried. Everything in this set is
 * work the worker is doing in its own browser with nothing submitted yet.
 *
 * A row whose step is EMPTY is not in here, and that is not an oversight: an
 * older worker reports no stage at all, and the row line beside this scene
 * already prints "מפרסם" for it. Two surfaces, one answer.
 */
export const PREPARING_STEPS: readonly QueueStep[] = [
  'pending',
  'opening',
  'composer_opened',
  'uploading_media',
  'ready_to_publish',
];

/**
 * THE LADDER, in the same order as the dashboard's own.
 *
 * page.tsx decides `systemState` first and the headline above this scene is
 * written from it; if the scene asked a different question first the picture
 * and the sentence over it would disagree — a robot throwing posts under
 * "נדרשת התערבות". So the three states that stop everything are read first,
 * then the finished day, and only then what a worker is holding.
 *
 * `workerOnline === undefined` means nobody told us, which is not the same as
 * "the PC is off": it falls to `error`, where the headline names the real
 * blocker, rather than accusing a machine that may well be running.
 */
export function sceneModeFor(facts: {
  systemState: SystemState;
  /** A real heartbeat. Only its ABSENCE may draw the disconnected robot. */
  workerOnline?: boolean;
  /**
   * ─── DOES THIS INTERVENTION ACTUALLY STOP PUBLISHING? ───────────────────
   *
   * REQUIRED, with no default, and that is the point: every caller has to
   * decide, because getting it wrong is what put the orange "stopped" robot
   * over an engine publishing once a minute on 06/11.
   *
   * `needs_intervention` is not one state. page.tsx raises it for five
   * different things, and only some of them stop the engine:
   *
   *   the PC is off while work is queued        STOPS EVERYTHING
   *   a publication is overdue and unclaimed    STOPS EVERYTHING
   *   Chrome is asking for a Facebook login     STOPS EVERYTHING
   *   N rows are parked for a person to move    stops nothing
   *   some rows are paused                      stops only those rows
   *
   * On his account it was the fourth: 173 old rows waiting for his eyes,
   * while publishing ran all afternoon. The headline above the scene is
   * right to name them — they do need him — but the robot is about the
   * machine, and the machine was working.
   */
  publishingBlocked: boolean;
  /** Decided by the panel from today's two figures — never by the scene. */
  dayDone: boolean;
  /** The stage of each row a worker is holding right now. */
  inFlightSteps: readonly (QueueStep | null | undefined)[];
}): SceneMode {
  const { systemState, workerOnline, publishingBlocked, dayDone, inFlightSteps } = facts;
  /* The owner's own switch, first: it explains every other symptom. */
  if (systemState === 'paused') return 'paused';

  /*
   * THEN THE THINGS THAT REALLY DO STOP THE ENGINE, split by whether the
   * missing piece is the machine itself. These outrank a row that still
   * reads "in flight": with no heartbeat such a row is one a dead worker was
   * holding, which sweepStranded() frees on the next pass, and drawing it as
   * work would report motion from a switched-off computer.
   */
  if (publishingBlocked) return workerOnline === false ? 'offline' : 'error';

  /*
   * AND THEN WHAT THE MACHINE IS DOING THIS SECOND.
   *
   * Above an intervention that stops nothing, deliberately. A worker holding
   * a row is a fact about right now; a backlog is a fact about the
   * afternoon. The robot reports the first and the headline reports the
   * second, and neither pretends to be the other.
   */
  if (inFlightSteps.length > 0) {
    /*
     * THE MOST ADVANCED ROW DECIDES. Several lanes publish at once, so a
     * pass can hold one row still opening a group and another at the click.
     * The scene can only be in one state, and the one it must not get wrong
     * is the one where something is being submitted: if ANY row has reached
     * the click, the scene says so.
     */
    const everyRowIsStillPreparing = inFlightSteps.every(
      (step) => step != null && (PREPARING_STEPS as readonly string[]).includes(step),
    );
    return everyRowIsStillPreparing ? 'preparing' : 'sending';
  }

  if (systemState === 'empty') return 'idle';
  if (dayDone) return 'done';
  return 'waiting';
}
