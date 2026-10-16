'use client';

import { useEffect, useState } from 'react';
import { AlertCircleIcon, CalendarIcon, ClockIcon } from '@/components/icons';
import { countdownTo, longWaitHe } from '@/lib/social/countdown';
import { dayRelativeHe } from '@/lib/social/campaign-schedule';
import { type ScheduleReadout } from '@/lib/social/schedule-readout';
import { counted, formatDayMonthHe, formatInstantHe, relativeHe } from '@/lib/social/time';
import { TargetAvatar } from './TargetAvatar';

/**
 * "הפרסום הבא" — the day, the date, the hour and a live countdown, in ONE
 * component that every screen draws.
 *
 * "יש להוסיף לכרטיס אזור ברור ומעוצב המציג את היום, התאריך והשעה של הפרסום
 *  הבא שאמור לצאת בפועל... הנתון חייב להגיע מתור הפרסומים האמיתי של הקמפיין.
 *  אין להציג שעה משוערת שמחושבת רק מההגדרות אם קיימת רשומת תור עם מועד אחר."
 *
 * WHY THIS IS A FILE AND NOT A BLOCK INSIDE A CARD. The owner's own words for
 * what this has to end: "בעבר היו פערים בין השעות שהוצגו בכרטיס הקמפיין לבין
 * השעות שהופיעו במסך ממתינים. אסור שהתקלה הזאת תחזור." The dashboard's run
 * card and the campaigns list each used to carry their own version of this
 * strip; they were written months apart, and every fix to one of them had to
 * be noticed and copied to the other. Both now render THIS, so there is no
 * second copy to drift — and the instant inside it was already shared, because
 * it arrives already decided as a ScheduleReadout from schedule-readout.ts,
 * which composes the same four publish gates rules.ts applies before it lets
 * a row go out (projectOne in ./projection).
 *
 * SO THIS FILE COMPUTES NO TIME AT ALL. It decides nothing about when a
 * campaign publishes; it renders one value and counts down to it. The only
 * arithmetic here is `now - at`, which is what a countdown is.
 *
 * AND IT NAMES AN INSTANT ONLY WHEN SOMETHING WILL HAPPEN AT IT. That is the
 * rule schedule-readout.ts exists to enforce and the one this product has
 * broken most often: a paused round's stored stamp, a finished round's window
 * edge, a held row's arithmetic instant — each a real number printed where an
 * answer goes. Every branch below that has no instant says what it has
 * instead, in words.
 */
