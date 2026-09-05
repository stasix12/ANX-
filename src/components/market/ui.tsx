'use client';

import type { Badge } from '@/lib/market/types';

/**
 * Small shared UI atoms for the marketplace. The marketplace is a light,
 * premium surface (unlike the dark storefront), so everything here leans on
 * white cards, slate text and a sky accent.
 */

export function Card({
  className = '',
  children,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${onClick ? 'cursor-pointer transition hover:border-sky-300 hover:shadow-md' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'bg-sky-600 text-white hover:bg-sky-700 active:scale-[0.98] shadow-sm',
    secondary: 'bg-white text-slate-800 border border-slate-300 hover:border-sky-400 hover:text-sky-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`} />;
}

export function Stars({ rating, size = 'text-sm' }: { rating: number; size?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-slate-800 ${size}`}>
      <span className="text-amber-400">★</span>
      {rating > 0 ? rating.toFixed(1) : 'חדש'}
    </span>
  );
}

/** Avatar from initials — replaced by a real photo when the pro uploads one. */
export function Avatar({ name, photoUrl, size = 48 }: { name: string; photoUrl?: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  const hue = [...name].reduce((h, c) => (h + c.charCodeAt(0) * 7) % 360, 0);
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size / 2.6, background: `hsl(${hue} 55% 45%)` }}
    >
      {initials}
    </span>
  );
}

export const BADGE_LABELS: Record<Badge, string> = {
  verified_id: 'זהות מאומתת',
  verified_business: 'עסק מאומת',
  platform_checked: 'נבדק על ידי הפלטפורמה',
  top_rated: 'דירוג מוביל',
  jobs_100: '+100 עבודות',
};

export function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
      <svg viewBox="0 0 20 20" className="h-3 w-3 fill-current" aria-hidden>
        <path d="M10 1l2.4 2.1 3.1-.4 1 3 2.9 1.2-1 3L20 10l-1.6 2.7 1 3-2.9 1.2-1 3-3.1-.4L10 19l-2.4-2.1-3.1.4-1-3L.6 12.7 2.2 10 .6 7.3l2.9-1.2 1-3 3.1.4L10 1zm-1.2 12.2l5-5-1.2-1.2-3.8 3.8-1.6-1.6-1.2 1.2 2.8 2.8z" />
      </svg>
      {BADGE_LABELS[badge]}
    </span>
  );
}

/** Full-screen bottom sheet / modal shell used across the apps. */
export function Sheet({
  onClose,
  children,
  title,
}: {
  onClose?: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">{title}</h2>
            {onClose && (
              <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="סגירה">
                ✕
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="text-5xl">{icon}</span>
      <p className="font-bold text-slate-700">{title}</p>
      {subtitle && <p className="max-w-xs text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100';
