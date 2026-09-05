'use client';

import { useMemo, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { BellIcon, CheckCircleIcon, ClockIcon, PencilIcon, RepeatIcon, StarIcon, TruckIcon, UsersIcon, WalletIcon, ZapIcon } from '@/components/lc/icons';
import { Field, Select, Textarea, Toggle } from '@/components/lc/ui/forms';
import { Modal } from '@/components/lc/ui/overlay';
import { Badge, Button, Card, CardHeader, PageHeader, Stat, cx } from '@/components/lc/ui/primitives';
import { useToast } from '@/components/lc/ui/toast';
import { recoveredStats } from '@/lib/lc/analytics';
import { useLc } from '@/lib/lc/context';
import { formatDateTime, formatMoney } from '@/lib/lc/format';
import { LOCALE_META } from '@/lib/lc/i18n';
import { previewAutomation, upsertAutomation } from '@/lib/lc/ops';
import type { Automation, Locale } from '@/lib/lc/types';
import { addDays, pick } from '@/lib/lc/util';

const ICONS: Record<Automation['trigger'], React.ComponentType<{ className?: string }>> = { lead_created: ZapIcon, booking_created: CheckCircleIcon, before_appointment: BellIcon, worker_assigned: UsersIcon, worker_on_the_way: TruckIcon, job_completed: CheckCircleIcon, after_completion_review: StarIcon, after_completion_followup: RepeatIcon, reactivation: RepeatIcon, quote_no_reply: WalletIcon };

function delayLabel(min: number, t: ReturnType<typeof useLc>['t']): string {
  if (min === 0) return t('auto.immediately');
  const abs = Math.abs(min);
  const unit = abs % (24 * 60) === 0 ? `${abs / (24 * 60)} ${t('common.days')}` : abs % 60 === 0 ? `${abs / 60} ${t('common.hours')}` : `${abs} ${t('common.minutes')}`;
  return `${unit} ${min < 0 ? t('auto.before') : t('auto.after')}`;
}

export default function AutomationsPage() {
  const { s, t, locale, run } = useLc();
  const toast = useToast();
  const [editing, setEditing] = useState<Automation | null>(null);
  const now = useMemo(() => new Date(), []);
  const recovered = useMemo(() => (s ? recoveredStats(s, addDays(now, -30), now) : null), [s, now]);
  const followUps = s?.automations.filter((a) => a.trigger === 'quote_no_reply').sort((a, b) => a.delayMinutes - b.delayMinutes) ?? [];
  const others = s?.automations.filter((a) => a.trigger !== 'quote_no_reply') ?? [];
  const recentRuns = useMemo(() => (s ? [...s.automationRuns].filter((r) => r.status === 'sent').sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? '')).slice(0, 8) : []), [s]);

  return (
    <Shell title={t('auto.title')}>
      {s && recovered && (
        <>
          <PageHeader title={t('auto.title')} subtitle={t('auto.subtitle')} />

          {/* Follow-up hero */}
          <Card className="overflow-hidden">
            <div className="grid lg:grid-cols-[1fr_320px]">
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-lc-success-soft text-lc-success"><RepeatIcon className="h-5 w-5" /></span>
                  <div>
                    <h2 className="text-lg font-bold text-lc-text">{t('auto.followups')}</h2>
                    <p className="text-sm text-lc-muted">{t('auto.followupsHint')}</p>
                  </div>
                </div>
                <ol className="mt-5 grid gap-3 sm:grid-cols-3">
                  {followUps.map((a, i) => (
                    <li key={a.id} className={cx('relative rounded-xl border p-4', a.enabled ? 'border-lc-border bg-white' : 'border-dashed border-lc-border bg-lc-bg opacity-70')}>
                      <div className="flex items-center justify-between">
                        <span className="lc-tnum grid h-6 w-6 place-items-center rounded-full bg-lc-text text-[11px] font-bold text-white">{i + 1}</span>
                        <Toggle size="sm" checked={a.enabled} onChange={(v) => run((snap) => upsertAutomation(snap, { ...a, enabled: v }))} />
                      </div>
                      <p className="mt-3 text-sm font-bold text-lc-text">{t(`auto.step${i + 1}` as 'auto.step1')}</p>
                      <p className="mt-1 line-clamp-3 text-[13px] text-lc-muted">“{previewAutomation(a, locale)}”</p>
                      <button type="button" onClick={() => setEditing(a)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-lc-primary hover:underline"><PencilIcon className="h-3 w-3" />{t('common.edit')}</button>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="lc-hero relative flex flex-col justify-between p-6">
                <div className="lc-hero-grid absolute inset-0" />
                <div className="relative">
                  <p className="text-sm text-white/80">{t('auto.revenueRecovered')} · 30 {t('common.days')}</p>
                  <p className="lc-tnum mt-2 text-4xl font-bold">{formatMoney(recovered.revenue, locale)}</p>
                </div>
                <div className="relative mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/10 p-3"><p className="lc-tnum text-2xl font-bold">{recovered.leads}</p><p className="text-[11px] text-white/70">{t('auto.leadsRecovered')}</p></div>
                  <div className="rounded-xl bg-white/10 p-3"><p className="lc-tnum text-2xl font-bold">{recovered.bookings}</p><p className="text-[11px] text-white/70">{t('auto.bookingsRecovered')}</p></div>
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader title={t('nav.automations')} subtitle={`${others.filter((a) => a.enabled).length}/${others.length} ${t('common.on').toLowerCase()}`} />
              <ul className="divide-y divide-lc-border px-2 pb-2 pt-3">
                {others.map((a) => {
                  const Icon = ICONS[a.trigger];
                  return (
                    <li key={a.id} className={cx('flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-lc-bg', !a.enabled && 'opacity-60')}>
                      <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', a.enabled ? 'bg-lc-primary-soft text-lc-primary' : 'bg-slate-100 text-slate-400')}><Icon className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-lc-text">{pick(a.name, locale)}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-lc-muted">
                          <Badge size="sm" tone="neutral"><ClockIcon className="h-3 w-3" />{delayLabel(a.delayMinutes, t)}</Badge>
                          <Badge size="sm" tone="neutral">{t(`auto.audience.${a.audience}` as const)}</Badge>
                          <Badge size="sm" tone="neutral">{a.language === 'auto' ? t('auto.langAuto') : LOCALE_META[a.language].native}</Badge>
                        </p>
                        <p className="mt-1 hidden truncate text-[12px] text-lc-faint sm:block">“{previewAutomation(a, locale)}”</p>
                      </div>
                      <button type="button" onClick={() => setEditing(a)} className="grid h-8 w-8 place-items-center rounded-lg text-lc-faint hover:bg-white hover:text-lc-text"><PencilIcon className="h-4 w-4" /></button>
                      <Toggle checked={a.enabled} onChange={(v) => run((snap) => upsertAutomation(snap, { ...a, enabled: v }))} />
                    </li>
                  );
                })}
              </ul>
            </Card>
            <div className="space-y-4">
              <Stat label={t('auto.recentRuns')} value={s.automationRuns.filter((r) => r.status === 'sent' && new Date(r.sentAt ?? 0) >= addDays(now, -30)).length} hint={`30 ${t('common.days')}`} icon={<ZapIcon />} tone="primary" />
              <Card>
                <CardHeader title={t('auto.recentRuns')} />
                <ul className="divide-y divide-lc-border px-5 pb-4 pt-2">
                  {recentRuns.map((r) => {
                    const a = s.automations.find((x) => x.id === r.automationId);
                    const conv = s.conversations.find((c) => c.id === r.conversationId);
                    const cust = conv ? s.customers.find((c) => c.id === conv.customerId) : null;
                    return (
                      <li key={r.id} className="py-2.5">
                        <p className="flex items-center justify-between text-[13px]"><span className="font-semibold text-lc-text">{a ? pick(a.name, locale) : r.automationKey}</span>{r.recoveredValue > 0 && <span className="lc-tnum text-xs font-bold text-lc-success">+{formatMoney(r.recoveredValue, locale)}</span>}</p>
                        <p className="truncate text-xs text-lc-muted">{cust?.name} · {r.renderedMessage}</p>
                        <p className="text-[11px] text-lc-faint">{r.sentAt ? formatDateTime(r.sentAt, locale) : ''}</p>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>

          {editing && (
            <AutomationModal automation={editing} onClose={() => setEditing(null)} onSave={(a) => { run((snap) => upsertAutomation(snap, a)); setEditing(null); toast.success(t('toast.saved')); }} />
          )}
        </>
      )}
    </Shell>
  );
}

function AutomationModal({ automation, onClose, onSave }: { automation: Automation; onClose: () => void; onSave: (a: Automation) => void }) {
  const { t, locale } = useLc();
  const [f, setF] = useState(automation);
  const [lang, setLang] = useState<Locale>(locale);
  const sign = f.delayMinutes < 0 ? -1 : 1;
  const abs = Math.abs(f.delayMinutes);
  const unit = abs >= 1440 && abs % 1440 === 0 ? 1440 : abs >= 60 && abs % 60 === 0 ? 60 : 1;
  return (
    <Modal open onClose={onClose} title={pick(f.name, locale)} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => onSave(f)}>{t('common.save')}</Button></>}>
      <div className="grid gap-4">
        <Toggle checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label={t('common.active')} />
        <div className="grid grid-cols-3 gap-2">
          <Field label={t('auto.delay')}><input type="number" min={0} value={abs / unit} onChange={(e) => setF({ ...f, delayMinutes: sign * Number(e.target.value) * unit })} className="h-10 w-full rounded-xl border border-lc-border px-3 text-sm" dir="ltr" /></Field>
          <Field label=" "><Select value={unit} onChange={(e) => setF({ ...f, delayMinutes: sign * (abs / unit) * Number(e.target.value) })}><option value={1}>{t('common.minutes')}</option><option value={60}>{t('common.hours')}</option><option value={1440}>{t('common.days')}</option></Select></Field>
          <Field label=" "><Select value={sign} onChange={(e) => setF({ ...f, delayMinutes: Number(e.target.value) * abs })} disabled={f.trigger !== 'before_appointment'}><option value={1}>{t('auto.after')}</option><option value={-1}>{t('auto.before')}</option></Select></Field>
        </div>
        {f.audience === 'customer' && (
          <Field label={t('wa.template')} hint={t('wa.templateHint')}>
            <input value={f.whatsappTemplate ?? ''} onChange={(e) => setF({ ...f, whatsappTemplate: e.target.value.trim() || undefined })} placeholder="lc_followup_1" dir="ltr" className="h-10 w-full rounded-xl border border-lc-border px-3 font-mono text-sm" />
          </Field>
        )}
        <Field label={t('common.language')}><Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as Automation['language'] })}><option value="auto">{t('auto.langAuto')}</option>{(['he', 'ru', 'en'] as Locale[]).map((l) => <option key={l} value={l}>{LOCALE_META[l].native}</option>)}</Select></Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-lc-text">{t('auto.message')} <span className="font-normal text-lc-faint">{'{name} {date} {time} {address} {service} {worker} {total}'}</span></span>
            <div role="group" className="inline-flex rounded-lg bg-slate-100 p-0.5">{(['he', 'ru', 'en'] as Locale[]).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={cx('rounded-md px-2 py-0.5 text-[11px] font-bold uppercase', lang === l ? 'bg-white shadow-sm' : 'text-lc-faint')}>{l}</button>)}</div>
          </div>
          <Textarea dir={LOCALE_META[lang].dir} value={f.message[lang] ?? ''} onChange={(e) => setF({ ...f, message: { ...f.message, [lang]: e.target.value } })} />
          <p className="mt-2 rounded-lg bg-lc-bg p-2.5 text-[13px] text-lc-muted" dir={LOCALE_META[lang].dir}>{previewAutomation({ ...f, language: lang }, lang)}</p>
        </div>
      </div>
    </Modal>
  );
}
