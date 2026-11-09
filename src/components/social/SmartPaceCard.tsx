'use client';

import { PACE_PROFILES, paceGapWords, paceProfile, paceRatePerHour, type PaceProfile } from '@/lib/social/rules';
import type { PaceId } from '@/lib/social/types';
import { BoltIcon, CheckIcon, GaugeIcon, LeafIcon, RocketIcon } from '@/components/icons';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "מצב פרסום חכם" — the three publishing modes, drawn to the reference image.
 *
 * ─── REBUILT TO A NEW REFERENCE, 09.11.2026 ───────────────────────────────
 *
 *   "התמונה המצורפת היא הרפרנס הסופי… אין לבצע עיצוב מחדש לפי שיקול דעתך.
 *    אין להוסיף אלמנטים שלא מופיעים ברפרנס."
 *
 * The three cards were two-line tiles carrying their own gap and rate, under
 * a dynamic summary sentence. The reference replaces all of it with three
 * compact tiles — icon above the word, nothing else — inside a shorter white
 * shell. What changed is every pixel; what did NOT change is a single line of
 * behaviour, and that boundary is the whole of this brief:
 *
 *   "מדובר בשינוי עיצובי בלבד, ללא שינוי לוגיקה."
 *
 * So the props, the handler, the radio semantics and PACE_PROFILES are
 * untouched — the gaps, the writer (applyGapFloor through the caller), the
 * storage and the queue cannot tell this file was rewritten.
 *
 * ─── WHERE THE NUMBERS WENT ───────────────────────────────────────────────
 *
 *   "אין להציג טקסטי הסבר או זמני פרסום מתחת לכרטיסיות."
 *
 * Each card used to print "כל 40 שניות" and "כ-90 בשעה", with a summary line
 * under the row. All of it is gone from the SCREEN and none of it is gone
 * from the COMPONENT: the gap and the rate are still read off PACE_PROFILES
 * and still spoken, in each button's aria-label. A sighted reader gets the
 * reference's clean row; a screen-reader user still hears which mode is which
 * rather than three bare adjectives. The table remains the one source, so a
 * card and a gate still cannot disagree about a mode.
 *
 * ─── THE THREE ARE ORDERED FAST → SLOW IN THE DOM ────────────────────────
 *
 * Which, in an RTL row, draws them מהיר · בינוני · איטי from the right — what
 * the reference draws. PACE_PROFILES is already in that order and this maps it
 * straight through.
 *
 * ─── NO MODE IS SELECTED UNTIL ONE IS STORED, AND THAT IS DELIBERATE ──────
 *
 * Lighting up whichever mode is nearest the stored gap would make the screen
 * look like the reference on first load and would be a screen that is not
 * true. Nothing is lit until the account has picked one.
 *
 * ─── IT PROMISES NOTHING ABOUT FACEBOOK ───────────────────────────────────
 *
 * "אין להציג את המצבים כהבטחה למניעת חסימות בפייסבוק." No mode carries a
 * claim about Meta, which is also why the slow card's icon is a leaf and not
 * the shield it used to be: a shield is a promise, a leaf is a pace.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The reference's icon per mode — fast is a bolt, medium a gauge, slow a leaf. */
const PACE_ICON: Record<PaceId, (p: { className?: string }) => React.ReactElement> = {
  fast: (p) => <BoltIcon aria-hidden {...p} />,
  medium: (p) => <GaugeIcon aria-hidden {...p} />,
  slow: (p) => <LeafIcon aria-hidden {...p} />,
};

/*
 * THE PALETTE IS THE PRODUCT'S, NOT A NEW ONE.
 *
 * "שימוש בצבעי הכחול, הלבן והתכלת הקיימים באפליקציה בלבד." Every colour below
 * is a token this app already resolves per theme: brand-500 (#027cbb) is the
 * action blue, brand-600 the step under it, ink-850 white, ink-800 the pale
 * blue-grey, mist-100 the deep navy text. A hex here would be a fourth
 * palette nobody can re-theme, and the dark storefront theme would break.
 *
 * The mode's own tone no longer tints anything: the reference draws all three
 * cards in one blue family and distinguishes them by FILL, not by hue. Keeping
 * three hues would be designing instead of reproducing. `tone` is still on the
 * profile and still read by the rest of the product.
 */

