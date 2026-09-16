/**
 * Placeholder artwork for the before/after gallery and the service cards.
 *
 * Illustrations rather than grey "image coming soon" boxes on purpose: a
 * numbered placeholder in the middle of a sales page kills trust, while a
 * clean drawing reads as intentional design until the real photos arrive.
 * Every scene is drawn twice – `before` (faded fabric, stains, dust) and
 * `after` (saturated, spotless, a few sparkles) – so the drag slider has a
 * real difference to reveal. Swap in photos by filling `before`/`after`
 * paths in config.ts; the components fall back to these automatically.
 */

export type SceneKind = 'sofa' | 'mattress' | 'armchair' | 'chair' | 'car' | 'carpet' | 'stroller';

const LABELS: Record<SceneKind, string> = {
  sofa: 'ספה',
  mattress: 'מזרן',
  armchair: 'כורסה',
  chair: 'כיסא פינת אוכל',
  car: 'מושב רכב',
  carpet: 'שטיח',
  stroller: 'עגלת תינוק',
};

export function sceneLabel(kind: SceneKind, variant: 'before' | 'after'): string {
  return variant === 'before'
    ? `${LABELS[kind]} לפני הניקוי – כתמים ולכלוך`
    : `${LABELS[kind]} אחרי הניקוי – נקי ורענן`;
}

function Stains({ spots, dirty }: { spots: [number, number, number, number][]; dirty: boolean }) {
  if (!dirty) return null;
  return (
    <g filter="url(#blurStain)" fill="#5b4632" opacity="0.5">
      {spots.map(([cx, cy, rx, ry], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} />
      ))}
    </g>
  );
}

function Sparkles({ dirty, points }: { dirty: boolean; points: [number, number, number][] }) {
  if (dirty) return null;
  return (
    <g fill="#ffffff" opacity="0.95">
      {points.map(([x, y, s], i) => (
        <path
          key={i}
          d={`M${x} ${y - s} q${s * 0.15} ${s * 0.85} ${s} ${s} q-${s * 0.85} ${s * 0.15} -${s} ${s} q-${s * 0.15} -${s * 0.85} -${s} -${s} q${s * 0.85} -${s * 0.15} ${s} -${s}z`}
        />
      ))}
    </g>
  );
}

function Room({ dirty, children }: { dirty: boolean; children: React.ReactNode }) {
  return (
    <>
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dirty ? '#e3e1da' : '#f1f6fd'} />
          <stop offset="1" stopColor={dirty ? '#d5d2c8' : '#e2ecf9'} />
        </linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dirty ? '#c9c2b3' : '#dfe8f4'} />
          <stop offset="1" stopColor={dirty ? '#b9b2a2' : '#cbd8ea'} />
        </linearGradient>
        <filter id="blurStain" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <rect width="800" height="500" fill="url(#wall)" />
      <rect y="350" width="800" height="150" fill="url(#floor)" />
      {children}
    </>
  );
}

function Sofa({ dirty }: { dirty: boolean }) {
  const a = dirty ? '#8a939b' : '#2e6fd8';
  const b = dirty ? '#727b83' : '#1f57b8';
  const c = dirty ? '#9aa3aa' : '#4f8ff0';
  return (
    <>
      <ellipse cx="400" cy="372" rx="330" ry="26" fill="#000" opacity="0.18" filter="url(#softShadow)" />
      <rect x="140" y="150" width="520" height="190" rx="30" fill={b} />
      <rect x="120" y="255" width="560" height="110" rx="26" fill={a} />
      <rect x="168" y="178" width="220" height="96" rx="20" fill={c} />
      <rect x="412" y="178" width="220" height="96" rx="20" fill={c} />
      <rect x="96" y="218" width="76" height="147" rx="26" fill={b} />
      <rect x="628" y="218" width="76" height="147" rx="26" fill={b} />
      <rect x="150" y="365" width="26" height="30" rx="6" fill="#4b5563" />
      <rect x="624" y="365" width="26" height="30" rx="6" fill="#4b5563" />
      <Stains
        dirty={dirty}
        spots={[
          [250, 215, 36, 20],
          [284, 236, 18, 11],
          [505, 205, 28, 16],
          [560, 242, 20, 12],
          [330, 300, 44, 16],
          [455, 306, 30, 13],
        ]}
      />
      <Sparkles
        dirty={dirty}
        points={[
          [230, 130, 12],
          [590, 120, 9],
          [700, 200, 7],
          [120, 190, 6],
        ]}
      />
    </>
  );
}

