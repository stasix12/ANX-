'use client';

import Link from 'next/link';
import type { CommentTotals, QueueRow } from '@/lib/social/client';
import { COMMENT_TONE, commentLabel, commentNeedsHuman } from '@/lib/social/comments';
import { agree, counted, formatDateHe, formatTimeHe, zonedDateISO } from '@/lib/social/time';
import { TargetAvatar } from './TargetAvatar';
import { Card, EmptyState, TONE_FILL, TONE_TEXT, TONE_TINT, type Tone } from './ui';
import { MessageIcon, ShareIcon } from '@/components/icons';

/**
 * THE COMMENTS, IN ORDER — what already went under a post, and what is queued.
 *
 * Asked for in these words: "אני רוצה לראות טיימלין של תזמון התגובות ומה שכבר
 * בוצע / נכשל אם קישור מהיר לתגובה בעמוד".
 *
 * WHY IT IS NOT THE CARD ABOVE IT. "תגובות לפרסומים" answers "how many, and
 * what needs me" — three rollups with the exceptions foldable underneath. That
 * is the right shape for triage and the wrong one for a sequence: a hundred
 * and twenty-four failures in a drawer say nothing about WHEN they happened or
 * in what order the rest are coming. This is the same afternoon told as a
 * line, which is the shape the publications rail already uses on this screen.
 *
 * THE RAIL IS DELIBERATELY THE SAME as Timeline's: hollow dot behind us,
 * filled dot still coming, a line between. Two rails on one screen that looked
 * different would read as two features.
 *
 * NOTHING HERE IS INTERPOLATED. A finished comment sits at `comment_at`, the
 * instant it actually happened. A waiting one carries no time at all, because
 * none is stored: the worker takes them one at a time at the spacing each
 * round chose, interleaved with whatever it is publishing, so any clock this
 * card printed would be a guess. It shows the QUEUE POSITION instead, which is
 * a fact.
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

  const past = all
    .filter((r) => happened(r.comment_status))
    /* Placed at the moment each one actually happened. A comment that went
       under a post at 18:02 sitting above one from 18:51 would be the rail
       telling the evening out of order. */
    .sort((a, b) => (a.comment_at ?? '').localeCompare(b.comment_at ?? ''));

  /*
   * The waiting ones in the order the worker will take them: oldest
   * publication first. That is the order listCommentQueue reads them in and
   * the order the worker claims them, so the numbers on screen are the real
   * positions rather than a second opinion about them.
   */
  const waiting = all
    .filter((r) => !happened(r.comment_status))
    .sort((a, b) => (a.published_at ?? a.scheduled_at).localeCompare(b.published_at ?? b.scheduled_at));

  const items = [...past, ...waiting];

  if (!items.length) {
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
   * twenty-four failures and hundred and twenty-six waiting on the owner's own
   * screen, `items.length` is a window and printing it as a total is the exact
   * defect the publications rail was fixed for — "6 shown, ועוד 34" when the
   * real remainder was 55. `totals` is four COUNT queries; it is the truth.
   */
  const real = totals.done + totals.failed + totals.unverified + totals.pending;
  const rest = Math.max(0, real - items.length);
  const today = zonedDateISO(new Date());

  return (
    <Card title="ציר הזמן של התגובות" subtitle="מה כבר נכתב, מה נכשל ומה עוד בתור">
      {/*
        A box that scrolls rather than a list cut off at six with the rest
        behind a button. The half-row at the bottom edge is the affordance:
        a row clipped mid-height says "there is more below" better than a hint.
      */}
      <div className="max-h-[22rem] overflow-y-auto pe-1">
        <ol className="relative space-y-0.5">
          {items.map((row, i) => {
            const status = row.comment_status ?? '';
            const tone = COMMENT_TONE[status as keyof typeof COMMENT_TONE] ?? 'neutral';
            const isPast = happened(status);
            const at = row.comment_at;
            /* The POST's address. Facebook gives a group post one handle and
               the comment lives under it, so this is as close as the database
               can point — and it is the right place to land: the comment is on
               that page. The same fallback the card above uses. */
            const href = row.permalink || row.target?.url || '';
            const day = at ? zonedDateISO(new Date(at)) : '';
            const showDay =
              Boolean(day) &&
              day !== today &&
              (i === 0 || zonedDateISO(new Date(items[i - 1].comment_at ?? 0)) !== day);
            /* Where in the line this one is — 1 for the next comment out.
               Counted from the start of the waiting block, not from the whole
               list, or the first one queued would be numbered after every
               comment that ever succeeded. */
            const place = isPast ? 0 : i - past.length + 1;
            return (
              <li key={row.id}>
                {/* `at &&` as well as showDay: showDay already implies it, but
                    only through a Boolean(day) the compiler cannot follow back
                    to this variable, and a cast here would be the one place
                    the day heading could render "Invalid Date". */}
                {showDay && at && (
                  <p className="mb-1 mt-3 text-[11px] font-extrabold uppercase tracking-wide text-mist-500">{formatDateHe(at)}</p>
                )}
                <div className="flex items-stretch gap-3">
                  <div className="flex w-3 shrink-0 flex-col items-center pt-3.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        isPast ? `bg-ink-850 ring-2 ${RING_DONE[tone]}` : TONE_FILL[tone]
                      } ${status === 'commenting' ? `ring-4 ring-brand-300/20` : ''}`}
                    />
                    {i < items.length - 1 && <span aria-hidden className="w-px grow bg-ink-700" />}
                  </div>
                  <div
                    className={`flex min-w-0 grow items-center gap-2.5 rounded-xl px-2 py-2 ${
                      status === 'commenting' ? TONE_TINT[tone] : ''
                    }`}
                  >
                    {/*
                      ONE COLUMN, TWO MEANINGS, and the styling says which:
                      a finished comment shows the hour it happened, dimmed;
                      a waiting one shows its place in line, in the accent.
                      Same width either way so the names below stay in a
                      straight edge.
                    */}
                    <span className="w-12 shrink-0 text-sm font-extrabold tabular-nums">
                      {isPast ? (
                        <span className="text-mist-500">{at ? formatTimeHe(at) : '—'}</span>
                      ) : (
                        <span dir="ltr" className="inline-block text-brand-400">{`#${place}`}</span>
                      )}
                    </span>
                    <TargetAvatar name={row.target?.name ?? '?'} imageUrl={row.target?.image_url} channel={row.target?.channel} size={30} />
                    <div className="min-w-0 grow">
                      {/* dir="auto": these group names are Russian and English
                          inside an RTL card, and forcing either direction puts
                          the punctuation on the wrong end. */}
                      <p dir="auto" className="truncate text-sm font-bold text-mist-100">{row.target?.name ?? 'קבוצה'}</p>
                      <p className={`text-[11px] font-bold ${TONE_TEXT[tone]}`}>{commentLabel(status)}</p>
                      {/*
                        THE REASON, WHOLE. "לא הצליח" on its own is what makes a
                        person press the same button again — a post the admin
                        deleted, a group that closed comments and a security
                        screen are three different things to do next.
                      */}
                      {row.comment_note && (
                        <p dir="auto" className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-mist-500">{row.comment_note}</p>
                      )}
                    </div>
                    {/* The quick link that was asked for, on every row that has
                        an address — including the ones still queued, because
                        "where is this about to go" is the same question. */}
                    {href && (
                      <Link
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`פתח את הפוסט ב${row.target?.name ?? 'קבוצה'} ואת התגובה שעליו`}
                        className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border border-ink-600 px-2.5 text-[11.5px] font-bold text-mist-100 transition-colors hover:bg-ink-700"
                      >
                        <ShareIcon aria-hidden className="h-3 w-3" />
                        לתגובה
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Outside the scrolling box, because it is about rows that were never
          read and therefore can never be scrolled to. */}
      {rest > 0 && (
        <p className="ps-6 pt-2 text-xs text-mist-500">
          ועוד {counted(rest, 'תגובה אחת', 'תגובות', 'שתי תגובות')} {agree(rest, 'אחריה', 'אחריהן')}
        </p>
      )}
      <p className="ps-6 pt-1 text-[11px] leading-snug text-mist-500">
        התגובות יוצאות אחת-אחת, במרווח שנבחר לכל סבב — ולכן אין להן שעה מראש.
      </p>
    </Card>
  );
}