export function SmartPaceCard({
  pace,
  onChange,
  disabled,
  currentGapSeconds,
  compact = false,
  className = '',
}: {
  /** The stored mode, or null/undefined when the account has never picked one. */
  pace?: PaceId | null;
  /** The caller owns the write and the reload — this component stores nothing. */
  onChange: (id: PaceId) => void;
  disabled?: boolean;
  /**
   * What the engine enforces between two publications right now, in seconds.
   *
   * KEPT ON THE PROP LIST THOUGH THE REFERENCE DRAWS NO LINE FOR IT. The two
   * callers pass it, removing it would be an edit to files this brief puts
   * out of bounds ("אין לבצע Refactoring לקבצים שאינם קשורים"), and the next
   * reference may want it back. It reaches the accessible description below,
   * where it is not a displayed "זמן פרסום" and still answers "what is in
   * force" for a reader who cannot see which card is lit.
   */
  currentGapSeconds?: number;
  className?: string;
  /**
   * ─── THE ROW WITHOUT ITS SHELL ──────────────────────────────────────────
   *
   *   "להציג את המצבים בשורה אחת, בדיוק לפי הרפרנס." 09.11.2026
   *
   * The campaign-card reference draws the three modes as a bare row inside
   * the card — no white shell, no rocket, no "מצב פרסום חכם" heading. Those
   * came from THIS component's own earlier reference and are kept for every
   * other caller; `compact` is the one place the newer image overrules the
   * older one, and it costs 40px of a card the owner called too tall.
   *
   * The heading does not disappear from the accessible tree with it: the
   * <section> keeps aria-label="מצב פרסום חכם" either way.
   */
  compact?: boolean;
}) {
  const selected = paceProfile(pace);

  return (
    <section
      data-smart-pace
      aria-label="מצב פרסום חכם"
      /*
       * THE SHELL: white, a thin blue hairline, generously rounded, one soft
       * shadow. "מעטפת לבנה עם מסגרת כחולה דקה… פינות מעוגלות והצללה עדינה."
       *
       * ink-850 and not ink-900: the reference's shell is WHITE against the
       * page, and ink-900 is the page. p-3 with no vertical padding beyond it
       * is what "לצמצם את הגובה הכולל" and "להסיר שטחים ריקים מיותרים" come
       * to — the shell is now the header row plus the tiles plus two gaps.
       */
      className={compact ? className : `rounded-3xl border border-brand-500/25 bg-ink-850 p-2.5 shadow-[0_4px_16px_-10px_rgba(2,124,187,0.45)] ${className}`}
    >
      {/* ─── 1. the heading: rocket badge, then the title ─────────────────── */}
      {/*
        The badge is a SOLID blue disc with a white rocket, at the start of the
        row — which in RTL is the right edge, where the reference puts it. The
        subtitle the old card carried is not in the reference and is not drawn:
        "אין להוסיף אלמנטים שלא מופיעים ברפרנס."
      */}
      {!compact && (
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-on-brand">
            <RocketIcon className="h-4 w-4" />
          </span>
          <span dir="auto" className="min-w-0 truncate text-[15px] font-extrabold leading-5 text-mist-100">מצב פרסום חכם</span>
        </div>
      )}

      {/* ─── 2. the three modes, one row, three equal columns ─────────────── */}
      {/*
        grid-cols-3 and not a flex row: "שלוש הכרטיסיות חייבות להופיע בשורה
        אחת… אין גלילה אופקית." `[&>*]:min-w-0` is the product's standing rule
        for every multi-column grid and is what lets the three narrow together
        on a 320px phone instead of overflowing the shell.
      */}
      <div role="radiogroup" aria-label="קצב הפרסום" className={`grid grid-cols-3 gap-2 [&>*]:min-w-0 ${compact ? '' : 'mt-2'}`}>
        {PACE_PROFILES.map((p) => {
          const on = selected?.id === p.id;
          const Icon = PACE_ICON[p.id];
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(p.id)}
              /*
               * THE GAP AND THE RATE LIVE HERE NOW — read off the table, never
               * typed. The reference forbids drawing them; nothing forbids
               * saying them to someone who cannot see which tile is lit.
               */
              aria-label={`${p.label} — פרסום כל ${paceGapWords(p.gapSeconds)}, כ-${Math.round(paceRatePerHour(p))} פרסומים בשעה`}
              /*
               * THE TILE.
               *
               * Selected: a blue gradient with white glyph and word, a stronger
               * blue hairline and a deeper shadow — "כרטיסייה כחולה עם רקע
               * Gradient כחול, אייקון ברק לבן וסימון בחירה".
               *
               * Unselected: white falling to the pale blue-grey, blue glyph,
               * navy word — "כרטיסייה בהירה בגווני לבן ותכלת".
               *
               * `min-h-[64px]` is the compact height, measured off the
               * reference rather than chosen: the image is 1040px wide over a
               * 358px card, so its scale is almost exactly 2 and its tiles are
               * ~130 image px — 65 CSS px. It is also comfortably past this
               * product's 44px hit-target floor, so "מרווחי לחיצה נוחים" and
               * "גובה קומפקטי" are met by the same number rather than traded
               * against each other.
               *
               * The three are the same height in both states on purpose: a
               * selected tile that grew would shift the other two every tap.
               */
              className={`relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border px-1.5 py-1.5 transition-colors disabled:opacity-60 ${
                on
                  ? 'border-brand-600 bg-gradient-to-br from-brand-500 to-brand-600 text-on-brand shadow-[0_6px_14px_-6px_rgba(2,124,187,0.65)]'
                  : 'border-brand-500/20 bg-gradient-to-br from-ink-850 to-ink-800 text-mist-100 shadow-[0_2px_8px_-6px_rgba(13,38,76,0.35)] hover:border-brand-500/45'
              }`}
            >
              {/*
                THE SHEEN the reference draws across the lower half of every
                tile. One gradient, no invented shape — and pointer-events-none
                so it can never swallow the tap.
              */}
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-x-0 bottom-0 h-1/2 ${
                  on ? 'bg-gradient-to-t from-white/20 to-transparent' : 'bg-gradient-to-t from-brand-500/10 to-transparent'
                }`}
              />

              {/*
                ONE SELECTION MARK, AND ONLY ONE — "סימון בחירה ברור, ללא
                כפילות של סימוני V". The reference draws two on the lit tile (a
                ring at one corner and a badge at the other); the brief forbids
                the duplication in so many words, so the ring stays and the
                badge does not. It holds the same box in both states, so the
                tiles cannot change height between them, and it is a SECOND
                channel beside the fill — the rule the day chips follow, and
                the only thing a colour-blind reader has to go on.
              */}
              <span
                aria-hidden
                className={`absolute end-1.5 top-1.5 grid h-[17px] w-[17px] place-items-center rounded-full border ${
                  on ? 'border-white/70 bg-white text-brand-600' : 'border-brand-500/35 bg-ink-850'
                }`}
              >
                <CheckIcon className={`h-3 w-3 ${on ? 'opacity-100' : 'opacity-0'}`} />
              </span>

              {/* the glyph, above the word, exactly as the reference stacks them */}
              <Icon className={`relative h-5 w-5 shrink-0 ${on ? 'text-on-brand' : 'text-brand-500'}`} />
              {/* dir="auto" sits on the SAME line as `truncate` deliberately:
                  layout.test.ts reads this rule line by line, and a mode name
                  clipped at the wrong end is the bug it was written for. */}
              <span dir="auto" className={`relative min-w-0 truncate text-[13px] font-extrabold leading-4 ${on ? 'text-on-brand' : 'text-mist-100'}`}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        NOTHING UNDER THE ROW. "אין להציג טקסטי הסבר או זמני פרסום מתחת
        לכרטיסיות." The summary sentence that used to sit here is gone from the
        screen; what it said is in each tile's aria-label and in the line below,
        which is read aloud and never drawn.
      */}
      <p className="sr-only" data-pace-state>
        {selected
          ? `המצב שנבחר: ${selected.label} — פרסום כל ${paceGapWords(selected.gapSeconds)}. המצב חל על כל החשבון ועל כל הסבבים.`
          : typeof currentGapSeconds === 'number' && Number.isFinite(currentGapSeconds)
            ? `עדיין לא נבחר מצב. הפרסום יוצא כרגע כל ${paceGapWords(currentGapSeconds)}.`
            : 'עדיין לא נבחר מצב. הפרסום יוצא לפי המרווח הקיים.'}
      </p>
    </section>
  );
}
