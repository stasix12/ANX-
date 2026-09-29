'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import type { CommentTotals, QueueRow } from '@/lib/social/client';
import { COMMENT_TONE, commentLabel, commentNeedsHuman } from '@/lib/social/comments';
import { agree, counted, formatDateHe, zonedDateISO } from '@/lib/social/time';
import { ChevronDownIcon, MessageIcon, ShareIcon } from '@/components/icons';
import { Stamp } from './DateTime';
import { TargetAvatar } from './TargetAvatar';
import { Card, EmptyState, TONE_TEXT } from './ui';

/**
 * THE COMMENTS, IN ORDER — what already went under a post, and what is queued.
 *
 * Asked for in these words: "אני רוצה לראות טיימלין של תזמון התגובות ומה שכבר
 * בוצע / נכשל אם קישור מהיר לתגובה בעמוד".
 *
 * WHY IT IS NOT THE CARD ABOVE IT. "תגובות לפרסומים" answers "how many, and
 * what needs me": three rollups with the exceptions foldable underneath, and
 * each outcome in a drawer of its own. That is the right shape for triage and
 * the wrong one for a sequence — a hundred and twenty-four failures in one
 * drawer and the successes in another say nothing about the order any of it
 * happened in, and nothing at all about what is coming next. This is the same
 * evening told as one list.
 *
 * IT WEARS THAT CARD'S CLOTHES, and that was asked for too: the owner sent a
 * screenshot of "תגובות שהועלו" and wrote "כמו כאן". So the rows here are that
 * section's rows — the group's own picture, its name, the timestamp, the
 * "לתגובה" link — and the list ends in the same "הצג עוד N" it does. The first
 * version of this card drew a vertical rail with dots instead, borrowed from
 * the publications timeline; it was a second visual language for the same
 * subject, two cards apart.
 *
 * NOTHING HERE IS INTERPOLATED. A finished comment sits at `comment_at`, the
 * instant it actually happened. A waiting one carries no time at all, because
 * none is stored: the worker takes them one at a time at the spacing each
 * round chose, interleaved with whatever it is publishing, so any clock this
 * card printed would be a guess. It shows the QUEUE POSITION instead, which is
 * a fact.
 */

/**
 * How many rows each half shows before it folds.
 *
 * THREE, not the four DONE_FIRST uses in the card above — because this card
 * has TWO of those lists in it, finished and queued, and pays for each header
 * twice. Measured on a phone: four per half came to 1067px even folded, which
 * is a card and a half of screen for something sitting below two other cards.
 * Three per half is six rows and the fold button, and the owner's own section
 * showed four rows out of forty, so a first page of three is the same idea.
 */
const FIRST = 3;

/** Already under a post, or already failed to get there. */
function happened(status: string | undefined): boolean {
  return status === 'done' || commentNeedsHuman(status);
}

