'use client';

import { PACE_UNAVAILABLE, paceCards, paceGapWords, paceProfile, paceRatePerHour } from '@/lib/social/rules';
import { t } from '@/lib/social/i18n';
import type { PaceId } from '@/lib/social/types';
import { BoltIcon, CheckIcon, GaugeIcon, LeafIcon, ScaleIcon } from '@/components/icons';
import type { PaceCardId } from '@/lib/social/rules';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "מהירות פרסום" — the speed picker, now in הגדרות and nowhere else.
 *
 * ─── WHY IT MOVED, AND WHAT THAT COST ─────────────────────────────────────
 *
 *   "יש להעביר את בחירת מהירות הפרסום מלוח הבקרה אל מסך ההגדרות... ארבע
 *    כרטיסיות עגולות לחלוטין (בטוח / רגיל / מהיר / איטי), אייקון ושם
 *    ממורכזים, ללא תיאורים ארוכים." — 18.11.2026, with a binding reference.
 *
 * The mode is an ACCOUNT setting — one engine, one pace — and it was chosen on
 * a CAMPAIGN card, in three different controls on two screens. That is the
 * "הגדרה כפולה" this product has removed twice before, and it had a second
 * cost that only showed up in the data: the handler behind each of those
 * controls wrote the account floor AND re-stamped the queue of the one round
 * whose card was pressed, so the same tap meant something different depending
 * on which card it landed on.
 *
 * WHAT THE MOVE LOSES, said plainly because the owner will meet it: picking a
 * mode here writes the account's gap pair and every round's own gap column
 * (applyPace does both), and re-stamps NOTHING. Rows already in the queue keep
 * the instant written on them — "שינוי המהירות... משפיע על תזמון עתידי בלי
 * לשכפל משימות או לשבש פרסומים שכבר נמצאים בביצוע" is exactly that behaviour,
 * and the card says so in one line rather than promising a queue it did not
 * touch. Contracting a queue that is already stamped is still one tool away:
 * "הגדרות תור מתקדמות" on the round, which is the only thing in this product
 * that re-times written rows and has always been.
 *
 * ─── FOUR CARDS, AND ONE OF THEM CANNOT BE PRESSED ────────────────────────
 *
 *   "אין להמציא ערכים למצב ״בטוח״. אם לא קיימת הגדרה, יש להשאיר אותו לא זמין
 *    עד להגדרה מפורשת."
 *
 * The three real modes come from PACE_PROFILES and the fourth from
 * PACE_UNAVAILABLE, which carries a word and no numbers — see rules.ts for why
 * there is no gap left to give it. A card with no profile is rendered
 * `disabled` and sends nothing, so it cannot store a mode the engine would
 * then fail to honour.
 *
 * ─── THE GLYPHS, AND THE ONE THAT IS DELIBERATELY NOT A SHIELD ────────────
 *
 * מהיר is a bolt, רגיל a gauge, איטי a leaf — the three this product has drawn
 * since 09.11.2026. בטוח gets a balance and NOT a shield, for the reason this
 * file has carried since the modes were built: "אין להציג את המצבים כהבטחה
 * למניעת חסימות בפייסבוק". A shield is a promise about Facebook. A mode is a
 * brake on our own gap, and nothing here may suggest otherwise — least of all
 * the card named "safe".
 *
 * ─── THE NUMBERS ARE STILL SPOKEN AND STILL NOT DRAWN ────────────────────
 *
 * "ללא תיאורים ארוכים" — so no card prints its gap or its rate. Both are still
 * read off PACE_PROFILES and still said in each button's aria-label, which is
 * how a screen-reader user hears which mode is which instead of four
 * adjectives. The table stays the one source, so a card and a gate cannot
 * disagree about a mode.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The reference's glyph per card. */
const PACE_ICON: Record<PaceCardId, (p: { className?: string }) => React.ReactElement> = {
  fast: (p) => <BoltIcon aria-hidden {...p} />,
  medium: (p) => <GaugeIcon aria-hidden {...p} />,
  slow: (p) => <LeafIcon aria-hidden {...p} />,
  safe: (p) => <ScaleIcon aria-hidden {...p} />,
};

