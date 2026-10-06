'use client';

import { CalendarIcon, ClockIcon, RepeatIcon } from '@/components/icons';
import { type ScheduleReadout } from '@/lib/social/schedule-readout';
import {
  DAY_LABELS,
  DAY_NAMES,
  dayRelativeHe,
  daysLabel,
  gapLabel,
  type CampaignSchedule,
} from '@/lib/social/campaign-schedule';
import { counted, formatDateHe, formatTimeHe } from '@/lib/social/time';
import { Toggle } from './ui';

/**
 * "תזמון פרסום" AND "הפרסום הבא יתחיל ב:" — the two blocks the owner's
 * reference image draws inside the DASHBOARD's run card.
 *
 * "התמונה המצורפת היא SPEC מחייב... זהו המסך הראשי / Dashboard של התוכנה. זה
 *  לא מסך 'קמפיינים'." The campaigns screen has had an embedded scheduling
 * area since 3.84.0 (CampaignSchedulePanel); the dashboard's own run card
 * never did, and the dashboard is the screen he actually opens. Same stored
 * schedule, same functions, a second READER of them.
 *
 * WHY A SECOND COMPONENT AND NOT THE SAME PANEL TWICE. They answer different
 * questions and the reference draws them differently. CampaignSchedulePanel is
 * an EDITOR — three selects, seven 40px chips, a summary sentence — and it is
 * what opens under this one when "ערוך מועד" is pressed. This is a READOUT:
 * three compact boxes that say what the campaign is set to and one strip that
 * says when the next publication actually lands. A readout can use the
 * reference's own proportions, which an editor cannot: every interactive
 * control in this product has a measured 40px floor (worker/test hit-tests
 * them), and the image's day chips are half that. Here they are text, the BOX
 * is the control, and the box is 44.
 *
 * NO SECOND SCHEDULING MECHANISM. "אל תיצור מנגנון תזמון שני במקביל." Nothing
 * here computes a schedule: `daysLabel`, `gapLabel` and the next instant all
 * come from campaign-schedule.ts, which is the same module rules.ts asks
 * before it lets a row go out. A card that says 08:10 over an engine that
 * waits until 09:00 is the one failure this module exists to prevent.
 *
 * NOTHING IS HARDCODED. "אסור לקודד Hardcoded: 08:10 / 01.10.2026 /
 *  08:00–22:00 / 10 דקות / א׳ ב׳ ג׳ ה׳ — אלה רק נתוני הדוגמה שבתמונה." Every
 * value below is read off the campaign's own row; the image's numbers appear
 * nowhere in this file.
 */
