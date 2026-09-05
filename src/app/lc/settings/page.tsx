'use client';

import { useEffect, useState } from 'react';
import { Shell, LocaleSwitch } from '@/components/lc/Shell';
import { BuildingIcon, CheckCircleIcon, GlobeIcon, RepeatIcon, ShieldIcon, UsersIcon } from '@/components/lc/icons';
import { Field, Input, Select } from '@/components/lc/ui/forms';
import { Modal } from '@/components/lc/ui/overlay';
import { Avatar, Badge, Button, Card, CardHeader, PageHeader } from '@/components/lc/ui/primitives';
import { useToast } from '@/components/lc/ui/toast';
import { INTEGRATIONS } from '@/lib/lc/adapters';
import { WhatsAppCard } from '@/components/lc/settings/WhatsAppCard';
import { useLc } from '@/lib/lc/context';
import { saveOrganization } from '@/lib/lc/ops';
import type { Industry, Organization } from '@/lib/lc/types';

const INDUSTRIES: Industry[] = ['upholstery_cleaning', 'ac_technician', 'plumbing', 'locksmith', 'pest_control', 'electrician'];

export default function SettingsPage() {
  const { s, t, run, resetDemo, mode, userEmail } = useLc();
  const toast = useToast();
  const [org, setOrg] = useState<Organization | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => {
    if (s && !org) setOrg(s.organization);
  }, [s, org]);

  return (
    <Shell title={t('set.title')}>
      {s && org && (
        <>
          <PageHeader title={t('set.title')} />
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('set.business')} />
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                <Field label={t('agent.businessName')}><Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></Field>
                <Field label={t('common.phone')}><Input value={org.phone} onChange={(e) => setOrg({ ...org, phone: e.target.value })} dir="ltr" /></Field>
                <Field label={t('common.city')}><Input value={org.city} onChange={(e) => setOrg({ ...org, city: e.target.value })} /></Field>
                <Field label={t('set.industry')}>
                  <Select value={org.industry} onChange={(e) => setOrg({ ...org, industry: e.target.value as Industry })}>
                    {INDUSTRIES.map((i) => <option key={i} value={i}>{t(`ind.${i}` as const)}</option>)}
                  </Select>
                </Field>
                <div className="sm:col-span-2 flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="text-[13px] font-semibold text-lc-text">{t('set.uiLanguage')}</span><LocaleSwitch /></div>
                  <Button onClick={() => { run((snap) => saveOrganization(snap, org)); toast.success(t('toast.saved')); }}>{t('common.save')}</Button>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t('set.team')} />
              <ul className="divide-y divide-lc-border px-5 pb-3 pt-2">
                {s.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={m.fullName} />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-lc-text">{m.fullName}</span><span className="block truncate text-xs text-lc-muted" dir="ltr">{m.email}</span></span>
                    <Badge tone={m.role === 'owner' ? 'primary' : 'neutral'} size="sm">{m.role}</Badge>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 border-t border-lc-border px-5 py-3 text-xs text-lc-muted"><ShieldIcon className="h-4 w-4" />{mode === 'live' ? `Supabase Auth · RLS · ${userEmail ?? ''}` : t('common.demoBadge')}</div>
            </Card>

            <WhatsAppCard />

            <Card>
              <CardHeader title={t('set.integrations')} subtitle={t('set.integrationsHint')} />
              <ul className="divide-y divide-lc-border px-5 pb-3 pt-2">
                {INTEGRATIONS.filter((i) => i.key !== 'whatsapp').map((i) => (
                  <li key={i.key} className="flex items-center gap-3 py-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-lc-bg text-lc-muted"><GlobeIcon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-lc-text">{i.name}</span><span className="block truncate text-xs text-lc-muted">{i.adapter.name}</span></span>
                    <Badge tone={i.adapter.connected ? 'success' : 'neutral'} dot size="sm">{i.adapter.connected ? t('set.connected') : t('set.mock')}</Badge>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader title={t('set.data')} />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-lc-border p-3.5">
                  <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-lc-primary-soft text-lc-primary"><BuildingIcon className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-lc-text">{t('shell.workspace')}</p><p className="text-xs text-lc-muted">{s.organization.id} · {s.leads.length} {t('common.leads').toLowerCase()} · {s.jobs.length} {t('nav.jobs').toLowerCase()}</p></div></div>
                  <Badge tone="success" size="sm"><CheckCircleIcon className="h-3 w-3" />{t('common.active')}</Badge>
                </div>
                {s.organization.demo && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-lc-warning/40 bg-lc-warning-soft p-3.5">
                    <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-lc-warning"><RepeatIcon className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-lc-text">{t('set.resetDemo')}</p><p className="text-xs text-lc-muted">{t('set.resetDemoHint')}</p></div></div>
                    <Button variant="secondary" size="sm" onClick={() => setResetOpen(true)}>{t('set.resetDemo')}</Button>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-lc-faint"><UsersIcon className="h-3.5 w-3.5" />Multi-tenant · organization_id on every row · Row Level Security</div>
              </div>
            </Card>
          </div>
          <Modal open={resetOpen} onClose={() => setResetOpen(false)} title={t('set.resetDemo')} size="sm" footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>{t('common.cancel')}</Button><Button variant="danger" onClick={async () => { await resetDemo(); setResetOpen(false); setOrg(null); toast.success(t('common.done')); }}>{t('common.confirm')}</Button></>}>
            <p className="text-sm text-lc-muted">{t('set.resetDemoHint')}</p>
          </Modal>
        </>
      )}
    </Shell>
  );
}
