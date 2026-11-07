'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { ClockIcon, PlusIcon, SearchIcon, SpinnerIcon, TrashIcon } from '@/components/icons';
import {
  addTargetsToQueue,
  countPublishedSince,
  getBrowserSettings,
  getCampaign,
  matchAccountGapTo,
  getLimits,
  listTargets,
  lastPublishedAt,
  liveQueuePlan,
  removeTargetFromQueue,
  respaceQueue,
  saveCampaignSchedule,
  type LiveQueuePlan,
} from '@/lib/social/client';
import { friendlyMessage } from '@/lib/social/errors';
import { accountFloorMs, spacingFrom, windowedCascade } from '@/lib/social/projection';
import { readSchedule, gapMinutesFor, type CampaignSchedule, MIN_GAP_SECONDS, gapChoiceLabel } from '@/lib/social/campaign-schedule';
import { agree, counted, formatDayMonthHe, formatInstantHe, startOfZonedDay, zonedDateISO } from '@/lib/social/time';
import type { BrowserSettings, Campaign, LimitsSettings, SocialTarget } from '@/lib/social/types';
import { TargetAvatar } from './TargetAvatar';
import { Button, EmptyState, Field, IconButton, inputClass, Loading, Notice, Sheet, useConfirm, useToast } from './ui';

/**
 * The control room for the queue that is already running.
 *
 * Opened from the dashboard's "הפרסום הבא בעוד 00:20" panel, so everything in
 * it is about publications that already exist: how far apart they are, which
 * groups are still waiting, and which groups should join. Nothing here is an
 * estimate dressed up as a fact — every figure comes from liveQueuePlan() or
 * from the owner's own saved settings, and where a real number is unknown the
 * line is simply not drawn.
 *
 * THE ONE NUMBER — why the sheet edits the *effective* gap and not a setting.
 *
 * src/lib/social/rules.ts defers a publication while
 *   now - lastPublishedAt < (limits.minGapMinutes + extra) * 60s
 * with `extra` = browser.groupMinGapMinutes for a facebook_group target. So a
 * queue whose rows sit 10 minutes apart is not a queue that publishes every 10
 * minutes: every row arrives early, is deferred, burns an attempt, and after 40
 * attempts is skipped outright. Re-spacing rows without moving the settings is
 * therefore inert — which is exactly the failure this panel exists to end.
 *
 * The owner edits one number, the minutes they will actually see between two
 * posts, and respaceQueue() is responsible for leaving
 * limits.minGapMinutes + browser.groupMinGapMinutes equal to it. This file's
 * job is to say so honestly before they commit, and to show the second branch
 * of that split (see GAP_SPLIT_NOTE below) when their number is smaller than
 * the group surcharge they have configured.
 */

/* ------------------------------------------------------------- local bits */

/*
 * ─── WHAT WAS HERE: MinusIcon AND Stepper ────────────────────────────────
 *
 * The − / + buttons either side of the gap figure. Both existed for the gap
 * editor and for nothing else, and the gap editor was deleted on 07.11.2026:
 * "יש להסיר לחלוטין מהממשק את השדה הישן: הפרש בין פרסומים." מצב פרסום חכם is
 * where that number is chosen now, and a helper with no caller is a control
 * the next reader goes looking for.
 */


/**
 * A clock reading is digits around a colon inside an RTL sentence. The colon is
 * neutral, so the run is re-ordered whenever it sits next to another number —
 * "14:30 במקום 13:05" came out with the two swapped. An LTR island fixes the
 * order without turning the sentence around it.
 */
function Clock({ iso, withDay = false }: { iso: string; withDay?: boolean }) {
  return (
    <span dir="ltr" className="inline-block tabular-nums font-bold">
      {withDay ? `${formatDayMonthHe(iso)} ${formatInstantHe(iso)}` : formatInstantHe(iso)}
    </span>
  );
}

/** Same trick for a bare count that lands between two Hebrew words. */
function Num({ children }: { children: number }) {
  return (
    <span dir="ltr" className="inline-block tabular-nums font-bold">
      {children}
    </span>
  );
}

/** One of the three figures in the live summary. */
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-900 px-3 py-2.5">
      <p className="text-[11px] font-bold text-mist-500">{label}</p>
      <p className="mt-0.5 text-base font-extrabold leading-tight text-mist-100">{children}</p>
    </div>
  );
}


/*
 * The two counted nouns this sheet keeps repeating. Hebrew gives one a
 * singular and two a dual, and a fixed plural beside an interpolated number
 * produced "1 פרסומים הוסרו מהתור." on the single-group removal the owner
 * uses most.
 */
const posts = (n: number) => counted(n, 'פרסום אחד', 'פרסומים', 'שני פרסומים');
/* `minutes()` lived here and spelled this sheet's one number as minutes. It
   is gone with the labels that used it: the value is seconds and has been
   since the sub-minute gaps shipped, and gapChoiceLabel() is the product's
   single spelling of it. */

/*
 * SECONDS, like the campaign panel — so the two editors of ONE record cannot
 * drift apart.
 *
 * This sheet was whole minutes on the write AND on the preview, and its own
 * anti-ratchet guard meant no value of `gap` could ever WRITE thirty seconds:
 * it could only preserve a thirty set elsewhere, or raise it to a whole
 * minute. One save from this screen undid a thirty-second campaign.
 */
const MIN_GAP = MIN_GAP_SECONDS;
const MAX_GAP = 720 * 60;

/**
 * ─── A BUTTON IN THIS SHEET ENDS, ALWAYS ────────────────────────────────
 *
 * "אני רוצה אחרי שאני לוחץ שינוי בקמפיין זה מייד שומר ולא טוען מסך בלי סוף."
 *
 * Every mutation here is a chain of requests, and supabase-js sets no timeout
 * on any of them: one connection that dies mid-flight on a phone moving
 * between cells never settles, the await never returns, and the spinner stays
 * until the app is closed. The writes themselves now carry their own stall
 * guard (client.ts), but the reads around them do not, and neither does
 * anything added here later — so the ceiling is put on the whole mutation,
 * once, where no future caller can forget it.
 *
 * Ninety seconds: longer than the slowest honest run this sheet has (a
 * five-hundred-row re-space over a bad connection), short enough to be an
 * answer rather than a wait. The work is NOT cancelled — a half-written queue
 * is worse than a slow one — so the sentence says what is true: it was sent,
 * we stopped waiting, look at the list. The reload that follows every failure
 * here shows what actually landed.
 */
