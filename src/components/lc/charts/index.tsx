'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import type { LeadSourceKey } from '@/lib/lc/types';

/**
 * Hand-rolled SVG charts. One hue per job: indigo for the single revenue
 * series, a fixed categorical slot per lead source (color follows the entity,
 * never its rank), an ordinal indigo ramp for the funnel. Every chart ships
 * hover tooltips and a recessive grid.
 */

export const SOURCE_COLORS: Record<LeadSourceKey, string> = {
  google: '#2a78d6',
  facebook: '#eb6834',
  instagram: '#e87ba4',
  whatsapp: '#008300',
  website: '#4a3aa7',
  organic: '#1baf7a',
  other: '#eda100',
};

const FUNNEL_RAMP = ['#4338ca', '#4f46e5', '#6366f1', '#818cf8'];

export function AreaChart({ data, height = 200, formatValue = (v) => String(v), formatLabel = (d) => d, color = '#4f46e5', className }: { data: { label: string; value: number }[]; height?: number; formatValue?: (v: number) => string; formatLabel?: (label: string, i: number) => string; color?: string; className?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = { t: 12, r: 8, b: 24, l: 8 };
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.15;
  const n = data.length;
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = useMemo(() => {
    if (n === 0) return { line: '', area: '' };
    // Smooth monotone-ish curve with Catmull-Rom → Bezier.
    const pts = data.map((d, i) => [x(i), y(d.value)] as const);
    let line = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      line += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    const area = `${line} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z`;
    return { line, area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, height]);
  const ticks = 4;
  const labelEvery = Math.max(1, Math.round(n / 6));
  return (
    <div className={className}>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const v = (max / ticks) * i;
            return <line key={i} x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#eceef5" strokeWidth={1} />;
          })}
          <path d={path.area} fill={`url(#${id}-g)`} />
          <path d={path.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={i}>
              {i % labelEvery === 0 && (
                <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="#94a0b8">
                  {formatLabel(d.label, i)}
                </text>
              )}
              <rect x={x(i) - (W / n) / 2} y={0} width={W / n} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
            </g>
          ))}
          {hover !== null && data[hover] && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke={color} strokeDasharray="3 3" strokeOpacity={0.5} />
              <circle cx={x(hover)} cy={y(data[hover].value)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hover !== null && data[hover] && (
          <div className="pointer-events-none absolute -top-1 rounded-lg bg-lc-text px-2.5 py-1.5 text-xs text-white shadow-lc-pop" style={{ left: `${(x(hover) / W) * 100}%`, transform: 'translate(-50%, -100%)' }}>
            <div className="text-[10px] text-white/60">{formatLabel(data[hover].label, hover)}</div>
            <div className="lc-tnum font-bold">{formatValue(data[hover].value)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function HBarList({ rows, formatValue = (v) => String(v), className }: { rows: { key: string; label: ReactNode; value: number; color?: string; meta?: ReactNode }[]; formatValue?: (v: number) => string; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className={className}>
      {rows.map((r) => (
        <li key={r.key} className="group py-2">
          <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 font-medium text-lc-text">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color ?? '#4f46e5' }} />
              <span className="truncate">{r.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {r.meta && <span className="text-lc-faint">{r.meta}</span>}
              <span className="lc-tnum font-semibold text-lc-text">{formatValue(r.value)}</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? '#4f46e5' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Funnel({ steps, className }: { steps: { label: string; value: number }[]; className?: string }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className={className}>
      {steps.map((s, i) => {
        const pctv = Math.max(6, (s.value / max) * 100);
        const conv = i === 0 ? null : steps[i - 1].value ? Math.round((s.value / steps[i - 1].value) * 100) : 0;
        return (
          <li key={s.label} className="relative">
            {i > 0 && (
              <div className="flex items-center justify-center py-1 text-[11px] font-semibold text-lc-faint">
                <span className="rounded-full bg-lc-bg px-2 py-0.5">↓ {conv}%</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="h-10 rounded-xl transition-[width] duration-700" style={{ width: `${pctv}%`, background: FUNNEL_RAMP[i % FUNNEL_RAMP.length], marginInline: 'auto' }} />
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between text-[13px]">
              <span className="font-medium text-lc-muted">{s.label}</span>
              <span className="lc-tnum font-bold text-lc-text">{s.value.toLocaleString()}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Donut({ segments, size = 140, thickness = 16, center, className }: { segments: { value: number; color: string; label?: string }[]; size?: number; thickness?: number; center?: ReactNode; className?: string }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className={`relative inline-grid place-items-center ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f6" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`} strokeDashoffset={-offset} strokeLinecap="butt" />;
          offset += len;
          return el;
        })}
      </svg>
      {center && <div className="absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}

export function Sparkline({ data, color = '#4f46e5', width = 96, height = 28 }: { data: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * width},${height - (v / max) * (height - 4) - 2}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ColumnChart({ data, height = 160, color = '#4f46e5', formatValue = (v) => String(v), highlightMax, className }: { data: { label: string; value: number }[]; height?: number; color?: string; formatValue?: (v: number) => string; highlightMax?: boolean; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  return (
    <div className={className}>
      <div className="flex items-end gap-1.5" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={i} className="relative flex flex-1 flex-col items-center justify-end" style={{ height: '100%' }} onMouseEnter={() => setHover(i)}>
            {hover === i && (
              <div className="pointer-events-none absolute -top-8 z-10 whitespace-nowrap rounded-md bg-lc-text px-2 py-1 text-[11px] font-semibold text-white">
                {formatValue(d.value)}
              </div>
            )}
            <div className="w-full rounded-t-[4px] transition-[height,opacity] duration-500" style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, background: color, opacity: highlightMax ? (i === maxIdx ? 1 : 0.45) : hover === i ? 1 : 0.85 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 truncate text-center text-[10px] text-lc-faint">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