export function SmartPaceCard({
  pace,
  onChange,
  disabled,
  currentGapSeconds,
  className = '',
}: {
  /** The stored mode, or null/undefined when the account has never picked one. */
  pace?: PaceId | null;
  /** The caller owns the write and the reload — this component stores nothing. */
  onChange: (id: PaceId) => void;
  disabled?: boolean;
  /**
   * What the engine enforces between two publications right now, in seconds.
   * Reaches the accessible line below, where it answers "what is in force" for
   * a reader who cannot see which card is lit. Never drawn.
   */
  currentGapSeconds?: number;
  className?: string;
}) {
  const selected = paceProfile(pace);
  const cards = paceCards();

  return (
    <section data-smart-pace aria-label={t('מהירות פרסום')} className={className}>
      {/*
        ─── FOUR ROUND CARDS ───────────────────────────────────────────────

        grid-cols-2 then grid-cols-4 from the first breakpoint: "שתי שורות של
        שתיים במסכים צרים". In an RTL grid that fills from the right, so a
        phone draws בטוח · רגיל on the first row and מהיר · איטי on the
        second — the reference's own arrangement, from the order in rules.ts.

        `[&>*]:min-w-0` is this product's standing rule for every multi-column
        grid: without it a long word pushes the column wider than its share
        and the row overflows instead of narrowing.
      */}
      <div
        role="radiogroup"
        aria-label={t('מהירות פרסום')}
        className="grid grid-cols-2 gap-3 [&>*]:min-w-0 sm:grid-cols-4"
      >
        {cards.map((card) => {
          const on = selected?.id === card.id;
          const Icon = PACE_ICON[card.id];
          const unavailable = card.profile === null;
          return (
            <button
              key={card.id}
              type="button"
              role="radio"
              aria-checked={on}
              /*
               * THE FOURTH CARD IS DEAD ON PURPOSE, and it says why out loud
               * rather than looking broken: a control that cannot be pressed
               * and does not explain itself is read as a bug.
               */
              disabled={disabled || unavailable}
              aria-disabled={unavailable || undefined}
              title={unavailable ? t('עדיין לא נקבע מרווח למצב הזה') : undefined}
              onClick={() => card.profile && onChange(card.profile.id)}
              /*
                THE MODE'S WORD THROUGH t() HERE, AND RAW IN THE SPAN BELOW.
                A bare Hebrew text node is rewritten by the DOM translator on
                its own; an accessible NAME is a sentence from the dictionary,
                so a raw label inside it would leave Hebrew and Russian on one
                line — the half-translated sentence russian-rendered.test.ts
                exists to catch.
              */
              aria-label={
                card.profile
                  ? `${t(card.label)} — פרסום כל ${paceGapWords(card.profile.gapSeconds)}, כ-${Math.round(paceRatePerHour(card.profile))} פרסומים בשעה`
                  : `${t(card.label)} — לא זמין, עדיין לא נקבע מרווח למצב הזה`
              }
              /*
               * THE CARD.
               *
               * "כרטיסיות עגולות לחלוטין" — rounded-full over a square box, so
               * each card is a circle whatever the column width. `max-w` keeps
               * a 2-up phone row from drawing two 170px discs, and `mx-auto`
               * centres each circle in its column so the grid's gaps stay even.
               *
               * Selected: solid brand blue, white glyph and word, a stronger
               * ring a shade darker than the fill — "כחול מלא עם טקסט לבן
               * ומסגרת מודגשת עדינה". Unselected: white falling to the pale
               * blue-grey, a thin blue hairline, deep navy word.
               *
               * The selection animation is a 200ms transition plus a 2%
               * scale, and it is BOTH under `motion-safe:` — a person who has
               * asked their phone to stop animating gets the same colours with
               * no movement, which is the rule the rest of this product
               * follows.
               *
               * Both states occupy the same box, so nothing shifts when the
               * lit card changes.
               */
              className={`relative mx-auto grid aspect-square w-full max-w-[132px] place-items-center gap-1 overflow-hidden rounded-full border px-2 text-center motion-safe:transition-all motion-safe:duration-200 ${
                unavailable
                  ? 'cursor-not-allowed border-dashed border-brand-500/30 bg-ink-850 text-mist-500 opacity-70'
                  : on
                    ? 'border-brand-700 bg-brand-500 text-on-brand shadow-[0_8px_18px_-8px_rgba(2,124,187,0.7)] motion-safe:scale-[1.02]'
                    : 'border-brand-500/35 bg-gradient-to-br from-ink-850 to-ink-800 text-mist-100 hover:border-brand-500/60'
              } disabled:cursor-not-allowed`}
            >
              {/*
                ONE SELECTION MARK, AND ONLY ON A CARD THAT CAN BE CHOSEN. It
                holds its box in both states so the circle cannot change size
                between them, and it is a SECOND channel beside the fill —
                which is the only thing a colour-blind reader has to go on.
              */}
              {!unavailable && (
                <span
                  aria-hidden
                  className={`absolute end-[14%] top-[14%] grid h-[18px] w-[18px] place-items-center rounded-full border ${
                    on ? 'border-white/70 bg-white text-brand-600' : 'border-brand-500/35 bg-ink-850'
                  }`}
                >
                  <CheckIcon className={`h-3 w-3 ${on ? 'opacity-100' : 'opacity-0'}`} />
                </span>
              )}

              <span className="flex flex-col items-center justify-center gap-1">
                <Icon className={`h-6 w-6 shrink-0 ${on ? 'text-on-brand' : unavailable ? 'text-mist-500' : 'text-brand-500'}`} />
                {/* dir="auto" sits on the SAME line as `truncate` deliberately:
                    layout.test.ts reads this rule line by line, and a mode name
                    clipped at the wrong end is the bug it was written for. */}
                <span dir="auto" className="min-w-0 max-w-full truncate text-[13px] font-extrabold leading-4">
                  {card.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/*
        ONE SHORT LINE, AND ONLY ABOUT THE CARD THAT CANNOT BE PRESSED.
        "ללא תיאורים ארוכים" rules out a description under each card; it does
        not rule out saying why one of the four is grey, and a dead control
        with no explanation is the thing an owner reports as broken.
      */}
      <p className="mt-2 text-center text-[11px] leading-4 text-mist-500">
        {t('״בטוח״ יהיה זמין כשייקבע לו מרווח — אין לו מספר משלו, ולא נמציא אחד.')}
      </p>

      {/*
        READ ALOUD, NEVER DRAWN. The gap each mode asks for is in the buttons'
        own labels above; this is the state of the account as a whole.
      */}
      <p className="sr-only" data-pace-state>
        {selected
          ? `המצב שנבחר: ${t(selected.label)} — פרסום כל ${paceGapWords(selected.gapSeconds)}. המצב חל על כל החשבון ועל כל הסבבים.`
          : typeof currentGapSeconds === 'number' && Number.isFinite(currentGapSeconds)
            ? `עדיין לא נבחר מצב. הפרסום יוצא כרגע כל ${paceGapWords(currentGapSeconds)}.`
            : 'עדיין לא נבחר מצב. הפרסום יוצא לפי המרווח הקיים.'}
        {` מצב "${t(PACE_UNAVAILABLE.label)}" אינו זמין: לא נקבע לו מרווח.`}
      </p>
    </section>
  );
}