export function NextPublication({
  readout,
  workerOnline,
  scheduleOn = false,
  neverLaunched = false,
  targetName = null,
  targetImage = null,
  className = '',
}: {
  readout: ScheduleReadout;
  /**
   * Whether the campaign's own window is switched on.
   *
   * Read by exactly one branch: a round that has ENDED with the switch on has
   * a schedule that describes the NEXT round rather than this one, and saying
   * so is the other half of the owner's longest-running misunderstanding —
   * "הקמפיין פעיל, אמור לצאת כל יום" over a round that finished days ago. The
   * boxes above still read א׳ ב׳ ג׳ ד׳ ה׳ · משעה 08:00 · כל דקה, and with no
   * line like this they read as a promise about today.
   */
  scheduleOn?: boolean;
  /**
   * THE ROUND HAS NEVER GONE OUT, and nothing on the schedule can change that.
   *
   * "אין פרסומים מתוזמנים" is true here and reads as a lull — something that
   * will pass. Nothing will pass it: a campaign has no group list of its own,
   * so neither the window nor the daily repeat can produce a publication until
   * the round is launched once. The owner spent an evening waiting on exactly
   * this state. It outranks every other wordless branch below, because it is
   * the only one that names the action that ends it.
   */
  neverLaunched?: boolean;
  /**
   * WHICH GROUP IS NEXT, when the caller knows.
   *
   * Not part of the readout, because it is not part of the decision about
   * WHEN — it is the row's own target, which campaignStates() reads alongside
   * it. It is here because it was on the card this block replaced, and a
   * rebuild that quietly drops a fact the owner has been reading for months
   * is a regression wearing a redesign's clothes.
   */
  targetName?: string | null;
  targetImage?: string | null;
  /**
   * Whether the PC that does the publishing has sent a heartbeat.
   *
   * `false` adds the connection caveat UNDER the instant rather than replacing
   * it: "אם המחשב מנותק, יש להציג אזהרת חיבור, בלי להבטיח שהפרסום יצא במועד."
   * The row is still stamped for that minute and will go out when the machine
   * comes back — what is not true any more is that it goes out THEN, and the
   * countdown on its own would say exactly that.
   *
   * `undefined` means not known, which draws nothing: a caller that cannot
   * read the heartbeat must not imply either answer.
   */
  workerOnline?: boolean;
  className?: string;
}) {
  /*
   * ONE SECOND, AND ONLY WHILE THERE IS SOMETHING TO COUNT.
   *
   * "להציג ספירה לאחור שמתעדכנת בזמן אמת, בלי לבצע קריאות מיותרות לשרת."
   * Nothing here fetches. The tick re-renders this component from the instant
   * it was already handed, so a card on screen all day costs one timer and no
   * requests — the page's own 60-second reload is what brings new rows, and it
   * was already there.
   *
   * The timer is not armed at all for the states with no instant, so a list of
   * twenty finished rounds runs no timers. `useEffect` does not run on the
   * server, which is also what keeps the measured fixtures deterministic.
   */
  const at = instantOf(readout);
  /*
   * A SECOND WHILE THE SECONDS ARE ON SCREEN, FIFTEEN WHEN THEY ARE NOT.
   *
   * Over an hour the line reads "בעוד 8 שעות ו-2 דקות" and changes once a
   * minute; under it the line is mm:ss and changes every second. A campaigns
   * list is twenty of these cards, so a flat one-second tick is twenty
   * re-renders a second on a phone for a figure that is not moving. The
   * boundary is recomputed on every render, so a card crossing the hour
   * re-arms itself without anything watching for it.
   */
  const coarse = at !== null && new Date(at).getTime() - Date.now() > 3_600_000;
  const now = useTick(at !== null, coarse ? 15_000 : 1_000);

  const left = at ? countdownTo(at, now) : null;
  const offline = workerOnline === false;

  return (
    <div
      data-next-publication
      /*
       * LAVENDER, AND brand-300 AT 10% RATHER THAN 20%.
       *
       * "העיצוב יהיה סגול בהיר, עם אייקון לוח שנה ושעון, טקסט כהה וקריא."
       * The tint is the one measured decision here: this block is the one that
       * has to be able to turn amber — a held queue, a paused round, a PC that
       * is not connected — and this theme's warning-400 is a dark amber
       * (#b54708) that measures 4.80:1 over brand-300/10 and 4.21 over /20,
       * under the 4.5 AA asks of text this size. The border carries the
       * block's edge instead of a darker fill, which is what the summary strip
       * above it already does.
       */
      className={`rounded-2xl border border-brand-300/35 bg-brand-300/10 px-3 py-2.5 ${className}`}
    >
      <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold leading-4 text-brand-400">
        <CalendarIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
        הפרסום הבא
      </p>

      {at ? (
        <>
          {/*
            THE SENTENCE THE BRIEF ASKS FOR, in its own order: the day, then
            the date, then the hour — "הפרסום הבא: יום ראשון, 18.10 בשעה
            09:00".

            TWO LTR ISLANDS INSIDE ONE RTL LINE. "18.10" and "09:00" are
            European number runs with neutral separators; inside a Hebrew
            paragraph the bidi algorithm reorders them, and `dir="auto"` cannot
            help a run with no strong character — it falls back to the RTL that
            caused it. Same fix the queue list and the summary strip use.
          */}
          <p data-must-fit className="mt-1 text-[14px] font-extrabold leading-5 text-mist-100">
            {dayRelativeHe(new Date(at), new Date(now))}
            {', '}
            <span dir="ltr" className="inline-block tabular-nums">{formatDayMonthHe(at)}</span>
            {' בשעה '}
            <span dir="ltr" className="inline-block tabular-nums">{formatInstantHe(at)}</span>
          </p>

          {/*
            AND THE WAIT UNDER IT. Three readings, because a countdown that
            only knows how to count down says the wrong thing twice a day:

              ahead      "בעוד 8 שעות ו-2 דקות", or mm:ss under the hour
              arrived    "אמור לצאת עכשיו" — the worker's next tick
              long past  "באיחור · לפני שעתיים" — nothing is mid-flight

            The two-minute grace between the last two is OVERDUE_AFTER_SECONDS
            in countdown.ts, and it is there because both workers poll every few
            seconds and rules.ts parks a row for a minute at a time: a row just
            past its slot is ordinary, not a fault.
          */}
          <p className={`mt-0.5 flex items-center gap-1.5 text-[11.5px] font-bold leading-4 ${left?.overdue ? 'text-warning-400' : 'text-mist-300'}`}>
            <ClockIcon aria-hidden className="h-3 w-3 shrink-0" />
            {!left ? null : left.overdue ? (
              <span>באיחור · {relativeHe(at)}</span>
            ) : left.due ? (
              <span>אמור לצאת עכשיו</span>
            ) : (
              <span>
                בעוד{' '}
                {longWaitHe(left) ?? <span dir="ltr" className="inline-block tabular-nums">{left.label}</span>}
              </span>
            )}
          </p>

          {/*
            THE PC, AND ONLY WHEN IT IS KNOWN TO BE OFF.
            It does not replace the instant above — the row is still stamped
            for it — it withdraws the promise that anything happens then.
          */}
          {/* The group it goes to, on its own line so the countdown above
              never has to share a row with a name that can be any length —
              which is what pushed the clock off the edge on the card this
              replaced. */}
          {targetName && (
            <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-semibold leading-4 text-mist-500">
              <TargetAvatar name={targetName} imageUrl={targetImage} size={14} />
              <span dir="auto" className="min-w-0 truncate">{targetName}</span>
            </p>
          )}

          {offline && <Caveat>המחשב לא מחובר — הפרסום לא ייצא עד שהמחשב יחזור</Caveat>}
        </>
      ) : (
        <Words readout={readout} scheduleOn={scheduleOn} neverLaunched={neverLaunched} />
      )}
    </div>
  );
}

