import type { JoinOutcome, JoinStage } from './types';

/* Re-exported so a reader of this file does not have to go looking: the type
   lives in types.ts because worker/facebook/join.ts emits it. */
export type { JoinStage };

/**
 * ─── WHERE A JOIN RUN IS, TURNED INTO SOMETHING A SCREEN CAN DRAW ─────────
 *
 * "אני תמיד רוצה שיהיה איזה שהוא אינדיקטור שאני ידע את ההתקדמות שלו ולא
 *  שהוא נתקע."
 *
 * The discovery screen used to press "הצטרף ל-N" and then show one spinner,
 * inside one button, for up to thirty minutes — while the worker opened group
 * after group on his PC with a minute or two of deliberate silence between
 * each one. Nothing on the screen could tell a run that was pacing itself
 * from a run that had died.
 *
 * EVERYTHING HERE IS A PURE FUNCTION OF WHAT THE WORKER REALLY REPORTED.
 * There is no clock in this file and no interpolation: a step is drawn as
 * reached because an event said so, and the bar's percentage comes from the
 * step index, never from how long something has been running. The owner's own
 * rule — "אין להמציא אחוזים לפי זמן שעבר".
 */

/**
 * What the worker overwrites onto social_worker_commands.progress as it goes.
 *
 * ONE ROW, OVERWRITTEN — not a history. The screen polls that row anyway, so
 * this costs no new request. The history it does NOT keep is kept better
 * elsewhere: every finished group leaves a `group_join` row in the activity
 * log, written by the worker since long before this feature, and that is what
 * survives a refresh and a database that never ran the migration.
 */
export interface JoinProgress {
  /** Bumped if the shape ever changes; a reader that does not know it draws nothing. */
  v: number;
  /** How many addresses the run was given. The denominator of "N מתוך M". */
  total: number;
  /** How many have finished — counted, never estimated. */
  done: number;
  joined: number;
  pending: number;
  /** The group being worked on right now: its place in the run, and its address. */
  index: number;
  url: string;
  /** Where inside that group we are. 'done' once its outcome is known. */
  stage: JoinStage | 'done' | null;
  /**
   * Whether the join button was actually PRESSED for this group.
   *
   * This cannot be derived from the outcome, and that is not a detail:
   * `pending` is returned from TWO places in joinOneGroup — once at line 167,
   * before anything is pressed, because a request was already waiting from
   * some earlier day, and once after the click. Drawing "שולח בקשת הצטרפות"
   * as done for the first of those would be the screen inventing an action
   * the machine never took.
   */
  clicked: boolean;
  /** The outcome of the group named by `url`, once it has one. */
  outcome: JoinOutcome | '';
  /**
   * When the deliberate pause between groups ends, as a real instant the
   * worker handed over.
   *
   * THE PAUSE IS NOT A STAGE. It happens after the answer has arrived, and it
   * exists to keep Facebook from blocking the account — a minute or two in
   * which the correct thing to say is "waiting before the next group", not
   * "waiting for an answer". It is most of the wall clock of a run, so
   * painting a stage across it would be the largest lie this screen could
   * tell.
   */
  gapUntil: string | null;
  at: string;
  startedAt: string;
}

/** The four steps, in the order a group passes through them. */
export const JOIN_STEPS = ['מאתר את הקבוצה', 'שולח בקשת הצטרפות', 'ממתין לתשובה', 'סיום'] as const;

export type JoinStepState = 'done' | 'current' | 'skipped' | 'todo';

/** How a finished group's last step is coloured, and what it says. */
export interface JoinEnding {
  tone: 'good' | 'warn' | 'bad';
  said: string;
}

/**
 * The sentence and the colour for each way a group can end.
 *
 * `joined` and `already` are the only two that are a membership — which is
 * the same line recordJoinOutcome draws in the worker, and the same line
 * that decides whether the group's row is raised to 'member'. `pending` is
 * amber and not green on purpose: a request waiting for an admin is not a
 * group he can publish to, and a green tick there is exactly the "הצלחה לפני
 * קבלת אישור אמיתי" the brief forbids.
 */
export const JOIN_ENDING: Record<JoinOutcome, JoinEnding> = {
  joined: { tone: 'good', said: 'הצטרפנו לקבוצה' },
  already: { tone: 'good', said: 'כבר היית חבר בקבוצה' },
  pending: { tone: 'warn', said: 'נשלחה בקשה — ממתינה לאישור מנהל' },
  questions: { tone: 'warn', said: 'הקבוצה שואלת שאלות — צריך לענות ידנית' },
  'no-button': { tone: 'bad', said: 'לא נמצא כפתור הצטרפות' },
  blocked: { tone: 'bad', said: 'פייסבוק הגביל את ההצטרפויות — עצרנו' },
  unavailable: { tone: 'bad', said: 'הקבוצה לא נפתחה' },
};

