'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { SpinnerIcon } from '../icons';

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'dark';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variantCls: Record<Variant, string> = {
  primary: 'bg-lc-primary text-white hover:bg-lc-primary-hover shadow-lc-primary',
  secondary: 'bg-white text-lc-text border border-lc-border hover:border-lc-border-strong hover:bg-lc-bg shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
  ghost: 'text-lc-muted hover:text-lc-text hover:bg-lc-bg',
  danger: 'bg-lc-danger-soft text-lc-danger hover:bg-red-100',
  success: 'bg-lc-success text-white hover:bg-emerald-700',
  dark: 'bg-lc-text text-white hover:bg-slate-800',
};
const sizeCls: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  href?: string;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, href, icon, className, children, disabled, ...rest }: ButtonProps) {
  const cls = cx(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-[background-color,box-shadow,transform,border-color] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 select-none',
    variantCls[variant],
    sizeCls[size],
    className,
  );
  const inner = (
    <>
      {loading ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {inner}
    </button>
  );
}

export function Card({ className, hover, children, ...rest }: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={cx('lc-card', hover && 'lc-card-hover', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-lc-text">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-lc-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'pink' | 'teal' | 'dark';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  primary: 'bg-lc-primary-soft text-lc-primary',
  success: 'bg-lc-success-soft text-lc-success',
  warning: 'bg-lc-warning-soft text-lc-warning',
  danger: 'bg-lc-danger-soft text-lc-danger',
  info: 'bg-lc-info-soft text-lc-info',
  violet: 'bg-violet-50 text-lc-violet',
  pink: 'bg-lc-pink-soft text-lc-pink',
  teal: 'bg-lc-teal-soft text-lc-teal',
  dark: 'bg-lc-text text-white',
};
const dotCls: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  primary: 'bg-lc-primary',
  success: 'bg-lc-success',
  warning: 'bg-lc-warning',
  danger: 'bg-lc-danger',
  info: 'bg-lc-info',
  violet: 'bg-lc-violet',
  pink: 'bg-lc-pink',
  teal: 'bg-lc-teal',
  dark: 'bg-white',
};

export function Badge({ tone = 'neutral', dot, className, children, size = 'md' }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold', size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs', toneCls[tone], className)}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', dotCls[tone])} />}
      {children}
    </span>
  );
}
export type BadgeTone = Tone;

export function Avatar({ name, size = 'md', color, src, className }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; color?: string; src?: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const palette = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-sky-100 text-sky-700', 'bg-pink-100 text-pink-700', 'bg-violet-100 text-violet-700', 'bg-teal-100 text-teal-700'];
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const sz = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm', xl: 'h-16 w-16 text-lg' }[size];
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold', sz, color ?? palette[hash % palette.length], className)}>
      {src ? <img src={src} alt="" className="h-full w-full rounded-full object-cover" /> : initials}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('lc-skeleton', className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-lc-primary-soft text-lc-primary [&>svg]:h-7 [&>svg]:w-7">{icon}</div>}
      <h3 className="text-base font-semibold text-lc-text">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-lc-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Progress({ value, max = 100, tone = 'primary', className, size = 'md' }: { value: number; max?: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; className?: string; size?: 'sm' | 'md' }) {
  const pctv = Math.max(0, Math.min(100, (value / max) * 100));
  const bar = { primary: 'bg-lc-primary', success: 'bg-lc-success', warning: 'bg-lc-warning', danger: 'bg-lc-danger' }[tone];
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-slate-100', size === 'sm' ? 'h-1.5' : 'h-2', className)}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${pctv}%` }} />
    </div>
  );
}

export function Stat({ label, value, delta, hint, icon, tone = 'neutral', className, loading }: { label: ReactNode; value: ReactNode; delta?: number | null; hint?: ReactNode; icon?: ReactNode; tone?: 'neutral' | 'success' | 'primary' | 'warning' | 'violet' | 'info' | 'pink' | 'teal'; className?: string; loading?: boolean }) {
  const iconBg = { neutral: 'bg-slate-100 text-slate-600', success: 'bg-lc-success-soft text-lc-success', primary: 'bg-lc-primary-soft text-lc-primary', warning: 'bg-lc-warning-soft text-lc-warning', violet: 'bg-violet-50 text-lc-violet', info: 'bg-lc-info-soft text-lc-info', pink: 'bg-lc-pink-soft text-lc-pink', teal: 'bg-lc-teal-soft text-lc-teal' }[tone];
  return (
    <Card className={cx('p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-lc-muted">{label}</p>
        {icon && <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4', iconBg)}>{icon}</span>}
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className="lc-tnum mt-1.5 text-2xl font-bold tracking-tight text-lc-text sm:text-[26px]">{value}</p>}
      {(delta !== undefined || hint) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {delta !== undefined && delta !== null && <Delta value={delta} />}
          {hint && <span className="text-lc-faint">{hint}</span>}
        </div>
      )}
    </Card>
  );
}

export function Delta({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span className={cx('lc-tnum inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold', up ? 'bg-lc-success-soft text-lc-success' : 'bg-lc-danger-soft text-lc-danger')}>
      {up ? '▲' : '▼'} {Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}
      {suffix}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6', className)}>
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-bold tracking-tight text-lc-text sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-lc-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="group" className={cx('inline-flex items-center rounded-xl bg-slate-100 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('rounded-lg font-semibold transition-all duration-150', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm', o.value === value ? 'bg-white text-lc-text shadow-[0_1px_3px_rgba(15,23,42,0.12)]' : 'text-lc-muted hover:text-lc-text')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx('h-px w-full bg-lc-border', className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-lc-border bg-lc-bg px-1.5 py-0.5 font-mono text-[11px] text-lc-muted">{children}</kbd>;
}

export function IconBox({ children, tone = 'primary', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5', toneCls[tone], className)}>{children}</span>;
}
