'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * THE ROBOT THAT IS ACTUALLY SENDING HIS POSTS.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE ROBOT IS AN IMAGE, AND THAT IS DELIBERATE.
 *
 * "השתמש ברובוט המקורי מהתמונה המצורפת … אל תחליף אותו ברובוט מצויר, אייקון,
 *  אימוג׳י או דמות דומה."
 *
 * The first build drew the robot in SVG. It was a drawing OF his robot, which
 * is the one thing he ruled out — his is a 3D render with its own materials,
 * and no amount of path data is going to be it. So the robot is now a raster
 * asset, laid inside the same viewBox as everything else (<image> scales with
 * it), and the motion is CSS on top.
 *
 * WHAT THE ASSET IS, STATED PLAINLY: public/social/robot.webp is a CROP OF HIS
 * OWN DESIGN SCREENSHOT — 440×339, feathered at the rim so the rectangle never
 * shows a seam on the white card. It is not the source file. It cannot be
 * enlarged past about 200 CSS pixels before it softens, and the original PNG
 * (transparent, ≥1000px) would replace it by changing one URL. This is written
 * here rather than in a message that scrolls away, because the next person to
 * wonder why the robot is slightly soft on a desktop screen deserves the
 * answer in the file.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AND IT DOES NOT INVENT EVENTS.
 *
 * The card in flight is an idle loop: it says "a worker is holding a row",
 * which is what `mode === 'sending'` means, and it may loop because it asserts
 * nothing. A GREEN TICK ASSERTS THAT A POST LANDED IN A GROUP, so ticks move
 * only when `published` really rises — and that number comes from the
 * database. If the worker stalls, the card keeps flying and not one tick
 * appears.
 *
 * The reference image shows a tick on all four groups. It is a mockup, and he
 * said so himself: "אל תשאיר סימוני הצלחה קבועים על כל הקבוצות רק משום שהם
 * מופיעים בתמונת הרפרנס." A tick that is always there cannot report an
 * arrival. So a tick is an EVENT with a life:
 *
 *   `target` counts the real publications seen since this card mounted.
 *   `shown`  counts the ones whose arrival has been presented.
 *
 * While `shown < target` the tile at `shown % 4` is the active destination, it
 * takes the delivery and wears the tick for a beat. When the beat ends `shown`
 * catches up, the tick goes, and the NEXT tile becomes active and waits —
 * bare, because nothing has landed there yet.
 *
 * Every animation is switched off under prefers-reduced-motion (globals.css).
 */

const TILES = 4;
const SUCCESS_HOLD_MS = 2400;

/**
 * THE CONFETTI, WRITTEN DOWN RATHER THAN ROLLED.
 *
 * Twenty-six pieces, each with where it starts, how far it drifts sideways, how
 * far it spins, how long it takes and when it joins in. Math.random() would be
 * the obvious way to get this scatter and it is the wrong one: this component
 * renders on the server first, and a number drawn during that render is a
 * different number in the browser — React calls that a hydration mismatch and
 * throws the whole tree away. A fixed table is the same scatter, every time,
 * on both sides.
 *
 * They start spread DOWN the scene and not in a line at the top, so that with
 * the animation switched off (prefers-reduced-motion) what is left is a
 * scattered sprinkle over the panel rather than fourteen dots in a row.
 */
