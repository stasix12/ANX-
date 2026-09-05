'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Btn, Card, Field, inputClass } from '@/components/market/ui';
import { useCollection } from '@/lib/market/hooks';
import { updateSession, useMarketSession } from '@/lib/market/session';
import { getStore } from '@/lib/market/store';
import type { Professional } from '@/lib/market/types';

/** The pro edits their own profile: details, services, areas, gallery. */
export default function ProProfilePage() {
  const router = useRouter();
  const session = useMarketSession();
  const { rows: pros } = useCollection('professionals');
  const { rows: services } = useCollection('services');
  const { rows: areas } = useCollection('areas');

  const original = pros.find((p) => p.id === session.activeProId);
  const [draft, setDraft] = useState<Professional | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (original && !draft) setDraft(original);
  }, [original, draft]);

  if (!draft) return null;

  const save = async () => {
    await getStore().put('professionals', draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const toggleService = (serviceId: string) =>
    setDraft((d) =>
      d && {
        ...d,
        services: d.services.some((s) => s.serviceId === serviceId)
          ? d.services.filter((s) => s.serviceId !== serviceId)
          : [...d.services, { serviceId }],
      },
    );

  const toggleArea = (areaId: string) =>
    setDraft((d) =>
      d && {
        ...d,
        areaIds: d.areaIds.includes(areaId) ? d.areaIds.filter((a) => a !== areaId) : [...d.areaIds, areaId],
      },
    );

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">הפרופיל העסקי</h1>
        <Link href={`/pro/${draft.slug}`} className="text-sm font-bold text-sky-700 hover:underline">
          תצוגה ציבורית ←
        </Link>
      </div>

      <Card className="space-y-3 p-4">
        <Field label="שם מלא">
          <input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} className={inputClass} />
        </Field>
        <Field label="שם העסק">
          <input value={draft.businessName} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} className={inputClass} />
        </Field>
        <Field label="אודות">
          <textarea value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} rows={3} className={inputClass} />
        </Field>
        <Field label={`רדיוס עבודה: ${draft.workRadiusKm} ק"מ`}>
          <input type="range" min={5} max={60} value={draft.workRadiusKm} onChange={(e) => setDraft({ ...draft, workRadiusKm: Number(e.target.value) })} className="w-full accent-emerald-600" />
        </Field>
      </Card>

      <Card className="p-4">
        <p className="mb-2 font-black">שירותים ומחירים</p>
        <div className="space-y-2">
          {services.filter((s) => s.active).map((s) => {
            const link = draft.services.find((x) => x.serviceId === s.id);
            return (
              <div key={s.id} className="flex items-center gap-2">
                <button onClick={() => toggleService(s.id)} className={`flex-1 rounded-xl border-2 p-2.5 text-start text-sm font-bold ${link ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
                  {s.icon} {s.name}
                </button>
                {link && (
                  <input
                    type="number"
                    placeholder={`${s.basePriceAgorot / 100}₪`}
                    value={link.priceAgorot ? link.priceAgorot / 100 : ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        services: draft.services.map((x) =>
                          x.serviceId === s.id ? { ...x, priceAgorot: e.target.value ? Number(e.target.value) * 100 : undefined } : x,
                        ),
                      })
                    }
                    className={`${inputClass} w-24`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 font-black">אזורי עבודה</p>
        <div className="grid grid-cols-2 gap-2">
          {areas.filter((a) => a.active).map((a) => (
            <button key={a.id} onClick={() => toggleArea(a.id)} className={`rounded-xl border-2 p-2.5 text-sm font-bold ${draft.areaIds.includes(a.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
              {a.name}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 font-black">גלריית עבודות</p>
        <div className="flex flex-wrap gap-2">
          {draft.gallery.map((g, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt="" className="h-20 w-20 rounded-xl object-cover" />
              <button
                onClick={() => setDraft({ ...draft, gallery: draft.gallery.filter((_, j) => j !== i) })}
                className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white"
                aria-label="הסרה"
              >
                ✕
              </button>
            </div>
          ))}
          <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-2xl text-slate-400 hover:border-emerald-400">
            +
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => setDraft((d) => d && { ...d, gallery: [...d.gallery, { url: String(reader.result), kind: 'plain' }] });
                reader.readAsDataURL(f);
              }}
            />
          </label>
        </div>
      </Card>

      <Btn variant="success" className="w-full py-3" onClick={() => void save()}>
        {saved ? 'נשמר ✓' : 'שמירת שינויים'}
      </Btn>

      <button
        onClick={() => {
          updateSession({ activeProId: null });
          router.replace('/pro');
        }}
        className="mx-auto block text-sm font-bold text-red-500 hover:underline"
      >
        התנתקות מחשבון בעל המקצוע
      </button>
    </div>
  );
}
