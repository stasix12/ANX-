'use client';

import { useMemo } from 'react';
import type { ScheduleInput } from '@/lib/social/client';
import { dripSlots, slotsFor } from '@/lib/social/slots';
import { formatDateTimeHe, formatTimeHe, zonedDateISO, zonedToUtc } from '@/lib/social/time';
import { TIMEZONE, WEEKDAYS_HE, type ScheduleMode, type WeeklyPlan } from '@/lib/social/types';
import { Notice, inputClass } from './ui';

export interface ScheduleDraft {
  mode: ScheduleMode;
  date: string;
  time: string;
  weekly: WeeklyPlan;
  intervalDays: number;
  intervalTime: string;
  dripPerDay: number;
  dripGapMinutes: number;
  dripStart: string;
  dripEnd: string;
}

/** Converts the picker state into a schedule row; local times are Asia/Jerusalem. */
export function scheduleDraftToInput(d: ScheduleDraft, postId: string, targetIds: string[]): ScheduleInput {
  const base: ScheduleInput = {
    post_id: postId,
    mode: d.mode,
    timezone: TIMEZONE,
    run_at: null,
    weekly: {},
    interval_days: null,
    interval_time: null,
    target_ids: targetIds,
  };
  if (d.mode === 'now') return { ...base, run_at: new Date().toISOString() };
  if (d.mode === 'once') return { ...base, run_at: zonedToUtc(d.date, d.time).toISOString() };
  if (d.mode === 'weekly') return { ...base, weekly: d.weekly };
  if (d.mode === 'drip') {
    return {
      ...base,
      run_at: d.date ? zonedToUtc(d.date, d.dripStart).toISOString() : new Date().toISOString(),
      drip_per_day: d.dripPerDay,
      drip_gap_minutes: d.dripGapMinutes,
      drip_window_start: d.dripStart,
      drip_window_end: d.dripEnd,
    };
  }
  return { ...base, run_at: zonedToUtc(d.date, d.intervalTime).toISOString(), interval_days: d.intervalDays, interval_time: d.intervalTime };
}

/**
 * What this schedule will actually do, computed with the very same functions
 * the server planner uses (src/lib/social/slots.ts). Nothing here is an
 * illustration — if the preview says 20:48, the queue row will say 20:48.
 */
export interface SchedulePlan {
  /** One instant per publication, in order. */
  slots: Date[];
  /** True when every target fires at the same instant (now / once / weekly). */
  simultaneous: boolean;
  summary: string;
  firstAt: Date | null;
  lastAt: Date | null;
  days: number;
}

export function planFor(draft: ScheduleDraft, targetCount: number, now = new Date()): SchedulePlan {
  const count = Math.max(0, targetCount);
  const empty: SchedulePlan = { slots: [], simultaneous: true, summary: '', firstAt: null, lastAt: null, days: 0 };
  if (!count) return { ...empty, summary: 'עדיין לא נבחרו יעדים.' };

  if (draft.mode === 'drip') {
    const slots = dripSlots(
      {
        timezone: TIMEZONE,
        run_at: draft.date ? zonedToUtc(draft.date, draft.dripStart).toISOString() : now.toISOString(),
        drip_per_day: draft.dripPerDay,
        drip_gap_minutes: draft.dripGapMinutes,
        drip_window_start: draft.dripStart,
        drip_window_end: draft.dripEnd,
        target_ids: Array.from({ length: count }, (_, i) => String(i)),
      },
      now,
    );
    return finish(slots, false, `${count} פרסומים, אחד כל ${draft.dripGapMinutes} דקות, בין ${draft.dripStart} ל-${draft.dripEnd}`);
  }

  if (draft.mode === 'now') {
    return finish([now], true, `${count} יעדים — נכנסים לתור מיד`);
  }

  if (draft.mode === 'once') {
    if (!draft.date || !draft.time) return { ...empty, summary: 'בחרו תאריך ושעה.' };
    return finish([zonedToUtc(draft.date, draft.time)], true, `${count} יעדים, כולם ב-${draft.time}`);
  }

  // weekly / interval: show the next occurrences inside a two-week horizon.
  const from = new Date(now.getTime() - 60_000);
  const until = new Date(now.getTime() + 14 * 86_400_000);
  const slots = slotsFor(
    {
      mode: draft.mode,
      timezone: TIMEZONE,
      run_at: draft.date ? zonedToUtc(draft.date, draft.intervalTime).toISOString() : now.toISOString(),
      weekly: draft.weekly,
      interval_days: draft.intervalDays,
      interval_time: draft.intervalTime,
    },
    from,
    until,
  );
  if (!slots.length) return { ...empty, summary: 'לא נמצאו מועדים בשבועיים הקרובים — בדקו את ההגדרה.' };
  return finish(slots, true, `${count} יעדים בכל מועד · ${slots.length} מועדים בשבועיים הקרובים`);
}