export function CampaignScheduleBoard({
  schedule,
  onToggle,
  onEdit,
  readout,
  campaignName,
  disabled = false,
  editing = false,
}: {
  schedule: CampaignSchedule;
  /** The one control here that writes: the switch in the header. */
  onToggle: (enabled: boolean) => void;
  /** Opens the editor — the three boxes and "ערוך מועד" share it. */
  onEdit: () => void;
  /**
   * WHAT THIS CARD MAY SAY ABOUT TIME, decided by scheduleReadout() and only
   * drawn here.
   *
   * "למה זה מראה לי שסבב פרסום מתחיל ב-22:00? מה זה כל הבאגים האלה של
   *  התזמונים!"
   *
   * It used to be six props — a queued instant, two window edges, a no-day
   * flag, the run's state, a count — and this component recombined them into a
   * sentence. Every one of them was individually correct on the screen he sent;
   * what was wrong was the combination, and nothing owned the combination. Now
   * one value arrives already decided, the strip below is a switch over its
   * seven shapes, and the rule it enforces — name an instant only when
   * something will happen at it — lives in a module that can be unit-tested
   * without a browser, and is shared with the campaigns list so the two cards
   * cannot disagree about the same campaign.
   */
  readout: ScheduleReadout;
  /** For the accessible names — the dashboard draws one of these, lists draw many. */
  campaignName: string;
  disabled?: boolean;
  /** Whether the editor below is open, for the boxes' aria-expanded. */
  editing?: boolean;
}) {
  return (
    <div data-schedule-board className="mt-3">
      {/* ─── the lavender block: header, then the three readouts ────────── */}
      {/* `@container` ON THE BLOCK, so the row below asks about the width it
          actually has rather than the phone's. A container query measures this
          element's CONTENT box, which after `p-2.5` is exactly the space the
          three boxes are laid out in — the one number the breakpoint is about.
          The card is also drawn at half width in the desktop grid, where the
          viewport says 1280 and the boxes have 300. */}
      <div className="@container rounded-2xl bg-brand-300/10 p-2.5">
        {/*
          HEADER. Calendar and title at the start — the card's RIGHT on this
          RTL page — and the word with its switch at the other end, which is
          exactly the image's arrangement. `ms-auto` rather than an order
          class, so a future LTR locale flips it without this file knowing.
        */}
        <div className="flex items-center gap-1.5">
          <CalendarIcon aria-hidden className="h-4 w-4 shrink-0 text-brand-400" />
          <span className="text-[13px] font-extrabold leading-4 text-brand-400">תזמון פרסום</span>
          {/* `-my-1.5` takes the switch's 44px TOUCH target out of the row's
              height without shrinking it: the track it paints is 28px and
              centred, so the 6px it overhangs top and bottom falls in the
              block's own padding and touches nothing. The header is then the
              32px the reference draws, and the control is still 44. */}
          <span className="ms-auto -me-1 -my-1.5 flex items-center gap-1.5">
            {/* "פעיל" / "כבוי" — the reference prints the word beside the
                switch, and it is not decoration: a switch on its own is read
                by colour alone, and this card is the one the owner glances at
                rather than studies. */}
            <span className={`text-[12px] font-bold leading-4 ${schedule.enabled ? 'text-mist-100' : 'text-mist-300'}`}>
              {schedule.enabled ? 'פעיל' : 'כבוי'}
            </span>
            <Toggle checked={schedule.enabled} onChange={onToggle} label={`תזמון פרסום ל${campaignName}`} />
          </span>
        </div>

        {/*
          THREE BOXES, IN THE REFERENCE'S OWN ORDER AND PROPORTIONS: days,
          then the gap, then the window — right to left. The widths are the
          image's (roughly 1.35 : 1 : 1.12), because the days box carries seven
          chips and the other two carry one line each; equal thirds squeezed
          the chips and left white space in the other two.

          EACH BOX IS THE CONTROL. Tapping any of them opens the same editor
          "ערוך מועד" opens — the reading and the editing of one value are the
          same gesture, and a readout the owner taps and nothing happens is
          the thing he would report as broken.
        */}
        {/*
          THE WIDTHS ARE THE CONTENT'S, not a guess at the image's. Seven chips
          need seven chips' worth; "08:00 – 22:00" is thirteen tabular figures
          and a dash and must not arrive as "08:00 – 2…", which is a window
          nobody can read; "הפרש בין פוסטים" is the widest of the three labels.
          Measured at 360, 390 and 430 by worker/test/dashboard-hero.test.ts,
          which fails on a single clipped character in any of them.
        */}
        <div className="mt-1.5 grid grid-cols-2 gap-1 [&>*]:min-w-0 @[300px]:grid-cols-[1.51fr_1fr_1.19fr]">
          <Box
            label="ימי פרסום"
            aria={`ימי פרסום: ${daysLabel(schedule)}. פתיחת עריכת התזמון של ${campaignName}`}
            onClick={onEdit}
            disabled={disabled}
            editing={editing}
            /*
             * UNDER 300px OF ROW THE THREE DO NOT FIT, and the honest answer is
             * not to shrink them until they do.
             *
             * Measured: seven chips need 119px before "ש׳" starts losing its
             * geresh, "הפרש בין פוסטים" needs 79 and "08:00 – 22:00" needs 94
             * — 300 with the gaps. A 360px Android leaves 280, so at that width
             * the days take a row of their own and the other two share the next
             * one. Nothing is hidden, nothing is clipped, and no label is
             * abbreviated: the reference's single row is what 390 and 430 — the
             * owner's own phone — both get.
             */
            className="col-span-2 @[300px]:col-span-1"
          >
            {/*
              SEVEN, ALWAYS, IN WEEK ORDER — a grid and not a flex row, so they
              narrow together instead of wrapping ש׳ onto a line of its own at
              some width nobody measured.

              aria-hidden because the button above already says the days in
              words: a screen reader meeting "א׳ ב׳ ג׳…" reads seven letters
              and has no way to hear which of them are lit.
            */}
            <span aria-hidden className="grid w-full grid-cols-7 gap-[2px] [&>*]:min-w-0">
              {DAY_LABELS.map((label, day) => (
                <span
                  key={day}
                  title={DAY_NAMES[day]}
                  data-must-fit
                  className={`flex h-5 min-w-0 items-center justify-center rounded-md text-[10px] font-extrabold ${
                    schedule.days.includes(day)
                      ? /* The selected chip the editor and the discovery screen
                           both draw: brand-600 → brand-500, whose lightest end
                           still measures 5.70 behind white. `.grad-primary`
                           runs out to #a855f7 at 3.96 and would fail on a chip
                           this small, where the label covers the whole ramp. */
                        'bg-gradient-to-l from-brand-600 to-brand-500 text-on-brand'
                      : /* An unselected chip is white on a white box — 1.0:1 —
                           so the edge is the only thing that makes it a chip.
                           ink-600 is the control-edge token at 3.10, over the
                           3:1 WCAG 1.4.11 asks of a UI boundary. */
                        'border border-ink-600 bg-ink-900 text-mist-300'
                  }`}
                >
                  {label}
                </span>
              ))}
            </span>
          </Box>

          <Box
            label="הפרש בין פוסטים"
            aria={`הפרש בין פוסטים: ${gapLabel(schedule)}. פתיחת עריכת התזמון של ${campaignName}`}
            onClick={onEdit}
            disabled={disabled}
            editing={editing}
          >
            <span className="flex w-full min-w-0 items-center justify-center gap-[3px]">
              <RepeatIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-400" />
              <span data-must-fit className="min-w-0 truncate text-[11px] font-extrabold leading-4 text-mist-100">{gapLabel(schedule)}</span>
            </span>
          </Box>

          <Box
            label="שעות פרסום"
            aria={`שעות פרסום: ${schedule.start} עד ${schedule.end}. פתיחת עריכת התזמון של ${campaignName}`}
            onClick={onEdit}
            disabled={disabled}
            editing={editing}
          >
            <span className="flex w-full min-w-0 items-center justify-center gap-[3px]">
              <ClockIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-400" />
              {/*
                ITS OWN LTR ISLAND. "08:00 – 22:00" is two European number runs
                around a neutral dash: inside an RTL line the bidi algorithm
                renders it "22:00 – 08:00", end time first. `dir="auto"` does
                not fix it — the string has no strong character, so auto falls
                back to the RTL that caused it. "מספרים ושעות חייבים להופיע
                 נכון... ולא להתהפך בגלל RTL."
              */}
              <span data-must-fit dir="ltr" className="min-w-0 truncate text-[11px] font-extrabold leading-4 tabular-nums text-mist-100">
                {schedule.start} – {schedule.end}
              </span>
            </span>
          </Box>
        </div>
      </div>

      {/* ─── "הפרסום הבא יתחיל ב:" — its own container, as the image draws it ── */}
      <NextPublishStrip readout={readout} scheduleOn={schedule.enabled} />
    </div>
  );
}

