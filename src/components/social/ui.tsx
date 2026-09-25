'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
 *   spacing     gap-1 / gap-1.5 / gap-2 / gap-2.5 inside a control · gap-3
 *               between the rows of a list · gap-4 / gap-5 between a page's
 *               top-level blocks. Counted, not wished for: those seven steps
 *               are every gap in the module.
 *   radius      lg (8px, chips) · xl (12px, controls) · rounded-tile (18px,
 *               tiles) · rounded-card (20px, panels) · rounded-sheet (22px)
 *               · full (pills, avatars). `2xl` is not used anywhere in the
 *               module; a hand-typed radius such as rounded-[14px] is drift,
 *               not a step, and belongs on the nearest one above.
 *   type        11px meta (the floor — 10px Hebrew on a phone is a squint) ·
 *               13-14px body · 16px input (never smaller on iOS, or Safari
 *               zooms the page on focus) · 18-34px numbers
 *   controls    h-11 (44px) is the minimum touch target. The `sm` size is
 *               40px and is used on phones; it is under the floor and
 *               worker/test/layout.test.ts currently pins that 40px in
 *               source, so raising it means re-pointing the guard in the
 *               same change. `variant="chips"` on SegmentedControl is the
 *               compact filter row that keeps the full 44px.
 *   colour      four hues, and the Hebrew label carries any distinction the
 *               hue no longer does:
 *                 BLUE   actions, navigation, and WAITING
 *                 GREEN  active, published, success
 *                 RED    failed, critical
 *                 AMBER  warning, and anything that needs a person
 *               Violet, fuchsia, orange, sky and slate are gone from the
 *               product: "do not turn the whole app blue" is not answered
 *               by turning it into a rainbow either.
 *
 * Every colour below is a TOKEN, never a literal Tailwind palette class. The
 * palette classes were tuned against a white card and measured 2.4:1 the
 * moment the theme went dark; tokens re-resolve per theme, and
 * worker/test/contrast.test.ts measures them on every build.
 */

/* ------------------------------------------------------------------ tone */

/**
 * The five tones, and the four class maps every component reads instead of
 * picking a colour of its own.
 *
 * The step suffixes are roles, not lightness — see the state-token comment in
 * globals.css. What matters at a call site:
 *
 *   TONE_TEXT    the -400 step. Every entry clears 4.5:1 on a card AND on a
 *                sheet, so a status is as readable inside a modal as behind
 *                it (6.77 / 6.94 / 6.13 / 8.36 / 7.73 on a card).
 *   TONE_FILL    the indicator step. NON-TEXT only — dots, bar segments, the
 *                round "!" mark — where 3:1 is the bar. brand-300 and
 *                error-300 live here and nowhere else, because as text they
 *                measure 4.49 and 4.17 and would fail.
 *   TONE_TINT    a 12% wash. Pair it with TONE_TEXT, never with TONE_FILL.
 *   TONE_BORDER  the same hue at 30%, for a tinted block's edge.
 */
export type Tone = 'brand' | 'good' | 'bad' | 'warn' | 'neutral';

export const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-brand-400',
  good: 'text-success-400',
  bad: 'text-error-400',
  warn: 'text-warning-400',
  neutral: 'text-mist-300',
};

export const TONE_FILL: Record<Tone, string> = {
  brand: 'bg-brand-300',
  good: 'bg-success-400',
  bad: 'bg-error-300',
  warn: 'bg-warning-400',
  neutral: 'bg-mist-500',
};

export const TONE_TINT: Record<Tone, string> = {
  brand: 'bg-brand-300/12',
  good: 'bg-success-400/12',
  bad: 'bg-error-300/12',
  warn: 'bg-warning-400/12',
  neutral: 'bg-ink-800',
};

export const TONE_BORDER: Record<Tone, string> = {
  brand: 'border-brand-300/30',
  good: 'border-success-400/30',
  bad: 'border-error-300/30',
  warn: 'border-warning-400/30',
  neutral: 'border-ink-700',
};

/**
 * One definition of what a queue status LOOKS like, to go beside status.ts's
 * one definition of what it means.
 *
 * The same nine statuses were coloured independently in four places — this
 * file's pill, Timeline's dot, PublicationItem's row and
 * CampaignProgressBar's legend — and the four copies drifted. Import this
 * rather than writing a fifth. It is presentation only: nothing here decides
 * which rows are counted, cancelled or retried, and status.ts remains the
 * sole source of those lists.
 */
export const STATUS_TONE: Record<QueueStatus, Tone> = {
  // Waiting is BLUE, in-flight included: a publication going out on its own
  // is not a warning, and the pulse on the dot carries the liveness.
  scheduled: 'brand',
  publishing: 'brand',
  published: 'good',
  failed: 'bad',
  // Skipped is not a failure — it is the scheduler declining a slot. Painting
  // it red is how a healthy run used to read as a disaster.
  skipped: 'neutral',
  // Amber is reserved for "a person is needed", which is exactly these three.
  manual_pending: 'warn',
  needs_attention: 'warn',
  awaiting_confirmation: 'warn',
  paused: 'neutral',
};

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
  /**
   * The card's header control. Whatever goes here is a tap target, so it needs
   * the 44px floor itself — the header is `items-start`, so the row will not
   * stretch it. A bare `<Link className="text-sm font-bold …">` measures 21px
   * tall in the browser; `inline-flex min-h-11 items-center` is the shape the
   * call sites use, and `SectionHeader` is the same control with it built in.
   */
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
        <header className={`mb-3.5 flex items-start justify-between gap-3 ${padded ? '' : 'px-4 pt-4'}`}>
          <div className="min-w-0">
            {title && <h2 dir="auto" className="truncate text-base font-extrabold leading-tight text-mist-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-snug text-mist-500">{subtitle}</p>}
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
        <h3 className="text-sm font-extrabold uppercase leading-tight tracking-wide text-mist-500">{title}</h3>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-mist-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------- buttons */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

