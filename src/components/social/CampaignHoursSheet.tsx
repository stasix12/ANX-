'use client';

import { useEffect, useState } from 'react';
import { Button, Sheet } from '@/components/social/ui';
import { DAY_LABELS, DAY_NAMES, type CampaignSchedule } from '@/lib/social/campaign-schedule';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * ─── ימי פעילות והפעלה ────────────────────────────────────────────────────
 *
 * "בכל כרטיס קמפיין יש להוסיף כפתור חדש בשם 'ימים ושעות' · לחיצה תפתח חלון
 *  הגדרות קומפקטי · בחירת ימי פעילות · בחירת שעת הפעלה אחת בלבד · ארבע
 *  תבניות שעות מוכנות · כפתור כחול 'שמור שינויים'."
 *
 * ONE HOUR, AND THERE IS NO SECOND ONE TO HIDE. "אין להציג או להגדיר שעת
 * סיום" is not a new rule here — it is the rule this product already follows:
 * he had the closing hour removed, readSchedule() stopped reading the column
 * and a chosen day runs from this hour until midnight. This sheet could not
 * offer an end hour even if it wanted to, because nothing downstream would
 * read it.
 *
 * NOTHING IS WRITTEN UNTIL "שמור שינויים". The panel inside the full card
 * writes as you touch it, debounced — which is right for a panel you are
 * already looking at, and wrong for a sheet with a save button, because a
 * save button that confirms a write it did not wait for is the exact thing
 * §6 forbids ("להציג אישור שמירה רק לאחר הצלחה אמיתית"). So the days and the
 * hour are a DRAFT here, the draft is seeded from the campaign every time the
 * sheet opens, and the one write happens on the button and is awaited.
 */

/** "בוקר / צהריים / ערב / לילה" — his four, in his order. */
const PRESETS: { label: string; at: string }[] = [
  { label: 'בוקר', at: '08:00' },
  { label: 'צהריים', at: '12:00' },
  { label: 'ערב', at: '16:00' },
  { label: 'לילה', at: '20:00' },
];

export function CampaignHoursSheet({
  open,
  onClose,
  campaignName,
  schedule,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  campaignName: string;
  /** The campaign's stored schedule — the draft is seeded from it on every open. */
  schedule: CampaignSchedule;
  /** Resolves when the write really landed; rejects when it did not. */
  onSave: (next: CampaignSchedule) => Promise<void>;
}) {
  const [days, setDays] = useState<number[]>(schedule.days ?? []);
  const [start, setStart] = useState(schedule.start || '08:00');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  /*
   * SEEDED ON EVERY OPEN, not once. The sheet lives beside a grid of four
   * campaigns and the same instance is reused for whichever one was tapped —
   * so a draft left over from the previous campaign would be this feature's
   * first bug, and the one §8 asks about by name ("עצמאות הגדרות בין
   * קמפיינים").
   */
  useEffect(() => {
    if (!open) return;
    setDays(schedule.days ?? []);
    setStart(schedule.start || '08:00');
    setProblem('');
  }, [open, schedule]);

  const toggleDay = (day: number) =>
    setDays((all) => (all.includes(day) ? all.filter((d) => d !== day) : [...all, day].sort((a, b) => a - b)));

  const save = async () => {
    if (days.length === 0) {
      /* A round with no day never publishes. Said here rather than saved and
         discovered tomorrow — the same sentence the full card uses. */
      setProblem('לא נבחר אף יום פרסום — בחרו לפחות יום אחד.');
      return;
    }
    setSaving(true);
    setProblem('');
    try {
      await onSave({ ...schedule, enabled: true, days, start });
      onClose();
    } catch (err) {
      /* friendlyMessage() AND NOT err.message — caught by layout.test.ts, and
         it is right: a Postgres constraint name is not a sentence the owner
         can act on, and this product has one place that turns those into
         Hebrew he can read. */
      setProblem(friendlyMessage(err, 'השמירה נכשלה. נסו שוב.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={saving ? () => undefined : onClose}
      title="ימי פעילות והפעלה"
      footer={
        <Button onClick={() => void save()} disabled={saving} className="w-full">
          {saving ? 'שומר…' : 'שמור שינויים'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/12 px-2.5 py-1 text-[11.5px] font-extrabold text-brand-400">
            <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />
            </svg>
            הגדרה מהירה
          </span>
          <span className="min-w-0 truncate text-[12px] font-bold text-mist-500" dir="auto">
            {campaignName}
          </span>
        </div>

        {/* ── ימי פעילות ── */}
        <div>
          <p className="text-[13px] font-extrabold text-mist-100">ימי פעילות</p>
          <div role="group" aria-label={`ימי פרסום ל${campaignName}`} className="mt-2 grid grid-cols-7 gap-1 [&>*]:min-w-0">
            {DAY_LABELS.map((label, day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[day]}
                  disabled={saving}
                  onClick={() => toggleDay(day)}
                  className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-2xl border text-[12.5px] font-extrabold transition-colors disabled:opacity-60 ${
                    on ? 'border-transparent bg-brand-500 text-on-brand' : 'border-ink-700 bg-ink-800 text-mist-300'
                  }`}
                >
                  {label}
                  {on && (
                    <svg aria-hidden viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12.5 4.5 4.5L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── שעת הפעלה, אחת ── */}
        <div>
          <p className="text-[13px] font-extrabold text-mist-100">שעת הפעלה</p>
          <p className="mt-0.5 text-[11.5px] font-semibold text-mist-500">
            הפרסום מתחיל בשעה הזאת, בימים שבחרתם. אין שעת סיום — היום פתוח עד חצות.
          </p>
          <input
            type="time"
            aria-label="שעת הפעלה"
            value={start}
            disabled={saving}
            onChange={(e) => setStart(e.target.value || '08:00')}
            dir="ltr"
            className="mt-2 h-12 w-full rounded-2xl border border-ink-700 bg-ink-800 px-3 text-center text-[17px] font-extrabold text-mist-100"
          />
          <div className="mt-2 grid grid-cols-4 gap-1.5 [&>*]:min-w-0">
            {PRESETS.map((p) => (
              <button
                key={p.at}
                type="button"
                disabled={saving}
                aria-pressed={start === p.at}
                onClick={() => setStart(p.at)}
                className={`flex min-h-11 flex-col items-center justify-center rounded-2xl border text-[11.5px] font-extrabold transition-colors disabled:opacity-60 ${
                  start === p.at ? 'border-transparent bg-brand-500 text-on-brand' : 'border-ink-700 bg-ink-800 text-mist-300'
                }`}
              >
                {p.label}
                <span dir="ltr" className="text-[10.5px] font-bold opacity-80">{p.at}</span>
              </button>
            ))}
          </div>
        </div>

        {problem && (
          <p role="alert" className="rounded-2xl border border-error-400/40 bg-error-400/10 px-3 py-2 text-[12.5px] font-bold text-error-400">
            {problem}
          </p>
        )}
      </div>
    </Sheet>
  );
}
