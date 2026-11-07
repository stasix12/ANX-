'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CalendarIcon, ChevronIcon, MegaphoneIcon, PauseIcon, RepeatIcon, SpinnerIcon } from '@/components/icons';
import {
  canPauseRun,
  canResumeRun,
  groupProgress,
  launchPending,
  neverLaunched,
  openRows,
  runBadge,
  runBadgeHref,
  runProgress,
  type CampaignState,
  type RunTone,
} from '@/lib/social/campaign';
import { type CampaignRepeat, type CampaignRound, type CampaignSchedule } from '@/lib/social/campaign-schedule';
import { scheduleReadout, type AccountSpacing } from '@/lib/social/schedule-readout';
import { accountGapSeconds, paceProfile } from '@/lib/social/rules';
import { countdownTo } from '@/lib/social/countdown';
import { LATEST_SCHEMA_FILE } from '@/lib/social/errors';
import { agree, counted, formatTimeHe, relativeHe } from '@/lib/social/time';
import type { QueueRow } from '@/lib/social/client';
import { QUEUE_STEP_LABEL, type QueueStep } from '@/lib/social/types';
import type { Campaign, MediaItem, PaceId, SocialTarget } from '@/lib/social/types';
import { CampaignScheduleBoard } from './CampaignScheduleBoard';
import { CampaignSchedulePanel } from './CampaignSchedulePanel';
import { ProgressRing } from './ProgressRing';
import { PostCover } from './PostCover';
import { stageElapsed } from './PublicationItem';
import { TargetAvatar } from './TargetAvatar';
import { Button, ButtonLink, CARD, ProgressBar, TONE_FILL, TONE_TEXT, TONE_TINT, type Tone } from './ui';
import { LiveFlow, type FlowRow } from './LiveFlow';
import { sceneModeFor, type SceneMode } from './sceneState';
import { SYSTEM_STATE_TONE, type SystemState } from './systemState';

/**
 * The two cards the dashboard opens with.
 *
 * `LiveQueueHero` is the SYSTEM CARD: is it working, how much of today's own
 * ceiling has gone out, when is the next one and to which group. It renders
 * whatever the queue looks like, including empty — a dashboard that hides its
 * first card when there is nothing to publish answers none of those questions
 * on the morning it matters most.
 *
 * `LiveCampaignHero` is the RUN CARD: what the current round has published,
 * what is still open, and the two controls that act on it.
 *
 * Deliberately the same card skin as everything else. An earlier version
 * painted this panel in a blue gradient to make it the subject of the screen;
 * it read as a demo banner. Prominence comes from position, from one extra
 * step of padding, and from the size of the figures.
 *
 * Every number is derived from real queue rows — the count, the percentage,
 * the next instant and the next group all come from campaignState(),
 * summarizeQueue() or from the queue itself. When nothing is pending there is
 * no countdown rather than a placeholder clock.
 *
 * EXACTLY ONE COUNTDOWN EXISTS ON THIS SCREEN, and it is the system card's.
 * The two cards derive "the next publication" from different rows — the system
 * card from the whole queue, the run card from that run's first `scheduled`
 * row — so two countdowns 200px apart would frequently show two different
 * instants. That is the contradiction class status.ts and campaign.ts were
 * written to end, re-introduced by a layout change.
 */

function HeroPanel({ children, ariaLabel, className = 'p-4' }: { children: React.ReactNode; ariaLabel: string; className?: string }) {
  return (
    <section aria-label={ariaLabel} className={`${CARD} ${className}`}>
      {children}
    </section>
  );
}

/**
 * The status pill: a dot while something is genuinely in flight.
 *
 * The tone comes from RUN_STATE_TONE (campaign.ts), which is the designated
 * one definition of what a run state looks like. This pill used to paint
 * `running` green out of a local map while the campaign list and the campaign
 * screen painted the same word blue out of the shared one — the owner tapped
 * from the dashboard into the run and watched the badge change colour, so the
 * colour carried no meaning. Same class of bug as the inline status lists,
 * one layer up.
 */
/**
 * ─── AND THE BADGE IS A DOOR WHEN IT HAS SOMEWHERE TO LEAD ────────────────
 *
 * "בריבוע של דורש טיפול / הסתיים עם כשלים אני רוצה שיהיה ניתן ללחוץ על זה
 *  וזה יביא אותי לעמוד של הכשלים."
 *
 * It was a label. The owner read "הסתיים עם כשלים · 11 נכשלו", and then had
 * to open the history screen, filter it to נכשלו, widen the range and find
 * this run's rows among every other run's — to reach a list the badge had
 * just counted for him.
 *
 * `href` comes from runBadgeHref(), off the same runBadge() call that chose
 * the word, so the list can never be about rows the sentence did not name.
 * When it is null the pill renders exactly as it always did: a badge that
 * leads nowhere must not look pressable.
 *
 * THE LOOK IS UNCHANGED. The pill's own box keeps every class it had; the
 * anchor around it is a transparent 44px row, which is the product's tap
 * floor and the same height the title link beside it already reserves — so
 * the header line does not move by a pixel.
 */
