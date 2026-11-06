'use client';

import { useEffect, useRef, useState } from 'react';
import type { SceneMode } from './sceneState';

/**
 * ─── THE ANX ASSISTANT, REBUILT FROM HIS OWN NINE FRAMES ──────────────────
 *
 * "אני לא מבקש השראה מהתמונה. אני מבקש שחזור חזותי נאמן ככל האפשר של כל
 *  התמונה, כולל הרובוט, הסביבה, כל תשעת השלבים, האפקטים, כרטיסי הפייסבוק
 *  וסרגל הסטטוסים."
 *
 * WHAT THE REFERENCE ACTUALLY IS, measured rather than assumed: a GIF of NINE
 * frames, 717×237, fully opaque, with the Hebrew title and the status rail
 * BAKED INTO THE PIXELS. Each frame was decoded in Chromium's own decoder and
 * cropped to 380×237 — the character, the cap, the headphones, the laptop, the
 * coffee, the plant, the chair, the light — which is the part no stylesheet
 * can fake. The nine crops are 159 KB in all.
 *
 * ─── WHAT IS HIS AND WHAT IS OURS, AND WHY THE LINE IS THERE ──────────────
 *
 * HIS, as pixels: everything inside public/social/anx/scene-*.webp.
 *
 * OURS, as real DOM: the title, the subtitle, the group cards, the beam and
 * the status rail. Not a style preference — the title has to be able to say
 * "מפרסם עכשיו" from the database, the rail has to follow the real queue, and
 * the green tick has to be a claim about a row that actually published. Baked
 * pixels can do none of that; a picture of a status bar is not a status bar.
 *
 * ─── AND THE ONE RULE THAT OUTRANKS THE DESIGN ────────────────────────────
 *
 * "אם אין אירוע אמיתי שמאפשר לדעת מה קורה, אין להציג פעילות מדומה …
 *  אם הפרסום נכשל, אין להציג V ירוק."
 *
 * The loop is allowed to loop: a pose says "a worker is holding a row", which
 * is what `sending` means, and it asserts nothing about an outcome. A GREEN
 * TICK ASSERTS THAT A POST LANDED IN A GROUP, so it moves only when the real
 * published count rises — and that number comes from the database. The
 * `target`/`shown` pair below is that rule, carried over verbatim from the
 * scene this replaces, where it was proved by worker/test/publishing-scene.
 *
 * ─── WHAT THE ASSETS CANNOT DO, SAID HERE RATHER THAN DISCOVERED LATER ────
 *
 * Nine poses are not continuous motion. Between two of them there is nothing,
 * so the change is a 220ms cross-fade with a breath on the held pose. It
 * reads as movement; it is not a 3D character animating. Closing that gap
 * needs an asset we do not have: a longer sprite sheet, the source 3D or
 * After Effects project, or a transparent-background set. Told to the owner
 * before it was built, not after.
 *
 * There is also no ERROR frame and no OFFLINE frame among the nine, so those
 * two states use the calm pose — desaturated, with a badge — and are the only
 * places in this file where something is approximated.
 */

/** public/social/anx/scene-N.webp — the nine, in the reference's own order. */
const FRAMES = 9;
const SRC = (i: number) => `/social/anx/scene-${i}.webp`;

/**
 * WHICH POSES EACH REAL STATE PLAYS, in his numbering (1-based in the brief,
 * 0-based here):
 *
 *   IDLE        1          sitting at the laptop, eyes smiling
 *   PREPARING   2,3,4      typing → finger up → the post card in hand
 *   PUBLISHING  5          the card leaving, beam lit
 *   SUCCESS     6,7        thumbs up, then both hands
 *   RETURNING   8,9        hands down, back to the keyboard
 *
 * `hold` is how long each pose stays before the next; a single-pose state
 * never runs a timer at all.
 */