export function CommentTimeline({
  rows,
  done,
  totals,
}: {
  /** Everything carrying a comment state — the dashboard's existing read. */
  rows: QueueRow[];
  /** The finished ones, read separately and more deeply than `rows` reaches. */
  done: QueueRow[];
  /** The REAL counts, from the database rather than from these two windows. */
  totals: CommentTotals;
}) {
  const [showAll, setShowAll] = useState(false);

  /*
   * ONE ROW PER PUBLICATION, however many reads it arrived in.
   *
   * `rows` and `done` overlap on purpose — the first is every comment state
   * capped at sixty by published_at, the second is the finished ones capped at
   * forty by comment_at, and a busy day puts the same comment in both. Drawn
   * twice it would be the rail claiming two comments under one post.
   */
  const byId = new Map<string, QueueRow>();
  for (const r of [...done, ...rows]) if (r.comment_status) byId.set(r.id, r);
  const all = [...byId.values()];

  /*
   * NEWEST FIRST, like the section this mirrors ("החדשות קודם"). The card
   * above sorts its finished comments that way and the owner reads this one
   * straight after it; flipping the order between two adjacent lists of the
   * same thing is how a screen starts lying about sequence.
   */
  const past = all
    .filter((r) => happened(r.comment_status))
    .sort((a, b) => (b.comment_at ?? '').localeCompare(a.comment_at ?? ''));

  /*
   * The waiting ones in the order the worker will take them: oldest
   * publication first. That is the order listCommentQueue reads them in and
   * the order the worker claims them, so the numbers on screen are the real
   * positions rather than a second opinion about them.
   */
  const waiting = all
    .filter((r) => !happened(r.comment_status))
    .sort((a, b) => (a.published_at ?? a.scheduled_at).localeCompare(b.published_at ?? b.scheduled_at));

  if (!past.length && !waiting.length) {
    return (
      <Card title="ציר הזמן של התגובות" subtitle="מה כבר נכתב, מה נכשל ומה עוד בתור">
        <EmptyState
          icon={<MessageIcon className="h-5 w-5" />}
          title="עוד לא ביקשתם תגובות"
          description="אחרי שתוסיפו תגובה לפרסום, כל תגובה תופיע כאן לפי הסדר — עם קישור לפוסט שהיא יושבת עליו."
        />
      </Card>
    );
  }

  /*
   * THE REMAINDER IS COUNTED FROM THE DATABASE, NOT FROM THE ARRAY.
   *
   * These two reads are capped at sixty and forty. With the hundred and
   * twenty-four failures and hundred and twenty-five waiting on the owner's
   * own screen, the arrays are a window and printing their length as a total
   * is the exact defect the publications rail was fixed for — "6 shown, ועוד
   * 34" when the real remainder was 55. `totals` is four COUNT queries.
   */
  const real = totals.done + totals.failed + totals.unverified + totals.pending;
  const loaded = past.length + waiting.length;
  const missing = Math.max(0, real - loaded);
  const today = zonedDateISO(new Date());

  /* One row, in the clothes of the card above. */
  const Row = ({ r, place }: { r: QueueRow; place: number }) => {
    const status = r.comment_status ?? '';
    const tone = COMMENT_TONE[status as keyof typeof COMMENT_TONE] ?? 'neutral';
    const isPast = happened(status);
    /* The POST's address. Facebook gives a group post one handle and the
       comment lives under it, so this is as close as the database can point —
       and it is the right place to land: the comment is on that page. */
    const href = r.permalink || r.target?.url || '';
    return (
      <li className="min-w-0 rounded-xl bg-ink-800/50 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {r.target?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.target.image_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          ) : (
            <TargetAvatar name={r.target?.name ?? ''} size={32} />
          )}
          {/* dir="auto": these names are Russian and English inside an RTL
              card, and forcing either direction puts the punctuation on the
              wrong end. */}
          <p dir="auto" className="min-w-0 flex-1 truncate text-[13px] font-bold text-mist-100">{r.target?.name ?? 'קבוצה'}</p>
          {href && (
            <Link
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={`פתח את הפוסט ב${r.target?.name ?? 'קבוצה'} ואת התגובה שעליו`}
              className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border border-ink-600 px-2.5 text-[11.5px] font-bold text-mist-100 transition-colors hover:bg-ink-700"
            >
              <ShareIcon aria-hidden className="h-3 w-3" />
              לתגובה
            </Link>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-mist-500">
          {/*
            ONE LINE, TWO MEANINGS. A finished comment shows the instant it
            happened; a waiting one shows its place in the queue, because no
            time for it exists anywhere to be shown.
          */}
          {isPast ? <Stamp iso={r.comment_at} /> : <span className="font-bold text-brand-400">{`מקום ${place} בתור`}</span>}
          <span className={`font-bold ${TONE_TEXT[tone]}`}>{commentLabel(status)}</span>
        </p>
        {/*
          THE REASON, WHOLE. "לא הצליח" on its own is what makes a person press
          the same button again — a post the admin deleted, a group that closed
          comments and a security screen are three different things to do next.
        */}
        {r.comment_note && (
          /* Clamped at three lines. Every real reason the worker writes fits
             in two; the clamp is against a pathological one making a single
             row taller than the card's whole first page. The full text is one
             tap away in "תגובות לפרסומים" above. */
          <p dir="auto" className={`mt-0.5 line-clamp-3 text-[11px] leading-snug ${commentNeedsHuman(status) ? 'text-warning-400' : 'text-mist-500'}`}>
            {r.comment_note}
          </p>
        )}
      </li>
    );
  };

  const shownPast = showAll ? past : past.slice(0, FIRST);
  const shownWaiting = showAll ? waiting : waiting.slice(0, FIRST);
  const folded = past.length - shownPast.length + (waiting.length - shownWaiting.length);

  return (
    <Card title="ציר הזמן של התגובות" subtitle="מה כבר נכתב, מה נכשל ומה עוד בתור">
      {past.length > 0 && (
        <>
          <h3 className="text-[13px] font-extrabold text-mist-100">מה כבר נכתב</h3>
          {/*
            HOW MANY OF HOW MANY, IN ONE SENTENCE — the same shape the card
            above states it in, and for the same reason: two counts that
            disagree leave the reader adding numbers to work out which is which.
          */}
          <p className="mt-1 text-[11px] text-mist-500">
            {`מוצגות ${shownPast.length} מתוך ${past.length} האחרונות, החדשות קודם.`}
            {missing > 0 && ` סך הכול ${real} תגובות במערכת — המסך הזה טוען רק את האחרונות.`}
          </p>
          <ul className="mt-2 grid gap-1.5">
            {shownPast.map((r, i) => {
              const at = r.comment_at;
              const day = at ? zonedDateISO(new Date(at)) : '';
              const prev = i > 0 ? shownPast[i - 1].comment_at : null;
              const showDay = Boolean(day) && day !== today && (i === 0 || (prev ? zonedDateISO(new Date(prev)) : '') !== day);
              return (
                /* A keyed Fragment, not a wrapper element: <ul> may only
                   contain <li>, and a <div className="contents"> between them
                   is invalid markup that happens to lay out correctly — which
                   is the worst kind, because only a validator ever says so. */
                <Fragment key={r.id}>
                  {/* `at &&` as well as showDay: showDay already implies it,
                      but only through a Boolean(day) the compiler cannot
                      follow back to this variable, and a cast here would be
                      the one place a day heading could say "Invalid Date". */}
                  {showDay && at && (
                    <p className="mt-1.5 text-[11px] font-extrabold uppercase tracking-wide text-mist-500">{formatDateHe(at)}</p>
                  )}
                  <Row r={r} place={0} />
                </Fragment>
              );
            })}
          </ul>
        </>
      )}

      {waiting.length > 0 && (
        <>
          <h3 className={`text-[13px] font-extrabold text-mist-100 ${past.length ? 'mt-4 border-t border-ink-700 pt-3' : ''}`}>
            מה עוד בתור
          </h3>
          <p className="mt-1 text-[11px] text-mist-500">
            {`מוצגות ${shownWaiting.length} מתוך ${waiting.length} שנטענו, לפי הסדר שבו הן ייצאו.`}
          </p>
          <ul className="mt-2 grid gap-1.5">
            {shownWaiting.map((r, i) => (
              <Row key={r.id} r={r} place={i + 1} />
            ))}
          </ul>
        </>
      )}

      {folded > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-ink-800/50 text-[12.5px] font-bold text-brand-400 transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          {`הצג עוד ${folded}`}
          <ChevronDownIcon aria-hidden className="h-4 w-4" />
        </button>
      )}
      {showAll && loaded > FIRST && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-ink-800/50 text-[12.5px] font-bold text-brand-400 transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          הצג פחות
          <ChevronDownIcon aria-hidden className="h-4 w-4 rotate-180" />
        </button>
      )}

      {missing > 0 && (
        <p className="mt-2 text-[11px] text-mist-500">
          ועוד {counted(missing, 'תגובה אחת', 'תגובות', 'שתי תגובות')} {agree(missing, 'שלא נטענה למסך הזה', 'שלא נטענו למסך הזה')}.
        </p>
      )}
      <p className="mt-1 text-[11px] leading-snug text-mist-500">
        התגובות יוצאות אחת-אחת, במרווח שנבחר לכל סבב — ולכן אין להן שעה מראש.
      </p>
    </Card>
  );
}
