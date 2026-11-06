'use client';

import { useEffect, useRef, useState } from 'react';
import { ANX_FACES, POSE_H, POSE_W } from './anxPoses';
import type { SceneMode } from './sceneState';

/**
 * ─── THE ANX ASSISTANT, LIVING INSIDE THE APP ─────────────────────────────
 *
 * "אני לא רוצה אנימציה שמונחת על האפליקציה. אני רוצה רובוט ANX שחי בתוך
 *  האפליקציה עצמה. הרקע של התוכנה חייב להמשיך בצורה טבעית מאחורי הרובוט,
 *  ללא גבולות, ללא מלבנים וללא צבעים זרים."
 *
 * The nine reference frames are renders of a ROOM — a blue wall, a desk, a
 * vignette, all baked into the pixels. Pasted into a card they are a
 * photograph stuck on the dashboard, which is exactly what they looked like.
 * `background: transparent` cannot touch a painted wall, so the wall was
 * removed from the pixels themselves: scripts/anx-cutout.mjs grows the room
 * out from the border of each frame and writes nine alpha cutouts. What this
 * component mounts has no background at all — the card's own surface is what
 * shows behind the character, on every theme the app has.
 *
 * The same script also MOVES each pose. The nine frames are not one camera:
 * measured on the cap, the character is 25% wider in one than in another and
 * sits 28px to the side, which played in sequence is the lurch the brief
 * forbids. Each pose is scaled and placed until the cap lands on the same
 * spot, so what cross-fades here is one character, not nine photographs.
 *
 * ─── WHAT IS HIS AND WHAT IS OURS ─────────────────────────────────────────
 *
 * HIS, as pixels: public/social/anx/pose-*.webp — the robot, the cap, the
 * headphones, the visor, the eye lights, the laptop, the coffee, the plant.
 *
 * OURS, as real DOM in the app's own tokens: the words, the group cards, the
 * post that travels, the trail, the green tick and the status rail. Not a
 * style preference — the title says what the database says, the rail follows
 * the real queue, and the tick is a claim that a post reached a group. A
 * picture of a status bar is not a status bar.
 *
 * ─── AND THE ONE RULE THAT OUTRANKS THE DESIGN ────────────────────────────
 *
 * "אין להציג פרסום מוצלח ללא אישור אמיתי. אין להמציא קבוצות, פרסומים או
 *  תוצאות."
 *
 * A pose may loop: it says "a worker is holding a row", which is what
 * `sending` means, and asserts nothing about an outcome. THE GREEN TICK
 * ASSERTS THAT A POST LANDED, so it moves only when the real published count
 * rises, and that number comes from the database. The `target`/`shown` pair
 * below is that rule.
 *
 * ─── WHAT THE ASSETS STILL CANNOT DO, SAID HERE RATHER THAN DISCOVERED ────
 *
 * Nine poses are nine poses. Between two of them there is nothing, so the
 * change is a cross-fade over a pose that is always breathing, and the parts
 * that CAN move continuously — the body, the post card, the trail, the tick,
 * the eyelids — are moved continuously by the compositor. A rigged 3D robot
 * would need the source project, which we do not have; this is the most
 * continuous motion these nine frames can be made to produce.
 */

/** public/social/anx/pose-N.webp — the nine, in the reference's own order. */
const FRAMES = 9;
const SRC = (i: number) => `/social/anx/pose-${i}.webp`;

type Beat = 'breathe' | 'work' | 'cheer' | 'still' | 'off';
/** What the character is DOING. Not always what the engine is doing: a
    celebration and the walk back to the keyboard are about a publication
    that already happened. */
type Phase = SceneMode | 'success' | 'returning';

