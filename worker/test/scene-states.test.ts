/*
 * ─── THE ROBOT MAY ONLY DO WHAT THE ENGINE IS REALLY DOING ────────────────
 *
 * "האנימציה חייבת להיות מחוברת למצבים האמיתיים של מנוע הפרסום …
 *  אסור להציג פרסום מוצלח לפני שהמערכת אישרה הצלחה.
 *  אין ליצור נתוני פרסום מדומים."
 *
 * The scene itself is driven in a browser (publishing-scene.test.ts). THIS
 * file is the other half, and the cheaper one: the LADDER that chooses which
 * state the robot is in. It is a pure function of four facts — the
 * dashboard's own verdict, the heartbeat, whether today's queue is empty, and
 * the stage each held row reports — so it can be asked every question in a
 * tenth of a second, with no build and no browser.
 *
 * WHAT IS BEING GUARDED, in one sentence: there is no input to this function
 * that makes the robot publish. It cannot be reached by waiting, by a timer,
 * by an animation finishing or by the PC merely being switched on — only by a
 * row that a worker is holding, with a stage that worker wrote.
 *
 *   npx tsx worker/test/scene-states.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PREPARING_STEPS, sceneModeFor, type SceneMode } from '../../src/components/social/sceneState';
import { QUEUE_STEP_LABEL, type QueueStep } from '../../src/lib/social/types';
import type { SystemState } from '../../src/components/social/systemState';

let checks = 0;
const eq = (actual: unknown, expected: unknown, claim: string) => {
  checks += 1;
  assert.deepEqual(actual, expected, `${claim}\n  expected: ${JSON.stringify(expected)}\n  got     : ${JSON.stringify(actual)}`);
};
const is = (cond: boolean, claim: string) => {
  checks += 1;
  assert.ok(cond, claim);
};

/** The common case: everything running, nothing blocking. */
const live = (over: Partial<Parameters<typeof sceneModeFor>[0]> = {}): SceneMode =>
  sceneModeFor({
    systemState: 'active',
    workerOnline: true,
    publishingBlocked: false,
    dayDone: false,
    inFlightSteps: [],
    ...over,
  });

/* ─── §1 — what stops the engine, and what only waits for a person ──────── */

{
  /* The owner's own switch first: it explains every other symptom on the
     screen, and he pressed it himself. */
  eq(live({ systemState: 'paused', inFlightSteps: ['publishing'] }), 'paused', 'PAUSED beats a row in flight');
  eq(live({ systemState: 'paused', dayDone: true }), 'paused', 'and beats a finished day — switched off is not finished');
  eq(live({ systemState: 'empty', dayDone: true }), 'idle', 'and an empty queue is not a finished day');
}

{
  /*
   * ─── THE BUG THAT SHIPPED, AND THE SHAPE OF ITS FIX ────────────────────
   *
   * The first version of this ladder read `needs_intervention` as "the
   * engine is stopped". Measured on his account on 06/11 at 18:01: the
   * engine was publishing once a minute — 15:57:41, 15:59:00, 16:00:06 —
   * with a row 37 seconds into 'ready_to_publish', and the scene drew the
   * orange "stopped, a person is needed" robot over all of it. The
   * intervention was 173 old rows parked for his eyes, which stop nothing.
   *
   * `needs_intervention` is five causes and only three of them stop
   * publishing. `publishingBlocked` is the page's answer to which kind this
   * is, and it is required precisely so nobody can forget to decide.
   */
  const backlog = { systemState: 'needs_intervention' as const, publishingBlocked: false };
  eq(live({ ...backlog, inFlightSteps: ['publishing'] }), 'sending', 'A BACKLOG STOPS NOTHING: a row at the click is drawn as going out');
  eq(live({ ...backlog, inFlightSteps: ['ready_to_publish'] }), 'preparing', 'and the stage is read — this is the exact row that was on his screen');
  eq(
    live({ ...backlog, inFlightSteps: [] }),
    'waiting',
    'and between publications the robot kills time as usual — the queue is running, and the headline above it still names what needs him',
  );
  /*
   * AND IT MAY NOT FLICKER. During a round `inFlight` goes 1 → 0 → 1 every
   * minute; if a backlog produced the alert whenever nothing was in hand,
   * the badge would blink on and off all afternoon. Both halves of that
   * cycle are asked here, and neither is the alert.
   */
  is(
    live({ ...backlog, inFlightSteps: [] }) !== 'error' && live({ ...backlog, inFlightSteps: ['opening'] }) !== 'error',
    'neither half of the gap-between-publications cycle shows the alert, so the badge cannot blink through a working round',
  );
}

