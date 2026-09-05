'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLc } from '@/lib/lc/context';
import { hasSupabase } from '@/lib/lc/session';
import { LocaleSwitch, Logo } from '@/components/lc/Shell';
import { ArrowRightIcon, BotIcon, CalendarIcon, SparklesIcon, TrendingUpIcon, WalletIcon } from '@/components/lc/icons';
import { Field, Input } from '@/components/lc/ui/forms';
import { Button, cx } from '@/components/lc/ui/primitives';

export default function LoginPage() {
  const { status, t, openDemo, openLive, locale } = useLc();
  const router = useRouter();
  const [tab, setTab] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'ready') router.replace('/lc');
    if (status === 'no_workspace') router.replace('/lc/onboarding');
  }, [status, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    if (tab === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else await openLive();
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (data.session) await openLive();
      else setNotice(t('auth.checkEmail'));
    }
    setBusy(false);
  }

  const bullets = [
    { icon: BotIcon, he: 'סוכן AI שעונה תוך שניות, בעברית, ברוסית ובאנגלית', ru: 'AI-агент отвечает за секунды на иврите, русском и английском', en: 'An AI agent that replies in seconds — Hebrew, Russian, English' },
    { icon: WalletIcon, he: 'מצטט מחירים רק מהמחירון שלכם — לעולם לא ממציא', ru: 'Называет цены только из вашего прайса — никогда не выдумывает', en: 'Quotes only from your price list — never invents a number' },
    { icon: CalendarIcon, he: 'מציע שעות פנויות מהיומן וקובע לבד, בלי כפילויות', ru: 'Предлагает свободные слоты и записывает сам, без накладок', en: 'Offers real free slots and books them — no double bookings' },
    { icon: TrendingUpIcon, he: 'רודף אחרי לידים ששקטו ומחזיר אותם', ru: 'Догоняет замолчавших лидов и возвращает их', en: 'Chases quiet leads and wins them back' },
  ];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="lc-hero relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="lc-hero-grid absolute inset-0" />
        <div className="relative">
          <div className="flex items-center gap-2.5 text-white">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur"><SparklesIcon className="h-5 w-5" /></span>
            <span className="text-lg font-bold tracking-tight">LeadCloser AI</span>
          </div>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-[44px]">{t('auth.tagline')}</h1>
          <ul className="mt-8 space-y-4">
            {bullets.map((b) => (
              <li key={b.en} className="flex items-start gap-3 text-[15px] text-white/90">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/15"><b.icon className="h-4 w-4" /></span>
                {b[locale]}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative grid grid-cols-3 gap-3">
          {[
            { v: '₪28,400', l: { he: 'הכנסה חודשית ממוצעת ללקוח', ru: 'средняя месячная выручка клиента', en: 'avg monthly revenue per customer' } },
            { v: '41%', l: { he: 'המרה ליד ← הזמנה', ru: 'конверсия лид → запись', en: 'lead-to-booking conversion' } },
            { v: '< 10s', l: { he: 'זמן תגובה ראשון', ru: 'время первого ответа', en: 'first response time' } },
          ].map((x) => (
            <div key={x.v} className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p className="lc-tnum text-2xl font-bold" dir="ltr">{x.v}</p>
              <p className="mt-1 text-xs text-white/70">{x.l[locale]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col px-5 py-8 sm:px-10 lg:justify-center">
        <div className="mb-8 flex items-center justify-between lg:absolute lg:end-8 lg:top-6">
          <span className="lg:hidden"><Logo /></span>
          <LocaleSwitch />
        </div>
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-2xl font-bold tracking-tight text-lc-text sm:text-3xl">{t('auth.title')}</h2>
          <p className="mt-2 text-sm text-lc-muted lg:hidden">{t('auth.tagline')}</p>

          <button
            type="button"
            onClick={() => void openDemo()}
            className="group mt-8 flex w-full items-center gap-4 rounded-2xl border border-lc-border bg-white p-4 text-start shadow-lc-card transition-all hover:-translate-y-0.5 hover:border-lc-primary-ring hover:shadow-lc-hover"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-lc-primary to-lc-violet text-white shadow-lc-primary"><SparklesIcon className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-lc-text">{t('auth.demo')}</span>
              <span className="mt-0.5 block text-[13px] text-lc-muted">{t('auth.demoHint')}</span>
            </span>
            <ArrowRightIcon className="h-5 w-5 shrink-0 text-lc-faint transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </button>

          <div className="my-7 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-lc-faint">
            <span className="h-px flex-1 bg-lc-border" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-lc-border" />
          </div>

          {!hasSupabase ? (
            <p className="rounded-xl border border-dashed border-lc-border bg-lc-bg p-4 text-center text-sm text-lc-muted">{t('auth.noSupabase')}</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div role="group" className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                {(['in', 'up'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={cx('rounded-lg py-2 transition-all', tab === k ? 'bg-white text-lc-text shadow-[0_1px_3px_rgba(15,23,42,0.12)]' : 'text-lc-muted')}>
                    {k === 'in' ? t('auth.signIn') : t('auth.signUp')}
                  </button>
                ))}
              </div>
              <Field label={t('auth.email')}>
                <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
              </Field>
              <Field label={t('auth.password')}>
                <Input type="password" autoComplete={tab === 'in' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
              </Field>
              {error && <p className="text-sm font-medium text-lc-danger">{error}</p>}
              {notice && <p className="rounded-lg bg-lc-success-soft p-3 text-sm font-medium text-lc-success">{notice}</p>}
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                {tab === 'in' ? t('auth.signIn') : t('auth.signUp')}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
