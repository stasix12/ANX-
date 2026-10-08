'use client';

import {
  DAY_LABELS,
  DAY_NAMES,
  GAP_CHOICES,
  gapChoiceLabel,
  TIME_CHOICES,
  daysLabel,
  gapLabel,
  scheduleSummary,
  type CampaignRepeat,
  type CampaignSchedule,
} from '@/lib/social/campaign-schedule';
import { accountGapLabel } from '@/lib/social/rules';
import { CalendarIcon, ChevronDownIcon, ClockIcon, RepeatIcon } from '@/components/icons';
import { Toggle } from './ui';

/**
 * "תזמון פרסום" — the panel inside every campaign card.
 *
 * Built to the owner's reference image, which he called a binding spec rather
 * than an inspiration: a lavender block under "הוסף פוסט" and above the
 * campaign's own actions, holding a clock-and-switch header, seven day chips
 * on ONE row, three compact fields, and a live summary strip at its foot.
 *
 * NOT A MODAL, NOT A SHEET, NOT A SCREEN. "אל תפתח Modal. אל תפתח Popup. אל
 * תיצור מסך חדש. אל תעביר את ההגדרות לעמוד נפרד." Everything here is in the
 * card, and every control acts on the campaign the card is about.
 *
 * PRESENTATIONAL, AND DELIBERATELY SO. It owns no state and saves nothing: it
 * is handed a schedule and a callback, and the campaigns page decides what a
 * change costs (it writes, debounced, and reverts on failure). That is what
 * lets the fixture that measures this render it with no database at all, and
 * it is why a card in a list of twenty cannot start twenty writes.
 *
 * COLOURS ARE THE THEME'S, measured off the reference rather than guessed:
 * the block is brand-300 at 10% on white — #f2effd in the image, #f3efFE as
 * the token resolves it — and the summary strip is the same purple at 20%,
 * which is the one shade darker the image actually draws. No new colour
 * enters the product for this panel: "אין להוסיף צבעים חדשים שלא קיימים
 * בעיצוב."
 *
 * ONE DELIBERATE DEPARTURE FROM THE IMAGE, and it is the product's own
 * standing rule rather than a liberty. The reference draws its day chips and
 * its three fields about 26px tall. Every interactive control in this app has
 * a measured 40px floor — worker/test/campaign-card.test.ts hit-tests every
 * one of them and fails under it — and a 26px chip on a phone is a mis-tap.
 * So the chips and the fields are 40px and everything else about them (the
 * fill, the border, the radius, the type, the order, the proportions) is the
 * image's. "אל תדחוס את האלמנטים עד שהם בלתי קריאים."
 */