const POSES: Record<SceneMode | 'success', { frames: readonly number[]; hold: number; beat: Beat }> = {
  waiting: { frames: [0], hold: 0, beat: 'breathe' },
  preparing: { frames: [1, 2, 3], hold: 900, beat: 'work' },
  sending: { frames: [4], hold: 0, beat: 'work' },
  success: { frames: [5, 6], hold: 760, beat: 'cheer' },
  done: { frames: [5, 6], hold: 1500, beat: 'cheer' },
  /* The two the reference has no pose for. */
  paused: { frames: [7], hold: 0, beat: 'still' },
  idle: { frames: [7], hold: 0, beat: 'still' },
  error: { frames: [7], hold: 0, beat: 'breathe' },
  offline: { frames: [7], hold: 0, beat: 'off' },
};
type Beat = 'breathe' | 'work' | 'cheer' | 'still' | 'off';

/** How long one arrival is presented before the tick goes and the next group
    becomes the destination. Same beat the scene this replaces used. */
const SUCCESS_HOLD_MS = 2400;
/** More arrivals than this between two reads is a catch-up, not a burst. */
const CATCH_UP = 3;
/** How many group cards the rail shows. The reference draws two or three; four
    is the most that fits the card on a phone without shrinking them. */
const CARDS = 3;

