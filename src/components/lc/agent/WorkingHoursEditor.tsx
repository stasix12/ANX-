'use client';

import { useLc } from '@/lib/lc/context';
import { weekdayLong } from '@/lib/lc/format';
import type { WorkingHours } from '@/lib/lc/types';
import { Toggle } from '../ui/forms';
import { cx } from '../ui/primitives';

export function WorkingHoursEditor({ value, onChange }: { value: WorkingHours; onChange: (v: WorkingHours) => void }) {
  const { locale, t } = useLc();
  return (
    <ul className="divide-y divide-lc-border rounded-xl border border-lc-border">
      {[0, 1, 2, 3, 4, 5, 6].map((d) => {
        const day = value[d] ?? { enabled: false, start: '08:00', end: '18:00' };
        return (
          <li key={d} className={cx('flex items-center gap-3 px-3 py-2.5', !day.enabled && 'bg-lc-bg/60')}>
            <Toggle size="sm" checked={day.enabled} onChange={(v) => onChange({ ...value, [d]: { ...day, enabled: v } })} />
            <span className={cx('w-24 text-sm font-semibold', day.enabled ? 'text-lc-text' : 'text-lc-faint')}>{weekdayLong(d, locale)}</span>
            {day.enabled ? (
              <div className="flex flex-1 items-center gap-2 text-sm">
                <input type="time" value={day.start} onChange={(e) => onChange({ ...value, [d]: { ...day, start: e.target.value } })} className="h-8 rounded-lg border border-lc-border px-2 text-sm focus:border-lc-primary focus:outline-none" dir="ltr" />
                <span className="text-lc-faint">–</span>
                <input type="time" value={day.end} onChange={(e) => onChange({ ...value, [d]: { ...day, end: e.target.value } })} className="h-8 rounded-lg border border-lc-border px-2 text-sm focus:border-lc-primary focus:outline-none" dir="ltr" />
              </div>
            ) : (
              <span className="text-sm text-lc-faint">{t('cal.closed')}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