export function CampaignSchedulePanel({
  schedule,
  onChange,
  campaignName,
  disabled = false,
  repeat,
  onRepeatChange,
  accountFloorSeconds,
  showHeader = true,
}: {
  schedule: CampaignSchedule;
  onChange: (next: CampaignSchedule) => void;
  /**
   * CHZARA — the round's daily repeat, when the caller supports it.
   *
   * "אותו פוסט לאותן קבוצות כל יום." Optional, because a caller that cannot
   * ARM it must not draw it: the switch's effect is a weekly schedule row, and
   * a screen that flipped the two columns without writing that row would show
   * a repeat that never repeats. Pass both or neither.
   */
  repeat?: CampaignRepeat;
  onRepeatChange?: (next: CampaignRepeat) => void;
  /** Only for the accessible names — four controls per card in a list of them. */
  campaignName: string;
  /** While the campaign's own row is being written by something else. */
  disabled?: boolean;
  /**
   * Whether to draw the title and the switch.
   *
   * The dashboard's run card already has both, in its own readout block, and
   * opens this panel underneath it as the editor. Drawing them again put TWO
   * switches for one setting on one card, 300px apart — both live, both
   * correct, and no way to tell from the screen that they were the same
   * switch. The campaigns screen, where this panel is the whole feature, keeps
   * them: the default is on, so no existing caller changes.
   */
  showHeader?: boolean;
  /**
   * The ACCOUNT-WIDE floor this campaign also has to clear, in seconds.
   *
   * The gap field above is only the first of two gates. The second is
   * `minGap + groupMinGap` across the whole account — 65 minutes out of the
   * box — and choosing "30 שניות" under it used to change NOTHING the owner
   * could see: the field said thirty seconds, the card counted down from it,
   * and the engine held the row for an hour. "ושבאמת יספיק לפרסם בתווך זמן
   * זה" is about that hour, not about the field.
   *
   * So saving a smaller gap now LOWERS that floor to match (client.ts's
   * matchAccountGapTo), and this panel is where the owner is told so — before
   * the write, because it is the one consequence on this panel that reaches
   * outside the campaign he is looking at. Optional: a caller that cannot
   * read the account's settings says nothing rather than guessing.
   */
  accountFloorSeconds?: number;
}) {
  const set = (patch: Partial<CampaignSchedule>) => onChange({ ...schedule, ...patch });
  const canRepeat = Boolean(repeat && onRepeatChange);

  /*
   * MULTI SELECT, and a tap is a toggle in both directions — including the
   * last one. "חובה לאפשר Multi Select"; nothing says a day may not be
   * un-chosen, and a control that refuses its own last press is a control the
   * owner fights. Choosing none is a real state: the engine HOLDS every
   * publication rather than dropping it (rules.ts defers a day at a time), and
   * the summary strip below says so in words instead of leaving him to
   * discover it from an empty queue.
   */
  const toggleDay = (day: number) =>
    set({ days: schedule.days.includes(day) ? schedule.days.filter((d) => d !== day) : [...schedule.days, day].sort((a, b) => a - b) });

  const noDays = schedule.days.length === 0;

  /* Shown only while the two genuinely disagree, which makes it self-clearing:
     once the write lands the floor equals the gap and the line goes away on
     its own rather than sitting there as a permanent warning about nothing. */
  const willLowerFloor =
    typeof accountFloorSeconds === 'number' && Number.isFinite(accountFloorSeconds) && accountFloorSeconds > schedule.gapSeconds;

  return (
    <div data-schedule className="mt-1.5 rounded-2xl bg-brand-300/10 p-2">
      {/* ─── 1. the header: clock, name, switch ─────────────────────────── */}
      <div className={`items-center gap-1.5 ${showHeader ? 'flex' : 'hidden'}`}>
        <ClockIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-400" />
        <span className="text-[12px] font-extrabold leading-4 text-mist-100">תזמון פרסום</span>
        {/*
          THE SWITCH SITS AT THE OTHER END — `ms-auto`, not a fixed order, so
          it is at the card's left on this RTL page and would be at the right
          on an LTR one without this file knowing which.

          Its accessible name carries the campaign, because a screen reader
          moving down this list otherwise meets twenty switches all called
          "תזמון פרסום".
        */}
        <span className="ms-auto -me-1 flex items-center">
          <Toggle
            checked={schedule.enabled}
            onChange={(v) => set({ enabled: v })}
            label={`תזמון פרסום ל${campaignName}`}
          />
        </span>
      </div>

      {/* ─── 2. ימי פרסום — seven chips, one row, multi-select ──────────── */}
      {/* mist-300, NOT mist-500. The fine-print token measures 4.95:1 on a
          white card and 4.40 on this lavender one — under the 4.5 AA asks of
          10px text. Every label in this panel sits on the tint, so every one
          of them takes the step up (5.61). */}
      <p className="mt-0.5 text-[10.5px] font-bold leading-4 text-mist-300">ימי פרסום</p>
      {/*
        A GRID OF SEVEN, not a flex row and not a scroller.

        The reference puts all seven on one line and they stay on one line:
        `grid-cols-7` makes them exactly equal and lets them narrow together,
        so the row fits a card at 360px as well as the half-width column of the
        desktop grid. A flex row would wrap the last day onto a second line at
        some width nobody tested, and an overflow scroller would hide ש׳ behind
        an edge — on a control whose whole meaning is which of the seven are
        lit.

        AND THE GAP IS 3px RATHER THAN 4, which is the one number here that was
        measured rather than chosen. Seven chips and six gaps inside a 360px
        card's panel come to 38px each at gap-1, and the product's floor for a
        control is 40 — worker/test/campaign-card.test.ts hit-tests every one
        of them and fails that row at 38. A pixel off each gap is six pixels
        back across the row, which is what buys the seventh chip its 40th.
      */}
      <div role="group" aria-label={`ימי פרסום ל${campaignName}`} className="mt-1 grid grid-cols-7 gap-[3px] [&>*]:min-w-0">
        {DAY_LABELS.map((label, day) => {
          const on = schedule.days.includes(day);
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              /* "א׳" is read aloud as a letter; the day is read as a day. */
              aria-label={DAY_NAMES[day]}
              onClick={() => toggleDay(day)}
              className={`flex min-h-10 items-center justify-center rounded-xl border text-[12px] font-extrabold transition-colors disabled:opacity-60 ${
                on
                  /*
                   * THE DISCOVERY SCREEN'S OWN SELECTED CHIP, brand-600 →
                   * brand-500, and not `.grad-primary`.
                   *
                   * grad-primary is the product's gradient for a primary
                   * action and globals.css does name "a selected chip" among
                   * its uses — but it runs out to #a855f7, where a white label
                   * measures 3.96:1. On a 220px button the text sits in the
                   * middle of that ramp and never reaches the light end; on a
                   * 40px chip it covers the whole of it. This pair's lightest
                   * end is brand-500 at 5.70, and FilterRow in Discovery.tsx
                   * already carries the same note for the same reason.
                   */
                  ? 'border-transparent bg-gradient-to-l from-brand-600 to-brand-500 text-on-brand shadow-[0_2px_8px_-2px_rgba(124,58,237,0.45)]'
                  /* ink-600 rather than the decorative hairline: an unselected
                     chip is white on a lavender tint, which is 1.13:1 — no
                     measurable edge at all. The control-edge token is 3.10
                     here, over the 3:1 WCAG 1.4.11 asks of a UI boundary. */
                  : 'border-ink-600 bg-ink-900 text-mist-300 hover:border-brand-300'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ─── 3. the three fields, in the reference's own order ──────────── */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 [&>*]:min-w-0">
        <Pick
          label="הפרש בין פוסט לפוסט"
          aria={`הפרש בין פוסט לפוסט ב${campaignName}`}
          value={String(schedule.gapSeconds)}
          disabled={disabled}
          onChange={(v) => set({ gapSeconds: Number(v) })}
          /* Seconds, so the three sub-minute steps the owner asked for can
             exist at all. gapChoiceLabel does the spelling, here and in the
             summary line, so the two cannot drift. */
          options={GAP_CHOICES.map((sec) => ({ value: String(sec), label: gapChoiceLabel(sec) }))}
        />
        <Pick
          label="שעת התחלה"
          aria={`שעת התחלה ב${campaignName}`}
          value={schedule.start}
          disabled={disabled}
          onChange={(v) => set({ start: v })}
          options={TIME_CHOICES.map((t) => ({ value: t, label: t }))}
        />
        <Pick
          label="שעת סיום"
          aria={`שעת סיום ב${campaignName}`}
          value={schedule.end}
          disabled={disabled}
          onChange={(v) => set({ end: v })}
          options={TIME_CHOICES.map((t) => ({ value: t, label: t }))}
        />
      </div>

      {/* ─── 4. סיכום תזמון — live, and the one line that is a sentence ─── */}
      {/*
        "הסיכום חייב להתעדכן LIVE כאשר המשתמש משנה: ימים, שעת התחלה, שעת סיום,
         הפרש בין פוסטים." It is computed from the prop on every render, so it
        cannot be anything else — there is no second copy of these values.

        THE CLOCK RANGE IS ITS OWN LTR ISLAND. "08:00 – 22:00" is two European
        number runs around a neutral dash: inside an RTL line the bidi
        algorithm renders it "22:00 – 08:00", with the end time first. That is
        not a cosmetic fault on a line whose whole job is to say when
        publishing starts and stops, and `dir="auto"` does not fix it — the
        string has no strong character, so auto falls back to the RTL that
        caused it. Same fix as <Stamp>: an explicit island.
      */}
      <p
        className={`mt-1.5 flex min-w-0 items-center gap-1 rounded-xl px-2 py-1.5 text-[10.5px] font-bold leading-4 ${
          /* A white strip rather than an amber tint: warning-400 on 10% of
               itself over this panel is 4.18:1, and on white it is 5.43. */
          noDays && schedule.enabled ? 'bg-ink-900 text-warning-400' : 'bg-brand-300/20 text-brand-400'
        }`}
      >
        <CalendarIcon aria-hidden className="h-3 w-3 shrink-0" />
        {schedule.enabled ? (
          <span className="min-w-0 truncate">
            סיכום תזמון: {daysLabel(schedule)}
            {!noDays && (
              <>
                {' · '}
                <span dir="ltr" className="inline-block tabular-nums">
                  {schedule.start} – {schedule.end}
                </span>
                {' · '}
                {gapLabel(schedule)}
              </>
            )}
          </span>
        ) : (
          /* Off is a state with a consequence, so it says the consequence
             rather than the word "כבוי" on its own: this campaign publishes
             whenever the queue says, which is what it did before this panel
             existed. */
          <span className="min-w-0 truncate">התזמון כבוי — הקמפיין מפרסם ללא הגבלת ימים ושעות</span>
        )}
      </p>

      {/* ─── 4b. the floor this gap is about to move, if it is about to ─── */}
      {schedule.enabled && willLowerFloor && (
        /* mist-300 on the white strip rather than amber: this is not a risk,
           it is a fact about scope. The amber on this panel is reserved for
           חזרה יומית, which is the one control here that can cost him his
           account. */
        <p className="mt-1 rounded-xl bg-ink-900 px-2 py-1.5 text-[10.5px] font-bold leading-4 text-mist-300">
          המרווח המינימלי של כל החשבון הוא כרגע {accountGapLabel(accountFloorSeconds as number)}, והוא זה שקובע. בשמירה הוא ירד ל-
          {accountGapLabel(schedule.gapSeconds)} <span className="text-brand-400">לכל הסבבים</span>, לא רק לזה.
        </p>
      )}

      {/* ─── 5. חזרה יומית — the one control here that makes something happen ─ */}
      {canRepeat && repeat && onRepeatChange && (
        /*
         * "הקמפיין פעיל, אמור לצאת כל יום מ-8 בבוקר עד 22 בלילה כל דקה."
         *
         * He thought the panel above did this. It cannot: every setting in it
         * can only ever PREVENT a publication, and a round whose queue empties
         * is finished for good. This is the switch that actually makes a round
         * happen again — and it is deliberately the last thing on the panel,
         * below the summary, because it is the only one with a consequence
         * outside the campaign.
         *
         * IT SAYS WHAT IT RISKS, IN HIS WORDS AND WITHOUT SOFTENING IT.
         * Publishing the same advertisement into the same groups day after day
         * is what group admins remove people for and what Meta's spam systems
         * look for. The product's job is not to refuse him his own account — it
         * is to make sure the decision is an informed one, every time he looks
         * at this panel and not only on the day he first pressed it.
         */
        /*
           AMBER ON WHITE, NOT ON AN AMBER TINT. This theme's warning-400 is a
           dark amber (#b54708) and over 10% of itself it measures 4.18:1 —
           under the 4.5 that 10.5px text asks for, and the exact pair the
           guard in campaign-schedule.test.ts exists to catch. It caught this
           block. On ink-900 the same amber is 5.43, and the border carries the
           colour instead, which is what the summary line above already does.
        */
        <div className="mt-2 rounded-xl border border-warning-400/40 bg-ink-900 p-2">
          <div className="flex items-center gap-2">
            <RepeatIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-warning-400" />
            <span className="text-[11px] font-extrabold leading-4 text-warning-400">חזרה יומית</span>
            <span className="ms-auto">
              <Toggle
                checked={repeat.enabled}
                onChange={(enabled) => !disabled && onRepeatChange({ ...repeat, enabled })}
                label={`חזרה יומית עבור ${campaignName}`}
              />
            </span>
          </div>
          <p className="mt-1 text-[10.5px] font-bold leading-4 text-mist-300">
            {repeat.enabled ? (
              <>
                אותו פוסט יפורסם שוב לאותן קבוצות בכל יום פרסום, החל מהשעה{' '}
                <span dir="ltr" className="inline-block tabular-nums">{schedule.start}</span>. לא יותר מפעם ב-{repeat.minHours} שעות לאותה
                קבוצה.
                {/* The consequence, not the mechanism. He is the one whose
                    account carries it, so he is the one who has to read it. */}
                <span className="mt-0.5 block text-warning-400">
                  פרסום חוזר של אותה מודעה לאותן קבוצות עלול לגרום להסרה מהקבוצות או להגבלת החשבון שלכם בפייסבוק.
                </span>
              </>
            ) : (
              'כבוי — הסבב רץ פעם אחת ונגמר. אותו פוסט לא יפורסם שוב לאותה קבוצה.'
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One compact field: a label with its own clock, and a native select under it.
 *
 * NATIVE, not a custom listbox. The gap offers thirty options and each time
 * offers forty-eight, and on the owner's phone a native select opens as iOS's
 * own wheel — searchable, scrollable with a thumb, and dismissable the way
 * every other list on his phone is. A hand-rolled dropdown inside a card in a
 * scrolling list is the version of this that gets stuck under the next card.
 *
 * `appearance-none` plus our own chevron, because the native arrow is drawn in
 * a different place and a different weight by every browser, and the reference
 * draws one thin chevron at the field's leading edge.
 *
 * THE LABEL KEEPS THE REFERENCE'S OWN WORDING, all four words of it, in a
 * column that can be 70px wide. It is allowed two lines to do that in, and the
 * box is that tall whether it needs them or not — see the note on it below.
 */
function Pick({
  label,
  aria,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  aria: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      {/* TWO LINES OF ROOM, ALWAYS, whether or not this label needs them.
          "הפרש בין פוסט לפוסט" wraps in a 70px column and "שעת סיום" does not,
          so a box that grows with its text leaves the three fields' tops at
          three different heights — on a row the reference draws dead level.
          Fixed height, vertically centred, and the full wording kept. */}
      <span className="flex h-7 min-w-0 items-center justify-center gap-1 text-center text-[9.5px] font-bold leading-[13px] text-mist-300">
        <ClockIcon aria-hidden className="h-2.5 w-2.5 shrink-0" />
        {/* dir="auto" because the guard in layout.test.ts asks it of every clamped
             expression, and it is right to: it cannot tell this label from a
             group name. All three are Hebrew constants written in this file,
             so "auto" resolves to the RTL it already had. */}
        <span dir="auto" className="line-clamp-2 min-w-0">{label}</span>
      </span>
      <span className="relative mt-0.5 block">
        <select
          aria-label={aria}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          /* ps-5 leaves the chevron its corner; text-end keeps the value where
             the reference puts it, against the field's trailing edge. */
          className="h-10 min-h-10 w-full cursor-pointer appearance-none rounded-xl border border-ink-600 bg-ink-900 pe-2 ps-5 text-end text-[12px] font-extrabold tabular-nums text-mist-100 transition-colors hover:border-brand-300 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon aria-hidden className="pointer-events-none absolute inset-y-0 start-1.5 my-auto h-3 w-3 text-mist-500" />
      </span>
    </label>
  );
}

/** Re-exported so a caller needs one import for the panel and its summary. */
export { scheduleSummary };
