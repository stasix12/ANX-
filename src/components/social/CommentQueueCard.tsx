'use client';

import Link from 'next/link';
import type { CommentTotals, QueueRow } from '@/lib/social/client';
import { agree } from '@/lib/social/time';
import { COMMENT_TONE, commentLabel, commentNeedsHuman, commentRank, type CommentStatus } from '@/lib/social/comments';
import { CommentShot } from './CommentShot';
import { TargetAvatar } from './TargetAvatar';
import { Card, TONE_FILL } from './ui';

/**
 * Which groups a comment is going out to, on the main screen.
 *
 * The round's own screen already showed a count. A count is not the question
 * somebody actually has while this is running: "3 הגיבו" says nothing about
 * whether the one group that matters has been reached, and a failure is only
 * something you can act on once it has a name. So this is the list, and the
 * owner asked for it in both places because they look at both.
 *
 * Absent entirely when nothing was asked for — an empty card about a feature
 * nobody is using is just furniture.
 */
export function CommentQueueCard({ rows, totals }: { rows: QueueRow[]; totals: CommentTotals }) {
  if (!rows.length) return null;

  /*
   * The counts come from the database, the list from the page.
   *
   * They used to both come from the page, so a task over a hundred and
   * seventeen posts announced itself as fifty-nine — the page size, stated as
   * a fact about the work.
   */
  const { pending, done, failed, unverified } = totals;
  const all = pending + done + failed + unverified;
  const shownAll = rows.length >= all;
  /* Worst first — the rows that need a person are the only reason to open a
     list of a hundred. One order, from comments.ts, shared with the round's
     own screen: the two used to sort differently and label differently. */
  const sorted = [...rows].sort((a, b) => commentRank(a.comment_status) - commentRank(b.comment_status));

  return (
    <Card
      title="תגובות לפרסומים"
      subtitle={
        pending > 0
          ? `${pending} ${agree(pending, 'קבוצה ממתינה', 'קבוצות ממתינות')} לתגובה. הן נוספות אחת-אחת.`
          : /* "everything went out" is not true while the body of this very
               card lists three that did not. The unfinished ones are named
               instead, since they are the only reason to read further. */
            failed + unverified > 0
            ? `${failed + unverified} ${agree(failed + unverified, 'פרסום לא קיבל', 'פרסומים לא קיבלו')} את התגובה. פתחו אותם כדי לראות למה.`
            : 'כל התגובות שביקשתם כבר יצאו.'
      }
    >
      <p className="mb-3 text-sm text-mist-300">
        {done > 0 && `${done} ${agree(done, 'הגיב', 'הגיבו')}`}
        {pending > 0 && `${done > 0 ? ' · ' : ''}${pending} ${agree(pending, 'ממתין', 'ממתינים')}`}
        {/* Named, never folded into the total: the post is live and the owner
            believes their comment is under it. */}
        {failed > 0 && <span className="text-warning-400">{`${done + pending > 0 ? ' · ' : ''}${failed} לא הצליחו`}</span>}
        {/* And apart from the failures, because the two need different things
            done: one is worth a retry, this one is worth a look first. */}
        {unverified > 0 && <span className="text-warning-400">{`${done + pending + failed > 0 ? ' · ' : ''}${unverified} צריך לבדוק`}</span>}
      </p>
      {!shownAll && <p className="mb-2 text-xs text-mist-500">{`מוצגות ${rows.length} הקבוצות הראשונות מתוך ${all}.`}</p>}
      <ul className="max-h-72 min-w-0 divide-y divide-ink-700 overflow-y-auto overscroll-contain rounded-xl bg-ink-800/40">
        {sorted.map((r) => (
          <li key={r.id} className="min-w-0 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TONE_FILL[COMMENT_TONE[r.comment_status as CommentStatus] ?? 'neutral']}`} />
              {r.target?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.target.image_url} alt="" className="h-6 w-6 shrink-0 rounded-lg object-cover" />
              ) : (
                <TargetAvatar name={r.target?.name ?? ''} size={24} />
              )}
              {/* The group, tappable — a failure is worth opening. */}
              {r.target?.url ? (
                <Link
                  href={r.target.url}
                  target="_blank"
                  rel="noreferrer"
                  dir="auto"
                  className="min-w-0 flex-1 truncate text-[13px] text-mist-100"
                >
                  {r.target.name}
                </Link>
              ) : (
                <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-mist-100">
                  {r.target?.name ?? '—'}
                </span>
              )}
              <span className="shrink-0 text-[11px] text-mist-500">{commentLabel(r.comment_status)}</span>
            </div>
            {/* The reason, and only where there is one to give. "לא הצליח" on
                its own is what makes a person press the same button again. */}
            {commentNeedsHuman(r.comment_status) && r.comment_note && (
              <p dir="auto" className="mt-1 ps-4 text-[11px] leading-relaxed text-warning-400">{r.comment_note}</p>
            )}
            {/* And what the worker's browser actually had on screen. Words
                were not enough: rounds went by on "לא מצאנו את הפוסט" while
                the owner looked straight at the post on his phone. */}
            {commentNeedsHuman(r.comment_status) && r.comment_shot && (
              <div className="ps-4">
                <CommentShot path={r.comment_shot} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
