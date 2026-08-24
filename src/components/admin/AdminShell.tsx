'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  BoxIcon,
  ClipboardListIcon,
  GearIcon,
  SpinnerIcon,
  UsersIcon,
} from '@/components/icons';
import { useAdminSession } from '@/lib/adminAuth';

const navItems = [
  { href: '/admin/products', label: 'מוצרים', icon: BoxIcon },
  { href: '/admin/orders', label: 'הזמנות', icon: ClipboardListIcon },
  { href: '/admin/customers', label: 'לקוחות', icon: UsersIcon },
  { href: '/admin/settings', label: 'הגדרות', icon: GearIcon },
];

/**
 * Wraps every screen under /admin except the login page itself. Redirects to
 * /admin/login the moment there is no session — this is a UX convenience,
 * not the real access control (see adminAuth.ts); Supabase RLS is what
 * actually stops an unauthorized write.
 */
export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { session, loading } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace('/admin/login');
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950">
        <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ink-950 pb-20">
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-850/95 px-4 py-4 backdrop-blur-lg">
        <h1 className="text-lg font-extrabold">{title}</h1>
      </header>

      <div className="px-4 py-5">{children}</div>

      <nav
        aria-label="ניווט ראשי בפאנל הניהול"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-850/95 backdrop-blur-lg"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className={`flex flex-col items-center gap-1 py-2.5 text-xs font-semibold transition-colors ${
                    active ? 'text-brand-700' : 'text-mist-500'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
