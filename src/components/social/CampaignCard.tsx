'use client';

import Link from 'next/link';
import { canPauseRun, canResumeRun, runBadge, runProgress, type CampaignState } from '@/lib/social/campaign';
import { formatDayMonthHe, formatTimeHe, zonedDateISO } from '@/lib/social/time';
import { ltr } from './DateTime';
import type { Campaign, MediaItem } from '@/lib/social/types';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  CopyIcon,
  MessageIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  TrashIcon,
} from '@/components/icons';
import { PostCover } from './PostCover';
import { TargetAvatar } from './TargetAvatar';
import { Badge, Button, ButtonLink, OverflowMenu, TONE_FILL, type MenuAction, type Tone } from './ui';

/**
 * The campaign as the owner's reference mockup draws it: a big portrait
 * picture on the far side of the card — its LEFT, on an RTL page — everything
 * about the run stacked beside it, and one row of actions at its foot.
 *
 * WHAT THIS PASS IS. "אני רוצה שהמסך הקיים של קמפיינים יהיה קרוב ככל האפשר
 * ל-pixel-perfect match לתמונה המצורפת... זה שינוי UI/UX בלבד. אל תשנה שום
 * לוגיקה קיימת, API, DB, state, routing, פונקציות."
 *
 * So not one handler, href, condition or number below is new. `runBadge`,
 * `runProgress`, `canPauseRun`, `canResumeRun` and every `on*` prop are the
 * ones this card already had; what moved is where they are drawn. The two
 * changes worth naming, because they are visible:
 *
 *   • The picture went from a 48px thumbnail to roughly a third of the card,
 *     full height — the mockup's single biggest difference, and the reason
 *     the card is now wide-and-short instead of tall.
 *   • Pause, resume and duplicate moved from the action row into ⋯, which is
 *     what the brief asks for by name ("פעולות משניות יעברו לכאן: שכפל, הוסף
 *     פוסט, תזמון, מחק, פעולות אחרות שכבר קיימות"). Same handlers, same
 *     conditions, one tap further away.
 *
 * WHAT IT PRINTS, AND WHY THOSE FIELDS. The mockup's line is "5 מתוך 20
 * פרסומים פורסמו" beside "25%". Those are two different counts, and this
 * file's own history is about not mixing them up: `view.publishedLabel`
 * counts rows that actually published, `view.percent` is how much of the run
 * has ENDED whatever the outcome. They are the same number on a clean run and
 * they differ the moment something is skipped — which is what `view.note`
 * ("12 דולגו · 3 נכשלו") is for. The dashboard hero prints exactly this pair,
 * so the two screens cannot drift: a run is not 100% here and 0% there.
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
  const { total, published, skipped, failed } = state.progress;
  /* Rows that ended without publishing. The bar's faint tone and view.note are
     the same fact drawn twice — never a zero, in either place. */
  const unpublished = skipped + failed;
  /* The one case the brief asks to call a success in words. Everything else
     that has ended says so through the badge and `view.note` instead — a run
     where 121 of 122 rows were skipped did not end "בהצלחה". */
  const finishedClean = total > 0 && published === total;
  /* The mockup's primary button for a run that has stopped. Same condition the
     old card used for the same action, moved from the secondary slot. */
  const restart = !showPause && !showResume && onReopen ? onReopen : undefined;

  /*
   * EVERYTHING ELSE, ONE TAP AWAY.
   *
   * Built from the handlers the page actually passed, so a campaign with no
   * post offers no "תגובות" and a live one offers no "החזר לפעילות" — a menu
   * item that cannot act is worse than a missing one. Delete is last, red, and
   * the page's own confirmation still stands in front of it.
   *
   * Pause, resume and duplicate joined it in this pass. Their conditions are
   * untouched: canPauseRun / canResumeRun still decide whether they appear at
   * all, so a run with nothing to hold back still offers nothing to press.
   */
  const menu: MenuAction[] = [
    { label: postCount > 0 ? `פרטי הקמפיין (${postCount === 1 ? 'פוסט אחד' : `${postCount} פוסטים`})` : 'פרטי הקמפיין', icon: <ClipboardListIcon className="h-4 w-4" />, onSelect: () => { window.location.href = link; } },
    ...(showPause && onPause ? [{ label: 'עצור קמפיין', icon: <PauseIcon className="h-4 w-4" />, onSelect: onPause }] : []),
    ...(showResume && onResume ? [{ label: 'המשך קמפיין', icon: <PlayIcon className="h-4 w-4" />, onSelect: onResume }] : []),
    ...(addPostHref ? [{ label: 'הוסף פוסט', icon: <PlusIcon className="h-4 w-4" />, onSelect: () => { window.location.href = addPostHref; } }] : []),
    ...(onComment ? [{ label: 'תגובה לפרסומים', icon: <MessageIcon className="h-4 w-4" />, onSelect: onComment }] : []),
    ...(onDuplicate ? [{ label: 'שכפל קמפיין', icon: <CopyIcon className="h-4 w-4" />, onSelect: onDuplicate }] : []),
    ...(onReopen ? [{ label: 'החזר לפעילות', icon: <RepeatIcon className="h-4 w-4" />, onSelect: onReopen }] : []),
    ...(onDelete ? [{ label: 'מחק קמפיין', icon: <TrashIcon className="h-4 w-4" />, onSelect: onDelete, danger: true }] : []),
  ];

  return (
    /* radius and padding are the mockup's, written here rather than pushed
       into --radius-card: that token is every card in the product. */
    <div className="surface rounded-[22px] border border-ink-700 p-2.5">
      <div className="flex items-stretch gap-3">
        {/* ─── everything about the run, beside it ────────────────────────── */}
        <div className="flex min-w-0 grow flex-col">
          {/* 1. what it is, and what state it is in */}
          <div className="flex items-start gap-2">
            {/* A 20px LINE IS NOT A TARGET, and this card learned that once
                already: compacting the title took the primary way into a
                campaign down to twenty pixels and nothing in the suite said
                so. The old fix was one link over the picture and the name
                together; the reference separates them, so the name carries
                its own target instead — drawn at 20px, 44px to a thumb, over
                the badge's padding above and the date below, neither of which
                is a control. Measured, not asserted from the class. */}
            <Link
              href={link}
              className="relative min-w-0 grow rounded-lg after:absolute after:inset-x-0 after:-inset-y-3 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <span dir="auto" className="block truncate text-[15px] font-extrabold leading-5 text-mist-100">
                {campaign.name}
              </span>
            </Link>
            <span className="flex shrink-0 items-center gap-1">
              {badge.live && <span aria-hidden className={`pulse-dot h-1.5 w-1.5 rounded-full ${TONE_FILL[badgeTone]}`} />}
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </span>
          </div>

          {/* 2. the date, which is what tells two runs of the same name apart */}
          <p className="mt-0.5 text-[11px] font-semibold leading-4 text-mist-500">{ltr(formatDayMonthHe(campaign.created_at))}</p>

          {/* 3. how far it has got — or, with nothing queued, the way in */}
          {total > 0 ? (
            <div className="mt-1.5">
              {finishedClean && !showPause && !showResume && (
                /* "✅ הקמפיין הסתיים בהצלחה" — only when every row published.
                   The badge above already says it ended; this says it ended
                   well, which is a different claim and needs the count. */
                <p className="mb-1 flex items-center gap-1 text-[11px] font-bold leading-4 text-success-400">
                  <CheckCircleIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  הקמפיין הסתיים בהצלחה
                </p>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <p dir="auto" className="min-w-0 truncate text-[12px] font-bold leading-4 text-mist-100">{view.publishedLabel}</p>
                <p className="shrink-0 text-[11px] font-extrabold tabular-nums leading-4 text-brand-400">{view.percent}%</p>
              </div>
              {/*
                THE MOCKUP'S PURPLE FILL ON A LAVENDER TRACK — in two tones,
                and the second one is not decoration.

                The whole filled width is view.percent: how much of the run has
                ENDED, which is the figure the dashboard's ring and this
                campaign's own screen also draw, so the three cannot disagree.
                But the sentence beside it counts PUBLICATIONS, and on a run
                where 121 of 122 rows were skipped those are 100% and 1 — a
                bar full to the brim over the words "1 מתוך 122 פורסם".

                So the strong tone is what published and the faint one is what
                ended without publishing. On the common run they are the same
                thing and the bar is the reference's single fill; the faint
                tail appears exactly when "12 דולגו · 3 נכשלו" does, and the
                two say the same thing twice.
              */}
              <div
                className="mt-1 flex h-2 overflow-hidden rounded-full bg-brand-300/15"
                role="img"
                aria-label={`${view.percent}% — ${view.publishedLabel}${view.note ? ` · ${view.note}` : ''}`}
              >
                {published > 0 && <span className="grad-primary bg-brand-500" style={{ width: `${(published / total) * 100}%` }} />}
                {unpublished > 0 && <span className="bg-brand-300/45" style={{ width: `${(unpublished / total) * 100}%` }} />}
              </div>
              {/* What became of the rest, in words rather than four chips:
                  "12 דולגו · 3 נכשלו", and nothing at all when every finished
                  row published. unpublishedNote() never invents a zero. */}
              {/* NOT truncated: this is our own sentence and it is short, and the
                  layout guard is right to ask why a label with a number in it
                  would be cut. If it ever outgrows the column it wraps, and
                  the card's height ceiling is what says so. */}
              {view.note && <p className="mt-0.5 min-w-0 text-[10.5px] font-semibold leading-4 text-mist-500">{view.note}</p>}
            </div>
          ) : (
            <div className="mt-1.5">
              <p className="text-[12px] font-semibold leading-4 text-mist-500">
                {postCount > 0 ? 'עוד לא נוצרו פרסומים לקמפיין הזה' : 'אין עדיין פוסטים בקמפיין'}
              </p>
              {addPostHref && (
                <ButtonLink href={addPostHref} variant="secondary" size="sm" className="mt-1.5 h-11 w-full !min-h-11 !px-2 !text-[12px]">
                  <PlusIcon aria-hidden className="h-3.5 w-3.5" />
                  {postCount > 0 ? 'הוסף פוסט' : 'הוסף פוסט ראשון'}
                </ButtonLink>
              )}
            </div>
          )}

          {/* 4. what happens next, in ONE line */}
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-4">
            <CalendarIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-mist-500" />
            <span className="shrink-0 text-mist-500">הבא בתור:</span>
            {state.nextAt ? (
              <span className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 tabular-nums text-mist-100">{ltr(whenLabel(state.nextAt))}</span>
                {state.nextTargetName && <TargetAvatar name={state.nextTargetName} imageUrl={nextTargetImage} size={14} />}
                {state.nextTargetName && (
                  <span dir="auto" className="min-w-0 truncate text-mist-500">
                    {state.nextTargetName}
                  </span>
                )}
              </span>
            ) : (
              <span className="truncate text-mist-500">{showResume ? 'מושהה — אין פרסום ממתין' : 'אין פרסום ממתין'}</span>
            )}
          </div>

          {/* 5. the three the reference draws, and nothing loose outside the card */}
          <div className="mt-auto flex items-stretch gap-1 pt-2">
            {restart ? (
              <Button size="sm" busy={busy} onClick={restart} className="h-11 grow whitespace-nowrap !gap-1 !min-h-11 !px-2 !text-[12px]">
                <RepeatIcon aria-hidden className="h-3.5 w-3.5" />
                הפעל שוב
              </Button>
            ) : (
              <ButtonLink href={link} size="sm" className="h-11 grow whitespace-nowrap !gap-1 !min-h-11 !px-2 !text-[12px]">
                <PlayIcon aria-hidden className="h-3.5 w-3.5" />
                פתח קמפיין
              </ButtonLink>
            )}
            {onEdit && (
              <Button variant="secondary" size="sm" onClick={onEdit} className="h-11 shrink-0 whitespace-nowrap !gap-1 !min-h-11 !px-2 !text-[12px]">
                <PencilIcon aria-hidden className="h-3.5 w-3.5" />
                ערוך
              </Button>
            )}
            {/* The round ⋯ becomes the reference's square, bordered like the
                button beside it. `!rounded-xl` because the component's own
                `rounded-full` is a one-class radius utility in the same layer
                and the later-emitted one would otherwise decide. */}
            <OverflowMenu
              label={`עוד פעולות ל${campaign.name}`}
              actions={menu}
              className="h-11 w-11 !rounded-xl border border-ink-700 bg-ink-900"
            />
          </div>
        </div>

        {/*
          ─── THE PICTURE, which is the whole point of this pass ───────────

          "אני רוצה תמונת פוסט גדולה בצד שמאל של הכרטיס... לא Thumbnail קטן.
           התמונה צריכה להיות אלמנט ויזואלי מרכזי בכרטיס."

          LAST IN THE ROW, which in an RTL page is its LEFT — "תמונת פוסט
          גדולה בצד שמאל של הכרטיס... בצד ימין של התמונה: שם הקמפיין". Source
          order is what decides this and it reads the same either way round,
          so worker/test/campaign-card.test.ts measures which side it landed
          on rather than trusting the file.

          36% OF THE ROW, UNTIL THE ROW CANNOT AFFORD IT. A third of the card
          once its padding is off, which is where "רוחב בערך 34%–38% מהכרטיס"
          lands, and the full height of whatever stands beside it.

          The `min()` is the part that is not decoration. The three controls at
          the foot of the card measure 214px together and none of them may wrap
          or be cut, so on a narrow phone a flat 36% leaves the row less room
          than it needs and it runs back UNDER the picture — 17px of the ⋯ on
          top of a picture that is itself a link, which is a mis-tap, not a
          cosmetic fault. So the picture takes 36% wherever 226px is left over
          for the row and its gap, and gives way below that: 34% at 430, 31% at
          390 — the reference's own proportion — and 25% at 360, where the
          choice is between a smaller picture and a button nobody can read. Measured off the reference, where the
          picture is 120 of the card's 380 and runs from its top padding to
          its bottom one. `items-stretch`
          on the row is what makes "full height" true without a fixed number,
          so a card that grows for a two-line name grows its picture too.

          THE SLOT IS ALWAYS THERE, and this is the owner's question:
          "למה בחלק מהקמפיינים הוא מראה תמונה בצד ובחלק לא".

          Three states, one width:
            a cover          — the post's own first image or video
            a dashed plus    — there IS a post and it has no media yet
            a quiet tile     — no post was found for this campaign
        */}
        <Link
          href={link}
          aria-label={`פתח את ${campaign.name}`}
          className="relative w-[max(72px,min(36%,calc(100%-226px)))] shrink-0 overflow-hidden rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          {cover(media) ? (
            <PostCover media={media} className="h-full w-full !rounded-[18px]" />
          ) : hasPost ? (
            /* The post has nothing attached. An empty corner reads as a
               picture that failed to load, so say what is missing. */
            <span
              title="לפוסט אין תמונה או סרטון"
              className="grid h-full w-full place-items-center rounded-[18px] border border-dashed border-ink-600 bg-ink-900 text-ink-500"
            >
              <PlusIcon aria-hidden className="h-5 w-5" />
            </span>
          ) : (
            /*
             * NO POST IN THE LIBRARY FOR THIS CAMPAIGN — which is not the
             * same absence as the one above and must not look like it.
             *
             * It happens for a real reason: the campaigns screen finds a
             * campaign's post by filtering listPosts(), and that read both
             * excludes archived posts and is unbounded, so PostgREST's own
             * row ceiling can leave an older post out of it. Either way the
             * campaign is fine — it published, its numbers are right — and
             * what is missing is the picture, not the work. So: no dashed
             * border, no warning colour, and a tooltip that says so.
             */
            <span
              title="לא נמצא פוסט לקמפיין הזה — ייתכן שהוא הועבר לארכיון. המספרים לצד נכונים בכל מקרה."
              className="grid h-full w-full place-items-center rounded-[18px] bg-ink-800 text-ink-500"
            >
              <ClipboardListIcon aria-hidden className="h-5 w-5" />
            </span>
          )}
        </Link>
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

/** Today shows a bare time; another day needs its date to mean anything. */
function whenLabel(iso: string): string {
  return zonedDateISO(new Date(iso)) === zonedDateISO(new Date())
    ? `היום, ${formatTimeHe(iso)}`
    : `${formatDayMonthHe(iso)}, ${formatTimeHe(iso)}`;
}
