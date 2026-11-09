'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { canPauseRun, canResumeRun, groupProgress, neverLaunched, runBadge, runProgress, type CampaignState } from '@/lib/social/campaign';
import { type CampaignRepeat, type CampaignRound, type CampaignSchedule } from '@/lib/social/campaign-schedule';
import { scheduleReadout, type AccountSpacing } from '@/lib/social/schedule-readout';
import { accountGapSeconds, paceProfile } from '@/lib/social/rules';
import { counted, formatDayMonthHe } from '@/lib/social/time';
import { ltr } from './DateTime';
import type { Campaign, MediaItem, PaceId } from '@/lib/social/types';
import {
  AlertCircleIcon,
  BoltIcon,
  CheckCircleIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  ClockIcon,
  CopyIcon,
  FlameIcon,
  GemIcon,
  MegaphoneIcon,
  MessageIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  TargetIcon,
  TrashIcon,
  TrophyIcon,
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
 *   ONE BUTTON ON A RUNNING CARD, AND NOTHING LOST. "עריכת קמפיין" is the
 *   reference's only action, and it is still the only one a RUNNING card
 *   draws. Everything else the foot row used to carry is reachable from ⋯ —
 *   פרטי הקמפיין, עצור, הוסף פוסט, תגובות, שכפל and מחק — one tap further
 *   away.
 *
 *   THE TWO THAT CAME BACK OUT OF THE MENU are המשך קמפיין and החזר
 *   לפעילות: "למה במסך קמפיינים אין כפתור להדלקת קמפיינים." They are drawn
 *   only on a card that is not running, so the reference's card is untouched,
 *   and the menu drops the row the button draws — one control per view.
 *
 * NO HANDLER, href, CONDITION OR DERIVATION BELOW IS NEW. `runBadge`,
 * `runProgress`, `canPauseRun`, `canResumeRun`, `scheduleReadout` and every
 * `on*` prop are the ones this card already had; what moved is where they are
 * drawn. "אסור לפגוע בפונקציות שכבר עובדות."
 */
/**
 * ─────────────────────────────────────────────────────────────────────────
 * A CAMPAIGN'S OWN COLOUR — "לכל קמפיין יהיה צבע זיהוי קבוע משלו."
 *
 * Eight hues, every one of them measured over 4.5:1 on this theme's white
 * card so the chip's label, the edit button's text and the icons are all
 * readable rather than merely coloured. The first two are the reference's
 * own: blue for the first campaign, violet for the second.
 *
 * ─── WHY THE NUMBER IS THE CREATION ORDER AND NOT THE PLACE IN THE LIST ──
 *
 *   "אין לשנות צבע של קמפיין לאחר שנוצר, גם לאחר רענון או כניסה מחדש."
 *
 * The campaigns page does NOT list cards in creation order — it sorts by
 * what is running and then by what publishes soonest (campaigns/page.tsx),
 * so a card's PLACE changes as the day goes on. Numbering by place would
 * therefore repaint a campaign while the owner watched it, which is the one
 * thing this rule forbids. Numbering by `created_at` ascending does not: the
 * oldest campaign is #1 for as long as it exists, through every refresh,
 * every re-login and every re-sort.
 *
 * THE ONE EVENT THAT CAN MOVE IT, said out loud rather than buried: deleting
 * a campaign is a hard DELETE (client.ts deleteCampaign), so removing an
 * OLDER campaign shifts the ones after it up by one. Nothing in the schema
 * can be read to avoid that without storing a number per campaign, and the
 * brief forbids changing the database. Creating a campaign — the common
 * event — never moves anybody, because a new row sorts last.
 */
export type CampaignIdentity = {
  /** The strong colour: chip fill, selected controls, edit label, icons. */
  ink: string;
  /** The chip's gradient end, a step deeper than `ink`. */
  deep: string;
  /** The hairline round the card — the identity, washed out. */
  line: string;
  /** The bloom outside the card, and the wash behind a soft control. */
  glow: string;
  /** The mark on the number chip, so two cards differ by shape and not only by hue. */
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
};

export const CAMPAIGN_IDENTITIES: CampaignIdentity[] = [
  { ink: '#0B63CE', deep: '#0A47B8', line: '#7FB6F2', glow: 'rgba(11,99,206,0.20)', Icon: MegaphoneIcon },
  { ink: '#8B2FC9', deep: '#6D21A6', line: '#C396E8', glow: 'rgba(139,47,201,0.20)', Icon: RocketIcon },
  { ink: '#0E7490', deep: '#0B5C73', line: '#7CC3D6', glow: 'rgba(14,116,144,0.20)', Icon: SparklesIcon },
  { ink: '#15803D', deep: '#116532', line: '#86CFA2', glow: 'rgba(21,128,61,0.20)', Icon: TargetIcon },
  { ink: '#B45309', deep: '#8F4208', line: '#E6B37A', glow: 'rgba(180,83,9,0.20)', Icon: FlameIcon },
  { ink: '#BE123C', deep: '#9A0F31', line: '#EC9BB0', glow: 'rgba(190,18,60,0.20)', Icon: GemIcon },
  { ink: '#4338CA', deep: '#362DA3', line: '#A5A0EB', glow: 'rgba(67,56,202,0.20)', Icon: TrophyIcon },
  { ink: '#A21CAF', deep: '#82168C', line: '#DD93E4', glow: 'rgba(162,28,175,0.20)', Icon: StarIcon },
];

/** The identity of the campaign numbered `ordinal` (1-based). */
export function campaignIdentity(ordinal: number): CampaignIdentity {
  const n = Number.isFinite(ordinal) && ordinal > 0 ? Math.floor(ordinal) : 1;
  return CAMPAIGN_IDENTITIES[(n - 1) % CAMPAIGN_IDENTITIES.length];
}

/**
 * id -> "קמפיין #N", by creation order, oldest first.
 *
 * Handed the WHOLE list rather than the filtered view on purpose: a campaign
 * must keep its number when the owner taps "פעילים" and half the cards leave
 * the screen. `created_at` ties are broken by id so the map is a function of
 * the data and not of the order the rows happened to arrive in.
 */
export function campaignOrdinals(list: { id: string; created_at: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  [...list]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .forEach((c, i) => {
      out[c.id] = i + 1;
    });
  return out;
}

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
  pace,
  onPaceChange,
  floorHours,
  scheduleBusy = false,
  ordinal = 1,
  defaultOpen = true,
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
  /* סבבים ביום — pass both or neither, like the repeat above. */
  /**
   * The account-wide spacing rule, which the card cannot see from the campaign
   * alone — rules.ts holds a row for the later of this and the campaign's own
   * gap, so a card without it prints a minute the engine will not publish at.
   * Optional: a caller that cannot supply it gets the behaviour this card had
   * before, which is wrong in the same way it has always been wrong rather
   * than newly wrong.
   */
  spacing?: AccountSpacing;
  /** Writes the ACCOUNT's gap — the only one the engine enforces. Without it
      this card shows the account's number and writes the campaign's, which is
      the two screens disagreeing. See the panel's prop of the same name. */
  /**
   * מצב פרסום חכם — which publishing mode the ACCOUNT is on, and the handler
   * that changes it. Straight through to CampaignSchedulePanel, which
   * explains at length what field this replaced and why the mode writes the
   * account's own gap rather than the campaign's column.
   */
  pace?: PaceId | null;
  onPaceChange?: (id: PaceId) => void;
  /** How close two publications of one post to one group may be, in hours —
      the account's setting, defaulted by the panel when absent. */
  floorHours?: number;
  /** The campaign's row is being written; the panel's controls hold still. */
  scheduleBusy?: boolean;
  /**
   * WHICH CAMPAIGN THIS IS — "קמפיין #1" — and therefore which colour it
   * wears. 1-based, by creation order; see campaignOrdinals() above. It is a
   * prop rather than something the card works out because only the page holds
   * the whole list, and a card that numbered itself from the rows it happens
   * to be shown would renumber every time a filter was tapped.
   */
  ordinal?: number;
  /**
   * Whether the card starts open. The page opens the first card and leaves
   * the rest shut, which is the reference's own arrangement — one card with
   * its controls out, the others as summaries.
   */
  defaultOpen?: boolean;
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

  /*
   * ─── TURNING A CAMPAIGN BACK ON, AS A BUTTON ON THE CARD ───────────────
   *
   * "למה במסך קמפיינים אין כפתור להדלקת קמפיינים."
   *
   * Because it was in the ⋯ menu, which is where everything the reference
   * image does not draw went. That was the right call for שכפל and מחק and
   * the wrong one for this: it is the only control on the card that answers
   * the question the card itself raises. A badge reading "נעצר" over no way
   * to un-stop it is a screen that reports a problem and withholds the
   * remedy, and the owner read it exactly that way.
   *
   * TWO STATES, ONE SLOT, AND THEY CANNOT BOTH BE TRUE. A paused run has its
   * queue intact — plan.ts sweeps only ARCHIVED campaigns, "which is exactly
   * what lets המשך resume it" — so resuming is a flag flip and the rows go
   * out. A run that is OVER has nothing left to resume, so `onReopen` is a
   * different promise and the page says so when it lands. canResumeRun is
   * false for both of the states that pass onReopen, so the branch below is a
   * choice between two mutually exclusive facts rather than a preference.
   *
   * "OVER" IS TWO THINGS, AND THE PAGE DECIDES WHICH QUALIFY. It used to be
   * the archived ones alone, and that is the whole of "אצל הלקוח שלי אין
   * האופציה להחזיר פעילות, אצלי כן": a round he had stopped by hand offered
   * the button, a round that simply ran out of rows did not, and both read
   * "הסתיימו" on the same tab. The card does not re-derive that rule — it
   * draws the action when it is handed one, which is how a control that
   * cannot act stays off the card at all.
   *
   * STOPPING STAYS IN THE MENU. The reference draws one action at the foot of
   * a running card and that is still what a running card has; what is added
   * here appears only on a card that is not running, which is the card that
   * had nothing to offer.
   */
  const turnOn: { label: string; icon: React.ReactNode; onSelect: () => void } | null =
    showResume && onResume
      ? { label: 'המשך קמפיין', icon: <PlayIcon aria-hidden className="h-4 w-4" />, onSelect: onResume }
      : onReopen
        ? { label: 'החזר לפעילות', icon: <RepeatIcon aria-hidden className="h-4 w-4" />, onSelect: onReopen }
        : null;
  const view = runProgress(state.progress, state.todayOnly, state.truncated);
  /*
   * THE SAME PAIR OF NUMBERS THE DASHBOARD HERO NOW LEADS WITH, and it is
   * here so the two screens cannot answer "how far along is this" in two
   * different units one tap apart — the fault he reported twice already
   * ("לא מסונכרן בין מסך פרסום קמפיינים לבין המסך הראשי").
   *
   * The three counters below stay PUBLICATIONS, which is what they have
   * always been and what their own words say. This line is GROUPS, and says
   * so in the sentence itself.
   */
  const groups = groupProgress(state);
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
   * ─── THE CARD'S OWN COLOUR, AND WHETHER IT IS OPEN ──────────────────────
   *
   * Both are display state and nothing else: `open` draws or hides blocks
   * that are already rendered from the same props, and nothing in this file
   * reads it before deciding what to fetch, write or publish. "אין לאפס
   * נתונים או להפעיל פעולות פרסום בעת פתיחה וסגירה" — a toggle here cannot,
   * because there is no handler behind it.
   */
  const id = campaignIdentity(ordinal);
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

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
    /* `!turnOn` ON BOTH ROWS THE BUTTON CAN DRAW — the same gate the tuner
       row carries, for the same reason: one control per view. It reads as a
       tautology beside the definition above, and it is the line that stays
       correct if the button is ever gated more narrowly. */
    ...(!turnOn && showResume && onResume ? [{ label: 'המשך קמפיין', icon: <PlayIcon className="h-4 w-4" />, onSelect: onResume }] : []),
    ...(addPostHref ? [{ label: 'הוסף פוסט', icon: <PlusIcon className="h-4 w-4" />, onSelect: () => { window.location.href = addPostHref; } }] : []),
    /* UNCONDITIONAL NOW. It used to appear only on a card with no schedule
       panel, because the panel carried a visible button of its own; that
       button is gone, so without this the queue tuner would be reachable from
       no campaign card at all. Removing a row is not the same as removing a
       tool. */
    ...(onTune ? [{ label: 'הגדרות תור מתקדמות', icon: <RepeatIcon className="h-4 w-4" />, onSelect: onTune }] : []),
    ...(onComment ? [{ label: 'תגובה לפרסומים', icon: <MessageIcon className="h-4 w-4" />, onSelect: onComment }] : []),
    ...(onDuplicate ? [{ label: 'שכפל קמפיין', icon: <CopyIcon className="h-4 w-4" />, onSelect: onDuplicate }] : []),
    ...(!turnOn && onReopen ? [{ label: 'החזר לפעילות', icon: <RepeatIcon className="h-4 w-4" />, onSelect: onReopen }] : []),
    ...(onDelete ? [{ label: 'מחק קמפיין', icon: <TrashIcon className="h-4 w-4" />, onSelect: onDelete, danger: true }] : []),
  ];

  return (
    /* The radius is the reference's and it is written here rather than pushed
       into --radius-card: that token is every card in the product. */
    <div
      className="relative overflow-hidden rounded-[20px] border bg-ink-850 p-2.5"
      style={{ borderColor: id.line, boxShadow: `0 10px 26px -14px ${id.glow}` }}
    >
      {/*
        ─── THE CORNER THE CAMPAIGN IS RECOGNISED BY ───────────────────────

        "להשתמש בצבע הזיהוי במסגרת, בפינה העליונה, בתג מספר הקמפיין ובהדגשות."

        A swoosh welded into the card's TOP-END corner — the left one on this
        RTL page, which is where the reference draws it and where the picture
        sits, so the colour reads as a ribbon the artwork is pinned to rather
        than as a sticker in an empty corner. `end-0` and not `left-0`: the
        corner is the END corner, and an LTR locale would mirror it without
        this file knowing which side that is.

        It is clipped by the card's own `overflow-hidden`, so it takes the
        card's 20px radius for free and needs no rounding of its own. Two
        waves, not one: the second is the same path at a third of the opacity,
        a little wider, which is the pale trailing band the reference has.

        pointer-events-none and aria-hidden: it is paint. Nothing on this card
        may become harder to tap because of it.
      */}
      <span aria-hidden className="pointer-events-none absolute end-0 top-0 h-[104px] w-[112px] overflow-hidden">
        <svg viewBox="0 0 112 104" className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`${panelId}-sweep`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={id.ink} />
              <stop offset="100%" stopColor={id.deep} />
            </linearGradient>
          </defs>
          <path d="M0,0 L112,0 C78,14 34,34 18,104 L0,104 Z" fill={`url(#${panelId}-sweep)`} opacity="0.32" />
          <path d="M0,0 L84,0 C54,12 22,28 10,78 L0,78 Z" fill={`url(#${panelId}-sweep)`} />
        </svg>
      </span>
      <div className="relative">
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
            {/*
              ─── THE ⋯, AND IT WAS NOT BORDERED ───────────────────────────
              *
              * The comment here used to read "the reference's square ⋯,
              * bordered like the controls it holds" — and the class list
              * carried no border at all, so it never was. OverflowMenu's own
              * classes (ui.tsx) give it `text-mist-500` and no box, which
              * left an 18×21px grey ellipsis glyph, measured at 4.97:1, as the
              * ONLY affordance for every action on this card: stop, duplicate,
              * add a post, comment, the queue tuner — and delete.
              *
              * THAT IS WHY THE OWNER COULD NOT FIND THE DELETE. He reported
              * "תוסיף אופציה למחוק קמפיין מהעמוד הזה" about a screen that has
              * offered it for a long time. A browser measurement settled where
              * the fault was and it was not where I guessed: the sheet opens
              * fine, nothing inside it scrolls, and 'מחק קמפיין' sits 101px
              * ABOVE the fold at his tablet width. The menu was never hard to
              * read. It was hard to SEE there was a menu.
              *
              * So the comment's own claim is now true. The box is the one the
              * counters and the readouts on this card wear, and the glyph is
              * mist-300 rather than fine-print mist-500.
              *
              * `!rounded-xl` because the component's own `rounded-full` is a
              * one-class radius utility in the same layer and the later-emitted
              * one would otherwise decide. The height is left to the component
              * — it asks for h-11 and wins, so this is a 44px target and the
              * `h-10` the card used to pass never applied. Not worth an `!`:
              * 44 is over the 40px floor, and the measured suite checks the
              * number rather than the intention.
              */}
            <OverflowMenu
              label={`עוד פעולות ל${campaign.name}`}
              actions={menu}
              className="-ms-1 -mt-1 shrink-0 !rounded-xl border border-ink-600 bg-ink-900 !text-mist-300"
            />
            {/*
              A 20px LINE IS NOT A TARGET, and this card learned that once
              already: compacting the title took the primary way into a
              campaign down to twenty pixels and nothing in the suite said so.
              The name carries its own target — drawn at 18px, 44px to a thumb,
              over the padding above and the date below, neither of which is a
              control. Measured, not asserted from the class.
            */}
            {/*
              ─── OPEN AND SHUT ────────────────────────────────────────────

              "להוסיף אפשרות לפתיחה וסגירה של פרטי הקמפיין."

              Beside the ⋯ rather than across the card, because the two are
              the same kind of thing — what this card can do to itself — and
              because a bar spanning the foot is a second full-width control
              competing with "עריכת קמפיין". It carries aria-expanded and
              aria-controls, so the state is announced rather than inferred
              from a rotating glyph.
            */}
            <button
              type="button"
              data-card-toggle
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={open ? `סגור את פרטי ${campaign.name}` : `פתח את פרטי ${campaign.name}`}
              className="grid h-11 w-11 shrink-0 -mt-1 -me-1 place-items-center rounded-xl border border-ink-600 bg-ink-900 text-mist-300 transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <ChevronDownIcon aria-hidden className={`h-5 w-5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            <Link
              href={link}
              className="relative mt-0.5 min-w-0 grow rounded-lg after:absolute after:inset-x-0 after:-inset-y-3 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <span dir="auto" className="block truncate text-[18px] font-extrabold leading-6 text-mist-100">
                {campaign.name}
              </span>
            </Link>
          </div>

          {/*
            ─── THE DATE AND "קמפיין #N", ON ONE LINE UNDER THE NAME ───────

            The reference puts the chip beside the title. This card cannot:
            the title row already carries ⋯ AND the open/shut chevron, and
            measured at 390px those two plus an 90px chip left the name 58px
            — "סבב..." for a campaign called "סבב פרסום". The reference's own
            second card shows the chip on its own line for exactly this
            reason, so the arrangement is the image's and not an invention.
            The name gets the full width it is the point of.
          */}
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {/* The date, which is what tells two runs of the same name apart. */}
            <p className="shrink-0 text-[11px] font-semibold leading-4 text-mist-500">{ltr(formatDayMonthHe(campaign.created_at))}</p>
            {/*
              The mark differs per identity as well as the hue, so two cards
              are told apart by SHAPE too — which is what makes them work for
              a reader who cannot separate blue from violet.
            */}
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-on-brand"
              style={{ backgroundImage: `linear-gradient(90deg, ${id.ink}, ${id.deep})` }}
            >
              <id.Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              קמפיין #{ordinal}
            </span>
          </div>

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
            <Stat tone="good" value={published} label="פורסמו" icon={<CheckCircleIcon aria-hidden className="h-4 w-4 shrink-0 text-success-400" />} />
            {/* openRows(): scheduled + running + manual — everything that has
                not ended yet. It is the number that answers "is this still
                going to publish?", which is the question the card exists for. */}
            <Stat tone="brand" value={view.open} label="ממתינים" icon={<ClockIcon aria-hidden className="h-4 w-4 shrink-0 text-brand-400" />} />
            <Stat tone="bad" value={failed} label="נכשלו" icon={<AlertCircleIcon aria-hidden className="h-4 w-4 shrink-0 text-error-400" />} />
          </div>
          {/* "פורסם ל-204 מתוך 252 קבוצות" — the denominator a customer
              actually reads the card for. Hidden when there is no group count
              to print, rather than rendered as 0 of 0. */}
          {groups.usable && <p className="mt-1.5 text-[11px] font-bold leading-4 text-mist-500">{groups.label}</p>}
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
        ─── 2b. "המשך קמפיין" / "החזר לפעילות" ────────────────────────────

        IT SAT AT THE FOOT, AND THAT IS WHERE IT WAS NOT FOUND.

        "רשום לי נעצר, איך אני מחזיר לפעילות?" — asked while looking at the
        "הפרסום הבא" block, which says in so many words "לא יֵצאו פרסומים עד
        שתחזירו אותו לפעילות". The button that does it was three blocks
        further down: past the daily-repeat row and its amber paragraph, past
        "הגדרות תור מתקדמות", at the bottom of a card that is nine hundred
        pixels tall. A screen that names the remedy and then hides it below
        the fold is the overflow menu again with extra steps.

        So it is directly under the counters now, which is the first thing
        below the numbers on a card that is not running — and ABOVE the
        scheduling block, because days and hours are the one thing on this
        card that cannot matter while the campaign is stopped.

        OUTSIDE the panel fragment deliberately: a card with no scheduling
        block is still a card whose campaign can be stopped, and that is the
        narrowest card in the product — the one place this control is most
        needed and would have been easiest to leave out.

        `busy` IS WIRED HERE, AND IT WAS DEAD. The prop has been declared and
        handed in by the campaigns page since the card was built and read by
        nothing; the page's act() writes, toasts and then re-reads eight
        queries before it clears, so this is a second of a card showing the
        old state. In a menu that cost a double entry nobody saw. As the
        card's own button it would be a second press, a second write and a
        second line in the activity log.
      */}
      {/*
        ─── THE SHUT CARD'S ONE LINE ──────────────────────────────────────

        The reference's second card: the header, the counters, and a single
        strip saying when it runs, how fast, and whether it repeats. Three
        READINGS and no controls — a switch that changes a campaign's repeat
        while the card claims to be only a summary is the kind of tap nobody
        means to make. Everything that can act lives behind the chevron.

        "כל היום" is literal rather than decorative: a schedule has no closing
        hour any more (campaign-schedule.ts), so a day that opens at midnight
        is open all of it. Any other hour is printed as the hour it is.
      */}
      {!open && (schedule || pace || repeat) && (
        <div
          className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-2xl border p-1.5"
          style={{ borderColor: `${id.line}66` }}
        >
          {schedule && (
            <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-ink-700 bg-ink-900 px-2 text-[11px] font-bold text-mist-100">
              <CalendarIcon aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: id.ink }} />
              {schedule.start === '00:00' ? 'כל היום' : ltr(schedule.start)}
            </span>
          )}
          {paceProfile(pace)?.label && (
            <span
              className="inline-flex min-h-8 items-center gap-1 rounded-full border bg-ink-900 px-2 text-[11px] font-extrabold"
              style={{ borderColor: id.line, color: id.ink }}
            >
              <BoltIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              {paceProfile(pace)?.label}
            </span>
          )}
          {repeat && (
            <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-ink-700 bg-ink-900 px-2 text-[11px] font-bold text-mist-100">
              <RepeatIcon aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: id.ink }} />
              חזרה יומית
              <span className={`ms-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${repeat.enabled ? 'bg-success-400/12 text-success-400' : 'bg-ink-800 text-mist-500'}`}>
                {repeat.enabled ? 'פעילה' : 'כבויה'}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Everything that can ACT, behind the chevron. Unmounted rather than
          hidden: a control nobody can see must also be one nobody can tab
          into, and `hidden` leaves it in the tab order on every browser this
          product has been measured in. */}
      <div id={panelId} className={open ? 'card-open' : 'hidden'}>
      {turnOn && (
        /*
         * THE FILLED ONE, AND IT TAKES THAT FROM "עריכת קמפיין" BELOW.
         *
         * The card's rule is one filled action, and the reference draws it as
         * the editor — on a card that is RUNNING, where editing is the only
         * thing left to do. On a card that is stopped or paused the useful
         * action is the one that undoes that. The rule is kept and the
         * identity of the primary follows the state: exactly one filled
         * button either way.
         */
        <Button
          size="md"
          busy={busy}
          onClick={turnOn.onSelect}
          className="mt-2.5 h-12 w-full !min-h-12 justify-center gap-2 !rounded-2xl !text-[14px]"
        >
          {turnOn.icon}
          {turnOn.label}
        </Button>
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
            compact
            schedule={schedule}
            onChange={onScheduleChange}
            repeat={repeat}
            onRepeatChange={onRepeatChange}
            campaignName={campaign.name}
            disabled={scheduleBusy}
            busy={scheduleBusy}
            accountFloorSeconds={spacing ? accountGapSeconds(spacing, spacing, true) : undefined}
            pace={pace}
            onPaceChange={onPaceChange}
            /* The account's own repeat floor, so the card judges the rounds
               against the number in Settings rather than a constant. */
            floorHours={floorHours}
            /* Neither control in the panel can produce a publication until
               the round is launched once — and "once" is a question about the
               round's whole life, not about today's counter. See campaign.ts. */
            neverLaunched={neverLaunched(state)}
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

            AND THEN HE ASKED FOR IT BACK OFF: "תמחק את הגדרות התור
            המתקדמות", 02.11.2026. The paragraph above is kept because it is
            why the tuner is reachable from this screen at all — the later
            instruction decides WHERE, not whether. It is a ⋯ entry now,
            unconditional, and the note below says so.
          */}
          {/*
            "הגדרות תור מתקדמות" IS GONE FROM THIS CARD — the owner asked for
            it: "תמחק את הגדרות התור המתקדמות".
            The queue tuner itself is NOT deleted. It is a real tool — it is
            what re-spaces a live queue — so it moved to the ⋯ menu rather
            than being destroyed, and it is still offered from the publish
            sheet the moment a launch queues rows. What the owner wanted back
            is the ROW it was taking at the foot of a card that is already
            nine hundred pixels tall.
          */}
        </>
      )}

      {/*
        ─── 4. "עריכת קמפיין" ─────────────────────────────────────────────

        The reference's one action, full width across the card's foot. It opens
        the POST — see the note on `editHref`. A card with no editor to open
        falls back to the campaign itself rather than drawing a dead button or
        leaving the foot empty.
      */}
      {/*
        ─── 5. AND A WAY TO DELETE THE THING, ON THE CARD ──────────────────

        "תוסיף אופציה למחוק קמפיין מהעמוד הזה." — the owner, with a screenshot
        of this very screen, 25 finished campaigns on it.

        IT WAS ALREADY THERE AND THAT IS THE POINT. 'מחק קמפיין' has been the
        last entry of the ⋯ sheet for a long time, and campaigns/page.tsx hands
        every card an onDelete. He looked at the screen and reported the
        feature missing — which is the same report he made about סבבים ביום an
        hour earlier, and the same cause: a control he is meant to find, behind
        a tap he has no reason to take. The menu entry stays (it is where the
        rest of the card's actions live, and other screens rely on it); this is
        the one that is visible without opening anything.

        AND IT COSTS NO HEIGHT. He asked me to take a full-width row OFF these
        cards an hour ago — "תמחק את הגדרות התור המתקדמות" — so putting one
        back would be answering one request by undoing another. The trash
        shares the row the card already ends with: the editor grows to fill
        what is left, and the card is exactly as tall as it was. Measured in
        campaign-card.test.ts, which fails if that stops being true.

        ICON ONLY, AND SAFE BECAUSE OF WHAT IT OPENS. It does not delete. It
        asks removeCampaign()'s confirmation, which counts the publications
        that have not gone out yet and says so before anything is written —
        and the delete itself leaves every post and every published row
        standing, because both foreign keys are `on delete set null`
        (social-schema.sql:124, social-schema-v2.sql:46). "אסור למחוק מידע"
        survives this button.
      */}
      <div className="mt-2.5 flex items-stretch gap-2">
        {/*
          THE SOFT BUTTON THE REFERENCE DRAWS, in the campaign's own colour.

          Not the product's filled primary: the image's edit button is a pale
          wash with a coloured hairline and coloured bold text, which is what
          lets the FILLED control on the card stay the one that matters — the
          pace tile that is selected. `variant="secondary"` keeps ButtonLink's
          focus ring, its 48px height and its disabled behaviour; only the
          three colours are the identity's, and they are inline because a
          campaign's hue is data and Tailwind cannot generate a class per row.
        */}
        <ButtonLink
          href={editHref ?? link}
          size="md"
          variant="secondary"
          className="h-11 grow !min-h-11 !rounded-2xl justify-center gap-2 !text-[13px] !font-extrabold"
          style={{ backgroundColor: `${id.ink}14`, borderColor: `${id.ink}59`, color: id.ink }}
        >
          <PencilIcon aria-hidden className="h-4 w-4" />
          {editHref ? 'עריכת קמפיין' : 'פתח קמפיין'}
        </ButtonLink>
        {onDelete && (
          /*
           * NAMED AFTER THE CAMPAIGN IT WOULD DELETE. A screen reader on a
           * list of twenty-six cards reads twenty-six buttons called "מחק",
           * and the one thing the owner needs to know before pressing is
           * WHICH. The visible label is the icon; the accessible one carries
           * the name.
           */
          <button
            type="button"
            /* campaign.name, NOT `name`. Written as a bare `name` first, and
               it typechecked: in a .tsx with the DOM lib in scope that
               resolves to window.name, a string, so every card would have
               announced 'מחק את הקמפיין ""' and tsc would never have said a
               word. unit.test.ts pins the campaign's own name here. */
            aria-label={`מחק את הקמפיין "${campaign.name}"`}
            disabled={busy}
            onClick={onDelete}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-[1.5px] border-error-400/60 bg-ink-850 text-error-400 transition-colors hover:bg-error-300/12 disabled:pointer-events-none disabled:text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
          >
            <TrashIcon aria-hidden className="h-4.5 w-4.5" />
          </button>
        )}
      </div>
      </div>
      </div>
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
const STAT_SKIN: Record<'good' | 'brand' | 'bad', string> = {
  good: 'border-success-400/25 bg-gradient-to-b from-ink-850 to-success-400/[0.10]',
  brand: 'border-brand-500/25 bg-gradient-to-b from-ink-850 to-brand-500/[0.10]',
  bad: 'border-error-300/25 bg-gradient-to-b from-ink-850 to-error-300/[0.10]',
};

function Stat({ value, label, icon, tone }: { value: number; label: string; icon: React.ReactNode; tone: 'good' | 'brand' | 'bad' }) {
  return (
    <div className={`rounded-[14px] border px-1 py-1.5 text-center ${STAT_SKIN[tone]}`}>
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
      <span data-must-fit dir="auto" className="block truncate text-[10px] font-bold leading-4 text-mist-300">{label}</span>
    </div>
  );
}

/** Same rule as the library card: the first IMAGE, and failing that whatever
    media exists — picking media[0] blindly leaves a post whose first item is a
    video looking different here than it does in the library. */
function cover(media?: MediaItem[] | null): MediaItem | null {
  return (media ?? []).find((m) => m.kind === 'image') ?? (media ?? [])[0] ?? null;
}
