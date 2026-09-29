'use client';

import Link from 'next/link';
import type { CommentTotals, QueueRow } from '@/lib/social/client';
import type { Campaign } from '@/lib/social/types';
import { COMMENT_TONE, commentLabel, commentNeedsHuman } from '@/lib/social/comments';
import { agree, formatDateHe, formatTimeHe, zonedDateISO } from '@/lib/social/time';
import { MessageIcon, ShareIcon } from '@/components/icons';
import { TargetAvatar } from './TargetAvatar';
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

/** Already under a post, or already failed to get there. */
function happened(status: string | undefined): boolean {
  return status === 'done' || commentNeedsHuman(status);
}

type Kind = 'past' | 'queued' | 'ahead';

export function CommentTimeline({
  rows,
  done,
  totals,
  upcoming,
  campaigns,
}: {
  /** Everything carrying a comment state — the dashboard's existing read. */
  rows: QueueRow[];
  /** The finished ones, read separately and more deeply than `rows` reaches. */
  done: QueueRow[];
  /** The REAL counts, from the database rather than from these two windows. */
  totals: CommentTotals;
  /** Publications still waiting to go out — the dashboard's existing read. */
  upcoming: QueueRow[];
  /** Read only for comment_text: which rounds have a comment waiting to follow. */
  campaigns: Campaign[];
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

  /*
   * TWENTY-FOUR HOURS, AND NOT A ROW OLDER — "תגובות טיימלין של 24 שעות בלבד".
   *
   * The owner is past six hundred comments; a rail reaching back to the start
   * is a scroll through a month to find out what happened tonight, and "what
   * happened today" is the whole question a timeline on a dashboard answers.
   * Everything older is still in "תגובות לפרסומים" above, which keeps the full
   * history, and the line under the bar says how many were left out rather
   * than dropping them silently.
   *
   * Oldest first: this is a rail, and a rail reads down the afternoon.
   */
  const since = Date.now() - 24 * 3_600_000;
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
  const waiting = all
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
  const ahead = upcoming
    .filter((r) => {
      /* Not already counted: a row cannot be both waiting to publish and
         carrying a finished comment, but the guard costs nothing and this card
         has already been bitten once by two reads that overlap. */
      if (byId.has(r.id)) return false;
      const c = r.campaign_id ? rounds.get(r.campaign_id) : null;
      return Boolean((c?.comment_text ?? '').trim());
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const items: { row: QueueRow; kind: Kind }[] = [
    ...past.map((row) => ({ row, kind: 'past' as const })),
    ...waiting.map((row) => ({ row, kind: 'queued' as const })),
    ...ahead.map((row) => ({ row, kind: 'ahead' as const })),
  ];

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
   * THE BAR COUNTS THE DATABASE, NOT THIS CARD — "כמה מתוך כמה הגיב וכמה בתור".
   *
   * The rail below is one day deep and both its reads are capped; a bar built
   * from the rows on screen would report "5 מתוך 9" to an owner holding 271
   * comments. `totals` is four COUNT queries, which is the truth.
   */
  const real = totals.done + totals.failed + totals.unverified + totals.pending;
  const needsHuman = totals.failed + totals.unverified;
  const today = zonedDateISO(new Date());

  /** The instant a row is placed at — null for a queue that has no clock. */
  const stampOf = (it: { row: QueueRow; kind: Kind }): string | null =>
    it.kind === 'past' ? it.row.comment_at ?? null : it.kind === 'ahead' ? it.row.scheduled_at : null;

  return (
    <Card title="ציר הזמן של התגובות" subtitle="מה כבר נכתב, מה נכשל ומה עוד בתור">
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
        <span className={TONE_TEXT.good}>{`${totals.done} מתוך ${real} הגיבו`}</span>
        {totals.pending > 0 && <span className="text-mist-500">{`${totals.pending} בתור`}</span>}
        {needsHuman > 0 && <span className={TONE_TEXT.warn}>{`${needsHuman} דורשות טיפול`}</span>}
      </p>
      {/* The rail's scope, said once. Without it the bar reads 271 over a list
          of nine and the only available conclusion is that something is lost. */}
      <p className="mt-1 text-[11px] text-mist-500">
        הציר מציג את 24 השעות האחרונות
        {older > 0 && ` · ${older} ${agree(older, 'תגובה קודמת לא מוצגת', 'תגובות קודמות לא מוצגות')} כאן`}
      </p>

      {/*
        A box that scrolls rather than a list cut off with the rest behind a
        button. The half-row at the bottom edge is the affordance: a row
        clipped mid-height says "there is more below" better than a hint can.
      */}
      <div className="mt-3 max-h-[22rem] overflow-y-auto pe-1">
        <ol className="relative space-y-0.5">
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
            /* The POST's address. Facebook gives a group post one handle and
               the comment lives under it, so this is as close as the database
               can point — and it is the right place to land: the comment is on
               that page.
               NOT for an 'ahead' row: that post does not exist yet, so the link
               would open the group and show the owner everything except the
               thing the button named. */
            const href = item.kind === 'ahead' ? '' : row.permalink || row.target?.url || '';
            const day = at ? zonedDateISO(new Date(at)) : '';
            const prev = i > 0 ? stampOf(items[i - 1]) : null;
            const showDay = Boolean(day) && day !== today && (i === 0 || (prev ? zonedDateISO(new Date(prev)) : '') !== day);
            /* Where in the line this one is — 1 for the next comment out.
               Counted from the start of the queued block, not from the whole
               rail, or the first one queued would be numbered after every
               comment that ever succeeded. */
            const place = i - past.length + 1;
            return (
              <li key={row.id}>
                {/* `at &&` as well as showDay: showDay already implies it, but
                    only through a Boolean(day) the compiler cannot follow back
                    to this variable, and a cast here would be the one place the
                    day heading could render "Invalid Date". */}
                {showDay && at && (
                  <p className="mb-1 mt-3 text-[11px] font-extrabold uppercase tracking-wide text-mist-500">{formatDateHe(at)}</p>
                )}
                <div className="flex items-stretch gap-3">
                  <div className="flex w-3 shrink-0 flex-col items-center pt-3.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        isPast ? `bg-ink-850 ring-2 ${RING_DONE[tone]}` : TONE_FILL[tone]
                      } ${status === 'commenting' ? 'ring-4 ring-brand-300/20' : ''}`}
                    />
                    {i < items.length - 1 && <span aria-hidden className="w-px grow bg-ink-700" />}
                  </div>
                  <div
                    className={`flex min-w-0 grow items-center gap-2.5 rounded-xl px-2 py-2 ${
                      status === 'commenting' ? TONE_TINT[tone] : ''
                    }`}
                  >
                    {/*
                      ONE COLUMN, THREE MEANINGS, and the styling says which: a
                      finished comment shows the hour it happened, dimmed; a
                      queued one shows its place in line, in the accent; one
                      still coming shows the hour its publication is due, also
                      in the accent, because it is ahead of us. Same width
                      either way so the names beside them stay in a straight
                      edge.
                    */}
                    <span className="w-12 shrink-0 text-sm font-extrabold tabular-nums">
                      {item.kind === 'queued' ? (
                        <span dir="ltr" className="inline-block text-brand-400">{`#${place}`}</span>
                      ) : (
                        <span className={isPast ? 'text-mist-500' : 'text-brand-400'}>{at ? formatTimeHe(at) : '—'}</span>
                      )}
                    </span>
                    <TargetAvatar name={row.target?.name ?? '?'} imageUrl={row.target?.image_url} channel={row.target?.channel} size={30} />
                    <div className="min-w-0 grow">
                      {/* dir="auto": these group names are Russian and English
                          inside an RTL card, and forcing either direction puts
                          the punctuation on the wrong end. */}
                      <p dir="auto" className="truncate text-sm font-bold text-mist-100">{row.target?.name ?? 'קבוצה'}</p>
                      <p className={`text-[11px] font-bold ${item.kind === 'ahead' ? 'text-mist-300' : TONE_TEXT[tone]}`}>
                        {item.kind === 'ahead' ? 'תגובה אחרי הפרסום' : commentLabel(status)}
                      </p>
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

      <p className="mt-2 text-[11px] leading-snug text-mist-500">
        התגובות יוצאות אחת-אחת, במרווח שנבחר לכל סבב — ולכן אין להן שעה מראש. לפרסום שעוד לא יצא מוצגת השעה שבה הוא מתוזמן.
      </p>
    </Card>
  );
}
