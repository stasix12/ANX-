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

/** The robot, placed to the measurements taken off the reference recording. */
const BOT = { x: 18, y: 2, w: 212, h: 174 };
/** Its antenna light, so the one part of a flat image that should glow can. */
const LAMP = { x: 115, y: 24 };
/** The card it presents — where everything leaves from. */
const HAND = { x: 200, y: 96 };

/**
 * AND THE ROBOT THAT DANCES, WHICH IS A DIFFERENT PICTURE ON PURPOSE.
 *
 * "בריקוד שיראו גם את הרגלים שלו." The working robot has none: it is a crop
 * of his design, where the body is drawn flying and fades into the haze at the
 * waist. He then sent the full-body render — the same character, standing,
 * with a transparent background — and that is this box.
 *
 * TWO PICTURES RATHER THAN ONE, because they are two poses and each is right
 * for one thing. The flying one is holding a card out towards a group, which
 * is the whole of the working scene; a standing figure cannot present
 * anything. The standing one has feet to leave the ground with, which is the
 * whole of the dance. Swapping either into the other's state would lose the
 * thing that state is about.
 *
 * THE NUMBERS ARE THE JUMP'S BUDGET, not a layout preference. The asset is
 * trimmed to its content, so the antenna is at the top of this box and the
 * soles are at the bottom: feet at y+h = 168, just above the floor shadow, and
 * an eighteen-unit gap above the head for the hop to spend. The viewBox clips,
 * so that gap is the ceiling on how high the dance may go — see the keyframes
 * in globals.css, and the test that measures the antenna against the frame.
 */
const DANCER = { x: 68, y: 18, w: 113, h: 150 };
/** The floor it lands on, under its own feet rather than under the flier. */
const FLOOR = { x: DANCER.x + DANCER.w / 2, y: 173 };
/** Its antenna ball, which sits where this asset's does and not where the
    flying one's did. */
const DANCE_LAMP = { x: DANCER.x + 0.509 * DANCER.w, y: DANCER.y + 5 };

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
  const running = mode === 'sending' || mode === 'waiting';
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
      {mode !== 'idle' && (
        <ellipse
          className={celebrating ? 'anx-shadow-dance' : running ? 'anx-shadow' : undefined}
          cx={celebrating ? FLOOR.x : BOT.x + BOT.w / 2 - 12}
          cy={celebrating ? FLOOR.y : 166}
          rx={celebrating ? 40 : 46}
          ry={celebrating ? 5.5 : 6}
          fill="#7c3aed"
          opacity="0.11"
          /* The hover's shadow keeps the origin it has always had. The dance's
             is left to the stylesheet, which puts it at the centre of the
             ellipse's own box — correct for something that collapses in place
             under a body leaving the ground. */
          style={celebrating ? undefined : { transformOrigin: `${BOT.x + BOT.w / 2 - 12}px 166px` }}
        />
      )}
      <g
        className={
          mode === 'idle' ? undefined : celebrating ? 'anx-dance' : running ? 'anx-bot' : 'anx-bot-min'
        }
        /*
          THE HOVER KEEPS ITS ORIGIN; THE DANCE TAKES THE STYLESHEET'S.
          
          `transform-box: fill-box` makes these px offsets relative to the
          group's own box, and the two boxes are different pictures — 120,110
          lands near the middle of the 212×174 flier and well outside the
          113×150 dancer, which would swing it round a point past its own
          shoulder. The classes carry the right origin for each: `center` for
          the dance, and the feet for the squash below.
        */
        style={celebrating ? undefined : { transformOrigin: '120px 110px' }}
      >
        <g
          className={celebrating ? 'anx-cheer' : travelling ? 'anx-send' : undefined}
          style={celebrating ? undefined : { transformOrigin: '120px 110px' }}
        >
          {celebrating ? (
            <>
              <image
                href="/social/robot-dance.webp"
                x={DANCER.x}
                y={DANCER.y}
                width={DANCER.w}
                height={DANCER.h}
                preserveAspectRatio="xMidYMid meet"
              />
              {/* Inside the squash, unlike the flier's: this one is anchored at
                  the feet, so the head travels when the body compresses, and a
                  lamp left outside would drift off the antenna by a tenth of
                  the robot's height at the bottom of every hop. */}
              <circle className="anx-blip" cx={DANCE_LAMP.x} cy={DANCE_LAMP.y} r="9" fill="url(#anx-lamp)" />
            </>
          ) : (
            <image
              href="/social/robot.webp"
              x={BOT.x}
              y={BOT.y}
              width={BOT.w}
              height={BOT.h}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
        </g>
        {/* The antenna light. A flat picture cannot pulse on its own, so the
            one part of it that should is given a soft lamp over the ball. */}
        {running && <circle className="anx-blip" cx={LAMP.x} cy={LAMP.y} r="10" fill="url(#anx-lamp)" />}
      </g>

      {/* ── the card in flight ─────────────────────────────────────────── */}
      {/*
        Drawn to match the cards the robot is holding — same proportions, same
        purple picture block, same two grey lines — because "אין להחליפו
        במעטפה או באייקון אחר".
      */}
      {travelling && (
        <g
          key={`fly-${active}`}
          style={{ ['--dx' as string]: `${to.x - HAND.x}px`, ['--dy' as string]: `${to.y - HAND.y}px` }}
        >
          <g data-card="" className="anx-fly" transform={`translate(${HAND.x - 17} ${HAND.y - 20})`}>
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
