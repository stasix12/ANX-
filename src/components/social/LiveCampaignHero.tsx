'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CalendarIcon, ChevronIcon, PauseIcon, RepeatIcon } from '@/components/icons';
import { canPauseRun, canResumeRun, openRows, runBadge, runProgress, type CampaignState, type RunTone } from '@/lib/social/campaign';
import { nextPublishAt, type CampaignSchedule } from '@/lib/social/campaign-schedule';
import { countdownTo } from '@/lib/social/countdown';
import { agree, counted, formatTimeHe, relativeHe } from '@/lib/social/time';
import type { Campaign, MediaItem, SocialTarget } from '@/lib/social/types';
import { CampaignScheduleBoard } from './CampaignScheduleBoard';
import { CampaignSchedulePanel } from './CampaignSchedulePanel';
import { PostCover } from './PostCover';
import { TargetAvatar } from './TargetAvatar';
import { Button, ButtonLink, CARD, ProgressBar, TONE_FILL, TONE_TEXT, TONE_TINT, type Tone } from './ui';
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
function StatePill({ tone, label, live }: { tone: Tone; label: string; live: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${TONE_TINT[tone]} ${TONE_TEXT[tone]}`}
    >
      {live && <span aria-hidden className={`pulse-dot h-1.5 w-1.5 rounded-full ${TONE_FILL[tone]}`} />}
      {label}
    </span>
  );
}

/**
 * campaign.ts's tone vocabulary still carries `info` as a legacy name for the
 * same blue `brand` resolves to (Badge does the same collapse). One place to
 * fold it, so the pill cannot pick a fifth hue.
 */
const toneOf = (t: RunTone): Tone => (t === 'info' ? 'brand' : t);

/** "18 / 125" is digits around a neutral slash, which an RTL line reorders. */
function Ratio({ done, total, suffix }: { done: number; total: number; suffix: string }) {
  return (
    <p className="text-sm font-bold text-mist-500">
      <span dir="ltr" className="inline-block">
        <span className="text-[28px] font-extrabold leading-none tabular-nums text-mist-100">{done}</span>
        <span> / {total}</span>
      </span>
      <span> {suffix}</span>
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
  const view = runProgress(progress);
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
  const lastPublishedAt = state.done.find((r) => r.published_at)?.published_at ?? null;
  const nextAt: string | null = (() => {
    if (!state.nextAt) return null;
    if (!schedule?.enabled) return state.nextAt;
    /* A row whose instant has already passed publishes at the next legal
       moment from NOW, not from the moment it missed. */
    const from = new Date(Math.max(new Date(state.nextAt).getTime(), Date.now()));
    const at = nextPublishAt(schedule, from, lastPublishedAt ? new Date(lastPublishedAt) : null);
    return at ? at.toISOString() : null;
  })();
  /* Something IS waiting and the schedule permits no day at all, which is a
     setting rather than an empty queue and gets its own words. */
  const noDay = Boolean(schedule?.enabled && state.nextAt && !nextAt);

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
  const [editingSchedule, setEditingSchedule] = useState(false);

  return (
    <HeroPanel ariaLabel="הסבב הפעיל" className="p-3.5">
      <div className="flex items-start gap-3">
        <PostCover media={media} className="h-16 w-16 sm:h-24 sm:w-24" />
        <div className="min-w-0 grow">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <Link href={`/social/campaigns/${campaign.id}`} dir="auto" className="block min-h-11 min-w-0 truncate py-1.5 text-[15px] font-extrabold leading-5 text-mist-100">
              {campaign.name}
            </Link>
            <StatePill tone={pillTone} label={badge.label} live={badge.live} />
          </div>
          {/* When the run started, and how many GROUPS it publishes to — both
              facts the card loaded and never showed. `startedAt` is null until
              the first real publication, and the honest line then says so
              rather than substituting the record's creation time, which can
              be days earlier. */}
          <p dir="auto" className="truncate text-xs leading-4 text-mist-500">
            {/* Two facts, not four. The service and the city used to be
                appended here and, measured at 375, they pushed "30 קבוצות"
                into an ellipsis — decoration crowding out the two things the
                owner asked this line for. They are on the run's own screen,
                one tap away. */}
            {[startedAt ? `התחיל ${relativeHe(startedAt)}` : 'טרם יצא פרסום', targetCount && !state.truncated ? counted(targetCount, 'קבוצה אחת', 'קבוצות', 'שתי קבוצות') : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <Ratio done={view.handled} total={view.total} suffix={agree(view.handled, 'טופל', 'טופלו')} />
          <p className="text-lg font-extrabold tabular-nums text-brand-400">{view.percent}%</p>
        </div>
        {/* Segmented, and that is forced by the figure above it: a single
            green fill drawn at the HANDLED ratio would paint a failed row
            green. The same three segments the runs list draws, from the same
            tone maps, so the two bars now mean the same thing on both
            screens. Their total width is view.percent by construction. */}
        <div className="mt-2">
          <ProgressBar
            segments={[
              { value: progress.published, className: TONE_FILL.good },
              { value: progress.failed, className: TONE_FILL.bad },
              { value: progress.skipped, className: TONE_FILL.neutral },
            ]}
            total={progress.total}
            ariaLabel={view.ariaLabel}
            height="h-2.5"
          />
        </div>
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
        <p className="mt-1.5 text-xs text-mist-500">
          {[view.publishedLabel, view.note, open > 0 ? `${open} עוד לא יצאו` : ''].filter(Boolean).join(' · ')}
        </p>
        {state.truncated && (
          <p className="mt-1.5 text-xs text-warning-400">
            הסבב גדול מכדי לספור אותו כאן במלואו — המספרים למעלה הם של הפרסומים הראשונים בלבד. הרשימה המלאה בעמוד הסבב.
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
          onToggle={(enabled) => onScheduleChange({ ...schedule, enabled })}
          onEdit={() => setEditingSchedule((v) => !v)}
          editing={editingSchedule}
          nextAt={nextAt}
          noDay={noDay}
          campaignName={campaign.name}
          disabled={scheduleBusy}
        />
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
      <div className={`mt-3 grid gap-2 [&>*]:min-w-0 ${showResume || showPause ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
            campaignName={campaign.name}
            disabled={scheduleBusy}
            /* The title and the switch are already in the readout block above
               this one. Two live switches for one setting on one card is a
               screen the owner cannot read. */
            showHeader={false}
          />
          {onTune && (
            <Button variant="secondary" size="sm" onClick={onTune} className="mt-1.5 w-full justify-center gap-1.5">
              <RepeatIcon aria-hidden className="h-3.5 w-3.5" />
              הגדרות תור מתקדמות
            </Button>
          )}
        </div>
      )}

      {/* The counter belongs to this run, and this run is what the card is
          about. Closing it is how the owner says "that round is done" - the
          next launch of the post opens a fresh run counting from zero, instead
          of adding to a total that only ever grows. */}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="mt-2 min-h-11 w-full rounded-xl text-sm font-bold text-mist-500 transition-colors hover:bg-ink-900 hover:text-mist-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-850 disabled:text-ink-600"
        >
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
  workerOnline,
  intervention = null,
  profiles = [],
  onSwitchProfile,
}: {
  systemState: SystemState;
  publishedToday: number;
  dailyTarget: number;
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
  /** Rows a worker is holding right now (summary.inFlight). */
  inFlight?: number;
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
}) {
  const paused = systemState === 'paused';
  const now = useTick(Boolean(nextAt) && !paused);
  const tone = SYSTEM_STATE_TONE[systemState];
  const [pickerOpen, setPickerOpen] = useState(false);
  /* Escape closes it, like every other overlay in this app. Bound only while
     it is open, so the screen is not listening for a key nobody pressed. */
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen]);
  /*
   * "Live" is a claim about a machine, so it is made from a machine fact: a
   * row in flight, or a worker heartbeat. A queue with rows in it only ever
   * said that rows exist — which is equally true of a queue stuck since Friday.
   */
  const live = systemState === 'active' && (inFlight > 0 || workerOnline === true);
  /*
   * The owner's own ceiling has been reached. rules.ts SKIPS a row whose slot
   * arrives past the cap, so this is not a pause that catches up later — and
   * the screen said nothing at all about it. The wording keeps house rule 2:
   * the number is theirs, not Meta's.
   */
  const ceilingReached = dailyTarget > 0 && publishedToday >= dailyTarget;
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

  return (
    <HeroPanel ariaLabel="מצב המערכת">
      {/*
        WHAT IT IS DOING — not what state it is in.

        This line used to be the state itself ("המערכת פעילה") with the
        activity underneath it in grey. The identity bar at the top of every
        screen now carries the state, from the same value this card was
        handed, so printing it again 300px lower was the same sentence twice
        before the owner reached anything they did not already know — which
        is what they said, in those words.

        The state and the activity are different facts and the split is the
        point: the bar says whether the system is running, this says what it
        is running ON right now. The dot went with the label, for the same
        reason — the bar has one, in the same tone, from the same state.

        "+ פוסט חדש" used to live here too. It moved up into the pair of
        primary actions above this panel, so the screen offers it once.
      */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0">
            <h2 dir="auto" className="min-w-0 truncate text-[17px] font-extrabold leading-[22px] text-mist-100">
              {systemState === 'active'
                ? live
                  ? 'מפרסם כעת לקבוצות פייסבוק'
                  : 'התור מלא — ממתין לתורו של הפרסום הבא'
                : systemState === 'paused'
                  ? 'שום דבר לא יוצא עד שתפעילו'
                  : systemState === 'empty'
                    ? 'אין פרסום מתוזמן'
                    : (intervention?.title ?? 'נדרשת פעולה שלכם')}
            </h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onRefresh && (
            <button
              type="button"
              disabled={refreshing}
              onClick={onRefresh}
              aria-label={updatedAt ? `רענן עכשיו — הנתונים עודכנו ${relativeHe(updatedAt.toISOString())}` : 'רענן עכשיו'}
              className="grid h-11 w-11 place-items-center rounded-xl text-mist-500 transition-colors hover:bg-ink-900 hover:text-mist-300 disabled:opacity-60"
            >
              <RepeatIcon aria-hidden className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        {/*
          TWO FACTS, ONE CHIP, AND THEY ARE NOT THE SAME FACT.

          The colour is about the MACHINE — whether the PC that publishes to
          groups has sent a heartbeat. The face and the name are about the
          ACCOUNT its browser is signed in as, which is what every group post
          goes out under. A shared computer, or somebody signing in as the
          wrong person, makes those two answers diverge, and the chip used to
          be able to say only the first.

          With no account reported the chip is exactly what it was. It never
          fills that gap with a placeholder face or a guessed name.
        */}
        {/*
         * THE CHIP IS THE SWITCHER, not a way to a screen that has one.
         *
         * "אני לוחץ למעלה במסך הראשי … אני רוצה שיפתח חלון צף אם המשתמשים /
         * דפים שאני יכול לעבור אליהם." It already carries a swap icon and
         * already names the identity every post goes out under, so sending
         * somebody two screens away to change it was the wrong shape: the
         * control that states the fact is the one that should change it.
         *
         * The full screen stays, and this panel links to it. What lives only
         * there is everything switching is NOT — signing in, disconnecting,
         * answering a security check.
         */}
        <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          aria-haspopup="menu"
          aria-label={fbAccount ? `מפרסם בתור ${fbAccount.name} — החלפת פרופיל` : 'בחירת פרופיל'}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl ps-1.5 pe-2 text-[13px] font-extrabold ${
            workerOnline ? 'bg-success-400/12 text-success-400' : 'bg-warning-400/12 text-warning-400'
          }`}
        >
          {fbAccount ? (
            <>
              {fbAccount.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fbAccount.avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
              ) : (
                <TargetAvatar name={fbAccount.name} size={24} />
              )}
              <span dir="auto" className="max-w-[7.5rem] truncate">{fbAccount.name}</span>
            </>
          ) : (
            <span className="ps-1">{workerOnline ? 'מחובר' : 'לא מחובר'}</span>
          )}
          <ChevronIcon aria-hidden className={`h-4 w-4 transition-transform ${pickerOpen ? '-rotate-90' : 'rtl:rotate-180'}`} />
        </button>
        {pickerOpen && (
          <>
            {/*
              `fixed` would be wrong here and it is worth saying why: an
              ancestor with backdrop-filter becomes the containing block for
              fixed children, and this card sits inside one. The backdrop would
              size itself to the header instead of the screen, and a tap
              outside would land on nothing.
            */}
            <button
              type="button"
              aria-label="סגירה"
              onClick={() => setPickerOpen(false)}
              className="absolute inset-x-0 top-full z-40 h-screen w-screen cursor-default"
            />
            {/* The same frosted panel as the bar's — this is the same switcher,
                reached from the card instead of from the picture. Two looks for
                one popup is the thing that would need explaining. */}
            <div
              role="menu"
              className="glass-switcher absolute end-0 top-full z-50 mt-1.5 w-64 rounded-2xl border border-ink-700 p-1.5 motion-safe:animate-[rise_0.18s_ease-out]"
            >
              {profiles.length ? (
                profiles.map((p) => {
                  const active = Boolean(fbAccount?.name) && p.name === fbAccount?.name;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      role="menuitem"
                      disabled={active || !onSwitchProfile}
                      onClick={() => {
                        setPickerOpen(false);
                        onSwitchProfile?.(p.name);
                      }}
                      className={`flex w-full min-h-11 items-center gap-2 rounded-xl px-2 text-start text-[13px] font-bold ${
                        /* Same as the bar's picker: on a panel that lets light
                           through, 12% is half a tint. */
                        active ? 'bg-success-400/20 text-success-400' : 'text-mist-100 hover:bg-ink-800'
                      }`}
                    >
                      {/* That identity's own logo when the computer
                          photographed one out of Facebook's menu; the generated
                          circle otherwise. The same rule as the header's picker
                          — a real picture or an initial, never a stand-in face. */}
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-[22px] w-[22px] shrink-0 rounded-full object-cover ring-1 ring-ink-700" />
                      ) : (
                        <TargetAvatar name={p.name} size={22} />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span dir="auto" className="truncate">{p.name}</span>
                        {p.kind === 'page' && <span className="text-[10px] font-bold text-mist-500">דף עסקי</span>}
                      </span>
                      {active && <span className="shrink-0 text-[10px] font-extrabold">מפרסם</span>}
                    </button>
                  );
                })
              ) : (
                /* Never "you have only one" — nobody has looked yet, and the
                   screen that can look says so in its own words. */
                <p className="px-2 py-3 text-[12px] leading-relaxed text-mist-300">
                  עוד לא קראנו אילו פרופילים יש בחשבון. פתחו את מסך החשבון ולחצו "חפש פרופילים".
                </p>
              )}
              <Link
                href="/social/account"
                onClick={() => setPickerOpen(false)}
                className="mt-1 flex min-h-11 items-center justify-center rounded-xl text-[12px] font-bold text-brand-400 hover:bg-ink-800"
              >
                מסך החשבון
              </Link>
            </div>
          </>
        )}
        </div>
        </div>
      </div>

      <div className="mt-3.5">
        <Ratio done={publishedToday} total={dailyTarget} suffix={`${agree(publishedToday, 'פורסם', 'פורסמו')} היום, מתוך התקרה שהגדרתם`} />
        {/*
          The bar CLAMPS ITS WIDTH AND NEVER ITS NUMBER. `today > maxPerDay` is
          reachable in real data — markManualPublished() and publishNow() go
          round the rules engine, and the owner can lower the cap in settings
          after publishing — so the figure above prints the true count while
          only the fill is bounded. ProgressBar's own Math.max(1, total) keeps
          a cap of 0 from dividing.
        */}
        <div className="mt-2">
          <ProgressBar
            segments={[{ value: Math.min(publishedToday, dailyTarget), className: paused ? 'bg-mist-500' : 'bg-success-400' }]}
            total={dailyTarget}
            ariaLabel={`${publishedToday} מתוך ${dailyTarget} ${agree(publishedToday, 'פורסם', 'פורסמו')} היום`}
            height="h-2.5"
          />
        </div>
        {ceilingReached && (
          <p className="mt-1.5 text-[11px] font-bold leading-[15px] text-warning-400">
            הגעתם לתקרה היומית שהגדרתם. פרסומים שזמנם יגיע היום ימתינו למחר — אפשר להעלות את התקרה בהגדרות.
          </p>
        )}
        {/* House rule 2, verbatim, and now directly under the ceiling it is
            about instead of 11px-tall under a grid of four tiles. */}
        <p className="mt-1.5 text-[11px] leading-[15px] text-mist-500">
          המגבלה היומית ({dailyTarget}) היא מספר שאתם קובעים בהגדרות — היא לא מכסה רשמית של פייסבוק.
        </p>
      </div>

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
      {nextAt && onTune && !paused && systemState !== 'empty' && (
        <Button variant="secondary" size="md" className="mt-3 w-full justify-center gap-1.5" onClick={onTune}>
          <CalendarIcon aria-hidden className="h-4 w-4" />
          ערוך מועד ומרווח
        </Button>
      )}

      {due && onRunNow && !paused && systemState !== 'empty' && (
        <Button variant="secondary" size="md" className="mt-2 w-full" busy={busy} onClick={onRunNow}>
          הרץ עכשיו
        </Button>
      )}
    </HeroPanel>
  );
}
