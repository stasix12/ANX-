'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CheckCircleIcon, EyeIcon, EyeOffIcon, SendIcon, SpinnerIcon } from '@/components/icons';
import { Button, Field } from '@/components/social/ui';
import { signInToSocial, signUpToSocial, useSocialSession } from '@/lib/social/auth';
import type { Blame } from '@/lib/social/auth-trouble';
import { checkConnection, verdictText } from '@/lib/social/connection-check';

/**
 * The door /social never had.
 *
 * Until now the only way in was the CRM's login at /crm/login: same origin,
 * same Supabase client, so its session held this app open too. That is fine
 * for the one person who has a CRM and impossible for anybody who does not —
 * a customer had no account, no way to make one, and would have met an empty
 * dashboard with no explanation.
 *
 * Two modes on one screen, because they are the same three fields and a
 * customer who lands on the wrong one should not have to navigate.
 *
 * THE THIRD BLOCK IS NOT DECORATION. This product is two halves — a website
 * where you build, and a program on a PC that publishes — and somebody who
 * signs up without knowing that will build a round, watch nothing happen, and
 * conclude it is broken. So it is said here, before the account exists, rather
 * than in an email after.
 */
function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, loading } = useSocialSession();

  const [mode, setMode] = useState<'in' | 'up'>(params.get('mode') === 'up' ? 'up' : 'in');
  const [business, setBusiness] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /*
   * WHO WAS REFUSED, alongside the sentence saying so.
   *
   * A wrong password gets the sentence and nothing else. Everything else gets
   * the server's own words and a button that asks the project whether it is
   * even there — because the failure this screen was shipped unable to explain
   * was one of those, and the owner spent a morning retyping a correct
   * password at it.
   */
  const [trouble, setTrouble] = useState<{ blame: Blame; detail: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [verdict, setVerdict] = useState('');
  const [sent, setSent] = useState(false);

  /* Already in? Then this screen is a dead end. `replace`, not `push`, so Back
     does not land on a login the person is past. */
  const next = params.get('next');
  useEffect(() => {
    if (!loading && session) router.replace(next && next.startsWith('/social') ? next : '/social');
  }, [loading, session, router, next]);

  if (loading || session) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const up = mode === 'up';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setTrouble(null);
    setVerdict('');
    try {
      const result = up ? await signUpToSocial(email, password, business) : await signInToSocial(email, password);
      if (!result.ok) {
        setError(result.message);
        setTrouble({ blame: result.blame, detail: result.detail });
        return;
      }
      /* Confirmation is on in this project: there is no session yet and the
         inbox is the next step. Saying so is the whole screen at that point. */
      if (result.needsEmailConfirm) {
        setSent(true);
        return;
      }
      router.replace(next && next.startsWith('/social') ? next : '/social');
    } finally {
      setBusy(false);
    }
  }

  /*
   * ASKS THE PROJECT, rather than guessing from here.
   *
   * The key is read from the bundle the same way every other request on this
   * site reads it, travels in a header, and is never rendered — see
   * connection-check.ts. What appears on screen is the project reference and
   * the verdict.
   */
  async function runCheck() {
    if (checking) return;
    setChecking(true);
    setVerdict('');
    try {
      const v = await checkConnection(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        (url, init) => fetch(url, { ...init, cache: 'no-store' }),
      );
      setVerdict(verdictText(v));
    } finally {
      setChecking(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center shadow">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-success-400/12 text-success-400">
            <CheckCircleIcon className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-extrabold text-mist-100">שלחנו לכם מייל</h2>
          <p dir="auto" className="mt-2 text-[13.5px] leading-relaxed text-mist-300">
            פתחו את ההודעה ששלחנו ל־<b className="text-mist-100">{email}</b> ולחצו על הקישור שבה. אחרי זה אפשר להיכנס
            כאן עם אותו מייל וסיסמה.
          </p>
          <Button variant="ghost" className="mt-4 w-full justify-center" onClick={() => { setSent(false); setMode('in'); }}>
            חזרה למסך הכניסה
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-500 text-white shadow-lg">
          <SendIcon className="h-7 w-7" />
        </span>
        <h1 className="text-[28px] font-black leading-tight tracking-tight text-mist-100">הפתרון המבריק</h1>
        <p className="mt-1 text-[13px] font-bold tracking-[2px] text-mist-500">פרסום לקבוצות פייסבוק</p>
      </div>

      <form onSubmit={submit} className="mt-7 rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow">
        <h2 className="text-lg font-extrabold text-mist-100">{up ? 'פתיחת חשבון' : 'ברוכים הבאים'}</h2>
        <p className="mt-1 text-[13px] text-mist-500">
          {up ? 'דקה אחת, ואפשר להתחיל לפרסם.' : 'הזינו את הפרטים כדי להיכנס למערכת.'}
        </p>

        <div className="mt-5 grid gap-3.5">
          {up && (
            <Field label="שם העסק">
              <input
                dir="auto"
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                placeholder="לדוגמה: ניקוי ספות בדרום"
                autoComplete="organization"
                className="min-h-12 w-full rounded-xl border border-ink-700 bg-ink-800 px-3.5 text-[15px] text-mist-100 placeholder:text-mist-500"
              />
            </Field>
          )}
          <Field label="אימייל">
            <input
              dir="ltr"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="min-h-12 w-full rounded-xl border border-ink-700 bg-ink-800 px-3.5 text-[15px] text-mist-100 placeholder:text-mist-500"
            />
          </Field>
          <Field label="סיסמה" hint={up ? 'לפחות 8 תווים' : undefined}>
            <div className="relative">
              <input
                dir="ltr"
                type={reveal ? 'text' : 'password'}
                required
                minLength={up ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={up ? 'new-password' : 'current-password'}
                /* ps-11, not pe-11: the input is dir="ltr" so its padding-start
                   is the LEFT edge, which is where the button sits in this
                   RTL card. Measured — pe put the padding on the right and the
                   eye landed on top of the dots. */
                className="min-h-12 w-full rounded-xl border border-ink-700 bg-ink-800 px-3.5 ps-11 text-[15px] text-mist-100 placeholder:text-mist-500"
              />
              <button
                type="button"
                onClick={() => setReveal(!reveal)}
                aria-label={reveal ? 'הסתר סיסמה' : 'הצג סיסמה'}
                className="absolute inset-y-0 end-0 grid w-11 place-items-center text-mist-500 transition-colors hover:text-mist-100"
              >
                {reveal ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </Field>

          {error && (
            <div role="alert" className="grid gap-2 rounded-xl bg-error-500/10 px-3 py-2.5">
              <p dir="auto" className="text-[13px] font-bold leading-relaxed text-error-400">
                {error}
              </p>
              {/* Not for a wrong password and not for a rate limit: one is the
                  person's to fix by retyping, the other fixes itself in a
                  minute. The rest are somebody else's, and for those the raw
                  answer and the check are the whole value of this block. */}
              {trouble && trouble.blame !== 'you' && trouble.blame !== 'wait' && (
                <>
                  {/* `!error.includes` because the unrecognised case already
                      carries the server's words inside its sentence — the one
                      ending where printing them twice would be the second
                      thing on screen, and the first thing he screenshots. */}
                  {trouble.detail && !error.includes(trouble.detail) && (
                    <p dir="ltr" className="break-words text-start font-mono text-[11px] leading-snug text-mist-500">
                      {trouble.detail}
                    </p>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    busy={checking}
                    onClick={runCheck}
                    className="w-full justify-center"
                  >
                    {checking ? 'בודק את החיבור…' : 'בדיקת חיבור לשרת'}
                  </Button>
                </>
              )}
              {verdict && (
                <p dir="auto" className="rounded-lg bg-ink-900 px-2.5 py-2 text-[12.5px] leading-relaxed text-mist-100">
                  {verdict}
                </p>
              )}
            </div>
          )}

          <Button type="submit" busy={busy} className="mt-1 min-h-12 w-full justify-center text-[15px]">
            {up ? 'פתחו חשבון' : 'כניסה'}
          </Button>
        </div>

        <p className="mt-4 text-center text-[13px] text-mist-500">
          {up ? 'כבר יש לכם חשבון? ' : 'אין לכם עדיין חשבון? '}
          <button
            type="button"
            onClick={() => { setMode(up ? 'in' : 'up'); setError(''); setTrouble(null); setVerdict(''); }}
            className="font-bold text-brand-400 underline underline-offset-2"
          >
            {up ? 'כניסה' : 'פתחו חשבון'}
          </button>
        </p>
      </form>

      <div className="mt-4 rounded-2xl border border-ink-700 bg-ink-800/50 p-4">
        <p className="text-[13px] font-bold text-mist-100">איך זה עובד</p>
        <ol className="mt-2 grid gap-1.5 text-[12.5px] leading-relaxed text-mist-300">
          <li>1. נרשמים כאן ובונים פוסטים וקבוצות — מהטלפון, מכל מקום.</li>
          <li>2. מתקינים את התוכנה על המחשב ומקלידים בה את אותו מייל.</li>
          <li>3. המחשב מפרסם לפי התזמון. הסיסמה של פייסבוק נשארת אצלכם.</li>
        </ol>
      </div>
    </div>
  );
}

/* useSearchParams needs a Suspense boundary, or the whole route opts out of
   static rendering and Next fails the build. */
export default function SocialLoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center"><SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" /></div>}>
      <LoginScreen />
    </Suspense>
  );
}
