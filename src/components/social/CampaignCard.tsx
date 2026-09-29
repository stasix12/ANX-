'use client';

import Link from 'next/link';
import { canPauseRun, canResumeRun, runBadge, runProgress, type CampaignState } from '@/lib/social/campaign';
import { agree, formatDayMonthHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import { ltr } from './DateTime';
import type { Campaign, MediaItem } from '@/lib/social/types';
import { CalendarIcon, ClipboardListIcon, MessageIcon, PlusIcon, RepeatIcon, TrashIcon } from '@/components/icons';
import { PostCover } from './PostCover';
import { TargetAvatar } from './TargetAvatar';
import { Badge, Button, OverflowMenu, TONE_FILL, TONE_TEXT, TONE_TINT, type MenuAction, type Tone } from './ui';

/**
 * The campaign as a control surface — and, since the owner's brief, a COMPACT
 * one.
 *
 * WHAT CHANGED AND WHY. The card was 28 units of cover, a progress bar, two
 * bordered fact boxes side by side and three buttons, with the rest of the
 * campaign's actions printed as loose blue words BELOW it, outside its border.
 * On a 390px phone that is one campaign per screen and a row of controls that
 * belongs to the card above it but floats between two of them — including a
 * red "מחק" a thumb-width from "שכפל".
 *
 * So: the cover shrinks to a thumbnail, the two fact boxes collapse into one
 * line, the outcome legend becomes four chips that can be read as a row, and
 * every action that belongs to this campaign now lives inside its border —
 * the primary one as a button, the secondary two as words, the rest behind ⋯,
 * with delete red and confirmed. Three to four campaigns fit where one did.
 *
 * NOT A REWRITE OF ANYTHING THAT WORKS. Every number comes from the same
 * CampaignState the old card read, the badge is still runBadge(), the pause
 * and resume handlers are the page's own, and the progress figure still counts
 * HANDLED rows rather than successful ones — 122 מתוך 122 טופלו on a run where
 * 121 were skipped is the true sentence, and the four chips beneath it are
 * what say which.
 */
export function CampaignCard({
  campaign,
  state,
  onPause,
  onResume,
  busy,
  href,
  media = null,
  nextTargetImage = null,
  hasPost = false,
  globalPaused = false,
  workerOnline,
  postCount = 0,
  addPostHref,
  onEdit,
  onDuplicate,
  onReopen,
  onComment,
  onDelete,
}: {
  campaign: Pick<Campaign, 'id' | 'name' | 'service' | 'city' | 'status' | 'created_at'>;
  state: CampaignState;
  /** The media of the post this run publishes — cover picked as the library does. */
  media?: MediaItem[] | null;
  /** The next group's picture, when the queue has one waiting. */
  nextTargetImage?: string | null;
  /** Whether the run has a post at all — an empty run gets no media slot. */
  hasPost?: boolean;
  /**
   * Whether ALL publishing is held from the header toggle, and whether the PC
   * that does the publishing has sent a heartbeat. Both are read by the page
   * and handed over; runBadge() decides what they mean. Without them this card
   * showed a green pulsing "רץ" under a header reading "המשך הכול", and kept
   * pulsing for a run whose laptop had been asleep since yesterday.
   */
  globalPaused?: boolean;
  workerOnline?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  busy?: boolean;
  href?: string;
  /* ---- the actions that used to float underneath, now the card's own ---- */
  postCount?: number;
  addPostHref?: string;
  onEdit?: () => void;
  onDuplicate?: () => void;
  /** Only a stopped run can be put back; the page decides, this draws it. */
  onReopen?: () => void;
  /** Only offered once something has published — there is nothing to comment on before. */
  onComment?: () => void;
  onDelete?: () => void;
}) {
  const link = href ?? `/social/campaigns/${campaign.id}`;
  /* One opinion about the run's state, from campaign.ts, for the label, the
     colour AND the dot. This card used to compute its own: `state.state ===
     'running'` lit a hard-coded green dot beside a badge the shared tone map
     painted blue — two colours for one fact, on the element whose whole job is
     to be read at a glance. */
  const badge = runBadge(state, { globalPaused, workerOnline });
  const badgeTone: Tone = badge.tone === 'info' ? 'brand' : badge.tone;
  /* A button is offered only when it can act. "השהה" used to be gated on the
     state NAME, so a run with nothing to hold back still offered it and
     toasted "הסבב הושהה." over a write that could not move a row. */
  const showPause = canPauseRun(state.progress, campaign.status);
  const showResume = canResumeRun(state.progress, campaign.status);
  const view = runProgress(state.progress);
  const { total, published, scheduled, skipped, failed, manual, running } = state.progress;

  /*
   * EVERYTHING ELSE, ONE TAP AWAY.
   *
   * Built from the handlers the page actually passed, so a campaign with no
   * post offers no "תגובות" and a live one offers no "החזר לפעילות" — a menu
   * item that cannot act is worse than a missing one. Delete is last, red, and
   * the page's own confirmation still stands in front of it.
   */
  const menu: MenuAction[] = [
    { label: postCount > 0 ? `פרטי הקמפיין (${postCount === 1 ? 'פוסט אחד' : `${postCount} פוסטים`})` : 'פרטי הקמפיין', icon: <ClipboardListIcon className="h-4 w-4" />, onSelect: () => { window.location.href = link; } },
    ...(addPostHref ? [{ label: 'הוסף פוסט', icon: <PlusIcon className="h-4 w-4" />, onSelect: () => { window.location.href = addPostHref; } }] : []),
    ...(onComment ? [{ label: 'תגובה לפרסומים', icon: <MessageIcon className="h-4 w-4" />, onSelect: onComment }] : []),
    ...(onReopen ? [{ label: 'החזר לפעילות', icon: <RepeatIcon className="h-4 w-4" />, onSelect: onReopen }] : []),
    ...(onDelete ? [{ label: 'מחק קמפיין', icon: <TrashIcon className="h-4 w-4" />, onSelect: onDelete, danger: true }] : []),
  ];

  return (
    <div className="surface rounded-card border border-ink-700 p-3">
      {/* ── 1. what it is, and what state it is in ─────────────────────── */}
      <header className="flex items-start gap-2.5">
        {/*
          ONE LINK OVER THE PICTURE AND THE NAME TOGETHER, and that is how the
          card gets smaller without shrinking a tap target.
          
          The old card gave the name its own `min-h-11`, with a comment saying
          it had measured 40px against this product's 44px floor. Compacting
          the text to 15px took it to TWENTY, measured in Chromium at 390px —
          the primary way into a campaign, a fifth of a thumb. Putting
          min-h-11 back would have bought 24px of the height this card exists
          to save.
          
          So the door is the whole header instead: the thumbnail is 56px tall
          on its own, so the link clears the floor for free, and min-h-11
          covers the one case with no picture at all. One link rather than
          two also ends the pair of links to one destination the old card
          offered assistive technology, the second of them nameless.
          
          A THUMBNAIL, NOT A PANEL. It was h-28 w-28 — 112px of the card's
          height spent on a picture the owner uses only to recognise which
          campaign this is, which a 56px square does just as well. Fixed
          square + object-fit (PostCover's own) so a portrait photo cannot
          make one card taller than its neighbour.
        */}
        <Link
          href={link}
          className="flex min-h-11 min-w-0 grow items-start gap-2.5 rounded-xl transition-colors hover:bg-ink-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          {cover(media) ? (
            <PostCover media={media} className="h-12 w-12" />
          ) : hasPost ? (
            /* The post has nothing attached. An empty corner reads as a
               picture that failed to load, so say what is missing. */
            <span
              title="לפוסט אין תמונה או סרטון"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-dashed border-ink-600 bg-ink-900 text-ink-500"
            >
              <PlusIcon aria-hidden className="h-4 w-4" />
            </span>
          ) : null}

          <span className="min-w-0 grow py-0.5">
            <span dir="auto" className="block truncate text-[15px] font-extrabold leading-5 text-mist-100">
              {campaign.name}
            </span>
            {/*
              THE TWO FACTS THAT TELL ONE CAMPAIGN FROM ANOTHER with the same
              name: how big it is and when it was made. `ltr` on the date so a
              Hebrew line cannot reverse it.

              The post count was here too and came out. Measured at 390px with
              a long badge beside it ("הסתיים — חלק דולגו"), three facts
              truncated to "122 פרסומים • 3 פוסטים • …" — and the thing that
              got cut was the date, which is the one fact here that cannot be
              read anywhere else on the card. How many posts a campaign holds
              is on its own screen, one tap away in ⋯.
            */}
            <span className="mt-0.5 block truncate text-[11px] font-semibold leading-4 text-mist-500">
              {total > 0 && <>{total} {agree(total, 'פרסום', 'פרסומים')} • </>}
              נוצר {ltr(formatDayMonthHe(campaign.created_at))}
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          {badge.live && <span aria-hidden className={`pulse-dot h-2 w-2 rounded-full ${TONE_FILL[badgeTone]}`} />}
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      </header>

      {/* ── 2. how far it has got ──────────────────────────────────────── */}
      {/*
        HANDLED, NOT SUCCEEDED, and the wording is the guard. A run of 122 rows
        where 121 were skipped is "122 מתוך 122 טופלו · 100%" — true, and the
        chips underneath are where "1 פורסם" is read. The percentage counts the
        same rows the bar's segments do; they disagreed once, and a run looked
        100% full on this list and 0% full on the dashboard one tap apart.
      */}
      {total > 0 ? (
        <>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-bold text-mist-100">{view.handledLabel}</p>
            <p className="text-[11px] font-bold tabular-nums text-mist-500">{view.percent}%</p>
          </div>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-ink-700" role="img" aria-label={view.ariaLabel}>
            {published > 0 && <span className={TONE_FILL.good} style={{ width: `${(published / total) * 100}%` }} />}
            {failed > 0 && <span className={TONE_FILL.bad} style={{ width: `${(failed / total) * 100}%` }} />}
            {skipped > 0 && <span className={TONE_FILL.neutral} style={{ width: `${(skipped / total) * 100}%` }} />}
          </div>

          {/* ── 3. what became of the rest ──────────────────────────────── */}
          {/*
            FOUR CHIPS, ALWAYS FOUR, ALWAYS THIS ORDER — it is the one line on
            the card read as a sentence, and a line whose words move with the
            run has to be re-read every time. grid-cols-4 rather than a wrap:
            at 390px four wrapped chips become two rows on some cards and one
            on others, and the list loses its rhythm. Zeros stay neutral; a red
            0 is noise, not a warning.
          */}
          <ul className="mt-2 grid grid-cols-4 gap-1.5 [&>*]:min-w-0">
            <Chip tone="good" count={published} one="פורסם" many="פורסמו" />
            <Chip tone="brand" count={scheduled + running + manual} one="ממתין" many="ממתינים" />
            <Chip tone="neutral" count={skipped} one="דולג" many="דולגו" />
            <Chip tone="bad" count={failed} one="נכשל" many="נכשלו" />
          </ul>
        </>
      ) : (
        <p className="mt-2.5 text-[13px] text-mist-500">עוד לא נוצרו פרסומים לקמפיין הזה.</p>
      )}

      {/* ── 4. what happens next, in ONE line ──────────────────────────── */}
      {/*
        It was two bordered boxes side by side — "הפרסום הבא" and "הקבוצה
        הבאה" — each with a label above its value, and on a paused run both
        said nothing: one printed "מושהה" and the other a bare em dash. Two
        boxes and 70px of card to say "nothing is waiting".
      */}
      <div className="mt-2 flex min-w-0 items-center gap-1.5 border-t border-ink-700 pt-2 text-[11.5px] font-semibold">
        <CalendarIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-mist-500" />
        <span className="shrink-0 text-mist-500">הבא בתור:</span>
        {state.nextAt ? (
          <span className="flex min-w-0 items-center gap-1.5">
            {state.nextTargetName && <TargetAvatar name={state.nextTargetName} imageUrl={nextTargetImage} size={16} />}
            {state.nextTargetName && (
              <span dir="auto" className="min-w-0 truncate text-mist-100">
                {state.nextTargetName}
              </span>
            )}
            <span className="shrink-0 tabular-nums text-brand-400">
              {ltr(whenLabel(state.nextAt))} · {relativeHe(state.nextAt)}
            </span>
          </span>
        ) : (
          <span className="truncate text-mist-500">{showResume ? 'מושהה — אין פרסום ממתין' : 'אין פרסום ממתין'}</span>
        )}
      </div>

      {/* ── 5. everything you can do to it, inside its own border ──────── */}
      <div className="mt-1.5 flex items-center gap-1">
        {showResume && onResume && (
          <Button size="sm" busy={busy} onClick={onResume}>
            המשך קמפיין
          </Button>
        )}
        {/* "עצור קמפיין" — this holds THIS campaign. The header's global
            toggle, visible on the same screen, holds EVERYTHING and carried
            the identical word. */}
        {showPause && onPause && (
          <Button size="sm" variant="secondary" busy={busy} onClick={onPause}>
            עצור קמפיין
          </Button>
        )}
        {/* A stopped run's primary action is to start it again, so it is a
            button here rather than a word in the menu — it is the only thing
            anybody opens a finished campaign to do. */}
        {!showPause && !showResume && onReopen && (
          <Button size="sm" variant="secondary" busy={busy} onClick={onReopen}>
            הפעל שוב
          </Button>
        )}
        {onEdit && (
          <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center rounded-lg px-2 text-[12.5px] font-bold text-brand-400 transition-colors hover:bg-ink-800">
            ערוך
          </button>
        )}
        {onDuplicate && (
          <button type="button" onClick={onDuplicate} className="inline-flex min-h-11 items-center rounded-lg px-2 text-[12.5px] font-bold text-brand-400 transition-colors hover:bg-ink-800">
            שכפל
          </button>
        )}
        <OverflowMenu label={`עוד פעולות ל${campaign.name}`} actions={menu} className="ms-auto h-11 w-11" />
      </div>
    </div>
  );
}

