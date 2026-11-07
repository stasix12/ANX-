'use client';

import { useEffect, useState } from 'react';

import { PACE_PROFILES, accountGapLabel, paceGapWords, paceProfile, paceRatePerHour, type PaceProfile } from '@/lib/social/rules';
import type { PaceId } from '@/lib/social/types';
import { BoltIcon, CheckIcon, ClockIcon, CoffeeIcon, GaugeIcon, LayersIcon, RocketIcon, ShieldIcon } from '@/components/icons';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "מצב פרסום חכם" — the three publishing modes, drawn to the reference image.
 *
 * "יש ליצור רכיב חדש בשם: מצב פרסום חכם… יש להציג את שלוש האפשרויות בשורה
 *  אחת, בדיוק לפי הרפרנס. המצב הנבחר יודגש באמצעות מסגרת כחולה, רקע עדין
 *  וסימון בחירה. מתחת לכרטיסיות תופיע שורת סיכום דינמית המציגה את הקצב ואת
 *  משך ההפסקה של המצב שנבחר."
 *
 * ─── WHAT THIS REPLACES, AND WHY THERE IS NOTHING LEFT OF IT ──────────────
 *
 * The field "הפרש בין פרסומים" is gone from every screen in this product:
 * "יש להסיר לחלוטין מהממשק את השדה הישן… אין להשאיר אותו במקום אחר ואין
 *  ליצור הגדרה כפולה." A mode now carries the gap AND the rest, and picking
 * one writes the gap into the very same account settings the old field wrote
 * — through applyGapFloor(), the writer every other screen already used. So
 * the engine, the planner, the projection and every screen that prints a gap
 * are reading exactly what they read before; only the control changed.
 *
 * ─── THE THREE ARE ORDERED FAST → SLOW IN THE DOM ────────────────────────
 *
 * Which, in an RTL row, draws them מהיר · בינוני · איטי from the right —
 * i.e. איטי · בינוני · מהיר left to right, which is what the reference draws.
 * PACE_PROFILES is already in that order and this maps it straight through,
 * so the row cannot disagree with the table the engine reads.
 *
 * ─── NO MODE IS SELECTED UNTIL ONE IS STORED, AND THAT IS DELIBERATE ──────
 *
 * Every live settings row predates this card and carries no `pace` key. The
 * tempting move is to light up whichever mode is nearest the stored gap so
 * the screen looks like the reference on first load — and it would be a
 * screen that is not true: 40 stored seconds would light "מהיר" while the
 * engine rests after nothing. This product's recurring fault is a screen
 * agreeing with a picture instead of with the engine. So nothing is lit, the
 * strip below says what IS in force, and one tap makes the screen and the
 * engine true together.
 *
 * ─── IT PROMISES NOTHING ABOUT FACEBOOK ───────────────────────────────────
 *
 * "אין להציג את המצבים כהבטחה למניעת חסימות בפייסבוק." The reference image's
 * own subtitle ends "להגנה מפייסבוק"; that half is not reproduced, because
 * the specification forbids it in so many words and the two cannot both be
 * honoured. Everything else about the subtitle is the image's.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The reference's icon per mode. The TONE comes from PACE_PROFILES so the
    engine's table is the one place that says which mode is which colour; only
    the glyph is chosen here, because a React component cannot live in a module
    the worker bundles. */
const PACE_ICON: Record<PaceId, (p: { className?: string }) => React.ReactElement> = {
  fast: (p) => <BoltIcon aria-hidden {...p} />,
  medium: (p) => <GaugeIcon aria-hidden {...p} />,
  slow: (p) => <ShieldIcon aria-hidden {...p} />,
};

/*
 * THE PALETTE IS THE PRODUCT'S, NOT A NEW ONE.
 *
 * "צבעי כחול, לבן ותכלת הקיימים באפליקציה" — so orange, blue and green here
 * are warning-400, brand-400 and success-400, the three semantic tokens this
 * app already carries, measured over the white card at 5.43, 6.48 and 5.19.
 * A hex would be a fourth palette nobody can re-theme.
 */
const TONE_TEXT: Record<PaceProfile['tone'], string> = {
  warning: 'text-warning-400',
  brand: 'text-brand-400',
  success: 'text-success-400',
};