/**
 * HIS NINE STAGES, IN HIS ORDER, against the poses that carry them:
 *
 *   1 המתנה          pose 1 (and a glance to 0), blinking
 *   2 התחלת עבודה    pose 1 — hands on the keyboard
 *   3 הכנת פרסום     pose 2 — hand up, the blue send mark
 *   4 יצירת פוסט     pose 3 — the post card over the hand
 *   5 שליחה          pose 4 + the card we fly to the group
 *   6 הצלחה          the green tick on the group — ours, and earned
 *   7 חגיגה          poses 5,6 — thumbs up
 *   8 חזרה           pose 7 — hands down
 *   9 המשך עבודה     pose 8 — back at the laptop, then stage 1 again
 */
const POSES: Record<Phase, { frames: readonly number[]; hold: number; beat: Beat }> = {
  waiting: { frames: [1, 0], hold: 5200, beat: 'breathe' },
  preparing: { frames: [1, 2, 3], hold: 900, beat: 'work' },
  sending: { frames: [4], hold: 0, beat: 'work' },
  success: { frames: [5, 6], hold: 760, beat: 'cheer' },
  returning: { frames: [7, 8], hold: 420, beat: 'work' },
  done: { frames: [5, 6], hold: 1500, beat: 'cheer' },
  /* The two the reference has no pose for, and the two that are a stopped
     machine: the calm pose, which claims nothing. */
  paused: { frames: [7], hold: 0, beat: 'still' },
  idle: { frames: [7], hold: 0, beat: 'still' },
  error: { frames: [7], hold: 0, beat: 'breathe' },
  offline: { frames: [7], hold: 0, beat: 'off' },
};

/** How long one arrival is presented before the tick goes and the next group
    becomes the destination. */
const SUCCESS_HOLD_MS = 2400;
/** Stages 8 and 9 — hands down, back at the laptop — after a celebration. */
const RETURN_MS = 840;
/** More arrivals than this between two reads is a catch-up, not a burst. */
const CATCH_UP = 3;
/** How many group cards the rail shows. */
const CARDS = 3;

/** The sentence over the scene. It follows the ENGINE, never the pose: while
    the character walks back to his keyboard the queue is already on the next
    row, and the words have to say so. */
const SAYS: Record<SceneMode | 'success', { title: string; sub: string; rail: Rail }> = {
  waiting: { title: 'מחכה לעבודות', sub: 'המערכת ממתינה לעבודות חדשות…', rail: 'waiting' },
  preparing: { title: 'מכין פרסום…', sub: 'פותח את הקבוצה ומצרף את המדיה', rail: 'queued' },
  sending: { title: 'מפרסם עכשיו…', sub: 'שולח את הפוסט לקבוצה', rail: 'publishing' },
  success: { title: 'הפרסום הושלם בהצלחה', sub: 'הפוסט עלה לקבוצה', rail: 'done' },
  done: { title: 'הרובוט סיים לפרסם', sub: 'אין עוד פרסומים שממתינים לצאת היום', rail: 'done' },
  paused: { title: 'הפרסום מושהה', sub: 'שום דבר לא יוצא עד שתפעילו', rail: 'waiting' },
  idle: { title: 'אין פרסום מתוזמן', sub: 'אין עבודות בתור כרגע', rail: 'waiting' },
  error: { title: 'נדרשת פעולה שלכם', sub: 'הפרסום לא ימשיך עד שתטפלו', rail: 'waiting' },
  offline: { title: 'המחשב לא מחובר', sub: 'הפרסום לא יצא עד שהתוכנה תפעל', rail: 'waiting' },
};
type Rail = 'waiting' | 'queued' | 'publishing' | 'done';

const RAIL: { k: Rail; label: string }[] = [
  { k: 'waiting', label: 'ממתין' },
  { k: 'queued', label: 'בתור' },
  { k: 'publishing', label: 'מפרסם עכשיו…' },
  { k: 'done', label: 'בוצע' },
];

/** Where the post leaves the character's hand, as a fraction of the pose
    canvas. Read off the cutouts: in poses 3 and 4 the card sits there. */
const HAND_X = 0.63;
const HAND_Y = 0.42;

type Flight = { w: number; h: number; x1: number; y1: number; x2: number; y2: number };

