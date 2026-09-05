'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LocaleSwitch, Logo } from '@/components/lc/Shell';
import { TestChat } from '@/components/lc/agent/TestChat';
import { WorkingHoursEditor } from '@/components/lc/agent/WorkingHoursEditor';
import { ArrowRightIcon, CheckIcon, PlusIcon, RocketIcon, SparklesIcon, TrashIcon } from '@/components/lc/icons';
import { ChipGroup, Field, Input, Textarea } from '@/components/lc/ui/forms';
import { Button, Card, cx } from '@/components/lc/ui/primitives';
import { useLc } from '@/lib/lc/context';
import { LOCALE_META } from '@/lib/lc/i18n';
import { saveOrganization, saveSettings, upsertService } from '@/lib/lc/ops';
import { TEMPLATES } from '@/lib/lc/templates';
import type { AgentSettings, Industry, Locale, Service, Snapshot, Tone } from '@/lib/lc/types';
import { pick, uid } from '@/lib/lc/util';
import { createBlankWorkspace } from '@/lib/lc/workspace';

const STEPS = ['ob.step1', 'ob.step2', 'ob.step3', 'ob.step4', 'ob.step5', 'ob.step6', 'ob.step7'] as const;
const INDUSTRIES: Industry[] = ['upholstery_cleaning', 'ac_technician', 'plumbing', 'locksmith', 'pest_control', 'electrician'];

/**
 * Seven-step onboarding. Works in two situations:
 *  - a signed-in user without a workspace (live mode): step 1+2 create the organisation in Supabase,
 *  - an existing workspace that is not yet active: continues from the saved step.
 */
