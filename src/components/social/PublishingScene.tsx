'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * THE ROBOT THAT IS ACTUALLY SENDING HIS POSTS.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IT IS NOT A PICTURE, AND IT DOES NOT INVENT EVENTS.
 *
 *   1. EVERY MARK IS SVG AND CSS. No GIF, no video, no exported illustration
 *      standing in for an animation. Sharp at every width, nothing to download
 *      — which on an account already cut off once for egress is not a
 *      stylistic preference — and drivable by state rather than played back.
 *
 *   2. NOTHING HERE CLAIMS A PUBLICATION THAT DID NOT HAPPEN. The card in
 *      flight is an idle loop: it says "a worker is holding a row", which is
 *      what `mode === 'sending'` means, and it may loop because it asserts
 *      nothing. A GREEN TICK ASSERTS THAT A POST LANDED IN A GROUP, so ticks
 *      move only when `published` really rises — and that number comes from
 *      the database. If the worker stalls, the card keeps flying and not one
 *      tick appears.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE SEQUENCE, AND WHY IT IS BUILT THIS WAY.
 *
 * "Do NOT permanently show green checkmarks on all group cards." The first
 * version seeded a tick per publication already finished today, so by noon all
 * four groups wore one and the mark meant nothing — a tick that is always
 * there cannot report an arrival.
 *
 * So a tick is now an EVENT with a life:
 *
 *   `target` counts the real publications seen since this card mounted.
 *   `shown`  counts the ones whose arrival has been presented.
 *
 * While `shown < target` a publication is being presented: the tile at
 * `shown % 4` is the active destination, it takes the delivery and wears the
 * tick for a beat. When the beat ends `shown` catches up, the tick goes, and
 * the NEXT tile becomes active and waits — bare, as it must be, because
 * nothing has landed there yet. Three publications arriving together are
 * presented one after another rather than collapsed into one, and a quiet
 * afternoon shows no tick at all.
 *
 * Every animation is switched off under prefers-reduced-motion (globals.css).
 * The scene stays and the state stays legible: the active destination keeps
 * its ring and a landed tick is still drawn. The state was never in the motion.
 */

/** How many groups the scene draws. Four is the reference's arrangement. */
const TILES = 4;

/** How long one arrival is held on screen before the next group takes over. */
const SUCCESS_HOLD_MS = 2400;

/** Where the cards leave from — the robot's raised hand, in viewBox units. */
const HAND = { x: 196, y: 104 };

/** The four group tiles, in the staggered pattern of the reference. */
const TILE = [
  { x: 248, y: 24 },
  { x: 320, y: 62 },
  { x: 250, y: 112 },
  { x: 322, y: 150 },
];
const TILE_SIZE = 52;
const centre = (i: number) => ({ x: TILE[i].x + TILE_SIZE / 2, y: TILE[i].y + TILE_SIZE / 2 });

/**
 * A gentle arc from the hand to a tile.
 *
 * Quadratic, with the control point lifted above the straight line, so the
 * dotted trail reads as a throw rather than a wire. The lift grows with the
 * distance, which keeps the four paths looking like one family.
 */
function arc(i: number): string {
  const to = centre(i);
  const mx = (HAND.x + to.x) / 2;
  const my = (HAND.y + to.y) / 2 - Math.max(16, Math.abs(to.x - HAND.x) * 0.22);
  return `M ${HAND.x} ${HAND.y} Q ${mx} ${my} ${to.x} ${to.y}`;
}