const SHEET_DEADLINE_MS = 90_000;

/**
 * AND IT SAYS HOW FAR IT GOT, because it knows.
 *
 * The re-stamp already reports every row it writes — the sheet draws
 * "מעדכן… 47 מתוך 218" from it. When the deadline then fired, the message
 * threw that number away and said "check the list below, and if nothing
 * changed, try again": the owner was asked to go and work out by hand
 * something the screen had been counting a second earlier.
 *
 * The three answers are genuinely different and he has to act differently on
 * each, so they are three sentences. All of them are counts of rows the
 * database acknowledged, never an estimate.
 */
function withDeadline<T>(work: Promise<T>, soFar?: () => { done: number; total: number } | null): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bell = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const at = soFar?.() ?? null;
      if (at && at.total > 0 && at.done >= at.total) {
        /* Everything was acknowledged and the confirmation is what is late.
           Telling him to check whether anything changed would send him to
           verify work that is demonstrably finished. */
        reject(new Error(`כל ${at.total} הפרסומים עודכנו, אבל האישור הסופי לא חזר בזמן. התור למטה כבר מעודכן — אין צורך לנסות שוב.`));
        return;
      }
      if (at && at.done > 0) {
        reject(
          new Error(
            `עודכנו ${at.done} מתוך ${at.total} פרסומים והחיבור איטי מדי להספיק את השאר. מה שעודכן נשמר — אפשר ללחוץ שוב כדי להמשיך מהנקודה הזו.`,
          ),
        );
        return;
      }
      reject(new Error('השינוי נשלח, אבל לא קיבלנו אישור בזמן. בדקו ברשימה למטה מה נשמר — ואם לא השתנה כלום, נסו שוב.'));
    }, SHEET_DEADLINE_MS);
  });
  return Promise.race([work, bell]).finally(() => clearTimeout(timer));
}
/*
 * Thirty seconds, not one minute.
 *
 * The stepper moved in fives and the presets jumped 20 → 30 → 45, so 7 or 23
 * minutes were not reachable by any control on the screen — the owner asked
 * for exactly that. The presets stay for the big moves; these two buttons are
 * now the fine adjustment, and the figure between them can be typed into.
 */
/* STEP and PRESETS — the stepper's 30s increment and the six preset
   buttons — went with the gap editor on 07.11.2026. */
/** Anything longer than this and the list gets a search box instead of a scroll. */
const ADD_LIST_LIMIT = 30;

const sameLocalDay = (a: Date, b: Date) => zonedDateISO(a) === zonedDateISO(b);

interface Snapshot {
  plan: LiveQueuePlan;
  limits: LimitsSettings;
  browser: BrowserSettings;
  /**
   * THE WINDOW THE RESPACE WILL ROLL THESE ROWS INTO.
   *
   * respaceQueue() lays the queue out as `start + i × gap` and then moves every
   * row forward to the first instant its campaign permits (windowedCascade in
   * lib/social/projection.ts). This preview was the flat sequence alone, so
   * the sheet the dashboard opens TO FIX the times promised 06:25, 06:26,
   * 06:27 for a queue the write itself lands at 08:00, 08:01, 08:02 — the
   * preview disagreeing with the button under it.
   *
   * Null when this sheet is opened for the whole queue rather than one round:
   * the rows then belong to several campaigns with several windows, and the
   * honest preview is the one that applies none of them. The write still
   * applies each campaign's own.
   */
  window: CampaignSchedule | null;
  /** The campaign row this sheet is scoped to, for the write below. */
  campaign: Campaign | null;
  /** Real publications already out today, from countPublishedSince(). */
  publishedToday: number;
  /**
   * THE ACCOUNT'S OWN LAST PUBLICATION — the second floor this preview was
   * missing.
   *
   * rules.ts holds a row for the LATER of two intervals: the campaign's own
   * gap and `minGap + groupMinGap` across the whole account. This sheet
   * applied the first and not the second, so the "הפרסום הבא" it printed
   * could be up to an hour earlier than the one on the card that opened it —
   * two screens disagreeing about one row, which is the fault
   * "בעבר היו פערים בין השעות שהוצגו בכרטיס הקמפיין לבין השעות שהופיעו במסך
   *  ממתינים. אסור שהתקלה הזאת תחזור" names.
   *
   * Null when it cannot be read, which is what the preview assumed all along.
   */
  accountLastPublishedAt: string | null;
  /** The instant the snapshot was taken — keeps the preview from twitching. */
  at: number;
}

/* ------------------------------------------------------------- the sheet */

