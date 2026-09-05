'use client';

import { useMemo, useState } from 'react';
import { useLc } from '@/lib/lc/context';
import { formatMoney, formatTime } from '@/lib/lc/format';
import { createManualBooking } from '@/lib/lc/ops';
import { calculatePrice } from '@/lib/lc/pricing';
import { availableSlots } from '@/lib/lc/scheduling';
import { fromDateTimeKeys, pick, toDateKey } from '@/lib/lc/util';
import { Field, Input, NumberStepper, Select } from '../ui/forms';
import { Modal } from '../ui/overlay';
import { Button, cx } from '../ui/primitives';
import { useToast } from '../ui/toast';

export function BookingModal({ open, onClose, date }: { open: boolean; onClose: () => void; date: Date }) {
  const { s, t, locale, run } = useLc();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [day, setDay] = useState(toDateKey(date));
  const [time, setTime] = useState('');
  const [workerId, setWorkerId] = useState<string>('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const items = useMemo(() => Object.entries(qty).filter(([, q]) => q > 0).map(([serviceId, quantity]) => ({ serviceId, quantity })), [qty]);
  const price = useMemo(() => (s ? calculatePrice({ items, city }, s.services, s.pricingRules, locale) : null), [s, items, city, locale]);
  const slots = useMemo(() => {
    if (!s) return [];
    const [y, m, d] = day.split('-').map(Number);
    return availableSlots({ from: new Date(y, m - 1, d), days: 1, durationMin: Math.max(45, price?.durationMin || 60), settings: s.settings, bookings: s.bookings, workers: s.workers, workerId: workerId || undefined });
  }, [s, day, price?.durationMin, workerId]);

  if (!s) return null;

  function submit() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('common.required');
    if (!/^0\d{8,9}$/.test(phone.replace(/\D/g, ''))) errs.phone = t('common.invalidPhone');
    if (!city.trim()) errs.city = t('common.required');
    if (items.length === 0) errs.items = t('common.required');
    if (!time) errs.time = t('common.required');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = run((snap) => createManualBooking(snap, { name: name.trim(), phone, city: city.trim(), address: address.trim(), items, startAt: fromDateTimeKeys(day, time).toISOString(), workerId: workerId || null, language: locale }));
    if (r.error) {
      toast.error(t('toast.slotTaken'));
      return;
    }
    toast.success(t('toast.booked'), `${name} · ${formatMoney(price?.total ?? 0, locale)}`);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cal.newBooking')}
      size="lg"
      footer={
        <>
          <span className="me-auto text-sm text-lc-muted">{t('common.total')}: <b className="lc-tnum text-lc-text">{formatMoney(price?.total ?? 0, locale)}</b></span>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit}>{t('common.confirm')}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} invalid={Boolean(errors.name)} />
        </Field>
        <Field label={t('common.phone')} error={errors.phone}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" invalid={Boolean(errors.phone)} />
        </Field>
        <Field label={t('common.city')} error={errors.city}>
          <Input value={city} onChange={(e) => setCity(e.target.value)} invalid={Boolean(errors.city)} />
        </Field>
        <Field label={t('common.address')}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-semibold text-lc-text">{t('agent.services')}</p>
          {errors.items && <p className="mb-1 text-xs font-medium text-lc-danger">{errors.items}</p>}
          <ul className="divide-y divide-lc-border rounded-xl border border-lc-border">
            {s.services.filter((x) => x.active).map((svc) => (
              <li key={svc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-lc-text">{pick(svc.name, locale)} <span className="lc-tnum text-lc-muted">· ₪{svc.basePrice}</span></span>
                <NumberStepper value={qty[svc.id] ?? 0} onChange={(v) => setQty({ ...qty, [svc.id]: v })} />
              </li>
            ))}
          </ul>
        </div>
        <Field label={t('common.date')}>
          <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); setTime(''); }} dir="ltr" />
        </Field>
        <Field label={t('common.worker')}>
          <Select value={workerId} onChange={(e) => { setWorkerId(e.target.value); setTime(''); }}>
            <option value="">{t('common.unassigned')}</option>
            {s.workers.filter((w) => w.active).map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-semibold text-lc-text">{t('common.time')} <span className="font-normal text-lc-faint">· {t('cal.availableSlots')}</span></p>
          {errors.time && <p className="mb-1 text-xs font-medium text-lc-danger">{errors.time}</p>}
          {slots.length === 0 ? (
            <p className="rounded-lg bg-lc-bg p-3 text-sm text-lc-muted">{t('cal.closed')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((sl) => {
                const k = formatTime(sl.start, 'en');
                return (
                  <button key={k} type="button" aria-pressed={time === k} onClick={() => setTime(k)} className={cx('lc-tnum rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all', time === k ? 'border-lc-primary bg-lc-primary text-white' : 'border-lc-border bg-white text-lc-text hover:border-lc-primary-ring')}>
                    {k}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
