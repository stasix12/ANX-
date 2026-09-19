'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { signIn, useAdminSession } from '@/lib/adminAuth';

type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * Where to land after sign-in: ?next=/social etc., same-origin paths only.
 *
 * The destination is RESOLVED against this origin and the origins compared,
 * rather than the string being pattern-matched. The old test was
 * `next.startsWith('/') && !next.startsWith('//')`, and a backslash walks
 * straight through it: browsers normalise `\` to `/` inside a URL, so
 * `?next=/\attacker.tld/x` starts with a single `/`, passes, and then resolves
 * to `http://attacker.tld/x`. Measured in Chromium against this page: with
 * `?next=/%5Cevil.example.com/steal` an already-signed-in session left the
 * origin entirely and the browser ended up on evil.example.com.
 *
 * That matters here more than on most pages, because this IS the login page:
 * a link to `…/crm/login?next=/\attacker.tld/crm/login` shows the owner the
 * real sign-in screen, then hands them a copy of it to type their password
 * into. The URL they were told to check looks right the whole way.
 *
 * new URL() does the normalisation the same way the browser will, so whatever
 * it says the origin is, is what a navigation would actually reach. Anything
 * that does not parse, or lands anywhere else, goes to /crm.
 */
function safeNext(): string {
  if (typeof window === 'undefined') return '/crm';
  const next = new URLSearchParams(window.location.search).get('next') ?? '';
  if (!next) return '/crm';
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return '/crm';
    // Path + query + hash only: never the absolute form, so this cannot be
    // handed to a router as an off-origin address even by mistake.
    return `${url.pathname}${url.search}${url.hash}` || '/crm';
  } catch {
    return '/crm';
  }
}

/** The sky the user would see outside right now. */
function skyPhaseNow(): SkyPhase {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/**
 * CRM sign-in. Same Supabase auth as the store's admin panel — one admin
 * account opens both — but lands on the CRM dashboard instead of /admin.
 */
export default function CrmLoginPage() {
  const router = useRouter();
  const { session, loading } = useAdminSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sky, setSky] = useState<SkyPhase>('day');

  // Set after mount (the prerendered HTML can't know the visitor's clock);
  // ?sky=night etc. forces a phase for previewing.
  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get('sky');
    if (override === 'dawn' || override === 'day' || override === 'dusk' || override === 'night') {
      setSky(override);
      return;
    }
    setSky(skyPhaseNow());
    const timer = setInterval(() => setSky(skyPhaseNow()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loading && session) router.replace(safeNext());
  }, [loading, session, router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const message = await signIn(email, password);
    setSubmitting(false);
    if (message) {
      setError(message);
      return;
    }
    router.replace(safeNext());
  }

  if (loading || session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950">
        <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div
      className={`relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10 crm-sky-${sky}`}
    >
      {/* Living layers over the photographic sky: drifting clouds, the
          breathing sun/moon glow, and after dark — twinkling stars. */}
      <div aria-hidden className="crm-clouds-drift" />
      <div aria-hidden className="crm-glow" />
      <div aria-hidden className="crm-stars" />
      <div aria-hidden className="crm-stars-2" />
      <div aria-hidden className="crm-shooting" />
      {/* Soap bubbles drifting up the whole screen — the business, animated. */}
      <div aria-hidden className="crm-login-bubbles">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="relative w-full max-w-sm">
        <div className="text-center">
          {/* Pure typography — the name carries the brand on any sky. */}
          <h1 className="crm-login-brand whitespace-nowrap text-[44px] font-black leading-tight tracking-tight">
            <span className="crm-brand-a">הפתרון</span> <span className="crm-brand-b">המבריק</span>
          </h1>
          <p className="crm-login-title mt-3 text-3xl font-extrabold tracking-tight">ניהול עבודות</p>
          <p className="crm-login-sub mt-1.5 text-base font-semibold text-mist-500">לידים ועבודות ניקיון</p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-card border border-ink-700 surface p-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-bold">
              אימייל
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3.5 text-base outline-none transition-colors focus:border-brand-500"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-bold">
              סיסמה
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3.5 text-base outline-none transition-colors focus:border-brand-500"
              dir="ltr"
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-xl bg-red-600/10 px-3 py-2.5 text-sm font-semibold text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-base font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-60"
          >
            {submitting ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : null}
            כניסה
          </button>
        </form>
      </div>
    </div>
  );
}
