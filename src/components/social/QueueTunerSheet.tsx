'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClockIcon, PlusIcon, SearchIcon, SpinnerIcon, TrashIcon } from '@/components/icons';
import {
  addTargetsToQueue,
  countPublishedSince,
  getBrowserSettings,
  getLimits,
  listTargets,
  liveQueuePlan,
  removeTargetFromQueue,
  respaceQueue,
  type LiveQueuePlan,
} from '@/lib/social/client';
import { friendlyMessage } from '@/lib/social/errors';
import { agree, counted, formatDayMonthHe, formatTimeHe, startOfZonedDay, zonedDateISO } from '@/lib/social/time';
import type { BrowserSettings, LimitsSettings, SocialTarget } from '@/lib/social/types';
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

/** No MinusIcon in src/components/icons.tsx; same geometry as PlusIcon there. */
function MinusIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path d="M5 12h14" />
    </svg>
  );
}

/**
 * A clock reading is digits around a colon inside an RTL sentence. The colon is
 * neutral, so the run is re-ordered whenever it sits next to another number —
 * "14:30 במקום 13:05" came out with the two swapped. An LTR island fixes the
 * order without turning the sentence around it.
 */
function Clock({ iso, withDay = false }: { iso: string; withDay?: boolean }) {
  return (
    <span dir="ltr" className="inline-block tabular-nums font-bold">
      {withDay ? `${formatDayMonthHe(iso)} ${formatTimeHe(iso)}` : formatTimeHe(iso)}
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

/** A 44px stepper for the one number, tapped with a thumb in a moving van. */
function Stepper({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-ink-800 text-mist-100 transition-transform active:scale-[0.94] disabled:text-ink-600"
    >
      {children}
    </button>
  );
}

/*
 * The two counted nouns this sheet keeps repeating. Hebrew gives one a
 * singular and two a dual, and a fixed plural beside an interpolated number
 * produced "1 פרסומים הוסרו מהתור." on the single-group removal the owner
 * uses most.
 */
const posts = (n: number) => counted(n, 'פרסום אחד', 'פרסומים', 'שני פרסומים');
const minutes = (n: number) => counted(n, 'דקה אחת', 'דקות', 'שתי דקות');

const MIN_GAP = 1;
const MAX_GAP = 720;
/*
 * One minute, not five.
 *
 * The stepper moved in fives and the presets jumped 20 → 30 → 45, so 7 or 23
 * minutes were not reachable by any control on the screen — the owner asked
 * for exactly that. The presets stay for the big moves; these two buttons are
 * now the fine adjustment, and the figure between them can be typed into.
 */
const STEP = 1;
const PRESETS = [20, 30, 45, 65, 90, 120];
/** Anything longer than this and the list gets a search box instead of a scroll. */
const ADD_LIST_LIMIT = 30;

const sameLocalDay = (a: Date, b: Date) => zonedDateISO(a) === zonedDateISO(b);

interface Snapshot {
  plan: LiveQueuePlan;
  limits: LimitsSettings;
  browser: BrowserSettings;
  /** Real publications already out today, from countPublishedSince(). */
  publishedToday: number;
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

  const [gap, setGap] = useState(0);
  const [gapDirty, setGapDirty] = useState(false);
  /* The raw text while the figure is being typed into; null when it is not. */
  const [draft, setDraft] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const scope = useMemo(() => (campaignId ? { campaignId } : undefined), [campaignId]);

  const load = useCallback(
    async (keepGapDraft: boolean) => {
      setError(null);
      try {
        const [plan, all, limits, browser, publishedToday] = await Promise.all([
          liveQueuePlan(scope),
          listTargets(),
          getLimits(),
          getBrowserSettings(),
          countPublishedSince(startOfZonedDay(new Date()).toISOString()),
        ]);
        setSnap({ plan, limits, browser, publishedToday, at: Date.now() });
        setTargets(all);
        // The dashboard behind this sheet reloads every 30s and the countdown
        // re-renders every second; a draft the owner is in the middle of
        // setting must survive that, so it is only overwritten deliberately.
        if (!keepGapDraft) {
          setGap(plan.effectiveGapMinutes);
          setGapDirty(false);
          /* A half-typed number from a previous opening must not come back as
             the value of a queue the owner has not looked at yet. */
          setDraft(null);
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

  const instantAt = useCallback((i: number) => (anchor === null ? 0 : anchor + i * gap * 60_000), [anchor, gap]);

  const currentLastISO = rows.length > 0 ? rows[rows.length - 1].scheduled_at : null;
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
  const surcharge = snap?.browser.groupMinGapMinutes ?? 0;
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
      ? `המרווח שביקשתם קטן מהתוספת לקבוצות שמוגדרת אצלכם (${surcharge} דק׳). כדי שהמרווח בפועל יהיה ${gap} דק׳, התוספת לקבוצות תשתנה ל-${gap} והמרווח הכללי יתאפס.`
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
    plan && plan.gapMinutes !== null && plan.gapMinutes < plan.effectiveGapMinutes
      ? `הפרסומים בתור מרווחים כרגע ב-${plan.gapMinutes} דק׳, אבל ההגדרות דורשות ${plan.effectiveGapMinutes} דק׳ — לכן כל פרסום שמגיע מוקדם מדי נדחה שוב ושוב במקום לצאת. עדכון המרווח כאן מיישר בין השניים.`
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
  const addGap = plan ? Math.max(MIN_GAP, plan.gapMinutes ?? plan.effectiveGapMinutes) : MIN_GAP;
  const addFromMs = currentLastISO ? new Date(currentLastISO).getTime() : null;
  const addFirstISO = addFromMs !== null ? new Date(addFromMs + addGap * 60_000).toISOString() : null;
  const addLastISO = addFromMs !== null && picked.length > 0 ? new Date(addFromMs + picked.length * addGap * 60_000).toISOString() : null;

  /* ------------------------------------------------------------ mutations */

  const run = useCallback(
    async (key: string, fn: () => Promise<string>) => {
      setBusy(key);
      setError(null);
      try {
        const message = await fn();
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
      }
    },
    [load, onChanged, toast],
  );

  const commitGap = () =>
    run('respace', async () => {
      setStartOverride(null);
      const moved = await respaceQueue(gap, { ...(campaignId ? { campaignId } : {}), ...(anchor !== null ? { startAt: new Date(anchor).toISOString() } : {}) });
      return `${posts(moved)} ${agree(moved, 'תוזמן', 'תוזמנו')} מחדש, מרווח של ${minutes(gap)} ביניהם.`;
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

  const setGapTo = (value: number) => {
    setGap(Math.min(MAX_GAP, Math.max(MIN_GAP, value)));
    setGapDirty(true);
  };

  /*
   * The typed value, committed. Anything that is not a number in range leaves
   * the gap exactly as it was — a blur on an empty field must not silently
   * choose 1 minute for a queue of 28 groups.
   */
  const commitDraft = () => {
    const n = Number(draft);
    if (draft !== null && draft !== '' && Number.isFinite(n)) setGapTo(Math.round(n));
    setDraft(null);
  };

  /* ---------------------------------------------------------------- view */

  const hasQueue = rows.length > 0;
  const working = busy !== null;
  // "ל-" takes the hyphen before a digit only; the singular and the dual spell
  // the number out, so they attach straight to the prefix ("לדקה אחת").
  const gapLabel = gap <= 2 ? `ל${minutes(gap)}` : `ל-${minutes(gap)}`;

  const footer =
    !loading && !error && hasQueue ? (
      <Button size="lg" className="w-full" busy={busy === 'respace'} disabled={working || (!gapDirty && !startDirty)} onClick={commitGap}>
        {startDirty && gapDirty
          ? 'עדכן את מועד ההתחלה והמרווח'
          : startDirty
            ? 'הזז את התור למועד החדש'
            : `עדכן מרווח ${gapLabel}`}
      </Button>
    ) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title="ניהול התור הפעיל" size="lg" footer={footer}>
      {confirm.dialog}

      {error && (
        <div className="mb-3">
          <Notice tone="error">
            {error}{' '}
            <button type="button" className="min-h-11 font-bold underline" onClick={() => void load(gapDirty)}>
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
              <Stat label="הפרסום הבא">
                <Clock iso={rows[0].scheduled_at} />
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

          <section aria-label="מרווח בין פרסומים" className="space-y-3">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">מרווח בין פרסומים</h3>

            <div className="flex items-center justify-center gap-4 rounded-xl bg-ink-900 px-3 py-4">
              <Stepper label={`הפחת ${minutes(STEP)}`} onClick={() => setGapTo(gap - STEP)} disabled={working || gap <= MIN_GAP}>
                <MinusIcon className="h-6 w-6" />
              </Stepper>
              <div className="min-w-0 text-center">
                {/*
                  THE FIGURE IS THE INPUT.

                  Presets and a stepper cannot reach every number, and adding a
                  separate field beside the big number would put two controls
                  on screen for one value — the class of thing this file keeps
                  removing. So the number the owner is looking at is the number
                  they type into.

                  `draft` is what makes it typable. A controlled input that
                  clamps on every keystroke cannot be cleared: emptying it
                  gives NaN, the clamp turns that into MIN_GAP, and the field
                  refills with "1" under the cursor. So while it is being
                  edited the raw text is held as-is and only committed on blur
                  or Enter; an empty or nonsense entry falls back to the value
                  that was there before rather than to a number nobody chose.
                */}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label={`מרווח בדקות, בין ${MIN_GAP} ל-${MAX_GAP}`}
                  disabled={working}
                  dir="ltr"
                  value={draft ?? String(gap)}
                  onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                  onFocus={(e) => {
                    setDraft(String(gap));
                    e.target.select();
                  }}
                  onBlur={commitDraft}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  className="block w-24 rounded-lg bg-transparent text-center tabular-nums text-[42px] font-extrabold leading-none text-mist-100 focus:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50"
                />
                <span className="mt-1 block text-xs font-bold text-mist-500">דקות בין פרסום לפרסום</span>
              </div>
              <Stepper label={`הוסף ${minutes(STEP)}`} onClick={() => setGapTo(gap + STEP)} disabled={working || gap >= MAX_GAP}>
                <PlusIcon className="h-6 w-6" />
              </Stepper>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setGapTo(p)}
                  disabled={working}
                  aria-pressed={gap === p}
                  className={`min-h-11 min-w-14 rounded-xl px-3 text-sm font-bold tabular-nums transition-colors disabled:opacity-50 ${
                    gap === p ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-300'
                  }`}
                >
                  <span dir="ltr">{p}</span>
                </button>
              ))}
            </div>

            <p className="text-xs leading-relaxed text-mist-500">
              זה המרווח שאתם קובעים, ותו לא. הוא לא הופך שום דבר ל״בטוח״ מול פייסבוק ולא מונע הגבלות — לפייסבוק אין מספר רשמי ומפורסם, ואף
              כלי לא יכול להבטיח שמספר מסוים לא יוביל להגבלה. המערכת תדחה פרסום שמגיע מוקדם מדי כדי לשמור מרווח של <Num>{gap}</Num> דק׳ בין
              פרסומים. שינוי המרווח מתזמן מחדש כל פרסום שעדיין ממתין בתור.
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
                המספר למעלה הוא המרווח שנאכף בין פרסומים לקבוצות; ליעדים האחרים ההגדרות ידרשו <Num>{nextGlobalGap}</Num> דק׳ בלבד.
              </Notice>
            )}

            {gapDirty && nextLastISO && currentLastISO && (
              <Notice tone="info">
                אחרי השינוי: הפרסום האחרון בתור יצא ב-
                <Clock iso={nextLastISO} withDay={!sameLocalDay(new Date(nextLastISO), new Date(snap!.at))} /> במקום ב-
                <Clock iso={currentLastISO} withDay={!sameLocalDay(new Date(currentLastISO), new Date(snap!.at))} />. הפרסום הראשון בתור יֵצֵא ב-
                <Clock iso={new Date(anchor!).toISOString()} />, וכל אחד אחריו <Num>{gap}</Num> דק׳ אחרי הקודם.
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
                        {t.nextAt && (
                          <>
                            {' · הבא ב-'}
                            <Clock iso={t.nextAt} />
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
                        <Num>{picked.length}</Num> פרסומים חדשים ייכנסו אחרי האחרון שבתור, אחד כל <Num>{addGap}</Num> דק׳: הראשון ב-
                        <Clock iso={addFirstISO} withDay={!sameLocalDay(new Date(addFirstISO), new Date(snap!.at))} /> והאחרון ב-
                        <Clock iso={addLastISO} withDay={!sameLocalDay(new Date(addLastISO), new Date(snap!.at))} />.
                      </>
                    )}
                    {gapDirty && ' החישוב לפי המרווח שיש בתור כרגע; המרווח החדש שבחרתם עוד לא נשמר.'}
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
