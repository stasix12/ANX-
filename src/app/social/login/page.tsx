'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import {
  BoltIcon,
  CalendarIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeOffIcon,
  SendIcon,
  SpinnerIcon,
  UsersIcon,
} from '@/components/icons';
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
 *
 * ─── REBUILT TO THE OWNER'S REFERENCE, 16.11 ──────────────────────────────
 *
 * "התמונה המצורפת היא רפרנס עיצובי מחייב … יש לשחזר אותה ברמת Pixel Perfect."
 *
 * WHAT CHANGED IS THE SURFACE AND ONLY THE SURFACE. Every call into
 * Supabase, every branch, every message and the whole sign-up path are the
 * ones that were here before — "יש להשתמש במנגנוני ההתחברות הקיימים ולא
 * לבנות אותם מחדש". The markup now carries `anxa-` classes whose styles live
 * in globals.css under `.anxa-page`, so no shared component and no shared
 * token moved, and no other screen can change because of this one.
 *
 * TWO THINGS THE REFERENCE DRAWS ARE DELIBERATELY NOT HERE, and the owner's
 * own rule is why: "יש להציג התחברות באמצעות Google רק אם מנגנון ההזדהות
 * נתמך ומוגדר בפועל. אין ליצור כפתור שאינו עובד."
 *
 *   · "המשך עם Google" — there is NO Google identity in this codebase.
 *     Searched: no signInWithOAuth, no signInWithIdToken, no provider
 *     anywhere (server/oauth.ts is Facebook state for the worker, a
 *     different thing entirely). A button here would open nothing.
 *   · "שכחת סיסמה?" — there is no password-reset mechanism either. No
 *     resetPasswordForEmail call exists, and the page a reset link has to
 *     land on does not exist. Adding both is real work on the auth surface,
 *     which this task is not allowed to touch; it is worth doing as its own.
 *
 * Both are a few minutes' work once the provider and the redirect URL are
 * configured in Supabase. Until then this screen tells the truth about what
 * it can do.
 */

