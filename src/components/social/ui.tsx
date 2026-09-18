'use client';

import { SpinnerIcon } from '@/components/icons';
import { QUEUE_STATUS_LABEL, type QueueStatus } from '@/lib/social/types';

/** Small shared primitives for the social screens — same tokens as the CRM. */

export function Card({ title, action, children, className = '' }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`surface rounded-card border border-ink-700 p-4 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-extrabold text-mist-100">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonClass: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-on-brand hover:bg-brand-600 shadow-sm shadow-sky-600/30',
  secondary: 'bg-ink-800 text-mist-100 hover:bg-ink-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'text-brand-400 hover:bg-ink-800',
};

export function Button({
  variant = 'primary',
  busy = false,
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-[background-color,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass[variant]} ${className}`}
    >
      {busy && <SpinnerIcon className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-mist-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-mist-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-2.5 text-base text-mist-100 placeholder:text-mist-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-ink-600'}`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[inset-inline-start] ${checked ? 'start-6' : 'start-1'}`}
      />
    </button>
  );
}

const statusClass: Record<QueueStatus, string> = {
  scheduled: 'bg-sky-500/15 text-sky-700',
  publishing: 'bg-amber-500/15 text-amber-700',
  published: 'bg-emerald-500/15 text-emerald-700',
  failed: 'bg-rose-500/15 text-rose-700',
  skipped: 'bg-slate-500/15 text-slate-600',
  manual_pending: 'bg-violet-500/15 text-violet-700',
  needs_attention: 'bg-orange-500/15 text-orange-700',
  awaiting_confirmation: 'bg-fuchsia-500/15 text-fuchsia-700',
  paused: 'bg-slate-500/15 text-slate-600',
};

export function StatusPill({ status }: { status: QueueStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${statusClass[status]}`}>
      {QUEUE_STATUS_LABEL[status]}
    </span>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode }) {
  const cls = {
    info: 'border-sky-300 bg-sky-50 text-sky-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-rose-300 bg-rose-50 text-rose-900',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

export function Tile({ label, value, sub, tone = 'default' }: { label: string; value: string | number; sub?: string; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  const color = { default: 'text-brand-400', good: 'text-emerald-600', bad: 'text-rose-600', warn: 'text-amber-600' }[tone];
  return (
    <div className="surface rounded-card border border-ink-700 p-3.5">
      <p className="text-xs font-bold text-mist-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-mist-300">{sub}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-ink-600 px-4 py-6 text-center text-sm text-mist-500">{children}</p>;
}

export function Loading() {
  return (
    <div className="grid place-items-center py-16">
      <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
    </div>
  );
}
