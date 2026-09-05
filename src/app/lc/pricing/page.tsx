'use client';

import { useMemo, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { PencilIcon, PlusIcon, TagIcon, TrashIcon, ZapIcon } from '@/components/lc/icons';
import { Checkbox, Field, Input, NumberStepper, Select, Toggle } from '@/components/lc/ui/forms';
import { Modal } from '@/components/lc/ui/overlay';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, cx } from '@/components/lc/ui/primitives';
import { useToast } from '@/components/lc/ui/toast';
import { useLc } from '@/lib/lc/context';
import { formatDuration, formatMoney } from '@/lib/lc/format';
import { LOCALE_META } from '@/lib/lc/i18n';
import { removeRule, removeService, upsertRule, upsertService } from '@/lib/lc/ops';
import { calculatePrice } from '@/lib/lc/pricing';
import type { PricingRule, PricingRuleType, Service, ServiceUnit } from '@/lib/lc/types';
import { pick, uid } from '@/lib/lc/util';

const RULE_TYPES: PricingRuleType[] = ['min_order', 'quantity_discount', 'package_discount', 'location_surcharge', 'urgent_surcharge', 'extra', 'custom'];

export default function PricingPage() {
  const { s, t, locale, run } = useLc();
  const toast = useToast();
  const [editing, setEditing] = useState<Service | null>(null);
  const [ruleEditing, setRuleEditing] = useState<PricingRule | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [city, setCity] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);

  const items = useMemo(() => Object.entries(qty).filter(([, q]) => q > 0).map(([serviceId, quantity]) => ({ serviceId, quantity })), [qty]);
  const result = useMemo(() => (s ? calculatePrice({ items, city, urgent, extras }, s.services, s.pricingRules, locale) : null), [s, items, city, urgent, extras, locale]);

  const ruleSummary = (r: PricingRule) => {
    const svc = (id?: string) => pick(s?.services.find((x) => x.id === id)?.name, locale, '?');
    switch (r.type) {
      case 'min_order': return `≥ ${formatMoney(r.config.minimum ?? 0, locale)}`;
      case 'quantity_discount': return `${svc(r.config.serviceId)} ×${r.config.fromQuantity} → −${r.config.percentOff}%`;
      case 'package_discount': return `${(r.config.serviceIds ?? []).map(svc).join(' + ')} → −${formatMoney(r.config.amountOff ?? 0, locale)}`;
      case 'location_surcharge': return `${(r.config.cities ?? []).slice(0, 3).join(', ')} → +${formatMoney(r.config.amount ?? 0, locale)}`;
      case 'urgent_surcharge': return `+${r.config.percent}%`;
      case 'extra': return `+${formatMoney(r.config.amount ?? 0, locale)}`;
      default: return r.config.description ?? '';
    }
  };

  return (
    <Shell title={t('pricing.title')} wide>
      {s && (
        <>
          <PageHeader title={t('pricing.title')} subtitle={t('pricing.subtitle')} actions={<Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setEditing({ id: uid('svc'), organizationId: s.organization.id, name: {}, basePrice: 0, unit: 'item', durationMin: 60, category: 'other', keywords: {}, active: true, sortOrder: s.services.length })}>{t('pricing.addService')}</Button>} />
          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            <div className="space-y-5">
              <Card className="overflow-hidden">
                <CardHeader title={t('agent.services')} subtitle={`${s.services.filter((x) => x.active).length} ${t('common.active').toLowerCase()}`} />
                <table className="mt-3 w-full text-sm">
                  <thead className="bg-lc-bg text-[11px] font-bold uppercase tracking-wider text-lc-faint">
                    <tr>
                      <th className="px-5 py-2.5 text-start">{t('common.service')}</th>
                      <th className="hidden px-4 py-2.5 text-start md:table-cell">{t('pricing.keywords')}</th>
                      <th className="px-4 py-2.5 text-end">{t('pricing.duration')}</th>
                      <th className="px-4 py-2.5 text-end">{t('pricing.basePrice')}</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-lc-border">
                    {[...s.services].sort((a, b) => a.sortOrder - b.sortOrder).map((svc) => (
                      <tr key={svc.id} className={cx('group', !svc.active && 'opacity-50')}>
                        <td className="px-5 py-3">
                          <p className="font-semibold text-lc-text">{pick(svc.name, locale)}</p>
                          <p className="text-xs text-lc-muted">{[svc.name.he, svc.name.ru, svc.name.en].filter((x) => x && x !== pick(svc.name, locale)).join(' · ')}</p>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(pick(svc.keywords, locale) || '').split(',').filter(Boolean).slice(0, 4).map((k) => <span key={k} className="rounded-md bg-lc-bg px-1.5 py-0.5 text-[11px] text-lc-muted">{k.trim()}</span>)}
                          </div>
                        </td>
                        <td className="lc-tnum px-4 py-3 text-end text-lc-muted">{formatDuration(svc.durationMin, locale)}</td>
                        <td className="px-4 py-3 text-end"><span className="lc-tnum font-bold text-lc-text">{formatMoney(svc.basePrice, locale)}</span> <span className="text-xs text-lc-faint">{t(`unit.${svc.unit}` as const)}</span></td>
                        <td className="px-4 py-3 text-end">
                          <div className="flex items-center justify-end gap-1">
                            <Toggle size="sm" checked={svc.active} onChange={(v) => run((snap) => upsertService(snap, { ...svc, active: v }))} />
                            <button type="button" onClick={() => setEditing(svc)} className="grid h-8 w-8 place-items-center rounded-lg text-lc-faint hover:bg-lc-bg hover:text-lc-text"><PencilIcon className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card>
                <CardHeader title={t('pricing.rules')} action={<Button size="sm" variant="secondary" icon={<PlusIcon className="h-3.5 w-3.5" />} onClick={() => setRuleEditing({ id: uid('rule'), organizationId: s.organization.id, type: 'package_discount', name: {}, active: true, config: {} })}>{t('pricing.addRule')}</Button>} />
                {s.pricingRules.length === 0 ? (
                  <EmptyState icon={<ZapIcon />} title={t('pricing.rules')} />
                ) : (
                  <ul className="divide-y divide-lc-border px-2 pb-2 pt-3">
                    {s.pricingRules.map((r) => (
                      <li key={r.id} className={cx('flex items-center gap-3 px-3 py-3', !r.active && 'opacity-50')}>
                        <Badge tone={r.type.includes('discount') ? 'success' : r.type.includes('surcharge') ? 'warning' : r.type === 'extra' ? 'violet' : 'neutral'} size="sm">{t(`rule.${r.type}` as const)}</Badge>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-lc-text">{pick(r.name, locale)}</span>
                          <span className="lc-tnum block truncate text-xs text-lc-muted">{ruleSummary(r)}</span>
                        </span>
                        <Toggle size="sm" checked={r.active} onChange={(v) => run((snap) => upsertRule(snap, { ...r, active: v }))} />
                        <button type="button" onClick={() => setRuleEditing(r)} className="grid h-8 w-8 place-items-center rounded-lg text-lc-faint hover:bg-lc-bg hover:text-lc-text"><PencilIcon className="h-4 w-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Simulator */}
            <Card className="xl:sticky xl:top-8 xl:self-start">
              <CardHeader title={t('pricing.simulator')} subtitle={t('pricing.simulatorHint')} />
              <div className="space-y-3 p-5">
                <ul className="divide-y divide-lc-border rounded-xl border border-lc-border">
                  {s.services.filter((x) => x.active).map((svc) => (
                    <li key={svc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-sm text-lc-text">{pick(svc.name, locale)}</span>
                      <NumberStepper value={qty[svc.id] ?? 0} onChange={(v) => setQty({ ...qty, [svc.id]: v })} />
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('common.city')}><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="חיפה / Хайфа" /></Field>
                  <div className="flex items-end pb-2"><Toggle size="sm" checked={urgent} onChange={setUrgent} label={t('pricing.urgent')} /></div>
                </div>
                {s.pricingRules.filter((r) => r.type === 'extra' && r.active).length > 0 && (
                  <div className="space-y-1.5">
                    {s.pricingRules.filter((r) => r.type === 'extra' && r.active).map((r) => (
                      <Checkbox key={r.id} checked={extras.includes(r.id)} onChange={(v) => setExtras(v ? [...extras, r.id] : extras.filter((x) => x !== r.id))} label={`${pick(r.name, locale)} (+${formatMoney(r.config.amount ?? 0, locale)})`} />
                    ))}
                  </div>
                )}
                {result && result.lines.length > 0 ? (
                  <div className="rounded-xl bg-lc-text p-4 text-white">
                    <ul className="space-y-1 text-[13px]">
                      {result.lines.map((l) => <li key={l.serviceId} className="flex justify-between"><span>{l.label}{l.quantity > 1 ? ` ×${l.quantity}` : ''}</span><span className="lc-tnum">{formatMoney(l.total, locale)}</span></li>)}
                      {result.adjustments.map((a, i) => <li key={i} className={cx('flex justify-between', a.amount < 0 ? 'text-emerald-300' : 'text-amber-300')}><span>{a.label}</span><span className="lc-tnum">{a.amount < 0 ? '−' : '+'}{formatMoney(Math.abs(a.amount), locale)}</span></li>)}
                    </ul>
                    <div className="mt-3 flex items-end justify-between border-t border-white/15 pt-3">
                      <span className="text-sm text-white/70">{t('common.total')} · {formatDuration(result.durationMin, locale)}</span>
                      <span className="lc-tnum text-3xl font-bold">{formatMoney(result.total, locale)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-lc-border p-6 text-center text-sm text-lc-muted"><TagIcon className="mx-auto mb-2 h-6 w-6 text-lc-faint" />{t('pricing.simulatorHint')}</div>
                )}
              </div>
            </Card>
          </div>

          {editing && (
            <ServiceModal
              service={editing}
              onClose={() => setEditing(null)}
              onSave={(svc) => { run((snap) => upsertService(snap, svc)); setEditing(null); toast.success(t('toast.saved')); }}
              onDelete={s.services.some((x) => x.id === editing.id) ? () => { run((snap) => removeService(snap, editing.id)); setEditing(null); } : undefined}
            />
          )}
          {ruleEditing && (
            <RuleModal
              rule={ruleEditing}
              services={s.services}
              onClose={() => setRuleEditing(null)}
              onSave={(r) => { run((snap) => upsertRule(snap, r)); setRuleEditing(null); toast.success(t('toast.saved')); }}
              onDelete={s.pricingRules.some((x) => x.id === ruleEditing.id) ? () => { run((snap) => removeRule(snap, ruleEditing.id)); setRuleEditing(null); } : undefined}
            />
          )}
        </>
      )}
    </Shell>
  );
}

function ServiceModal({ service, onClose, onSave, onDelete }: { service: Service; onClose: () => void; onSave: (s: Service) => void; onDelete?: () => void }) {
  const { t } = useLc();
  const [f, setF] = useState(service);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={t('common.service')} footer={<>{onDelete && <Button variant="danger" icon={<TrashIcon className="h-4 w-4" />} onClick={onDelete} className="me-auto">{t('common.delete')}</Button>}<Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => { if (!f.name.he && !f.name.ru && !f.name.en) return setErr(t('common.required')); if (f.basePrice <= 0) return setErr(t('common.required')); onSave(f); }}>{t('common.save')}</Button></>}>
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {(['he', 'ru', 'en'] as const).map((l) => (
            <Field key={l} label={`${LOCALE_META[l].flag} ${t('common.name')}`}><Input dir={LOCALE_META[l].dir} value={f.name[l] ?? ''} onChange={(e) => setF({ ...f, name: { ...f.name, [l]: e.target.value } })} /></Field>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t('pricing.basePrice')}><Input type="number" min={0} value={f.basePrice} onChange={(e) => setF({ ...f, basePrice: Number(e.target.value) })} dir="ltr" /></Field>
          <Field label={t('pricing.duration')}><Input type="number" min={5} step={5} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} dir="ltr" /></Field>
          <Field label="Unit"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as ServiceUnit })}>{(['item', 'seat', 'sqm', 'hour'] as ServiceUnit[]).map((u) => <option key={u} value={u}>{t(`unit.${u}` as const)}</option>)}</Select></Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['he', 'ru', 'en'] as const).map((l) => (
            <Field key={l} label={`${LOCALE_META[l].flag} ${t('pricing.keywords')}`} hint=", "><Input dir={LOCALE_META[l].dir} value={f.keywords[l] ?? ''} onChange={(e) => setF({ ...f, keywords: { ...f.keywords, [l]: e.target.value } })} /></Field>
          ))}
        </div>
        {err && <p className="text-sm font-medium text-lc-danger">{err}</p>}
      </div>
    </Modal>
  );
}

function RuleModal({ rule, services, onClose, onSave, onDelete }: { rule: PricingRule; services: Service[]; onClose: () => void; onSave: (r: PricingRule) => void; onDelete?: () => void }) {
  const { t, locale } = useLc();
  const [f, setF] = useState(rule);
  const cfg = (patch: PricingRule['config']) => setF({ ...f, config: { ...f.config, ...patch } });
  return (
    <Modal open onClose={onClose} title={t('pricing.rules')} footer={<>{onDelete && <Button variant="danger" icon={<TrashIcon className="h-4 w-4" />} onClick={onDelete} className="me-auto">{t('common.delete')}</Button>}<Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => onSave({ ...f, name: Object.keys(f.name).length ? f.name : { [locale]: t(`rule.${f.type}` as const) } })}>{t('common.save')}</Button></>}>
      <div className="grid gap-3">
        <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as PricingRuleType, config: {} })}>{RULE_TYPES.map((rt) => <option key={rt} value={rt}>{t(`rule.${rt}` as const)}</option>)}</Select></Field>
        <Field label={`${t('common.name')} (${LOCALE_META[locale].native})`}><Input value={f.name[locale] ?? ''} onChange={(e) => setF({ ...f, name: { ...f.name, [locale]: e.target.value } })} /></Field>
        {f.type === 'min_order' && <Field label={t('rule.min_order')}><Input type="number" value={f.config.minimum ?? 0} onChange={(e) => cfg({ minimum: Number(e.target.value) })} dir="ltr" /></Field>}
        {f.type === 'quantity_discount' && (
          <div className="grid grid-cols-3 gap-2">
            <Field label={t('common.service')}><Select value={f.config.serviceId ?? ''} onChange={(e) => cfg({ serviceId: e.target.value })}><option value="" />{services.map((sv) => <option key={sv.id} value={sv.id}>{pick(sv.name, locale)}</option>)}</Select></Field>
            <Field label="≥ qty"><Input type="number" value={f.config.fromQuantity ?? 2} onChange={(e) => cfg({ fromQuantity: Number(e.target.value) })} dir="ltr" /></Field>
            <Field label="% off"><Input type="number" value={f.config.percentOff ?? 10} onChange={(e) => cfg({ percentOff: Number(e.target.value) })} dir="ltr" /></Field>
          </div>
        )}
        {f.type === 'package_discount' && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {services.map((sv) => { const on = (f.config.serviceIds ?? []).includes(sv.id); return <button key={sv.id} type="button" aria-pressed={on} onClick={() => cfg({ serviceIds: on ? (f.config.serviceIds ?? []).filter((x) => x !== sv.id) : [...(f.config.serviceIds ?? []), sv.id] })} className={cx('rounded-full border px-3 py-1 text-xs font-semibold', on ? 'border-lc-primary bg-lc-primary-soft text-lc-primary' : 'border-lc-border text-lc-muted')}>{pick(sv.name, locale)}</button>; })}
            </div>
            <Field label="₪ off"><Input type="number" value={f.config.amountOff ?? 30} onChange={(e) => cfg({ amountOff: Number(e.target.value) })} dir="ltr" /></Field>
          </>
        )}
        {f.type === 'location_surcharge' && (
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Field label={t('common.city')} hint=", "><Input value={(f.config.cities ?? []).join(', ')} onChange={(e) => cfg({ cities: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
            <Field label="+₪"><Input type="number" value={f.config.amount ?? 50} onChange={(e) => cfg({ amount: Number(e.target.value) })} dir="ltr" /></Field>
          </div>
        )}
        {f.type === 'urgent_surcharge' && <Field label="+%"><Input type="number" value={f.config.percent ?? 15} onChange={(e) => cfg({ percent: Number(e.target.value) })} dir="ltr" /></Field>}
        {f.type === 'extra' && (
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Field label="+₪"><Input type="number" value={f.config.amount ?? 50} onChange={(e) => cfg({ amount: Number(e.target.value) })} dir="ltr" /></Field>
            <Field label={t('pricing.keywords')}><Input value={f.config.keywords?.[locale] ?? ''} onChange={(e) => cfg({ keywords: { ...f.config.keywords, [locale]: e.target.value } })} /></Field>
          </div>
        )}
        {f.type === 'custom' && <Field label={t('common.notes')}><Input value={f.config.description ?? ''} onChange={(e) => cfg({ description: e.target.value })} /></Field>}
      </div>
    </Modal>
  );
}