/**
 * One readout: a value over its label, inside a box that is itself the button.
 *
 * `min-h-11` is the product's 44px control floor and it is what lets the chips
 * inside be 22px — the reference's size — without a sub-40px tap target
 * existing anywhere on the card.
 */
function Box({
  label,
  aria,
  onClick,
  disabled,
  editing,
  className = '',
  children,
}: {
  label: string;
  aria: string;
  onClick: () => void;
  disabled?: boolean;
  editing?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      aria-expanded={editing}
      /* ink-600, NOT the decorative hairline. A white box on a lavender tint
         is 1.13:1 — no edge at all — and ink-700 over that tint measures 1.12,
         which is the same as having drawn nothing. ink-600 is the control-edge
         token and comes to 3.10 here, over the 3:1 WCAG 1.4.11 asks of a UI
         boundary. The reference draws a visible, quiet edge; this is it. */
      className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-ink-600 bg-ink-900 px-1 py-1 text-center transition-colors hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
      {/* mist-300 and not the fine-print token: every label here sits on a
          white box inside a lavender block, and mist-500 measures under the
          4.5:1 that 10px text asks for. Same step-up the editor took. */}
      {/* dir="auto" because layout.test.ts asks it of every clamped expression
          holding something called a label, and it is right to: it cannot tell
          this one from a group's name. All three are Hebrew constants written
          in this file, so "auto" resolves to the RTL they already had. */}
      <span data-must-fit dir="auto" className="w-full truncate text-[9px] font-bold leading-3 text-mist-300">{label}</span>
    </button>
  );
}

