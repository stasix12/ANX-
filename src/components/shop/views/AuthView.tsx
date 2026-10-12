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
const safeNext = (n: string | null) => (n && /^\/shop(\/|$)/.test(n) && !n.startsWith('//') ? n : '/shop/account');

export function LoginView({ next = null }: { next?: string | null }) {
  const router = useRouter();
  const s = useShop();
  const user = useCurrentUser();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = mode === 'login' ? await actions.login(f.email, f.password) : await actions.register(f);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.replace(safeNext(next));
  };

  if (s.ready && user) {
    return (
      <ShopFrame nav="profile" back="/shop">
        <div className="mx-auto max-w-sm px-6 py-16 text-center">
          <p className="text-lg font-bold">את/ה כבר מחובר/ת כ-{user.name}</p>
          <Link href={safeNext(next)} className={`${btn.blue} mt-6 h-12 w-full`}>
            המשך
          </Link>
        </div>
      </ShopFrame>
    );
  }

  return (
    <ShopFrame nav="profile" back="/shop">
      <div className="mx-auto max-w-md px-5 pt-4 lg:pt-12">
        <div className="text-center">
          <Logo className="text-[38px]" />
          <h1 className="mt-4 text-[24px] font-black">{mode === 'login' ? 'התחברות לחשבון' : 'יצירת חשבון חדש'}</h1>
          <p className="mt-1 text-[14px] text-x-muted">לשמירת הזמנות, כתובות ומועדפים</p>
        </div>
        <div className="mt-6 grid grid-cols-2 rounded-full bg-x-soft p-1" role="tablist">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`h-10 rounded-full text-[14px] font-bold transition ${mode === m ? 'bg-white text-x-ink shadow-sm' : 'text-x-muted'}`}
            >
              {m === 'login' ? 'התחברות' : 'הרשמה'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} noValidate className="mt-5 space-y-3">
          {mode === 'register' && (
            <>
              <input aria-label="שם מלא" placeholder="שם מלא" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
              <input aria-label="טלפון (אופציונלי)" placeholder="טלפון (אופציונלי)" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} />
            </>
          )}
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
            placeholder={mode === 'register' ? 'סיסמה (לפחות 8 תווים)' : 'סיסמה'}
            type="password"
            dir="ltr"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
            {busy ? 'רגע…' : mode === 'login' ? 'התחברות' : 'יצירת חשבון'}
          </button>
        </form>
        <p className="mt-6 rounded-2xl bg-x-soft p-4 text-[12px] leading-relaxed text-x-muted">
          <b className="text-x-ink-2">מצב הדגמה:</b> החשבונות נשמרים בדפדפן הזה בלבד עד לחיבור מסד הנתונים. כניסת מנהל לדוגמה:{' '}
          <span dir="ltr" className="font-mono">admin@anx3d.demo</span> / <span dir="ltr" className="font-mono">anx3d-admin</span>
        </p>
      </div>
    </ShopFrame>
  );
}
