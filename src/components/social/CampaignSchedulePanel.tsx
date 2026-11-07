'use client';

import { useState } from 'react';

import {
  DAY_LABELS,
  DAY_NAMES,
  GAP_CHOICES,
  gapChoiceLabel,
  daysLabel,
  gapLabel,
  scheduleSummary,
  MAX_EXTRA_ROUNDS,
  MIN_REPEAT_HOURS,
  editRoundTime,
  nextFreeRoundStart,
  roundStarts,
  repeatFitFor,
  repeatWindowSentence,
  roundsVsRepeat,
  type CampaignRepeat,
  type CampaignRound,
  type CampaignSchedule,
  fromShown,
  publishesAlways,
  shownSchedule,
} from '@/lib/social/campaign-schedule';
import { roundState, type RoundState } from '@/lib/social/campaign';
import { EMPTY_PROGRESS, type CampaignProgress } from '@/lib/social/types';
import { accountGapLabel } from '@/lib/social/rules';
import { type ScheduleReadout } from '@/lib/social/schedule-readout';
import { CalendarIcon, CheckIcon, ChevronDownIcon, ClockIcon, MoreIcon, PlusIcon, RepeatIcon, TrashIcon } from '@/components/icons';
import { NextPublication } from './NextPublication';
import { InfoDot, Toggle, WorkingNote } from './ui';

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
/** The owner's own six words for what a round is doing. */
const ROUND_LABEL: Record<RoundState, string> = {
  waiting: 'ממתין',
  starting: 'מתחיל',
  publishing: 'מפרסם',
  done: 'הושלם',
  failed: 'נכשל',
  cancelled: 'בוטל',
};

/*
 * THE WORD IS COLOURED; THE PILL IS NOT, and that is a measurement rather
 * than a taste.
 *
 * The first version tinted each pill with 15% of its own colour, and
 * campaign-schedule.test.ts refused it on sight — it bans bg-warning-400/N in
 * this file outright, because amber on an amber tint is 4.18:1. Computing the
 * rest of the set confirmed it was not one unlucky pair. Over the row's own
 * #f5f3ff:
 *
 *   on a 15% tint of itself      on the row
 *   warning  4.00  ✗             warning  4.95  ✓
 *   success  4.20  ✗             success  5.19  ✓
 *   brand    5.41  ✓             brand    6.48  ✓
 *                                mist-300 5.78  ✓
 *
 * So every state keeps its colour and loses its background. A coloured word
 * on the row reads at 4.95 at worst, and the row's own border is what makes
 * it a pill.
 */
const ROUND_TONE: Record<RoundState, string> = {
  waiting: 'text-mist-300',
  starting: 'text-brand-400',
  publishing: 'text-brand-400',
  done: 'text-success-400',
  failed: 'text-warning-400',
  cancelled: 'text-mist-300',
};

/**
 * Round one's own rows PLUS the rows that predate social_queue.round_at.
 * Adding the two is correct and not a fudge: a campaign with one occasion a
 * day has only ever had one round, so every unrecorded row is its.
 */
function mergeProgress(a?: CampaignProgress, b?: CampaignProgress): CampaignProgress {
  const z = a ?? EMPTY_PROGRESS;
  const y = b ?? EMPTY_PROGRESS;
  return {
    total: z.total + y.total,
    published: z.published + y.published,
    failed: z.failed + y.failed,
    skipped: z.skipped + y.skipped,
    scheduled: z.scheduled + y.scheduled,
    running: z.running + y.running,
    manual: z.manual + y.manual,
    finished: z.finished + y.finished,
  };
}