/*
 * Four variants, each measured in every state it can be in.
 *
 * The primary is brand-500 rather than the palette's bright --brand: white on
 * #168bff is 3.40 and would have put the most-pressed control in the product
 * under AA. On brand-500 it is 4.95, on the hover step 6.62, on the pressed
 * step 9.07 — a press gets MORE legible, not less.
 *
 * disabled:opacity-50 fades a filled button toward its surface, which on a
 * dark ground reads closer to "gone" than to "greyed out". That is deliberate
 * and it carries an obligation: a disabled button must never be the only
 * thing saying why, so every caller repeats the reason in adjacent text.
 */
const buttonClass: Record<ButtonVariant, string> = {
  /* `grad-primary` is the theme's one gradient (globals.css). It sits on top of
     bg-brand-500, which stays as the fallback colour any theme without the
     class still resolves — and as the thing `disabled:` fades. */
  primary:
    'grad-primary bg-brand-500 text-on-brand shadow-[0_7px_18px_rgba(124,58,237,0.25)] hover:bg-brand-600 active:bg-brand-700 disabled:shadow-none',
  secondary: 'border border-ink-700 bg-ink-900 text-brand-400 hover:bg-ink-800 active:bg-ink-800',
  danger: 'bg-error-500 text-on-state shadow-[0_7px_18px_rgba(180,35,24,0.25)] hover:bg-[#9a1e14] active:bg-[#851a11] disabled:shadow-none',
  ghost: 'text-brand-400 hover:bg-ink-800 active:bg-ink-800',
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

/**
 * The shared shape, so a link that looks like a button really matches one.
 *
 * It also carries the ONE focus-visible treatment in the module. The global
 * ring in globals.css is brand-500, which is a surface colour in this theme
 * and sits at 3.73 on the page; brand-300 is the indicator blue and measures
 * 5.43 on the page, 4.49 on a card, 4.10 on a sheet. The offset is painted in
 * ink-950 so the ring never touches a same-hue fill — without it a blue ring
 * on the blue primary button is invisible.
 */
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold leading-none transition-[background-color,border-color,transform,box-shadow] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:cursor-not-allowed disabled:opacity-50';

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
      // disabled is an explicit colour, not opacity: mist-300 at 40% over a
      // navy card composites to 2.06:1 and the control simply disappears.
      // ink-600 holds 3.66 — dimmed, still findable by a thumb.
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-mist-300 transition-colors hover:bg-ink-800 hover:text-mist-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 active:scale-[0.94] disabled:pointer-events-none disabled:text-ink-600 ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- inputs */

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold leading-snug text-mist-300">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-mist-500">{hint}</span>}
    </label>
  );
}

/**
 * 16px text: anything smaller makes iOS Safari zoom the page on focus.
 *
 * The fill is ink-900, one step BELOW the card, so a field reads as a recess
 * rather than as another panel — on a dark ground that is most of what tells
 * a finger where to tap. The edge is ink-600, the solid control step, at
 * 3.66:1 on a card; the ambient hairline is 1.34 and would leave the field
 * with no measurable boundary at all.
 *
 * The focus ring was brand-500 at 30% alpha, which composites to roughly
 * #0e3e6a over this card — about 1.3:1, i.e. no ring. brand-300 at full
 * strength on the border plus a 40% halo is the visible equivalent.
 */
