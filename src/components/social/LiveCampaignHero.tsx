'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronIcon } from '@/components/icons';
import { RUN_STATE_LABEL, RUN_STATE_TONE, openRows, percentPublished, unpublishedNote, type CampaignState } from '@/lib/social/campaign';
import { countdownTo } from '@/lib/social/countdown';
import { formatTimeHe, relativeHe } from '@/lib/social/time';
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
 * RUN_STATE_TONE speaks campaign.ts's vocabulary, which still carries `info`
 * as a legacy name for the same blue `brand` resolves to (Badge does the same
 * collapse). One place to fold it, so the pill cannot pick a fifth hue.
 */
const toneOf = (t: (typeof RUN_STATE_TONE)[keyof typeof RUN_STATE_TONE]): Tone => (t === 'info' ? 'brand' : t);

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
const FOOT_BOX = 'min-w-0 rounded-[14px] bg-ink-900 px-3 py-2.5';

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
function NextUpBoxes({
  at,
  targetName,
  now,
  target,
  inFlight = false,
  workerOnline,
}: {
  at: string;
  targetName: string | null;
  now: number;
  target?: Pick<SocialTarget, 'name' | 'image_url'> | null;
  /** A row is genuinely in flight — a worker is holding it right now. */
  inFlight?: boolean;
  /** A worker has sent a heartbeat recently. Undefined means "not known here". */
  workerOnline?: boolean;
}) {
  const left = countdownTo(at, now);
  if (!left) return null;
  const name = target?.name ?? targetName;

  /*
   * Three states, not two, and this is the whole point of the change.
   *
   * "הפרסום הבא — מתבצע כעת" used to appear the moment scheduled_at passed,
   * because that is all `due` means. Measured with the worker offline for six
   * hours and nothing in flight: the card read "רץ", the headline read
   * "happening right now", and the list directly beneath it said "לפני 6
   * שעות" six times over. That is automation being presented as happening
   * when it did not happen — and a laptop that went to sleep is the single
   * most common real-world state of this product.
   *
   * `late` reads ONLY this row's own instant. It used to be suppressed while
   * any row was in flight — but the row in flight is a DIFFERENT row, so a
   * publication six hours behind was announced as "מתבצע כעת" because
   * something else was mid-publish. Measured, single-variable: worker
   * heartbeat 6h old, this row 6h overdue, one unrelated row publishing →
   * "מתבצע כעת" printed directly under "הפרסום עומד — המחשב לא מחובר".
   */
  const late = left.overdue;
  const publishingNow = left.due && !late && (inFlight || workerOnline === true);
  /*
   * Short, because this label lives in a 103px column beside the group name
   * and "הפרסום הבא — באיחור" truncated to "הפרסום הבא — ב…" — a state word
   * cut in half is worse than no state word. The box's subject is already
   * established by the "הקבוצה הבאה" box beside it, and it wraps rather than
   * truncating if a translation ever gets longer.
   */
  const headline = late ? 'באיחור' : publishingNow ? 'מתבצע כעת' : left.due ? 'אמור לצאת עכשיו' : 'הפרסום הבא בעוד';

  return (
    /*
     * 2 : 3, not 1 : 1. The countdown's widest real value is "1:04:22" — about
     * 91px at 22px/800 tabular — so an even split spent 60px of the name's
     * measure on air. Measured at 375: the group name went from 81px (18% of a
     * 451px name, the most truncated text on the page) to 93px on an even
     * split, to ~137px here.
     */
    <div className="grid grid-cols-5 gap-2 [&>*]:min-w-0">
      <div className={`col-span-2 ${FOOT_BOX}`}>
        <p className={`text-[11px] font-bold leading-[14px] ${late ? TONE_TEXT.warn : 'text-mist-500'}`}>{headline}</p>
        {/* mm:ss around a neutral colon, which an RTL line reorders. */}
        <p className={`text-[22px] font-extrabold leading-[26px] ${late ? TONE_TEXT.warn : 'text-mist-100'}`}>
          <span dir="ltr" className="inline-block tabular-nums">{left.due ? formatTimeHe(at) : left.label}</span>
        </p>
        {/* The time above is a clock time with no date on it, so on its own it
            reads as "in a moment" however long ago it was. This says which.

            The condition is `left.due`, not `left.overdue`: for the first two
            minutes past a missed slot the figure stops moving and there was
            nothing at all beside it saying why, which reads as a frozen
            countdown rather than a passed instant. */}
        {left.due && <p className="text-[11px] font-bold leading-[14px] text-mist-500">{relativeHe(at)}</p>}
      </div>
      <div className={`col-span-3 ${FOOT_BOX}`}>
        <p className="truncate text-[11px] font-bold leading-[14px] text-mist-500">הקבוצה הבאה</p>
        {name ? (
          /* Two lines, not an ellipsis. Measured: the name had 124px of the
             356 it needs, so the one question this box exists to answer -
             which group is next - was the one the screen could not answer.
             Group names here run long and Cyrillic ("АРАД НАШ ДОМ И РЕШАТЬ
             НАМ"), and the first twelve characters of those are not an answer. */
          <div className="flex min-w-0 items-start gap-2 pt-1">
            <TargetAvatar name={name} imageUrl={target?.image_url} size={26} />
            <p dir="auto" className="line-clamp-2 min-w-0 text-[13px] font-bold leading-[15px] text-mist-100">
              {name}
            </p>
          </div>
        ) : (
          // The row exists but its target did not come back with it. A dash is
          // the honest answer; a placeholder name is an invented one.
          <p className="text-[22px] font-extrabold leading-[26px] text-mist-500">—</p>
        )}
      </div>
    </div>
  );
}

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
  campaign: Pick<Campaign, 'id' | 'name' | 'service' | 'city'>;
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
  const running = state.state === 'running';
  const paused = state.state === 'paused';
  const { progress } = state;
  // The bar is publications over the whole run. It used to be
  // published + failed + skipped, so a run that published nothing filled the
  // bar to 100% and called it "הושלמו" — the owner lost an evening to a run
  // that read 80% complete having published zero.
  const pct = percentPublished(progress);
  const open = openRows(progress);
  const unpublished = unpublishedNote(progress);
  // A button is offered only when it can act: nothing is left to pause once
  // every row has finished, and nothing is left to resume either.
  const canPause = open > 0 && state.state !== 'stopped';
  // While everything is held, the run is not running whatever its own rows
  // say, and the pill must not claim otherwise.
  const pillTone: Tone = globalPaused ? 'warn' : toneOf(RUN_STATE_TONE[state.state]);
  const pillLabel = globalPaused ? RUN_STATE_LABEL.paused : RUN_STATE_LABEL[state.state];

  return (
    <HeroPanel ariaLabel="הסבב הפעיל" className="p-3.5">
      <div className="flex items-start gap-3">
        <PostCover media={media} className="h-16 w-16 sm:h-24 sm:w-24" />
        <div className="min-w-0 grow">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <Link href={`/social/campaigns/${campaign.id}`} dir="auto" className="block min-h-11 min-w-0 truncate py-1.5 text-[15px] font-extrabold leading-5 text-mist-100">
              {campaign.name}
            </Link>
            <StatePill tone={pillTone} label={pillLabel} live={!globalPaused && running && progress.running > 0} />
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
            {[startedAt ? `התחיל ${relativeHe(startedAt)}` : 'טרם יצא פרסום', targetCount && !state.truncated ? `${targetCount} קבוצות` : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <Ratio done={progress.published} total={progress.total} suffix="פורסמו" />
          <p className="text-lg font-extrabold tabular-nums text-brand-400">{pct}%</p>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progress.published} מתוך ${progress.total} פורסמו`}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink-700"
        >
          <div className="h-full rounded-full bg-success-400 transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
        </div>
        {/* What became of the rest, in the same breath as the bar — one word
            per outcome instead of one word covering three. Nothing is printed
            when there is nothing to print; a zero here would be noise.

            "עוד לא יצאו", not "עוד ממתינים": the KPI tile 200px above owns the
            words "ממתינים בתור" for a different rollup (summary.queued, the
            whole queue), and this is openRows() for one run. Two correct
            numbers under one phrase is how the screen started arguing with
            itself. */}
        {(unpublished || open > 0) && (
          <p className="mt-1.5 text-xs text-mist-500">
            {[unpublished, open > 0 ? `${open} עוד לא יצאו` : ''].filter(Boolean).join(' · ')}
          </p>
        )}
        {state.truncated && (
          <p className="mt-1.5 text-xs text-warning-400">
            הסבב גדול מכדי לספור אותו כאן במלואו — המספרים למעלה הם של הפרסומים הראשונים בלבד. הרשימה המלאה בעמוד הסבב.
          </p>
        )}
        {globalPaused && (
          <p className="mt-1.5 text-xs font-bold text-warning-400">כל הפרסומים מושהים — הסבב לא יזוז עד שתפעילו מחדש.</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 [&>*]:min-w-0">
        {paused ? (
          <Button size="lg" busy={busy} onClick={onResume}>
            המשך סבב
          </Button>
        ) : (
          /* "השהה סבב" — this pauses THIS round. The header's global toggle,
             visible on the same screen, pauses EVERYTHING and used to carry
             the identical word. */
          canPause ? (
            <Button variant="secondary" size="lg" busy={busy} onClick={onPause}>
              השהה סבב
            </Button>
          ) : (
            <span />
          )
        )}
        <ButtonLink href={`/social/campaigns/${campaign.id}`} variant="secondary" size="lg">צפה בתור</ButtonLink>
      </div>

      {/* The tuner used to be reachable only by tapping the countdown box, and
          that box is not drawn before a run has started - which is exactly when
          the owner wants to bring it forward. An explicit way in. */}
      {onTune && (
        <button
          type="button"
          onClick={onTune}
          className="mt-2 min-h-11 w-full rounded-xl text-sm font-bold text-brand-300 transition-colors hover:bg-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-850"
        >
          ערוך מועד ומרווח
        </button>
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
  onResume,
  busy,
  resumeBusy,
  nextTarget,
  onTune,
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
  onTune?: () => void;
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

  return (
    <HeroPanel ariaLabel="מצב המערכת">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-150 ${TONE_FILL[tone]} ${live ? 'pulse-dot' : ''}`} />
          <h2 dir="auto" className="min-w-0 truncate text-[17px] font-extrabold leading-[22px] text-mist-100">
            {SYSTEM_STATE_LABEL[systemState]}
          </h2>
        </div>
        {/* The one filled blue button on the screen — except while paused,
            where resuming outranks writing a post and takes the fill. */}
        <ButtonLink href="/social/posts/new" variant={paused ? 'secondary' : 'primary'} className="shrink-0">
          + פוסט חדש
        </ButtonLink>
      </div>

      <div className="mt-3.5">
        <Ratio done={publishedToday} total={dailyTarget} suffix="פורסמו היום, מתוך התקרה שהגדרתם" />
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
            ariaLabel={`${publishedToday} מתוך ${dailyTarget} פורסמו היום`}
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
            {pendingCancellable > 0 ? `${pendingCancellable} פרסומים לא יצאו עד שתפעילו.` : 'שום דבר לא ממתין בתור.'}
          </p>
        </div>
      )}

      {systemState === 'needs_intervention' && intervention && (
        <div className="mt-3 rounded-[14px] border border-warning-400/30 bg-warning-400/12 px-3 py-2.5">
          <p dir="auto" className="text-[13px] font-extrabold leading-[17px] text-warning-400">{intervention.title}</p>
          <p dir="auto" className="mt-0.5 text-xs leading-4 text-mist-300">{intervention.body}</p>
          <Link href={intervention.href} className="mt-1 inline-flex min-h-11 min-w-11 items-center gap-0.5 text-[13px] font-extrabold text-warning-400">
            {intervention.actionLabel}
            <ChevronIcon aria-hidden className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      )}

      {systemState === 'empty' && (
        <div className="mt-3 rounded-[14px] bg-ink-900 px-3 py-3.5 text-center">
          {/* No clock, no 00:00, no group name. The + פוסט חדש button above is
              the action; a second one here would just be louder. */}
          <p className="text-[13px] leading-[18px] text-mist-300">התור ריק — אין פרסום מתוזמן.</p>
          <p className="mt-0.5 text-xs leading-4 text-mist-500">צרו פוסט, בחרו קבוצות ותזמנו — השעה של הפרסום הבא תופיע כאן.</p>
        </div>
      )}

      {nextAt && !paused && systemState !== 'empty' && (
        <div className="mt-3">
          {onTune ? (
            <button
              type="button"
              onClick={onTune}
              className="block w-full rounded-[14px] text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-850"
            >
              <NextUpBoxes at={nextAt} targetName={nextTargetName} now={now} target={nextTarget} inFlight={inFlight > 0} workerOnline={workerOnline} />
              <span className="sr-only">— שינוי המרווח בין הפרסומים והקבוצות בתור</span>
            </button>
          ) : (
            <NextUpBoxes at={nextAt} targetName={nextTargetName} now={now} target={nextTarget} inFlight={inFlight > 0} workerOnline={workerOnline} />
          )}
          {/*
            "הרץ עכשיו" appears only when it can do something.
            It runs one worker tick over rows whose time has ALREADY come, so
            for the 99% of the day when the next slot is still ahead it is a
            permanently visible button that does nothing — a quieter version of
            a tile pointing at a route that does not exist.
          */}
          {due && onRunNow && (
            <Button variant="secondary" size="md" className="mt-2 w-full" busy={busy} onClick={onRunNow}>
              הרץ עכשיו
            </Button>
          )}
        </div>
      )}
    </HeroPanel>
  );
}
