'use client';

import { useState } from 'react';
import { Btn, Card, Field, Sheet, inputClass } from '@/components/market/ui';
import { useCollection } from '@/lib/market/hooks';
import { getStore } from '@/lib/market/store';
import type { ServiceArea } from '@/lib/market/types';

/** Admin: service areas — launch cities, radii, waitlist mode + the waitlist itself. */
export default function AdminAreasPage() {
  const { rows: areas } = useCollection('areas');
  const { rows: waitlist } = useCollection('waitlist');
  const { rows: pros } = useCollection('professionals');
  const [editing, setEditing] = useState<ServiceArea | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">אזורי פעילות</h1>
        <Btn onClick={() => setAdding(true)}>+ אזור חדש</Btn>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {areas.map((a) => {
          const coverage = pros.filter((p) => p.status === 'active' && p.areaIds.includes(a.id)).length;
          return (
            <Card key={a.id} className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-black">
                  {a.name}
                  {a.waitlistOnly && <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">Waitlist</span>}
                  {!a.active && <span className="ms-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">כבוי</span>}
                </p>
                <div className="flex gap-2">
                  <Btn variant="secondary" onClick={() => setEditing(a)}>עריכה</Btn>
                  <Btn variant="danger" onClick={() => window.confirm(`למחוק את ${a.name}?`) && void getStore().remove('areas', a.id)}>מחיקה</Btn>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                רדיוס {a.radiusKm} ק"מ · {coverage} בעלי מקצוע פעילים · {waitlist.filter((w) => w.areaName === a.name).length} ברשימת המתנה
              </p>
            </Card>
          );
        })}
      </div>

      {waitlist.length > 0 && (
        <Card className="p-4">
          <p className="font-black">רשימת המתנה ({waitlist.length})</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {waitlist.map((w) => (
              <li key={w.id}>📱 {w.phone} — {w.areaName} · {new Date(w.createdAt).toLocaleDateString('he-IL')}</li>
            ))}
          </ul>
        </Card>
      )}

      {(editing || adding) && (
        <AreaSheet
          area={editing}
          onClose={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AreaSheet({ area, onClose }: { area: ServiceArea | null; onClose: () => void }) {
  const [name, setName] = useState(area?.name ?? '');
  const [radius, setRadius] = useState(area?.radiusKm ?? 10);
  const [lat, setLat] = useState(area?.center.lat ?? 31.25);
  const [lng, setLng] = useState(area?.center.lng ?? 34.79);
  const [active, setActive] = useState(area?.active ?? true);
  const [waitlistOnly, setWaitlistOnly] = useState(area?.waitlistOnly ?? false);

  const save = async () => {
    if (!name.trim()) return;
    const id = area?.id ?? name.trim().toLowerCase().replace(/\s+/g, '-');
    await getStore().put('areas', { id, name: name.trim(), center: { lat, lng }, radiusKm: radius, active, waitlistOnly });
    onClose();
  };

  return (
    <Sheet title={area ? `עריכת ${area.name}` : 'אזור חדש'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="שם"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Lat"><input type="number" step="0.001" value={lat} onChange={(e) => setLat(Number(e.target.value))} className={inputClass} /></Field>
          <Field label="Lng"><input type="number" step="0.001" value={lng} onChange={(e) => setLng(Number(e.target.value))} className={inputClass} /></Field>
          <Field label='רדיוס ק"מ'><input type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} className={inputClass} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-sky-600" /> אזור פעיל
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={waitlistOnly} onChange={(e) => setWaitlistOnly(e.target.checked)} className="h-4 w-4 accent-amber-500" /> Waitlist בלבד (עדיין אין כיסוי)
        </label>
        <Btn className="w-full" onClick={() => void save()}>שמירה</Btn>
      </div>
    </Sheet>
  );
}
