'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CommentTotals, QueueRow } from '@/lib/social/client';
import { retryFailedComments } from '@/lib/social/client';
import { agree } from '@/lib/social/time';
import { COMMENT_TONE, commentNeedsHuman, commentRank, type CommentStatus } from '@/lib/social/comments';
import { AlertTriangleIcon, CheckCircleIcon, ChevronDownIcon, RepeatIcon, ShareIcon } from '@/components/icons';
import { CommentShot } from './CommentShot';
import { TargetAvatar } from './TargetAvatar';
import { CommentState } from './CommentState';
import { Card, TONE_TINT } from './ui';

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
 *
 * ── THE REDESIGN, AND WHAT IT DID NOT CHANGE ──────────────────────────────
 *
 * This was one flat list of every row, worst-first, each carrying its own copy
 * of the same long failure sentence. With twenty-seven failures that is the
 * same paragraph twenty-seven times, and the shape of the problem — how many
 * went out, how many are stuck — was somewhere inside it.
 *
 * Now: the numbers first, as a bar and two tiles, then the failures on their
 * own as a short list of names with the actions next to them. The reason and
 * the screenshot are one tap away per row instead of always on screen.
 *
 * Every number still comes from `totals`, which is counted in the database
 * (client.ts commentTotals) and not from this page's slice of rows. Nothing
 * here is computed from rows.length, which is a page size and was once
 * printed as a fact about the work.
 */
