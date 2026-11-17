'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { t, keep } from '@/lib/social/i18n';
import type { CommentTotals, QueueRow } from '@/lib/social/client';
import type { Campaign } from '@/lib/social/types';
import { COMMENT_TONE, commentLabel, commentNeedsHuman } from '@/lib/social/comments';
import { addDaysISO, agree, formatDateHe, formatDateTimeHe, formatTimeHe, startOfZonedDay, zonedDateISO, zonedToUtc } from '@/lib/social/time';
import { MessageIcon, ShareIcon } from '@/components/icons';
import { TargetAvatar } from './TargetAvatar';
import { CommentShot } from './CommentShot';
import { CommentPreviewSheet } from './CommentPreviewSheet';
/* LiveFlow's own picture box and people mark, so the two lists cannot drift
   apart — see the note over the list below. */
import { GroupPic, PeopleMark } from './LiveFlow';
import { Card, EmptyState, ProgressBar, TONE_FILL, TONE_TEXT, TONE_TINT, type Tone } from './ui';

/**
 * THE COMMENTS, IN ORDER — what already went under a post, what is queued, and
 * what is coming with a publication that has not gone out yet.
 *
 * Asked for across three messages: "טיימלין של תזמון התגובות ומה שכבר בוצע /
 * נכשל אם קישור מהיר לתגובה בעמוד", then "סרגל התקדמות של התגובות כמה מתוך
 * כמה הגיב וכמה בתור ותגובות טיימלין של 24 שעות בלבד", then "וגם את התגובות
 * המתוזמנות קדימה להוסיף".
 *
 * WHY IT IS NOT THE CARD ABOVE IT. "תגובות לפרסומים" answers "how many, and
 * what needs me": rollups with the exceptions foldable underneath, each
 * outcome in a drawer of its own. That is the right shape for triage and the
 * wrong one for a sequence — a hundred and twenty-four failures in one drawer
 * and the successes in another say nothing about the order any of it happened
 * in. This is the same evening as one rail.
 *
 * THE RAIL AND THE SCROLL BOX ARE WHAT THE OWNER ASKED TO KEEP: "את העיצוב
 * והגלילה תשאיר ככה". I had rebuilt them once as tiled rows ending in a
 * "הצג עוד" fold, reading a screenshot of "תגובות שהועלו" captioned "כמו כאן"
 * as a request to match that section. It was not, and this is the rail back.
 * It is the same one the publications timeline on this screen uses — hollow
 * dot behind us, filled dot still coming, a line between — which is the
 * point: two rails that looked different would read as two features.
 *
 * NOTHING HERE IS INTERPOLATED. A finished comment sits at `comment_at`, the
 * instant it happened. A queued one carries no time at all, because none is
 * stored — the worker takes them one at a time at the spacing each round
 * chose — so it shows its place in line instead. Only a publication that has
 * not gone out has a real clock, `scheduled_at`, and that is the one place an
 * hour is printed for something that has not happened yet.
 */

/* The rail's hollow dot, matching Timeline's. A finished stop is the card's
   own surface with the outcome's colour as its edge. */
const RING_DONE: Record<Tone, string> = {
  brand: 'ring-brand-300',
  good: 'ring-success-400',
  bad: 'ring-error-400',
  warn: 'ring-warning-400',
  neutral: 'ring-ink-600',
};

/**
 * "בעוד ~12 דק׳" — a wait, in the largest unit that still says something.
 *
 * Approximate on purpose, and it says so with the tilde: the number is built
 * from the pace the comments actually went out at today, which is a good
 * predictor of the next hour and no promise at all about the one after it.
 * Minutes rather than the mm:ss the publications countdown uses — that one
 * counts down to a stored instant seconds away, and a queue eighty deep is
 * measured in hours.
 */
