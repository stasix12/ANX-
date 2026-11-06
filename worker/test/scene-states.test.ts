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
  sceneModeFor({ systemState: 'active', workerOnline: true, dayDone: false, inFlightSteps: [], ...over });

/* ─── §1 — the three states that stop everything are read FIRST ──────────── */

{
  /*
   * AND THEY ARE READ IN THE DASHBOARD'S OWN ORDER. page.tsx decides
   * `systemState` and the headline directly above this scene is written from
   * it. If the scene asked "is a worker holding a row?" first, a card could
   * be flying to a group under a headline reading "נדרשת התערבות" — the panel
   * contradicting itself in two places two centimetres apart, which is the
   * exact class of bug this product keeps paying for.
   */
  eq(live({ systemState: 'paused', inFlightSteps: ['publishing'] }), 'paused', 'PAUSED beats a row in flight');
  eq(live({ systemState: 'paused', dayDone: true }), 'paused', 'and beats a finished day — switched off is not finished');
  eq(
    live({ systemState: 'needs_intervention', inFlightSteps: ['publishing'] }),
    'error',
    'NEEDS A PERSON beats a row in flight, because the headline over the scene already says so',
  );
  eq(live({ systemState: 'empty', dayDone: true }), 'idle', 'and an empty queue is not a finished day');
}

{
  /*
   * WHICH KIND OF STOP IT IS. Both come from `needs_intervention`; the
   * heartbeat is the only thing that tells them apart, and it is read for
   * nothing else anywhere in this ladder.
   */
  eq(live({ systemState: 'needs_intervention', workerOnline: false }), 'offline', 'no heartbeat: the disconnected robot');
  eq(live({ systemState: 'needs_intervention', workerOnline: true }), 'error', 'a live machine waiting on a person: the alert');
  eq(
    live({ systemState: 'needs_intervention', workerOnline: undefined }),
    'error',
    'and nobody said: that is NOT the same as "the PC is off" — it must not accuse a machine that may be running',
  );
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
  eq(live({ dayDone: true, inFlightSteps: ['publishing'] }), 'done', 'and `dayDone` is the panel’s to decide, not this function’s to second-guess');
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
  const scene = readFileSync(new URL('../../src/components/social/PublishingScene.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  is(
    /const success = shown < target;/.test(scene),
    'and in the scene it is still the presentation catching up with the real count, and nothing else',
  );
  /*
   * THE HELD CARD MAY NOT TRAVEL. `preparing` draws the post in the hand;
   * the flight belongs to `travelling`, which is `sending`. If the lifted
   * card ever took the flight class, the scene would be carrying a post to a
   * group while the media was still uploading.
   */
  is(/preparing && \(/.test(scene), 'the preparing branch draws its own card');
  const lift = scene.slice(scene.indexOf('{preparing && ('));
  is(!/anx-fly/.test(lift.slice(0, 600)), 'and that card is NOT given the flight: nothing is submitted yet, so nothing crosses the scene');
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
  const added = ['anx-wake', 'anx-lift', 'anx-lift-body', 'anx-yes', 'anx-eyeshine', 'anx-alert'];
  for (const name of added) {
    const at = css.indexOf(`@keyframes ${name} {`);
    is(at !== -1, `@keyframes ${name} exists — a class whose keyframes are missing animates nothing, silently`);
    /* the block, by brace depth: these keyframes contain nested rules */
    let depth = 0;
    let end = at;
    for (let i = css.indexOf('{', at); i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const block = css.slice(at, end);
    const properties = [...block.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
    is(properties.length > 0, `@keyframes ${name} actually declares something`);
    for (const prop of properties) {
      is(
        prop === 'transform' || prop === 'opacity',
        `@keyframes ${name} animates "${prop}" — only transform and opacity are composited; everything else repaints every frame`,
      );
    }
  }
  /* And the class really points at the keyframes, which is the other half of
     the same mistake: a minifier once renamed one of this scene's keyframes
     and left the class pointing at the old name. Nothing warned. */
  for (const name of added) {
    is(
      new RegExp(`\\.${name} \\{[^}]*animation:[^;]*${name}`).test(css),
      `.${name} is wired to its own keyframes`,
    );
  }
}

console.log(`scene states OK — ${checks} assertions`);
