'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { signIn, useAdminSession } from '@/lib/adminAuth';

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

  useEffect(() => {
    if (!loading && session) router.replace('/crm');
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
    router.replace('/crm');
  }

  if (loading || session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950">
        <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink-950 px-5 py-10">
      {/* Soap bubbles drifting up the whole screen — the business, animated. */}
      <div aria-hidden className="crm-login-bubbles">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="relative w-full max-w-sm">
        <div className="text-center">
          <p className="text-3xl">🫧</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">ניהול עבודות</p>
          <p className="mt-1 text-sm text-mist-500">לידים ועבודות ניקיון</p>
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