function Armchair({ dirty }: { dirty: boolean }) {
  const a = dirty ? '#9a9187' : '#0f8f84';
  const b = dirty ? '#84796f' : '#0b7168';
  const c = dirty ? '#aaa199' : '#2ec4b6';
  return (
    <>
      <ellipse cx="400" cy="372" rx="200" ry="22" fill="#000" opacity="0.18" filter="url(#softShadow)" />
      <rect x="280" y="120" width="240" height="210" rx="32" fill={b} />
      <rect x="305" y="150" width="190" height="120" rx="22" fill={c} />
      <rect x="250" y="230" width="300" height="130" rx="28" fill={a} />
      <rect x="222" y="206" width="64" height="154" rx="24" fill={b} />
      <rect x="514" y="206" width="64" height="154" rx="24" fill={b} />
      <rect x="285" y="360" width="22" height="30" rx="6" fill="#4b5563" />
      <rect x="494" y="360" width="22" height="30" rx="6" fill="#4b5563" />
      <Stains
        dirty={dirty}
        spots={[
          [380, 200, 30, 18],
          [430, 226, 17, 10],
          [360, 292, 34, 14],
          [455, 300, 22, 11],
        ]}
      />
      <Sparkles dirty={dirty} points={[[250, 120, 11], [560, 110, 8], [610, 220, 6]]} />
    </>
  );
}

function Mattress({ dirty }: { dirty: boolean }) {
  const top = dirty ? '#d9d2c2' : '#ffffff';
  const side = dirty ? '#bdb5a3' : '#dfe8f5';
  const stitch = dirty ? '#a99f8c' : '#9fc2ea';
  return (
    <>
      <ellipse cx="400" cy="372" rx="320" ry="22" fill="#000" opacity="0.16" filter="url(#softShadow)" />
      <rect x="110" y="160" width="580" height="150" rx="22" fill={top} />
      <rect x="110" y="290" width="580" height="60" rx="18" fill={side} />
      <g fill="none" stroke={stitch} strokeWidth="3" opacity="0.8">
        {[190, 300, 410, 520, 610].map((x) => (
          <path key={x} d={`M${x} 185q26 34 0 100`} />
        ))}
        <path d="M130 300h540" />
      </g>
      <rect x="140" y="350" width="24" height="40" rx="6" fill="#4b5563" />
      <rect x="636" y="350" width="24" height="40" rx="6" fill="#4b5563" />
      <Stains
        dirty={dirty}
        spots={[
          [290, 230, 44, 20],
          [332, 250, 22, 11],
          [520, 220, 32, 16],
          [470, 275, 26, 10],
        ]}
      />
      <Sparkles dirty={dirty} points={[[200, 120, 12], [600, 110, 9], [720, 200, 6]]} />
    </>
  );
}

function Chair({ dirty }: { dirty: boolean }) {
  const a = dirty ? '#9a938a' : '#c2410c';
  const b = dirty ? '#84796f' : '#9a3412';
  const wood = dirty ? '#7d6a55' : '#8b5e34';
  return (
    <>
      <ellipse cx="400" cy="380" rx="150" ry="18" fill="#000" opacity="0.18" filter="url(#softShadow)" />
      <rect x="300" y="90" width="200" height="150" rx="26" fill={b} />
      <rect x="318" y="108" width="164" height="112" rx="18" fill={a} />
      <rect x="270" y="235" width="260" height="60" rx="18" fill={a} />
      <rect x="290" y="295" width="18" height="90" rx="5" fill={wood} />
      <rect x="492" y="295" width="18" height="90" rx="5" fill={wood} />
      <rect x="330" y="295" width="12" height="70" rx="4" fill={wood} opacity="0.8" />
      <rect x="458" y="295" width="12" height="70" rx="4" fill={wood} opacity="0.8" />
      <Stains dirty={dirty} spots={[[390, 160, 26, 16], [430, 262, 30, 12], [350, 258, 16, 9]]} />
      <Sparkles dirty={dirty} points={[[250, 120, 10], [560, 100, 8], [590, 250, 6]]} />
    </>
  );
}