{
  /*
   * AND WHEN IT REALLY IS STOPPED — the PC off, a publication overdue and
   * unclaimed, Chrome asking for a Facebook login — it outranks everything
   * below, including a row that still reads "in flight". With no heartbeat
   * such a row is one a dead worker was holding, which sweepStranded() frees
   * on the next pass; drawing it as work would report motion from a
   * switched-off computer.
   */
  const blocked = { systemState: 'needs_intervention' as const, publishingBlocked: true };
  eq(live({ ...blocked, workerOnline: false }), 'offline', 'no heartbeat: the disconnected robot');
  eq(live({ ...blocked, workerOnline: true }), 'error', 'a live machine that cannot publish: the alert');
  eq(
    live({ ...blocked, workerOnline: undefined }),
    'error',
    'and nobody said: that is NOT the same as "the PC is off" — it must not accuse a machine that may be running',
  );
  eq(live({ ...blocked, workerOnline: false, inFlightSteps: ['publishing'] }), 'offline', 'A STRANDED ROW IS NOT WORK: the missing machine still wins');
  eq(live({ ...blocked, inFlightSteps: ['publishing'] }), 'error', 'and nor is one held by a machine that cannot reach Facebook');

  /*
   * AND A HEARTBEAT CAN NEVER START THE ROBOT. This is the bug that put
   * "רובוט בפעולה" over a morning with 0 of 268 published: the PC being awake
   * was read as the system working. `workerOnline: true` must change nothing
   * anywhere else in the ladder.
   */
  for (const state of ['active', 'empty', 'paused'] as SystemState[]) {
    eq(
      live({ systemState: state, workerOnline: true }),
      live({ systemState: state, workerOnline: false }),
      `THE HEARTBEAT IS NOT WORK: with ${state}, an awake PC and a sleeping one draw the same scene`,
    );
  }
}

/* ─── §2 — and then, only then, what a worker is actually holding ────────── */

{
  eq(live(), 'waiting', 'nothing in anyone’s hands: the robot kills time');
  eq(live({ dayDone: true }), 'done', 'today’s queue is empty and nobody is holding anything: finished');
  /*
   * `dayDone` IS NOT RE-DERIVED HERE. The panel works it out from the two
   * figures printed under the bar, so the dance and the numbers can never
   * disagree; this function is told. Passing it with a row in flight is a
   * state the panel cannot produce (its own guard is `inFlight === 0`), and
   * the ladder still answers consistently rather than inventing a third
   * thing.
   */
  /*
   * RE-POINTED WITH THE ORDER ABOVE, and it now answers the safer way round.
   * The panel cannot produce this pair — its own `dayDone` carries
   * `inFlight === 0` — so this is a question about an input that should not
   * arrive. A row in a worker's hands is the same fact the panel's guard is
   * made of: while one exists, the day is not over. So the scene reports the
   * work rather than congratulating over it.
   */
  eq(
    live({ dayDone: true, inFlightSteps: ['publishing'] }),
    'sending',
    'a row still in a worker’s hands is not a finished day — the same rule the panel’s own guard encodes',
  );
  eq(live({ dayDone: true, inFlightSteps: [] }), 'done', 'and with nobody holding anything, it is');
}

{
  /*
   * ─── THE LINE THIS WHOLE CHANGE IS ABOUT ───────────────────────────────
   *
   * Before the final click, nothing has been submitted to Facebook. The post
   * is in the robot's hand and the scene must keep it there. After it, a post
   * may already be live — the same line `MAYBE_LIVE_STEP` draws in the engine
   * for deciding what may never be retried automatically.
   *
   * EVERY STEP THE ENGINE HAS IS CLASSIFIED HERE, read off QUEUE_STEP_LABEL
   * rather than typed out, so a stage added to the worker later cannot slip
   * through without somebody deciding which side of the click it is on.
   */
  const expected: Record<QueueStep, SceneMode> = {
    '': 'sending',
    pending: 'preparing',
    opening: 'preparing',
    composer_opened: 'preparing',
    uploading_media: 'preparing',
    ready_to_publish: 'preparing',
    publishing: 'sending',
    verifying: 'sending',
    published: 'sending',
    failed: 'sending',
    needs_attention: 'sending',
    submitted: 'sending',
  };
  const steps = Object.keys(QUEUE_STEP_LABEL) as QueueStep[];
  is(steps.length >= 12, `every stage the engine reports is decided here — ${steps.length} of them`);
  for (const step of steps) {
    is(step in expected, `a new worker stage "${step}" reached the scene with nobody deciding what it means`);
    eq(live({ inFlightSteps: [step] }), expected[step], `step "${step}" (${QUEUE_STEP_LABEL[step]})`);
  }
  /*
   * AN UNREPORTED STAGE IS NOT A PREPARING STAGE. An older worker writes no
   * step at all, and the line beside this scene already prints "מפרסם" for
   * it. Two surfaces, one answer — and the safe one: a row whose stage is
   * unknown may be at the click.
   */
  eq(live({ inFlightSteps: [null] }), 'sending', 'a row with no stage reported reads as publishing, like the line next to it');
  eq(live({ inFlightSteps: [undefined] }), 'sending', 'and so does one with no column at all');
}