/** The one email we remember, and the only thing "זכור אותי" controls. */
const REMEMBER_KEY = 'anx.social.email';

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
  /*
   * "זכור אותי", AND WHAT IT HONESTLY CONTROLS.
   *
   * It does NOT control whether the session survives — Supabase is created
   * once in src/lib/supabase.ts with persistence on, that client is shared
   * with the CRM, and "אין לשנות רכיבים משותפים שעלולים להשפיע על מסכים
   * אחרים" rules out reaching into it from this screen. Staying signed in is
   * already how this app behaves, for everyone, and a checkbox pretending to
   * decide it would be exactly the decorative control the brief forbids.
   *
   * So it controls the one thing this screen genuinely owns: whether the
   * email is waiting in the field next time, on this device. Ticked, it is
   * remembered; cleared, it is forgotten the moment the box is unticked.
   */
  const [remember, setRemember] = useState(true);

  /* The remembered email, read once. In a try/catch because storage throws
     outright in a locked-down browser, and a login screen that crashes on a
     privacy setting is worse than one that forgets an address. */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      /* no storage, no remembered address — the screen works the same */
    }
  }, []);

  /* Already in? Then this screen is a dead end. `replace`, not `push`, so Back
     does not land on a login the person is past. */
  const next = params.get('next');
  useEffect(() => {
    if (!loading && session) router.replace(next && next.startsWith('/social') ? next : '/social');
  }, [loading, session, router, next]);

  if (loading || session) {
    return (
      <div className="anxa-page">
        <div className="grid min-h-dvh place-items-center">
          <SpinnerIcon className="h-8 w-8 animate-spin" style={{ color: '#1272f4' }} />
        </div>
      </div>
    );
  }

  const up = mode === 'up';

  function rememberEmail(value: boolean, address: string) {
    try {
      if (value && address) window.localStorage.setItem(REMEMBER_KEY, address);
      else window.localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* same as above: a storage refusal may not break signing in */
    }
  }

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
      /* Only once the credentials were actually accepted. Remembering an
         address that was just refused would hand the next visit a wrong
         one, pre-filled and looking authoritative. */
      rememberEmail(remember, email);
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
      <div className="anxa-page">
        <span aria-hidden className="anxa-wave anxa-wave-top" />
        <span aria-hidden className="anxa-wave anxa-wave-bottom" />
        <div className="anxa-wrap">
          <div className="anxa-card anxa-sent">
            <span className="anxa-sent-ico">
              <CheckCircleIcon />
            </span>
            <h2 className="anxa-h2">שלחנו לכם מייל</h2>
            <p dir="auto" className="anxa-sub">
              פתחו את ההודעה ששלחנו ל־<b style={{ color: 'var(--a-ink)' }}>{email}</b> ולחצו על הקישור שבה. אחרי זה אפשר
              להיכנס כאן עם אותו מייל וסיסמה.
            </p>
            <button type="button" className="anxa-err-btn" style={{ marginTop: 16 }} onClick={() => { setSent(false); setMode('in'); }}>
              חזרה למסך הכניסה
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="anxa-page">
      <span aria-hidden className="anxa-wave anxa-wave-top" />
      <span aria-hidden className="anxa-wave anxa-wave-bottom" />

      <div className="anxa-wrap">
        <header className="anxa-brand">
          <span className="anxa-logo">
            <SendIcon />
          </span>
          <h1 className="anxa-title">הפתרון המבריק</h1>
          <p className="anxa-tag">פרסום לקבוצות פייסבוק</p>
        </header>

        {/* The three benefit cards, in the reference's own order (RTL: the
            calendar sits first, at the right). Decorative icons, so each is
            aria-hidden and the words carry the meaning. */}
        <ul className="anxa-feats">
          <li className="anxa-feat">
            <CalendarIcon aria-hidden />
            <span>פרסום אוטומטי</span>
          </li>
          <li className="anxa-feat">
            <UsersIcon aria-hidden />
            <span>ריבוי חשבונות</span>
          </li>
          <li className="anxa-feat">
            <BoltIcon aria-hidden />
            <span>מהיר ויעיל</span>
          </li>
        </ul>

        <form onSubmit={submit} className="anxa-card">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size
              decorative asset; next/image would add a layout wrapper around an
              absolutely positioned element for no gain. */}
          <img src="/social/auth-robot.webp" alt="" aria-hidden className="anxa-robot" width={239} height={200} />

          <div className="anxa-head">
            <h2 className="anxa-h2">{up ? 'פתיחת חשבון' : 'ברוכים הבאים'}</h2>
            <p className="anxa-sub">
              {up ? 'דקה אחת, ואפשר להתחיל לפרסם.' : 'הזינו את הפרטים כדי להיכנס למערכת.'}
            </p>
            <span aria-hidden className="anxa-rule" />
          </div>

          <div className="anxa-fields">
            {up && (
              <div>
                <label className="anxa-label" htmlFor="anxa-business">
                  שם העסק
                </label>
                <span className="anxa-box">
                  <span className="anxa-ico">
                    <UsersIcon aria-hidden />
                  </span>
                  <input
                    id="anxa-business"
                    dir="auto"
                    value={business}
                    onChange={(e) => setBusiness(e.target.value)}
                    placeholder="לדוגמה: ניקוי ספות בדרום"
                    autoComplete="organization"
                    className="anxa-input"
                  />
                </span>
              </div>
            )}

            <div>
              <label className="anxa-label" htmlFor="anxa-email">
                אימייל
              </label>
              <span className="anxa-box">
                <span className="anxa-ico">
                  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
                    <path d="m3.5 7 7.4 5.2a2 2 0 0 0 2.2 0L20.5 7" />
                  </svg>
                </span>
                <input
                  id="anxa-email"
                  dir="ltr"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="anxa-input"
                />
              </span>
            </div>

            <div>
              <label className="anxa-label" htmlFor="anxa-password">
                סיסמה
              </label>
              <span className="anxa-box">
                <span className="anxa-ico">
                  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="10.5" width="16" height="10.5" rx="3" />
                    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
                  </svg>
                </span>
                <input
                  id="anxa-password"
                  dir="ltr"
                  type={reveal ? 'text' : 'password'}
                  required
                  minLength={up ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={up ? 'new-password' : 'current-password'}
                  className="anxa-input"
                />
                <button
                  type="button"
                  onClick={() => setReveal(!reveal)}
                  aria-label={reveal ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  className="anxa-eye"
                >
                  {reveal ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </span>
              {up && (
                <span className="anxa-sub" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
                  לפחות 8 תווים
                </span>
              )}
            </div>

            <div className="anxa-row">
              <label className="anxa-remember">
                <input
                  type="checkbox"
                  className="anxa-check"
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    /* Unticking forgets it NOW, not at the next sign-in.
                       A box you clear should take effect when you clear it. */
                    if (!e.target.checked) rememberEmail(false, '');
                  }}
                />
                זכור אותי
              </label>
            </div>

            {error && (
              <div role="alert" className="anxa-err">
                <p dir="auto" className="anxa-err-t">
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
                      <p dir="ltr" className="anxa-err-d">
                        {trouble.detail}
                      </p>
                    )}
                    <button type="button" className="anxa-err-btn" onClick={runCheck} disabled={checking}>
                      {checking ? 'בודק את החיבור…' : 'בדיקת חיבור לשרת'}
                    </button>
                  </>
                )}
                {verdict && (
                  <p dir="auto" className="anxa-verdict">
                    {verdict}
                  </p>
                )}
              </div>
            )}

            <button type="submit" className="anxa-go" disabled={busy} data-busy={busy ? 'true' : 'false'}>
              {busy ? (
                <SpinnerIcon className="animate-spin" />
              ) : (
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 17.5 14.5 13H3.5" />
                  <path d="M14.5 11 10 6.5" />
                  <path d="M14 3.5h4a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5h-4" />
                </svg>
              )}
              {up ? 'פתחו חשבון' : 'כניסה למערכת'}
            </button>
          </div>

          {/*
            NO "או" DIVIDER, because there is nothing on the other side of it.
            The reference puts one between the button and "המשך עם Google";
            with no Google identity in this codebase that divider would
            separate the sign-in button from a line of ordinary text and
            announce a choice the screen cannot offer.
          */}
          <p className="anxa-foot">
            {up ? 'כבר יש לכם חשבון? ' : 'אין לכם עדיין חשבון? '}
            <button
              type="button"
              onClick={() => { setMode(up ? 'in' : 'up'); setError(''); setTrouble(null); setVerdict(''); }}
              className="anxa-link"
            >
              {up ? 'כניסה למערכת' : 'פתחו חשבון חדש'}
            </button>
          </p>
        </form>

        {/* Kept from the screen this replaced, and shown where it earns its
            place: somebody OPENING an account is the person who does not yet
            know there is a program to install. The reference draws the signed-in
            case, which is why it is not in it. */}
        {up && (
          <div className="anxa-how">
            <p>איך זה עובד</p>
            <ol>
              <li>1. נרשמים כאן ובונים פוסטים וקבוצות — מהטלפון, מכל מקום.</li>
              <li>2. מתקינים את התוכנה על המחשב ומקלידים בה את אותו מייל.</li>
              <li>3. המחשב מפרסם לפי התזמון. הסיסמה של פייסבוק נשארת אצלכם.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

/* useSearchParams needs a Suspense boundary, or the whole route opts out of
   static rendering and Next fails the build. */
export default function SocialLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="anxa-page">
          <div className="grid min-h-dvh place-items-center">
            <SpinnerIcon className="h-8 w-8 animate-spin" style={{ color: '#1272f4' }} />
          </div>
        </div>
      }
    >
      <LoginScreen />
    </Suspense>
  );
}