type Piece = {
  /** Where it sits in the viewBox before it starts falling. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Its resting tilt — what is left of it with the animation switched off. */
  r: number;
  /** How far it drifts sideways, and how far it spins, on the way down. */
  cx: number;
  cr: number;
  /** How long one fall takes, and how long it waits before joining in. */
  d: number;
  l: number;
  round?: boolean;
};
const CONFETTI: readonly Piece[] = [
  { x: 24, y: 14, w: 7, h: 11, r: -18, cx: -14, cr: 520, d: 3.4, l: 0 },
  { x: 46, y: 150, w: 6, h: 6, r: 0, cx: 11, cr: -380, d: 3.7, l: 2.9, round: true },
  { x: 62, y: 96, w: 6, h: 6, r: 0, cx: 10, cr: -400, d: 4.1, l: 1.5, round: true },
  { x: 82, y: 164, w: 8, h: 5, r: -52, cx: -12, cr: 440, d: 3.3, l: 1.2 },
  { x: 96, y: 36, w: 9, h: 5, r: 24, cx: 16, cr: 620, d: 3.0, l: 0.7 },
  { x: 118, y: 72, w: 6, h: 6, r: 0, cx: -10, cr: 560, d: 4.4, l: 2.7, round: true },
  { x: 130, y: 128, w: 6, h: 10, r: -40, cx: -9, cr: -560, d: 3.8, l: 2.2 },
  { x: 150, y: 44, w: 8, h: 5, r: 62, cx: 13, cr: -500, d: 3.5, l: 1.6 },
  { x: 164, y: 8, w: 5, h: 5, r: 0, cx: 12, cr: 480, d: 3.3, l: 1.1, round: true },
  { x: 180, y: 158, w: 7, h: 10, r: 16, cx: -16, cr: 600, d: 4.1, l: 0.2 },
  { x: 192, y: 70, w: 9, h: 6, r: 34, cx: -17, cr: -620, d: 4.3, l: 0.3 },
  { x: 210, y: 104, w: 6, h: 6, r: 0, cx: 14, cr: -440, d: 3.6, l: 2.5, round: true },
  { x: 222, y: 142, w: 6, h: 11, r: 12, cx: 14, cr: 540, d: 3.1, l: 1.8 },
  { x: 240, y: 62, w: 8, h: 5, r: -34, cx: -12, cr: 520, d: 4.0, l: 3.1 },
  { x: 252, y: 20, w: 7, h: 7, r: -28, cx: -11, cr: -480, d: 3.9, l: 2.6 },
  { x: 272, y: 150, w: 6, h: 10, r: 48, cx: 12, cr: -580, d: 3.4, l: 1.4 },
  { x: 286, y: 110, w: 5, h: 5, r: 0, cx: 15, cr: 600, d: 3.5, l: 0.9, round: true },
  { x: 300, y: 10, w: 8, h: 5, r: 18, cx: -14, cr: 460, d: 4.4, l: 2.1 },
  { x: 312, y: 54, w: 9, h: 5, r: 44, cx: -13, cr: -520, d: 3.2, l: 2.0 },
  { x: 330, y: 88, w: 6, h: 6, r: 0, cx: 11, cr: -500, d: 3.8, l: 0.6, round: true },
  { x: 340, y: 132, w: 6, h: 10, r: -16, cx: 9, cr: 580, d: 4.0, l: 0.5 },
  { x: 358, y: 166, w: 8, h: 5, r: 56, cx: -10, cr: 540, d: 3.6, l: 2.8 },
  { x: 366, y: 26, w: 7, h: 6, r: 20, cx: -15, cr: -460, d: 3.6, l: 1.3 },
  { x: 384, y: 88, w: 5, h: 5, r: 0, cx: -8, cr: 500, d: 3.0, l: 2.4, round: true },
  { x: 10, y: 62, w: 7, h: 11, r: 38, cx: 13, cr: -540, d: 4.2, l: 1.9 },
  { x: 6, y: 126, w: 6, h: 6, r: 0, cx: 9, cr: 420, d: 3.9, l: 0.4, round: true },
];

/** Brand violet, brand blue, the tick's green and a warm accent — the same
    four colours the panel already uses, so the celebration does not introduce
    a palette of its own. */
const CONFETTI_FILL = ['#7c3aed', '#4a5cfb', '#22c55e', '#f59e0b'];

/**
 * THE ROBOT — ONE PICTURE, EVERY STATE.
 *
 * It is his full-body render: the same character as the reference design,
 * standing, with a real transparent background.
 *
 * IT USED TO BE TWO. The working scene drew a CROP of his reference design,
 * where the robot is painted flying and fades into a haze at the waist, and
 * only the finished day drew this one. He asked for the whole body in both —
 * "עכשיו גם שהוא שולח פוסטים … תעשה אותו אם כל הגוף שולח הודעות לקבוצות" — so
 * the crop is no longer drawn anywhere. The file is still in public/social as
 * robot.webp; putting it back is this constant and one href.
 *
 * WHAT THAT COSTS, said plainly rather than discovered later: in the reference
 * design the robot HOLDS a post out towards a group, and this one has its arms
 * at its sides. The post is still drawn, still leaves from its hand, and the
 * body now throws rather than presents — see `anx-send` in globals.css. That
 * is a different gesture from the design, and it is the gesture he asked for.
 *
 * THE NUMBERS ARE THE JUMP'S BUDGET, not a layout preference. The asset is
 * trimmed to its content, so the antenna is the top of this box and the soles
 * are the bottom: feet at y+h = 168, just above the floor, and an eighteen-
 * unit gap above the head for the celebration's hop to spend. The viewBox
 * clips in silence, so that gap is the ceiling on how high the dance may go —
 * see the keyframes in globals.css and the test that measures the antenna
 * against the frame on every sample.
 */
