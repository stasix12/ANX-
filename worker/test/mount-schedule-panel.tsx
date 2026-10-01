/*
 * THE SCHEDULING PANEL, MOUNTED FOR REAL — the entry point
 * worker/test/schedule-panel.test.ts bundles and drives.
 *
 * Every other fixture in this suite is renderToStaticMarkup: HTML, measured,
 * never clicked. That is the right tool for geometry and the wrong one for
 * three of the things the brief asks for by name —
 *
 *   "חובה לאפשר Multi Select"
 *   "הסיכום חייב להתעדכן LIVE כאשר המשתמש משנה: ימים, שעת התחלה, שעת סיום,
 *    הפרש בין פוסטים"
 *   "כאשר כבוי: התזמון מושבת אך ההגדרות נשמרות"
 *
 * — none of which exist until something is pressed. So this file is the panel
 * with React actually running behind it, holding the state the campaigns page
 * holds in production and handing it straight back down, which is exactly the
 * shape of the real wiring.
 *
 * WHAT IT ALSO RECORDS. `window.__changes` collects every schedule the panel
 * emits. The page turns each of those into a write to the campaign row, so
 * what is in that array is what would reach the database — and a test can ask
 * whether tapping four days produced four coherent schedules or one and three
 * copies of the first.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CampaignSchedulePanel } from '@/components/social/CampaignSchedulePanel';
import { DEFAULT_CAMPAIGN_SCHEDULE, type CampaignSchedule } from '@/lib/social/campaign-schedule';

declare global {
  interface Window {
    __changes: CampaignSchedule[];
  }
}
window.__changes = [];

function Harness() {
  /* The reference's own setting, switched on — the state the owner's screen
     is in when he looks at it. */
  const [schedule, setSchedule] = useState<CampaignSchedule>({ ...DEFAULT_CAMPAIGN_SCHEDULE, enabled: true });
  return (
    <div className="social-theme" style={{ padding: 16, maxWidth: 360 }}>
      <CampaignSchedulePanel
        schedule={schedule}
        campaignName="ניקוי ספות באר שבע"
        onChange={(next) => {
          window.__changes.push(next);
          setSchedule(next);
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