export function CampaignSchedulePanel({
  schedule,
  onChange,
  campaignName,
  disabled = false,
  busy = false,
  repeat,
  onRepeatChange,
  roundProgress,
  accountFloorSeconds,
  onAccountGapChange,
  floorHours = MIN_REPEAT_HOURS,
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
  /**
   * ONE SET OF NUMBERS PER ROUND, keyed by its 'HH:MM' — CampaignState.byRound.
   *
   * Optional, and its absence is drawn as absence: a caller that cannot count
   * per round (the rollup groups by status alone) gets a row with no figures
   * rather than a row saying nought. "0 מתוך 50" and "nobody counted" are
   * different sentences and only one of them is true.
   */
  roundProgress?: Record<string, CampaignProgress>;
  /** Only for the accessible names — four controls per card in a list of them. */
  campaignName: string;
  /** While the campaign's own row is being written by something else. */
  disabled?: boolean;
  /**
   * AND WHY IT IS DISABLED, when the reason is "it is saving right now".
   *
   * "שאני משנה מצב לוחץ על כפתור או משנה שעה במסך קופא (ממתין) … אני רוצה
   *  שיהיה עיגול כחול של טעינה שאנשים יבינו שזה לא באג אלא טעינה."
   *
   * Changing the hour re-times every waiting row of the round — 53 of them on
   * the screen he photographed — and for those seconds every control here was
   * switched off with nothing to say for itself. Separate from `disabled` on
   * purpose: a caller that switches the panel off for any OTHER reason must
   * not claim to be saving.
   */
  busy?: boolean;
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
   * WRITES THE ACCOUNT'S OWN GAP, which is the only gap the engine enforces.
   *
   * "קודם כל שאני משיק קמפיין אני מגדיר מרווח פרסום 30 שניות ומסך ראשי מופיע
   *  לי 10 דק זה לא מסונכרן."
   *
   * He was right, and it was worse than unsynchronised. Three numbers carried
   * the name "מרווח בין פרסומים":
   *
   *   1. the launch sheet's — written to the ACCOUNT settings by
   *      applyGapFloor(), and therefore the real one;
   *   2. this card's — `schedule_gap_seconds` on the campaign row, read only
   *      by plan.ts while the schedule flag is UP, and by nothing at publish
   *      time, so with the flag down it governed nothing at all;
   *   3. the account settings, which is what spacingGate() and rules.ts both
   *      actually compare against.
   *
   * And the write was asymmetric: respaceQueue() calls applyGapFloor with
   * `lowerOnly` when the change comes from a campaign, so his 30 seconds went
   * in at launch and the 10 minutes he set here afterwards were refused
   * silently. The card promised ten minutes over a queue publishing every
   * thirty seconds.
   *
   * The owner's decision: "את המספר האמיתי" — this field shows and writes the
   * account's gap, in both directions, exactly as the launch sheet does. One
   * number, one meaning. The handler is the caller's because it is the caller
   * that owns the write and the reload.
   */
  onAccountGapChange?: (seconds: number) => void;
  /**
   * HOW CLOSE TWO PUBLICATIONS OF ONE POST TO ONE GROUP MAY BE, in hours.
   *
   * The account's setting — "תוסיף אופציה בהגדרות לשחק עם זה" — rather than
   * the constant it used to be. Defaulted to MIN_REPEAT_HOURS so every caller
   * that does not know about the setting draws exactly what it drew before.
   */
  floorHours?: number;
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
  /*
   * ─── THE TWO TRANSLATIONS, AND EVERY READ AND WRITE GOES THROUGH THEM ───
   *
   * The switch that used to sit in this panel's header is gone — "הכפתור של
   * התזמון פרסום מבלבל למה צריך אותו" — and the days decide instead. The
   * stored flag it wrote is NOT gone: four places outside this file read it
   * as a mode, one of them re-stamps a live queue, so it is still written,
   * just never by a control of its own.
   *
   * `shown` is the schedule the engine is actually running, which for a row
   * with the flag down is every day from midnight regardless of the inert
   * days sitting in the column. `fromShown` puts the flag back on the way
   * out. Nothing here writes unless the person changes something.
   */
  const stored = shownSchedule(schedule);
  const set = (patch: Partial<CampaignSchedule>) => onChange(fromShown({ ...stored, ...patch }));
  /*
   * ─── THE HOUR IS HELD WHILE THE FINGER IS STILL ON THE WHEEL ───────────
   *
   * "במסך הראשי שאני בא לשנות את הזמן אני עוד לא מספיק לבחור וזה זורק אותי
   *  מהבחירה ומשנה את השעה איפה שעצרתי אם האצבע."
   *
   * <input type="time"> is CONTROLLED here, and on iOS the wheel fires
   * `change` on every notch it passes. Each one went straight to
   * onScheduleChange, which is a write to Supabase and a round trip — so
   * while the wheel was still moving the `value` prop was whatever the server
   * had last confirmed, React wrote that back into the open picker, and iOS
   * closed it on the number the finger happened to be over. It also meant one
   * database write per notch scrolled.
   *
   * So the hour the FIELD shows while it is being edited is local, and the
   * campaign is written once, when the picker closes. Nothing else about the
   * schedule changes: the days and the interval still commit on the spot,
   * because neither of them is a wheel.
   *
   * THE SUMMARY STILL MOVES WITH IT — "הסיכום חייב להתעדכן LIVE כאשר המשתמש
   * משנה: ימים, שעת התחלה, הפרש בין פוסטים" — because the draft lives HERE
   * and not inside the field: every line below reads `shown`, which is the
   * stored schedule with the draft laid over it.
   */
  const [startDraft, setStartDraft] = useState<string | null>(null);
  const shown = startDraft ? { ...stored, start: startDraft } : stored;
  const commitStart = () => {
    /* Only a complete, actually-different hour is worth a write. Clearing the
       draft first means the field goes back to following the campaign the
       moment the picker is closed, whichever way it was closed. */
    const next = startDraft;
    setStartDraft(null);
    if (next && /^\d{2}:\d{2}$/.test(next) && next !== stored.start) set({ start: next });
  };
  const canRepeat = Boolean(repeat && onRepeatChange);
  /*
   * EVERY HOUR THIS CAMPAIGN OPENS AT, round one first — the same function
   * the weekly plan is built from, so what the card counts and what the
   * engine plans cannot disagree. That pair disagreeing is the one way this
   * product has repeatedly got itself into trouble.
   */
  /*
   * THE HOURS THIS CAMPAIGN OPENS AT. One, now that סבבים ביום is gone —
   * roundStarts() is still the caller rather than a bare [shown.start],
   * because it is the same function the weekly plan is built from, and that
   * pair disagreeing is the one way this product has repeatedly got itself
   * into trouble.
   *
   * `shown`, not `schedule`: a campaign with the stored flag down opens at
   * midnight whatever hour is left in its row, and the repeat verdict below
   * must reason about the hour the engine will actually use.
   */
  const starts = roundStarts(shown, []);
  /*
   * THE GAP ON SCREEN IS THE ACCOUNT'S, NOT THE CAMPAIGN'S — see
   * onAccountGapChange. Falls back to the campaign's stored value only for a
   * caller that does not hand the account floor down (the campaigns list
   * before its own wiring), so nothing renders blank.
   */
  const effectiveGapSeconds =
    typeof accountFloorSeconds === 'number' && Number.isFinite(accountFloorSeconds) ? accountFloorSeconds : shown.gapSeconds;
  const gapShown = { ...shown, gapSeconds: effectiveGapSeconds };
  const verdict = repeat ? roundsVsRepeat(starts, repeat, floorHours) : null;
  /* The window that would let these rounds publish, from the ONE copy of that
     arithmetic the writer also uses — see repeatFitFor(). Null for every
     verdict a window cannot fix, so the button below is drawn only when
     pressing it would actually change the answer. */
  const repeatFit = verdict ? repeatFitFor(verdict, floorHours) : null;

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
    set({ days: shown.days.includes(day) ? shown.days.filter((d) => d !== day) : [...shown.days, day].sort((a, b) => a - b) });

  const noDays = shown.days.length === 0;

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
    <div data-schedule aria-busy={busy || undefined} className="mt-1">
      {/* p-2 → p-1.5, from the compaction brief. Padding only. */}
      <div className="rounded-2xl bg-brand-300/10 p-1.5">
        {/*
          THE BLUE CIRCLE, FIRST IN THE BLOCK.

          The dashboard hides this panel's own header, so this row is the top
          of what he sees — and it is the row that changes the instant a day,
          an hour or the interval is touched. The controls below stay switched
          off while the write runs, which is right; this is what says so.
        */}
        {busy && (
          <div data-saving className="mb-1.5 flex justify-center">
            <WorkingNote label="שומר את השינוי…" />
          </div>
        )}
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
        {/*
          ─── THE LABEL THE DAY ROW LOST WHEN THE READOUT STOOD DOWN ────────
          *
          * The chips used to sit under "ימי פרסום" in the board's readout
          * above, and the editor needed no label of its own because the word
          * was already on screen. The readout stands down while the editor is
          * open — "אין להציג פעמיים הגדרות ימי פרסום או שעות" — and the word
          * went with it, leaving seven bare letters.
          *
          * dashboard-hero.test.ts caught it on a card whose schedule is OFF,
          * which is the case that matters most: "כאשר כבוי: התזמון מושבת אך
          * ההגדרות נשמרות". A row of letters with nothing naming it is not a
          * saved setting a person can recognise.
          *
          * It is also what the reference draws — the day chips sit under
          * "ימי פרסום" there too. Same type scale and colour as the two
          * labels beside it, so the three read as one row of fields.
        */}
        <span
          aria-hidden
          dir="auto"
          /* leading-4 → leading-[13px] and the gap above it halved: a 10px
             word does not need a 16px line, and this label sits directly on
             the chips it names. 5px off the panel, from the compaction
             brief. */
          className={`block text-center text-[10px] font-bold leading-[13px] text-mist-300 ${showHeader ? 'mt-1.5' : 'mt-0'}`}
        >
          ימי פרסום
        </span>
        <div
          role="group"
          aria-label={`ימי פרסום ל${campaignName}`}
          className="mt-1 grid grid-cols-7 gap-[3px] [&>*]:min-w-0"
        >
          {DAY_LABELS.map((label, day) => {
            const on = shown.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                /* "א׳" is read aloud as a letter; the day is read as a day. */
                aria-label={DAY_NAMES[day]}
                onClick={() => toggleDay(day)}
                /*
                  52 → 40, WHICH IS THE PRODUCT'S FLOOR AND NOT A PIXEL LESS.
                  *
                  * "יש לצמצם את הגובה הכולל … ככל שניתן מבלי לפגוע
                  *  בשימושיות." A chip holds a 12.5px letter over a 12px
                  * check — 29px of content inside a 1px border — so 52 was
                  * 21px of air on the tallest row in the panel, seven times
                  * over. 40 is the floor campaign-card.test.ts hit-tests
                  * every control in this panel against, and the row is still
                  * measured at it: this number may go no lower.
                */
                className={`flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-2xl border text-[12.5px] font-extrabold transition-colors disabled:opacity-60 ${
                  on
                    /*
                     * THE DISCOVERY SCREEN'S OWN SELECTED CHIP, brand-600 →
                     * brand-500, and not `.grad-primary`.
                     *
                     * grad-primary is the product's gradient for a primary
                     * action and globals.css does name "a selected chip" among
                     * its uses. Under the purple theme it ran out to #a855f7,
                     * where a white label measured 3.96:1 — on a 220px button
                     * the text sits in the middle of that ramp and never
                     * reaches the light end, but on a 40px chip it covers the
                     * whole of it. The blue theme's light end (#2563eb) is
                     * 5.17 and no longer fails; the pair is kept anyway,
                     * because a chip wearing the primary ACTION's gradient
                     * drifts again the next time that gradient is tuned for a
                     * button. This pair's lightest end is brand-500 at 6.24,
                     * and FilterRow in Discovery.tsx already carries the same note for the
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
        <div className="mt-1 grid grid-cols-2 gap-2 [&>*]:min-w-0">
          {/*
            ─── ANY MINUTE, NOT EVERY HALF HOUR ──────────────────────────────
            *
            * "בשעת ההתחלה אני רוצה לבחור בדיוק איזה זמן שבא לי ולא בקפיצות
            *  של 30 דק" — the owner, 03.11.2026, 05:55.
            *
            * This was a <select> over TIME_CHOICES: 48 options, every half
            * hour. Nothing underneath ever needed that grid — the column is
            * plain 'HH:MM' text, normaliseTime() accepts any minute, and the
            * rounds editor inside this very panel has used <input type="time">
            * since the day it was written. The list was the only thing
            * rounding him off, and it was rounding him to the nearest thirty
            * minutes on the one field that decides when his day starts.
            */}
          <TimePick
            label="שעת התחלה"
            aria={`שעת התחלה ב${campaignName}`}
            icon={<ClockIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-400" />}
            value={shown.start}
            disabled={disabled}
            /* While the wheel moves: the panel's own draft, no write. */
            onDraft={setStartDraft}
            /* When the picker closes: one write, if anything actually moved. */
            onCommit={commitStart}
          />
          <Pick
            label="הפרש בין פרסומים"
            aria={`הפרש בין פרסומים ב${campaignName}`}
            icon={<RepeatIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-400" />}
            value={String(effectiveGapSeconds)}
            disabled={disabled}
            onChange={(v) => (onAccountGapChange ? onAccountGapChange(Number(v)) : set({ gapSeconds: Number(v) }))}
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

          ─── ONE LINE NOW, WHICH IS WHAT THE REFERENCE DRAWS ──────────────
          *
          * "סיכום התזמון: להציג בשורה קומפקטית ובהירה."
          *
          * It was two stacked lines — the days, then the hour and the
          * interval — in a strip with 8px of padding over and under, 49px for
          * 32px of text. One flowing sentence with the same three facts and
          * the same two separators is 16px of text in 24, and on every width
          * this card is drawn at it comes out on a single line.
          *
          * IT FLOWS, IT DOES NOT TRUNCATE. The days are the half that can run
          * long (six of them spelled out), and they are also the half nobody
          * can reconstruct from an ellipsis — so the sentence is allowed to
          * take a second line on a narrow enough screen rather than cut
          * "א׳, ב׳, ג׳, ה׳, ו׳, ש׳" off at the geresh. The block grows by 16px
          * on the day that happens and the figure stays readable, which is the
          * right way round: "ככל שניתן מבלי לפגוע בשימושיות".
          *
          * AND NO CLOSING HOUR. The hour used to be "09:00 – 23:30"; the
          * brief removes the end time from here by name ("אין להציג שעת סיום
          * גם בשורת הסיכום"), so it reads "משעה 09:00" — which is what the
          * engine now actually does.
        */}
        <div
          data-summary
          className={`mt-1 flex min-w-0 items-start gap-1.5 rounded-2xl px-2 py-1 text-[11px] font-bold leading-4 ${
            /* A white strip rather than an amber tint: warning-400 on 20% of
               brand-300 is 4.21:1, and on white it is 5.43. */
            noDays ? 'bg-ink-900 text-warning-400' : 'bg-brand-300/20 text-brand-400'
          }`}
        >
          <CalendarIcon aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          {!publishesAlways(schedule) ? (
            <span className="min-w-0">
              ימי פרסום: {daysLabel(shown)}
              {!noDays && (
                /*
                  THE HOUR IS ITS OWN LTR ISLAND. "09:00" is a European number
                  run around a neutral colon: inside an RTL line the bidi
                  algorithm can reorder it, and `dir="auto"` does not fix it —
                  the string has no strong character, so auto falls back to the
                  RTL that caused it. Same fix as <Stamp>: an explicit island.
                */
                <>
                  {/* THE REFERENCE'S SEPARATOR IS A RULE, NOT A DOT. It draws
                      "ימי פרסום: … | משעה: 15:10 | כל 40 שניות" — three fields
                      on one line with a vertical bar between them. The bar is
                      a neutral character, so each run around it keeps its own
                      direction and the hour stays inside its LTR island. */}
                  {' | '}משעה <span dir="ltr" className="inline-block tabular-nums">{shown.start}</span>
                  {' | '}
                  {gapLabel(gapShown)}
                </>
              )}
            </span>
          ) : (
            /*
              NO LIMIT AT ALL, SAID AS A CONSEQUENCE AND NOT AS A SWITCH
              POSITION. This used to read "התזמון כבוי — הקמפיין מפרסם ללא
              הגבלת ימים ושעות", which spent its first two words on a control
              that no longer exists before getting to the fact. Every day lit
              and the hour at midnight means exactly this, whether the row
              stores it as the flag being down or as seven days from 00:00,
              so one sentence covers both and the reader is never asked to
              know which.
            */
            <span className="min-w-0">מפרסם בכל יום, בכל שעה | {gapLabel(gapShown)}</span>
          )}
        </div>

        {/* ─── 4b. the floor this gap is about to move, if it is about to ─ */}
        {willLowerFloor && (
          /* mist-300 on the white strip rather than amber: this is not a risk,
             it is a fact about scope. The amber on this panel is reserved for
             חזרה יומית, which is the one control here that can cost him his
             account. */
          <p className="mt-1.5 rounded-xl bg-ink-900 px-2 py-1.5 text-[10.5px] font-bold leading-4 text-mist-300">
            המרווח המינימלי של כל החשבון הוא כרגע {accountGapLabel(accountFloorSeconds as number)}, והוא זה שקובע. בשמירה הוא ירד ל-
            {accountGapLabel(shown.gapSeconds)} <span className="text-brand-400">לכל הסבבים</span>, לא רק לזה.
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

      {/*
        ─── סבבים ביום (ריצות) — REMOVED AT THE OWNER'S REQUEST ─────────────
        *
        * "למחוק גם את הסבבים זה מסוכן."
        *
        * The control let one campaign publish more than once a day by adding
        * extra start hours to its weekly plan. It is the one switch in this
        * product that multiplies how fast an account posts, and it sat on the
        * main screen days after Facebook rate-limited that account.
        *
        * Removed WHOLE, not hidden: the panel no longer takes rounds, and the
        * weekly plan is no longer built from them, so a campaign cannot keep
        * producing extra occasions with nothing on screen to show it — which
        * is the failure the schedule switch above this one was just fixed
        * for. The `schedule_rounds` COLUMN is untouched and nothing is
        * deleted from it; it is simply not read any more, exactly as
        * `schedule_end` has not been read since the closing hour was removed.
      */}
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
        <div className="mt-1.5 rounded-2xl border border-ink-600 bg-ink-900 p-2">
          <div className="flex items-start gap-2">
            <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-brand-300/15">
              <RepeatIcon className="h-3.5 w-3.5 text-brand-400" />
            </span>
            <span className="min-w-0 grow">
              <span className="block text-[12.5px] font-extrabold leading-4 text-mist-100">חזרה יומית</span>
              {/* THE REFERENCE'S OWN SUBTITLE. "הפעל חזרה יומית של הקמפיין"
                  was an instruction to press the switch; the image writes
                  what the switch DOES, which is also the only one of the two
                  that is still true while it is off. */}
              <span className="mt-px block text-[10px] font-bold leading-[13px] text-mist-300">הקמפיין יחזור אוטומטית בכל יום</span>
            </span>
            {/* The reference draws a rule between the text and the controls
                in this row, the same one the blue block and the strip carry. */}
            <span aria-hidden className="ms-auto h-7 w-px shrink-0 bg-ink-700" />
            <span className="-me-1 -my-1 flex shrink-0 items-center">
              {/*
                THE EXPLANATION NO LONGER ARRIVES WITH THE TAP.
                *
                * "הסברים ואזהרות לא ייפתחו אוטומטית ויזיזו את המסך. יש
                *  להעביר אותם לאייקון מידע."
                *
                * This paragraph used to appear the moment the switch went on
                * — under the switch, pushing everything below it down while
                * the thumb was still there. It is the same words, in a sheet,
                * on a dot that is ALWAYS present: nothing appears, nothing
                * disappears, and the row cannot change height.
              */}
              <InfoDot title="חזרה יומית">
                {neverLaunched ? (
                  <>
                    <p>
                      הסבב הזה עוד לא יצא אף פעם, ולכן אין עדיין רשימת קבוצות לחזור אליה — החזרה היומית לא תיכנס לפעולה והתזמון לא יכניס
                      פרסומים לתור.
                    </p>
                    <p className="text-warning-400">
                      השיקו אותו פעם אחת — הוסיפו פוסט, בחרו קבוצות ושלחו — ומאותו רגע התזמון והחזרה יעבדו לבד.
                    </p>
                  </>
                ) : (
                  <>
                    {/* The consequence to HIS Facebook account leads, because
                        it is the one thing here he cannot undo. */}
                    <p className="text-warning-400">
                      פרסום חוזר של אותה מודעה לאותן קבוצות עלול לגרום להסרה מהקבוצות או להגבלת החשבון שלכם בפייסבוק.
                    </p>
                    {/*
                      THE TENSE FOLLOWS THE SWITCH.
                      *
                      * The paragraph this replaced only ever rendered while
                      * the repeat was ON, so it could speak in the present.
                      * The dot is always here, and describing a daily repeat
                      * as a thing that happens — on a campaign whose repeat
                      * is off — is the screen telling him something untrue
                      * about his own account.
                    */}
                    {repeat.enabled ? (
                      <p>
                        אותו פוסט מתפרסם שוב לאותן קבוצות בכל יום פרסום, החל מהשעה{' '}
                        <span dir="ltr" className="inline-block tabular-nums">{schedule.start}</span>. {repeatWindowSentence(repeat.minHours)}.
                      </p>
                    ) : (
                      <p>
                        החזרה היומית כבויה — הפוסט יצא פעם אחת בלבד. אם תדליקו אותה, אותו פוסט יפורסם שוב לאותן קבוצות בכל יום פרסום, החל
                        מהשעה <span dir="ltr" className="inline-block tabular-nums">{schedule.start}</span>. {repeatWindowSentence(repeat.minHours)}.
                      </p>
                    )}
                  </>
                )}
              </InfoDot>
              {/* `disabled` was swallowed inside onChange, so a tap on a
                  locked switch did nothing and said nothing. The switch owns
                  that state now and shows it. */}
              <Toggle
                checked={repeat.enabled}
                disabled={disabled}
                onChange={(enabled) => onRepeatChange({ ...repeat, enabled })}
                label={`חזרה יומית עבור ${campaignName}`}
              />
            </span>
          </div>
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
    /* p-1.5 → p-0.5, leading-[13px] on the label, mt-0.5 over the control:
       13px off this field, and the 40px control itself untouched. The SAME
       three numbers in TimePick/Pick below — they are one shape drawn twice
       and campaign-card.test.ts measures the pair for a pixel of
       disagreement. */
    <label className="block min-w-0 rounded-2xl bg-ink-900 p-0.5">
      <span className="flex min-w-0 items-center justify-center gap-1 text-center text-[10px] font-bold leading-[13px] text-mist-300">
        {icon}
        {/* dir="auto" because the guard in layout.test.ts asks it of every
             clamped expression, and it is right to: it cannot tell this label
             from a group name. Both are Hebrew constants written in this file,
             so "auto" resolves to the RTL they already had. */}
        <span dir="auto" className="min-w-0 truncate">{label}</span>
      </span>
      <span className="relative mt-0.5 block">
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

/**
 * THE SAME FIELD AS Pick, WITH A CLOCK INSTEAD OF A LIST.
 *
 * Drawn to match its neighbour exactly — same height, same radius, same
 * border and focus ring — because the two sit side by side in one grid and
 * the owner asked for a different VALUE SET, not a different card.
 *
 * THREE THINGS IT DOES THAT A BARE <input type="time"> DOES NOT:
 *
 * ONE — IT NEVER COMMITS HALF AN HOUR. An incomplete time input reports
 * `''`, and some browsers report an hour with no minutes while the second
 * field is still being typed. Writing that through would ARM a real hour on
 * the campaign — the rounds editor in this file carries the scar: "typing
 * 18:30 saved 01:30 on the way". So only a complete HH:MM is passed on, and
 * anything else is left as the draft it is.
 *
 * THREE — IT REPORTS MOVEMENT AND COMPLETION SEPARATELY, and that is what
 * makes it usable on a phone at all. `onDraft` fires on every notch the iOS
 * wheel passes and goes nowhere near the database; `onCommit` fires once,
 * when the field is done. A single `onChange` that wrote through was the bug:
 * the write is a round trip, the controlled `value` snapped back to the
 * server's answer mid-scroll, and iOS closed the picker on whatever the
 * finger was over. See the draft block at the top of the panel.
 *
 * `blur` AND `change`-while-not-focused, because the two platforms end this
 * differently: tapping away blurs, while the iOS picker's own ✓ fires a final
 * change and may leave focus where it was.
 *
 * TWO — IT IS AN LTR ISLAND. "06:47" is a European number run around a
 * neutral colon; inside an RTL card with no strong character in the string,
 * `dir="auto"` resolves to RTL and the clock reads backwards. The board that
 * displays this same value states the rule in those words.
 *
 * step={60} keeps seconds out of the picker: the engine stores minutes and a
 * seconds wheel would offer a precision nothing downstream can keep.
 */
function TimePick({
  label,
  aria,
  icon,
  value,
  onDraft,
  onCommit,
  disabled,
}: {
  label: string;
  aria: string;
  icon: React.ReactNode;
  value: string;
  /** Every notch of the wheel. Must not write anything. */
  onDraft: (v: string) => void;
  /** The field is done — write once, if anything moved. */
  onCommit: () => void;
  disabled?: boolean;
}) {
  return (
    /* p-1.5 → p-0.5, leading-[13px] on the label, mt-0.5 over the control:
       13px off this field, and the 40px control itself untouched. The SAME
       three numbers in TimePick/Pick below — they are one shape drawn twice
       and campaign-card.test.ts measures the pair for a pixel of
       disagreement. */
    <label className="block min-w-0 rounded-2xl bg-ink-900 p-0.5">
      <span className="flex min-w-0 items-center justify-center gap-1 text-center text-[10px] font-bold leading-[13px] text-mist-300">
        {icon}
        <span dir="auto" className="min-w-0 truncate">{label}</span>
      </span>
      <span className="relative mt-0.5 block">
        <input
          type="time"
          step={60}
          dir="ltr"
          aria-label={aria}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d{2}:\d{2}$/.test(v)) onDraft(v);
            /* A change that arrives while the field is NOT focused is the
               picker's own confirmation on a platform that does not blur. */
            if (document.activeElement !== e.currentTarget) onCommit();
          }}
          onBlur={onCommit}
          /* Enter on a keyboard is "done" as much as closing a wheel is. */
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          className="h-10 min-h-10 w-full cursor-pointer appearance-none rounded-xl border border-ink-600 bg-ink-900 px-2 text-center text-[13px] font-extrabold tabular-nums text-mist-100 transition-colors hover:border-brand-300 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </span>
    </label>
  );
}

/** Re-exported so a caller needs one import for the panel and its summary. */
export { scheduleSummary };