/** "0:07:12" — a rest counted down the way the run card counts down a Meta
    hold, so two waits on one screen are read the same way. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function SmartPaceCard({
  pace,
  onChange,
  disabled,
  currentGapSeconds,
  restUntil,
  className = '',
}: {
  /** The stored mode, or null/undefined when the account has never picked one. */
  pace?: PaceId | null;
  /** The caller owns the write and the reload — this component stores nothing. */
  onChange: (id: PaceId) => void;
  disabled?: boolean;
  /** What the engine enforces between two publications right now, in seconds.
      Printed only while no mode is picked, where it is the whole truth. */
  currentGapSeconds?: number;
  /**
   * When the current rest ends, if one is running — an ISO instant computed by
   * the caller out of paceRestRemainingMs(), which is the same function both
   * publishing gates use. Null when nothing is resting.
   */
  restUntil?: string | null;
  className?: string;
}) {
  const selected = paceProfile(pace);

  /*
   * ─── THE COUNTDOWN TICKS HERE, AND NOWHERE ELSE DECIDES ANYTHING ─────────
   *
   * "יש להציג מצב 'בהפסקה'. יש להציג זמן שנותר להפסקה."
   *
   * The INSTANT comes from the server, derived from published rows; this
   * second-by-second render is presentation only. So a refresh, a reconnect or
   * a restart cannot lose it — there is no state here to lose, which is what
   * "יש לשמור את זמן סיום ההפסקה גם לאחר רענון העמוד" actually requires.
   *
   * The interval is torn down when nothing is resting, so an idle card runs no
   * timer at all.
   */
  const [now, setNow] = useState(() => Date.now());
  const restEndsAt = restUntil ? Date.parse(restUntil) : NaN;
  const resting = Number.isFinite(restEndsAt) && restEndsAt > now;
  useEffect(() => {
    if (!restUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [restUntil]);

  return (
    <section
      data-smart-pace
      aria-label="מצב פרסום חכם"
      className={`rounded-2xl border border-ink-600 bg-ink-900 p-2 ${className}`}
    >
      {/* ─── 1. the heading: rocket, title, subtitle ──────────────────────── */}
      <div className="flex items-start gap-2">
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-brand-300/15">
          <RocketIcon className="h-3.5 w-3.5 text-brand-400" />
        </span>
        <span className="min-w-0 grow">
          <span className="block text-[12.5px] font-extrabold leading-4 text-mist-100">מצב פרסום חכם</span>
          <span className="mt-px block text-[10px] font-bold leading-[13px] text-mist-300">
            בחר קצב פרסום כולל הפסקות אוטומטיות
          </span>
        </span>
      </div>

      {/* ─── 2. the three modes, one row, three equal columns ─────────────── */}
      {/*
        grid-cols-3 and not a flex row: the three must stay on one line at
        every width this card is drawn at — a mode that wraps onto a second
        line stops being comparable with the other two, which is the entire
        point of drawing them together. `[&>*]:min-w-0` is the product's
        standing rule for every multi-column grid and is what lets the three
        narrow together instead of overflowing the card.
      */}
      <div role="radiogroup" aria-label="קצב הפרסום" className="mt-2 grid grid-cols-3 gap-1.5 [&>*]:min-w-0">
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
              aria-label={`${p.label} — פרסום כל ${paceGapWords(p.gapSeconds)}, הפסקה של ${p.restMinutes} דקות אחרי ${p.burst} פרסומים`}
              /*
                THE SELECTED CARD IS BLUE-BORDERED WITH A SOFT FILL, which is
                what the specification asks for by name, and it is the SAME
                blue whichever mode is chosen — the mode's own colour stays on
                its icon and its word. Two colours fighting over one border is
                how "which one is on" stops being readable.

                NO min-h. The first draft forced 96px, which was 27 more than
                the three stacked rows actually need — and campaign-card.test.ts
                measured the whole card 929px against a 910 ceiling because of
                it. The card is 40px-plus several times over on its own
                content, so the product's hit-test floor is cleared without
                reserving a pixel of air the brief asked to remove
                ("עיצוב מקצועי, קומפקטי ונקי").
              */
              className={`flex min-w-0 flex-col rounded-2xl border p-1.5 text-start transition-colors disabled:opacity-60 ${
                on
                  ? 'border-brand-500 bg-brand-300/15 shadow-[0_2px_8px_-4px_rgba(37,99,235,0.5)]'
                  : 'border-ink-600 bg-ink-900 hover:border-brand-300'
              }`}
            >
              {/* top row: the word and its icon at the start, the mark at the end */}
              <span className="flex min-w-0 items-center gap-1">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${TONE_TEXT[p.tone]}`} />
                <span dir="auto" className={`min-w-0 truncate text-[12px] font-extrabold leading-4 ${TONE_TEXT[p.tone]}`}>
                  {p.label}
                </span>
                {/*
                  THE SELECTION MARK IS A SECOND CHANNEL, not decoration — the
                  same rule the day chips in CampaignSchedulePanel follow. A
                  row whose only difference between chosen and not chosen is a
                  border colour says nothing to a colour-blind reader and very
                  little in sunlight. The empty ring holds the same box so the
                  three cards cannot change height between states.
                */}
                <span
                  aria-hidden
                  className={`ms-auto grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                    on ? 'border-brand-500 bg-brand-500 text-on-brand' : 'border-ink-600 bg-ink-900'
                  }`}
                >
                  <CheckIcon className={`h-2.5 w-2.5 ${on ? 'opacity-100' : 'opacity-0'}`} />
                </span>
              </span>

              {/* the gap */}
              <span className="mt-1 flex min-w-0 items-center gap-1 text-[10.5px] font-bold leading-[13px] text-mist-300">
                <ClockIcon aria-hidden className="h-3 w-3 shrink-0 text-mist-500" />
                <span className="min-w-0 truncate">כל {paceGapWords(p.gapSeconds)}</span>
              </span>

              {/* the reference's own hairline between the two facts */}
              <span aria-hidden className="my-0.5 block h-px w-full bg-ink-700" />

              {/* the rest */}
              <span className="flex min-w-0 items-center gap-1 text-[10.5px] font-bold leading-[13px] text-mist-300">
                <CoffeeIcon aria-hidden className="h-3 w-3 shrink-0 text-mist-500" />
                <span className="min-w-0 truncate">הפסקה {p.restMinutes} דקות</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── 3. the run length, as the reference's own pill row ───────────── */}
      {/*
        "אחרי כל 10 פרסומים תופעל הפסקה אוטומטית לפי המצב הנבחר" — the number
        is read off the table rather than typed, so the sentence and the gate
        cannot drift. All three modes share a run of ten, which is why this is
        one line under the row instead of a third fact inside each card.
      */}
      <div className="mt-1 flex min-w-0 items-center gap-1.5 rounded-2xl bg-brand-300/10 px-2 py-1 text-[10.5px] font-bold leading-4 text-mist-300">
        <LayersIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-400" />
        {/* Two lines at 360px in the first draft, which cost 23px on a card
            the brief wants shorter. Same fact, fewer words: the "אוטומטית"
            and the "לפי המצב הנבחר" are both already said by the card around
            it. */}
        <span className="min-w-0">
          הפסקה אוטומטית אחרי כל{' '}
          <span className="inline-block rounded-full bg-brand-500 px-1.5 py-px align-middle text-[10px] font-extrabold text-on-brand">
            {PACE_PROFILES[0].burst} פרסומים
          </span>
        </span>
      </div>

      {/* ─── 4. the dynamic summary line the specification asks for ───────── */}
      {selected ? (
        <p data-pace-summary className="mt-1 text-[10.5px] font-bold leading-4 text-brand-400">
          נבחר <span className="font-extrabold">{selected.label}</span>: כל {paceGapWords(selected.gapSeconds)}, הפסקה {selected.restMinutes} דק׳
          אחרי {selected.burst} פרסומים מוצלחים ברצף, כ-{Math.round(paceRatePerHour(selected))} בשעה. המצב חל על כל החשבון ועל כל הסבבים.
        </p>
      ) : (
        /*
          NOTHING PICKED YET, SAID AS A FACT ABOUT THE ENGINE.

          This is the state every existing account loads in, and the line has
          to carry the gap the engine is ACTUALLY holding — otherwise the card
          looks like a setting nobody set while the queue keeps publishing to a
          number no screen names.
        */
        <p data-pace-summary className="mt-1 text-[10.5px] font-bold leading-4 text-mist-300">
          עדיין לא נבחר מצב
          {typeof currentGapSeconds === 'number' && Number.isFinite(currentGapSeconds) ? (
            <> — הפרסום יוצא כרגע כל {accountGapLabel(currentGapSeconds)}, בלי הפסקות אוטומטיות</>
          ) : (
            <> — הפרסום יוצא לפי המרווח הקיים, בלי הפסקות אוטומטיות</>
          )}
          . בחירת מצב מפעילה את ההפסקות.
        </p>
      )}

      {/* ─── 5. "בהפסקה", with the time left ──────────────────────────────── */}
      {resting && selected && (
        <p
          data-pace-resting
          className="mt-1.5 flex min-w-0 items-center gap-1.5 rounded-2xl bg-brand-300/15 px-2 py-1.5 text-[11px] font-extrabold leading-4 text-brand-400"
        >
          <CoffeeIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">
            בהפסקה — חוזר לפרסם בעוד{' '}
            <span dir="ltr" className="inline-block tabular-nums">
              {countdown(restEndsAt - now)}
            </span>
          </span>
        </p>
      )}
    </section>
  );
}