function Car({ dirty }: { dirty: boolean }) {
  const a = dirty ? '#7c7f83' : '#2b3441';
  const b = dirty ? '#65686c' : '#1b222c';
  const c = dirty ? '#8e9195' : '#3d4a5c';
  return (
    <>
      <defs>
        <linearGradient id="carWin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dirty ? '#c5c9cc' : '#bfe3ff'} />
          <stop offset="1" stopColor={dirty ? '#a8adb2' : '#7cc0f2'} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="360" fill="url(#carWin)" />
      <rect x="0" y="290" width="800" height="210" fill={dirty ? '#5f6367' : '#1f2732'} />
      <rect x="230" y="60" width="340" height="300" rx="46" fill={b} />
      <rect x="255" y="85" width="290" height="180" rx="34" fill={a} />
      <rect x="290" y="105" width="220" height="30" rx="15" fill={c} />
      <path d="M255 250q145 -30 290 0v90q-145 20 -290 0z" fill={c} />
      <rect x="290" y="30" width="220" height="44" rx="22" fill={b} />
      <Stains dirty={dirty} spots={[[360, 180, 34, 20], [440, 205, 20, 12], [400, 300, 42, 16]]} />
      <Sparkles dirty={dirty} points={[[200, 120, 11], [620, 100, 9], [640, 320, 6]]} />
    </>
  );
}

function Carpet({ dirty }: { dirty: boolean }) {
  const a = dirty ? '#a49a8c' : '#b91c1c';
  const b = dirty ? '#8f8578' : '#991b1b';
  const c = dirty ? '#c2b8a8' : '#fbbf24';
  return (
    <>
      <path d="M120 200 L680 200 L740 360 L60 360 Z" fill={b} />
      <path d="M150 218 L650 218 L700 342 L100 342 Z" fill={a} />
      <path d="M190 236 L610 236 L650 324 L150 324 Z" fill="none" stroke={c} strokeWidth="5" opacity="0.9" />
      <g fill={c} opacity="0.9">
        <circle cx="400" cy="280" r="26" />
        <circle cx="300" cy="280" r="10" />
        <circle cx="500" cy="280" r="10" />
      </g>
      <g stroke={c} strokeWidth="4" opacity="0.7">
        {[75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345, 360, 375, 390, 405, 420, 435, 450, 465, 480, 495, 510, 525, 540, 555, 570, 585, 600, 615, 630, 645, 660, 675, 690, 705, 720].map((x) => (
          <path key={x} d={`M${x} 360v14`} />
        ))}
      </g>
      <Stains dirty={dirty} spots={[[260, 265, 40, 18], [540, 300, 36, 16], [420, 320, 26, 10]]} />
      <Sparkles dirty={dirty} points={[[180, 150, 12], [620, 130, 9], [700, 230, 6]]} />
    </>
  );
}

function Stroller({ dirty }: { dirty: boolean }) {
  const a = dirty ? '#9b9389' : '#6d28d9';
  const b = dirty ? '#837a70' : '#5b21b6';
  const frame = dirty ? '#6b6b6b' : '#374151';
  return (
    <>
      <ellipse cx="400" cy="382" rx="180" ry="18" fill="#000" opacity="0.18" filter="url(#softShadow)" />
      <path d="M270 150q130 -90 260 0v140q-130 40 -260 0z" fill={b} />
      <path d="M295 165q105 -70 210 0v110q-105 30 -210 0z" fill={a} />
      <path d="M240 130q60 -90 160 -70" fill="none" stroke={frame} strokeWidth="14" strokeLinecap="round" />
      <path d="M330 300l-40 70M470 300l40 70" stroke={frame} strokeWidth="12" strokeLinecap="round" />
      <circle cx="285" cy="372" r="24" fill={frame} />
      <circle cx="515" cy="372" r="24" fill={frame} />
      <circle cx="285" cy="372" r="9" fill="#e5e7eb" />
      <circle cx="515" cy="372" r="9" fill="#e5e7eb" />
      <Stains dirty={dirty} spots={[[380, 210, 26, 16], [430, 250, 18, 10]]} />
      <Sparkles dirty={dirty} points={[[220, 120, 10], [580, 100, 8], [610, 230, 6]]} />
    </>
  );
}

const SHAPES: Record<SceneKind, (p: { dirty: boolean }) => React.JSX.Element> = {
  sofa: Sofa,
  armchair: Armchair,
  mattress: Mattress,
  chair: Chair,
  car: Car,
  carpet: Carpet,
  stroller: Stroller,
};

export function Scene({
  kind,
  variant,
  className = 'h-full w-full',
}: {
  kind: SceneKind;
  variant: 'before' | 'after';
  className?: string;
}) {
  const dirty = variant === 'before';
  const Shape = SHAPES[kind];
  return (
    <svg
      viewBox="0 0 800 500"
      className={className}
      role="img"
      aria-label={sceneLabel(kind, variant)}
      preserveAspectRatio="xMidYMid slice"
    >
      <Room dirty={dirty}>
        <Shape dirty={dirty} />
      </Room>
    </svg>
  );
}
