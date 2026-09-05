'use client';

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { CheckIcon, ChevronDownIcon } from '../icons';
import { cx } from './primitives';

const inputBase =
  'w-full rounded-xl border border-lc-border bg-white px-3.5 text-lc-text placeholder:text-lc-faint transition-[border-color,box-shadow] duration-150 focus:border-lc-primary focus:outline-none focus:ring-4 focus:ring-lc-primary-ring/60 disabled:bg-lc-bg disabled:text-lc-muted';

export function Field({ label, hint, error, children, className, inline }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; inline?: boolean }) {
  return (
    <label className={cx('block', inline && 'flex items-center justify-between gap-4', className)}>
      {label && (
        <span className={cx('block text-[13px] font-semibold text-lc-text', !inline && 'mb-1.5')}>
          {label}
          {hint && !inline && <span className="ms-2 font-normal text-lc-faint">{hint}</span>}
        </span>
      )}
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-lc-danger">{error}</span>}
    </label>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cx(inputBase, 'h-10 text-sm', invalid && 'border-lc-danger focus:border-lc-danger focus:ring-red-100', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, 'min-h-[88px] py-2.5 text-sm leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cx(inputBase, 'h-10 appearance-none pe-9 text-sm', className)} {...rest}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lc-faint" />
    </span>
  );
}

export function Toggle({ checked, onChange, label, description, disabled, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean; size?: 'sm' | 'md' }) {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const shift = size === 'sm' ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-5 rtl:-translate-x-5';
  const btn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50', track, checked ? 'bg-lc-primary' : 'bg-slate-300')}
    >
      <span className={cx('absolute start-0.5 rounded-full bg-white shadow transition-transform duration-200', knob, checked ? shift : 'translate-x-0')} />
    </button>
  );
  if (!label) return btn;
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-lc-text">{label}</p>
        {description && <p className="mt-0.5 text-[13px] text-lc-muted">{description}</p>}
      </div>
      {btn}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5 text-sm text-lc-text">
      <span className={cx('grid h-5 w-5 place-items-center rounded-md border transition-colors', checked ? 'border-lc-primary bg-lc-primary text-white' : 'border-lc-border-strong bg-white')}>{checked && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}</span>
      {label}
    </button>
  );
}

export function ChipGroup<T extends string>({ value, onChange, options, multiple, className }: { value: T[]; onChange: (v: T[]) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; multiple?: boolean; className?: string }) {
  return (
    <div className={cx('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => (multiple ? onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value]) : onChange([o.value]))}
            className={cx('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all', on ? 'border-lc-primary bg-lc-primary-soft text-lc-primary shadow-[0_0_0_1px_var(--color-lc-primary)]' : 'border-lc-border bg-white text-lc-muted hover:border-lc-border-strong hover:text-lc-text')}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function NumberStepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-lc-border bg-white">
      <button type="button" className="h-8 w-8 text-lc-muted hover:text-lc-text disabled:opacity-40" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label="−">
        −
      </button>
      <span className="lc-tnum w-8 text-center text-sm font-semibold">{value}</span>
      <button type="button" className="h-8 w-8 text-lc-muted hover:text-lc-text disabled:opacity-40" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label="+">
        +
      </button>
    </div>
  );
}
