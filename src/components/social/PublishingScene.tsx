'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * THE ROBOT THAT IS ACTUALLY SENDING HIS POSTS.
 *
 * The panel said "מפרסם כעת לקבוצות פייסבוק" over a number and a bar, and the
 * one thing it could not do was make the owner FEEL that something was
 * happening on his behalf right now. This is that feeling, built out of the
 * interface itself.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IT IS NOT A PICTURE, AND IT DOES NOT INVENT EVENTS.
 *
 * Two rules, and the second is the one that matters:
 *
 *   1. EVERY MARK IS SVG AND CSS. No GIF, no video, no exported illustration
 *      standing in for an animation. So it is sharp at every width, it costs
 *      nothing to download — which, on an account that has already been cut off
 *      once for egress, is not a stylistic preference — and it can be driven by
 *      state rather than played back.
 *
 *   2. NOTHING HERE CLAIMS A PUBLICATION THAT DID NOT HAPPEN. The card in
 *      flight is an idle loop: it says "the worker is busy", which is exactly
 *      what `mode === 'sending'` means, and it is allowed to be decorative
 *      because it asserts nothing. A GREEN TICK IS DIFFERENT — a tick says a
 *      post landed in a group — so ticks advance ONLY when `published` really
 *      goes up, and that number comes from the database. If the worker stalls,
 *      the card keeps flying and not one tick appears.
 *
 * The scene is one <svg> with a viewBox, so the proportions in the design —
 * robot size, where the tiles sit, how far the paths run — hold at 320px and at
 * 1280px without a single breakpoint. The reference was drawn once; this keeps
 * its geometry everywhere.
 *
 * Every animation is switched off under prefers-reduced-motion (globals.css).
 * The scene stays, the robot stops moving, and the ticks still land — the state
 * is in the shapes, not in the motion.
 */

