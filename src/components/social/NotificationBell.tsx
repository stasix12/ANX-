'use client';

import Link from 'next/link';
import { t } from '@/lib/social/i18n';
import { useEffect, useState } from 'react';
import { AlertCircleIcon, AlertTriangleIcon, BellIcon, ChevronIcon, ClockIcon } from '@/components/icons';
import { activityText } from '@/lib/social/activity-text';
import { listActivity, queueSummary } from '@/lib/social/client';
import { relativeHe } from '@/lib/social/time';
import type { ActivityEntry } from '@/lib/social/types';

/**
 * Bell with an unread count. "Unread" is per-device: the timestamp of the
 * last time this browser opened the panel, kept in localStorage — a
 * convenience, so it degrades to "everything is new" if storage is blocked.
 */
const SEEN_KEY = 'social:notifications:seen';
/* 'comments_waiting' stays level 'info' in the worker — nothing has failed,
   the one browser was busy publishing — but it is the sentence that explains a
   queue that is not moving, and at level 'info' alone the bell's own predicate
   dropped it. The owner had nine unread notifications and the one that would
   have answered his question was not among them. */
const NOTABLE = new Set(['publish_failed', 'needs_attention', 'manual_pending', 'browser_needs_auth', 'connect_failed', 'rate_limit', 'worker_stopped', 'comments_waiting']);

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function NotificationBell() {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [attention, setAttention] = useState(0);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState('');

  /**
   * This bell is in the header of EVERY screen, so its poll is the module's
   * single most-repeated read: listActivity(25) plus queueSummary(), and
   * queueSummary() is nine exact-count queries on social_queue, not one. At
   * 20s that was ~30 reads a minute from a phone sitting on a table.
   *
   * Three guards, in the order they matter:
   *
   * - IN-FLIGHT. A plain closure flag, not React state: state does not update
   *   until the render after, which is far too late for a flag the very next
   *   tick has to read. On a slow connection the 20s tick fired again before
   *   the previous pair resolved, so the requests stacked and each one made
   *   the next slower. A tick that finds one in the air skips.
   * - VISIBILITY. A backgrounded tab kept paying the whole bill for a screen
   *   nobody could see. It also refreshes once on becoming visible again, so
   *   the badge the owner actually looks at is never the one from before the
   *   phone was locked — skipping the poll must not mean showing stale news.
   * - INTERVAL, 60s. The hosted planner ticks every 5 minutes, so most
   *   notable events cannot appear faster than that; but the local browser
   *   worker runs continuously, and "התוכנה מחכה לכם" during a group run is
   *   exactly the notice the owner is sitting there waiting for. A minute is
   *   short enough that the badge is never misleadingly old in that case, and
   *   it is a third of the previous cost.
   */
  useEffect(() => {
    setSeen(readSeen());
    let stopped = false;
    let inFlight = false;

    const load = () => {
      if (inFlight) return;
      inFlight = true;
      Promise.all([listActivity(25), queueSummary()])
        .then(([log, queue]) => {
          if (stopped) return;
          setItems(log.filter((e) => NOTABLE.has(e.event) || e.level !== 'info'));
          // The same arithmetic as the dashboard's "דורשים אתכם" tile, from the
          // same rollup — two different formulas for one badge is how the same
          // screen printed two numbers for the same thing.
          setAttention(queue.summary.needsHuman);
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };

    load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const unread = items.filter((e) => !seen || e.at > seen).length;

  function toggle() {
    if (!open && items[0]) {
      const stamp = items[0].at;
      setSeen(stamp);
      try {
        localStorage.setItem(SEEN_KEY, stamp);
      } catch {
        /* private mode — the badge simply stays */
      }
    }
    setOpen((v) => !v);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `${unread} התראות חדשות` : 'התראות'}
        aria-expanded={open}
        /* The bell is the one coloured mark in the identity bar: it is the
           only control there that ever has something to say. Its two
           neighbours (stop-everything, settings) are quiet until touched, so
           a filled grey puck around all three turned the corner into a row of
           identical buttons and the bell stopped reading as an alert at all.
           brand-700 on the bar measures 8.9:1. */
        /* h-11 → h-10, with the gear and the computer beside it: the bar the
           dashboard reference draws is 50px tall and 44px controls do not fit
           in it with the white the image leaves around them. 40 is the floor
           this product hit-tests every control against. */
        /* brand-700 → brand-600. Sampled off the dashboard reference, the
           bell's stroke is rgb(0,56,165); brand-700 is #0e3686 and brand-600
           is #1244ab, which is the nearer of the two by a wide margin. It is
           still 8:1 on this bar, so the reason brand-700 was chosen — the one
           coloured mark in the row has to read as one — is unchanged. */
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-brand-600 transition-colors ${
          unread > 0 ? 'bg-brand-300/12' : 'hover:bg-ink-800'
        }`}
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-error-500 px-1 text-[11px] font-extrabold text-on-state">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label={t('סגור')} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          {/*
            ─── נבנה מחדש לפי תמונת רפרנס מחייבת, 26.11.2026 ────────────────
            "רפרנס עיצובי מחייב – שדרוג חלון ההתראות 1:1 … התמונה היא רפרנס
             מחייב לביצוע ולא מקור להשראה בלבד."

            שכבת הנתונים שמעל הבלוק הזה לא נגעה בה: אותו poll של 60 שניות,
            אותו NOTABLE, אותו queue.summary.needsHuman, אותו SEEN_KEY ואותו
            יעד /social/activity. מה שהשתנה הוא מה שהעין רואה.

            הצבעים כולם טוקנים של social-theme ולא קודים קשיחים — הפעמון
            מורכב רק מ-SocialShell, כלומר רק בתוך הערכה הזאת, ובכל זאת צבע
            שנכתב כאן כ-hex היה נשאר מאחור בפעם הבאה שהערכה זזה. שתי התכליות
            שאין להן טוקן — התכלת הבהירה של החלונית והגלולה הכתומה שיושבת על
            הגרדיאנט הכחול — נבנות ב-color-mix מעל טוקן קיים, ולא כשכבה
            שקופה: החלונית צפה מעל המסך, ושקיפות הייתה מראה דרכה את מה שמאחור.
          */}
          <div className="absolute end-0 z-50 mt-2 w-[82vw] max-w-sm overflow-hidden rounded-sheet border-2 border-ink-850 bg-[color-mix(in_srgb,var(--color-brand-500)_7%,var(--color-ink-850))] shadow-[0_4px_14px_rgba(40,20,80,0.06),0_18px_44px_-12px_rgba(46,16,101,0.18)]">
            {/* הכותרת: גרדיאנט כחול, פעמון בעיגול שקוף-למחצה עם נקודה אדומה,
                והגלולה הכתומה בקצה. הגרדיאנט נוסע ימין→שמאל, ולכן הפעמון
                שיושב בימין יושב על brand-600 — וזה הצבע שטבעת הנקודה מקבלת. */}
            <header className="flex items-center gap-2.5 bg-gradient-to-l from-brand-600 to-brand-500 px-3 py-2.5 text-on-brand">
              <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-on-brand/15">
                <BellIcon aria-hidden className="h-5 w-5" />
                <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-error-500 ring-2 ring-brand-600" />
              </span>
              <p className="text-[18px] font-extrabold leading-none">{t('התראות')}</p>
              {attention > 0 && (
                <span className="ms-auto shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-warning-400)_16%,var(--color-ink-850))] px-2.5 py-1 text-[12px] font-bold text-warning-400">
                  {attention} דורשים טיפול
                </span>
              )}
            </header>

            {/* שלוש ההתראות האחרונות נכנסות בגובה הזה, והשאר בגלילה. 17.5rem
                נמדד על הדבר עצמו: שלושה כרטיסים בני שתי שורות, שני רווחים של
                8px ושתי רפידות של 8px. ב-15.5rem הכרטיס השלישי נחתך באמצע
                שבב הזמן, וזה נראה שבור ולא גלול. */}
            <ul className="max-h-[17.5rem] space-y-2 overflow-y-auto p-2">
              {items.length === 0 && (
                <li className="rounded-tile bg-ink-850 px-3.5 py-6 text-center text-[13px] text-mist-500">{t('אין התראות חדשות.')}</li>
              )}
              {items.slice(0, 15).map((e) => {
                /* אותו מסלול טקסט של מרכז הפעילות ושל כרטיס לוח הבקרה —
                   activityText() מחזיר כותרת קצרה ושורה מוסברת, וזה בדיוק
                   המבנה של הרפרנס: כותרת 14px ומתחתיה שורה משנית 12px.
                   לא נוסח כאן טקסט חדש ולא נגעה שורה במסד. */
                const text = activityText(e);
                const tone =
                  e.level === 'error'
                    ? { ink: 'text-error-400', box: 'bg-error-500/12 text-error-500', Icon: AlertTriangleIcon }
                    : e.level === 'warn'
                      ? { ink: 'text-warning-400', box: 'bg-warning-400/12 text-warning-400', Icon: AlertTriangleIcon }
                      : { ink: 'text-mist-100', box: 'bg-brand-500/10 text-brand-500', Icon: AlertCircleIcon };
                return (
                  <li key={e.id}>
                    {/* לחיצה על ההתראה פותחת את הפרטים המלאים: /social/activity
                        הוא המסך שמרנדר כל שורה עם technical — ההודעה המלאה,
                        שם האירוע, ה-meta, "נסה שוב" וחלון פרטי הפרסום. זה
                        המסלול הקיים, לא מנגנון חדש. */}
                    <Link
                      href="/social/activity"
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-2.5 rounded-tile bg-ink-850 p-2.5 shadow-[0_1px_3px_rgba(40,20,80,0.05)] transition-colors hover:bg-ink-900"
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tone.box}`}>
                        <tone.Icon aria-hidden className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        {/* ההדגשה האדומה היא על החלק החשוב בלבד: הכותרת נושאת
                            את צבע הדרגה, והשם שהשורה מדברת עליו נשאר כחול
                            כהה. dir="auto" כי שם קבוצה יכול להגיע ברוסית או
                            באנגלית, ובתוך תיבה RTL הוא נחתך בצד הלא נכון. */}
                        <span className="block truncate text-[14px] font-extrabold leading-tight" dir="auto">
                          <span className={tone.ink}>{text.title}</span>
                          {text.subject && <span className="text-mist-100">{` ${text.subject}`}</span>}
                        </span>
                        {text.detail && (
                          <span className="mt-0.5 block truncate text-[12px] leading-tight text-mist-500" dir="auto">
                            {text.detail}
                          </span>
                        )}
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-brand-500/8 px-1.5 py-0.5 text-[11px] text-mist-500">
                          <ClockIcon aria-hidden className="h-3 w-3" />
                          {relativeHe(e.at)}
                        </span>
                      </span>
                      <ChevronIcon aria-hidden className="mt-1.5 h-4 w-4 shrink-0 text-mist-500 rtl:rotate-180" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* /social/activity, not /social/history: this panel lists rows
                from the activity log, and history lists social_queue —
                publications. The link promised "all of it" and delivered a
                different table, so a worker that stopped or a round that was
                planned could not be found anywhere past this popover. */}
            <div className="px-2 pb-2">
              <Link
                href="/social/activity"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center justify-center rounded-full bg-gradient-to-l from-brand-600 to-brand-500 text-[14px] font-extrabold text-on-brand"
              >
                {t('לכל הפעילויות')}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