/** Same rule as the library card: the first IMAGE, and failing that whatever
    media exists — picking media[0] blindly leaves a post whose first item is a
    video looking different here than it does in the library. */
function cover(media?: MediaItem[] | null): MediaItem | null {
  return (media ?? []).find((m) => m.kind === 'image') ?? (media ?? [])[0] ?? null;
}

/**
 * One outcome, as a tinted chip.
 *
 * Hebrew has no bare-numeral singular, so a fixed plural prints "1 דולגו" —
 * and 1 is the commonest value on this card. The label agrees with its count.
 *
 * A zero goes neutral whatever its tone: four tinted chips where three of them
 * are zero is a card that looks like an incident every time it is read.
 */
function Chip({ tone, count, one, many }: { tone: Tone; count: number; one: string; many: string }) {
  const live = count > 0;
  return (
    /*
      ONE LINE, NOT TWO. Stacking the figure over its word cost 18px of every
      card for a word that reads perfectly well beside it — measured at 390px,
      each chip is ~84px wide and "11 פורסמו" is about 50 of them.

      NOT truncated: these four words are ours and they are short, and the
      layout guard is right to ask why a label would be cut.
    */
    <li className={`flex items-baseline justify-center gap-1 rounded-lg px-1 py-1 ${live ? TONE_TINT[tone] : 'bg-ink-800'}`}>
      <span className={`text-[13px] font-extrabold leading-4 tabular-nums ${live ? TONE_TEXT[tone] : 'text-mist-500'}`}>{count}</span>
      <span className={`text-[10px] font-bold leading-4 ${live ? TONE_TEXT[tone] : 'text-mist-500'}`}>{count === 1 ? one : many}</span>
    </li>
  );
}

/** Today shows a bare time; another day needs its date to mean anything. */
function whenLabel(iso: string): string {
  return ltr(zonedDateISO(new Date(iso)) === zonedDateISO(new Date()) ? formatTimeHe(iso) : formatDayMonthHe(iso));
}
