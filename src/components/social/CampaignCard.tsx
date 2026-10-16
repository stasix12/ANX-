'use client';

import Link from 'next/link';
import { canPauseRun, canResumeRun, runBadge, runProgress, type CampaignState } from '@/lib/social/campaign';
import { type CampaignRepeat, type CampaignSchedule } from '@/lib/social/campaign-schedule';
import { scheduleReadout, type AccountSpacing } from '@/lib/social/schedule-readout';
import { accountGapSeconds } from '@/lib/social/rules';
import { counted, formatDayMonthHe } from '@/lib/social/time';
import { ltr } from './DateTime';
import type { Campaign, MediaItem } from '@/lib/social/types';
import {
  AlertCircleIcon,
  BoltIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  ClockIcon,
  CopyIcon,
  MessageIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  TrashIcon,
} from '@/components/icons';
import { CampaignSchedulePanel } from './CampaignSchedulePanel';
import { PostCover } from './PostCover';
import { Badge, Button, ButtonLink, OverflowMenu, TONE_FILL, type MenuAction, type Tone } from './ui';

/**
 * The campaign card, rebuilt to the owner's second reference image: one
 * column, top to bottom — the picture and the name, the connection, three
 * counters, the scheduling block, the next publication, the daily repeat, and
 * one button across the foot.
 *
 * "אני מצרף תמונת רפרנס של העיצוב החדש לכרטיס הקמפיין. עליך ליישם את העיצוב
 *  בדיוק כמו בתמונה, ברמת Pixel-Perfect ככל האפשר. התמונה היא רפרנס מחייב ולא
 *  השראה כללית. אין להמציא עיצוב חלופי."
 *
 * ─── WHAT CHANGED, AND WHY EACH ONE IS THE IMAGE RATHER THAN AN OPINION ───
 *
 *   THE CARD IS A COLUMN. It was a three-row grid with the picture spanning a
 *   side column; the reference stacks everything and gives the picture the top
 *   left corner. On a 360px phone that is the difference between a 38px day
 *   chip and a 40px one, which is the product's measured floor for a control.
 *
 *   THREE COUNTERS REPLACE THE PROGRESS BAR. "שלושה מוני פעילות: פורסמו,
 *   ממתינים, נכשלו." The bar carried `view.percent` — how much of the run has
 *   ENDED — and the sentence beside it counted PUBLICATIONS, which are two
 *   different numbers that this file's own history is about not mixing up.
 *   The counters say both of those plus the one neither of them said: how many
 *   have not happened yet. What they cannot say is how many were SKIPPED, and
 *   that is why the line under them exists — see `note`.
 *
 *   THE CONNECTION IS ITS OWN PILL. The reference draws "פעיל" on the picture
 *   and "המחשב לא מחובר" under the name, which is two facts in two places;
 *   runBadge() folds them into one label ("לא רץ — המחשב לא מחובר") because
 *   one badge was all this card used to have. Both are drawn now, and the
 *   pulsing dot is suppressed whenever the PC is off — which is the fault
 *   runBadge was written to prevent, kept by construction rather than by the
 *   label.
 *
 *   ONE BUTTON, AND NOTHING LOST. "עריכת קמפיין" is the reference's only
 *   action. Everything the foot row used to carry is still reachable: the name
 *   and the picture are both links into the campaign, and ⋯ holds פרטי
 *   הקמפיין, עצור/המשך, הוסף פוסט, הגדרות תור מתקדמות, תגובות, שכפל, החזר
 *   לפעילות and מחק — the same handlers under the same conditions, one tap
 *   further away.
 *
 * NO HANDLER, href, CONDITION OR DERIVATION BELOW IS NEW. `runBadge`,
 * `runProgress`, `canPauseRun`, `canResumeRun`, `scheduleReadout` and every
 * `on*` prop are the ones this card already had; what moved is where they are
 * drawn. "אסור לפגוע בפונקציות שכבר עובדות."
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
  onTune,
  editHref,
  onDuplicate,
  onReopen,
  onComment,
  onDelete,
  schedule,
  onScheduleChange,
  repeat,
  onRepeatChange,
  spacing,
  scheduleBusy = false,
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
  /**
   * OPENS THE QUEUE TUNER — the same "הגדרות תור מתקדמות" the dashboard's run
   * card has had, asked for here by name.
   *
   * It is the only control in the product that re-times rows ALREADY IN the
   * queue (respaceQueue), and it was reachable from one screen only. The
   * campaigns screen is where a round is actually looked after, and the
   * evening this was asked for was an evening spent needing exactly that:
   * 264 rows dated days ahead, holding every group, with the only visible
   * remedy being a red "אפס" that deletes them.
   *
   * Optional, like every other handler here: a caller that cannot open the
   * sheet does not draw the item.
   */
  onTune?: () => void;
  /*
   * "עריכת קמפיין" OPENS THE POST, not the campaign record.
   *
   * "שאני לוחץ עריכה אני רוצה שיהיה אפשר לערוך את טקסט הפרסום / תמונת מדיה
   *  של הפוסט ולא את מה שזה נותן עכשיו."
   *
   * It used to open a sheet with the campaign's service, city, name, language
   * and notes — none of which is what goes out. What goes out is the post's
   * text and its pictures, and this button now goes straight to the screen
   * that holds them.
   *
   * AN href AND NOT A HANDLER, which is the point of the change rather than
   * a detail of it: this is navigation, so it is a link. Long-press, open in
   * a new tab and the browser's own prefetch all come back, and the card stops
   * needing to know how to navigate.
   */
  editHref?: string;
  onDuplicate?: () => void;
  /** Only a stopped run can be put back; the page decides, this draws it. */
  onReopen?: () => void;
  /** Only offered once something has published — there is nothing to comment on before. */
  onComment?: () => void;
  onDelete?: () => void;
  /*
   * ─── "תזמון פרסום" ────────────────────────────────────────────────────
   *
   * The campaign's publishing window, drawn inside this card rather than
   * behind a sheet: "אל תפתח Modal. אל תפתח Popup. אל תיצור מסך חדש."
   *
   * Both of these are optional together, and the panel is drawn only when a
   * caller hands over a way to save it. Every other screen that renders a
   * CampaignCard — and there are several — keeps the card it has today
   * without passing anything, which is what "אל תשבור ואל תשנה שום
   * פונקציונליות קיימת" means for a shared component.
   */
  schedule?: CampaignSchedule | null;
  onScheduleChange?: (next: CampaignSchedule) => void;
  /**
   * CHZARA — passed straight through to the panel, which draws it only when
   * BOTH arrive: the switch's effect is a weekly schedule row, so a caller that
   * cannot write one must not offer it.
   */
  repeat?: CampaignRepeat;
  onRepeatChange?: (next: CampaignRepeat) => void;
  /**
   * The account-wide spacing rule, which the card cannot see from the campaign
   * alone — rules.ts holds a row for the later of this and the campaign's own
   * gap, so a card without it prints a minute the engine will not publish at.
   * Optional: a caller that cannot supply it gets the behaviour this card had
   * before, which is wrong in the same way it has always been wrong rather
   * than newly wrong.
   */
  spacing?: AccountSpacing;
  /** The campaign's row is being written; the panel's controls hold still. */
  scheduleBusy?: boolean;
}) {
  const link = href ?? `/social/campaigns/${campaign.id}`;

  /*
   * ─── TWO FACTS, TWO PLACES, AND THE DOT STILL CANNOT LIE ───────────────
   *
   * runBadge() short-circuits a running campaign to "לא רץ — המחשב לא מחובר"
   * when the heartbeat is missing, because one badge was all this card had.
   * The reference gives the connection a pill of its own, so the badge is free
   * to say what the RUN is doing — and the half of runBadge's job that must
   * not be given up is the pulsing dot: a run whose laptop has been asleep
   * since yesterday must not pulse as if it were publishing right now.
   *
   * So the badge keeps its own opinion for the label and is forced quiet for
   * the dot. Both come from runBadge; neither is re-derived here.
   */
  const pcOffline = workerOnline === false;
  const live = runBadge(state, { globalPaused, workerOnline });
  const own = runBadge(state, { globalPaused });
  const badge = pcOffline ? { ...own, live: false } : live;
  const badgeTone: Tone = badge.tone === 'info' ? 'brand' : badge.tone;

  /* A menu item is offered only when it can act. "השהה" used to be gated on
     the state NAME, so a run with nothing to hold back still offered it and
     toasted "הסבב הושהה." over a write that could not move a row. */
  const showPause = canPauseRun(state.progress, campaign.status);
  const showResume = canResumeRun(state.progress, campaign.status);
  const view = runProgress(state.progress, state.todayOnly, state.truncated);
  const { total, published, skipped, failed } = state.progress;

  /*
   * WHAT THE THREE COUNTERS CANNOT SAY, and nothing else.
   *
   * The counters carry published, waiting and failed. Three facts are left
   * over, and every one of them has cost this product a wrong screen before:
   *
   *   skipped      121 of 122 rows skipped reads as "1 פורסם" with no
   *                explanation anywhere on the card.
   *   todayOnly    a repeating round's figures are TODAY'S, and "3 פורסמו"
   *                over a campaign that has published three thousand times is
   *                a true number under a sentence that does not say what it is
   *                about.
   *   truncated    campaignStates() caps at 5000 rows across every campaign
   *                and drops the furthest-out ones first, so a capped read
   *                always leans towards "finished".
   *
   * One quiet line, and nothing at all when none of them applies — which is
   * the common card. This is not an element the reference omits; it is the
   * reference's own card, which has nothing exceptional to report.
   */
  const note = [
    state.todayOnly ? 'המספרים של היום' : '',
    skipped > 0 ? counted(skipped, 'פרסום אחד דולג', 'דולגו') : '',
    state.truncated ? 'הספירה כאן חלקית' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  /*
   * THE ONE CASE THE BRIEF ASKS TO CALL A SUCCESS IN WORDS — and four
   * conditions, not one, because the first version of this line said
   * "הקמפיין הסתיים בהצלחה" under three badges that said otherwise.
   *
   *   published === total   the claim itself.
   *   state === 'completed' an archived run resolves to 'stopped' and wore
   *                         "נעצר" over a green success line.
   *   badge.tone === 'good' runBadge short-circuits on a global pause, so the
   *                         header could read "everything is held" while the
   *                         card asserted it had finished well. `live` is the
   *                         badge WITH the connection folded in, which is the
   *                         strict reading and the right one here.
   *   !state.truncated      the serious one. A run that loses its pending rows
   *                         reports published === total with publications
   *                         still waiting; client.ts names this exact failure.
   */
  const finishedClean =
    total > 0 && published === total && state.state === 'completed' && live.tone === 'good' && !state.truncated;

  /*
   * ─── WHEN THE NEXT PUBLICATION ACTUALLY HAPPENS ────────────────────────
   *
   * "הנתון חייב להגיע מתור הפרסומים האמיתי של הקמפיין. אין להציג שעה משוערת
   *  שמחושבת רק מההגדרות אם קיימת רשומת תור עם מועד אחר."
   *
   * scheduleReadout() is that answer, and it is the SAME call the dashboard's
   * run card makes — "תסדר את הבעית שורש הזאת פעם אחת ולתמיד ובכל הקמפיינים
   * שיש." Two cards answered "when next" out of two copies of this derivation
   * and they drifted. One function, one answer, and a state added to it
   * reaches both cards at once.
   *
   * It is handed to the panel rather than drawn here, because the brief puts
   * the block between the settings and the repeat — "יש למקם את אזור הפרסום
   * הבא מתחת להגדרות התזמון ולפני החזרה היומית" — and both of those live in
   * the panel. <NextPublication> is the one component that draws it, here and
   * on the dashboard.
   */
  const readout = scheduleReadout(schedule, state, undefined, repeat, spacing);

  /*
   * EVERYTHING ELSE, ONE TAP AWAY.
   *
   * Built from the handlers the page actually passed, so a campaign with no
   * post offers no "תגובות" and a live one offers no "החזר לפעילות" — a menu
   * item that cannot act is worse than a missing one. Delete is last, red, and
   * the page's own confirmation still stands in front of it.
   *
   * "הגדרות תור מתקדמות" IS THE FALLBACK HERE, not a second copy: a card that
   * draws the scheduling block carries the visible button under it, and only a
   * card without one needs the menu row. One control per view.
   */
  const menu: MenuAction[] = [
    { label: postCount > 0 ? `פרטי הקמפיין (${postCount === 1 ? 'פוסט אחד' : `${postCount} פוסטים`})` : 'פרטי הקמפיין', icon: <ClipboardListIcon className="h-4 w-4" />, onSelect: () => { window.location.href = link; } },
    ...(showPause && onPause ? [{ label: 'עצור קמפיין', icon: <PauseIcon className="h-4 w-4" />, onSelect: onPause }] : []),
    ...(showResume && onResume ? [{ label: 'המשך קמפיין', icon: <PlayIcon className="h-4 w-4" />, onSelect: onResume }] : []),
    ...(addPostHref ? [{ label: 'הוסף פוסט', icon: <PlusIcon className="h-4 w-4" />, onSelect: () => { window.location.href = addPostHref; } }] : []),
    ...(onTune && !(schedule && onScheduleChange) ? [{ label: 'הגדרות תור מתקדמות', icon: <RepeatIcon className="h-4 w-4" />, onSelect: onTune }] : []),
    ...(onComment ? [{ label: 'תגובה לפרסומים', icon: <MessageIcon className="h-4 w-4" />, onSelect: onComment }] : []),
    ...(onDuplicate ? [{ label: 'שכפל קמפיין', icon: <CopyIcon className="h-4 w-4" />, onSelect: onDuplicate }] : []),
    ...(onReopen ? [{ label: 'החזר לפעילות', icon: <RepeatIcon className="h-4 w-4" />, onSelect: onReopen }] : []),
    ...(onDelete ? [{ label: 'מחק קמפיין', icon: <TrashIcon className="h-4 w-4" />, onSelect: onDelete, danger: true }] : []),
  ];

  return (
    /* The radius is the reference's and it is written here rather than pushed
       into --radius-card: that token is every card in the product. */
    <div className="surface rounded-[26px] border border-ink-700 p-2.5">
      {/*
        ─── 1. THE HEAD: ⋯, the name, the connection — and the picture ────

        Source order is right-to-left on this page, which is the image's own
        arrangement: ⋯ in the card's top corner, the name beside it, the
        picture at the far side. `items-start` so a one-line name does not drag
        the picture's top edge down with it.
      */}
      <div className="flex items-start gap-2.5">
        <div className="flex min-w-0 grow flex-col">
          <div className="flex items-start gap-1">
            {/* The reference's square ⋯, bordered like the controls it holds.
                `!rounded-xl` because the component's own `rounded-full` is a
                one-class radius utility in the same layer and the later-emitted
                one would otherwise decide. */}
            <OverflowMenu
              label={`עוד פעולות ל${campaign.name}`}
              actions={menu}
              className="-ms-1 -mt-1 h-10 w-10 shrink-0 !rounded-xl"
            />
            {/*
              A 20px LINE IS NOT A TARGET, and this card learned that once
              already: compacting the title took the primary way into a
              campaign down to twenty pixels and nothing in the suite said so.
              The name carries its own target — drawn at 18px, 44px to a thumb,
              over the padding above and the date below, neither of which is a
              control. Measured, not asserted from the class.
            */}
            <Link
              href={link}
              className="relative mt-0.5 min-w-0 grow rounded-lg after:absolute after:inset-x-0 after:-inset-y-3 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <span dir="auto" className="block truncate text-[18px] font-extrabold leading-6 text-mist-100">
                {campaign.name}
              </span>
            </Link>
          </div>

          {/* The date, which is what tells two runs of the same name apart. */}
          <p className="mt-0.5 text-[11px] font-semibold leading-4 text-mist-500">{ltr(formatDayMonthHe(campaign.created_at))}</p>

          {/*
            ─── THE CONNECTION, AS ITS OWN PILL ───────────────────────────

            "סטטוס חיבור המחשב." Drawn only when the page actually knows —
            `undefined` is "not read", and a card that guesses either way about
            the owner's PC is a card that will be wrong about it.

            error-400 on a 12% wash of error-300 is the product's `bad` pair
            and measures over 4.5:1 on a card; the two are TONE_TEXT and
            TONE_TINT and are never mixed with TONE_FILL, which is the
            non-text step.
          */}
          {workerOnline !== undefined && (
            <p
              className={`mt-1.5 inline-flex max-w-full items-center gap-1 self-start rounded-full px-2 py-1 text-[11px] font-bold leading-4 ${
                pcOffline ? 'bg-error-300/12 text-error-400' : 'bg-success-400/12 text-success-400'
              }`}
            >
              {pcOffline ? <AlertCircleIcon aria-hidden className="h-3.5 w-3.5 shrink-0" /> : <CheckCircleIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />}
              <span data-must-fit dir="auto" className="min-w-0 truncate">{pcOffline ? 'המחשב לא מחובר' : 'המחשב מחובר'}</span>
            </p>
          )}
        </div>

        {/*
          ─── THE PICTURE, and the state badge on it ──────────────────────

          "תמונת הקמפיין בחלק העליון, בדיוק במיקום ובפרופורציות של הרפרנס...
           לא Thumbnail קטן."

          30% OF THE CARD, SQUARE, with a floor so a narrow phone cannot turn
          it into a thumbnail: the reference measures 107px on a 402px phone,
          which is what `30%` produces at that width. `aspect-square` rather
          than a fixed height, so the one number that decides it is the share
          of the card — and the measured suite checks that every card in a list
          reserves the SAME share, because a list whose edge moves row to row
          reads as broken.

          THE SLOT IS ALWAYS THERE, and this is the owner's own question:
          "למה בחלק מהקמפיינים הוא מראה תמונה בצד ובחלק לא".

          Three states, one width:
            a cover          — the post's own first image or video
            a dashed plus    — there IS a post and it has no media yet
            a quiet tile     — no post was found for this campaign
        */}
        <Link
          href={link}
          aria-label={`פתח את ${campaign.name}`}
          className="relative aspect-square w-[30%] min-w-[92px] shrink-0 overflow-hidden rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          {cover(media) ? (
            <PostCover media={media} className="h-full w-full !rounded-[20px]" />
          ) : hasPost ? (
            /* The post has nothing attached. An empty corner reads as a
               picture that failed to load, so say what is missing. */
            <span
              title="לפוסט אין תמונה או סרטון"
              className="grid h-full w-full place-items-center rounded-[20px] border border-dashed border-ink-600 bg-ink-900 text-mist-500"
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
              className="grid h-full w-full place-items-center rounded-[20px] bg-ink-800 text-mist-500"
            >
              <ClipboardListIcon aria-hidden className="h-5 w-5" />
            </span>
          )}
          {/*
            "⚡ פעיל" — the reference's badge, in the picture's top corner.

            `end-1.5` and not `left`: on this RTL page the end is the left,
            which is where the image draws it, and an LTR locale would flip it
            without this file knowing. It is a <span> rather than a control, so
            it does not count as something sitting on the picture — the
            measured suite fails any LINK OR BUTTON that overlaps it, because
            the cost of that is a tap that opens a campaign when it meant to
            open a menu.
          */}
          <span className="pointer-events-none absolute top-1.5 end-1.5 flex max-w-[calc(100%-12px)] items-center gap-0.5">
            {badge.live && <span aria-hidden className={`pulse-dot h-1.5 w-1.5 shrink-0 rounded-full ${TONE_FILL[badgeTone]}`} />}
            <Badge tone={badge.tone}>
              <BoltIcon aria-hidden className="h-2.5 w-2.5 shrink-0" />
              {badge.label}
            </Badge>
          </span>
        </Link>
      </div>

      {/*
        ─── 2. THE THREE COUNTERS ─────────────────────────────────────────

        "שלושה מוני פעילות: פורסמו, ממתינים, נכשלו", right to left in the
        image's own order. Equal thirds, because they are three readings of one
        run and a wider box would read as a more important number.
      */}
      {total > 0 ? (
        <>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 [&>*]:min-w-0">
            <Stat value={published} label="פורסמו" icon={<CheckCircleIcon aria-hidden className="h-4 w-4 shrink-0 text-success-400" />} />
            {/* openRows(): scheduled + running + manual — everything that has
                not ended yet. It is the number that answers "is this still
                going to publish?", which is the question the card exists for. */}
            <Stat value={view.open} label="ממתינים" icon={<ClockIcon aria-hidden className="h-4 w-4 shrink-0 text-brand-400" />} />
            <Stat value={failed} label="נכשלו" icon={<AlertCircleIcon aria-hidden className="h-4 w-4 shrink-0 text-error-400" />} />
          </div>
          {finishedClean && (
            /* "✅ הקמפיין הסתיים בהצלחה" — only when every row published. The
               badge above already says it ended; this says it ended WELL,
               which is a different claim and needs the count. */
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold leading-4 text-success-400">
              <CheckCircleIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              הקמפיין הסתיים בהצלחה
            </p>
          )}
          {/* NOT truncated: this is our own sentence and it is short, and the
              layout guard is right to ask why a label with a number in it
              would be cut. If it outgrows the card it wraps. */}
          {note && <p className="mt-1.5 text-[10.5px] font-semibold leading-4 text-mist-500">{note}</p>}
        </>
      ) : (
        <div className="mt-2.5">
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

      {/*
        ─── 3. "תזמון פרסום", "הפרסום הבא", "חזרה יומית" ──────────────────

        One component draws all three, in the order the brief writes out, and
        the next-publication block is handed the readout computed above. The
        block collapses to nothing when no caller passes a schedule, so a card
        without the panel is the card as it was for every other screen that
        renders this component.
      */}
      {schedule && onScheduleChange && (
        <>
          <CampaignSchedulePanel
            schedule={schedule}
            onChange={onScheduleChange}
            repeat={repeat}
            onRepeatChange={onRepeatChange}
            campaignName={campaign.name}
            disabled={scheduleBusy}
            accountFloorSeconds={spacing ? accountGapSeconds(spacing, spacing, true) : undefined}
            /* 'not_started' with nothing ever queued: neither control in the
               panel can produce a publication until the round is launched once. */
            neverLaunched={state.state === 'not_started' && state.progress.total === 0}
            readout={readout}
            workerOnline={workerOnline}
            nextTargetName={state.nextTargetName}
            nextTargetImage={nextTargetImage}
          />

          {/*
            ─── "הגדרות תור מתקדמות" — kept VISIBLE, deliberately ───────────

            THE ONE PLACE THIS CARD DEPARTS FROM THE REFERENCE, and it is a
            standing request rather than a preference: "תוסיף כאן הגדרות תור
            מתקדם כמו בעמוד ראשי". respaceQueue is the only thing in the product
            that re-times rows ALREADY in the queue, and the evening it was asked
            for was an evening that needed exactly it — 264 rows dated days
            ahead, holding every group, with the only visible remedy on screen
            being a red "אפס" that deletes them. "כמו בעמוד ראשי" is what it
            looks like there: a button under the panel, not a row inside a menu.

            So it stays a button, in the quiet variant and under the block whose
            rows it re-times, with the primary action still the only filled one
            at the foot. A card that draws no panel gets the ⋯ row instead —
            one control per view.
          */}
          {onTune && (
            <Button variant="secondary" size="sm" onClick={onTune} className="mt-1.5 h-10 w-full !min-h-10 justify-center gap-1.5 !rounded-2xl">
              <RepeatIcon aria-hidden className="h-3.5 w-3.5" />
              הגדרות תור מתקדמות
            </Button>
          )}
        </>
      )}

      {/*
        ─── 4. "עריכת קמפיין" ─────────────────────────────────────────────

        The reference's one action, full width across the card's foot. It opens
        the POST — see the note on `editHref`. A card with no editor to open
        falls back to the campaign itself rather than drawing a dead button or
        leaving the foot empty.
      */}
      <ButtonLink
        href={editHref ?? link}
        size="md"
        className="mt-2.5 h-12 w-full !min-h-12 !rounded-2xl justify-center gap-2 !text-[14px]"
      >
        <PencilIcon aria-hidden className="h-4 w-4" />
        {editHref ? 'עריכת קמפיין' : 'פתח קמפיין'}
      </ButtonLink>
    </div>
  );
}

/**
 * One counter: the figure with its mark, and the word under them.
 *
 * THE FIGURE AND THE ICON SHARE A LINE, which is the reference's own
 * arrangement and not a space saving: the icon is what makes three identical
 * boxes tellable apart at a glance, and above the number it would be read as
 * a heading rather than as part of it.
 */
function Stat({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-900 px-1 py-2 text-center">
      {/* THE ICON FIRST IN SOURCE, so it lands on the RIGHT of this RTL row —
          which is where the reference draws it, with the figure to its left.
          Written as source order rather than as an `order-` class, so an LTR
          locale would mirror it without this file knowing which side it is
          on. */}
      <span className="flex items-center justify-center gap-1">
        {icon}
        <span className="text-[19px] font-extrabold leading-6 tabular-nums text-mist-100">{value}</span>
      </span>
      {/* data-must-fit: one word, and a counter whose label is cut is a
          counter nobody can read. The measured suite fails on a single
          clipped character in any element carrying this. */}
      {/* dir="auto" because the guard in layout.test.ts asks it of every
          clamped expression and is right to: it cannot tell this word from a
          group's name. All three are Hebrew constants written in this file, so
          "auto" resolves to the RTL they already had. */}
      <span data-must-fit dir="auto" className="mt-0.5 block truncate text-[10.5px] font-bold leading-4 text-mist-300">{label}</span>
    </div>
  );
}

/** Same rule as the library card: the first IMAGE, and failing that whatever
    media exists — picking media[0] blindly leaves a post whose first item is a
    video looking different here than it does in the library. */
function cover(media?: MediaItem[] | null): MediaItem | null {
  return (media ?? []).find((m) => m.kind === 'image') ?? (media ?? [])[0] ?? null;
}
