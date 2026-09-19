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

  useEffect(() => {
    setSeen(readSeen());
    const load = () =>
      Promise.all([listActivity(25), queueSummary()])
        .then(([log, queue]) => {
          setItems(log.filter((e) => NOTABLE.has(e.event) || e.level !== 'info'));
          // The same arithmetic as the dashboard's "דורשים אתכם" tile, from the
          // same rollup — two different formulas for one badge is how the same
          // screen printed two numbers for the same thing.
          setAttention(queue.summary.needsHuman);
        })
        .catch(() => undefined);
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
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
        className="relative grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-extrabold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label="סגור" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-600 bg-ink-850 shadow-2xl">
            <header className="flex items-center justify-between border-b border-ink-700 px-3.5 py-2.5">
              <p className="text-sm font-extrabold text-mist-100">התראות</p>
              {attention > 0 && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700">{attention} דורשים טיפול</span>}
            </header>
            <ul className="max-h-80 divide-y divide-ink-700 overflow-y-auto">
              {items.length === 0 && <li className="px-3.5 py-6 text-center text-sm text-mist-500">אין התראות חדשות.</li>}
              {items.slice(0, 15).map((e) => (
                <li key={e.id} className="px-3.5 py-2.5">
                  <p className={`text-sm leading-snug ${e.level === 'error' ? 'text-rose-700' : e.level === 'warn' ? 'text-amber-700' : 'text-mist-100'}`}>{e.message}</p>
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
