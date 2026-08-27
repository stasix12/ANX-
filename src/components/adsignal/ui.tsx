import type { Provenance, SignalStatus } from '@/lib/adsignal/types';

/** Provenance badge — every number in the UI says where it came from. */
export function Prov({ kind, label }: { kind: Provenance | 'USER_IMPORTED'; label?: string }) {
  const cls = kind === 'REAL' ? 'real' : kind === 'DERIVED' ? 'der' : kind === 'AI_ESTIMATE' ? 'ai' : 'import';
  const text = label ?? (kind === 'AI_ESTIMATE' ? 'AI' : kind === 'USER_IMPORTED' ? 'IMPORTED' : kind);
  return <span className={`as-badge ${cls}`}>{text}</span>;
}

export function ScoreBar({ score, confidence }: { score: number; confidence: number | null }) {
  return (
    <div className="as-scorebar">
      <span className="as-score">{Math.round(score)}</span>
      <div className="as-gauge" role="img" aria-label={`Hot Score ${Math.round(score)} מתוך 100`}>
        <i style={{ width: `${Math.min(100, Math.max(2, score))}%` }} />
      </div>
      {confidence !== null && <span className="as-conf">conf {confidence.toFixed(2)}</span>}
    </div>
  );
}

const STATUS_LABEL: Record<SignalStatus, string> = {
  emerging: '🟢 Emerging',
  growing: '🟡 Growing',
  hot: '🔥 Hot',
  saturated: '🔴 Saturated',
  quiet: 'שקט',
};

export function StatusPill({ status }: { status: SignalStatus | null }) {
  if (!status) return <span className="as-status">אין נתונים</span>;
  return <span className={`as-status ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Sparkline({ values, color = '#3EC9A7' }: { values: number[]; color?: string }) {
  if (values.length < 2) return <svg className="as-spark" viewBox="0 0 60 18" aria-hidden />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 60},${17 - ((v - min) / range) * 16}`)
    .join(' ');
  return (
    <svg className="as-spark" viewBox="0 0 60 18" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

/**
 * The honest empty state: what is missing, why, and which env/action fixes
 * it. This is the component that replaces fake demo data everywhere.
 */
export function Empty({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="as-empty">
      {title && (
        <>
          <b>{title}</b>
          <br />
        </>
      )}
      {children}
    </div>
  );
}

export function pctClass(v: number | null): string {
  if (v === null) return 'as-num';
  return v > 0 ? 'as-num up' : v < 0 ? 'as-num down' : 'as-num';
}

export function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return `${v > 0 ? '+' : ''}${Math.round(v)}%`;
}

export function daysRunning(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt) return null;
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 86400_000));
}