export function PublishingStage({
  mode,
  published,
  total,
}: {
  mode: SceneMode;
  /** Publications that really finished today. The ONLY source of a tick. */
  published: number;
  /** What today holds — for the label only, never for a tick. */
  total: number;
}) {
  /*
   * THE ARRIVAL COUNTER.
   *
   *   `target` counts the real publications seen since this card mounted.
   *   `shown`  counts the ones whose arrival has been presented.
   *
   * While `shown < target` one group wears a tick and the character
   * celebrates. When the beat ends `shown` catches up, the tick goes, and the
   * NEXT card becomes the destination — bare, because nothing has landed
   * there yet.
   */
  const [target, setTarget] = useState(0);
  const [shown, setShown] = useState(0);
  const seen = useRef(published);

  useEffect(() => {
    const gained = published - seen.current;
    seen.current = published;
    if (gained > 0) {
      /*
       * BY THE DELTA, BUT NOT WITHOUT A CEILING.
       *
       * The dashboard re-reads every thirty seconds and the worker can
       * publish faster than that, so two or three arrivals land between
       * renders and presenting one would under-report.
       *
       * A LARGE JUMP IS NOT A BURST, THOUGH — it is a catch-up: a tab left
       * open through lunch, a worker restarted, a page that reconnected.
       * Past the ceiling the counter snaps forward and presents nothing; the
       * figures under the bar still carry every one of them, which is where
       * a count belongs.
       */
      setTarget((t) => (gained > CATCH_UP ? published : t + gained));
      if (gained > CATCH_UP) setShown(published);
    } else if (gained < 0) {
      setTarget(0);
      setShown(0);
    }
  }, [published]);

  const landing = shown < target;

  /* Stages 8 and 9: the walk back, which only ever follows a celebration. */
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (!landing) return;
    const t = setTimeout(() => {
      setShown((s) => s + 1);
      setReturning(true);
    }, SUCCESS_HOLD_MS);
    return () => clearTimeout(t);
  }, [landing, shown]);
  useEffect(() => {
    if (!returning) return;
    const t = setTimeout(() => setReturning(false), RETURN_MS);
    return () => clearTimeout(t);
  }, [returning]);

  /*
   * A LANDING OUTRANKS THE MODE, and only a landing does. Every other state
   * is a fact about what the machine is doing; this one is a fact about
   * something that has already happened and is being reported.
   */
  const says = SAYS[landing ? 'success' : mode];
  const phase: Phase = landing ? 'success' : returning && mode !== 'offline' && mode !== 'error' ? 'returning' : mode;
  const pose = POSES[phase];
  const active = shown % CARDS;
  const travelling = phase === 'sending';

  /* ── the pose, and the only timer here other than the hold ──────────── */
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (pose.frames.length < 2 || pose.hold <= 0) return;
    const t = setInterval(() => setStep((s) => (s + 1) % pose.frames.length), pose.hold);
    return () => clearInterval(t);
  }, [pose]);
  const frame = pose.frames[Math.min(step, pose.frames.length - 1)];
  const face = ANX_FACES[frame];

  /*
   * ── the post, and the group it is really going to ──────────────────────
   *
   * Measured on screen rather than written down: the character sits beside
   * the cards on a desktop and above them on a phone, so a fraction of the
   * panel would aim the post at thin air on one of the two. Everything here
   * is in the stage's own pixels, which is what lets the svg and the card
   * share one set of coordinates and the card land ON the group rather than
   * near it.
   */
  const stage = useRef<HTMLDivElement | null>(null);
  const figure = useRef<HTMLDivElement | null>(null);
  const cards = useRef<(HTMLLIElement | null)[]>([]);
  const [flight, setFlight] = useState<Flight | null>(null);
  useEffect(() => {
    if (!travelling) {
      setFlight(null);
      return;
    }
    const aim = () => {
      const box = stage.current?.getBoundingClientRect();
      const fig = figure.current?.getBoundingClientRect();
      const card = cards.current[active]?.getBoundingClientRect();
      if (!box || !fig || !card || !box.width || !box.height) return;
      /*
       * ON A PHONE THE CARDS ARE BELOW THE CHARACTER, not beside him, and a
       * post leaving the hand sideways would then cross his own body on the
       * way down. When the destination is below, the post leaves from under
       * the hand instead — the same hand, the shortest way out.
       */
      const below = card.top > fig.bottom - 4;
      setFlight({
        w: box.width,
        h: box.height,
        x1: fig.left - box.left + fig.width * HAND_X,
        y1: fig.top - box.top + fig.height * (below ? 0.9 : HAND_Y),
        x2: (card.left + card.right) / 2 - box.left,
        y2: (card.top + card.bottom) / 2 - box.top,
      });
    };
    aim();
    window.addEventListener('resize', aim);
    return () => window.removeEventListener('resize', aim);
  }, [travelling, active, frame]);

  const trail = flight
    ? `M ${flight.x1} ${flight.y1} Q ${(flight.x1 + flight.x2) / 2} ${Math.min(flight.y1, flight.y2) - 22} ${flight.x2} ${flight.y2}`
    : '';

  /** How far along the rail the engine really is. */
  const at = RAIL.findIndex((r) => r.k === says.rail);

  return (
    <div
      ref={stage}
      data-stage={phase}
      className="anx-stage"
      role="img"
      aria-label={`${says.title} — ${published} מתוך ${total} פורסמו היום`}
    >
      {/* ── the character ─────────────────────────────────────────────── */}
      {/*
        NINE IMAGES, ONE VISIBLE. They are all in the DOM so a pose change is
        an opacity swap the compositor already holds the pixels for — loading
        one on demand would show a blank frame on the first publication of
        the day, which is the one the owner is most likely to be watching.
      */}
      <div ref={figure} className={`anx-figure anx-beat-${pose.beat}`} data-figure>
        {/* Light, not a panel: a soft pool of the app's own accent behind the
            character and a contact shadow under him, both from theme tokens,
            so he sits IN the card instead of on it. */}
        <span aria-hidden className="anx-ambient" />
        <span aria-hidden className="anx-contact" />
        <div className="anx-poses">
          {Array.from({ length: FRAMES }, (_, i) => (
            <img
              key={i}
              data-frame={i}
              src={SRC(i)}
              alt=""
              aria-hidden
              decoding="async"
              loading="eager"
              className={i === frame ? 'anx-on' : undefined}
            />
          ))}
          {/*
            THE BLINK. Two lids in the visor's own measured colour, closing
            over the eye lights of whichever pose is showing. Only the poses
            whose eyes are OPEN have them — in the others he is already
            smiling with his eyes shut, and a lid there would be a second pair
            of eyelids on a closed eye.
          */}
          {face?.eyes.map((e, i) => {
            /* a little wider and taller than the light itself, so the glow
               around it is covered too and the eye reads as closed */
            const w = e.w * 1.34;
            const h = e.h * 1.5;
            const left = e.x + e.w / 2 - w / 2;
            const top = e.y + e.h / 2 - h / 2;
            return (
              <span
                key={i}
                data-lid
                aria-hidden
                className="anx-lid"
                style={{
                  left: `${(left / POSE_W) * 100}%`,
                  top: `${(top / POSE_H) * 100}%`,
                  width: `${(w / POSE_W) * 100}%`,
                  height: `${(h / POSE_H) * 100}%`,
                  background: face.visor,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ── the post on its way, and the trail behind it ──────────────── */}
      {/*
        One layer over the whole stage, in the stage's own pixel coordinates,
        so the card lands on the group card rather than near it — and cannot
        leave the component, because both ends are elements inside it.
      */}
      <div className="anx-flight" aria-hidden>
        {flight && (
          <>
            <svg className="anx-trail" viewBox={`0 0 ${flight.w} ${flight.h}`} width={flight.w} height={flight.h}>
              <defs>
                <linearGradient id="anx-trail-grad" x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0" />
                  <stop offset="40%" stopColor="var(--color-brand-500)" stopOpacity=".55" />
                  <stop offset="100%" stopColor="var(--color-brand-300)" />
                </linearGradient>
              </defs>
              <path className="anx-trail-glow" d={trail} />
              <path className="anx-trail-core" d={trail} />
            </svg>
            {/* The post itself, in the app's card skin — the same white, the
                same radius and the same shadow as every other card here. */}
            <span
              data-parcel
              className="anx-parcel"
              style={{
                left: `${flight.x1}px`,
                top: `${flight.y1}px`,
                ['--anx-tx' as string]: `${flight.x2 - flight.x1}px`,
                ['--anx-ty' as string]: `${flight.y2 - flight.y1}px`,
              }}
            >
              <span className="anx-parcel-in">
                <i className="anx-parcel-pic" />
                <i className="anx-parcel-line" />
                <i className="anx-parcel-line anx-parcel-short" />
              </span>
            </span>
          </>
        )}
      </div>

      {/* ── the words, the groups and the rail ────────────────────────── */}
      <div className="anx-side">
        <div className="anx-head">
          <span aria-hidden className="anx-head-dot">
            {phase === 'offline' ? '⏻' : phase === 'error' ? '!' : '◴'}
          </span>
          <h3 data-stage-title>{says.title}</h3>
        </div>
        <p data-stage-sub className="anx-sub">{says.sub}</p>

        <ul className="anx-cards">
          {Array.from({ length: CARDS }, (_, i) => {
            /* THE DESTINATION IS A FACT ABOUT THE QUEUE, not about the
               pose: while the character walks back to his keyboard the
               engine is already on the next row, and the ring belongs on
               the group that row is for. */
            const isTarget = i === active && (mode === 'sending' || mode === 'preparing');
            const landed = i === active && landing;
            return (
              <li
                key={i}
                ref={(el) => {
                  cards.current[i] = el;
                }}
                data-card
                data-active={isTarget ? '' : undefined}
                className={`${isTarget ? 'anx-target ' : ''}${landed ? 'anx-landed' : ''}`.trim() || undefined}
              >
                <span aria-hidden className="anx-fb">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.7V3.6c-.29-.04-1.27-.12-2.4-.12-2.38 0-4 1.45-4 4.11V9.9H7.6V13h2.7v8z" />
                  </svg>
                </span>
                <svg aria-hidden className="anx-ppl" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="9" cy="8" r="3.4" />
                  <path d="M2.5 19a6.5 6.5 0 0 1 13 0z" />
                  <circle cx="17.5" cy="9.5" r="2.7" />
                  <path d="M13.5 19a4.8 4.8 0 0 1 9.3 0z" opacity=".8" />
                </svg>
                <span aria-hidden className="anx-lines">
                  <i />
                  <i />
                </span>
                {/* THE ONE MARK HERE THAT MAKES A CLAIM. */}
                {landed && (
                  <span data-tick className="anx-tick" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {/* ── the status rail, four states, the live one lifted ────────── */}
        {/*
          A LEGEND, NOT A PROGRESS BAR. All four states carry their own mark
          and the one that is live is lifted. Painting the earlier ones "done"
          would colour ממתין green in the middle of a publication, which says
          nothing true about anything.
        */}
        <ol className="anx-rail" data-rail={says.rail}>
          {RAIL.map(({ k, label }, i) => (
            <li
              key={k}
              data-step={k}
              /* "השלב הפעיל יודגש בכחול והשלב שהושלם בירוק" — and a step is
                 only "completed" when the live step is genuinely past it for
                 the row in flight. While the queue is merely waiting the live
                 step is the first one, so nothing is green, which is the
                 truth: nothing has been completed. */
              data-past={i < at ? '' : undefined}
              className={k === says.rail ? 'anx-live' : undefined}
            >
              <span aria-hidden className={`anx-rail-ic${k === 'queued' && says.rail === 'queued' ? ' anx-spin' : ''}`}>
                {k === 'waiting' ? '◴' : k === 'queued' ? '◌' : k === 'publishing' ? '➤' : '✓'}
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