function aboutLong(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'פחות מדקה';
  if (minutes < 60) return `~${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  /* "~3 שע׳" reads as a wait; "~180 דק׳" reads as arithmetic somebody else
     should have done. */
  return rest >= 5 ? `~${hours} שע׳ ו-${rest} דק׳` : `~${hours} שע׳`;
}

function inAbout(seconds: number): string {
  if (seconds < 30) return 'הבא בתור';
  if (seconds < 90) return 'בעוד כדקה';
  return `בעוד ${aboutLong(seconds)}`;
}

/** Already under a post, or already failed to get there. */
function happened(status: string | undefined): boolean {
  return status === 'done' || commentNeedsHuman(status);
}

type Kind = 'past' | 'queued' | 'ahead';

export function CommentTimeline({
  rows,
  waiting: waitingRows,
  done,
  attention,
  totals,
  upcoming,
  campaigns,
  today,
  now: nowProp,
}: {
  /** Everything carrying a comment state — the dashboard's existing read. */
  rows: QueueRow[];
  /**
   * The ones still to be written, read on their own.
   *
   * It has to be its own read. `rows` is every comment state, oldest
   * publication first, capped at sixty — and on an account with 482 of them
   * the sixty oldest are all long finished, so the queue was never in there.
   * The rail showed nothing waiting while the bar above it counted 75 in the
   * queue: "לא מראה".
   */
  waiting: QueueRow[];
  /** The finished ones, read separately and more deeply than `rows` reaches. */
  done: QueueRow[];
  /**
   * The ones that STOPPED and need a person, newest first.
   *
   * Its own read for the same reason `waiting` is — see
   * listCommentsNeedingHuman in client.ts. Without it this card printed
   * "12 דורשות טיפול היום" above a rail that held none of the twelve, and the
   * note the worker wrote on each one was on no screen at all.
   */
  attention: QueueRow[];
  /** The REAL counts, from the database rather than from these two windows. */
  totals: CommentTotals;
  /** Publications still waiting to go out — the dashboard's existing read. */
  upcoming: QueueRow[];
  /** Read only for comment_text: which rounds have a comment waiting to follow. */
  campaigns: Campaign[];
  /**
   * TODAY'S OUTCOMES, counted in the database — commentTotalsSince(midnight).
   *
   * Separate from `totals` because they answer different questions and the
   * card needs both: this is what happened today, `totals.pending` is what is
   * still queued, and a queue has no day (a comment owed on last night's post
   * is still owed this morning). The same split is already documented on
   * commentTotalsSince in client.ts.
   */
  today: { done: number; failed: number; unverified: number };
  /** The clock, injectable so "today" can be tested across a date boundary. */
  now?: Date;
}) {
  /* One instant for the whole render: the day boundary, the "is this today"
     labels and the end of the look-ahead all have to agree, and three calls
     to `new Date()` inside one function can straddle midnight. */
  const now = nowProp ?? new Date();
  /*
   * WHICH COMMENT THE LITTLE WINDOW IS SHOWING — "להוסיף חלון קטן לראות את
   * התגובה".
   *
   * The whole item and not just an id: the window prints the hour and the
   * sentence the ROW is showing, and re-deriving either of them from an id
   * would be a second opinion about the same comment, two taps apart.
   */
  const [preview, setPreview] = useState<{ row: QueueRow; kind: Kind; said: string; at: string | null } | null>(null);
  /*
   * ONE ROW PER PUBLICATION, however many reads it arrived in.
   *
   * `rows` and `done` overlap on purpose — the first is every comment state
   * capped at sixty by published_at, the second is the finished ones capped at
   * forty by comment_at, and a busy day puts the same comment in both. Drawn
   * twice it would be the rail claiming two comments under one post.
   */
  const byId = new Map<string, QueueRow>();
  /* `attention` LAST: its select is the only one carrying comment_note and
     comment_shot, so it must win the merge for a row the others also hold. */
  for (const r of [...done, ...rows, ...waitingRows, ...attention]) if (r.comment_status) byId.set(r.id, r);
  const all = [...byId.values()];

  /*
   * TODAY, AND NOT A ROW OLDER — "ציר זמן לעשות נתונים רק מה שקשור לאותו היום
   * כבר דיברנו על זה".
   *
   * IT USED TO BE A ROLLING TWENTY-FOUR HOURS, from "תגובות טיימלין של 24
   * שעות בלבד". That is a different window from the one every other figure on
   * this screen uses, and the difference is visible: at ten at night the rail
   * carried last night's comments while the tiles beside it had reset at
   * midnight, so two parts of one dashboard disagreed about what "today"
   * means. The boundary is now the same local midnight the tiles, the hero and
   * the quick-comments card all read — Asia/Jerusalem, resolved as a DATE and
   * not as `now - 24h`, because the two Israeli clock changes make one day 23
   * hours long and another 25.
   *
   * Everything older is still in "תגובות לפרסומים" above, which keeps the full
   * history, and the line under the bar says how many were left out rather
   * than dropping them silently.
   *
   * Oldest first: this is a rail, and a rail reads down the day.
   */
  const since = startOfZonedDay(now).getTime();
  const recent = all.filter((r) => happened(r.comment_status));
  const past = recent
    .filter((r) => {
      const at = r.comment_at ? Date.parse(r.comment_at) : NaN;
      return Number.isFinite(at) && at >= since;
    })
    .sort((a, b) => (a.comment_at ?? '').localeCompare(b.comment_at ?? ''));
  const older = recent.length - past.length;

  /*
   * The queued ones in the order the worker will take them: oldest publication
   * first. That is the order listCommentQueue reads them in and the order the
   * worker claims them, so the numbers on screen are the real positions rather
   * than a second opinion about them.
   */
  const waiting = waitingRows
    /* Belt and braces against the two reads overlapping, and against a row
       that finished between the two queries going out. */
    .filter((r) => !happened(r.comment_status))
    .sort((a, b) => (a.published_at ?? a.scheduled_at).localeCompare(b.published_at ?? b.scheduled_at));

  /*
   * COMMENTS THAT HAVE NOT GOT A POST YET — "וגם את התגובות המתוזמנות קדימה".
   *
   * A comment is queued onto a publication, so until that publication goes out
   * there is no comment row to queue: the round carries the wording, and every
   * post it still owes will get it on the way out. Those were invisible here —
   * the rail showed comments waiting on posts that already existed and nothing
   * at all about the eighty due tonight.
   *
   * `comment_text` is the whole test, because it is the column the worker
   * itself reads to decide a post is owed a comment. Asking anything else
   * would be a lookalike that drifts.
   */
  const rounds = new Map(campaigns.map((c) => [c.id, c]));
  /* The far end of the same day. A comment that follows a post due tomorrow
     lunchtime is real work and belongs on tomorrow's rail, not on this one. */
  const until = zonedToUtc(addDaysISO(zonedDateISO(now), 1), '00:00').getTime();
  const ahead = upcoming
    .filter((r) => {
      const at = Date.parse(r.scheduled_at);
      if (!Number.isFinite(at) || at >= until) return false;
      /* Not already counted: a row cannot be both waiting to publish and
         carrying a finished comment, but the guard costs nothing and this card
         has already been bitten once by two reads that overlap. */
      if (byId.has(r.id)) return false;
      const c = r.campaign_id ? rounds.get(r.campaign_id) : null;
      return Boolean((c?.comment_text ?? '').trim());
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  /*
   * HOW LONG UNTIL EACH QUEUED COMMENT — "התגובות שאמורות לצאת הבאות בתור
   * ובעוד כמה זמן".
   *
   * MEASURED FROM WHAT ACTUALLY HAPPENED, not from the configured gap. The
   * round's `comment_gap_seconds` is what the worker SLEEPS between comments,
   * and it is the smaller half of the truth: writing one means opening the
   * post, finding it and typing, which takes its own tens of seconds on top.
   * On the owner's own screen the finished rows read 23:28, 23:30, 23:32,
   * 23:34, 23:35 — about two minutes apart against a default gap of thirty
   * seconds. An estimate built on the setting would have told them forty
   * minutes for a queue that is really closer to three hours.
   *
   * So the pace is the MEDIAN interval between the comments that actually
   * went out today. The median rather than the mean because the worker also
   * publishes: one comment written after a twenty-minute publishing run is a
   * single huge interval that would drag an average far past anything the
   * queue will really do. Intervals outside 5s–30min are dropped for the same
   * reason — past thirty minutes the worker was not pacing, it was busy or
   * switched off, and that is not a rate.
   *
   * Under three samples there is nothing to measure, so it falls back to the
   * configured gap, clamped the same way the worker and the database clamp it.
   */
  const GAP_DEFAULT = 30;
  const gapOf = (r: QueueRow): number => {
    const c = r.campaign_id ? rounds.get(r.campaign_id) : null;
    return Math.max(5, Math.min(600, Math.round(c?.comment_gap_seconds ?? GAP_DEFAULT)));
  };
  /*
   * ONE DECISION, TWO VALUES. The seconds and whether they were measured have
   * to be decided together: my first version computed the pace from the
   * usable INTERVALS and then said "measured" based on the row COUNT, and the
   * two disagree constantly — seven finished comments with a publishing run
   * between them yield two usable intervals, so the card fell back to the
   * configured gap while telling the owner it was reading today's pace.
   */
  /*
   * AN ESTIMATE NEEDS A RATE, AND THE SETTING IS NOT ONE.
   *
   * The fallback used to be the round's configured comment_gap_seconds — and
   * the branch that selects it is selected BY the absence of evidence, so the
   * less this feature was working, the more confident the number it printed.
   * At a configured twenty seconds it told him rows #3-#5 were under ninety
   * seconds away and #6 about two minutes, at 22:19, over 879 queued comments
   * and nothing delivered since midnight — and the sentence beside it promised
   * the estimate would correct itself "אחרי כמה תגובות", conditioned on the
   * exact progress that was not happening. It could never climb out.
   *
   * Null now. No rate, no projection. The setting is still read for ORDER
   * (gapOf), never for a countdown.
   */
  const pace = ((): { seconds: number | null; measured: boolean } => {
    const gaps: number[] = [];
    for (let i = 1; i < past.length; i += 1) {
      const a = Date.parse(past[i - 1].comment_at ?? '');
      const b = Date.parse(past[i].comment_at ?? '');
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const d = (b - a) / 1000;
      if (d >= 5 && d <= 1800) gaps.push(d);
    }
    if (gaps.length < 3) return { seconds: null, measured: false };
    gaps.sort((x, y) => x - y);
    return { seconds: gaps[Math.floor(gaps.length / 2)], measured: true };
  })();

  /*
   * NOTHING HAS SUCCEEDED TODAY AND THE QUEUE IS NOT EMPTY.
   *
   * Deliberately NOT `!pace.measured`. `past` holds every row that HAPPENED —
   * done, failed and unverified alike — so on a day where a dozen failures
   * land three usable intervals between them, `measured` goes true and the
   * card would announce "לפי הקצב היום" over a column of failures. The
   * question this predicate asks is the one he asked: did a comment go up.
   */
  const stalled = today.done === 0 && !past.some((r) => r.comment_status === 'done') && waiting.length > 0;
  /*
   * THE ONE TEST BOTH THE SUBTITLE AND THE ROWS MUST USE.
   *
   * `pace.seconds !== null` is not enough, and the fixture proved it: `past`
   * holds every row that HAPPENED, failures included, so twelve failures three
   * minutes apart hand `pace` three usable intervals and `measured` goes true.
   * The subtitle checked `stalled` and said "עוד לא יצאה תגובה היום" while the
   * rows below it, checking only for a number, counted down 3, 6, 9, 12, 15
   * and 18 minutes from a rate derived entirely from things that failed.
   */
  const projecting = !stalled && pace.seconds !== null;
  /* Is the one browser busy publishing, or is the queue simply not moving?
     The only honest distinction this card can draw from what it was handed —
     a publication due inside the next minute means the browser is spoken for,
     which is the reason a comment stands down. */
  const publishingNow = upcoming.some((r) => {
    const at = Date.parse(r.scheduled_at);
    return Number.isFinite(at) && at - now.getTime() < 60_000;
  });
  /* Three is the most that can be read without turning the card into a log.
     Scoped to today, because that is what the number above it counts. */
  const attentionTop = attention
    .filter((r) => {
      const at = r.comment_at ? Date.parse(r.comment_at) : NaN;
      return Number.isFinite(at) && at >= since;
    })
    .slice(0, 3);

  const items: { row: QueueRow; kind: Kind }[] = [
    ...past.map((row) => ({ row, kind: 'past' as const })),
    ...waiting.map((row) => ({ row, kind: 'queued' as const })),
    ...ahead.map((row) => ({ row, kind: 'ahead' as const })),
  ];

  if (!items.length) {
    return (
      <Card title={t('ציר הזמן של התגובות')} subtitle={t('מה כבר נכתב, מה נכשל ומה עוד בתור')}>
        <EmptyState
          icon={<MessageIcon className="h-5 w-5" />}
          title={t('עוד לא ביקשתם תגובות')}
          description="אחרי שתוסיפו תגובה לפרסום, כל תגובה תופיע כאן לפי הסדר — עם קישור לפוסט שהיא יושבת עליו."
        />
      </Card>
    );
  }

  /*
   * THE BAR COUNTS THE DATABASE, NOT THIS CARD — "כמה מתוך כמה הגיב וכמה בתור".
   *
   * The rail below is one day deep and both its reads are capped; a bar built
   * from the rows on screen would report "5 מתוך 9" to an owner holding 271
   * comments. `totals` is four COUNT queries, which is the truth.
   */
  const next = waiting[0] ?? null;
  /*
   * THE BAR COUNTS TODAY AND THE QUEUE — not the whole history.
   *
   * It used to read "425 מתוך 1130 הגיבו · 441 בתור · 264 דורשות טיפול",
   * which are lifetime counts sitting on a card whose every other number is
   * about one day. The 264 in particular is a figure nobody can act on: it is
   * every comment that ever needed a person, back to the first week.
   *
   * WHAT EACH HALF IS, because they are deliberately different scopes and the
   * line under the bar says so:
   *   `today`  — comments that FINISHED since local midnight, counted in the
   *              database by commentTotalsSince().
   *   pending  — the queue as it stands right now. A queue has no day: a
   *              comment owed on last night's post is still owed this
   *              morning, and scoping it to today would shrink the number at
   *              midnight while the work behind it had not moved at all.
   */
  const needsHuman = today.failed + today.unverified;
  const real = today.done + needsHuman + totals.pending;
  const dayISO = zonedDateISO(now);

  /** The instant a row is placed at — null for a queue that has no clock. */
  const stampOf = (it: { row: QueueRow; kind: Kind }): string | null =>
    it.kind === 'past' ? it.row.comment_at ?? null : it.kind === 'ahead' ? it.row.scheduled_at : null;

  return (
    <Card title={t('ציר הזמן של התגובות')} subtitle={t('מה כבר נכתב, מה נכשל ומה עוד בתור')}>
      {/* Three segments, in the tones the rest of the product already uses for
          these states: written, needs a person, still waiting. A comment being
          typed this second is inside `pending` — it is a second long, and a
          slice of its own would be a bar that flickers. */}
      <ProgressBar
        segments={[
          { value: totals.done, className: TONE_FILL.good },
          { value: needsHuman, className: TONE_FILL.warn },
          { value: totals.pending, className: TONE_FILL.neutral },
        ]}
        total={real}
        ariaLabel={`${totals.done} מתוך ${real} תגובות נכתבו, ${totals.pending} בתור`}
        height="h-2.5"
      />
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] font-bold">
        <span className={TONE_TEXT.good}>{`${today.done} הגיבו היום`}</span>
        {totals.pending > 0 && <span className="text-mist-500">{`${totals.pending} בתור`}</span>}
        {needsHuman > 0 && <span className={TONE_TEXT.warn}>{`${needsHuman} דורשות טיפול היום`}</span>}
      </p>
      {/* The rail's scope, said once. Without it the bar reads 271 over a list
          of nine and the only available conclusion is that something is lost. */}
      <p className="mt-1 text-[11px] text-mist-500">
        הציר והמספרים מציגים את היום — חוץ מ&quot;בתור&quot;, שהוא התור כפי שהוא עכשיו
        {older > 0 && ` · ${older} ${agree(older, 'תגובה קודמת לא מוצגת', 'תגובות קודמות לא מוצגות')} כאן`}
      </p>

      {/*
        THE TWELVE, WHERE THE TWELVE ARE COUNTED.

        The line above says "12 דורשות טיפול היום" and then every list below it
        excluded them — listCommentQueue is published_at ASCENDING capped at
        sixty, so it holds the sixty OLDEST things ever published and today's
        failures are the newest; listCommentsDone filters on 'done'. So the
        number was an assertion with no evidence anywhere on the same screen,
        while the worker had already written down why each one stopped
        (comment_note, and a screenshot of the page as its browser had it).
        That is the one thing that turns "תסדר" into a decision.

        NO RETRY BUTTON HERE, on purpose. A round's failures are retried on the
        campaign screen, which refuses 'unverified' — Enter was pressed on
        those and the comment may already be under the post.
      */}
      {attentionTop.length > 0 && (
        <div className={`mt-2 rounded-xl px-2.5 py-2 ${TONE_TINT.warn}`}>
          <p className={`text-[11.5px] font-extrabold ${TONE_TEXT.warn}`}>
            {`${needsHuman} ${agree(needsHuman, 'תגובה נעצרה היום', 'תגובות נעצרו היום')} — זה מה שהתוכנה דיווחה`}
          </p>
          <ul className="mt-1 space-y-1">
            {attentionTop.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-[11px] leading-snug">
                <span dir="auto" className="w-24 shrink-0 truncate font-bold text-mist-200">
                  {r.target?.name ? <span data-no-translate>{r.target.name}</span> : t('קבוצה')}
                </span>
                <span dir="auto" className="min-w-0 flex-1 text-mist-400">
                  {r.comment_note || commentLabel(r.comment_status)}
                </span>
                {r.comment_shot && <CommentShot path={r.comment_shot} />}
              </li>
            ))}
          </ul>
          {needsHuman > attentionTop.length && (
            <p className="mt-1 text-[11px] text-mist-500">
              {`ועוד ${needsHuman - attentionTop.length} — כולן במסך הסבב, עם כפתור "נסה שוב"`}
            </p>
          )}
        </div>
      )}

      {/*
        WHAT IS NEXT, WITHOUT SCROLLING FOR IT.
        *
        * The queued rows are on the rail in their place — after the day, which
        * is where a timeline puts them — but the owner's own screen had
        * forty-eight finished comments above them, so "what is about to
        * happen" was six swipes down a box that refreshes every thirty
        * seconds. It is also the commonest question this card is opened with,
        * so it goes at the top as one line.
        *
        * The pace is stated beside it because the estimates below are only as
        * good as it is, and whether it came from today's own comments or from
        * the setting is exactly the thing that decides how much to trust them.
      */}
      {next && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl bg-ink-800/50 px-2.5 py-2 text-[11.5px]">
          <span className="font-extrabold text-brand-400">{t('הבא בתור')}</span>
          <span dir="auto" className="min-w-0 flex-1 truncate font-bold text-mist-100">
            {next.target?.name ? <span data-no-translate>{next.target.name}</span> : t('קבוצה')}
          </span>
          <span className="font-bold text-mist-300">
            {next.comment_status === 'commenting' ? 'כותב עכשיו' : inAbout(0)}
          </span>
          <span className="w-full text-[11px] text-mist-500">
            {stalled
              ? publishingNow
                ? 'עוד לא יצאה תגובה היום. תור הפרסומים צפוף ואין בין הפרסומים חלון פנוי לתגובה — התור יתחדש מעצמו כשהסבב ייגמר, או אם תגדילו את המרווח בין הפרסומים.'
                : 'עוד לא יצאה תגובה היום, ולכן אין ממה לאמוד קצב. ההערכה תופיע אחרי שלוש תגובות.'
              : projecting && pace.measured && pace.seconds !== null
                ? `לפי הקצב היום — בערך ${aboutLong(pace.seconds)} לכל תגובה`
                : 'אין עוד מספיק תגובות היום כדי לאמוד קצב. ההערכה תופיע אחרי שלוש תגובות.'}
          </span>
        </p>
      )}

      {/*
        THE SAME SCROLL BOX "מה קרה היום" USES, down to the 21rem and the focus
        ring — "אני רוצה שזה יראה כמו במשבצת של מה קרה היום, אם אופציה לגלילה".
        Mine was 22rem with a stray pe-1 and no keyboard affordances at all, so
        the two rails on this screen scrolled to different depths and only one
        of them could be reached without a mouse.

        A box that scrolls rather than a list cut off with the rest behind a
        button: the half-row at the bottom edge is the affordance, and a row
        clipped mid-height says "there is more below" better than a hint can.
      */}
      {/*
        THE SAME LIST THE PUBLICATIONS USE — not a copy of it.
        "איפה שהתגובות לעשות עיצוב זהה כמו בפוסטים."

        `anxf-queue` and `anxf-row` are LiveFlow's own classes, and the picture
        box and the people mark are its own components, exported rather than
        re-drawn: two lists that merely looked alike would drift the first time
        one of them was touched. The scroll box comes with them — the same
        21rem, the same half-row cut at the bottom edge that says there is more
        below — which is what he asked to keep when this card was first built
        ("את העיצוב והגלילה תשאיר ככה").

        WHAT WENT. The rail: a dot per row and a line joining them. He was
        asked directly and chose to drop it, because the publications rows
        carry no such thing and "זהה" meant זהה. The order is still the order,
        and the hour on every row still says when.
      */}
      <ul
        className="anxf-queue mt-3"
        tabIndex={0}
        role="group"
        aria-label={t('סדר התגובות — רשימה נגללת')}
      >
          {items.map((item, i) => {
            const row = item.row;
            const status = row.comment_status ?? '';
            /* An 'ahead' row has no comment state yet — nothing has been queued
               for it — so it takes the neutral tone rather than borrowing a
               word for a thing that has not happened. */
            const tone: Tone =
              item.kind === 'ahead' ? 'neutral' : COMMENT_TONE[status as keyof typeof COMMENT_TONE] ?? 'neutral';
            const isPast = item.kind === 'past';
            const at = stampOf(item);
            const day = at ? zonedDateISO(new Date(at)) : '';
            const prev = i > 0 ? stampOf(items[i - 1]) : null;
            const showDay = Boolean(day) && day !== dayISO && (i === 0 || (prev ? zonedDateISO(new Date(prev)) : '') !== day);
            /* Where in the line this one is — 1 for the next comment out.
               Counted from the start of the queued block, not from the whole
               rail, or the first one queued would be numbered after every
               comment that ever succeeded. */
            const place = i - past.length + 1;
            /*
              THE PUBLICATION ROW'S OWN FOUR STATES, which is what makes the
              card chrome identical: `data-row` is the attribute globals.css
              tints a failed row pink and rings a live one with.
            */
            const flow = commentNeedsHuman(status)
              ? 'failed'
              : status === 'commenting'
                ? 'live'
                : isPast
                  ? 'done'
                  : 'next';
            /*
              A QUEUED ROW SAYS WHEN, NOT "ממתין". That the row is waiting is
              already told by its place in the line and by the "#3" beside it,
              so the word spent the line saying nothing; the wait is what was
              asked for. 'commenting' keeps its own word — it is happening now,
              and a countdown over it would be wrong by the time it is read.
            */
            const said =
              item.kind === 'ahead'
                ? 'תגובה אחרי הפרסום'
                : item.kind === 'queued' && status === 'pending'
                  /* place is 1-based, so the NEXT one out is place 1 and must
                     be zero paces away — at `paceSeconds * place` the head of
                     the queue claimed a two-minute wait it does not have. */
                  ? !projecting || pace.seconds === null
                    ? stalled && publishingNow
                      ? 'ממתין לחלון פנוי בין הפרסומים'
                      : 'ממתין בתור'
                    : inAbout(pace.seconds * (place - 1))
                  : commentLabel(status);
            return (
              <Fragment key={row.id}>
                {/* `at &&` as well as showDay: showDay already implies it, but
                    only through a Boolean(day) the compiler cannot follow back
                    to this variable, and a cast here would be the one place the
                    day heading could render "Invalid Date".

                    ITS OWN ROW, WITHOUT THE CARD. A heading inside a queue row
                    would be drawn as one — border, background and all — and
                    read as a publication that happened at midnight. */}
                {showDay && at && (
                  <li className="anxf-sep">
                    <p className="px-1 text-[11px] font-extrabold uppercase tracking-wide text-mist-500">{formatDateHe(at)}</p>
                  </li>
                )}
                <li data-row={flow}>
                  {/*
                    A BUTTON, NOT A LINK. The publications row opens the
                    history; this one opens the comment itself — "להוסיף חלון
                    קטן לראות את התגובה" — and the address of the post is
                    inside that window, where the words it is about are.
                  */}
                  <button
                    type="button"
                    className="anxf-row"
                    onClick={() => setPreview({ ...item, said, at })}
                    /*
                      NO aria-label. The publications row has none either: its
                      accessible name is what it says — the group, its state
                      and its hour — and that is exactly what a screen reader
                      should hear here too. A label would also be the one line
                      on this card mixing a Russian group name into a Hebrew
                      sentence, which is the thing russian-rendered.test.ts
                      refuses, and the fix for that would be to drop the state
                      from it — the half worth hearing.
                    */
                    /*
                      THE ROW'S SUBJECT, AND THE ADDRESS THE WINDOW OPENS.
                      permalink when there is one, the group when there is
                      not, and ABSENT when there is neither — an attribute
                      holding "" would be a row claiming an address it has
                      not got. Here rather than only inside the window
                      because <Sheet> portals to document.body and renders
                      nothing at all under renderToStaticMarkup, so this is
                      the one place the fixture can read it.
                    */
                    {...(row.permalink || row.target?.url ? { 'data-post': row.permalink || row.target?.url } : {})}
                  >
                    {/* The group's picture, and the mark for a group with no
                        picture stored — LiveFlow's own, not a second pair. */}
                    <GroupPic src={row.target?.image_url} />
                    <PeopleMark />
                    <span className="anxf-row-words">
                      <span className="anxf-row-name" dir="auto" data-no-translate>
                        {row.target?.name ? row.target.name : t('קבוצה')}
                      </span>
                      {/* THE REASON, WHOLE. "לא הצליח" on its own is what makes
                          a person press the same button again — a post the
                          admin deleted, a group that closed comments and a
                          security screen are three different things to do
                          next. The row shows the state; the window under it
                          holds the worker's own sentence and its screenshot. */}
                      <span className={flow === 'failed' ? 'anxf-row-why' : flow === 'done' ? 'anxf-row-skip' : 'anxf-row-note'}>
                        {said}
                      </span>
                    </span>
                    <span className="anxf-row-at">
                      {/*
                        AS SHORT AS THE PUBLICATIONS ROW'S, AND FOR ITS REASON.
                        This column is `flex: none` and never wraps, so every
                        word in it is taken off the group's name — and in
                        Russian "18:50 · после публикации" squeezed the name
                        box to 24px and, at 320px, to nothing at all. The
                        words belong on the line below, where they already
                        are: the row says "תגובה אחרי הפרסום" under the name
                        and has no business saying it twice.

                        So: the hour, and "· הגיב" only on a comment that
                        really went out — exactly the shape of "05:31 · בוצע"
                        beside a publication. A queued row has no hour to
                        show and gives its place in line instead.

                        TWO NODES, NOT ONE STRING, for the reason "· בוצע" is
                        its own dictionary key: the DOM translator matches
                        whole text nodes, and an hour baked into the same
                        template is a line it can never answer.
                      */}
                      {item.kind === 'queued' ? (
                        <span dir="ltr" className="inline-block">{`#${place}`}</span>
                      ) : at ? (
                        <>
                          {formatTimeHe(at)}
                          {flow === 'done' ? ' · הגיב' : ''}
                        </>
                      ) : (
                        ''
                      )}
                    </span>
                    <span className="anxf-row-mark" aria-hidden>
                      {flow === 'done' ? (
                        <svg className="anxf-mark-done" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="12" r="11" />
                          <path d="m6.6 12.4 3.6 3.6 7.2-8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : flow === 'failed' ? (
                        <svg className="anxf-mark-failed" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="12" r="11" />
                          <path d="M8.6 8.6 15.4 15.4M15.4 8.6 8.6 15.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      ) : flow === 'live' ? (
                        <svg className="anxf-mark-live anx-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                          <circle cx="12" cy="12" r="9" opacity=".25" />
                          <path d="M21 12a9 9 0 0 0-9-9" />
                        </svg>
                      ) : (
                        <svg className="anxf-mark-next" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="8.6" />
                          <path d="M12 7.4V12l3 1.8" />
                        </svg>
                      )}
                    </span>
                    <svg aria-hidden className="anxf-row-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m14 6-6 6 6 6" />
                    </svg>
                  </button>
                </li>
              </Fragment>
            );
          })}
      </ul>

      <p className="mt-2 text-[11px] leading-snug text-mist-500">
        {t('התגובות יוצאות אחת-אחת, במרווח שנבחר לכל סבב, ורק כשיש חלון פנוי בין שני פרסומים — ולכן אין להן שעה מראש. לפרסום שעוד לא יצא מוצגת השעה שבה הוא מתוזמן.')}
      </p>

      {/*
        THE LITTLE WINDOW. Keyed by the row, so opening a second comment
        re-seeds it rather than showing the first one's screenshot under the
        second one's name — the same `key` the comment sheet carries for the
        same reason.

        The sentence and the hour are the ROW's, carried in rather than
        re-derived: two taps apart, one comment, one answer.
      */}
      <CommentPreviewSheet
        key={preview?.row.id ?? 'none'}
        open={preview !== null}
        onClose={() => setPreview(null)}
        row={preview?.row ?? null}
        campaign={campaigns.find((c) => c.id === preview?.row.campaign_id) ?? null}
        when={preview?.at ? formatDateTimeHe(preview.at) : ''}
        state={preview?.said ?? ''}
      />
    </Card>
  );
}
