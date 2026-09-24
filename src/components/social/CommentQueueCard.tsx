'use client';

import Link from 'next/link';
import type { CommentTotals, QueueRow } from '@/lib/social/client';
import { agree } from '@/lib/social/time';
import { TargetAvatar } from './TargetAvatar';
import { Card, TONE_FILL } from './ui';

/* Pending first: it is the part still moving, and the part worth watching. */
const ORDER = ['pending', 'failed', 'done'];

const LABEL: Record<string, string> = {
  pending: 'ממתין',
  done: 'הגיב',
  failed: 'לא הצליח',
};

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
  const { pending, done, failed } = totals;
  const shownAll = rows.length >= pending + done + failed;
  const sorted = [...rows].sort(
    (a, b) => ORDER.indexOf(a.comment_status ?? '') - ORDER.indexOf(b.comment_status ?? ''),
  );

  return (
    <Card
      title="תגובות לפרסומים"
      subtitle={
        pending > 0
          ? `${pending} ${agree(pending, 'קבוצה ממתינה', 'קבוצות ממתינות')} לתגובה. הן נוספות אחת-אחת.`
          : 'כל התגובות שביקשתם כבר יצאו.'
      }
    >
      <p className="mb-3 text-sm text-mist-400">
        {done > 0 && `${done} ${agree(done, 'הגיב', 'הגיבו')}`}
        {pending > 0 && `${done > 0 ? ' · ' : ''}${pending} ${agree(pending, 'ממתין', 'ממתינים')}`}
        {/* Named, never folded into the total: the post is live and the owner
            believes their comment is under it. */}
        {failed > 0 && <span className="text-warning-400">{`${done + pending > 0 ? ' · ' : ''}${failed} לא הצליחו`}</span>}
      </p>
      {!shownAll && (
        <p className="mb-2 text-xs text-mist-500">{`מוצגות ${rows.length} הקבוצות הראשונות מתוך ${pending + done + failed}.`}</p>
      )}
      <ul className="max-h-72 divide-y divide-ink-700 overflow-y-auto overscroll-contain rounded-xl bg-ink-800/40">
        {sorted.map((r) => (
          <li key={r.id} className="min-w-0 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${
                  r.comment_status === 'done' ? TONE_FILL.good : r.comment_status === 'failed' ? TONE_FILL.warn : TONE_FILL.neutral
                }`}
              />
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
                  className="min-w-0 flex-1 truncate text-[13px] text-mist-200"
                >
                  {r.target.name}
                </Link>
              ) : (
                <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-mist-200">
                  {r.target?.name ?? '—'}
                </span>
              )}
              <span className="shrink-0 text-[11px] text-mist-500">{LABEL[r.comment_status ?? ''] ?? ''}</span>
            </div>
            {/* The reason, and only where there is one to give. "לא הצליח" on
                its own is what makes a person press the same button again. */}
            {r.comment_status === 'failed' && r.comment_note && (
              <p className="mt-1 pr-4 text-[11px] leading-relaxed text-warning-400/90">{r.comment_note}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