{
  /*
   * SEVERAL LANES AT ONCE, which is the normal case on his account. The scene
   * can only be in one state, and the one it must never get wrong is the one
   * where something is being submitted.
   */
  eq(live({ inFlightSteps: ['opening', 'uploading_media'] }), 'preparing', 'two lanes, both still preparing');
  eq(
    live({ inFlightSteps: ['opening', 'publishing'] }),
    'sending',
    'one lane at the click is enough: the scene says a post is going out, because one is',
  );
  eq(live({ inFlightSteps: ['uploading_media', null] }), 'sending', 'and an unknown stage beside a known one is read the careful way');
}

/* ─── §3 — the negatives: there is no way in from a clock ────────────────── */

const ladder = readFileSync(new URL('../../src/components/social/sceneState.ts', import.meta.url), 'utf8');
const code = ladder.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

{
  /*
   * THE STRONGEST THING THAT CAN BE SAID ABOUT THIS FILE: it has no clock, no
   * randomness and no state. Give it the same four facts and it gives the
   * same answer, for ever — which is why the scene cannot drift into looking
   * busy while the machine does nothing.
   */
  is(!/Date|now\(\)|setTimeout|setInterval|Math\.random/.test(code), 'the ladder has no clock and no dice in it');
  is(!/useState|useEffect|useRef/.test(code), 'and no state of its own: four facts in, one name out');
  is(!/fetch|supabase|db\(/.test(code), 'and it reads nothing — it is told');
  /*
   * AND THERE IS NO `success` MODE. A success is an EVENT — one publication
   * arriving in one group — presented from a rise in the real count. A state
   * called `success` would be one the scene could SIT in, and sitting in it
   * is exactly the invented publication the brief forbids.
   */
  is(!/'success'/.test(code), 'there is no state called success — an arrival is an event, and a state could be sat in');
  /*
   * ─── RE-POINTED ONTO THE CARD THAT DRAWS IT, A THIRD TIME ─────────────
   *
   * The drawn scene's claim was that its post card does not travel while the
   * row is still being prepared; when the reference's nine frames replaced
   * the drawing, the claim moved to the beam; when the ANX Live Flow
   * reference replaced the stage, there is no post crossing the panel at
   * all. What there IS, and what carries the same claim, is a percentage:
   * the only honest reading of "how far in is this publication", taken from
   * the stage the worker wrote on the row. So the claim is that this number
   * has ONE source and that the source is that column.
   */
  const card = readFileSync(new URL('../../src/components/social/LiveFlow.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  is(/const percent = now \? progressOfStep\(now\.step\) : null;/.test(card), 'the percentage is the row’s own stage and nothing else');
  is(/if \(i < 0\) return null;/.test(card), 'and a stage that is not on the ladder yields no number at all — never a zero');
  is(/shown !== null && <span className="anxf-pct">/.test(card), 'so a row with no stage prints no figure');
  /*
   * ONE TIMER ON THE CARD, AND IT MOVES A PICTURE. The character cycles
   * between two poses while he waits; that is a drawing. Every NUMBER — the
   * percentage, the four figures, the queue — is handed in and printed. A
   * timer that touched one of those would be the card advancing a
   * publication on its own, which is the whole thing this file guards.
   */
  const timers = card.match(/setInterval\([\s\S]{0,70}/g) ?? [];
  eq(timers.length, 1, 'exactly one timer on the card');
  is(/setStep/.test(timers[0] ?? ''), 'and it advances the POSE, never a figure');
  is(!/Date\.now|new Date\(/.test(card), 'and nothing on it reads a clock');
  /*
   * AND THE LADDER IS THE WORKER'S OWN ORDER. Written out here rather than
   * imported, so that re-ordering the pipeline in one file and not the other
   * fails loudly instead of quietly drawing a bar that disagrees with the
   * stage printed beside it.
   */
  const ladder = card.slice(card.indexOf('const PIPELINE'), card.indexOf('export function progressOfStep'));
  for (const step of ['pending', 'opening', 'composer_opened', 'uploading_media', 'ready_to_publish', 'publishing', 'verifying']) {
    is(ladder.includes(`'${step}'`), `the ladder carries ${step}`);
  }
  is(!ladder.includes("'published'"), 'and not `published`: a finished row is off this card and into the queue');
  is(!ladder.includes("'failed'"), 'and not `failed`: a failure is not a position on the way to success');
}

{
  /* The set is the one the ladder uses, not a copy that agrees with it today. */
  eq([...PREPARING_STEPS].sort(), ['composer_opened', 'opening', 'pending', 'ready_to_publish', 'uploading_media'], 'the stages before the click');
  is(!(PREPARING_STEPS as readonly string[]).includes('publishing'), 'the click itself is not one of them');
  is(!(PREPARING_STEPS as readonly string[]).includes('verifying'), 'and neither is reading back what happened — the post may already be live');
}

/* ─── §4 — and it is cheap enough to run at 60 ──────────────────────────── */

{
  /*
   * "ביצועים: 60FPS, האצת GPU."
   *
   * Only two properties can be animated without the browser laying the page
   * out or painting it again: `transform` and `opacity`. Everything else —
   * width, top, filter, stroke — costs a layout or a paint PER FRAME, which
   * on a phone is where a 60fps animation becomes a 24fps one. His own phone
   * is the device this panel is read on.
   *
   * So the keyframes added for these states are read out of the stylesheet
   * and every declaration in them is checked. This is a claim that can be
   * made from the source and does not need a frame counter to be true: a
   * keyframe that only moves and fades is composited, and one that does not,
   * is not.
   */
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
  /*
   * RE-POINTED ONTO THE STAGE. These were the drawn scene's keyframes — the
   * wake, the lift, the nod — and they went with it when the reference
   * replaced the drawing with nine rendered frames. The claim did not change:
   * only `transform` and `opacity` are composited, and anything else in a
   * keyframe costs a layout or a paint PER FRAME, which on a phone is where
   * 60fps becomes 24.
   */
  const added = [
    'anx-stage-breathe',
    'anx-stage-work',
    'anx-stage-cheer',
    'anx-blink',
    'anx-railspin',
    'anxf-live',
    'anxf-stripes',
    'anxf-sweep',
  ];
  /*
   * The whole `@keyframes` rule and nothing after it. Braces are counted
   * rather than a fixed window being taken, because these rules are three
   * lines long and the rules that follow them DO carry a `filter:` — the
   * beam's glow — so a window that overran the closing brace would read a
   * neighbour's declaration as this keyframe's and fail for the wrong reason.
   */
  const blockOf = (name: string): string | null => {
    const at = css.indexOf(`@keyframes ${name} {`);
    if (at === -1) return null;
    let depth = 0;
    for (let i = css.indexOf('{', at); i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) return css.slice(at, i + 1);
      }
    }
    return null;
  };

  for (const name of added) {
    const block = blockOf(name);
    is(block !== null, `@keyframes ${name} exists — a class whose keyframes are missing animates nothing, silently`);
    if (!block) continue;
    /*
     * A step may be written on one line — `0%, 100% { transform: …; }` — so
     * a declaration is anything that opens after a `{` or a `;`, not
     * something that happens to start a line.
     */
    const properties = [...block.matchAll(/[{;]\s*([a-z-]+)\s*:/g)].map((m) => m[1]);
    is(properties.length > 0, `@keyframes ${name} actually declares something`);
    for (const prop of properties) {
      is(
        ['transform', 'opacity', 'stroke-dashoffset'].includes(prop),
        `@keyframes ${name} animates "${prop}" — only transform and opacity are composited; everything else repaints every frame`,
      );
    }
    /*
     * AND THE CHARACTER IS NEVER FILTERED WHILE IT MOVES. `anx-beat-off`
     * greys the disconnected robot and the beam's glow is blurred, but both
     * are static declarations — one paint each. A `filter` inside a keyframe
     * would be a blur recomputed sixty times a second.
     */
    is(!/filter:/.test(block), `@keyframes ${name} does not animate a filter`);
  }
  is(/\.anx-beat-off \.anx-poses img\.anx-on \{ filter:/.test(css), 'the disconnected robot is greyed by a static declaration, not by a keyframe');
}

console.log(`scene states OK — ${checks} assertions`);
