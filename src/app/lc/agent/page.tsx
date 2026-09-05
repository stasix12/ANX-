'use client';

import { useEffect, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { TestChat } from '@/components/lc/agent/TestChat';
import { WorkingHoursEditor } from '@/components/lc/agent/WorkingHoursEditor';
import { BotIcon, LanguagesIcon, PlusIcon, ShieldIcon, TrashIcon, WrenchIcon, XIcon } from '@/components/lc/icons';
import { ChipGroup, Field, Input, Select, Textarea, Toggle } from '@/components/lc/ui/forms';
import { Badge, Button, Card, CardHeader, PageHeader, cx } from '@/components/lc/ui/primitives';
import { useToast } from '@/components/lc/ui/toast';
import { useLc } from '@/lib/lc/context';
import { LOCALE_META } from '@/lib/lc/i18n';
import { saveSettings } from '@/lib/lc/ops';
import type { AgentSettings, Locale, Tone } from '@/lib/lc/types';
import { pick } from '@/lib/lc/util';

const TONES: Tone[] = ['friendly', 'professional', 'direct', 'warm', 'custom'];

export default function AgentPage() {
  const { s, t, locale, run } = useLc();
  const toast = useToast();
  const [form, setForm] = useState<AgentSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [areaDraft, setAreaDraft] = useState('');
  const [neverDraft, setNeverDraft] = useState('');
  const [kwDraft, setKwDraft] = useState('');

  useEffect(() => {
    if (s && !form) setForm(s.settings);
  }, [s, form]);

  const update = (patch: Partial<AgentSettings>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setDirty(true);
  };

  const save = () => {
    if (!form) return;
    run((snap) => saveSettings(snap, form));
    setDirty(false);
    toast.success(t('toast.saved'));
  };

  return (
    <Shell title={t('agent.title')}>
      {s && form && (
        <>
          <PageHeader
            title={
              <span className="flex items-center gap-3">
                {t('agent.title')}
                <Badge tone={s.organization.active ? 'success' : 'neutral'} dot>{s.organization.active ? t('shell.agentLive') : t('shell.agentOff')}</Badge>
              </span>
            }
            subtitle={t('agent.subtitle')}
            actions={
              <Button onClick={save} disabled={!dirty} size="lg">
                {t('common.save')}
              </Button>
            }
          />

          <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
            <div className="space-y-5">
              {/* Identity */}
              <Card>
                <CardHeader title={t('agent.identity')} />
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label={t('agent.businessName')}>
                    <Input value={form.businessName} onChange={(e) => update({ businessName: e.target.value })} />
                  </Field>
                  <Field label={t('agent.agentName')}>
                    <Input value={form.agentName} onChange={(e) => update({ agentName: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <p className="mb-1.5 text-[13px] font-semibold text-lc-text">{t('agent.tone')}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {TONES.map((tone) => (
                        <button key={tone} type="button" aria-pressed={form.tone === tone} onClick={() => update({ tone })} className={cx('rounded-xl border p-3 text-start transition-all', form.tone === tone ? 'border-lc-primary bg-lc-primary-soft shadow-[0_0_0_1px_var(--color-lc-primary)]' : 'border-lc-border bg-white hover:border-lc-border-strong')}>
                          <span className="block text-lg">{{ friendly: '🙂', professional: '💼', direct: '🎯', warm: '💙', custom: '✍️' }[tone]}</span>
                          <span className={cx('mt-1 block text-sm font-semibold', form.tone === tone ? 'text-lc-primary' : 'text-lc-text')}>{t(`tone.${tone}` as const)}</span>
                        </button>
                      ))}
                    </div>
                    {form.tone === 'custom' && <Textarea className="mt-3" placeholder={t('agent.customTone')} value={form.customTone} onChange={(e) => update({ customTone: e.target.value })} />}
                  </div>
                  <div className="sm:col-span-2">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-lc-text"><LanguagesIcon className="h-4 w-4 text-lc-faint" />{t('agent.languages')}</p>
                    <ChipGroup multiple value={form.languages} onChange={(v) => v.length && update({ languages: v as Locale[] })} options={(['he', 'ru', 'en'] as Locale[]).map((l) => ({ value: l, label: `${LOCALE_META[l].flag} ${LOCALE_META[l].native}` }))} />
                  </div>
                  <Field label={t('agent.description')} className="sm:col-span-2">
                    <Textarea value={form.description} onChange={(e) => update({ description: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <p className="mb-1.5 text-[13px] font-semibold text-lc-text">{t('agent.greeting')} <span className="font-normal text-lc-faint">{'{name} {agent} {business}'}</span></p>
                    <div className="grid gap-2 md:grid-cols-3">
                      {form.languages.map((l) => (
                        <Textarea key={l} dir={LOCALE_META[l].dir} className="min-h-[72px]" placeholder={`${LOCALE_META[l].flag} ${LOCALE_META[l].native}`} value={form.greeting[l] ?? ''} onChange={(e) => update({ greeting: { ...form.greeting, [l]: e.target.value } })} />
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Services & areas */}
              <Card>
                <CardHeader title={`${t('agent.services')} · ${t('agent.serviceAreas')}`} action={<Button href="/lc/pricing" variant="secondary" size="sm" icon={<WrenchIcon className="h-3.5 w-3.5" />}>{t('nav.pricing')}</Button>} />
                <div className="p-5">
                  <div className="flex flex-wrap gap-2">
                    {s.services.filter((x) => x.active).map((svc) => (
                      <span key={svc.id} className="inline-flex items-center gap-2 rounded-full bg-lc-bg px-3 py-1.5 text-[13px] font-medium text-lc-text">
                        {pick(svc.name, locale)} <span className="lc-tnum font-bold text-lc-primary">₪{svc.basePrice}</span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-5 mb-1.5 text-[13px] font-semibold text-lc-text">{t('agent.serviceAreas')} <span className="font-normal text-lc-faint">({t('common.all')} = {form.serviceAreas.length === 0 ? '✓' : '✗'})</span></p>
                  <div className="flex flex-wrap items-center gap-2">
                    {form.serviceAreas.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-full border border-lc-border bg-white px-3 py-1 text-[13px] font-medium">
                        {a}
                        <button type="button" onClick={() => update({ serviceAreas: form.serviceAreas.filter((x) => x !== a) })} className="text-lc-faint hover:text-lc-danger"><XIcon className="h-3 w-3" /></button>
                      </span>
                    ))}
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (areaDraft.trim()) update({ serviceAreas: [...form.serviceAreas, areaDraft.trim()] });
                        setAreaDraft('');
                      }}
                    >
                      <Input value={areaDraft} onChange={(e) => setAreaDraft(e.target.value)} placeholder={t('common.city')} className="h-8 w-40 rounded-full" />
                      <Button type="submit" size="sm" variant="secondary" icon={<PlusIcon className="h-3.5 w-3.5" />}>{t('common.add')}</Button>
                    </form>
                  </div>
                </div>
              </Card>

              {/* Working hours */}
              <Card>
                <CardHeader title={t('agent.workingHours')} />
                <div className="grid gap-5 p-5 lg:grid-cols-[1fr_220px]">
                  <WorkingHoursEditor value={form.workingHours} onChange={(v) => update({ workingHours: v })} />
                  <div className="space-y-4">
                    <Field label={t('agent.slotMinutes')}>
                      <Select value={form.slotMinutes} onChange={(e) => update({ slotMinutes: Number(e.target.value) })}>
                        {[15, 30, 60].map((m) => (
                          <option key={m} value={m}>{m} {t('common.minutes')}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t('agent.travelBuffer')}>
                      <Select value={form.travelBufferMin} onChange={(e) => update({ travelBufferMin: Number(e.target.value) })}>
                        {[0, 15, 30, 45, 60].map((m) => (
                          <option key={m} value={m}>{m} {t('common.minutes')}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t('agent.offerSlots')}>
                      <Select value={form.offerSlotsCount} onChange={(e) => update({ offerSlotsCount: Number(e.target.value) })}>
                        {[1, 2, 3].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>
              </Card>

              {/* Behaviour */}
              <Card>
                <CardHeader title={t('agent.behaviour')} />
                <div className="space-y-4 p-5">
                  <Toggle checked={form.askForPhotos} onChange={(v) => update({ askForPhotos: v })} label={t('agent.askPhotos')} />
                  <Toggle checked={form.autoBook} onChange={(v) => update({ autoBook: v })} label={t('agent.autoBook')} />
                  <div className="flex items-start gap-3 rounded-xl bg-lc-primary-soft p-3.5 text-[13px] text-lc-primary">
                    <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    {t('agent.honesty')}
                  </div>
                </div>
              </Card>

              {/* FAQ */}
              <Card>
                <CardHeader title={t('agent.faqs')} action={<Button size="sm" variant="secondary" icon={<PlusIcon className="h-3.5 w-3.5" />} onClick={() => update({ faqs: [...form.faqs, { question: {}, answer: {} }] })}>{t('agent.addFaq')}</Button>} />
                <div className="space-y-3 p-5">
                  {form.faqs.map((faq, i) => (
                    <div key={i} className="rounded-xl border border-lc-border p-3">
                      <div className="flex items-start gap-2">
                        <div className="grid flex-1 gap-2 md:grid-cols-2">
                          <Input placeholder={`${t('agent.question')} (${LOCALE_META[locale].native})`} value={faq.question[locale] ?? ''} onChange={(e) => update({ faqs: form.faqs.map((f, j) => (j === i ? { ...f, question: { ...f.question, [locale]: e.target.value } } : f)) })} />
                          <Input placeholder={`${t('agent.answer')} (${LOCALE_META[locale].native})`} value={faq.answer[locale] ?? ''} onChange={(e) => update({ faqs: form.faqs.map((f, j) => (j === i ? { ...f, answer: { ...f.answer, [locale]: e.target.value } } : f)) })} />
                        </div>
                        <button type="button" onClick={() => update({ faqs: form.faqs.filter((_, j) => j !== i) })} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lc-faint hover:bg-lc-danger-soft hover:text-lc-danger"><TrashIcon className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Never say + handoff */}
              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <CardHeader title={t('agent.neverSay')} />
                  <div className="p-5">
                    <ul className="space-y-1.5">
                      {form.neverSay.map((p, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-lc-danger-soft px-3 py-2 text-[13px] text-lc-danger">
                          <span className="truncate">“{p}”</span>
                          <button type="button" onClick={() => update({ neverSay: form.neverSay.filter((_, j) => j !== i) })}><XIcon className="h-3.5 w-3.5" /></button>
                        </li>
                      ))}
                    </ul>
                    <form
                      className="mt-3 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (neverDraft.trim()) update({ neverSay: [...form.neverSay, neverDraft.trim()] });
                        setNeverDraft('');
                      }}
                    >
                      <Input value={neverDraft} onChange={(e) => setNeverDraft(e.target.value)} placeholder={t('agent.addPhrase')} />
                      <Button type="submit" variant="secondary" icon={<PlusIcon className="h-4 w-4" />} />
                    </form>
                  </div>
                </Card>
                <Card>
                  <CardHeader title={t('agent.handoff')} />
                  <div className="space-y-3 p-5">
                    <Toggle size="sm" checked={form.handoffRules.onAngry} onChange={(v) => update({ handoffRules: { ...form.handoffRules, onAngry: v } })} label={t('agent.handoff.angry')} />
                    <Toggle size="sm" checked={form.handoffRules.onDiscountRequest} onChange={(v) => update({ handoffRules: { ...form.handoffRules, onDiscountRequest: v } })} label={t('agent.handoff.discount')} />
                    <Toggle size="sm" checked={form.handoffRules.onComplaint} onChange={(v) => update({ handoffRules: { ...form.handoffRules, onComplaint: v } })} label={t('agent.handoff.complaint')} />
                    <p className="pt-2 text-[13px] font-semibold text-lc-text">{t('agent.handoff.keywords')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {form.handoffRules.keywords.map((k) => (
                        <span key={k} className="inline-flex items-center gap-1 rounded-full bg-lc-bg px-2.5 py-1 text-xs font-medium">
                          {k}
                          <button type="button" onClick={() => update({ handoffRules: { ...form.handoffRules, keywords: form.handoffRules.keywords.filter((x) => x !== k) } })}><XIcon className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (kwDraft.trim()) update({ handoffRules: { ...form.handoffRules, keywords: [...form.handoffRules.keywords, kwDraft.trim()] } });
                        setKwDraft('');
                      }}
                    >
                      <Input value={kwDraft} onChange={(e) => setKwDraft(e.target.value)} placeholder={t('agent.addPhrase')} />
                      <Button type="submit" variant="secondary" icon={<PlusIcon className="h-4 w-4" />} />
                    </form>
                  </div>
                </Card>
              </div>
            </div>

            <div className="xl:sticky xl:top-8 xl:self-start">
              <TestChat settings={form} />
              <p className="mt-3 flex items-start gap-2 text-[12px] text-lc-muted"><BotIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('pricing.subtitle')}</p>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