export type SceneMode =
  /** A publication is in flight right now. */
  | 'sending'
  /** Running, but between publications — the gap the rules engine enforces. */
  | 'waiting'
  /** The owner switched publishing off. */
  | 'paused'
  /** Nothing scheduled, or the system is not running. */
  | 'idle';

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
  /* Real arrivals seen since mount, and how many have been presented. */
  const [target, setTarget] = useState(0);
  const [shown, setShown] = useState(0);
  const seen = useRef(published);

  useEffect(() => {
    const gained = published - seen.current;
    seen.current = published;
    if (gained > 0) {
      /*
       * BY THE DELTA, not by one. The dashboard re-reads every thirty seconds
       * and the worker can publish faster than that, so two or three arrivals
       * routinely land between renders. Presenting one would under-report —
       * the same class of untruth as over-reporting, and harder to notice.
       */
      setTarget((t) => t + gained);
    } else if (gained < 0) {
      /* A smaller number is a new day, or a different campaign in view. */
      setTarget(0);
      setShown(0);
    }
  }, [published]);

  /** An arrival is being presented right now. */
  const success = shown < target;
  /** The one group the robot is working on. Bare until something lands. */
  const active = shown % TILES;

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setShown((s) => s + 1), SUCCESS_HOLD_MS);
    return () => clearTimeout(t);
  }, [success, shown]);

  const running = mode === 'sending' || mode === 'waiting';
  /* The card travels only while a row is really in flight, and not during the
     beat in which its arrival is being shown — it has already landed. */
  const travelling = mode === 'sending' && !success;
  const to = centre(active);

  return (
    <svg
      viewBox="0 0 400 230"
      role="img"
      aria-label={
        mode === 'paused'
          ? 'הפרסום מושהה'
          : mode === 'idle'
            ? 'אין פרסום פעיל'
            : `מפרסם לקבוצות — ${published} מתוך ${total} היום`
      }
      className="block w-full"
    >
      <defs>
        <linearGradient id="anx-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="anx-visor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e2a4a" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="anx-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ede9fe" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="anx-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#4c1d95" floodOpacity="0.14" />
        </filter>
      </defs>

      <ellipse cx="150" cy="196" rx="104" ry="13" fill="#7c3aed" opacity="0.07" />

      {/* ── the trails ──────────────────────────────────────────────────── */}
      {/*
        All four stay drawn so the scene keeps its shape, and only the one in
        use carries the flow. Direction is the information, which is the whole
        reason these are dashed rather than solid.
      */}
      {TILE.map((_, i) => {
        const hot = i === active && travelling;
        return (
          <path
            key={i}
            d={arc(i)}
            fill="none"
            stroke={hot ? '#7c3aed' : '#c4b5fd'}
            strokeOpacity={hot ? 1 : 0.55}
            strokeWidth={hot ? 2.6 : 2}
            strokeLinecap="round"
            strokeDasharray="2 9"
            className={hot ? 'anx-trail' : undefined}
          />
        );
      })}

      {/* ── the robot ───────────────────────────────────────────────────── */}
      {/*
        Two idle weights. A running system breathes; a paused one keeps the
        smaller, slower movement — it is switched off, not broken — and nothing
        else about it moves.
      */}
      <g className={mode === 'idle' ? undefined : running ? 'anx-bot' : 'anx-bot-min'}>
        <g className={running ? 'anx-head' : undefined} style={{ transformOrigin: '104px 100px' }}>
          <path d="M104 44 L104 30" stroke="#7c3aed" strokeWidth="4" strokeLinecap="round" />
          <circle cx="104" cy="25" r="7" fill="#7c3aed" className={running ? 'anx-blip' : undefined} />
          <rect x="52" y="66" width="18" height="30" rx="9" fill="#7c3aed" />
          <rect x="138" y="66" width="18" height="30" rx="9" fill="#a78bfa" />
          <rect x="62" y="44" width="84" height="62" rx="24" fill="#ffffff" stroke="#e7e2f7" strokeWidth="2" filter="url(#anx-soft)" />
          <rect x="72" y="56" width="64" height="38" rx="17" fill="url(#anx-visor)" />
          <g className={running ? 'anx-eyes' : undefined} fill="none" stroke="#6ee7ff" strokeWidth="5" strokeLinecap="round">
            <path d="M86 78 q6 -11 12 0" />
            <path d="M110 78 q6 -11 12 0" />
          </g>
        </g>

        <rect x="70" y="112" width="70" height="56" rx="20" fill="#ffffff" stroke="#e7e2f7" strokeWidth="2" filter="url(#anx-soft)" />
        <rect x="70" y="112" width="70" height="26" rx="13" fill="url(#anx-sheen)" />
        <text x="105" y="146" textAnchor="middle" fontSize="13" fontWeight="800" fill="#7c3aed" letterSpacing="1">
          ANX
        </text>

        {/* the resting arm, and the card it keeps */}
        <g>
          <rect x="46" y="122" width="26" height="12" rx="6" fill="#c4b5fd" />
          <g transform="translate(26 126) rotate(-9)">
            <rect x="0" y="0" width="30" height="36" rx="6" fill="#ffffff" stroke="#e7e2f7" strokeWidth="2" />
            <rect x="5" y="5" width="20" height="11" rx="3" fill="#ddd6fe" />
            <rect x="5" y="20" width="20" height="2.6" rx="1.3" fill="#e7e2f7" />
            <rect x="5" y="26" width="13" height="2.6" rx="1.3" fill="#e7e2f7" />
          </g>
        </g>

        {/*
          The sending arm. It THROWS while a row is in flight and, between
          publications, makes the smaller movement of readying the next one —
          which is the difference between "sending" and "waiting" stated in the
          one place a glance lands.
        */}
        <g
          className={travelling ? 'anx-arm' : running ? 'anx-prep' : undefined}
          style={{ transformOrigin: '140px 124px' }}
        >
          <rect x="138" y="118" width="30" height="12" rx="6" fill="#a78bfa" />
          <g transform="translate(160 100)">
            <rect x="0" y="0" width="32" height="38" rx="6" fill="#ffffff" stroke="#e7e2f7" strokeWidth="2" />
            <rect x="5" y="5" width="22" height="12" rx="3" fill="#ddd6fe" />
            <rect x="5" y="21" width="22" height="2.8" rx="1.4" fill="#e7e2f7" />
            <rect x="5" y="27" width="14" height="2.8" rx="1.4" fill="#e7e2f7" />
          </g>
        </g>
      </g>

      {/* ── the card in flight ─────────────────────────────────────────── */}
      {travelling && (
        <g
          key={`fly-${active}`}
          style={{ ['--dx' as string]: `${to.x - HAND.x}px`, ['--dy' as string]: `${to.y - HAND.y}px` }}
        >
          {/* A small light runs just ahead of the card, on the same arc. No
              glow filter — a blur here costs a repaint every frame on a phone
              and reads as smear rather than as light. */}
          <circle className="anx-spark" cx={HAND.x} cy={HAND.y} r="3" fill="#7c3aed" opacity="0.55" />
          <g data-card="" className="anx-fly" transform={`translate(${HAND.x - 14} ${HAND.y - 17})`}>
            <rect x="0" y="0" width="28" height="34" rx="6" fill="#ffffff" stroke="#a78bfa" strokeWidth="2" />
            <rect x="5" y="5" width="18" height="11" rx="3" fill="#ddd6fe" />
            <rect x="5" y="20" width="18" height="2.6" rx="1.3" fill="#e7e2f7" />
            <rect x="5" y="25" width="11" height="2.6" rx="1.3" fill="#e7e2f7" />
          </g>
        </g>
      )}

      {/* ── the groups ─────────────────────────────────────────────────── */}
      {TILE.map((t, i) => {
        const isActive = i === active && running;
        const landed = i === active && success;
        const cx = t.x + TILE_SIZE / 2;
        const cy = t.y + TILE_SIZE / 2;
        return (
          <g key={i}>
            {/* The soft ring that says WHICH group, drawn under the tile. */}
            {isActive && (
              <rect
                /* A hook the layout test counts: there must be exactly ONE
                   active destination at any instant, in every running state —
                   and the class it carries only exists while travelling. */
                data-active=""
                className={travelling ? 'anx-halo' : undefined}
                x={t.x - 6}
                y={t.y - 6}
                width={TILE_SIZE + 12}
                height={TILE_SIZE + 12}
                rx="20"
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
              <rect
                x={t.x}
                y={t.y}
                width={TILE_SIZE}
                height={TILE_SIZE}
                rx="15"
                fill="url(#anx-tile)"
                filter="url(#anx-soft)"
                opacity={isActive ? 1 : 0.86}
              />
              <g transform={`translate(${t.x + 12} ${t.y + 15})`} fill="#ffffff">
                <circle cx="10" cy="7" r="5.2" />
                <path d="M1 22 a9 9 0 0 1 18 0 z" />
                <circle cx="21" cy="9" r="4.2" opacity="0.85" />
                <path d="M14 22 a7.5 7.5 0 0 1 14 0 z" opacity="0.85" />
              </g>
              <circle cx={t.x + 11} cy={t.y + 11} r="8" fill="#ffffff" />
              <text x={t.x + 11} y={t.y + 15} textAnchor="middle" fontSize="11" fontWeight="800" fill="#1877f2">
                f
              </text>
              {/*
                THE ONE MARK HERE THAT MAKES A CLAIM. Drawn only while a real
                arrival is being presented, on the group it arrived at — never
                seeded, never left behind on all four.
              */}
              {landed && (
                <g data-tick="" className="anx-tick" style={{ transformOrigin: `${t.x + TILE_SIZE - 10}px ${t.y + 10}px` }}>
                  <circle cx={t.x + TILE_SIZE - 10} cy={t.y + 10} r="10" fill="#ffffff" />
                  <circle cx={t.x + TILE_SIZE - 10} cy={t.y + 10} r="8" fill="#12b76a" />
                  <path
                    d={`M ${t.x + TILE_SIZE - 14} ${t.y + 10} l 3 3 l 6 -6`}
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
    </svg>
  );
}
