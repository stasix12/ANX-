'use client';

import { useEffect, useState } from 'react';
import { Btn, Card, Field, inputClass } from '@/components/market/ui';
import { useSettings } from '@/lib/market/hooks';
import { getStore } from '@/lib/market/store';
import type { PlatformSettings } from '@/lib/market/types';

/**
 * Admin: the business model without code changes — commission vs lead-fee vs
 * subscriptions, payment methods, dispatch tuning, dynamic pricing, and the
 * demo simulation switch.
 */
export default function AdminSettingsPage() {
  const settings = useSettings();
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings && !draft) setDraft(structuredClone(settings));
  }, [settings, draft]);

  if (!draft) return null;

  const save = async () => {
    await getStore().putSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-black">הגדרות פלטפורמה</h1>

      <Card className="space-y-3 p-4">
        <p className="font-black">מודל עסקי</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['commission', 'עמלה מכל עבודה'],
              ['lead_fee', 'תשלום פר ליד'],
              ['subscription', 'מנוי חודשי'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setDraft({ ...draft, businessModel: id })} className={`rounded-xl border-2 p-3 text-sm font-bold ${draft.businessModel === id ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="עמלה % (ברירת מחדל)">
            <input type="number" value={draft.commissionPct} onChange={(e) => setDraft({ ...draft, commissionPct: Number(e.target.value) })} className={inputClass} />
          </Field>
          <Field label='דמי ליד (ש"ח)'>
            <input type="number" value={draft.leadFeeAgorot / 100} onChange={(e) => setDraft({ ...draft, leadFeeAgorot: Number(e.target.value) * 100 })} className={inputClass} />
          </Field>
        </div>
        <div>
          <p className="mb-1 text-sm font-bold text-slate-600">מסלולי מנוי (לעתיד)</p>
          <div className="grid grid-cols-3 gap-2">
            {draft.subscriptionTiers.map((tier, i) => (
              <div key={tier.id} className="rounded-xl border border-slate-200 p-2 text-center">
                <p className="text-xs font-black">{tier.name}</p>
                <input
                  type="number"
                  value={tier.priceAgorot / 100}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      subscriptionTiers: draft.subscriptionTiers.map((t, j) => (j === i ? { ...t, priceAgorot: Number(e.target.value) * 100 } : t)),
                    })
                  }
                  className={`${inputClass} mt-1 text-center`}
                />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <p className="font-black">אמצעי תשלום פעילים</p>
        {draft.paymentMethods.map((m, i) => (
          <label key={m.id} className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <input
              type="checkbox"
              checked={m.enabled}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  paymentMethods: draft.paymentMethods.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)),
                })
              }
              className="h-4 w-4 accent-sky-600"
            />
            {m.label}
          </label>
        ))}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="font-black">Dispatch</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="זמן לקבלת עבודה (שניות)">
            <input type="number" value={draft.dispatchTtlSeconds} onChange={(e) => setDraft({ ...draft, dispatchTtlSeconds: Number(e.target.value) })} className={inputClass} />
          </Field>
          <Field label="מקס' בעלי מקצוע לניסיון">
            <input type="number" value={draft.dispatchMaxOffers} onChange={(e) => setDraft({ ...draft, dispatchMaxOffers: Number(e.target.value) })} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="font-black">תמחור דינמי (מוכן, כבוי כברירת מחדל)</p>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={draft.dynamicPricing.enabled} onChange={(e) => setDraft({ ...draft, dynamicPricing: { ...draft.dynamicPricing, enabled: e.target.checked } })} className="h-4 w-4 accent-sky-600" />
          הפעלת תמחור דינמי
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['rushMultiplier', 'עבודה דחופה'],
              ['weekendMultiplier', 'סוף שבוע'],
              ['lowSupplyMultiplier', 'מעט זמינים'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={`${label} ×`}>
              <input type="number" step="0.05" value={draft.dynamicPricing[key]} onChange={(e) => setDraft({ ...draft, dynamicPricing: { ...draft.dynamicPricing, [key]: Number(e.target.value) } })} className={inputClass} />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={draft.simulationEnabled} onChange={(e) => setDraft({ ...draft, simulationEnabled: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
          סימולציית דמו — מקצועני הדמו מקבלים עבודות ומתקדמים לבד
        </label>
        <p className="mt-1 text-xs text-slate-400">כבו כדי לבדוק ידנית את מסלול הדחייה/פקיעה, או כששני הצדדים משוחקים על ידי בני אדם.</p>
      </Card>

      <Btn variant="success" className="w-full py-3" onClick={() => void save()}>
        {saved ? 'נשמר ✓' : 'שמירת הגדרות'}
      </Btn>
    </div>
  );
}
