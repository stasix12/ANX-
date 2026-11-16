'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { useAdminSession } from '@/lib/adminAuth';

/**
 * Shell for the SEO dashboard.
 *
 * Its own shell rather than the CRM's CrmShell: the CRM is a phone-first tool
 * with a bottom tab bar for a technician in a van, while this is a desk tool
 * with wide tables of keyword data. It still lives under /crm, so it inherits
 * that segment's noindex metadata and the same Supabase login — no second auth
 * surface was introduced, which is what the spec's security section asks for.
 *
 * Auth is enforced here the same way CrmShell does it: no session, no render,
 * and a redirect to the existing /crm/login.
 */

const NAV = [
  { href: '/crm/seo', label: 'סקירה', exact: true },
  { href: '/crm/seo/queue', label: 'תור אישור', exact: false },
  { href: '/crm/seo/keywords', label: 'מילות מפתח', exact: false },
  { href: '/crm/seo/performance', label: 'ביצועים', exact: false },
  { href: '/crm/seo/logs', label: 'יומן', exact: false },
] as const;

export function SeoShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { session, loading } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace('/crm/login');
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950">
        <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : Boolean(pathname?.startsWith(href));

  return (
    <div className="min-h-dvh bg-ink-950">
      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-850/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 pt-[env(safe-area-inset-top)] sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-mist-500">הפתרון המבריק · SEO</p>
              <h1 className="truncate text-xl font-black text-mist-100">{title}</h1>
              {subtitle ? <p className="mt-0.5 truncate text-sm text-mist-500">{subtitle}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {action}
              <Link
                href="/crm"
                className="rounded-full border border-ink-800 px-3 py-2 text-sm font-bold text-mist-300 transition hover:bg-ink-900"
              >
                ← לניהול עבודות
              </Link>
            </div>
          </div>

          {/* Horizontal scroll rather than wrapping: five tabs fit a phone
              width only by scrolling, and a wrapped row shifts the content
              down unpredictably. */}
          <nav className="crm-snap -mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {NAV.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                    active
                      ? 'bg-brand-500 text-on-brand'
                      : 'text-mist-300 hover:bg-ink-900'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:px-6">
        {children}
      </main>
    </div>
  );
}

/** A labelled surface. Used for every panel so the grid reads as one system. */
export function Panel({
  title,
  hint,
  action,
  children,
  className = '',
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-ink-800 bg-ink-850 p-5 ${className}`}>
      {title ? (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-mist-100">{title}</h2>
            {hint ? <p className="mt-0.5 text-sm text-mist-500">{hint}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A single number.
 *
 * `value` is a string so a caller can pass "—" for genuinely unknown, which the
 * spec requires over rendering a zero that an operator would act on.
 */
export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-sm font-bold text-mist-500">{label}</p>
      <p className="mt-1 text-3xl font-black tabular-nums text-brand-400">{value}</p>
      {note ? <p className="mt-1 text-xs text-mist-500">{note}</p> : null}
    </div>
  );
}

/**
 * The "this isn't connected" panel.
 *
 * Exists so that a missing integration always looks the same and always names
 * the exact environment variables, instead of each screen inventing its own
 * vague message or, worse, showing zeros.
 */
export function NotConfigured({ what, missing }: { what: string; missing: string[] }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
      <p className="font-extrabold text-mist-100">{what} — לא מחובר</p>
      <p className="mt-2 text-sm leading-relaxed text-mist-300">
        אין נתונים להציג כאן עד שהחיבור יוגדר. הוסיפו את משתני הסביבה הבאים בשרת:
      </p>
      <ul className="mt-3 space-y-1">
        {missing.map((m) => (
          <li key={m} dir="ltr" className="rounded-lg bg-ink-900 px-3 py-1.5 font-mono text-xs text-mist-300">
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Inline error surface — never swallowed, always readable. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm leading-relaxed text-red-300">
      {message}
    </p>
  );
}