const ROBOT = { x: 68, y: 18, w: 113, h: 150 };
/** The floor it stands on and lands back onto. */
const FLOOR = { x: ROBOT.x + ROBOT.w / 2, y: 173 };
/** Its antenna ball, so the one part of a flat picture that should glow can.
    Read off the asset: the ball spans its top edge, just right of centre. */
const LAMP = { x: ROBOT.x + 0.509 * ROBOT.w, y: ROBOT.y + 5 };
/**
 * ITS RIGHT HAND — where a post leaves from.
 *
 * Measured off the asset rather than placed by eye (0.90 across, 0.69 down),
 * because every dashed path in this scene starts here and a hand-picked point
 * that misses by five units makes four arrows that begin in mid-air.
 */
const HAND = { x: ROBOT.x + 0.9 * ROBOT.w, y: ROBOT.y + 0.69 * ROBOT.h };

/**
 * THE SOFA, AND THE POSE THAT GOES ON IT.
 *
 * "שהרובוט לא בפעולה תרשום מחכה לעבודות, והרובוט עצמו שוכב על ספה רגל על רגל."
 *
 * Most of the day nothing is being published: the queue has rows in it and the
 * next slot has not come round yet. The panel drew the robot hovering through
 * all of it, over a title that read "רובוט בפעולה", so the one screen whose
 * job is to answer "is it actually publishing?" said yes for hours at a time
 * while nothing left the machine. Lying down is the honest picture of that,
 * and the title now says it in words.
 *
 * WHAT IS DRAWN AND WHAT IS THE ASSET. The sofa is drawn here, like the group
 * tiles and the post in flight — it is furniture, not his character, and the
 * rule that has held all along is about the ROBOT. The robot is still his own
 * render, turned onto its back.
 *
 * WHAT IS MISSING, said here rather than in a message that scrolls away: THE
 * LEGS ARE NOT CROSSED. robot-full.webp is one flat picture of a standing
 * robot — rotating it lays the whole body down together, and no transform
 * crosses one leg over the other. That needs a render of the robot in that
 * pose, and it would replace this one constant and one href. I have not drawn
 * a different robot to fake it.
 */
const SOFA = { x: 26, y: 40, w: 196, h: 134 };
/**
 * The lounging transform, written as numbers rather than guessed:
 *
 *   -74°  lays the body down with the head to the LEFT and the feet to the
 *         right, which is the way round the sofa is built — the arm rest the
 *         head rests on is the left one.
 *   0.78  so the 150-unit body becomes a 117-unit figure, which is what fits
 *         between the two arm rests with the shoulders clear of both.
 *   the translate puts the middle of the body on the middle of the seat.
 *
 * ON ITS OWN GROUP, which is not a detail. A CSS animation and a `transform`
 * attribute are the same property and the animated one REPLACES the
 * attribute — the post in flight already shipped that bug once, and it left
 * the post flying out of the corner of the panel. The sway is on the group
 * outside this one; nothing animated touches this transform.
 */
/** The angle, the size and where the middle of the body lands on the seat. */
const LOUNGE_TILT = -5;
const LOUNGE_SCALE = 0.80;
const LOUNGE_AT = { x: 124, y: 100 };
const lounge = (): string => {
  const cx = ROBOT.x + ROBOT.w / 2;
  const cy = ROBOT.y + ROBOT.h / 2;
  return [
    `translate(${(LOUNGE_AT.x - cx).toFixed(2)} ${(LOUNGE_AT.y - cy).toFixed(2)})`,
    `rotate(${LOUNGE_TILT} ${cx} ${cy})`,
    `translate(${cx} ${cy}) scale(${LOUNGE_SCALE}) translate(${-cx} ${-cy})`,
  ].join(' ');
};

/** The four groups, in the staggered arrangement of the reference. */
const TILE = [
  { x: 240, y: 26 },
  { x: 311, y: 46 },
  { x: 260, y: 89 },
  { x: 347, y: 103 },
];
const TILE_SIZE = 48;
const centre = (i: number) => ({ x: TILE[i].x + TILE_SIZE / 2, y: TILE[i].y + TILE_SIZE / 2 });

