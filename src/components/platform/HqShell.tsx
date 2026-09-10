'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageSkeleton } from '@/components/platform/ui';
import { loginAs, logout, resetDemo, usePlatform, useSession } from '@/lib/platform/store';
import type { Role } from '@/lib/platform/types';

/**
 * Shell of the HQ app (sales CRM + admin). Demo login-as picker stands in
 * for Supabase Auth; role gates: economics/settings are admin-only.
 */

const STAFF_ROLES: Role[] = ['super_admin', 'admin', 'sales_manager', 'sales_agent', 'support_agent'];
const ADMIN_ROLES: Role[] = ['super_admin', 'admin'];

const NAV: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: '/hq', label: '🏠 ראשי' },
  { href: '/hq/leads', label: '👥 לידים' },
  { href: '/hq/jobs', label: '🧾 עבודות' },
  { href: '/hq/pros', label: '🧽 מנקים' },
  { href: '/hq/map', label: '🗺️ מפה' },
  { href: '/hq/economics', label: '📊 כלכלה', adminOnly: true },
  { href: '/hq/settings', label: '⚙️ הגדרות', adminOnly: true },
];

const ROLE_LABELS: Partial<Record<Role, string>> = {
  admin: 'Admin',
  sales_agent: 'נציג מכירות',
  sales_manager: 'מנהל מכירות',
  support_agent: 'שירות',
};

export function HqShell({ children }: { children: ReactNode }) {
  const snap = usePlatform();
  const session = useSession();
  const pathname = usePathname();

  if (!snap) return <PageSkeleton />;

  if (!session || !STAFF_ROLES.includes(session.role)) {
    return (
      <div className="crm-page mx-auto max-w-md px-4 py-10">
        <div className="text-center">
          <div className="text-3xl">🎛️</div>
          <h1 className="mt-2 text-2xl font-black text-mist-100">מוקד קלין ישראל</h1>
          <p className="mt-1 text-sm text-mist-500">כניסת דמו — בחרו משתמש</p>
        </div>
        <div className="mt-6 space-y-2">
          {snap.agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => loginAs(a.role, a.id, a.name)}
              className="surface flex w-full items-center justify-between rounded-card p-4 text-start"
            >
              <span>
                <span className="font-bold text-mist-100">{a.name}</span>
                <span className="block text-xs text-mist-500">{ROLE_LABELS[a.role] ?? a.role}</span>
              </span>
              <span className="text-brand-400">←</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isAdmin = ADMIN_ROLES.includes(session.role);
  const nav = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <div className="text-lg font-black text-brand-400">
          ✨ קלין <span className="text-mist-100">HQ</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden font-bold text-mist-300 sm:inline">{session.name}</span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('לאפס את נתוני הדמו לגמרי?')) resetDemo();
            }}
            className="rounded-full bg-ink-800 px-3 py-1.5 font-bold text-mist-500"
          >
            איפוס דמו
          </button>
          <button type="button" onClick={logout} className="rounded-full bg-ink-800 px-3 py-1.5 font-bold text-mist-500">
            יציאה
          </button>
        </div>
      </header>

      <nav className="scrollbar-none -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4">
        {nav.map((item) => {
          const active = item.href === '/hq' ? pathname === '/hq' : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                active ? 'bg-brand-500 text-on-brand' : 'surface text-mist-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

export function useIsAdmin(): boolean {
  const session = useSession();
  return Boolean(session && ADMIN_ROLES.includes(session.role));
}