const ORDER: (JoinStage | 'done')[] = ['locating', 'sent', 'waiting', 'done'];

/**
 * The state of each of the four steps for the group being worked on now.
 *
 * TWO THIRDS OF REAL GROUPS NEVER REACH STEPS 2 AND 3, and that is measured,
 * not feared: of the 88 join outcomes in this owner's own history, 46 were
 * 'no-button' and 14 were 'already' — both of which return from joinOneGroup
 * BEFORE anything is pressed. A stepper that walked 1→2→3→4 for every card
 * would be animating a story that did not happen to most of them. So a step
 * the run provably skipped is drawn as SKIPPED, distinct from one it has not
 * reached yet.
 */
export function joinStepStates(stage: JoinProgress['stage'], clicked: boolean): JoinStepState[] {
  if (!stage) return ['todo', 'todo', 'todo', 'todo'];
  const at = ORDER.indexOf(stage);
  return ORDER.map((_, i) => {
    if (i === at) return 'current';
    if (i < at) {
      /* Steps 2 and 3 are only "done" if the button was really pressed. When
         it was not, the group jumped straight from "מאתר" to its outcome. */
      if ((i === 1 || i === 2) && !clicked) return 'skipped';
      return 'done';
    }
    return 'todo';
  });
}

/**
 * How full the bar is for the group being worked on now.
 *
 * FROM THE STEP, NOT FROM A CLOCK. Four steps, so each is worth a quarter,
 * and a group that skipped the middle two still reads 100% when it ends —
 * because it IS finished, it simply had less to do.
 */
export function joinPercent(stage: JoinProgress['stage']): number {
  if (!stage) return 0;
  return (ORDER.indexOf(stage) + 1) * 25;
}

/** "2 מתוך 6 טופלו", or just the count when the run's size is not known. */
export function joinRunLine(done: number, total: number | null): string {
  return total && total > 0 ? `${done} מתוך ${total} טופלו` : `${done} טופלו`;
}

/**
 * How full the RUN's bar is — by groups handled, never by elapsed time.
 *
 * Returns null when the denominator is not known, and a null bar is drawn as
 * no bar at all. The denominator really can be missing: the worker empties a
 * command's `payload` in the same statement that claims it (so that a login
 * command cannot leave a password sitting in a row), which means the list of
 * addresses the run was given is not in the database at all. It comes from
 * the progress blob when the migration has been run, and otherwise from what
 * this browser itself remembers sending.
 */
export function joinRunPercent(done: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

/**
 * Whether a progress blob is worth drawing at all.
 *
 * A row from a version that wrote a different shape, or a blob left behind by
 * a run that ended, must draw nothing rather than something stale. `running`
 * is the command's own status — and note that it is NOT liveness: two login
 * commands in this database have been 'running' since September and nothing
 * sweeps them. So the blob's own clock has to be fresh too.
 */
export function joinProgressUsable(p: JoinProgress | null, now: number, maxAgeMs = 15 * 60_000): boolean {
  if (!p || p.v !== 1) return false;
  const at = Date.parse(p.at ?? '');
  if (!Number.isFinite(at)) return false;
  return now - at < maxAgeMs;
}

/** Everything the active group's card needs, and nothing it has to work out. */
export interface JoinCardView {
  steps: JoinStepState[];
  percent: number;
  /** The sentence under the steps once this group has ended; '' while live. */
  said: string;
  /** The last node's colour once it has ended; null while live. */
  tone: 'good' | 'warn' | 'bad' | null;
}

/**
 * The active card, composed from the one thing the worker reported.
 *
 * Deliberately total and deliberately dumb: no clock, no guessing, and no
 * branch that invents a state the blob did not describe. The component that
 * draws it has no logic of its own, so what the screen says and what this
 * function returns cannot drift apart.
 */
export function joinCardView(p: JoinProgress): JoinCardView {
  const steps = joinStepStates(p.stage, p.clicked);
  const ending = p.stage === 'done' && p.outcome ? JOIN_ENDING[p.outcome as JoinOutcome] : null;
  return {
    steps,
    percent: joinPercent(p.stage),
    said: ending?.said ?? '',
    tone: ending?.tone ?? null,
  };
}
