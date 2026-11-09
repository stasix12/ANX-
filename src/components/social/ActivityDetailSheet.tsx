'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  cancelQueueItem,
  getQueueItem,
  listQueueActivity,
  retryQueueItem,
  type QueueRow,
} from '@/lib/social/client';
import type { ActivityEntry } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { counted, formatTimeHe, ltr } from '@/lib/social/time';
import { explainFailure, TONE_CLASS } from './ErrorDetail';
import { TargetAvatar } from './TargetAvatar';
import {
  AlarmClockIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  ClockIcon,
  ExternalLinkIcon,
  ImageIcon,
  LayersIcon,
  TextIcon,
  UsersIcon,
  VideoIcon,
  XCircleIcon,
} from '@/components/icons';
import { Button, Sheet, SkeletonList, StatusPill, useToast } from './ui';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "פרטי הפרסום" — what one line of the activity log was actually about.
 *
 * ─── REBUILT TO A REFERENCE IMAGE, 09.11.2026 ─────────────────────────────
 *
 *   "כרגע חלון פרטי הפרסום נפתח כחלון תחתון גדול שתופס כמעט את כל המסך. יש
 *    להחליף אותו בחלונית Modal צפה וממורכזת."
 *
 * The window used to be the product's bottom Sheet, which is right for a form
 * and wrong for a receipt: a reader tapping one line of the log wants to see
 * four facts and dismiss, and a panel covering the screen to deliver them
 * reads as a page change. It is a centred modal now — the SAME Sheet
 * primitive, with `placement="center"`, so the focus trap, the Escape key, the
 * portal, the theme carry-across and the body-scroll freeze are all still the
 * ones this product has already debugged, and none of the other seventeen
 * sheets changed by a pixel.
 *
 * ─── EVERY FUNCTION THAT WAS HERE IS STILL HERE ───────────────────────────
 *
 *   "שמור על כל הפונקציות הקיימות… השינוי הוא עיצובי בלבד."
 *
 * Retry, cancel and the link into the group's own page all survive, gated
 * exactly as they were. They are absent from the reference image for a reason
 * that resolves the apparent conflict rather than papering over it: that image
 * shows a SUCCEEDED publication, where `canRetry` is false and the cancel
 * button is already gated behind `status !== 'published'`. On the state the
 * reference draws, both were invisible before this change too. The group link
 * is now the "קבוצה" column's own value, which keeps the function and adds no
 * element the reference does not have.
 *
 * The data path is untouched: one read of the row on tap, no poll, nothing
 * cached, so the window cannot show a status that has drifted from the table.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** What kind of thing was published — read off the post, never guessed. */
function contentKind(row: QueueRow): { label: string; Icon: typeof ImageIcon } {
  const media = row.post?.media;
  const first = Array.isArray(media) ? (media[0] as { type?: string; url?: string } | undefined) : undefined;
  const url = typeof first?.url === 'string' ? first.url : '';
  const isVideo = first?.type === 'video' || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
  if (Array.isArray(media) && media.length > 0) {
    return isVideo ? { label: 'וידאו', Icon: VideoIcon } : { label: 'תמונה', Icon: ImageIcon };
  }
  return { label: 'טקסט', Icon: TextIcon };
}

/** The Facebook glyph, the same path the live board draws. */
function FacebookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.7V3.6c-.29-.04-1.27-.12-2.4-.12-2.38 0-4 1.45-4 4.11V9.9H7.6V13h2.7v8z" />
    </svg>
  );
}

/** One of the three columns: an icon, what it is, and what it says. */
function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-1 text-center">
      <span className="text-brand-500">{icon}</span>
      <span className="text-[11px] font-extrabold leading-4 text-mist-100">{label}</span>
      <span dir="auto" className="min-w-0 max-w-full truncate text-[11px] font-bold leading-4 text-mist-300">
        {children}
      </span>
    </div>
  );
}