export const inputClass =
  'w-full min-h-11 rounded-xl border border-ink-600 bg-ink-900 px-3.5 py-2.5 text-base leading-normal text-mist-100 transition-colors placeholder:text-mist-500 hover:border-[#7a6da6] focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40 disabled:cursor-not-allowed disabled:opacity-50';

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
      className="relative flex h-11 w-12 shrink-0 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
    >
      {/* The ON track is brand-300, the indicator blue — a track is a fill,
          not a label, so the 3:1 bar applies and the brighter step reads far
          better against the OFF state than the button surface does. */}
      <span className={`h-7 w-full rounded-full transition-colors ${checked ? 'bg-brand-300' : 'bg-ink-600'}`} />
      {/* The knob stays literal white rather than a token: it is the one mark
          that has to read against BOTH track colours, and white is the best
          available on each (3.40 on the on-track, 3.03 on the off-track). */}
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
  variant = 'track',
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  label?: string;
  size?: 'sm' | 'md';
  /**
   * `track` is the original and stays the default, so no existing call site
   * changes. `chips` is the phone filter row — see the comment on the branch
   * below for what it buys and why it is a variant rather than a new
   * component.
   */
  variant?: 'track' | 'chips';
  className?: string;
}) {
  // Height is a floor, not padding: these are filter chips people tap on a
  // phone, and they measured 28px before.
  const pad = size === 'sm' ? 'min-h-10 px-3 text-xs' : 'min-h-11 px-3.5 text-sm';

  /*
   * The compact filter row, for screens where the filters cost more of the
   * phone than the results do.
   *
   * Three stacked `track` rows on /social/groups measure 48px each — a 40px
   * chip plus the rail's own 4px above and below — and a row with more
   * options than fit wraps to a second line, so a long city list costs 96.
   * This branch drops the rail (each chip carries its own fill, so it still
   * has an edge), pins every chip at the 44px floor whatever `size` says,
   * and scrolls sideways instead of wrapping: one row is 44px whether it
   * holds three cities or thirty.
   *
   * `min-w-0` on the scroller is load-bearing, not tidiness. A flex child
   * cannot shrink below its content, so without it the chips widen the
   * whole page sideways instead of scrolling inside their own row — the bug
   * worker/test/layout.test.ts exists to catch. Note the guard reads plain
   * string classNames only, so it cannot see this one: it is here because it
   * is required, not because it is checked.
   *
   * The count stays inline and at full strength for the same reason it does
   * on the track below — it is a real filter count, not decoration.
   */
  if (variant === 'chips') {
    return (
      <div role="group" aria-label={label} className={`flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none ${className}`}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              /*
               * A chip is a card, not a pill: white with its own hairline,
               * at the card radius. The tinted-pill form had no edge of its
               * own — on a white-purple page ink-800 is a whisker off the
               * ground, so a row of inactive filters read as text floating on
               * the page and the only thing with a shape was whichever one
               * was on. The active chip keeps the gradient and gains the same
               * violet lift the rest of the module's pressed controls have.
               */
              className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 text-xs transition-[background-color,border-color,box-shadow] ${
                active
                  ? 'grad-primary border-transparent bg-brand-500 font-extrabold text-on-brand shadow-[0_5px_14px_rgba(124,58,237,0.2)]'
                  : 'border-ink-700 bg-ink-900 font-bold text-mist-300 hover:border-brand-300/40 hover:text-mist-100'
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950`}
            >
              {o.label}
              {o.count !== undefined && <span className="ms-1 font-normal tabular-nums">{o.count}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-1 rounded-xl bg-ink-800 p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            /*
             * Three things change at once on the active chip — a solid fill,
             * a white label and the blue drop shadow that
             * `.social-theme [role='group'] > [aria-pressed='true']` adds —
             * because a tint alone was not answering "which filter am I on"
             * at arm's length on a phone.
             */
            className={`inline-flex items-center justify-center rounded-lg transition-colors ${pad} ${
              active ? 'grad-primary bg-brand-500 font-extrabold text-on-brand' : 'font-bold text-mist-300 hover:bg-ink-900 hover:text-mist-100'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-800`}
          >
            {o.label}
            {/* Dimming the count put it below AA on BOTH chips: 3.7:1 on the
                blue fill when active, and 4.26:1 for mist-300 at 70% over the
                ink-800 track when not (measured in the browser, 12px text, so
                4.5 is the floor). It is a real filter count, not decoration —
                it stays at full strength on either chip and is set apart by
                weight instead, which costs nothing. mist-300 on ink-800 is
                7.07:1. */}
            {o.count !== undefined && <span className="ms-1 font-normal tabular-nums">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- badges */

/*
 * Nine statuses, five of them on a white-tuned literal colour: sky-700,
 * violet-700, orange-700 and fuchsia-700 measure 2.2-3.0:1 on a navy card.
 * They collapse onto the four tones above — the Hebrew label below already
 * carries every distinction the hue was being asked to make.
 */
const statusClass: Record<QueueStatus, string> = Object.fromEntries(
  (Object.keys(STATUS_TONE) as QueueStatus[]).map((k) => [k, `${TONE_TINT[STATUS_TONE[k]]} ${TONE_TEXT[STATUS_TONE[k]]}`]),
) as Record<QueueStatus, string>;

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
    // px-2.5 and gap-1, not the roomier px-3/gap-1.5 the rest of the pills
    // use: this pill shares a 343px queue row with an avatar, a name and an
    // overflow menu, and every pixel it takes comes off the group name.
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${statusClass[status]}`}>
      {/* A 6px dot in the indicator step, pulsing only while a publication is
          actually in flight — so "happening now" does not depend on noticing
          a number change. The pulse is a class, which is what lets the
          reduced-motion block in globals.css switch it off. */}
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_FILL[STATUS_TONE[status]]} ${status === 'publishing' ? 'pulse-dot' : ''}`} />
      {long ? QUEUE_STATUS_LABEL[status] : statusShort[status]}
    </span>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'brand' | 'good' | 'warn' | 'bad' | 'info'; children: React.ReactNode }) {
  // `info` is kept as a prop value so call sites do not have to change, but
  // it resolves to the same blue as `brand`: sky was a fifth hue doing a job
  // blue already does.
  const t: Tone = tone === 'info' ? 'brand' : tone;
  const cls = `${TONE_TINT[t]} ${TONE_TEXT[t]}`;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>{children}</span>;
}

/**
 * Official API vs. assisted publishing, stated plainly wherever a
 * publication is shown. Meta removed the Groups publishing API in April 2024,
 * so a group post is driven through a real browser session — that is not an
 * official integration and this badge never pretends otherwise.
 */
export function MethodBadge({ method, channel }: { method?: PublishMethod; channel?: string }) {
  const resolved: PublishMethod = method || (channel ? 'browser' : '');
  if (!resolved) return null;
  if (resolved === 'api') return <Badge tone="good">API רשמי</Badge>;
  if (resolved === 'browser') return <Badge tone="info">בסיוע דפדפן</Badge>;
  return <Badge tone="brand">ידני</Badge>;
}

/* -------------------------------------------------------------- feedback */

/**
 * Inline explanation, tinted to its tone.
 *
 * The four skins here were `bg-sky-50` / `bg-amber-50` / `bg-rose-50` /
 * `bg-emerald-50` with a -900 label: near-white blocks that on this ground
 * rendered at 14:1 against the page — holes punched in the design, with text
 * inside them at 1.6:1. A 12% wash of the tone plus its text step is the same
 * idea that actually works on a dark surface.
 */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode }) {
  const t: Tone = { info: 'brand', warn: 'warn', error: 'bad', success: 'good' }[tone] as Tone;
  return (
    <div className={`rounded-card border px-3.5 py-3 text-sm leading-relaxed ${TONE_BORDER[t]} ${TONE_TINT[t]} ${TONE_TEXT[t]}`}>
      {children}
    </div>
  );
}

/**
 * A failed read, with the one control that gets out of it.
 *
 * `Notice` takes children and has no action slot, so every screen that lost
 * its first read was left with a red banner over a skeleton that shimmered
 * for ever and no way forward but a browser reload — on a phone, for an owner
 * who is not technical. This is that banner plus the retry, so a screen needs
 * one element instead of hand-rolling the pair.
 *
 * `message` is already-Hebrew prose: pass `friendlyMessage(err, …)` from
 * lib/social/errors.ts, never the exception. Nothing here inspects, formats
 * or falls back to an error object — a raw exception must not be able to
 * reach a screen through this component either.
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = 'נסו שוב',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    // role="alert" so the failure is announced when it appears, rather than
    // only being found by someone already scanning the screen.
    <div role="alert" className={`rounded-card border px-3.5 py-3 ${TONE_BORDER.bad} ${TONE_TINT.bad}`}>
      <p dir="auto" className={`text-sm leading-relaxed ${TONE_TEXT.bad}`}>
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-3">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * How old the numbers above this line are, in Hebrew, counting up live.
 *
 * Every screen in the module polls on a timer and none of them say when the
 * last read actually landed, so a dashboard returned to after a locked phone
 * looks exactly like one a second old.
 *
 * Deliberately dumb: it takes an instant and re-renders itself. It never
 * fetches, never polls and never decides anything is stale — the screen owns
 * its reads and passes the moment one of them SUCCEEDED. Before the first
 * success `at` is null and the line is not drawn at all, because a freshness
 * claim with nothing behind it is an invented number.
 *
 * No dir="ltr" island: the string is one number between two Hebrew words,
 * with no neutral separator between two digit runs, so there is nothing for
 * the bidi algorithm to reorder. The islands in DateTime.tsx are for
 * "19.09.2026, 14:05", which is a different shape.
 */
function agoHe(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 5) return 'זה עתה';
  // The duals are not decoration: "לפני 2 דקות" is the kind of line that tells
  // an owner nobody read the screen. Same forms relativeHe() uses.
  if (sec < 60) return sec === 1 ? 'לפני שנייה' : sec === 2 ? 'לפני שתי שניות' : `לפני ${sec} שניות`;
  const min = Math.round(sec / 60);
  if (min < 60) return min === 1 ? 'לפני דקה' : min === 2 ? 'לפני שתי דקות' : `לפני ${min} דקות`;
  const hours = Math.round(min / 60);
  return hours === 1 ? 'לפני שעה' : hours === 2 ? 'לפני שעתיים' : `לפני ${hours} שעות`;
}

export function Freshness({ at, className = '' }: { at: Date | string | number | null | undefined; className?: string }) {
  const ms = at === null || at === undefined ? NaN : new Date(at).getTime();
  const [now, setNow] = useState(() => Date.now());
  const live = !Number.isNaN(ms);
  useEffect(() => {
    if (!live) return;
    // A second is the right beat for a counter someone can watch tick, and
    // the visibility check is the same guard every other timer in the module
    // carries: a backgrounded tab should not be re-rendering a label nobody
    // is looking at.
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [live]);
  if (!live) return null;
  return <p className={`text-[11px] leading-tight text-mist-500 ${className}`}>עודכן {agoHe(now - ms)}</p>;
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
  tone = 'neutral',
  href,
  tinted = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /*
   * The full Tone vocabulary, and `neutral` is the default.
   *
   * There used to be no `neutral` in this union at all, and the default was
   * named `default` and resolved to BRAND. So a "דולגו" tile — a status
   * STATUS_TONE explicitly calls neutral, because skipping is the scheduler
   * declining a slot and not a failure — came out in the waiting blue, beside
   * a "ממתינים" tile in the same blue meaning the opposite thing. On the
   * campaign screen the Counter 200px above it rendered the very same figure
   * in grey. And `tone={n ? 'bad' : 'default'}` painted a ZERO failure count
   * in the action colour.
   *
   * `default` is kept as an accepted value so nothing breaks, and folds to
   * `brand` for any call site that meant "the action colour".
   */
  tone?: Tone | 'default';
  href?: string;
  /** Paints the tile in its tone instead of plain white. */
  tinted?: boolean;
}) {
  const t: Tone = tone === 'default' ? 'brand' : tone;
  // Neutral takes mist-100, the same exception StatCard's FIGURE map makes:
  // this is the number being read, and mist-300 makes it look disabled.
  const color = t === 'neutral' ? 'text-mist-100' : TONE_TEXT[t];
  /*
   * Tinted tiles carry their meaning in the surface, not only in the number,
   * so a red "failed" count is visible at a glance instead of having to be
   * read. The tint is faint enough that the figure keeps its contrast.
   */
  const tint = `${TONE_TINT[t]} ${TONE_BORDER[t]}`;
  const body = (
    <>
      <p dir="auto" className="truncate text-[11px] font-bold leading-tight text-mist-500 sm:text-xs">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold leading-none tabular-nums sm:mt-1 sm:text-3xl ${color}`}>{value}</p>
      {sub && (
        <p dir="auto" className="mt-1 truncate text-[11px] leading-tight text-mist-500 sm:text-xs">
          {sub}
        </p>
      )}
    </>
  );
  const cls = `block rounded-tile border px-3 py-2.5 text-start sm:p-3.5 ${tinted ? tint : 'surface border-ink-700'}`;
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
    // The track is the ambient hairline token, which composites to #213b59 on
    // a card. Every fill a caller passes clears 3:1 against that: published
    // 5.20, waiting 3.36, failed 3.42, skipped 4.27.
    <div className={`flex ${height} min-w-0 overflow-hidden rounded-full bg-ink-700`} role="img" aria-label={ariaLabel}>
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <span key={i} className={`${s.className} transition-[width] duration-200 ease-out`} style={{ width: `${(s.value / safe) * 100}%` }} />
        ))}
    </div>
  );
}

