'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircleIcon, ChevronIcon, CloseIcon, DotIcon, SpinnerIcon, XCircleIcon } from '@/components/icons';
import { QUEUE_STATUS_LABEL, type PublishMethod, type QueueStatus } from '@/lib/social/types';

/**
 * The design system for every /social screen.
 *
 * One file so the product reads as one product: a screen that needs a card,
 * a button, a sheet or an empty state takes it from here rather than
 * inventing a variant. The scales below are the whole vocabulary — when a
 * new screen needs a size that is not in them, the right move is to pick the
 * nearest one, not to add a new one.
 *
 *   spacing     gap-2 (8px) · gap-3 (12px) · gap-4 (16px) · gap-5 (20px)
 *   radius      lg (8px, chips) · xl (12px, controls) · 2xl (16px, tiles)
 *               · rounded-card (20px, panels) · full (pills, avatars)
 *   type        11px meta · 13-14px body · 16px input (never smaller on iOS,
 *               or Safari zooms the page on focus) · 18-24px numbers
 *   controls    h-11 (44px) is the minimum touch target; compact variants
 *               (h-9) are for desktop toolbars only
 *   colour      brand = the one action · emerald = published · amber =
 *               in flight · rose = failed · slate = skipped · violet =
 *               needs a human
 */

