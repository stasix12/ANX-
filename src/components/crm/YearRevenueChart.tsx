'use client';

import { useState } from 'react';

export interface MonthRevenue {
  /** 0-based month. */
  month: number;
  revenue: number;
  jobs: number;
}

const MONTH_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
export const MONTH_LONG = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

/** Smallest "clean" axis maximum (1/2/2.5/5 × 10^k) that covers the data. */
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
 * Twelve columns of completed-job revenue, one per calendar month, with the
 * monthly-average reference line. Single series in the brand hue; labels in
 * text tokens; tapping a column feeds the readout row the caller renders.
 */
export function YearRevenueChart({
  months,
  avg,
  currentMonth,
  selected,
  onSelect,
}: {
  months: MonthRevenue[];
  /** Monthly average over the elapsed part of the year — the reference line. */
  avg: number;
  /** 0-based month to mark as "now", or null when viewing another year. */
  currentMonth: number | null;
  selected: number;
  onSelect: (month: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const W = 360;
  const H = 216;
  const pad = { top: 22, bottom: 24, left: 40, right: 8 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const band = plotW / 12;
  const barW = Math.min(18, band - 8);
  const baseline = pad.top + plotH;

  const maxRevenue = Math.max(...months.map((m) => m.revenue));
  const top = niceMax(Math.max(maxRevenue, avg));
  const y = (v: number) => baseline - (top ? (v / top) * plotH : 0);
  const maxIndex = months.findIndex((m) => m.revenue === maxRevenue);

  // Column with a 4px rounded cap and a square baseline.
  function barPath(x: number, v: number): string {
    const h = baseline - y(v);
    if (h <= 0) return '';
    const r = Math.min(4, h);
    return `M ${x} ${baseline} v ${-(h - r)} a ${r} ${r} 0 0 1 ${r} ${-r} h ${barW - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - r} z`;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`הכנסות לפי חודשים; ממוצע חודשי ${fmt(avg)} שקלים`}
    >
      {/* Recessive hairline grid + clean tick values. */}
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

      {/* Monthly-average reference line. */}
      {avg > 0 ? (
        <g>
          <line x1={pad.left} x2={W - pad.right} y1={y(avg)} y2={y(avg)} className="stroke-mist-500" strokeWidth="1" />
          {/* direction=rtl + anchor=start hangs the label leftward from x, so
              the Hebrew run never overflows the right edge. */}
          <text
            x={W - pad.right - 2}
            y={y(avg) - 4}
            direction="rtl"
            textAnchor="start"
            className="fill-mist-500"
            fontSize="9"
          >
            ממוצע {fmt(avg)}
          </text>
        </g>
      ) : null}

      {months.map((m, i) => {
        const x = pad.left + i * band + (band - barW) / 2;
        const isSelected = selected === i;
        const active = isSelected || hovered === i;
        return (
          <g key={m.month}>
            {m.revenue > 0 ? (
              <path d={barPath(x, m.revenue)} className={active ? 'fill-brand-300' : 'fill-brand-500'} />
            ) : (
              // Zero months keep a faint stub so the timeline stays countable.
              <rect x={x} y={baseline - 2} width={barW} height={2} className="fill-ink-700" />
            )}
            {/* Selective direct label: the peak month only. */}
            {i === maxIndex && m.revenue > 0 ? (
              <text x={x + barW / 2} y={y(m.revenue) - 5} textAnchor="middle" className="fill-mist-300" fontSize="9" fontWeight="700">
                {fmt(m.revenue)}
              </text>
            ) : null}
            <text
              x={pad.left + i * band + band / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="8.5"
              fontWeight={isSelected ? 800 : 600}
              className={isSelected ? 'fill-mist-100' : 'fill-mist-500'}
            >
              {MONTH_SHORT[i]}
            </text>
            {currentMonth === i ? (
              <circle cx={pad.left + i * band + band / 2} cy={H - 3} r="1.6" className="fill-brand-400" />
            ) : null}
            {/* Full-band hit target — far bigger than the mark. */}
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
  );
}
