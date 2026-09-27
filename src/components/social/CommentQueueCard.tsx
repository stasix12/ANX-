'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CommentTotals, QueueRow } from '@/lib/social/client';
import { retryComment, retryFailedComments } from '@/lib/social/client';
import { agree } from '@/lib/social/time';
import { commentLabel, commentNeedsHuman, commentRank } from '@/lib/social/comments';
import { AlertTriangleIcon, CheckCircleIcon, ChevronDownIcon, RepeatIcon, ShareIcon } from '@/components/icons';
import { CommentShot } from './CommentShot';
import { TargetAvatar } from './TargetAvatar';
import { Card } from './ui';

/**
 * Which groups a comment is going out to, on the main screen.
 *
 * The round's own screen already showed a count. A count is not the question
 * somebody actually has while this is running: "3 הגיבו" says nothing about
 * whether the one group that matters has been reached, and a failure is only
 * something you can act on once it has a name.
 *
 * Absent entirely when nothing was asked for — an empty card about a feature
 * nobody is using is just furniture.
 *
 * ── THE SHAPE, AND WHY ────────────────────────────────────────────────────
 *
 * Closed: the two numbers, a bar, two short tiles. That is the whole answer to
 * "is this working" and it fits in a glance.
 *
 * The orange tile is the door. Twenty-seven failures listed permanently on the
 * main screen is a wall of the same sentence between the owner and everything
 * below it — and every one of them was already counted in the tile above. So
 * the list opens when somebody asks for it, which is the moment they intend to
 * do something about it.
 *
 * Every number comes from `totals`, counted in the database (client.ts
 * commentTotals), never from rows.length — that is a page size, and it was
 * once printed as a fact about the work.
 */
