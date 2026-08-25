'use client';

import { useEffect, useRef, useState } from 'react';

export interface AdsBarPoint {
  /** Short axis label under the bar. */
  label: string;
  value: number;
  conversations: number;
}

/** Smallest clean axis maximum covering the data. */
function niceMax(value: number): number {
  if (value <= 0) return 0;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * pow >= value) return step * pow;
  }
  return 10 * pow;
}

const fmt = (v: number) => Math.round(v).toLocaleString('he-IL');

/**
 * Horizontally scrollable spend column chart — one column per day or month,
 * however many there are. Chronological left-to-right, auto-scrolled to the
 * latest period; tapping a column feeds the caller's readout.
 */
export function AdsBarChart({
  points,
  selected,
  onSelect,
}: {
  points: AdsBarPoint[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Land on the most recent bars, not the oldest.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [points.length]);

  const H = 210;
  const pad = { top: 20, bottom: 22, left: 40, right: 8 };
  const band = 34;
  const barW = 20;
  const W = Math.max(352, pad.left + pad.right + band * points.length);
  const plotH = H - pad.top - pad.bottom;
  const baseline = pad.top + plotH;

  const top = niceMax(Math.max(...points.map((p) => p.value), 0));
  const y = (v: number) => baseline - (top ? (v / top) * plotH : 0);

  // Thin the axis labels when there are many bars.
  const labelEvery = Math.max(1, Math.ceil(points.length / 14));

  function barPath(x: number, v: number): string {
    const h = baseline - y(v);
    if (h <= 0) return '';
    const r = Math.min(4, h);
    return `M ${x} ${baseline} v ${-(h - r)} a ${r} ${r} 0 0 1 ${r} ${-r} h ${barW - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - r} z`;
  }

  return (
    <div ref={scrollRef} dir="ltr" className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="הוצאות פרסום לאורך זמן">
        {top > 0
          ? [top / 2, top].map((v) => (
              <g key={v}>
                <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className="stroke-ink-700" strokeWidth="1" />
                <text x={pad.left - 6} y={y(v) + 3.5} textAnchor="end" className="fill-mist-500" fontSize="9">
                  {fmt(v)}
                </text>
              </g>
            ))
          : null}
        <line x1={pad.left} x2={W - pad.right} y1={baseline} y2={baseline} className="stroke-ink-600" strokeWidth="1" />

        {points.map((point, i) => {
          const x = pad.left + i * band + (band - barW) / 2;
          const active = selected === i || hovered === i;
          return (
            <g key={i}>
              {point.value > 0 ? (
                <path d={barPath(x, point.value)} className={active ? 'fill-brand-300' : 'fill-brand-500'} />
              ) : (
                <rect x={x} y={baseline - 2} width={barW} height={2} className="fill-ink-700" />
              )}
              {i % labelEvery === 0 ? (
                <text
                  x={pad.left + i * band + band / 2}
                  y={H - 7}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight={selected === i ? 800 : 600}
                  className={selected === i ? 'fill-mist-100' : 'fill-mist-500'}
                >
                  {point.label}
                </text>
              ) : null}
              <rect
                x={pad.left + i * band}
                y={pad.top}
                width={band}
                height={plotH + pad.bottom}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(i)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