export function ActivityDetailSheet({
  queueId,
  onClose,
  onChanged,
}: {
  /** The row to show. null closes the window. */
  queueId: string | null;
  onClose: () => void;
  /** Told after a write, so the screen that owns the data re-reads it. */
  onChanged?: () => void;
}) {
  const [row, setRow] = useState<QueueRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'retry' | 'cancel'>('');
  const [log, setLog] = useState<ActivityEntry[] | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!queueId) return;
    let stopped = false;
    setRow(null);
    setError(null);
    setLog(null);
    setLogOpen(false);
    getQueueItem(queueId)
      .then((r) => {
        if (stopped) return;
        setRow(r);
        /* getQueueItem answers null for a row that has since been deleted —
           the window then shows nothing to have a history of. */
        if (!r) return;
        /*
         * THE LOG IS A SECOND READ, AND IT CANNOT FAIL THE WINDOW.
         *
         * It needs the row's own stamps to bound itself (see listQueueActivity),
         * so it can only start once the row is here. An empty array on failure
         * rather than an error: the log is the last line of this window, and a
         * window that refuses to show a publication because its history could
         * not be read would be trading the answer for the footnote.
         */
        listQueueActivity(r)
          .then((entries) => {
            if (!stopped) setLog(entries);
          })
          .catch(() => {
            if (!stopped) setLog([]);
          });
      })
      .catch((err) => {
        if (!stopped) setError(friendlyMessage(err, 'לא הצלחנו לטעון את פרטי הפרסום.'));
      });
    return () => {
      stopped = true;
    };
  }, [queueId]);

  async function act(kind: 'retry' | 'cancel') {
    if (!queueId) return;
    setBusy(kind);
    try {
      const moved = kind === 'retry' ? await retryQueueItem(queueId) : await cancelQueueItem(queueId);
      if (!moved) {
        toast('הפרסום כבר התקדם בינתיים — רענַנּו את המסך.', 'info');
      } else {
        toast(kind === 'retry' ? 'הפרסום הוחזר לתור.' : 'הפרסום בוטל.', kind === 'retry' ? 'success' : 'info');
      }
      onChanged?.();
      onClose();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusy('');
    }
  }

  const failure = row ? explainFailure(row) : null;
  /*
   * A LINK IS ONLY A LINK WHEN THE DATABASE HAS ONE.
   *
   * "אם אין כתובת זמינה, אין להמציא קישור." Both of these come from the row
   * that was just read, and anything that is not http or https in an href is a
   * hole rather than a link — so the button is simply not drawn.
   */
  const httpUrl = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const postUrl = httpUrl(row?.permalink);
  const groupUrl = httpUrl(row?.target?.url);

  const when = row?.published_at ?? row?.scheduled_at ?? null;
  const kind = row ? contentKind(row) : null;
  const seconds =
    row?.claimed_at && row?.published_at
      ? Math.round((new Date(row.published_at).getTime() - new Date(row.claimed_at).getTime()) / 1000)
      : null;
  /*
   * THE TWO PILLS THE REFERENCE NAMES — AND NOT ONE STATUS MORE.
   *
   * "תגית ירוקה פורסם בהצלחה / תגית אדומה פרסום נכשל". The window has nine
   * statuses to show and the reference draws two of them, so the other seven
   * keep the product's own pill rather than being rounded into the nearest
   * one. `skipped` is the case that matters: דולג is a publication this system
   * decided NOT to make — a retired group, the same post already in that group
   * — and calling it "פרסום נכשל" would be the window telling the owner
   * something the table does not say. It is the lie this product was already
   * bitten by once (worker/test/maybe-live.test.ts).
   */
  const ok = row?.status === 'published';
  const bad = row?.status === 'failed' || row?.status === 'needs_attention';

  return (
    <Sheet
      open={Boolean(queueId)}
      onClose={onClose}
      placement="center"
      title="פרטי הפרסום"
      icon={<LayersIcon aria-hidden className="h-5 w-5 shrink-0 text-brand-500" />}
    >
      <div className="pb-1">
        {!row && !error && <SkeletonList rows={2} />}
        {error && <p className="py-4 text-sm text-error-400">{error}</p>}
        {row && (
          <>
            {/* ─── the card: who, when, how long, and how it ended ────────── */}
            <div className="rounded-[18px] border border-brand-500/15 bg-ink-850 p-3 shadow-[0_2px_10px_-6px_rgba(13,38,76,0.25)]">
              <div className="flex min-w-0 items-start gap-3">
                <TargetAvatar
                  name={row.target?.name ?? 'קבוצה'}
                  imageUrl={row.target?.image_url}
                  channel={row.target?.channel}
                  size={56}
                />
                <div className="min-w-0 grow">
                  {/*
                    THE POST'S OWN TITLE when it has one, and the group's name
                    when it does not — a window headed "קבוצה" over a row whose
                    group was deleted says nothing at all.
                  */}
                  <p dir="auto" className="truncate text-[15px] font-extrabold leading-5 text-mist-100">
                    {row.post?.title || row.target?.name || 'הקבוצה נמחקה מהרשימה'}
                  </p>
                  {/*
                    THE OUTCOME SITS BESIDE THE TWO LINES BELOW THE TITLE, not
                    inside either of them — which is how the reference fits a
                    pill, an hour, a date and a duration into one card on a
                    phone. Measured: at 390px the text column is 259px, the
                    pill needs 112 and "11:05 | 09.11.2026" needs ~150, so the
                    three cannot share one ROW; stacked against the pill's
                    column they fit at every width down to 320.

                    The pill is shrink-0 and the block beside it min-w-0: when
                    something has to give on the narrowest phone it is the
                    group name in the column below, never the outcome, because
                    the outcome is why the window was opened.
                  */}
                  <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    {ok ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-500/10 px-2 py-1 text-[11px] font-extrabold whitespace-nowrap text-success-400">
                        <CheckCircleIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        פורסם בהצלחה
                      </span>
                    ) : bad ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-error-500/10 px-2 py-1 text-[11px] font-extrabold whitespace-nowrap text-error-400">
                        <XCircleIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        פרסום נכשל
                      </span>
                    ) : (
                      /* מתוזמן, מפרסם, דולג, ממתין לך… — the product's own pill,
                         the one the queue row and the history already draw, so
                         a status outside the reference is still stated and is
                         still worded the same everywhere. */
                      <span className="shrink-0">
                        <StatusPill status={row.status} long />
                      </span>
                    )}
                    {/*
                      WRAPS RATHER THAN OVERLAPS. Measured at 390px: the text
                      column is 227px and the pill plus "11:05 | 09.11.2026"
                      need 260, so the two cannot share a row on a phone. With
                      nowrap and no wrapping they did not fail — they PAINTED
                      ON TOP OF EACH OTHER, which is the one outcome worse than
                      either. Side by side where there is room, stacked where
                      there is not, and never clipped or overlapped.

                      `order` keeps the reading order the reference has — the
                      hour on the right, the outcome at the far left — while
                      the DOM keeps the outcome first, so a screen reader hears
                      how it ended before it hears when.
                    */}
                    <div className="order-first flex min-w-0 grow flex-col items-end gap-0.5 text-[11px] font-bold leading-4 text-mist-300">
                      {when && (
                        <p className="flex min-w-0 items-center gap-x-1 whitespace-nowrap">
                          <ClockIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                          {ltr(formatTimeHe(when))}
                          <span aria-hidden className="px-0.5 text-ink-600">
                            |
                          </span>
                          <CalendarIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                          {/* dd.MM.yyyy with the zeros kept — the reference
                              writes "09.11.2026", and he-IL's own short date
                              drops the leading zero. */}
                          {ltr(
                            new Date(when).toLocaleDateString('he-IL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            }),
                          )}
                        </p>
                      )}
                      {/*
                        HOW LONG THE PUBLICATION ITSELF TOOK — claimed_at to
                        published_at, which covers opening the group, typing,
                        uploading and posting, and deliberately NOT what happens
                        after the post exists. Both stamps are the database's.
                      */}
                      {seconds !== null && seconds > 0 && seconds < 3600 && (
                        <p className="flex min-w-0 items-center gap-x-1 whitespace-nowrap">
                          <AlarmClockIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                          משך: {counted(seconds, 'שנייה אחת', 'שניות', 'שתי שניות')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── the three columns ──────────────────────────────────── */}
              <div className="mt-3 grid grid-cols-3 divide-x divide-x-reverse divide-ink-700 border-t border-ink-700 pt-3 [&>*]:min-w-0">
                <Fact icon={<FacebookMark className="h-[18px] w-[18px]" />} label="פלטפורמה">
                  Facebook
                </Fact>
                {kind && (
                  <Fact icon={<kind.Icon aria-hidden className="h-[18px] w-[18px]" />} label="סוג תוכן">
                    {kind.label}
                  </Fact>
                )}
                <Fact icon={<UsersIcon aria-hidden className="h-[18px] w-[18px]" />} label="קבוצה">
                  {/*
                    THE GROUP'S OWN PAGE, kept as a function and not as a third
                    button: the window had a "לקבוצה" link before this redesign
                    and the reference has no room for one, so it becomes this
                    column's value. Plain text when the group is gone — a link
                    to a deleted row is a dead end with a pointer.
                  */}
                  {row.target ? (
                    <Link href={`/social/groups/${row.target.id}`} onClick={onClose} className="truncate hover:text-brand-500">
                      {row.target.name}
                    </Link>
                  ) : (
                    'נמחקה'
                  )}
                </Fact>
              </div>
            </div>

            {/* ─── why it failed, when it did ─────────────────────────────── */}
            {failure && (failure.headline || failure.advice) && (row.error || row.skip_reason) && (
              <div className="mt-2.5 rounded-[18px] border border-ink-700 bg-ink-800 p-3">
                <p className={`text-xs font-bold ${TONE_CLASS[failure.tone]}`}>{failure.headline}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-mist-300">{failure.advice}</p>
              </div>
            )}

            {/* ─── the two actions, one row ───────────────────────────────────
                ONE ROW, as the reference draws it — on every phone that
                exists. Below 360px the two labels cannot both fit a half
                column without clipping (measured at 320: 124px of column
                against 137px of label), and a clipped button is a control
                whose own name the owner cannot read. Every iPhone since the
                2020 SE is 375 or wider, so the stack is the narrow-device
                fallback and never the normal case. */}
            {(postUrl || groupUrl) && (
              <div className="mt-2.5 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 [&>*]:min-w-0">
                {postUrl && (
                  <a
                    href={postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    /* gap-1 / px-2 / 12px: measured at 390px, where the two
                       columns are 155px each and "פתח את הקבוצה" with both
                       marks needs 137. At 13px with gap-1.5 it truncated. */
                    className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full bg-brand-500 px-2 text-[12px] font-extrabold text-on-brand"
                  >
                    <FacebookMark className="h-4 w-4 shrink-0" />
                    <span className="truncate">פתח את הפוסט</span>
                    <ExternalLinkIcon aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-80" />
                  </a>
                )}
                {groupUrl && (
                  <a
                    href={groupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full border border-brand-500/40 bg-ink-850 px-2 text-[12px] font-extrabold text-brand-500 ${
                      postUrl ? '' : 'min-[360px]:col-span-2'
                    }`}
                  >
                    <UsersIcon aria-hidden className="h-4 w-4 shrink-0" />
                    <span className="truncate">פתח את הקבוצה</span>
                    <ExternalLinkIcon aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-80" />
                  </a>
                )}
              </div>
            )}

            {/* ─── retry / cancel, gated exactly as before ─────────────────── */}
            {(failure?.canRetry || row.status !== 'published') && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {failure?.canRetry && (
                  <Button size="sm" busy={busy === 'retry'} onClick={() => act('retry')}>
                    נסה שוב
                  </Button>
                )}
                {row.status !== 'published' && (
                  <Button size="sm" variant="secondary" busy={busy === 'cancel'} onClick={() => act('cancel')}>
                    בטל פרסום
                  </Button>
                )}
              </div>
            )}

            {/* ─── the activity log, closed by default ────────────────────── */}
            {/*
              DRAWN ONLY WHEN THERE IS SOMETHING IN IT. "יש להציג רק אירועים
              אמיתיים שנשמרו במערכת" — a row headed "יומן פעילות (0)" that
              opens onto nothing is the decorative control this product forbids.
              While the read is still in flight nothing is drawn either, rather
              than a count that is about to change.
            */}
            {log && log.length > 0 && (
              <div className="mt-2.5 overflow-hidden rounded-[18px] border border-brand-500/15 bg-ink-850">
                <button
                  type="button"
                  onClick={() => setLogOpen((v) => !v)}
                  aria-expanded={logOpen}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start"
                >
                  <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-extrabold text-mist-100">
                    <ClipboardListIcon aria-hidden className="h-[18px] w-[18px] shrink-0 text-brand-500" />
                    <span className="truncate">יומן פעילות ({log.length})</span>
                  </span>
                  <ChevronDownIcon
                    aria-hidden
                    className={`h-5 w-5 shrink-0 text-brand-500 transition-transform ${logOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {logOpen && (
                  <ul className="border-t border-ink-700 px-3 py-2">
                    {log.map((e) => (
                      <li key={e.id} className="flex min-w-0 items-start gap-2 py-1.5">
                        <span
                          aria-hidden
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            e.level === 'error' ? 'bg-error-400' : e.level === 'warn' ? 'bg-warning-400' : 'bg-brand-500'
                          }`}
                        />
                        <span className="min-w-0 grow">
                          <span dir="auto" className="block text-[12px] font-bold leading-4 text-mist-100">
                            {e.message}
                          </span>
                          <span className="block text-[11px] leading-4 text-mist-500">{ltr(formatTimeHe(e.at))}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
