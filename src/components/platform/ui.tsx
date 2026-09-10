'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Tiny shared primitives for the platform apps (/clean, /pro, /hq). */

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-bold text-on-brand shadow-sm hover:bg-brand-600 disabled:opacity-40 disabled:pointer-events-none';

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-ink-800 px-5 py-3 font-bold text-mist-100 hover:bg-ink-700 disabled:opacity-40 disabled:pointer-events-none';

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-red-600/10 px-5 py-3 font-bold text-red-700 hover:bg-red-600/20 disabled:opacity-40';

export const inputClass =
  'w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3 text-base text-mist-100 placeholder:text-mist-500 focus:border-brand-500 focus:outline-none';

export function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="surface rounded-card p-4">
      <div className="text-xs font-medium text-mist-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-black tabular-nums ${
          tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-brand-400'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function EmptyState({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <div className="surface rounded-card p-10 text-center">
      <div className="text-4xl">{emoji}</div>
      <div className="mt-3 font-bold text-mist-100">{title}</div>
      {subtitle ? <div className="mt-1 text-sm text-mist-500">{subtitle}</div> : null}
    </div>
  );
}

export function Stars({ value, onChange, size = 'text-3xl' }: { value: number; onChange?: (n: number) => void; size?: string }) {
  return (
    <div className={`flex flex-row-reverse justify-end gap-1 ${size}`} role={onChange ? 'radiogroup' : undefined}>
      {[5, 4, 3, 2, 1].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} כוכבים`}
          className={`${n <= value ? 'text-amber-400' : 'text-ink-600'} disabled:cursor-default`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-ink-800 ${className}`} />;
}

/** Full-page loading placeholder while the snapshot hydrates. */
export function PageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open || typeof document === 'undefined') return null;
  // Portal to <body>: page-transition animations create stacking contexts
  // that would otherwise trap the overlay under fixed bars.
  return createPortal(
    // Re-apply the theme scope: the portal target (<body>) sits outside it.
    <div className="platform-theme fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <button aria-label="סגור" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ink-850 p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-mist-100">{title}</h2>
          <button onClick={onClose} aria-label="סגור" className="rounded-full bg-ink-800 px-3 py-1 font-bold text-mist-300">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
