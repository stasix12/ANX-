'use client';

import { useState } from 'react';
import { Btn, Card, Field, Sheet, inputClass } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';
import { getStore } from '@/lib/market/store';

/** Admin: full coupon management. */
export default function AdminCouponsPage() {
  const { rows: coupons } = useCollection('coupons');
  const { rows: services } = useCollection('services');
  const { rows: areas } = useCollection('areas');
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">קופונים</h1>
        <Btn onClick={() => setAdding(true)}>+ קופון חדש</Btn>
      </div>

      <div className="space-y-2">
        {coupons.map((c) => (
          <Card key={c.code} className="flex flex-wrap items-center gap-3 p-4">
            <code className="rounded-lg bg-slate-900 px-3 py-1 font-black tracking-widest text-white">{c.code}</code>
            <span className="font-black text-emerald-600">
              {c.percentOff ? `${c.percentOff}% הנחה` : shekel(c.amountOffAgorot ?? 0)}
            </span>
            <span className="text-xs text-slate-500">
              {c.serviceId ? services.find((s) => s.id === c.serviceId)?.name : 'כל השירותים'} ·{' '}
              {c.areaId ? areas.find((a) => a.id === c.areaId)?.name : 'כל הארץ'}
              {c.newCustomersOnly && ' · לקוחות חדשים'}
              {c.expiresAt && ` · עד ${new Date(c.expiresAt).toLocaleDateString('he-IL')}`}
              {' · '}נוצל {c.redemptions}{c.maxRedemptions ? `/${c.maxRedemptions}` : ''}
            </span>
            <div className="ms-auto flex gap-2">
              <Btn variant="secondary" onClick={() => void getStore().put('coupons', { ...c, active: !c.active })}>
                {c.active ? 'השבתה' : 'הפעלה'}
              </Btn>
              <Btn variant="danger" onClick={() => void getStore().remove('coupons', c.code)}>מחיקה</Btn>
            </div>
          </Card>
        ))}
      </div>

      {adding && <CouponSheet onClose={() => setAdding(false)} services={services.map((s) => ({ id: s.id, name: s.name }))} areas={areas.map((a) => ({ id: a.id, name: a.name }))} />}
    </div>
  );
}

function CouponSheet({ onClose, services, areas }: { onClose: () => void; services: { id: string; name: string }[]; areas: { id: string; name: string }[] }) {
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('10');
  const [serviceId, setServiceId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [newOnly, setNewOnly] = useState(false);
  const [expires, setExpires] = useState('');
  const [max, setMax] = useState('');

  const save = async () => {
    if (!code.trim() || !value) return;
    await getStore().put('coupons', {
      code: code.trim().toUpperCase(),
      percentOff: kind === 'percent' ? Number(value) : null,
      amountOffAgorot: kind === 'amount' ? Number(value) * 100 : null,
      serviceId: serviceId || null,
      areaId: areaId || null,
      newCustomersOnly: newOnly,
      expiresAt: expires ? new Date(expires).toISOString() : null,
      maxRedemptions: max ? Number(max) : null,
      redemptions: 0,
      active: true,
    });
    onClose();
  };

  return (
    <Sheet title="קופון חדש" onClose={onClose}>
      <div className="space-y-3">
        <Field label="קוד"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={inputClass} placeholder="SUMMER25" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="סוג הנחה">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'amount')} className={inputClass}>
              <option value="percent">אחוז %</option>
              <option value="amount">סכום ₪</option>
            </select>
          </Field>
          <Field label={kind === 'percent' ? 'אחוז' : 'סכום בש"ח'}>
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="שירות (אופציונלי)">
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={inputClass}>
              <option value="">כל השירותים</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="עיר (אופציונלי)">
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={inputClass}>
              <option value="">כל הארץ</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="תוקף עד (אופציונלי)"><input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={inputClass} /></Field>
          <Field label="מקס' מימושים"><input type="number" value={max} onChange={(e) => setMax(e.target.value)} className={inputClass} placeholder="ללא הגבלה" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} className="h-4 w-4 accent-sky-600" /> לקוחות חדשים בלבד
        </label>
        <Btn className="w-full" onClick={() => void save()}>יצירת קופון</Btn>
      </div>
    </Sheet>
  );
}