export function CommentQueueCard({ rows, totals, onChanged }: { rows: QueueRow[]; totals: CommentTotals; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  if (!rows.length) return null;

  const { pending, done, failed, unverified } = totals;
  const all = pending + done + failed + unverified;
  const needsHuman = failed + unverified;
  /* Guarded: `all` is a sum of counts and can be zero on a fresh install, and
     a bar that divides by it would render NaN% and collapse. */
  const pct = (n: number) => (all > 0 ? (n / all) * 100 : 0);

  /*
   * WHAT IS LEFT TO LOOK AT, BY NAME.
   *
   * The failures — and, deliberately, one more kind: a comment that SUCCEEDED
   * and still left a note. That happens ("the picture went in and Facebook
   * never showed it back"), and the first version of this redesign filtered it
   * out along with every other success. The note would have existed in the
   * database and appeared on no screen. A row that went out cleanly and said
   * nothing is the only thing dropped here.
   */
  const stuck = rows.filter((r) => commentNeedsHuman(r.comment_status) || (r.comment_status === 'done' && r.comment_note));
  /* Worst first, by the one rank in comments.ts — shared with the round's own
     screen, which had drifted into a different order once already. */
  const sorted = [...stuck].sort((a, b) => commentRank(a.comment_status) - commentRank(b.comment_status));
  const FIRST = 2;
  const shown = open ? sorted : sorted.slice(0, FIRST);
  const hidden = stuck.length - shown.length;
  /* Against the FAILURES only: `stuck` can also hold a success with a caveat,
     and counting those against the failure total would under-report what is
     missing from this page. */
  const namedFailures = stuck.filter((r) => commentNeedsHuman(r.comment_status)).length;
  const unnamed = Math.max(0, needsHuman - namedFailures);

  /*
   * RETRY, THROUGH THE FUNCTION THAT ALREADY EXISTS.
   *
   * retryFailedComments() works per ROUND, not per row — it puts that round's
   * 'failed' rows back to 'pending' and deliberately leaves 'unverified'
   * alone, because an unverified comment may already be live and a second one
   * cannot be taken back. There is no per-row retry in this codebase and this
   * change does not add one: inventing a new write path is not a redesign.
   *
   * So the button is where the function's granularity actually is — over the
   * whole list — and says so.
   */
  const rounds = [...new Set(stuck.filter((r) => r.comment_status === 'failed').map((r) => r.campaign_id).filter(Boolean))] as string[];
  async function retryAll() {
    if (retrying || !rounds.length) return;
    setRetrying(true);
    try {
      for (const id of rounds) await retryFailedComments(id);
      onChanged?.();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Card
      /* `title` is a ReactNode, so the mark goes in it — Card has no icon
         slot and adding one would be a change to every other card. */
      title={
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-300/12 text-brand-300">
            {/* Inline rather than added to components/icons.tsx: there is no
                speech bubble in the set, and this change is meant to touch one
                card and nothing else. */}
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
            </svg>
          </span>
          תגובות לפרסומים
        </span>
      }
      subtitle="מעקב אחר תגובות על הפוסטים שפורסמו בקבוצות"
    >
      {/* ── the two numbers, and the bar between them ─────────────────── */}
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm font-bold text-mist-100">
          <span className="text-lg text-success-400">{done}</span> הצליחו{' '}
          <span className="font-normal text-mist-500">מתוך {all}</span>
        </p>
        {needsHuman > 0 && (
          <p className="text-sm font-extrabold text-warning-400">
            {needsHuman} לטיפול
          </p>
        )}
      </div>

      {/* One rail, three parts: what went out, what is stuck, and the rest
          still waiting its turn. The remainder is left as the track's own
          colour rather than drawn, so "not yet" never reads as a state. */}
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-ink-700" role="presentation">
        <span className="h-full bg-success-400 transition-[width] duration-500" style={{ width: `${pct(done)}%` }} />
        <span className="h-full bg-warning-400 transition-[width] duration-500" style={{ width: `${pct(needsHuman)}%` }} />
      </div>

      {/* ── the same two facts, spelled out ──────────────────────────── */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
        <div className="flex items-start gap-2 rounded-xl bg-success-400/10 p-3">
          <CheckCircleIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success-400" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-success-400">{`${done} ${agree(done, 'תגובה הועלתה', 'תגובות הועלו')} בהצלחה`}</p>
            <p className="text-[11px] text-mist-500">{`מתוך ${all} ${agree(all, 'פרסום', 'פרסומים')}`}</p>
          </div>
        </div>
        {needsHuman > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-warning-400/10 p-3">
            <AlertTriangleIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning-400" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-warning-400">{`${needsHuman} ${agree(needsHuman, 'תגובה דורשת', 'תגובות דורשות')} טיפול`}</p>
              <p className="text-[11px] text-mist-500">לא ניתן היה להגיב עליהן</p>
            </div>
          </div>
        )}
        {/* Only while there is one. The reference has two tiles because its
            queue was finished; a round still running has a third fact, and
            hiding it would make "74 מתוך 101" look like a final score. */}
        {pending > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-ink-800 p-3">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mist-500" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-mist-100">{`${pending} ${agree(pending, 'קבוצה ממתינה', 'קבוצות ממתינות')} לתגובה`}</p>
              <p className="text-[11px] text-mist-500">נוספות אחת-אחת</p>
            </div>
          </div>
        )}
      </div>

      {/* ── the failures, by name ────────────────────────────────────── */}
      {stuck.length > 0 && (
        <div className="mt-4 border-t border-ink-700 pt-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-extrabold text-mist-100">תגובות שנכשלו</h3>
            <span className="rounded-full bg-warning-400/15 px-2 py-0.5 text-[11px] font-extrabold text-warning-400">{needsHuman}</span>
            <span className="grow" />
            {rounds.length > 0 && (
              <button
                type="button"
                onClick={() => void retryAll()}
                disabled={retrying}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-bold text-brand-400 transition-colors hover:bg-brand-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-40"
              >
                <RepeatIcon aria-hidden className="h-4 w-4" />
                {retrying ? 'מנסה שוב…' : 'נסה שוב את כולן'}
              </button>
            )}
          </div>
          <p className="mt-0.5 text-xs text-mist-500">רשימת הקבוצות שבהן לא הצלחנו להגיב. נסו שוב או פתחו בפייסבוק.</p>

          <ul className="mt-3 grid gap-2">
            {shown.map((r) => {
              const href = r.permalink || r.target?.url || '';
              return (
                <li key={r.id} className="min-w-0 rounded-xl bg-ink-800/50 p-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {r.target?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.target.image_url} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <TargetAvatar name={r.target?.name ?? ''} size={36} />
                    )}
                    <div className="min-w-0 flex-1">
                      {/* dir="auto" and nothing else: these names are Russian
                          and English inside an RTL card, and forcing either
                          direction puts the punctuation on the wrong end. */}
                      <p dir="auto" className="truncate text-[13px] font-bold text-mist-100">{r.target?.name ?? '—'}</p>
                      <p className="truncate text-[11px] text-mist-500">קבוצה בפייסבוק</p>
                    </div>
                    {/* The reason, folded away. It is the same sentence on
                        every row and it was printed twenty-seven times. */}
                    {(r.comment_note || r.comment_shot) && (
                      <button
                        type="button"
                        onClick={() => setDetail(detail === r.id ? null : r.id)}
                        aria-expanded={detail === r.id}
                        aria-label={detail === r.id ? 'סגור פרטים' : 'הצג פרטים'}
                        className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-mist-500 transition-colors hover:bg-ink-700 hover:text-mist-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                      >
                        •••
                      </button>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {/*
                      * THE SHARED COMPONENT, INSIDE THE NEW CHIP.
                      *
                      * The first pass hand-rolled a pill here and that is the
                      * mistake CommentState was extracted to prevent: this
                      * card and the round's own screen have drifted into
                      * different labels, different sorts and different markup
                      * twice already. It also carries the link to the post,
                      * which is the proof the owner asked for.
                      *
                      * So the pill is the tint and the shape only; the word,
                      * its colour and its link all still come from the one
                      * component. A success with a caveat is therefore green,
                      * not orange — it happened, with a remark.
                      */}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 ${TONE_TINT[COMMENT_TONE[r.comment_status as CommentStatus] ?? 'neutral']}`}>
                      {commentNeedsHuman(r.comment_status) && <AlertTriangleIcon aria-hidden className="h-3 w-3 text-warning-400" />}
                      <CommentState status={r.comment_status} permalink={r.permalink} />
                    </span>
                    <span className="grow" />
                    {href && (
                      <Link
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ink-700 px-3 text-[13px] font-bold text-mist-100 transition-colors hover:bg-ink-600"
                      >
                        <ShareIcon aria-hidden className="h-3.5 w-3.5" />
                        פתח בפייסבוק
                      </Link>
                    )}
                  </div>

                  {detail === r.id && (
                    <div className="mt-2 border-t border-ink-700 pt-2">
                      {r.comment_note && (
                        <p dir="auto" className={`text-[11px] leading-relaxed ${commentNeedsHuman(r.comment_status) ? 'text-warning-400' : 'text-mist-300'}`}>{r.comment_note}</p>
                      )}
                      {/* What the worker's browser actually had on screen.
                          Words were not enough: rounds went by on "לא מצאנו
                          את הפוסט" while the owner looked straight at the
                          post on his phone. Only where a person is needed — a
                          success has nothing to prove. */}
                      {commentNeedsHuman(r.comment_status) && r.comment_shot && <CommentShot path={r.comment_shot} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-ink-800/50 text-[13px] font-bold text-brand-400 transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              {`הצג עוד ${hidden} ${agree(hidden, 'קבוצה', 'קבוצות')} עם תגובות שנכשלו`}
              <ChevronDownIcon aria-hidden className="h-4 w-4" />
            </button>
          )}
          {open && stuck.length > FIRST && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-ink-800/50 text-[13px] font-bold text-brand-400 transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              הצג פחות
            </button>
          )}
          {/* The count is the database's; the names are this page's slice. When
              the second is smaller, say so rather than let the list look
              complete. */}
          {unnamed > 0 && (
            <p className="mt-2 text-[11px] text-mist-500">{`ועוד ${unnamed} ${agree(unnamed, 'קבוצה', 'קבוצות')} שלא נטענו למסך הזה — פתחו את ההיסטוריה כדי לראות את כולן.`}</p>
          )}
        </div>
      )}
    </Card>
  );
}