/** Legacy one-liner empty state; new screens should use EmptyState. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-card border border-dashed border-ink-600 px-4 py-6 text-center text-sm leading-relaxed text-mist-500">{children}</p>;
}

/**
 * A screen with nothing in it yet should still tell you what to do next —
 * never a blank panel. The action is optional but strongly encouraged.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  /** An SVG icon. Emoji read as placeholder art in a product this size. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    // Compact on purpose: "nothing here yet" should not take most of a phone
    // screen. The dashed edge says the space is waiting to be filled.
    <div className="flex flex-col items-center gap-1.5 rounded-card border border-dashed border-ink-600 px-5 py-7 text-center">
      {icon && (
        <span aria-hidden className="mb-0.5 grid h-11 w-11 place-items-center rounded-full bg-brand-300/12 text-brand-400">
          {icon}
        </span>
      )}
      <p className="text-base font-extrabold leading-tight text-mist-100">{title}</p>
      {description && <p className="max-w-sm text-sm leading-relaxed text-mist-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="grid place-items-center py-16">
      {/* brand-300, not brand-500: a spinner is a mark, not a label, and
          brand-500 is a surface colour that sits at 3.09 as ink on a card. */}
      <SpinnerIcon className="h-7 w-7 animate-spin text-brand-300" />
    </div>
  );
}

