'use client';

import type { ScheduleInput } from '@/lib/social/client';
import { zonedToUtc } from '@/lib/social/time';
import { TIMEZONE, WEEKDAYS_HE, type ScheduleMode, type WeeklyPlan } from '@/lib/social/types';
import { inputClass } from './ui';

export interface ScheduleDraft {
  mode: ScheduleMode;
  date: string;
  time: string;
  weekly: WeeklyPlan;
  intervalDays: number;
  intervalTime: string;
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
  return { ...base, run_at: zonedToUtc(d.date, d.intervalTime).toISOString(), interval_days: d.intervalDays, interval_time: d.intervalTime };
}

const MODES: { value: ScheduleMode; label: string }[] = [
  { value: 'now', label: 'פרסם עכשיו' },
  { value: 'once', label: 'תאריך ושעה' },
  { value: 'weekly', label: 'ימים קבועים' },
  { value: 'interval', label: 'כל X ימים' },
];

export function SchedulePicker({ value, onChange }: { value: ScheduleDraft; onChange: (v: ScheduleDraft) => void }) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch });

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

      {value.mode === 'now' && <p className="text-sm text-mist-500">נכנס לתור מיד ומתפרסם בריצה הקרובה, בכפוף למרווח ולמכסות בהגדרות.</p>}
    </div>
  );
}
