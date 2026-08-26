'use client';

import { useState } from 'react';

/**
 * The same sofa drawn twice: stained and washed-out before, saturated and
 * spotless after. An illustration rather than photo placeholders on purpose —
 * a numbered grey placeholder in the middle of a landing page kills trust,
 * while a clean drawing reads as intentional design until real before/after
 * photos are dropped in (swap the two <SofaScene>s for <Image>s then).
 */
function SofaScene({ variant }: { variant: 'before' | 'after' }) {
  const dirty = variant === 'before';
  const fabric = dirty ? '#8d9aa3' : '#0284c7';
  const fabricDark = dirty ? '#76838c' : '#0369a1';
  const cushion = dirty ? '#9aa7af' : '#38bdf8';
  const wall = dirty ? '#dcdcd4' : '#e8f4fd';
  const floor = dirty ? '#c9c4b8' : '#dbeafe';

  return (
    <svg
      viewBox="0 0 800 500"
      className="h-full w-full"
      role="img"
      aria-label={dirty ? 'הספה לפני הניקוי — כתמים ולכלוך' : 'הספה אחרי הניקוי — נקייה ורעננה'}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="800" height="360" fill={wall} />
      <rect y="360" width="800" height="140" fill={floor} />

      {/* Sofa: back, seat cushions, arm rests, legs. */}
      <rect x="140" y="150" width="520" height="180" rx="28" fill={fabricDark} />
      <rect x="120" y="250" width="560" height="110" rx="26" fill={fabric} />
      <rect x="165" y="175" width="225" height="95" rx="18" fill={cushion} />
      <rect x="410" y="175" width="225" height="95" rx="18" fill={cushion} />
      <rect x="100" y="215" width="70" height="145" rx="24" fill={fabricDark} />
      <rect x="630" y="215" width="70" height="145" rx="24" fill={fabricDark} />
      <rect x="150" y="360" width="26" height="34" rx="6" fill="#6b7280" />
      <rect x="624" y="360" width="26" height="34" rx="6" fill="#6b7280" />

      {dirty ? (
        <g fill="#5d4a37" opacity="0.55">
          {/* Stains — irregular blobs across cushions and seat. */}
          <ellipse cx="250" cy="215" rx="34" ry="20" />
          <ellipse cx="278" cy="232" rx="18" ry="11" />
          <ellipse cx="500" cy="205" rx="26" ry="16" />
          <ellipse cx="560" cy="240" rx="20" ry="12" opacity="0.8" />
          <ellipse cx="330" cy="295" rx="40" ry="16" />
          <ellipse cx="455" cy="305" rx="28" ry="13" />
          <ellipse cx="140" cy="270" rx="16" ry="10" />
        </g>
      ) : (
        <g stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.9">
          {/* Sparkles. */}
          <path d="M210 120v28M196 134h28" />
          <path d="M600 100v22M589 111h22" />
          <path d="M700 190v18M691 199h18" />
        </g>
      )}
    </svg>
  );
}

/**
 * Draggable before/after comparison. The whole widget runs LTR internally so
 * the clip math and the range direction agree; the Hebrew labels are absolute
 * and unaffected. The invisible range input on top is what makes it work with
 * keyboard and screen readers, not just a pointer.
 */
export function BeforeAfter() {
  const [pos, setPos] = useState(50);

  return (
    <div dir="ltr" className="relative aspect-8/5 select-none overflow-hidden rounded-card shadow-xl">
      <div className="absolute inset-0">
        <SofaScene variant="before" />
      </div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <SofaScene variant="after" />
      </div>

      {/* Divider + handle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-white shadow"
        style={{ left: `${pos}%` }}
      >
        <span className="absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-lg font-black text-brand-500 shadow-lg">
          ⇄
        </span>
      </div>

      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/45 px-3 py-1 text-sm font-bold text-white">
        לפני
      </span>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-emerald-500 px-3 py-1 text-sm font-bold text-white">
        אחרי
      </span>

      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="השוואת לפני ואחרי הניקוי"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