/**
 * The instant this readout may print, or null when it has none.
 *
 * ONLY 'due'. Every other kind either has no instant at all or has one that
 * means something else: 'window-open' carries the hour the day closes and
 * 'window-next' the hour it opens, and both of those are facts about a
 * CONSTRAINT rather than about a publication — printing either in the place a
 * publication time goes is the exact fault that put "22:00" on the owner's
 * dashboard over a round that had finished.
 */
function instantOf(readout: ScheduleReadout): string | null {
  return readout.kind === 'due' ? readout.at : null;
}

/** The states with no instant, each saying what it has instead. */
function Words({ readout, scheduleOn, neverLaunched }: { readout: ScheduleReadout; scheduleOn: boolean; neverLaunched: boolean }) {
  /*
   * BEFORE EVERY OTHER WORDLESS STATE, and after none of them: a round that
   * has never been launched reaches here as 'window-open', 'window-next' or
   * 'none' — three branches that would each describe a lull. It does not
   * override 'paused', 'manual' or 'ended', which cannot co-exist with it.
   */
  if (neverLaunched && (readout.kind === 'window-open' || readout.kind === 'window-next' || readout.kind === 'none')) {
    return (
      <>
        <p className="mt-1 text-[14px] font-extrabold leading-5 text-warning-400">הסבב עוד לא הושק</p>
        <p className="mt-0.5 text-[11.5px] font-bold leading-4 text-mist-300">
          הוסיפו פוסט, בחרו קבוצות ושלחו — ומאותו רגע התזמון יעבוד לבד
        </p>
      </>
    );
  }
  if (readout.kind === 'paused') {
    return (
      <>
        <p className="mt-1 text-[14px] font-extrabold leading-5 text-warning-400">מושהה</p>
        {/*
          THE PLANNED MINUTE, LABELLED AS PLANNED. "אם הקמפיין מושהה, יש להציג
          את המועד המתוכנן לצד סטטוס מושהה, בלי להציג אותו כפרסום שעומד
          להתבצע." So it is here, and it has no countdown and no "הפרסום הבא"
          framing: rules.ts hands every row of a paused round straight back on
          every poll, so this minute will arrive and pass with the queue
          untouched until he presses resume.
        */}
        <p className="mt-0.5 text-[11.5px] font-bold leading-4 text-mist-300">
          {readout.at ? (
            <>
              המועד המתוכנן:{' '}
              <span dir="ltr" className="inline-block tabular-nums">{formatDayMonthHe(readout.at)}</span>
              {' '}
              <span dir="ltr" className="inline-block tabular-nums">{formatInstantHe(readout.at)}</span>
              {' — לא ייצא עד שתמשיכו'}
            </>
          ) : (
            'אין פרסום עד שתמשיכו את הסבב'
          )}
        </p>
      </>
    );
  }

  if (readout.kind === 'no-day') {
    return (
      <>
        <p className="mt-1 text-[14px] font-extrabold leading-5 text-warning-400">לא נבחר יום פרסום</p>
        <p className="mt-0.5 text-[11.5px] font-bold leading-4 text-mist-300">
          התור מוחזק — בחרו לפחות יום אחד למעלה והפרסומים יֵצאו
        </p>
      </>
    );
  }

  if (readout.kind === 'manual') {
    /* Publications ARE waiting — on him, not on the clock. "אין פרסומים
       מתוזמנים" over these was the card reporting them as nothing. */
    return (
      <>
        <p className="mt-1 text-[14px] font-extrabold leading-5 text-warning-400">
          {counted(readout.waiting, 'פרסום אחד ממתין לך', 'פרסומים ממתינים לך', 'שני פרסומים ממתינים לך')}
        </p>
        <p className="mt-0.5 text-[11.5px] font-bold leading-4 text-mist-300">הם לא ממתינים לשעה — הם ממתינים לאישור שלכם</p>
      </>
    );
  }

  if (readout.kind === 'ended') {
    return (
      <>
        <p className="mt-1 text-[14px] font-extrabold leading-5 text-mist-100">{readout.stopped ? 'הסבב הופסק' : 'הסבב הסתיים'}</p>
        <p className={`mt-0.5 text-[11.5px] font-bold leading-4 ${readout.repeats ? 'text-warning-400' : 'text-mist-300'}`}>
          {readout.repeats
            ? /* CHZARA IS ON, so another round IS coming — and it says so in
                 the amber it is set in everywhere else, because a round that
                 re-publishes the same post to the same groups on its own is
                 the one state on this card worth noticing from across a
                 room. */
              'חזרה יומית פעילה — הסבב הבא ייפתח לבד'
            : scheduleOn
              ? 'אין פרסומים מתוזמנים — התזמון יחול על הסבב הבא'
              : 'אין פרסומים מתוזמנים'}
        </p>
      </>
    );
  }

  if (readout.kind === 'partial') {
    /*
     * THE READ WAS CAPPED. campaignStates() drops the furthest-out rows first
     * — exactly the ones that have not happened yet — so every count below
     * 'due' leans towards "finished". The honest answer is that there is no
     * answer here, said in one line rather than as a warning about nothing.
     */
    return (
      <>
        {/* ABOUT THE TIME, NOT ABOUT THE COUNT. Both cards that draw this
            block already carry their own sentence about an approximate count;
            a second one here would be the same hedge printed twice on one
            card, which is the noise the owner pointed at. What is missing
            HERE is specifically the next publication's minute. */}
        <p className="mt-1 text-[14px] font-extrabold leading-5 text-mist-100">לא ידוע מתי הפרסום הבא</p>
        <p className="mt-0.5 text-[11.5px] font-bold leading-4 text-mist-300">הרשימה ארוכה מכדי לחשב כאן — פתחו את הסבב כדי לראות</p>
      </>
    );
  }

  /*
   * NOTHING IS QUEUED — 'window-open', 'window-next' and 'none'.
   *
   * "אם אין פרסומים עתידיים, יש להציג 'אין פרסומים מתוזמנים'." One headline
   * for the three, because to the owner they are one fact; what differs is
   * what he can do about it, and that is the line underneath. 'window-next'
   * is the only one of the three that knows a useful hour, and it is the hour
   * the campaign NEXT MAY publish, not an hour anything is booked for.
   */
  return (
    <>
      <p className="mt-1 text-[14px] font-extrabold leading-5 text-mist-100">אין פרסומים מתוזמנים</p>
      <p className="mt-0.5 text-[11.5px] font-bold leading-4 text-mist-300">
        {readout.kind === 'window-next' ? (
          <>
            יום הפרסום הבא:{' '}
            <span dir="ltr" className="inline-block tabular-nums">{formatDayMonthHe(readout.opens)}</span>
            {' בשעה '}
            <span dir="ltr" className="inline-block tabular-nums">{formatInstantHe(readout.opens)}</span>
          </>
        ) : (
          'ברגע שייכנסו פרסומים לתור הם יופיעו כאן'
        )}
      </p>
    </>
  );
}

/** One amber line under the block, on white so the amber is readable. */
function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 rounded-xl bg-ink-900 px-2 py-1.5 text-[10.5px] font-bold leading-4 text-warning-400">
      <AlertCircleIcon aria-hidden className="mt-px h-3 w-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * One second, and only when asked for.
 *
 * The same shape Timeline.tsx uses for the countdown beside every waiting row,
 * so the two clocks on the dashboard cannot drift by a tick. `active` false
 * arms nothing at all: the states with no instant have nothing to count, so a
 * list of twenty finished rounds runs no timers.
 */
function useTick(active: boolean, everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
  return now;
}
