'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CalendarIcon, ChevronIcon, PauseIcon } from '@/components/icons';
import { canPauseRun, canResumeRun, openRows, runBadge, runProgress, type CampaignState, type RunTone } from '@/lib/social/campaign';
import { countdownTo } from '@/lib/social/countdown';
import { agree, counted, formatTimeHe, relativeHe } from '@/lib/social/time';
import type { Campaign, MediaItem, SocialTarget } from '@/lib/social/types';
import { PostCover } from './PostCover';
import { TargetAvatar } from './TargetAvatar';
import { Button, ButtonLink, CARD, ProgressBar, TONE_FILL, TONE_TEXT, TONE_TINT, type Tone } from './ui';

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

/** The four system states, decided once by the dashboard and passed down. */
export type SystemState = 'active' | 'paused' | 'needs_intervention' | 'empty';

export const SYSTEM_STATE_LABEL: Record<SystemState, string> = {
  active: 'המערכת פעילה',
  paused: 'המערכת מושהית',
  needs_intervention: 'נדרשת התערבות',
  // NOT "פעילה". Claiming the system is working while nothing is queued is
  // the same lie as an invented number, and it is the state a brand-new
  // install spends its first hour in.
  empty: 'אין מה לפרסם כרגע',
};

const SYSTEM_STATE_TONE: Record<SystemState, Tone> = {
  active: 'good',
  // Paused is a deliberate act by the owner, not an alarm. Amber here cries
  // wolf on the one state they caused themselves.
  paused: 'neutral',
  needs_intervention: 'warn',
  empty: 'neutral',
};

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
        One row of three: what the run is doing, where to look at it, and when
        it goes out. They were a two-up grid with the tuner on a line of its
        own underneath, which read as an afterthought — and it is the control
        the owner reaches for most, because it is the one that moves a round
        forward. Three across at 375px leaves ~108px each, so these are `md`
        rather than `lg`: still a 44px target, with room for the words.
      */}
      <div className="mt-3 grid grid-cols-3 gap-2 [&>*]:min-w-0">
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
        ) : (
          <span />
        )}
        {onTune ? (
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
  onResume,
  busy,
  resumeBusy,
  nextTarget,
  onDue,
  inFlight = 0,
  workerOnline,
  intervention = null,
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
  /** Rows a worker is holding right now (summary.inFlight). */
  inFlight?: number;
  workerOnline?: boolean;
  /** What needs a person, and the one place to go and do it. */
  intervention?: { title: string; body: string; actionLabel: string; href: string } | null;
}) {
  const paused = systemState === 'paused';
  const now = useTick(Boolean(nextAt) && !paused);
  const tone = SYSTEM_STATE_TONE[systemState];
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
        The status line, and the one fact that decides whether it can be true.

        "+ פוסט חדש" used to live here. It moved up into the pair of primary
        actions above this panel, so the screen offers it once. What replaced
        it is the connection state: groups are published by the copy of this
        app on the owner's PC, so "המערכת פעילה" is only meaningful next to
        whether that machine is actually there. It links to the card that can
        fix it rather than restating the diagnosis.
      */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-150 ${TONE_FILL[tone]} ${live ? 'pulse-dot' : ''}`} />
          <div className="min-w-0">
            <h2 dir="auto" className="min-w-0 truncate text-[17px] font-extrabold leading-[22px] text-mist-100">
              {SYSTEM_STATE_LABEL[systemState]}
            </h2>
            <p dir="auto" className="mt-0.5 truncate text-xs leading-4 text-mist-500">
              {systemState === 'active'
                ? live
                  ? 'מפרסם כעת לקבוצות פייסבוק'
                  : 'התור מלא — ממתין לתורו של הפרסום הבא'
                : systemState === 'paused'
                  ? 'שום דבר לא יוצא עד שתפעילו'
                  : systemState === 'empty'
                    ? 'אין פרסום מתוזמן'
                    : (intervention?.title ?? 'נדרשת פעולה שלכם')}
            </p>
          </div>
        </div>
        <Link
          href="#browser-status"
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-extrabold ${
            workerOnline ? 'bg-success-400/12 text-success-400' : 'bg-warning-400/12 text-warning-400'
          }`}
        >
          {workerOnline ? 'מחובר' : 'לא מחובר'}
          <ChevronIcon aria-hidden className="h-4 w-4 rtl:rotate-180" />
        </Link>
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
            הגעתם לתקרה היומית שהגדרתם. פרסומים שזמנם יגיע היום ידולגו — אפשר להעלות את התקרה בהגדרות.
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
          <Link href={intervention.href} className="mt-1 inline-flex min-h-11 min-w-11 items-center gap-0.5 text-[13px] font-extrabold text-warning-400">
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
      {due && onRunNow && !paused && systemState !== 'empty' && (
        <Button variant="secondary" size="md" className="mt-3 w-full" busy={busy} onClick={onRunNow}>
          הרץ עכשיו
        </Button>
      )}
    </HeroPanel>
  );
}