export function CommentQueueCard({ rows, totals, onChanged }: { rows: QueueRow[]; totals: CommentTotals; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!rows.length) return null;

  const { pending, done, failed, unverified } = totals;
  const all = pending + done + failed + unverified;
  const needsHuman = failed + unverified;
  /* Guarded: `all` is a sum of counts and is zero on a fresh install, where a
     bar dividing by it renders NaN% and collapses. */
  const pct = (n: number) => (all > 0 ? (n / all) * 100 : 0);
  /* Rounded for reading, floored away from 100: 127 of 128 is not "100%", and
     a person who sees 100% beside a failure count stops trusting both. */
  const rate = all > 0 ? Math.min(done === all ? 100 : 99, Math.round((done / all) * 100)) : 0;

  /*
   * WHAT IS LEFT TO LOOK AT, BY NAME.
   *
   * The failures — and, deliberately, one more kind: a comment that SUCCEEDED
   * and still left a note. That happens ("the picture went in and Facebook
   * never showed it back"), and an earlier pass filtered it out along with
   * every other success, which would have left the note in the database and on
   * no screen at all. A row that went out cleanly and said nothing is the only
   * thing dropped here.
   *
   * Worst first, by the one rank in comments.ts — shared with the round's own
   * screen, which had drifted into a different order once already.
   */
  const stuck = [...rows]
    .filter((r) => commentNeedsHuman(r.comment_status) || (r.comment_status === 'done' && r.comment_note))
    .sort((a, b) => commentRank(a.comment_status) - commentRank(b.comment_status));
  const FIRST = 2;
  const shown = showAll ? stuck : stuck.slice(0, FIRST);
  /* Against the FAILURES only: `stuck` can also hold a success with a caveat,
     and counting those against the failure total would under-report what this
     page is missing. */
  const namedFailures = stuck.filter((r) => commentNeedsHuman(r.comment_status)).length;
  const unnamed = Math.max(0, needsHuman - namedFailures);

  const rounds = [...new Set(stuck.filter((r) => r.comment_status === 'failed').map((r) => r.campaign_id).filter(Boolean))] as string[];

  async function act(key: string, run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    try {
      await run();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      /* `title` is a ReactNode, so the mark goes in it — Card has no icon slot
         and adding one would touch every other card. */
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
      {/* ── the numbers ──────────────────────────────────────────────── */}
      {/* A flex row, not a paragraph with an inline badge in it: `ms-2` on an
          inline-flex child inside a <p> collapsed against the number before
          it and rendered "12879% הצלחה". Real gaps, real items. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm font-bold text-mist-100">
          <span className="text-lg text-success-400">{done}</span> הצליחו{' '}
          <span className="font-normal text-mist-500">מתוך {all}</span>
        </p>
        <span className="rounded-full bg-success-400/12 px-2 py-0.5 text-[11px] font-extrabold text-success-400">{rate}% הצלחה</span>
        <span className="grow" />
        {needsHuman > 0 && <p className="text-sm font-extrabold text-warning-400">{needsHuman} לטיפול</p>}
      </div>

      {/* One rail, three parts: what went out, what is stuck, and the rest
          still waiting its turn. The remainder is the track's own colour
          rather than a drawn segment, so "not yet" never reads as a state. */}
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-ink-700" role="presentation">
        <span className="h-full bg-success-400 transition-[width] duration-500" style={{ width: `${pct(done)}%` }} />
        <span className="h-full bg-warning-400 transition-[width] duration-500" style={{ width: `${pct(needsHuman)}%` }} />
      </div>

      {/* ── the same two facts, short ─────────────────────────────────── */}
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
        <div className="flex items-center gap-2 rounded-xl bg-success-400/10 px-2.5 py-2">
          <CheckCircleIcon aria-hidden className="h-4 w-4 shrink-0 text-success-400" />
          <p className="min-w-0 truncate text-[12.5px] font-bold text-success-400">
            {`${done} ${agree(done, 'תגובה הועלתה', 'תגובות הועלו')} בהצלחה`}
          </p>
        </div>

        {/*
          * THE ORANGE TILE IS THE DOOR.
          *
          * A button, not a card with a button in it: the whole tile is the
          * target, because on a phone the thing somebody taps is the thing
          * they can see. aria-expanded and aria-controls carry the same fact
          * to a screen reader that the chevron carries to an eye.
          */}
        {needsHuman > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="comment-failures"
            className="flex min-h-11 items-center gap-2 rounded-xl bg-warning-400/10 px-2.5 py-2 text-start transition-colors hover:bg-warning-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-400"
          >
            <AlertTriangleIcon aria-hidden className="h-4 w-4 shrink-0 text-warning-400" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-warning-400">
              {`${needsHuman} ${agree(needsHuman, 'תגובה דורשת', 'תגובות דורשות')} טיפול`}
            </span>
            <ChevronDownIcon aria-hidden className={`h-4 w-4 shrink-0 text-warning-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        )}

        {/* Only while there is one. A round still running has a third fact,
            and hiding it makes "101 מתוך 128" look like a final score. */}
        {pending > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-ink-800 px-2.5 py-2">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-mist-500" />
            <p className="min-w-0 truncate text-[12.5px] font-bold text-mist-100">
              {`${pending} ${agree(pending, 'קבוצה ממתינה', 'קבוצות ממתינות')} לתגובה`}
            </p>
          </div>
        )}
      </div>

      {/* ── the failures, behind the door ─────────────────────────────── */}
      {/* grid-rows 0fr → 1fr animates a height nobody has to measure. The
          closed state keeps the subtree mounted, so opening is instant and the
          list does not re-fetch or re-sort on every tap. */}
      <div
        id="comment-failures"
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        {/*
          * `inert` while closed, and it is not a nicety.
          *
          * grid-rows 0fr with overflow-hidden collapses the panel to nothing
          * VISUALLY — the subtree stays mounted, which is what makes opening
          * instant. But a mounted subtree is still in the tab order and still
          * read aloud, so without this a keyboard lands on "נסה שוב" for a
          * group nobody can see, and a screen reader announces twenty-seven
          * failures the screen says are hidden.
          */}
        <div className="overflow-hidden" inert={!open}>
          {stuck.length > 0 && (
            <div className="mt-3 border-t border-ink-700 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-extrabold text-mist-100">תגובות שנכשלו</h3>
                <span className="grow" />
                {rounds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void act('all', async () => { for (const id of rounds) await retryFailedComments(id); })}
                    disabled={busy !== null}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 text-[12px] font-bold text-on-brand transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-40"
                  >
                    <RepeatIcon aria-hidden className="h-3.5 w-3.5" />
                    {busy === 'all' ? 'מנסה…' : 'נסה שוב את כולן'}
                  </button>
                )}
              </div>

              {/*
                * HOW MANY OF HOW MANY, IN ONE SENTENCE.
                *
                * This was two lines that contradicted each other — "הצג עוד 11"
                * beside "ועוד 14 שלא נטענו" — leaving the reader to add 2 and
                * 11 and 14 and wonder which of them was the 27 above. One
                * count, stated once, and the reason for any gap said plainly.
                */}
              <p className="mt-1 text-[11px] text-mist-500">
                {`מוצגות ${shown.length} מתוך ${needsHuman} ${agree(needsHuman, 'קבוצה שנכשלה', 'קבוצות שנכשלו')}.`}
                {unnamed > 0 && ` ${unnamed} ${agree(unnamed, 'קבוצה נוספת נמצאת', 'קבוצות נוספות נמצאות')} בהיסטוריה — המסך הזה טוען רק את הראשונות.`}
              </p>

              <ul className="mt-2 grid gap-1.5">
                {shown.map((r) => {
                  const href = r.permalink || r.target?.url || '';
                  const canRetry = r.comment_status === 'failed';
                  const isFailure = commentNeedsHuman(r.comment_status);
                  return (
                    <li key={r.id} className="min-w-0 rounded-xl bg-ink-800/50 px-2.5 py-2">
                      {/*
                        * TWO LINES, AND NEVER THREE.
                        *
                        * Everything on one line — avatar, name, badge, •••,
                        * retry, link — fits at 390px only until a name is
                        * long, and then the badge wraps to three lines and
                        * the row is taller than the two it replaced. Measured:
                        * "Город Арад , глазами жителей" did exactly that.
                        *
                        * So the name owns the first line and the actions own
                        * the second. Nothing wraps, the name gets the width,
                        * and the row height is the same for every row.
                        */}
                      <div className="flex min-w-0 items-center gap-2">
                        {r.target?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.target.image_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <TargetAvatar name={r.target?.name ?? ''} size={32} />
                        )}
                        {/* dir="auto" and nothing else: these names are Russian
                            and English inside an RTL card, and forcing either
                            direction puts the punctuation on the wrong end. */}
                        <p dir="auto" className="min-w-0 flex-1 truncate text-[13px] font-bold text-mist-100">{r.target?.name ?? '—'}</p>
                        {/* The reason and the screenshot, folded away: it is
                            the same sentence on every row and it was printed
                            twenty-seven times. */}
                        {(r.comment_note || r.comment_shot) && (
                          <button
                            type="button"
                            onClick={() => setDetail(detail === r.id ? null : r.id)}
                            aria-expanded={detail === r.id}
                            aria-label={detail === r.id ? 'סגור פרטים' : 'הצג פרטים'}
                            className="inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-mist-500 transition-colors hover:bg-ink-700 hover:text-mist-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                          >
                            •••
                          </button>
                        )}
                      </div>

                      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                        {/*
                          * A STATUS, NOT A LINK — and the word is the shared
                          * one. commentLabel() is the single vocabulary in
                          * comments.ts that this card and the round's own
                          * screen both read, which is what stops the two
                          * drifting into different names for the same state,
                          * as they have twice. It is shown ALONE: prefixing
                          * "תגובה" onto "לא הצליח" produced "תגובה לא הצליח",
                          * which is not Hebrew. What changed is the dress —
                          * underlined text reads as a door, and the door is
                          * the button beside it.
                          */}
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${commentNeedsHuman(r.comment_status) ? 'bg-warning-400/15 text-warning-400' : 'bg-success-400/15 text-success-400'}`}>
                          {commentNeedsHuman(r.comment_status) && <AlertTriangleIcon aria-hidden className="h-3 w-3" />}
                          {commentLabel(r.comment_status)}
                        </span>
                        <span className="grow" />
                        {/* One action area, two levels of emphasis: the retry
                            is the thing to do, the link is where to go if it
                            will not work. */}
                        {canRetry && (
                          <button
                            type="button"
                            onClick={() => void act(r.id, () => retryComment(r.id))}
                            disabled={busy !== null}
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-brand-500 px-2.5 text-[11.5px] font-bold text-on-brand transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-40"
                          >
                            <RepeatIcon aria-hidden className="h-3 w-3" />
                            {busy === r.id ? '…' : 'נסה שוב'}
                          </button>
                        )}
                        {href && (
                          <Link
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`פתח את ${r.target?.name ?? 'הקבוצה'} בפייסבוק`}
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-ink-600 px-2.5 text-[11.5px] font-bold text-mist-100 transition-colors hover:bg-ink-700"
                          >
                            <ShareIcon aria-hidden className="h-3 w-3" />
                            פייסבוק
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
                              post on his phone. Only where a person is needed —
                              a success has nothing to prove. */}
                          {commentNeedsHuman(r.comment_status) && r.comment_shot && <CommentShot path={r.comment_shot} />}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {stuck.length > FIRST && (
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-ink-800/50 text-[12.5px] font-bold text-brand-400 transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  {showAll ? 'הצג פחות' : `הצג עוד ${stuck.length - FIRST}`}
                  <ChevronDownIcon aria-hidden className={`h-4 w-4 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
