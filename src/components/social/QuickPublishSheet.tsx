'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { friendlyMessage } from '@/lib/social/errors';
import { listSchedules, listVariants, listWorkers } from '@/lib/social/client';
import {
  planQuickPublish,
  quickPublish,
  quickPublishContext,
  seedTargetsFromSchedules,
  type LibraryPost,
  type QuickPublishContext,
  type QuickPublishPlan,
  type QuickPublishResult,
} from '@/lib/social/library';
import { formatDateTimeHe, formatDayMonthHe, formatTimeHe, zonedDateISO, zonedToUtc } from '@/lib/social/time';
import type { MediaItem } from '@/lib/social/types';
import { SchedulePlanPreview, type SchedulePlan } from './SchedulePicker';
import { TargetPicker } from './TargetPicker';
import { Badge, Button, ButtonLink, Notice, Sheet, SkeletonList, inputClass, useConfirm } from './ui';

/** The scheduler's own quick intervals, so the two screens never disagree. */
const QUICK_GAPS = [10, 20, 30, 45, 60, 90];

/**
 * Publishing a library post without opening the editor: pick groups, pick the
 * timing, read the real schedule, confirm.
 *
 * Everything here is borrowed rather than rebuilt. Groups come from the same
 * <TargetPicker> the editor uses (its replace/merge/hidden rules are pinned by
 * worker/test/picker.test.ts). The plan comes from planQuickPublish(), which
 * derives its instants from dripSlots() — the planner's own function — off the
 * same draft the write uses, so the preview and the materialised queue cannot
 * disagree. Nothing at all is written until the button at the bottom is pressed,
 * which is the shape PostEditor's pre-launch review has.
 */
