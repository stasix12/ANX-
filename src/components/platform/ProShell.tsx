'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageSkeleton } from '@/components/platform/ui';
import { cityName } from '@/lib/platform/catalog';
import { loginAs, usePlatform, useSession } from '@/lib/platform/store';

/**
 * Shell of the professionals app: demo login-as picker (Supabase Auth takes
 * this seat in production), bottom navigation, and the current pro's context
 * for the pages inside.
 */

const NAV = [
  { href: '/pro', label: 'עבודות', emoji: '🔥' },
  { href: '/pro/jobs', label: 'שלי', emoji: '🧰' },
  { href: '/pro/wallet', label: 'ארנק', emoji: '💰' },
  { href: '/pro/profile', label: 'פרופיל', emoji: '👤' },
];

export function ProShell({ children }: { children: ReactNode }) {
  const snap = usePlatform();
  const session = useSession();
  const pathname = usePathname();

  if (!snap) return <PageSkeleton />;

  const isPro = session?.role === 'professional';
  const me = isPro ? snap.professionals.find((p) => p.id === session?.userId) : undefined;

  if (!isPro || !me) {
    return (
      <div className="crm-page mx-auto max-w-md px-4 py-10">
        <div className="text-center">
          <div className="text-3xl">🧽</div>
          <h1 className="mt-2 text-2xl font-black text-mist-100">אפליקציית בעלי המקצוע</h1>
          <p className="mt-1 text-sm text-mist-500">כניסת דמו — בחרו עם איזה מנקה להתחבר</p>
        </div>
        <div className="mt-6 space-y-2">
          {snap.professionals
            .filter((p) => p.approved)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => loginAs('professional', p.id, p.name)}
                className="surface flex w-full items-center justify-between rounded-card p-4 text-start"
              >
                <span>
                  <span className="font-bold text-mist-100">{p.name}</span>
                  <span className="block text-xs text-mist-500">
                    {cityName(p.city)} · ⭐ {p.rating} · {p.completedJobs} עבודות
                  </span>
                </span>
                <span className="text-brand-400">←</span>
              </button>
            ))}
        </div>
        <p className="mt-6 text-center text-sm text-mist-500">
          עדיין לא ברשת?{' '}
          <Link href="/pro/join" className="font-bold text-brand-400">
            הצטרפו כבעלי מקצוע
          </Link>
        </p>
      </div>
    );
  }

  if (!me.approved) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="text-4xl">⏳</div>
        <h1 className="mt-3 text-xl font-black text-mist-100">החשבון ממתין לאישור</h1>
        <p className="mt-2 text-sm text-mist-500">נחזור אליך ברגע שהצוות יאשר את הפרופיל.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pb-24">
      {children}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-850/95 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${
                  active ? 'text-brand-500' : 'text-mist-500'
                }`}
              >
                <span className="text-xl">{item.emoji}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
