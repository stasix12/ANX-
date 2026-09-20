'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BellIcon } from '@/components/icons';
import { listActivity, queueSummary } from '@/lib/social/client';
import { relativeHe } from '@/lib/social/time';
import type { ActivityEntry } from '@/lib/social/types';

/**
 * Bell with an unread count. "Unread" is per-device: the timestamp of the
 * last time this browser opened the panel, kept in localStorage — a
 * convenience, so it degrades to "everything is new" if storage is blocked.
 */
const SEEN_KEY = 'social:notifications:seen';
const NOTABLE = new Set(['publish_failed', 'needs_attention', 'manual_pending', 'browser_needs_auth', 'connect_failed', 'rate_limit', 'worker_stopped']);

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
        className="relative grid h-11 w-11 place-items-center rounded-full bg-ink-800 text-mist-300 transition-colors hover:bg-ink-700 hover:text-mist-100"
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
          <button type="button" aria-label="סגור" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-ink-700 bg-ink-800 shadow-[0_2px_8px_rgba(0,0,0,0.45),0_24px_60px_-24px_rgba(0,0,0,0.85)]">
            <header className="flex items-center justify-between border-b border-ink-700 px-3.5 py-2.5">
              <p className="text-sm font-extrabold text-mist-100">התראות</p>
              {attention > 0 && <span className="rounded-full bg-warning-400/12 px-2 py-0.5 text-[11px] font-bold text-warning-400">{attention} דורשים טיפול</span>}
            </header>
            <ul className="max-h-80 divide-y divide-ink-700 overflow-y-auto">
              {items.length === 0 && <li className="px-3.5 py-6 text-center text-sm text-mist-500">אין התראות חדשות.</li>}
              {items.slice(0, 15).map((e) => (
                <li key={e.id} className="px-3.5 py-2.5">
                  <p className={`text-sm leading-snug ${e.level === 'error' ? 'text-error-400' : e.level === 'warn' ? 'text-warning-400' : 'text-mist-100'}`}>{e.message}</p>
                  <p className="text-[11px] text-mist-500">{relativeHe(e.at)}</p>
                </li>
              ))}
            </ul>
            <Link href="/social/history" onClick={() => setOpen(false)} className="block border-t border-ink-700 px-3.5 py-2.5 text-center text-sm font-bold text-brand-400">
              לכל ההיסטוריה
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