export function QuickPublishSheet({
  open,
  onClose,
  item,
  onDone,
  onTune,
}: {
  open: boolean;
  onClose: () => void;
  item: LibraryPost | null;
  onDone?: () => void;
  /** Hands over to the live queue tuner on the library screen after a launch. */
  onTune?: () => void;
}): React.ReactElement | null {
  const [ctx, setCtx] = useState<QuickPublishContext | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [variantProblem, setVariantProblem] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [date, setDate] = useState(() => zonedDateISO(new Date()));
  const [time, setTime] = useState('09:00');
  const [gap, setGap] = useState(20);
  /*
   * The instant the plan is computed from. Kept in state and refreshed on a
   * timer rather than read on every render: a preview computed from a different
   * anchor than the one on screen is a lie with a countdown on it, and a fresh
   * `new Date()` per render would also recompute the whole plan on every
   * keystroke.
   */
  const [anchor, setAnchor] = useState(() => new Date());
  const [showAllRows, setShowAllRows] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuickPublishResult | null>(null);

  const confirm = useConfirm();
  const postId = item?.post.id ?? null;
  /* rules.ts applies browser.maxPerCampaignPerDay only to rows that carry a
     campaign, so the snapshot needs to know whether this post has one. */
  const postCampaignId = item?.post.campaign_id ?? null;

  /* One snapshot per opening: targets, the owner's real settings and ceilings,
     this post's own schedules, and whether the PC worker is up. */
  const load = useCallback(async () => {
    if (!postId) return;
    setLoadError(null);
    setCtx(null);
    try {
      const [snapshot, schedules, variants, workers] = await Promise.all([
        quickPublishContext(postCampaignId),
        listSchedules(postId),
        listVariants(postId),
        listWorkers().catch(() => []),
      ]);
      setCtx(snapshot);
      setGap(Math.max(1, snapshot.effectiveGapMinutes || 20));
      setWorkerOnline(workers.some((w) => w.online));
      const approved = variants.filter((v) => v.approval === 'approved' && v.text.trim());
      setVariantProblem(
        variants.length && !approved.length
          ? 'יש גרסאות אך אף אחת לא אושרה. אשרו לפחות גרסה אחת (או מחקו את כולן כדי לפרסם את הטקסט הבסיסי).'
          : null,
      );
      /*
       * The selection starts from this post's own most recent schedule, active
       * one preferred, minus targets deleted since — the rule pinned by
       * worker/test/selection.test.ts. There are no Facebook Pages on this
       * account, so the editor's last fallback would seed nothing; an empty
       * selection is a legitimate state and is left visible rather than quietly
       * turned into "everything".
       */
      setSelectedIds(seedTargetsFromSchedules(schedules, snapshot.targets));
    } catch (err) {
      setLoadError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }, [postId, postCampaignId]);

  useEffect(() => {
    if (!open || !postId) return;
    setResult(null);
    setError(null);
    setShowAllRows(false);
    setMode('now');
    setDate(zonedDateISO(new Date()));
    setTime('09:00');
    setAnchor(new Date());
    load();
  }, [open, postId, load]);

  /* "Now" moves. Keep the anchor close to it so the plan on screen does not go
     stale while the groups are being chosen. */
  useEffect(() => {
    if (!open || result) return;
    const id = setInterval(() => setAnchor(new Date()), 30_000);
    return () => clearInterval(id);
  }, [open, result]);

  const startAt = useMemo(
    () => (mode === 'now' ? anchor.toISOString() : date && time ? zonedToUtc(date, time).toISOString() : anchor.toISOString()),
    [mode, date, time, anchor],
  );

  /* The plan is pure arithmetic over the snapshot, so it is recomputed locally
     on every change instead of asking the server again. */
  const plan: QuickPublishPlan | null = useMemo(() => {
    if (!ctx || !selectedIds.length) return null;
    return planQuickPublish(ctx, { targetIds: selectedIds, startAt, gapMinutes: gap, mode }, anchor);
  }, [ctx, selectedIds, startAt, gap, mode, anchor]);

  /* The same shape the editor's preview renders, so the two screens read alike. */
  const previewPlan: SchedulePlan | null = useMemo(() => {
    if (!plan || !plan.rows.length) return null;
    const slots = plan.rows.map((r) => new Date(r.at));
    return {
      slots,
      /*
       * Never "simultaneous": quick publish gives every target its own instant,
       * and even the single-target 'now' launch is one row for one named group.
       * Saying true here made the preview read "כל 1 היעדים" instead of the
       * group's own name.
       */
      simultaneous: false,
      summary:
        plan.mode === 'now'
          ? 'פרסום אחד — נכנס לתור מיד'
          : plan.rows.length === 1
            ? 'פרסום אחד'
            : `${plan.rows.length} פרסומים, אחד כל ${plan.gapMinutes} דקות${plan.days > 1 ? `, על פני ${plan.days} ימים` : ''}`,
      firstAt: slots[0],
      lastAt: slots[slots.length - 1],
      days: plan.days,
    };
  }, [plan]);

  const groupCount = useMemo(
    () => selectedIds.filter((id) => ctx?.targets.find((t) => t.id === id)?.channel === 'facebook_group').length,
    [selectedIds, ctx],
  );
  const overlap = useMemo(
    () => (item ? selectedIds.filter((id) => item.publishedTargetIds.includes(id)) : []),
    [selectedIds, item],
  );

  if (!open || !item) return null;

  const post = item.post;
  const media = post.media as MediaItem[];
  const cover = media.find((m) => m.kind === 'image') ?? media[0] ?? null;
  const postTitle = post.title || post.base_text.slice(0, 60) || 'ללא כותרת';

  /*
   * A first pass in the sheet so the obvious refusals are shown beside the
   * control that caused them. quickPublish() validates again on its own — this
   * does not replace it, and the two say the same sentences on purpose.
   */
  function localProblem(): string | null {
    if (variantProblem) return variantProblem;
    if (!selectedIds.length) return 'בחרו לפחות יעד אחד.';
    if (ctx?.browser.testMode && groupCount > 1)
      return 'TEST MODE פעיל — אפשר לבחור קבוצה אחת בלבד. כבו אותו בהגדרות אחרי שהבדיקה הראשונה עברה.';
    if (mode === 'schedule' && (!date || !time)) return 'בחרו תאריך ושעה.';
    return null;
  }

  async function onConfirm() {
    const problem = localProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await quickPublish({
        postId: post.id,
        targetIds: selectedIds,
        startAt,
        gapMinutes: gap,
        mode,
        /* The data layer cannot open a dialog, so the question lives here — the
           editor's own wording, for the same double-tap it protects against. */
        onPending: (pending) =>
          confirm.ask({
            title: 'הפוסט הזה כבר בדרך החוצה',
            body:
              pending === 1
                ? 'פרסום אחד של הפוסט הזה כבר ממתין ויֵצא לבד. להוסיף סבב נוסף על גביו?'
                : `${pending} פרסומים של הפוסט הזה כבר ממתינים ויצאו לבד. להוסיף סבב נוסף על גביהם?`,
            confirmLabel: 'הוסף סבב',
            cancelLabel: 'לא, השאר כמו שהוא',
          }),
      });
      if (r.cancelled) {
        setBusy(false);
        return;
      }
      /* r.targetCount, not selectedIds.length: the data layer drops targets that
         no longer exist, and reporting the selection would claim more than went in. */
      setResult(r);
      onDone?.();
    } catch (err) {
      setError(friendlyMessage(err, 'התזמון נכשל.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={result ? 'מה קרה עכשיו' : 'פרסום מהיר'}
      size="lg"
      footer={
        result ? (
          <Button size="lg" className="w-full" onClick={onClose}>
            סגור
          </Button>
        ) : (
          <Button size="lg" className="w-full" busy={busy} disabled={!ctx} onClick={onConfirm}>
            תזמן פרסום
          </Button>
        )
      }
    >
      {/* What is going out, so nobody schedules the wrong post. */}
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-ink-600 bg-ink-900/40 p-2.5">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink-800">
          {cover?.kind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
          {cover?.kind === 'video' && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={`${cover.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 grow">
          <p dir="auto" className="truncate text-sm font-bold text-mist-100">{postTitle}</p>
          <p dir="auto" className="truncate text-[11px] text-mist-500">{post.base_text || 'בלי טקסט — מדיה בלבד'}</p>
        </div>
        {item.pendingCount > 0 && (
          <Badge tone="info">{item.pendingCount === 1 ? 'אחד בתור' : `${item.pendingCount} בתור`}</Badge>
        )}
      </div>

      {loadError && (
        <div className="mt-3 space-y-2">
          <Notice tone="error">{loadError}</Notice>
          <Button variant="secondary" onClick={load}>
            נסו שוב
          </Button>
        </div>
      )}

      {!result && !loadError && !ctx && (
        <div className="mt-4">
          <SkeletonList rows={4} />
        </div>
      )}

      {/* ------------------------------------------------ the launch report */}
      {result && (
        <div className="mt-4 space-y-3">
          {result.queued > 0 ? (
            <Notice tone="success">
              {result.queued === 1
                ? `פרסום אחד נכנס לתור עבור ${result.targetCount === 1 ? 'יעד אחד' : `${result.targetCount} יעדים`}.`
                : `${result.queued} פרסומים נכנסו לתור עבור ${result.targetCount === 1 ? 'יעד אחד' : `${result.targetCount} יעדים`}.`}
            </Notice>
          ) : !result.ran ? (
            /* The run did not happen, so the queue was never built — that is a
               different thing from "nothing to build", and saying the wrong one
               sends the owner looking for a problem that is not there. */
            <Notice tone="warn">
              התזמון נשמר, אבל התור עדיין לא נבנה כי הריצה לא יצאה לדרך. הוא ייבנה ברגע שהיא תשוחרר, או בסבב הבא של ה-worker שעל המחשב.
            </Notice>
          ) : result.pendingAtLaunch > 0 ? (
            <Notice tone="warn">
              לא נוצרו פרסומים חדשים, כי הפוסט הזה כבר ממתין בתור לאותן הקבוצות. המערכת לא מכניסה אותו פעמיים לאותה קבוצה — בדקו בתור לפני שתנסו שוב.
            </Notice>
          ) : (
            <Notice tone="warn">
              לא נוצרו פרסומים חדשים. בדקו בתור מה כבר ממתין לקבוצות האלה לפני שתנסו שוב.
            </Notice>
          )}

          <dl className="grid grid-cols-3 gap-2 text-center [&>*]:min-w-0">
            <div className="rounded-lg bg-ink-800 py-2">
              <dt className="text-[10px] font-bold text-mist-500">מתחיל</dt>
              <dd className="text-sm font-extrabold tabular-nums text-mist-100">{formatTimeHe(result.startAt)}</dd>
              <p className="text-[10px] font-bold tabular-nums text-brand-400">{formatDayMonthHe(result.startAt)}</p>
            </div>
            <div className="rounded-lg bg-ink-800 py-2">
              <dt className="text-[10px] font-bold text-mist-500">צפוי להסתיים</dt>
              <dd className="text-sm font-extrabold tabular-nums text-mist-100">{result.endAt ? formatTimeHe(result.endAt) : '—'}</dd>
              {result.endAt && <p className="text-[10px] font-bold tabular-nums text-brand-400">{formatDayMonthHe(result.endAt)}</p>}
            </div>
            <div className="rounded-lg bg-ink-800 py-2">
              <dt className="text-[10px] font-bold text-mist-500">יעדים</dt>
              <dd className="text-sm font-extrabold tabular-nums text-mist-100">{result.targetCount}</dd>
            </div>
          </dl>

          {/* The run's real numbers, not a summary of intent. */}
          {result.ran ? (
            <Notice tone="info">
              דפים: {result.published} פורסמו, {result.skipped} דולגו, {result.deferred} נדחו, {result.failed} נכשלו. קבוצות מתפרסמות דרך ה-worker המקומי שעל המחשב.
            </Notice>
          ) : (
            <Notice tone="warn">
              הפרסום עצמו לא רץ — {result.reason ?? 'הפרסום מושהה.'} לחצו "המשך" בראש הדף כדי לשחרר את התור.
            </Notice>
          )}

          {result.gap.surchargeChanged && (
            <Notice tone="info">
              המרווח הנוסף לקבוצות עודכן ל-{result.gap.groupMinGapMinutes} דק׳ והמרווח הכללי ל-{result.gap.minGapMinutes} דק׳.
            </Notice>
          )}
          <p className="text-xs text-mist-500">
            ההגדרות דורשות כעת {result.gap.minGapMinutes + result.gap.groupMinGapMinutes} דק׳ בין שני פרסומים לקבוצות. זו הגדרה אחת לכל החשבון, לא לפרסום הזה בלבד.
          </p>

          {workerOnline === false && groupCount > 0 && (
            <Notice tone="warn">
              ה-worker המקומי לא רץ. קבוצות מתפרסמות רק כשהוא פועל על המחשב שלכם: <code dir="ltr" className="break-all">npm run social-worker</code>
            </Notice>
          )}

          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/social" size="lg">
              צפה בתור
            </ButtonLink>
            {onTune && result.queued > 0 && (
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  onClose();
                  onTune();
                }}
              >
                כוונון התור
              </Button>
            )}
          </div>
          <p className="text-xs text-mist-500">
            לשינוי המרווח או להוספת קבוצות אחרי שהתור נבנה — כוונון התור. אל תריצו פרסום מהיר שוב על אותו פוסט כדי לתקן מרווח.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------- the form */}
      {!result && ctx && (
        <div className="mt-4 min-w-0 space-y-5">
          {error && <Notice tone="error">{error}</Notice>}

          {variantProblem && (
            <Notice tone="warn">
              {variantProblem} פרסום של גרסה שלא אושרה מדולג אוטומטית, ולכן הפרסום המהיר חסום עד שתאשרו אחת בעורך.
            </Notice>
          )}

          {workerOnline === false && (
            <Notice tone="warn">
              ה-worker המקומי לא רץ. קבוצות מתפרסמות רק כשהוא פועל על המחשב שלכם: <code dir="ltr" className="break-all">npm run social-worker</code>
            </Notice>
          )}

          {ctx.browser.testMode && (
            <Notice tone="info">
              TEST MODE פעיל — אפשר לבחור קבוצה אחת בלבד, והפרסום יעצור לאישור לפני הלחיצה האחרונה. כבו אותו בהגדרות אחרי שהבדיקה הראשונה עברה.
            </Notice>
          )}

          <section className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-mist-100">לאן מפרסמים</h3>
              <Badge tone="brand">נבחרו {selectedIds.length}</Badge>
            </div>
            <TargetPicker
              targets={ctx.targets}
              selected={selectedIds}
              onChange={setSelectedIds}
              maxSelectable={ctx.browser.testMode ? 1 : undefined}
            />
            {overlap.length > 0 && (
              <div className="mt-2">
                <Notice tone="warn">
                  {overlap.length} מהיעדים שבחרתם כבר קיבלו את הפוסט הזה. המערכת לא שולחת את אותו פוסט פעמיים לאותה קבוצה, ולכן הפרסומים האלה ידולגו. בחרו קבוצות אחרות, או שכפלו את הפוסט לנוסח חדש.
                </Notice>
              </div>
            )}
          </section>

          <section className="min-w-0 space-y-3">
            <h3 className="text-sm font-extrabold text-mist-100">מתי</h3>
            <div role="group" aria-label="מתי לפרסם" className="flex min-w-0 gap-1.5 rounded-xl bg-ink-800 p-1">
              {(
                [
                  { value: 'now', label: 'פרסם עכשיו' },
                  { value: 'schedule', label: 'תזמן' },
                ] as const
              ).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={mode === m.value}
                  onClick={() => {
                    setMode(m.value);
                    setAnchor(new Date());
                  }}
                  className={`min-h-11 grow rounded-lg px-3.5 text-sm font-bold transition-colors ${
                    mode === m.value ? 'bg-brand-500 text-on-brand' : 'text-mist-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === 'schedule' && (
              <div className="grid min-w-0 grid-cols-2 gap-3 [&>*]:min-w-0">
                <label className="text-sm">
                  <span className="mb-1 block font-bold text-mist-300">מתאריך</span>
                  <input type="date" aria-label="תאריך התחלה" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-bold text-mist-300">בשעה</span>
                  <input type="time" aria-label="שעת התחלה" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
                </label>
              </div>
            )}

            <div className="min-w-0">
              <label className="text-sm">
                <span className="mb-1 block font-bold text-mist-300">מרווח בין פרסומים (דקות)</span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  inputMode="numeric"
                  aria-label="מרווח בדקות בין פרסומים"
                  className={inputClass}
                  value={gap}
                  onChange={(e) => setGap(Math.min(600, Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
              <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 text-xs font-bold">
                <span className="self-center text-mist-500">מרווח מהיר:</span>
                {QUICK_GAPS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setGap(m)}
                    className={`min-h-10 rounded-full px-2.5 ${gap === m ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-300'}`}
                  >
                    {m} דק׳
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-mist-500">
              ההגדרות דורשות כרגע {ctx.effectiveGapMinutes} דק׳ בין שני פרסומים לקבוצות. אישור כאן יעדכן את ההגדרה הזו ל-{gap} דק׳, והיא חלה על כל החשבון — לא על הפרסום הזה בלבד.
            </p>
            <p className="text-xs text-mist-500">
              המרווח הוא הגדרה שלכם בלבד. אין מרווח שמבטיח שלא תיחסם ואין לפייסבוק מספר רשמי שאפשר להסתמך עליו — המערכת פשוט תעשה מה שביקשתם.
            </p>
          </section>

          <section className="min-w-0">
            <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">מה יקרה בפועל</p>
            {!selectedIds.length && <p className="text-xs text-mist-500">בחרו יעדים כדי לראות את לוח הזמנים.</p>}
            {previewPlan && plan && (
              <div className="min-w-0 space-y-2">
                <SchedulePlanPreview plan={previewPlan} names={plan.rows.map((r) => r.name)} />

                {plan.rows.length > 6 && (
                  <button
                    type="button"
                    className="min-h-10 px-1 text-xs font-bold text-brand-400"
                    onClick={() => setShowAllRows((v) => !v)}
                  >
                    {showAllRows ? 'הסתר את הרשימה המלאה' : `הצג את כל ${plan.rows.length} הפרסומים`}
                  </button>
                )}
                {showAllRows && (
                  <ul className="max-h-64 min-w-0 space-y-1 overflow-y-auto rounded-xl border border-ink-600 p-2">
                    {plan.rows.map((r, i) => (
                      <li key={`${r.targetId}-${i}`} className="flex items-center gap-2 text-xs">
                        <span className="w-12 shrink-0 font-extrabold tabular-nums text-brand-400">{formatTimeHe(r.at)}</span>
                        <span dir="auto" className="min-w-0 truncate text-mist-300">{r.name}</span>
                        <span className="ms-auto shrink-0 text-[11px] font-bold tabular-nums text-mist-500">{formatDayMonthHe(r.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {plan.firstSlotDeferred && (
                  <p className="text-xs text-mist-500">
                    הפרסום הראשון לא יוצא מיד: המרווח שבחרתם חל גם עליו, ולכן הוא נקבע ל-{formatTimeHe(plan.startAt)}.
                  </p>
                )}
                {plan.days > 1 && (
                  <p className="text-xs text-mist-500">
                    מה שלא נכנס היום ממשיך מחר באותה שעה. ההפצה נמשכת על פני {plan.days} ימים ומסתיימת ב-{formatDateTimeHe(plan.endAt ?? plan.startAt)}.
                  </p>
                )}

                {plan.overCampaignCapToday > 0 && (
                  <Notice tone="warn">
                    לסבב של הפוסט הזה הגדרתם תקרה של {plan.maxPerCampaignPerDay} פרסומים ביום, ולפי התוכנית {plan.overCampaignCapToday} מהפרסומים של היום חורגים ממנה. גם הם ידולגו עם סיבה ברורה בהיסטוריה, ולא יידחו למחר.
                  </Notice>
                )}

                {plan.overCapTotal > 0 && (
                  <Notice tone="warn">
                    {plan.overCapTotal} מתוך {plan.rows.length} הפרסומים חורגים מהתקרה היומית שהגדרתם ({plan.maxPerDay} ביום; היום כבר יצאו {plan.publishedToday}). מה שמעבר לתקרה ידולג עם סיבה ברורה בהיסטוריה — הוא לא נדחה למחר. אפשר להעלות את התקרה בהגדרות, לבחור פחות יעדים, או להתחיל מחר.
                  </Notice>
                )}

                <p className="text-[11px] text-mist-500">
                  אלה המועדים המתוכננים נכון לעכשיו, מחושבים באותה פונקציה שהמתזמן עצמו מריץ. אם תאשרו בעוד כמה דקות הכל יזוז קדימה באותה מידה — זו התוכנית, לא הבטחה לדקה מדויקת.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      {confirm.dialog}
    </Sheet>
  );
}