/** How many groups the scene draws. Four is the reference's arrangement. */
const TILES = 4;

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
  /** What today holds — used for the label under the scene, never for a tick. */
  total: number;
}) {
  /*
   * HOW MANY TILES CARRY A TICK.
   *
   * Seeded from the real count so a page opened at noon does not show an empty
   * scene over sixteen finished publications, and advanced only when
   * `published` rises. It wraps at four and starts the row again, because four
   * tiles cannot hold two hundred and seventy-nine groups and pretending
   * otherwise would be the bar lying in a second place.
   */
  const [ticks, setTicks] = useState(() => Math.min(TILES, Math.max(0, published)));
  /* Bumped on every real landing, so the pulse restarts even when the tile
     index repeats. It is a key, not a count. */
  const [beat, setBeat] = useState(0);
  const seen = useRef(published);

  useEffect(() => {
    if (published <= seen.current) {
      /* A smaller number is a new day, or a different campaign in view. Reset
         rather than hold ticks that belong to something else. */
      if (published < seen.current) setTicks(Math.min(TILES, Math.max(0, published)));
      seen.current = published;
      return;
    }
    /*
     * ADVANCED BY THE DELTA, not by one.
     *
     * The dashboard re-reads every thirty seconds and the worker publishes
     * faster than that, so two or three publications routinely land between
     * two renders. Stepping one tile per render would show one arrival where
     * three happened — the scene quietly under-reporting, which is the same
     * class of untruth as over-reporting and harder to notice.
     */
    const gained = published - seen.current;
    seen.current = published;
    setTicks((t) => {
      const n = t + gained;
      return n > TILES ? ((n - 1) % TILES) + 1 : n;
    });
    setBeat((b) => b + 1);
  }, [published]);

  const moving = mode === 'sending';
  const alive = mode === 'sending' || mode === 'waiting';
  /* The tile the next landing will fill — lit while the card is on its way. */
  const target = ticks >= TILES ? 0 : ticks;
  const justLanded = ticks - 1;

  const to = centre(target);

  return (
    <div className="relative">
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

        {/* The soft wash the reference carries behind the robot. */}
        <ellipse cx="150" cy="196" rx="104" ry="13" fill="#7c3aed" opacity="0.07" />

        {/* ── the trails ────────────────────────────────────────────────── */}
        {TILE.map((_, i) => (
          <path
            key={i}
            d={arc(i)}
            fill="none"
            stroke={i === target && moving ? '#7c3aed' : '#c4b5fd'}
            strokeOpacity={i === target && moving ? 0.9 : 0.45}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="1 9"
            className={i === target && moving ? 'anx-trail' : undefined}
          />
        ))}

        {/* ── the robot ─────────────────────────────────────────────────── */}
        <g className={alive ? 'anx-bot' : undefined}>
          {/* antenna */}
          <path d="M104 44 L104 30" stroke="#7c3aed" strokeWidth="4" strokeLinecap="round" />
          <circle cx="104" cy="25" r="7" fill="#7c3aed" className={alive ? 'anx-blip' : undefined} />

          {/* ear pods */}
          <rect x="52" y="66" width="18" height="30" rx="9" fill="#7c3aed" />
          <rect x="138" y="66" width="18" height="30" rx="9" fill="#a78bfa" />

          {/* head */}
          <rect x="62" y="44" width="84" height="62" rx="24" fill="#ffffff" stroke="#e7e2f7" strokeWidth="2" filter="url(#anx-soft)" />
          <rect x="72" y="56" width="64" height="38" rx="17" fill="url(#anx-visor)" />
          {/* the two happy arcs the reference has for eyes */}
          <g className={alive ? 'anx-eyes' : undefined} fill="none" stroke="#6ee7ff" strokeWidth="5" strokeLinecap="round">
            <path d="M86 78 q6 -11 12 0" />
            <path d="M110 78 q6 -11 12 0" />
          </g>

          {/* body */}
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

          {/* the sending arm — it is the one that moves */}
          <g className={moving ? 'anx-arm' : undefined} style={{ transformOrigin: '140px 124px' }}>
            <rect x="138" y="118" width="30" height="12" rx="6" fill="#a78bfa" />
            <g transform="translate(160 100)">
              <rect x="0" y="0" width="32" height="38" rx="6" fill="#ffffff" stroke="#e7e2f7" strokeWidth="2" />
              <rect x="5" y="5" width="22" height="12" rx="3" fill="#ddd6fe" />
              <rect x="5" y="21" width="22" height="2.8" rx="1.4" fill="#e7e2f7" />
              <rect x="5" y="27" width="14" height="2.8" rx="1.4" fill="#e7e2f7" />
            </g>
          </g>
        </g>

        {/* ── the card in flight ───────────────────────────────────────── */}
        {/*
          Decorative on purpose: it says the worker is busy, which is what
          `sending` means, and it asserts nothing about any one group. The ticks
          below are what make a claim, and they are driven by the database.
        */}
        {moving && (
          <g
            key={`${target}-${beat}`}
            className="anx-fly"
            style={{ ['--dx' as string]: `${to.x - HAND.x}px`, ['--dy' as string]: `${to.y - HAND.y}px` }}
          >
            <g transform={`translate(${HAND.x - 11} ${HAND.y - 13})`}>
              <rect x="0" y="0" width="22" height="26" rx="5" fill="#ffffff" stroke="#c4b5fd" strokeWidth="2" />
              <rect x="4" y="4" width="14" height="8" rx="2" fill="#ddd6fe" />
              <rect x="4" y="15" width="14" height="2" rx="1" fill="#e7e2f7" />
              <rect x="4" y="19" width="9" height="2" rx="1" fill="#e7e2f7" />
            </g>
          </g>
        )}

        {/* ── the groups ───────────────────────────────────────────────── */}
        {TILE.map((t, i) => {
          const hasTick = i < ticks;
          const landed = i === justLanded;
          return (
            <g key={i} className={landed ? 'anx-land' : undefined} style={{ transformOrigin: `${t.x + TILE_SIZE / 2}px ${t.y + TILE_SIZE / 2}px` }}>
              <rect
                x={t.x}
                y={t.y}
                width={TILE_SIZE}
                height={TILE_SIZE}
                rx="15"
                fill="url(#anx-tile)"
                filter="url(#anx-soft)"
                opacity={i === target && moving ? 1 : 0.92}
              />
              {/* the people glyph */}
              <g transform={`translate(${t.x + 12} ${t.y + 15})`} fill="#ffffff">
                <circle cx="10" cy="7" r="5.2" />
                <path d="M1 22 a9 9 0 0 1 18 0 z" />
                <circle cx="21" cy="9" r="4.2" opacity="0.85" />
                <path d="M14 22 a7.5 7.5 0 0 1 14 0 z" opacity="0.85" />
              </g>
              {/* the "f" badge */}
              <circle cx={t.x + 11} cy={t.y + 11} r="8" fill="#ffffff" />
              <text x={t.x + 11} y={t.y + 15} textAnchor="middle" fontSize="11" fontWeight="800" fill="#1877f2">
                f
              </text>
              {/* and the tick — the one mark here that makes a claim */}
              {hasTick && (
                <g key={`t-${i}-${beat}`} className={landed ? 'anx-tick' : undefined} style={{ transformOrigin: `${t.x + TILE_SIZE - 10}px ${t.y + 10}px` }}>
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
          );
        })}
      </svg>
    </div>
  );
}