function StatePill({ tone, label, live, href }: { tone: Tone; label: string; live: boolean; href?: string | null }) {
  const pill = (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${TONE_TINT[tone]} ${TONE_TEXT[tone]}`}
    >
      {live && <span aria-hidden className={`pulse-dot h-1.5 w-1.5 rounded-full ${TONE_FILL[tone]}`} />}
      {label}
    </span>
  );
  if (!href) return pill;
  return (
    <Link href={href} aria-label={`${label} — פתיחת הרשימה`} className="flex min-h-11 shrink-0 items-center">
      {pill}
    </Link>
  );
}

/**
 * campaign.ts's tone vocabulary still carries `info` as a legacy name for the
 * same blue `brand` resolves to (Badge does the same collapse). One place to
 * fold it, so the pill cannot pick a fifth hue.
 */
const toneOf = (t: RunTone): Tone => (t === 'info' ? 'brand' : t);

/** "18 / 125" is digits around a neutral slash, which an RTL line reorders. */
/**
 * THE FIGURE, ANIMATED ONLY WHEN IT REALLY MOVES.
 *
 * "The counter MUST NOT change because of the visual animation. It may ONLY
 * change after the application receives REAL confirmation that the post was
 * successfully published."
 *
 * Which is what this is: there is no timer here and no interval. It renders
 * the number it is handed, and when a LATER render hands it a different one —
 * which, on this screen, only happens after the queue has been re-read from
 * the database — the old figure leaves upwards and the new one arrives from
 * below. A render carrying the same figure produces no movement at all, and
 * nothing in this component can make the number go up on its own.
 *
 * `tabular-nums` is on the wrapper rather than each span so the two figures
 * occupy the same width while they cross, and the slash beside them does not
 * shuffle. The outgoing one is aria-hidden: a screen reader must hear one
 * number, not two.
 */
function RollingNumber({ value, className }: { value: number; className: string }) {
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState<number | null>(null);

  useEffect(() => {
    if (value === shown) return;
    setLeaving(shown);
    setShown(value);
    const t = setTimeout(() => setLeaving(null), 320);
    return () => clearTimeout(t);
  }, [value, shown]);

  return (
    <span className={`anx-num ${className}`}>
      {leaving !== null && (
        <span key={`out-${leaving}`} aria-hidden className="anx-num-out">
          {leaving}
        </span>
      )}
      <span key={`in-${shown}`} className={leaving !== null ? 'anx-num-in' : undefined}>
        {shown}
      </span>
    </span>
  );
}

/**
 * THE COUNT, CENTRED AND ON ONE LINE — "לשים באמצע אם אוטו פונט".
 *
 * `clamp()` rather than a breakpoint: the sentence carries two numbers whose
 * width is data, not design — "9 / 12" and "118 / 2655" are not the same
 * string — so a size chosen for one of them wraps on the other. The floor is
 * what fits at 320px with four digits on each side; the ceiling is exactly the
 * size this line has always been, so nothing changes on a phone that has room.
 *
 * `vw` and not a container query because this panel is full-bleed on a phone,
 * which is the only width where the line is ever tight; on a desktop the clamp
 * is pinned at its maximum long before the viewport stops growing.
 */
/* Exported for worker/test/publishing-scene.test.ts, which measures the real
   line in a browser rather than a copy of its markup. */
export function Ratio({ done, total, suffix }: { done: number; total: number; suffix: string }) {
  return (
    <p
      dir="auto"
      className="flex items-baseline justify-center gap-x-1.5 whitespace-nowrap text-center text-[clamp(11px,3.3vw,14px)] font-bold text-mist-500"
    >
      <span dir="ltr" className="inline-flex items-baseline gap-x-1">
        <RollingNumber
          value={done}
          className="text-[clamp(19px,6.6vw,28px)] font-extrabold leading-none tabular-nums text-mist-100"
        />
        {/*
          THE SPACE IS IN THE TEXT, and the gap beside it is in the CSS.
          
          Moving it to `gap-x-1` alone changed what the card SAYS — "50/ 50"
          instead of "50 / 50" — and a guard whose whole job is "the figures on
          this card did not move" caught it, correctly. A flex container trims
          the leading space when it lays the run out, so the gap is what shows;
          the space is what the DOM and a screen reader read.
        */}
        <span>{' / '}{total}</span>
      </span>
      <span>{suffix}</span>
    </p>
  );
}

/** Ticks once a second, and only while there is something to count down to. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/* The four states moved to ./systemState, so the identity bar — which is on
   all eleven screens — can read them without dragging this dashboard card
   into every bundle. Re-exported here because the dashboard has always
   imported the type from this file. */
export { type SystemState } from './systemState';

/** One row of the card's foot: a recessed box with a label over a value. */
const FOOT_BOX = 'min-w-0 rounded-xl bg-ink-900 px-3 py-2.5';

/**
 * "הפרסום הבא בעוד 00:20" and the group it belongs to, side by side.
 *
 * The countdown and the group name used to share one line, and the countdown
 * is `shrink-0`: measured at 390px the group got 81px of a 451px name, 18%
 * legible, while the timeline 300px below gave the same name 186px. They are
 * one thought but two facts, so they get one box each and the name gets a
 * real measure.
 *
 * The picture is the group's own, from the queue row the countdown was derived
 * from; when the worker has not copied one yet TargetAvatar draws its lettered
 * fallback rather than a broken image.
 */
export function LiveCampaignHero({
  campaign,
  state,
  onPause,
  onResume,
  busy,
  onReset,
  onTune,
  media = null,
  workerOnline,
  globalPaused = false,
  targetCount = null,
  startedAt = null,
  schedule,
  onScheduleChange,
  repeat,
  onRepeatChange,
  spacing,
  pace,
  onPaceChange,
  paceRestUntil,
  floorHours,
  frozenUntil = null,
  scheduleBusy = false,
}: {
  campaign: Pick<Campaign, 'id' | 'name' | 'service' | 'city' | 'status'>;
  state: CampaignState;
  /**
   * Whether a worker has sent a heartbeat recently. Only a real heartbeat or a
   * real in-flight row may put the word "now" on this card.
   */
  workerOnline?: boolean;
  /**
   * Whether ALL publishing is paused from the header toggle.
   *
   * This card had no such parameter at all, while the queue card beside it
   * did. Measured with the global pause on: the top of the screen read "כל
   * הפרסומים מושהים" and this card, 800px below, read "רץ" with a live dot and
   * a ticking countdown. A product that says it is publishing while it is
   * paused has no credibility left for anything else on the page.
   */
  globalPaused?: boolean;
  /** Opens the queue tuner for this run: when it starts, and the interval. */
  onTune?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onReset?: () => void;
  busy?: boolean;
  /** The media of the post this run publishes — same tile as the run card. */
  media?: MediaItem[] | null;
  /**
   * DISTINCT groups this run publishes to, which is not `progress.total`: a
   * recurring schedule posts the same run to one group more than once, so the
   * row count would be a number that is not in the database. Derived once by
   * the dashboard from the run's own rows and handed over — a component that
   * re-derives a run fact from rows is the shape the single-source rule exists
   * to stop. It belongs on CampaignState; see the report.
   */
  targetCount?: number | null;
  /** First real publication (state.startedAt). Null until something went out. */
  startedAt?: string | null;
  /*
   * ───────── "תזמון פרסום", on the card the owner's reference draws it on ──
   *
   * BOTH OR NEITHER, AND THAT IS WHAT KEEPS THIS BACKWARD COMPATIBLE. Without
   * them the card renders exactly as it did — no block, no strip, and "ערוך
   * מועד" still opens the queue tuner it has always opened. The dashboard
   * passes them; anything else that ever mounts this card does not have to.
   */
  schedule?: CampaignSchedule;
  /**
   * Writes the campaign's schedule columns. The page owns the write (it
   * debounces it and puts the row back if it fails); this card owns nothing
   * but the switch that calls it.
   */
  onScheduleChange?: (next: CampaignSchedule) => void;
  /**
   * CHZARA — passed straight through to the panel, which draws it only when
   * BOTH arrive: the switch's effect is a weekly schedule row, so a caller that
   * cannot write one must not offer it.
   */
  repeat?: CampaignRepeat;
  /* סבבים ביום — the dashboard draws the same panel, so it carries the same pair. */
  onRepeatChange?: (next: CampaignRepeat) => void;
  /**
   * The account-wide spacing rule, which the card cannot see from the campaign
   * alone — rules.ts holds a row for the later of this and the campaign's own
   * gap, so a card without it prints a minute the engine will not publish at.
   * Optional: a caller that cannot supply it gets the behaviour this card had
   * before, which is wrong in the same way it has always been wrong rather
   * than newly wrong.
   */
  spacing?: AccountSpacing;
  /** Writes the account's own gap — the only one the engine enforces. See the
      panel's prop of the same name for why this card no longer writes the
      campaign's. */
  /**
   * מצב פרסום חכם — which publishing mode the ACCOUNT is on, and the handler
   * that changes it. Straight through to CampaignSchedulePanel, which
   * explains at length what field this replaced and why the mode writes the
   * account's own gap rather than the campaign's column.
   */
  pace?: PaceId | null;
  onPaceChange?: (id: PaceId) => void;
  /** When the current automatic rest ends, if one is running. */
  paceRestUntil?: string | null;
  /** How close two publications of one post to one group may be, in hours —
      the account's setting, defaulted by the panel when absent. */
  floorHours?: number;
  /**
   * PUBLISHING IS FROZEN UNTIL THIS INSTANT — `control.rateLimitedUntil`.
   *
   * Carried, not decided: the dashboard reads the setting and this card hands
   * it to the one block that draws time. Optional, so a caller that does not
   * know about freezes renders exactly what it rendered before.
   */
  frozenUntil?: string | null;
  /** While that write is in flight, so the controls cannot be raced. */
  scheduleBusy?: boolean;
}) {
  const { progress } = state;
  /*
   * TWO NUMBERS, AND THEY ARE NOT THE SAME NUMBER.
   *
   * The bar was publications over the whole run, so a run with one of 29 rows
   * already FAILED drew a 0%-wide bar and printed "0%" — nothing had
   * succeeded, but something had certainly happened, and the card said the
   * round had not moved. `view.percent` and `view.handledLabel` are the
   * round's PROGRESS (published + failed + skipped); `view.publishedLabel` is
   * its SUCCESS, on its own line under the bar and never folded in.
   */
  const view = runProgress(progress, state.todayOnly, state.truncated);
  /*
   * ─── AND THE SAME CARD IN GROUPS, WHICH IS WHAT IS READ ────────────────
   *
   * "סה״כ פורסמו 204 מה זה המספרים האלה 478/730" — and then, after the
   * answer: "שיספור רק את הקבוצות שאליהם אמור לצאת הפרסום וכמה פורסם מתוכם,
   * לא צריך את המספר המנופח הזה זה מבלבל לקוחות."
   *
   * 478 / 730 is PUBLICATIONS, and both numbers are true: a round plans the
   * same group more than once, so the rows are a multiple of the groups. It
   * sat one line under a pill reading "252 קבוצות" with nothing saying the
   * two count different things, which is how a card about 252 groups reads
   * as a job three times the size.
   *
   * The figures on this card are the pair he asked for: groups the round is
   * meant to reach, and groups that already have the post. `runProgress` is
   * untouched and still draws the round's own screen, where a publication IS
   * the subject and "730 פרסומים" is the right denominator.
   *
   * `targetCount` is passed rather than taken from the state so the ratio
   * and the number the dashboard already held cannot come from two reads and
   * disagree.
   */
  const groups = groupProgress(state, targetCount ?? undefined);
  /*
   * WHAT THE GROUP FIGURES CANNOT SAY, in the unit they are not in.
   *
   * A skipped or failed publication is not a group, and there is no group-wise
   * count of either — a group can have one of each. They stay on the card
   * because a round losing 274 publications is not something to learn about
   * from a badge, and the noun is written into every one of them so nothing
   * here can be read as a count of groups.
   */
  const lostNote = [
    progress.skipped > 0 ? counted(progress.skipped, 'פרסום אחד דולג', 'פרסומים דולגו') : '',
    progress.failed > 0 ? counted(progress.failed, 'פרסום אחד נכשל', 'פרסומים נכשלו') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const open = openRows(progress);
  /*
   * One opinion about the state — the label, the colour, and whether the dot
   * may pulse — including what the global pause and a missing heartbeat mean.
   * `workerOnline` was accepted by this card and then read by nothing in its
   * body, so with the PC asleep for six hours the pill still said "רץ".
   */
  const badge = runBadge(state, { globalPaused, workerOnline });
  const pillTone: Tone = toneOf(badge.tone);
  // A button is offered only when it can act: nothing is left to pause once
  // every row has finished, and "המשך סבב" belongs to the RECORD's pause flag,
  // not to a state name — a paused run whose remaining rows all wait on a
  // person resolves to the needs-a-person state, and had no way out of the
  // pause at all.
  const showPause = canPauseRun(progress, campaign.status);
  const showResume = canResumeRun(progress, campaign.status);

  /*
   * WHEN THE NEXT PUBLICATION ACTUALLY LANDS — the one number the reference's
   * new strip is about, and the one this card must not work out for itself.
   *
   * THE SAME CALL rules.ts MAKES. nextPublishAt() applies the gap since this
   * run last published, then snaps the result into the first moment the
   * schedule permits — walking to the next chosen day when today's window has
   * closed. That is why "אם עכשיו 21:55 וה-Interval 10 דקות ושעת הסיום 22:00"
   * prints tomorrow's start and not 22:05: the engine would do the same, and
   * both of them ask one function. The campaigns card derives its "הבא בתור"
   * from these exact four lines.
   *
   * WITH THE SWITCH OFF THIS IS A NO-OP — the stored instant, unchanged, which
   * is what the queue will genuinely do. A row really waiting for 14:30 is not
   * "לא מתוזמן", and printing that over it would be the dashboard hiding a
   * publication that is about to go out.
   */
  /*
   * WHAT THIS CARD MAY SAY ABOUT TIME — one call, shared with the campaigns
   * list, so the two cards cannot reach different conclusions about the same
   * campaign.
   *
   * It used to be derived here: the queued instant snapped through
   * nextPublishAt(), then two window edges, then a no-day flag — four
   * expressions the strip had to recombine, and the campaigns card had its own
   * copy of the first one. That is how "חלון הפרסום פתוח עד: 22:00" came to be
   * printed over a round with 219 of 219 handled: the window edges were
   * computed from the SCHEDULE, which does not know whether anything is left to
   * publish, and nothing in the chain was responsible for noticing.
   * scheduleReadout() is that missing responsibility, and it is one function
   * with one rule — name an instant only when something will happen at it.
   */
  const readout = scheduleReadout(schedule, state, undefined, repeat, spacing);

  /*
   * "לחיצה על 'ערוך מועד' צריכה לפתוח את אפשרויות עריכת התזמון שכבר בנינו."
   *
   * IN THE CARD, NOT OVER IT. "אל תפתח Modal. אל תפתח Popup. אל תיצור מסך
   *  חדש. אל תעביר את התזמון למסך אחר." So the editor is the panel this
   * product already has, revealed directly under the action row that opened
   * it — the owner sees what he pressed produce something below his thumb
   * rather than a sheet over the screen he was reading.
   *
   * WITHOUT A SCHEDULE THE BUTTON IS UNTOUCHED and still opens the queue
   * tuner, which is also still where it has always been on the system card
   * above — nothing became unreachable.
   */
  const canSchedule = Boolean(schedule && onScheduleChange);
  /*
   * OPEN, NOT CLOSED — "את הסבבים תוסיף ישר לעמוד הראשי איפה שהקמפיין כמו
   * בתמונה כאן".
   *
   * His reference draws the whole scheduling block expanded on the main page:
   * the days, the hour, the gap, סבבים ביום and חזרה יומית, all visible
   * without tapping anything. It was behind "ערוך מועד", which is why he
   * looked at the card and reported the feature missing — it was there, one
   * tap away, which for a control you are meant to notice is the same as not
   * being there.
   */
  const [editingSchedule, setEditingSchedule] = useState(true);

  return (
    /*
     * p-3.5 → p-3, AND THAT IS NOT A TASTE CHANGE.
     *
     * The blue block above bleeds out of this padding with `-mx-3 -mt-3`, and
     * a bleed has to equal the padding it cancels or the gradient stops 2px
     * short of the card's edge on both sides — visible as a hairline of white
     * down the outside of the header. 14 and 12 were the two numbers in this
     * file; the reference's header reaches the edge, so the card came down to
     * meet the bleed rather than the other way round.
     */
    <HeroPanel ariaLabel="הסבב הפעיל" className="p-3">
      {/*
        ─── THE HEADER BLOCK OF THE REFERENCE ──────────────────────────────
        *
        * "כרטיס קמפיין עליון: תמונת הקמפיין המקורית בצד הכרטיס, שם הקמפיין,
        *  מספר הקבוצות, מספר הפרסומים שטופלו, אחוז התקדמות וטבעת התקדמות."
        *
        * Every one of those five facts was already on this card and already
        * loaded from the run — the image is still <PostCover media={media} />,
        * the same media the campaign owns, so "התמונה חייבת להישאר מחוברת
        * לנתוני הקמפיין האמיתיים" costs nothing: nothing about where the
        * value comes from changed. What changed is that they now sit together
        * on the blue ground the reference draws, with the ring that was
        * already built for the run's own screen.
        *
        * WHITE HERE IS MEASURED. The gradient's three stops read 11.11 / 6.24
        * / 5.17 against white; its lightest stop was moved from #2f7ef5
        * (3.87, under AA) for exactly this block — see .grad-hero.
        *
        * The status pill moved OUT, down beside the outcome line. The
        * reference has no pill in this block, and a chip whose whole job is a
        * tone — green for running, amber for attention — cannot keep that job
        * on a blue ground.
      */}
      {/*
        px-4 AND NOT px-2, WHICH IS A CLEARANCE AND NOT A TASTE.
        *
        * The card's corner is a 20px arc and the ring at the end of this row
        * is a 58px circle: at 8px of padding the circle's centre sits 24px
        * from the arc's centre and the ring pokes 5px THROUGH the corner —
        * visible in the first screenshot of this block as a slice of white
        * cut out of the track. 16px puts the centre 30.2px out, which clears
        * a 29px radius. Horizontal only: the row's height is unchanged.
      */}
      <div className="grad-hero -mx-3 -mt-3 mb-1.5 flex items-center gap-2.5 rounded-t-[inherit] px-4 py-2">
        {/*
          ─── SHORTER, AND THE REFERENCE IS THE SPEC ─────────────────────
          *
          * "יש לצמצם את הגובה הכולל של אזור הקמפיין והגדרות התזמון בכ־30%–40%."
          *
          * Measured at 390px before this: the blue block was 114px and the
          * two rows under it 110 more, for 224px of card saying the ratio
          * three times — in the ring, beside the name, and again over the
          * bar. The reference says it once per place it means something: the
          * ring is the percentage, the line under the name is the count, and
          * the strip below is today.
          *
          * Nothing here reads a new value. The cover is the same media, the
          * ring the same percent, the figures the same pair.
        */}
        <PostCover media={media} className="h-11 w-14 shrink-0 sm:h-14 sm:w-[72px]" />
        <div className="min-w-0 grow">
          <Link
            href={`/social/campaigns/${campaign.id}`}
            dir="auto"
            /* min-h-10 AND the padding come across with it. The name is a
               LINK to the run's own screen, so it is a tap target, and moving
               it into the header dropped it to 20px — dashboard-hero.test.ts
               hit-tests every control against the product's 40px floor and
               caught it on the first run. 40 exactly, which is that floor:
               the row it is in has to come down by a third. */
            className="flex min-h-10 min-w-0 items-center truncate py-0.5 text-[14px] font-extrabold leading-[18px] text-white"
          >
            {campaign.name}
          </Link>
          {/*
            THE PILL IS GONE AND ITS NUMBER IS NOT. It carried "252 קבוצות",
            which is now the denominator of the figure directly below it —
            "כל נתון יוצג פעם אחת בלבד", and a total printed twice two lines
            apart is how this card came to have three counts of three
            different things on it.

            The fallback keeps it: with no group count to put under the ratio
            (a queue whose rows carry no target), the pill is the only place
            the groups appear at all.
          */}
          {!groups.usable && (targetCount ?? 0) > 0 && (
            <span className="mt-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold text-white">
              {`${state.truncated ? 'לפחות ' : ''}${counted(targetCount ?? 0, 'קבוצה אחת', 'קבוצות', 'שתי קבוצות')}`}
            </span>
          )}
          {/* The reference's own hairline, and the word beside the figure
              rather than under it: two lines became one, and the sentence
              that was the second one is the strip below. */}
          {/* my-1 → my-0.5: 8px of white space around a 1px rule was the
              last thing setting this block's height — the column it is in
              measured 65 against a 58px ring, so the whole blue row was 7px
              taller than the ring that decides it. 4px of air still reads as
              a separator. */}
          <span aria-hidden className="my-0.5 block h-px w-full bg-white/25" />
          <p dir="auto" className="flex min-w-0 items-center gap-1.5 text-[12px] font-extrabold leading-4 text-white">
            <MegaphoneIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-white/85" />
            <span className="truncate">פרסומים</span>
            {/* NO HEDGE MARK ON THIS FIGURE, and that is the card's existing
                rule rather than a new one: `view.handled / view.total` never
                carried "לפחות" either — the hedge belongs to the sentence
                below, which has room to say the word, and to the note under
                it that says what to do about it. */}
            <span dir="ltr" className="shrink-0 tabular-nums">
              {groups.usable ? `${groups.published} / ${groups.total}` : `${view.handled} / ${view.total}`}
            </span>
          </p>
        </div>
        {/* THE REFERENCE'S OWN VERTICAL RULE. It draws two separators in this
            block, not one: the hairline under the name, and this rule between
            the name and the ring. Same white at 25% as the hairline, 40px so
            it matches the name's line rather than the ring's diameter. */}
        <span aria-hidden className="h-10 w-px shrink-0 bg-white/25" />
        <ProgressRing
          percent={groups.usable ? groups.percent : view.percent}
          label={`${groups.usable ? groups.percent : view.percent}%`}
          sub={groups.usable ? 'מהקבוצות' : 'התקדמות'}
          /* 78 → 62: the ring is a glance, not the headline it is on the
             round's own screen. 62 and not 58, which is where I first put it:
             at 58 the hole is 46px across and "מהקבוצות" is 38 — the word
             reached the inner edge of the track at its own baseline, where
             the chord is only 34. Four pixels of diameter buy nine of chord
             and cost one of row height, because the name column beside it is
             61 tall. The reference's own ring measures ~61. */
          size={62}
          stroke={6}
          tone="on-brand"
        />
      </div>

      {/*
        ─── ONE STRIP INSTEAD OF TWO ROWS AND A HEADING ───────────────────
        *
        * The reference draws a single line under the blue block: the day's
        * figure, the bar, the percentage, the state. It replaces a row that
        * held "התחיל לפני 6 שעות" and the pill, and a second row that held
        * the figure and the percentage over the bar — 110px of card for four
        * facts, three of which were already above.
        *
        * Everything still here: the figure, the bar (segments unchanged), the
        * percentage, the pill with its link. "התחיל לפני" moved to the front
        * of the sentence below, which is the line that describes the run in
        * words and had room for it.
      */}
      <div className="flex min-w-0 items-center gap-2">
        <CalendarIcon aria-hidden className="h-4 w-4 shrink-0 text-brand-400" />
        {/* The numbers never shrink and never wrap; the WORD beside them
            truncates if the screen is narrow. A truncated count is a wrong
            count, which is the one thing this strip may not produce. */}
        <p dir="auto" className="flex min-w-0 shrink items-baseline gap-1">
          <span dir="ltr" className="shrink-0 text-[13px] font-extrabold tabular-nums text-mist-100">
            {groups.usable ? `${groups.published} / ${groups.total}` : `${view.handled} / ${view.total}`}
          </span>
          <span className="truncate text-[11px] font-bold leading-4 text-mist-500">
            {groups.usable
              ? `${agree(groups.published, 'קבוצה קיבלה', 'קבוצות קיבלו')}${state.todayOnly ? ' היום' : ''}`
              : `${agree(view.handled, 'טופל', 'טופלו')}${state.todayOnly ? ' היום' : ''}`}
          </span>
        </p>
        <div className="min-w-0 grow">
          {groups.usable ? (
            <ProgressBar
              segments={[{ value: groups.published, className: TONE_FILL.good }]}
              total={groups.total}
              ariaLabel={groups.ariaLabel}
              height="h-2"
            />
          ) : (
            <ProgressBar
              segments={[
                { value: progress.published, className: TONE_FILL.good },
                { value: progress.failed, className: TONE_FILL.bad },
                { value: progress.skipped, className: TONE_FILL.neutral },
              ]}
              total={progress.total}
              ariaLabel={view.ariaLabel}
              height="h-2"
            />
          )}
        </div>
        {/*
          ─── THE PERCENTAGE, WHICH THE REFERENCE DOES PRINT TWICE ─────────
          *
          * I took this out under "יש לאחד נתונים סטטיסטיים חוזרים" — it is
          * `groups.usable ? groups.percent : view.percent`, the same
          * expression the ring above is drawn from. Then I put the reference
          * beside the screenshot: its blue block carries "0% / התקדמות" in
          * the ring AND its strip carries "0%" next to the bar, with a rule
          * between that and the state chip.
          *
          * The image is the binding half of the brief ("לשחזר את העיצוב
          * מהתמונה המצורפת"), and the two are not really the same statement:
          * the ring is the campaign's headline, this is the figure the bar
          * beside it is at. So it is back, and the de-duplication the brief
          * asks for is spent where it changes what is on screen — the three
          * counts this card used to carry are one, and the schedule's days
          * are printed once.
        */}
        <p className="shrink-0 text-[13px] font-extrabold tabular-nums text-brand-400">
          {groups.usable ? groups.percent : view.percent}%
        </p>
        {/* The reference's own rule between the figures and the state chip. */}
        <span aria-hidden className="h-4 w-px shrink-0 bg-ink-700" />
        <StatePill tone={pillTone} label={badge.label} live={badge.live} href={runBadgeHref(badge, campaign.id)} />
      </div>

      <div className="mt-1.5">
        {/*
          THE OLD PAIR AND THE OLD BAR ARE GONE FROM HERE, AND BOTH ARE IN
          THE STRIP ABOVE — figure, bar, percentage, in one row.

          What they carried has not changed: the same `groups.usable` branch,
          the same segments from the same tone maps, the same ariaLabel, and
          the same rule behind them — the big figure beside a bar may not be
          the SUCCESS count drawn over a PROGRESS bar, which is how one failed
          row of 29 printed "0%". Both figures up there are still the same
          pair, so the bar, the ring and the digits cannot disagree about what
          they are a fraction of. And "היום" is still part of the sentence
          rather than an extra line beside it.
        */}
        {/* What the run actually produced, and what became of the rest — one
            word per outcome instead of one word covering three. This line is
            deliberately directly under the bar: the bar says how far the round
            has got, and the owner's next question is always how much of that
            was a publication.

            "עוד לא יצאו", not "עוד ממתינים": the KPI tile 200px above owns the
            words "ממתינים בתור" for a different rollup (summary.queued, the
            whole queue), and this is openRows() for one run. Two correct
            numbers under one phrase is how the screen started arguing with
            itself. */}
        {/* text-xs/leading-4 → 11px/leading-[14px]. This sentence is the one
            element in the campaign block whose height is set by how much it
            has to say rather than by padding: three clauses and a hedge took
            three lines on a 360px phone. A point of type and two of leading
            is a line back on the narrow screens and 4px on every other, with
            nothing dropped from the sentence — "ככל שניתן מבלי לפגוע
            בשימושיות" cuts the box, not the words. */}
        <p className="mt-1 text-[11px] leading-[14px] text-mist-500">
          {/* THE ROUND'S OWN AGE, at the front of the line that describes it.
              It had a row to itself beside the pill; the reference has no such
              row, and the fact is worth a word, not 24px. */}
          <span className="font-bold">
            {startedAt
              ? `התחיל ${relativeHe(startedAt)}`
              : state.everPublished > 0
                ? 'יצאו פרסומים בעבר'
                : 'טרם יצא פרסום'}
          </span>
          {' · '}
          {groups.usable
            ? /* THE GROUP SENTENCE, THEN WHAT IS LEFT, THEN WHAT WAS LOST —
                 and every number in it names its own unit. "48 קבוצות עוד לא
                 קיבלו פרסום · 274 פרסומים דולגו" cannot be read as one count
                 of one thing, which is exactly what "478 / 730" beside "252
                 קבוצות" was. */
              /* `open` BELONGS IN THIS LINE even though it is publications:
                 a round with two occasions a day reaches all 252 groups by
                 midday with 252 rows still waiting for 18:00, and a line
                 reading "פורסם ל-252 מתוך 252 קבוצות היום" with nothing after
                 it says the day is over. groupProgress() already refuses to
                 print 100% while anything is open; this is the same fact in
                 words. */
              [
                groups.label,
                groups.waitingLabel,
                lostNote,
                open > 0 ? counted(open, 'פרסום אחד עוד לא יצא', 'פרסומים עוד לא יצאו', 'שני פרסומים עוד לא יצאו') : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : [view.publishedLabel, view.note, open > 0 ? `${open} עוד לא יצאו` : ''].filter(Boolean).join(' · ')}
        </p>
        {/*
          ONE SENTENCE PER CAUSE, because they are not the same problem.
          The old single sentence said "the round is too big" for all four,
          and on an un-migrated database that is simply false: the round is
          39 rows and the counting views are missing. It also said "הפרסומים
          הראשונים בלבד", which describes an ASCENDING read — the done preview
          is published_at DESCENDING, so what it drops is the OLDEST history.
        */}
        {/*
          THE POSTS HE WATCHED GO OUT, ON THE CARD HE WATCHED THEM FROM.

          The counter above is today's PLAN and is right; the account header is
          what went out and is right; this is the row that is in the second and
          not the first — named, rather than folded into the denominator.

          Rendered only when it is non-zero, so it appears on exactly the days
          it explains something. "מחוץ למתוכנן להיום" and not "מסבב קודם": a row
          published today and stamped TOMORROW is in this count too, and naming
          a previous round would be a false sentence over a true number.
        */}
        {state.todayOnly && (state.publishedOutsidePlanToday ?? 0) > 0 && (
          <p className="mt-1.5 text-xs text-mist-400">
            {`ועוד ${state.outsidePlanIsWhole === false ? 'לפחות ' : ''}${counted(state.publishedOutsidePlanToday ?? 0, 'פרסום אחד', 'פרסומים', 'שני פרסומים')} של הסבב יצאו היום מחוץ למתוכנן להיום`}
          </p>
        )}
        {/*
          THE PAIR IS ABSENT, NOT APPROXIMATE, AND THAT IS THE CORRECTION.

          The first version of this card counted the published groups off the
          rows it was handed whenever v38's column was missing, and said
          "לפחות". Reproduced against the real code: with the counting views
          present and that column absent, a round that had reached 204 of 252
          groups rendered "פורסם לפחות ל-0 מתוך 252 קבוצות היום" — the rows are
          a preview, and for a round whose publications are older than it, an
          empty one. A floor of zero is not a hedge, it is a wrong number.

          So campaignState() now produces no group figure at all in that case,
          the card falls back to the publications ratio it drew before, and
          this paragraph says what is missing and which single file supplies
          it. `!state.truncated` keeps it off a card that is already saying
          its numbers are partial — two paragraphs asking for the same file is
          noise.
        */}
        {!groups.usable && (targetCount ?? 0) > 0 && !state.truncated && (
          <p className="mt-1.5 text-xs text-mist-500">
            {`כדי לראות לכמה מתוך ${targetCount} הקבוצות הפוסט כבר יצא, צריך להריץ פעם אחת את ${LATEST_SCHEMA_FILE} ב-SQL Editor של Supabase. הוא לא מוחק, לא מאפס את התור ולא משנה שום פרסום.`}
          </p>
        )}
        {state.truncated && (
          <p className="mt-1.5 text-xs text-warning-400">
            {state.countsNote === 'db-outdated'
              ? `הספירה כאן מקורבת — צריך להריץ פעם אחת את ${LATEST_SCHEMA_FILE} ב-SQL Editor של Supabase, ואז המספרים יהיו מדויקים. אפשר להריץ אותו גם אם כבר הרצתם: הוא לא מוחק, לא מאפס את התור ולא משנה שום פרסום.`
              : state.countsNote === 'too-many-rounds'
                ? 'יש כאן יותר סבבים ממה שאפשר לספור בבת אחת — פתחו את הסבב כדי לראות את מספריו המדויקים.'
                : state.countsNote === 'read-failed'
                  ? 'לא הצלחנו לקרוא את הספירה המדויקת כרגע — המספרים כאן מקורבים.'
                  : 'הסבב גדול מדי לספירה מלאה כאן — המספרים הם של הפרסומים שנקראו, לא של הסבב כולו. הרשימה המלאה בעמוד הסבב.'}
          </p>
        )}
        {globalPaused && (
          <p className="mt-1.5 text-xs font-bold text-warning-400">כל הפרסומים מושהים — הסבב לא יזוז עד שתפעילו מחדש.</p>
        )}
      </div>

      {/*
        ─── "תזמון פרסום" + "הפרסום הבא יתחיל ב:" ──────────────────────────

        Under the progress and above the actions, which is where the reference
        image puts them and the order the brief spells out:

          [Thumbnail] [שם הקמפיין] [סטטוס] [התחיל לפני X · N קבוצות]
          [50 / 50 טופלו] [100%] [Progress Bar] [פורסמו / דולגו / נכשלו]
          [תזמון פרסום]
          [הפרסום הבא יתחיל ב:]
          [ערוך מועד] [פתח סבב]

        Nothing above this line moved: the cover, the name, the pill, the two
        figures, the segmented bar and the breakdown are the card as it was.
        "אל תעצב מחדש את המסך... השינוי המבוקש הוא בתוך כרטיס הקמפיין במסך
         הראשי בלבד."
      */}
      {schedule && onScheduleChange && (
        <CampaignScheduleBoard
          schedule={schedule}
          onEdit={() => setEditingSchedule((v) => !v)}
          editing={editingSchedule}
          readout={readout}
          campaignName={campaign.name}
          /* "ושיהיה גם טיימר במסך הראשי ליד כרטיסיית הקמפיין שזה סופר את
             ה-3 שעות בגלל המגבלה." It is drawn inside the block below, under
             the instant it contradicts — see NextPublication's own note. */
          frozenUntil={frozenUntil}
          /* מצב פרסום חכם — the readout box that used to print the gap prints
             the mode instead, and the next-publication block under it counts
             down an automatic rest the way it counts down a Meta freeze. */
          pace={paceProfile(pace)}
          restUntil={paceRestUntil}
          /* So the block under it can withdraw its own promise when the PC
             that does the publishing is not connected: "אם המחשב מנותק, יש
             להציג אזהרת חיבור, בלי להבטיח שהפרסום יצא במועד." */
          workerOnline={workerOnline}
          /* THE NAME OF THE BUTTON IN THE ROW BELOW, so the "this does not
             stop the campaign" sentence can point at the control that does —
             and only while that control is actually drawn. `showPause` is the
             same expression the row itself switches on, read once here rather
             than guessed at inside the block. */
          pauseLabel={showPause ? 'השהה סבב' : null}
          /* Neither the window nor the daily repeat can produce a publication
             on a round that has never gone out — the block says so instead of
             reporting a lull. Same expression the editor below is handed, and
             it asks about the round's whole life: see campaign.ts. */
          neverLaunched={neverLaunched(state)}
          /* The same decision, from the same module: a launch whose rows have
             not been written yet. The block then counts from it instead of
             telling him to do the thing he just did. */
          armedAt={launchPending(state, Date.now())}
          disabled={scheduleBusy}
        >
          {/*
            THE EDITOR, IN THE CARD, directly under the button that opened it.
            The same panel the campaigns screen has carried since 3.84.0 — one
            editor, one stored schedule, no second mechanism — and the queue's own
            advanced settings kept reachable from inside it, so repointing the
            button above cost nothing.
          */}
          {canSchedule && editingSchedule && schedule && onScheduleChange && (
            <div className="mt-1">
              <CampaignSchedulePanel
                schedule={schedule}
                onChange={onScheduleChange}
                repeat={repeat}
                onRepeatChange={onRepeatChange}
                /* The per-round figures, off the rows this state was built from.
                   Absent when the state came from the rollup's status counts,
                   which cannot be split by round — and absence is drawn as
                   absence rather than as nought. */
                roundProgress={state.byRound}
                campaignName={campaign.name}
                disabled={scheduleBusy}
                /* …and WHY it is disabled: the blue circle, where he is
                   looking when he changes the hour. */
                busy={scheduleBusy}
                /* The second gate, so the panel can say which of the two is
                   actually deciding — see the note on the prop. */
                accountFloorSeconds={spacing ? accountGapSeconds(spacing, spacing, true) : undefined}
                /* מצב פרסום חכם — the account's publishing mode, the handler
                   that writes it, and the rest it is currently serving. */
                pace={pace}
                onPaceChange={onPaceChange}
                restUntil={paceRestUntil}
                /* The account's own repeat floor, so the card judges the rounds
                   against the number in Settings rather than a constant. */
                floorHours={floorHours}
                /* Neither control below can produce a publication until the round
                   is launched once — a question about its whole life, not today's
                   counter. See campaign.ts. */
                neverLaunched={neverLaunched(state)}
                /* The title and the switch are already in the readout block above
                   this one. Two live switches for one setting on one card is a
                   screen the owner cannot read. */
                showHeader={false}
              />
              {/*
                "הגדרות תור מתקדמות" IS GONE FROM THIS CARD — the owner asked for
                it: "תמחק את הגדרות התור המתקדמות".
                The queue tuner itself is NOT deleted. It is a real tool — it is
                what re-spaces a live queue — so it moved to the ⋯ menu rather
                than being destroyed, and it is still offered from the publish
                sheet the moment a launch queues rows. What the owner wanted back
                is the ROW it was taking at the foot of a card that is already
                nine hundred pixels tall.
              */}
            </div>
          )}
        </CampaignScheduleBoard>
      )}

      {/*
        One row of three: what the run is doing, where to look at it, and when
        it goes out. They were a two-up grid with the tuner on a line of its
        own underneath, which read as an afterthought — and it is the control
        the owner reaches for most, because it is the one that moves a round
        forward. Three across at 375px leaves ~108px each, so these are `md`
        rather than `lg`: still a 44px target, with room for the words.
      */}
      {/* TWO COLUMNS WHEN THERE IS NOTHING TO PAUSE, which is what the
          reference draws — a finished round, "פתח סבב" and "ערוך מועד" filling
          the row. It used to be three columns with an empty cell in the
          middle, so the two buttons sat at two thirds width with a hole
          between them. No button appears or disappears; the row stops
          reserving a slot for one that is not there. */}
      {/* mt-3 → mt-2: the gap above the action row, cut with the rest. */}
      <div className={`mt-2 grid gap-2 [&>*]:min-w-0 ${showResume || showPause ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <ButtonLink href={`/social/campaigns/${campaign.id}`} variant="secondary" size="md" className="justify-center">
          {/* "פתח סבב", the same words the runs list uses for the same URL. */}
          פתח סבב
        </ButtonLink>
        {showResume ? (
          <Button size="md" busy={busy} onClick={onResume} className="justify-center">
            המשך סבב
          </Button>
        ) : showPause ? (
          /* "השהה סבב" — this pauses THIS round. The header's global toggle,
             visible on the same screen, pauses EVERYTHING and used to carry
             the identical word. */
          <Button variant="secondary" size="md" busy={busy} onClick={onPause} className="justify-center gap-1.5">
            <PauseIcon aria-hidden className="h-4 w-4" />
            השהה סבב
          </Button>
        ) : null}
        {canSchedule ? (
          /* With a schedule on the card, this opens the schedule — which is
             what the owner asked it to do by name. The queue tuner it used to
             open is still one tap away inside that editor, and unchanged on
             the system card above. */
          <Button
            variant="secondary"
            size="md"
            onClick={() => setEditingSchedule((v) => !v)}
            aria-expanded={editingSchedule}
            className="justify-center gap-1.5"
          >
            <CalendarIcon aria-hidden className="h-4 w-4" />
            ערוך מועד
          </Button>
        ) : onTune ? (
          <Button variant="secondary" size="md" onClick={onTune} className="justify-center gap-1.5">
            <CalendarIcon aria-hidden className="h-4 w-4" />
            ערוך מועד
          </Button>
        ) : (
          <span />
        )}
      </div>


      {/* The counter belongs to this run, and this run is what the card is
          about. Closing it is how the owner says "that round is done" - the
          next launch of the post opens a fresh run counting from zero, instead
          of adding to a total that only ever grows. */}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          aria-busy={busy || undefined}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-mist-500 transition-colors hover:bg-ink-900 hover:text-mist-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-850 disabled:text-ink-600"
        >
          {/* It only went grey before, which from the outside is a button that
              stopped working. The circle is what says it is running. */}
          {busy && <SpinnerIcon aria-hidden className="h-4 w-4 shrink-0 animate-spin text-brand-400" />}
          סיים את הסבב ואפס את המונה
        </button>
      )}
    </HeroPanel>
  );
}

