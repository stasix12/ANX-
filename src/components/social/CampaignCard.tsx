'use client';

import Link from 'next/link';
import { canPauseRun, canResumeRun, runBadge, runProgress, type CampaignState } from '@/lib/social/campaign';
import { type CampaignRepeat, type CampaignSchedule } from '@/lib/social/campaign-schedule';
import { scheduleReadout, type AccountSpacing } from '@/lib/social/schedule-readout';
import { accountGapSeconds } from '@/lib/social/rules';
import { counted, formatDayMonthHe, formatTimeHe, zonedDateISO } from '@/lib/social/time';
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
import { CampaignSchedulePanel } from './CampaignSchedulePanel';
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
  /*
   * "ערוך" OPENS THE POST, not the campaign.
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
  const view = runProgress(state.progress, state.todayOnly);
  const { total, published, skipped, failed } = state.progress;
  /* The same line the dashboard hero prints, from the same two pieces, and
     neither of them ever invents a zero. */
  const tail = [view.note, view.open > 0 ? `${view.open} עוד לא יצאו` : ''].filter(Boolean).join(' · ');
  /*
   * THE ONE CASE THE BRIEF ASKS TO CALL A SUCCESS IN WORDS — and four
   * conditions, not one, because the first version of this line said
   * "הקמפיין הסתיים בהצלחה" under three badges that said otherwise.
   *
   *   published === total   the claim itself.
   *   state === 'completed' an archived run resolves to 'stopped' and wore
   *                         "נעצר" over a green success line.
   *   badge.tone === 'good' runBadge short-circuits on a global pause and on
   *                         a disconnected PC, so the header could read
   *                         "everything is held" while the card asserted it
   *                         had finished well. The badge is the one opinion
   *                         about the run's state in this product; this line
   *                         is not allowed a second one.
   *   !state.truncated      the serious one. campaignStates() caps at 5000
   *                         rows ACROSS every campaign, dropping the
   *                         furthest-out scheduled ones first, so a run that
   *                         loses its pending rows reports published === total
   *                         with publications still waiting. client.ts names
   *                         this exact failure. The old card's worst output
   *                         was a label claiming completion; a green
   *                         "finished successfully" is a claim campaign.ts was
   *                         written to forbid.
   */
  const finishedClean =
    total > 0 && published === total && state.state === 'completed' && badge.tone === 'good' && !state.truncated;
  /* The mockup's primary button for a run that has stopped. Same condition the
     old card used for the same action, moved from the secondary slot. */
  const restart = !showPause && !showResume && onReopen ? onReopen : undefined;

  /*
   * ─── WHEN THE NEXT PUBLICATION ACTUALLY HAPPENS ────────────────────────
   *
   * "לאחר חישוב התזמון החדש, 'הבא בתור' בכרטיסייה צריך להציג את מועד הפרסום
   *  הבא האמיתי. אם הפרסום הבא נמצא מחוץ לשעות הפעילות, יש לחשב אוטומטית את
   *  היום והשעה החוקיים הבאים."
   *
   * state.nextAt is the row's stored scheduled_at, and with a window switched
   * on that is no longer the answer: a row stamped 23:40 on a campaign that
   * stops at 22:00 does not go out at 23:40, it goes out at 08:00 on the next
   * chosen day. The engine already knows that — rules.ts defers it — so a card
   * printing the stored instant is the screen contradicting the machine for
   * however long it takes the worker to claim the row.
   *
   * THE SAME FUNCTION THE ENGINE USES, and that is the whole reason
   * campaign-schedule.ts exists as a module rather than as a block inside
   * rules.ts. nextPublishAt() is called here with what this card knows — the
   * stored instant, and when this campaign last published — and in rules.ts
   * with what the worker knows. Two readers, one rule.
   *
   * WITH THE SWITCH OFF, THIS IS A NO-OP. nextPublishAt() returns `from`
   * unchanged, `from` is the stored instant, and the line prints exactly what
   * it printed before this feature existed.
   */
  /*
   * AND IT IS THE SAME CALL THE DASHBOARD'S RUN CARD MAKES — scheduleReadout(),
   * which holds the four lines that used to be copied here.
   *
   * "תסדר את הבעית שורש הזאת פעם אחת ולתמיד ובכל הקמפיינים שיש." Two cards
   * answered "when next" for the same campaign out of two copies of this
   * derivation, and they drifted: the dashboard learned that a finished round
   * has no instant, and this one went on printing "אין פרסום ממתין" over rows
   * that were waiting for a PERSON, with no way to tell him so. One function,
   * one answer, and a state added to it reaches both cards at once.
   */
  const readout = scheduleReadout(schedule, state, undefined, repeat, spacing);
  const nextAt = readout.kind === 'due' ? readout.at : null;

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
    <div className="surface @container rounded-[22px] border border-ink-700 p-2.5">
      {/*
        ─── THREE ROWS AND TWO COLUMNS, AND THE MIDDLE ONE MOVES ───────────
        
        The reference draws the card as: the picture beside everything about
        the run, the scheduling panel under that, and ONE row at the foot
        carrying "הבא בתור" and the three actions across the card's whole
        width. That is this grid:

            row 1   [ name · date · progress · + הוסף פוסט ] [ picture ]
            row 2   [ תזמון פרסום                          ] [    ↕    ]
            row 3   [ פתח קמפיין · ערוך · ⋯ ·········· הבא בתור        ]

        WHY THE PANEL CHANGES COLUMN, which is the one thing here that is not
        simply the image. The reference was drawn on a card 566px wide, and at
        that width the panel sits in the content column beside a picture about
        a quarter of the card — which is exactly what the `@[440px]` variants
        below produce, down to the 46px day chip the image measures.

        On the owner's phone that same card is 358px. A seven-chip row and
        three time fields cannot share 230px with a picture: the chips come out
        26px wide, narrower than they are tall, the summary line is cut after
        the days, and the picture — stretched down the side of a panel it is
        not beside — becomes a 76px sliver. All three are visible in the first
        render of this layout, and all three are what section 11 of the brief
        is about: "אל תדחוס את האלמנטים עד שהם בלתי קריאים... שמור על אותה שפה
        ויזואלית ואותה היררכיה."

        So under 440px the panel takes the full width of the card instead. The
        order, the contents, the colours, the radii and the proportions inside
        it are the reference's at every width; what changes is which of the
        card's two columns it starts in. A CONTAINER query and not a viewport
        one, because what decides this is how wide the CARD is — and on the
        desktop grid two cards sit side by side in a viewport far wider than
        either of them.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(76px,30%)] gap-x-3 [&>*]:min-w-0 @[440px]:grid-cols-[minmax(0,1fr)_minmax(96px,26%)]">
        {/* ─── row 1, right: everything about the run ─────────────────────── */}
        <div className="col-start-1 row-start-1 flex min-w-0 flex-col">
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
                {/* data-must-fit: this sentence is OURS and it carries the two numbers
                    the card exists to report, so it may be narrowed but never
                    cut. worker/test/campaign-card.test.ts measures exactly the
                    elements carrying this attribute; a group's own name, two
                    lines down, is user text and is allowed to end in an
                    ellipsis. dir="auto" because the guard in layout.test.ts
                    reads "publishedLabel" as user text and is right to ask. */}
                <p data-must-fit dir="auto" className="min-w-0 truncate text-[12px] font-bold leading-4 text-mist-100">{view.publishedLabel}</p>
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
                aria-label={`${view.percent}% — ${view.publishedLabel}${tail ? ` · ${tail}` : ''}`}
              >
                {published > 0 && <span className="grad-primary bg-brand-500" style={{ width: `${(published / total) * 100}%` }} />}
                {skipped > 0 && <span className="bg-brand-300/45" style={{ width: `${(skipped / total) * 100}%` }} />}
                {/* A failure keeps the colour it had before this pass. Folded
                    into one faint tone with the skips, a run with twelve
                    failures drew the same bar as a run with twelve skips. */}
                {failed > 0 && <span className={TONE_FILL.bad} style={{ width: `${(failed / total) * 100}%` }} />}
              </div>
              {/* What became of the rest, in words rather than four chips:
                  "12 דולגו · 3 נכשלו", and nothing at all when every finished
                  row published. unpublishedNote() never invents a zero. */}
              {/*
                WHAT BECAME OF THE REST, and how much has not happened yet.

                The four chips this pass removed carried one number that is
                nowhere else on the card: how many publications are still
                waiting. It is derivable — total minus published minus skipped
                minus failed — but it is the number that answers "is this still
                going to publish?", which is the question the screen exists
                for. view.open hands it over, and this is the line the
                dashboard hero already builds from the same two pieces.

                NOT truncated: this is our own sentence and it is short, and the
                layout guard is right to ask why a label with a number in it
                would be cut. If it ever outgrows the column it wraps, and the
                card's height ceiling is what says so.
              */}
              {tail && <p className="mt-0.5 min-w-0 text-[10.5px] font-semibold leading-4 text-mist-500">{tail}</p>}
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

        </div>

        {/*
          ─── THE PICTURE, row 1 of the left column ────────────────────────

          "אני רוצה תמונת פוסט גדולה בצד שמאל של הכרטיס... לא Thumbnail קטן.
           התמונה צריכה להיות אלמנט ויזואלי מרכזי בכרטיס."

          COLUMN 2 OF AN RTL GRID IS ITS LEFT, which is the same place the old
          flex row put it by being last in source. Written as an explicit
          `col-start-2` now, because a grid item's position is its own property
          rather than its order among siblings — and because row 2 beside it
          moves between the columns, which source order could not express.
          worker/test/campaign-card.test.ts still measures which side it landed
          on rather than trusting either.

          30% ON A PHONE, 26% ON A WIDE CARD — and the second number is the
          reference's own (141 of its 566). It is the width of a grid COLUMN
          now, not of the picture: `minmax(76px, 30%)` reserves it against the
          card, so the content beside it can never push the picture to a
          sliver, which is exactly what a `calc(100% - …)` on the picture
          itself did the moment the scheduling panel went in next to it.

          IT SPANS TWO ROWS ONLY ON A WIDE CARD. That is where the panel sits
          beside it, so there are two rows to span and the reference's tall
          portrait is what comes out. On a phone the panel is underneath, the
          picture stops at the end of row 1, and it keeps a portrait's shape
          instead of being stretched 400px down the side of something it is not
          beside.

          AND IT HAS A FLOOR. A grid row is as tall as its tallest cell, and on
          a campaign with little to say beside it — one that published and has
          no post findable for it, so there is no bar and no tail — that is 91px
          against a 92px-wide picture. Square is not a portrait and at that size
          it reads as a thumbnail, which is the thing this card was rebuilt to
          stop being.

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
          className="relative col-start-2 row-start-1 min-h-28 overflow-hidden rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 @[440px]:row-span-2"
        >
          {cover(media) ? (
            <PostCover media={media} className="h-full w-full !rounded-[18px]" />
          ) : hasPost ? (
            /* The post has nothing attached. An empty corner reads as a
               picture that failed to load, so say what is missing. */
            <span
              title="לפוסט אין תמונה או סרטון"
              className="grid h-full w-full place-items-center rounded-[18px] border border-dashed border-ink-600 bg-ink-900 text-mist-500"
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
              className="grid h-full w-full place-items-center rounded-[18px] bg-ink-800 text-mist-500"
            >
              <ClipboardListIcon aria-hidden className="h-5 w-5" />
            </span>
          )}
        </Link>

        {/*
          ─── ROW 2: "תזמון פרסום" ──────────────────────────────────────────

          Under "הוסף פוסט" and above the card's own actions, which is where
          the reference puts it and where the brief spells the order out:

            [שם הקמפיין + סטטוס] [מידע/תיאור] [הוסף פוסט]
            [תזמון פרסום – האזור החדש]
            [הבא בתור] […] [ערוך] [פתח קמפיין]

          Full width under 440px, beside the picture above it; see the note on
          the grid. The row collapses to nothing when no caller passes a
          schedule, so a card without the panel is the card as it was.
        */}
        {schedule && onScheduleChange && (
          <div className="col-span-2 col-start-1 row-start-2 min-w-0 @[440px]:col-span-1 @[440px]:col-start-1">
            <CampaignSchedulePanel
              schedule={schedule}
              onChange={onScheduleChange}
              repeat={repeat}
              onRepeatChange={onRepeatChange}
              campaignName={campaign.name}
              disabled={scheduleBusy}
              accountFloorSeconds={spacing ? accountGapSeconds(spacing, spacing, true) : undefined}
              /* 'not_started' with nothing ever queued: neither control below
                 can produce a publication until the round is launched once. */
              neverLaunched={state.state === 'not_started' && state.progress.total === 0}
            />
          </div>
        )}

        {/*
          ─── ROW 3: the actions, and "הבא בתור" beside them ────────────────

          One row across the whole card, the actions at its start and the next
          publication at its far end — "[הבא בתור] […] [ערוך] [פתח קמפיין]",
          read off the reference, where that line sits under the picture rather
          than in the column beside it.
        */}
        <div className="col-span-2 col-start-1 row-start-3 mt-2 flex items-center gap-2">
          <div className="flex shrink-0 items-stretch gap-1">
            {restart ? (
              <Button size="sm" busy={busy} onClick={restart} className="h-11 whitespace-nowrap !gap-1 !min-h-11 !px-2 !text-[12px]">
                <RepeatIcon aria-hidden className="h-3.5 w-3.5" />
                הפעל שוב
              </Button>
            ) : (
              <ButtonLink href={link} size="sm" className="h-11 whitespace-nowrap !gap-1 !min-h-11 !px-2 !text-[12px]">
                <PlayIcon aria-hidden className="h-3.5 w-3.5" />
                פתח קמפיין
              </ButtonLink>
            )}
            {editHref && (
              <ButtonLink href={editHref} variant="secondary" size="sm" className="h-11 shrink-0 whitespace-nowrap !gap-1 !min-h-11 !px-2 !text-[12px]">
                <PencilIcon aria-hidden className="h-3.5 w-3.5" />
                ערוך
              </ButtonLink>
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

          {/*
            WHAT HAPPENS NEXT, in the reference's own two lines: the label above
            the instant, so the block needs about half the width it would on
            one line — which is what lets it share a row with three buttons on
            a 360px phone instead of being pushed under them.
          */}
          <div className="flex min-w-0 grow items-center justify-end gap-1.5 text-[11px] font-semibold leading-4">
            <span className="min-w-0 text-end">
              <span className="block text-mist-500">הבא בתור:</span>
              {readout.kind === 'no-day' ? (
                /* The schedule permits no day at all, so the stored instant is
                   not when this will publish — and printing it would be the
                   screen promising something the engine will not do. */
                <span className="block truncate text-warning-400">לא נבחר יום פרסום</span>
              ) : readout.kind === 'ended' ? (
                /*
                 * THE ROUND IS OVER, AND "אין פרסום ממתין" was not enough.
                 *
                 * It is true and it reads as a lull — something that will pass.
                 * Nothing will pass: a finished round does not restart itself,
                 * and the owner spent weeks believing an active schedule meant
                 * his campaign was still going out daily. The list says what
                 * the dashboard card now says, in the room a list row has.
                 */
                <span className="block truncate text-mist-500">{readout.stopped ? 'הסבב הופסק' : 'הסבב הסתיים'}</span>
              ) : readout.kind === 'paused' ? (
                /* Every row of a paused round is handed straight back by
                   rules.ts, so the stored instant is not when it publishes —
                   nothing does, until he presses resume. */
                <span className="block truncate text-warning-400">מושהה — אין פרסום עד שתמשיכו</span>
              ) : readout.kind === 'partial' ? (
                <span className="block truncate text-mist-500">הסבב גדול מדי לספירה כאן</span>
              ) : readout.kind === 'manual' ? (
                /* Publications ARE waiting — on him. "אין פרסום ממתין" over
                   these was the list reporting them as nothing. */
                <span className="block truncate text-warning-400">
                  {counted(readout.waiting, 'פרסום אחד ממתין לך', 'פרסומים ממתינים לך', 'שני פרסומים ממתינים לך')}
                </span>
              ) : nextAt ? (
                <span className="flex min-w-0 items-center gap-1">
                  <span dir="ltr" className="shrink-0 tabular-nums text-mist-100">{whenLabel(nextAt)}</span>
                  {state.nextTargetName && <TargetAvatar name={state.nextTargetName} imageUrl={nextTargetImage} size={14} />}
                  {state.nextTargetName && (
                    <span dir="auto" className="min-w-0 truncate text-mist-500">
                      {state.nextTargetName}
                    </span>
                  )}
                </span>
              ) : state.state === 'not_started' && state.progress.total === 0 ? (
                /*
                 * NEVER LAUNCHED, AND "אין פרסום ממתין" DID NOT SAY SO.
                 *
                 * Same fault as the 'ended' branch above, at the other end of
                 * a round's life: the sentence is true, it reads as a lull,
                 * and nothing will end the lull. The owner set a schedule and
                 * turned on the daily repeat on a round in exactly this state
                 * and waited an evening for a publication that could not come
                 * — neither control creates one, and nothing on the card said
                 * which action would.
                 */
                <span className="block truncate text-warning-400">הסבב עוד לא הושק — בחרו קבוצות ושלחו</span>
              ) : (
                <span className="block truncate text-mist-500">{showResume ? 'מושהה — אין פרסום ממתין' : 'אין פרסום ממתין'}</span>
              )}
            </span>
            {/* AFTER the text in source, which in RTL puts it at the far left
                — the corner the reference draws it in, under the picture. */}
            <CalendarIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-mist-500" />
          </div>
        </div>
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