export function QueueTunerSheet({
  open,
  onClose,
  campaignId,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  campaignId?: string;
  onChanged?: () => void;
}): React.ReactElement | null {
  const toast = useToast();
  const confirm = useConfirm();

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [targets, setTargets] = useState<SocialTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** null · 'respace' · 'add' · `remove:<targetId>` */
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * How far the re-space has got, so the button counts instead of spinning.
   *
   * "הוא משנה אבל נתקע... לא טוען מסך בלי סוף." Every row in the queue is its
   * own request, so a long queue is genuinely many seconds of work — and a
   * spinner with nothing moving on it is indistinguishable from a hang. This
   * is the difference between the two, on screen.
   */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /* A REF BESIDE THE STATE. The deadline fires from a timer, outside React's
     render, so it would read whatever `progress` was closed over when the
     mutation started — which is always null. The ref is the only copy that is
     current at the instant the bell rings. */
  const progressRef = useRef<{ done: number; total: number } | null>(null);

  const [gap, setGap] = useState(0);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const scope = useMemo(() => (campaignId ? { campaignId } : undefined), [campaignId]);

  const load = useCallback(
    async (keepGapDraft: boolean) => {
      setError(null);
      try {
        const [plan, all, limits, browser, publishedToday, accountLast, campaign] = await Promise.all([
          liveQueuePlan(scope),
          listTargets(),
          getLimits(),
          getBrowserSettings(),
          countPublishedSince(startOfZonedDay(new Date()).toISOString()),
          /* Fails soft, like the campaign read below it: no account floor is
             the preview this sheet drew before, not a broken sheet. */
          lastPublishedAt().catch(() => null),
          /* One row, and only when this sheet is scoped to a round — see
             Snapshot.window. A failure here must not fail the sheet: no window
             means the preview is the flat sequence, which is what it was. */
          campaignId ? getCampaign(campaignId).catch(() => null) : Promise.resolve(null),
        ]);
        setSnap({
          plan,
          limits,
          browser,
          publishedToday,
          accountLastPublishedAt: accountLast,
          window: campaign ? readSchedule(campaign) : null,
          campaign,
          at: Date.now(),
        });
        setTargets(all);
        // The dashboard behind this sheet reloads every 30s and the countdown
        // re-renders every second; a draft the owner is in the middle of
        // setting must survive that, so it is only overwritten deliberately.
        if (!keepGapDraft) {
          /*
           * SEEDED FROM THE CAMPAIGN WHEN THIS SHEET IS ABOUT ONE.
           *
           * It read `plan.effectiveGapMinutes`, which is
           * `limits.minGapMinutes + browser.groupMinGapMinutes` — the ACCOUNT
           * floor, with no campaign input at all, even though the campaign row
           * was already in hand. So a round set to one minute on its own panel
           * opened this sheet showing the account's five, and pressing save
           * wrote five over it.
           */
          const own = campaign ? readSchedule(campaign) : null;
          setGap(own?.enabled ? own.gapSeconds : plan.effectiveGapSeconds);
        }
      } catch (err) {
        setError(friendlyMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [scope],
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setQuery('');
    setPicked([]);
    void load(false);
  }, [open, load]);

  const plan = snap?.plan ?? null;
  const rows = plan?.rows ?? [];

  /*
   * Where the re-spacing starts. Passed to respaceQueue() as `startAt` rather
   * than left to the API, so the times previewed below are the times that get
   * written — a preview computed from a different anchor than the mutation is
   * a lie with a countdown on it. A first row whose instant has already passed
   * is anchored at "now": the worker would claim it on its next tick anyway.
   */
  /*
   * `null` means "wherever the queue already starts". The owner can move it -
   * bringing a run forward is the thing they asked for most often, and the
   * only lever here used to be the gap, which stretches the tail without
   * touching the head.
   */
  const [startOverride, setStartOverride] = useState<number | null>(null);
  const naturalAnchor = useMemo(() => {
    if (!snap || rows.length === 0) return null;
    return Math.max(new Date(rows[0].scheduled_at).getTime(), snap.at);
  }, [snap, rows]);
  // Never into the past: the worker claims a due row on its next tick, so a
  // past instant is just "now" with a misleading label on it.
  const anchor = useMemo(() => {
    if (naturalAnchor === null) return null;
    if (startOverride === null) return naturalAnchor;
    return Math.max(startOverride, (snap?.at ?? Date.now()) + 60_000);
  }, [naturalAnchor, startOverride, snap]);
  const startDirty = startOverride !== null && anchor !== naturalAnchor;

  /*
   * THE PREVIEW IS THE WRITE'S OWN ARITHMETIC, not a second opinion about it.
   *
   * windowedCascade() is the function respaceQueue() calls, so what this sheet
   * draws and what the button under it does are the same instants by
   * construction. Computed for the whole queue at once because the cascade is
   * sequential — one row's instant is the floor of the next — and memoised on
   * the three things that move it.
   */
  const previewed = useMemo(() => {
    if (anchor === null || rows.length === 0) return [] as Date[];
    const bases = rows.map((_, i) => new Date(anchor + i * gap * 1000));
    return windowedCascade(bases, gap, snap?.window ?? null);
  }, [anchor, gap, rows.length, snap?.window]);

  const instantAt = useCallback(
    (i: number) => (anchor === null ? 0 : (previewed[i] ?? new Date(anchor + i * gap * 1000)).getTime()),
    [anchor, gap, previewed],
  );

  /*
   * WHERE THE QUEUE STANDS RIGHT NOW, projected — the "before" half of this
   * sheet, which has to be read in the same units as the "after" half beside
   * it. Both are windowedCascade over the campaign's own schedule; the only
   * difference is that this one starts from the stamps the rows already have.
   */
  const currentProjected = useMemo(() => {
    if (rows.length === 0) return [] as string[];
    /*
     * BOTH FLOORS, NOT ONE. `windowedCascade` applies the campaign's window
     * and its own gap; the account-wide interval — `minGap + groupMinGap`,
     * sixty-five minutes out of the box — is measured from the account's last
     * publication and is a separate gate that rules.ts takes the max of.
     *
     * This preview applied only the first, so the sheet the card opens could
     * promise an hour earlier than the card itself. accountFloorMs is the same
     * arithmetic projectOne() runs for every other screen; 'facebook_group'
     * because the surcharge exists for groups and this product publishes to
     * groups.
     */
    /*
     * accountFloorMs() RETURNS AN INSTANT, NOT A DURATION, and this line used
     * to add the account's last publication to it a second time.
     *
     *     last + gap  +  last   ≈  two epochs  ≈  14.08.2083
     *
     * Every figure in this sheet is raised to `floor`, so the whole "before"
     * column, the per-group chips and "האחרון בתור" all read a date in 2083
     * — on the one control in the product whose job is to re-time the queue.
     * It returns 0 when the account has never published, which Math.max
     * already handles, so there is nothing left to guard.
     */
    const accountFloor = snap
      ? accountFloorMs(spacingFrom(snap.limits, snap.browser, snap.accountLastPublishedAt), 'facebook_group')
      : 0;
    const floor = Math.max(snap?.at ?? Date.now(), accountFloor);
    const bases = rows.map((r) => new Date(Math.max(Date.parse(r.scheduled_at) || 0, floor)));
    return windowedCascade(bases, snap?.plan.effectiveGapSeconds ?? gap, snap?.window ?? null).map((d) => d.toISOString());
  }, [rows, snap, gap]);

  const currentLastISO = rows.length > 0 ? currentProjected[rows.length - 1] ?? rows[rows.length - 1].scheduled_at : null;

  /*
   * A STORED INSTANT → THE PROJECTED ONE, for the per-group chips.
   *
   * liveQueuePlan() hands each group its soonest row's raw `scheduled_at`, and
   * the rows above are the same rows in the same order — so the stamp is the
   * key. Falls back to the stamp itself for anything the map does not carry,
   * which is the behaviour this chip had before.
   */
  const projectedFor = useCallback(
    (iso: string) => {
      const i = rows.findIndex((r) => r.scheduled_at === iso);
      return i >= 0 ? currentProjected[i] ?? iso : iso;
    },
    [rows, currentProjected],
  );
  const nextLastISO = anchor !== null && rows.length > 0 ? new Date(instantAt(rows.length - 1)).toISOString() : null;

  /*
   * What the ceilings in the owner's own settings will really do to this queue
   * once it is spaced at `gap`. rules.ts SKIPS over a ceiling (it does not roll
   * the row to tomorrow), so the copy says skipped, not postponed.
   */
  const ceilings = useMemo(() => {
    if (!snap || anchor === null || rows.length === 0) return [] as string[];
    const { limits, browser, publishedToday, plan: p } = snap;
    const today = new Date(snap.at);
    const out: string[] = [];

    let landingToday = 0;
    let overPerTarget = 0;
    let campaignToday = 0;
    const perTargetDay = new Map<string, number>();

    rows.forEach((row, i) => {
      const at = new Date(instantAt(i));
      const key = `${row.target_id}|${zonedDateISO(at)}`;
      const n = (perTargetDay.get(key) ?? 0) + 1;
      perTargetDay.set(key, n);
      if (n > limits.maxPerTargetPerDay) overPerTarget += 1;
      if (sameLocalDay(at, today)) {
        landingToday += 1;
        if (row.campaign_id) campaignToday += 1;
      }
    });

    const remaining = Math.max(0, limits.maxPerDay - publishedToday);
    if (landingToday > remaining) {
      out.push(
        `בתקרה היומית שהגדרתם (${limits.maxPerDay} פרסומים ליום) נשארו היום ${remaining}, ובמרווח הזה ${landingToday} מהתור אמורים לצאת היום. מה שמעבר לתקרה יידחה למחר.`,
      );
    }
    if (overPerTarget > 0) {
      out.push(
        `${counted(overPerTarget, 'פרסום אחד בתור יגיע', 'פרסומים בתור יגיעו', 'שני פרסומים בתור יגיעו')} לאותה קבוצה באותו יום מעבר לתקרה שהגדרתם ליעד (${limits.maxPerTargetPerDay} ליום), ולכן ${agree(overPerTarget, 'יידחה', 'יידחו')} למחר.`,
      );
    }
    if (p.campaignId && campaignToday > browser.maxPerCampaignPerDay) {
      out.push(
        `לסבב הזה הגדרתם תקרה של ${browser.maxPerCampaignPerDay} פרסומים ביום, ובמרווח הזה ${campaignToday} מהם אמורים לצאת היום. העודף יידחה למחר.`,
      );
    }
    return out;
  }, [snap, anchor, rows, instantAt]);

  /*
   * What the split leaves in limits.minGapMinutes — the number that governs
   * every target that is NOT a plain facebook_group, because rules.ts adds the
   * surcharge only for that one channel.
   */
  /*
   * IN SECONDS, LIKE `gap` — it was read in MINUTES and subtracted from a
   * value in seconds.
   *
   * With the shipped 20-minute group surcharge, `surcharge` was 20 and `gap`
   * was 1200, so the note below could only fire for a gap under twenty
   * SECONDS — a value MIN_GAP (30) forbids. The warning that exists to tell
   * the owner his group surcharge is about to be rewritten was therefore
   * unreachable, and the "general gap" figure beside it was 1180 seconds of
   * nonsense.
   *
   * The seconds column wins when it is there and the minutes are the
   * fallback, which is the same preference splitAccountGap() uses on the
   * write side — so the number shown and the number saved are one number.
   */
  const surcharge = Number.isFinite(snap?.browser.groupMinGapSeconds)
    ? (snap?.browser.groupMinGapSeconds as number)
    : Math.max(0, snap?.browser.groupMinGapMinutes ?? 0) * 60;
  const nextGlobalGap = gap >= surcharge ? gap - surcharge : 0;

  /**
   * GAP_SPLIT_NOTE — the second branch of the split respaceQueue performs.
   * The straightforward rule keeps browser.groupMinGapMinutes where it is and
   * sets limits.minGapMinutes = gap - groupMinGapMinutes. That goes negative
   * once the owner asks for less than the group surcharge, and the only honest
   * way out is to zero the general gap and move the whole number into the group
   * surcharge. It is their setting being changed, so they are told, not "fixed"
   * behind their back.
   */
  const splitNote =
    snap && gap < surcharge
      ? `המרווח שביקשתם קטן מהתוספת לקבוצות שמוגדרת אצלכם (${gapChoiceLabel(surcharge)}). כדי שהמרווח בפועל יהיה ${gapChoiceLabel(gap)}, התוספת לקבוצות תשתנה ל-${gapChoiceLabel(gap)} והמרווח הכללי יתאפס.`
      : null;

  /*
   * A page or a manual group in the same queue does not get the group
   * surcharge, so the big number above is simply not its gap. Saying "the
   * system will keep N minutes between publications" while that is false for
   * some of the rows on this very screen is the kind of half-true this whole
   * panel exists to stop, so when it happens it is spelled out with the real
   * number those rows will actually get.
   */
  const otherChannels = plan ? plan.targets.filter((t) => t.target.channel !== 'facebook_group') : [];

  /** The queue's real spacing versus what the settings demand — the actual bug. */
  const mismatch =
    plan && plan.gapSeconds !== null && plan.gapSeconds < plan.effectiveGapSeconds
      ? `הפרסומים בתור מרווחים כרגע ב-${gapChoiceLabel(plan.gapSeconds)}, אבל ההגדרות דורשות ${gapChoiceLabel(plan.effectiveGapSeconds)} — לכן כל פרסום שמגיע מוקדם מדי נדחה שוב ושוב במקום לצאת. עדכון המרווח כאן מיישר בין השניים.`
      : null;

  const inQueue = useMemo(() => new Set(rows.map((r) => r.target_id)), [rows]);

  /*
   * Groups only. Every label in this section says "קבוצות" — the heading, the
   * hint, the button, the toast — and a page silently sitting in that list would
   * make all four of them false, on top of being previewed with a spacing
   * (the group gap) that rules.ts would never apply to it.
   */
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets
      .filter((t) => t.enabled && !inQueue.has(t.id) && t.channel.startsWith('facebook_group'))
      .filter((t) => (q ? t.name.toLowerCase().includes(q) || (t.city ?? '').toLowerCase().includes(q) : true));
  }, [targets, inQueue, query]);

  /*
   * Where the added publications land, computed exactly the way
   * addTargetsToQueue computes it: from the LAST waiting row, one every
   * `gapMinutes` — the spacing the queue really has right now, falling back to
   * the effective gap when there is only one row to measure. Deliberately not
   * the draft in the stepper: until the draft is committed the queue still has
   * its old spacing, and a preview drawn from a number nobody saved is a guess.
   */
  const addGap = plan ? Math.max(MIN_GAP, plan.gapSeconds ?? plan.effectiveGapSeconds) : MIN_GAP;
  const addFromMs = currentLastISO ? new Date(currentLastISO).getTime() : null;
  const addFirstISO = addFromMs !== null ? new Date(addFromMs + addGap * 1000).toISOString() : null;
  const addLastISO = addFromMs !== null && picked.length > 0 ? new Date(addFromMs + picked.length * addGap * 1000).toISOString() : null;

  /* ------------------------------------------------------------ mutations */

  const run = useCallback(
    async (key: string, fn: () => Promise<string>) => {
      setBusy(key);
      setError(null);
      progressRef.current = null;
      setProgress(null);
      try {
        const message = await withDeadline(fn(), () => progressRef.current);
        await load(false);
        onChanged?.();
        toast(message);
      } catch (err) {
        const message = friendlyMessage(err);
        /*
         * Every mutation here can fail HALF-DONE — respaceQueue writes the
         * settings before it touches a single row and throws with a real count
         * when some rows would not move. Re-reading before the message is shown
         * means the list under it is the queue as it is now, not the queue as it
         * was before the attempt. The reload is best-effort: if it fails too, the
         * original failure is still what the owner is told.
         */
        await load(false).catch(() => undefined);
        onChanged?.();
        setError(message);
      } finally {
        setBusy(null);
        progressRef.current = null;
      setProgress(null);
      }
    },
    [load, onChanged, toast],
  );

  const commitGap = () =>
    run('respace', async () => {
      setStartOverride(null);
      /*
       * ───────── ONE RECORD OWNS THE GAP, AND THIS SHEET WRITES IT ─────────
       *
       * "האם קיימים שני מנגנוני תזמון שונים?" — for the gap, there were.
       *
       * The campaign panel writes `schedule_gap_seconds` on the campaign row
       * and then LOWERS the account floor to match. This sheet wrote only the
       * account floor (applyGapSettings) and never touched the campaign
       * column. Two editors, two records, and each silently undoing the other:
       *
       *   • set five minutes here → the floor is five, the rows are re-spaced
       *     five apart, and the panel still reads "דקה", because its column
       *     was never written. The panel is now showing a number the engine
       *     does not use;
       *   • then touch ANY control on that panel — one day chip, the switch —
       *     and matchAccountGapTo fires with the panel's stale sixty seconds
       *     and drops the floor back to one minute. The setting made here is
       *     gone, undone by a control nobody would connect to it.
       *
       * So when this sheet is scoped to a round, the round's own column is
       * what it writes. The floor still follows, through the same call the
       * panel makes, and the two can no longer disagree.
       */
      if (campaignId && snap?.campaign && snap.window) {
        /*
         * NO ROUND-TRIP GUARD ANY MORE, because there is no round trip: this
         * control holds seconds and writes seconds. The guard it replaces
         * existed only because a whole-minutes control could not represent the
         * value it was about to overwrite.
         */
        const kept = gap;
        if (kept !== snap.window.gapSeconds) {
          /*
           * THE GAP COLUMNS ONLY, AND THAT IS THE WHOLE CORRECTION HERE.
           *
           * This wrote `scheduleColumns({ ...snap.window, gapSeconds: kept })`
           * — the ENTIRE window, rebuilt from a snapshot taken when this sheet
           * opened — plus that snapshot's `name`. So choosing a gap also
           * restored schedule_start, schedule_days, schedule_enabled and the
           * campaign's name to whatever they were at open time. Set the hours
           * on the card, open this sheet, change the gap, and the hours are
           * silently back. One control, four unrelated fields rolled back, and
           * then the queue re-spaced to the restored window.
           *
           * The write-back itself stays: the long note above is why this sheet
           * must own the round's own column rather than only the account floor.
           * What changes is that it writes only what it edits. Everything else
           * keeps whatever is stored — the same rule scheduleColumns() already
           * states for schedule_end.
           */
          await saveCampaignSchedule(snap.campaign.id, {
            schedule_gap_seconds: kept,
            /* Beside it, rounded up, for the same reason scheduleColumns writes
               both: an un-updated worker reading nothing falls back to a
               default, which is a change to how fast the account posts made by
               a deployment rather than by the owner. */
            schedule_gap_minutes: gapMinutesFor(kept),
          });
          await matchAccountGapTo(kept);
        }
      }
      const moved = await respaceQueue(gap, {
        ...(campaignId ? { campaignId } : {}),
        ...(anchor !== null ? { startAt: new Date(anchor).toISOString() } : {}),
        onProgress: (done, total) => {
          progressRef.current = { done, total };
          setProgress({ done, total });
        },
      });
      return `${posts(moved)} ${agree(moved, 'תוזמן', 'תוזמנו')} מחדש, מרווח של ${gapChoiceLabel(gap)} ביניהם.`;
    });

  const removeTarget = async (targetId: string, name: string, pending: number) => {
    const ok = await confirm.ask({
      title: 'להסיר את הקבוצה מהתור?',
      body: (
        <>
          <p dir="auto" className="font-bold text-mist-100">
            {name}
          </p>
          <p className="mt-1">
            {pending === 1 ? (
              <>
                יבוטל פרסום אחד שממתין לקבוצה הזו, והקבוצה תוסר גם מהתזמון הפעיל שיצר אותו — אחרת היא הייתה חוזרת לתור תוך דקה. אי
                אפשר להחזיר אותו — אפשר רק להוסיף את הקבוצה שוב לתור.
              </>
            ) : (
              <>
                יבוטלו <Num>{pending}</Num> פרסומים שממתינים לקבוצה הזו, והקבוצה תוסר גם מהתזמון הפעיל שיצר אותם — אחרת היא הייתה
                חוזרת לתור תוך דקה. אי אפשר להחזיר אותם — אפשר רק להוסיף את הקבוצה שוב לתור.
              </>
            )}
          </p>
        </>
      ),
      confirmLabel: 'הסר מהתור',
      danger: true,
    });
    if (!ok) return;
    await run(`remove:${targetId}`, async () => {
      const removed = await removeTargetFromQueue(targetId, scope);
      return `${posts(removed)} ${agree(removed, 'הוסר', 'הוסרו')} מהתור.`;
    });
  };

  const addPicked = () =>
    run('add', async () => {
      const added = await addTargetsToQueue(picked, scope);
      setPicked([]);
      // addTargetsToQueue skips a group that already has a row waiting for this
      // post, so "0 נוספו" is a real outcome and needs its own sentence rather
      // than a success message with a zero in it.
      return added ? `${posts(added)} ${agree(added, 'נוסף', 'נוספו')} לסוף התור.` : 'לא נוסף כלום — הקבוצות שבחרתם כבר ממתינות לפוסט הזה.';
    });

  /*
   * setGapTo() and commitDraft() were the gap editor's two writers — the
   * stepper/presets and the typed figure. Deleted with it on 07.11.2026. The
   * `gap` this sheet re-spaces at is seeded from the account's own value in
   * load() and is never edited here any more.
   */

  /* ---------------------------------------------------------------- view */

  const hasQueue = rows.length > 0;
  const working = busy !== null;
  // "ל-" takes the hyphen before a digit only; the singular and the dual spell
  // the number out, so they attach straight to the prefix ("לדקה אחת").
  /*
   * THE WHOLE SHEET SAYS SECONDS NOW, BECAUSE THE VALUE ALWAYS DID.
   *
   * `gap` was migrated from whole minutes to seconds on the value side only:
   * it is seeded from `gapSeconds`, clamped to MIN_GAP_SECONDS and handed to
   * respaceQueue(), which throws unless it is seconds. Every label around it
   * still said minutes. So a campaign on the shipped ten-minute gap showed
   * "600" over the words "דקות בין פרסום לפרסום", and an owner correcting it
   * to 10 got a queue re-spaced at THIRTY SECONDS under a button that read
   * "עדכן מרווח ל-30 דקות" — a twenty-fold speed-up applied by a control that
   * said it was slowing things down, on the one number in this product that
   * paces how fast an account posts to Facebook.
   *
   * gapChoiceLabel() is the product's one spelling of this value ("30 שניות",
   * "דקה", "10 דק׳") and is what the campaign panel and the summary line
   * already use. */
  const gapLabel = `ל-${gapChoiceLabel(gap)}`;

  /*
   * THE BUTTON IS ABOUT THE START TIME NOW, because that is the only thing on
   * this sheet that still edits the queue's layout: the gap is read-only here
   * and is chosen on מצב פרסום חכם. `gapDirty` can no longer become true, so
   * it is gone from the gating rather than left as a condition that is always
   * false — a disabled button nobody can enable is worse than no button.
   */
  const footer =
    !loading && !error && hasQueue ? (
      <Button size="lg" className="w-full" busy={busy === 'respace'} disabled={working || !startDirty} onClick={commitGap}>
        {busy === 'respace' && progress
          ? `מעדכן… ${progress.done} מתוך ${progress.total}`
          : `הזז את התור למועד החדש, במרווח של ${gapChoiceLabel(gap)}`}
      </Button>
    ) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title="ניהול התור הפעיל" size="lg" footer={footer}>
      {confirm.dialog}

      {error && (
        <div className="mb-3">
          <Notice tone="error">
            {error}{' '}
            <button type="button" className="min-h-11 font-bold underline" onClick={() => void load(false)}>
              נסו שוב
            </button>
          </Notice>
        </div>
      )}

      {loading ? (
        <Loading />
      ) : !plan ? null : !hasQueue ? (
        <div className="py-2">
          <EmptyState
            icon={<ClockIcon className="h-5 w-5" />}
            title="אין פרסומים שממתינים בתור"
            description="כשיהיו פרסומים ממתינים אפשר יהיה לשנות מכאן את המרווח ביניהם, להוסיף קבוצות או להוריד."
          />
        </div>
      ) : (
        <div className="space-y-6 pb-2">
          {/* ---------------------------------------------- 1. live summary */}
          <section aria-label="מצב התור">
            {plan.truncated && (
              <div className="mb-2">
                <Notice tone="warn">
                  התור ארוך מדי בשביל מסך אחד, ולכן מוצגים כאן <Num>{rows.length}</Num> הפרסומים הקרובים בלבד — ויש בו יותר. שינוי המרווח
                  יחול עליהם בלבד; מה שמעבר להם יישאר בזמנים שלו.
                </Notice>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 [&>*]:min-w-0">
              <Stat label={plan.truncated ? 'הקרובים בתור' : 'ממתינים בתור'}>
                <Num>{rows.length}</Num>
              </Stat>
              {/*
                THE INSTANTS THE ENGINE WILL USE, not the stored column.

                This is the sheet the dashboard opens FROM the queue tile to
                FIX the times, and it read `rows[0].scheduled_at` straight out
                of the database — so on the owner's queue it opened on "06:25"
                while the card he tapped from said 08:00. `currentProjected`
                runs the same projection every other screen now reads.
              */}
              <Stat label="הפרסום הבא">
                <Clock iso={currentProjected[0] ?? rows[0].scheduled_at} />
              </Stat>
              <Stat label="האחרון בתור">
                {currentLastISO && <Clock iso={currentLastISO} withDay={!sameLocalDay(new Date(currentLastISO), new Date(snap!.at))} />}
              </Stat>
            </div>
          </section>

          {/* ------------------------------------------------ 2. the number */}
          {/* ------------------------------------------------ when it starts */}
          <section aria-label="מועד ההתחלה" className="space-y-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">מתי מתחיל</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={working}
                onClick={() => setStartOverride((snap?.at ?? Date.now()) + 60_000)}
                className="min-h-11 rounded-xl bg-ink-900 px-3 text-sm font-bold text-mist-100 transition-colors hover:bg-ink-800 disabled:opacity-40"
              >
                התחל עכשיו
              </button>
              {[15, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={working}
                  onClick={() => setStartOverride((snap?.at ?? Date.now()) + m * 60_000)}
                  className="min-h-11 rounded-xl bg-ink-900 px-3 text-sm font-bold text-mist-100 transition-colors hover:bg-ink-800 disabled:opacity-40"
                >
                  בעוד <span dir="ltr">{m}</span> דק׳
                </button>
              ))}
              {startDirty && (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setStartOverride(null)}
                  className="min-h-11 rounded-xl px-3 text-sm font-bold text-mist-500 underline transition-colors hover:text-mist-300 disabled:opacity-40"
                >
                  בטל שינוי
                </button>
              )}
            </div>
            {anchor !== null && (
              <p className="text-xs text-mist-500">
                {startDirty ? 'הפרסום הראשון יצא ב-' : 'הפרסום הראשון יוצא ב-'}
                <Clock iso={new Date(anchor).toISOString()} />
                {startDirty && naturalAnchor !== null && (
                  <>
                    {' במקום ב-'}
                    <Clock iso={new Date(naturalAnchor).toISOString()} />
                  </>
                )}
                . כל השאר זזים איתו, באותו מרווח.
              </p>
            )}
          </section>

          <section aria-label="קצב הפרסום הנוכחי" className="space-y-3">
            {/*
              ─── THE GAP EDITOR THAT WAS HERE ───────────────────────────────

              A stepper, a typed 42px figure and six presets, all writing the
              ACCOUNT's gap. "יש להסיר לחלוטין מהממשק את השדה הישן: הפרש בין
              פרסומים. אין להשאיר אותו במקום אחר ואין ליצור הגדרה כפולה."
              — 07.11.2026. מצב פרסום חכם owns that number now.

              THE SECTION STAYS, READ-ONLY, because this sheet re-spaces the
              queue AT that number and the owner has to be able to see which
              number that is before pressing the button that moves 200 rows.
              `gap` is still seeded from the account's own current value and
              still handed to respaceQueue(), so the re-space does exactly
              what it did; only the editing of it moved.
            */}
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">קצב הפרסום הנוכחי</h3>

            <div className="rounded-xl bg-ink-900 px-3 py-4 text-center">
              <p dir="auto" className="text-[32px] font-extrabold leading-none text-mist-100">{gapChoiceLabel(gap)}</p>
              <p className="mt-1.5 text-xs font-bold text-mist-500">בין פרסום לפרסום</p>
              <p className="mt-2 text-[11px] font-bold leading-4 text-brand-400">
                נקבע לפי מצב הפרסום שנבחר בכרטיס הקמפיין (״מצב פרסום חכם״), ושם גם משנים אותו.
              </p>
            </div>

            <p className="text-xs leading-relaxed text-mist-500">
              זה המרווח שאתם קובעים, ותו לא. הוא לא הופך שום דבר ל״בטוח״ מול פייסבוק ולא מונע הגבלות — לפייסבוק אין מספר רשמי ומפורסם, ואף
              כלי לא יכול להבטיח שמספר מסוים לא יוביל להגבלה. המערכת תדחה פרסום שמגיע מוקדם מדי כדי לשמור מרווח של{' '}
              <span dir="auto" className="font-bold">{gapChoiceLabel(gap)}</span> בין פרסומים. שינוי המרווח מתזמן מחדש כל פרסום שעדיין ממתין בתור.
            </p>

            {mismatch && <Notice tone="warn">{mismatch}</Notice>}
            {splitNote && <Notice tone="info">{splitNote}</Notice>}
            {otherChannels.length > 0 && (
              <Notice tone="warn">
                {otherChannels.length === 1 ? (
                  'בתור ממתין גם יעד אחד שאינו קבוצת פייסבוק רגילה.'
                ) : (
                  <>
                    בתור ממתינים גם <Num>{otherChannels.length}</Num> יעדים שאינם קבוצת פייסבוק רגילה.
                  </>
                )}{' '}
                המספר למעלה הוא המרווח שנאכף בין פרסומים לקבוצות; ליעדים האחרים ההגדרות ידרשו{' '}
                <span dir="auto" className="font-bold">{gapChoiceLabel(nextGlobalGap)}</span> בלבד.
              </Notice>
            )}

            {/* Gated on startDirty now, not on a gap that can no longer change
                here: the thing this preview describes — where the first and
                last publications land after the change — is exactly what moving
                the start time does. */}
            {startDirty && nextLastISO && currentLastISO && (
              <Notice tone="info">
                אחרי השינוי: הפרסום האחרון בתור יצא ב-
                <Clock iso={nextLastISO} withDay={!sameLocalDay(new Date(nextLastISO), new Date(snap!.at))} /> במקום ב-
                <Clock iso={currentLastISO} withDay={!sameLocalDay(new Date(currentLastISO), new Date(snap!.at))} />. הפרסום הראשון בתור יֵצֵא ב-
                <Clock iso={new Date(anchor!).toISOString()} />, וכל אחד אחריו{' '}
                <span dir="auto" className="font-bold">{gapChoiceLabel(gap)}</span> אחרי הקודם.
              </Notice>
            )}

            {ceilings.length > 0 && (
              <Notice tone="warn">
                <ul className="list-disc space-y-1 ps-4">
                  {ceilings.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Notice>
            )}
          </section>

          {/* ---------------------------------------------------- 3. groups */}
          <section aria-label="קבוצות בתור" className="space-y-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">
              קבוצות בתור (<Num>{plan.targets.length}</Num>)
            </h3>
            <ul className="divide-y divide-ink-700">
              {plan.targets.map((t) => {
                const removing = busy === `remove:${t.target.id}`;
                return (
                  <li key={t.target.id} className="flex items-center gap-2.5 py-2">
                    <TargetAvatar name={t.target.name} imageUrl={t.target.image_url} channel={t.target.channel} size={36} />
                    <div className="min-w-0 grow">
                      <p dir="auto" className="truncate text-sm font-bold text-mist-100">
                        {t.target.name}
                      </p>
                      <p className="mt-0.5 text-xs text-mist-500">
                        <Num>{t.pending}</Num> ממתינים
                        {/* Projected, like every other instant on this sheet:
                            `LiveQueueTarget.nextAt` is the stored column
                            (client.ts), and a chip reading 06:25 beside a
                            header reading 08:00 is the same sheet arguing
                            with itself. byRowProjected maps this group's
                            soonest row to the instant the engine will use. */}
                        {t.nextAt && (
                          <>
                            {' · הבא ב-'}
                            <Clock iso={projectedFor(t.nextAt)} />
                          </>
                        )}
                      </p>
                    </div>
                    <IconButton
                      label={`הסר את ${t.target.name} מהתור`}
                      disabled={working}
                      onClick={() => void removeTarget(t.target.id, t.target.name, t.pending)}
                      className="text-error-400"
                    >
                      {removing ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <TrashIcon className="h-5 w-5" />}
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ------------------------------------------------ 4. add groups */}
          <section aria-label="הוספת קבוצות לתור" className="space-y-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">הוספת קבוצות לתור</h3>

            {plan.postId === null ? (
              <Notice tone="info">
                בתור ממתינים פרסומים של יותר מפוסט אחד, ולכן אי אפשר לדעת מכאן איזה פוסט הקבוצה החדשה אמורה לקבל. הוסיפו את הקבוצה מתוך
                מסך הסבב או הפוסט עצמו.
              </Notice>
            ) : (
              <>
                <Field label="חיפוש קבוצה" hint="מוצגות רק קבוצות פעילות שעדיין לא בתור.">
                  <div className="relative">
                    <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-mist-500 start-3" />
                    <input
                      className={`${inputClass} ps-10`}
                      aria-label="חיפוש קבוצה להוספה לתור"
                      placeholder="שם קבוצה או עיר…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </Field>

                {available.length === 0 ? (
                  <p className="py-2 text-sm text-mist-500">
                    {query.trim() ? 'אין קבוצות פעילות שתואמות לחיפוש.' : 'כל הקבוצות הפעילות כבר נמצאות בתור.'}
                  </p>
                ) : (
                  <>
                    <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                      {available.slice(0, ADD_LIST_LIMIT).map((t) => {
                        const on = picked.includes(t.id);
                        return (
                          <li key={t.id}>
                            <label
                              className={`flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                                on ? 'border-brand-300 bg-brand-300/8' : 'border-ink-600'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="h-5 w-5 shrink-0 accent-brand-300"
                                checked={on}
                                disabled={working}
                                aria-label={t.name}
                                onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)))}
                              />
                              <TargetAvatar name={t.name} imageUrl={t.image_url} channel={t.channel} size={32} />
                              <span dir="auto" className="min-w-0 grow truncate text-sm font-bold text-mist-100">
                                {t.name}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    {available.length > ADD_LIST_LIMIT && (
                      <p className="text-xs text-mist-500">
                        מוצגות <Num>{ADD_LIST_LIMIT}</Num> קבוצות מתוך <Num>{available.length}</Num> — חדדו את החיפוש כדי למצוא קבוצה
                        מסוימת.
                      </p>
                    )}
                  </>
                )}

                {picked.length > 0 && addFirstISO && addLastISO && (
                  <Notice tone="info">
                    {/* One row has no "first and last" — with a single pick
                        addFirstISO and addLastISO are the same instant, and
                        the two-clock sentence read as two publications. */}
                    {picked.length === 1 ? (
                      <>
                        פרסום אחד חדש ייכנס אחרי האחרון שבתור, ב-
                        <Clock iso={addFirstISO} withDay={!sameLocalDay(new Date(addFirstISO), new Date(snap!.at))} />.
                      </>
                    ) : (
                      <>
                        <Num>{picked.length}</Num> פרסומים חדשים ייכנסו אחרי האחרון שבתור, אחד כל{' '}
                        <span dir="auto" className="font-bold">{gapChoiceLabel(addGap)}</span>: הראשון ב-
                        <Clock iso={addFirstISO} withDay={!sameLocalDay(new Date(addFirstISO), new Date(snap!.at))} /> והאחרון ב-
                        <Clock iso={addLastISO} withDay={!sameLocalDay(new Date(addLastISO), new Date(snap!.at))} />.
                      </>
                    )}
                  </Notice>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  busy={busy === 'add'}
                  disabled={working || picked.length === 0}
                  onClick={addPicked}
                >
                  {picked.length > 0 ? `הוסף ${counted(picked.length, 'קבוצה אחת', 'קבוצות', 'שתי קבוצות')} לתור` : 'בחרו קבוצות להוספה'}
                </Button>
              </>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
