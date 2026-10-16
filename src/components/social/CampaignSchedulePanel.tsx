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
import { type ScheduleReadout } from '@/lib/social/schedule-readout';
import { CalendarIcon, CheckIcon, ChevronDownIcon, ClockIcon, RepeatIcon } from '@/components/icons';
import { NextPublication } from './NextPublication';
import { Toggle } from './ui';

/**
 * "תזמון פרסום" — the panel inside every campaign card.
 *
 * REBUILT TO THE SECOND REFERENCE IMAGE, which the owner again called binding
 * rather than inspirational: "עליך ליישם את העיצוב בדיוק כמו בתמונה, ברמת
 * Pixel-Perfect ככל האפשר... אין להמציא עיצוב חלופי."
 *
 * What that image changes from the first one, and these are the only changes:
 *
 *   • THE DAY CHIPS GREW. They are tall tiles now, each carrying its letter
 *     over a check mark when it is lit — the image's single loudest element,
 *     and the one that makes "which days does this publish" readable at arm's
 *     length instead of by colour alone.
 *   • THERE ARE TWO FIELDS, NOT THREE. "שעת סיום" is gone, by name: "יש
 *     להסיר לחלוטין את אפשרות שעת הסיום מממשק הכרטיס... אין להציג שעת סיום גם
 *     בשורת הסיכום." A chosen day now runs from `start` to midnight, which is
 *     the only reading the two remaining controls can produce, and the
 *     `schedule_end` column keeps whatever it holds — nothing reads it.
 *   • THE HEADER CARRIES A SUBTITLE, "בחר את ימי הפרסום והגדר את שעת ההתחלה",
 *     which is what replaced the "ימי פרסום" label the chips used to sit
 *     under. The row's accessible name still says it for a screen reader.
 *   • "הפרסום הבא" SITS BETWEEN THE SETTINGS AND THE REPEAT, where the brief
 *     puts it: "יש למקם את אזור הפרסום הבא מתחת להגדרות התזמון ולפני החזרה
 *     היומית." It is drawn only when a caller hands over a readout, because
 *     the dashboard's run card already draws the same component above this
 *     panel and two copies of one answer on one screen is the fault this
 *     product keeps making.
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
 * THE HORIZONTAL METRICS ARE UNCHANGED AND THAT IS ON PURPOSE. Seven chips on
 * one row inside a 360px card come to 40px each with a 3px gap and the card's
 * existing padding — worker/test/campaign-card.test.ts hit-tests every one of
 * them and fails the row under 40. The reference is drawn on a 402px phone
 * where there is room to spare; the extra room this rebuild spends is
 * VERTICAL, where nothing is competing for it.
 */