/** The sentence over the scene, per state. The headline on the panel above is
    the panel's own and is not touched by any of this. */
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
   * THE ARRIVAL COUNTER, carried over unchanged from the scene this replaces.
   *
   *   `target` counts the real publications seen since this card mounted.
   *   `shown`  counts the ones whose arrival has been presented.
   *
   * While `shown < target` one group wears a tick and the robot celebrates.
   * When the beat ends `shown` catches up, the tick goes, and the NEXT card
   * becomes the destination — bare, because nothing has landed there yet.
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
       * open through lunch, a worker restarted, a page that reconnected. Each
       * arrival is held for SUCCESS_HOLD_MS, so queueing 248 of them would
       * celebrate for ten minutes over publications that finished hours ago,
       * and the card would be stuck on "הפרסום הושלם בהצלחה" while the queue
       * moved on without it. Past the ceiling the counter snaps forward and
       * presents nothing: the figures under the bar still carry every one of
       * them, which is where a count belongs.
       */
      setTarget((t) => (gained > CATCH_UP ? published : t + gained));
      if (gained > CATCH_UP) setShown(published);
    } else if (gained < 0) {
      setTarget(0);
      setShown(0);
    }
  }, [published]);

  const landing = shown < target;
  useEffect(() => {
    if (!landing) return;
    const t = setTimeout(() => setShown((s) => s + 1), SUCCESS_HOLD_MS);
    return () => clearTimeout(t);
  }, [landing, shown]);

  /*
   * A LANDING OUTRANKS THE MODE, and only a landing does. Every other state
   * on this card is a fact about what the machine is doing; this one is a
   * fact about something that has already happened and is being reported.
   */
  const playing: SceneMode | 'success' = landing ? 'success' : mode;
  const pose = POSES[playing];
  const says = SAYS[playing];
  const active = shown % CARDS;
  const travelling = playing === 'sending';

  /* ── the pose, and the only timer in this component other than the hold ── */
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (pose.frames.length < 2 || pose.hold <= 0) return;
    const t = setInterval(() => setStep((s) => (s + 1) % pose.frames.length), pose.hold);
    return () => clearInterval(t);
  }, [pose]);
  const frame = pose.frames[Math.min(step, pose.frames.length - 1)];

  /*
   * ── the beam, aimed at the card it is really going to ──────────────────
   *
   * Measured on screen rather than written down: the crop sits beside the
   * cards on a desktop and above them on a phone, so a fraction of the panel
   * would aim it at thin air on one of the two. 0.74 across the crop and 0.50
   * down it is where the post leaves the hand in the reference's own frames.
   */
  const stage = useRef<HTMLDivElement | null>(null);
  const scene = useRef<HTMLDivElement | null>(null);
  const cards = useRef<(HTMLLIElement | null)[]>([]);
  const [beam, setBeam] = useState('');
  useEffect(() => {
    if (!travelling) {
      setBeam('');
      return;
    }
    const aim = () => {
      const box = stage.current?.getBoundingClientRect();
      const sc = scene.current?.getBoundingClientRect();
      const card = cards.current[active]?.getBoundingClientRect();
      if (!box || !sc || !card || !box.width || !box.height) return;
      const vb = (px: number, py: number): [number, number] => [
        ((px - box.left) / box.width) * 720,
        ((py - box.top) / box.height) * 237,
      ];
      /*
       * ON A PHONE THE CARDS ARE BELOW THE SCENE, not beside it, and a beam
       * from the hand would then cross the robot's own body on its way down.
       * So when the destination is below the picture the beam leaves from the
       * near edge under the hand instead — the same hand, the shortest way
       * out of the frame.
       */
      const below = card.top > sc.bottom - 4;
      const [x1, y1] = vb(sc.left + sc.width * 0.74, sc.top + sc.height * (below ? 0.96 : 0.5));
      const [x2, y2] = vb((card.left + card.right) / 2, (card.top + card.bottom) / 2);
      setBeam(`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - 18} ${x2} ${y2}`);
    };
    aim();
    window.addEventListener('resize', aim);
    return () => window.removeEventListener('resize', aim);
  }, [travelling, active, frame]);

  return (
    <div
      ref={stage}
      data-stage={playing}
      className="anx-stage"
      role="img"
      aria-label={`${says.title} — ${published} מתוך ${total} פורסמו היום`}
    >
      {/* ── the character ─────────────────────────────────────────────── */}
      {/*
        NINE IMAGES, ONE VISIBLE. They are all in the DOM so a pose change is
        an opacity swap the compositor already has the pixels for — loading
        one on demand would show a blank frame on the first publication of
        the day, which is the one the owner is most likely to be watching.
      */}
      <div ref={scene} className={`anx-scene anx-beat-${pose.beat}`}>
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
      </div>

      {/* ── the beam, from the hand to the group it is going to ───────── */}
      <svg className={`anx-beam${travelling ? ' anx-lit' : ''}`} viewBox="0 0 720 237" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="anx-beam-grad" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor="#1557d6" stopOpacity="0" />
            <stop offset="35%" stopColor="#2f8bff" />
            <stop offset="100%" stopColor="#8fd0ff" />
          </linearGradient>
        </defs>
        {/* Two strokes: a soft wide one for the glow the reference has around
            its trail, and a crisp dashed one travelling along it so the
            direction is readable. */}
        <path className="anx-beam-glow" d={beam} />
        <path className="anx-beam-core" d={beam} />
      </svg>

      {/* ── the words, the groups and the rail ────────────────────────── */}
      <div className="anx-side">
        <div className="anx-head">
          <span aria-hidden className="anx-head-dot">{playing === 'offline' ? '⏻' : playing === 'error' ? '!' : '◴'}</span>
          <h3 data-stage-title>{says.title}</h3>
        </div>
        <p data-stage-sub className="anx-sub">{says.sub}</p>

        <ul className="anx-cards">
          {Array.from({ length: CARDS }, (_, i) => {
            const isTarget = i === active && (travelling || playing === 'preparing');
            const landed = i === active && landing;
            return (
              <li
                key={i}
                ref={(el) => { cards.current[i] = el; }}
                data-card
                data-active={isTarget ? '' : undefined}
                className={`${isTarget ? 'anx-target ' : ''}${landed ? 'anx-landed' : ''}`.trim() || undefined}
              >
                <span aria-hidden className="anx-fb">f</span>
                <svg aria-hidden className="anx-ppl" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="9" cy="8" r="3.4" />
                  <path d="M2.5 19a6.5 6.5 0 0 1 13 0z" />
                  <circle cx="17.5" cy="9.5" r="2.7" />
                  <path d="M13.5 19a4.8 4.8 0 0 1 9.3 0z" opacity=".8" />
                </svg>
                <span aria-hidden className="anx-lines"><i /><i /></span>
                {/* THE ONE MARK HERE THAT MAKES A CLAIM. */}
                {landed && (
                  <span data-tick className="anx-tick" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
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
          A LEGEND, NOT A PROGRESS BAR. The reference shows all four with
          their own marks — a clock, a spinner, a send arrow, a green tick —
          and lifts the one that is live. Painting the earlier ones "done"
          would colour ממתין green in the middle of a publication, which says
          nothing true about anything.
        */}
        <ol className="anx-rail" data-rail={says.rail}>
          {RAIL.map(({ k, label }) => (
            <li key={k} data-step={k} className={k === says.rail ? 'anx-live' : undefined}>
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