/**
 * Placeholder with the shimmer defined in globals.css. The base is ink-800 —
 * one step ABOVE the card, so the block is visible as a shape on a dark
 * ground; ink-900 would have sunk into the panel and read as nothing loading.
 */
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

/**
 * The stat row while it loads. Grid, gap, count and radius all match the real
 * row in StatCard — a placeholder that is the wrong shape is worse than none,
 * because the page jumps when the numbers land. The height is the tile's own:
 * p-3 + the label + a 30px figure + the sub line, and one step taller from
 * `sm`, where the figure goes to 34.
 */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 [&>*]:min-w-0" aria-busy="true" aria-label="טוען…">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[93px] rounded-tile sm:h-[101px]" />
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

/** `const toast = useToast(); toast('הסבב נוצר')` from anywhere under the shell. */
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
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+var(--safe-b))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            /*
             * The success skin was emerald-600 under a white label — 3.3:1,
             * i.e. a confirmation you cannot read. success-500 and error-500
             * are the surface steps of their families and carry on-state at
             * 5.35 and 6.28. The info skin stays a raised panel.
             */
            className={`toast-in pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-card px-4 py-3 text-sm font-bold shadow-[0_4px_14px_rgba(40,20,80,0.06),0_18px_44px_-12px_rgba(46,16,101,0.18)] ${
              t.tone === 'error'
                ? 'bg-error-500 text-on-state'
                : t.tone === 'info'
                  ? 'border border-ink-700 bg-ink-800 text-mist-100 border-s-[3px] border-s-brand-300'
                  : 'bg-success-500 text-on-state'
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
  /*
   * useLayoutEffect, not useEffect — this runs BEFORE paint.
   *
   * As an effect it ran after, so every sheet came up in the storefront's
   * charcoal for its first two frames and then recoloured, while the
   * `sheet-in` slide-up was already running: a grey panel sliding into place
   * and changing colour mid-flight. Measured with a per-frame sampler on
   * /social/groups — f0 +0.1ms and f1 +10.9ms at rgb(43,47,51), f2 +14.5ms at
   * rgb(20,45,74). State is per-Sheet-instance, so each sheet in the product
   * did it once per page load; on a throttled phone it is longer than 14ms.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const host = anchor.current?.closest<HTMLElement>('[class*="-theme"]');
    setThemeClass(host ? host.className : '');
  }, [open]);

  /*
   * The panel, and where the keyboard is allowed to go while it is open.
   *
   * `aria-modal="true"` was set, which is enough for iOS VoiceOver and does
   * nothing at all about Tab. Measured on eight sheets: focus after opening
   * stayed on the trigger OUTSIDE the dialog 8/8, and 27-194 tabbable
   * elements stayed reachable behind the overlay. Three Tab presses from the
   * open "עריכת סבב" sheet reached delete-this-campaign — focusable, and
   * activatable, with the sheet still covering it. Escape closed the sheet
   * but left focus wherever the walk had stopped.
   */
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  /*
   * onClose goes through a ref, and that is the whole reason this sheet is
   * usable at all.
   *
   * The effect below MOVES FOCUS. It must therefore run once per opening and
   * never again — but `onClose` was in its dependency array, and every call
   * site in this product passes an inline arrow (`onClose={() => setAddOpen(false)}`,
   * seventeen of them), so the prop is a new function on every parent render.
   * A sheet with a controlled input re-renders its parent on every keystroke,
   * which re-ran this effect, which called panel.focus() and took the caret
   * out of the field. Measured on /social/groups → "הוספת קבוצות": typing
   * `https://www.facebook.com/groups/12345` left the input holding "h", with
   * document.activeElement on the dialog DIV. Adding a Facebook group — the
   * only way groups enter this product — was impossible.
   *
   * The ref keeps the latest handler for Escape without making the identity of
   * that handler a reason to re-run the focus move.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // `mounted` is a dependency, not decoration. The portal only renders once
    // the component has mounted, so on a Sheet that is created already-open —
    // which is every useConfirm() dialog — the first pass of this effect ran
    // while `panel.current` was still null and the focus move was silently
    // lost. Measured: the confirm sheet opened with focus still on the button
    // that triggered it.
    if (!open || !mounted) return;
    restoreTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const tabbable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Focus the panel itself rather than its first control: on a bottom sheet
    // that would scroll a long body to whatever happens to be first, and the
    // title is what the person needs to read.
    panel.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = tabbable();
      if (!items.length) {
        e.preventDefault();
        panel.current?.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !panel.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // Freeze the page behind the sheet so a scroll gesture moves the sheet.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      // Back to the control that opened it — closing a dialog should never
      // leave the keyboard stranded at the top of the document.
      restoreTo.current?.focus?.({ preventScroll: true });
    };
    // onClose is deliberately NOT a dependency — see onCloseRef above. Adding
    // it back re-runs the focus move on every parent render and empties every
    // input in the product.
  }, [open, mounted]);

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
        className="fixed inset-0 z-[70] cursor-default bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // -1 so the panel can hold focus on open without joining the tab order.
        tabIndex={-1}
        /*
         * ink-800, one step above the card behind it — a sheet has to read as
         * a layer on top, and on a dark ground a black drop shadow does none
         * of that work. The lift is the lighter surface plus the hairline;
         * the shadow only deepens the separation. No glow.
         */
        className={`sheet-in fixed inset-x-0 bottom-0 z-[71] mx-auto flex max-h-[85svh] flex-col rounded-t-sheet border border-ink-700 bg-ink-800 shadow-[0_4px_14px_rgba(40,20,80,0.06),0_18px_44px_-12px_rgba(46,16,101,0.18)] md:bottom-[8vh] md:max-h-[80svh] md:rounded-card ${
          size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-lg'
        }`}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-600 md:hidden" />
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3.5">
          <h2 id={titleId} className="text-base font-extrabold leading-tight text-mist-100">
            {title}
          </h2>
          <IconButton label="סגור" onClick={onClose} className="-me-2">
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </header>
        {/* The safe-area inset belongs to whichever element is last, so the
            action button never sits under the home indicator. */}
        <div className={`min-h-0 grow overflow-y-auto px-4 ${footer ? 'pb-4' : 'pb-[calc(1rem+var(--safe-b))]'}`}>{children}</div>
        {footer && (
          <footer className="shrink-0 border-t border-ink-700 bg-ink-800 px-4 pt-3 pb-[calc(0.75rem+var(--safe-b))]">{footer}</footer>
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
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-extrabold leading-none text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 ${className}`}
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
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-start text-base font-bold transition-colors disabled:pointer-events-none disabled:text-ink-600 ${
                  a.danger ? 'text-error-400 hover:bg-error-300/12' : 'text-mist-100 hover:bg-ink-900'
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
 *   surface   one card style — hairline border, soft drop shadow, r-card
 *   section   a heading and an optional "show all", never a card in a card
 *   stat      a figure with an icon chip; colour marks the status, not the card
 *   row       a compact list line: image, name, meta, status, menu
 *
 * Colour is reserved for state. A card is one flat surface; a number can be
 * green, red or amber; nothing else is tinted. That is what separates a
 * product from an admin template, and it is cheap to hold once it lives in
 * one file.
 *
 * Three levels of elevation and no more. L0 is the page (ink-950, flat), L1
 * is a card (ink-850 + hairline + a tight contact shadow and a wide ambient
 * one), L2 is anything that floats over a card — sheet, toast, selection bar,
 * overflow panel (ink-800, deeper shadow). The old shadows here were cast in
 * rgba(13,38,76,…): a navy shadow designed for a white page, invisible on
 * #071426.
 */
export const CARD =
  'rounded-card border border-ink-700 bg-ink-850 shadow-[0_2px_6px_rgba(40,20,80,0.03),0_8px_24px_rgba(40,20,80,0.06)]';

/** L2 — sheets, toasts, the floating selection bars, the notification panel. */
export const CARD_ELEVATED =
  'rounded-card border border-ink-700 bg-ink-800 shadow-[0_4px_14px_rgba(40,20,80,0.06),0_18px_44px_-12px_rgba(46,16,101,0.18)]';

/** A stat tile or a media tile: the same skin as a card, one radius tighter. */
export const TILE =
  'rounded-tile border border-ink-700 bg-ink-850 shadow-[0_2px_6px_rgba(40,20,80,0.03),0_8px_24px_rgba(40,20,80,0.06)]';

/** Icon chip colours. The chip is tinted; the card never is. */
const CHIP: Record<Tone, string> = {
  brand: `${TONE_TINT.brand} ${TONE_TEXT.brand}`,
  good: `${TONE_TINT.good} ${TONE_TEXT.good}`,
  bad: `${TONE_TINT.bad} ${TONE_TEXT.bad}`,
  warn: `${TONE_TINT.warn} ${TONE_TEXT.warn}`,
  neutral: 'bg-ink-800 text-mist-500',
};

/** The figure's colour. Neutral by default: not every number is a status. */
const FIGURE: Record<Tone, string> = {
  brand: TONE_TEXT.brand,
  good: TONE_TEXT.good,
  bad: TONE_TEXT.bad,
  warn: TONE_TEXT.warn,
  // The one place neutral is mist-100 rather than mist-300: this is the
  // largest number on the screen and it is the thing being read.
  neutral: 'text-mist-100',
};

/**
 * A section heading with an optional link to the full list. Sections are
 * separated by a heading and space, not by nesting another card.
 */
export function SectionHeader({ title, href, linkLabel = 'הצג הכל' }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-extrabold leading-tight tracking-tight text-mist-100">{title}</h2>
      {href && (
        // brand-400, not brand-500: this is a link, and brand-500 is the
        // button surface — as ink on a card it measures 3.09 and fails.
        // min-h-11, not the 40px it was: this is the "show all" on every
        // section in the product, and 44px is the floor. The row is
        // items-baseline, so the link has to carry its own height.
        <Link href={href} className="inline-flex min-h-11 items-center gap-0.5 text-sm font-bold text-brand-400">
          {linkLabel}
          <ChevronIcon className="h-4 w-4 rtl:rotate-180" />
        </Link>
      )}
    </div>
  );
}

/**
 * One statistic, and nothing else.
 *
 * It used to carry a 36px tinted icon chip AND a chevron — both chrome around
 * the one thing being read — which took the tile to 147px and pushed the four
 * of them to 347px, 44% of a 375x812 phone's first screen, to deliver four
 * integers. Stripped to label / figure / sub-line the tile measures 93px and
 * the figure is larger IN EFFECT at 30px than it was at 34 inside all that
 * decoration. The whole tile is still the link, so the tap target is the 93px
 * block rather than a chevron.
 *
 * `chipLabel` replaces the sub-line (it does not stack under it) with a call
 * to action in the tile's own tone. It is a <span>, never a nested <a>: an
 * anchor inside an anchor is invalid HTML and collapses to a 24px target —
 * the same bug ButtonLink's doc comment above records.
 */
export function StatCard({
  label,
  value,
  sub,
  chipLabel,
  icon,
  tone = 'neutral',
  href,
  dense = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /** A call to action in place of the sub-line, inside the tile's own link. */
  chipLabel?: string;
  /**
   * A mark for the status, under the label. It is decoration — the figure and
   * the label already say everything — so it is aria-hidden by its caller and
   * never the only carrier of meaning.
   */
  icon?: React.ReactNode;
  tone?: Tone;
  href?: string;
  /**
   * Four tiles across a phone instead of two.
   *
   * At 375px four tiles are ~78px wide, so the figure comes down from 30px and
   * everything centres: a left-aligned 11px label in a 78px box wraps into a
   * ragged two lines that read as broken rather than dense. The two-across
   * layout keeps the bigger figure and the start alignment, because it has the
   * room for them.
   */
  dense?: boolean;
}) {
  const body = (
    <>
      {/* The figure leads in the dense layout. Four narrow tiles are scanned
          as a row of numbers — the label is what you read second, to find out
          which number you just looked at. */}
      {dense && (
        <p className={`text-[26px] font-extrabold leading-[30px] tabular-nums transition-colors duration-150 ${FIGURE[tone]}`}>{value}</p>
      )}
      <p dir="auto" className={`text-xs font-bold leading-[15px] text-mist-500 ${dense ? 'mt-0.5 line-clamp-2' : 'truncate'}`}>
        {label}
      </p>
      {/* 30px on a phone, 34 from sm. Deliberately below the system card's
          headline: this row answers "how many", the card above answers
          "is it working", and the sizes have to say which outranks which. */}
      {!dense && (
        <p className={`mt-0.5 text-[30px] font-extrabold leading-[34px] tabular-nums transition-colors duration-150 sm:text-[34px] ${FIGURE[tone]}`}>{value}</p>
      )}
      {icon && <span className={`mt-1.5 inline-flex ${TONE_TEXT[tone]}`}>{icon}</span>}
      {chipLabel ? (
        <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold leading-[15px] ${TONE_TINT[tone]} ${TONE_TEXT[tone]}`}>
          {chipLabel}
          <ChevronIcon aria-hidden className="h-3 w-3 rtl:rotate-180" />
        </span>
      ) : (
        sub && (
          <p dir="auto" className={`mt-0.5 text-[11px] leading-[14px] text-mist-500 ${dense ? 'line-clamp-2' : 'truncate'}`}>
            {sub}
          </p>
        )
      )}
    </>
  );
  const cls = `${TILE} block min-w-0 p-3 ${dense ? 'flex flex-col items-center text-center' : 'text-start'}`;
  return href ? (
    <Link
      href={href}
      className={`${cls} transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 active:scale-[0.985]`}
    >
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
  dangerLabel,
  onDanger,
  busy = false,
}: {
  tone?: 'bad' | 'warn' | 'info';
  title: string;
  body?: string;
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
  /** A destructive second choice, shown beside the main one. */
  dangerLabel?: string;
  onDanger?: () => void;
  busy?: boolean;
}) {
  const t: Tone = { bad: 'bad', warn: 'warn', info: 'brand' }[tone] as Tone;
  const skin = `${TONE_BORDER[t]} ${TONE_TINT[t]}`;
  /*
   * The round "!" takes a label chosen per hue, not a blanket white: white on
   * amber measures 1.83 and the mark reads as an empty circle. Amber gets the
   * page navy on it (10.10); red and blue get their surface steps under white
   * (6.28 and 4.95).
   */
  const mark = {
    bad: 'bg-error-500 text-on-state',
    warn: 'bg-warning-400 text-ink-950',
    info: 'bg-brand-500 text-on-brand',
  }[tone];
  const link = `${TONE_TEXT[t]} ${TONE_BORDER[t]}`;

  return (
    // Wraps rather than truncates: on a 320px screen an alert with two actions
    // had no room left for its own title, and an alert whose text is cut off is
    // not an alert. The actions drop to their own line instead.
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-tile border px-3.5 py-3 ${skin}`}>
      <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${mark}`}>
        !
      </span>
      <div className="min-w-0 grow basis-40">
        <p dir="auto" className="text-sm font-extrabold leading-snug text-mist-100">
          {title}
        </p>
        {body && (
          <p dir="auto" className="text-xs leading-relaxed text-mist-500">
            {body}
          </p>
        )}
      </div>
      <span className="ms-auto flex shrink-0 items-center gap-1">
      {dangerLabel && onDanger && (
        <button
          type="button"
          onClick={onDanger}
          disabled={busy}
          className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 text-sm font-bold text-error-400 disabled:pointer-events-none disabled:text-ink-600"
        >
          {dangerLabel}
        </button>
      )}
      {actionLabel &&
        (href ? (
          <Link href={href} className={`inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-xl border bg-ink-850 px-2.5 text-sm font-bold ${link}`}>
            {actionLabel}
            <ChevronIcon className="h-4 w-4 rtl:rotate-180" />
          </Link>
        ) : (
          <button type="button" onClick={onAction} className={`inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-xl border bg-ink-850 px-2.5 text-sm font-bold ${link}`}>
            {actionLabel}
            <ChevronIcon className="h-4 w-4 rtl:rotate-180" />
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * The colour of a status dot in a list row.
 *
 * A dot is a mark, not a word, so these are the INDICATOR steps — the same
 * colours TONE_FILL paints a bar segment in, where 3:1 is the threshold. They
 * are deliberately not TONE_TEXT: matching the label's colour would make the
 * dot the quieter of the two, and the dot is what is scanned.
 */
export const DOT_TONE: Record<Tone, string> = {
  brand: 'text-brand-300',
  good: 'text-success-400',
  bad: 'text-error-300',
  warn: 'text-warning-400',
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
        <span dir="auto" className="block truncate text-sm font-bold leading-snug text-mist-100">
          {title}
        </span>
        {subtitle && (
          <span dir="auto" className="mt-0.5 block truncate text-xs leading-snug text-mist-500">
            {subtitle}
          </span>
        )}
      </span>
      {meta && <span className="shrink-0 tabular-nums text-sm font-bold text-mist-300">{meta}</span>}
      <DotIcon aria-hidden className={`h-2.5 w-2.5 shrink-0 ${DOT_TONE[tone]}`} />
    </>
  );

  return (
    <li className="flex min-w-0 items-center gap-3 py-3">
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
