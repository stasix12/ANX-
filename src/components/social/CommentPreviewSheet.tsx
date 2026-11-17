'use client';

import Link from 'next/link';
import { t, keep } from '@/lib/social/i18n';
import type { QueueRow } from '@/lib/social/client';
import type { Campaign } from '@/lib/social/types';
import { commentLabel, commentNeedsHuman } from '@/lib/social/comments';
import { formatDateTimeHe } from '@/lib/social/time';
import { ShareIcon } from '@/components/icons';
import { TargetAvatar } from './TargetAvatar';
import { CommentShot } from './CommentShot';
import { Notice, Sheet } from './ui';

/**
 * "להוסיף חלון קטן לראות את התגובה" — the comment itself, on one tap.
 *
 * WHAT IT IS FOR. The rail says a comment went out at 17:16 and gives a link
 * to the post; what it never said is WHAT the comment actually says. On an
 * account running several rounds, each with its own price list, "did this one
 * get the right text" was a question that could only be answered by opening
 * Facebook and scrolling to find the post — and for a comment still in the
 * queue it could not be answered at all, because the post it will sit under
 * does not exist yet.
 *
 * WHERE THE WORDS COME FROM. `social_campaigns.comment_text` and
 * `comment_media` — the round's own copy, which is what the worker types and
 * what queueCampaignComment last saved. NOT a per-row column: there isn't
 * one, and inventing a rendered copy here would be a second source of truth
 * for a sentence that already has one.
 *
 * SO IT SAYS WHOSE WORDS THEY ARE. For a comment that has already gone out,
 * the round's text is what it was given UNLESS somebody has since changed it,
 * and this window cannot tell. That is stated rather than glossed over — the
 * alternative is a screen quietly showing today's wording under last week's
 * comment and calling it a record.
 *
 * NOTHING IS WRITTEN FROM HERE. It reads, and it links out to the post.
 */
export function CommentPreviewSheet({
  open,
  onClose,
  row,
  campaign,
  when,
  state,
}: {
  open: boolean;
  onClose: () => void;
  row: QueueRow | null;
  campaign: Campaign | null;
  /** The hour this row's comment happened or is due, already formatted. */
  when: string;
  /** What the rail says about it — the same sentence, not a second opinion. */
  state: string;
}) {
  if (!row) return null;
  return (
    <Sheet open={open} onClose={onClose} title={t('התגובה')}>
      <CommentPreviewBody row={row} campaign={campaign} when={when} state={state} onClose={onClose} />
    </Sheet>
  );
}

/**
 * THE WINDOW'S CONTENTS, APART FROM THE WINDOW.
 *
 * <Sheet> portals to document.body and returns a bare anchor while it has not
 * mounted, so under renderToStaticMarkup every sheet in this product draws
 * nothing — render-campaign-comment-sheet.tsx met the same wall and answered
 * it by transcribing the body class string for class string, which is a copy
 * and drifts.
 *
 * Exporting the body instead means the fixture measures THIS, not a likeness
 * of it: a comment with a long Russian group name, a price list with a
 * picture and the worker's own sentence under it, at 360, 390 and 430.
 */
export function CommentPreviewBody({
  row,
  campaign,
  when,
  state,
  onClose,
}: {
  row: QueueRow;
  campaign: Campaign | null;
  when: string;
  state: string;
  onClose?: () => void;
}) {
  const status = row.comment_status ?? '';
  const text = (campaign?.comment_text ?? '').trim();
  const media = campaign?.comment_media ?? [];
  const picture = media.find((m) => m.kind === 'image');
  /* The post's own address, which is where the comment lives. A row with no
     permalink falls back to the group — the same order the rail uses. */
  const href = row.permalink || row.target?.url || '';
  const done = status === 'done' || status === 'unverified';

  return (
    <>
      <div className="flex items-center gap-3">
        <TargetAvatar name={row.target?.name ?? '?'} imageUrl={row.target?.image_url} channel={row.target?.channel} size={44} />
        <div className="min-w-0">
          <p dir="auto" data-no-translate className="truncate text-sm font-extrabold text-mist-100">
            {row.target?.name ?? t('קבוצה')}
          </p>
          <p className="mt-0.5 text-[11px] font-bold text-mist-500">
            {state}
            {when ? ` · ${when}` : ''}
          </p>
        </div>
      </div>

      {/* ── the words themselves ──────────────────────────────────────── */}
      <div className="mt-3">
        <p className="mb-1 text-[11px] font-extrabold text-mist-500">{t('הטקסט של התגובה')}</p>
        {text || picture ? (
          <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
            {text && (
              <p dir="auto" data-no-translate className="whitespace-pre-wrap break-words text-sm leading-relaxed text-mist-100">
                {text}
              </p>
            )}
            {picture && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={picture.url}
                alt=""
                className={`${text ? 'mt-2 ' : ''}max-h-56 w-full rounded-lg border border-ink-700 object-contain`}
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        ) : (
          <Notice tone="warn">{t('לסבב הזה לא נשמר טקסט תגובה. פתחו את הסבב והוסיפו תגובה כדי שיהיה מה לפרסם.')}</Notice>
        )}
        {/* Said once, where it matters: this is the ROUND's current wording,
            and a comment that went out a week ago carries whatever the round
            held then. The database keeps no per-comment copy to show instead. */}
        {done && text && (
          <p className="mt-1.5 text-[11px] leading-snug text-mist-500">
            {t('זה הנוסח שהסבב מחזיק עכשיו. אם שיניתם אותו מאז, התגובה שכבר יצאה נושאת את הנוסח הקודם.')}
          </p>
        )}
      </div>

      {/* ── what the machine said about it, when it had something to say ── */}
      {row.comment_note && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-extrabold text-mist-500">{t('מה המערכת אמרה')}</p>
          <p
            dir="auto"
            className={`text-[12px] leading-snug ${commentNeedsHuman(status) ? 'text-warning-400' : 'text-mist-300'}`}
          >
            {row.comment_note}
          </p>
        </div>
      )}

      {/* The page as the worker's browser had it — the evidence that turns
          "it does not work" into something anybody can look at. Only on the
          rows that stopped, which is the only time it is taken. */}
      {commentNeedsHuman(status) && row.comment_shot && <CommentShot path={row.comment_shot} />}

      <div className="mt-4 flex flex-wrap gap-2">
        {href && (
          <Link
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={`פתח את הפוסט ב${row.target?.name ? keep(row.target.name) : 'קבוצה'} ואת התגובה שעליו`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400"
          >
            <ShareIcon aria-hidden className="h-4 w-4" />
            {t('פתח את הפוסט')}
          </Link>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-xl border border-ink-700 bg-ink-850 px-4 text-sm font-bold text-mist-100 transition-colors hover:bg-ink-900"
          >
            {t('סגור')}
          </button>
        )}
      </div>
    </>
  );
}

/** The one sentence the rail and the window must say the same way. */
export function commentStateText(status: string, fallback: string): string {
  return status ? commentLabel(status) : fallback;
}

/** `formatDateTimeHe`, but empty rather than "—" when there is no instant. */
export function whenText(iso: string | null | undefined): string {
  return iso ? formatDateTimeHe(iso) : '';
}
