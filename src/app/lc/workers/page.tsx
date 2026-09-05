'use client';

import { useMemo, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { WorkingHoursEditor } from '@/components/lc/agent/WorkingHoursEditor';
import { EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, TrashIcon, WrenchIcon } from '@/components/lc/icons';
import { JobStatusPill } from '@/components/lc/shared/StatusPill';
import { Field, Input, Select, Toggle } from '@/components/lc/ui/forms';
import { Modal } from '@/components/lc/ui/overlay';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, cx } from '@/components/lc/ui/primitives';
import { useToast } from '@/components/lc/ui/toast';
import { useLc } from '@/lib/lc/context';
import { formatDate, formatMoney, formatTime, weekdayShort } from '@/lib/lc/format';
import { removeWorker, upsertWorker } from '@/lib/lc/ops';
import type { Worker } from '@/lib/lc/types';
import { addDays, startOfWeek, toDateKey, uid } from '@/lib/lc/util';
import { WORKER_COLORS } from '../calendar/page';

export default function WorkersPage() {
  const { s, t, locale, run } = useLc();
  const toast = useToast();
  const [editing, setEditing] = useState<Worker | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(now), i)), [now]);

  const active = s?.workers.find((w) => w.id === (selected ?? s.workers[0]?.id));

  return (
    <Shell title={t('workers.title')} wide>
      {s && (
        <>
          <PageHeader title={t('workers.title')} subtitle={`${s.workers.filter((w) => w.active).length} ${t('common.active').toLowerCase()}`} actions={<Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setEditing({ id: uid('w'), organizationId: s.organization.id, name: '', phone: '', color: 'sky', workingHours: s.settings.workingHours, serviceAreas: [], canSeePrices: false, active: true, createdAt: now.toISOString() })}>{t('workers.add')}</Button>} />
          {s.workers.length === 0 ? (
            <Card><EmptyState icon={<WrenchIcon />} title={t('workers.empty')} action={<Button onClick={() => setEditing({ id: uid('w'), organizationId: s.organization.id, name: '', phone: '', color: 'sky', workingHours: s.settings.workingHours, serviceAreas: [], canSeePrices: false, active: true, createdAt: now.toISOString() })}>{t('workers.add')}</Button>} /></Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <div className="space-y-3">
                {s.workers.map((w) => {
                  const jobs = s.jobs.filter((j) => j.workerId === w.id && j.status !== 'cancelled' && new Date(j.scheduledAt) >= week[0] && new Date(j.scheduledAt) < addDays(week[6], 1));
                  const c = WORKER_COLORS[w.color] ?? WORKER_COLORS.none;
                  return (
                    <Card key={w.id} hover className={cx('cursor-pointer p-4', active?.id === w.id && 'ring-2 ring-lc-primary')} onClick={() => setSelected(w.id)}>
                      <div className="flex items-center gap-3">
                        <Avatar name={w.name} size="lg" color={`${c.bg} ${c.text}`} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-bold text-lc-text">{w.name}{!w.active && <Badge size="sm">{t('common.inactive')}</Badge>}</p>
                          <p className="lc-tnum text-xs text-lc-muted" dir="ltr">{w.phone}</p>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(w); }} className="grid h-8 w-8 place-items-center rounded-lg text-lc-faint hover:bg-lc-bg hover:text-lc-text"><PencilIcon className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <Badge tone={w.canSeePrices ? 'neutral' : 'warning'} size="sm">{w.canSeePrices ? <EyeIcon className="h-3 w-3" /> : <EyeOffIcon className="h-3 w-3" />}{w.canSeePrices ? t('workers.canSeePrices') : t('workers.hidePrices')}</Badge>
                        <span className="text-lc-muted">{jobs.length} {t('workers.jobsThisWeek').toLowerCase()}</span>
                        {w.serviceAreas.length > 0 && <span className="truncate text-lc-faint">· {w.serviceAreas.join(', ')}</span>}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {active && (
                <Card>
                  <div className="flex items-center justify-between border-b border-lc-border px-5 py-4">
                    <h2 className="text-base font-bold text-lc-text">{t('workers.schedule')} · {active.name}</h2>
                    <span className="text-xs text-lc-muted">{formatDate(week[0], locale, 'short')} – {formatDate(week[6], locale, 'short')}</span>
                  </div>
                  <div className="grid grid-cols-7 divide-x divide-lc-border rtl:divide-x-reverse">
                    {week.map((d) => {
                      const key = toDateKey(d);
                      const wd = active.workingHours[d.getDay()];
                      const jobs = s.jobs.filter((j) => j.workerId === active.id && j.status !== 'cancelled' && toDateKey(j.scheduledAt) === key).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
                      return (
                        <div key={key} className={cx('min-h-[260px] p-2', !wd?.enabled && 'bg-slate-50')}>
                          <p className="text-center text-[11px] font-semibold uppercase text-lc-faint">{weekdayShort(d.getDay(), locale)}</p>
                          <p className="lc-tnum text-center text-sm font-bold text-lc-text">{d.getDate()}</p>
                          <p className="lc-tnum mt-1 text-center text-[10px] text-lc-faint">{wd?.enabled ? `${wd.start}–${wd.end}` : t('cal.closed')}</p>
                          <ul className="mt-2 space-y-1">
                            {jobs.map((j) => {
                              const cust = s.customers.find((c) => c.id === j.customerId);
                              return (
                                <li key={j.id} className={cx('rounded-lg p-1.5 text-[11px]', (WORKER_COLORS[active.color] ?? WORKER_COLORS.none).bg, (WORKER_COLORS[active.color] ?? WORKER_COLORS.none).text)}>
                                  <p className="lc-tnum font-bold">{formatTime(j.scheduledAt, locale)}</p>
                                  <p className="truncate font-semibold">{cust?.name}</p>
                                  <p className="truncate opacity-80">{j.city}</p>
                                  {active.canSeePrices && <p className="lc-tnum font-bold">{formatMoney(j.price, locale)}</p>}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-lc-border p-5">
                    <p className="mb-2 text-[13px] font-semibold text-lc-text">{t('jobs.workerView')}</p>
                    <p className="text-[13px] text-lc-muted">{t('workers.hidePricesHint')}</p>
                    <ul className="mt-3 divide-y divide-lc-border rounded-xl border border-lc-border">
                      {s.jobs.filter((j) => j.workerId === active.id && j.status !== 'cancelled' && j.status !== 'completed').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 4).map((j) => {
                        const cust = s.customers.find((c) => c.id === j.customerId);
                        return (
                          <li key={j.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <span className="lc-tnum w-24 font-semibold text-lc-text">{formatDate(j.scheduledAt, locale, 'short')} {formatTime(j.scheduledAt, locale)}</span>
                            <span className="min-w-0 flex-1 truncate text-lc-text">{cust?.name} · {j.address}, {j.city} · {j.serviceSummary}</span>
                            {active.canSeePrices ? <span className="lc-tnum font-bold">{formatMoney(j.price, locale)}</span> : <span className="inline-flex items-center gap-1 text-xs text-lc-faint"><EyeOffIcon className="h-3.5 w-3.5" />₪ ···</span>}
                            <JobStatusPill status={j.status} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </Card>
              )}
            </div>
          )}

          {editing && (
            <WorkerModal
              worker={editing}
              onClose={() => setEditing(null)}
              onSave={(w) => { run((snap) => upsertWorker(snap, w)); setEditing(null); toast.success(t('toast.saved')); }}
              onDelete={s.workers.some((x) => x.id === editing.id) ? () => { run((snap) => removeWorker(snap, editing.id)); setEditing(null); setSelected(null); } : undefined}
            />
          )}
        </>
      )}
    </Shell>
  );
}

function WorkerModal({ worker, onClose, onSave, onDelete }: { worker: Worker; onClose: () => void; onSave: (w: Worker) => void; onDelete?: () => void }) {
  const { t } = useLc();
  const [f, setF] = useState(worker);
  const [areas, setAreas] = useState(worker.serviceAreas.join(', '));
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={t('common.worker')} size="lg" footer={<>{onDelete && <Button variant="danger" icon={<TrashIcon className="h-4 w-4" />} onClick={onDelete} className="me-auto">{t('common.delete')}</Button>}<Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => { if (!f.name.trim()) return setErr(t('common.required')); onSave({ ...f, serviceAreas: areas.split(',').map((x) => x.trim()).filter(Boolean) }); }}>{t('common.save')}</Button></>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('common.name')} error={err}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t('common.phone')}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" /></Field>
          <Field label="Color"><Select value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })}>{Object.keys(WORKER_COLORS).filter((k) => k !== 'none').map((k) => <option key={k} value={k}>{k}</option>)}</Select></Field>
        </div>
        <Field label={t('agent.serviceAreas')} hint=", "><Input value={areas} onChange={(e) => setAreas(e.target.value)} /></Field>
        <div className="rounded-xl border border-lc-warning/40 bg-lc-warning-soft p-4">
          <Toggle checked={!f.canSeePrices} onChange={(v) => setF({ ...f, canSeePrices: !v })} label={<span className="flex items-center gap-2"><EyeOffIcon className="h-4 w-4" />{t('workers.hidePrices')}</span>} description={t('workers.hidePricesHint')} />
        </div>
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={t('common.active')} />
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-lc-text">{t('agent.workingHours')}</p>
          <WorkingHoursEditor value={f.workingHours} onChange={(v) => setF({ ...f, workingHours: v })} />
        </div>
      </div>
    </Modal>
  );
}
