'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { asset } from '@/lib/site';
import { ils } from '@/lib/shop/logic';
import type { ColorOption } from '@/lib/shop/types';
import { IconCheck, IconMinus, IconPlus, IconStar } from './icons';

/** Local /public paths get the deploy basePath; data: and http(s) URLs pass through. */
export function src(path: string): string {
  return path.startsWith('/') ? asset(path) : path;
}

export function Img({
  path,
  alt,
  className,
  eager,
}: {
  path: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  // Plain <img>: the files are pre-sized WebP (scripts/shop-images.py) and
  // admin uploads are data URLs, neither of which needs the optimiser — and
  // a static export has none.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src(path)}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      draggable={false}
    />
  );
}

export function Price({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span dir="rtl" className={`font-extrabold tabular-nums ${className}`}>
      {ils(value)}
    </span>
  );
}

export function Stars({
  rating,
  count,
  size = 12,
  countLabel,
}: {
  rating: number;
  count?: number;
  size?: number;
  countLabel?: string;
}) {
  return (
    <span dir="ltr" className="inline-flex items-center gap-1.5" aria-label={`דירוג ${rating} מתוך 5${count !== undefined ? `, ${count} דירוגים` : ''}`}>
      <span className="inline-flex text-x-star" style={{ gap: size > 14 ? 3 : 1 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <IconStar key={i} size={size} amount={Math.max(0, Math.min(1, rating - i))} />
        ))}
      </span>
      {count !== undefined && (
        <span dir="rtl" className="text-[11px] text-x-muted tabular-nums" style={{ fontSize: size > 14 ? 14 : undefined }}>
          ({count}
          {countLabel ? ` ${countLabel}` : ''})
        </span>
      )}
    </span>
  );
}

export function Swatch({
  color,
  selected,
  onClick,
  size = 40,
}: {
  color: ColorOption;
  selected: boolean;
  onClick: () => void;
  size?: number;
}) {
  const [a, b] = color.swatch;
  const bg = b ? `linear-gradient(135deg, ${a} 0 52%, ${b} 52% 100%)` : a;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={color.name}
      title={color.name}
      className={`grid shrink-0 place-items-center rounded-full transition ${selected ? 'ring-2 ring-x-blue ring-offset-2' : 'ring-1 ring-x-line hover:ring-x-faint'}`}
      style={{ width: size, height: size }}
    >
      <span className="block rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" style={{ width: size - 4, height: size - 4, background: bg }} />
    </button>
  );
}

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = 'md',
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
}) {
  const h = size === 'sm' ? 'h-9' : 'h-12';
  const w = size === 'sm' ? 'w-9' : 'w-11';
  return (
    <div dir="ltr" className={`inline-flex ${h} items-center rounded-full border border-x-line bg-white`}>
      <button
        type="button"
        aria-label="הפחת כמות"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={`grid ${h} ${w} place-items-center rounded-full text-x-ink disabled:text-x-faint`}
      >
        <IconMinus size={18} />
      </button>
      <span aria-live="polite" className="min-w-7 text-center text-[15px] font-bold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="הוסף כמות"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={`grid ${h} ${w} place-items-center rounded-full text-x-ink disabled:text-x-faint`}
      >
        <IconPlus size={18} />
      </button>
    </div>
  );
}

const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50';

export const btn = {
  /** Indigo→violet — "המשך לתשלום", hero CTA. */
  primary: `${btnBase} bg-linear-to-r from-x-violet to-x-indigo text-white shadow-x-cta hover:brightness-110`,
  /** Electric blue — "הוסף לסל", "הצג מוצרים". */
  blue: `${btnBase} bg-linear-to-r from-[#3d6bff] to-x-blue text-white shadow-x-cta hover:brightness-110`,
  ghost: `${btnBase} border border-x-line bg-white text-x-ink hover:bg-x-soft`,
};

export function Field({
  label,
  error,
  children,
  hideLabel,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
  hideLabel?: boolean;
}) {
  return (
    <label className="block">
      <span className={hideLabel ? 'sr-only' : 'mb-1.5 block text-sm font-semibold text-x-ink-2'}>{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-x-red">{error}</span>}
    </label>
  );
}

export const inputCls =
  'h-13 w-full rounded-2xl border border-x-line bg-white px-4 text-[15px] text-x-ink placeholder:text-x-faint outline-none transition focus:border-x-blue focus:ring-3 focus:ring-x-blue-100';

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center animate-x-fade">
      <div className="mb-4 grid size-20 place-items-center rounded-full bg-x-blue-50 text-x-blue">{icon}</div>
      <h2 className="text-lg font-extrabold">{title}</h2>
      {text && <p className="mt-1.5 text-sm text-x-muted">{text}</p>}
      {action && (
        <Link href={action.href} className={`${btn.blue} mt-6 h-12 px-8`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- toast */

type Toast = { id: number; text: string; href?: string; linkLabel?: string };
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
const EMPTY: Toast[] = [];

export function toast(text: string, link?: { href: string; label: string }) {
  const t = { id: Date.now() + Math.random(), text, href: link?.href, linkLabel: link?.label };
  toasts = [...toasts.slice(-2), t];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l());
  }, 2800);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (fn) => {
      toastListeners.add(fn);
      return () => toastListeners.delete(fn);
    },
    () => toasts,
    () => EMPTY,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-60 flex flex-col items-center gap-2 px-4 lg:bottom-8"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-x-ink px-4 py-3 text-sm font-semibold text-white shadow-x-pop animate-x-fade"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-x-green">
            <IconCheck size={14} />
          </span>
          <span>{t.text}</span>
          {t.href && (
            <Link href={t.href} className="ms-1 shrink-0 font-bold text-[#9db4ff] underline-offset-2 hover:underline">
              {t.linkLabel}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

/** True after the first client render — for UI that depends on localStorage. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