/**
 * THE SYSTEM CARD — the first thing on the dashboard, and the answer to five
 * of the owner's seven two-second questions.
 *
 * It renders in every state, including with an empty queue: it used to be the
 * else-branch of a ternary, so on the mornings when nothing was scheduled the
 * screen simply had no system state on it at all.
 */
export function LiveQueueHero({
  systemState,
  publishedToday,
  dailyTarget,
  plannedToday,
  pendingCancellable,
  nextAt,
  nextTargetName,
  onRunNow,
  onTune,
  fbAccount = null,
  onRefresh,
  refreshing = false,
  updatedAt = null,
  onResume,
  busy,
  resumeBusy,
  nextTarget,
  onDue,
  inFlight = 0,
  inFlightRows = [],
  flowRows = [],
  workerOnline,
  publishingBlocked = false,
  intervention = null,
  profiles = [],
  onSwitchProfile,
}: {
  systemState: SystemState;
  publishedToday: number;
  dailyTarget: number;
  /**
   * HOW MANY PUBLICATIONS TODAY HAS — done plus still waiting, and nothing else.
   *
   * "אני רוצה שיספור לי כל יום רק את הכמות פוסטים המתוזמנים לאותו היום ואז
   *  יתאפס."
   *
   * The bar measured against `dailyTarget`, which is the ceiling in settings —
   * a number he typed once, months ago, that says nothing about today. "22 מתוך
   * 300" over a day with 48 publications in it reads as 7% done when he is
   * nearly half way, and it never moves relative to anything he recognises.
   *
   * This is the number he actually asked for: what today holds. It resets by
   * construction rather than by a job — tomorrow's publications are not in it
   * and today's are gone from it — and it can never be smaller than what has
   * already gone out, because what has gone out is one of its two halves.
   */
  plannedToday: number;
  /** summary.cancellable — exactly what "delete the queue" would delete. */
  pendingCancellable: number;
  nextAt: string | null;
  nextTargetName: string | null;
  onRunNow?: () => void;
  onResume?: () => void;
  busy?: boolean;
  resumeBusy?: boolean;
  nextTarget?: Pick<SocialTarget, 'name' | 'image_url'> | null;
  /**
   * Fired ONCE when the countdown reaches this row's instant, so the screen
   * can re-read the queue instead of describing the slot from the last poll.
   */
  onDue?: () => void;
  /*
   * No `media`. The system card carried the post's cover too, and measured at
   * 375 it cost the status headline 50px — "נדרשת התערבות" truncated to
   * "נדרשת התערב…", which is the one line on the screen that must survive a
   * glance. Two cards with a thumbnail, a dot and a bar each also read as one
   * thing repeated: the system card owns the dot and the daily bar, the run
   * card owns the thumbnail and the per-run bar, and neither owns both.
   */
  /**
   * Opens the queue tuner for the row this panel is about.
   *
   * It used to be reachable only by tapping the countdown box. That box is
   * gone, and for one commit the ONLY way into the tuner was the run card —
   * which renders only when a run is featured, so a queue with no featured run
   * had no way at all to change its interval or bring it forward. A control
   * the owner can use must not depend on another card being on screen.
   */
  onTune?: () => void;
  /**
   * Ask for fresh numbers, and say how old the ones on screen are.
   *
   * This pair used to be a centred row of its own between two cards, and it
   * read as a status bar the product does not otherwise have — the owner's
   * words were "it just sits there irritating the eye". The CONTROL cannot go:
   * the dashboard stops polling while the tab is hidden, so a screen returned
   * to after locking the phone needs a way to ask again. It moves into this
   * card's corner as an icon, and the age it used to print in the middle of
   * the page is now the button's accessible name, where it informs the people
   * who need it and interrupts nobody.
   */
  onRefresh?: () => void;
  refreshing?: boolean;
  updatedAt?: Date | null;
  /**
   * The Facebook account the PC's browser is signed in as.
   *
   * `workerOnline` says the machine is there; this says WHOSE session it is
   * publishing with — every group post goes out under this name, and on a
   * shared computer those are two different questions. Null when no worker has
   * reported one, in which case the chip says only what it knows.
   */
  fbAccount?: { name: string; avatar: string } | null;
  /*
   * EVERY IDENTITY THIS ACCOUNT CAN PUBLISH AS, as the machine last read them
   * out of Facebook's own menu. Empty means nobody has looked — which the
   * panel says in those words rather than as "there is only one", because
   * those are different facts and only one of them is about the account.
   */
  profiles?: { name: string; kind?: 'profile' | 'page'; image?: string }[];
  /** Ask the machine to move onto one. Absent while nothing can be asked. */
  onSwitchProfile?: (name: string) => void;
  /**
   * THE QUEUE AS THE REFERENCE DRAWS IT — the last one that finished, the one
   * going out, the one after it. Built on the screen above, because that is
   * where the three reads live (doneToday, inFlightRows, upcoming); this
   * panel draws rows, it does not decide which rows exist.
   */
  flowRows?: readonly FlowRow[];
  /** The four figures under it, counted in the database by that same screen. */
  /** Rows a worker is holding right now (summary.inFlight). */
  inFlight?: number;
  /**
   * THOSE SAME ROWS, so the card can say WHAT is going out and how far in.
   *
   * "שזה מחפש / טוען / מפרסם זה נראה כאילו זה נתקע." The count alone made the
   * headline flip to "רובוט בפעולה" and the scene start looping, and then
   * nothing on this card moved again until the publication finished — a
   * minute, sometimes several. The scene is an idle animation by design and
   * asserted nothing about progress (the stage's own header said so), so
   * between 'opening' and 'verifying' there was no difference on screen
   * between a machine working and a machine wedged.
   *
   * Each row carries `step` — the stage the worker is actually on — and
   * `step_at`, the instant it reached it. Both are already in the lean select
   * and neither was read anywhere on this screen.
   */
  inFlightRows?: QueueRow[];
  /**
   * READ FOR ONE THING ONLY: WHICH KIND OF STOP THIS IS.
   *
   * It used to decide the headline, and that was the bug — a heartbeat says
   * the PC is awake, which it is for most of a day in which almost nothing is
   * being published, so the card read "רובוט בפעולה" over a morning with
   * nothing published at all. That decision is gone and is not coming back:
   * the headline is `inFlight`, and the sleeping-PC case moved upstream,
   * where page.tsx turns an offline worker with a queue into
   * `needs_intervention` before this panel is asked anything.
   *
   * What it answers NOW is narrower and only ever asked once the dashboard
   * has already said a person is needed: is the missing thing the machine?
   * If it is, the scene draws the disconnected robot rather than the "waiting
   * for you" one. It can never put the robot to work — look at the ladder in
   * sceneState.ts: `workerOnline` is read in one branch and only to choose
   * between two stopped states.
   */
  workerOnline?: boolean;
  /**
   * What needs a person, and the one place to go and do it.
   *
   * `onAction` is present only when following the link ANSWERS the warning —
   * today that is the "N פרסומים ממתינים לכם" bar, whose rows the screen
   * behind the link lists in full, so arriving there is the same event as
   * having been shown them. The other four cannot be answered by reading
   * anything (a sleeping PC, a Chrome asking for a login) and must keep
   * saying so until the machine's own state changes, so they omit it.
   */
  intervention?: { title: string; body: string; actionLabel: string; href: string; onAction?: () => void } | null;
  /**
   * THE INTERVENTION ABOVE ALSO STOPS PUBLISHING.
   *
   * Carried, not decided: page.tsx raises `needs_intervention` for five
   * different things and only some of them stop the engine. The robot below
   * reads this to tell "the machine is stopped" from "something is waiting
   * for you while the machine works" — see sceneState.ts, and the afternoon
   * on 06/11 when it could not.
   *
   * Defaults to false, which is the honest answer for a caller that does not
   * know: the robot then reports what the machine is doing, and the headline
   * still names what needs a person.
   */
  publishingBlocked?: boolean;
}) {
  const paused = systemState === 'paused';
  /* Also while something is in flight: the stage counter below needs a beat,
     and without this the card ticks only when a NEXT publication is known. */
  const now = useTick((Boolean(nextAt) || inFlightRows.length > 0) && !paused);
  const tone = SYSTEM_STATE_TONE[systemState];
  /* The profile picker's open state and its Escape handler lived here. Both
     went with the chip — a window listening for a key that can no longer open
     anything is the kind of thing that outlives three refactors. */
  /*
   * "IN ACTION" IS A ROW IN A WORKER'S HANDS, AND NOTHING ELSE.
   *
   * This used to be `inFlight > 0 || workerOnline === true` — a heartbeat
   * counted. On his own screen that read "רובוט בפעולה" over 0 of 268
   * published, at six in the morning, because the PC was switched on. The
   * heartbeat is a true fact about the machine and the wrong fact for this
   * sentence: it is awake almost all day, and the gaps between publications
   * are most of that day.
   *
   * The sleeping-PC case the heartbeat was guarding is not lost — it moved
   * upstream and got stronger. page.tsx turns an offline worker with a queue
   * into `needs_intervention` outright, so by the time this panel is in its
   * `active` branch the machine is up; what is left to say is whether it is
   * carrying anything.
   */
  const publishing = inFlight > 0;
  /*
   * The owner's own ceiling has been reached. rules.ts SKIPS a row whose slot
   * arrives past the cap, so this is not a pause that catches up later — and
   * the screen said nothing at all about it. The wording keeps house rule 2:
   * the number is theirs, not Meta's.
   */
  const ceilingReached = dailyTarget > 0 && publishedToday >= dailyTarget;
  /*
   * ──────────────────────────────────────────────────────────────────────
   * "מתי שזה מסיים את כל המטלות פרסום, תרשום הרובוט סיים לפרסם."
   *
   * THE ONE CLAIM THIS PANEL MAKES THAT IS ABOUT THE WHOLE DAY, so it is
   * built out of the two numbers printed six lines below it and nothing else:
   *
   *   plannedToday = what has gone out + what is still waiting for today
   *                  (page.tsx: `today + waitingToday`)
   *   publishedToday = what has gone out
   *
   * so `publishedToday >= plannedToday` is exactly `waitingToday === 0` —
   * today has no row left waiting. That is a database fact, re-read every
   * thirty seconds, not a timer and not a guess.
   *
   * THE THREE GUARDS, each of which has a scenario behind it:
   *
   *   `inFlight === 0` — a row a worker is HOLDING is not waiting, so it is
   *     not in plannedToday. Without this the panel would dance while the
   *     worker was mid-publication on the last post of the day.
   *   `plannedToday > 0` — a day that planned nothing did not finish
   *     anything. "הרובוט סיים לפרסם" over a day with no posts in it is a
   *     congratulation for doing nothing.
   *   `systemState === 'active'` — paused, empty and needs-attention each
   *     have something truer to say, and they already say it.
   *
   * WHAT IT DOES NOT CLAIM, stated here so nobody reads more into it later:
   * it does not say every post SUCCEEDED. Rows that failed are neither
   * published nor waiting, so they leave this sum entirely — the red
   * "נכשלו היום" tile above is where they are counted, and it keeps counting
   * them while this says the queue is empty. Both are true at once.
   */
  const dayDone = systemState === 'active' && plannedToday > 0 && publishedToday >= plannedToday && inFlight === 0;
  /*
   * WHAT THE SCENE IS ALLOWED TO SHOW, from the same facts the sentence above
   * the panel is made of — never from a timer of its own.
   *
   * `sending` and `preparing` are both "a worker is holding a row right now",
   * split by the stage THAT WORKER REPORTED: before the final click the post
   * has not been submitted to anything, so the scene holds it in the robot's
   * hand instead of flying it to a group. `waiting` is the system running
   * between publications, which is most of the day: the robot stays alive and
   * nothing travels, because nothing is. `done` is `dayDone` above and is
   * asked after the states that stop everything, so an empty evening queue
   * reads as finished rather than as an endless `waiting`. `offline` and
   * `error` are the dashboard's own `needs_intervention`, split by whether
   * the machine is the thing that is missing. Paused and idle stop it
   * entirely. A scene that animated on a clock would be telling him his posts
   * were going out on an afternoon when the PC was off.
   *
   * THE LADDER ITSELF IS IN sceneState.ts, with the stage list beside it, so
   * it can be read against the engine's own steps and tested without a
   * browser. This card hands it facts and renders what comes back.
   */
  const sceneMode: SceneMode = sceneModeFor({
    systemState,
    workerOnline,
    /* Whether the thing that needs a person also STOPS the engine. Decided by
       the page, which knows which of the five causes it raised — see the
       field's own note in sceneState.ts. */
    publishingBlocked,
    dayDone,
    /*
     * THE STAGE OF EVERY ROW A WORKER IS HOLDING, which is what tells
     * `preparing` from `sending` — the worker writes it to the row as it
     * goes, and the line directly above this scene already prints it in
     * words. Two surfaces, one fact.
     *
     * A caller that counts the rows without listing them still gets exactly
     * the behaviour this card has always had: a null stage is not a
     * preparing stage, so it reads as a publication in progress, which is
     * what "a worker is holding a row and has told us nothing else" means.
     */
    inFlightSteps:
      inFlightRows.length > 0
        ? inFlightRows.map((row) => row.step ?? null)
        : Array.from({ length: Math.max(0, inFlight) }, () => null),
  });
  const due = Boolean(nextAt) && !paused && new Date(nextAt as string).getTime() <= now;
  /*
   * AT ZERO, THE DATABASE DECIDES WHAT COMES NEXT.
   *
   * The countdown is a local clock: it reached 00:00 and the card then
   * described the slot from the PREVIOUS poll's numbers — an inFlight count up
   * to 30s old and a heartbeat up to 90s old. It never claimed the publication
   * had succeeded (there is no "פורסם" path here, by design), but it was an
   * unverified claim about automation in progress. This fires once per
   * instant, and the screen above re-reads the queue; what replaces the
   * countdown is then read rather than assumed.
   */
  const dueSignalled = useRef<string | null>(null);
  useEffect(() => {
    if (!due || !nextAt || dueSignalled.current === nextAt) return;
    dueSignalled.current = nextAt;
    onDue?.();
  }, [due, nextAt, onDue]);

  /*
   * ─── WHAT THE HEADLINE COUNTS ─────────────────────────────────────────
   *
   * "פרסום אחד ממתין לכם" — the reference's own first line, and the number
   * in it is the queue's, not a mood: today's plan minus what has already
   * gone out. A finished day and an empty queue are different sentences,
   * because they are different facts, and neither is "0 ממתינים".
   */
  const waitingToday = Math.max(0, plannedToday - publishedToday);
  const headline =
    systemState === 'empty'
      ? 'אין פרסום מתוזמן'
      : systemState === 'paused'
        ? 'שום דבר לא יוצא עד שתפעילו'
        : plannedToday === 0
        ? /* A DAY WITH NOTHING IN IT IS NOT A FINISHED ONE. 0 of 0 would have
             read as "הרובוט סיים לפרסם היום" over a queue that never had
             anything in it — a claim about work that was never there. Caught
             by today-count.test.ts the hour this card replaced the bar. */
          'אין פרסומים מתוכננים להיום'
        : dayDone || waitingToday === 0
          ? 'הרובוט סיים לפרסם היום'
          : `${counted(waitingToday, 'פרסום אחד', 'פרסומים', 'שני פרסומים')} ${agree(waitingToday, 'ממתין', 'ממתינים')} לכם`;

  /*
   * THE PUBLICATION GOING OUT RIGHT NOW. One row, the first a worker is
   * holding — the reference draws one card and there is no honest way to
   * draw two in it. `step` is what the worker last wrote on that row, and it
   * is the only thing the bar under the card is ever filled from.
   */
  /*
   * AND ONLY WHILE THE ENGINE IS REALLY ON IT.
   *
   * A row stays "in flight" in the database when the machine dies holding it,
   * so a disconnected PC drew a card reading "שולח פוסט לקבוצה…" over a
   * progress bar — a publication in progress on a computer that is switched
   * off. Caught in the screenshot comparison against the reference, which is
   * what that comparison is for. The scene mode is the panel's own verdict on
   * whether anything is being published, and it is the gate.
   */
  const working = sceneMode === 'preparing' || sceneMode === 'sending';
  const live = working ? (inFlightRows[0] ?? null) : null;
  /* `now` up there is the clock this panel ticks on; this one is a row. */
  const nowRow = live
    ? {
        name: live.target?.name ?? 'קבוצה',
        step: (live.step ?? null) as QueueStep | null,
        cover: live.post?.media?.find((m) => m.kind === 'image')?.url ?? null,
        /* And the group's picture behind it, for the square the post's own
           picture leaves empty — which is most publications. */
        image: live.target?.image_url ?? null,
      }
    : null;

  return (
    /*
     * NO WHITE CARD AROUND IT ANY MORE. The first reference put every part
     * inside one; this one stands them on the page as separate blocks — a
     * banner, a row of stations, the publication going out, the queue, four
     * figures — each with its own surface. Wrapping them would put a card
     * inside a card, which is the one thing the reference plainly does not do.
     */
    <section aria-label="מצב המערכת">
      {/*
        ─── THE WHOLE CARD IS THE REFERENCE NOW ──────────────────────────
        
        "התמונה המצורפת היא מפרט העיצוב הסופי והמחייב … יש להתייחס לתמונה
         כאל מקור האמת של ממשק המשתמש."
        
        What stood here — a headline, the character on a stage of his own, a
        ratio, a bar out of the day's plan — is the same information in the
        order the reference puts it in: the headline, the character beside
        the Live Flow lockup, four stations, the publication going out, the
        queue, four figures. Nothing was invented to fill it and nothing real
        was dropped to fit it: every number below is one this panel was
        already being handed.
      */}
      <LiveFlow
        mode={sceneMode}
        headline={headline}
        now={nowRow}
        /* Same gate on the list: a row the machine stopped holding is still
           queued, and drawing it with a spinner would say a dead worker is
           working. It goes back to being the next one up, which it is. */
        rows={working ? flowRows : flowRows.map((r) => (r.state === 'live' ? { ...r, state: 'next' as const, note: null } : r))}
      />

      {ceilingReached && (
        <p className="mt-2.5 text-[11px] font-bold leading-[15px] text-warning-400">
          הגעתם לתקרה היומית שהגדרתם. פרסומים שזמנם יגיע היום ימתינו למחר — אפשר להעלות את התקרה בהגדרות.
        </p>
      )}
      {/* House rule 2, verbatim, and it stays: the ceiling is a limit and not
          a plan, and this is the one line on the screen that says so. It is
          in the reference too — the last words under the card are its tail. */}
      <p className="mt-2 text-[11px] leading-[15px] text-mist-500">
        המגבלה היומית ({dailyTarget}) היא מספר שאתם קובעים בהגדרות — היא לא מכסה רשמית של פייסבוק.
      </p>

      {systemState === 'paused' && (
        <div className="mt-3">
          <Button size="lg" className="w-full" busy={resumeBusy} onClick={onResume}>
            הפעל פרסום
          </Button>
          <p className="mt-1.5 text-center text-xs text-mist-500">
            {pendingCancellable > 0
              ? `${counted(pendingCancellable, 'פרסום אחד', 'פרסומים', 'שני פרסומים')} ${agree(pendingCancellable, 'לא יצא', 'לא יצאו')} עד שתפעילו.`
              : 'שום דבר לא ממתין בתור.'}
          </p>
        </div>
      )}

      {systemState === 'needs_intervention' && intervention && (
        <div className="mt-3 rounded-xl border border-warning-400/30 bg-warning-400/12 px-3 py-2.5">
          <p dir="auto" className="text-[13px] font-extrabold leading-[17px] text-warning-400">{intervention.title}</p>
          <p dir="auto" className="mt-0.5 text-xs leading-4 text-mist-300">{intervention.body}</p>
          <Link
            href={intervention.href}
            /* Marked on the way out, not on the way back: the click is the
               event, and a person who opens the list and then uses the back
               button has still been shown it. */
            onClick={intervention.onAction}
            className="mt-1 inline-flex min-h-11 min-w-11 items-center gap-0.5 text-[13px] font-extrabold text-warning-400"
          >
            {intervention.actionLabel}
            <ChevronIcon aria-hidden className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      )}

      {systemState === 'empty' && (
        <div className="mt-3 rounded-xl bg-ink-900 px-3 py-3.5 text-center">
          {/* No clock, no 00:00, no group name. The + פוסט חדש button above is
              the action; a second one here would just be louder. */}
          <p className="text-[13px] leading-[18px] text-mist-300">התור ריק — אין פרסום מתוזמן.</p>
          <p className="mt-0.5 text-xs leading-4 text-mist-500">צרו פוסט, בחרו קבוצות ותזמנו — השעה של הפרסום הבא תופיע כאן.</p>
        </div>
      )}

      {/*
        THE COUNTDOWN BOX IS GONE FROM HERE, THE GUARANTEE BEHIND IT IS NOT.

        "הפרסומים הקרובים" below now lists every waiting row with its own live
        countdown, and the run card carries the tuner, so this box was a third
        copy of the next publication on one screen. What it also carried was
        `onDue` — the effect above that re-reads the queue the instant a slot
        arrives, so what replaces a finished countdown is READ rather than
        assumed. That effect stays; it simply has no picture any more.

        "הרץ עכשיו" is kept, because nothing else on the screen can do it: it
        runs one worker tick over rows whose time has already come, and it
        appears only in the minutes when there is such a row.
      */}
      {/*
        THE TWO BUTTONS THAT STOOD HERE ARE GONE — "ערוך מועד ומרווח" and
        "הרץ עכשיו" — because he asked for them gone, in those words.

        WHAT WENT WITH THEM, said plainly rather than discovered later: the
        tuner is still reachable from the campaign screen, and "הרץ עכשיו" ran
        ONE worker tick over rows whose time had already come. This panel was
        the only place that offered that; the "הרץ עכשיו" in a publication
        row's ⋯ menu is a different action, which re-queues a single row. So a
        slot that has arrived while the worker is mid-sleep now waits for its
        next tick instead of being nudged. That is a minute, not a day.

        `onDue` is untouched: the effect that re-reads the queue the instant a
        slot arrives still runs, so what replaces a finished countdown is still
        READ rather than assumed. The props stay on the component — the screen
        still passes them and the campaign screen still uses them.
      */}
    </section>
  );
}
