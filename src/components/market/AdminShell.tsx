'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Btn, Card, inputClass } from '@/components/market/ui';
import { market } from '@/lib/market/config';
import { DEMO_ADMIN_PASSWORD, tryAdminLogin, updateSession, useMarketSession } from '@/lib/market/session';
import { isDemoMode } from '@/lib/market/store';

/**
 * Marketplace admin chrome + gate. Demo mode uses the documented local
 * password; with Supabase the real gate is an authenticated user whose
 * mk_profiles.role is admin — RLS blocks everyone else server-side no matter
 * what renders here.
 */

const NAV = [
  { href: '/market/admin', label: 'דשבורד', icon: '📊' },
  { href: '/market/admin/bookings', label: 'עבודות', icon: '🧾' },
  { href: '/market/admin/pros', label: 'בעלי מקצוע', icon: '🧑‍🔧' },
  { href: '/market/admin/customers', label: 'לקוחות', icon: '👥' },
  { href: '/market/admin/areas', label: 'אזורים', icon: '🗺️' },
  { href: '/market/admin/coupons', label: 'קופונים', icon: '🎟️' },
  { href: '/market/admin/settings', label: 'הגדרות', icon: '⚙️' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const session = useMarketSession();
  const pathname = usePathname();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!session.adminAuthed) {
    return (
      <div className="relative z-10 flex min-h-dvh items-center justify-center bg-slate-100 p-4 font-sans" dir="rtl">
        <Card className="w-full max-w-sm p-6">
          <h1 className="text-center text-xl font-black text-slate-900">🛠️ ניהול {market.name}</h1>
          <p className="mt-1 text-center text-sm text-slate-500">כניסת אדמין</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !tryAdminLogin(password) && setError('סיסמה שגויה')}
            placeholder="סיסמה"
            className={`${inputClass} mt-4`}
          />
          {error && <p className="mt-1 text-xs font-bold text-red-600">{error}</p>}
          <Btn className="mt-3 w-full" onClick={() => !tryAdminLogin(password) && setError('סיסמה שגויה')}>
            כניסה
          </Btn>
          {isDemoMode && (
            <p className="mt-3 text-center text-xs text-slate-400">
              מצב הדגמה — הסיסמה: <code className="font-black">{DEMO_ADMIN_PASSWORD}</code>
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-dvh bg-slate-100 font-sans text-slate-900" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-black">🛠️ ניהול {market.name}</p>
          <button onClick={() => updateSession({ adminAuthed: false })} className="text-sm font-bold text-slate-400 hover:text-red-500">
            יציאה
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 text-sm font-bold">
          {NAV.map((item) => {
            const active = item.href === '/market/admin' ? pathname === '/market/admin' : pathname?.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                {item.icon} {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