/**
 * The strip under the block: when the next publication actually lands.
 *
 * "⚠️ זה חלק חשוב מאוד... בצד ימין 'הפרסום הבא יתחיל ב:', במרכז ובולט מאוד
 *  08:10, בצד שמאל 01.10.2026 ומתחת מחר (חמישי)."
 *
 * THE INSTANT IS THE ENGINE'S, NOT A GUESS. The card hands it over already
 * resolved by nextPublishAt() — gap first, then the window, then the next
 * chosen day — which is the same call rules.ts makes before it releases a row.
 * So "אם עכשיו 21:55 וה-Interval 10 דקות ושעת הסיום 22:00" does not print
 * 22:05: nextAllowedAt() walks to the next chosen day and returns its start.
 *
 * AND WHEN THERE IS NO INSTANT IT SAYS SO, in the words the brief gives for
 * it, rather than printing the last one it knew: "אל תציג זמן שגוי או זמן
 *  ישן." Three different nothings, because they need three different answers —
 * no day chosen (a setting), nothing queued (a finished round), and a round
 * that is simply waiting.
 */
function NextPublishStrip({ readout, scheduleOn }: { readout: ScheduleReadout; scheduleOn: boolean }) {
  /*
   * A WINDOW IS NOT AN EVENT, AND THE RUN DECIDES WHICH OF THE TWO THIS IS.
   *
   * "למה זה מראה לי שסבב פרסום מתחיל ב-22:00? מה זה כל הבאגים האלה של
   *  התזמונים!"
   *
   * Because every instant this strip had to offer came out of the SCHEDULE,
   * and a schedule does not know whether anything is left to publish. His
   * round had finished — 219 of 219 handled — so there was no publication to
   * constrain and no instant at which anything would happen; the strip printed
   * the window's closing time anyway, in the place where a publication time
   * goes, and he read it the only way it can be read.
   *
   * THE RULE THIS NOW FOLLOWS, and the one the last three fixes to this strip
   * were each half of: print a time only when something will happen at it.
   * Everything below is that rule applied to the states a campaign can be in,
   * in the order the states outrank each other:
   *
   *   a publication is queued      → when it goes out          (an event)
   *   no day chosen                → the setting that holds it
   *   THE ROUND IS OVER            → it is over, and nothing is coming
   *   rows waiting for a person    → they are waiting for HIM, not the clock
   *   nothing queued, window open  → until when it may, if he starts one
   *   nothing queued, window shut  → when it next may
   *   nothing at all               → "לא מתוזמן"
   *
   * THIS LIST HAS GROWN THREE TIMES AND ALWAYS THE SAME WAY: a state that was
   * being served by a neighbour's words. "אין פרסום ממתין" was added when a
   * finished round borrowed the sentence a queued one uses; "פתוח עד" when an
   * already-open window was announced as the next one; and these two now,
   * because a window was being offered as an answer in states where no answer
   * about time exists. Each was a true number under a false sentence, which is
   * the only way this strip has ever failed.
   */
  /*
   * ONE VALUE, SEVEN SHAPES, AND NO ARITHMETIC LEFT IN THIS FILE.
   *
   * The contradictions this strip kept producing — a window edge in the place a
   * publication time goes, and nearly "הסבב הסתיים" over a publication time —
   * were the same kind of fault twice: two expressions reading different halves
   * of the state and agreeing only by luck. A discriminated union cannot do
   * that. The label, the figure and the note below are three views of ONE
   * decision, and a state that has no instant has no way to produce one.
   */
  const over = readout.kind === 'ended';
  const manual = readout.kind === 'manual';
  const paused = readout.kind === 'paused';
  const partial = readout.kind === 'partial';
  const noDay = readout.kind === 'no-day';
  const openNow = readout.kind === 'window-open';
  const isWindow = openNow || readout.kind === 'window-next';
  const shown =
    readout.kind === 'due'
      ? readout.at
      : readout.kind === 'window-open'
        ? readout.until
        : readout.kind === 'window-next'
          ? readout.opens
          : null;
  return (
    <div
      /*
       * STILL A LAVENDER CONTAINER WHEN SOMETHING IS WRONG, one shade lighter.
       *
       * Two measured facts decide this line. The warning state cannot keep the
       * 20% tint: this theme's warning-400 is a dark amber (#b54708) and over
       * brand-300 at 20% it measures 4.21:1, under the 4.5 AA asks of 12px
       * text. And it cannot drop to white either, which is what it did for one
       * commit — white IS the card, so the container the reference draws
       * vanished exactly on the card that had something to say. At 10% the
       * same amber is 4.80 and the block is still a block.
       */
      className={`mt-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl px-3 py-2 ${
        noDay ? 'bg-brand-300/10' : 'bg-brand-300/20'
      }`}
    >
      <span data-must-fit className={`whitespace-nowrap text-[12px] font-bold leading-4 ${noDay ? 'text-warning-400' : 'text-brand-400'}`}>
        {over ? (
          /*
           * THE ROUND IS OVER, AND THAT IS THE WHOLE ANSWER. No time, because
           * there is no instant: a finished round does not restart itself, and
           * the words say so where the clock used to be.
           *
           * BOTH LINES HERE RATHER THAN ONE EACH SIDE OF THE MIDDLE COLUMN.
           * Measured: at 360px "אין פרסום מתוזמן" in the centre, squeezed
           * between this label and the note at the end, clipped to "אין פרסום
           * מתוז…" — and a sentence about nothing happening, cut off, is
           * exactly the kind of half-read line this card keeps being fixed
           * for. Stacked, they are one statement in one column and the centre
           * is free to be what it honestly is: empty.
           */
          <>
            <span className="block">{readout.kind === 'ended' && readout.stopped ? 'הסבב הופסק' : 'הסבב הסתיים'}</span>
            <span className="block text-mist-300">אין פרסום מתוזמן</span>
          </>
        ) : paused ? (
          /* The owner's own pause. rules.ts hands every row of a paused round
             straight back, so there is no instant — the stored one would be a
             countdown to a moment that arrives and passes untouched. */
          'הסבב מושהה'
        ) : partial ? (
          'הסבב גדול מדי לספירה'
        ) : manual ? (
          'ממתין לטיפול ידני'
        ) : isWindow ? (
          /* TWO LINES, AND BOTH OF THEM MATTER. The first is why there is no
             publication to name; the second is what the figure beside it IS.
             Dropping either one is how this strip would start lying: without
             the first it promises a publication, without the second it leaves
             a bare time with nothing saying what happens at it. */
          <>
            <span className="block text-mist-300">אין פרסום ממתין</span>
            {/* "הבא" vs "פתוח עד" is the whole of the 4.0.1 fix, and it is in
                the words rather than the layout: the figure beside it is a
                window edge either way, and which edge it is is the only thing
                that tells him whether he is waiting or has time left. */}
            <span className="block">{openNow ? 'חלון הפרסום פתוח עד:' : 'חלון הפרסום הבא:'}</span>
          </>
        ) : (
          'הפרסום הבא יתחיל ב:'
        )}
      </span>

      <span className="min-w-0 text-center">
        {noDay ? (
          /* The switch is on and no day is lit, so the queue is held — by
             design (rules.ts defers, it never drops) and indefinitely. The
             strip says the cause, because the fix is two taps above it. */
          <span data-must-fit className="block truncate text-[12px] font-extrabold leading-5 text-warning-400">לא נבחר יום פרסום</span>
        ) : over ? (
          /*
           * EMPTY, AND THAT IS THE ANSWER TO HIS QUESTION.
           *
           * "הקמפיין פעיל, אמור לצאת כל יום" — it is not. The schedule is a
           * WINDOW on a round that is running, not a recurrence: when a round
           * ends nothing publishes again until he opens the next one, and no
           * amount of "פעיל" on the switch above changes that. This column is
           * where the 22:00 was, and the only honest thing to put in it is
           * nothing. The words are in the label beside it.
           */
          null
        ) : paused ? (
          <span data-must-fit className="block truncate text-[12px] font-extrabold leading-5 text-warning-400">אין פרסום עד שתמשיכו</span>
        ) : partial ? (
          /* A capped read drops the furthest-out rows, so every count here
             errs towards "finished". Saying so is the only honest answer. */
          <span data-must-fit className="block truncate text-[12px] font-extrabold leading-5 text-mist-300">לא ניתן לחשב כאן</span>
        ) : manual ? (
          <span data-must-fit className="block truncate text-[12px] font-extrabold leading-5 text-warning-400">
            {readout.kind === 'manual' && counted(readout.waiting, 'פרסום אחד ממתין לך', 'פרסומים ממתינים לך', 'שני פרסומים ממתינים לך')}
          </span>
        ) : shown ? (
          <span data-must-fit dir="ltr" className="block truncate text-[22px] font-extrabold leading-7 tabular-nums text-brand-400">
            {formatTimeHe(shown)}
          </span>
        ) : (
          <span data-must-fit className="block truncate text-[12px] font-extrabold leading-5 text-mist-300">לא מתוזמן</span>
        )}
      </span>

      {/* The date, and under it the day in the words the owner reads his own
          week in. Empty when there is no instant — a date with no time beside
          it would be the screen filling a gap with something. */}
      <span className="text-end">
        {over && (
          /*
           * AND WHAT THE SETTING ABOVE ACTUALLY DOES NOW — the other half of
           * his misunderstanding. The three boxes still read "א׳ ב׳ ג׳ ד׳ ה׳ ·
           * 08:00 – 22:00 · כל דקה" over a finished round, and with no line
           * like this one they read as a promise about today. They are the
           * terms the NEXT round will run under, which is a true and useful
           * thing to say, and the button that starts it is directly below.
           */
          <span
            data-must-fit
            className={`block text-[10px] font-bold leading-[13px] ${
              readout.kind === 'ended' && readout.repeats ? 'text-warning-400' : 'text-mist-300'
            }`}
          >
            {readout.kind === 'ended' && readout.repeats
              ? /* CHZARA IS ON, so another round IS coming — and it says so in
                   the amber it is set in everywhere else, because a round that
                   re-publishes the same post to the same groups on its own is
                   the one state on this card worth noticing from across a
                   room. */
                'חזרה יומית פעילה — הסבב הבא ייפתח לבד'
              : scheduleOn
                ? 'התזמון יחול על הסבב הבא'
                : 'התזמון כבוי'}
          </span>
        )}
        {shown && (
          <>
            <span data-must-fit dir="ltr" className="block text-[12px] font-extrabold leading-4 tabular-nums text-brand-400">
              {formatDateHe(shown)}
            </span>
            <span data-must-fit className="block text-[10px] font-bold leading-[13px] text-mist-300">{dayRelativeHe(new Date(shown))}</span>
          </>
        )}
      </span>
    </div>
  );
}
