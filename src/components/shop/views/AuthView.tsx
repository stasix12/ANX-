'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { actions, useCurrentUser, useShop } from '@/lib/shop/store';
import { ShopFrame } from '../Chrome';
import { Logo } from '../Logo';
import { btn, inputCls } from '../ui';

export function LoginWithParams() {
  const next = useSearchParams().get('next');
  return <LoginView next={next} />;
}

/** Only same-app paths are honoured as ?next= targets (no open redirect). */
const safeNext = (n: string | null) => (n && /^\/shop(\/|$)/.test(n) && !n.startsWith('//') ? n : '/shop/admin');

export function LoginView({ next = null }: { next?: string | null }) {
  const router = useRouter();
  const s = useShop();
  const user = useCurrentUser();
  const [f, setF] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await actions.login(f.email, f.password);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.replace(safeNext(next));
  };

  if (s.ready && user) {
    return (
      <ShopFrame nav={false} back="/">
        <div className="mx-auto max-w-sm px-6 py-16 text-center">
          <p className="text-lg font-bold">מחובר/ת כ-{user.name}</p>
          <Link href={safeNext(next)} className={`${btn.blue} mt-6 h-12 w-full`}>
            המשך
          </Link>
        </div>
      </ShopFrame>
    );
  }

  // Store-owner sign-in for /shop/admin only; customers have no accounts.
  return (
    <ShopFrame nav={false} back="/">
      <div className="mx-auto max-w-md px-5 pt-4 lg:pt-12">
        <div className="text-center">
          <Logo upright className="text-[38px] tracking-[-0.02em]" />
          <h1 className="mt-4 text-[24px] font-black">כניסת מנהל</h1>
        </div>
        <form onSubmit={submit} noValidate className="mt-6 space-y-3">
          <input
            aria-label="אימייל"
            placeholder="אימייל"
            type="email"
            dir="ltr"
            autoComplete="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            className={`${inputCls} text-right placeholder:text-right`}
          />
          <input
            aria-label="סיסמה"
            placeholder="סיסמה"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            className={`${inputCls} text-right placeholder:text-right`}
          />
          {error && (
            <p role="alert" className="rounded-xl bg-[#fdeced] px-4 py-3 text-[14px] font-semibold text-x-red">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={`${btn.primary} h-14 w-full text-[17px]`}>
            {busy ? 'רגע…' : 'התחברות'}
          </button>
        </form>
      </div>
    </ShopFrame>
  );
}