export default function OnboardingPage() {
  const { status, s, t, locale, run, createLiveWorkspace, userEmail, userId, mode, openDemo } = useLc();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [biz, setBiz] = useState({ name: '', phone: '', city: '', owner: '' });
  const [industry, setIndustry] = useState<Industry>('upholstery_cleaning');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [newSvc, setNewSvc] = useState({ name: '', price: '' });

  useEffect(() => {
    if (status === 'signed_out') router.replace('/lc/login');
    if (status === 'ready' && s) {
      if (s.organization.active) router.replace('/lc');
      else {
        setStep(Math.max(2, s.organization.onboardingStep));
        setBiz({ name: s.organization.name, phone: s.organization.phone, city: s.organization.city, owner: s.members[0]?.fullName ?? '' });
        setIndustry(s.organization.industry);
        setSettings((prev) => prev ?? s.settings);
      }
    }
  }, [status, s, router]);

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  async function createWorkspace() {
    setBusy(true);
    setError(null);
    try {
      const snap: Snapshot = createBlankWorkspace({ name: biz.name.trim(), industry, locale, city: biz.city.trim(), phone: biz.phone.trim(), ownerEmail: userEmail ?? '', ownerName: biz.owner.trim() || biz.name.trim(), ownerUserId: userId ?? 'local' });
      snap.organization.onboardingStep = 2;
      await createLiveWorkspace(snap);
      setStep(2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/lc_create_workspace/.test(msg)) setError(`${msg} — run supabase/leadcloser-upgrade-1.sql in the Supabase SQL Editor.`);
      else if (/not signed in|JWT/i.test(msg)) setError(`${msg} — sign out and sign in again.`);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const persistStep = (n: number) => {
    if (!s) return;
    run((snap) => saveOrganization(snap, { ...snap.organization, name: biz.name || snap.organization.name, phone: biz.phone, city: biz.city, industry, onboardingStep: n }));
    if (settings) run((snap) => saveSettings(snap, settings));
  };

  const next = async () => {
    if (step === 0) {
      if (!biz.name.trim() || !biz.phone.trim()) return setError(t('common.required'));
      setError(null);
      return setStep(1);
    }
    if (step === 1) {
      if (!s) return createWorkspace();
      persistStep(2);
      return setStep(2);
    }
    persistStep(step + 1);
    setStep(step + 1);
  };

  const activate = () => {
    if (!s) return;
    if (settings) run((snap) => saveSettings(snap, { ...settings, businessName: settings.businessName || biz.name }));
    run((snap) => saveOrganization(snap, { ...snap.organization, active: true, onboardingStep: 7 }));
    setStep(7);
  };

  const hasWorkspace = Boolean(s);

  return (
    <div className="min-h-dvh bg-lc-bg">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          {!hasWorkspace && mode !== 'demo' && <button type="button" className="text-xs font-semibold text-lc-muted hover:text-lc-text" onClick={() => void openDemo().then(() => router.replace('/lc'))}>{t('ob.skipDemo')}</button>}
          <LocaleSwitch />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        {step < 7 ? (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-lc-text sm:text-3xl">{t('ob.title')}</h1>
              <p className="mt-1 text-sm text-lc-muted">{t('ob.subtitle')}</p>
            </div>
            <ol className="mb-3 hidden grid-cols-7 gap-1 sm:grid">
              {STEPS.map((k, i) => (
                <li key={k} className="text-center">
                  <span className={cx('mx-auto grid h-7 w-7 place-items-center rounded-full text-xs font-bold transition-colors', i < step ? 'bg-lc-success text-white' : i === step ? 'bg-lc-primary text-white shadow-lc-primary' : 'bg-white text-lc-faint ring-1 ring-lc-border')}>{i < step ? <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}</span>
                  <span className={cx('mt-1 block text-[11px] font-semibold', i === step ? 'text-lc-primary' : 'text-lc-faint')}>{t(k)}</span>
                </li>
              ))}
            </ol>
            <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-lc-border"><div className="h-full rounded-full bg-gradient-to-l from-lc-primary to-lc-violet transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>

            <Card className="p-6 sm:p-8 animate-lc-pop" key={step}>
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-lc-primary">{step + 1}/7 · {t(STEPS[step])}</p>

              {step === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('agent.businessName')} className="sm:col-span-2"><Input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} autoFocus /></Field>
                  <Field label={t('common.phone')}><Input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} dir="ltr" inputMode="tel" /></Field>
                  <Field label={t('common.city')}><Input value={biz.city} onChange={(e) => setBiz({ ...biz, city: e.target.value })} /></Field>
                  <Field label={t('common.name')} className="sm:col-span-2"><Input value={biz.owner} onChange={(e) => setBiz({ ...biz, owner: e.target.value })} /></Field>
                </div>
              )}

              {step === 1 && (
                <div>
                  <p className="mb-4 text-sm text-lc-muted">{t('ob.industryHint')}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {INDUSTRIES.map((ind) => {
                      const avail = TEMPLATES[ind].available;
                      return (
                        <button key={ind} type="button" disabled={!avail} aria-pressed={industry === ind} onClick={() => setIndustry(ind)} className={cx('rounded-xl border p-4 text-start transition-all disabled:cursor-not-allowed disabled:opacity-60', industry === ind ? 'border-lc-primary bg-lc-primary-soft shadow-[0_0_0_1px_var(--color-lc-primary)]' : 'border-lc-border bg-white hover:border-lc-border-strong')}>
                          <span className="text-2xl">{{ upholstery_cleaning: '🛋️', ac_technician: '❄️', plumbing: '🔧', locksmith: '🔑', pest_control: '🐜', electrician: '⚡' }[ind]}</span>
                          <span className="mt-2 block text-sm font-semibold text-lc-text">{t(`ind.${ind}` as const)}</span>
                          {!avail && <span className="mt-1 block text-[11px] font-semibold text-lc-faint">{t('ind.soon')}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && s && (
                <div>
                  <ul className="divide-y divide-lc-border rounded-xl border border-lc-border">
                    {s.services.map((svc) => (
                      <li key={svc.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="flex-1 text-sm font-medium text-lc-text">{pick(svc.name, locale)}</span>
                        <span className="text-lc-faint">₪</span>
                        <input type="number" value={svc.basePrice} onChange={(e) => run((snap) => upsertService(snap, { ...svc, basePrice: Number(e.target.value) }))} className="lc-tnum h-8 w-24 rounded-lg border border-lc-border px-2 text-end text-sm" dir="ltr" />
                        <button type="button" onClick={() => run((snap) => upsertService(snap, { ...svc, active: !svc.active }))} className={cx('text-xs font-semibold', svc.active ? 'text-lc-success' : 'text-lc-faint')}>{svc.active ? t('common.active') : t('common.inactive')}</button>
                      </li>
                    ))}
                  </ul>
                  <form
                    className="mt-3 flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newSvc.name.trim() || !Number(newSvc.price)) return;
                      const svc: Service = { id: uid('svc'), organizationId: s.organization.id, name: { [locale]: newSvc.name.trim() }, basePrice: Number(newSvc.price), unit: 'item', durationMin: 60, category: 'other', keywords: { [locale]: newSvc.name.trim().toLowerCase() }, active: true, sortOrder: s.services.length };
                      run((snap) => upsertService(snap, svc));
                      setNewSvc({ name: '', price: '' });
                    }}
                  >
                    <Input value={newSvc.name} onChange={(e) => setNewSvc({ ...newSvc, name: e.target.value })} placeholder={t('common.service')} className="flex-1" />
                    <Input value={newSvc.price} onChange={(e) => setNewSvc({ ...newSvc, price: e.target.value })} placeholder="₪" className="w-24" dir="ltr" type="number" />
                    <Button type="submit" variant="secondary" icon={<PlusIcon className="h-4 w-4" />}>{t('common.add')}</Button>
                  </form>
                </div>
              )}

              {step === 3 && settings && <WorkingHoursEditor value={settings.workingHours} onChange={(v) => setSettings({ ...settings, workingHours: v })} />}

              {step === 4 && settings && (
                <div className="grid gap-4">
                  <Field label={t('agent.agentName')}><Input value={settings.agentName} onChange={(e) => setSettings({ ...settings, agentName: e.target.value })} /></Field>
                  <div>
                    <p className="mb-1.5 text-[13px] font-semibold text-lc-text">{t('agent.tone')}</p>
                    <ChipGroup value={[settings.tone]} onChange={(v) => setSettings({ ...settings, tone: v[0] as Tone })} options={(['friendly', 'professional', 'direct', 'warm'] as Tone[]).map((tone) => ({ value: tone, label: t(`tone.${tone}` as const) }))} />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[13px] font-semibold text-lc-text">{t('agent.languages')}</p>
                    <ChipGroup multiple value={settings.languages} onChange={(v) => v.length && setSettings({ ...settings, languages: v as Locale[] })} options={(['he', 'ru', 'en'] as Locale[]).map((l) => ({ value: l, label: `${LOCALE_META[l].flag} ${LOCALE_META[l].native}` }))} />
                  </div>
                  <Field label={t('agent.description')}><Textarea value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} /></Field>
                </div>
              )}

              {step === 5 && settings && <TestChat settings={{ ...settings, businessName: settings.businessName || biz.name }} />}

              {step === 6 && s && settings && (
                <div className="text-center">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-lc-primary to-lc-violet text-white shadow-lc-primary"><RocketIcon className="h-8 w-8" /></span>
                  <h2 className="mt-4 text-xl font-bold text-lc-text">{t('ob.summary')}</h2>
                  <ul className="mx-auto mt-4 max-w-sm space-y-2 text-start text-sm">
                    <li className="flex justify-between rounded-lg bg-lc-bg px-3 py-2"><span className="text-lc-muted">{t('agent.businessName')}</span><b>{biz.name || s.organization.name}</b></li>
                    <li className="flex justify-between rounded-lg bg-lc-bg px-3 py-2"><span className="text-lc-muted">{t('agent.services')}</span><b>{s.services.filter((x) => x.active).length}</b></li>
                    <li className="flex justify-between rounded-lg bg-lc-bg px-3 py-2"><span className="text-lc-muted">{t('agent.agentName')}</span><b>{settings.agentName} · {t(`tone.${settings.tone}` as const)}</b></li>
                    <li className="flex justify-between rounded-lg bg-lc-bg px-3 py-2"><span className="text-lc-muted">{t('agent.languages')}</span><b>{settings.languages.map((l) => LOCALE_META[l].flag).join(' ')}</b></li>
                  </ul>
                  <Button size="lg" className="mt-6" icon={<SparklesIcon className="h-5 w-5" />} onClick={activate}>{t('ob.activate')}</Button>
                </div>
              )}

              {error && <p className="mt-4 text-sm font-medium text-lc-danger">{error}</p>}

              {step < 6 && (
                <div className="mt-8 flex items-center justify-between border-t border-lc-border pt-5">
                  <Button variant="ghost" disabled={step === 0 || (step === 2 && hasWorkspace && !s?.organization.demo && false)} onClick={() => setStep(Math.max(0, step - 1))}>{t('common.back')}</Button>
                  <Button onClick={() => void next()} loading={busy} icon={<ArrowRightIcon className="h-4 w-4 rtl:rotate-180" />}>{t('common.next')}</Button>
                </div>
              )}
            </Card>
          </>
        ) : (
          <Card className="mt-10 p-10 text-center animate-lc-pop">
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-lc-success-soft text-lc-success"><CheckIcon className="h-10 w-10" strokeWidth={3} /></span>
            <h1 className="mt-5 text-3xl font-bold text-lc-text">{t('ob.activated')}</h1>
            <p className="mt-2 text-lc-muted">{t('ob.activatedSub')}</p>
            <Button size="lg" className="mt-8" href="/lc" icon={<ArrowRightIcon className="h-5 w-5 rtl:rotate-180" />}>{t('ob.goDashboard')}</Button>
          </Card>
        )}
      </main>
      <span className="hidden"><TrashIcon /></span>
    </div>
  );
}