/**
 * A dashed arc from the presented card to a group, stopping short of the tile
 * so the arrowhead has somewhere to sit rather than being buried under it.
 */
function arc(i: number): string {
  const to = centre(i);
  const dx = to.x - HAND.x;
  const dy = to.y - HAND.y;
  const len = Math.hypot(dx, dy) || 1;
  const end = { x: to.x - (dx / len) * (TILE_SIZE / 2 + 5), y: to.y - (dy / len) * (TILE_SIZE / 2 + 5) };
  const mx = (HAND.x + end.x) / 2;
  const my = (HAND.y + end.y) / 2 - Math.max(12, Math.abs(dx) * 0.2);
  return `M ${HAND.x} ${HAND.y} Q ${mx} ${my} ${end.x} ${end.y}`;
}

/**
 * WHAT THE SCENE IS SHOWING.
 *
 * `done` is the only one of these that CONGRATULATES, so it is the only one
 * whose meaning is worth spelling out here: it is "today has nothing left" —
 * every row the day planned has been through a worker and no row is in a
 * worker's hands right now. LiveCampaignHero works it out from the two numbers
 * printed under the bar, so the dance and the figures can never disagree.
 */
export type SceneMode = 'sending' | 'waiting' | 'paused' | 'idle' | 'done';

export function PublishingScene({
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
  const [target, setTarget] = useState(0);
  const [shown, setShown] = useState(0);
  const seen = useRef(published);

  useEffect(() => {
    const gained = published - seen.current;
    seen.current = published;
    if (gained > 0) {
      /* By the delta: the dashboard re-reads every thirty seconds and the
         worker can publish faster than that, so two or three arrivals land
         between renders. Presenting one would under-report. */
      setTarget((t) => t + gained);
    } else if (gained < 0) {
      setTarget(0);
      setShown(0);
    }
  }, [published]);

  const success = shown < target;
  const active = shown % TILES;

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setShown((s) => s + 1), SUCCESS_HOLD_MS);
    return () => clearTimeout(t);
  }, [success, shown]);

  /*
   * `done` is a working state too — the robot is awake, it simply has nothing
   * left to carry. What it is NOT is `running`: no group is named as a
   * destination, nothing breathes and nothing travels, because nothing is on
   * its way anywhere. `alive` is the smaller claim the two share, which is
   * only that the robot is on screen and moving.
   */
  const celebrating = mode === 'done';
  /*
   * NOTHING IS GOING OUT THIS SECOND, and the system is running — which is
   * most of the day. The robot lies down for it. See SOFA above for what is
   * drawn and what is still missing.
   */
  const resting = mode === 'waiting';
  const running = mode === 'sending' || resting;
  const travelling = mode === 'sending' && !success;
  const to = centre(active);

  return (
    <svg
      viewBox="0 0 400 180"
      role="img"
      aria-label={
        mode === 'paused'
          ? 'הפרסום מושהה'
          : mode === 'idle'
            ? 'אין פרסום פעיל'
            : celebrating
              ? `הרובוט סיים לפרסם — ${published} מתוך ${total} היום`
              : resting
                ? `מחכה לעבודות — ${published} מתוך ${total} פורסמו היום`
                : `מפרסם לקבוצות — ${published} מתוך ${total} היום`
      }
      className="block w-full"
    >
      <defs>
        <linearGradient id="anx-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7b5cf5" />
          <stop offset="100%" stopColor="#2f6fe4" />
        </linearGradient>
        <radialGradient id="anx-lamp">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
        <filter id="anx-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#4c1d95" floodOpacity="0.16" />
        </filter>
        {/*
          TWO MARKERS, NOT ONE WITH currentColor. A marker is its own element:
          `currentColor` inside it resolves against the marker's inherited
          colour — black — and not against the path that references it, which
          is why the first build drew four black arrowheads on purple paths.
        */}
        <marker id="anx-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#c9b8f8" />
        </marker>
        <marker id="anx-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c3aed" />
        </marker>
      </defs>

      {/* ── the trails ──────────────────────────────────────────────────── */}
      {/* Not while the day is finished. They are the path a post takes to a
          group, and nothing is taking it: four dim arrows aimed out of an
          empty space — the flier is not even on screen in that state — read as
          a diagram of something about to happen. */}
      {!celebrating && TILE.map((_, i) => {
        const hot = i === active && travelling;
        return (
          <path
            key={i}
            d={arc(i)}
            fill="none"
            stroke={hot ? '#7c3aed' : '#c9b8f8'}
            strokeOpacity={hot ? 1 : 0.75}
            strokeWidth={hot ? 2.4 : 2}
            strokeLinecap="round"
            strokeDasharray="7 7"
            markerEnd={hot ? 'url(#anx-arrow-hot)' : 'url(#anx-arrow)'}
            className={hot ? 'anx-trail' : undefined}
          />
        );
      })}

      {/* ── the robot ───────────────────────────────────────────────────── */}
      {/*
        ONE PICTURE, THREE MOTIONS, AND THEY HAVE TO BE SEPARATE ELEMENTS.
        
        A raster robot cannot move a limb, so everything it does is a transform
        on the whole of it — and two animations cannot share `transform` on one
        element. So the float is on the outer group, the throw is on an inner
        one, and the shadow below is a third element that does the opposite of
        the float. Nesting is what lets them run at once and at their own
        speeds: a 5-second drift with a 2.4-second throw inside it, which is
        the rhythm the recording has.
        
        THE SHADOW IS WHAT SELLS IT. A body that rises and falls on its own
        reads as a sprite sliding; the same body over a shadow that shrinks and
        fades as it rises reads as a thing in the air. It is the cheapest cue
        in the scene and the one doing most of the work.
      */}
      {mode !== 'idle' && !resting && (
        <ellipse
          className={celebrating ? 'anx-shadow-dance' : running ? 'anx-shadow' : undefined}
          cx={FLOOR.x}
          cy={FLOOR.y}
          rx="40"
          ry="5.5"
          fill="#7c3aed"
          opacity="0.11"
        />
      )}

      {/* ── the sofa ───────────────────────────────────────────────────── */}
      {/*
        BEHIND THE ROBOT, except for the front of the seat, which is drawn
        after it further down — that one strip is what makes the body look
        sunk INTO the cushion rather than laid on top of a picture of one.
      */}
      {resting && (
        <g data-sofa="">
          {/* the shadow the sofa casts, not the robot's */}
          <ellipse cx={SOFA.x + SOFA.w / 2} cy={SOFA.y + SOFA.h + 2} rx={SOFA.w / 2 - 4} ry="5" fill="#4c1d95" opacity="0.1" />
          {/* back rest, with a seam so it reads as upholstery and not a slab */}
          <rect x={SOFA.x + 16} y={SOFA.y} width={SOFA.w - 32} height="78" rx="20" fill="#c3b5f7" />
          <rect x={SOFA.x + 26} y={SOFA.y + 9} width={SOFA.w - 52} height="58" rx="15" fill="#ddd5fc" />
          <path d={`M ${SOFA.x + SOFA.w / 2} ${SOFA.y + 12} v 52`} stroke="#c3b5f7" strokeWidth="2.5" strokeLinecap="round" />
          {/* arm rests */}
          <rect x={SOFA.x} y={SOFA.y + 44} width="34" height="76" rx="16" fill="#b4a2f2" />
          <rect x={SOFA.x + SOFA.w - 34} y={SOFA.y + 44} width="34" height="76" rx="16" fill="#b4a2f2" />
          {/* the seat */}
          <rect x={SOFA.x + 12} y={SOFA.y + 72} width={SOFA.w - 24} height="48" rx="16" fill="#d4c9f9" />
          {/* feet */}
          <rect x={SOFA.x + 20} y={SOFA.y + 116} width="13" height="14" rx="4" fill="#8f7ae8" />
          <rect x={SOFA.x + SOFA.w - 33} y={SOFA.y + 116} width="13" height="14" rx="4" fill="#8f7ae8" />
        </g>
      )}

      {/*
        NO INLINE transform-origin ANYWHERE IN HERE, and that is a fix rather
        than a tidy-up. `transform-box: fill-box` makes a px origin relative to
        the element's own box, and the old `120px 110px` was chosen for the
        212×174 flier. On this 113-wide picture the same offset lands past the
        robot's own shoulder, which would swing every rotation round a point
        outside its body. Each class carries the origin its movement needs:
        `center` for the hover and the dance, the feet for the throw and the
        squash — a body pivots from the ground, not from its waist.
      */}
      <g
        className={
          mode === 'idle'
            ? undefined
            : celebrating
              ? 'anx-dance'
              : resting
                ? 'anx-rest'
                : running
                  ? 'anx-bot'
                  : 'anx-bot-min'
        }
      >
        <g className={celebrating ? 'anx-cheer' : travelling ? 'anx-send' : undefined}>
          {/*
            THE POSE IS AN ATTRIBUTE ON A GROUP NOTHING ANIMATES.
            
            A CSS animation and a `transform` attribute are one property and
            the animated one REPLACES the attribute rather than composing with
            it. The post in flight already shipped that bug once and spent
            weeks flying out of the empty corner of the panel. So the lounge
            is here, with the breathing on the group outside it.
          */}
          <g transform={resting ? lounge() : undefined} data-pose={resting ? 'lounging' : undefined}>
          <image
            href="/social/robot-full.webp"
            x={ROBOT.x}
            y={ROBOT.y}
            width={ROBOT.w}
            height={ROBOT.h}
            preserveAspectRatio="xMidYMid meet"
          />
          {/* The antenna light, INSIDE the group that squashes and throws. A
              flat picture cannot pulse on its own, so the one part of it that
              should is given a soft lamp over the ball — and a lamp left
              outside this group would drift off the antenna by a tenth of the
              robot's height at the bottom of every hop. */}
          {mode !== 'idle' && <circle className="anx-blip" cx={LAMP.x} cy={LAMP.y} r="9" fill="url(#anx-lamp)" />}
          </g>
        </g>
      </g>
      {/* The front of the seat, over the robot: the one strip that makes the
          body look sunk into the cushion rather than laid on a picture of
          one. Drawn after the robot for exactly that reason. */}
      {resting && (
        <g data-seat-front="">
          <rect x={SOFA.x + 12} y={SOFA.y + 100} width={SOFA.w - 24} height="22" rx="11" fill="#c3b5f7" />
          {/* the two arm rests again, in front of the body: an arm resting ON
              one is the cue that says "sitting in it" rather than "standing
              behind it". */}
          <rect x={SOFA.x} y={SOFA.y + 44} width="34" height="76" rx="16" fill="#b4a2f2" />
          <rect x={SOFA.x + SOFA.w - 34} y={SOFA.y + 44} width="34" height="76" rx="16" fill="#b4a2f2" />
        </g>
      )}

      {/* ── the card in flight ─────────────────────────────────────────── */}
      {/*
        Drawn to match the cards the robot is holding — same proportions, same
        purple picture block, same two grey lines — because "אין להחליפו
        במעטפה או באייקון אחר".
      */}
      {/*
        THE STARTING PLACE IS ON THE OUTER GROUP, AND IT HAS TO BE.
        
        A `transform` ATTRIBUTE and a CSS `transform` are the same property,
        and the animated one wins outright — it does not compose with the
        attribute, it replaces it. With both on one element the card ignored
        where it was put and flew out of the scene's own origin instead, which
        on this layout is the empty top-left corner of the panel. It went
        unnoticed for as long as it did because the robot that used to be
        drawn here is painted holding posts of its own: there was always a
        card near its hand, just not this one.
        
        So the hand is a plain translate on a group the animation never
        touches, and `anx-fly` owns the transform of the group inside it.
      */}
      {travelling && (
        <g
          key={`fly-${active}`}
          transform={`translate(${HAND.x - 17} ${HAND.y - 20})`}
          style={{ ['--dx' as string]: `${to.x - HAND.x}px`, ['--dy' as string]: `${to.y - HAND.y}px` }}
        >
          <g data-card="" className="anx-fly">
            <rect x="0" y="0" width="34" height="40" rx="5" fill="#ffffff" filter="url(#anx-soft)" />
            <rect x="4.5" y="4.5" width="25" height="15" rx="3" fill="#c7b6f7" />
            <rect x="9" y="8" width="7" height="7" rx="1.5" fill="#8b7bea" />
            <rect x="18" y="7" width="8" height="8" rx="1.5" fill="#8b7bea" />
            <rect x="4.5" y="23" width="25" height="2.6" rx="1.3" fill="#e4e0f3" />
            <rect x="4.5" y="28.5" width="25" height="2.6" rx="1.3" fill="#e4e0f3" />
            <rect x="4.5" y="34" width="15" height="2.6" rx="1.3" fill="#e4e0f3" />
          </g>
        </g>
      )}

      {/* ── the groups ─────────────────────────────────────────────────── */}
      {TILE.map((t, i) => {
        const isActive = i === active && running;
        const landed = i === active && success;
        const cx = t.x + TILE_SIZE / 2;
        const cy = t.y + TILE_SIZE / 2;
        const inner = { x: t.x + 5, y: t.y + 5, s: TILE_SIZE - 10 };
        return (
          <g key={i}>
            {isActive && (
              <rect
                data-active=""
                className={travelling ? 'anx-halo' : undefined}
                x={t.x - 5}
                y={t.y - 5}
                width={TILE_SIZE + 10}
                height={TILE_SIZE + 10}
                rx="18"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="2"
                strokeOpacity={travelling ? 0.45 : 0.3}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              />
            )}
            <g
              className={landed ? 'anx-land' : travelling && isActive ? 'anx-breathe' : undefined}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            >
              {/* the white card the reference's groups sit on */}
              <rect x={t.x} y={t.y} width={TILE_SIZE} height={TILE_SIZE} rx="14" fill="#ffffff" filter="url(#anx-soft)" />
              <rect x={inner.x} y={inner.y} width={inner.s} height={inner.s} rx="10" fill="url(#anx-tile)" opacity={isActive ? 1 : 0.94} />
              {/* the people glyph */}
              <g transform={`translate(${inner.x + 7} ${inner.y + 11})`} fill="#ffffff">
                <circle cx="9" cy="6" r="4.6" />
                <path d="M1 19 a8 8 0 0 1 16 0 z" />
                <circle cx="19" cy="8" r="3.7" opacity="0.88" />
                <path d="M13 19 a6.6 6.6 0 0 1 12.4 0 z" opacity="0.88" />
              </g>
              {/* the "f" badge, white on the top-left corner of the gradient */}
              <circle cx={inner.x + 1} cy={inner.y + 1} r="7.5" fill="#ffffff" />
              <text x={inner.x + 1} y={inner.y + 4.6} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1877f2">
                f
              </text>
              {/* and the tick — the one mark here that makes a claim */}
              {landed && (
                <g data-tick="" className="anx-tick" style={{ transformOrigin: `${t.x + TILE_SIZE}px ${t.y}px` }}>
                  <circle cx={t.x + TILE_SIZE} cy={t.y} r="10.5" fill="#ffffff" />
                  <circle cx={t.x + TILE_SIZE} cy={t.y} r="8.5" fill="#22c55e" />
                  <path
                    d={`M ${t.x + TILE_SIZE - 4.2} ${t.y} l 3 3.2 l 6 -6.2`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}
            </g>
          </g>
        );
      })}

      {/* ── the confetti ───────────────────────────────────────────────── */}
      {/*
        LAST IN THE DOCUMENT, so it falls in FRONT of the robot and the groups
        — SVG has no z-index, paint order is document order, and confetti that
        goes behind everything reads as a pattern on the card rather than as
        something in the air.

        It is drawn only in `done`. There is no "celebrate for a few seconds
        and stop": the state it marks is not a moment, it is how the rest of
        the day looks, and a dashboard he opens at 20:00 should still tell him
        the round finished. It costs fourteen elements animating transform and
        opacity, which is the pair the compositor handles without laying the
        page out again.
      */}
      {celebrating &&
        CONFETTI.map((c, i) => {
          const style = {
            ['--anx-cx' as string]: `${c.cx}px`,
            ['--anx-cr' as string]: `${c.cr}deg`,
            ['--anx-cd' as string]: `${c.d}s`,
            ['--anx-cl' as string]: `${c.l}s`,
          };
          const fill = CONFETTI_FILL[i % CONFETTI_FILL.length];
          return c.round ? (
            <circle
              key={`c${i}`}
              data-confetti=""
              className="anx-confetti"
              cx={c.x}
              cy={c.y}
              r={c.w / 2}
              fill={fill}
              opacity="0.9"
              style={style}
            />
          ) : (
            <rect
              key={`c${i}`}
              data-confetti=""
              className="anx-confetti"
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              rx="1.4"
              fill={fill}
              opacity="0.9"
              transform={`rotate(${c.r} ${c.x + c.w / 2} ${c.y + c.h / 2})`}
              style={style}
            />
          );
        })}
    </svg>
  );
}
