'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { NotificationsBell } from '@/components/market/NotificationsBell';
import { LanguageProvider, LanguageSwitcher, useLang } from '@/components/market/LanguageProvider';
import { market } from '@/lib/market/config';
import { isDemoMode } from '@/lib/market/store';

/**
 * Customer app chrome: light theme over the site's dark body, top bar with
 * brand + language + notification bell, and a mobile bottom navigation.
 * Also registers the marketplace service worker (PWA install + offline
 * shell + the push handler stub).
 */

const NAV = [
  { href: '/market', key: 'home', icon: '🏠' },
  { href: '/market/pros', key: 'search', icon: '🔎' },
  { href: '/market/orders', key: 'orders', icon: '🧾' },
  { href: '/market/messages', key: 'messages', icon: '💬' },
  { href: '/market/profile', key: 'profile', icon: '👤' },
];

function BottomNav() {
  const pathname = usePathname();
  const { t } = useLang();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-lg justify-around">
        {NAV.map((item) => {
          const active =
            item.href === '/market' ? pathname === '/market' : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] font-bold ${active ? 'text-sky-600' : 'text-slate-400'}`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {t(item.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function TopBar() {
  const pathname = usePathname();
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/market" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-600 text-lg text-white shadow-sm">
            ✨
          </span>
          <span className="text-lg font-black tracking-tight text-slate-900">{market.name}</span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm font-bold text-slate-600 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 hover:bg-slate-100 ${
                (item.href === '/market' ? pathname === '/market' : pathname?.startsWith(item.href))
                  ? 'text-sky-700'
                  : ''
              }`}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/pro"
            className="hidden rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:text-sky-700 sm:block"
          >
            אני בעל מקצוע
          </Link>
          <LanguageSwitcher />
          <NotificationsBell />
        </div>
      </div>
    </header>
  );
}

export function MarketShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/market-sw.js').catch(() => {});
    }
  }, []);

  // The admin panel lives under /market/admin but has its own chrome.
  if (pathname?.startsWith('/market/admin')) return <>{children}</>;

  return (
    <LanguageProvider>
      <div className="relative z-10 min-h-dvh bg-slate-50 pb-20 font-sans text-slate-900 md:pb-8">
        <TopBar />
        {isDemoMode && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-[11px] font-bold text-amber-800">
            מצב הדגמה — הנתונים נשמרים בדפדפן בלבד. חיבור Supabase יהפוך הכול לאמיתי (ראו README).
          </div>
        )}
        {children}
        <BottomNav />
      </div>
    </LanguageProvider>
  );
}
