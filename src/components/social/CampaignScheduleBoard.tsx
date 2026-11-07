'use client';

import { CalendarIcon, ClockIcon, RepeatIcon } from '@/components/icons';
import { NextPublication } from './NextPublication';
import { type ScheduleReadout } from '@/lib/social/schedule-readout';
import {
  DAY_LABELS,
  DAY_NAMES,
  daysLabel,
  gapLabel,
  shownSchedule,
  type CampaignSchedule,
} from '@/lib/social/campaign-schedule';

/*
 * THE SECONDS AND THE SHRINKING FIGURE MOVED WITH THE STRIP.
 *
 * `instantSize` used to live here: at a sub-minute gap the stamp is 10:00:30,
 * and 22px tabular digits do not fit eight characters at 360px — measured by
 * worker/test/dashboard-hero.test.ts rather than guessed. The next
 * publication is drawn by <NextPublication> now, on both screens, and its
 * sentence sets the instant at a size that holds the seconds at every width,
 * so there is nothing left here to scale.
 */

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
  onEdit,
  readout,
  campaignName,
  workerOnline,
  frozenUntil = null,
  neverLaunched = false,
  armedAt = null,
  pauseLabel = null,
  disabled = false,
  editing = false,
  children,
}: {
  schedule: CampaignSchedule;
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
  /**
   * Whether the PC that publishes has sent a heartbeat — passed straight
   * through to <NextPublication>, which draws the connection caveat under the
   * instant rather than instead of it. Undefined means not known and draws
   * nothing.
   */
  workerOnline?: boolean;
  /** Publishing is frozen until this instant — passed through to
      <NextPublication>, which draws the countdown. Null means it is not. */
  frozenUntil?: string | null;
  /** The round has never gone out — passed through to <NextPublication>. */
  neverLaunched?: boolean;
  /**
   * A LAUNCH WHOSE ROWS HAVE NOT ARRIVED YET — passed straight through.
   *
   * campaign.ts's launchPending() decides it; this file only carries it, so
   * the three conditions behind it (armed, empty, recent) cannot drift into
   * a component's own idea of them.
   */
  armedAt?: string | null;
  /**
   * THE LABEL OF THE CONTROL THAT ACTUALLY STOPS THE PUBLISHING, when the
   * card is drawing one — "השהה סבב" on the dashboard, null when the round
   * has nothing left to hold back and the row omits the button.
   *
   * "בעיה חמורה מאד יש קמפיין שמכובה והוא מוציא פרסומים שלו." The sentence
   * under the switch has to say where the real stop is, and an instruction
   * naming a button that is not on the screen is an instruction he has to
   * translate — so the card that draws the button is the card that names it,
   * and when there is none the sentence simply stops after the facts.
   */
  pauseLabel?: string | null;
  disabled?: boolean;
  /** Whether the editor below is open, for the boxes' aria-expanded. */
  editing?: boolean;
  /** The settings this card's switch governs — see the slot below. */
  children?: React.ReactNode;
}) {
  /*
   * WHAT IS DRAWN IS WHAT THE ENGINE WILL DO, and for a campaign with the
   * stored flag down those are not the same thing: its row still holds the
   * days and the hour it had when the flag went down, and the engine reads
   * neither. This card used to draw them anyway, under a switch — which is
   * how "א׳–ה׳, 11:05" came to sit above a round publishing on Saturday at
   * three in the morning. shownSchedule() resolves the row into the schedule
   * the engine is actually running. Nothing is written; see its comment.
   */
  const shown = shownSchedule(schedule);
  return (
    /* mt-3 → mt-1.5 and p-2.5 → p-2 inside, both from the compaction brief:
       "יש לצמצם את הגובה הכולל של אזור הקמפיין והגדרות התזמון בכ־30%–40%".
       Padding and gaps only — no row of this block was removed. */
    <div data-schedule-board className="mt-1.5">
      {/* ─── the lavender block: header, then the three readouts ────────── */}
      {/* `@container` ON THE BLOCK, so the row below asks about the width it
          actually has rather than the phone's. A container query measures this
          element's CONTENT box, which after `p-2.5` is exactly the space the
          three boxes are laid out in — the one number the breakpoint is about.
          The card is also drawn at half width in the desktop grid, where the
          viewport says 1280 and the boxes have 300. */}
      <div className="@container rounded-2xl bg-brand-300/10 p-2">
        {/*
          HEADER. Calendar and title at the start — the card's RIGHT on this
          RTL page — and the word with its switch at the other end, which is
          exactly the image's arrangement. `ms-auto` rather than an order
          class, so a future LTR locale flips it without this file knowing.
        */}
        <div className="flex items-center gap-1.5">
          <CalendarIcon aria-hidden className="h-4 w-4 shrink-0 text-brand-400" />
          <span className="text-[13px] font-extrabold leading-4 text-brand-400">תזמון פרסום</span>
          {/*
            THE SWITCH IS GONE, AND SO IS THE WORD BESIDE IT.

            "הכפתור של התזמון פרסום מבלבל למה צריך אותו." It was needed by the
            database, not by the person: the flag it wrote decides whether the
            days and the hour below are enforced, which is a thing no label
            ever managed to say. It was called "כבוי" and read as "this
            campaign is stopped" over a round that had published nineteen
            times that morning; renaming it "ללא הגבלה" and folding two
            paragraphs of explanation under it left three separate elements on
            one card all saying the same sentence.

            So the days say it themselves now: every day lit with the hour at
            midnight IS "no limit", and that is what the row below draws for a
            campaign whose stored flag is down. See shownSchedule().
          */}
          <span data-must-fit className="ms-auto shrink-0 text-[11px] font-bold leading-4 text-mist-300">
            {daysLabel(shown)}
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
        {/*
          ─── AND NOT WHILE THE EDITOR IS OPEN ──────────────────────────────
          *
          *   "וכאן למה יש פעמיים גם תזמון פרסום וגם למטה ימים אם שעות ???
          *    זה מיותר נראה לי"
          *
          * He was looking at his own card with "ערוך מועד" pressed, and the
          * same three fields were drawn twice: once here as the readout, and
          * again below as the editor. They are genuinely different things —
          * these are buttons that OPEN the editor, those are the controls —
          * but nothing on screen says so, because both are three rounded
          * boxes with the same labels, the same icons and the same values.
          *
          * So while the editor is open the readout stands down. The switch
          * and "ערוך מועד" stay exactly where they are, because they are the
          * way back; only the duplicated trio goes. Close the editor and the
          * readout returns.
          *
          * "אין להציג פעמיים הגדרות ימי פרסום או שעות."
          */}
        {!editing && (
        <div className="mt-1.5 grid grid-cols-2 gap-1 [&>*]:min-w-0 @[300px]:grid-cols-[1.6fr_1.1fr_1fr]">
          <Box
            label="ימי פרסום"
            aria={`ימי פרסום: ${daysLabel(shown)}. פתיחת עריכת התזמון של ${campaignName}`}
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
                    shown.days.includes(day)
                      ? /* The selected chip the editor and the discovery screen
                           both draw: brand-600 → brand-500, whose lightest end
                           measures 6.24 behind white.

                           IT IS STILL NOT `.grad-primary`, and the reason
                           changed with the theme. Under purple that gradient
                           ran out to #a855f7 at 3.96 and would have failed on
                           a chip this small; the blue theme's own light end
                           (#2563eb) measures 5.17, which passes. The pair is
                           kept because it is the chip's own ramp on two
                           screens and a chip that quietly becomes the primary
                           ACTION's gradient is a chip that will drift again
                           the next time that gradient is tuned for a button. */
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
            /* "הפרש בין פרסומים", the words the second reference image uses
               and the words the editor under this block uses. They were
               "פוסטים" here and "פוסט לפוסט" there, for one setting. */
            label="הפרש בין פרסומים"
            aria={`הפרש בין פרסומים: ${gapLabel(shown)}. פתיחת עריכת התזמון של ${campaignName}`}
            onClick={onEdit}
            disabled={disabled}
            editing={editing}
          >
            <span className="flex w-full min-w-0 items-center justify-center gap-[3px]">
              <RepeatIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-400" />
              <span data-must-fit className="min-w-0 truncate text-[11px] font-extrabold leading-4 text-mist-100">{gapLabel(shown)}</span>
            </span>
          </Box>

          <Box
            label="שעת התחלה"
            aria={`שעת התחלה: ${shown.start}. פתיחת עריכת התזמון של ${campaignName}`}
            onClick={onEdit}
            disabled={disabled}
            editing={editing}
          >
            <span className="flex w-full min-w-0 items-center justify-center gap-[3px]">
              <ClockIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-400" />
              {/*
                ITS OWN LTR ISLAND. "09:00" is a European number run around a
                neutral colon, and `dir="auto"` cannot help it — the string has
                no strong character, so auto falls back to the RTL that caused
                the problem. "מספרים ושעות חייבים להופיע נכון... ולא להתהפך
                 בגלל RTL."

                ONE HOUR, NOT TWO. It read "08:00 – 22:00" until the closing
                hour was removed from the product: "יש להסיר לחלוטין את אפשרות
                שעת הסיום מממשק הכרטיס." A chosen day now runs from this hour
                to midnight.
              */}
              <span data-must-fit dir="ltr" className="min-w-0 truncate text-[11px] font-extrabold leading-4 tabular-nums text-mist-100">
                {shown.start}
              </span>
            </span>
          </Box>
        </div>
        )}

        {/*
          ─── THE EDITOR BELONGS INSIDE THIS CARD, NOT AFTER THE BUTTONS ────
          *
          * "כרטיס תזמון — לרכז בכרטיס אחד: הפעלה וכיבוי קמפיין, ימי פרסום,
          *  שעת התחלה, הפרש בין פרסומים, חזרה יומית, מספר סבבים ביום."
          *
          * Those six were split across the card: the title and the switch
          * here, the four controls in a panel rendered AFTER the action row,
          * with "פתח סבב" and "השהה סבב" sitting between the switch and the
          * settings it governs. One subject, two blocks, a row of unrelated
          * buttons in the middle.
          *
          * A SLOT RATHER THAN AN IMPORT. This component must not know what a
          * schedule panel is — the campaigns screen draws the same panel with
          * no board around it, and a board that reached for the panel itself
          * would make one of those two the special case.
        */}
        {children}
      </div>

      {/*
        ─── "הפרסום הבא" — THE SHARED BLOCK, not this file's own any more ───

        "בעבר היו פערים בין השעות שהוצגו בכרטיס הקמפיין לבין השעות שהופיעו
         במסך ממתינים. אסור שהתקלה הזאת תחזור."

        This file used to carry its own three-column strip and the campaigns
        list carried a two-line version of the same thing. The INSTANT was
        already shared — both read a ScheduleReadout — but the words around it
        were not, so a state added to one of them reached the other only when
        somebody remembered. They are one component now, and the live
        countdown the brief asks for ("ומתחתיו: בעוד 8 שעות ו־2 דקות") arrived
        on both screens at once because of it.
      */}
      <NextPublication
        readout={readout}
        scheduleOn={schedule.enabled}
        workerOnline={workerOnline}
        neverLaunched={neverLaunched}
        armedAt={armedAt}
        /* Straight through to the line that answers "when does the next one
           go out" — see the prop's own note. */
        frozenUntil={frozenUntil}
        className="mt-1"
      />
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
