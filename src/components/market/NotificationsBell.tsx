'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCollection } from '@/lib/market/hooks';
import { useMarketSession } from '@/lib/market/session';
import { getStore } from '@/lib/market/store';

/**
 * In-app notification bell. Live: the notifications collection is on the
 * store's change feed, so a status change in another tab pops here instantly.
 * `forUserId` lets the pro shell reuse the bell for the signed-in pro.
 */
export function NotificationsBell({ forUserId }: { forUserId?: string }) {
  const session = useMarketSession();
  const userId = forUserId ?? session.customerId;
  const { rows } = useCollection('notifications');
  const [open, setOpen] = useState(false);

  const mine = rows
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 15);
  const unread = mine.filter((n) => !n.read).length;

  const markAllRead = async () => {
    const store = getStore();
    for (const n of mine.filter((x) => !x.read)) await store.put('notifications', { ...n, read: true });
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void markAllRead();
        }}
        className="relative rounded-full p-2 text-xl hover:bg-slate-100"
        aria-label="התראות"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-0.5 -start-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-black text-slate-900">התראות</p>
            <div className="max-h-96 overflow-y-auto">
              {mine.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-400">אין התראות עדיין</p>
              )}
              {mine.map((n) => {
                const body = (
                  <div className="border-b border-slate-50 px-4 py-3 hover:bg-slate-50">
                    <p className="text-sm font-bold text-slate-800">{n.title}</p>
                    <p className="text-xs text-slate-500">{n.body}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {new Date(n.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                );
                return n.bookingId && !forUserId ? (
                  <Link key={n.id} href={`/market/orders/${n.bookingId}`} onClick={() => setOpen(false)}>
                    {body}
                  </Link>
                ) : (
                  <div key={n.id}>{body}</div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