function finish(slots: Date[], simultaneous: boolean, summary: string): SchedulePlan {
  const days = new Set(slots.map((d) => zonedDateISO(d))).size;
  return { slots, simultaneous, summary, firstAt: slots[0] ?? null, lastAt: slots[slots.length - 1] ?? null, days };
}

/**
 * The plan, shown before anything is created: first publication, last one,
 * how many days it spans, and the first handful of exact times.
 */
export function SchedulePlanPreview({ plan, names = [] }: { plan: SchedulePlan; names?: string[] }) {
  if (!plan.slots.length) {
    return <p className="text-xs text-mist-500">{plan.summary || 'בחרו יעדים כדי לראות מה יקרה.'}</p>;
  }
  const rows = plan.slots.slice(0, 6);
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-900/40 p-3">
      <p className="text-xs font-bold text-mist-300">{plan.summary}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="ראשון">{formatTimeHe(plan.firstAt as Date)}</Stat>
        <Stat label="אחרון">{formatTimeHe(plan.lastAt as Date)}</Stat>
        <Stat label="ימים">{plan.days}</Stat>
      </dl>
      <ul className="mt-2.5 space-y-1">
        {rows.map((at, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="w-12 shrink-0 font-extrabold tabular-nums text-brand-400">{formatTimeHe(at)}</span>
            <span className="min-w-0 truncate text-mist-300">
              {plan.simultaneous ? `כל ${names.length || 'ה'}${names.length ? ' היעדים' : 'יעדים'}` : names[i] || `יעד ${i + 1}`}
            </span>
            <span className="ms-auto shrink-0 text-[11px] text-mist-500">{formatDateTimeHe(at).slice(0, 5)}</span>
          </li>
        ))}
      </ul>
      {plan.slots.length > rows.length && (
        <p className="mt-1.5 text-[11px] text-mist-500">
          ועוד {plan.slots.length - rows.length} — האחרון ב-{formatDateTimeHe(plan.lastAt as Date)}
        </p>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-ink-850 py-1.5">
      <dt className="text-[10px] font-bold text-mist-500">{label}</dt>
      <dd className="text-sm font-extrabold tabular-nums text-mist-100">{children}</dd>
    </div>
  );
}

const MODES: { value: ScheduleMode; label: string }[] = [
  { value: 'now', label: 'פרסם עכשיו' },
  { value: 'once', label: 'תאריך ושעה' },
  { value: 'weekly', label: 'ימים קבועים' },
  { value: 'interval', label: 'כל X ימים' },
  { value: 'drip', label: 'הפצה הדרגתית' },
];

export function SchedulePicker({
  value,
  onChange,
  targetCount = 0,
  targetNames = [],
}: {
  value: ScheduleDraft;
  onChange: (v: ScheduleDraft) => void;
  targetCount?: number;
  targetNames?: string[];
}) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch });
  // Recomputed on every keystroke so the plan and the controls never disagree.
  const plan = useMemo(() => planFor(value, targetCount), [value, targetCount]);

  function toggleDay(day: number) {
    const key = String(day);
    const weekly = { ...value.weekly };
    if (weekly[key]?.length) delete weekly[key];
    else weekly[key] = ['09:00'];
    set({ weekly });
  }

  function setTimes(day: number, times: string[]) {
    set({ weekly: { ...value.weekly, [String(day)]: times } });
  }

  return (
    <div className="space-y-4">
      <div role="group" className="flex flex-wrap gap-1.5 rounded-xl bg-ink-800 p-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={value.mode === m.value}
            onClick={() => set({ mode: m.value })}
            className={`rounded-lg px-3.5 py-2 text-sm font-bold transition-colors ${value.mode === m.value ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {value.mode === 'once' && (
        <div className="grid grid-cols-2 gap-3">
          <input type="date" className={inputClass} value={value.date} onChange={(e) => set({ date: e.target.value })} />
          <input type="time" className={inputClass} value={value.time} onChange={(e) => set({ time: e.target.value })} />
        </div>
      )}

      {value.mode === 'weekly' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS_HE.map((name, day) => {
              const on = Boolean(value.weekly[String(day)]?.length);
              return (
                <button key={name} type="button" aria-pressed={on} onClick={() => toggleDay(day)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${on ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-300'}`}>
                  {name}
                </button>
              );
            })}
          </div>
          {WEEKDAYS_HE.map((name, day) => {
            const times = value.weekly[String(day)];
            if (!times?.length) return null;
            return (
              <div key={name} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-600 px-3 py-2">
                <span className="w-14 text-sm font-bold text-mist-100">{name}</span>
                {times.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <input
                      type="time"
                      className="rounded-lg border border-ink-600 bg-ink-850 px-2 py-1 text-sm text-mist-100"
                      value={t}
                      onChange={(e) => setTimes(day, times.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                    {times.length > 1 && (
                      <button type="button" aria-label="הסר שעה" className="text-xs text-rose-600" onClick={() => setTimes(day, times.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    )}
                  </span>
                ))}
                <button type="button" className="text-xs font-bold text-brand-400" onClick={() => setTimes(day, [...times, '18:00'])}>
                  + שעה
                </button>
              </div>
            );
          })}
          <p className="text-xs text-mist-500">שעות מקומיות (Asia/Jerusalem). המגבלות היומיות בהגדרות עדיין חלות.</p>
        </div>
      )}

      {value.mode === 'interval' && (
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-bold text-mist-300">מתאריך</span>
            <input type="date" className={inputClass} value={value.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-bold text-mist-300">כל … ימים</span>
            <input type="number" min={1} max={60} className={inputClass} value={value.intervalDays} onChange={(e) => set({ intervalDays: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-bold text-mist-300">בשעה</span>
            <input type="time" className={inputClass} value={value.intervalTime} onChange={(e) => set({ intervalTime: e.target.value })} />
          </label>
        </div>
      )}

      {value.mode === 'drip' && (
        <div className="space-y-3">
          <p className="text-sm text-mist-300">
            כל קבוצה מקבלת שעה משלה: הראשונה בשעת ההתחלה, ואחריה קבוצה כל X דקות, עד המכסה היומית או סוף חלון השעות. מה שלא נכנס היום ממשיך מחר.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <label className="text-sm">
              <span className="mb-1 block font-bold text-mist-300">מתאריך</span>
              <input type="date" className={inputClass} value={value.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-bold text-mist-300">מרווח (דקות)</span>
              <input type="number" min={1} max={600} className={inputClass} value={value.dripGapMinutes} onChange={(e) => set({ dripGapMinutes: Math.min(600, Math.max(1, Number(e.target.value) || 1)) })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-bold text-mist-300">קבוצות ביום</span>
              <input type="number" min={0} max={200} className={inputClass} value={value.dripPerDay} onChange={(e) => set({ dripPerDay: Math.min(200, Math.max(0, Number(e.target.value) || 0)) })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-bold text-mist-300">משעה</span>
              <input type="time" className={inputClass} value={value.dripStart} onChange={(e) => set({ dripStart: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-bold text-mist-300">עד שעה</span>
              <input type="time" className={inputClass} value={value.dripEnd} onChange={(e) => set({ dripEnd: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="text-mist-500">מרווח מהיר:</span>
            {[10, 20, 30, 45, 60, 90].map((m) => (
              <button key={m} type="button" onClick={() => set({ dripGapMinutes: m })} className={`rounded-full px-2.5 py-1 ${value.dripGapMinutes === m ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-300'}`}>
                {m} דק׳
              </button>
            ))}
          </div>
          <p className="text-xs text-mist-500">
            "קבוצות ביום" = 0 פירושו בלי הגבלה (רק חלון השעות). ריק בתאריך = מתחיל היום. המכסות בהגדרות עדיין חלות ויכולות לדחות פרסומים.
          </p>
          <p className="text-xs text-mist-500">
            המרווח הוא הגדרה שלכם בלבד. אין מרווח שמבטיח שלא תיחסם ואין לפייסבוק מספר רשמי שאפשר להסתמך עליו — המערכת פשוט תעשה מה שביקשתם.
          </p>
        </div>
      )}

      {value.mode === 'now' && (
        <Notice tone="info">
          הפרסומים נכנסים לתור מיד. קבוצות יוצאות דרך ה-worker שעל המחשב, בזו אחר זו ובכפוף למרווח ולמכסות שהגדרתם.
        </Notice>
      )}

      <div>
        <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">מה יקרה בפועל</p>
        <SchedulePlanPreview plan={plan} names={targetNames} />
      </div>
    </div>
  );
}