export function CampaignSchedulePanel({
  schedule,
  onChange,
  campaignName,
  disabled = false,
  repeat,
  onRepeatChange,
  accountFloorSeconds,
  neverLaunched = false,
  showHeader = true,
  readout,
  workerOnline,
  nextTargetName = null,
  nextTargetImage = null,
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
   * WHEN THIS CAMPAIGN PUBLISHES NEXT — already decided, never computed here.
   *
   * Optional for the same reason the header is: the dashboard draws the same
   * <NextPublication> above this panel out of the same value, so passing it
   * here too would put one answer on one card twice. The campaigns list, where
   * this panel is the whole card, passes it.
   */
  readout?: ScheduleReadout;
  /** Passed straight through: `false` draws the connection caveat. */
  workerOnline?: boolean;
  /** Also straight through: which group the next publication goes to. */
  nextTargetName?: string | null;
  nextTargetImage?: string | null;
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
  /**
   * THIS ROUND HAS NEVER GONE OUT, so neither control below can produce a
   * publication yet — and that is the one fact this panel was missing.
   *
   * Everything on this panel can only ever PREVENT a publication; the daily
   * repeat is the one control that makes a round happen again, and it repeats
   * a round by copying the group list off the schedule row that launched it
   * (setCampaignRepeat in client.ts). No launch, no list, nothing armed.
   *
   * The owner set Saturday and 19:00 on a round in exactly this state, read
   * the paragraph below promising "אותו פוסט יפורסם שוב… החל מהשעה 19:00",
   * and waited. Optional, because a caller that cannot tell says nothing
   * rather than guessing — but both screens that draw this panel can.
   */
  neverLaunched?: boolean;
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
    /*
     * THE PROBE IS ON THE WRAPPER NOW, not on the lavender block.
     *
     * The reference draws three stacked blocks under one heading — the
     * settings, "הפרסום הבא", and "חזרה יומית" — each with its own fill, and
     * only the first of them is lavender. `[data-schedule]` is what the
     * measured suite selects to find "the scheduling area", and that area is
     * all three.
     */
    <div data-schedule className="mt-1.5">
      <div className="rounded-2xl bg-brand-300/10 p-2">
        {/* ─── 1. the header: calendar, title, subtitle, switch ───────────── */}
        <div className={`items-start gap-2 ${showHeader ? 'flex' : 'hidden'}`}>
          {/* The image's own white icon tile. It is not a control, so it has
              no target floor to meet and keeps the reference's size. */}
          <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-ink-900">
            <CalendarIcon className="h-3.5 w-3.5 text-brand-400" />
          </span>
          <span className="min-w-0 grow">
            <span className="block text-[12.5px] font-extrabold leading-4 text-mist-100">תזמון פרסום</span>
            {/* WHAT THE CHIPS USED TO BE LABELLED. The reference replaces the
                "ימי פרסום" line above the row with this sentence, which says
                the same thing and also names the second control. The row
                itself keeps "ימי פרסום" as its accessible name, so a screen
                reader is not relying on a sentence two elements away. */}
            <span className="mt-px block text-[10px] font-bold leading-[13px] text-mist-300">
              בחר את ימי הפרסום והגדר את שעת ההתחלה
            </span>
          </span>
          {/*
            THE SWITCH SITS AT THE OTHER END — `ms-auto`, not a fixed order, so
            it is at the card's left on this RTL page and would be at the right
            on an LTR one without this file knowing which.

            Its accessible name carries the campaign, because a screen reader
            moving down this list otherwise meets twenty switches all called
            "תזמון פרסום".
          */}
          <span className="ms-auto -me-1 -my-1 flex shrink-0 items-center">
            <Toggle
              checked={schedule.enabled}
              onChange={(v) => set({ enabled: v })}
              label={`תזמון פרסום ל${campaignName}`}
            />
          </span>
        </div>

        {/* ─── 2. ימי פרסום — seven tiles, one row, multi-select ─────────── */}
        {/*
          A GRID OF SEVEN, not a flex row and not a scroller.

          The reference puts all seven on one line and they stay on one line:
          `grid-cols-7` makes them exactly equal and lets them narrow together,
          so the row fits a card at 360px as well as the half-width column of
          the desktop grid. A flex row would wrap the last day onto a second
          line at some width nobody tested, and an overflow scroller would hide
          ש׳ behind an edge — on a control whose whole meaning is which of the
          seven are lit.

          AND THE GAP IS 3px RATHER THAN 4, which is the one number here that
          was measured rather than chosen. Seven chips and six gaps inside a
          360px card's panel come to 38px each at gap-1, and the product's
          floor for a control is 40 — worker/test/campaign-card.test.ts
          hit-tests every one of them and fails that row at 38. A pixel off
          each gap is six pixels back across the row, which is what buys the
          seventh chip its 40th.
        */}
        <div
          role="group"
          aria-label={`ימי פרסום ל${campaignName}`}
          className={`grid grid-cols-7 gap-[3px] [&>*]:min-w-0 ${showHeader ? 'mt-2' : 'mt-0.5'}`}
        >
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
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl border text-[12.5px] font-extrabold transition-colors disabled:opacity-60 ${
                  on
                    /*
                     * THE DISCOVERY SCREEN'S OWN SELECTED CHIP, brand-600 →
                     * brand-500, and not `.grad-primary`.
                     *
                     * grad-primary is the product's gradient for a primary
                     * action and globals.css does name "a selected chip" among
                     * its uses — but it runs out to #a855f7, where a white
                     * label measures 3.96:1. On a 220px button the text sits
                     * in the middle of that ramp and never reaches the light
                     * end; on a 40px chip it covers the whole of it. This
                     * pair's lightest end is brand-500 at 5.70, and FilterRow
                     * in Discovery.tsx already carries the same note for the
                     * same reason.
                     */
                    ? 'border-transparent bg-gradient-to-l from-brand-600 to-brand-500 text-on-brand shadow-[0_2px_8px_-2px_rgba(124,58,237,0.45)]'
                    /* ink-600 rather than the decorative hairline: an
                       unselected chip is white on a lavender tint, which is
                       1.13:1 — no measurable edge at all. The control-edge
                       token is 3.10 here, over the 3:1 WCAG 1.4.11 asks of a
                       UI boundary. */
                    : 'border-ink-600 bg-ink-900 text-mist-300 hover:border-brand-300'
                }`}
              >
                {label}
                {/*
                  THE CHECK MARK THE REFERENCE DRAWS INSIDE EVERY LIT TILE.

                  It is not decoration: it is the second channel. A row whose
                  only difference between chosen and not chosen is a fill is a
                  row that says nothing to a colour-blind reader and very
                  little in sunlight. The unlit tile reserves its height so the
                  seven letters stay on one baseline — a row where five letters
                  sit 7px above the other two reads as broken.
                */}
                <CheckIcon aria-hidden className={`h-3 w-3 ${on ? 'opacity-100' : 'opacity-0'}`} />
              </button>
            );
          })}
        </div>

        {/* ─── 3. the two fields, in the reference's own order ────────────── */}
        <div className="mt-2 grid grid-cols-2 gap-2 [&>*]:min-w-0">
          <Pick
            label="שעת התחלה"
            aria={`שעת התחלה ב${campaignName}`}
            icon={<ClockIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-400" />}
            value={schedule.start}
            disabled={disabled}
            onChange={(v) => set({ start: v })}
            options={TIME_CHOICES.map((t) => ({ value: t, label: t }))}
          />
          <Pick
            label="הפרש בין פרסומים"
            aria={`הפרש בין פרסומים ב${campaignName}`}
            icon={<RepeatIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-400" />}
            value={String(schedule.gapSeconds)}
            disabled={disabled}
            onChange={(v) => set({ gapSeconds: Number(v) })}
            /* Seconds, so the three sub-minute steps the owner asked for can
               exist at all. gapChoiceLabel does the spelling, here and in the
               summary line, so the two cannot drift. */
            options={GAP_CHOICES.map((sec) => ({ value: String(sec), label: gapChoiceLabel(sec) }))}
          />
        </div>

        {/* ─── 4. the summary — live, and the one line that is a sentence ── */}
        {/*
          "הסיכום חייב להתעדכן LIVE כאשר המשתמש משנה: ימים, שעת התחלה, הפרש
           בין פוסטים." It is computed from the prop on every render, so it
          cannot be anything else — there is no second copy of these values.

          TWO LINES, WHICH IS HOW THE REFERENCE DRAWS IT: the days, then the
          hour and the interval. The days are the half that can run long — all
          seven, or six of them spelled out — so they get the line that is
          allowed to end in an ellipsis and the numbers get one that is not.

          AND NO CLOSING HOUR. The second line used to be "09:00 – 23:30"; the
          brief removes the end time from here by name ("אין להציג שעת סיום גם
          בשורת הסיכום"), so it reads "משעה 09:00" — which is what the engine
          now actually does.
        */}
        <div
          data-summary
          className={`mt-2 flex min-w-0 items-start gap-1.5 rounded-2xl px-2.5 py-2 text-[11px] font-bold leading-4 ${
            /* A white strip rather than an amber tint: warning-400 on 20% of
               brand-300 is 4.21:1, and on white it is 5.43. */
            noDays && schedule.enabled ? 'bg-ink-900 text-warning-400' : 'bg-brand-300/20 text-brand-400'
          }`}
        >
          <CalendarIcon aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          {schedule.enabled ? (
            <span className="min-w-0">
              <span className="block truncate">ימי פרסום: {daysLabel(schedule)}</span>
              {!noDays && (
                /*
                  THE HOUR IS ITS OWN LTR ISLAND. "09:00" is a European number
                  run around a neutral colon: inside an RTL line the bidi
                  algorithm can reorder it, and `dir="auto"` does not fix it —
                  the string has no strong character, so auto falls back to the
                  RTL that caused it. Same fix as <Stamp>: an explicit island.
                */
                <span className="mt-px block">
                  משעה <span dir="ltr" className="inline-block tabular-nums">{schedule.start}</span> · {gapLabel(schedule)}
                </span>
              )}
            </span>
          ) : (
            /* Off is a state with a consequence, so it says the consequence
               rather than the word "כבוי" on its own: this campaign publishes
               whenever the queue says, which is what it did before this panel
               existed. */
            <span className="min-w-0">התזמון כבוי — הקמפיין מפרסם ללא הגבלת ימים ושעות</span>
          )}
        </div>

        {/* ─── 4b. the floor this gap is about to move, if it is about to ─ */}
        {schedule.enabled && willLowerFloor && (
          /* mist-300 on the white strip rather than amber: this is not a risk,
             it is a fact about scope. The amber on this panel is reserved for
             חזרה יומית, which is the one control here that can cost him his
             account. */
          <p className="mt-1.5 rounded-xl bg-ink-900 px-2 py-1.5 text-[10.5px] font-bold leading-4 text-mist-300">
            המרווח המינימלי של כל החשבון הוא כרגע {accountGapLabel(accountFloorSeconds as number)}, והוא זה שקובע. בשמירה הוא ירד ל-
            {accountGapLabel(schedule.gapSeconds)} <span className="text-brand-400">לכל הסבבים</span>, לא רק לזה.
          </p>
        )}
      </div>

      {/* ─── 5. "הפרסום הבא" — under the settings, above the repeat ─────── */}
      {readout && (
        <NextPublication
          readout={readout}
          scheduleOn={schedule.enabled}
          workerOnline={workerOnline}
          neverLaunched={neverLaunched}
          targetName={nextTargetName}
          targetImage={nextTargetImage}
          className="mt-1.5"
        />
      )}

      {/* ─── 6. חזרה יומית — the one control here that makes something happen ─ */}
      {canRepeat && repeat && onRepeatChange && (
        /*
         * "הקמפיין פעיל, אמור לצאת כל יום מ-8 בבוקר עד 22 בלילה כל דקה."
         *
         * He thought the panel above did this. It cannot: every setting in it
         * can only ever PREVENT a publication, and a round whose queue empties
         * is finished for good. This is the switch that actually makes a round
         * happen again — and it is deliberately the last thing here, below the
         * next publication, because it is the only one with a consequence
         * outside the campaign.
         *
         * IT SAYS WHAT IT RISKS, IN HIS WORDS AND WITHOUT SOFTENING IT.
         * Publishing the same advertisement into the same groups day after day
         * is what group admins remove people for and what Meta's spam systems
         * look for. The product's job is not to refuse him his own account — it
         * is to make sure the decision is an informed one, every time he looks
         * at this panel and not only on the day he first pressed it.
         *
         * A NEUTRAL BOX WITH AN AMBER SENTENCE IN IT, which is the reference's
         * own drawing and a change from the amber-bordered block this used to
         * be. The border was permanently on; the consequence it was warning
         * about only exists while the switch is. So the border is the ordinary
         * control edge and the amber moved onto the line that is only there
         * when the repeat is armed — where it is 5.43:1 on white rather than
         * 4.18 on an amber tint, which is the pair the contrast guard exists
         * to catch and did catch, in this block.
         */
        <div className="mt-1.5 rounded-2xl border border-ink-600 bg-ink-900 p-2.5">
          <div className="flex items-start gap-2">
            <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-brand-300/15">
              <RepeatIcon className="h-3.5 w-3.5 text-brand-400" />
            </span>
            <span className="min-w-0 grow">
              <span className="block text-[12.5px] font-extrabold leading-4 text-mist-100">חזרה יומית</span>
              <span className="mt-px block text-[10px] font-bold leading-[13px] text-mist-300">הפעל חזרה יומית של הקמפיין</span>
            </span>
            <span className="ms-auto -me-1 -my-1 flex shrink-0 items-center">
              <Toggle
                checked={repeat.enabled}
                onChange={(enabled) => !disabled && onRepeatChange({ ...repeat, enabled })}
                label={`חזרה יומית עבור ${campaignName}`}
              />
            </span>
          </div>
          {(neverLaunched || repeat.enabled) && (
            <p className="mt-1.5 text-[10.5px] font-bold leading-4 text-mist-300">
              {neverLaunched ? (
                /*
                 * SAID BEFORE THE PROMISE, not instead of the switch. The
                 * switch stays usable — he may well be arming a round he is
                 * about to launch — but the sentence under it may not describe
                 * something that cannot happen yet.
                 */
                <>
                  הסבב הזה עוד לא יצא אף פעם, ולכן אין עדיין רשימת קבוצות לחזור אליה — החזרה היומית לא תיכנס לפעולה והתזמון לא יכניס פרסומים לתור.
                  <span className="mt-0.5 block text-warning-400">
                    השיקו אותו פעם אחת — הוסיפו פוסט, בחרו קבוצות ושלחו — ומאותו רגע התזמון והחזרה יעבדו לבד.
                  </span>
                </>
              ) : (
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
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One field: a label with its own icon, and a native select under it.
 *
 * NATIVE, not a custom listbox. The gap offers thirty-three options and the
 * start time offers forty-eight, and on the owner's phone a native select
 * opens as iOS's own wheel — searchable, scrollable with a thumb, and
 * dismissable the way every other list on his phone is. A hand-rolled dropdown
 * inside a card in a scrolling list is the version of this that gets stuck
 * under the next card.
 *
 * `appearance-none` plus our own chevron, because the native arrow is drawn in
 * a different place and a different weight by every browser, and the reference
 * draws one thin chevron at the field's leading edge.
 *
 * TWO FIELDS, NOT THREE, so each is half the panel instead of a third. That is
 * what buys the reference's roomier box and its larger figure — and it is why
 * the label no longer needs two lines to hold "הפרש בין פרסומים".
 */
function Pick({
  label,
  aria,
  icon,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  aria: string;
  icon: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0 rounded-2xl bg-ink-900 p-1.5">
      <span className="flex min-w-0 items-center justify-center gap-1 text-center text-[10px] font-bold leading-4 text-mist-300">
        {icon}
        {/* dir="auto" because the guard in layout.test.ts asks it of every
             clamped expression, and it is right to: it cannot tell this label
             from a group name. Both are Hebrew constants written in this file,
             so "auto" resolves to the RTL they already had. */}
        <span dir="auto" className="min-w-0 truncate">{label}</span>
      </span>
      <span className="relative mt-1 block">
        <select
          aria-label={aria}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          /* ps-6 leaves the chevron its corner and pe-6 keeps the value
             optically centred against it, which is where the reference puts
             it. */
          className="h-10 min-h-10 w-full cursor-pointer appearance-none rounded-xl border border-ink-600 bg-ink-900 pe-6 ps-6 text-center text-[13px] font-extrabold tabular-nums text-mist-100 transition-colors hover:border-brand-300 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon aria-hidden className="pointer-events-none absolute inset-y-0 start-2 my-auto h-3.5 w-3.5 text-mist-500" />
      </span>
    </label>
  );
}

/** Re-exported so a caller needs one import for the panel and its summary. */
export { scheduleSummary };