/* ------------------------------------------------------------ containers */

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  padded = true,
  id,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  /** So a screen can scroll the person to the card that needs their attention. */
  id?: string;
}) {
  return (
    <section id={id} className={`surface rounded-card border border-ink-700 ${padded ? 'p-4' : ''} ${className}`}>
      {(title || action) && (
        <header className={`mb-3 flex items-start justify-between gap-3 ${padded ? '' : 'px-4 pt-4'}`}>
          <div className="min-w-0">
            {title && <h2 dir="auto" className="truncate text-base font-extrabold text-mist-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-mist-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** A labelled group inside a long form — the Settings screen's section rule. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-mist-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------- buttons */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonClass: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-on-brand hover:bg-brand-600 shadow-sm shadow-sky-600/30',
  secondary: 'bg-ink-800 text-mist-100 hover:bg-ink-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'text-brand-400 hover:bg-ink-800',
};

/**
 * 44px is Apple's minimum target. `sm` is the compact variant and still clears
 * 40px: it is used on phones too (the target picker's quick sets), and a 36px
 * chip in a row of chips is a mis-tap waiting to happen.
 */
const buttonSize: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 py-1.5 text-xs',
  md: 'min-h-11 px-4 py-2.5 text-sm',
  lg: 'min-h-12 px-5 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={`${BUTTON_BASE} ${buttonClass[variant]} ${buttonSize[size]} ${className}`}
    >
      {busy && <SpinnerIcon className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** The shared shape, so a link that looks like a button really matches one. */
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50';

/**
 * A link that looks like a button.
 *
 * Exists because <Link><Button/></Link> nests a <button> inside an <a>, which
 * is invalid HTML: the anchor collapses to an inline box with no height, so
 * the thing measures as a 24px target even though the button inside it is 44,
 * and assistive technology is handed two nested controls for one action.
 */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link href={href} {...props} className={`${BUTTON_BASE} ${buttonClass[variant]} ${buttonSize[size]} ${className}`}>
      {children}
    </Link>
  );
}

/** Square, icon-only, always a full touch target even when the glyph is small. */
export function IconButton({
  label,
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-mist-300 transition-colors hover:bg-ink-800 hover:text-mist-100 active:scale-[0.94] disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- inputs */

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-mist-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-mist-500">{hint}</span>}
    </label>
  );
}

/** 16px text: anything smaller makes iOS Safari zoom the page on focus. */
export const inputClass =
  'w-full min-h-11 rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-2.5 text-base text-mist-100 placeholder:text-mist-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

/**
 * The switch reads as a 28px track but is tapped as 44px: the track is an
 * inner span so the button itself can carry the full hit area.
 */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative flex h-11 w-12 shrink-0 items-center"
    >
      <span className={`h-7 w-full rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-ink-600'}`} />
      <span
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-[inset-inline-start] ${checked ? 'start-6' : 'start-1'}`}
      />
    </button>
  );
}

/**
 * The one control for "pick one of a few" — view switchers, filters, modes.
 * Every screen used to hand-roll this; they now look and behave the same.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  // Height is a floor, not padding: these are filter chips people tap on a
  // phone, and they measured 28px before.
  const pad = size === 'sm' ? 'min-h-10 px-2.5 text-xs' : 'min-h-11 px-3 text-sm';
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-0.5 rounded-xl bg-ink-800 p-0.5 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center justify-center rounded-lg font-bold transition-colors ${pad} ${active ? 'bg-brand-500 text-on-brand shadow-sm' : 'text-mist-300 hover:text-mist-100'}`}
          >
            {o.label}
            {o.count !== undefined && <span className="ms-1 tabular-nums opacity-70">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- badges */

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

/** Short Hebrew labels for the pills; the long bilingual names stay in types.ts. */
const statusShort: Record<QueueStatus, string> = {
  scheduled: 'ממתין',
  publishing: 'מפרסם',
  published: 'פורסם',
  failed: 'נכשל',
  skipped: 'דולג',
  manual_pending: 'ידני',
  needs_attention: 'דורש טיפול',
  awaiting_confirmation: 'ממתין לאישור',
  paused: 'מושהה',
};

export function StatusPill({ status, long = false }: { status: QueueStatus; long?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${statusClass[status]}`}>
      {long ? QUEUE_STATUS_LABEL[status] : statusShort[status]}
    </span>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'brand' | 'good' | 'warn' | 'bad' | 'info'; children: React.ReactNode }) {
  const cls = {
    neutral: 'bg-ink-800 text-mist-300',
    brand: 'bg-brand-500/15 text-brand-400',
    good: 'bg-emerald-500/15 text-emerald-700',
    warn: 'bg-amber-500/15 text-amber-700',
    bad: 'bg-rose-500/15 text-rose-700',
    info: 'bg-sky-500/15 text-sky-700',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>{children}</span>;
}

/**
 * Official API vs. assisted publishing, stated plainly wherever a
 * publication is shown. Meta removed the Groups publishing API in April 2024,
 * so a group post is driven through a real browser session — that is not an
 * official integration and this badge never pretends otherwise.
 */
export function MethodBadge({ method, channel }: { method?: PublishMethod; channel?: string }) {
  const resolved: PublishMethod = method || (channel === 'facebook_page' ? 'api' : channel ? 'browser' : '');
  if (!resolved) return null;
  if (resolved === 'api') return <Badge tone="good">API רשמי</Badge>;
  if (resolved === 'browser') return <Badge tone="info">בסיוע דפדפן</Badge>;
  return <Badge tone="brand">ידני</Badge>;
}

/* -------------------------------------------------------------- feedback */

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode }) {
  const cls = {
    info: 'border-sky-300 bg-sky-50 text-sky-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-rose-300 bg-rose-50 text-rose-900',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

/**
 * A KPI tile. Deliberately tighter on phones: a row of these is the first
 * thing on the dashboard, and at full padding they pushed every actionable
 * card below the fold.
 */
export function Tile({
  label,
  value,
  sub,
  tone = 'default',
  href,
  tinted = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'good' | 'bad' | 'warn';
  href?: string;
  /** Paints the tile in its tone instead of plain white. */
  tinted?: boolean;
}) {
  const color = { default: 'text-brand-400', good: 'text-emerald-600', bad: 'text-rose-600', warn: 'text-amber-600' }[tone];
  /*
   * Tinted tiles carry their meaning in the surface, not only in the number,
   * so a red "failed" count is visible at a glance instead of having to be
   * read. The tint is faint enough that the figure keeps its contrast.
   */
  const tint = {
    default: 'bg-brand-500/[0.06] border-brand-500/20',
    good: 'bg-emerald-500/[0.07] border-emerald-500/25',
    bad: 'bg-rose-500/[0.07] border-rose-500/25',
    warn: 'bg-amber-500/[0.09] border-amber-500/30',
  }[tone];
  const body = (
    <>
      <p dir="auto" className="truncate text-[11px] font-bold text-mist-500 sm:text-xs">{label}</p>
      <p className={`mt-0.5 text-xl font-extrabold tabular-nums sm:mt-1 sm:text-2xl ${color}`}>{value}</p>
      {sub && <p dir="auto" className="truncate text-[11px] text-mist-300 sm:mt-0.5 sm:text-xs">{sub}</p>}
    </>
  );
  const cls = `block rounded-2xl border px-3 py-2.5 text-start sm:p-3.5 ${tinted ? tint : 'surface border-ink-700'}`;
  if (href) {
    return (
      <Link href={href} className={`${cls} transition-transform active:scale-[0.98]`}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Thin progress bar. `segments` paints published/failed/skipped in one track. */
export function ProgressBar({
  segments,
  total,
  ariaLabel,
  height = 'h-2',
}: {
  segments: { value: number; className: string }[];
  total: number;
  ariaLabel: string;
  height?: string;
}) {
  const safe = Math.max(1, total);
  return (
    <div className={`flex ${height} overflow-hidden rounded-full bg-ink-700`} role="img" aria-label={ariaLabel}>
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <span key={i} className={`${s.className} transition-[width] duration-500 ease-out`} style={{ width: `${(s.value / safe) * 100}%` }} />
        ))}
    </div>
  );
}

/** Legacy one-liner empty state; new screens should use EmptyState. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-ink-600 px-4 py-6 text-center text-sm text-mist-500">{children}</p>;
}

/**
 * A screen with nothing in it yet should still tell you what to do next —
 * never a blank panel. The action is optional but strongly encouraged.
 */
export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink-600 px-5 py-9 text-center">
      <span aria-hidden className="text-3xl leading-none opacity-80">
        {icon}
      </span>
      <p className="text-base font-extrabold text-mist-100">{title}</p>
      {description && <p className="max-w-md text-sm leading-relaxed text-mist-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="grid place-items-center py-16">
      <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
    </div>
  );
}

/** Grey placeholder with the shimmer defined in globals.css. */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <span aria-hidden className={`block rounded-lg bg-ink-800 skeleton-shimmer ${className}`} />;
}

/** The shape of a loading list: rows of avatar + two lines. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="space-y-3" aria-busy="true" aria-label="טוען…">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="grow space-y-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SkeletonTiles({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 [&>*]:min-w-0" aria-busy="true" aria-label="טוען…">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[74px] rounded-2xl" />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- toasts */

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => undefined);

/** `const toast = useToast(); toast('הקמפיין נוצר')` from anywhere under the shell. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, tone: ToastTone = 'success') => {
    seq.current += 1;
    const id = seq.current;
    setItems((all) => [...all, { id, tone, text }]);
    setTimeout(() => setItems((all) => all.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Above the bottom tab bar on phones, bottom-right on desktop. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold shadow-xl ${
              t.tone === 'error' ? 'bg-rose-600 text-white' : t.tone === 'info' ? 'bg-ink-800 text-mist-100' : 'bg-emerald-600 text-white'
            }`}
          >
            {t.tone === 'error' ? <XCircleIcon className="h-5 w-5 shrink-0" /> : t.tone === 'success' ? <CheckCircleIcon className="h-5 w-5 shrink-0" /> : null}
            <span className="min-w-0">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------- sheets & modals */

/**
 * One overlay for both shapes: a bottom sheet on phones (thumb-reachable,
 * the iOS convention) and a centred dialog from `md` up. Height is capped
 * below the viewport so a long body scrolls inside instead of pushing the
 * actions off-screen.
 */
export function Sheet({
  open,
  onClose,
  title,
  footer,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  size?: 'md' | 'lg';
}) {
  const titleId = useId();
  // document.body only exists in the browser, so the portal waits for mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /*
   * The theme the sheet escaped from.
   *
   * Palettes here are scoped class overrides — .crm-theme re-resolves the
   * ink/mist/brand tokens to the light set, and /social renders inside it.
   * Portalling to <body> leaves that scope, so the sheet fell back to the
   * storefront's dark tokens: every sheet in a light-themed product came up
   * charcoal. Measured on the real markup — the dialog resolved --color-ink-850
   * to #24272b while the card behind it resolved the same token to #fff.
   *
   * So carry the class across rather than hardcoding one: the anchor below
   * stays in the tree, and whatever theme wraps it wraps the portal too.
   */
  const anchor = useRef<HTMLSpanElement>(null);
  const [themeClass, setThemeClass] = useState('');
  useEffect(() => {
    if (!open) return;
    const host = anchor.current?.closest<HTMLElement>('[class*="-theme"]');
    setThemeClass(host ? host.className : '');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Freeze the page behind the sheet so a scroll gesture moves the sheet.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  /*
   * Portalled to <body>, and that is not a nicety — it is the fix.
   *
   * A sheet rendered in place is a direct child of <main class="crm-page">,
   * which gives every child an entrance animation. Two things follow, and
   * both break a modal:
   *
   *   1. `.crm-page > *` outranks `.sheet-in`, so the page's animation wins
   *      and the panel's own entrance never runs. Measured on the real
   *      markup: animationName came back as "crm-child-in".
   *   2. That animation tweens `transform`, and the computed value settles at
   *      matrix(1,0,0,1,0,0) — NOT `none`. Any transform other than `none`
   *      makes an element the containing block for fixed descendants, so
   *      `position: fixed; bottom: 0` stops meaning "the bottom of the
   *      screen" and starts meaning "the bottom of this page", which on a
   *      long editor is far below the fold. That is where the publish button
   *      kept going.
   *
   * Outside the page's DOM none of it can reach the sheet, whatever a screen
   * does to its own children.
   */
  // Rendered in place even when closed: it is what locates the theme, and it
  // draws nothing.
  const themeAnchor = <span ref={anchor} hidden aria-hidden />;

  if (!open || !mounted) {
    return themeAnchor;
  }
  return (
    <>
      {themeAnchor}
      {createPortal(
        <div className={themeClass}>
      {/*
       * The panel is `fixed … bottom-0` in its own right, NOT absolutely
       * positioned inside a full-screen overlay.
       *
       * That distinction is the whole bug. On iOS Safari a fixed element's
       * containing block is the LARGE viewport — the one measured with the
       * toolbars hidden — so `inset-0` produces a box taller than the screen,
       * and a child pinned to ITS bottom lands underneath Safari's bottom bar.
       * That is where the "start publishing" button went. The app's own bottom
       * tab bar has always rendered correctly on the same device using exactly
       * the pattern below, so the sheet now uses it too.
       *
       * svh (the SMALL viewport, measured with the toolbars shown) caps the
       * height: unlike dvh it never exceeds what is actually visible.
       */}
      <button
        type="button"
        aria-label="סגור"
        className="fixed inset-0 z-[70] cursor-default bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`sheet-in fixed inset-x-0 bottom-0 z-[71] mx-auto flex max-h-[85svh] flex-col rounded-t-3xl bg-ink-850 shadow-2xl md:bottom-[8vh] md:max-h-[80svh] md:rounded-3xl ${
          size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-lg'
        }`}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-600 md:hidden" />
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <h2 id={titleId} className="text-base font-extrabold text-mist-100">
            {title}
          </h2>
          <IconButton label="סגור" onClick={onClose} className="-me-2">
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </header>
        {/* The safe-area inset belongs to whichever element is last, so the
            action button never sits under the home indicator. */}
        <div className={`min-h-0 grow overflow-y-auto px-4 ${footer ? 'pb-4' : 'pb-[calc(1rem+env(safe-area-inset-bottom))]'}`}>{children}</div>
        {footer && (
          <footer className="shrink-0 border-t border-ink-700 bg-ink-850 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</footer>
        )}
      </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Replaces window.confirm for anything destructive. Returns a component plus
 * an `ask()` that resolves when the person answers, so callers keep reading
 * top to bottom:
 *
 *   if (!(await confirm.ask({ title: 'לעצור?', danger: true }))) return;
 */
export interface ConfirmRequest {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback((req: ConfirmRequest) => {
    setRequest(req);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((ok: boolean) => {
    setRequest(null);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const dialog = request ? (
    <Sheet open onClose={() => answer(false)} title={request.title}>
      {request.body && <div className="text-sm leading-relaxed text-mist-300">{request.body}</div>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onClick={() => answer(false)} className="sm:min-w-28">
          {request.cancelLabel ?? 'ביטול'}
        </Button>
        <Button variant={request.danger ? 'danger' : 'primary'} size="lg" onClick={() => answer(true)} className="sm:min-w-28">
          {request.confirmLabel ?? 'אישור'}
        </Button>
      </div>
    </Sheet>
  ) : null;

  return useMemo(() => ({ ask, dialog }), [ask, dialog]);
}

/* ----------------------------------------------------------------- menus */

export interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * The "⋯" overflow used by group and campaign cards, so a card carries one
 * primary action and everything else lives one tap away instead of crowding
 * it. Renders as a bottom sheet on phones — a 12px dropdown item is not a
 * touch target.
 */
export function OverflowMenu({ label, actions, className = '' }: { label: string; actions: MenuAction[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-extrabold leading-none text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-100 ${className}`}
      >
        ⋯
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <ul role="menu" className="pb-2">
          {actions.map((a) => (
            <li key={a.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={() => {
                  setOpen(false);
                  a.onSelect();
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-start text-base font-bold transition-colors disabled:opacity-40 ${
                  a.danger ? 'text-rose-600 hover:bg-rose-500/10' : 'text-mist-100 hover:bg-ink-800'
                }`}
              >
                {a.icon && <span className="grid h-6 w-6 shrink-0 place-items-center">{a.icon}</span>}
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

/* =============================================================== surfaces */

/**
 * The design language, in four rules, so screens stop inventing their own:
 *
 *   surface   one white card style — hairline border, soft shadow, r-2xl
 *   section   a heading and an optional "show all", never a card in a card
 *   stat      a figure with an icon chip; colour marks the status, not the card
 *   row       a compact list line: image, name, meta, status, menu
 *
 * Colour is reserved for state. A card is white; a number can be green, red or
 * amber; nothing else is tinted. That is what separates a product from an
 * admin template, and it is cheap to hold once it lives in one file.
 */
export const CARD = 'rounded-2xl border border-ink-700 bg-ink-850 shadow-[0_1px_2px_rgba(13,38,76,0.04),0_8px_24px_-16px_rgba(13,38,76,0.18)]';

type Tone = 'brand' | 'good' | 'bad' | 'warn' | 'neutral';

/** Icon chip colours. The chip is tinted; the card never is. */
const CHIP: Record<Tone, string> = {
  brand: 'bg-brand-500/10 text-brand-500',
  good: 'bg-emerald-500/10 text-emerald-600',
  bad: 'bg-rose-500/10 text-rose-600',
  warn: 'bg-amber-500/12 text-amber-600',
  neutral: 'bg-ink-800 text-mist-500',
};

/** The figure's colour. Neutral by default: not every number is a status. */
const FIGURE: Record<Tone, string> = {
  brand: 'text-brand-500',
  good: 'text-emerald-600',
  bad: 'text-rose-600',
  warn: 'text-amber-600',
  neutral: 'text-mist-100',
};

/**
 * A section heading with an optional link to the full list. Sections are
 * separated by a heading and space, not by nesting another card.
 */
export function SectionHeader({ title, href, linkLabel = 'הצג הכל' }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-extrabold tracking-tight text-mist-100">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex min-h-10 items-center gap-0.5 text-sm font-bold text-brand-500">
          {linkLabel}
          <ChevronIcon className="h-4 w-4 rtl:rotate-180" />
        </Link>
      )}
    </div>
  );
}

/**
 * One statistic. The number is the element; the icon chip carries the tone and
 * the chevron appears only when there is somewhere to go.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${CHIP[tone]}`}>
          {icon}
        </span>
        {href && <ChevronIcon aria-hidden className="mt-1 h-4 w-4 shrink-0 text-mist-500 rtl:rotate-180" />}
      </div>
      <p dir="auto" className="mt-2 truncate text-xs font-bold text-mist-500">
        {label}
      </p>
      <p className={`text-[26px] font-extrabold leading-none tabular-nums ${FIGURE[tone]}`}>{value}</p>
      {sub && (
        <p dir="auto" className="mt-1 truncate text-[11px] text-mist-500">
          {sub}
        </p>
      )}
    </>
  );
  const cls = `${CARD} block min-w-0 p-3.5 text-start`;
  return href ? (
    <Link href={href} className={`${cls} transition-transform active:scale-[0.985]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * A compact alert. One line of what happened, one of what it means, and the
 * way to act on it — never a full-width banner that pushes the screen down.
 */
export function AlertBar({
  tone = 'bad',
  title,
  body,
  actionLabel,
  href,
  onAction,
}: {
  tone?: 'bad' | 'warn' | 'info';
  title: string;
  body?: string;
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
}) {
  const skin = {
    bad: 'border-rose-500/25 bg-rose-500/[0.06]',
    warn: 'border-amber-500/30 bg-amber-500/[0.07]',
    info: 'border-brand-500/25 bg-brand-500/[0.06]',
  }[tone];
  const mark = { bad: 'bg-rose-500 text-white', warn: 'bg-amber-500 text-white', info: 'bg-brand-500 text-white' }[tone];
  const link = { bad: 'text-rose-700 border-rose-500/30', warn: 'text-amber-700 border-amber-500/30', info: 'text-brand-500 border-brand-500/30' }[tone];

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${skin}`}>
      <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${mark}`}>
        !
      </span>
      <div className="min-w-0 grow">
        <p dir="auto" className="truncate text-sm font-extrabold text-mist-100">
          {title}
        </p>
        {body && (
          <p dir="auto" className="truncate text-xs text-mist-500">
            {body}
          </p>
        )}
      </div>
      {actionLabel &&
        (href ? (
          <Link href={href} className={`inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-xl border bg-ink-850 px-2.5 text-sm font-bold ${link}`}>
            {actionLabel}
            <ChevronIcon className="h-4 w-4 rtl:rotate-180" />
          </Link>
        ) : (
          <button type="button" onClick={onAction} className={`inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-xl border bg-ink-850 px-2.5 text-sm font-bold ${link}`}>
            {actionLabel}
            <ChevronIcon className="h-4 w-4 rtl:rotate-180" />
          </button>
        ))}
    </div>
  );
}

/** The colour of a status dot in a list row. */
export const DOT_TONE: Record<Tone, string> = {
  brand: 'text-brand-500',
  good: 'text-emerald-500',
  bad: 'text-rose-500',
  warn: 'text-amber-500',
  neutral: 'text-mist-500',
};

/**
 * A line in a compact list: picture, name, one line of context, a time, a
 * status dot and an overflow menu. Deliberately not a card — a screenful of
 * cards reads as a template.
 */
export function ListRow({
  media,
  title,
  subtitle,
  meta,
  tone = 'neutral',
  href,
  actions,
  menuLabel,
}: {
  media?: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  tone?: Tone;
  href?: string;
  actions?: MenuAction[];
  menuLabel?: string;
}) {
  const inner = (
    <>
      {media && <span className="shrink-0">{media}</span>}
      <span className="min-w-0 grow text-start">
        <span dir="auto" className="block truncate text-sm font-bold text-mist-100">
          {title}
        </span>
        {subtitle && (
          <span dir="auto" className="mt-0.5 block truncate text-xs text-mist-500">
            {subtitle}
          </span>
        )}
      </span>
      {meta && <span className="shrink-0 tabular-nums text-sm font-bold text-mist-300">{meta}</span>}
      <DotIcon aria-hidden className={`h-2.5 w-2.5 shrink-0 ${DOT_TONE[tone]}`} />
    </>
  );

  return (
    <li className="flex items-center gap-3 py-2.5">
      {href ? (
        <Link href={href} className="flex min-h-11 min-w-0 grow items-center gap-3">
          {inner}
        </Link>
      ) : (
        <span className="flex min-h-11 min-w-0 grow items-center gap-3">{inner}</span>
      )}
      {actions && actions.length > 0 && <OverflowMenu label={menuLabel ?? `פעולות עבור ${title}`} actions={actions} />}
    </li>
  );
}
