'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NotificationsBell } from '@/components/market/NotificationsBell';
import { JobOfferPopup } from '@/components/market/JobOfferPopup';
import { market } from '@/lib/market/config';
import { tickDispatch } from '@/lib/market/engine';
import { useCollection, useTicker } from '@/lib/market/hooks';
import { updateSession, useMarketSession } from '@/lib/market/session';
import { getStore, nowIso } from '@/lib/market/store';

/**
 * Professional app chrome: bottom nav, notification bell, the global "new
 * job" popup, and two background duties — a heartbeat that keeps this pro's
 * availability fresh while online, and a dispatch tick so offer countdowns
 * expire even when only the pro's tab is open.
 */

const NAV = [
  { href: '/pro/app', label: 'בית', icon: '🏠' },
  { href: '/pro/app/jobs', label: 'עבודות', icon: '🧽' },
  { href: '/pro/app/map', label: 'מפה', icon: '🗺️' },
  { href: '/pro/app/earnings', label: 'הכנסות', icon: '💰' },
  { href: '/pro/app/profile', label: 'פרופיל', icon: '👤' },
];

export function ProShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useMarketSession();
  const { rows: offers } = useCollection('offers');
  const { rows: availability } = useCollection('availability');

  const proId = session.activeProId;
  const myAvailability = availability.find((a) => a.professionalId === proId);
  const online = myAvailability?.online ?? false;

  // No pro signed in → back to the pro landing to pick/join. The session
  // hydrates from localStorage in an effect, so the first render always has
  // proId === null; gate the redirect on a ready flag that flips in the same
  // effect pass, after the session has synced.
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => setSessionReady(true), []);
  useEffect(() => {
    if (sessionReady && !proId) router.replace('/pro');
  }, [sessionReady, proId, router]);

  // Heartbeat + offer expiry.
  useTicker(() => {
    if (!proId) return;
    if (online && myAvailability) {
      void getStore().put('availability', { ...myAvailability, heartbeatAt: nowIso() });
    }
    for (const offer of offers.filter((o) => o.professionalId === proId && o.status === 'sent')) {
      void tickDispatch(offer.bookingId);
    }
  }, 10000);

  const pendingOffer = proId
    ? offers.find(
        (o) =>
          o.professionalId === proId &&
          o.status === 'sent' &&
          o.kind === 'dispatch' &&
          (!o.expiresAt || Date.parse(o.expiresAt) > Date.now()),
      )
    : undefined;

  return (
    <div className="relative z-10 min-h-dvh bg-slate-50 pb-20 font-sans text-slate-900 md:pb-8" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/pro/app" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-lg text-white shadow-sm">🧽</span>
            <span className="text-lg font-black tracking-tight text-slate-900">
              {market.name} <span className="text-emerald-600">Pro</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className={`hidden rounded-full px-3 py-1 text-xs font-black sm:block ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {online ? '● זמין לעבודות' : '○ לא זמין'}
            </span>
            {proId && <NotificationsBell forUserId={proId} />}
          </div>
        </div>
      </header>

      {children}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg justify-around">
          {NAV.map((item) => {
            const active = item.href === '/pro/app' ? pathname === '/pro/app' : pathname?.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] font-bold ${active ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {pendingOffer && <JobOfferPopup offer={pendingOffer} />}
    </div>
  );
}

export function proLogout(router: { replace: (p: string) => void }) {
  updateSession({ activeProId: null });
  router.replace('/pro');
}
