/*
 * THE SCHEDULE PANEL WITH REACT ACTUALLY RUNNING — the entry point
 * worker/test/time-picker.test.ts bundles and drives.
 *
 * "במסך הראשי שאני בא לשנות את הזמן אני עוד לא מספיק לבחור וזה זורק אותי
 *  מהבחירה ומשנה את השעה איפה שעצרתי אם האצבע."
 *
 * This is not something static HTML can answer. The question is what happens
 * BETWEEN the first notch of the wheel and the last: whether the field keeps
 * the hour the finger is on, and how many times the campaign is written on
 * the way. A rendered string shows neither.
 *
 * So the panel is mounted for real, the parent behaves exactly as the
 * dashboard does — it holds the schedule in state and records every write —
 * and the page exposes that record for the test to read.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CampaignSchedulePanel } from '@/components/social/CampaignSchedulePanel';
import { DEFAULT_CAMPAIGN_SCHEDULE, type CampaignSchedule } from '@/lib/social/campaign-schedule';

declare global {
  interface Window {
    /** Every schedule the panel has asked its parent to save, in order. */
    writes: CampaignSchedule[];
  }
}

function Harness() {
  /*
   * THE PARENT IS DELIBERATELY SLOW, because the real one is. The dashboard
   * writes to Supabase and only then re-renders with the confirmed row, so
   * for the length of a round trip the `schedule` prop is the OLD hour. That
   * lag is the whole bug: a controlled <input type="time"> fed a stale value
   * mid-scroll is what closed the picker on iOS.
   */
  const [schedule, setSchedule] = useState<CampaignSchedule>({ ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: true, start: '08:00' });
  return (
    <div className="p-3">
      <CampaignSchedulePanel
        campaignName="סבב פרסום"
        schedule={schedule}
        onChange={(next) => {
          window.writes.push(next);
          /* 120ms — a fast round trip. The old code wrote on every notch, so
             the prop was always behind the wheel by at least this much. */
          window.setTimeout(() => setSchedule(next), 120);
        }}
      />
    </div>
  );
}

window.writes = [];
createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
